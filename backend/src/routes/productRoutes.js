const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { auth, authorize } = require('../middleware/auth');
const Product = require('../models/Product');
const Category = require('../models/Category');
const StockMovement = require('../models/StockMovement');
const LowStockAlert = require('../models/LowStockAlert');

const router = express.Router();
const uploadDirectory = path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, uploadDirectory),
    filename: (_req, file, done) => done(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return done(new Error('Product image must be JPG, PNG, or WEBP.'));
    return done(null, true);
  },
});
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/barcode/:code', auth, asyncRoute(async (req, res) => {
  const code = String(req.params.code).trim();
  const product = await Product.findOne({
    businessId: req.user.businessId,
    isActive: true,
    $or: [{ barcode: code }, { sku: code.toUpperCase() }],
  }).lean();
  if (!product) return res.status(404).json({ message: 'No product matches this barcode or SKU.' });
  return res.json({ product: { ...product, id: product._id.toString() } });
}));

router.get('/', auth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const filter = { businessId: req.user.businessId, isActive: true };
  const search = String(req.query.search || '').trim();
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: re }, { sku: re }, { barcode: re }];
  }
  if (req.query.category && req.query.category !== 'all') filter.category = String(req.query.category);
  if (req.query.status === 'low') filter.$expr = { $lte: ['$currentStock', '$minimumStockLevel'] };
  if (req.query.status === 'out') filter.currentStock = 0;
  const sortOptions = {
    'price-low': { sellingPrice: 1 }, 'price-high': { sellingPrice: -1 },
    'stock-low': { currentStock: 1 }, 'stock-high': { currentStock: -1 },
    'date-oldest': { createdAt: 1 }, 'date-newest': { createdAt: -1 },
  };
  const [products, total] = await Promise.all([
    Product.find(filter).sort(sortOptions[req.query.sort] || { createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  return res.json({
    products: products.map((product) => ({ ...product, id: product._id.toString() })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  });
}));

router.get('/:id', auth, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Product not found.' });
  const product = await Product.findOne({ _id: req.params.id, businessId: req.user.businessId, isActive: true });
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  return res.json({ product });
}));

function validateInput(body, existing = {}) {
  const values = {
    name: String(body.name ?? existing.name ?? '').trim(),
    sku: String(body.sku ?? existing.sku ?? '').trim().toUpperCase(),
    barcode: String(body.barcode ?? existing.barcode ?? '').trim() || null,
    category: String(body.category ?? existing.category ?? '').trim(),
    description: String(body.description ?? existing.description ?? '').trim(),
    purchasePrice: Number(body.purchasePrice ?? existing.purchasePrice),
    sellingPrice: Number(body.sellingPrice ?? existing.sellingPrice),
    minimumStockLevel: Number(body.minimumStockLevel ?? existing.minimumStockLevel),
    maximumStockLevel: body.maximumStockLevel === '' || body.maximumStockLevel === undefined
      ? (existing.maximumStockLevel ?? null) : Number(body.maximumStockLevel),
    unit: String(body.unit ?? existing.unit ?? 'unit').trim(),
    supplierName: String(body.supplierName ?? existing.supplierName ?? '').trim(),
    location: String(body.location ?? existing.location ?? '').trim(),
  };
  if (!values.name || !values.sku || !values.category) throw Object.assign(new Error('Name, SKU, and category are required.'), { status: 400 });
  if (![values.purchasePrice, values.sellingPrice, values.minimumStockLevel].every(Number.isFinite)
    || values.purchasePrice < 0 || values.sellingPrice < 0 || values.minimumStockLevel < 0
    || (values.maximumStockLevel !== null && (!Number.isFinite(values.maximumStockLevel) || values.maximumStockLevel < values.minimumStockLevel))) {
    throw Object.assign(new Error('Enter valid non-negative prices and stock thresholds; maximum must be at least minimum.'), { status: 400 });
  }
  return values;
}

router.post('/', auth, authorize('admin'), upload.single('image'), asyncRoute(async (req, res) => {
  try {
    const data = validateInput(req.body);
    const openingStock = Number(req.body.currentStock || 0);
    if (!Number.isSafeInteger(openingStock) || openingStock < 0) return res.status(400).json({ message: 'Opening stock must be a non-negative whole number.' });
    const categoryDoc = await Category.findOne({ businessId: req.user.businessId, name: data.category });
    const session = await mongoose.startSession();
    let product;
    try {
      await session.withTransaction(async () => {
        const activeCount = await Product.countDocuments({ businessId: req.user.businessId, isActive: true }).session(session);
        if (activeCount >= 100000) throw Object.assign(new Error('This business has reached the 100,000 active product limit.'), { status: 409 });
        [product] = await Product.create([{
          ...data,
          productId: String(req.body.productId || `PRD-${randomUUID().slice(0, 8).toUpperCase()}`),
          categoryId: categoryDoc?._id || null,
          currentStock: openingStock,
          imageUrl: req.file ? `/uploads/${req.file.filename}` : '',
          businessId: req.user.businessId,
        }], { session });
        if (openingStock > 0) {
          await StockMovement.create([{
            transactionId: randomUUID(), businessId: req.user.businessId, productId: product._id,
            productName: product.name, type: 'IN', operationType: 'receipt', quantity: openingStock,
            staffId: req.user.id, staffName: req.user.name, reference: 'opening-stock',
            idempotencyKey: `opening-${product._id}`,
          }], { session });
        }
        if (openingStock <= product.minimumStockLevel) {
          await LowStockAlert.create([{
            businessId: req.user.businessId, productId: product._id, productName: product.name,
            currentStock: openingStock, reorderLevel: product.minimumStockLevel,
          }], { session });
        }
      });
    } finally {
      await session.endSession();
    }
    return res.status(201).json({ message: 'Product created.', product });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    if (error.code === 11000) return res.status(409).json({ message: 'SKU, barcode, or product ID already exists in this business.' });
    throw error;
  }
}));

router.put('/:id', auth, authorize('admin'), upload.single('image'), asyncRoute(async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Product not found.' });
    const product = await Product.findOne({ _id: req.params.id, businessId: req.user.businessId, isActive: true });
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    const data = validateInput(req.body, product);
    const categoryDoc = await Category.findOne({ businessId: req.user.businessId, name: data.category });
    product.set({
      ...data,
      categoryId: categoryDoc?._id || null,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : product.imageUrl,
    });
    await product.save();
    return res.json({ message: 'Product updated. Use stock movements to change quantity.', product });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    if (error.code === 11000) return res.status(409).json({ message: 'SKU or barcode already exists in this business.' });
    throw error;
  }
}));

router.delete('/:id', auth, authorize('admin'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Product not found.' });
  const product = await Product.findOne({ _id: req.params.id, businessId: req.user.businessId, isActive: true });
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  if (product.currentStock !== 0) return res.status(409).json({ message: 'Product must have zero stock before archiving. Record a stock adjustment first.' });
  product.isActive = false;
  await product.save();
  return res.json({ message: 'Product archived; transaction history is retained.' });
}));

module.exports = router;

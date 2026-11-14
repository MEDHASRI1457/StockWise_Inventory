const express = require('express');
const mongoose = require('mongoose');
const { auth, authorize } = require('../middleware/auth');
const Sale = require('../models/Sale');
const { createSale } = require('../services/stockService');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const AuditLog = require('../models/AuditLog');
const { randomUUID } = require('crypto');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/', auth, authorize('admin', 'staff'), asyncRoute(async (req, res) => {
  const result = await createSale({ user: req.user, items: req.body?.items, idempotencyKey: req.body?.idempotencyKey });
  return res.status(result.ignored ? 200 : 201).json({ message: result.ignored ? 'Sale already processed.' : 'Sale recorded.', ...result });
}));

router.get('/', auth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const filter = { businessId: req.user.businessId, type: 'sale' };
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    if (Object.values(filter.createdAt).some((date) => Number.isNaN(date.getTime()))) return res.status(400).json({ message: 'Invalid date filter.' });
  }
  const [sales, total] = await Promise.all([
    Sale.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Sale.countDocuments(filter),
  ]);
  const returned = sales.length ? await Sale.aggregate([
    { $match: { businessId: new mongoose.Types.ObjectId(req.user.businessId), type: 'return', sourceSaleId: { $in: sales.map((item) => item._id) } } },
    { $unwind: '$items' },
    { $group: { _id: { saleId: '$sourceSaleId', productId: '$items.productId' }, quantity: { $sum: '$items.quantity' } } },
  ]) : [];
  const returnedByKey = new Map(returned.map((item) => [`${item._id.saleId}:${item._id.productId}`, item.quantity]));
  return res.json({
    sales: sales.map((sale) => {
      const items = sale.items.map((item) => ({
        ...item,
        returnedQuantity: returnedByKey.get(`${sale._id}:${item.productId}`) || 0,
      }));
      return {
        ...sale,
        items,
        returnable: items.some((item) => item.returnedQuantity < item.quantity),
        id: sale._id.toString(),
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  });
}));

router.get('/summary', auth, asyncRoute(async (req, res) => {
  const period = req.query.period || 'monthly';
  if (!['daily', 'weekly', 'monthly'].includes(period)) return res.status(400).json({ message: 'Period must be daily, weekly, or monthly.' });
  const now = new Date();
  let from = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'daily') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'weekly') from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const data = await Sale.aggregate([
    { $match: { businessId: new mongoose.Types.ObjectId(req.user.businessId), createdAt: { $gte: from }, type: 'sale' } },
    { $group: { _id: null, totalSales: { $sum: '$totalAmount' }, totalUnits: { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', '$$this.quantity'] } } } }, transactions: { $sum: 1 } } },
  ]);
  const bestsellers = await Sale.aggregate([
    { $match: { businessId: new mongoose.Types.ObjectId(req.user.businessId), createdAt: { $gte: from }, type: 'sale' } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', productName: { $first: '$items.productName' }, units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.totalAmount' } } },
    { $sort: { units: -1 } }, { $limit: 10 },
  ]);
  return res.json({ period, ...(data[0] || { totalSales: 0, totalUnits: 0, transactions: 0 }), bestsellers });
}));

router.get('/trends', auth, asyncRoute(async (req, res) => {
  const businessId = new mongoose.Types.ObjectId(req.user.businessId);
  const start = new Date();
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  const trends = await Sale.aggregate([
    { $match: { businessId, createdAt: { $gte: start }, type: 'sale' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, sales: { $sum: '$totalAmount' }, units: { $sum: { $reduce: { input: '$items', initialValue: 0, in: { $add: ['$$value', '$$this.quantity'] } } } } } },
    { $sort: { _id: 1 } },
  ]);
  return res.json({ trends });
}));

router.post('/:id/return', auth, authorize('admin', 'staff'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Sale not found.' });
  const source = await Sale.findOne({ _id: req.params.id, businessId: req.user.businessId, type: 'sale' }).lean();
  if (!source) return res.status(404).json({ message: 'Sale not found.' });
  const idempotencyKey = String(req.body?.idempotencyKey || '');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 150) return res.status(400).json({ message: 'A unique return idempotencyKey is required.' });
  const existing = await Sale.findOne({ businessId: req.user.businessId, idempotencyKey }).lean();
  if (existing) return res.status(200).json({ message: 'Return already recorded.', ignored: true, sale: existing });

  const originalById = new Map(source.items.map((item) => [item.productId.toString(), item]));
  if (req.body?.items !== undefined && (!Array.isArray(req.body.items) || req.body.items.length === 0)) {
    return res.status(400).json({ message: 'Return items must be a non-empty array.' });
  }
  let returnItems = [];
  const session = await mongoose.startSession();
  let returnSale;
  try {
    await session.withTransaction(async () => {
      const sourceClaim = await Sale.findOneAndUpdate(
        { _id: source._id, businessId: req.user.businessId, type: 'sale' },
        { $inc: { returnVersion: 1 } },
        { new: true, session },
      );
      if (!sourceClaim) throw Object.assign(new Error('Sale not found.'), { status: 404 });

      const returned = await Sale.aggregate([
        { $match: { businessId: new mongoose.Types.ObjectId(req.user.businessId), sourceSaleId: source._id, type: 'return' } },
        { $unwind: '$items' },
        { $group: { _id: '$items.productId', quantity: { $sum: '$items.quantity' } } },
      ]).session(session);
      const returnedById = new Map(returned.map((entry) => [entry._id.toString(), entry.quantity]));
      const requested = req.body?.items || source.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity - (returnedById.get(item.productId.toString()) || 0),
      })).filter((item) => item.quantity > 0);
      if (!requested.length) throw Object.assign(new Error('All quantities from this sale have already been returned.'), { status: 409 });

      const seen = new Set();
      returnItems = [];
      for (const entry of requested) {
        const key = String(entry.productId);
        const original = originalById.get(key);
        const qty = Number(entry.quantity);
        const remaining = original ? original.quantity - (returnedById.get(key) || 0) : 0;
        if (!original || seen.has(key) || !Number.isSafeInteger(qty) || qty < 1 || qty > remaining) {
          throw Object.assign(new Error('Return quantities must be positive whole numbers, unique per product, and no greater than the unreturned sale quantity.'), { status: 400 });
        }
        seen.add(key);
        returnItems.push({ ...original, quantity: qty, totalAmount: qty * original.unitSellingPrice });
      }

      const transactionId = randomUUID();
      for (const item of returnItems) {
        const product = await Product.findOneAndUpdate(
          { _id: item.productId, businessId: req.user.businessId },
          { $inc: { currentStock: item.quantity } },
          { new: true, session, runValidators: true },
        );
        if (!product) throw Object.assign(new Error(`Product ${item.productName} is unavailable for return.`), { status: 409 });
        await StockMovement.create([{
          transactionId: randomUUID(), businessId: req.user.businessId,
          productId: product._id, productName: product.name,
          type: 'IN', operationType: 'adjustment', quantity: item.quantity,
          staffId: req.user.id, staffName: req.user.name,
          reference: `return:${source.transactionId}`, notes: `Compensating return transaction ${transactionId}`,
          idempotencyKey: `${idempotencyKey}:${product._id}`,
        }], { session });
      }
      [returnSale] = await Sale.create([{
        transactionId, businessId: req.user.businessId, items: returnItems,
        totalAmount: returnItems.reduce((sum, item) => sum + item.totalAmount, 0),
        type: 'return', sourceSaleId: source._id,
        staffId: req.user.id, staffName: req.user.name, idempotencyKey,
      }], { session });
      await AuditLog.create([{
        businessId: req.user.businessId, userId: req.user.id, action: 'sale.returned',
        entityType: 'Sale', entityId: source._id.toString(),
        details: { returnTransactionId: transactionId, returnItems },
      }], { session });
    });
  } catch (error) {
    if (error.code === 11000) {
      const existingReturn = await Sale.findOne({ businessId: req.user.businessId, idempotencyKey }).lean();
      if (existingReturn) return res.status(200).json({ message: 'Return already recorded.', ignored: true, sale: existingReturn });
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return res.status(201).json({ message: 'Return recorded as compensating stock movement.', sale: returnSale });
}));

module.exports = router;

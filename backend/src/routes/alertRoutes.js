const express = require('express');
const mongoose = require('mongoose');
const { auth, authorize } = require('../middleware/auth');
const LowStockAlert = require('../models/LowStockAlert');
const Product = require('../models/Product');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', auth, asyncRoute(async (req, res) => {
  const products = await Product.find({
    businessId: req.user.businessId, isActive: true,
    $expr: { $lte: ['$currentStock', '$minimumStockLevel'] },
  }).select('_id name currentStock minimumStockLevel').limit(200).lean();
  const productIds = products.map((product) => product._id);
  if (products.length) {
    await LowStockAlert.bulkWrite(products.map((product) => ({
      updateOne: {
        filter: { businessId: req.user.businessId, productId: product._id, resolvedAt: null },
        update: {
          $set: { productName: product.name, currentStock: product.currentStock, reorderLevel: product.minimumStockLevel },
          $setOnInsert: { businessId: req.user.businessId, productId: product._id },
        },
        upsert: true,
      },
    })));
  }
  await LowStockAlert.updateMany(
    { businessId: req.user.businessId, resolvedAt: null, productId: { $nin: productIds } },
    { $set: { resolvedAt: new Date(), resolvedBy: req.user.id } },
  );
  const alerts = await LowStockAlert.find({ businessId: req.user.businessId, resolvedAt: null }).sort({ currentStock: 1 }).lean();
  return res.json({ alerts: alerts.map((item) => ({ ...item, id: item._id.toString(), name: item.productName, minimumStockLevel: item.reorderLevel })) });
}));

router.put('/:id/resolve', auth, authorize('admin'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid alert ID.' });
  const alert = await LowStockAlert.findOne({ _id: req.params.id, businessId: req.user.businessId, resolvedAt: null });
  if (!alert) return res.status(404).json({ message: 'Open alert not found.' });
  const product = await Product.findOne({ _id: alert.productId, businessId: req.user.businessId, isActive: true });
  if (product && product.currentStock <= product.minimumStockLevel) {
    return res.status(409).json({ message: 'Replenish stock above the reorder threshold before resolving this alert.' });
  }
  alert.resolvedAt = new Date();
  alert.resolvedBy = req.user.id;
  await alert.save();
  return res.json({ message: 'Alert resolved.', alert });
}));

module.exports = router;

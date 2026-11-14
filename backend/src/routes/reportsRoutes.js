const express = require('express');
const mongoose = require('mongoose');
const { auth, authorize } = require('../middleware/auth');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/sales', auth, authorize('admin'), asyncRoute(async (req, res) => {
  const businessId = new mongoose.Types.ObjectId(req.user.businessId);
  const start = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = req.query.to ? new Date(req.query.to) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return res.status(400).json({ message: 'Invalid report dates.' });
  const result = await Sale.aggregate([
    { $match: { businessId, type: 'sale', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, sales: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
  ]);
  return res.json({ from: start, to: end, totalSales: result[0]?.sales || 0, transactionCount: result[0]?.count || 0 });
}));

router.get('/inventory', auth, authorize('admin'), asyncRoute(async (req, res) => {
  const businessId = new mongoose.Types.ObjectId(req.user.businessId);
  const [inventory, movementCount] = await Promise.all([
    Product.aggregate([
      { $match: { businessId, isActive: true } },
      { $group: { _id: null, products: { $sum: 1 }, units: { $sum: '$currentStock' }, costValue: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } }, retailValue: { $sum: { $multiply: ['$currentStock', '$sellingPrice'] } } } },
    ]),
    StockMovement.countDocuments({ businessId }),
  ]);
  return res.json({ ...(inventory[0] || { products: 0, units: 0, costValue: 0, retailValue: 0 }), movementCount });
}));

module.exports = router;

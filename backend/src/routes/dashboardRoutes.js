const express = require('express');
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const StockMovement = require('../models/StockMovement');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/summary', auth, asyncRoute(async (req, res) => {
  const businessId = new mongoose.Types.ObjectId(req.user.businessId);
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startMonth = new Date(startToday.getFullYear(), startToday.getMonth(), 1);
  const [inventory, lowStock, outOfStock, todaySales, monthSales, recent] = await Promise.all([
    Product.aggregate([
      { $match: { businessId, isActive: true } },
      { $group: { _id: null, products: { $sum: 1 }, units: { $sum: '$currentStock' }, value: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } } } },
    ]),
    Product.countDocuments({ businessId, isActive: true, $expr: { $lte: ['$currentStock', '$minimumStockLevel'] } }),
    Product.countDocuments({ businessId, isActive: true, currentStock: 0 }),
    Sale.aggregate([
      { $match: { businessId, createdAt: { $gte: startToday }, type: 'sale' } },
      { $group: { _id: null, amount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { businessId, createdAt: { $gte: startMonth }, type: 'sale' } },
      { $group: { _id: null, amount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    StockMovement.find({ businessId }).sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  return res.json({
    totalProducts: inventory[0]?.products || 0,
    totalStockUnits: inventory[0]?.units || 0,
    totalInventoryValue: inventory[0]?.value || 0,
    lowStockCount: lowStock,
    outOfStockCount: outOfStock,
    salesToday: todaySales[0]?.amount || 0,
    transactionsToday: todaySales[0]?.count || 0,
    salesThisMonth: monthSales[0]?.amount || 0,
    transactionsThisMonth: monthSales[0]?.count || 0,
    recentMovements: recent,
  });
}));

router.get('/trends', auth, asyncRoute(async (req, res) => {
  const businessId = new mongoose.Types.ObjectId(req.user.businessId);
  const start = new Date(); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
  const grouped = await Sale.aggregate([
    { $match: { businessId, createdAt: { $gte: start }, type: 'sale' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, sales: { $sum: '$totalAmount' } } },
  ]);
  const byDate = new Map(grouped.map((item) => [item._id, item.sales]));
  const data = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { day: date.toLocaleDateString('en-US', { weekday: 'short' }), sales: byDate.get(key) || 0 };
  });
  const topProducts = await Sale.aggregate([
    { $match: { businessId, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) }, type: 'sale' } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', name: { $first: '$items.productName' }, unitsSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.totalAmount' } } },
    { $sort: { unitsSold: -1 } }, { $limit: 5 },
  ]);
  return res.json({ data, topProducts });
}));

module.exports = router;

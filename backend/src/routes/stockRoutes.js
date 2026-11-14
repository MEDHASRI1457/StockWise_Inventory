const express = require('express');
const mongoose = require('mongoose');
const { auth, authorize } = require('../middleware/auth');
const StockMovement = require('../models/StockMovement');
const { applyStockOperation } = require('../services/stockService');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function submit(req, res, type) {
  const operationType = req.body?.operationType || (type === 'IN' ? 'receipt' : 'adjustment');
  const result = await applyStockOperation({ user: req.user, operation: { ...req.body, type, operationType } });
  if (result.ignored) return res.status(200).json({ message: 'Operation already processed.', ignored: true, movement: result.movement });
  return res.status(201).json({ message: 'Stock movement recorded.', ...result });
}

router.post('/in', auth, authorize('admin', 'staff'), asyncRoute((req, res) => submit(req, res, 'IN')));
router.post('/out', auth, authorize('admin', 'staff'), asyncRoute((req, res) => submit(req, res, 'OUT')));
router.post('/movement', auth, authorize('admin', 'staff'), asyncRoute((req, res) => {
  if (!['IN', 'OUT'].includes(req.body?.type)) return res.status(400).json({ message: 'Movement type must be IN or OUT.' });
  return submit(req, res, req.body.type);
}));

router.get('/history', auth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const filter = { businessId: req.user.businessId };
  if (req.query.productId) {
    if (!mongoose.isValidObjectId(req.query.productId)) return res.status(400).json({ message: 'Invalid product ID.' });
    filter.productId = req.query.productId;
  }
  if (req.query.type && ['IN', 'OUT'].includes(req.query.type)) filter.type = req.query.type;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    if (Object.values(filter.createdAt).some((date) => Number.isNaN(date.getTime()))) return res.status(400).json({ message: 'Invalid date filter.' });
  }
  const [movements, total] = await Promise.all([
    StockMovement.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    StockMovement.countDocuments(filter),
  ]);
  return res.json({ movements: movements.map((item) => ({ ...item, id: item._id.toString() })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
}));

module.exports = router;

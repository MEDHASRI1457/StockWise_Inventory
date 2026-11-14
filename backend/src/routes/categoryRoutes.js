const express = require('express');
const mongoose = require('mongoose');
const { auth, authorize } = require('../middleware/auth');
const Category = require('../models/Category');
const Product = require('../models/Product');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', auth, asyncRoute(async (req, res) => {
  const categories = await Category.find({ businessId: req.user.businessId }).sort({ name: 1 }).lean();
  return res.json({ categories: categories.map((item) => ({ ...item, id: item._id.toString() })) });
}));

router.post('/', auth, authorize('admin'), asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Category name is required.' });
  const category = await Category.create({ name, description: String(req.body.description || '').trim(), businessId: req.user.businessId });
  return res.status(201).json({ category });
}));

router.put('/:id', auth, authorize('admin'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Category not found.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Category name is required.' });
  const category = await Category.findOneAndUpdate(
    { _id: req.params.id, businessId: req.user.businessId },
    { $set: { name, description: String(req.body.description || '').trim() } },
    { new: true, runValidators: true },
  );
  if (!category) return res.status(404).json({ message: 'Category not found.' });
  await Product.updateMany({ businessId: req.user.businessId, categoryId: category._id }, { $set: { category: category.name } });
  return res.json({ category });
}));

router.delete('/:id', auth, authorize('admin'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Category not found.' });
  const category = await Category.findOne({ _id: req.params.id, businessId: req.user.businessId });
  if (!category) return res.status(404).json({ message: 'Category not found.' });
  const used = await Product.exists({ businessId: req.user.businessId, categoryId: category._id, isActive: true });
  if (used) return res.status(409).json({ message: 'Reassign products before deleting this category.' });
  await category.deleteOne();
  return res.json({ message: 'Category deleted.' });
}));

module.exports = router;

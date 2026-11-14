const express = require('express');
const bcrypt = require('bcryptjs');
const { auth, authorize } = require('../middleware/auth');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
router.use(auth, authorize('admin'));

router.get('/', asyncRoute(async (req, res) => {
  const users = await User.find({ businessId: req.user.businessId }).select('name email role isActive createdAt').sort({ createdAt: 1 }).lean();
  return res.json({ users: users.map((item) => ({ ...item, id: item._id.toString() })) });
}));

router.post('/', asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 10) return res.status(400).json({ message: 'Name, email, and a password of at least 10 characters are required.' });
  const user = await User.create({
    name: String(name).trim(), email: String(email).trim().toLowerCase(),
    password: await bcrypt.hash(password, 12), role: 'staff', businessId: req.user.businessId,
  });
  await AuditLog.create({ businessId: req.user.businessId, userId: req.user.id, action: 'staff.created', entityType: 'User', entityId: user._id.toString() });
  return res.status(201).json({ user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } });
}));

router.put('/:id', asyncRoute(async (req, res) => {
  if (req.body?.role === 'admin') return res.status(400).json({ message: 'Admin role cannot be granted via staff management.' });
  const update = {};
  if (req.body?.name) update.name = String(req.body.name).trim();
  if (req.body?.isActive !== undefined) update.isActive = Boolean(req.body.isActive);
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, businessId: req.user.businessId, role: 'staff' },
    { $set: update }, { new: true, runValidators: true },
  ).select('name email role isActive');
  if (!user) return res.status(404).json({ message: 'Staff account not found.' });
  return res.json({ user });
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot deactivate your own account.' });
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, businessId: req.user.businessId, role: 'staff', isActive: true },
    { $set: { isActive: false } }, { new: true },
  );
  if (!user) return res.status(404).json({ message: 'Active staff account not found.' });
  await AuditLog.create({ businessId: req.user.businessId, userId: req.user.id, action: 'staff.deactivated', entityType: 'User', entityId: user._id.toString() });
  return res.json({ message: 'Staff account deactivated; transaction history is retained.' });
}));

module.exports = router;

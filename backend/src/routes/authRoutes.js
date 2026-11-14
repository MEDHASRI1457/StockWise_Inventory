const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Business = require('../models/Business');
const AuditLog = require('../models/AuditLog');
const { auth } = require('../middleware/auth');

const router = express.Router();
const publicUser = (user, currency = 'INR') => ({ id: user._id.toString(), name: user.name, email: user.email, role: user.role, businessId: user.businessId.toString(), currency });
const tokenFor = (user) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not configured.');
  return jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
};

router.post('/register', async (req, res, next) => {
  const { name, email, password, businessName } = req.body || {};
  if (!name || !email || !password || !businessName) return res.status(400).json({ message: 'Name, email, password and business name are required.' });
  if (typeof password !== 'string' || password.length < 10) return res.status(400).json({ message: 'Password must be at least 10 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  const session = await mongoose.startSession();
  try {
    let response;
    await session.withTransaction(async () => {
      const [business] = await Business.create([{ name: String(businessName).trim() }], { session });
      const [user] = await User.create([{
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password: await bcrypt.hash(password, 12),
        role: 'admin',
        businessId: business._id,
      }], { session });
      business.ownerId = user._id;
      await business.save({ session });
      await AuditLog.create([{ businessId: business._id, userId: user._id, action: 'business.registered', entityType: 'Business', entityId: business._id.toString() }], { session });
      response = { token: tokenFor(user), user: publicUser(user, business.currency) };
    });
    return res.status(201).json(response);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
    return next(error);
  } finally {
    await session.endSession();
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    const user = await User.findOne({ email: String(email).trim().toLowerCase(), isActive: true }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid email or password.' });
    const business = await Business.findById(user.businessId).select('currency').lean();
    return res.json({ token: tokenFor(user), user: publicUser(user, business?.currency || 'INR') });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', auth, (req, res) => res.json({ user: req.user }));
router.post('/logout', auth, (_req, res) => res.json({ message: 'Signed out. Remove the access token from this device.' }));

module.exports = router;

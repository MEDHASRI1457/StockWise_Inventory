const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Business = require('../models/Business');

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required.' });
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.');
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (!mongoose.isValidObjectId(claims.id)) return res.status(401).json({ message: 'Invalid authentication token.' });
    const user = await User.findById(claims.id).select('name email role businessId isActive').lean();
    if (!user || !user.isActive) return res.status(401).json({ message: 'Account unavailable.' });
    const business = await Business.findById(user.businessId).select('currency').lean();
    if (!business) return res.status(401).json({ message: 'Business account unavailable.' });
    req.user = { ...user, id: user._id.toString(), businessId: user.businessId.toString(), currency: business.currency || 'INR' };
    return next();
  } catch (error) {
    if (['JsonWebTokenError', 'TokenExpiredError'].includes(error.name)) return res.status(401).json({ message: 'Invalid or expired token.' });
    return next(error);
  }
}

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'Insufficient permissions.' });
  return next();
};

module.exports = { auth, authorize };

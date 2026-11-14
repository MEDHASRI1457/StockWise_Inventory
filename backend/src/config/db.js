const mongoose = require('mongoose');

async function connectDB() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env.');
  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 20),
    serverSelectionTimeoutMS: 10000,
    autoIndex: process.env.NODE_ENV !== 'production',
  });
  console.log('MongoDB connected');
}

module.exports = connectDB;

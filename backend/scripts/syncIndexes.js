require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const models = [
  require('../src/models/Business'),
  require('../src/models/User'),
  require('../src/models/Category'),
  require('../src/models/Product'),
  require('../src/models/StockMovement'),
  require('../src/models/Sale'),
  require('../src/models/LowStockAlert'),
  require('../src/models/AuditLog'),
];

async function syncIndexes() {
  await connectDB();
  for (const model of models) {
    await model.createIndexes();
    console.log(`Indexes ready: ${model.collection.collectionName}`);
  }
}

syncIndexes()
  .catch((error) => {
    console.error('Index synchronization failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

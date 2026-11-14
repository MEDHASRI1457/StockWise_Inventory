const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitSellingPrice: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
}, { _id: false });

const saleSchema = new mongoose.Schema({
  transactionId: { type: String, required: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  items: { type: [saleItemSchema], required: true, validate: (items) => items.length > 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  type: { type: String, enum: ['sale', 'return'], default: 'sale' },
  sourceSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
  returnVersion: { type: Number, default: 0 },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  staffName: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
}, { timestamps: true });

saleSchema.index({ businessId: 1, idempotencyKey: 1 }, { unique: true });
saleSchema.index({ businessId: 1, createdAt: -1 });
saleSchema.index({ businessId: 1, 'items.productId': 1, createdAt: -1 });
saleSchema.index({ businessId: 1, sourceSaleId: 1 });
module.exports = mongoose.model('Sale', saleSchema);

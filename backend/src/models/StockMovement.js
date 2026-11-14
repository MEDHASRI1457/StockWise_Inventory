const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  type: { type: String, enum: ['IN', 'OUT'], required: true },
  operationType: { type: String, enum: ['receipt', 'sale', 'adjustment'], required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitSellingPrice: { type: Number, min: 0, default: null },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  staffName: { type: String, required: true },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
  idempotencyKey: { type: String, required: true },
}, { timestamps: true });

stockMovementSchema.index({ businessId: 1, createdAt: -1 });
stockMovementSchema.index({ businessId: 1, productId: 1, createdAt: -1 });
stockMovementSchema.index({ businessId: 1, idempotencyKey: 1 }, { unique: true });
module.exports = mongoose.model('StockMovement', stockMovementSchema);

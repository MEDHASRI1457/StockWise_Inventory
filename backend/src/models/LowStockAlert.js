const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  currentStock: { type: Number, required: true },
  reorderLevel: { type: Number, required: true },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

alertSchema.index({ businessId: 1, productId: 1 }, { unique: true, partialFilterExpression: { resolvedAt: null } });
module.exports = mongoose.model('LowStockAlert', alertSchema);

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  sku: { type: String, required: true, trim: true, uppercase: true },
  barcode: { type: String, trim: true, default: null },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  category: { type: String, required: true, trim: true },
  description: { type: String, default: '', maxlength: 2000 },
  purchasePrice: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0 },
  currentStock: { type: Number, required: true, min: 0, default: 0 },
  minimumStockLevel: { type: Number, required: true, min: 0, default: 5 },
  maximumStockLevel: { type: Number, min: 0, default: null },
  unit: { type: String, default: 'unit', trim: true },
  supplierName: { type: String, default: '', trim: true },
  location: { type: String, default: '', trim: true },
  imageUrl: { type: String, default: '' },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.index({ businessId: 1, sku: 1 }, { unique: true });
productSchema.index({ businessId: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } });
productSchema.index({ businessId: 1, name: 1 });
productSchema.index({ businessId: 1, categoryId: 1 });
productSchema.index({ businessId: 1, createdAt: -1 });
productSchema.index({ businessId: 1, currentStock: 1, minimumStockLevel: 1 });
productSchema.index({ businessId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);

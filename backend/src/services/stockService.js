const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Sale = require('../models/Sale');
const LowStockAlert = require('../models/LowStockAlert');
const AuditLog = require('../models/AuditLog');

async function applyStockOperation({ user, businessId = user.businessId, operation }) {
  const { productId, quantity, type, operationType, idempotencyKey } = operation;
  const count = Number(quantity);
  if (!mongoose.isValidObjectId(productId)) throw Object.assign(new Error('A valid product ID is required.'), { status: 400 });
  if (!Number.isSafeInteger(count) || count < 1) throw Object.assign(new Error('Quantity must be a positive whole number.'), { status: 400 });
  if (!['IN', 'OUT'].includes(type)) throw Object.assign(new Error('Type must be IN or OUT.'), { status: 400 });
  if (!['receipt', 'sale', 'adjustment'].includes(operationType)
    || (type === 'IN' && operationType === 'sale')
    || (type === 'OUT' && operationType === 'receipt')) {
    throw Object.assign(new Error('Invalid operation type for stock direction.'), { status: 400 });
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8 || idempotencyKey.length > 150) {
    throw Object.assign(new Error('A unique idempotencyKey of 8 to 150 characters is required.'), { status: 400 });
  }

  const dupe = await StockMovement.findOne({ businessId, idempotencyKey }).lean();
  if (dupe) return { ignored: true, movement: dupe };

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const filter = { _id: productId, businessId, isActive: true };
      if (type === 'OUT') filter.currentStock = { $gte: count };
      const product = await Product.findOneAndUpdate(
        filter,
        { $inc: { currentStock: type === 'IN' ? count : -count } },
        { new: true, session, runValidators: true },
      );
      if (!product) {
        const exists = await Product.exists({ _id: productId, businessId, isActive: true }).session(session);
        throw Object.assign(
          new Error(exists ? 'Insufficient stock. The operation would create negative inventory.' : 'Product not found.'),
          { status: exists ? 409 : 404 },
        );
      }

      const transactionId = randomUUID();
      const unitSellingPrice = operationType === 'sale' ? product.sellingPrice : null;
      const movement = await StockMovement.create([{
        transactionId,
        businessId,
        productId: product._id,
        productName: product.name,
        type,
        operationType,
        quantity: count,
        unitSellingPrice,
        staffId: user.id,
        staffName: user.name,
        reference: String(operation.reference || '').slice(0, 160),
        notes: String(operation.notes || '').slice(0, 1000),
        idempotencyKey,
      }], { session });

      let sale = null;
      if (operationType === 'sale') {
        [sale] = await Sale.create([{
          transactionId,
          businessId,
          items: [{
            productId: product._id,
            productName: product.name,
            sku: product.sku,
            quantity: count,
            unitSellingPrice,
            totalAmount: count * unitSellingPrice,
          }],
          totalAmount: count * unitSellingPrice,
          staffId: user.id,
          staffName: user.name,
          idempotencyKey,
        }], { session });
      }

      if (product.currentStock <= product.minimumStockLevel) {
        await LowStockAlert.findOneAndUpdate(
          { businessId, productId: product._id, resolvedAt: null },
          {
            $set: { productName: product.name, currentStock: product.currentStock, reorderLevel: product.minimumStockLevel },
            $setOnInsert: { businessId, productId: product._id },
          },
          { upsert: true, new: true, session },
        );
      } else {
        await LowStockAlert.updateMany(
          { businessId, productId: product._id, resolvedAt: null },
          { $set: { resolvedAt: new Date(), resolvedBy: user.id } },
          { session },
        );
      }

      await AuditLog.create([{
        businessId,
        userId: user.id,
        action: operationType === 'sale' ? 'sale.recorded' : `stock.${type.toLowerCase()}`,
        entityType: 'Product',
        entityId: product._id.toString(),
        details: { quantity: count, transactionId },
      }], { session });

      result = { product, movement: movement[0], sale };
    });
    return result;
  } catch (error) {
    if (error.code === 11000) {
      const sale = await Sale.findOne({ businessId, idempotencyKey }).lean();
      if (sale) return { ignored: true, sale };
      const movement = await StockMovement.findOne({ businessId, idempotencyKey }).lean();
      if (movement) return { ignored: true, movement };
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function createSale({ user, items, idempotencyKey }) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw Object.assign(new Error('A sale must contain between 1 and 100 products.'), { status: 400 });
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8 || idempotencyKey.length > 150) {
    throw Object.assign(new Error('A unique idempotencyKey is required.'), { status: 400 });
  }
  const businessId = user.businessId;
  const existing = await Sale.findOne({ businessId, idempotencyKey }).lean();
  if (existing) return { ignored: true, sale: existing };
  const quantities = new Map();
  for (const item of items) {
    if (!mongoose.isValidObjectId(item.productId) || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
      throw Object.assign(new Error('Each sale item needs a valid product and positive whole-number quantity.'), { status: 400 });
    }
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + Number(item.quantity));
  }

  const session = await mongoose.startSession();
  let saleResult;
  try {
    await session.withTransaction(async () => {
      const saleItems = [];
      const transactionId = randomUUID();
      let totalAmount = 0;
      for (const [productId, quantity] of quantities) {
        const product = await Product.findOneAndUpdate(
          { _id: productId, businessId, isActive: true, currentStock: { $gte: quantity } },
          { $inc: { currentStock: -quantity } },
          { new: true, session, runValidators: true },
        );
        if (!product) {
          const exists = await Product.exists({ _id: productId, businessId, isActive: true }).session(session);
          throw Object.assign(new Error(exists ? `Insufficient stock for product ${productId}.` : `Product ${productId} not found.`), { status: exists ? 409 : 404 });
        }
        const lineAmount = quantity * product.sellingPrice;
        totalAmount += lineAmount;
        saleItems.push({
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          quantity,
          unitSellingPrice: product.sellingPrice,
          totalAmount: lineAmount,
        });
        await StockMovement.create([{
          transactionId,
          businessId,
          productId: product._id,
          productName: product.name,
          type: 'OUT',
          operationType: 'sale',
          quantity,
          unitSellingPrice: product.sellingPrice,
          staffId: user.id,
          staffName: user.name,
          reference: transactionId,
          idempotencyKey: `${idempotencyKey}:${product._id}`,
        }], { session });
        if (product.currentStock <= product.minimumStockLevel) {
          await LowStockAlert.findOneAndUpdate(
            { businessId, productId: product._id, resolvedAt: null },
            { $set: { productName: product.name, currentStock: product.currentStock, reorderLevel: product.minimumStockLevel }, $setOnInsert: { businessId, productId: product._id } },
            { upsert: true, session },
          );
        }
      }
      const [sale] = await Sale.create([{
        transactionId,
        businessId,
        items: saleItems,
        totalAmount,
        staffId: user.id,
        staffName: user.name,
        idempotencyKey,
      }], { session });
      await AuditLog.create([{
        businessId,
        userId: user.id,
        action: 'sale.recorded',
        entityType: 'Sale',
        entityId: sale._id.toString(),
        details: { transactionId, totalAmount, itemCount: saleItems.length },
      }], { session });
      saleResult = sale;
    });
    return { sale: saleResult };
  } catch (error) {
    if (error.code === 11000) {
      const sale = await Sale.findOne({ businessId, idempotencyKey }).lean();
      if (sale) return { ignored: true, sale };
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { applyStockOperation, createSale };

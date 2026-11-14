const mongoose = require('mongoose');
const Product = require('../models/Product');
const Sale = require('../models/Sale');

function calculateRestock({ currentStock, unitsSold, periodDays, leadTimeDays = 7, safetyStockDays = 3, pendingUnits = 0 }) {
  if (!unitsSold || !periodDays || unitsSold <= 0 || periodDays <= 0) {
    return { insufficientData: true, avgDailySales: null, forecastLeadDemand: null, safetyStock: null, reorderPoint: null, recommendedOrder: null };
  }
  const avgDailySales = unitsSold / periodDays;
  const forecastLeadDemand = avgDailySales * leadTimeDays;
  const safetyStock = Math.ceil(avgDailySales * safetyStockDays);
  const reorderPoint = Math.ceil(forecastLeadDemand + safetyStock);
  const recommendedOrder = Math.max(0, Math.ceil(reorderPoint - currentStock - pendingUnits));
  return { insufficientData: false, avgDailySales: Number(avgDailySales.toFixed(2)), forecastLeadDemand: Number(forecastLeadDemand.toFixed(2)), safetyStock, reorderPoint, recommendedOrder };
}

async function getRestockSuggestions(businessId, periodDays = 30) {
  const days = Math.min(90, Math.max(7, Number.parseInt(periodDays, 10) || 30));
  const since = new Date(Date.now() - days * 86400000);
  const tenantId = new mongoose.Types.ObjectId(businessId);
  const [products, sold] = await Promise.all([
    Product.find({ businessId: tenantId, isActive: true }).lean(),
    Sale.aggregate([
      { $match: { businessId: tenantId, createdAt: { $gte: since }, type: 'sale' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', unitsSold: { $sum: '$items.quantity' } } },
    ]),
  ]);
  const salesMap = new Map(sold.map((entry) => [entry._id.toString(), entry.unitsSold]));
  const suggestions = products.map((product) => {
    const calculation = calculateRestock({
      currentStock: product.currentStock,
      unitsSold: salesMap.get(product._id.toString()) || 0,
      periodDays: days,
    });
    return {
      productId: product._id.toString(),
      productName: product.name,
      currentStock: product.currentStock,
      reorderLevel: product.minimumStockLevel,
      ...calculation,
      estimatedCost: calculation.recommendedOrder === null ? null : Number((calculation.recommendedOrder * product.purchasePrice).toFixed(2)),
      reason: calculation.insufficientData
        ? `Stock is ${product.currentStock <= product.minimumStockLevel ? 'at/below' : 'above'} threshold; insufficient sales history for a demand estimate.`
        : calculation.recommendedOrder > 0
          ? `Expected ${calculation.forecastLeadDemand} units during lead time plus ${calculation.safetyStock} safety units.`
          : 'Current stock covers estimated lead-time demand and safety stock.',
    };
  }).filter((item) => item.currentStock <= item.reorderLevel || item.recommendedOrder > 0);
  return { suggestions, periodDays: days };
}

module.exports = { calculateRestock, getRestockSuggestions };

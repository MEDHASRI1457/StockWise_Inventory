const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRestock } = require('../src/services/restockService');

test('calculates lead-time demand, safety stock, and required replenishment', () => {
  assert.deepEqual(calculateRestock({
    currentStock: 10,
    unitsSold: 30,
    periodDays: 30,
    leadTimeDays: 7,
    safetyStockDays: 3,
  }), {
    insufficientData: false,
    avgDailySales: 1,
    forecastLeadDemand: 7,
    safetyStock: 3,
    reorderPoint: 10,
    recommendedOrder: 0,
  });
});

test('accounts for on-order inventory when suggesting a replenishment', () => {
  const result = calculateRestock({
    currentStock: 2,
    unitsSold: 60,
    periodDays: 30,
    leadTimeDays: 7,
    safetyStockDays: 3,
    pendingUnits: 4,
  });
  assert.equal(result.reorderPoint, 20);
  assert.equal(result.recommendedOrder, 14);
});

test('marks missing or invalid sales history as insufficient', () => {
  for (const input of [
    { currentStock: 0, unitsSold: 0, periodDays: 30 },
    { currentStock: 0, unitsSold: 10, periodDays: 0 },
    { currentStock: 0, unitsSold: -1, periodDays: 30 },
  ]) {
    assert.equal(calculateRestock(input).insufficientData, true);
    assert.equal(calculateRestock(input).recommendedOrder, null);
  }
});

test('does not recommend a negative order quantity', () => {
  const result = calculateRestock({
    currentStock: 100,
    unitsSold: 30,
    periodDays: 30,
    leadTimeDays: 7,
    safetyStockDays: 3,
  });
  assert.equal(result.recommendedOrder, 0);
});

const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const { applyStockOperation } = require('../services/stockService');

const router = express.Router();
router.post('/stock-operations', auth, authorize('admin', 'staff'), async (req, res, next) => {
  const operations = req.body?.operations;
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 50) {
    return res.status(400).json({ message: 'Submit between 1 and 50 operations.' });
  }
  const results = [];
  for (const operation of operations) {
    try {
      const result = await applyStockOperation({ user: req.user, operation });
      results.push({ id: operation.id, synchronized: true, ...result });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error('Stock operation synchronization failed:', error);
      results.push({
        id: operation.id,
        synchronized: false,
        status,
        retryable: status >= 500,
        message: status >= 500 ? 'Synchronization failed. Retry later.' : error.message,
      });
    }
  }
  return res.json({ results });
});

module.exports = router;

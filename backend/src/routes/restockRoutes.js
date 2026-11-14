const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const { getRestockSuggestions } = require('../services/restockService');

const router = express.Router();
router.get('/suggestions', auth, authorize('admin'), async (req, res, next) => {
  try {
    return res.json(await getRestockSuggestions(req.user.businessId, req.query.days));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

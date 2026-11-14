const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  currency: { type: String, default: 'INR', uppercase: true, minlength: 3, maxlength: 3 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Business', businessSchema);

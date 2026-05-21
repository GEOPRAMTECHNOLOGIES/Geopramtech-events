const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, enum: ['Music','Tech','Sports','Culture','Food & Drink','Art','Business'] },
  description: { type: String, default: '' },
  date: { type: String, required: true },
  time: { type: String, required: true },
  venue: { type: String, required: true },
  totalSeats: { type: Number, required: true, min: 1 },
  soldSeats: { type: Number, default: 0 },
  price: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Upcoming','Live','Past'], default: 'Upcoming' },
  bannerColor: { type: String, default: '#1D9E75' },
  imageEmoji: { type: String, default: '🎪' },
  featured: { type: Boolean, default: false },
}, { timestamps: true });

const OrderSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  buyerName: { type: String, required: true },
  buyerEmail: { type: String, required: true },
  buyerPhone: { type: String, required: true },
  quantity: { type: Number, default: 1, min: 1 },
  totalAmount: { type: Number, required: true },
  mpesaRef: { type: String, default: '' },
  status: { type: String, enum: ['pending','paid','failed'], default: 'pending' },
  checkoutRequestId: { type: String, default: '' },
}, { timestamps: true });

module.exports = {
  Event: mongoose.model('Event', EventSchema),
  Order: mongoose.model('Order', OrderSchema),
};

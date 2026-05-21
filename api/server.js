require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Event, Order } = require('./models');
const { initiateSTKPush } = require('./mpesa');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// DB connection (cached for serverless)
let dbConn = null;
async function connectDB() {
  if (dbConn) return dbConn;
  dbConn = await mongoose.connect(process.env.MONGO_URI);
  return dbConn;
}

// ── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Admin login ──────────────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// ── Public: Get events ───────────────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  await connectDB();
  const { category, status, featured } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (featured === 'true') filter.featured = true;
  const events = await Event.find(filter).sort({ createdAt: -1 });
  res.json(events);
});

app.get('/api/events/:id', async (req, res) => {
  await connectDB();
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// ── Admin: Create event ──────────────────────────────────────────────────────
app.post('/api/events', authMiddleware, async (req, res) => {
  await connectDB();
  try {
    const event = await Event.create(req.body);
    res.status(201).json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Admin: Update event ──────────────────────────────────────────────────────
app.put('/api/events/:id', authMiddleware, async (req, res) => {
  await connectDB();
  const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// ── Admin: Delete event ──────────────────────────────────────────────────────
app.delete('/api/events/:id', authMiddleware, async (req, res) => {
  await connectDB();
  await Event.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── Public: Buy ticket (initiate M-Pesa STK push) ───────────────────────────
app.post('/api/tickets/buy', async (req, res) => {
  await connectDB();
  const { eventId, buyerName, buyerEmail, buyerPhone, quantity = 1 } = req.body;
  if (!eventId || !buyerName || !buyerEmail || !buyerPhone) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const available = event.totalSeats - event.soldSeats;
  if (quantity > available) return res.status(400).json({ error: 'Not enough seats available' });

  const totalAmount = event.price * quantity;
  const order = await Order.create({ event: eventId, buyerName, buyerEmail, buyerPhone, quantity, totalAmount });

  try {
    const mpesaRes = await initiateSTKPush({
      phone: buyerPhone,
      amount: totalAmount,
      orderId: order._id,
      description: `${quantity}x ${event.name}`,
    });
    order.checkoutRequestId = mpesaRes.CheckoutRequestID;
    await order.save();
    res.json({ success: true, orderId: order._id, checkoutRequestId: mpesaRes.CheckoutRequestID, message: 'Check your phone for M-Pesa prompt' });
  } catch (err) {
    order.status = 'failed';
    await order.save();
    res.status(500).json({ error: 'M-Pesa request failed. Try again.', detail: err.message });
  }
});

// ── M-Pesa callback ──────────────────────────────────────────────────────────
app.post('/api/payments/callback', async (req, res) => {
  await connectDB();
  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) return res.json({ ResultCode: 0, ResultDesc: 'OK' });

    const { CheckoutRequestID, ResultCode } = body;
    const order = await Order.findOne({ checkoutRequestId: CheckoutRequestID });
    if (!order) return res.json({ ResultCode: 0, ResultDesc: 'OK' });

    if (ResultCode === 0) {
      const meta = body.CallbackMetadata?.Item || [];
      const mpesaRef = meta.find(i => i.Name === 'MpesaReceiptNumber')?.Value || '';
      order.status = 'paid';
      order.mpesaRef = mpesaRef;
      await order.save();
      await Event.findByIdAndUpdate(order.event, { $inc: { soldSeats: order.quantity } });
    } else {
      order.status = 'failed';
      await order.save();
    }
  } catch (e) { console.error('Callback error:', e); }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// ── Check payment status ─────────────────────────────────────────────────────
app.get('/api/tickets/status/:orderId', async (req, res) => {
  await connectDB();
  const order = await Order.findById(req.params.orderId).populate('event', 'name date venue');
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ status: order.status, mpesaRef: order.mpesaRef, order });
});

// ── Admin: Get orders ────────────────────────────────────────────────────────
app.get('/api/admin/orders', authMiddleware, async (req, res) => {
  await connectDB();
  const orders = await Order.find().populate('event', 'name date').sort({ createdAt: -1 }).limit(100);
  res.json(orders);
});

// ── Admin: Stats ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  await connectDB();
  const [totalEvents, totalOrders, revenue] = await Promise.all([
    Event.countDocuments(),
    Order.countDocuments({ status: 'paid' }),
    Order.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
  ]);
  const liveEvents = await Event.countDocuments({ status: 'Live' });
  res.json({ totalEvents, totalOrders, revenue: revenue[0]?.total || 0, liveEvents });
});

// ── Serve frontend pages ─────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;

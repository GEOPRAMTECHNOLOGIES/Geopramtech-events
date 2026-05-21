require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Event, Order } = require('./models');
const { initiateSTKPush } = require('./mpesa');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@geopramtech.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from /public
app.use(express.static(path.join(__dirname, '../public')));

// ── DB: cached connection for Vercel serverless ──────────────────────────────
let cached = global._mongoConn;
async function connectDB() {
  if (cached && mongoose.connection.readyState === 1) return cached;
  cached = await mongoose.connect(process.env.MONGO_URI);
  global._mongoConn = cached;
  return cached;
}

// ── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Admin login ──────────────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// ── GET events (public) ──────────────────────────────────────────────────────
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
  if (!event) return res.status(404).json({ error: 'Not found' });
  res.json(event);
});

// ── CREATE event (admin) ─────────────────────────────────────────────────────
app.post('/api/events', auth, async (req, res) => {
  await connectDB();
  try {
    const event = await Event.create(req.body);
    res.status(201).json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── UPDATE event (admin) ─────────────────────────────────────────────────────
app.put('/api/events/:id', auth, async (req, res) => {
  await connectDB();
  const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!event) return res.status(404).json({ error: 'Not found' });
  res.json(event);
});

// ── DELETE event (admin) ─────────────────────────────────────────────────────
app.delete('/api/events/:id', auth, async (req, res) => {
  await connectDB();
  await Event.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── BUY ticket (M-Pesa STK push) ────────────────────────────────────────────
app.post('/api/tickets/buy', async (req, res) => {
  await connectDB();
  const { eventId, buyerName, buyerEmail, buyerPhone, quantity = 1 } = req.body;
  if (!eventId || !buyerName || !buyerEmail || !buyerPhone)
    return res.status(400).json({ error: 'All fields are required' });

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const available = event.totalSeats - event.soldSeats;
  if (quantity > available) return res.status(400).json({ error: 'Not enough seats' });

  const totalAmount = event.price * quantity;
  const order = await Order.create({ event: eventId, buyerName, buyerEmail, buyerPhone, quantity, totalAmount });

  try {
    const mpesaRes = await initiateSTKPush({
      phone: buyerPhone, amount: totalAmount,
      orderId: order._id, description: `${quantity}x ${event.name}`,
    });
    order.checkoutRequestId = mpesaRes.CheckoutRequestID;
    await order.save();
    res.json({ success: true, orderId: order._id, checkoutRequestId: mpesaRes.CheckoutRequestID, message: 'Check your phone for the M-Pesa prompt' });
  } catch (err) {
    order.status = 'failed';
    await order.save();
    console.error('M-Pesa checkout failed', err.response?.data || err.message || err);
    res.status(500).json({ error: 'M-Pesa request failed', detail: err.message });
  }
});

// ── M-Pesa callback ──────────────────────────────────────────────────────────
app.post('/api/payments/callback', async (req, res) => {
  await connectDB();
  try {
    const cb = req.body?.Body?.stkCallback;
    if (!cb) return res.json({ ResultCode: 0, ResultDesc: 'OK' });
    const order = await Order.findOne({ checkoutRequestId: cb.CheckoutRequestID });
    if (order) {
      if (cb.ResultCode === 0) {
        const items = cb.CallbackMetadata?.Item || [];
        order.mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value || '';
        order.status = 'paid';
        await order.save();
        await Event.findByIdAndUpdate(order.event, { $inc: { soldSeats: order.quantity } });
      } else {
        order.status = 'failed';
        await order.save();
      }
    }
  } catch (e) { console.error(e); }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// ── Check order status ───────────────────────────────────────────────────────
app.get('/api/tickets/status/:orderId', async (req, res) => {
  await connectDB();
  const order = await Order.findById(req.params.orderId).populate('event', 'name date venue');
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ status: order.status, mpesaRef: order.mpesaRef, order });
});

// ── Admin: orders ────────────────────────────────────────────────────────────
app.get('/api/admin/orders', auth, async (req, res) => {
  await connectDB();
  const orders = await Order.find().populate('event', 'name date').sort({ createdAt: -1 }).limit(200);
  res.json(orders);
});

// ── Admin: stats ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', auth, async (req, res) => {
  await connectDB();
  const [totalEvents, totalOrders, rev, liveEvents] = await Promise.all([
    Event.countDocuments(),
    Order.countDocuments({ status: 'paid' }),
    Order.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
    Event.countDocuments({ status: 'Live' }),
  ]);
  res.json({ totalEvents, totalOrders, revenue: rev[0]?.total || 0, liveEvents });
});

// ── Serve HTML pages ─────────────────────────────────────────────────────────
app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
}

module.exports = app;

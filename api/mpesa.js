const axios = require('axios');

const MPESA_BASE = 'https://sandbox.safaricom.co.ke'; // Change to https://api.safaricom.co.ke for production

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const res = await axios.get(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return res.data.access_token;
}

async function initiateSTKPush({ phone, amount, orderId, description }) {
  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString('base64');

  // Normalize phone: ensure format 2547XXXXXXXX
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) normalized = '254' + normalized.slice(1);
  if (normalized.startsWith('+')) normalized = normalized.slice(1);

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerBuyGoodsOnline',
    Amount: Math.ceil(amount),
    PartyA: normalized,
    PartyB: process.env.MPESA_TILL_NUMBER,
    PhoneNumber: normalized,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: `GPT-${orderId}`,
    TransactionDesc: description || 'Event ticket purchase',
  };

  const res = await axios.post(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return res.data;
}

module.exports = { initiateSTKPush };

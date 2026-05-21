const axios = require('axios');

const MPESA_BASE = 'https://sandbox.safaricom.co.ke'; // Change to https://api.safaricom.co.ke for production
const BUSINESS_SHORTCODE = process.env.MPESA_SHORTCODE || '4574727';
const PARTY_B = process.env.MPESA_TILL_NUMBER || '5367886';
const TRANSACTION_TYPE = process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline';
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const ACCOUNT_REFERENCE = process.env.MPESA_ACCOUNT_REFERENCE || 'Geopramevents';
const TRANSACTION_DESC = process.env.MPESA_TRANSACTION_DESC || 'Geopram Technologies';

async function getAccessToken() {
  try {
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const res = await axios.get(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    return res.data.access_token;
  } catch (err) {
    const detail = err.response?.data || err.message;
    throw new Error(`M-Pesa auth failed: ${JSON.stringify(detail)}`);
  }
}

async function initiateSTKPush({ phone, amount, orderId, description }) {
  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password = Buffer.from(
    `${BUSINESS_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString('base64');

  // Normalize phone: ensure format 2547XXXXXXXX
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) normalized = '254' + normalized.slice(1);
  if (normalized.startsWith('+')) normalized = normalized.slice(1);

  const payload = {
    BusinessShortCode: BUSINESS_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: TRANSACTION_TYPE,
    Amount: Math.ceil(amount),
    PartyA: normalized,
    PartyB: PARTY_B,
    PhoneNumber: normalized,
    CallBackURL: CALLBACK_URL,
    AccountReference: ACCOUNT_REFERENCE,
    TransactionDesc: description || TRANSACTION_DESC,
  };

  try {
    const res = await axios.post(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, payload, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return res.data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    throw new Error(`STK push failed: ${JSON.stringify(detail)}`);
  }
}

module.exports = { initiateSTKPush };

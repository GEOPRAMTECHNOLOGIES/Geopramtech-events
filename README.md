# GeoPramTech Events Platform

A full-stack events platform with M-Pesa payments, built for Vercel deployment.

## Features
- Public events dashboard with category filters & search
- M-Pesa STK Push ticket purchasing
- Hidden admin panel at `/admin`
- JWT-protected admin API
- MongoDB Atlas database

---

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/geopramtech-events.git
git push -u origin main
```

### 2. Import on Vercel
- Go to https://vercel.com/new
- Import your GitHub repository
- Framework preset: **Other**

### 3. Add Environment Variables in Vercel
In your project Settings → Environment Variables, add ALL of these:

| Key | Value |
|-----|-------|
| `MONGO_URI` | Your MongoDB Atlas connection string |
| `JWT_SECRET` | A long random secret string |
| `ADMIN_EMAIL` | Your admin login email |
| `ADMIN_PASSWORD` | Your admin password |
| `MPESA_CONSUMER_KEY` | From Safaricom Developer portal |
| `MPESA_CONSUMER_SECRET` | From Safaricom Developer portal |
| `MPESA_SHORTCODE` | Your M-Pesa shortcode |
| `MPESA_TILL_NUMBER` | Your till number |
| `MPESA_PASSKEY` | From Safaricom |
| `MPESA_CALLBACK_URL` | `https://YOUR-DOMAIN.vercel.app/api/payments/callback` |

### 4. Deploy
Click **Deploy**. Your app will be live in ~1 minute.

---

## M-Pesa Setup

The app uses **sandbox mode** by default. To go live:
1. In `api/mpesa.js`, change `MPESA_BASE` to `https://api.safaricom.co.ke`
2. Change `TransactionType` to `CustomerPayBillOnline` if using Paybill instead of Till

---

## Local Development
```bash
npm install
cp .env.example .env   # Fill in your values
npm run dev            # Starts on http://localhost:3000
```

---

## URL Structure
| URL | Description |
|-----|-------------|
| `/` | Public events dashboard |
| `/admin` | Admin panel (hidden) |
| `/api/events` | GET all events |
| `/api/tickets/buy` | POST buy ticket |
| `/api/payments/callback` | M-Pesa callback |

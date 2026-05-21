const API = '';
let allEvents = [];
let currentCat = 'all';
let currentEventId = null;

const catEmoji = {Music:'🎵',Tech:'💻',Sports:'⚽',Culture:'🎭','Food & Drink':'🍽️',Art:'🎨',Business:'💼'};

async function init() {
  await Promise.all([loadEvents(), loadStats()]);
}

async function loadStats() {
  try {
    const r = await fetch(`${API}/api/admin/stats`);
    if (!r.ok) return;
    const d = await r.json();
    document.getElementById('stats-bar').style.display = 'grid';
    document.getElementById('stat-events').textContent = d.totalEvents || 0;
    document.getElementById('stat-tickets').textContent = (d.totalOrders || 0).toLocaleString();
    document.getElementById('stat-revenue').textContent = 'KES ' + (d.revenue || 0).toLocaleString();
    document.getElementById('stat-live').textContent = d.liveEvents || 0;
  } catch {}
}

async function loadEvents() {
  try {
    const r = await fetch(`${API}/api/events`);
    allEvents = await r.json();
    renderEvents();
  } catch {
    document.getElementById('events-grid').innerHTML = '<div class="no-events">Could not load events. Please check your API connection.</div>';
  }
}

function setCat(btn, cat) {
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentCat = cat;
  renderEvents();
}

function filterEvents() {
  renderEvents();
}

function renderEvents() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const filtered = allEvents.filter(e => {
    const catMatch = currentCat === 'all' || e.category === currentCat;
    const q2 = !q || e.name.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
    return catMatch && q2;
  });

  const grid = document.getElementById('events-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="no-events">No events found. Try adjusting your filters.</div>';
    return;
  }

  grid.innerHTML = filtered.map(e => {
    const avail = e.totalSeats - e.soldSeats;
    const pct = Math.round((e.soldSeats / e.totalSeats) * 100);
    const soldOut = avail <= 0;
    const isPast = e.status === 'Past';
    const emoji = e.imageEmoji || catEmoji[e.category] || '🎪';
    const thumbMarkup = e.imageUrls && e.imageUrls.length
      ? `<div class="ecard-thumbs">${e.imageUrls.slice(0,3).map(url => `<img src="${url}" alt="${e.name} thumbnail" loading="lazy">`).join('')}</div>`
      : '';
    return `
      <div class="ecard">
        ${thumbMarkup}
        <div class="ecard-banner" style="background:${e.bannerColor}22">
          <span>${emoji}</span>
          <span class="ecard-badge badge-${e.status}">${e.status}</span>
        </div>
        <div class="ecard-body">
          <div class="ecard-name">${e.name}</div>
          <div class="ecard-meta">
            <span>📅 ${e.date}</span>
            <span>🕐 ${e.time}</span>
            <span>📍 ${e.venue.split(',')[0]}</span>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${e.bannerColor}"></div></div>
            <div class="progress-text">${pct}% filled · ${avail > 0 ? avail + ' seats left' : 'Sold out'}</div>
          </div>
          <div class="ecard-footer">
            <div class="ecard-price">KES ${e.price.toLocaleString()}</div>
            ${!soldOut && !isPast
              ? `<button class="btn-ticket" onclick="openTicketModal('${e._id}')">Buy ticket</button>`
              : `<span style="font-size:12px;color:#999">${isPast ? 'Ended' : 'Sold out'}</span>`
            }
          </div>
        </div>
      </div>`;
  }).join('');
}

function openTicketModal(eventId) {
  const e = allEvents.find(ev => ev._id === eventId);
  if (!e) return;
  currentEventId = eventId;
  const banner = document.getElementById('modal-event-banner');
  banner.style.background = e.imageUrls && e.imageUrls.length ? 'transparent' : e.bannerColor + '22';
  banner.innerHTML = e.imageUrls && e.imageUrls.length
    ? `<img src="${e.imageUrls[0]}" alt="${e.name} image" loading="lazy">`
    : `<span>${e.imageEmoji || catEmoji[e.category] || '🎪'}</span>`;
  document.getElementById('modal-title').textContent = e.name;
  document.getElementById('modal-event-info').textContent = `${e.date} · ${e.time} · ${e.venue}`;
  document.getElementById('modal-images').innerHTML = e.imageUrls && e.imageUrls.length
    ? e.imageUrls.map(url => `<img src="${url}" alt="${e.name} thumbnail" loading="lazy">`).join('')
    : '';
  updatePriceSummary(e);
  document.getElementById('ticket-qty').onchange = () => updatePriceSummary(e);
  document.getElementById('pay-status').className = 'pay-status';
  document.getElementById('pay-status').textContent = '';
  document.getElementById('pay-btn').disabled = false;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function updatePriceSummary(e) {
  const qty = parseInt(document.getElementById('ticket-qty').value) || 1;
  const total = qty * e.price;
  document.getElementById('price-summary').textContent = `${qty} ticket${qty>1?'s':''} × KES ${e.price.toLocaleString()} = KES ${total.toLocaleString()}`;
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
}

async function submitTicket(e) {
  e.preventDefault();
  const btn = document.getElementById('pay-btn');
  const statusEl = document.getElementById('pay-status');
  const name = document.getElementById('buyer-name').value.trim();
  const email = document.getElementById('buyer-email').value.trim();
  const phone = document.getElementById('buyer-phone').value.trim();
  const qty = parseInt(document.getElementById('ticket-qty').value) || 1;

  btn.disabled = true;
  btn.textContent = 'Processing…';
  statusEl.className = 'pay-status info';
  statusEl.textContent = 'Sending M-Pesa request…';

  try {
    const r = await fetch(`${API}/api/tickets/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: currentEventId, buyerName: name, buyerEmail: email, buyerPhone: phone, quantity: qty }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail ? `${d.error}: ${d.detail}` : d.error || 'Payment failed');

    statusEl.className = 'pay-status success';
    statusEl.textContent = '✓ ' + (d.message || 'Check your phone for the M-Pesa prompt!');
    btn.textContent = 'Request sent!';

    // Poll for payment confirmation
    pollPaymentStatus(d.orderId);
  } catch (err) {
    statusEl.className = 'pay-status error';
    statusEl.textContent = '✗ ' + err.message;
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg> Pay via M-Pesa`;
  }
}

async function pollPaymentStatus(orderId, attempts = 0) {
  if (attempts > 12) return;
  await new Promise(res => setTimeout(res, 5000));
  try {
    const r = await fetch(`${API}/api/tickets/status/${orderId}`);
    const d = await r.json();
    const statusEl = document.getElementById('pay-status');
    if (d.status === 'paid') {
      statusEl.className = 'pay-status success';
      statusEl.textContent = `✓ Payment confirmed! M-Pesa ref: ${d.mpesaRef}. Check your email for your ticket.`;
      loadEvents();
    } else if (d.status === 'failed') {
      statusEl.className = 'pay-status error';
      statusEl.textContent = '✗ Payment was not completed. Please try again.';
      document.getElementById('pay-btn').disabled = false;
    } else {
      pollPaymentStatus(orderId, attempts + 1);
    }
  } catch { pollPaymentStatus(orderId, attempts + 1); }
}

document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') filterEvents(); });
init();

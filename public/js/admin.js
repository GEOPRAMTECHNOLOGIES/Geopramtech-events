const API = '';
let token = localStorage.getItem('gpt_admin_token') || '';
let selectedColor = '#1D9E75';
let selectedEmoji = '🎵';
let editingId = null;

function getHeaders(useAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function adminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  try {
    const r = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Login failed');
    token = d.token;
    localStorage.setItem('gpt_admin_token', token);
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-app').classList.remove('hidden');
    initAdmin();
  } catch (err) {
    errEl.style.display = 'block';
    errEl.textContent = err.message;
  }
}

function adminLogout() {
  localStorage.removeItem('gpt_admin_token');
  token = '';
  document.getElementById('admin-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

function authHeader() { return getHeaders(true); }

// ── Init ──────────────────────────────────────────────────────────────────────
async function initAdmin() {
  if (token) {
    const valid = await verifyToken();
    if (valid) {
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('admin-app').classList.remove('hidden');
      loadStats();
      loadEventsTable();
    } else {
      token = '';
      localStorage.removeItem('gpt_admin_token');
    }
  }
}

async function verifyToken() {
  try {
    const r = await fetch(`${API}/api/admin/stats`, { headers: authHeader() });
    return r.ok;
  } catch { return false; }
}

// ── Sections ──────────────────────────────────────────────────────────────────
function showSection(id, btn) {
  document.querySelectorAll('.asection').forEach(s => s.classList.remove('visible'));
  document.querySelectorAll('.snav').forEach(b => b.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('visible');
  if (btn) btn.classList.add('active');
  if (id === 'events') loadEventsTable();
  if (id === 'orders') loadOrders();
  if (id === 'overview') loadStats();
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await fetch(`${API}/api/admin/stats`, { headers: authHeader() });
    const d = await r.json();
    document.getElementById('a-events').textContent = d.totalEvents || 0;
    document.getElementById('a-tickets').textContent = (d.totalOrders || 0).toLocaleString();
    document.getElementById('a-revenue').textContent = 'KES ' + (d.revenue || 0).toLocaleString();
    document.getElementById('a-live').textContent = d.liveEvents || 0;
  } catch {}
}

// ── Events table ──────────────────────────────────────────────────────────────
async function loadEventsTable() {
  try {
    const r = await fetch(`${API}/api/events`, { headers: getHeaders(false) });
    const events = await r.json();
    const colors = {Upcoming:'background:#EAF3DE;color:#3B6D11',Live:'background:#FAECE7;color:#993C1D',Past:'background:#f1f1f1;color:#888'};
    document.getElementById('events-tbody').innerHTML = events.map(e => `
      <tr>
        <td><strong>${e.name}</strong></td>
        <td>${e.date}</td>
        <td>${e.category}</td>
        <td>KES ${e.price.toLocaleString()}</td>
        <td>${e.soldSeats}/${e.totalSeats}</td>
        <td><span class="tbl-badge" style="${colors[e.status]||''}">${e.status}</span></td>
        <td><div class="tbl-actions">
          <button class="tbl-btn" onclick="editEvent('${e._id}')">Edit</button>
          <button class="tbl-btn danger" onclick="deleteEvent('${e._id}','${e.name}')">Delete</button>
        </div></td>
      </tr>`).join('') || '<tr><td colspan="7" class="tbl-loading">No events yet</td></tr>';
  } catch {
    document.getElementById('events-tbody').innerHTML = '<tr><td colspan="7" class="tbl-loading">Error loading events</td></tr>';
  }
}

// ── Orders ────────────────────────────────────────────────────────────────────
async function loadOrders() {
  try {
    const r = await fetch(`${API}/api/admin/orders`, { headers: authHeader() });
    const orders = await r.json();
    const colors = {pending:'background:#FAEEDA;color:#854F0B',paid:'background:#EAF3DE;color:#3B6D11',failed:'background:#FCEBEB;color:#A32D2D'};
    document.getElementById('orders-tbody').innerHTML = orders.map(o => `
      <tr>
        <td>${o.event?.name || 'N/A'}</td>
        <td>${o.buyerName}<br><span style="font-size:11px;color:#888">${o.buyerEmail}</span></td>
        <td>${o.buyerPhone}</td>
        <td>${o.quantity}</td>
        <td>KES ${o.totalAmount.toLocaleString()}</td>
        <td>${o.mpesaRef || '–'}</td>
        <td><span class="tbl-badge" style="${colors[o.status]||''}">${o.status}</span></td>
      </tr>`).join('') || '<tr><td colspan="7" class="tbl-loading">No orders yet</td></tr>';
  } catch {
    document.getElementById('orders-tbody').innerHTML = '<tr><td colspan="7" class="tbl-loading">Error loading orders</td></tr>';
  }
}

// ── Create / Edit event ───────────────────────────────────────────────────────
function pickColor(el) {
  document.querySelectorAll('.cswatch').forEach(s => s.classList.remove('sel'));
  el.classList.add('sel');
  selectedColor = el.dataset.c;
}

function pickEmoji(el) {
  document.querySelectorAll('.esel').forEach(s => s.classList.remove('sel'));
  el.classList.add('sel');
  selectedEmoji = el.textContent;
}

async function saveEvent(e) {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  const msg = document.getElementById('form-msg');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const payload = {
    name: document.getElementById('ev-name').value.trim(),
    category: document.getElementById('ev-cat').value,
    date: document.getElementById('ev-date').value,
    time: document.getElementById('ev-time').value,
    venue: document.getElementById('ev-venue').value.trim(),
    totalSeats: parseInt(document.getElementById('ev-seats').value),
    price: parseInt(document.getElementById('ev-price').value),
    status: document.getElementById('ev-status').value,
    description: document.getElementById('ev-desc').value.trim(),
    bannerColor: selectedColor,
    imageEmoji: selectedEmoji,
    imageUrls: document.getElementById('ev-images').value
      .split(',')
      .map(u => u.trim())
      .filter(Boolean),
    featured: document.getElementById('ev-featured').checked,
  };

  try {
    const url = editingId ? `${API}/api/events/${editingId}` : `${API}/api/events`;
    const method = editingId ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: authHeader(), body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Save failed');
    msg.className = 'form-msg success';
    msg.textContent = editingId ? '✓ Event updated!' : '✓ Event created!';
    showToast(editingId ? 'Event updated' : 'Event created');
    resetForm();
  } catch (err) {
    msg.className = 'form-msg error';
    msg.textContent = '✗ ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'Save changes' : 'Create event';
  }
}

async function editEvent(id) {
  try {
    const r = await fetch(`${API}/api/events/${id}`, { headers: getHeaders(false) });
    const e = await r.json();
    editingId = id;
    document.getElementById('create-title').textContent = 'Edit event';
    document.getElementById('save-btn').textContent = 'Save changes';
    document.getElementById('edit-id').value = id;
    document.getElementById('ev-name').value = e.name;
    document.getElementById('ev-cat').value = e.category;
    document.getElementById('ev-date').value = e.date;
    document.getElementById('ev-time').value = e.time;
    document.getElementById('ev-venue').value = e.venue;
    document.getElementById('ev-seats').value = e.totalSeats;
    document.getElementById('ev-price').value = e.price;
    document.getElementById('ev-status').value = e.status;
    document.getElementById('ev-desc').value = e.description;
    document.getElementById('ev-images').value = (e.imageUrls || []).join(', ');
    document.getElementById('ev-featured').checked = e.featured;
    selectedColor = e.bannerColor;
    selectedEmoji = e.imageEmoji;
    document.querySelectorAll('.cswatch').forEach(s => { s.classList.toggle('sel', s.dataset.c === e.bannerColor); });
    document.querySelectorAll('.esel').forEach(s => { s.classList.toggle('sel', s.textContent === e.imageEmoji); });
    showSection('create', document.querySelector('[data-section=create]'));
  } catch { showToast('Failed to load event'); }
}

async function deleteEvent(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    const r = await fetch(`${API}/api/events/${id}`, { method: 'DELETE', headers: authHeader() });
    if (!r.ok) throw new Error('Delete failed');
    showToast('Event deleted');
    loadEventsTable();
  } catch { showToast('Failed to delete event'); }
}

function resetForm() {
  editingId = null;
  document.getElementById('event-form').reset();
  document.getElementById('create-title').textContent = 'Create event';
  document.getElementById('save-btn').textContent = 'Create event';
  document.getElementById('edit-id').value = '';
  document.getElementById('form-msg').className = 'form-msg';
  document.getElementById('ev-images').value = '';
}

initAdmin();

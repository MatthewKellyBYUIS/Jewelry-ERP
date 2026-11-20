/* =====================================================================
   Iced-Out Cougs ERP - application core
   (sign-in, data loading, live refresh, routing, modals, barcode scanning)
   ===================================================================== */
'use strict';

let sb = null;            // Supabase client
let ME = null;            // profile {name, role, email}
let S = null;             // state snapshot from the database
let D = null;             // values derived (computed) from S
let ROUTE = 'dashboard';
const UI = { m: {} };     // screen state that survives re-renders
const PAGES = {}, AFTER = {}, ACT = {}, SCAN = {};
let modalFn = null, modalOpts = {}, staleRender = false, scanner = null, pollTimer = null, channel = null;

const RETURN_REASONS = ['Changed mind', 'Wrong size', 'Gift return', 'Not as expected', 'Defective - stone fell out', 'Defective - broken clasp', 'Tarnished / plating failure', 'Damaged in shipping'];
const ADJ_REASONS = ['Cycle count', 'Damaged', 'Theft / shrink', 'Found', 'Sample / display', 'Obsolete'];
const QUALITY_REASONS = ['Stone setting defect', 'Solder joint failure', 'Plating / finish blemish', 'Wrong component used', 'Size out of tolerance', 'Operator error'];
const EXPENSE_CATS = ['Rent', 'Payroll', 'Marketing', 'Utilities', 'Insurance', 'Software', 'Other'];

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const N = v => +v || 0;
const money = n => (N(n) < -0.004 ? '-' : '') + '$' + Math.abs(N(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n, d = 0) => N(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const qty = n => N(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (n, d = 1) => (isFinite(n) ? num(n, d) : '0') + '%';
const dFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' });
const dstr = ts => ts ? (String(ts).length === 10 ? ts : dFmt.format(new Date(ts))) : null;           // -> YYYY-MM-DD (store time zone)
const toDate = d => new Date(d + 'T00:00:00Z');
const addDays = (d, n) => new Date(toDate(d).getTime() + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 864e5);
const fdate = d => { d = dstr(d); return d ? toDate(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
const fshort = d => { d = dstr(d); return d ? toDate(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '—'; };
const ftime = ts => ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const sum = (a, f = x => x) => a.reduce((t, x) => t + N(f(x)), 0);
const groupBy = (a, f) => a.reduce((m, x) => { const k = f(x); (m[k] ??= []).push(x); return m; }, {});
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); let x = o; for (const k of ks) x = (x[k] ??= {}); x[last] = v; };
const badge = (t, tone = '') => `<span class="badge ${tone}">${esc(t)}</span>`;
const inp = (model, val, attrs = '') => `<input data-model="${model}" value="${esc(val ?? '')}" ${attrs}>`;
const sel = (model, opts, val, attrs = '') => `<select data-model="${model}" ${attrs}>${opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;
const field = (label, html) => `<label class="f"><span>${label}</span>${html}</label>`;
const tabs = (model, list, cur) => `<div class="tabs">${list.map(([k, t]) => `<a data-act="ui.set" data-k="${model}" data-v="${k}" class="${cur === k ? 'active' : ''}">${t}</a>`).join('')}</div>`;

function table(cols, rows, opt = {}) {
  if (!rows.length) return `<div class="empty">${opt.empty || 'Nothing to show yet.'}</div>`;
  return `<div class="tblwrap"><table class="t ${opt.cls || ''}"><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.cls || ''}">${c.c(r) ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>${opt.foot ? `<tfoot>${opt.foot}</tfoot>` : ''}</table></div>`;
}
function bars(data, fmt = money) {   // [{l, v}]
  const max = Math.max(1, ...data.map(x => x.v));
  const step = Math.ceil(data.length / 10);
  return `<div class="bars">${data.map(x => `<div class="b" style="height:${Math.max(0.5, x.v / max * 100)}%" title="${esc(x.l)}: ${fmt(x.v)}"></div>`).join('')}</div>
          <div class="barsx">${data.map((x, i) => `<span>${i % step === 0 ? esc(x.s ?? x.l) : ''}</span>`).join('')}</div>`;
}
function hbars(data, fmt = num) {    // [{l, v}]
  const max = Math.max(1, ...data.map(x => x.v));
  return data.map(x => `<div class="hbar"><span>${esc(x.l)}</span><div class="track"><div class="fill" style="width:${Math.max(0, x.v / max * 100)}%"></div></div><b class="num">${fmt(x.v)}</b></div>`).join('') || '<div class="empty">No data in this period.</div>';
}
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500);
}
const GEM = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="mk-s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#C3CCD8"/><stop offset="1" stop-color="#8C99AD"/></linearGradient><linearGradient id="mk-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B8CFF"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient></defs><rect width="40" height="40" rx="11" fill="#0F1E3C"/><rect x=".5" y=".5" width="39" height="39" rx="10.5" fill="none" stroke="#C3CCD8" stroke-opacity=".35"/><path d="M11 13h18l5 6.5L20 33 6 19.5z" fill="url(#mk-s)"/><path d="M15.5 13l-2.5 6.5L20 33l7-13.5L24.5 13z" fill="url(#mk-b)"/><path d="M6 19.5h28M15.5 13L20 19.5 24.5 13M13 19.5L20 33l7-13.5" fill="none" stroke="#0F1E3C" stroke-width=".9" stroke-opacity=".55"/></svg>`;
const NAV_ICON = { dashboard: 'dashboard', pos: 'pos', orders: 'orders', returns: 'returns', customers: 'customers', inventory: 'inventory', production: 'production', mrp: 'mrp',
  purchasing: 'purchasing', suppliers: 'suppliers', replenish: 'replenish', financials: 'financials', reports: 'reports', items: 'items', settings: 'settings' };
const initials = n => String(n || '?').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

/* ---------- database calls ---------- */
async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}
// run a change, tell the user, reload, and nudge other signed-in users
async function act(fn, args, okMsg) {
  try {
    const data = await rpc(fn, args);
    if (okMsg) toast(okMsg, 'ok');
    await refresh();
    try { channel?.send({ type: 'broadcast', event: 'changed', payload: {} }); } catch (e) { /* polling still covers it */ }
    return { ok: true, data };
  } catch (e) { toast(e.message, 'error'); return { ok: false }; }
}
async function refresh() {
  if (ME.role === 'staff') { S = await rpc('erp_state'); D = derive(S); }
  else { S = await rpc('portal_state'); }
  render();
}
async function checkVersion() {
  if (!ME || !S || document.hidden) return;
  try {
    const v = await rpc('erp_version');
    if (v != null && N(v) !== N(S.version)) await backgroundRefresh();
  } catch (e) { /* offline blip - try again next tick */ }
}
async function backgroundRefresh() {
  try {
    if (ME.role === 'staff') { S = await rpc('erp_state'); D = derive(S); } else { S = await rpc('portal_state'); }
    if (modalFn) staleRender = true; else render();
  } catch (e) { /* ignore */ }
}

/* ---------- rendering ---------- */
let busy = false;   // true while the page is being redrawn (a field losing focus mid-redraw must not start another redraw)
function render() {
  if (busy) return;
  busy = true; try { renderNow(); } finally { busy = false; }
}
function renderNow() {
  if (!ME) { if (sb) renderLogin(); return; }
  const a = document.activeElement, model = a?.dataset?.model, pos = (a && 'selectionStart' in a) ? (() => { try { return a.selectionStart; } catch (e) { return null; } })() : null;
  const inModal = a && $('#modal-root').contains(a);
  if (ME.role === 'staff') renderShell(); else $('#app').innerHTML = PAGES.portal();
  (ME.role === 'staff' ? AFTER[ROUTE] : AFTER.portal)?.();
  if (modalFn) renderModalNow();
  if (model) {
    const el = (inModal ? $('#modal-root') : $('#app')).querySelector(`[data-model="${model}"]`);
    if (el) { el.focus(); if (pos != null && el.setSelectionRange && /text|search|^$/.test(el.type || '')) { try { el.setSelectionRange(pos, pos); } catch (e) { /* n/a */ } } }
  }
  staleRender = false;
}
const NAV = [
  ['Overview', [['dashboard', 'Command Center']]],
  ['Sell', [['pos', 'Point of Sale'], ['orders', 'Sales Orders'], ['returns', 'Returns & Exchanges'], ['customers', 'Customers']]],
  ['Stock & Make', [['inventory', 'Inventory'], ['production', 'Production Orders'], ['mrp', 'MRP']]],
  ['Buy', [['purchasing', 'Purchase Orders'], ['suppliers', 'Suppliers & Scorecards'], ['replenish', 'Ordering Rules']]],
  ['Analyze', [['financials', 'Financial Reporting'], ['reports', 'Reports']]],
  ['Setup', [['items', 'Items, BOMs & Barcodes'], ['settings', 'Settings & About']]]
];
function renderShell() {
  if (!PAGES[ROUTE]) ROUTE = 'dashboard';
  const pills = { orders: D.openSO.length, replenish: D.lowCount, purchasing: D.latePO.length };
  $('#app').innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand">${GEM}<div>${esc(S.settings.company_name)}<small>Enterprise suite</small></div></div>
      <nav class="nav">${NAV.map(([g, links]) => `<div class="grp">${g}</div>` + links.map(([k, t]) =>
        `<a href="#${k}" class="${k === ROUTE ? 'active' : ''}" ${k === ROUTE ? 'aria-current="page"' : ''}>${icon(NAV_ICON[k])}<span class="lbl">${t}</span>${pills[k] ? `<span class="pill">${pills[k]}</span>` : ''}</a>`).join('')).join('')}</nav>
      <div class="who"><span class="avatar">${esc(initials(ME.name))}</span><div class="who-x"><b>${esc(ME.name)}</b><span class="live-row"><span class="live"></span>Live · staff</span></div><a data-act="auth.signout" class="signout" title="Sign out">${icon('signout')}<span class="lbl">Sign out</span></a></div>
    </aside>
    <main class="main" id="main">${PAGES[ROUTE]()}</main></div>`;
}
const head = (title, sub, actions = '') => `<div class="head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
function go(route) { if (location.hash !== '#' + route) location.hash = route; else { ROUTE = route; render(); } }
window.addEventListener('hashchange', () => { ROUTE = location.hash.slice(1) || 'dashboard'; if (ME?.role === 'staff' && S) { render(); window.scrollTo(0, 0); } });

/* ---------- modals ---------- */
function modal(fn, opts = {}) { modalFn = fn; modalOpts = opts; document.body.classList.add('has-modal'); renderModal(); }
function renderModal() { if (busy) return; busy = true; try { renderModalNow(); } finally { busy = false; } }
function renderModalNow() {
  if (!modalFn) return;
  const m = modalFn(); if (!m) return closeModal();
  $('#modal-root').innerHTML = `<div class="overlay" data-overlay><div class="modal ${modalOpts.size || ''}">
    <header><h2>${m.title}</h2><a data-act="modal.close" title="Close">×</a></header>
    <div class="body">${m.body}</div>${m.foot ? `<footer>${m.foot}</footer>` : ''}</div></div>`;
  modalOpts.after?.();
}
function closeModal() {
  modalFn = null; UI.scanHandler = null; $('#modal-root').innerHTML = ''; document.body.classList.remove('has-modal');
  if (staleRender) render();
}
ACT['modal.close'] = closeModal;
ACT['ui.set'] = d => { setPath(UI, d.k, d.v); render(); };
ACT['go'] = d => { closeModal(); go(d.to); };
ACT['print'] = () => window.print();
function confirmBox(title, text, yesLabel, onYes) {
  UI.confirmYes = onYes;
  modal(() => ({ title, body: `<p>${text}</p>`, foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="confirm.yes">${yesLabel}</button>` }), { size: 'narrow' });
}
ACT['confirm.yes'] = async () => { const f = UI.confirmYes; closeModal(); await f?.(); };

/* ---------- events (delegated) ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) { if (b.tagName === 'A') e.preventDefault(); if (b.disabled) return; const f = ACT[b.dataset.act]; if (f) f(b.dataset, b, e); return; }
  if (e.target.matches('[data-overlay]') && !modalOpts.sticky) closeModal();
});
function onModel(e) {
  const el = e.target.closest?.('[data-model]'); if (!el) return;
  setPath(UI, el.dataset.model, el.type === 'checkbox' ? el.checked : el.value);
  const r = el.dataset.render;
  if (busy) return;
  if (r === 'live' || (r !== undefined && e.type === 'change')) render();
}
document.addEventListener('input', onModel);
document.addEventListener('change', onModel);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (scanner) return stopScanner(); if (modalFn && !modalOpts.sticky) closeModal(); return; }
  const t = e.target;
  if (e.key === 'Enter' && t.dataset?.enter) { e.preventDefault(); if (t.dataset.model) setPath(UI, t.dataset.model, t.value); ACT[t.dataset.enter]?.(t.dataset, t, e); return; }
  // USB barcode scanners type the code quickly and press Enter. Catch that when no field is focused.
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  const now = Date.now();
  if (e.key === 'Enter') { if (wedge.buf.length >= 4) { e.preventDefault(); handleScan(wedge.buf); } wedge.buf = ''; return; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { if (now - wedge.t > 120) wedge.buf = ''; wedge.buf += e.key; wedge.t = now; }
});
const wedge = { buf: '', t: 0 };

/* ---------- barcode scanning ---------- */
function findItemByCode(code) {
  const c = String(code).trim().toUpperCase();
  return S.items?.find(i => i.barcode.toUpperCase() === c) || S.items?.find(i => i.sku.toUpperCase() === c);
}
function handleScan(code) {
  code = String(code || '').trim(); if (!code || !ME) return;
  if (ME.role !== 'staff') return;
  if (/^S-?\d{4,}$/i.test(code) && !UI.scanHandler) { UI.ret = { q: code }; go('returns'); ACT['ret.lookup'](); return; }
  const item = findItemByCode(code);
  if (!item) return toast(`No item found for barcode "${code}"`, 'error');
  beep();
  if (UI.scanHandler) return UI.scanHandler(item);
  if (SCAN[ROUTE]) return SCAN[ROUTE](item);
  ACT['inv.scanmenu']({ id: item.id });
}
function beep() {
  try { const c = beep.ctx ??= new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 1150; g.gain.value = 0.06; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.09); } catch (e) { /* silent */ }
}
ACT['scan.enter'] = (d, el) => { const v = el.value; el.value = ''; if (el.dataset.model) setPath(UI, el.dataset.model, ''); handleScan(v); };
ACT['scan.camera'] = async () => {
  if (!window.Html5Qrcode) return toast('Camera scanner library did not load', 'error');
  $('#scan-root').innerHTML = `<div class="overlay"><div class="modal narrow"><header><h2>Scan a barcode</h2><a data-act="scan.stop">×</a></header>
    <div class="body"><div id="reader"></div><p class="muted small" style="margin:8px 0 0">Hold the printed barcode steady inside the frame. The scanner stays open so you can scan several items.</p></div>
    <footer><button class="btn primary" data-act="scan.stop">Done</button></footer></div></div>`;
  try {
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new Html5Qrcode('reader', { formatsToSupport: [F.CODE_128, F.EAN_13, F.UPC_A, F.CODE_39, F.QR_CODE], verbose: false });
    let last = '', lastT = 0;
    await scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, h) => ({ width: Math.floor(w * 0.86), height: Math.floor(Math.min(h * 0.5, 170)) }) },
      text => { const now = Date.now(); if (text === last && now - lastT < 1800) return; last = text; lastT = now; handleScan(text); }, () => {});
  } catch (e) { stopScanner(); toast('Could not open the camera: ' + (e?.message || e) + '. Allow camera access, or type the code in the scan box.', 'error'); }
};
async function stopScanner() {
  const s = scanner; scanner = null;
  try { if (s) { await s.stop(); s.clear(); } } catch (e) { /* already stopped */ }
  $('#scan-root').innerHTML = '';
}
ACT['scan.stop'] = stopScanner;
const scanBar = (placeholder, model = 'scanbox') => `<div class="scanbar noprint">
  <input data-model="${model}" data-enter="scan.enter" placeholder="${placeholder}" autocomplete="off" inputmode="numeric" id="scanbox">
  <button class="btn" data-act="scan.camera">Use camera</button></div>`;
function drawBarcodes(root = document) {
  root.querySelectorAll('svg[data-barcode]').forEach(svg => {
    try { JsBarcode(svg, svg.dataset.barcode, { format: 'CODE128', width: +svg.dataset.w || 2, height: +svg.dataset.h || 46, fontSize: 13, margin: 6, displayValue: true }); } catch (e) { /* bad value */ }
  });
}

/* ---------- sign in ---------- */
function loginShowcase() {   // decorative brand panel (pure presentation)
  const pics = ['NK-ICEY', 'BR-TEN', 'RG-CHMP', 'ER-STUD'].map(sku => prodImg({ sku, name: '' }, 'show')).join('');
  return `<aside class="showcase" aria-hidden="true"><div class="facets"></div><div class="show-copy"><h2>Fine jewelry for Cougar fans</h2>
    <p>Handmade in our Provo workshop. One system runs the counter, the bench, the stockroom and the books.</p></div><div class="show-grid">${pics}</div></aside>`;
}
function renderLogin(msg = '', kind = '') {
  const u = UI.login ??= { tab: 'in', role: 'customer' };
  $('#app').innerHTML = `<div class="login">${loginShowcase()}<div class="box">
    <div class="brand">${GEM}<div>Iced-Out Cougs<small>ERP &amp; customer portal</small></div></div>
    ${tabs('login.tab', [['in', 'Sign in'], ['up', 'Create account']], u.tab)}
    ${msg ? `<div class="note ${kind}">${esc(msg)}</div>` : ''}
    ${u.tab === 'up' ? field('Your name', inp('login.name', u.name, 'autocomplete="name"')) : ''}
    ${field('Email', inp('login.email', u.email, 'type="email" autocomplete="username"'))}
    ${field('Password', inp('login.pw', u.pw, `type="password" data-enter="${u.tab === 'up' ? 'auth.signup' : 'auth.signin'}" autocomplete="${u.tab === 'up' ? 'new-password' : 'current-password'}"`))}
    ${u.tab === 'up' ? field('Account type', sel('login.role', [['customer', 'Customer - shop and order for pickup'], ['staff', 'Staff - full ERP access']], u.role, 'data-render')) +
      (u.role === 'staff' ? field('Staff access code', inp('login.code', u.code, 'autocomplete="off"')) : '') : ''}
    <button class="btn primary big" data-act="${u.tab === 'up' ? 'auth.signup' : 'auth.signin'}">${u.tab === 'up' ? 'Create account' : 'Sign in'}</button>
    <p class="muted small center" style="margin:14px 0 0">Staff manage the business. Customers see live inventory and place pickup orders.</p>
  </div></div>`;
}
ACT['auth.signin'] = async () => {
  const u = UI.login;
  if (!u.email || !u.pw) return renderLogin('Enter your email and password.', 'warn');
  const { error } = await sb.auth.signInWithPassword({ email: u.email.trim(), password: u.pw });
  if (error) return renderLogin(error.message, 'bad');
  await enter();
};
ACT['auth.signup'] = async () => {
  const u = UI.login;
  if (!u.name || !u.email || !u.pw) return renderLogin('Name, email and password are required.', 'warn');
  if (u.pw.length < 6) return renderLogin('Use a password with at least 6 characters.', 'warn');
  if (u.role === 'staff' && !u.code) return renderLogin('Enter the staff access code.', 'warn');
  const { data, error } = await sb.auth.signUp({ email: u.email.trim(), password: u.pw, options: { data: { name: u.name, role: u.role, code: u.code || '' } } });
  if (error) return renderLogin(error.message, 'bad');
  if (!data.session) { u.tab = 'in'; return renderLogin('Account created. Check your email for a confirmation link, then sign in.', 'ok'); }
  await enter();
};
ACT['auth.signout'] = async () => { clearInterval(pollTimer); try { channel?.unsubscribe(); } catch (e) { /* fine */ } await sb.auth.signOut(); ME = null; S = null; closeModal(); UI.login = { tab: 'in', role: 'customer' }; renderLogin(); };

async function enter() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  try {
    let p = await rpc('my_profile');
    if (!p) { const md = session.user.user_metadata || {}; p = await rpc('ensure_profile', { p_name: md.name || '', p_role: md.role || 'customer', p_code: md.code || '' }); }
    ME = p;
  } catch (e) { await sb.auth.signOut(); return renderLogin(e.message, 'bad'); }
  ROUTE = location.hash.slice(1) || 'dashboard';
  try { await refresh(); } catch (e) { $('#app').innerHTML = `<div class="boot">Could not load data: ${esc(e.message)}<br><br><a data-act="auth.signout">Sign out</a></div>`; return; }
  // live updates: instant broadcast between signed-in users, plus a version check as a safety net
  try { channel = sb.channel('erp-sync'); channel.on('broadcast', { event: 'changed' }, () => backgroundRefresh()).subscribe(); } catch (e) { /* polling only */ }
  clearInterval(pollTimer); pollTimer = setInterval(checkVersion, 6000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
}

async function boot() {
  const cfg = window.ERP_CONFIG || {};
  if (window.__ERP_TEST_CLIENT__) sb = window.__ERP_TEST_CLIENT__;
  else if (cfg.url && cfg.key && !/YOUR-PROJECT/.test(cfg.url)) sb = window.supabase.createClient(cfg.url, cfg.key);
  if (!sb) {
    $('#app').innerHTML = `<div class="login">${loginShowcase()}<div class="box"><div class="brand">${GEM}<div>Iced-Out Cougs<small>Setup needed</small></div></div>
      <p>The app is not connected to a database yet.</p><p>Open <b>js/config.js</b> and paste in your Supabase <b>Project URL</b> and <b>anon public key</b>
      (Supabase → Project Settings → API). Then reload this page.</p><p class="muted small">See README.md for the full setup steps.</p></div></div>`;
    return;
  }
  await enter();
}

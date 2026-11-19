/* =====================================================================
   Calculations. Nothing here is typed in by hand: every figure is
   computed from the transactions and settings stored in the database.
   ===================================================================== */
'use strict';

// inverse of the standard normal distribution (service level -> z)
function invNorm(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const poValue = p => sum(p.lines, l => N(l.qty_ordered) * N(l.unit_cost));
const poRecValue = p => sum(p.lines, l => N(l.qty_received) * N(l.unit_cost));
const soValue = o => sum(o.lines, l => N(l.qty) * N(l.unit_price));

function derive(S) {
  const D = { today: S.today };
  const idx = a => Object.fromEntries(a.map(x => [x.id, x]));
  D.item = idx(S.items); D.loc = idx(S.locations); D.sup = idx(S.suppliers); D.cust = idx(S.customers);
  D.inv = {}; for (const [i, l, q] of S.inventory) (D.inv[i] ??= {})[l] = N(q);
  D.qtyAt = (i, l) => D.inv[i]?.[l] || 0;
  D.onHand = i => sum(Object.values(D.inv[i] || {}));
  D.bomOf = {}; D.usedIn = {};
  for (const b of S.bom) { (D.bomOf[b.parent_id] ??= []).push(b); (D.usedIn[b.component_id] ??= []).push(b); }
  D.isParent = i => !!D.bomOf[i];
  D.canBuild = (i, loc, q) => D.isParent(i) && D.bomOf[i].every(b => D.qtyAt(b.component_id, +loc) >= N(b.qty) * q);
  D.rollup = i => sum(D.bomOf[i] || [], b => N(b.qty) * N(D.item[b.component_id]?.cost));

  // ----- open documents -----
  D.onOrder = {}; D.latePO = [];
  for (const p of S.purchase_orders) if (p.status === 'Order Sent') {
    for (const l of p.lines) D.onOrder[l.item_id] = (D.onOrder[l.item_id] || 0) + Math.max(0, N(l.qty_ordered) - N(l.qty_received));
    if (p.expected_date < S.today) D.latePO.push(p);
  }
  D.wip = {}; D.wipValue = 0;
  for (const w of S.production_orders) {
    if (w.status === 'Planned' || w.status === 'In Process') D.wip[w.item_id] = (D.wip[w.item_id] || 0) + N(w.qty_planned);
    if (w.status === 'In Process') D.wipValue += N(w.component_cost);
  }
  D.openSO = S.sales_orders.filter(o => o.status === 'Order Placed');
  D.soDem = {}; D.soDemLoc = {}; D.lineShort = {};
  const avail = {};
  for (const o of [...D.openSO].sort((a, b) => a.required_date < b.required_date ? -1 : a.required_date > b.required_date ? 1 : a.id - b.id)) for (const l of o.lines) {
    const k = l.item_id + ':' + o.location_id, q = N(l.qty);
    D.soDem[l.item_id] = (D.soDem[l.item_id] || 0) + q; D.soDemLoc[k] = (D.soDemLoc[k] || 0) + q;
    avail[k] ??= D.qtyAt(l.item_id, o.location_id);
    D.lineShort[l.id] = Math.max(0, q - Math.max(0, avail[k])); avail[k] -= q;       // first-come allocation by required date
  }
  D.backorder = i => S.locations.reduce((t, l) => t + Math.max(0, (D.soDemLoc[i + ':' + l.id] || 0) - D.qtyAt(i, l.id)), 0);

  // ----- sales history and usage (parent sales are exploded through the BOM) -----
  D.sales = S.sales_daily.map(([d, i, q, g, x, c]) => ({ d, i, q: N(q), g: N(g), x: N(x), c: N(c) }));
  D.histStart = D.sales.length ? D.sales[0].d : S.today;
  const use = {}; const add = (i, d, q) => { const m = (use[i] ??= {}); m[d] = (m[d] || 0) + q; };
  for (const r of D.sales) { add(r.i, r.d, r.q); for (const b of D.bomOf[r.i] || []) add(b.component_id, r.d, r.q * N(b.qty)); }
  D.use = use;
  const W = Math.max(1, Math.min(182, diffDays(S.today, D.histStart)));
  D.window = W; const from = addDays(S.today, -W);
  const st = S.settings, Sc = N(st.ordering_cost), hp = N(st.holding_cost_pct), P = N(st.review_period_days);
  const z = invNorm(Math.min(0.999, Math.max(0.5, N(st.service_level_pct) / 100)));
  D.z = z; D.stat = {};
  for (const it of S.items) {
    const m = use[it.id] || {}; let tot = 0, sq = 0;
    for (const d in m) if (d >= from && d < S.today) { tot += m[d]; sq += m[d] * m[d]; }
    const dbar = tot / W, sigma = W > 1 ? Math.sqrt(Math.max(0, (sq - W * dbar * dbar) / (W - 1))) : 0;
    const L = N(it.lead_time_days), ss = z * sigma * Math.sqrt(L), annual = dbar * 365, H = hp / 100 * N(it.cost);
    const eoq = annual > 0 && H > 0 ? Math.sqrt(2 * annual * Sc / H) : 0;
    const lot = it.lot_policy === 'FOQ' ? Math.max(1, N(it.lot_qty)) : 1;
    const eoqLot = eoq > 0 ? Math.max(lot, Math.round(eoq / lot) * lot) : 0;
    const onHand = D.onHand(it.id), incoming = (D.onOrder[it.id] || 0) + (D.wip[it.id] || 0), position = onHand + incoming;
    const cover = dbar > 0 ? onHand / dbar : Infinity;
    const runout = isFinite(cover) ? addDays(S.today, Math.floor(cover)) : null;
    let orderBy = runout ? addDays(runout, -L) : null; if (orderBy && orderBy < S.today) orderBy = S.today;
    D.stat[it.id] = {
      d: dbar, sigma, L, ss, ltDemand: dbar * L, ropCalc: Math.ceil(dbar * L + ss), annual, H, eoq, eoqLot, lot,
      ordersPerYear: eoq > 0 ? annual / eoq : 0, orderCostYr: eoq > 0 ? annual / eoq * Sc : 0, holdCostYr: eoq / 2 * H,
      target: Math.ceil(dbar * (P + L) + z * sigma * Math.sqrt(P + L)), onHand, incoming, position, cover, runout, orderBy,
      low: it.active && N(it.reorder_point) > 0 && position <= N(it.reorder_point), out: onHand <= 0,
      usageValue: annual * N(it.cost)
    };
  }
  // ABC classification by annual usage value (A = top 80% of value, B = next 15%, C = rest)
  const ranked = S.items.filter(i => D.stat[i.id].usageValue > 0).sort((a, b) => D.stat[b.id].usageValue - D.stat[a.id].usageValue);
  const totalUV = sum(ranked, i => D.stat[i.id].usageValue); let cum = 0;
  for (const i of S.items) D.stat[i.id].abc = 'C';
  for (const i of ranked) { D.stat[i.id].abc = cum / totalUV < 0.8 ? 'A' : cum / totalUV < 0.95 ? 'B' : 'C'; cum += D.stat[i.id].usageValue; }
  D.lowItems = S.items.filter(i => D.stat[i.id].low);
  D.lowCount = D.lowItems.length;

  // ----- supplier scorecards (from purchase-order history) -----
  D.score = {};
  for (const s of S.suppliers) {
    const pos = S.purchase_orders.filter(p => p.supplier_id === s.id);
    const done = pos.filter(p => (p.status === 'Received' || p.status === 'Closed') && p.received_date && p.sent_at);
    const lts = done.map(p => diffDays(p.received_date, dstr(p.sent_at)));
    const onTime = done.filter(p => p.received_date <= p.expected_date).length;
    const ord = sum(done, p => sum(p.lines, l => l.qty_ordered)), rec = sum(done, p => sum(p.lines, l => l.qty_received));
    const unpaid = pos.filter(p => !p.paid_at && p.first_receipt_date);
    const avgLT = lts.length ? sum(lts) / lts.length : null;
    const sc = {
      n: done.length, open: pos.filter(p => p.status === 'Order Sent').length, lateOpen: pos.filter(p => p.status === 'Order Sent' && p.expected_date < S.today).length,
      onTimePct: done.length ? onTime / done.length * 100 : null, avgLT, quoted: N(s.lead_time_days),
      fillPct: ord > 0 ? rec / ord * 100 : null, spend: sum(pos, poRecValue),
      owed: sum(unpaid, poRecValue), overdue: sum(unpaid.filter(p => p.due_date < S.today), poRecValue),
      nextDue: unpaid.map(p => p.due_date).sort()[0] || null, unpaid
    };
    if (sc.n) {
      const ltAdh = Math.min(1, sc.quoted / Math.max(sc.avgLT, 0.5)) * 100;
      sc.ltAdh = ltAdh; sc.rating = Math.round(0.45 * sc.onTimePct + 0.30 * sc.fillPct + 0.25 * ltAdh);
      sc.verdict = sc.rating >= 88 ? 'Keep' : sc.rating >= 75 ? 'Watch' : 'Replace';
    } else { sc.rating = null; sc.verdict = 'New'; }
    D.score[s.id] = sc;
  }
  return D;
}

/* ---------- Material Requirements Planning ---------- */
function mrp(nWeeks, surgePct = 0, method = UI.mrp?.method || 'direct') {
  const direct = method === 'direct';   // direct = assignment method: every confirmed parent order is exploded through the BOM
  const wk = d => Math.max(1, Math.floor(diffDays(d, S.today) / 7) + 1);
  const weeks = Array.from({ length: nWeeks }, (_, i) => ({ n: i + 1, start: addDays(S.today, i * 7), end: addDays(S.today, i * 7 + 6) }));
  const zero = () => Array(nWeeks + 1).fill(0);
  const recs = {}, order = [], planned = [];
  const make = (id, level) => recs[id] ??= (order.push(id), { item: D.item[id], level, gross: zero(), sched: zero(), poh: zero(), net: zero(), por: zero(), rel: zero(), lateRel: 0, src: [] });
  let beyond = 0;
  // independent demand: confirmed (open) sales orders
  for (const o of D.openSO) for (const l of o.lines) {
    const w = wk(o.required_date); if (w > nWeeks) { beyond++; continue; }
    const r = make(l.item_id, D.isParent(l.item_id) ? 0 : 1);
    const q = Math.ceil(N(l.qty) * (1 + surgePct / 100));
    r.gross[w] += q; r.src.push(`${o.number}: ${qty(q)} due ${fshort(o.required_date)}`);
  }
  // open production orders are scheduled receipts for the parent; un-issued ones still need their components
  const needNow = {};
  if (!direct) for (const w of S.production_orders) if (w.status === 'Planned' || w.status === 'In Process') {
    const b = Math.min(nWeeks, wk(w.due_date)); const r = make(w.item_id, 0); r.sched[b] += N(w.qty_planned);
    if (w.status === 'Planned') for (const c of D.bomOf[w.item_id] || []) { (needNow[c.component_id] ??= { q: 0, src: [] }).q += N(w.qty_planned) * N(c.qty); needNow[c.component_id].src.push(`${w.number} (planned, not yet issued)`); }
  }
  const calc = r => {
    const it = r.item, LT = N(it.lead_time_days), ltW = Math.ceil(LT / 7), lot = direct && r.level === 0 ? 1 : it.lot_policy === 'FOQ' ? Math.max(1, N(it.lot_qty)) : 1;   // assignment method builds exactly what was ordered
    r.ltW = ltW; r.lot = lot; r.poh[0] = direct && r.level === 0 ? 0 : D.onHand(it.id);
    for (let t = 1; t <= nWeeks; t++) {
      const av = r.poh[t - 1] + r.sched[t]; const net = Math.max(0, r.gross[t] - av);
      const por = net > 0 ? Math.ceil(net / lot) * lot : 0;
      r.net[t] = net; r.por[t] = por; r.poh[t] = av + por - r.gross[t];
      if (por > 0) {
        const need = weeks[t - 1].start, by = addDays(need, -LT), late = by < S.today;
        const rt = Math.max(1, t - ltW); r.rel[rt] += por; if (t - ltW < 1) r.lateRel += por;
        planned.push({ item: it, qty: por, need, by, late, week: t, make: D.isParent(it.id) });
      }
    }
  };
  const parents = order.filter(id => recs[id].level === 0); parents.forEach(id => calc(recs[id]));
  // dependent demand: planned parent builds x BOM quantity per unit
  for (const id of parents) { const r = recs[id]; for (let t = 1; t <= nWeeks; t++) if (r.rel[t] > 0) for (const c of D.bomOf[id] || []) {
    const cr = make(c.component_id, 1); cr.gross[t] += r.rel[t] * N(c.qty); cr.src.push(`${qty(r.rel[t])} × ${r.item.name} in wk ${t} × ${qty(c.qty)} per unit`); } }
  for (const id in needNow) { const cr = make(+id, 1); cr.gross[1] += needNow[id].q; cr.src.push(...needNow[id].src); }
  const comps = order.filter(id => recs[id].level === 1);
  for (const p of S.purchase_orders) if (p.status === 'Order Sent') for (const l of p.lines) {
    const r = recs[l.item_id]; const out = N(l.qty_ordered) - N(l.qty_received);
    if (r && r.level === 1 && out > 0) { const b = wk(p.expected_date); if (b <= nWeeks) r.sched[b] += out; }
  }
  comps.sort((a, b) => D.item[a].sku < D.item[b].sku ? -1 : 1).forEach(id => calc(recs[id]));
  return { weeks, parents: parents.map(id => recs[id]), comps: comps.map(id => recs[id]), planned, beyond, direct };
}

/* ---------- finance ---------- */
function pnl(from, to) {
  const inR = d => d >= from && d <= to;
  const r = { gross: 0, disc: 0, cogsSold: 0, units: 0, returns: 0, retCogs: 0, taxes: 0, txns: 0, loss: { adjustment: 0, return_writeoff: 0, scrap_loss: 0 }, exp: {} };
  for (const x of D.sales) if (inR(x.d)) { r.gross += x.g; r.disc += x.x; r.cogsSold += x.c; r.units += x.q; }
  for (const [d, , n, , , tax] of S.sales_loc_daily) if (inR(d)) { r.taxes += N(tax); r.txns += N(n); }
  for (const [d, sub, cg, tax] of S.returns_daily) if (inR(d)) { r.returns += N(sub); r.retCogs += N(cg); r.taxes -= N(tax); }
  for (const [d, type, , amt] of S.loss_daily) if (inR(d)) r.loss[type] = (r.loss[type] || 0) - N(amt);
  for (const e of S.expenses) if (inR(e.d)) r.exp[e.category] = (r.exp[e.category] || 0) + N(e.amount);
  r.net = r.gross - r.disc - r.returns; r.cogs = r.cogsSold - r.retCogs; r.gp = r.net - r.cogs;
  r.invLoss = sum(Object.values(r.loss)); r.opex = sum(Object.values(r.exp)); r.op = r.gp - r.invLoss - r.opex;
  r.gm = r.net ? r.gp / r.net * 100 : 0;
  return r;
}
function valuation() {
  const rows = S.items.map(i => ({ item: i, qty: D.onHand(i.id), value: D.onHand(i.id) * N(i.cost) })).filter(r => r.qty !== 0);
  const total = sum(rows, r => r.value);
  const byLoc = S.locations.map(l => ({ loc: l, value: sum(S.items, i => D.qtyAt(i.id, l.id) * N(i.cost)), units: sum(S.items, i => D.qtyAt(i.id, l.id)) }));
  const byCat = Object.entries(groupBy(rows, r => r.item.category)).map(([cat, rs]) => ({ cat, value: sum(rs, r => r.value), n: rs.length })).sort((a, b) => b.value - a.value);
  return { rows: rows.sort((a, b) => b.value - a.value), total, byLoc, byCat, wip: D.wipValue };
}
// inventory value at the end of each day, rebuilt backwards from today's value using the stock ledger
function valueSeries(from, to) {
  const delta = {}; for (const [d, amt] of S.value_daily) delta[d] = N(amt);
  let v = valuation().total; const out = [];
  for (let d = S.today; d >= from; d = addDays(d, -1)) { if (d <= to) out.push({ d, v }); v -= delta[d] || 0; }
  return out.reverse();
}
function turnover(from, to) {
  const p = pnl(from, to), days = diffDays(to, from) + 1, series = valueSeries(from, to);
  const avg = series.length ? sum(series, x => x.v) / series.length : 0;
  const annualCogs = p.cogs * 365 / days, turns = avg > 0 ? annualCogs / avg : 0;
  return { cogs: p.cogs, days, avg, annualCogs, turns, dsi: turns > 0 ? 365 / turns : 0, series, start: series[0]?.v || 0, end: series[series.length - 1]?.v || 0 };
}
function rangeOf(key) {
  const t = S.today, first = D.histStart;
  if (key === 'mtd') return [t.slice(0, 8) + '01', t];
  if (key === '30') return [addDays(t, -29), t];
  if (key === '90') return [addDays(t, -89), t];
  if (key === 'all') return [first, t];
  return [addDays(t, -181) < first ? first : addDays(t, -181), t];   // '180'
}
const RANGES = [['mtd', 'Month to date'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 6 months'], ['all', 'All history'], ['custom', 'Custom…']];
function pickRange(u) {       // u = {range, from, to}
  u.range ??= '180';
  if (u.range === 'custom') { u.from ||= addDays(S.today, -29); u.to ||= S.today; return [u.from, u.to]; }
  return rangeOf(u.range);
}
const rangeCtl = (model, u) => sel(model + '.range', RANGES, u.range, 'data-render') +
  (u.range === 'custom' ? ` ${inp(model + '.from', u.from, 'type="date" data-render')} to ${inp(model + '.to', u.to, 'type="date" data-render')}` : '');

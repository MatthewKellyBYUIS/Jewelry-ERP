/* =====================================================================
   Screens: Financial Reporting, Reports, Items / BOMs / Barcodes,
   Settings & About
   ===================================================================== */
'use strict';

/* ---------------- Financial Reporting ---------------- */
function monthsIn(from, to) {
  const out = []; let d = from.slice(0, 8) + '01';
  while (d <= to) { const next = addDays(d, 32).slice(0, 8) + '01', end = addDays(next, -1);
    out.push({ label: toDate(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: '2-digit' }), from: d < from ? from : d, to: end > to ? to : end }); d = next; }
  return out;
}
PAGES.financials = () => {
  const u = UI.fin ??= { tab: 'pnl', r: { range: '180' } }; const [from, to] = pickRange(u.r); let body;
  if (u.tab === 'pnl') {
    const cols = [...monthsIn(from, to).map(m => ({ label: m.label, p: pnl(m.from, m.to) })), { label: 'Total', p: pnl(from, to), total: true }];
    const cats = [...new Set(S.expenses.filter(e => e.d >= from && e.d <= to).map(e => e.category))].sort();
    const line = (label, f, o = {}) => `<tr class="${o.total ? 'total' : ''}"><td class="${o.sub ? 'sub' : ''}">${label}</td>${cols.map(c => { const v = f(c.p); return `<td class="num ${c.total ? 'bold' : ''}">${o.pct ? pct(v) : o.plain ? num(v) : (o.neg && v ? '(' + money(v) + ')' : `<span class="${v < -0.004 ? 'neg' : ''}">${money(v)}</span>`)}</td>`; }).join('')}</tr>`;
    const T = cols[cols.length - 1].p;
    body = `<div class="kpis"><div class="kpi"><div class="l">Net revenue</div><div class="v">${money(T.net)}</div><div class="s">${num(T.units)} units · ${num(T.txns)} sales</div></div>
        <div class="kpi"><div class="l">Gross profit</div><div class="v">${money(T.gp)}</div><div class="s">${pct(T.gm)} gross margin</div></div>
        <div class="kpi"><div class="l">Operating expenses</div><div class="v">${money(T.opex)}</div><div class="s">plus ${money(T.invLoss)} inventory losses</div></div>
        <div class="kpi"><div class="l">Net operating income</div><div class="v ${T.op < 0 ? 'neg' : ''}">${money(T.op)}</div><div class="s">${pct(T.net ? T.op / T.net * 100 : 0)} of net revenue</div></div></div>
      <div class="card flush"><div class="tblwrap"><table class="t"><thead><tr><th>Profit &amp; Loss · ${fdate(from)} to ${fdate(to)}</th>${cols.map(c => `<th class="num">${c.label}</th>`).join('')}</tr></thead><tbody>
        ${line('Gross sales', p => p.gross)}${line('Less: discounts', p => p.disc, { sub: true, neg: true })}${line('Less: returns and refunds', p => p.returns, { sub: true, neg: true })}
        ${line('Net revenue', p => p.net, { total: true })}
        ${line('Cost of goods sold', p => p.cogsSold)}${line('Less: cost of returns put back in stock or written off', p => p.retCogs, { sub: true, neg: true })}
        ${line('Net cost of goods sold', p => p.cogs, { total: true })}${line('Gross profit', p => p.gp, { total: true })}${line('Gross margin %', p => p.gm, { sub: true, pct: true })}
        ${line('Inventory adjustments (cycle count, damage, shrink)', p => p.loss.adjustment, { sub: true })}${line('Quality write-offs on returns', p => p.loss.return_writeoff, { sub: true })}${line('Production orders fully scrapped', p => p.loss.scrap_loss, { sub: true })}
        ${line('Total inventory losses', p => p.invLoss, { total: true })}
        ${cats.map(c => line(esc(c), p => p.exp[c] || 0, { sub: true })).join('')}${line('Total operating expenses', p => p.opex, { total: true })}
        ${line('Net operating income', p => p.op, { total: true })}
        ${line('Memo: sales tax collected (owed to the state, not revenue)', p => p.taxes, { sub: true })}${line('Memo: units sold', p => p.units, { sub: true, plain: true })}</tbody></table></div></div>
      <p class="muted small">Revenue and cost of goods sold are recorded by every completed sale at the item’s weighted average cost at that moment. Returns reverse both. This statement recalculates whenever a sale, return, adjustment or expense is posted anywhere in the system.</p>`;
  } else if (u.tab === 'val') {
    const v = valuation();
    body = `<div class="kpis"><div class="kpi"><div class="l">Inventory on hand</div><div class="v">${money(v.total)}</div><div class="s">quantity × weighted average cost</div></div>
        <div class="kpi"><div class="l">Work in process</div><div class="v">${money(v.wip)}</div><div class="s">components issued to open production orders</div></div>
        ${v.byLoc.map(l => `<div class="kpi"><div class="l">${esc(l.loc.name)}</div><div class="v">${money(l.value)}</div><div class="s">${pct(v.total ? l.value / v.total * 100 : 0)} of total</div></div>`).join('')}</div>
      <div class="grid g23"><div class="card flush"><h2>Valuation by item (weighted average cost)</h2>${table([{ h: 'Item', c: r => itemCell(r.item, esc(r.item.name)) }, { h: 'Type', c: r => kindLabel(r.item) }, { h: 'Category', c: r => esc(r.item.category) },
          ...S.locations.map(l => ({ h: esc(l.code), cls: 'num', c: r => qty(D.qtyAt(r.item.id, l.id)) })), { h: 'On hand', cls: 'num', c: r => qty(r.qty) }, { h: 'Avg cost', cls: 'num', c: r => '$' + num(r.item.cost, 4) },
          { h: 'Value', cls: 'num', c: r => `<b>${money(r.value)}</b>` }, { h: '% of total', cls: 'num', c: r => pct(v.total ? r.value / v.total * 100 : 0) }], v.rows,
          { foot: `<tr><td colspan="${6 + S.locations.length}">Total inventory value</td><td class="num">${money(v.total)}</td><td class="num">100%</td></tr>` })}</div>
        <div class="card"><h2>Value by category</h2>${hbars(v.byCat.map(c => ({ l: c.cat, v: c.value })), money)}
          <p class="muted small" style="margin-top:14px">Weighted average cost is recalculated on every purchase receipt and production completion: (stock on hand × current average + quantity received × receipt cost) ÷ new quantity. Finished items are costed from the components actually issued.</p></div></div>`;
  } else {
    const t = turnover(from, to), step = Math.max(1, Math.ceil(t.series.length / 60));
    const rows = S.items.filter(i => D.onHand(i.id) > 0 || D.stat[i.id].d > 0).map(i => ({ i, turns: D.onHand(i.id) > 0 ? D.stat[i.id].d * 365 / D.onHand(i.id) : null, cover: D.stat[i.id].cover })).sort((a, b) => (a.turns ?? 1e9) - (b.turns ?? 1e9));
    body = `<div class="kpis"><div class="kpi"><div class="l">Inventory turnover</div><div class="v">${num(t.turns, 2)}×</div><div class="s">annualized COGS ÷ average inventory</div></div>
        <div class="kpi"><div class="l">Days of inventory</div><div class="v">${num(t.dsi)}</div><div class="s">365 ÷ turnover</div></div>
        <div class="kpi"><div class="l">COGS in period</div><div class="v">${money(t.cogs)}</div><div class="s">${t.days} days → ${money(t.annualCogs)} / yr</div></div>
        <div class="kpi"><div class="l">Average inventory</div><div class="v">${money(t.avg)}</div><div class="s">start ${money(t.start)} · now ${money(t.end)}</div></div></div>
      <div class="card"><h2>Inventory value by day (rebuilt from the stock ledger)</h2>${bars(t.series.filter((_, i) => i % step === 0).map(x => ({ l: fshort(x.d), v: x.v })))}</div>
      <div class="card flush"><h2>Turnover by item (slowest first)</h2>${table([{ h: 'Item', c: r => esc(r.i.name) }, { h: 'Type', c: r => kindLabel(r.i) }, { h: 'On hand', cls: 'num', c: r => qty(D.onHand(r.i.id)) }, { h: 'Value', cls: 'num', c: r => money(D.onHand(r.i.id) * N(r.i.cost)) },
        { h: 'Avg daily usage', cls: 'num', c: r => num(D.stat[r.i.id].d, 2) }, { h: 'Annual turns', cls: 'num', c: r => r.turns == null ? '—' : num(r.turns, 1) + '×' }, { h: 'Days of supply', cls: 'num', c: r => isFinite(r.cover) ? num(r.cover) : 'no usage' }], rows)}</div>
      <p class="muted small">Turnover = cost of goods sold for the period, annualized, divided by the average daily inventory value over the same period. Item turns use average daily usage (sales exploded through the bill of material) × 365 ÷ quantity on hand.</p>`;
  }
  return head('Financial Reporting', 'Profit &amp; loss, inventory valuation and inventory turnover. These update live as sales, receipts, production, returns and adjustments are posted elsewhere in the system.',
      `<button class="btn" data-act="fin.expense">Record an expense</button>`) + tabs('fin.tab', [['pnl', 'Profit & Loss'], ['val', 'Inventory valuation'], ['turn', 'Inventory turnover']], u.tab) +
    (u.tab !== 'val' ? `<div class="filters">${rangeCtl('fin.r', u.r)}</div>` : '') + body;
};
ACT['fin.expense'] = () => editRecord('Record an operating expense', [{ k: 'd', label: 'Date', type: 'date' }, { k: 'category', label: 'Category', opts: EXPENSE_CATS }, { k: 'amount', label: 'Amount ($)', type: 'number', attrs: 'min="0" step="0.01"' }, { k: 'note', label: 'Note', wide: true }],
  { d: S.today, category: 'Other' }, rec => act('expense_add', { p_date: rec.d, p_category: rec.category, p_amount: N(rec.amount), p_note: rec.note || null }, 'Expense recorded'));

/* ---------------- Reports ---------------- */
const weekStart = d => addDays(d, -((toDate(d).getUTCDay() + 6) % 7));
PAGES.reports = () => {
  const u = UI.rpt ??= { tab: 'sales', by: 'week', r: { range: '90' } }; const [from, to] = pickRange(u.r); let body;
  const inR = d => d >= from && d <= to;
  if (u.tab === 'sales') {
    const key = d => u.by === 'day' ? d : weekStart(d), g = {};
    const get = k => g[k] ??= { k, n: 0, units: 0, gross: 0, disc: 0, cogs: 0 };
    for (const r of D.sales) if (inR(r.d)) { const x = get(key(r.d)); x.units += r.q; x.gross += r.g; x.disc += r.x; x.cogs += r.c; }
    for (const [d, , n] of S.sales_loc_daily) if (inR(d)) get(key(d)).n += N(n);
    const rows = Object.values(g).sort((a, b) => a.k < b.k ? -1 : 1), tot = rows.reduce((t, r) => ({ n: t.n + r.n, units: t.units + r.units, gross: t.gross + r.gross, disc: t.disc + r.disc, cogs: t.cogs + r.cogs }), { n: 0, units: 0, gross: 0, disc: 0, cogs: 0 });
    const byLoc = S.locations.map(l => ({ l, n: 0, net: 0 })); for (const [d, loc, n, sub, disc] of S.sales_loc_daily) if (inR(d)) { const x = byLoc.find(b => b.l.id === loc); x.n += N(n); x.net += N(sub) - N(disc); }
    body = `<div class="card"><h2>Net sales by ${u.by}</h2>${bars(rows.map(r => ({ l: (u.by === 'week' ? 'Week of ' : '') + fshort(r.k), s: fshort(r.k), v: r.gross - r.disc })))}</div>
      <div class="grid g23"><div class="card flush">${table([{ h: u.by === 'day' ? 'Day' : 'Week starting', c: r => (u.by === 'day' ? toDate(r.k).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' }) + ' ' : '') + fdate(r.k) }, { h: 'Sales', cls: 'num', c: r => num(r.n) }, { h: 'Units', cls: 'num', c: r => num(r.units) },
          { h: 'Gross sales', cls: 'num', c: r => money(r.gross) }, { h: 'Discounts', cls: 'num', c: r => money(r.disc) }, { h: 'Net sales', cls: 'num', c: r => `<b>${money(r.gross - r.disc)}</b>` }, { h: 'COGS', cls: 'num', c: r => money(r.cogs) },
          { h: 'Gross profit', cls: 'num', c: r => money(r.gross - r.disc - r.cogs) }, { h: 'Margin', cls: 'num', c: r => pct(r.gross - r.disc ? (r.gross - r.disc - r.cogs) / (r.gross - r.disc) * 100 : 0) }], [...rows].reverse(),
          { foot: `<tr><td>Total</td><td class="num">${num(tot.n)}</td><td class="num">${num(tot.units)}</td><td class="num">${money(tot.gross)}</td><td class="num">${money(tot.disc)}</td><td class="num">${money(tot.gross - tot.disc)}</td><td class="num">${money(tot.cogs)}</td><td class="num">${money(tot.gross - tot.disc - tot.cogs)}</td><td class="num">${pct(tot.gross - tot.disc ? (tot.gross - tot.disc - tot.cogs) / (tot.gross - tot.disc) * 100 : 0)}</td></tr>` })}</div>
        <div class="card"><h2>Net sales by location</h2>${hbars(byLoc.map(b => ({ l: b.l.name, v: b.net })), money)}<p class="muted small">${byLoc.map(b => `${esc(b.l.code)}: ${num(b.n)} sales`).join(' · ')}. Before returns.</p></div></div>`;
  } else if (u.tab === 'top') {
    const g = {}; for (const r of D.sales) if (inR(r.d)) { const x = g[r.i] ??= { i: D.item[r.i], units: 0, net: 0, cogs: 0 }; x.units += r.q; x.net += r.g - r.x; x.cogs += r.c; }
    const rows = Object.values(g).sort((a, b) => b.units - a.units), tot = sum(rows, r => r.net);
    body = `<div class="grid g23"><div class="card flush">${table([{ h: '#', c: r => rows.indexOf(r) + 1 }, { h: 'Item', c: r => itemCell(r.i, `<b>${esc(r.i.name)}</b>`) }, { h: 'Units sold', cls: 'num', c: r => num(r.units) }, { h: 'Net revenue', cls: 'num', c: r => money(r.net) },
          { h: 'COGS', cls: 'num', c: r => money(r.cogs) }, { h: 'Gross profit', cls: 'num', c: r => money(r.net - r.cogs) }, { h: 'Margin', cls: 'num', c: r => pct(r.net ? (r.net - r.cogs) / r.net * 100 : 0) }, { h: 'Share of revenue', cls: 'num', c: r => pct(tot ? r.net / tot * 100 : 0) }], rows)}</div>
        <div class="card"><h2>Units sold</h2>${hbars(rows.slice(0, 11).map(r => ({ l: r.i.name, v: r.units })))}</div></div>`;
  } else if (u.tab === 'low') {
    const rows = S.items.filter(i => i.active && (D.stat[i.id].low || D.stat[i.id].out)).sort((a, b) => D.stat[a.id].cover - D.stat[b.id].cover);
    body = `<div class="card flush">${table([{ h: 'Item', c: i => itemCell(i, `<b>${esc(i.name)}</b>`) }, { h: 'Type', c: kindLabel }, { h: 'Source', c: i => D.isParent(i.id) ? 'Make in-house' : esc(D.sup[i.supplier_id]?.name || '—') }, { h: 'On hand', cls: 'num', c: i => qty(D.stat[i.id].onHand) },
        { h: 'Incoming', cls: 'num', c: i => qty(D.stat[i.id].incoming) }, { h: 'Reorder point', cls: 'num', c: i => qty(i.reorder_point) }, { h: 'Avg daily usage', cls: 'num', c: i => num(D.stat[i.id].d, 2) },
        { h: 'Days of cover', cls: 'num', c: i => isFinite(D.stat[i.id].cover) ? num(D.stat[i.id].cover, 1) : '—' }, { h: 'Lead time', cls: 'num', c: i => i.lead_time_days + ' d' },
        { h: 'Suggested order qty', cls: 'num', c: i => `<b>${qty(D.isParent(i.id) ? Math.max(N(i.lot_qty), Math.ceil(D.stat[i.id].d * 7)) : (D.stat[i.id].eoqLot || D.stat[i.id].lot))}</b>` },
        { h: 'Order by', c: i => { const s = D.stat[i.id]; return !s.orderBy ? '—' : s.orderBy <= S.today ? badge('today', 'bad') : fdate(s.orderBy); } },
        { h: 'Status', c: i => D.stat[i.id].out ? badge('Out of stock', 'bad') : badge('Below reorder point', 'warn') }], rows, { empty: 'Nothing is at or below its reorder point.' })}</div>
      <p class="muted small">Order-by date = projected run-out (on hand ÷ average daily usage) minus the lead time. Suggested quantity is the EOQ rounded to the lot size for purchased items, and the standard batch for items made in-house. Create the orders from Ordering Rules.</p>`;
  } else if (u.tab === 'loc') {
    const v = valuation();
    body = `<div class="kpis">${v.byLoc.map(l => `<div class="kpi"><div class="l">${esc(l.loc.name)}</div><div class="v">${money(l.value)}</div><div class="s">${qty(l.units)} units · ${S.items.filter(i => D.qtyAt(i.id, l.loc.id) > 0).length} items stocked</div></div>`).join('')}</div>
      <div class="card flush">${table([{ h: 'Item', c: i => esc(i.name) }, { h: 'Type', c: kindLabel },
        ...S.locations.flatMap(l => [{ h: esc(l.code) + ' qty', cls: 'num', c: i => qty(D.qtyAt(i.id, l.id)) }, { h: esc(l.code) + ' value', cls: 'num', c: i => money(D.qtyAt(i.id, l.id) * N(i.cost)) }]),
        { h: 'Total qty', cls: 'num', c: i => `<b>${qty(D.onHand(i.id))}</b>` }, { h: 'Total value', cls: 'num', c: i => `<b>${money(D.onHand(i.id) * N(i.cost))}</b>` }], S.items.filter(i => i.active),
        { foot: `<tr><td colspan="2">Total</td>${v.byLoc.map(l => `<td class="num">${qty(l.units)}</td><td class="num">${money(l.value)}</td>`).join('')}<td></td><td class="num">${money(v.total)}</td></tr>` })}</div>`;
  } else {
    const pos = S.purchase_orders.filter(p => p.received_date && p.sent_at && dstr(p.sent_at) >= from && dstr(p.sent_at) <= to);
    body = `<div class="card flush"><h2>Supplier performance summary (all purchase-order history)</h2>${table([{ h: 'Supplier', c: s => `<b>${esc(s.name)}</b>` }, { h: 'POs', cls: 'num', c: s => D.score[s.id].n }, { h: 'Quoted lead time', cls: 'num', c: s => s.lead_time_days + ' d' },
        { h: 'Avg actual lead time', cls: 'num', c: s => D.score[s.id].n ? num(D.score[s.id].avgLT, 1) + ' d' : '—' }, { h: 'Difference', cls: 'num', c: s => D.score[s.id].n ? `<span class="${D.score[s.id].avgLT > s.lead_time_days + 0.5 ? 'neg' : ''}">${D.score[s.id].avgLT - s.lead_time_days >= 0 ? '+' : ''}${num(D.score[s.id].avgLT - s.lead_time_days, 1)} d</span>` : '—' },
        { h: 'On-time', cls: 'num', c: s => D.score[s.id].n ? pct(D.score[s.id].onTimePct, 0) : '—' }, { h: 'Fill rate', cls: 'num', c: s => D.score[s.id].n ? pct(D.score[s.id].fillPct) : '—' }, { h: 'Purchased', cls: 'num', c: s => money(D.score[s.id].spend) },
        { h: 'Rating', c: s => `${D.score[s.id].rating ?? '—'} ${badge(D.score[s.id].verdict, verdictTone(D.score[s.id].verdict))}` }], S.suppliers)}</div>
      <div class="card flush"><h2>Purchase orders sent ${fdate(from)} to ${fdate(to)}: quoted vs actual</h2>${table([{ h: 'PO', c: p => p.number }, { h: 'Supplier', c: p => esc(D.sup[p.supplier_id].name) }, { h: 'Sent', c: p => fdate(p.sent_at) }, { h: 'Expected', c: p => fdate(p.expected_date) },
        { h: 'Received', c: p => fdate(p.received_date) }, { h: 'Quoted', cls: 'num', c: p => diffDays(p.expected_date, dstr(p.sent_at)) + ' d' }, { h: 'Actual', cls: 'num', c: p => diffDays(p.received_date, dstr(p.sent_at)) + ' d' },
        { h: 'Result', c: p => { const v = diffDays(p.received_date, p.expected_date); return v > 0 ? badge(`${v} d late`, 'bad') : v < 0 ? badge(`${-v} d early`, 'ok') : badge('on time', 'ok'); } }, { h: 'Fill', cls: 'num', c: p => pct(poFill(p), 0) }], pos.slice(0, 80))}</div>`;
  }
  return head('Reports', 'Management reports calculated from live data.') +
    tabs('rpt.tab', [['sales', 'Sales by day / week'], ['top', 'Top-selling items'], ['low', `Low stock (${S.items.filter(i => i.active && (D.stat[i.id].low || D.stat[i.id].out)).length})`], ['loc', 'Inventory by location'], ['sup', 'Supplier performance']], u.tab) +
    (['sales', 'top', 'sup'].includes(u.tab) ? `<div class="filters">${rangeCtl('rpt.r', u.r)}${u.tab === 'sales' ? sel('rpt.by', [['day', 'By day'], ['week', 'By week']], u.by, 'data-render') : ''}<span class="muted">${fdate(from)} to ${fdate(to)}</span><button class="btn sm" data-act="print">Print</button></div>` : '') + body;
};

/* ---------------- Items, Bills of Material, Barcodes ---------------- */
const YN = [['true', 'Yes'], ['false', 'No']];
const ITEM_FIELDS = [{ k: 'name', label: 'Item name', wide: true }, { k: 'sku', label: 'SKU' }, { k: 'barcode', label: 'Barcode value' }, { k: 'category', label: 'Category' },
  { k: 'kind', label: 'Type', opts: [['finished', 'Finished (made in-house)'], ['component', 'Component (purchased)'], ['resale', 'Resale (purchased, sold as is)']] }, { k: 'sellable', label: 'Sold to customers', opts: YN }, { k: 'uom', label: 'Unit of measure' },
  { k: 'price', label: 'Price ($)', type: 'number', attrs: 'min="0" step="0.01"', help: 'Selling price, or the parts / repair price for components' }, { k: 'cost', label: 'Unit cost ($)', type: 'number', attrs: 'min="0" step="0.0001"', help: 'Weighted average, maintained by receipts. Editable only while no stock is on hand.' },
  { k: 'reorder_point', label: 'Reorder point', type: 'number', attrs: 'min="0" step="1"' }, { k: 'lead_time_days', label: 'Lead time (days)', type: 'number', attrs: 'min="0" step="1"' },
  { k: 'supplier_id', label: 'Supplier', opts: () => [['', 'None (made in-house)'], ...S.suppliers.map(s => [s.id, s.name])] }, { k: 'lot_policy', label: 'Lot sizing', opts: [['L4L', 'Lot for lot (L4L)'], ['FOQ', 'Fixed order quantity (FOQ)']] },
  { k: 'lot_qty', label: 'Lot / batch quantity', type: 'number', attrs: 'min="1" step="1"' }, { k: 'active', label: 'Active', opts: YN }, { k: 'description', label: 'Description (shown to customers)', wide: true }];
PAGES.items = () => {
  const u = UI.itm ??= { tab: 'items', q: '', lab: 'all' }; let body;
  if (u.tab === 'items') {
    const q = u.q.toLowerCase(), rows = S.items.filter(i => !q || (i.name + ' ' + i.sku + ' ' + i.barcode + ' ' + i.category).toLowerCase().includes(q));
    body = `<div class="filters">${inp('itm.q', u.q, 'placeholder="Search items…" data-render="live" style="min-width:260px"')}<span class="muted">${rows.length} of ${S.items.length} items · ${Object.keys(D.bomOf).length} parent items with a bill of material</span></div>
      <div class="card flush">${table([{ h: 'SKU', c: i => `<span class="nowrap">${esc(i.sku)}</span>` }, { h: 'Barcode', c: i => esc(i.barcode) }, { h: 'Item', c: i => itemCell(i, `<b>${esc(i.name)}</b>`) + `${i.active ? '' : ' ' + badge('inactive')}` }, { h: 'Category', c: i => esc(i.category) }, { h: 'Type', c: kindLabel },
        { h: 'Avg cost', cls: 'num', c: i => '$' + num(i.cost, N(i.cost) < 1 ? 4 : 2) }, { h: 'Price', cls: 'num', c: i => money(i.price) + (i.sellable ? '' : ' <span class="muted small">parts</span>') }, { h: 'Margin', cls: 'num', c: i => N(i.price) ? pct((N(i.price) - N(i.cost)) / N(i.price) * 100, 0) : '' },
        { h: 'Reorder pt', cls: 'num', c: i => qty(i.reorder_point) }, { h: 'Lead time', cls: 'num', c: i => i.lead_time_days + ' d' }, { h: 'Lot sizing', c: i => i.lot_policy === 'FOQ' ? 'FOQ ' + qty(i.lot_qty) : 'L4L' },
        { h: 'Supplier', c: i => esc(D.sup[i.supplier_id]?.name || (D.isParent(i.id) ? 'made in-house' : '—')) }, { h: '', c: i => `<button class="btn sm" data-act="itm.edit" data-id="${i.id}">Edit</button>` }], rows)}</div>`;
  } else if (u.tab === 'bom') {
    body = `<div class="note">A bill of material lists the child components and the quantity of each needed to make one unit of a parent item. Production orders and assemble-to-order sales consume these components; MRP multiplies parent requirements through them.</div>
      <div class="grid g2">${S.items.filter(i => D.isParent(i.id)).map(p => { const roll = D.rollup(p.id); return `<div class="card flush bomcard"><div class="cardhead"><h2 class="bomhead">${prodImg(p, 'thumb lg')}<span>${esc(p.name)} <span class="muted small">${esc(p.sku)}</span></span></h2><button class="btn sm" data-act="bom.edit" data-id="${p.id}">Edit BOM</button></div>
        ${table([{ h: 'Component', c: b => esc(D.item[b.component_id].name) }, { h: 'Qty per unit', cls: 'num', c: b => qty(b.qty) }, { h: 'Unit cost', cls: 'num', c: b => '$' + num(D.item[b.component_id].cost, 4) }, { h: 'Extended', cls: 'num', c: b => money(N(b.qty) * N(D.item[b.component_id].cost)) },
          { h: 'Lead time', cls: 'num', c: b => D.item[b.component_id].lead_time_days + ' d' }, { h: 'On hand', cls: 'num', c: b => qty(D.onHand(b.component_id)) }], D.bomOf[p.id],
          { foot: `<tr><td colspan="3">Rolled-up cost at today’s component costs</td><td class="num">${money(roll)}</td><td colspan="2" class="num">price ${money(p.price)} · margin ${pct(N(p.price) ? (N(p.price) - roll) / N(p.price) * 100 : 0, 0)}</td></tr>` })}</div>`; }).join('')}</div>`;
  } else {
    const rows = S.items.filter(i => i.active && (u.lab === 'all' || (u.lab === 'sell' ? i.sellable : u.lab === 'parent' ? D.isParent(i.id) : i.kind === 'component')));
    body = `<div class="filters">${sel('itm.lab', [['all', 'All items'], ['sell', 'Items sold to customers'], ['parent', 'Parent items'], ['comp', 'Components']], u.lab, 'data-render')}<button class="btn primary" data-act="print">Print labels</button>
        <span class="muted">Code 128 barcodes. Print, cut out and attach to the physical items; they scan with a USB scanner or a phone camera.</span></div>
      <div class="labels">${rows.map(i => `<div class="label"><b>${esc(i.name)}</b><svg data-barcode="${esc(i.barcode)}" data-h="48"></svg><div class="small muted">${esc(i.sku)}${i.sellable ? ' · ' + money(i.price) : ''}</div></div>`).join('')}</div>`;
  }
  return head('Items, Bills of Material & Barcodes', 'The item master: every item carries a barcode, cost, price, reorder point and lead time. Parent items have a bill of material.',
      `<button class="btn" data-act="bom.new">New bill of material</button><button class="btn primary" data-act="itm.edit">Add item</button>`) +
    tabs('itm.tab', [['items', 'Items'], ['bom', 'Bills of material'], ['labels', 'Barcode labels']], u.tab) + body;
};
AFTER.items = () => drawBarcodes($('#main'));
ACT['itm.edit'] = d => {
  const next = String(Math.max(40300000, ...S.items.map(i => +i.barcode || 0)) + 1);
  const rec = d.id ? { ...D.item[d.id], sellable: String(D.item[d.id].sellable), active: String(D.item[d.id].active), supplier_id: D.item[d.id].supplier_id ?? '' }
    : { kind: 'component', sellable: 'false', active: 'true', uom: 'ea', lot_policy: 'L4L', lot_qty: 1, lead_time_days: 7, reorder_point: 0, barcode: next, supplier_id: '' };
  editRecord(d.id ? 'Edit item' : 'Add item', ITEM_FIELDS, rec, r => act('item_save', { p: { id: r.id ?? null, name: r.name, sku: r.sku, barcode: r.barcode, category: r.category, kind: r.kind, sellable: String(r.sellable) === 'true', uom: r.uom,
    price: r.price === '' ? null : r.price, cost: r.cost === '' ? null : r.cost, reorder_point: r.reorder_point === '' ? null : Math.round(N(r.reorder_point)), lead_time_days: r.lead_time_days === '' ? null : Math.round(N(r.lead_time_days)),
    supplier_id: r.supplier_id === '' || r.supplier_id == null ? '' : String(r.supplier_id), lot_policy: r.lot_policy, lot_qty: Math.max(1, Math.round(N(r.lot_qty))), active: String(r.active) !== 'false', description: r.description ?? null } }, 'Item saved'));
};
function bomEditor(parentId) {
  UI.m = { parent: parentId, lines: (D.bomOf[parentId] || []).map(b => ({ item_id: b.component_id, qty: N(b.qty) })) }; if (!UI.m.lines.length) UI.m.lines.push({ item_id: '', qty: 1 });
  modal(() => { const m = UI.m, cost = sum(m.lines, l => N(l.qty) * N(D.item[l.item_id]?.cost));
    return { title: `Bill of material · ${esc(D.item[m.parent].name)}`, body: `<p class="muted">Components and the quantity of each needed to make <b>one</b> ${esc(D.item[m.parent].name)}.</p>
      ${linesEditor('m.lines', m.lines, { filter: i => !D.isParent(i.id) && i.id !== +m.parent })}<p class="right bold">Rolled-up cost per unit ${money(cost)}</p>`,
      foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="bom.save">Save bill of material</button>` }; }, { size: 'wide' });
}
ACT['bom.edit'] = d => bomEditor(+d.id);
ACT['bom.new'] = () => { UI.m = { pick: '' };
  modal(() => ({ title: 'New bill of material', body: field('Which item will be made from components?', sel('m.pick', itemOpts(i => !D.isParent(i.id) && !D.usedIn[i.id], 'Choose an item…'), UI.m.pick)) + '<p class="muted small">Only items that are not already a parent or a component are listed. Add a new item first if needed.</p>',
    foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="bom.pick">Continue</button>` })); };
ACT['bom.pick'] = () => { if (!UI.m.pick) return toast('Choose an item', 'error'); bomEditor(+UI.m.pick); };
ACT['bom.save'] = async () => { const m = UI.m, lines = m.lines.filter(l => l.item_id && N(l.qty) > 0).map(l => ({ component_id: +l.item_id, qty: N(l.qty) }));
  const r = await act('bom_save', { p_parent: +m.parent, p_lines: lines }, 'Bill of material saved'); if (r.ok) { closeModal(); UI.itm = { ...(UI.itm || {}), tab: 'bom', q: '', lab: UI.itm?.lab || 'all' }; render(); } };

/* ---------------- Settings & About ---------------- */
PAGES.settings = () => {
  const u = UI.set ??= { v: {} }, counts = [['Items', S.items.length], ['Parent items with a BOM', Object.keys(D.bomOf).length], ['Locations', S.locations.length], ['Suppliers', S.suppliers.length], ['Customers', S.customers.length],
    ['Days of sales history', diffDays(S.today, D.histStart)], ['Purchase orders', S.purchase_orders.length], ['Production orders', S.production_orders.length]];
  return head('Settings & About', 'Editable values used in calculations, plus documentation of how this system was built.') + `
    <div class="grid g2"><div class="card"><h2>System settings</h2>
        ${S.settings_meta.map(s => `<label class="f"><span>${esc(s.label)}</span>${inp(`set.v.${s.key}`, u.v[s.key] ?? s.value, s.kind === 'number' ? 'type="number" min="0" step="any"' : '')}${s.help ? `<small class="muted">${esc(s.help)}</small>` : ''}</label>`).join('')}
        <button class="btn primary" data-act="set.save">Save settings</button></div>
      <div><div class="card"><h2>How this system was built</h2><dl class="kv">
          <dt>AI coding tools</dt><dd>${esc(S.settings.ai_tools || '')}</dd><dt>Database &amp; hosting</dt><dd>${esc(S.settings.data_tools || '')}</dd>
          <dt>Front end</dt><dd>Plain HTML, CSS and JavaScript (no framework), written with the AI tools above</dd>
          <dt>Business logic</dt><dd>PostgreSQL functions inside Supabase. Each sale, receipt, production step, transfer, return and adjustment runs as one database transaction and is written to a stock ledger.</dd>
          <dt>Multi-user</dt><dd>Supabase Auth logins for staff and customers. Screens refresh for every signed-in user when anyone posts a change (Supabase Realtime broadcast, with a version check every few seconds as backup).</dd>
          <dt>Barcodes</dt><dd>JsBarcode prints Code 128 labels; html5-qrcode reads them with a phone or laptop camera; USB scanners work as keyboard input.</dd>
          <dt>Security</dt><dd>Row Level Security is enabled on every table; the browser can only call checked API functions.</dd></dl>
          <p class="muted small">The two lines at the top are editable in System settings so the team can keep this documentation accurate.</p></div>
        <div class="card"><h2>Data in the system</h2><dl class="kv">${counts.map(([k, v]) => `<dt>${k}</dt><dd><b>${num(v)}</b></dd>`).join('')}</dl>
          <p class="muted small" style="margin-top:12px">The starting data is a day-by-day simulation of the last six months run through the same transaction logic as live use. Resetting rebuilds it relative to today’s date and <b>erases everything entered since</b> (logins are kept).</p>
          <button class="btn danger" data-act="set.reset">Reset to fresh starting data</button></div></div></div>`;
};
ACT['set.save'] = async () => { const u = UI.set, ch = Object.entries(u.v).filter(([k, v]) => String(v) !== String(S.settings[k])); if (!ch.length) return toast('No settings were changed', 'error');
  try { for (const [k, v] of ch) await rpc('setting_save', { p_key: k, p_value: String(v) }); u.v = {}; toast('Settings saved - every dependent number has been recalculated', 'ok'); } catch (e) { toast(e.message, 'error'); }
  await refresh(); };
ACT['set.reset'] = () => confirmBox('Reset all data?', 'This erases every transaction entered since setup and rebuilds six months of starting data ending yesterday. It takes about 10-20 seconds.', 'Reset data', async () => {
  toast('Rebuilding starting data…'); const r = await act('reset_demo_data', {}, 'Starting data rebuilt'); if (r.ok) { for (const k of Object.keys(UI)) if (k !== 'm') delete UI[k]; UI.m = {}; render(); } });

/* =====================================================================
   Screens: Command Center, Point of Sale, Sales Orders, Returns,
   Customers, and the customer-facing portal
   ===================================================================== */
'use strict';
const round2 = x => Math.round((N(x) + Number.EPSILON) * 100) / 100;
const itemOpts = (filter = () => true, blank = 'Choose an item…') => [['', blank], ...S.items.filter(i => i.active && filter(i)).map(i => [i.id, `${i.name}  (${i.sku})`])];
const locOpts = () => S.locations.map(l => [l.id, l.name]);
const soTone = s => ({ 'Order Placed': 'info', Fulfilled: 'warn', Closed: 'ok', Cancelled: '' }[s] || '');

/* generic "lines" editor used by sales orders, purchase orders and exchanges */
function linesEditor(model, lines, opts = {}) {
  const rows = lines.map((l, i) => {
    const it = D.item[l.item_id]; let info = '';
    if (it && opts.loc) { const have = D.qtyAt(it.id, +opts.loc), short = Math.max(0, N(l.qty) - have);
      info = short > 0 ? `<span class="badge warn">${qty(have)} here · ${qty(short)} short${D.canBuild(it.id, opts.loc, short) ? ' (can assemble to order)' : ''}</span>` : `<span class="badge ok">${qty(have)} here</span>`; }
    if (it && opts.cost) info = `<span class="muted small">on hand ${qty(D.onHand(it.id))} · ROP ${qty(it.reorder_point)}</span>`;
    return `<tr><td>${sel(`${model}.${i}.item_id`, itemOpts(opts.filter), l.item_id, 'data-render class="w"')}</td>
      <td class="num">${inp(`${model}.${i}.qty`, l.qty, 'type="number" min="1" step="1" class="q" data-render')}</td>
      ${opts.cost ? `<td class="num">${inp(`${model}.${i}.unit_cost`, l.unit_cost ?? (it ? N(it.cost).toFixed(2) : ''), 'type="number" min="0" step="0.01" class="q" data-render')}</td>` : ''}
      ${opts.price ? `<td class="num">${it ? money(N(it.price) * N(l.qty)) : ''}</td>` : ''}
      <td>${info}</td><td><a data-act="lines.del" data-k="${model}" data-i="${i}" title="Remove">✕</a></td></tr>`;
  }).join('');
  return `<table class="t"><thead><tr><th>Item</th><th class="num">Qty</th>${opts.cost ? '<th class="num">Unit cost</th>' : ''}${opts.price ? '<th class="num">Amount</th>' : ''}<th></th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p style="margin:8px 0 0"><button class="btn sm" data-act="lines.add" data-k="${model}">+ Add line</button></p>`;
}
ACT['lines.add'] = d => { (getPath(UI, d.k) || (setPath(UI, d.k, []), getPath(UI, d.k))).push({ item_id: '', qty: 1 }); render(); };
ACT['lines.del'] = d => { getPath(UI, d.k).splice(+d.i, 1); render(); };
const cleanLines = lines => (lines || []).filter(l => l.item_id && N(l.qty) > 0).map(l => ({ item_id: +l.item_id, qty: N(l.qty), ...(l.unit_cost !== undefined && l.unit_cost !== '' ? { unit_cost: N(l.unit_cost) } : {}) }));

/* ---------------- Command Center ---------------- */
function buildAlerts() {
  const A = [], t = S.today;
  const shortLines = D.openSO.flatMap(o => o.lines.filter(l => D.lineShort[l.id] > 0).map(l => ({ o, l })));
  if (shortLines.length) A.push({ tone: 'bad', t: `${shortLines.length} sales order line(s) are backordered`, s: shortLines.slice(0, 3).map(x => `${x.o.number}: ${qty(D.lineShort[x.l.id])} × ${D.item[x.l.item_id].name}`).join(' · '), to: 'orders', a: 'Open orders' });
  const m = mrp(4), lateRel = m.planned.filter(p => p.late);
  if (lateRel.length) A.push({ tone: 'bad', t: `MRP: ${lateRel.length} planned order(s) are already past their order-by date`, s: lateRel.slice(0, 3).map(p => `${qty(p.qty)} × ${p.item.name}`).join(' · '), to: 'mrp', a: 'Open MRP' });
  if (D.latePO.length) A.push({ tone: 'bad', t: `${D.latePO.length} purchase order(s) are late from the supplier`, s: D.latePO.slice(0, 3).map(p => `${p.number} (${D.sup[p.supplier_id].name}, due ${fshort(p.expected_date)})`).join(' · '), to: 'purchasing', a: 'Purchase orders' });
  if (D.lowCount) A.push({ tone: '', t: `${D.lowCount} item(s) are at or below their reorder point`, s: D.lowItems.slice(0, 4).map(i => i.name).join(' · '), to: 'replenish', a: 'Ordering rules' });
  const overdue = sum(S.suppliers, s => D.score[s.id].overdue);
  if (overdue > 0) A.push({ tone: '', t: `${money(overdue)} in supplier invoices is past due`, s: S.suppliers.filter(s => D.score[s.id].overdue > 0).map(s => s.name).join(' · '), to: 'suppliers', a: 'Payables' });
  const bad = S.suppliers.filter(s => D.score[s.id].verdict === 'Replace');
  if (bad.length) A.push({ tone: '', t: `${bad.length} supplier(s) are rated "Replace"`, s: bad.map(s => `${s.name} (${D.score[s.id].rating}/100)`).join(' · '), to: 'suppliers', a: 'Scorecards' });
  const due = D.openSO.filter(o => o.required_date <= addDays(t, 3));
  if (due.length) A.push({ tone: 'info', t: `${due.length} sales order(s) are due within 3 days`, s: due.map(o => `${o.number} (${fshort(o.required_date)})`).join(' · '), to: 'orders', a: 'Fulfill' });
  const waiting = S.production_orders.filter(w => w.status === 'Planned');
  if (waiting.length) A.push({ tone: 'info', t: `${waiting.length} production order(s) are waiting for components to be issued`, s: waiting.map(w => `${w.number}: ${qty(w.qty_planned)} × ${D.item[w.item_id].name}`).join(' · '), to: 'production', a: 'Production' });
  return A;
}
PAGES.dashboard = () => {
  const t = S.today, today = pnl(t, t), mtd = pnl(t.slice(0, 8) + '01', t), p30 = pnl(addDays(t, -29), t), val = valuation(), turn = turnover(...rangeOf('90'));
  const byDay = {}; for (const r of D.sales) if (r.d >= addDays(t, -29)) byDay[r.d] = (byDay[r.d] || 0) + r.g - r.x;
  const days = Array.from({ length: 30 }, (_, i) => addDays(t, i - 29)).map(d => ({ l: fshort(d), v: byDay[d] || 0 }));
  const top = {}; for (const r of D.sales) if (r.d >= addDays(t, -29)) top[r.i] = (top[r.i] || 0) + r.q;
  const tops = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([i, v]) => ({ l: D.item[i].name, v }));
  const alerts = buildAlerts();
  return head('Command Center', `Live view of ${esc(S.settings.company_name)} for ${fdate(t)}. Every number on this page is calculated from stored transactions and updates for all users as changes are made.`,
      `<button class="btn primary" data-act="go" data-to="pos">New sale</button>`) + `
    <div class="kpis">
      <div class="kpi"><div class="l">Sales today</div><div class="v">${money(today.net)}</div><div class="s">${today.txns} transaction(s)</div></div>
      <div class="kpi"><div class="l">Month to date revenue</div><div class="v">${money(mtd.net)}</div><div class="s">Gross margin ${pct(mtd.gm)}</div></div>
      <div class="kpi"><div class="l">Last 30 days profit</div><div class="v">${money(p30.op)}</div><div class="s">after COGS and expenses</div></div>
      <div class="kpi"><div class="l">Inventory value</div><div class="v">${money(val.total)}</div><div class="s">weighted average cost</div></div>
      <div class="kpi"><div class="l">Inventory turnover</div><div class="v">${num(turn.turns, 1)}×</div><div class="s">${num(turn.dsi)} days of inventory</div></div>
      <div class="kpi"><div class="l">Open sales orders</div><div class="v">${D.openSO.length}</div><div class="s">${money(sum(D.openSO, soValue))} to fulfill</div></div>
    </div>
    <div class="grid g23">
      <div class="card"><h2>Needs attention</h2>${alerts.length ? alerts.map(a => `<div class="alert"><span class="dot ${a.tone}"></span><div class="x"><b>${esc(a.t)}</b><small>${esc(a.s)}</small></div><button class="btn sm" data-act="go" data-to="${a.to}">${a.a}</button></div>`).join('') : '<div class="empty">All clear. No exceptions right now.</div>'}</div>
      <div class="card"><h2>Top sellers · last 30 days (units)</h2>${hbars(tops)}</div>
    </div>
    <div class="card"><h2>Net sales by day · last 30 days</h2>${bars(days)}</div>`;
};

/* ---------------- Point of Sale ---------------- */
function cartTotals(u) {
  const rate = N(S.settings.tax_rate_pct) / 100, od = N(u.disc); let sub = 0, disc = 0;
  for (const c of u.cart) { const ext = round2(N(c.qty) * N(D.item[c.id].price)); let ld = round2(ext * N(c.disc) / 100); ld += round2((ext - ld) * od / 100); sub += ext; disc += ld; }
  const tax = round2((sub - disc) * rate);
  return { sub, disc, tax, total: sub - disc + tax, rate };
}
PAGES.pos = () => {
  const u = UI.pos ??= { loc: 2, cart: [], pay: 'Card', disc: '', cust: '', search: '' };
  const q = (u.search || '').toLowerCase();
  const items = S.items.filter(i => i.sellable && i.active && (!q || (i.name + ' ' + i.sku + ' ' + i.barcode).toLowerCase().includes(q)));
  const T = cartTotals(u);
  return head('Point of Sale', 'Scan or tap items to build a sale. Completing it reduces inventory at the selected location and records revenue and cost of goods sold.') + `
  <div class="posgrid">
    <div>
      <div class="filters">${field('Selling from', sel('pos.loc', locOpts(), u.loc, 'data-render'))}</div>
      ${scanBar('Scan a barcode (USB scanner or type the number and press Enter)')}
      <div class="filters">${inp('pos.search', u.search, 'placeholder="Search items…" data-render="live" style="flex:1"')}</div>
      <div class="tiles">${items.map(i => { const have = D.qtyAt(i.id, +u.loc), mto = have <= 0 && D.canBuild(i.id, u.loc, 1);
        return `<button class="tile ${have <= 0 && !mto ? 'out' : ''}" data-act="pos.add" data-id="${i.id}"><b>${esc(i.name)}</b><div class="p">${money(i.price)}</div>
          <div class="s">${have > 0 ? qty(have) + ' in stock here' : mto ? 'Made to order' : 'Out of stock here'}</div></button>`; }).join('') || '<div class="empty">No items match.</div>'}</div>
    </div>
    <div class="card cart">
      <h2>Current sale</h2>
      ${u.cart.length ? u.cart.map((c, i) => { const it = D.item[c.id], have = D.qtyAt(c.id, +u.loc), short = N(c.qty) > have;
        return `<div class="line"><div><b>${esc(it.name)}</b> ${short ? (D.canBuild(c.id, u.loc, N(c.qty) - have) ? badge('assemble to order', 'info') : badge(`only ${qty(have)} here`, 'bad')) : ''}<div class="ctl">Qty ${inp(`pos.cart.${i}.qty`, c.qty, 'type="number" min="1" step="1" data-render')} Disc % ${inp(`pos.cart.${i}.disc`, c.disc, 'type="number" min="0" max="100" data-render')}</div></div>
          <div class="right"><b>${money(N(c.qty) * N(it.price) * (1 - N(c.disc) / 100))}</b><br><a class="small" data-act="pos.remove" data-i="${i}">remove</a></div></div>`; }).join('')
        : '<div class="empty">Scan or tap an item to begin.</div>'}
      <div class="frow" style="margin-top:12px">${field('Customer (optional)', sel('pos.cust', [['', 'Walk-in customer'], ...S.customers.map(c => [c.id, c.name])], u.cust))}
        ${field('Order discount %', inp('pos.disc', u.disc, 'type="number" min="0" max="100" data-render placeholder="0"'))}</div>
      ${field('Payment', sel('pos.pay', ['Card', 'Cash', 'Mobile pay', 'Gift card'], u.pay))}
      <div class="totals"><div><span>Subtotal</span><span>${money(T.sub)}</span></div>
        <div><span>Discounts</span><span>-${money(T.disc)}</span></div>
        <div><span>Sales tax (${num(T.rate * 100, 2)}%)</span><span>${money(T.tax)}</span></div>
        <div class="grand"><span>Total</span><span>${money(T.total)}</span></div></div>
      <button class="btn primary big" data-act="pos.complete" ${u.cart.length ? '' : 'disabled'}>Complete sale</button>
      <p class="center" style="margin:8px 0 0"><a data-act="pos.clear">Clear sale</a></p>
    </div>
  </div>`;
};
function posAdd(item) {
  const u = UI.pos ??= { loc: 2, cart: [], pay: 'Card', disc: '', cust: '', search: '' };
  if (!item.sellable) return toast(`${item.name} is a component and is not sold at the register`, 'error');
  const line = u.cart.find(c => c.id === item.id);
  if (line) line.qty = N(line.qty) + 1; else u.cart.push({ id: item.id, qty: 1, disc: '' });
  render();
}
ACT['pos.add'] = d => posAdd(D.item[d.id]);
SCAN.pos = posAdd;
ACT['pos.remove'] = d => { UI.pos.cart.splice(+d.i, 1); render(); };
ACT['pos.clear'] = () => { Object.assign(UI.pos, { cart: [], disc: '', cust: '' }); render(); };
ACT['pos.complete'] = async () => {
  const u = UI.pos;
  const r = await act('pos_sale', { p_location: +u.loc, p_customer: u.cust ? +u.cust : null, p_lines: u.cart.map(c => ({ item_id: c.id, qty: N(c.qty), discount_pct: N(c.disc) })), p_discount_pct: N(u.disc), p_payment: u.pay }, 'Sale completed - inventory and financials updated');
  if (r.ok) { Object.assign(u, { cart: [], disc: '', cust: '' }); render(); showReceipt(r.data); }
};
function receiptHTML(s, title = 'Sales receipt') {
  return `<div class="receipt printable"><h3>${esc(S.settings.company_name)}</h3><div class="c">${esc(s.location_name || '')}</div><div class="c">${title} ${esc(s.number)}</div><div class="c">${ftime(s.ts)}</div>
    ${s.customer_name ? `<div class="c">Customer: ${esc(s.customer_name)}</div>` : ''}<hr>
    ${s.lines.map(l => `<div class="r"><span>${qty(l.qty)} × ${esc(l.name)}</span><span>${money(N(l.qty) * N(l.unit_price))}</span></div><div class="r muted"><span>&nbsp;&nbsp;@ ${money(l.unit_price)}${N(l.discount) > 0 ? ` · discount -${money(l.discount)}` : ''}</span><span></span></div>`).join('')}
    <hr><div class="r"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
    ${N(s.discount) > 0 ? `<div class="r"><span>Discounts</span><span>-${money(s.discount)}</span></div>` : ''}
    <div class="r"><span>Sales tax (${num(N(s.tax_rate) * 100, 2)}%)</span><span>${money(s.tax)}</span></div>
    <div class="r bold"><span>TOTAL</span><span>${money(s.total)}</span></div><div class="r"><span>Paid by</span><span>${esc(s.payment_method || '')}</span></div><hr>
    <div class="c">Served by ${esc(s.cashier || '')}</div><div class="c">Returns accepted with this receipt.</div>
    <svg data-barcode="${esc(s.number)}" data-h="36" data-w="1.6"></svg></div>`;
}
function showReceipt(s, title) {
  modal(() => ({ title: `${title || 'Receipt'} ${esc(s.number)}`, body: receiptHTML(s, title), foot: `<button class="btn" data-act="print">Print</button><button class="btn primary" data-act="modal.close">Done</button>` }),
    { size: 'narrow', after: () => drawBarcodes($('#modal-root')) });
}
ACT['sale.receipt'] = d => { const s = S.recent_sales.find(x => x.id === +d.id); if (s) showReceipt(s); };
AFTER.pos = () => { if (!modalFn && document.activeElement === document.body && window.innerWidth > 980) $('#scanbox')?.focus(); };

/* ---------------- Sales Orders ---------------- */
PAGES.orders = () => {
  const u = UI.so ??= { status: 'Order Placed' };
  const rows = S.sales_orders.filter(o => u.status === 'all' || o.status === u.status);
  const counts = groupBy(S.sales_orders, o => o.status);
  return head('Sales Orders', 'Customer orders move through <b>Order Placed → Fulfilled → Closed</b> (or Cancelled). Fulfilling an order ships from the chosen location: inventory drops and revenue and cost are recorded. Open orders are the confirmed demand that drives MRP.',
      `<button class="btn primary" data-act="so.new">New sales order</button>`) +
    tabs('so.status', [['Order Placed', `Order Placed (${counts['Order Placed']?.length || 0})`], ['Fulfilled', `Fulfilled (${counts.Fulfilled?.length || 0})`], ['Closed', 'Closed'], ['Cancelled', 'Cancelled'], ['all', 'All']], u.status) +
    `<div class="card flush">${table([
      { h: 'Order', c: o => `<a data-act="so.view" data-id="${o.id}"><b>${o.number}</b></a>` },
      { h: 'Placed', c: o => fdate(o.ts) }, { h: 'Customer', c: o => esc(D.cust[o.customer_id]?.name || '—') },
      { h: 'Location', c: o => esc(D.loc[o.location_id].code) }, { h: 'Required', c: o => fdate(o.required_date) + (o.status === 'Order Placed' && o.required_date < S.today ? ' ' + badge('late', 'bad') : '') },
      { h: 'Items', c: o => esc(o.lines.map(l => `${qty(l.qty)} × ${D.item[l.item_id].name}`).join(', ')).slice(0, 90) },
      { h: 'Value', cls: 'num', c: o => money(soValue(o)) },
      { h: 'Stock', c: o => o.status !== 'Order Placed' ? '' : o.lines.some(l => D.lineShort[l.id] > 0) ? badge('backordered', 'bad') : badge('ready', 'ok') },
      { h: 'Source', c: o => o.source === 'portal' ? badge('customer portal', 'info') : 'staff' },
      { h: 'Status', c: o => badge(o.status, soTone(o.status)) },
      { h: '', cls: 'nowrap', c: o => o.status === 'Order Placed' ? `<button class="btn sm primary" data-act="so.do" data-id="${o.id}" data-a="fulfill">Fulfill</button> <button class="btn sm" data-act="so.do" data-id="${o.id}" data-a="cancel">Cancel</button>`
          : o.status === 'Fulfilled' ? `<button class="btn sm primary" data-act="so.do" data-id="${o.id}" data-a="close">Close</button>` : '' }
    ], rows, { empty: 'No orders with this status.' })}</div>`;
};
ACT['so.new'] = () => {
  UI.m = { cust: '', loc: 1, date: addDays(S.today, 7), notes: '', lines: [{ item_id: '', qty: 1 }] };
  modal(() => { const m = UI.m, total = sum(m.lines, l => N(D.item[l.item_id]?.price) * N(l.qty));
    const etas = m.lines.filter(l => l.item_id && N(l.qty) > D.qtyAt(+l.item_id, +m.loc)).map(l => `${D.item[l.item_id].name}: estimated available ${fdate(D.item[l.item_id].eta || addDays(S.today, N(D.item[l.item_id].lead_time_days)))}`);
    return { title: 'New sales order', body: `<div class="frow">${field('Customer', sel('m.cust', [['', 'Choose a customer…'], ...S.customers.map(c => [c.id, c.name])], m.cust))}
      ${field('Ship / pick up from', sel('m.loc', locOpts(), m.loc, 'data-render'))}${field('Required date', inp('m.date', m.date, 'type="date"'))}</div>
      ${linesEditor('m.lines', m.lines, { filter: i => i.sellable, loc: m.loc, price: true })}
      ${etas.length ? `<div class="note warn" style="margin-top:10px"><b>Backorder:</b> ${etas.map(esc).join('<br>')}</div>` : ''}
      ${field('Notes', inp('m.notes', m.notes))}<p class="right bold">Order value ${money(total)} <span class="muted">+ tax</span></p>`,
      foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="so.save">Place order</button>` }; }, { size: 'wide' });
};
ACT['so.save'] = async () => {
  const m = UI.m; if (!m.cust) return toast('Choose a customer', 'error');
  const r = await act('so_create', { p_customer: +m.cust, p_location: +m.loc, p_required: m.date || null, p_lines: cleanLines(m.lines), p_notes: m.notes || null });
  if (r.ok) { closeModal(); toast(`${r.data.number} placed`, 'ok'); UI.so = { status: 'Order Placed' }; render(); }
};
ACT['so.view'] = d => {
  modal(() => { const o = S.sales_orders.find(x => x.id === +d.id); if (!o) return null; const c = D.cust[o.customer_id];
    return { title: `${o.number} · ${badge(o.status, soTone(o.status))}`, body: `<dl class="kv"><dt>Customer</dt><dd>${esc(c?.name || '—')}</dd><dt>Location</dt><dd>${esc(D.loc[o.location_id].name)}</dd>
      <dt>Placed</dt><dd>${ftime(o.ts)} by ${esc(o.created_by || '')} (${o.source === 'portal' ? 'customer portal' : 'staff'})</dd><dt>Required</dt><dd>${fdate(o.required_date)}</dd>
      ${o.fulfilled_at ? `<dt>Fulfilled</dt><dd>${ftime(o.fulfilled_at)}</dd>` : ''}${o.closed_at ? `<dt>${o.status}</dt><dd>${ftime(o.closed_at)}</dd>` : ''}${o.notes ? `<dt>Notes</dt><dd>${esc(o.notes)}</dd>` : ''}</dl><br>
      ${table([{ h: 'Item', c: l => esc(D.item[l.item_id].name) }, { h: 'Qty', cls: 'num', c: l => qty(l.qty) }, { h: 'Price', cls: 'num', c: l => money(l.unit_price) }, { h: 'Amount', cls: 'num', c: l => money(N(l.qty) * N(l.unit_price)) },
        ...(o.status === 'Order Placed' ? [{ h: 'On hand here', cls: 'num', c: l => qty(D.qtyAt(l.item_id, o.location_id)) },
          { h: 'Availability', c: l => D.lineShort[l.id] > 0 ? `${badge(qty(D.lineShort[l.id]) + ' backordered', 'bad')} est. available ${fdate(D.item[l.item_id].eta || addDays(S.today, N(D.item[l.item_id].lead_time_days)))}` : badge('in stock', 'ok') }] : [])
      ], o.lines, { foot: `<tr><td colspan="3">Order value (before tax)</td><td class="num">${money(soValue(o))}</td>${o.status === 'Order Placed' ? '<td></td><td></td>' : ''}</tr>` })}
      ${o.status === 'Order Placed' && o.lines.some(l => D.lineShort[l.id] > 0) ? `<div class="note warn" style="margin-top:10px">Backordered lines cannot ship from stock. Items we make can be assembled to order at fulfillment if their components are at this location; otherwise transfer stock in, finish a production order, or receive the purchase order first.</div>` : ''}`,
      foot: (o.status === 'Order Placed' ? `<button class="btn danger" data-act="so.do" data-id="${o.id}" data-a="cancel">Cancel order</button><button class="btn primary" data-act="so.do" data-id="${o.id}" data-a="fulfill">Fulfill order</button>`
        : o.status === 'Fulfilled' ? `<button class="btn primary" data-act="so.do" data-id="${o.id}" data-a="close">Close order</button>` : '') + `<button class="btn" data-act="modal.close">Done</button>` }; }, { size: 'wide' });
};
ACT['so.do'] = async d => {
  const msg = { fulfill: 'Order fulfilled - inventory shipped and revenue recorded', close: 'Order closed', cancel: 'Order cancelled' }[d.a];
  const r = await act('so_set_status', { p_id: +d.id, p_action: d.a }, msg);
  if (r.ok && d.a === 'fulfill' && r.data?.number) showReceipt(r.data, 'Invoice');
};

/* ---------------- Returns & Exchanges ---------------- */
const isQualityReason = r => /defect|tarnish|damaged/i.test(r || '');
function retCalc(u) {
  const s = u.sale; let sub = 0; const lines = [];
  for (const l of s.lines) { const x = u.lines[l.id] || {}; const q = N(x.qty); if (q <= 0) continue;
    const net = round2((N(l.qty) * N(l.unit_price) - N(l.discount)) * q / N(l.qty)); sub += net;
    lines.push({ sale_line_id: l.id, qty: q, reason: x.reason || '', disposition: x.disp || (isQualityReason(x.reason) ? 'quality_fail' : 'restock') }); }
  const tax = round2(sub * N(s.tax_rate)), ex = cleanLines(u.exch);
  const exSub = sum(ex, l => N(D.item[l.item_id].price) * l.qty), exTotal = exSub + round2(exSub * N(S.settings.tax_rate_pct) / 100);
  return { lines, sub, tax, refund: sub + tax, ex, exTotal, net: exTotal - (sub + tax) };
}
PAGES.returns = () => {
  const u = UI.ret ??= { q: '' }; let work = '';
  if (u.sale) { const s = u.sale, c = retCalc(u);
    work = `<div class="card"><div class="cardhead"><h2>Sale ${esc(s.number)} · ${ftime(s.ts)} · ${esc(s.location_name)}${s.customer_name ? ' · ' + esc(s.customer_name) : ''}</h2><a data-act="ret.reset">Start over</a></div>
      ${table([{ h: 'Item', c: l => esc(l.name) }, { h: 'Sold', cls: 'num', c: l => qty(l.qty) }, { h: 'Already returned', cls: 'num', c: l => qty(l.returned_qty) },
        { h: 'Paid each', cls: 'num', c: l => money((N(l.qty) * N(l.unit_price) - N(l.discount)) / N(l.qty)) },
        { h: 'Return qty', cls: 'num', c: l => N(l.qty) - N(l.returned_qty) > 0 ? inp(`ret.lines.${l.id}.qty`, u.lines[l.id]?.qty, `type="number" min="0" max="${N(l.qty) - N(l.returned_qty)}" step="1" class="q" data-render placeholder="0"`) : badge('fully returned') },
        { h: 'Reason code', c: l => N(l.qty) - N(l.returned_qty) > 0 ? sel(`ret.lines.${l.id}.reason`, [['', 'Choose a reason…'], ...RETURN_REASONS], u.lines[l.id]?.reason, 'data-render') : '' },
        { h: 'Inspection result', c: l => N(l.qty) - N(l.returned_qty) > 0 ? sel(`ret.lines.${l.id}.disp`, [['restock', 'Passed - return to sellable stock'], ['quality_repair', 'Quality failure - return to workshop for repair'], ['quality_fail', 'Quality failure - not repairable, write off']], u.lines[l.id]?.disp || (isQualityReason(u.lines[l.id]?.reason) ? 'quality_fail' : 'restock'), 'data-render') : '' }
      ], s.lines)}
      <div class="grid g2" style="margin-top:14px"><div><h3>Exchange for (optional)</h3><p class="muted small" style="margin:0 0 6px">Adding items here makes this an exchange: the replacement leaves inventory at ${esc(D.loc[u.loc]?.name || '')} as a new sale.</p>
        ${field('Process at location', sel('ret.loc', locOpts(), u.loc, 'data-render'))}
        ${linesEditor('ret.exch', u.exch, { filter: i => i.sellable, loc: u.loc, price: true })}</div>
      <div><h3>Summary</h3><div class="totals"><div><span>Merchandise refunded</span><span>${money(c.sub)}</span></div><div><span>Sales tax refunded</span><span>${money(c.tax)}</span></div>
        <div class="bold"><span>Refund</span><span>${money(c.refund)}</span></div>${c.ex.length ? `<div><span>Exchange items incl. tax</span><span>${money(c.exTotal)}</span></div>` : ''}
        <div class="grand"><span>${c.net > 0.004 ? 'Customer pays' : 'Refund to customer'}</span><span>${money(Math.abs(c.net))}</span></div></div>
        <p class="muted small">Every return goes back into inventory with its reason code and reverses revenue and cost of goods sold. Items that pass inspection return to sellable stock where they came back. Quality failures that can be fixed go into workshop inventory for repair. Quality failures that cannot be fixed are received and then written off, and the loss shows on the P&amp;L.</p>
        <button class="btn primary big" data-act="ret.process" ${c.lines.length ? '' : 'disabled'}>${c.ex.length ? 'Process exchange' : 'Process return'}</button></div></div></div>`;
  }
  return head('Returns & Exchanges', 'Look up the original sale, choose what is coming back and why, and record the inspection result. Revenue, cost of goods sold and inventory are adjusted automatically.') + `
    <div class="card"><div class="filters" style="margin:0">${inp('ret.q', u.q, 'placeholder="Receipt number, e.g. S-10025 (or scan the receipt)" data-enter="ret.lookup" style="flex:1;min-width:240px"')}
      <button class="btn primary" data-act="ret.lookup">Find sale</button>
      ${sel('ret.pick', [['', 'or pick a recent sale…'], ...S.recent_sales.filter(s => s.source !== 'exchange').slice(0, 40).map(s => [s.number, `${s.number} · ${ftime(s.ts)} · ${money(s.total)}`])], '', 'data-act-change="ret.pick"')}</div></div>
    ${work}
    <div class="card flush"><h2>Return history</h2>${table([
      { h: 'RMA', c: r => `<b>${r.number}</b>` }, { h: 'Date', c: r => ftime(r.ts) }, { h: 'Type', c: r => badge(r.kind, r.kind === 'exchange' ? 'info' : '') }, { h: 'Original sale', c: r => r.sale_number },
      { h: 'Items', c: r => r.lines.map(l => `${qty(l.qty)} × ${esc(D.item[l.item_id].name)} ${l.disposition === 'quality_fail' ? badge('quality failure · written off', 'bad') : l.disposition === 'quality_repair' ? badge('quality failure · to workshop', 'warn') : badge('restocked', 'ok')}`).join('<br>') },
      { h: 'Reason code', c: r => r.lines.map(l => esc(l.reason_code)).join('<br>') }, { h: 'Refund', cls: 'num', c: r => money(r.refund_total) },
      { h: 'COGS reversed', cls: 'num', c: r => money(r.cogs_reversed) }, { h: 'Exchange sale', c: r => r.exchange_number ? `${r.exchange_number} (${money(r.exchange_total)})` : '' }, { h: 'By', c: r => esc(r.processed_by || '') }
    ], S.returns.slice(0, 60))}</div>`;
};
document.addEventListener('change', e => { const a = e.target.dataset?.actChange; if (a) ACT[a]?.({ v: e.target.value }, e.target); });
ACT['ret.pick'] = d => { if (!d.v) return; UI.ret.q = d.v; ACT['ret.lookup'](); };
ACT['ret.reset'] = () => { UI.ret = { q: '' }; render(); };
ACT['ret.lookup'] = async () => {
  const u = UI.ret ??= { q: '' }; if (!u.q?.trim()) return toast('Enter a receipt number', 'error');
  try { const s = await rpc('get_sale', { p_number: u.q.trim() });
    if (!s) return toast(`No sale found with number "${u.q}"`, 'error');
    UI.ret = { q: s.number, sale: s, lines: {}, exch: [], loc: s.location_id }; render();
  } catch (e) { toast(e.message, 'error'); }
};
ACT['ret.process'] = async () => {
  const u = UI.ret, c = retCalc(u);
  if (c.lines.some(l => !l.reason)) return toast('Choose a reason code for every returned item', 'error');
  const r = await act('return_process', { p_sale: u.sale.id, p_lines: c.lines, p_exchange: c.ex.length ? c.ex : null, p_location: +u.loc });
  if (!r.ok) return;
  const x = r.data; UI.ret = { q: '' }; render();
  modal(() => ({ title: `${x.kind === 'exchange' ? 'Exchange' : 'Return'} ${esc(x.number)} processed`, body: `<dl class="kv"><dt>Refund (incl. tax)</dt><dd>${money(x.refund_total)}</dd><dt>Revenue reversed</dt><dd>${money(x.refund_subtotal)}</dd>
      <dt>Cost of goods reversed</dt><dd>${money(x.cogs_reversed)}</dd>${x.exchange ? `<dt>Exchange sale</dt><dd>${esc(x.exchange.number)} for ${money(x.exchange.total)}</dd><dt>${N(x.exchange.total) - N(x.refund_total) > 0 ? 'Customer pays' : 'Refund to customer'}</dt><dd><b>${money(Math.abs(N(x.exchange.total) - N(x.refund_total)))}</b></dd>` : ''}</dl>
      <p class="muted">Inventory, the profit &amp; loss statement and the stock ledger have been updated.</p>`, foot: `<button class="btn primary" data-act="modal.close">Done</button>` }), { size: 'narrow' });
};

/* ---------------- generic record editor (customers, suppliers, items…) ---------------- */
function formFields(prefix, fields, rec) {
  return `<div class="frow">${fields.map(f => { const m = `${prefix}.${f.k}`, v = rec[f.k];
    const ctl = f.opts ? sel(m, typeof f.opts === 'function' ? f.opts() : f.opts, v, f.attrs || '') : f.type === 'checkbox' ? `<input type="checkbox" data-model="${m}" ${v ? 'checked' : ''}>`
      : inp(m, v, `type="${f.type || 'text'}" ${f.attrs || ''}`);
    return `<label class="f" ${f.wide ? 'style="grid-column:1/-1"' : ''}><span>${f.label}</span>${ctl}${f.help ? `<small class="muted">${f.help}</small>` : ''}</label>`; }).join('')}</div>`;
}
function editRecord(title, fields, rec, saveFn, extra = () => '') {
  UI.m = { rec: { ...rec } }; UI.m.save = saveFn;
  modal(() => ({ title, body: formFields('m.rec', fields, UI.m.rec) + extra(UI.m.rec), foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="rec.save">Save</button>` }));
}
ACT['rec.save'] = async () => { const rec = Object.fromEntries(Object.entries(UI.m.rec).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])); const r = await UI.m.save(rec); if (r?.ok) closeModal(); };

/* ---------------- Customers ---------------- */
const CUST_FIELDS = [{ k: 'name', label: 'Name' }, { k: 'kind', label: 'Type', opts: ['Individual', 'Business', 'Organization'] }, { k: 'email', label: 'Email', type: 'email' }, { k: 'phone', label: 'Phone' }, { k: 'address', label: 'Address', wide: true }];
PAGES.customers = () => {
  const open = groupBy(D.openSO, o => o.customer_id), all = groupBy(S.sales_orders, o => o.customer_id);
  return head('Customers', 'Customer accounts used on sales, sales orders and the customer portal. A customer who creates a portal login with the same email is linked to their record automatically.',
      `<button class="btn primary" data-act="cust.edit">Add customer</button>`) +
    `<div class="card flush">${table([{ h: 'Customer', c: c => `<b>${esc(c.name)}</b>` }, { h: 'Type', c: c => esc(c.kind || '') }, { h: 'Email', c: c => esc(c.email || '') }, { h: 'Phone', c: c => esc(c.phone || '') },
      { h: 'Address', c: c => esc(c.address || '') }, { h: 'Portal login', c: c => c.has_login ? badge('active', 'ok') : badge('none') },
      { h: 'Open orders', cls: 'num', c: c => open[c.id]?.length || 0 }, { h: 'Recent orders', cls: 'num', c: c => all[c.id]?.length || 0 },
      { h: '', c: c => `<button class="btn sm" data-act="cust.edit" data-id="${c.id}">Edit</button>` }], S.customers)}</div>`;
};
ACT['cust.edit'] = d => editRecord(d.id ? 'Edit customer' : 'Add customer', CUST_FIELDS, d.id ? D.cust[d.id] : { kind: 'Individual' }, rec => act('customer_save', { p: rec }, 'Customer saved'));

/* =====================================================================
   CUSTOMER PORTAL  (what a signed-in customer sees)
   ===================================================================== */
PAGES.portal = () => {
  const u = UI.portal ??= { tab: 'shop', loc: 2, cart: [], date: '', notes: '', cat: '', q: {} };
  const loc = S.locations.find(l => l.id === +u.loc) || S.locations[0];
  const cats = [...new Set(S.items.map(i => i.category))];
  const items = S.items.filter(i => !u.cat || i.category === u.cat), byId = Object.fromEntries(S.items.map(i => [i.id, i]));
  const sub = sum(u.cart, c => N(byId[c.id]?.price) * N(c.qty)), tax = round2(sub * N(S.tax_rate_pct) / 100);
  const waits = u.cart.filter(c => N(c.qty) > N(byId[c.id].stock[loc.id])).map(c => ({ it: byId[c.id], eta: byId[c.id].eta || S.today }));
  const ready = waits.map(w => w.eta).sort().pop();
  const avail = i => { const here = N(i.stock[loc.id]), other = S.locations.filter(l => l.id !== loc.id && N(i.stock[l.id]) > 0);
    return (here > 0 ? `<span class="badge ok">${qty(here)} available at ${esc(loc.name)}</span>` : `<span class="badge warn">${i.made_in_house ? 'Made to order' : 'Backordered'} · est. ready ${fdate(i.eta || S.today)}</span>`) +
      (other.length ? `<div class="muted small" style="margin-top:3px">Also at ${other.map(l => `${esc(l.name)} (${qty(i.stock[l.id])})`).join(', ')}</div>` : ''); };
  const shop = `<div class="shop"><div>
      <div class="filters">${field('Pick up at', sel('portal.loc', S.locations.map(l => [l.id, l.name]), u.loc, 'data-render'))}${field('Category', sel('portal.cat', [['', 'All jewelry'], ...cats], u.cat, 'data-render'))}</div>
      <p class="muted" style="margin-top:0">${esc(loc.name)} · ${esc(loc.address || '')}. Availability is live from our inventory system.</p>
      <div class="prods">${items.map(i => `<div class="prod"><div class="gem">${esc(i.category.toUpperCase())}</div><b>${esc(i.name)}</b><div class="muted small">${esc(i.description || '')}</div>
        <div class="p">${money(i.price)}</div><div>${avail(i)}</div>
        <div class="add">${inp(`portal.q.${i.id}`, u.q[i.id] ?? 1, 'type="number" min="1" step="1"')}<button class="btn primary" data-act="portal.add" data-id="${i.id}" style="flex:1;justify-content:center">Add to order</button></div></div>`).join('')}</div></div>
    <div class="card cart"><h2>Your pickup order</h2>
      ${u.cart.length ? u.cart.map((c, i) => `<div class="line"><div><b>${esc(byId[c.id].name)}</b><div class="ctl">Qty ${inp(`portal.cart.${i}.qty`, c.qty, 'type="number" min="1" step="1" data-render')}</div></div>
        <div class="right"><b>${money(N(byId[c.id].price) * N(c.qty))}</b><br><a class="small" data-act="portal.remove" data-i="${i}">remove</a></div></div>`).join('') : '<div class="empty">Your order is empty.</div>'}
      ${waits.length ? `<div class="note warn" style="margin-top:10px">${waits.map(w => `<b>${esc(w.it.name)}</b> is not fully in stock at ${esc(loc.name)}; estimated ready ${fdate(w.eta)}.`).join('<br>')}</div>` : ''}
      <div style="margin-top:10px">${field('Pickup location', `<input value="${esc(loc.name)}" disabled>`)}${field('Pickup date', inp('portal.date', u.date || (ready && ready > S.today ? ready : S.today), `type="date" min="${S.today}"`))}${field('Note to the store (optional)', inp('portal.notes', u.notes))}</div>
      <div class="totals"><div><span>Subtotal</span><span>${money(sub)}</span></div><div><span>Estimated tax</span><span>${money(tax)}</span></div><div class="grand"><span>Pay at pickup</span><span>${money(sub + tax)}</span></div></div>
      <button class="btn primary big" data-act="portal.place" ${u.cart.length ? '' : 'disabled'}>Place pickup order</button></div></div>`;
  const orders = `<div class="card flush">${table([{ h: 'Order', c: o => `<b>${o.number}</b>` }, { h: 'Placed', c: o => fdate(o.ts) }, { h: 'Pick up at', c: o => esc(o.location_name) }, { h: 'Pickup date', c: o => fdate(o.required_date) },
      { h: 'Items', c: o => o.lines.map(l => `${qty(l.qty)} × ${esc(l.name)}`).join('<br>') }, { h: 'Total before tax', cls: 'num', c: o => money(soValue(o)) },
      { h: 'Status', c: o => badge({ 'Order Placed': 'Order placed', Fulfilled: 'Ready for pickup', Closed: 'Picked up', Cancelled: 'Cancelled' }[o.status], soTone(o.status)) },
      { h: '', c: o => o.status === 'Order Placed' ? `<button class="btn sm danger" data-act="portal.cancel" data-id="${o.id}">Cancel</button>` : '' }], S.orders, { empty: 'You have not placed any orders yet.' })}</div>`;
  return `<div class="portal"><header class="top"><div class="brand">${GEM}<div>${esc(S.company)}<small>Customer portal</small></div></div>
      <div>${esc(S.me.name)} · <a data-act="auth.signout">Sign out</a></div></header>
    <div class="wrap">${tabs('portal.tab', [['shop', 'Shop & availability'], ['orders', `My orders (${S.orders.length})`]], u.tab)}${u.tab === 'shop' ? shop : orders}</div></div>`;
};
ACT['portal.add'] = d => { const u = UI.portal, id = +d.id, q = Math.max(1, N(u.q[id] ?? 1)); const line = u.cart.find(c => c.id === id);
  if (line) line.qty = N(line.qty) + q; else u.cart.push({ id, qty: q }); toast('Added to your order', 'ok'); render(); };
ACT['portal.remove'] = d => { UI.portal.cart.splice(+d.i, 1); render(); };
ACT['portal.place'] = async () => {
  const u = UI.portal, date = $('[data-model="portal.date"]')?.value || S.today;
  const r = await act('portal_place_order', { p_location: +u.loc, p_pickup: date, p_lines: u.cart.map(c => ({ item_id: c.id, qty: N(c.qty) })), p_notes: u.notes || null });
  if (r.ok) { Object.assign(u, { cart: [], notes: '', date: '', tab: 'orders' }); toast(`Order ${r.data.number} placed. We will have it ready for pickup.`, 'ok'); render(); }
};
ACT['portal.cancel'] = d => confirmBox('Cancel this order?', 'The store will be notified and the items released.', 'Cancel order', () => act('portal_cancel_order', { p_id: +d.id }, 'Order cancelled'));

/* =====================================================================
   Screens: Inventory, Production Orders, MRP, Purchase Orders,
   Suppliers & Scorecards, Ordering Rules
   ===================================================================== */
'use strict';
const TXN = { sale: 'Sale', po_receipt: 'PO receipt', production_issue: 'Issued to production', production_receipt: 'Production receipt', transfer_in: 'Transfer in',
  transfer_out: 'Transfer out', adjustment: 'Adjustment', return: 'Customer return', return_writeoff: 'Return write-off', opening: 'Opening balance', scrap_loss: 'Scrap loss' };
const kindLabel = i => D.isParent(i.id) ? 'Parent (made)' : i.kind === 'resale' ? 'Resale' : i.kind === 'finished' ? 'Finished' : 'Component';
const etaOf = i => i.eta || addDays(S.today, N(i.lead_time_days));
const txnTable = rows => table([{ h: 'When', c: t => ftime(t.ts) }, { h: 'Item', c: t => esc(D.item[t.item_id]?.name || '') }, { h: 'Location', c: t => esc(D.loc[t.location_id]?.code || '') },
  { h: 'Type', c: t => TXN[t.type] || t.type }, { h: 'Qty change', cls: 'num', c: t => `<span class="${N(t.qty_change) < 0 ? 'neg' : 'up'}">${N(t.qty_change) > 0 ? '+' : ''}${qty(t.qty_change)}</span>` },
  { h: 'Unit cost', cls: 'num', c: t => money(t.unit_cost) }, { h: 'Value', cls: 'num', c: t => money(t.amount) }, { h: 'Reason code', c: t => esc(t.reason_code || '') },
  { h: 'Reference', c: t => esc(t.ref || '') }, { h: 'By', c: t => esc(t.user_name || '') }], rows);

/* ---------------- Inventory ---------------- */
PAGES.inventory = () => {
  const u = UI.inv ??= { tab: 'stock', q: '', kind: '', low: false };
  const q = u.q.toLowerCase();
  const rows = S.items.filter(i => i.active && (!q || (i.name + ' ' + i.sku + ' ' + i.barcode).toLowerCase().includes(q)) &&
    (!u.kind || (u.kind === 'parent' ? D.isParent(i.id) : u.kind === 'component' ? i.kind === 'component' : i.kind === 'resale')) && (!u.low || D.stat[i.id].low || D.stat[i.id].out || D.backorder(i.id) > 0));
  const val = valuation();
  const stock = `<div class="kpis">${val.byLoc.map(l => `<div class="kpi"><div class="l">${esc(l.loc.name)}</div><div class="v">${money(l.value)}</div><div class="s">${qty(l.units)} units · ${esc(l.loc.kind)}</div></div>`).join('')}
      <div class="kpi"><div class="l">Total inventory value</div><div class="v">${money(val.total)}</div><div class="s">${D.lowCount} item(s) at or below reorder point</div></div></div>
    ${scanBar('Scan a barcode to count, adjust, transfer or receive that item')}
    <div class="filters">${inp('inv.q', u.q, 'placeholder="Search name, SKU or barcode…" data-render="live" style="min-width:240px"')}
      ${sel('inv.kind', [['', 'All item types'], ['parent', 'Parent items (made in-house)'], ['component', 'Components'], ['resale', 'Resale items']], u.kind, 'data-render')}
      <label><input type="checkbox" data-model="inv.low" data-render ${u.low ? 'checked' : ''}> Only low, out or backordered</label></div>
    <div class="card flush">${table([
      { h: 'SKU', c: i => `<span class="nowrap">${esc(i.sku)}</span>` }, { h: 'Item', c: i => itemCell(i, `<a data-act="inv.history" data-id="${i.id}"><b>${esc(i.name)}</b></a>`) },
      { h: 'Type', c: i => kindLabel(i) }, { h: 'ABC', c: i => badge(D.stat[i.id].abc, D.stat[i.id].abc === 'A' ? 'info' : '') },
      ...S.locations.map(l => ({ h: esc(l.code), cls: 'num', c: i => qty(D.qtyAt(i.id, l.id)) })),
      { h: 'On hand', cls: 'num', c: i => `<b>${qty(D.onHand(i.id))}</b>` },
      { h: 'Incoming', cls: 'num', c: i => D.stat[i.id].incoming ? qty(D.stat[i.id].incoming) : '' },
      { h: 'Backordered', cls: 'num', c: i => D.backorder(i.id) ? `<span class="neg bold">${qty(D.backorder(i.id))}</span>` : '' },
      { h: 'Est. available', c: i => (D.backorder(i.id) > 0 || D.onHand(i.id) <= 0) ? fdate(etaOf(i)) : '' },
      { h: 'Reorder pt', cls: 'num', c: i => qty(i.reorder_point) },
      { h: 'Status', c: i => D.stat[i.id].out ? badge('Out of stock', 'bad') : D.stat[i.id].low ? badge('Reorder', 'warn') : badge('OK', 'ok') },
      { h: 'Value', cls: 'num', c: i => money(D.onHand(i.id) * N(i.cost)) },
      { h: '', cls: 'nowrap', c: i => `<button class="btn sm" data-act="inv.adjust" data-id="${i.id}">Adjust</button> <button class="btn sm" data-act="inv.transfer" data-id="${i.id}">Transfer</button>` }
    ], rows, { empty: 'No items match these filters.' })}</div>
    <p class="muted small">Incoming = open purchase orders plus open production orders. Backordered = open sales order quantity that the order's location cannot cover. Est. available uses the next open purchase/production order, otherwise today plus the item's lead time. ABC ranks items by annual usage value; count A items most often.</p>`;
  return head('Inventory Management', 'On-hand quantity by item and location, transfers between locations, and adjustments with a reason code. Click an item name to see its full stock ledger.',
      `<button class="btn" data-act="inv.transfer">Transfer stock</button><button class="btn primary" data-act="inv.adjust">Adjust / cycle count</button>`) +
    tabs('inv.tab', [['stock', 'Stock by location'], ['txns', 'Recent stock movements']], u.tab) +
    (u.tab === 'stock' ? stock : `<div class="card flush">${txnTable(S.txns)}</div>`);
};
SCAN.inventory = item => ACT['inv.scanmenu']({ id: item.id });
ACT['inv.scanmenu'] = d => {
  const id = +d.id;
  modal(() => { const i = D.item[id]; const pos = S.purchase_orders.filter(p => p.status === 'Order Sent' && p.lines.some(l => l.item_id === id && N(l.qty_received) < N(l.qty_ordered)));
    return { title: `Scanned: ${esc(i.name)}`, body: `<p class="muted">${esc(i.sku)} · barcode ${esc(i.barcode)} · ${kindLabel(i)}</p>
      ${table([{ h: 'Location', c: l => esc(l.name) }, { h: 'On hand', cls: 'num', c: l => qty(D.qtyAt(id, l.id)) }], S.locations, { foot: `<tr><td>Total</td><td class="num">${qty(D.onHand(id))}</td></tr>` })}
      <div class="actions" style="margin-top:14px"><button class="btn primary" data-act="inv.adjust" data-id="${id}">Count / adjust</button><button class="btn" data-act="inv.transfer" data-id="${id}">Transfer</button>
      ${pos.map(p => `<button class="btn" data-act="po.receive" data-id="${p.id}" data-scan="${id}">Receive on ${p.number}</button>`).join('')}
      <button class="btn" data-act="inv.history" data-id="${id}">Stock ledger</button></div>` }; });
};
ACT['inv.adjust'] = d => {
  UI.m = { id: d.id || '', loc: d.loc || 1, mode: 'count', qty: '', reason: 'Cycle count', note: '' };
  modal(() => { const m = UI.m, have = m.id ? D.qtyAt(+m.id, +m.loc) : 0, delta = m.qty === '' ? 0 : m.mode === 'count' ? N(m.qty) - have : N(m.qty);
    return { title: 'Inventory adjustment', body: `${field('Item', sel('m.id', itemOpts(), m.id, 'data-render'))}
      <div class="frow">${field('Location', sel('m.loc', locOpts(), m.loc, 'data-render'))}${field('Method', sel('m.mode', [['count', 'Enter the counted quantity'], ['delta', 'Add or remove a quantity']], m.mode, 'data-render'))}</div>
      <div class="frow">${field(m.mode === 'count' ? 'Counted quantity' : 'Change (+ adds, - removes)', inp('m.qty', m.qty, 'type="number" step="1" data-render'))}
        ${field('Reason code (required)', sel('m.reason', ADJ_REASONS, m.reason))}</div>${field('Note', inp('m.note', m.note))}
      ${m.id ? `<div class="note ${delta < 0 ? 'warn' : ''}">System quantity at ${esc(D.loc[m.loc].name)}: <b>${qty(have)}</b>. This adjustment changes it by <b>${delta > 0 ? '+' : ''}${qty(delta)}</b> to <b>${qty(have + delta)}</b> (${money(delta * N(D.item[m.id].cost))} of inventory value).</div>` : ''}`,
      foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="inv.adjust.save">Post adjustment</button>` }; });
};
ACT['inv.adjust.save'] = async () => {
  const m = UI.m; if (!m.id) return toast('Choose an item', 'error'); if (m.qty === '') return toast('Enter a quantity', 'error');
  const delta = m.mode === 'count' ? N(m.qty) - D.qtyAt(+m.id, +m.loc) : N(m.qty);
  if (delta === 0) return toast('The count matches the system quantity. Nothing to adjust.', 'ok');
  const r = await act('inv_adjust', { p_item: +m.id, p_location: +m.loc, p_delta: delta, p_reason: m.reason, p_note: m.note || null }, 'Adjustment posted');
  if (r.ok) closeModal();
};
ACT['inv.transfer'] = d => {
  UI.m = { id: d.id || '', from: 1, to: 2, qty: '', note: '' };
  modal(() => { const m = UI.m; return { title: 'Transfer between locations', body: `${field('Item', sel('m.id', itemOpts(), m.id, 'data-render'))}
      <div class="frow">${field('From', sel('m.from', S.locations.map(l => [l.id, `${l.name}${m.id ? ' (' + qty(D.qtyAt(+m.id, l.id)) + ')' : ''}`]), m.from, 'data-render'))}
        ${field('To', sel('m.to', S.locations.map(l => [l.id, `${l.name}${m.id ? ' (' + qty(D.qtyAt(+m.id, l.id)) + ')' : ''}`]), m.to, 'data-render'))}
        ${field('Quantity', inp('m.qty', m.qty, 'type="number" min="1" step="1"'))}</div>${field('Note', inp('m.note', m.note))}`,
      foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="inv.transfer.save">Transfer</button>` }; });
};
ACT['inv.transfer.save'] = async () => {
  const m = UI.m; if (!m.id) return toast('Choose an item', 'error');
  const r = await act('inv_transfer', { p_item: +m.id, p_from: +m.from, p_to: +m.to, p_qty: N(m.qty), p_note: m.note || null }, 'Transfer complete');
  if (r.ok) closeModal();
};
ACT['inv.history'] = async d => {
  try { const rows = await rpc('item_ledger', { p_item: +d.id }); const i = D.item[d.id];
    modal(() => ({ title: `Stock ledger · ${esc(i.name)}`, body: `<p class="muted">Every movement of this item, newest first. On hand now: <b>${qty(D.onHand(i.id))}</b> · weighted average cost ${money(i.cost)}.</p>${txnTable(rows)}`, foot: `<button class="btn primary" data-act="modal.close">Done</button>` }), { size: 'wide' });
  } catch (e) { toast(e.message, 'error'); }
};

/* ---------------- Production Orders ---------------- */
const woTone = s => ({ Planned: 'info', 'In Process': 'warn', Completed: 'ok', Cancelled: '' }[s] || '');
const bomCheck = (itemId, q, loc) => (D.bomOf[itemId] || []).map(b => { const need = N(b.qty) * N(q), have = D.qtyAt(b.component_id, +loc); return { c: D.item[b.component_id], per: N(b.qty), need, have, short: Math.max(0, need - have) }; });
function prodMetrics(from, to) {
  const done = S.production_orders.filter(w => w.status === 'Completed' && dstr(w.finished_at) >= from && dstr(w.finished_at) <= to);
  const started = sum(done, w => w.qty_started), good = sum(done, w => w.qty_good), scrap = sum(done, w => w.qty_scrapped), rework = sum(done, w => w.qty_reworked);
  const hours = done.map(w => (new Date(w.finished_at) - new Date(w.started_at)) / 36e5);
  const onTime = done.filter(w => dstr(w.finished_at) <= w.due_date).length;
  const scrapCost = sum(done, w => N(w.qty_started) > 0 ? N(w.component_cost) / N(w.qty_started) * N(w.qty_scrapped) : 0);
  const reasons = {}; for (const w of done) if (w.reason_code) reasons[w.reason_code] = (reasons[w.reason_code] || 0) + N(w.qty_scrapped) + N(w.qty_reworked);
  const weeks = Math.max(1, (diffDays(to, from) + 1) / 7);
  return { done, started, good, scrap, rework, fpy: started ? (good - rework) / started * 100 : 0, yield: started ? good / started * 100 : 0, scrapRate: started ? scrap / started * 100 : 0,
    reworkRate: started ? rework / started * 100 : 0, cycle: hours.length ? sum(hours) / hours.length : 0, onTime: done.length ? onTime / done.length * 100 : 0, scrapCost, reasons, perWeek: good / weeks };
}
PAGES.production = () => {
  const u = UI.prod ??= { tab: 'orders', status: 'open', r: { range: '90' } };
  const actBtn = w => w.status === 'Planned' ? `<button class="btn sm primary" data-act="prod.issue" data-id="${w.id}">Issue components</button> <button class="btn sm" data-act="prod.cancel" data-id="${w.id}">Cancel</button>`
    : w.status === 'In Process' ? `<button class="btn sm primary" data-act="prod.complete" data-id="${w.id}">Complete</button>` : '';
  const cols = [{ h: 'Order', c: w => `<a data-act="prod.view" data-id="${w.id}"><b>${w.number}</b></a>` }, { h: 'Item', c: w => itemCell(D.item[w.item_id], esc(D.item[w.item_id].name)) }, { h: 'Location', c: w => esc(D.loc[w.location_id].code) },
    { h: 'Qty', cls: 'num', c: w => qty(w.qty_planned) }, { h: 'Status', c: w => badge(w.status, woTone(w.status)) }, { h: 'Due', c: w => fdate(w.due_date) + (['Planned', 'In Process'].includes(w.status) && w.due_date < S.today ? ' ' + badge('late', 'bad') : '') },
    { h: 'Started', c: w => ftime(w.started_at) }, { h: 'Finished', c: w => ftime(w.finished_at) },
    { h: 'Good', cls: 'num', c: w => w.qty_good == null ? '' : qty(w.qty_good) }, { h: 'Scrap', cls: 'num', c: w => w.qty_scrapped == null ? '' : qty(w.qty_scrapped) }, { h: 'Rework', cls: 'num', c: w => w.qty_reworked == null ? '' : qty(w.qty_reworked) },
    { h: 'Quality reason', c: w => esc(w.reason_code || '') }, { h: 'Unit cost', cls: 'num', c: w => w.unit_cost == null ? '' : money(w.unit_cost) }];
  let body;
  if (u.tab === 'orders') {
    const rows = S.production_orders.filter(w => u.status === 'all' || (u.status === 'open' ? ['Planned', 'In Process'].includes(w.status) : w.status === u.status));
    body = `<div class="filters">${sel('prod.status', [['open', 'Open (planned and in process)'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled'], ['all', 'All orders']], u.status, 'data-render')}</div>
      <div class="card flush">${table([...cols, { h: '', cls: 'nowrap', c: actBtn }], rows.slice(0, 150), { empty: 'No production orders with this status.' })}</div>`;
  } else {
    const [from, to] = pickRange(u.r), m = prodMetrics(from, to);
    const byItem = Object.entries(groupBy(m.done, w => w.item_id)).map(([id, ws]) => ({ item: D.item[id], n: ws.length, started: sum(ws, w => w.qty_started), good: sum(ws, w => w.qty_good), scrap: sum(ws, w => w.qty_scrapped), rework: sum(ws, w => w.qty_reworked), cost: sum(ws, w => w.component_cost) }));
    body = `<div class="filters">${rangeCtl('prod.r', u.r)} <span class="muted">${fdate(from)} to ${fdate(to)} · orders finished in this period</span></div>
      <div class="kpis"><div class="kpi"><div class="l">Orders completed</div><div class="v">${m.done.length}</div><div class="s">${qty(m.good)} good units · ${num(m.perWeek, 1)} per week</div></div>
        <div class="kpi"><div class="l">First-pass yield</div><div class="v">${pct(m.fpy)}</div><div class="s">good without rework ÷ started</div></div>
        <div class="kpi"><div class="l">Scrap rate</div><div class="v">${pct(m.scrapRate)}</div><div class="s">${qty(m.scrap)} scrapped · ${money(m.scrapCost)} of material</div></div>
        <div class="kpi"><div class="l">Rework rate</div><div class="v">${pct(m.reworkRate)}</div><div class="s">${qty(m.rework)} units reworked</div></div>
        <div class="kpi"><div class="l">Average cycle time</div><div class="v">${num(m.cycle, 1)} h</div><div class="s">start to finish per order</div></div>
        <div class="kpi"><div class="l">On-time completion</div><div class="v">${pct(m.onTime)}</div><div class="s">finished on or before due date</div></div></div>
      <div class="grid g23"><div class="card flush"><h2>By product</h2>${table([{ h: 'Item', c: r => esc(r.item.name) }, { h: 'Orders', cls: 'num', c: r => r.n }, { h: 'Started', cls: 'num', c: r => qty(r.started) }, { h: 'Good', cls: 'num', c: r => qty(r.good) },
          { h: 'Scrap', cls: 'num', c: r => qty(r.scrap) }, { h: 'Rework', cls: 'num', c: r => qty(r.rework) }, { h: 'Yield', cls: 'num', c: r => pct(r.started ? r.good / r.started * 100 : 0) },
          { h: 'First-pass yield', cls: 'num', c: r => pct(r.started ? (r.good - r.rework) / r.started * 100 : 0) }, { h: 'Avg unit cost', cls: 'num', c: r => money(r.good ? r.cost / r.good : 0) }], byItem)}</div>
        <div class="card"><h2>Quality issues by reason code (units)</h2>${hbars(Object.entries(m.reasons).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v })))}</div></div>
      <div class="card flush"><h2>Production orders in this period</h2>${table(cols, m.done.slice(0, 200))}</div>`;
  }
  return head('Production Orders', 'Build parent items from their bill of material. <b>Issuing</b> an order consumes the components from inventory; <b>completing</b> it receives the finished item at a cost rolled up from the components actually used.',
      `<button class="btn primary" data-act="prod.new">New production order</button>`) + tabs('prod.tab', [['orders', 'Orders'], ['report', 'Production & quality report']], u.tab) + body;
};
ACT['prod.new'] = d => {
  UI.m = { item: d.item || '', qty: d.qty || 10, loc: 1, due: d.due || '', notes: '' };
  modal(() => { const m = UI.m, it = D.item[m.item], chk = it ? bomCheck(+m.item, m.qty, m.loc) : [], cost = sum(chk, c => c.need * N(c.c.cost));
    return { title: 'New production order', body: `${field('Item to make (parent items only)', sel('m.item', itemOpts(i => D.isParent(i.id), 'Choose a parent item…'), m.item, 'data-render'))}
      <div class="frow">${field('Quantity', inp('m.qty', m.qty, 'type="number" min="1" step="1" data-render'))}${field('Build at', sel('m.loc', locOpts(), m.loc, 'data-render'))}
        ${field('Due date', inp('m.due', m.due || (it ? addDays(S.today, N(it.lead_time_days)) : ''), 'type="date"'))}</div>${field('Notes', inp('m.notes', m.notes))}
      ${it ? `<h3>Component requirements (bill of material × quantity)</h3>${table([{ h: 'Component', c: c => esc(c.c.name) }, { h: 'Per unit', cls: 'num', c: c => qty(c.per) }, { h: 'Required', cls: 'num', c: c => qty(c.need) },
          { h: 'On hand here', cls: 'num', c: c => qty(c.have) }, { h: '', c: c => c.short ? badge(`short ${qty(c.short)}`, 'bad') : badge('ok', 'ok') }, { h: 'Cost', cls: 'num', c: c => money(c.need * N(c.c.cost)) }], chk,
          { foot: `<tr><td colspan="5">Rolled-up material cost (${money(N(m.qty) ? cost / N(m.qty) : 0)} per unit)</td><td class="num">${money(cost)}</td></tr>` })}
        ${chk.some(c => c.short) ? '<div class="note warn" style="margin-top:10px">Some components are short at this location. You can still create the order now and issue it after the components arrive.</div>' : ''}` : ''}`,
      foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="prod.save">Create order</button>` }; }, { size: 'wide' });
};
ACT['prod.save'] = async () => {
  const m = UI.m; if (!m.item) return toast('Choose an item to make', 'error');
  const due = $('[data-model="m.due"]')?.value || null;
  const r = await act('prod_create', { p_item: +m.item, p_location: +m.loc, p_qty: N(m.qty), p_due: due, p_notes: m.notes || null }, 'Production order created');
  if (r.ok) { closeModal(); UI.prod = { ...(UI.prod || {}), tab: 'orders', status: 'open', r: UI.prod?.r || { range: '90' } }; if (ROUTE !== 'production') go('production'); else render(); }
};
ACT['prod.issue'] = d => act('prod_issue', { p_id: +d.id }, 'Components issued from inventory - order is now in process');
ACT['prod.cancel'] = d => confirmBox('Cancel this production order?', 'No components have been issued, so inventory is not affected.', 'Cancel order', () => act('prod_cancel', { p_id: +d.id }, 'Order cancelled'));
ACT['prod.complete'] = d => {
  const w = S.production_orders.find(x => x.id === +d.id); UI.m = { id: w.id, good: N(w.qty_started), scrap: 0, rework: 0, reason: '' };
  modal(() => { const m = UI.m, unit = N(m.good) > 0 ? N(w.component_cost) / N(m.good) : 0, bal = N(m.good) + N(m.scrap) === N(w.qty_started);
    return { title: `Complete ${w.number} · ${esc(D.item[w.item_id].name)}`, body: `<p>Quantity started: <b>${qty(w.qty_started)}</b> · started ${ftime(w.started_at)} · components issued ${money(w.component_cost)}</p>
      <div class="frow">${field('Completed good', inp('m.good', m.good, 'type="number" min="0" step="1" data-render'))}${field('Scrapped', inp('m.scrap', m.scrap, 'type="number" min="0" step="1" data-render'))}
        ${field('Reworked (of the good units)', inp('m.rework', m.rework, 'type="number" min="0" step="1" data-render'))}</div>
      ${field('Quality reason code (required if any scrap or rework)', sel('m.reason', [['', 'None'], ...QUALITY_REASONS], m.reason))}
      <div class="note ${bal ? '' : 'bad'}">${bal ? `Finished unit cost = ${money(w.component_cost)} ÷ ${qty(m.good)} good = <b>${money(unit)}</b> each. Scrapped material is absorbed into the good units.` : `Good + scrapped must equal the quantity started (${qty(w.qty_started)}).`}</div>`,
      foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="prod.complete.save">Complete order</button>` }; });
};
ACT['prod.complete.save'] = async () => {
  const m = UI.m; const r = await act('prod_complete', { p_id: m.id, p_good: N(m.good), p_scrapped: N(m.scrap), p_reworked: N(m.rework), p_reason: m.reason || null }, 'Order completed - finished goods received into inventory');
  if (r.ok) closeModal();
};
ACT['prod.view'] = d => modal(() => { const w = S.production_orders.find(x => x.id === +d.id); if (!w) return null;
  return { title: `${w.number} · ${badge(w.status, woTone(w.status))}`, body: `<dl class="kv"><dt>Item</dt><dd>${esc(D.item[w.item_id].name)}</dd><dt>Location</dt><dd>${esc(D.loc[w.location_id].name)}</dd><dt>Quantity planned</dt><dd>${qty(w.qty_planned)}</dd>
      <dt>Created</dt><dd>${ftime(w.created_at)} by ${esc(w.created_by || '')}</dd><dt>Due</dt><dd>${fdate(w.due_date)}</dd><dt>Started</dt><dd>${ftime(w.started_at)}</dd><dt>Finished</dt><dd>${ftime(w.finished_at)}</dd>
      ${w.status === 'Completed' ? `<dt>Result</dt><dd>${qty(w.qty_good)} good · ${qty(w.qty_scrapped)} scrapped · ${qty(w.qty_reworked)} reworked ${w.reason_code ? '(' + esc(w.reason_code) + ')' : ''}</dd><dt>Finished unit cost</dt><dd>${money(w.unit_cost)}</dd>` : ''}${w.notes ? `<dt>Notes</dt><dd>${esc(w.notes)}</dd>` : ''}</dl><br>
      <h3>${w.issues.length ? 'Components issued (actual)' : 'Components required'}</h3>
      ${w.issues.length ? table([{ h: 'Component', c: x => esc(D.item[x.component_id].name) }, { h: 'Qty issued', cls: 'num', c: x => qty(x.qty) }, { h: 'Unit cost', cls: 'num', c: x => money(x.unit_cost) }, { h: 'Cost', cls: 'num', c: x => money(N(x.qty) * N(x.unit_cost)) }], w.issues,
          { foot: `<tr><td colspan="3">Total component cost</td><td class="num">${money(w.component_cost)}</td></tr>` })
        : table([{ h: 'Component', c: c => esc(c.c.name) }, { h: 'Required', cls: 'num', c: c => qty(c.need) }, { h: 'On hand', cls: 'num', c: c => qty(c.have) }, { h: '', c: c => c.short ? badge(`short ${qty(c.short)}`, 'bad') : badge('ok', 'ok') }], bomCheck(w.item_id, w.qty_planned, w.location_id))}`,
    foot: `<button class="btn primary" data-act="modal.close">Done</button>` }; }, { size: 'wide' });

/* ---------------- MRP ---------------- */
function mrpRecord(r, weeks) {
  const it = r.item, row = (label, a, o = {}) => `<tr class="${o.cls || ''}"><td>${label}</td><td class="${o.start == null ? 'z' : ''}">${o.start == null ? '' : qty(o.start)}</td>${weeks.map(w => {
    const v = a[w.n]; const late = o.late && w.n === 1 && r.lateRel > 0;
    return `<td class="${late ? 'late' : !v && !o.always ? 'z' : ''}" ${late ? 'title="Past due: this order should already have been released"' : ''}>${v || o.always ? qty(v) : ''}${late ? ' ⚠' : ''}</td>`; }).join('')}</tr>`;
  return `<div class="mrphead"><div><b>${esc(it.name)}</b> <span class="muted">${esc(it.sku)} · ${r.level === 0 ? 'parent item (make)' : 'component (buy from ' + esc(D.sup[it.supplier_id]?.name || 'supplier') + ')'}</span></div>
      <span class="muted small" title="${esc(r.src.join('\n'))}">Where the gross requirements come from: ${esc(r.src.slice(0, 2).join('; '))}${r.src.length > 2 ? ` +${r.src.length - 2} more` : ''}</span></div>
    <div class="tblwrap"><table class="mrp"><thead><tr><th>LT = ${r.ltW} wk (${qty(it.lead_time_days)} days) · Q: ${r.lot > 1 ? 'FOQ ' + qty(r.lot) : 'L4L'}</th><th>Start</th>${weeks.map(w => `<th>${w.n}<small>${fshort(w.start)}</small></th>`).join('')}</tr></thead><tbody>
      ${row('Gross requirements', r.gross)}${row('Scheduled receipts', r.sched)}${row('Projected on hand', r.poh, { start: r.poh[0], always: true })}
      ${row('Net requirements', r.net)}${row('Planned order receipts', r.por)}${row('Planned order releases', r.rel, { cls: 'rel', late: true })}</tbody></table></div>`;
}
PAGES.mrp = () => {
  const u = UI.mrp ??= { weeks: 4, surge: 0, sel: {}, method: 'direct' }; u.method ??= 'direct'; const m = mrp(+u.weeks, N(u.surge));
  const buys = m.planned.filter(p => !p.make), makes = m.planned.filter(p => p.make);
  const key = p => p.item.id + '_' + p.week, on = p => u.sel[key(p)] !== false;
  return head('Material Requirements Planning (MRP)', u.method === 'direct' ? 'Parent quantities on confirmed sales orders are multiplied through each bill of material to get component requirements. On-hand component inventory and quantities already on open purchase orders are subtracted, and what is left is a suggested order with an order-by date backed off from the requirement date by the component’s lead time.' : 'Standard MRP netting: confirmed parent orders are first covered by finished stock and open production orders. Only the builds still needed are multiplied through each bill of material, then component requirements are netted against on-hand stock and open purchase orders.') + `
    <div class="card"><div class="filters" style="margin:0">${field('Planning method', sel('mrp.method', [['direct', 'Explode every confirmed parent order (assignment method)'], ['net', 'Use finished stock first, then explode (standard netting)']], u.method, 'data-render'))}${field('Planning horizon', sel('mrp.weeks', [[4, '4 weeks'], [6, '6 weeks'], [8, '8 weeks']], u.weeks, 'data-render'))}
      <label class="f" style="min-width:300px"><span>What-if: demand surge on open orders (+${N(u.surge)}%)</span><input type="range" min="0" max="100" step="10" data-model="mrp.surge" data-render value="${N(u.surge)}" style="width:100%"></label>
      <span class="muted small" style="max-width:420px">Week 1 starts today (${fdate(S.today)}). Drag the slider to see how a bigger game-day or holiday rush would change what you need to build and buy. Nothing is saved until you create orders.${m.beyond ? ` ${m.beyond} order line(s) fall beyond this horizon.` : ''}</span></div></div>
    ${N(u.surge) ? `<div class="note warn">What-if mode: gross requirements are inflated by ${N(u.surge)}%. Set the slider back to 0% to plan from actual confirmed orders.</div>` : ''}
    <div>
      <div class="card flush"><div class="cardhead"><h2>Suggested purchase orders</h2><button class="btn sm primary" data-act="mrp.createpos" ${buys.some(on) ? '' : 'disabled'}>Create draft POs for checked</button></div>
        ${table([{ h: '', c: p => `<input type="checkbox" data-model="mrp.sel.${key(p)}" data-render ${on(p) ? 'checked' : ''}>` }, { h: 'Component', c: p => itemCell(p.item, esc(p.item.name)) }, { h: 'Supplier', c: p => esc(D.sup[p.item.supplier_id]?.name || '—') },
          { h: 'Order qty', cls: 'num', c: p => `<b>${qty(p.qty)}</b>` }, { h: 'Needed by', c: p => `wk ${p.week} · ${fshort(p.need)}` }, { h: 'Lead time', cls: 'num', c: p => qty(p.item.lead_time_days) + ' d' },
          { h: 'Order by', c: p => p.late ? `${fshort(p.by)} ${badge('order now', 'bad')}` : `<b>${fshort(p.by)}</b>` }], buys, { empty: 'No purchases needed: on-hand stock and open purchase orders cover every requirement.' })}</div>
      <div class="card flush"><div class="cardhead"><h2>${m.direct ? 'Builds implied by confirmed orders' : 'Suggested production orders'}</h2>${m.direct ? '<span class="muted small">Assignment method: every ordered unit is planned as a build (finished stock is not used). Switch to standard netting to see only the builds still needed.</span>' : ''}</div>
        ${table([{ h: 'Parent item', c: p => itemCell(p.item, esc(p.item.name)) }, { h: 'Build qty', cls: 'num', c: p => `<b>${qty(p.qty)}</b>` }, { h: 'Needed by', c: p => `wk ${p.week} · ${fshort(p.need)}` },
          { h: 'Start by', c: p => p.late ? `${fshort(p.by)} ${badge('start now', 'bad')}` : `<b>${fshort(p.by)}</b>` },
          { h: '', c: p => `<button class="btn sm" data-act="prod.new" data-item="${p.item.id}" data-qty="${p.qty}" data-due="${p.need < S.today ? S.today : p.need}">Create order</button>` }], makes, { empty: 'No builds needed: finished stock and open production orders cover all confirmed orders.' })}</div>
    </div>
    <div class="card"><h2>MRP records · parent items (level 0)</h2><p class="muted" style="margin-top:0">Gross requirements = confirmed sales orders by required week. ${m.direct ? 'In the assignment method finished stock and open production orders are not netted, so every ordered unit is planned as a build and its components are required.' : 'Starting on hand = finished stock at all locations. Scheduled receipts = open production orders.'}</p>
      ${m.parents.map(r => mrpRecord(r, m.weeks)).join('') || '<div class="empty">No confirmed sales orders for parent items in this horizon.</div>'}</div>
    <div class="card"><h2>MRP records · components (level 1)</h2><p class="muted" style="margin-top:0">Gross requirements = planned order releases of each parent × quantity per unit from the bill of material. Scheduled receipts = open purchase orders.</p>
      ${m.comps.map(r => mrpRecord(r, m.weeks)).join('') || '<div class="empty">No component requirements in this horizon.</div>'}</div>`;
};
async function createDraftPOs(lines) {     // lines: [{item, qty}] -> one draft PO per supplier
  const bySup = groupBy(lines.filter(l => l.item.supplier_id && l.qty > 0), l => l.item.supplier_id); const made = [];
  try {
    for (const [sup, ls] of Object.entries(bySup)) { const agg = {}; for (const l of ls) agg[l.item.id] = (agg[l.item.id] || 0) + l.qty;
      const r = await rpc('po_create', { p_supplier: +sup, p_location: 1, p_lines: Object.entries(agg).map(([id, q]) => ({ item_id: +id, qty: q })), p_notes: 'Created from planning suggestions', p_send: false });
      made.push(r.number); }
  } catch (e) { toast(e.message, 'error'); }
  await refresh();
  if (made.length) { toast(`Created ${made.length} draft purchase order(s): ${made.join(', ')}. Review and send them.`, 'ok'); UI.po = { status: 'Draft' }; go('purchasing'); }
  else toast('Nothing to order: check that the items have a supplier', 'error');
}
ACT['mrp.createpos'] = () => { const u = UI.mrp, m = mrp(+u.weeks, N(u.surge)); createDraftPOs(m.planned.filter(p => !p.make && u.sel[p.item.id + '_' + p.week] !== false).map(p => ({ item: p.item, qty: p.qty }))); };

/* ---------------- Purchase Orders ---------------- */
const poTone = s => ({ Draft: '', 'Order Sent': 'info', Received: 'warn', Closed: 'ok' }[s] || '');
const poFill = p => { const o = sum(p.lines, l => l.qty_ordered); return o ? sum(p.lines, l => l.qty_received) / o * 100 : 0; };
function poPay(p) {
  if (p.paid_at) return `${badge('paid', 'ok')} ${fshort(p.paid_at)}`;
  if (!p.first_receipt_date) return '<span class="muted">—</span>';
  const dd = diffDays(p.due_date, S.today);
  return `${money(poRecValue(p))} due ${fshort(p.due_date)} ${dd < 0 ? badge(`${-dd} d overdue`, 'bad') : badge(`in ${dd} d`, dd <= 7 ? 'warn' : '')}`;
}
PAGES.purchasing = () => {
  const u = UI.po ??= { status: 'open' };
  const rows = S.purchase_orders.filter(p => u.status === 'all' || (u.status === 'open' ? ['Draft', 'Order Sent'].includes(p.status) : p.status === u.status));
  const cnt = groupBy(S.purchase_orders, p => p.status);
  return head('Purchase Orders', 'Create and send purchase orders, then receive against them. Status moves <b>Order Sent → Received → Closed</b>. The expected receipt date is calculated from the supplier’s quoted lead time and compared with the actual receipt date.',
      `<button class="btn primary" data-act="po.new">New purchase order</button>`) +
    tabs('po.status', [['open', `Open (${(cnt.Draft?.length || 0) + (cnt['Order Sent']?.length || 0)})`], ['Draft', 'Draft'], ['Order Sent', 'Order Sent'], ['Received', `Received (${cnt.Received?.length || 0})`], ['Closed', 'Closed'], ['all', 'All']], u.status) +
    `<div class="card flush">${table([
      { h: 'PO', c: p => `<a data-act="po.view" data-id="${p.id}"><b>${p.number}</b></a>` }, { h: 'Supplier', c: p => esc(D.sup[p.supplier_id].name) }, { h: 'Status', c: p => badge(p.status === 'Order Sent' && p.first_receipt_date ? 'Order Sent · partial' : p.status, poTone(p.status)) },
      { h: 'Sent', c: p => fdate(p.sent_at) }, { h: 'Expected', c: p => fdate(p.expected_date) + (p.status === 'Order Sent' && p.expected_date < S.today ? ' ' + badge(`${diffDays(S.today, p.expected_date)} d late`, 'bad') : '') },
      { h: 'Received', c: p => fdate(p.received_date) },
      { h: 'vs expected', c: p => { if (!p.received_date) return ''; const v = diffDays(p.received_date, p.expected_date); return v > 0 ? badge(`${v} d late`, 'bad') : v < 0 ? badge(`${-v} d early`, 'ok') : badge('on time', 'ok'); } },
      { h: 'Lines', cls: 'num', c: p => p.lines.length }, { h: 'Ordered', cls: 'num', c: p => money(poValue(p)) },
      { h: 'Fill', cls: 'num', c: p => p.first_receipt_date || p.received_date ? pct(poFill(p), 0) : '' }, { h: 'Payment', c: poPay },
      { h: '', cls: 'nowrap', c: p => p.status === 'Draft' ? `<button class="btn sm primary" data-act="po.act" data-id="${p.id}" data-a="send">Send</button> <button class="btn sm" data-act="po.act" data-id="${p.id}" data-a="delete">Delete</button>`
          : p.status === 'Order Sent' ? `<button class="btn sm primary" data-act="po.receive" data-id="${p.id}">Receive</button>`
          : (p.paid_at ? '' : `<button class="btn sm" data-act="po.act" data-id="${p.id}" data-a="pay">Record payment</button> `) + (p.status === 'Received' ? `<button class="btn sm primary" data-act="po.act" data-id="${p.id}" data-a="close">Close</button>` : '') }
    ], rows.slice(0, 200), { empty: 'No purchase orders with this status.' })}</div>`;
};
ACT['po.new'] = () => {
  UI.m = { sup: '', loc: 1, notes: '', lines: [{ item_id: '', qty: 1 }] };
  modal(() => { const m = UI.m, s = D.sup[m.sup], total = sum(m.lines, l => N(l.qty) * N(l.unit_cost ?? D.item[l.item_id]?.cost));
    return { title: 'New purchase order', body: `<div class="frow">${field('Supplier', sel('m.sup', [['', 'Choose a supplier…'], ...S.suppliers.filter(x => x.active).map(x => [x.id, x.name])], m.sup, 'data-render'))}${field('Receive at', sel('m.loc', locOpts(), m.loc))}</div>
      ${s ? `<div class="note">Quoted lead time <b>${s.lead_time_days} days</b> → expected receipt <b>${fdate(addDays(S.today, N(s.lead_time_days)))}</b> if sent today · payment terms <b>Net ${s.terms_days}</b></div>` : ''}
      ${linesEditor('m.lines', m.lines, { cost: true, filter: i => i.kind !== 'finished' && (!m.sup || i.supplier_id === +m.sup) })}${field('Notes to supplier', inp('m.notes', m.notes))}
      <p class="right bold">Order total ${money(total)}</p>`,
      foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn" data-act="po.save">Save as draft</button><button class="btn primary" data-act="po.save" data-send="1">Save and send to supplier</button>` }; }, { size: 'wide' });
};
ACT['po.save'] = async d => {
  const m = UI.m; if (!m.sup) return toast('Choose a supplier', 'error');
  const r = await act('po_create', { p_supplier: +m.sup, p_location: +m.loc, p_lines: cleanLines(m.lines), p_notes: m.notes || null, p_send: !!d.send }, d.send ? 'Purchase order sent' : 'Draft saved');
  if (r.ok) { UI.po = { status: 'open' }; ACT['po.view']({ id: r.data.id }); }
};
ACT['po.act'] = async d => {
  if (d.a === 'delete') return confirmBox('Delete this draft?', 'The draft purchase order will be removed.', 'Delete', () => act('po_action', { p_id: +d.id, p_action: 'delete' }, 'Draft deleted'));
  const r = await act('po_action', { p_id: +d.id, p_action: d.a }, { send: 'Purchase order sent to supplier', pay: 'Payment recorded', close: 'Purchase order closed' }[d.a]);
  if (r.ok && d.a === 'send') ACT['po.view']({ id: d.id });
};
ACT['po.view'] = d => modal(() => { const p = S.purchase_orders.find(x => x.id === +d.id); if (!p) return null; const s = D.sup[p.supplier_id];
  const mail = `mailto:${encodeURIComponent(s.email || '')}?subject=${encodeURIComponent(`Purchase order ${p.number} from ${S.settings.company_name}`)}&body=${encodeURIComponent(
    `Hello ${s.contact_name || s.name},\n\nPlease supply the following on purchase order ${p.number}:\n\n` + p.lines.map(l => `  ${qty(l.qty_ordered)} x ${D.item[l.item_id].name} (${D.item[l.item_id].sku}) @ ${money(l.unit_cost)}`).join('\n') +
    `\n\nOrder total: ${money(poValue(p))}\nDeliver to: ${D.loc[p.location_id].name}, ${D.loc[p.location_id].address}\nExpected by: ${fdate(p.expected_date)} (quoted lead time ${s.lead_time_days} days)\nTerms: Net ${s.terms_days}\n\nThank you,\n${S.settings.company_name}`)}`;
  return { title: `Purchase order ${p.number} · ${badge(p.status, poTone(p.status))}`, body: `<div class="grid g2"><dl class="kv"><dt>Supplier</dt><dd><b>${esc(s.name)}</b><br>${esc(s.contact_name || '')} · ${esc(s.email || '')}</dd><dt>Deliver to</dt><dd>${esc(D.loc[p.location_id].name)}</dd><dt>Terms</dt><dd>Net ${s.terms_days}</dd>${p.notes ? `<dt>Notes</dt><dd>${esc(p.notes)}</dd>` : ''}</dl>
      <dl class="kv"><dt>Created</dt><dd>${ftime(p.created_at)} by ${esc(p.created_by || '')}</dd><dt>Sent</dt><dd>${ftime(p.sent_at)}</dd><dt>Expected</dt><dd>${fdate(p.expected_date)} <span class="muted">(sent date + ${s.lead_time_days}-day quoted lead time)</span></dd>
        <dt>Received</dt><dd>${p.received_date ? `${fdate(p.received_date)} · actual lead time ${diffDays(p.received_date, dstr(p.sent_at))} days` : '—'}</dd><dt>Payment</dt><dd>${poPay(p)}</dd></dl></div><br>
      ${table([{ h: 'Item', c: l => esc(D.item[l.item_id].name) }, { h: 'SKU', c: l => esc(D.item[l.item_id].sku) }, { h: 'Ordered', cls: 'num', c: l => qty(l.qty_ordered) }, { h: 'Received', cls: 'num', c: l => qty(l.qty_received) },
        { h: 'Outstanding', cls: 'num', c: l => qty(Math.max(0, N(l.qty_ordered) - N(l.qty_received))) }, { h: 'Unit cost', cls: 'num', c: l => money(l.unit_cost) }, { h: 'Amount', cls: 'num', c: l => money(N(l.qty_ordered) * N(l.unit_cost)) }], p.lines,
        { foot: `<tr><td colspan="6">Order total</td><td class="num">${money(poValue(p))}</td></tr>` })}
      ${p.receipts.length ? `<h3 style="margin-top:14px">Receipts</h3>${table([{ h: 'Date', c: r => ftime(r.ts) }, { h: 'Item', c: r => esc(D.item[p.lines.find(l => l.id === r.po_line_id)?.item_id]?.name || '') }, { h: 'Qty', cls: 'num', c: r => qty(r.qty) }, { h: 'Into', c: r => esc(D.loc[r.location_id].name) }, { h: 'By', c: r => esc(r.received_by || '') }], p.receipts)}` : ''}`,
    foot: (p.status === 'Draft' ? `<button class="btn primary" data-act="po.act" data-id="${p.id}" data-a="send">Send to supplier</button>` : '') + (p.status === 'Order Sent' ? `<a class="btn" href="${mail}">Email supplier</a><button class="btn primary" data-act="po.receive" data-id="${p.id}">Receive items</button>` : '') +
      `<button class="btn" data-act="print">Print</button><button class="btn" data-act="modal.close">Done</button>` }; }, { size: 'wide' });
ACT['po.receive'] = d => {
  const id = +d.id, p0 = S.purchase_orders.find(x => x.id === id); UI.m = { id, loc: p0.location_id, final: false, q: {} };
  const bump = item => { const p = S.purchase_orders.find(x => x.id === id), l = p.lines.find(x => x.item_id === item.id && N(x.qty_ordered) - N(x.qty_received) > N(UI.m.q[x.id]));
    if (!l) return toast(`${item.name} is not outstanding on ${p.number}`, 'error'); UI.m.q[l.id] = N(UI.m.q[l.id]) + 1; toast(`+1 ${item.name}`, 'ok'); renderModal(); };
  if (d.scan) { const it = D.item[d.scan]; const l = p0.lines.find(x => x.item_id === +d.scan); if (it && l) UI.m.q[l.id] = 1; }
  modal(() => { const p = S.purchase_orders.find(x => x.id === id), m = UI.m; if (!p) return null;
    return { title: `Receive ${p.number} · ${esc(D.sup[p.supplier_id].name)}`, body: `${scanBar('Scan items as you unpack them (each scan adds 1), or type quantities below', 'm.scan')}
      <p class="muted">Expected ${fdate(p.expected_date)} · today is ${fdate(S.today)} ${p.expected_date < S.today ? badge(`${diffDays(S.today, p.expected_date)} days late`, 'bad') : badge('on time', 'ok')}</p>
      ${table([{ h: 'Item', c: l => esc(D.item[l.item_id].name) }, { h: 'Barcode', c: l => esc(D.item[l.item_id].barcode) }, { h: 'Ordered', cls: 'num', c: l => qty(l.qty_ordered) }, { h: 'Already received', cls: 'num', c: l => qty(l.qty_received) },
        { h: 'Outstanding', cls: 'num', c: l => qty(N(l.qty_ordered) - N(l.qty_received)) },
        { h: 'Receive now', cls: 'num', c: l => N(l.qty_ordered) - N(l.qty_received) > 0 ? inp(`m.q.${l.id}`, m.q[l.id], `type="number" min="0" max="${N(l.qty_ordered) - N(l.qty_received)}" step="1" class="q" placeholder="0"`) : badge('complete', 'ok') }], p.lines)}
      <p><button class="btn sm" data-act="po.fill" data-id="${p.id}">Fill in all outstanding quantities</button></p>
      <div class="frow">${field('Receive into location', sel('m.loc', locOpts(), m.loc))}<label class="f"><span>Short shipment?</span><input type="checkbox" data-model="m.final" ${m.final ? 'checked' : ''} style="width:16px"> Supplier will not send the rest - mark the PO Received</label></div>`,
      foot: `<button class="btn" data-act="modal.close">Cancel</button><button class="btn primary" data-act="po.receive.save">Post receipt</button>` }; }, { size: 'wide' });
  UI.scanHandler = bump;
};
ACT['po.fill'] = d => { const p = S.purchase_orders.find(x => x.id === +d.id); for (const l of p.lines) { const o = N(l.qty_ordered) - N(l.qty_received); if (o > 0) UI.m.q[l.id] = o; } renderModal(); };
ACT['po.receive.save'] = async () => {
  const m = UI.m, lines = Object.entries(m.q).filter(([, q]) => N(q) > 0).map(([id, q]) => ({ line_id: +id, qty: N(q) }));
  const r = await act('po_receive', { p_id: m.id, p_lines: lines, p_location: +m.loc, p_final: !!m.final }, 'Receipt posted - inventory and average cost updated');
  if (r.ok) closeModal();
};

/* ---------------- Suppliers & Scorecards ---------------- */
const SUP_FIELDS = [{ k: 'name', label: 'Supplier name' }, { k: 'contact_name', label: 'Contact' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'phone', label: 'Phone' }, { k: 'address', label: 'Address' },
  { k: 'lead_time_days', label: 'Quoted lead time (days)', type: 'number', attrs: 'min="0"', help: 'Also updates the lead time of the items this supplier provides' }, { k: 'terms_days', label: 'Payment terms (Net days)', type: 'number', attrs: 'min="0"' },
  { k: 'active', label: 'Active', opts: [['true', 'Yes'], ['false', 'No']] }, { k: 'notes', label: 'Notes', wide: true }];
const verdictTone = v => ({ Keep: 'ok', Watch: 'warn', Replace: 'bad' }[v] || '');
const meter = (v, good = 90, ok = 75) => `<div class="meter"><i class="${v >= good ? '' : v >= ok ? 'warn' : 'bad'}" style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;
PAGES.suppliers = () => {
  const u = UI.sup ??= { tab: 'score' }; let body;
  if (u.tab === 'score') {
    const ranked = [...S.suppliers].sort((a, b) => (D.score[b.id].rating ?? -1) - (D.score[a.id].rating ?? -1));
    body = `<div class="note">Every measure is calculated from purchase-order history. Overall rating = 45% on-time delivery + 30% fill rate + 25% lead-time adherence (quoted ÷ actual). <b>Keep</b> 88 and above · <b>Watch</b> 75-87 · <b>Replace</b> below 75.</div>
      <div class="card flush">${table([{ h: 'Supplier', c: s => `<b>${esc(s.name)}</b>` }, { h: 'Rating', cls: 'num', c: s => D.score[s.id].rating ?? '—' }, { h: 'Decision', c: s => badge(D.score[s.id].verdict, verdictTone(D.score[s.id].verdict)) },
        { h: 'POs received', cls: 'num', c: s => D.score[s.id].n }, { h: 'On-time delivery', cls: 'num', c: s => D.score[s.id].n ? pct(D.score[s.id].onTimePct, 0) : '—' },
        { h: 'Avg actual lead time', cls: 'num', c: s => D.score[s.id].n ? num(D.score[s.id].avgLT, 1) + ' d' : '—' }, { h: 'Quoted', cls: 'num', c: s => s.lead_time_days + ' d' },
        { h: 'Fill rate', cls: 'num', c: s => D.score[s.id].n ? pct(D.score[s.id].fillPct) : '—' }, { h: 'Owed', cls: 'num', c: s => money(D.score[s.id].owed) }, { h: 'Next due', c: s => fdate(D.score[s.id].nextDue) }], ranked)}</div>
      <div class="score">${ranked.map(s => { const c = D.score[s.id]; return `<div class="card"><div class="cardhead"><h2>${esc(s.name)}</h2>${badge(c.verdict, verdictTone(c.verdict))}</div>
        <div><span class="big">${c.rating ?? '—'}</span> <span class="muted">/ 100 overall · ${c.n} PO(s) received · ${money(c.spend)} purchased</span></div>
        ${c.n ? `<div class="m"><span>On-time delivery</span><b>${pct(c.onTimePct, 0)}</b>${meter(c.onTimePct)}
          <span>Fill rate (received ÷ ordered)</span><b>${pct(c.fillPct)}</b>${meter(c.fillPct, 98, 93)}
          <span>Lead time: actual ${num(c.avgLT, 1)} d vs quoted ${c.quoted} d</span><b class="${c.avgLT > c.quoted + 0.5 ? 'neg' : 'up'}">${c.avgLT - c.quoted >= 0 ? '+' : ''}${num(c.avgLT - c.quoted, 1)} d</b>${meter(c.ltAdh, 95, 85)}</div>` : '<p class="muted">No received purchase orders yet.</p>'}
        <div class="m"><span>Open POs</span><b>${c.open}${c.lateOpen ? ` (${c.lateOpen} late)` : ''}</b><span>Amount owed (Net ${s.terms_days})</span><b>${money(c.owed)}</b>
          <span>Past due</span><b class="${c.overdue > 0 ? 'neg' : ''}">${money(c.overdue)}</b><span>Next payment due</span><b>${fdate(c.nextDue)}</b></div></div>`; }).join('')}</div>`;
  } else if (u.tab === 'pay') {
    const rows = S.purchase_orders.filter(p => !p.paid_at && p.first_receipt_date).sort((a, b) => a.due_date < b.due_date ? -1 : 1);
    body = `<div class="kpis"><div class="kpi"><div class="l">Total owed to suppliers</div><div class="v">${money(sum(rows, poRecValue))}</div></div>
        <div class="kpi"><div class="l">Past due</div><div class="v">${money(sum(rows.filter(p => p.due_date < S.today), poRecValue))}</div></div>
        <div class="kpi"><div class="l">Due in the next 14 days</div><div class="v">${money(sum(rows.filter(p => p.due_date >= S.today && p.due_date <= addDays(S.today, 14)), poRecValue))}</div></div></div>
      <div class="card flush">${table([{ h: 'PO', c: p => `<a data-act="po.view" data-id="${p.id}"><b>${p.number}</b></a>` }, { h: 'Supplier', c: p => esc(D.sup[p.supplier_id].name) }, { h: 'Received', c: p => fdate(p.first_receipt_date) },
        { h: 'Terms', c: p => 'Net ' + D.sup[p.supplier_id].terms_days }, { h: 'Due date', c: p => fdate(p.due_date) }, { h: 'Amount owed', cls: 'num', c: p => money(poRecValue(p)) },
        { h: 'Status', c: p => { const dd = diffDays(p.due_date, S.today); return dd < 0 ? badge(`${-dd} days overdue`, 'bad') : badge(`due in ${dd} days`, dd <= 7 ? 'warn' : ''); } },
        { h: '', c: p => `<button class="btn sm primary" data-act="po.act" data-id="${p.id}" data-a="pay">Record payment</button>` }], rows, { empty: 'Nothing is owed to suppliers.' })}</div>
      <p class="muted small">Amount owed = quantity received × PO unit cost. Due date = first receipt date + the supplier’s payment terms.</p>`;
  } else {
    body = `<div class="card flush">${table([{ h: 'Supplier', c: s => `<b>${esc(s.name)}</b>` }, { h: 'Contact', c: s => esc(s.contact_name || '') }, { h: 'Email', c: s => esc(s.email || '') }, { h: 'Phone', c: s => esc(s.phone || '') }, { h: 'Location', c: s => esc(s.address || '') },
        { h: 'Quoted lead time', cls: 'num', c: s => s.lead_time_days + ' days' }, { h: 'Payment terms', c: s => 'Net ' + s.terms_days }, { h: 'Items supplied', cls: 'num', c: s => S.items.filter(i => i.supplier_id === s.id).length },
        { h: 'Status', c: s => s.active ? badge('active', 'ok') : badge('inactive') }, { h: '', c: s => `<button class="btn sm" data-act="sup.edit" data-id="${s.id}">Edit</button>` }], S.suppliers)}</div>`;
  }
  return head('Suppliers & Scorecards', 'Supplier contact details, quoted lead times and payment terms, with a scorecard for each supplier computed from purchase order history so a manager can decide who to keep, watch or replace.',
      `<button class="btn primary" data-act="sup.edit">Add supplier</button>`) + tabs('sup.tab', [['score', 'Scorecards'], ['pay', 'Payables'], ['dir', 'Supplier directory']], u.tab) + body;
};
ACT['sup.edit'] = d => editRecord(d.id ? 'Edit supplier' : 'Add supplier', SUP_FIELDS, d.id ? { ...D.sup[d.id], active: String(D.sup[d.id].active) } : { lead_time_days: 7, terms_days: 30, active: 'true' },
  rec => act('supplier_save', { p: { ...rec, active: String(rec.active) !== 'false' } }, 'Supplier saved'));

/* ---------------- Ordering Rules (reorder point, periodic review, EOQ) ---------------- */
PAGES.replenish = () => {
  const u = UI.rep ??= { tab: 'rop', rop: {}, sel: {}, pq: {}, psel: {}, set: {} };
  const st = S.settings, items = S.items.filter(i => i.active && i.kind !== 'finished'), made = S.items.filter(i => i.active && D.isParent(i.id));
  const setInp = (k, w = 90) => inp(`rep.set.${k}`, u.set[k] ?? st[k], `type="number" min="0" step="any" style="width:${w}px"`);
  const settings = `<div class="card"><div class="filters" style="margin:0;align-items:flex-end">${field('Ordering cost S ($/order)', setInp('ordering_cost'))}${field('Holding cost (% of unit cost / yr)', setInp('holding_cost_pct'))}
      ${field('Service level (%)', setInp('service_level_pct'))}${field('Review period P (days)', setInp('review_period_days'))}<label class="f"><span>&nbsp;</span><button class="btn primary" data-act="rep.saveset">Update and recalculate</button></label>
      <span class="muted small" style="max-width:400px">Average daily usage d and its standard deviation σ come from the last ${D.window} days of sales history (parent sales are exploded through the bill of material). z = ${num(D.z, 2)} at a ${num(st.service_level_pct)}% service level.</span></div></div>`;
  let body;
  if (u.tab === 'rop') {
    const sug = i => D.stat[i.id].eoqLot || D.stat[i.id].lot, on = i => u.sel[i.id] ?? D.stat[i.id].low;
    body = `<div class="card flush"><div class="cardhead"><h2>Reorder point (continuous review): ROP = d × L + z × σ × √L</h2><div class="actions">
        <button class="btn sm" data-act="rep.applyrop">Set all reorder points to calculated</button><button class="btn sm" data-act="rep.saverop">Save edited reorder points</button>
        <button class="btn sm primary" data-act="rep.createpos">Create draft POs for checked</button></div></div>
      ${table([{ h: '', c: i => `<input type="checkbox" data-model="rep.sel.${i.id}" ${on(i) ? 'checked' : ''}>` }, { h: 'Item', c: i => esc(i.name) }, { h: 'Supplier', c: i => esc(D.sup[i.supplier_id]?.name || '—') },
        { h: 'Avg daily use d', cls: 'num', c: i => num(D.stat[i.id].d, 2) }, { h: 'σ daily', cls: 'num', c: i => num(D.stat[i.id].sigma, 2) }, { h: 'Lead time L', cls: 'num', c: i => i.lead_time_days + ' d' },
        { h: 'Lead-time demand', cls: 'num', c: i => num(D.stat[i.id].ltDemand) }, { h: 'Safety stock', cls: 'num', c: i => num(D.stat[i.id].ss) }, { h: 'Calculated ROP', cls: 'num', c: i => `<b>${qty(D.stat[i.id].ropCalc)}</b>` },
        { h: 'ROP in use', cls: 'num', c: i => inp(`rep.rop.${i.id}`, u.rop[i.id] ?? i.reorder_point, 'type="number" min="0" step="1" class="q"') },
        { h: 'On hand', cls: 'num', c: i => qty(D.stat[i.id].onHand) }, { h: 'On order', cls: 'num', c: i => qty(D.stat[i.id].incoming) }, { h: 'Position', cls: 'num', c: i => `<b>${qty(D.stat[i.id].position)}</b>` },
        { h: 'Status', c: i => D.stat[i.id].low ? badge('Order now', 'bad') : badge('OK', 'ok') }, { h: 'Suggested qty', cls: 'num', c: i => D.stat[i.id].low ? `<b>${qty(sug(i))}</b>` : `<span class="muted">${qty(sug(i))}</span>` },
        { h: 'Order by', c: i => D.stat[i.id].low ? `<b>${fshort(D.stat[i.id].orderBy || S.today)}</b>` : D.stat[i.id].orderBy ? `<span class="muted">${fshort(D.stat[i.id].orderBy)}</span>` : '' }], items)}</div>
      <p class="muted small">Position = on hand + on order. An item is flagged when its position is at or below the reorder point in use. Suggested quantity is the EOQ rounded to the supplier lot size. Order-by = projected run-out date (on hand ÷ d) minus the lead time.</p>
      <div class="card flush"><h2>Items we make: production triggers</h2>${table([{ h: 'Parent item', c: i => itemCell(i, esc(i.name)) }, { h: 'Avg daily sales', cls: 'num', c: i => num(D.stat[i.id].d, 2) }, { h: 'Build lead time', cls: 'num', c: i => i.lead_time_days + ' d' },
        { h: 'Calculated ROP', cls: 'num', c: i => qty(D.stat[i.id].ropCalc) }, { h: 'ROP in use', cls: 'num', c: i => inp(`rep.rop.${i.id}`, u.rop[i.id] ?? i.reorder_point, 'type="number" min="0" step="1" class="q"') },
        { h: 'On hand', cls: 'num', c: i => qty(D.stat[i.id].onHand) }, { h: 'In production', cls: 'num', c: i => qty(D.stat[i.id].incoming) }, { h: 'Status', c: i => D.stat[i.id].low ? badge('Build now', 'bad') : badge('OK', 'ok') },
        { h: '', c: i => `<button class="btn sm" data-act="prod.new" data-item="${i.id}" data-qty="${Math.max(N(i.lot_qty), Math.ceil(D.stat[i.id].d * 7), 1)}">Create production order</button>` }], made)}</div>`;
  } else if (u.tab === 'periodic') {
    const P = N(st.review_period_days), sug = i => { const s = D.stat[i.id], need = Math.max(0, s.target - s.position); return need > 0 ? Math.ceil(need / s.lot) * s.lot : 0; };
    const on = i => u.psel[i.id] ?? sug(i) > 0;
    body = `<div class="card flush"><div class="cardhead"><h2>Periodic manual review: order up to T = d × (P + L) + z × σ × √(P + L)</h2>
        <button class="btn sm primary" data-act="rep.createperiodic">Create draft POs from this review</button></div>
      ${table([{ h: '', c: i => `<input type="checkbox" data-model="rep.psel.${i.id}" ${on(i) ? 'checked' : ''}>` }, { h: 'Item', c: i => esc(i.name) }, { h: 'Supplier', c: i => esc(D.sup[i.supplier_id]?.name || '—') },
        { h: 'Avg daily use d', cls: 'num', c: i => num(D.stat[i.id].d, 2) }, { h: 'Review P', cls: 'num', c: () => P + ' d' }, { h: 'Lead time L', cls: 'num', c: i => i.lead_time_days + ' d' },
        { h: 'Order-up-to level T', cls: 'num', c: i => `<b>${qty(D.stat[i.id].target)}</b>` }, { h: 'On hand', cls: 'num', c: i => qty(D.stat[i.id].onHand) }, { h: 'On order', cls: 'num', c: i => qty(D.stat[i.id].incoming) },
        { h: 'Position', cls: 'num', c: i => qty(D.stat[i.id].position) }, { h: 'T − position', cls: 'num', c: i => qty(Math.max(0, D.stat[i.id].target - D.stat[i.id].position)) }, { h: 'Lot size', cls: 'num', c: i => qty(D.stat[i.id].lot) },
        { h: 'Order qty (editable)', cls: 'num', c: i => inp(`rep.pq.${i.id}`, u.pq[i.id] ?? sug(i), 'type="number" min="0" step="1" class="q"') }], items)}</div>
      <p class="muted small">Use this screen on each review date (every ${P} days). The system proposes a quantity that brings each item back up to its target level, rounded up to the lot size; the reviewer can change any quantity before creating the purchase orders.</p>`;
  } else {
    body = `<div class="card flush"><h2>Economic order quantity: EOQ = √(2 × D × S ÷ H)</h2>
      ${table([{ h: 'Item', c: i => esc(i.name) }, { h: 'Avg daily use', cls: 'num', c: i => num(D.stat[i.id].d, 2) }, { h: 'Annual demand D', cls: 'num', c: i => num(D.stat[i.id].annual) }, { h: 'Order cost S', cls: 'num', c: () => money(st.ordering_cost) },
        { h: 'Unit cost', cls: 'num', c: i => money(i.cost) }, { h: 'Holding H ($/unit/yr)', cls: 'num', c: i => '$' + num(D.stat[i.id].H, 3) }, { h: 'EOQ', cls: 'num', c: i => `<b>${num(D.stat[i.id].eoq)}</b>` },
        { h: 'Lot size', cls: 'num', c: i => qty(D.stat[i.id].lot) }, { h: 'Order qty used', cls: 'num', c: i => `<b>${qty(D.stat[i.id].eoqLot)}</b>` }, { h: 'Orders / yr', cls: 'num', c: i => num(D.stat[i.id].ordersPerYear, 1) },
        { h: 'Days between orders', cls: 'num', c: i => D.stat[i.id].ordersPerYear ? num(365 / D.stat[i.id].ordersPerYear) : '—' }, { h: 'Annual ordering cost', cls: 'num', c: i => money(D.stat[i.id].orderCostYr) },
        { h: 'Annual holding cost', cls: 'num', c: i => money(D.stat[i.id].holdCostYr) }], items)}</div>
      <p class="muted small">D = average daily usage × 365. H = holding cost % × the item’s weighted average unit cost. At the EOQ the annual ordering cost equals the annual holding cost. Change S or the holding % above and every row recalculates.</p>`;
  }
  return head('Ordering Rules', 'Three inventory ordering policies, all driven by usage calculated from sales history: a continuous-review reorder point, a periodic manual review, and the economic order quantity.') + settings +
    tabs('rep.tab', [['rop', `Reorder points (${D.lowCount} to order)`], ['periodic', 'Periodic review'], ['eoq', 'EOQ']], u.tab) + body;
};
ACT['rep.saveset'] = async () => {
  const u = UI.rep; try { for (const [k, v] of Object.entries(u.set)) if (String(v) !== String(S.settings[k])) await rpc('setting_save', { p_key: k, p_value: String(v) });
    u.set = {}; toast('Settings updated - all ordering rules recalculated', 'ok'); } catch (e) { toast(e.message, 'error'); }
  await refresh();
};
ACT['rep.applyrop'] = async () => { const r = await act('item_set_rop', { p_rops: S.items.filter(i => i.active).map(i => ({ item_id: i.id, rop: D.stat[i.id].ropCalc })) }, 'Reorder points set to the calculated values'); if (r.ok) UI.rep.rop = {}; render(); };
ACT['rep.saverop'] = async () => { const e = Object.entries(UI.rep.rop).filter(([id, v]) => v !== '' && N(v) !== N(D.item[id].reorder_point)); if (!e.length) return toast('No reorder points were changed', 'error');
  const r = await act('item_set_rop', { p_rops: e.map(([id, v]) => ({ item_id: +id, rop: Math.round(N(v)) })) }, `${e.length} reorder point(s) saved`); if (r.ok) { UI.rep.rop = {}; render(); } };
ACT['rep.createpos'] = () => { const u = UI.rep; createDraftPOs(S.items.filter(i => i.active && i.kind !== 'finished' && (u.sel[i.id] ?? D.stat[i.id].low)).map(i => ({ item: i, qty: D.stat[i.id].eoqLot || D.stat[i.id].lot }))); u.sel = {}; };
ACT['rep.createperiodic'] = () => { const u = UI.rep; const sug = i => { const s = D.stat[i.id], need = Math.max(0, s.target - s.position); return need > 0 ? Math.ceil(need / s.lot) * s.lot : 0; };
  createDraftPOs(S.items.filter(i => i.active && i.kind !== 'finished' && (u.psel[i.id] ?? sug(i) > 0)).map(i => ({ item: i, qty: N(u.pq[i.id] ?? sug(i)) }))); u.psel = {}; u.pq = {}; };

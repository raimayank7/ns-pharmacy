/* pharmacy.niveshsahayak.in: chemist's bill with batch, expiry, MRP, manufacturer, patient and doctor, schedule-drug notes,
   and the Schedule H1 register as a CSV file. Record type 'pharma' (a sale in the Nivesh Sahayak App).
   Medicines are sold at or below MRP, and MRP includes GST: the bill takes MRP and discount, and works the taxable value out
   (rate = MRP without GST, so every other tool reads the lines the usual way). */
(function () {
  'use strict';
  var $ = NS.$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t;
  var TITLE = { tax: 'TAX INVOICE', supply: 'BILL OF SUPPLY', plain: 'CASH / CREDIT MEMO' };
  var SCHED = { H: 'Schedule H drug. To be sold by retail on the prescription of a Registered Medical Practitioner only.',
    H1: 'Schedule H1 drug. Sold on prescription; entered in the Schedule H1 register.', X: 'Schedule X drug. Sold on prescription; prescription copy retained.' };
  var RATES = [0, 5, 18, 12];
  function row() { return { desc: '', mfr: '', batch: '', exp: '', sched: '', qty: 1, unit: 'Strip', mrp: '', disc: '', gst: 5, hsn: '' }; }
  function syncRate(d, it) { var g = d.kind === 'tax' ? num(it.gst) : 0, m = num(it.mrp); it.rate = m ? String(Math.round(m / (1 + g / 100) * 10000) / 10000) : ''; }
  function kindFor(s) { return s.reg === 'comp' ? 'supply' : s.gstin && s.reg !== 'unreg' ? 'tax' : 'plain'; }
  /* expiry is a month (YYYY-MM): the medicine may be sold until the end of that month */
  function expEnd(m) { if (!/^\d{4}-\d{2}$/.test(m || '')) return ''; var d = new Date(+m.slice(0, 4), +m.slice(5, 7), 0); return m + '-' + String(d.getDate()).padStart(2, '0'); }
  function expShow(m) { return /^\d{4}-\d{2}$/.test(m || '') ? m.slice(5, 7) + '/' + m.slice(2, 4) : esc(m || ''); }
  function sums(d) {
    var tax = d.kind === 'tax', origin = d.seller.state, dest = d.buyer.state || origin, intra = !origin || !dest || origin === dest;
    var o = { rows: [], mrp: 0, taxable: 0, tax: 0, cgst: 0, sgst: 0, igst: 0, byRate: {}, intra: intra, sched: {} };
    d.items.forEach(function (it) {
      var q = num(it.qty), m = num(it.mrp);
      if (!it.desc && !m) return;
      var gross = r2(q * m), amount = r2(gross - gross * num(it.disc) / 100), g = tax ? num(it.gst) : 0, taxable = r2(amount * 100 / (100 + g)), tx = r2(amount - taxable);
      o.rows.push({ it: it, gross: gross, amount: amount, taxable: taxable, g: g, tax: tx });
      o.mrp += gross; o.taxable += taxable; o.tax += tx;
      if (it.sched) o.sched[it.sched] = 1;
      if (tax) { var b = o.byRate[g] || (o.byRate[g] = { taxable: 0, tax: 0 }); b.taxable += taxable; b.tax += tx; }
    });
    o.mrp = r2(o.mrp); o.taxable = r2(o.taxable); o.tax = r2(o.tax);
    if (intra) { o.cgst = r2(o.tax / 2); o.sgst = r2(o.tax - o.cgst); } else o.igst = o.tax;
    var total = r2(o.taxable + o.tax);
    o.roundOff = d.round === false ? 0 : r2(Math.round(total) - total); o.total = r2(total + o.roundOff); o.saved = r2(o.mrp - total);
    return o;
  }

  /* Schedule H1 register: one line per H1 medicine sold, from every saved bill of this business */
  function h1csv() {
    var d0 = K.doc(), who = String(d0.seller.name || '').trim().toLowerCase();
    NSStore.list('doc').then(function (all) {
      var lines = [['Date', 'Bill No.', 'Patient', 'Patient address', 'Prescriber', 'Prescriber reg. no. / address', 'Medicine', 'Manufacturer', 'Batch', 'Expiry', 'Quantity']];
      all.filter(function (x) { return x.type === 'pharma' && String(x.seller && x.seller.name || '').trim().toLowerCase() === who; })
        .sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || String(a.no).localeCompare(String(b.no)); })
        .forEach(function (b) { (b.items || []).forEach(function (it) { if (it.sched === 'H1') lines.push([b.date, b.no, b.buyer.name, b.buyer.addr, b.doctor, b.docReg, it.desc, it.mfr, it.batch, it.exp, it.qty + ' ' + (it.unit || '')]); }); });
      if (lines.length < 2) { NS.toast(t('rx.h1none'), 'bad'); return; }
      var csv = '﻿' + lines.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c).replace(/\r?\n/g, ' '); return /[",]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
      var a = document.createElement('a'), u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.href = u; a.download = 'Schedule H1 register ' + NS.today() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
      NS.toast(t('rx.h1done', { n: lines.length - 1 }));
    });
  }

  var K = NS.kit({
    type: 'pharma', prefix: 'PH', digits: 4, paper: 'a5', papers: ['a5', 'a4', 'th80'],
    name: function (d) { return d.kind === 'tax' ? 'Invoice' : d.kind === 'supply' ? 'Bill of Supply' : 'Cash Memo'; },
    blank: function () { return { kind: 'plain', round: true, status: 'paid', payMode: 'cash', doctor: '', docReg: '', age: '', rxNo: '', dl: '', pharmacist: '', items: [row()] }; },
    newRow: function () { return row(); },
    keepOnNew: function (d) { return { kind: d.kind, paper: d.paper, dl: d.dl, pharmacist: d.pharmacist }; },
    form: function (K) {
      return K.card(t('rx.patient'), '<div class="fg">' +
          K.f('buyer.name', t('rx.pname'), { wide: true }) + K.f('age', t('rx.age'), { mode: 'numeric', ltr: 1, max: 3 }) + K.f('buyer.phone', t('l.phone'), { type: 'tel', mode: 'tel', ltr: 1 }) +
          K.f('buyer.addr', t('l.addr'), { type: 'textarea', wide: true, hint: t('rx.addrh') }) +
          K.f('doctor', t('rx.doctor'), { hint: t('rx.doch') }) + K.f('docReg', t('rx.docreg'), { ltr: 1 }) + K.f('rxNo', t('rx.rx'), { ltr: 1 }) +
          '<details class="more wide"><summary>' + esc(t('rx.b2b')) + '</summary><div class="fg">' + K.f('buyer.gstin', t('l.cgstin'), { max: 15, ltr: 1 }) + K.f('buyer.state', t('l.state'), { type: 'select', opts: K.states() }) + '</div></details>' +
        '</div>') +
        K.card(t('rx.meds'), K.list('items', t('rx.addmed')) + '<div class="sums" id="ed-sums" aria-live="polite"></div>') +
        K.card(t('pos.pay'), '<div class="fg">' + K.f('status', t('l.pay'), { type: 'select', opts: [['paid', t('pay.paid')], ['unpaid', t('pay.unpaid')]] }) +
          K.f('payMode', t('pos.mode'), { type: 'select', opts: K.modes(['cash', 'upi', 'card']), show: 'status=paid' }) + '</div>') +
        K.bizCard({ extra: K.f('dl', t('rx.dl'), { wide: true, ltr: 1, hint: t('rx.dlh') }) + K.f('pharmacist', t('rx.pharm')) }) +
        K.numCard(K.f('kind', t('pos.kind'), { type: 'select', opts: [['tax', t('k.tax')], ['supply', t('k.supply')], ['plain', t('k.cashmemo')]], wide: true, hint: t('pos.kindh') })) +
        K.lookCard(K.f('round', t('l.round'), { type: 'check' }) + '<div class="f wide"><button type="button" class="btn" data-ph="h1">' + esc(t('rx.h1')) + '</button><small class="hint">' + esc(t('rx.h1h')) + '</small></div>') +
        '<datalist id="dl-units"><option value="Strip"><option value="Tab"><option value="Cap"><option value="Bottle"><option value="Tube"><option value="Vial"><option value="Box"><option value="Nos"></datalist>' +
        '<datalist id="dl-rates">' + RATES.map(function (r) { return '<option value="' + r + '">'; }).join('') + '</datalist>';
    },
    rows: {
      items: function (it, i, K) {
        var d = K.doc();
        return K.rf('items', i, 'desc', t('rx.med'), { cls: 'it-d', sug: 'item' }) +
          K.rf('items', i, 'mfr', t('rx.mfr')) + K.rf('items', i, 'batch', t('rx.batch'), { ltr: 1 }) +
          K.rf('items', i, 'exp', t('rx.exp'), { type: 'month', ltr: 1 }) +
          K.rf('items', i, 'sched', t('rx.sched'), { type: 'select', opts: [['', t('rx.s0')], ['H', 'Schedule H'], ['H1', 'Schedule H1'], ['X', 'Schedule X']] }) +
          K.rf('items', i, 'qty', t('l.qty'), { mode: 'decimal', ltr: 1 }) + K.rf('items', i, 'unit', t('l.unit'), { list: 'dl-units', ltr: 1 }) +
          K.rf('items', i, 'mrp', t('rx.mrp'), { mode: 'decimal', ltr: 1 }) + K.rf('items', i, 'disc', t('l.disc'), { mode: 'decimal', ltr: 1 }) +
          (d.kind === 'tax' ? K.rf('items', i, 'gst', t('l.gst'), { mode: 'decimal', ltr: 1, list: 'dl-rates' }) + K.rf('items', i, 'hsn', t('l.hsn'), { mode: 'numeric', max: 8, ltr: 1 }) : '');
      }
    },
    rowInput: function (n, i, k, d) { if (k === 'mrp' || k === 'gst') syncRate(d, d.items[i]); },
    pickItem: function (it, m, d) {
      it.desc = m.desc; it.mfr = m.mfr || it.mfr; it.hsn = m.hsn || it.hsn; it.unit = m.unit || it.unit; it.sched = m.sched || it.sched;
      if (m.gst !== '' && m.gst != null) it.gst = m.gst;
      it.mrp = m.mrp != null && m.mrp !== '' ? String(m.mrp) : it.mrp; syncRate(d, it);
    },
    input: function (p, el, d, K) {
      if (p === 'kind') { d.items.forEach(function (it) { syncRate(d, it); }); K.refill(); }
      if ((p === 'seller.gstin' || p === 'seller.name') && !K.editing()) { var k = kindFor(d.seller); if (k !== d.kind) { d.kind = k; d.items.forEach(function (it) { syncRate(d, it); }); K.refill(); } }
    },
    pickParty: function (p, d) { d.buyer.addr = p.addr || ''; },
    sums: sums,
    edSums: function (d, o) {
      var today = d.date || NS.today(), soon = d.items.filter(function (it) { var e = expEnd(it.exp); return e && e >= today && (new Date(e) - new Date(today)) / 864e5 <= 30; }).length;
      return '<span>' + esc(t('sum.items', { n: o.rows.length })) + '</span>' + (o.saved > 0 ? '<span>' + esc(t('rx.saved', { v: NS.money(o.saved) })) + '</span>' : '') + (d.kind === 'tax' ? '<span>' + esc(t('sum.gst', { v: NS.money(o.tax) })) + '</span>' : '') +
        '<b>' + esc(t('sum.total', { v: NS.money(o.total) })) + '</b>' + (soon ? '<span class="warn">' + esc(t('rx.soon', { n: soon })) + '</span>' : '') + (Object.keys(o.sched).length && !d.doctor ? '<span class="warn">' + esc(t('rx.v.doc')) + '</span>' : '');
    },
    validate: function (d, o) {
      var p = [], today = d.date || NS.today();
      if (!o.rows.length) p.push(['r-items-desc-0', t('rx.v.med')]);
      d.items.forEach(function (it, i) {
        if (!it.desc && !num(it.mrp)) return;
        if (!it.desc) p.push(['r-items-desc-' + i, t('pos.v.name')]);
        var e = expEnd(it.exp); if (e && e < today) p.push(['r-items-exp-' + i, t('rx.v.exp', { n: it.desc })]);
        if ((it.sched === 'H1' || it.sched === 'X') && !it.batch) p.push(['r-items-batch-' + i, t('rx.v.batch', { n: it.desc })]);
      });
      if (Object.keys(o.sched).length && !String(d.doctor || '').trim()) p.push(['k-doctor', t('rx.v.doc')]);
      if (o.sched.H1 && !String(d.buyer.name || '').trim()) p.push(['k-buyer-name', t('rx.v.pat')]);
      if (d.kind === 'tax' && !d.seller.gstin) p.push(['k-seller-gstin', t('v.tax')]);
      if (d.kind === 'tax' && !d.buyer.gstin && o.taxable >= 50000 && (!d.buyer.name || !d.buyer.addr || !d.buyer.state)) p.push([!d.buyer.name ? 'k-buyer-name' : !d.buyer.addr ? 'k-buyer-addr' : 'k-buyer-state', t('v.b2c')]);
      return p;
    },
    confirm: function (d, o) { return d.status === 'paid' && d.payMode === 'cash' && o.total >= 200000 ? t('c.cash2l') : ''; },
    masterItems: function (d) { return d.items.filter(function (it) { return it.desc; }).map(function (it) { return { desc: String(it.desc).trim(), mfr: it.mfr || '', sched: it.sched || '', hsn: it.hsn || '', unit: it.unit || '', mrp: it.mrp, rate: it.rate, gst: d.kind === 'tax' ? it.gst : '' }; }); },
    record: function (rec) { rec.items = rec.items.filter(function (it) { return it.desc || num(it.mrp); }); rec.withGst = rec.kind === 'tax'; if (rec.status !== 'paid') delete rec.payMode; },
    copyOf: function (d) { d.items.forEach(function (it) { it.batch = ''; it.exp = ''; }); d.rxNo = ''; },
    copyLbl: 'rx.repeat',
    histText: function (d) { return [d.doctor, (d.items || []).map(function (it) { return it.desc + ' ' + it.batch; }).join(' ')].join(' '); },
    histPill: function (d) { return ' <span class="pill ' + (d.status === 'paid' ? 'ok' : '') + '">' + esc(t(d.status === 'paid' ? 'h.paidp' : 'h.unpaidp')) + '</span>'; },
    histActs: function (d) { return '<button type="button" class="btn sm" data-h="paid" data-id="' + d.id + '">' + esc(t(d.status === 'paid' ? 'h.unpaid' : 'h.paid')) + '</button>'; },
    histAct: function (act, rec) { if (act !== 'paid') return; rec.status = rec.status === 'paid' ? 'unpaid' : 'paid'; return NSStore.put('doc', rec).then(function () { return { status: rec.status }; }); },
    shareText: function (d, o) { return (o.saved > 0 ? '\nYou saved ' + NS.money(o.saved) + ' on MRP' : '') + (d.status !== 'paid' ? '\nBalance due: ' + NS.money(o.total) : ''); },
    sheet: function (d, o, K) {
      var tax = d.kind === 'tax', b = d.buyer, notes = Object.keys(SCHED).filter(function (k) { return o.sched[k]; }).map(function (k) { return '<p class="small">' + SCHED[k] + '</p>'; }).join('');
      var lic = (d.dl ? '<p>D.L. No.: <b class="mono">' + esc(d.dl) + '</b></p>' : '');
      if (/^th/.test(d.paper)) {
        return K.thOpen(d, TITLE[d.kind]) + (d.dl ? '<p>D.L. No.: ' + esc(d.dl) + '</p>' : '') +
          K.kv([['Bill No.', '<span class="mono">' + esc(d.no) + '</span>'], ['Date', NS.fmtDate(d.date)], ['Patient', esc(b.name) + (d.age ? ' (' + esc(d.age) + ' y)' : '')], ['Doctor', esc(d.doctor)]]) +
          '<table class="tl"><thead><tr><th class="l">Medicine</th><th class="n">Amount</th></tr></thead><tbody>' + o.rows.map(function (r) {
            return '<tr><td colspan="2" class="l">' + esc(r.it.desc) + (r.it.sched ? ' [' + esc(r.it.sched) + ']' : '') + '</td></tr><tr class="q"><td class="l">B:' + esc(r.it.batch) + ' E:' + expShow(r.it.exp) + ' ' + NS.qty(num(r.it.qty)) + '×' + NS.money(num(r.it.mrp), false) + (num(r.it.disc) ? ' −' + num(r.it.disc) + '%' : '') + '</td><td class="n">' + NS.money(r.amount, false) + '</td></tr>';
          }).join('') + '</tbody></table>' +
          K.kv([tax ? ['Taxable value', NS.money(o.taxable)] : null, tax && o.intra ? ['CGST', NS.money(o.cgst)] : null, tax && o.intra ? ['SGST', NS.money(o.sgst)] : null, tax && !o.intra ? ['IGST', NS.money(o.igst)] : null,
            o.roundOff ? ['Round off', (o.roundOff > 0 ? '+' : '−') + NS.money(Math.abs(o.roundOff))] : null, ['Total', NS.money(o.total), 'grand'], o.saved > 0 ? ['You saved on MRP', NS.money(o.saved)] : null], 'tot') +
          (d.status === 'paid' ? '<p class="paidline">PAID</p>' : '') + notes.replace(/class="small"/g, 'class="nt1"') + (d.notes ? '<p class="nt1">' + esc(d.notes) + '</p>' : '') + '<p class="thanks">Get well soon</p>' + K.made() + '</div>';
      }
      return K.open(d, 'pharma') + (d.status === 'paid' ? '<div class="stamp">PAID</div>' : '') + K.head(d, TITLE[d.kind], '', lic) +
        K.meta([['Bill No.', '<span class="mono">' + esc(d.no) + '</span>'], ['Date', NS.fmtDate(d.date)], ['Doctor', esc(d.doctor) + (d.docReg ? ' <small>(Reg. ' + esc(d.docReg) + ')</small>' : '')], ['Prescription No.', esc(d.rxNo)], tax ? ['Place of supply', b.state ? esc(NS.stateName(b.state)) + ' (' + b.state + ')' : d.seller.state ? esc(NS.stateName(d.seller.state)) + ' (' + d.seller.state + ')' : ''] : null]) +
        '<div class="parties">' + K.party(b, 'Patient', d.age ? '<p>Age: ' + esc(d.age) + '</p>' : '') + '</div>' +
        '<table class="lines"><thead><tr><th>#</th><th class="l">Medicine</th><th class="l">Mfr.</th><th>Batch</th><th>Exp.</th><th class="n">Qty</th><th class="n">MRP</th><th class="n">Disc.</th>' + (tax ? '<th class="n">GST</th>' : '') + '<th class="n">Amount</th></tr></thead><tbody>' +
        (o.rows.length ? o.rows.map(function (r, i) {
          return '<tr><td>' + (i + 1) + '</td><td class="l">' + esc(r.it.desc) + (r.it.sched ? ' <b>[' + esc(r.it.sched) + ']</b>' : '') + (tax && r.it.hsn ? '<br><small class="mono">HSN ' + esc(r.it.hsn) + '</small>' : '') + '</td><td class="l">' + esc(r.it.mfr) + '</td><td class="mono">' + esc(r.it.batch) + '</td><td class="mono">' + expShow(r.it.exp) + '</td><td class="n">' + NS.qty(num(r.it.qty)) + ' ' + esc(r.it.unit) + '</td><td class="n">' + NS.money(num(r.it.mrp), false) + '</td><td class="n">' + (num(r.it.disc) ? num(r.it.disc) + '%' : '') + '</td>' + (tax ? '<td class="n">' + r.g + '%</td>' : '') + '<td class="n">' + NS.money(r.amount, false) + '</td></tr>';
        }).join('') : '<tr><td colspan="' + (tax ? 10 : 9) + '" class="ph">Medicines you add appear here</td></tr>') + '</tbody></table>' +
        '<div class="foot"><div class="foot-l">' + K.words(o.total) +
          (tax && Object.keys(o.byRate).length ? '<table class="sum"><caption>Tax summary (prices include GST)</caption><thead><tr><th class="n">GST</th><th class="n">Taxable value</th>' + (o.intra ? '<th class="n">CGST</th><th class="n">SGST</th>' : '<th class="n">IGST</th>') + '</tr></thead><tbody>' +
            Object.keys(o.byRate).sort(function (a, b) { return a - b; }).map(function (g) { var x = o.byRate[g]; return '<tr><td class="n">' + g + '%</td><td class="n">' + NS.money(x.taxable, false) + '</td>' + (o.intra ? '<td class="n">' + NS.money(x.tax / 2, false) + '</td><td class="n">' + NS.money(x.tax / 2, false) + '</td>' : '<td class="n">' + NS.money(x.tax, false) + '</td>') + '</tr>'; }).join('') + '</tbody></table>' : '') +
          (d.kind === 'supply' ? '<p class="small">Composition taxable person, not eligible to collect tax on supplies.</p>' : '') + notes +
        '</div><div class="foot-r">' + K.tot([['Total at MRP', NS.money(o.mrp)], o.saved > 0 ? ['Discount', '−' + NS.money(o.saved)] : null, tax ? ['Taxable value', NS.money(o.taxable)] : null,
          tax && o.intra ? ['CGST', NS.money(o.cgst)] : null, tax && o.intra ? ['SGST', NS.money(o.sgst)] : null, tax && !o.intra ? ['IGST', NS.money(o.igst)] : null,
          o.roundOff ? ['Round off', (o.roundOff > 0 ? '+' : '−') + NS.money(Math.abs(o.roundOff))] : null, ['Total', NS.money(o.total), 'grand']]) + (d.status !== 'paid' ? K.qr(d, o.total) : '') + '</div></div>' +
        (d.notes ? '<div class="nt"><div><h4>Notes</h4><p>' + esc(d.notes).replace(/\n/g, '<br>') + '</p></div></div>' : '') +
        '<div class="signs">' + K.blankSign('', 'Patient / attendant') + K.sign(d, '', 'Pharmacist' + (d.pharmacist ? ': ' + esc(d.pharmacist) : '')) + '</div>' + K.made() + '</div>';
    },
    wire: function (ed) { var b = $('[data-ph="h1"]', ed); if (b) b.addEventListener('click', h1csv); },
    ready: function (K) { var d = K.doc(); if (!K.editing() && d.seller.name && !d.items.some(function (it) { return it.desc; })) { var k = kindFor(d.seller); if (k !== d.kind) { d.kind = k; K.refill(); } } }
  });
})();

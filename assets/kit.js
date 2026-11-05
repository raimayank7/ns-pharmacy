/* NS kit: the small shared engine of the industry sites (pos, restaurant, bilty, fee-receipt, job-card, contractor-bill).
   A site's own file describes its document with NS.kit({ type, prefix, title, blank, form, rows, sums, sheet, ... });
   kit does the rest the same way as docs.js and slip.js: binding fields to the record, numbering per business and
   financial year, saving to the shared data home (and the businesses, parties and items in it), history, draft,
   phone tabs, print and share. Fields bind with data-b="path.in.record"; list rows with data-r="list" data-i data-k.
   Screen text comes from NS.t; the printed document is always in English. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t;
  var ACCENTS = ['#0B3B5B', '#1D4ED8', '#047857', '#B45309', '#9D174D', '#334155'];
  var PAGES = { a5: 'size:A5;margin:0', th80: 'size:80mm 297mm;margin:0', th58: 'size:58mm 297mm;margin:0' };
  var MODES = ['cash', 'upi', 'cheque', 'bank', 'card', 'other'];
  var P = { gstin: 'GSTIN', ph: 'Phone', pan: 'PAN', for: 'For', sign: 'Authorised signatory', words: 'Amount in words', upi: 'Scan to pay by UPI',
    cash: 'Cash', upim: 'UPI', cheque: 'Cheque', bank: 'Bank transfer', card: 'Card', other: 'Other' };

  function getp(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setp(o, p, v) { var ks = p.split('.'), last = ks.pop(); ks.reduce(function (a, k) { return a[k] == null ? (a[k] = {}) : a[k]; }, o)[last] = v; }
  function key(s) { return String(s || '').trim().toLowerCase(); }
  function idOf(p) { return 'k-' + p.replace(/\./g, '-'); }

  NS.kit = function (S) {
    var root, doc, editingId = null, sheet, CFG = {}, lastAuto = '', dkey, histOpen = false;
    var DT = S.docType || S.type;
    function W() { return { doc: t('doc.' + S.type), docs: t('docs.' + S.type), Doc: t('Doc.' + S.type) }; }
    function tw(k, v) { return t(k, Object.assign(W(), v || {})); }

    function blank() {
      var c = CFG[S.type] || {}, inv = CFG.invoice || {};
      var d = { type: DT, no: '', date: NS.today(), paper: c.paper || S.paper || 'a4', accent: c.accent || inv.accent || ACCENTS[0], copies: 1, notes: c.notes || '',
        seller: { name: '', addr: '', city: '', pin: '', state: '', gstin: '', phone: '', email: '', pan: '', logo: '', sign: '', bankName: '', bankAcc: '', bankIfsc: '', bankBranch: '', upi: '' },
        buyer: { name: '', addr: '', city: '', pin: '', state: '', gstin: '', phone: '' } };
      return Object.assign(d, S.blank ? S.blank(c, inv) : {});
    }
    function sums() { return S.sums ? S.sums(doc) : { total: 0 }; }

    /* ---------- form helpers handed to the site file ---------- */
    var K = {
      t: t, tw: tw, esc: esc, num: num, r2: r2, P: P, MODES: MODES, doc: function () { return doc; }, sums: sums,
      f: function (path, label, o) {
        o = o || {};
        var id = o.id || idOf(path), ty = o.type || 'text', hint = o.hint ? '<small class="hint" id="' + id + '-hint">' + esc(o.hint) + '</small>' : '';
        var a = ' id="' + id + '" data-b="' + path + '"';
        var input = ty === 'textarea' ? '<textarea' + a + ' rows="' + (o.rows || 2) + '" dir="auto" placeholder="' + esc(o.ph || '') + '"></textarea>'
          : ty === 'select' ? '<select' + a + '>' + o.opts.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join('') + '</select>'
          : ty === 'check' ? ''
          : '<input' + a + ' type="' + ty + '"' + (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + ' placeholder="' + esc(o.ph || '') + '"' + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.ltr ? ' dir="ltr"' : ' dir="auto"') + '>';
        if (ty === 'check') return '<div class="f' + (o.wide !== false ? ' wide' : '') + '"' + (o.show ? ' data-show="' + o.show + '"' : '') + '><label class="chk"><input' + a + ' type="checkbox"> ' + esc(label) + '</label>' + hint + '</div>';
        return '<div class="f' + (o.wide ? ' wide' : '') + '"' + (o.show ? ' data-show="' + o.show + '"' : '') + '><label for="' + id + '">' + esc(label) + '</label>' + input + hint + '<small class="err" id="' + id + '-err" hidden></small></div>';
      },
      card: function (legend, inner, cls) { return '<fieldset class="card' + (cls ? ' ' + cls : '') + '"><legend>' + esc(legend) + '</legend>' + inner + '</fieldset>'; },
      states: function (first) { return [['', first || t('choose.state')]].concat(NS.STATES.map(function (x) { return [x[0], x[1] + ' (' + x[0] + ')']; })); },
      modes: function (list) { return (list || MODES).map(function (m) { return [m, t('pm.' + m)]; }); },
      bizCard: function (o) {
        o = o || {};
        return K.card(o.lg || t('lg.biz'), '<div class="fg">' +
          K.f('seller.name', t('l.bname'), { ph: t('ph.bname'), wide: true, hint: t('h.bname') }) +
          K.f('seller.addr', t('l.addr'), { type: 'textarea', wide: true, ph: t('ph.addr') }) +
          K.f('seller.state', t('l.state'), { type: 'select', opts: K.states() }) +
          K.f('seller.gstin', t('l.gstin'), { ph: t('ph.gstin'), max: 15, ltr: 1 }) +
          K.f('seller.phone', t('l.phone'), { type: 'tel', mode: 'tel', ltr: 1 }) + (o.extra || '') +
          '</div><details class="more"><summary>' + esc(t('more')) + '</summary><div class="fg">' +
          '<div class="f"><label for="s-logo">' + esc(t('l.logo')) + '</label><input id="s-logo" type="file" accept="image/*"><button type="button" class="link" data-clear="logo" hidden>' + esc(t('rm.logo')) + '</button></div>' +
          '<div class="f"><label for="s-sign">' + esc(t('l.sign')) + '</label><input id="s-sign" type="file" accept="image/*"><button type="button" class="link" data-clear="sign" hidden>' + esc(t('rm.sign')) + '</button></div>' +
          (o.bank === false ? '' : K.f('seller.bankName', t('l.bank')) + K.f('seller.bankAcc', t('l.acc'), { mode: 'numeric', ltr: 1 }) + K.f('seller.bankIfsc', t('l.ifsc'), { max: 11, ltr: 1 }) +
            K.f('seller.upi', t('l.upi'), { ph: 'name@bank', ltr: 1 })) + '</div></details>');
      },
      numCard: function (extra, lg) {
        return K.card(lg || tw('lg.details'), '<div class="fg">' + K.f('no', tw('l.no'), { max: 16, ltr: 1, hint: t('h.no2') }) + K.f('date', t('l.date'), { type: 'date' }) + (extra || '') + '</div>');
      },
      partyCard: function (lg, o) {
        o = o || {};
        return K.card(lg, '<div class="fg">' +
          K.f('buyer.name', o.nameLbl || t('l.cname'), { ph: o.ph || t('ph.cname'), wide: true }) +
          (o.addr === false ? '' : K.f('buyer.addr', t('l.addr'), { type: 'textarea', wide: true })) +
          K.f('buyer.phone', t('l.phone'), { type: 'tel', mode: 'tel', ltr: 1 }) +
          (o.gstin === false ? '' : K.f('buyer.gstin', t('l.cgstin'), { max: 15, ltr: 1 })) +
          (o.state === false ? '' : K.f('buyer.state', t('l.state'), { type: 'select', opts: K.states() })) + (o.extra || '') + '</div>');
      },
      lookCard: function (extra) {
        var papers = S.papers || [S.paper || 'a4'];
        return K.card(t('lg.notes'), '<div class="fg">' + K.f('notes', t('l.notes'), { type: 'textarea', wide: true }) +
          (papers.length > 1 ? K.f('paper', t('l.paper'), { type: 'select', opts: papers.map(function (k) { return [k, t('pp.' + k)]; }) }) : '') +
          (S.copies ? K.f('copies', t('l.copies'), { type: 'select', opts: [['1', t('cps.1')]].concat(Array.apply(null, Array(S.copies - 1)).map(function (x, i) { return [String(i + 2), t('cps.n', { n: i + 2 })]; })) }) : '') +
          '<div class="f"><span class="lbl" id="acc-lbl">' + esc(t('l.colour')) + '</span><div class="swatches" role="radiogroup" aria-labelledby="acc-lbl">' + ACCENTS.map(function (c, i) { return '<button type="button" role="radio" class="sw" data-accent="' + c + '" style="--c:' + c + '" aria-label="' + esc(t('colour.n', { n: i + 1 })) + '"></button>'; }).join('') + '</div></div>' +
          (extra || '') + '<p class="hint wide print-note">' + esc(tw('print.en')) + '</p></div>');
      },
      /* a list editor: rows are drawn by S.rows[list](row, i, K) */
      list: function (name, addLbl) {
        return '<div class="items" data-rows="' + name + '"></div><button type="button" class="btn" data-add="' + name + '">' + esc(addLbl) + '</button>';
      },
      rf: function (name, i, k, label, o) {
        o = o || {};
        var id = 'r-' + name + '-' + k + '-' + i, v = (doc[name][i] || {})[k];
        if (o.type === 'select') return '<div class="f' + (o.cls ? ' ' + o.cls : '') + '"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '" data-r="' + name + '" data-i="' + i + '" data-k="' + k + '">' +
          o.opts.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(v) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></div>';
        return '<div class="f' + (o.cls ? ' ' + o.cls : '') + '"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" data-r="' + name + '" data-i="' + i + '" data-k="' + k + '" value="' + esc(v == null ? '' : v) + '"' +
          (o.type ? ' type="' + o.type + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.sug ? ' data-sug="' + o.sug + '"' : '') +
          (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.ltr ? ' dir="ltr"' : ' dir="auto"') + (o.ro ? ' readonly' : '') + '></div>';
      },
      /* printed pieces (English) */
      open: function (d, cls) { return '<div class="sh ' + (cls || '') + (d.paper === 'a5' ? ' a5' : '') + '" style="--ac:' + esc(d.accent) + '" lang="en-IN" dir="ltr">'; },
      head: function (d, title, sub, extra) {
        var s = d.seller;
        return '<header class="sh-top"><div class="sh-from">' + (s.logo ? '<img class="logo" src="' + s.logo + '" alt="">' : '') +
          '<div><h2>' + (s.name ? esc(s.name) : '<span class="ph">Your business name</span>') + '</h2>' + (s.addr ? '<p>' + esc(s.addr).replace(/\n/g, '<br>') + '</p>' : '<p class="ph">Address</p>') +
          (s.state ? '<p>' + esc(NS.stateName(s.state)) + ' (' + s.state + ')</p>' : '') +
          (s.gstin ? '<p>' + P.gstin + ': <b class="mono">' + esc(s.gstin) + '</b></p>' : '') + (s.phone ? '<p>' + P.ph + ': ' + esc(s.phone) + '</p>' : '') + (extra || '') +
          '</div></div><div class="sh-title"><p class="dt">' + title + '</p>' + (sub ? '<p class="copy">' + sub + '</p>' : '') + '</div></header>';
      },
      meta: function (pairs) {
        pairs = pairs.filter(function (p) { return p && p[1]; });
        var h = '';
        for (var i = 0; i < pairs.length; i += 2) h += '<tr><th>' + pairs[i][0] + '</th><td' + (pairs[i + 1] ? '' : ' colspan="3"') + '>' + pairs[i][1] + '</td>' + (pairs[i + 1] ? '<th>' + pairs[i + 1][0] + '</th><td>' + pairs[i + 1][1] + '</td>' : '') + '</tr>';
        return h ? '<table class="meta">' + h + '</table>' : '';
      },
      party: function (p, title, extra) {
        if (!p || !(p.name || p.addr)) return '<div class="pt"><h4>' + title + '</h4><p class="ph">Name and address</p></div>';
        return '<div class="pt"><h4>' + title + '</h4><b>' + esc(p.name) + '</b>' + (p.addr ? '<p>' + esc(p.addr).replace(/\n/g, '<br>') + '</p>' : '') +
          (p.state ? '<p>' + esc(NS.stateName(p.state)) + ' (' + p.state + ')</p>' : '') + (p.gstin ? '<p>' + P.gstin + ': <b class="mono">' + esc(p.gstin) + '</b></p>' : '') +
          (p.phone ? '<p>' + P.ph + ': ' + esc(p.phone) + '</p>' : '') + (extra || '') + '</div>';
      },
      tot: function (rows) {
        return '<table class="tot">' + rows.filter(Boolean).map(function (r) { return '<tr' + (r[2] ? ' class="' + r[2] + '"' : '') + '><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</table>';
      },
      words: function (n) { return n ? '<p class="words"><span>' + P.words + ':</span> <b>' + NS.inWords(n) + '</b></p>' : ''; },
      sign: function (d, top, bottom) { var s = d.seller; return '<div class="signbox"><p>' + (top || P['for'] + ' <b>' + esc(s.name || '') + '</b>') + '</p>' + (s.sign ? '<img src="' + s.sign + '" alt="">' : '<div class="sp"></div>') + '<p>' + (bottom || P.sign) + '</p></div>'; },
      blankSign: function (top, bottom) { return '<div class="signbox"><p>' + top + '</p><div class="sp"></div><p>' + bottom + '</p></div>'; },
      qr: function (d, amount) { return d.seller.upi && amount > 0 ? '<div class="qr"><div class="qr-img" data-qr="' + r2(amount) + '"></div><small>' + P.upi + '<br><b class="mono">' + esc(d.seller.upi) + '</b></small></div>' : ''; },
      made: function () { return '<p class="made">Made free at ' + esc(/^(localhost|127\.)/.test(location.hostname) ? (window.NS_CFG && NS_CFG.host || 'billing.niveshsahayak.in') : location.hostname.replace(/^www\./, '')) + '</p>'; },
      /* thermal roll: shop head, then key/value lines */
      thOpen: function (d, title) {
        var s = d.seller;
        return '<div class="sh th ' + esc(d.paper) + '" lang="en-IN" dir="ltr">' + (s.logo ? '<img class="logo" src="' + s.logo + '" alt="">' : '') +
          '<h2>' + (s.name ? esc(s.name) : '<span class="ph">Your business name</span>') + '</h2>' + (s.addr ? '<p>' + esc(s.addr).replace(/\n/g, '<br>') + '</p>' : '') +
          (s.gstin ? '<p>' + P.gstin + ': <b class="mono">' + esc(s.gstin) + '</b></p>' : '') + (s.phone ? '<p>' + P.ph + ': ' + esc(s.phone) + '</p>' : '') + (title ? '<p class="dt">' + title + '</p>' : '');
      },
      kv: function (pairs, cls) { pairs = pairs.filter(function (p) { return p && p[1] !== '' && p[1] != null; }); return pairs.length ? '<table class="kv' + (cls ? ' ' + cls : '') + '">' + pairs.map(function (p) { return '<tr' + (p[2] ? ' class="' + p[2] + '"' : '') + '><th>' + p[0] + '</th><td>' + p[1] + '</td></tr>'; }).join('') + '</table>' : ''; },
      money: function (n, sym) { return NS.money(n, sym); },
      date: function (s) { return NS.fmtDate(s); },
      mode: function (m) { return P[m === 'upi' ? 'upim' : m] || P.other; },
      changed: function () { fillForm(true); draw(); saveDraft(); },
      refill: function () { fillForm(); draw(); saveDraft(); },
      save: function () { return save(); }, print: function () { printDoc(); }, share: function () { shareDoc(); }, startNew: function () { startNew(); }, showTab: function (w) { showTab(w); },
      root: function () { return root; }, toast: NS.toast, cfg: function () { return CFG; }, editing: function () { return editingId; }
    };

    /* ---------- editor ---------- */
    function buildEditor() {
      var ed = $('#ed', root);
      var hub = (window.NS_CFG && NS_CFG.vault ? new URL(NS_CFG.vault, location.href).origin : 'https://my.niveshsahayak.in') + '/';
      ed.innerHTML = '<p class="hub-link"><a href="' + hub + '" target="_blank" rel="noopener">' + esc(t('hub.link')) + ' ›</a></p>' + S.form(K);
      ['logo', 'sign'].forEach(function (k) {
        var inp = $('#s-' + k, ed); if (!inp) return;
        inp.addEventListener('change', function (e) { var f = e.target.files[0]; if (f) shrink(f, k === 'logo' ? 360 : 420).then(function (u) { doc.seller[k] = u; fillForm(true); draw(); saveDraft(); }); });
        $('[data-clear="' + k + '"]', ed).addEventListener('click', function () { doc.seller[k] = ''; inp.value = ''; fillForm(true); draw(); saveDraft(); });
      });
      $$('[data-accent]', ed).forEach(function (b) { b.addEventListener('click', function () { doc.accent = b.getAttribute('data-accent'); fillForm(true); draw(); saveDraft(); }); });
      $$('[data-add]', ed).forEach(function (b) {
        b.addEventListener('click', function () {
          var n = b.getAttribute('data-add'); doc[n].push(S.newRow ? S.newRow(n, doc) : {}); renderRows(n);
          var first = $('[data-rows="' + n + '"] .it:last-child input', ed); if (first) first.focus();
          draw(); saveDraft();
        });
      });
      var sn = $('[data-b="seller.name"]', ed);
      if (sn) NS.suggest(sn, function () { return NSStore.list('biz'); }, function (x) { return x.name; }, function (b) {
        doc.seller = Object.assign(blank().seller, b); delete doc.seller.id; delete doc.seller.created; delete doc.seller.updated;
        fillForm(); suggestNumber(true); draw(); saveDraft();
      });
      var bn = $('[data-b="buyer.name"]', ed);
      if (bn) NS.suggest(bn, function () { return NSStore.list('party'); }, function (x) { return x.name; }, function (p) {
        doc.buyer = Object.assign(doc.buyer || {}, { name: p.name, addr: p.addr || '', city: p.city || '', pin: p.pin || '', state: p.state || '', gstin: p.gstin || '', phone: p.phone || '' });
        if (S.pickParty) S.pickParty(p, doc);
        fillForm(); draw(); saveDraft();
      });
      if (S.wire) S.wire(ed, K);
    }
    function renderRows(n) {
      var box = $('[data-rows="' + n + '"]', root); if (!box) return;
      box.innerHTML = doc[n].map(function (row, i) {
        return '<div class="it" data-i="' + i + '"><div class="it-head"><span>' + esc(t('it.n', { n: i + 1 })) + '</span>' + (doc[n].length > 1 || S.emptyRows ? '<button type="button" class="link" data-del="' + n + ':' + i + '">' + esc(t('it.rm')) + '</button>' : '') + '</div>' +
          '<div class="it-grid">' + S.rows[n](row, i, K) + '</div></div>';
      }).join('');
      $$('[data-del]', box).forEach(function (b) { b.addEventListener('click', function () { var x = b.getAttribute('data-del').split(':'); doc[x[0]].splice(+x[1], 1); renderRows(x[0]); draw(); saveDraft(); }); });
      $$('[data-sug="item"]', box).forEach(function (inp) {
        NS.suggest(inp, function () { return NSStore.list('item'); }, function (x) { return x.desc; }, function (m) {
          var i = +inp.getAttribute('data-i'), row = doc[n][i];
          if (S.pickItem) S.pickItem(row, m, doc); else { row.desc = m.desc; if (m.hsn) row.hsn = m.hsn; if (m.unit) row.unit = m.unit; if (m.rate != null && m.rate !== '') row.rate = m.rate; if (m.gst != null && m.gst !== '') row.gst = m.gst; }
          renderRows(n); draw(); saveDraft();
        });
      });
      if (S.rowsDrawn) S.rowsDrawn(n, box, K);
    }
    function fillForm(onlyLook) {
      var ed = $('#ed', root);
      if (!onlyLook) {
        $$('[data-b]', ed).forEach(function (e) { var v = getp(doc, e.getAttribute('data-b')); if (e.type === 'checkbox') e.checked = !!v; else e.value = v == null ? '' : v; });
        Object.keys(S.rows || {}).forEach(renderRows);
        ['seller.gstin', 'buyer.gstin'].forEach(function (p) { var e = $('[data-b="' + p + '"]', ed); if (e) checkGstin(e); });
      }
      $$('[data-accent]', ed).forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-accent') === doc.accent)); });
      ['logo', 'sign'].forEach(function (k) { var c = $('[data-clear="' + k + '"]', ed); if (c) c.hidden = !doc.seller[k]; });
      /* data-show="path" or "path=value" or "!path": a field shown only when the record says so */
      $$('[data-show]', ed).forEach(function (e) {
        var c = e.getAttribute('data-show'), neg = c[0] === '!', m = c.replace(/^!/, '').split('='), v = getp(doc, m[0]);
        var on = m.length > 1 ? m[1].split('|').indexOf(String(v)) >= 0 : !!v; e.hidden = neg ? on : !on;
      });
      if (S.look) S.look(ed, doc, K);
    }
    function checkGstin(inp) {
      var err = $('#' + inp.id + '-err', root), r = NS.gstinCheck(inp.value);
      if (err) { err.hidden = r.ok; err.textContent = r.ok ? '' : r.msg; }
      inp.setAttribute('aria-invalid', String(!r.ok));
      return r;
    }
    function onInput(e) {
      var el = e.target, p = el.getAttribute('data-b');
      if (p) {
        var v = el.type === 'checkbox' ? el.checked : el.value;
        if (/gstin$/.test(p) && typeof v === 'string') { v = el.value = v.toUpperCase(); var r = checkGstin(el); var sp = p.replace('gstin', 'state'); if (r.ok && r.state && !getp(doc, sp) && e.type === 'change') { setp(doc, sp, r.state); var se = $('[data-b="' + sp + '"]', root); if (se) se.value = r.state; } }
        if (p === 'copies') v = +v;
        setp(doc, p, v);
        if (p === 'date' && e.type === 'change') suggestNumber(false);
      } else if (el.getAttribute('data-r')) {
        var n = el.getAttribute('data-r'), i = +el.getAttribute('data-i'), k = el.getAttribute('data-k');
        doc[n][i][k] = el.type === 'checkbox' ? el.checked : el.value;
        if (S.rowInput) S.rowInput(n, i, k, doc, el, K);
      } else return;
      if (S.input) S.input(p, el, doc, K, e);
      fillForm(true); draw(); saveDraft();
    }

    /* ---------- numbering: PREFIX/YY-YY/001 per business and financial year ---------- */
    function prefixNow() { var c = CFG[S.type] || {}; return String(c.prefix != null ? c.prefix : typeof S.prefix === 'function' ? S.prefix(doc) : S.prefix).trim().replace(/[^A-Za-z0-9\/\-]/g, ''); }
    function suggestNumber(force) {
      if (editingId && !force) return Promise.resolve();
      var fy = NS.fy(doc.date), short = fy.slice(2, 4) + '-' + fy.slice(5), pre = prefixNow(), digits = S.digits || 3;
      var prefix = (pre ? pre + '/' : '') + short + '/';
      return NSStore.list('doc').then(function (all) {
        var who = key(doc.seller.name), max = 0;
        all.forEach(function (d) {
          if (d.type !== DT || d.id === editingId || NS.fy(d.date) !== fy || key(d.seller && d.seller.name) !== who) return;
          if (String(d.no || '').indexOf(prefix) !== 0) return;
          var m = String(d.no || '').match(/(\d+)\s*$/); if (m) max = Math.max(max, +m[1]);
        });
        if (force || !doc.no || doc.no === lastAuto || /^[A-Z]+\/\d\d-\d\d\/\d+$/.test(doc.no)) {
          doc.no = lastAuto = prefix + String(max + 1).padStart(digits, '0');
          var n = $('[data-b="no"]', root); if (n) n.value = doc.no;
          draw();
        }
      });
    }

    /* ---------- preview ---------- */
    function draw(all) {
      if (!sheet) return;
      var o = sums(), n = all === true ? Math.max(1, +doc.copies || 1) : 1;
      var labels = S.copyLabels && n > 1 ? S.copyLabels.slice(0, n) : [S.copyLabels && +doc.copies > 1 ? S.copyLabels[0] : ''];
      sheet.innerHTML = labels.map(function (l) { return S.sheet(doc, o, K, l); }).join('');
      var st = $('#ns-page') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'ns-page' }));
      st.textContent = '@media print{@page{' + (PAGES[doc.paper] || 'size:A4;margin:0') + '}}';
      $$('[data-qr]', sheet).forEach(function (q) { drawQr(q, +q.getAttribute('data-qr')); });
      var es = $('#ed-sums', root);
      if (es) es.innerHTML = S.edSums ? S.edSums(doc, o, K) : '<b>' + esc(t('sum.total', { v: NS.money(o.total || 0) })) + '</b>';
      if (S.drawn) S.drawn(doc, o, K);
      fit();
    }
    function drawQr(box, amount) {
      if (!window.qrcode || !doc.seller.upi) { box.hidden = true; return; }
      var link = 'upi://pay?pa=' + encodeURIComponent(doc.seller.upi.trim()) + '&pn=' + encodeURIComponent((doc.seller.name || '').slice(0, 40)) + '&am=' + amount.toFixed(2) + '&cu=INR&tn=' + encodeURIComponent((S.name(doc) + ' ' + doc.no).slice(0, 40));
      try { var qr = qrcode(0, 'M'); qr.addData(link); qr.make(); box.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (e) { box.hidden = true; }
    }
    function fit() {
      var wrap = $('.pv', root), sc = $('.pv-scale', root);
      if (!wrap || !sc || !wrap.clientWidth) return;
      var first = sheet.firstElementChild, k = Math.min(1, wrap.clientWidth / (first && first.offsetWidth || 794));
      sc.style.transform = 'scale(' + k + ')';
      wrap.style.height = (sheet.offsetHeight * k) + 'px';
    }
    function shrink(file, max) {
      return new Promise(function (res) {
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png'));
        };
        img.onerror = function () { NS.toast(t('img.bad'), 'bad'); res(''); };
        img.src = url;
      });
    }

    /* ---------- draft, save ---------- */
    function saveDraft() { try { localStorage.setItem(dkey, JSON.stringify({ doc: doc, id: editingId })); } catch (e) {} }
    function loadDraft() { try { var j = JSON.parse(localStorage.getItem(dkey) || 'null'); return j && j.doc ? j : null; } catch (e) { return null; } }
    function upsert(store, match, obj) { return NSStore.list(store).then(function (all) { var hit = all.filter(match)[0]; return NSStore.put(store, Object.assign(hit || {}, obj)); }); }
    function validate() {
      var o = sums(), p = [];
      if (!String(doc.seller.name || '').trim()) p.push(['k-seller-name', t('v.bname')]);
      if (S.validate) p = p.concat(S.validate(doc, o, K));
      if (!String(doc.no).trim()) p.push(['k-no', tw('v.no')]);
      if (String(doc.no).length > 16) p.push(['k-no', t('v.len')]);
      if (/[^A-Za-z0-9\/\-]/.test(doc.no)) p.push(['k-no', t('v.chars')]);
      if (doc.seller.gstin && !NS.gstinCheck(doc.seller.gstin).ok) p.push(['k-seller-gstin', t('v.sg')]);
      if (doc.buyer && doc.buyer.gstin && !NS.gstinCheck(doc.buyer.gstin).ok) p.push(['k-buyer-gstin', t('v.bg')]);
      return p;
    }
    function save() {
      var cur = doc, curId = editingId;   /* the record being saved, even if a new one is started while saving */
      var probs = validate();
      if (probs.length) {
        var f = $('#' + probs[0][0], root); NS.toast(probs[0][1], 'bad');
        if (f) { var det = f.closest('details'); if (det) det.open = true; showTab('edit'); f.focus(); }
        return Promise.reject(new Error(probs[0][1]));
      }
      var ask = S.confirm ? S.confirm(doc, sums(), K) : null;
      if (ask && !confirm(ask)) return Promise.reject(new Error('cancel'));
      return NSStore.list('doc').then(function (all) {
        var dup = all.filter(function (d) { return d.id !== editingId && d.type === DT && key(d.no) === key(doc.no) && NS.fy(d.date) === NS.fy(doc.date) && key(d.seller && d.seller.name) === key(doc.seller.name); })[0];
        if (dup && !confirm(tw('c.qdup', { no: doc.no }))) throw new Error('cancel');
      }).then(function () {
        var jobs = [], s = cur.seller, b = cur.buyer || {};
        jobs.push(upsert('biz', function (x) { return key(x.name) === key(s.name); }, JSON.parse(JSON.stringify(s))));
        if (S.party !== false && String(b.name || '').trim()) jobs.push(NSStore.list('party').then(function (all) {
          var hit = all.filter(function (x) { return key(x.name) === key(b.name); })[0], want = S.party || 'customer';
          var role = !hit || !hit.role ? want : hit.role === want || hit.role === 'both' ? hit.role : 'both';
          return NSStore.put('party', Object.assign(hit || {}, { name: b.name.trim(), addr: b.addr || (hit && hit.addr) || '', state: b.state || (hit && hit.state) || '', phone: b.phone || (hit && hit.phone) || '', gstin: b.gstin || (hit && hit.gstin) || '', role: role }));
        }));
        (S.masterItems ? S.masterItems(cur) : []).forEach(function (it) {
          if (!String(it.desc || '').trim()) return;
          jobs.push(upsert('item', function (x) { return key(x.desc) === key(it.desc); }, it));
        });
        return Promise.all(jobs);
      }).then(function () {
        var o = S.sums ? S.sums(cur) : { total: 0 }, rec = JSON.parse(JSON.stringify(cur)); rec.total = r2(o.total || 0);
        if (S.record) S.record(rec, o, K);
        if (curId) rec.id = curId;
        return NSStore.put('doc', rec);
      }).then(function (rec) {
        if (cur !== doc) return rec;
        editingId = rec.id; saveDraft(); NS.toast(tw('saved', { no: doc.no })); NS.folderWrite(false); NS.checkReminder(); setStatus();
        if (S.saved) S.saved(rec, K);
        return rec;
      }).catch(function (e) { if (e.message !== 'cancel') NS.toast(t('nosave', { e: e.message }), 'bad'); throw e; });
    }
    function setStatus() { var st = $('#tool-status', root); if (st) st.textContent = editingId ? tw('st.edit', { no: doc.no }) : tw('st.new'); }
    function startNew() {
      var seller = doc.seller, keep = S.keepOnNew ? S.keepOnNew(doc) : {};
      doc = Object.assign(blank(), keep); editingId = null; doc.seller = seller;
      fillForm(); suggestNumber(true); draw(); saveDraft(); setStatus();
    }
    function openDoc(rec, asCopy) {
      doc = Object.assign(blank(), JSON.parse(JSON.stringify(rec)));
      delete doc.id; delete doc.created; delete doc.updated; delete doc.total;
      if (S.load) S.load(doc);
      editingId = asCopy ? null : rec.id;
      if (asCopy) { doc.date = NS.today(); if (S.copyOf) S.copyOf(doc, rec, K); }
      buildEditor(); fillForm(); if (asCopy) suggestNumber(true); draw(); saveDraft(); setStatus(); showTab('edit');
      window.scrollTo({ top: root.offsetTop - 10, behavior: 'smooth' });
    }

    /* ---------- history ---------- */
    function mine(d) { return d.type === DT && (!S.mine || S.mine(d)); }
    function renderHistory() {
      var dlg = $('#ns-history'); if (!dlg) return;
      var list = $('[data-hist-list]', dlg), q = $('[data-hist-q]', dlg);
      NSStore.list('doc').then(function (all) {
        var v = key(q.value);
        var rows = all.filter(mine).filter(function (d) { return !v || [d.no, d.buyer && d.buyer.name, d.seller && d.seller.name, S.histText ? S.histText(d) : ''].join(' ').toLowerCase().indexOf(v) >= 0; })
          .sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.updated || 0) - (a.updated || 0); });
        list.innerHTML = rows.length ? rows.map(function (d) {
          return '<li><div><b class="mono">' + esc(d.no) + '</b> · ' + NS.fmtDate(d.date) + '<br><span>' + esc(S.histName ? S.histName(d) : d.buyer && d.buyer.name || t('h.nocust')) + '</span> · <b>' + NS.money(d.total || 0) + '</b>' + (S.histPill ? S.histPill(d, K) : '') + '</div>' +
            '<div class="row"><button type="button" class="btn sm" data-h="open" data-id="' + d.id + '">' + esc(t('h.open')) + '</button><button type="button" class="btn sm" data-h="copy" data-id="' + d.id + '">' + esc(t(S.copyLbl || 'h.copy')) + '</button>' +
            (S.histActs ? S.histActs(d, K) : '') +
            '<button type="button" class="btn sm danger" data-h="del" data-id="' + d.id + '">' + esc(t('h.del')) + '</button></div></li>';
        }).join('') : '<li class="empty">' + esc(t(v ? 'h.nomatch' : 'h.none')) + '</li>';
      });
    }
    function openHistory() {
      var dlg = $('#ns-history'); if (!dlg) return;
      if (!dlg._wired) {
        dlg._wired = true;
        $('[data-hist-q]', dlg).addEventListener('input', renderHistory);
        dlg.addEventListener('close', function () { histOpen = false; });
        $('[data-hist-list]', dlg).addEventListener('click', function (e) {
          var b = e.target.closest('[data-h]'); if (!b) return;
          var id = b.getAttribute('data-id'), act = b.getAttribute('data-h');
          NSStore.get('doc', id).then(function (rec) {
            if (!rec) return;
            if (act === 'open' || act === 'copy') { dlg.close(); openDoc(rec, act === 'copy'); }
            else if (act === 'del' && confirm(tw('c.del', { no: rec.no }))) return NSStore.del('doc', id).then(function () { if (editingId === id) { editingId = null; setStatus(); } renderHistory(); NS.toast(t('deleted')); });
            else if (S.histAct) return Promise.resolve(S.histAct(act, rec, K)).then(function (changed) { if (changed && editingId === id) { doc = Object.assign(doc, changed); fillForm(); draw(); } renderHistory(); });
          });
        });
      }
      histOpen = true; renderHistory();
      dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
    }
    K.history = openHistory; K.renderHistory = renderHistory; K.openDoc = openDoc;

    /* ---------- print, share ---------- */
    function fileName() { return S.name(doc) + ' ' + (doc.no || '') + (doc.buyer && doc.buyer.name ? ' - ' + doc.buyer.name : ''); }
    function printDoc() {
      var old = document.title; document.title = fileName();
      showTab('preview', true); draw(true); fit();
      setTimeout(function () { window.print(); document.title = old; draw(); }, 60);
    }
    function shareDoc() {
      showTab('preview', true); draw(true); fit();
      var o = sums(), text = S.name(doc) + ' ' + doc.no + ' from ' + (doc.seller.name || '') + '\nDate: ' + NS.fmtDate(doc.date) + (o.total ? '\nAmount: ' + NS.money(o.total) : '') + (S.shareText ? S.shareText(doc, o) : '') +
        (doc.seller.upi && S.upiShare !== false && o.due !== 0 ? '\nPay by UPI: ' + doc.seller.upi : '');
      NS.sharePdf($$('.sh', sheet), fileName(), doc.paper, S.name(doc) + ' ' + doc.no, text).then(function () { draw(); });
    }
    function showTab(which, quiet) {
      root.setAttribute('data-tab', which);
      $$('[data-tab-btn]', root).forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab-btn') === which)); });
      if (!quiet && which === 'preview') fit();
    }
    function labelButtons() {
      var L = { 'new': tw('b.new'), history: tw('b.hist'), save: t('b.save'), print: t('b.print'), share: t('b.share') };
      $$('[data-do]').forEach(function (b) { var k = b.getAttribute('data-do'); if (L[k]) b.textContent = L[k]; });
      $$('[data-tab-btn]', root).forEach(function (b) { b.textContent = t('tab.' + b.getAttribute('data-tab-btn')); });
      var pv = $('.pv', root); if (pv) pv.setAttribute('aria-label', t('tab.preview'));
      var dlg = $('#ns-history'); if (dlg) { $('h2', dlg).textContent = t('h.title'); $('label', dlg).textContent = t('h.search'); }
    }

    /* ---------- start ---------- */
    function init() {
      root = $('#tool');
      if (!root || root.getAttribute('data-doc') !== S.type) return;
      sheet = $('#sheet', root); dkey = 'ns-draft-' + S.type;
      var ed = $('#ed', root);
      ed.addEventListener('input', onInput); ed.addEventListener('change', onInput);
      doc = blank();
      var dr = loadDraft();
      if (dr) { doc = Object.assign(blank(), dr.doc); editingId = dr.id || null; }
      function render() { buildEditor(); fillForm(); draw(); setStatus(); labelButtons(); if (histOpen) renderHistory(); }
      render();
      document.addEventListener('ns-lang', render);
      var typed = false;
      ed.addEventListener('input', function () { typed = true; });
      /* the form shows at once (it used to wait for the data home, up to 6 s on a first visit, while the preview already showed);
             saved defaults arrive later and never overwrite what the visitor has started typing */
      if (!/[?&](open|from)=/.test(location.search)) root.classList.add('live');
      NSStore.ready().then(function () { return NSStore.meta('settings').then(function (c) { CFG = c || {}; }, function () {}); }).then(function () {
        if (NS.leaving) return;
        var open = new URLSearchParams(location.search).get('open');
        if (open) {
          history.replaceState(null, '', location.pathname + location.hash);
          return NSStore.get('doc', open).then(function (rec) { if (rec && mine(rec)) openDoc(rec, false); else NS.toast(t('conv.none'), 'bad'); }).catch(function () {});
        }
        if (dr) return;
        if (typed) return suggestNumber(false);
        var seller = doc.seller; doc = blank(); doc.seller = seller;
        return (CFG.defBiz ? NSStore.get('biz', CFG.defBiz).catch(function () {}) : Promise.resolve()).then(function (b) {
          if (b && !doc.seller.name) { doc.seller = Object.assign(blank().seller, b); delete doc.seller.id; delete doc.seller.created; delete doc.seller.updated; }
          render(); return suggestNumber(true);
        });
      }).then(function () {
        if (S.ready) S.ready(K);
        NS.checkReminder(); NSStore.persist().catch(function () {}); root.classList.add('live');
      });
      $$('[data-tab-btn]', root).forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab-btn')); }); });
      $$('[data-do]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.getAttribute('data-do');
          if (a === 'save') save().catch(function () {});
          else if (a === 'print') printDoc();
          else if (a === 'share') shareDoc();
          else if (a === 'new') { if (!editingId && (sums().total || 0) > 0 && !confirm(tw('c.new'))) return; startNew(); }
          else if (a === 'history') openHistory();
          else if (S.act) S.act(a, K);
        });
      });
      NS.onRestore = function () { if (!editingId) suggestNumber(true); };
      window.addEventListener('resize', fit);
      if (window.ResizeObserver) new ResizeObserver(fit).observe($('.pv', root));
      window.addEventListener('beforeprint', fit);
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save().catch(function () {}); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); printDoc(); }
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    return K;
  };
})();

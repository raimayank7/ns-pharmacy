/* "Only N in stock" under an item line while a sale is typed (billing, cash memo, POS, pharmacy).
   Reads the saved documents and item masters of the data home and works out the stock in hand with NSStock.inHand
   (stockcore.js), only for goods the business keeps stock of (bought, opened or adjusted). It never blocks the sale:
   it is a note on screen, like the warning on the stock site. The document being edited is left out of the count by
   its number, so reopening a saved bill does not warn about its own goods. Screen words: NS.t('sw.*'). */
(function () {
  'use strict';
  if (!window.NS || !window.NSStore || !window.NSStock) return;
  var SELL = /^(billing|cash-memo|pos|pharmacy)\./;
  if (!SELL.test((window.NS_CFG && NS_CFG.host) || '')) return;
  var $ = NS.$, $$ = NS.$$, S = NSStock, key = S.key, num = S.num;
  var DOCS = [], ITEMS = [], ready = false, timer = 0;

  function load() {
    return NSStore.ready().then(function () { return Promise.all([NSStore.list('doc'), NSStore.list('item')]); })
      .then(function (r) { DOCS = r[0] || []; ITEMS = r[1] || []; ready = true; soon(); }).catch(function () {});
  }
  function val(sel) { var e = $(sel); return e ? String(e.value || '').trim() : ''; }
  function seller() { return val('#s-name') || val('[data-b="seller.name"]'); }
  function docNo() { return val('#d-no') || val('[data-b="no"]'); }
  function rowOf(q) {   /* the box that holds one item line: its description and its quantity */
    var el = q.parentNode;
    while (el && el !== document.body && !el.querySelector('[data-k="desc"]')) el = el.parentNode;
    return el && el !== document.body ? el : null;
  }
  function check() {
    timer = 0;
    var qs = $$('#items [data-k="qty"], [data-r="items"][data-k="qty"]');
    $$('.sw-hint').forEach(function (h) { if (!h.parentNode || qs.every(function (q) { return rowOf(q) !== h.parentNode; })) h.remove(); });
    if (!ready || !qs.length) return;
    var biz = seller(); if (!biz) { $$('.sw-hint').forEach(function (h) { h.remove(); }); return; }
    var no = key(docNo()), b = key(biz);
    var docs = no ? DOCS.filter(function (d) { return !(key(d.seller && d.seller.name) === b && key(d.no) === no && d.type !== 'stk' && d.type !== 'pbill'); }) : DOCS;
    var have = S.inHand(docs, ITEMS, biz, NS.today ? NS.today() : '');
    var rows = qs.map(function (q) { var r = rowOf(q), d = r && r.querySelector('[data-k="desc"]'); return { q: q, r: r, k: key(d && d.value), n: num(q.value) }; });
    var want = {}; rows.forEach(function (x) { if (x.k) want[x.k] = (want[x.k] || 0) + x.n; });
    rows.forEach(function (x) {
      if (!x.r) return;
      var h = x.r.querySelector(':scope > .sw-hint');
      var m = ITEMS.filter(function (i) { return key(i.desc) === x.k; })[0];
      var bad = x.k && x.n > 0 && Object.prototype.hasOwnProperty.call(have, x.k) && want[x.k] > have[x.k] + 1e-9;
      if (!bad) { if (h) h.remove(); return; }
      var txt = have[x.k] > 0 ? NS.t('sw.only', { n: NS.qty ? NS.qty(have[x.k]) : have[x.k], u: (m && m.unit) || '' }).replace(/\s{2,}/g, ' ') : NS.t('sw.none');
      if (!h) { h = document.createElement('p'); h.className = 'sw-hint'; h.setAttribute('role', 'status'); x.r.appendChild(h); }
      if (h.textContent !== txt) h.textContent = txt;
    });
  }
  function soon() { if (!timer) timer = setTimeout(check, 120); }
  function start() {
    load();
    document.addEventListener('input', soon, true);
    document.addEventListener('change', soon, true);
    document.addEventListener('click', soon, true);
    document.addEventListener('ns-lang', soon);
    document.addEventListener('ns-data', load);
    window.addEventListener('focus', load);
    new MutationObserver(function (ms) { if (ms.some(function (m) { return !(m.target.classList && m.target.classList.contains('sw-hint')); })) soon(); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

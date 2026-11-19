// Token Radar dashboard: the ranked board, a filterable table, a per-protocol detail drawer with
// the model's own arithmetic, a live-token view, a model sandbox that recomputes the ranking in the
// page, and a methodology note. Static page, no framework and no network: it reads window.RADAR
// from data.js and nothing else. State lives in the URL hash, so a view can be linked and shot.
(function () {
  var DATA = window.RADAR;
  if (!DATA) { document.getElementById('board').textContent = 'No radar data found.'; return; }
  var MODEL = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, wlOnly: false, earlyOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { sector: 1, growth: MODEL.growth_weight, maturity: true, active: false };
  var floor = DATA.floor_usd;

  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(abs >= 1e10 ? 1 : 2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(abs >= 1e8 ? 0 : 1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function clampGrowth(g) { return Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, g === null || g === undefined ? 0 : g)); }
  function ageOf(row) { return row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days; }

  // The model in one function: the page recomputes a row from the snapshot figures, so the sandbox
  // moves the ranking live. With the sandbox at its defaults it reproduces the board exactly.
  function impliedOf(row) {
    var growthPct = clampGrowth(row.change_7d);
    var growthMult = 1 + (growthPct / 100) * sandbox.growth;
    var maturityMult = sandbox.maturity
      ? MODEL.maturity_floor + (Math.min(Math.max(ageOf(row), 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range
      : 1;
    var extraChains = Math.min(Math.max(row.chains.length - 1, 0), MODEL.chain_max);
    var chainMult = 1 + extraChains * MODEL.chain_step;
    var sectorMult = row.sector_multiple * sandbox.sector;
    return Math.max(1, Math.round(row.tvl_usd * sectorMult * growthMult * maturityMult * chainMult));
  }
  function isSandboxed() { return sandbox.active; }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'class') node.className = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
      else node.setAttribute(k, v);
    });
    if (children !== undefined && children !== null) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(function (c) { if (c !== null && c !== undefined) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    }
    return node;
  }

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' on ' + chain + ' and leave the supply position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + '\'s deepest pool on ' + chain + ' and leave the position open.';
    if (c.indexOf('yield') >= 0 && c.indexOf('aggregator') < 0) return 'Deposit $' + capital + ' into ' + name + '\'s highest-yield vault on ' + chain + ' and keep the receipt.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the staking receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund an account with $' + capital + ' and take one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('aggregator') >= 0) return 'Route $' + capital + ' through ' + name + ' on ' + chain + ' once a week so the activity is spread across its venues.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var action = actionFor(p, capital, chain);
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action every week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity lands in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s += ' Hold the position and check the protocol\'s own page.';
    return s;
  }

  function isWatchlist(row) { return row.tvl_usd >= floor; }
  function readHash() {
    var h = {};
    location.hash.slice(1).split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) h[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    if (h.q !== undefined) state.q = h.q;
    if (h.cat !== undefined) state.category = h.cat;
    if (h.chain !== undefined) state.chain = h.chain;
    if (h.tvl !== undefined) state.minTvl = +h.tvl || 0;
    if (h.wl !== undefined) state.wlOnly = h.wl === '1';
    if (h.early !== undefined) state.earlyOnly = h.early === '1';
    if (h.tab !== undefined) state.tab = h.tab;
    if (h.sort !== undefined) state.sort = h.sort;
    if (h.sel !== undefined) state.selected = h.sel || null;
  }
  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.minTvl) parts.push('tvl=' + state.minTvl);
    if (state.wlOnly) parts.push('wl=1');
    if (state.earlyOnly) parts.push('early=1');
    if (state.tab !== 'pre-token') parts.push('tab=' + state.tab);
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.selected) parts.push('sel=' + encodeURIComponent(state.selected));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
  }
  // Deterministic shot modes for screenshots: ?shot=board | detail | filtered.
  function applyShot() {
    var params = new URLSearchParams(location.search);
    var shot = params.get('shot');
    if (shot === 'detail') { state.selected = DATA.rows[0].slug; }
    else if (shot === 'filtered') {
      var counts = {};
      DATA.rows.forEach(function (r) { counts[r.category || 'Other'] = (counts[r.category || 'Other'] || 0) + 1; });
      var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
      state.category = top; state.sort = 'implied';
    }
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.wlOnly && !isWatchlist(r)) return false;
      if (state.earlyOnly && isWatchlist(r)) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -999 : a.change_7d; bv = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'conviction') { av = a.conviction; bv = b.conviction; }
      else { av = impliedOf(a); bv = impliedOf(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }
  function ranked(list) {
    // Ranks follow the computed implied value, sandbox or not; ties break on slug.
    var s = list.slice().sort(function (a, b) { return impliedOf(b) - impliedOf(a) || (a.slug < b.slug ? -1 : 1); });
    var map = {};
    s.forEach(function (r, i) { map[r.slug] = i + 1; });
    return map;
  }

  function header() {
    return el('header', { class: 'top' }, [
      el('div', { class: 'eyebrow', text: 'DefiLlama snapshot · ' + DATA.as_of + ' · model ' + DATA.model_version }),
      el('h1', {}, [document.createTextNode('Token Radar'), el('span', { class: 'dot', text: '.' })]),
      el('p', { class: 'lede', text: 'Every protocol in the snapshot that still records no token, ranked by what its launch would be worth. The multiple is not a guess: each sector is priced off the live protocols in that sector that already trade. Click any row for the model behind the rank and the six steps to farm it.' })
    ]);
  }
  function stats() {
    var top = DATA.rows[0];
    var items = [
      ['Protocols ranked', String(DATA.board_size)],
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
      ['Early finds below the floor', String(DATA.early_size)],
      ['Total implied value', fmtUsd(DATA.total_implied_usd)],
      ['Top implied value · ' + top.name, fmtUsd(top.implied_value_usd)]
    ];
    return el('div', { class: 'stats' }, items.map(function (it) {
      return el('div', { class: 'stat' }, [el('span', { text: it[0] }), el('b', { text: it[1] })]);
    }));
  }
  function spotlight() {
    return el('div', { class: 'spot' }, DATA.rows.slice(0, 5).map(function (r) {
      return el('button', { class: 'card', type: 'button', onclick: function () { openDetail(r.slug); } }, [
        el('div', { class: 'rk', text: '#' + r.rank }),
        el('div', { class: 'nm', text: r.name }),
        el('div', { class: 'vl', text: fmtUsd(impliedOf(r)) }),
        el('div', { class: 'ct', text: (r.category || 'Other') + ' · TVL ' + fmtUsd(r.tvl_usd) })
      ]);
    }));
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search protocol or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { 'aria-label': 'Category' }, [el('option', { value: 'all', text: 'All categories' })].concat(categories.map(function (c) {
      return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')' });
    })));
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Chain' }, [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) {
      return el('option', { value: c, text: c });
    })));
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var tvlSel = el('select', { 'aria-label': 'Minimum TVL' }, [
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '10000000', text: 'TVL ≥ $10M' }),
      el('option', { value: '50000000', text: 'TVL ≥ $50M' }),
      el('option', { value: '500000000', text: 'TVL ≥ $500M' }),
      el('option', { value: '1000000000', text: 'TVL ≥ $1B' })
    ]);
    tvlSel.value = String(state.minTvl);
    tvlSel.addEventListener('change', function () { state.minTvl = +tvlSel.value; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl-only' });
    wlBox.checked = state.wlOnly;
    wlBox.addEventListener('change', function () { state.wlOnly = wlBox.checked; if (state.wlOnly) state.earlyOnly = false; writeHash(); render(); });
    var earlyBox = el('input', { type: 'checkbox', id: 'early-only' });
    earlyBox.checked = state.earlyOnly;
    earlyBox.addEventListener('change', function () { state.earlyOnly = earlyBox.checked; if (state.earlyOnly) state.wlOnly = false; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token (' + DATA.board_size + ')', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (' + DATA.live_size + ')', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var csv = el('button', { class: 'btn', type: 'button', text: 'Download board.csv', onclick: exportCsv });
    var reset = el('button', { class: 'btn', type: 'button', text: 'Reset', onclick: function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.wlOnly = false; state.earlyOnly = false; state.sort = 'implied'; sandbox.active = false; sandbox.sector = 1; sandbox.growth = MODEL.growth_weight; sandbox.maturity = true; writeHash(); render();
    }});
    return el('div', { class: 'controls' }, [
      el('div', { class: 'field' }, [el('label', { for: 'q', text: 'Search' }), search]),
      el('div', { class: 'field' }, [el('label', { text: 'Category' }), catSel]),
      el('div', { class: 'field' }, [el('label', { text: 'Chain' }), chainSel]),
      el('div', { class: 'field' }, [el('label', { text: 'Minimum TVL' }), tvlSel]),
      el('label', { class: 'check', for: 'wl-only' }, [wlBox, document.createTextNode(' Watchlist only')]),
      el('label', { class: 'check', for: 'early-only' }, [earlyBox, document.createTextNode(' Early finds only')]),
      el('div', { class: 'field' }, [el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, [pre, live])]),
      csv, reset,
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    ]);
  }
  function exportCsv() {
    var list = sortedRows(rows());
    var head = 'rank,slug,name,category,chains,tvl_usd,change_7d,age_days,implied_value_usd,conviction';
    var lines = list.map(function (r) {
      var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
      return [ranked(list)[r.slug], r.slug, q(r.name), q(r.category || ''), q(r.chains.join(';')), r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, impliedOf(r), r.conviction].join(',');
    });
    var blob = new Blob([[head].concat(lines).join('\n')], { type: 'text/csv' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'token-radar-board.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function sortHeader(key, label) {
    return el('th', {}, el('button', {
      type: 'button', class: 'btn', style: 'padding:2px 8px;font-size:12px',
      onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); }
    }, [document.createTextNode(label + ' '), state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? '↓' : '↑' }) : null]));
  }
  function boardTable() {
    var list = sortedRows(rows());
    var ranks = ranked(list);
    var table = el('table', { class: 'board' });
    table.appendChild(el('caption', { text: 'Ranked by implied launch value' + (isSandboxed() ? ' — sandbox values in effect' : '') + '. Click a row for the model and the farm plan.' }));
    var thead = el('thead', {}, el('tr', {}, [
      sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'),
      el('th', { text: 'Category' }), el('th', { text: 'Chains' }),
      sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'),
      sortHeader('implied', 'Implied value'), sortHeader('conviction', 'Conviction')
    ]));
    table.appendChild(thead);
    var tbody = el('tbody', {});
    if (list.length === 0) {
      table.appendChild(el('tbody', {}, el('tr', {}, el('td', { colspan: '9', class: 'empty' }, [
        el('h2', { text: 'No protocol matches that filter' }),
        el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.wlOnly = false; state.earlyOnly = false; writeHash(); render(); } })
      ]))));
      return table;
    }
    list.forEach(function (r) {
      var growth = r.change_7d;
      var tr = el('tr', {
        tabindex: '0',
        class: state.selected === r.slug ? 'sel' : null,
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      }, [
        el('td', { class: 'num', text: '#' + ranks[r.slug] }),
        el('td', {}, [el('b', { text: r.name }), ' ', isWatchlist(r) ? el('span', { class: 'pill wl', text: 'watchlist' }) : el('span', { class: 'pill early', text: 'early' })]),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (growth === null ? '' : growth >= 0 ? 'pos' : 'neg'), text: fmtPct(growth) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(impliedOf(r)) }),
        el('td', { class: 'num' }, [el('span', { class: 'bar' }, el('i', { style: 'width:' + r.conviction + '%' })), document.createTextNode(String(r.conviction))])
      ]);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }
  function liveTable() {
    var table = el('table', { class: 'board' });
    table.appendChild(el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are what calibrates it.' }));
    var thead = el('thead', {}, el('tr', {}, [
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'num', text: 'TVL' }),
      el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7d' })
    ]));
    table.appendChild(thead);
    var tbody = el('tbody', {});
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, el('b', { text: r.name })),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.multiple === null ? '—' : r.multiple.toFixed(2) + 'x' }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })
      ]));
    });
    table.appendChild(tbody);
    return table;
  }

  function openDetail(slug) { state.selected = slug; writeHash(); render(); }
  function closeDetail() { state.selected = null; writeHash(); render(); }
  function findRow(slug) { return DATA.rows.filter(function (r) { return r.slug === slug; })[0] || null; }
  function detailDrawer() {
    var r = findRow(state.selected);
    if (!r) return null;
    var growthPct = clampGrowth(r.change_7d);
    var growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
    var maturityMult = MODEL.maturity_floor + (Math.min(Math.max(ageOf(r), 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var chainMult = 1 + Math.min(Math.max(r.chains.length - 1, 0), MODEL.chain_max) * MODEL.chain_step;
    var sector = DATA.sectors.filter(function (s) { return s.category === (r.category || 'Other'); })[0];
    var comps = DATA.live.filter(function (l) { return (l.category || 'Other') === (r.category || 'Other'); }).slice(0, 5);
    var why = [];
    if (sector && sector.fallback) why.push('its sector has only ' + sector.live_count + (sector.live_count === 1 ? ' live name' : ' live names') + ' in the snapshot, so it is priced at the market median of ' + DATA.global_multiple.toFixed(2) + 'x');
    else if (r.sector_multiple > DATA.global_multiple + 0.005) why.push('its sector trades above the market median (' + r.sector_multiple.toFixed(2) + 'x vs ' + DATA.global_multiple.toFixed(2) + 'x)');
    else if (r.sector_multiple < DATA.global_multiple - 0.005) why.push('its sector trades below the market median (' + r.sector_multiple.toFixed(2) + 'x vs ' + DATA.global_multiple.toFixed(2) + 'x)');
    else why.push('its sector trades in line with the market median (' + r.sector_multiple.toFixed(2) + 'x)');
    if (r.change_7d !== null && r.change_7d > 10) why.push('TVL is growing fast (' + fmtPct(r.change_7d) + ' in 7 days)');
    if (r.change_7d !== null && r.change_7d < -10) why.push('TVL is shrinking (' + fmtPct(r.change_7d) + ' in 7 days), which holds the value back');
    if (r.chains.length >= 5) why.push('it runs on ' + r.chains.length + ' chains');
    if (r.age_days !== null && r.age_days > 730) why.push('it has survived ' + fmtAge(r.age_days) + ' of tracking');
    var steps = farmSteps(r).map(stepText);
    var drawer = el('aside', { class: 'drawer', role: 'dialog', 'aria-label': r.name + ' detail' }, [
      el('button', { class: 'close', type: 'button', text: 'Close ✕', onclick: closeDetail }),
      el('div', { class: 'eyebrow', text: 'Rank #' + r.rank + ' · ' + (isWatchlist(r) ? 'watchlist' : 'early find') }),
      el('h2', { text: r.name }),
      el('p', { class: 'sub', text: (r.category || 'Other') + ' · ' + r.chains.join(', ') + ' · tracked since ' + (r.listed_at || 'unknown') }),
      el('div', { class: 'kv' }, [
        el('div', {}, [el('span', { text: 'Implied launch value' }), el('b', { text: fmtUsd(impliedOf(r)) })]),
        el('div', {}, [el('span', { text: 'TVL' }), el('b', { text: fmtUsd(r.tvl_usd) })]),
        el('div', {}, [el('span', { text: '7-day TVL change' }), el('b', { text: fmtPct(r.change_7d) })]),
        el('div', {}, [el('span', { text: 'Conviction (0–100)' }), el('b', { text: String(r.conviction) })])
      ]),
      el('p', { class: 'note', text: 'Why it ranks here: ' + why.join('; ') + '.' }),
      el('h3', { text: 'How the value is built' }),
      el('table', { class: 'mini' }, el('tbody', {}, [
        el('tr', {}, [el('td', { text: 'TVL' }), el('td', { text: fmtUsd(r.tvl_usd) })]),
        el('tr', {}, [el('td', { text: 'Sector multiple (' + (r.category || 'Other') + ', ' + r.sector_live_count + (r.sector_live_count === 1 ? ' live name' : ' live names') + ')' }), el('td', { text: '× ' + r.sector_multiple.toFixed(2) })]),
        el('tr', {}, [el('td', { text: 'Growth multiplier (' + fmtPct(growthPct) + ' clamped)' }), el('td', { text: '× ' + growthMult.toFixed(2) })]),
        el('tr', {}, [el('td', { text: 'Maturity multiplier (' + fmtAge(r.age_days) + ' old)' }), el('td', { text: '× ' + maturityMult.toFixed(2) })]),
        el('tr', {}, [el('td', { text: 'Chain multiplier (' + r.chains.length + ' chains)' }), el('td', { text: '× ' + chainMult.toFixed(2) })]),
        el('tr', {}, [el('td', {}, el('b', { text: 'Implied value' })), el('td', {}, el('b', { text: fmtUsd(impliedOf(r)) }))])
      ])),
      el('h3', { text: 'Live comparables in ' + (r.category || 'Other') }),
      comps.length ? el('table', { class: 'mini' }, el('tbody', {}, comps.map(function (l) {
        return el('tr', {}, [el('td', { text: l.name }), el('td', { text: l.multiple === null ? '—' : l.multiple.toFixed(2) + 'x of TVL' })]);
      }))) : el('p', { class: 'note', text: 'No live-token protocol in this sector is among the ' + DATA.live.length + ' largest shown; with only ' + r.sector_live_count + (r.sector_live_count === 1 ? ' live name' : ' live names') + ' in the sector, it is priced at the market median of ' + DATA.global_multiple.toFixed(2) + 'x.' }),
      el('h3', { text: 'Farm plan — six steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var parts = s.split(' Cost: ');
        var head = parts[0];
        var rest = parts[1] ? ' Cost: ' + parts[1] : '';
        return el('li', {}, [document.createTextNode(head), el('div', { class: 'cost', text: rest.trim() })]);
      })),
      el('h3', { text: 'Risks to know' }),
      el('p', { class: 'note', text: 'A pre-token protocol may never launch a token, and a launch may pay far less than the implied value. Never farm with money you cannot afford to lose, never pay anyone to claim an airdrop, and verify every link on the protocol\'s own page.' })
    ]);
    return drawer;
  }
  function sandboxPanel() {
    var sectorOut = el('output', { text: sandbox.sector.toFixed(2) + 'x' });
    var growthOut = el('output', { text: sandbox.growth.toFixed(2) });
    var sectorRange = el('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(sandbox.sector), 'aria-label': 'Sector scale' });
    sectorRange.addEventListener('input', function () { sandbox.sector = +sectorRange.value; sandbox.active = true; sectorOut.textContent = sandbox.sector.toFixed(2) + 'x'; render(); });
    var growthRange = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(sandbox.growth), 'aria-label': 'Growth weight' });
    growthRange.addEventListener('input', function () { sandbox.growth = +growthRange.value; sandbox.active = true; growthOut.textContent = sandbox.growth.toFixed(2); render(); });
    var matBox = el('input', { type: 'checkbox' });
    matBox.checked = sandbox.maturity;
    matBox.addEventListener('change', function () { sandbox.maturity = matBox.checked; sandbox.active = true; render(); });
    var reset = el('button', { class: 'btn', type: 'button', text: 'Back to the model', onclick: function () { sandbox.active = false; sandbox.sector = 1; sandbox.growth = MODEL.growth_weight; sandbox.maturity = true; render(); } });
    return el('section', { class: 'sandbox', 'aria-label': 'Model sandbox' }, [
      el('h2', { text: 'Model sandbox — move the dials, watch the ranking move' }),
      el('p', { class: 'sub', text: 'The sandbox recomputes every row from the snapshot figures. Nothing here is saved; the board file keeps the model as published.' }),
      el('div', { class: 'row' }, [el('span', { text: 'Sector scale (all multiples ×)' }), sectorRange, sectorOut]),
      el('div', { class: 'row' }, [el('span', { text: 'Growth weight (0 = ignore 7-day change)' }), growthRange, growthOut]),
      el('div', { class: 'row' }, [el('span', { text: 'Maturity multiplier on' }), matBox, el('span', {})]),
      reset,
      isSandboxed() ? el('span', { class: 'badge', text: 'SANDBOX VALUES' }) : null
    ]);
  }
  function methodology() {
    var rows = DATA.sectors.filter(function (s) { return s.live_count >= MODEL.sector_min_live; }).slice(0, 10).map(function (s) {
      return el('tr', {}, [el('td', { text: s.category }), el('td', { text: String(s.live_count) + ' live' }), el('td', { text: s.multiple.toFixed(2) + 'x' })]);
    });
    return el('section', { class: 'method' }, [
      el('h2', { text: 'How the ranking works' }),
      el('p', { text: 'Implied value = TVL × sector multiple × growth multiplier × maturity multiplier × chain multiplier. The sector multiple is the median market-cap-per-dollar-of-TVL of the live protocols in that sector, taken from this same snapshot; a sector with fewer than ' + MODEL.sector_min_live + ' live names falls back to the market median of ' + DATA.global_multiple.toFixed(2) + 'x. Growth is the seven-day TVL change clamped to ' + MODEL.growth_floor + '%…+' + MODEL.growth_cap + '%, weighted ' + MODEL.growth_weight + '. Maturity rises from ' + MODEL.maturity_floor + ' to ' + (MODEL.maturity_floor + MODEL.maturity_range) + ' over ' + MODEL.maturity_days + ' days. Each extra chain adds ' + (MODEL.chain_step * 100) + '% up to ' + MODEL.chain_max + ' chains.' }),
      el('p', { text: 'Coverage: the board ranks all ' + DATA.watchlist_size + ' watchlist protocols (TVL at or above ' + fmtUsd(floor) + ', no token, not a wrapped, staked or bridged product) plus ' + DATA.early_size + ' early finds below the floor — every rankable pre-token protocol in the snapshot. Live-token protocols are set aside and shown with their market caps, because a market cap is a fact and an implied value is a model.' }),
      el('table', {}, [el('thead', {}, el('tr', {}, [el('th', { text: 'Sector' }), el('th', { text: 'Live names' }), el('th', { text: 'Multiple' })])), el('tbody', {}, rows)]),
      el('p', { text: 'Caveats: a snapshot is one day. A protocol can lose TVL, delay a launch, or never launch at all; the conviction score (size, age, growth, chain breadth) is a display score, not a rank. The farm plan is generic per category — always check the protocol\'s own pages before moving funds.' })
    ]);
  }
  function render() {
    var main = document.getElementById('board');
    main.setAttribute('aria-busy', 'true');
    main.textContent = '';
    var wrap = el('div', { class: 'wrap' }, [
      header(), stats(), spotlight(), controls(),
      state.tab === 'pre-token' ? boardTable() : liveTable(),
      sandboxPanel(), methodology(),
      el('footer', { class: 'foot', text: 'Snapshot ' + DATA.as_of + ' · source: ' + DATA.source + ' · model ' + DATA.model_version + ' · ' + DATA.board_size + ' rows · static page, no network requests.' })
    ]);
    main.appendChild(wrap);
    var drawer = detailDrawer();
    if (drawer) main.appendChild(drawer);
    main.setAttribute('aria-busy', 'false');
    window.__shotReady = true;
  }
  readHash();
  applyShot();
  render();
})();

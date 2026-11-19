/* Token Radar dashboard: renders window.RADAR with no network and no framework.
   Views: the board (#/board), one protocol's detail (#/p/<slug>), the live-token
   tab (#/live), the set-aside tab (#/aside) and the model sandbox (#/model).
   Board filters live in the hash (#/board?cat=Dexs&wl=1) so a view is a link. */
(function () {
  'use strict';
  var R = window.RADAR;
  var WL = new Set(R.watchlist);
  var view = document.getElementById('view');
  var tabsEl = document.getElementById('tabs');
  var statsEl = document.getElementById('stats');
  var methodEl = document.getElementById('method');

  /* ------------------------------------------------------------ formatting */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageText(days) {
    if (days == null) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function chainText(chains) {
    if (!chains || chains.length === 0) return '—';
    return chains.length <= 2 ? chains.join(', ') : chains[0] + ', ' + chains[1] + ' +' + (chains.length - 2);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ------------------------------------------------------------ hash state */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var path = parts[0] || 'board';
    var q = new URLSearchParams(parts[1] || '');
    return {
      view: path === '' ? 'board' : path,
      slug: path.indexOf('p/') === 0 ? decodeURIComponent(path.slice(2)) : null,
      q: q.get('q') || '',
      cat: q.get('cat') || '',
      chain: q.get('chain') || '',
      wl: q.get('wl') === '1',
      sort: q.get('sort') || 'implied',
    };
  }
  function boardHash(state) {
    var q = new URLSearchParams();
    if (state.q) q.set('q', state.q);
    if (state.cat) q.set('cat', state.cat);
    if (state.chain) q.set('chain', state.chain);
    if (state.wl) q.set('wl', '1');
    if (state.sort && state.sort !== 'implied') q.set('sort', state.sort);
    var s = q.toString();
    return '#/board' + (s ? '?' + s : '');
  }

  /* ------------------------------------------------------------ chrome */
  var TABS = [
    ['board', 'Board'],
    ['live', 'Live tokens'],
    ['aside', 'Set aside'],
    ['model', 'Model sandbox'],
  ];
  function renderChrome(state) {
    var total = R.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    statsEl.innerHTML =
      '<div><dt>Ranked</dt><dd>' + R.board_size + '</dd></div>' +
      '<div><dt>Watchlist</dt><dd>' + R.watchlist_size + '</dd></div>' +
      '<div><dt>Implied total</dt><dd>' + money(total) + '</dd></div>' +
      '<div><dt>Set aside</dt><dd>' + R.set_aside_size + '</dd></div>';
    var current = state.slug ? 'board' : (state.view === 'p' ? 'board' : state.view);
    tabsEl.innerHTML = TABS.map(function (t) {
      var href = t[0] === 'board' ? '#/board' : '#/' + t[0];
      var cur = current === t[0] ? ' aria-current="page"' : '';
      return '<a href="' + href + '"' + cur + '>' + t[1] + '</a>';
    }).join('');
    methodEl.innerHTML = 'Model <b>' + esc(R.model_version) + '</b>: implied value = TVL × ' + R.weights.base +
      ' × growth × maturity × breadth, from the snapshot alone. Snapshot ' + esc(R.as_of) +
      ', floor ' + money(R.floor_usd) + '. Source: ' + esc(R.source) + '.';
  }

  /* ------------------------------------------------------------ the board */
  function categories() {
    var seen = {};
    R.rows.forEach(function (r) { if (r.category) seen[r.category] = 1; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    R.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = 1; }); });
    return Object.keys(seen).sort();
  }
  function filteredRows(state) {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.wl && !WL.has(r.slug)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var sort = state.sort;
    rows = rows.slice();
    if (sort === 'tvl') rows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (sort === 'growth') rows.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else if (sort === 'age') rows.sort(function (a, b) { return (b.age_days || 0) - (a.age_days || 0); });
    else if (sort === 'name') rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else rows.sort(function (a, b) { return a.rank - b.rank; });
    return rows;
  }
  function optionList(values, current, allLabel) {
    var out = '<option value="">' + allLabel + '</option>';
    values.forEach(function (v) {
      out += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return out;
  }
  function renderBoard(state) {
    var rows = filteredRows(state);
    var html = '<section class="panel"><h2>The board</h2>' +
      '<p>Every protocol in the snapshot that records no token and is not a wrapped, staked or ' +
      'bridged product of one that trades — the ' + R.watchlist_size + '-protocol watchlist plus ' +
      (R.board_size - R.watchlist_size) + ' more the radar found below the floor. Ranked by ' +
      'implied value, most valuable first.</p>' +
      '<div class="controls">' +
      '<input type="search" id="f-q" placeholder="Search a protocol…" value="' + esc(state.q) + '" aria-label="Search">' +
      '<select id="f-cat" aria-label="Category">' + optionList(categories(), state.cat, 'All categories') + '</select>' +
      '<select id="f-chain" aria-label="Chain">' + optionList(chains(), state.chain, 'All chains') + '</select>' +
      '<label><input type="checkbox" id="f-wl"' + (state.wl ? ' checked' : '') + '> Watchlist only</label>' +
      '<select id="f-sort" aria-label="Sort">' +
      '<option value="implied"' + (state.sort === 'implied' ? ' selected' : '') + '>Sort: implied value</option>' +
      '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>Sort: TVL</option>' +
      '<option value="growth"' + (state.sort === 'growth' ? ' selected' : '') + '>Sort: 7d change</option>' +
      '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Sort: age</option>' +
      '<option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>Sort: name</option>' +
      '</select>' +
      '<span class="count">Showing ' + rows.length + ' of ' + R.board_size + '</span>' +
      '</div></section>';
    if (rows.length === 0) {
      html += '<div class="panel empty">Nothing matches these filters. Clear the search or pick another category.</div>';
    } else {
      html += '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
        '<th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">Implied value</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var chg = r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
        html += '<tr data-slug="' + esc(r.slug) + '"><td><span class="rank' + (r.rank <= 3 ? ' gold' : '') + '">' + r.rank + '</span></td>' +
          '<td class="name">' + esc(r.name) + (WL.has(r.slug) ? ' <span class="tag wl">Watchlist</span>' : '') +
          '<small>' + esc(r.slug) + '</small></td>' +
          '<td>' + esc(r.category || '—') + '</td><td>' + esc(chainText(r.chains)) + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + chg + '</td>' +
          '<td class="num">' + ageText(r.age_days) + '</td><td class="num imp">' + money(r.implied_value_usd) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    view.innerHTML = html;
    var apply = function () {
      var next = {
        q: document.getElementById('f-q').value,
        cat: document.getElementById('f-cat').value,
        chain: document.getElementById('f-chain').value,
        wl: document.getElementById('f-wl').checked,
        sort: document.getElementById('f-sort').value,
      };
      history.replaceState(null, '', boardHash(next));
      renderBoard(next);
      var qEl = document.getElementById('f-q');
      if (document.activeElement !== qEl) qEl.focus();
      qEl.setSelectionRange(qEl.value.length, qEl.value.length);
    };
    document.getElementById('f-q').addEventListener('input', apply);
    ['f-cat', 'f-chain', 'f-wl', 'f-sort'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', apply);
    });
    view.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }

  /* ------------------------------------------------------------ detail */
  function renderDetail(slug) {
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) { r = R.rows[i]; break; }
    if (!r) {
      view.innerHTML = '<div class="panel empty">No protocol on the board has the slug “' + esc(slug) + '”.<br><a href="#/board">Back to the board</a></div>';
      return;
    }
    var parts = r.parts;
    var maxBase = 0;
    R.rows.forEach(function (x) { if (x.parts[0] > maxBase) maxBase = x.parts[0]; });
    function factorRow(label, text, value, width, cls) {
      return '<li><div class="row"><span>' + label + '</span><b>' + text + '</b></div>' +
        '<div class="bar"><i class="' + (cls || '') + '" style="width:' + clamp(width, 4, 100).toFixed(0) + '%"></i></div></li>';
    }
    var html = '<a class="back" href="#/board">← Back to the board</a>' +
      '<section class="panel"><div class="detail-head"><h2>' + esc(r.name) + '</h2>' +
      '<span class="imp">' + money(r.implied_value_usd) + ' implied</span></div>' +
      '<div class="chips"><span class="tag">Rank #' + r.rank + ' of ' + R.board_size + '</span>' +
      (WL.has(r.slug) ? '<span class="tag wl">Watchlist</span>' : '') +
      '<span class="tag">' + esc(r.category || 'No category') + '</span>' +
      '<span class="tag">TVL ' + money(r.tvl_usd) + '</span>' +
      '<span class="tag">7d ' + pct(r.change_7d) + '</span>' +
      '<span class="tag">Age ' + ageText(r.age_days) + '</span>' +
      '<span class="tag">' + esc(chainText(r.chains)) + '</span></div>' +
      '<p>The snapshot records no token for ' + esc(r.name) + ' — no market cap, no CoinGecko id, no ' +
      'symbol — and it is not a wrapped, staked or bridged product of a token that trades. ' +
      'That is what puts it on this board; the implied value below is the model’s estimate of ' +
      'what a launch would be worth, not a price.</p></section>' +
      '<div class="grid2"><section class="panel"><h2>How the value is built</h2>' +
      '<p>Implied value = base × growth × maturity × breadth, from the snapshot alone.</p><ul class="factors">' +
      factorRow('Base — TVL × ' + R.weights.base, money(parts[0]), parts[0], (parts[0] / maxBase) * 100, 'b') +
      factorRow('Growth — 7d change × ' + R.weights.growth_weight, '×' + parts[1].toFixed(2), parts[1], ((parts[1] - 0.5) / 1.5) * 100, 'g') +
      factorRow('Maturity — age ' + ageText(r.age_days), '×' + parts[2].toFixed(2), parts[2], parts[2] * 100, '') +
      factorRow('Breadth — ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's'), '×' + parts[3].toFixed(2), parts[3], ((parts[3] - 1) / 0.2) * 100, 'gold') +
      '</ul><p class="note">Bars are each factor on its own scale; the product of the four is the implied value.</p>' +
      '</section><section class="panel"><h2>How to farm it</h2>' +
      '<p>Six steps, sized to this protocol. Costs are gas plus the capital the position holds.</p><ol class="plan">' +
      r.farm.map(function (s) {
        var m = s.match(/^(.*?)\sCost:\s(.*)\.\sTime:\s(.*)\.$/);
        if (!m) return '<li>' + esc(s) + '</li>';
        // m[1] already ends with a full stop: joinStep put one there, so add none.
        return '<li>' + esc(m[1]) + '<br><span class="cost">Cost: ' + esc(m[2]) + ' · Time: ' + esc(m[3]) + '</span></li>';
      }).join('') +
      '</ol></section></div>';
    view.innerHTML = html;
  }

  /* ------------------------------------------------------------ live tab */
  function renderLive() {
    var html = '<section class="panel"><h2>Live tokens</h2><p>Protocols that already trade, for ' +
      'contrast: the market’s own values, not the model’s. The top ' + R.live.length +
      ' by market cap. A pre-token protocol’s launch is judged against these.</p></section>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>';
    R.live.forEach(function (p) {
      var chg = p.change_7d == null ? '—' : '<span class="' + (p.change_7d >= 0 ? 'up' : 'down') + '">' + pct(p.change_7d) + '</span>';
      html += '<tr><td class="name">' + esc(p.name) + '<small>' + esc(p.slug) + '</small></td>' +
        '<td>' + esc(p.category || '—') + '</td><td>' + esc(chainText(p.chains)) + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num imp">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + chg + '</td></tr>';
    });
    view.innerHTML = html + '</tbody></table>';
  }

  /* ------------------------------------------------------------ set aside */
  function renderAside() {
    var html = '<section class="panel"><h2>Set aside — ' + R.aside.length + ' protocols</h2><p>These record ' +
      'no token in the snapshot, but they are not ranked: each is a wrapped, staked or bridged ' +
      'product of a token that already trades, a versioned pool, or an exchange’s own product. ' +
      'Ranking one as “pre-token” would be wrong, so the board leaves them out — and shows them here.</p></section>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th>Why it is set aside</th></tr></thead><tbody>';
    R.aside.forEach(function (p) {
      html += '<tr><td class="name">' + esc(p.name) + '<small>' + esc(p.slug) + '</small></td>' +
        '<td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
        '<td>' + esc(p.reason) + '</td></tr>';
    });
    view.innerHTML = html + '</tbody></table>';
  }

  /* ------------------------------------------------------------ model sandbox */
  function rescore(row, w) {
    var g = 1 + clamp(row.change_7d || 0, -50, 150) / 100 * w.growth;
    var age = row.age_days == null ? 365 : row.age_days;
    var m = w.floor + Math.min(Math.max(age, 0), 1460) / 1460 * (1 - w.floor);
    var b = 1 + 0.05 * Math.min(Math.max(row.chains.length - 1, 0), 4);
    return Math.max(1, Math.round(row.tvl_usd * w.base * g * m * b));
  }
  function renderModel() {
    var w = { base: R.weights.base, growth: R.weights.growth_weight, floor: R.weights.maturity_floor };
    var html = '<section class="panel"><h2>Model sandbox</h2><p>Change the weights and the board ' +
      're-ranks in front of you. The board’s own ranks stay the model’s — this is what-if, ' +
      'so you can see which rows the weights move and which rows hold their place on size alone.</p>' +
      '<div class="sliders">' +
      '<label>Base multiple — TVL × <b id="v-base">' + w.base.toFixed(2) + '</b><input type="range" id="s-base" min="0.1" max="0.5" step="0.05" value="' + w.base + '"></label>' +
      '<label>Growth weight — 7d change × <b id="v-growth">' + w.growth.toFixed(1) + '</b><input type="range" id="s-growth" min="0" max="1" step="0.1" value="' + w.growth + '"></label>' +
      '<label>Maturity floor — oldest protocols keep at least ×<b id="v-floor">' + w.floor.toFixed(2) + '</b><input type="range" id="s-floor" min="0.3" max="0.8" step="0.05" value="' + w.floor + '"></label>' +
      '</div><div id="sandbox-out"></div></section>';
    view.innerHTML = html;
    var out = document.getElementById('sandbox-out');
    function redraw() {
      w.base = parseFloat(document.getElementById('s-base').value);
      w.growth = parseFloat(document.getElementById('s-growth').value);
      w.floor = parseFloat(document.getElementById('s-floor').value);
      document.getElementById('v-base').textContent = w.base.toFixed(2);
      document.getElementById('v-growth').textContent = w.growth.toFixed(1);
      document.getElementById('v-floor').textContent = w.floor.toFixed(2);
      var scored = R.rows.map(function (r) { return { r: r, v: rescore(r, w) }; });
      scored.sort(function (a, b) { return b.v - a.v; });
      var top = scored.slice(0, 10);
      var h = '<table class="sandbox-top"><thead><tr><th>New rank</th><th>Protocol</th><th class="num">Board rank</th><th class="num">Implied under these weights</th></tr></thead><tbody>';
      top.forEach(function (s, i) {
        var move = s.r.rank - (i + 1);
        var mark = move === 0 ? '—' : (move > 0 ? '▲' + move : '▼' + (-move));
        h += '<tr><td>' + (i + 1) + '</td><td class="name">' + esc(s.r.name) + '</td>' +
          '<td class="num">#' + s.r.rank + ' (' + mark + ')</td><td class="num imp">' + money(s.v) + '</td></tr>';
      });
      out.innerHTML = h + '</tbody></table>';
    }
    ['s-base', 's-growth', 's-floor'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', redraw);
    });
    redraw();
  }

  /* ------------------------------------------------------------ router */
  function route() {
    var state = parseHash();
    renderChrome(state);
    view.setAttribute('aria-busy', 'false');
    if (state.slug) renderDetail(state.slug);
    else if (state.view === 'live') renderLive();
    else if (state.view === 'aside') renderAside();
    else if (state.view === 'model') renderModel();
    else renderBoard(state);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();

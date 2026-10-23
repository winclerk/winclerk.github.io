// Winchester WI - All Site JS
// Replace existing JS with this single file
// Set to: Footer

// ---- Weather + Search Bar ----
(function () {
  function initWeather() {
    var searchModule = document.querySelector('.fl-node-zux34r6blifm');
    if (!searchModule) return;
    if (document.getElementById('ww-weather-row')) return;
    var row = document.createElement('div');
    row.id = 'ww-weather-row';

    var weatherWidget = document.createElement('div');
    weatherWidget.id = 'ww-weather-widget';
    weatherWidget.innerHTML = '<span class="ww-weather-loading">Loading\u2026</span>';

    searchModule.parentNode.insertBefore(row, searchModule);
    row.appendChild(weatherWidget);

    var fireDanger = document.getElementById('winchester-fire-danger-widget');
    if (fireDanger) {
      row.appendChild(fireDanger);
    }

    row.appendChild(searchModule);

    fetch('/wp-json/winchester/v1/weather')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.code) throw new Error(data.message);

        var temp = data.temp;
        var cond = data.condition.charAt(0).toUpperCase() + data.condition.slice(1).toLowerCase();

        if (cond.length > 15) {
          cond = cond.slice(0, 15).trim() + '\u2026';
        }

        var icon = '\uD83C\uDF24\uFE0F';
        var cl = cond.toLowerCase();

        if (cl.indexOf('thunder') !== -1)                                     icon = '\u26C8\uFE0F';
        else if (cl.indexOf('snow') !== -1 || cl.indexOf('blizzard') !== -1)   icon = '\u2744\uFE0F';
        else if (cl.indexOf('rain') !== -1 || cl.indexOf('shower') !== -1 || cl.indexOf('drizzle') !== -1) icon = '\uD83C\uDF27\uFE0F';
        else if (cl.indexOf('fog') !== -1)                                     icon = '\uD83C\uDF2B\uFE0F';
        else if (cl.indexOf('clear') !== -1 || cl.indexOf('sunny') !== -1)     icon = '\u2600\uFE0F';
        else if (cl.indexOf('mostly sunny') !== -1 || cl.indexOf('mostly clear') !== -1) icon = '\uD83C\uDF24\uFE0F';
        else if (cl.indexOf('partly') !== -1)                                  icon = '\u26C5';
        else if (cl.indexOf('cloud') !== -1 || cl.indexOf('overcast') !== -1)  icon = '\u2601\uFE0F';
        else if (cl.indexOf('wind') !== -1)                                    icon = '\uD83D\uDCA8';

        weatherWidget.innerHTML =
          '<a href="https://forecast.weather.gov/MapClick.php?CityName=Winchester&state=WI&site=GRB" target="_blank" rel="noopener" id="ww-weather-link">' +
          '<span class="ww-weather-icon">' + icon + '</span>' +
          '<span class="ww-weather-temp">' + temp + '\u00B0F</span>' +
          '<span class="ww-weather-cond">' + cond + '</span>' +
          '</a>';
      })
      .catch(function () {
        weatherWidget.innerHTML =
          '<a href="https://forecast.weather.gov/MapClick.php?CityName=Winchester&state=WI&site=GRB" target="_blank" rel="noopener" id="ww-weather-link">' +
          '<span class="ww-weather-icon">\uD83C\uDF21\uFE0F</span>' +
          '<span class="ww-weather-cond">Current Weather</span>' +
          '</a>';
      });
  }

  var attempts = 0;
  function tryInit() {
    if (document.querySelector('.fl-node-zux34r6blifm')) {
      initWeather();
    } else if (attempts < 20) {
      attempts++;
      setTimeout(tryInit, 250);
    }
  }
  tryInit();
})();


// ---- Calendar Filters ----
(function () {
  var BASE_URL = 'https://winchesterwi.com/events/';
  var CATEGORIES = [
    { key: 'all',     label: 'All Events',       cls: 'wch-all',     dot: null,      slug: null },
    { key: 'town',    label: 'Town Events',       cls: 'wch-town',    dot: '#00505A', slug: 'town-events' },
    { key: 'lions',   label: 'Lions Club',        cls: 'wch-lions',   dot: '#A59664', slug: 'lions-lioness-club' },
    { key: 'lake',    label: 'Lake Associations', cls: 'wch-lake',    dot: '#185FA5', slug: 'lake-associations' },
    { key: 'library', label: 'Library',           cls: 'wch-library', dot: '#3B6D11', slug: 'library' },
    { key: 'fire',    label: 'Fire/EMS',          cls: 'wch-fire',    dot: '#A32D2D', slug: 'fire-ems' },
    { key: 'biz',     label: 'Local Businesses',  cls: 'wch-biz',     dot: '#6B3FA0', slug: 'local-biz' }
  ];

  function getActiveSlug() {
    var match = window.location.pathname.match(/category\/([^/]+)\//);
    return match ? match[1] : null;
  }

  function buildBar() {
    var activeSlug = getActiveSlug();

    var wrap = document.createElement('div');
    wrap.className = 'wch-filter-wrap';

    var bar = document.createElement('div');
    bar.className = 'winchester-cal-filters';

    var addBtn = document.createElement('a');
    addBtn.href = 'https://forms.microsoft.com/r/HffNjjRDdx';
    addBtn.setAttribute('target', '_blank');
    addBtn.className = 'wch-toggle wch-add-event';
    var plus = document.createElement('span');
    plus.className = 'wch-add-plus';
    plus.textContent = '+';
    var lbl = document.createElement('span');
    lbl.className = 'wch-add-label';
    lbl.textContent = ' Submit New Event';
    addBtn.appendChild(plus);
    addBtn.appendChild(lbl);
    bar.appendChild(addBtn);

    var divider = document.createElement('span');
    divider.className = 'winchester-filter-divider';
    bar.appendChild(divider);

    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement('a');
      btn.className = 'wch-toggle ' + cat.cls;
      if (cat.key === 'library') {
        btn.href = 'https://winchesterpubliclibrary.com/events-calendar/';
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
      } else {
        btn.href = cat.slug ? BASE_URL + 'category/' + cat.slug + '/' : BASE_URL;
      }

      if (cat.dot) {
        var dot = document.createElement('span');
        dot.className = 'wch-toggle-dot';
        dot.style.background = cat.dot;
        btn.appendChild(dot);
        var check = document.createElement('span');
        check.className = 'wch-toggle-check';
        check.textContent = '\u2713';
        btn.appendChild(check);
      }

      btn.appendChild(document.createTextNode(cat.label));

      if (cat.key !== 'library') {
        if (cat.key === 'all' && !activeSlug) {
          btn.classList.add('wch-active');
        } else if (cat.slug && cat.slug === activeSlug) {
          btn.classList.add('wch-active');
        }
      }

      bar.appendChild(btn);
    });

    wrap.appendChild(bar);
    return wrap;
  }

  function init() {
    if (window.location.pathname.indexOf('/events') === -1) return;

    var target = document.querySelector('[data-js="tribe-events-view"]') ||
                 document.querySelector('.tribe-events-view') ||
                 document.querySelector('.tribe-events') ||
                 document.querySelector('#tribe-events');
    if (!target) return;

    target.parentNode.insertBefore(buildBar(), target);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


// ---- Mobile Header: fire danger label + hamburger icon ----
document.addEventListener('DOMContentLoaded', function () {
  function shortenFireDangerLabel() {
    var label = document.querySelector('.wfd-label');
    if (!label) return;
    if (window.innerWidth <= 767) {
      if (!label.dataset.fullText) {
        label.dataset.fullText = label.textContent;
      }
      label.textContent = 'Fire danger:';
    } else if (label.dataset.fullText) {
      label.textContent = label.dataset.fullText;
    }
  }
  shortenFireDangerLabel();
  window.addEventListener('resize', shortenFireDangerLabel);

  var menuIcon = document.querySelector('.brex-mobile-menu-icon i');
  if (menuIcon) {
    menuIcon.classList.remove('fa-align-justify');
    menuIcon.classList.add('fa-bars');
  }
});


// ---- Permits Page: normalize module spacing ----
(function () {
  if (document.getElementById('wch-permits-spacing-styles')) return;
  var css = [
    'body.page-id-3334 .fl-col > .fl-module { margin-top: 0 !important; margin-bottom: 24px !important; }',
    'body.page-id-3334 .fl-col > .fl-module.fl-module-separator { margin-top: 4px !important; margin-bottom: 4px !important; }',
    // Mobile-responsive sidebar cards — allow top row (title + badges) and
    // details section (text + PDF button) to wrap when narrow.
    '#winchester-row-list > div > div:first-child { flex-wrap: wrap !important; }',
    '#winchester-row-list > div > div:first-child > div:first-child { min-width: 200px !important; }',
    '#winchester-row-list > div > div:nth-child(2) > div { flex-wrap: wrap !important; }',
    '#winchester-row-list > div > div:nth-child(2) > div > div:first-child { min-width: 200px !important; }',
    '#winchester-row-list > div > div:nth-child(2) > div > div:nth-child(2) { margin-left: auto !important; }',
    // PDF link hover — light teal fill on hover
    '.wch-pdf-link:hover { background: #E6F0F1 !important; }',
    // Collapsible section headers (Which agency? / Driveway Permits / Right-of-Way & Utility)
    // Warm tan background instead of the default light teal — pairs better with the gold
    // left-border accent and matches the site design tokens.
    '.wch-acc-toggle { background: #F5F2EC !important; }',
    '.wch-acc-toggle:hover { background: #EFE9DC !important; }',
    // Form tab (ROW / Driveway / Road Construction) hover state — subtle warm tan,
    // matching the accordion buttons for consistency across the page.
    '.wch-form-tab:not(.active):hover { background: #F5F2EC !important; color: #193C3C !important; }'
  ].join('\n');
  var s = document.createElement('style');
  s.id = 'wch-permits-spacing-styles';
  s.appendChild(document.createTextNode(css));
  document.head.appendChild(s);
})();


// ---- Permits Page: text swap — "agency" to "entity" in accordion header ----
(function swapAgencyToEntity() {
  function run() {
    var replaced = 0;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (/which\s+agency\s+issues\s+my\s+permit/i.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(/agency/gi, 'entity');
        replaced++;
      }
    }
    return replaced;
  }
  if (run() === 0) setTimeout(run, 500);
  if (run() === 0) setTimeout(run, 1500);
})();


// ---- Permits Page: fix "County or State project" legend swatch ----
// The legend lives in a Beaver Builder module and shows an outlined white
// circle for County/State projects, which doesn't match how those actually
// render on the map (gray filled lines/pins). This finds the text label and
// swaps only its own circle to solid gray so the legend matches the map.
// Deliberately narrow-scoped: we walk the closest containing element and only
// modify a round element that's a direct or near-sibling of the label text —
// NOT anything in the wider legend row (which would recolor other swatches).
(function fixCountyStateLegend() {
  function run() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return /county\s+or\s+state/i.test(n.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    var node, applied = 0;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent) continue;
      // Only look at the IMMEDIATE parent's siblings + its own descendants.
      // This scopes to the single legend item, not the whole legend row.
      var candidates = [];
      // Previous siblings of the parent element
      var sib = parent.previousElementSibling;
      while (sib) {
        candidates.push(sib);
        sib = sib.previousElementSibling;
      }
      // Direct children of the parent (in case swatch is inside same span)
      Array.prototype.push.apply(candidates, parent.children);
      // Also try one level up (grandparent's immediately-preceding sibling)
      if (parent.parentElement && parent.parentElement.previousElementSibling) {
        candidates.push(parent.parentElement.previousElementSibling);
      }

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (!el || el.nodeType !== 1) continue;
        var cs = getComputedStyle(el);
        var isRoundish = cs.borderRadius && parseInt(cs.borderRadius, 10) >= 4;
        var isSmall = el.offsetWidth > 0 && el.offsetWidth <= 24 && el.offsetHeight > 0 && el.offsetHeight <= 24;
        if (isRoundish && isSmall) {
          el.style.setProperty('background', '#999999', 'important');
          el.style.setProperty('background-color', '#999999', 'important');
          el.style.setProperty('border-color', '#999999', 'important');
          applied++;
          break;
        }
      }
    }
    return applied;
  }
  if (run() === 0) setTimeout(run, 500);
  if (run() === 0) setTimeout(run, 1500);
})();


// ---- ROW Permit Map ----
(function () {
  var el = document.getElementById('winchester-row-map');
  if (!el) return;

  // Prevent browser auto-scroll on load. Some combination of BB layout,
  // Leaflet late-init, and browser scroll restoration causes the page to
  // jump down on hash-free loads. Force scroll-to-top unless the URL has
  // an explicit hash (which is intentional — user wants that anchor).
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  if (!window.location.hash) {
    // Reset scroll on load and again after Leaflet renders (invalidateSize can shift layout)
    window.scrollTo(0, 0);
    window.addEventListener('load', function () { window.scrollTo(0, 0); });
    setTimeout(function () { if (!window.location.hash) window.scrollTo(0, 0); }, 600);
    setTimeout(function () { if (!window.location.hash) window.scrollTo(0, 0); }, 1700);
  }

  var DATA_URL = 'https://records.winchesterwi.com/permits.json';
  var HALL = { lat: 46.21196, lng: -89.88619 };
  var COLORS = { proposed: '#B8952E', upcoming: '#2B7BA8', active: '#D97A1F', complete: '#2D8A56' };
  var LABELS = { proposed: 'Pending', upcoming: 'Approved', active: 'Active', complete: 'Complete' };
  // Lets the very first fit-to-permits happen instantly (no pan/zoom
  // animation), so the page loads straight into the fitted view rather than
  // visibly jumping from the hardcoded starting view to it.
  var didInitialFit = false;
  var TYPE_LABELS = { row: 'Right-of-Way', driveway: 'Driveway', road_construction: 'Road Construction' };
  // All types now use teal text on light teal badge background — legibility over color-coding.
  // Type is still distinguishable by the LABEL itself (Right-of-Way vs Driveway vs Road Construction).
  var TYPE_COLORS = { row: '#00505A', driveway: '#00505A', road_construction: '#00505A' };

  function loadCSS(url) {
    if (document.querySelector('link[href="' + url + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url;
    document.head.appendChild(l);
  }
  function loadJS(url, cb) {
    if (window.L) { cb(); return; }
    var existing = document.querySelector('script[src="' + url + '"]');
    if (existing) { existing.addEventListener('load', cb); return; }
    var s = document.createElement('script'); s.src = url; s.onload = cb;
    s.onerror = function () {
      el.innerHTML = '<p style="text-align:center;padding:40px;color:#999;font-size:14px">Map could not load. Try refreshing the page.</p>';
    };
    document.head.appendChild(s);
  }

  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
  loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', initMap);

  function d0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function pd(s) { return new Date(s + 'T00:00:00'); }
  function fmt(s) { return pd(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

  var ESC_MAP = {};
  ESC_MAP[38] = '&' + 'amp;';
  ESC_MAP[60] = '&' + 'lt;';
  ESC_MAP[62] = '&' + 'gt;';
  ESC_MAP[34] = '&' + 'quot;';
  ESC_MAP[39] = '&' + '#39;';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ESC_MAP[c.charCodeAt(0)] || c;
    });
  }

  function statusOf(p) {
    if (p.status === 'proposed' || p.status === 'received') return 'proposed';
    var t = d0(), s = pd(p.startDate), e = pd(p.endDate);
    if (t < s) return 'upcoming'; if (t > e) return 'complete'; return 'active';
  }
  // How long a completed permit stays on the map / in the panel's Completed
  // section before dropping off. Currently 90 days (~3 months) — despite
  // earlier notes referring to a 6-month window, this is the value actually
  // in effect. Change this one constant to adjust it.
  var COMPLETE_DROPOFF_DAYS = 90;

  function visible(p) {
    if (p.status === 'denied' || p.status === 'withdrawn') return false;
    if (statusOf(p) === 'complete') return (d0() - pd(p.endDate)) / 864e5 <= COMPLETE_DROPOFF_DAYS;
    return true;
  }

  function initMap() {
    // ---- Wrap the map in a grid container with a right-side detail panel ----
    // Panel replaces the popup-based interaction: click a permit on the map
    // (or in the sidebar list) → panel populates with the permit details;
    // clicking empty map clears it back to the placeholder state.
    // Using CSS Grid (not flex) so Leaflet's inline width/height on the map
    // container doesn't override our column layout.
    var mapEl = document.getElementById('winchester-row-map');
    var panel = document.getElementById('wch-detail-panel');
    if (!panel) {
      var wrap = document.createElement('div');
      wrap.id = 'wch-map-with-detail';
      panel = document.createElement('div');
      panel.id = 'wch-detail-panel';
      // Insert wrap where map was, then add panel FIRST (left column) and map
      // SECOND (right column) — the grid columns respect DOM order.
      mapEl.parentNode.insertBefore(wrap, mapEl);
      wrap.appendChild(panel);
      wrap.appendChild(mapEl);

      // CSS Grid layout — 1fr panel (left) / 2fr map (right) on desktop.
      // On mobile: single column with map on top (via CSS order) and panel below.
      var css =
        '#wch-map-with-detail {' +
        '  display: grid !important;' +
        '  grid-template-columns: 1fr 2fr !important;' +
        '  gap: 0 !important;' +
        '  width: 100% !important;' +
        '  max-height: 340px;' +
        '  align-items: stretch;' +
        '}' +
        '#wch-map-with-detail > #winchester-row-map {' +
        '  min-width: 0 !important;' +
        '  min-height: 0 !important;' +
        '  width: auto !important;' +
        '  height: 340px !important;' +
        '}' +
        '#wch-detail-panel {' +
        '  min-width: 0;' +
        '  min-height: 0;' +
        '  background: #fff;' +
        '  border-right: 1px solid #E8E8E8;' +
        '  overflow-y: auto;' +
        '  height: 340px;' +
        '}' +
        '@media (max-width: 780px) {' +
        '  #wch-map-with-detail { grid-template-columns: 1fr !important; max-height: none; }' +
        '  #wch-map-with-detail > #winchester-row-map { order: 1; height: 320px !important; }' +
        '  #wch-detail-panel { order: 2; border-right: none; border-top: 1px solid #E8E8E8; height: auto; min-height: 200px; max-height: 340px; }' +
        '}' +
        // Hide the old sidebar collapsible entirely — the summary list in the
        // detail panel replaces it. Both the accordion wrapper and any raw
        // #winchester-row-list element get hidden.
        '.wch-permit-list-hidden, ' +
        '#winchester-row-list, ' +
        '.wch-acc-toggle:has(.wch-permits-toggle-verb), ' +
        '.wch-acc-toggle:has(.wch-permits-toggle-verb) + .wch-acc-body { display: none !important; }' +
        // Empty state
        '.wch-detail-empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:120px; padding:24px 20px; color:#999; text-align:center; font-family:"Noto Sans",sans-serif; font-size:13px; line-height:1.5; }' +
        '.wch-detail-empty-icon { font-size:24px; color:#CFCFCF; margin-bottom:10px; font-weight:400; }' +
        // Summary list — default panel content on page load
        '.wch-summary-header { padding:10px 14px; border-bottom:1px solid #E0E0E0; font-family:Electrolize,sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#193C3C; font-weight:700; background:#F5F2EC; }' +
        '.wch-summary-item { padding:10px 14px 11px; border-bottom:1px solid #F0F0F0; cursor:pointer; transition:background .12s ease; }' +
        '.wch-summary-item:hover { background:#F5F2EC; }' +
        '.wch-summary-item:last-child { border-bottom:none; }' +
        '.wch-summary-badges { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:5px; }' +
        '.wch-summary-badges span { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; padding:2px 7px; border-radius:3px; white-space:nowrap; }' +
        '.wch-summary-org { font-weight:700; font-size:13px; color:#193C3C; line-height:1.3; margin-bottom:2px; }' +
        '.wch-summary-title { font-size:11.5px; color:#666; line-height:1.35; }' +
        // Detail view
        '.wch-detail-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:12px 18px 10px; border-bottom:1px solid #F0F0F0; }' +
        '.wch-detail-badges { display:flex; flex-wrap:wrap; gap:4px; flex:1 1 auto; }' +
        '.wch-detail-close { flex:0 0 auto; background:transparent !important; border:none !important; font-size:22px; line-height:1; color:#888; cursor:pointer; padding:2px 8px; border-radius:4px; }' +
        '.wch-detail-close:hover { background:#F0F0F0 !important; color:#333 !important; }' +
        '.wch-detail-body { padding:12px 18px 16px; }' +
        '.wch-detail-body h2 { font-family:Electrolize,sans-serif; font-size:17px; color:#193C3C; margin:0 0 3px 0; line-height:1.25; }' +
        '.wch-detail-body .wch-detail-org { color:#666; font-size:12px; margin-bottom:12px; }' +
        '.wch-detail-field { margin-bottom:11px; font-size:13px; color:#333; line-height:1.5; }' +
        '.wch-detail-field .wch-detail-label { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:#888; font-weight:700; margin-bottom:2px; }' +
        '.wch-detail-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid #F0F0F0; }' +
        // Zoom button EXACTLY matches PDF button sizing (which is inline-styled
        // in buildPanelContent — kept in sync manually).
        '.wch-zoom-btn { flex:1 1 auto; padding:8px 14px; background:#fff; color:#00505A; border:1px solid #00505A; border-radius:4px; text-align:center; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.5px; cursor:pointer; transition:background .15s ease; }' +
        '.wch-zoom-btn:hover { background:#E6F0F1; }';
      var s = document.createElement('style');
      s.id = 'wch-detail-panel-styles';
      s.textContent = css;
      document.head.appendChild(s);
    }

    // Track the currently-shown permit list so the summary view can refresh
    // whenever render() re-runs (permits load / status changes / etc.).
    var shownForPanel = [];
    var pendingForPanel = [];
    var completedForPanel = [];

    function renderEmptyPanel() {
      panel.innerHTML =
        '<div class="wch-detail-empty-state">' +
        '<div class="wch-detail-empty-icon">\u25CE</div>' +
        '<p>No permits currently on record.</p>' +
        '</div>';
    }

    // Summary list — default panel state on load and after closing detail view.
    // Each row is clickable → fires the standard zoomToPermit event, which the
    // existing listener converts to a map zoom + panel detail population.
    function summaryItemHtml(p) {
      var s = statusOf(p);
      var typeKey = p.permitType || 'row';
      var typeLabel = TYPE_LABELS[typeKey] || 'Permit';
      var typeColor = TYPE_COLORS[typeKey] || '#555';
      var statusBg = { active: '#FEF0E1', upcoming: '#E3F0F7', complete: '#E1F5EA', proposed: '#FDF5E1' }[s] || '#f5f5f5';
      var borderColor = COLORS[s] || '#D4D4D4';
      return '<div class="wch-summary-item" data-permit-id="' + esc(p.permitNumber || '') + '" style="border-left:3px solid ' + borderColor + ';">' +
        '<div class="wch-summary-badges">' +
          (p.permitNumber ? '<span style="background:#F0F0F0;color:#555">' + esc(p.permitNumber) + '</span>' : '') +
          '<span style="background:#E6F0F1;color:' + typeColor + '">' + esc(typeLabel) + '</span>' +
          '<span style="background:' + statusBg + ';color:' + borderColor + '">' + esc(LABELS[s]) + '</span>' +
        '</div>' +
        '<div class="wch-summary-org">' + esc(p.org || p.applicant || 'Unnamed') + '</div>' +
        (p.title ? '<div class="wch-summary-title">' + esc(p.title) + '</div>' : '') +
        '</div>';
    }

    function renderSummaryList() {
      // Clear any selected-permit glow when returning to summary
      setSelectedShape(null);
      if ((!shownForPanel || !shownForPanel.length) && (!pendingForPanel || !pendingForPanel.length) && (!completedForPanel || !completedForPanel.length)) {
        renderEmptyPanel();
        return;
      }

      var html = '';

      if (shownForPanel && shownForPanel.length) {
        var activeItemsHtml = shownForPanel.slice().sort(function (a, b) {
          var order = { active: 0, upcoming: 1 };
          return (order[statusOf(a)] || 9) - (order[statusOf(b)] || 9);
        }).map(summaryItemHtml).join('');
        html += '<div class="wch-summary-header">Active Permits \u2013 ' + shownForPanel.length + '</div>' + activeItemsHtml;
      }

      if (pendingForPanel && pendingForPanel.length) {
        var pendingItemsHtml = pendingForPanel.slice().sort(function (a, b) {
          return pd(a.startDate) - pd(b.startDate); // soonest-needed first
        }).map(summaryItemHtml).join('');
        html += '<div class="wch-summary-header">Pending \u2013 ' + pendingForPanel.length + ' awaiting Board action</div>' + pendingItemsHtml;
      }

      if (completedForPanel && completedForPanel.length) {
        var months = Math.round(COMPLETE_DROPOFF_DAYS / 30);
        var monthsLabel = months + ' month' + (months === 1 ? '' : 's');
        var completedItemsHtml = completedForPanel.slice().sort(function (a, b) {
          return pd(b.endDate) - pd(a.endDate); // most recently completed first
        }).map(summaryItemHtml).join('');
        html += '<div class="wch-summary-header">Completed \u2013 ' + completedForPanel.length + ' in the last ' + monthsLabel + '</div>' + completedItemsHtml;
      }

      if (!html) { renderEmptyPanel(); return; }
      panel.innerHTML = html;

      // Wire click handlers on each summary item — fire the zoom event, which
      // triggers the existing listener that populates detail view + zooms map.
      panel.querySelectorAll('.wch-summary-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var pid = item.getAttribute('data-permit-id');
          if (pid) document.dispatchEvent(new CustomEvent('wch:zoomToPermit', { detail: pid }));
        });
      });
    }

    // Initial state — will be replaced with summary list once render() runs
    renderEmptyPanel();

    // Expose an updater so render() (which lives outside initMap's scope) can
    // refresh the summary list when permits data changes.
    window._wchRefreshPanelSummary = function (shownList) {
      var list = shownList || [];
      shownForPanel = list.filter(function (p) { var s = statusOf(p); return s === 'active' || s === 'upcoming'; });
      pendingForPanel = list.filter(function (p) { return statusOf(p) === 'proposed'; });
      // shownList already only contains completed permits within the drop-off
      // window (visible() filters out anything older), so no extra date check needed here.
      completedForPanel = list.filter(function (p) { return statusOf(p) === 'complete'; });
      // Only refresh if the panel is currently showing summary or empty state —
      // don't clobber an open detail view during a background refresh.
      if (panel.querySelector('.wch-summary-header') || panel.querySelector('.wch-detail-empty-state')) {
        renderSummaryList();
      }
    };

    // Expose helpers that render()-scope code needs to call. These live inside
    // initMap's closure (for access to panel + currentSelectedShape state)
    // but must be callable from render()'s showPermitDetails, click handlers,
    // and zoom listener — hence the window bridge.
    window._wchRenderSummaryList = renderSummaryList;
    window._wchPulseShape = pulseShape;
    window._wchSetSelectedShape = setSelectedShape;

    var map = L.map('winchester-row-map', { scrollWheelZoom: false }).setView([46.2250, -89.8850], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00A9 OpenStreetMap contributors', maxZoom: 18
    }).addTo(map);
    // Leaflet measures the container on init. Since we just wrapped it in a
    // grid layout, force a re-measure after a beat so tiles fill correctly.
    setTimeout(function () { map.invalidateSize(); }, 100);
    setTimeout(function () { map.invalidateSize(); }, 500);
    map.on('click', function () {
      map.scrollWheelZoom.enable();
      // Note: intentionally NOT clearing the panel here. The map-click event
      // fires for every click (including on shapes) even after stopPropagation
      // on the shape handler, which was causing shape clicks to populate the
      // panel and then immediately clear it. Use the X button in the panel to
      // close, or click a different permit.
    });

    // Remember the initial view (center + zoom that fits the whole town)
    // so the reset button can restore it exactly. render() (a sibling
    // top-level function, not nested in here) overwrites this once permits
    // load and it fits the map to all pins — it can't reach this local
    // variable directly, so it goes through window._wchSetInitialView below.
    // (Previously render() did `initialView = {...}` with no `var`, which
    // silently created an unrelated global instead of updating this one —
    // that's why the reset button never reflected the auto-fit.)
    var initialView = { center: map.getCenter(), zoom: map.getZoom() };
    window._wchSetInitialView = function (view) { initialView = view; };

    // Reset-zoom control — sits below the +/- zoom buttons, restores the
    // whole-town view. Explicit inline dimensions match Leaflet's default
    // zoom-button size so it renders consistently with +/-.
    var ResetZoomControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        var btn = L.DomUtil.create('a', 'leaflet-control-reset', container);
        btn.href = '#';
        btn.title = 'Reset zoom to full town view';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Reset zoom');
        // Match Leaflet's zoom button styling exactly by not overriding width/
        // height — let .leaflet-bar a defaults apply. Only override the bits
        // needed to render the Unicode house glyph properly.
        btn.style.cssText = 'text-align:center;font-size:18px;font-weight:700;color:#193C3C;text-decoration:none;';
        // Unicode "HOUSE" symbol — sizes naturally with font-size, no SVG needed
        btn.innerHTML = '\u2302';
        L.DomEvent.on(btn, 'click', function (e) {
          L.DomEvent.preventDefault(e);
          L.DomEvent.stopPropagation(e);
          map.setView(initialView.center, initialView.zoom, { animate: true });
          renderSummaryList();
        });
        L.DomEvent.disableClickPropagation(container);
        return container;
      }
    });
    new ResetZoomControl().addTo(map);

    L.marker([HALL.lat, HALL.lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:13px;height:13px;background:#193C3C;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
        iconSize: [13, 13], iconAnchor: [6, 6]
      })
    }).addTo(map).bindPopup(
      '<div style="font-family:Noto Sans,sans-serif"><b>Winchester Town Hall</b><br>7228 CTH W<br>Board meetings: 2nd Monday, 6:00 PM</div>'
    );

    var layer = L.layerGroup().addTo(map);

    // ---- Permit glow / pulse effects ----
    // Two visual cues:
    //   - Hover: subtle stroke widening on the shape itself
    //   - Selected: a SEPARATE halo overlay layer that pulses around the shape
    //     (so the shape itself stays crisp; the halo does the animating)
    (function ensurePulseStyles() {
      if (document.getElementById('wch-permit-pulse-styles')) return;
      var s = document.createElement('style');
      s.id = 'wch-permit-pulse-styles';
      s.textContent =
        // Smooth transitions when stroke changes on hover
        '#winchester-row-map svg path { transition: stroke-width 0.15s ease, stroke-opacity 0.15s ease; }' +
        // Selected halo — a wider translucent polyline UNDER the visible line.
        // Pulses stroke-width + opacity, 2.5s cycle, infinite. Blur softens the
        // hard edge so the glow fades naturally to transparent.
        '@keyframes wch-halo-pulse-line {' +
        '  0%, 100% { stroke-width: 12; stroke-opacity: 0.4; }' +
        '  50% { stroke-width: 18; stroke-opacity: 0.65; }' +
        '}' +
        '#winchester-row-map svg path.wch-halo-line {' +
        '  animation: wch-halo-pulse-line 2.5s ease-in-out infinite;' +
        '  transition: none;' +
        '  filter: blur(3px);' +
        '}' +
        // Selected halo for points — a larger circle marker underneath the dot,
        // filled in the same color as the dot itself.
        '@keyframes wch-halo-pulse-point {' +
        '  0%, 100% { fill-opacity: 0.4; stroke-opacity: 0.4; stroke-width: 5; }' +
        '  50% { fill-opacity: 0.65; stroke-opacity: 0.65; stroke-width: 10; }' +
        '}' +
        '#winchester-row-map svg path.wch-halo-point {' +
        '  animation: wch-halo-pulse-point 2.5s ease-in-out infinite;' +
        '  transition: none;' +
        '  filter: blur(3px);' +
        '}';
      document.head.appendChild(s);
    })();

    // Get the SVG element(s) backing a Leaflet shape.
    function getShapeElements(target) {
      var elements = [];
      if (!target) return elements;
      if (typeof target.getElement === 'function' && target.getElement()) {
        elements.push(target.getElement());
      }
      if (typeof target.eachLayer === 'function') {
        target.eachLayer(function (sub) {
          if (typeof sub.getElement === 'function' && sub.getElement()) {
            elements.push(sub.getElement());
          }
        });
      }
      return elements;
    }

    // Track selection state + halo overlays so we can clean them up.
    var currentSelectedShape = null;
    var selectedHaloLayers = [];

    function setSelectedShape(target) {
      // Remove existing halos
      selectedHaloLayers.forEach(function (h) {
        if (layer.hasLayer(h)) layer.removeLayer(h);
      });
      selectedHaloLayers = [];
      currentSelectedShape = target;
      if (!target) return;

      // Blend a color with white — used to lighten the halo so it reads as a
      // soft glow rather than a saturated overlay. amount=0.25 means 25% white
      // (halved from the original 0.5, per Luke's request, for a darker/more visible glow).
      function lightenColor(hex, amount) {
        if (!hex || hex.charAt(0) !== '#' || hex.length !== 7) return hex;
        var r = parseInt(hex.substr(1, 2), 16);
        var g = parseInt(hex.substr(3, 2), 16);
        var b = parseInt(hex.substr(5, 2), 16);
        r = Math.round(r + (255 - r) * amount);
        g = Math.round(g + (255 - g) * amount);
        b = Math.round(b + (255 - b) * amount);
        var hexStr = ((r << 16) | (g << 8) | b).toString(16);
        while (hexStr.length < 6) hexStr = '0' + hexStr;
        return '#' + hexStr;
      }

      function addPointHalo(latlng, fillColor) {
        var lightColor = lightenColor(fillColor, 0.25);
        var halo = L.circleMarker(latlng, {
          radius: 12,
          fillColor: lightColor,
          color: lightColor,
          weight: 3,
          fillOpacity: 0.5,
          opacity: 0.5,
          interactive: false,
          className: 'wch-halo-point'
        });
        halo.addTo(layer);
        halo.bringToBack();
        selectedHaloLayers.push(halo);
      }

      function addLineHalo(latlngs, lineColor) {
        var lightLine = lightenColor(lineColor, 0.25);
        var halo = L.polyline(latlngs, {
          color: lightLine,
          weight: 14,
          opacity: 0.6,
          interactive: false,
          lineCap: 'round',
          lineJoin: 'round',
          className: 'wch-halo-line'
        });
        halo.addTo(layer);
        halo.bringToBack();
        selectedHaloLayers.push(halo);
      }

      // Case 1: Plain polyline (single-segment line permit)
      if (typeof target.getLatLngs === 'function' && typeof target.getLatLng !== 'function' && typeof target.eachLayer !== 'function') {
        var lineColor = (target.options && target.options.color) || '#193C3C';
        addLineHalo(target.getLatLngs(), lineColor);
        return;
      }

      // Case 2: FeatureGroup — could contain POLYLINES (multiline permit)
      // or CIRCLEMARKERS (multipoint permit). Detect per-child.
      if (typeof target.eachLayer === 'function' && typeof target.getLatLng !== 'function') {
        target.eachLayer(function (sub) {
          // Polyline sub-layer (multiline segment)
          if (typeof sub.getLatLngs === 'function' && typeof sub.getLatLng !== 'function') {
            var segColor = (sub.options && sub.options.color) || '#193C3C';
            addLineHalo(sub.getLatLngs(), segColor);
          } else if (typeof sub.getLatLng === 'function') {
            // Circle marker (multipoint pin)
            var pinColor = (sub.options && sub.options.fillColor) || '#193C3C';
            addPointHalo(sub.getLatLng(), pinColor);
          }
        });
        return;
      }

      // Case 3: Single circle marker (driveway) — halo with interior fill color
      if (typeof target.getLatLng === 'function') {
        var fillColor = (target.options && target.options.fillColor) || '#193C3C';
        addPointHalo(target.getLatLng(), fillColor);
      }
    }

    function rememberBase(el) {
      if (!el.dataset.wchBaseWidth) {
        var current = el.getAttribute('stroke-width') || '3';
        el.dataset.wchBaseWidth = current;
      }
    }

    function setHoverGlow(target, on) {
      getShapeElements(target).forEach(function (el) {
        rememberBase(el);
        if (on) {
          el.setAttribute('stroke-width', '8');
          el.style.strokeOpacity = '0.6';
        } else {
          el.setAttribute('stroke-width', el.dataset.wchBaseWidth);
          el.style.strokeOpacity = '';
        }
      });
    }

    // pulseShape is now a shim that hands off to setSelectedShape — the halo
    // overlay handles the visual "pulse" as a persistent selection indicator.
    function pulseShape(target) {
      setSelectedShape(target);
    }

    fetch(DATA_URL + '?t=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        try { sessionStorage.setItem('wchPermits', JSON.stringify(d)); } catch (e) {}
        render(d.permits || [], map, layer);
        if (d.updated) {
          document.getElementById('winchester-row-updated').textContent = 'Last updated ' +
            new Date(d.updated).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
        }
      })
      .catch(function () {
        var cached = null;
        try { cached = JSON.parse(sessionStorage.getItem('wchPermits') || 'null'); } catch (e) {}
        if (cached && cached.permits && cached.permits.length) {
          render(cached.permits, map, layer);
          var updEl = document.getElementById('winchester-row-updated');
          if (updEl) updEl.textContent = 'Showing last saved data \u2014 could not reach the permit feed.';
        } else {
          render([], map, layer);
        }
      });

    setTimeout(function () { map.invalidateSize(); }, 500);
    setTimeout(function () { map.invalidateSize(); }, 1500);
  }

  function render(jobs, map, layer) {
    // Bridge to initMap-scoped helpers (declared in initMap's closure via
    // window._wchPulseShape / _wchSetSelectedShape). Local shims here so the
    // rest of render() can call pulseShape()/setSelectedShape() naturally.
    function pulseShape(target) {
      if (typeof window._wchPulseShape === 'function') window._wchPulseShape(target);
    }
    function setSelectedShape(target) {
      if (typeof window._wchSetSelectedShape === 'function') window._wchSetSelectedShape(target);
    }
    layer.clearLayers();
    var pts = [[HALL.lat, HALL.lng]];
    var shown = jobs.filter(visible);
    // Notify the detail panel (in initMap's scope) that the shown list changed.
    // Guarded — this runs before initMap in some load orders.
    if (typeof window._wchRefreshPanelSummary === 'function') {
      window._wchRefreshPanelSummary(shown);
    }

    function buildPopup(p, s, info, typeLabel, typeColor) {
      var extentLine = '';
      if (p.geoType === 'line') extentLine = '<br><b>Extent:</b> route shown on map';
      else if (p.geoType === 'multiline' && p.segments) extentLine = '<br><b>Extent:</b> ' + p.segments.length + ' route segments on map';
      else if (p.geoType === 'multipoint' && p.points) extentLine = '<br><b>Extent:</b> ' + p.points.length + ' locations on map';
      return (
        '<div style="font-family:Noto Sans,sans-serif;min-width:290px">' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:2px">' +
        (p.permitNumber ? '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:3px 9px;border-radius:3px;background:#F0F0F0;color:#555">' + esc(p.permitNumber) + '</span>' : '') +
        '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:3px 9px;border-radius:3px;background:#E6F0F1;color:' + typeColor + '">' + esc(typeLabel) + '</span>' +
        '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:3px 9px;border-radius:3px;background:' +
          ({ active: '#FEF0E1', upcoming: '#E3F0F7', complete: '#E1F5EA', proposed: '#FDF5E1' }[s] || '#f5f5f5') +
          ';color:' + COLORS[s] + '">' + esc(LABELS[s]) + '</span>' +
        '</div>' +
        '<div style="font-weight:700;color:#193C3C;margin:7px 0 2px;font-size:14px">' + esc(p.title) + '</div>' +
        '<div style="font-size:11px;color:#999;margin-bottom:8px">' + esc(p.org) + '</div>' +
        '<div style="font-size:12px;color:#555;line-height:1.7">' +
          '<b>Location:</b> ' + esc(p.location) + '<br>' +
          '<b>Dates:</b> ' + fmt(p.startDate) + ' \u2013 ' + fmt(p.endDate) +
          extentLine +
          (p.traffic ? '<br><b>Traffic:</b> ' + esc(p.traffic) : '') +
        '</div>' +
        (p.contactName ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #E8E8E8;font-size:11px;color:#555">' +
          '<b>On-site contact:</b> ' + esc(p.contactName) + (p.contactPhone ? ' \u00B7 ' + esc(p.contactPhone) : '') + '</div>' : '') +
        (info ? '<div style="margin-top:7px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#A59664;font-weight:700">' + esc(p.jurisdiction) + ' project</div>' : '') +
        (p.pdfUrl ? '<div style="margin-top:10px;text-align:left"><a href="https://records.winchesterwi.com' + esc(p.pdfUrl) + '" target="_blank" rel="noopener" class="wch-pdf-link" style="display:inline-block;padding:5px 10px;background:#fff;color:#00505A;border:1px solid #00505A;border-radius:3px;text-decoration:none;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.6px;transition:background 0.15s ease;">View permit record (PDF)</a></div>' : '') +
        '</div>'
      );
    }

    // ---- Detail panel content ----
    // Larger, more breathable version of the popup content, formatted as a
    // right-side detail panel. Includes description + conditions (which the
    // popup omitted for space) and a Zoom-to-project button.
    function buildPanelContent(p, s, info, typeLabel, typeColor) {
      var statusBg = { active: '#FEF0E1', upcoming: '#E3F0F7', complete: '#E1F5EA', proposed: '#FDF5E1' }[s] || '#f5f5f5';
      var badgeStyle = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:4px 10px;border-radius:3px;';
      var extentLine = '';
      if (p.geoType === 'line') extentLine = 'Route shown on map';
      else if (p.geoType === 'multiline' && p.segments) extentLine = p.segments.length + ' route segments on map';
      else if (p.geoType === 'multipoint' && p.points) extentLine = p.points.length + ' locations on map';

      var html =
        '<div class="wch-detail-header">' +
          '<div class="wch-detail-badges">' +
            (p.permitNumber ? '<span style="' + badgeStyle + 'background:#F0F0F0;color:#555">' + esc(p.permitNumber) + '</span>' : '') +
            '<span style="' + badgeStyle + 'background:#E6F0F1;color:' + typeColor + '">' + esc(typeLabel) + '</span>' +
            '<span style="' + badgeStyle + 'background:' + statusBg + ';color:' + COLORS[s] + '">' + esc(LABELS[s]) + '</span>' +
          '</div>' +
          '<button class="wch-detail-close" aria-label="Close">\u00D7</button>' +
        '</div>' +
        '<div class="wch-detail-body">' +
          '<h2>' + esc(p.title) + '</h2>' +
          (p.org ? '<div class="wch-detail-org">' + esc(p.org) + '</div>' : '') +
          (info ? '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#A59664;font-weight:700;margin-bottom:14px">' + esc(p.jurisdiction) + ' project</div>' : '') +
          (p.description ? '<div class="wch-detail-field"><div class="wch-detail-label">Description</div><div>' + esc(p.description) + '</div></div>' : '') +
          '<div class="wch-detail-field"><div class="wch-detail-label">Location</div><div>' + esc(p.location) + (extentLine ? ' \u00B7 ' + extentLine : '') + '</div></div>' +
          '<div class="wch-detail-field"><div class="wch-detail-label">Dates</div><div>' + fmt(p.startDate) + ' \u2013 ' + fmt(p.endDate) + '</div></div>' +
          (p.traffic ? '<div class="wch-detail-field"><div class="wch-detail-label">Traffic impact</div><div>' + esc(p.traffic) + '</div></div>' : '') +
          (p.conditions ? '<div class="wch-detail-field"><div class="wch-detail-label">Conditions</div><div>' + esc(p.conditions) + '</div></div>' : '') +
          (p.contactName ? '<div class="wch-detail-field"><div class="wch-detail-label">On-site contact</div><div>' + esc(p.contactName) + (p.contactPhone ? ' \u00B7 ' + esc(p.contactPhone) : '') + '</div></div>' : '') +
          '<div class="wch-detail-actions">' +
            (p.pdfUrl ? '<a href="https://records.winchesterwi.com' + esc(p.pdfUrl) + '" target="_blank" rel="noopener" class="wch-pdf-link" style="flex:1 1 auto;display:inline-block;padding:8px 14px;background:#fff;color:#00505A;border:1px solid #00505A;border-radius:4px;text-align:center;text-decoration:none;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">View permit record (PDF)</a>' : '') +
          '</div>' +
        '</div>';
      return html;
    }

    // Populate the right-side panel with a specific permit's details.
    // Wires up close + zoom-to-project buttons inside the freshly-rendered
    // panel content.
    function showPermitDetails(p, s, info, typeLabel, typeColor) {
      var panel = document.getElementById('wch-detail-panel');
      if (!panel) return;
      panel.innerHTML = buildPanelContent(p, s, info, typeLabel, typeColor);
      panel.scrollTop = 0;
      var closeBtn = panel.querySelector('.wch-detail-close');
      if (closeBtn) closeBtn.addEventListener('click', function () {
        if (typeof window._wchRenderSummaryList === 'function') {
          window._wchRenderSummaryList();
        }
      });
    }

    // Registry: permitNumber → Leaflet shape (or featureGroup for multipoint).
    // Also permitDataById: permitNumber → { p, s, info, typeLabel, typeColor }
    // so the zoom-to-permit handler can populate the detail panel from a card
    // click (which only gives us the permit number).
    var shapesById = {};
    var permitDataById = {};

    shown.forEach(function (p) {
      var s = statusOf(p), info = p.jurisdiction && p.jurisdiction !== 'town';
      var typeKey = p.permitType || 'row';
      var typeLabel = TYPE_LABELS[typeKey] || 'Permit';
      var typeColor = TYPE_COLORS[typeKey] || '#555';
      var shape;

      if (p.geoType === 'multiline' && p.segments && p.segments.length) {
        // Multiple separate line segments in one permit. Render each segment
        // as its own visible polyline + invisible hit target, all wrapped in
        // a featureGroup so click/hover/halo target the whole permit.
        var multilineGroup = L.featureGroup();
        var visibleSegments = L.featureGroup(); // for halo color lookup + list of visible shapes
        p.segments.forEach(function (segCoords) {
          if (!segCoords || segCoords.length < 2) return;
          // Visible thin line
          var visibleSeg = L.polyline(segCoords, {
            color: info ? '#999999' : COLORS[s],
            weight: s === 'active' ? 4 : 3,
            opacity: 0.85,
            lineCap: 'round', lineJoin: 'round',
            dashArray: s === 'proposed' ? '10,8' : null,
            interactive: false,
            className: 'wch-highlightable'
          });
          // Wider invisible hit target
          var hitSeg = L.polyline(segCoords, {
            color: '#000000',
            weight: 18,
            opacity: 0,
            interactive: true
          });
          hitSeg.on('click', function (e) {
            L.DomEvent.stopPropagation(e);
            if (p.permitNumber) {
              document.dispatchEvent(new CustomEvent('wch:zoomToPermit', { detail: p.permitNumber }));
            } else {
              showPermitDetails(p, s, info, typeLabel, typeColor);
              pulseShape(multilineGroup);
            }
          });
          // Hover any segment → glow ALL segments together
          hitSeg.on('mouseover', function () { setHoverGlow(visibleSegments, true); });
          hitSeg.on('mouseout', function () { setHoverGlow(visibleSegments, false); });
          // Small color-matched endpoint dots on each segment
          [segCoords[0], segCoords[segCoords.length - 1]].forEach(function (pt) {
            L.circleMarker(pt, {
              radius: 3,
              fillColor: info ? '#999999' : COLORS[s],
              stroke: false,
              fillOpacity: 1,
              interactive: false
            }).addTo(layer);
            pts.push(pt);
          });
          segCoords.forEach(function (pt) { pts.push(pt); });
          visibleSeg.addTo(layer);
          hitSeg.addTo(layer);
          visibleSegments.addLayer(visibleSeg);
          multilineGroup.addLayer(visibleSeg);
        });
        if (p.permitNumber) {
          shapesById[p.permitNumber] = multilineGroup;
          permitDataById[p.permitNumber] = { p: p, s: s, info: info, typeLabel: typeLabel, typeColor: typeColor };
        }
        return; // handled entirely — skip the shared code path
      } else if (p.geoType === 'line' && p.coordinates && p.coordinates.length > 1) {
        // Visible thin line — not interactive; clicks pass through to hit line below
        shape = L.polyline(p.coordinates, {
          color: info ? '#999999' : COLORS[s],
          weight: s === 'active' ? 4 : 3,
          opacity: 0.85,
          lineCap: 'round', lineJoin: 'round',
          dashArray: s === 'proposed' ? '10,8' : null,
          interactive: false,
          className: 'wch-highlightable'
        });
        // Invisible wider "hit target" — same route, transparent, receives clicks/taps.
        // Keeps the visible line thin without making it hard to click on desktop or
        // tap on touchscreen.
        var hitLine = L.polyline(p.coordinates, {
          color: '#000000',
          weight: 18,
          opacity: 0,
          interactive: true
        });
        // Popup: bind with a big upward offset so the popup body clears the
        // line entirely. The popup's tail arrow sits ~30px above the line
        // midpoint, and the popup body extends upward from there.
        // Line click → dispatch zoom event so map zooms to fit the line,
        // panel populates, and pulse fires — same flow as sidebar list clicks.
        hitLine.on('click', function (e) {
          L.DomEvent.stopPropagation(e);
          if (p.permitNumber) {
            document.dispatchEvent(new CustomEvent('wch:zoomToPermit', { detail: p.permitNumber }));
          } else {
            // Fallback for permits with no assigned number (shouldn't happen)
            showPermitDetails(p, s, info, typeLabel, typeColor);
            pulseShape(shape);
          }
        });
        hitLine.on('mouseover', function () { setHoverGlow(shape, true); });
        hitLine.on('mouseout', function () { setHoverGlow(shape, false); });
        // Small color-matched endpoints — filled in the status color, no border.
        [p.coordinates[0], p.coordinates[p.coordinates.length - 1]].forEach(function (pt) {
          L.circleMarker(pt, {
            radius: 3,
            fillColor: info ? '#999999' : COLORS[s],
            stroke: false,
            fillOpacity: 1,
            interactive: false
          }).addTo(layer);
          pts.push(pt);
        });
        p.coordinates.forEach(function (pt) { pts.push(pt); });
        shape.addTo(layer);
        hitLine.addTo(layer);
        if (p.permitNumber) { shapesById[p.permitNumber] = shape; permitDataById[p.permitNumber] = { p: p, s: s, info: info, typeLabel: typeLabel, typeColor: typeColor }; }
        return; // handled entirely here — skip the shared code path below
      } else if (p.geoType === 'multipoint' && p.points && p.points.length) {
        // Render each pin as its own circle marker; clicking any pin populates
        // the detail panel with the shared permit info.
        var multipointGroup = L.featureGroup();
        p.points.forEach(function (pt) {
          var pin = L.circleMarker(pt, {
            radius: s === 'active' ? 5 : 4,
            fillColor: info ? '#ffffff' : COLORS[s],
            color: info ? '#999999' : '#ffffff',
            weight: info ? 2 : 2, fillOpacity: .92,
            className: 'wch-highlightable'
          });
          pin.on('click', function (e) {
            L.DomEvent.stopPropagation(e);
            if (p.permitNumber) {
              document.dispatchEvent(new CustomEvent('wch:zoomToPermit', { detail: p.permitNumber }));
            } else {
              showPermitDetails(p, s, info, typeLabel, typeColor);
              pulseShape(multipointGroup);
            }
          });
          pin.on('mouseover', function () { setHoverGlow(multipointGroup, true); });
          pin.on('mouseout', function () { setHoverGlow(multipointGroup, false); });
          pin.addTo(layer);
          multipointGroup.addLayer(pin);
          pts.push(pt);
        });
        // The centroid (from sync_permits.py) is stored as lat/lng; use it for list-view anchor
        pts.push([p.lat, p.lng]);
        if (p.permitNumber) { shapesById[p.permitNumber] = multipointGroup; permitDataById[p.permitNumber] = { p: p, s: s, info: info, typeLabel: typeLabel, typeColor: typeColor }; }
        return; // multipoint handles its own click + bounds, skip the shared bind below
      } else {
        shape = L.circleMarker([p.lat, p.lng], {
          radius: s === 'active' ? 5 : 4,
          fillColor: info ? '#ffffff' : COLORS[s],
          color: info ? '#999999' : '#ffffff',
          weight: info ? 2 : 1.5, fillOpacity: .92,
          className: 'wch-highlightable'
        });
        if (p.permitNumber) { shapesById[p.permitNumber] = shape; permitDataById[p.permitNumber] = { p: p, s: s, info: info, typeLabel: typeLabel, typeColor: typeColor }; }
      }

      // Single-point click → dispatch zoom event (same flow as sidebar list)
      shape.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        if (p.permitNumber) {
          document.dispatchEvent(new CustomEvent('wch:zoomToPermit', { detail: p.permitNumber }));
        } else {
          showPermitDetails(p, s, info, typeLabel, typeColor);
          pulseShape(shape);
        }
      });
      shape.on('mouseover', function () { setHoverGlow(shape, true); });
      shape.on('mouseout', function () { setHoverGlow(shape, false); });
      shape.addTo(layer);
      if (!(p.geoType === 'line' && p.coordinates && p.coordinates.length > 1)) {
        pts.push([p.lat, p.lng]);
      }
    });

    if (pts.length > 1) {
      // Tighter padding than before (was 45px) so the fit hugs the permits
      // more closely instead of leaving a wide margin.
      map.fitBounds(L.latLngBounds(pts), { padding: [15, 15], maxZoom: 13, animate: didInitialFit });
      didInitialFit = true;
      // Feed the fitted view to initMap()'s reset/home-button target via the
      // window bridge (see window._wchSetInitialView) so Home restores this
      // same fitted view instead of the pre-data-load hardcoded default.
      if (typeof window._wchSetInitialView === 'function') {
        window._wchSetInitialView({ center: map.getCenter(), zoom: map.getZoom() });
      }
    }

    // ---- Zoom-to-permit ----
    // Sidebar cards (see the accordion builder later in this file) fire a
    // 'wch:zoomToPermit' custom event with the permit number when the card is
    // clicked. We look up its shape in shapesById and fit the map to it.
    // Detach any prior listener on repeated render() calls to avoid duplicates.
    if (window._wchZoomListener) {
      document.removeEventListener('wch:zoomToPermit', window._wchZoomListener);
    }
    window._wchZoomListener = function (ev) {
      var id = ev && ev.detail;
      if (!id) return;
      var target = shapesById[id];
      if (!target) return;
      // Ensure map has laid out its container (in case of tab visibility etc.)
      map.invalidateSize();
      if (typeof target.getBounds === 'function') {
        var b = target.getBounds();
        // Single-point shapes have a zero-area bounds — use setView instead
        if (b.isValid && b.isValid() &&
            (b.getSouthWest().lat !== b.getNorthEast().lat ||
             b.getSouthWest().lng !== b.getNorthEast().lng)) {
          map.fitBounds(b, { padding: [40, 40], maxZoom: 17 });
        } else {
          map.setView(b.getCenter(), 16);
        }
      } else if (typeof target.getLatLng === 'function') {
        map.setView(target.getLatLng(), 16);
      }
      // Scroll the map into view so the user sees the zoom happen if the map
      // was off-screen (e.g. they were scrolled down at the sidebar list).
      var mapEl = document.getElementById('winchester-row-map');
      if (mapEl && mapEl.scrollIntoView) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Brief pulse animation to draw attention to the selected permit.
      // Small delay so it fires after the zoom animation settles.
      setTimeout(function () { pulseShape(target); }, 350);
      // Also populate the detail panel with this permit's info (card clicks
      // don't fire a Leaflet shape click, so we need to do this explicitly).
      var pd = permitDataById[id];
      if (pd) showPermitDetails(pd.p, pd.s, pd.info, pd.typeLabel, pd.typeColor);
    };
    document.addEventListener('wch:zoomToPermit', window._wchZoomListener);

    var c = { active: 0, upcoming: 0, complete: 0, proposed: 0 };
    shown.forEach(function (p) { var s = statusOf(p); if (c[s] !== undefined) c[s]++; });
    var slabels = { active: 'Active', upcoming: 'Approved', complete: 'Complete', proposed: 'Pending' };
    document.getElementById('winchester-row-map-stats').innerHTML =
      ['active', 'upcoming', 'complete', 'proposed'].map(function (k) {
        return '<div style="display:flex;align-items:center;gap:9px">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + COLORS[k] + '"></span>' +
          '<div><div style="font-family:Electrolize,sans-serif;font-size:19px;color:#193C3C;line-height:1">' + c[k] + '</div>' +
          '<div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.6px">' + slabels[k] + '</div></div></div>';
      }).join('');

    var list = document.getElementById('winchester-row-list');
    // Update count in the collapsible wrapper's header (added later by wrapPermitList).
    function updateCount(n) {
      var el = document.querySelector('.wch-permits-count');
      if (el) el.textContent = '(' + n + ')';
    }
    if (!shown.length) {
      list.innerHTML = '<p style="text-align:center;color:#999;padding:32px 0;font-size:14px">No permitted work currently on record.</p>';
      updateCount(0);
      return;
    }
    var order = { active: 0, upcoming: 1, proposed: 2, complete: 3 };
    // Complete permits stay on the map (until 6-month drop-off in sync_permits.py)
    // but are hidden from the dropdown list to keep it focused on active/upcoming/pending work.
    var listShown = shown.filter(function (p) { return statusOf(p) !== 'complete'; });
    if (listShown.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:#999;padding:32px 0;font-size:14px">No permitted work currently on record.</p>';
      updateCount(0);
      return;
    }
    updateCount(listShown.length);

    list.innerHTML = listShown.slice().sort(function (a, b) { return order[statusOf(a)] - order[statusOf(b)]; }).map(function (p) {
      var s = statusOf(p), info = p.jurisdiction && p.jurisdiction !== 'town';
      var typeKey = p.permitType || 'row';
      var typeLabel = TYPE_LABELS[typeKey] || 'Permit';
      var typeColor = TYPE_COLORS[typeKey] || '#555';
      var bc = COLORS[s] || '#D4D4D4';
      var bgc = { active: '#FEF0E1', upcoming: '#E3F0F7', complete: '#E1F5EA', proposed: '#FDF5E1' }[s] || '#f5f5f5';
      var badgeStyle = 'display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:3px 9px;border-radius:3px;text-align:center;white-space:nowrap;';
      var pdfLink = p.pdfUrl ? '<a href="https://records.winchesterwi.com' + esc(p.pdfUrl) + '" target="_blank" rel="noopener" class="wch-pdf-link" style="display:inline-block;padding:6px 12px;background:#fff;color:#00505A;border:1px solid #00505A;border-radius:3px;text-decoration:none;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;transition:background 0.15s ease;">View permit record (PDF)</a>' : '';
      return '<div data-permit-id="' + esc(p.permitNumber || '') + '" style="border:1px solid #E8E8E8;border-radius:6px;padding:16px 18px;margin-bottom:10px;border-left:4px solid ' + bc + ';background:#fff">' +
        '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-right:36px">' +
          '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;color:#193C3C">' + esc(p.title) + '</div>' +
          '<div style="font-size:12px;color:#555;margin-top:2px">' + esc(p.org) + '</div></div>' +
          '<div style="display:flex;flex-direction:row;gap:6px;flex-wrap:wrap;flex:0 0 auto;align-items:center;justify-content:flex-end">' +
            (p.permitNumber ? '<span style="' + badgeStyle + 'background:#F0F0F0;color:#555">' + esc(p.permitNumber) + '</span>' : '') +
            '<span style="' + badgeStyle + 'background:#E6F0F1;color:' + typeColor + '">' + esc(typeLabel) + '</span>' +
            '<span style="' + badgeStyle + 'background:' + bgc + ';color:' + bc + '">' + esc(LABELS[s]) + '</span>' +
            (info ? '<span style="' + badgeStyle + 'background:#E6F0F1;color:#00505A">' + esc(p.jurisdiction) + '</span>' : '') +
          '</div>' +
        '</div>' +
        // Details section: wrap content in an inner flex container so the accordion
        // code (which inserts text nodes at the start of this div) doesn't disrupt
        // the two-column layout. PDF button is inside details so it's hidden when collapsed.
        '<div style="font-size:12px;color:#555;margin-top:9px;line-height:1.7">' +
          '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end">' +
            '<div style="flex:1;min-width:0">' +
              '<b style="color:#2A2A2A">Location:</b> ' + esc(p.location) + '<br>' +
              '<b style="color:#2A2A2A">Dates:</b> ' + fmt(p.startDate) + ' \u2013 ' + fmt(p.endDate) +
              (p.traffic ? '<br><b style="color:#2A2A2A">Traffic:</b> ' + esc(p.traffic) : '') +
              (p.contactName ? '<br><b style="color:#2A2A2A">Contact:</b> ' + esc(p.contactName) + (p.contactPhone ? ' \u00B7 ' + esc(p.contactPhone) : '') : '') +
            '</div>' +
            (pdfLink ? '<div style="flex:0 0 auto;padding-right:36px">' + pdfLink + '</div>' : '') +
          '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }
})();


// ---- Wrap the sidebar permit list in a collapsible accordion ----
// Nests all permit cards inside a single "View permit list (N)" dropdown so
// the /permits page doesn't lead with a tall list of cards. Reuses the same
// .wch-acc-toggle / .wch-acc-body styling used elsewhere on the page for
// visual consistency. Starts COLLAPSED; user clicks the header to expand.
(function wrapPermitList() {
  var list = document.getElementById('winchester-row-list');
  if (!list) return;
  // Skip if already wrapped (page refresh via SPA-like navigation)
  if (list.parentNode && list.parentNode.classList &&
      list.parentNode.classList.contains('wch-acc-body')) return;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'wch-acc-toggle';
  btn.setAttribute('aria-expanded', 'false');
  var title = document.createElement('span');
  title.className = 'wch-acc-title';
  // Text swaps between "View" and "Hide" based on state so users know
  // clicking again will close the list.
  title.innerHTML = '<span class="wch-permits-toggle-verb">View</span> permit list <span class="wch-permits-count" style="color:#6b5f3e;font-weight:500;font-size:0.9em;margin-left:6px">(0)</span>';
  btn.appendChild(title);

  var body = document.createElement('div');
  body.className = 'wch-acc-body';

  // Move the list into the collapsible body, then insert button+body where the
  // list used to be so the surrounding BB layout is unchanged.
  list.parentNode.insertBefore(btn, list);
  list.parentNode.insertBefore(body, list);
  body.appendChild(list);

  btn.addEventListener('click', function () {
    var open = body.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var verb = btn.querySelector('.wch-permits-toggle-verb');
    if (verb) verb.textContent = open ? 'Hide' : 'View';
  });
})();


// ---- Three-Tab Permit Application Forms ----
(function () {
  var app = document.getElementById('wch-permit-app');
  if (!app) return;

  var WEBHOOK_URL = 'https://hook.us2.make.com/gatf2jagb2qfxkmczko6gugq2qx80uxr';
  var HALL = { lat: 46.21196, lng: -89.88619 };

  // Inject styles for the map mode toggle, top success message, date warning, and form field spacing
  (function injectStyles() {
    if (document.getElementById('wch-runtime-styles')) return;
    var css =
      // Mode toggle (Route / Pin / Multi-pin)
      '#wch-permit-app .wch-map-mode-toggle { display:inline-flex; gap:0; margin:0 0 10px 0; border:1px solid #d5d5d5; border-radius:8px; overflow:hidden; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.04); }' +
      '#wch-permit-app .wch-mode-btn { display:inline-flex !important; align-items:center; gap:6px; padding:8px 16px !important; font-family:"Noto Sans",sans-serif !important; font-size:13px !important; font-weight:600 !important; color:#555 !important; background:#fff !important; border:none !important; cursor:pointer; transition:background 0.15s, color 0.15s; }' +
      '#wch-permit-app .wch-mode-btn + .wch-mode-btn { border-left:1px solid #d5d5d5 !important; }' +
      '#wch-permit-app .wch-mode-btn.active { background:#193C3C !important; color:#fff !important; }' +
      '#wch-permit-app .wch-mode-btn:not(.active):hover { background:#F5F2EC !important; color:#193C3C !important; }' +
      '#wch-permit-app .wch-mode-btn svg { width:14px; height:14px; flex-shrink:0; }' +
      // Multi-line route drawing: toolbar row, Finish button, per-segment delete marker, drawing cursor
      '#wch-permit-app .wch-map-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin:0 0 10px 0; }' +
      '#wch-permit-app .wch-map-toolbar .wch-map-mode-toggle { margin:0; }' +
      '#wch-permit-app .wch-finish-draw-btn { display:none; margin:0; padding:8px 16px; font-family:"Noto Sans",sans-serif; font-size:13px; font-weight:600; color:#193C3C; background:#fff; border:1px solid #d5d5d5; border-radius:8px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.04); }' +
      '#wch-permit-app .wch-finish-draw-btn.show { display:inline-block; }' +
      '#wch-permit-app .wch-finish-draw-btn:hover { background:#F5F2EC; }' +
      '#wch-permit-app .wch-seg-del { width:18px; height:18px; border-radius:50%; background:#fff; border:1.5px solid #A32D2D; color:#A32D2D; font-family:"Noto Sans",sans-serif; font-size:12px; font-weight:700; line-height:1; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.25); }' +
      '#wch-permit-app .wch-seg-del:hover { background:#A32D2D; color:#fff; }' +
      // While actively drawing a route, use the normal pointer instead of Leaflet's default grab-hand
      '#wch-permit-app .wch-line-drawing.leaflet-container, #wch-permit-app .wch-line-drawing .leaflet-interactive, #wch-permit-app .wch-line-drawing.leaflet-grab, #wch-permit-app .wch-line-drawing .leaflet-grab, #wch-permit-app .wch-line-drawing.leaflet-dragging, #wch-permit-app .wch-line-drawing.leaflet-dragging .leaflet-grab { cursor:default !important; }' +
      // Top success message + date warning
      '#wch-permit-app .wch-form-msg-top { display:none; padding:14px 18px; border-radius:6px; font-size:14px; margin:0 0 20px 0; line-height:1.6; }' +
      '#wch-permit-app .wch-date-warn { display:none; font-size:12px; color:#8a5a00; margin-top:4px; padding:4px 8px; background:#FDF5E1; border-radius:3px; }' +
      '#wch-permit-app .wch-date-warn.show { display:block; }' +
      '#wch-permit-app .wch-traffic-other { display:none; margin-top:6px; }' +
      '#wch-permit-app .wch-traffic-other.show { display:block; }' +
      // Uniform field row spacing across all forms (fixes label margin mismatch between 1-col and 2-col rows)
      '#wch-permit-app label { margin: 16px 0 6px 0 !important; }' +
      '#wch-permit-app form > label:first-of-type, #wch-permit-app .wch-section-head + label, #wch-permit-app .wch-section-head + .wch-row, #wch-permit-app .wch-section-head + .wch-row > label { margin-top: 0 !important; }' +
      '#wch-permit-app .wch-row { row-gap: 12px !important; }' +
      '#wch-permit-app .wch-section-head { margin-top: 28px !important; margin-bottom: 6px !important; padding-top: 16px !important; }' +
      '#wch-permit-app .wch-form-panel > form > .wch-section-head:first-child, #wch-permit-app form > .wch-section-head:first-child { margin-top: 8px !important; }';
    var styleEl = document.createElement('style');
    styleEl.id = 'wch-runtime-styles';
    styleEl.appendChild(document.createTextNode(css));
    document.head.appendChild(styleEl);
  })();

  // ---- Tab switching ----
  var tabs = app.querySelectorAll('.wch-form-tab');
  var panels = app.querySelectorAll('.wch-form-panel');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      panels.forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var panel = document.getElementById(tab.getAttribute('data-panel'));
      if (panel) panel.classList.add('active');
      // Invalidate maps when switching tabs (Leaflet needs this)
      setTimeout(function () {
        if (maps.row) maps.row.invalidateSize();
        if (maps.dw) maps.dw.invalidateSize();
        if (maps.rc) maps.rc.invalidateSize();
      }, 200);
    });
  });

  // ---- Leaflet loading ----
  function loadCSS(url) {
    if (document.querySelector('link[href="' + url + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url;
    document.head.appendChild(l);
  }
  function loadJS(url, cb) {
    if (url.indexOf('leaflet.min.js') >= 0 && window.L) { cb(); return; }
    if (url.indexOf('leaflet.draw') >= 0 && window.L && window.L.Draw) { cb(); return; }
    var existing = document.querySelector('script[src="' + url + '"]');
    if (existing) { existing.addEventListener('load', cb); return; }
    var s = document.createElement('script'); s.src = url; s.onload = cb;
    document.head.appendChild(s);
  }
  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css');

  var maps = {};
  var geoState = { row: null, dw: null, rc: null };
  var mapCtrl = { row: null, rc: null }; // holds mode + control refs per map

  function boot() {
    if (window.L && window.L.Draw) { initAllMaps(); return; }
    if (window.L && !window.L.Draw) {
      loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js', initAllMaps);
      return;
    }
    loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', function () {
      loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js', initAllMaps);
    });
  }
  boot();

  function hallMarker(m) {
    L.marker([HALL.lat, HALL.lng], {
      icon: L.divIcon({ className: '', html: '<div style="width:12px;height:12px;background:#193C3C;border:2px solid #fff"></div>', iconSize: [12, 12], iconAnchor: [6, 6] })
    }).addTo(m).bindTooltip('Town Hall');
  }

  // Icon SVGs for the mode toggle
  var MODE_ICONS = {
    line: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14 Q 6 4 10 10 T 18 6"/></svg>',
    point: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 C 6 2 3 5 3 9 C 3 14 10 18 10 18 C 10 18 17 14 17 9 C 17 5 14 2 10 2 Z"/><circle cx="10" cy="9" r="2.5"/></svg>',
    multipoint: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="6" r="1.8"/><circle cx="10" cy="14" r="1.8"/><circle cx="16" cy="7" r="1.8"/></svg>'
  };

  // Build the mode toggle above a map wrap and return the toggle element
  // modes: array of {value, label} objects — e.g. [{value:'line',label:'Route'},{value:'point',label:'Pin'}]
  function buildModeToggle(mapWrapEl, key, modes, defaultMode, onChange) {
    var toggle = document.createElement('div');
    toggle.className = 'wch-map-mode-toggle';
    toggle.setAttribute('data-key', key);

    var buttons = {};
    modes.forEach(function (mode) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wch-mode-btn' + (mode.value === defaultMode ? ' active' : '');
      btn.setAttribute('data-mode', mode.value);
      // innerHTML is safe here — icon and label are hardcoded, no user input
      var icon = MODE_ICONS[mode.value] || '';
      btn.innerHTML = icon + '<span>' + mode.label + '</span>';
      btn.addEventListener('click', function () {
        setActive(mode.value);
        onChange(mode.value);
      });
      toggle.appendChild(btn);
      buttons[mode.value] = btn;
    });

    // Insert toggle just before the map wrap
    mapWrapEl.parentNode.insertBefore(toggle, mapWrapEl);

    function setActive(mode) {
      Object.keys(buttons).forEach(function (v) {
        buttons[v].classList.toggle('active', v === mode);
      });
    }

    return { el: toggle, setActive: setActive };
  }

  // Set up a map that supports line, point, and optionally multipoint modes
  function setupModeMap(opts) {
    // opts: { key, mapId, readoutId, lineColor, pinColor, defaultMode, modes }
    var mapEl = document.getElementById(opts.mapId);
    if (!mapEl || maps[opts.key]) return;
    var readoutEl = document.getElementById(opts.readoutId);
    var wrapEl = mapEl.closest('.wch-map-wrap');
    if (!wrapEl) return;

    var m = L.map(opts.mapId, { scrollWheelZoom: true }).setView([46.2250, -89.8850], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '\u00A9 OSM', maxZoom: 18 }).addTo(m);
    hallMarker(m);
    maps[opts.key] = m;

    var drawn = new L.FeatureGroup().addTo(m);
    var currentMode = opts.defaultMode || 'line';
    var lineTool = null;
    var multiPins = []; // for multipoint mode

    // ---- Multi-line drawing state (Route mode) ----
    // segments: completed segments, each an array of [lat,lng]
    // segLayers: L.polyline per completed segment (status color), parallel to segments
    // segDelMarkers: delete-x marker per completed segment, parallel to segments
    // current: points of the in-progress segment (not yet finished); empty when idle
    // curLayer: white polyline preview of `current`
    var segments = [];
    var segLayers = [];
    var segDelMarkers = [];
    var segPointMarkers = []; // array of arrays of vertex dots, parallel to segments
    var current = [];
    var curLayer = null;
    var curPointMarkers = []; // vertex dots for the in-progress segment
    var clickTimer = null;
    var finishBtn = null;
    var SEGMENT_CAP = 15;
    var DBLCLICK_MS = 300;

    function clearAll() {
      drawn.clearLayers();
      multiPins = [];
      segments = [];
      segLayers = [];
      segDelMarkers = [];
      segPointMarkers = [];
      current = [];
      curLayer = null;
      curPointMarkers = [];
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      if (lineTool) { try { lineTool.disable(); } catch (e) {} lineTool = null; }
      if (finishBtn) finishBtn.classList.remove('show');
      geoState[opts.key] = null;
      updateReadout();
    }

    function updateReadout() {
      if (!readoutEl) return;
      var g = geoState[opts.key];
      if (currentMode === 'line') {
        if (segments.length === 0 && current.length === 0) {
          readoutEl.textContent = 'Draw the route on the map. Click to start, double-click your last point (or "Finish drawing") to end a segment.';
        } else if (current.length > 0) {
          readoutEl.textContent = segments.length + ' segment' + (segments.length === 1 ? '' : 's') + ' saved \u2014 drawing segment ' + (segments.length + 1) + '\u2026 (' + current.length + ' point' + (current.length === 1 ? '' : 's') + ')';
        } else if (segments.length >= SEGMENT_CAP) {
          readoutEl.textContent = segments.length + ' segments \u2014 maximum reached.';
        } else {
          readoutEl.textContent = segments.length + ' segment' + (segments.length === 1 ? '' : 's') + ' drawn. Click the map to add another, or click "Finish drawing" if done.';
        }
        return;
      }
      if (!g) {
        if (currentMode === 'point') {
          readoutEl.textContent = 'Click the map to drop a pin at the project location.';
        } else if (currentMode === 'multipoint') {
          readoutEl.textContent = 'Click the map to drop pins at each project location. Click as many as needed.';
        }
      } else if (g.type === 'point') {
        readoutEl.textContent = 'Pin set \u2014 ' + g.lat.toFixed(5) + ', ' + g.lng.toFixed(5);
      } else if (g.type === 'multipoint') {
        readoutEl.textContent = g.points.length + ' pin' + (g.points.length > 1 ? 's' : '') + ' placed';
      }
    }

    // Sync geoState from segments (called any time segments changes)
    function syncGeoFromSegments() {
      geoState[opts.key] = segments.length ? { type: 'multiline', segments: segments.map(function (s) { return s.slice(); }) } : null;
    }

    function segMidpoint(seg) {
      var mid = seg[Math.floor((seg.length - 1) / 2)];
      return mid;
    }

    function makeVertexDot(latlng, color) {
      return L.circleMarker(latlng, { radius: 5, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.95, interactive: false });
    }

    function redrawCurLayer() {
      if (curLayer) { drawn.removeLayer(curLayer); curLayer = null; }
      curPointMarkers.forEach(function (mk) { drawn.removeLayer(mk); });
      curPointMarkers = [];
      if (current.length > 1) {
        curLayer = L.polyline(current, { color: '#ffffff', weight: 4, opacity: 0.95 }).addTo(drawn);
      }
      current.forEach(function (pt) {
        var mk = makeVertexDot(pt, '#ffffff').addTo(drawn);
        curPointMarkers.push(mk);
      });
    }

    function addSegment(pts) {
      if (pts.length < 2) return; // not a real segment
      var layer = L.polyline(pts, { color: opts.lineColor, weight: 4, opacity: 0.8 }).addTo(drawn);
      segments.push(pts);
      segLayers.push(layer);

      var dots = pts.map(function (pt) { return makeVertexDot(pt, opts.lineColor).addTo(drawn); });
      segPointMarkers.push(dots);

      var delMarker = L.marker(segMidpoint(pts), {
        icon: L.divIcon({ className: '', html: '<div class="wch-seg-del">\u00d7</div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 1000
      }).addTo(drawn);
      var idx = segments.length - 1;
      delMarker.on('click', function (evt) {
        L.DomEvent.stopPropagation(evt);
        removeSegment(idx);
      });
      segDelMarkers.push(delMarker);

      syncGeoFromSegments();
    }

    function removeSegment(idx) {
      if (idx < 0 || idx >= segments.length) return;
      drawn.removeLayer(segLayers[idx]);
      drawn.removeLayer(segDelMarkers[idx]);
      segPointMarkers[idx].forEach(function (mk) { drawn.removeLayer(mk); });
      segments.splice(idx, 1);
      segLayers.splice(idx, 1);
      segDelMarkers.splice(idx, 1);
      segPointMarkers.splice(idx, 1);
      // Re-wire remaining delete markers to their new indices
      segDelMarkers.forEach(function (mk, i) {
        mk.off('click');
        mk.on('click', function (evt) {
          L.DomEvent.stopPropagation(evt);
          removeSegment(i);
        });
      });
      syncGeoFromSegments();
      updateReadout();
    }

    function finishDrawing() {
      // If the user has a real in-progress segment (>=2 pts), finalize it rather than discard it.
      if (current.length >= 2 && segments.length < SEGMENT_CAP) {
        addSegment(current.slice());
      }
      current = [];
      redrawCurLayer();
      updateReadout();
    }

    function startLineMode() {
      m.off('click');
      m.off('dblclick');
      try { m.doubleClickZoom.disable(); } catch (e) {}
      L.DomUtil.addClass(m.getContainer(), 'wch-line-drawing');

      if (finishBtn) finishBtn.classList.add('show');

      m.on('click', function (e) {
        if (clickTimer) {
          // Second click of a double-click gesture \u2014 swallow it, dblclick handler decides the outcome.
          clearTimeout(clickTimer);
          clickTimer = null;
          return;
        }
        clickTimer = setTimeout(function () {
          clickTimer = null;
          if (segments.length >= SEGMENT_CAP && current.length === 0) return; // cap reached, silently ignore new segments
          current.push([e.latlng.lat, e.latlng.lng]);
          redrawCurLayer();
          updateReadout();
        }, DBLCLICK_MS);
      });

      m.on('dblclick', function (e) {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        if (current.length >= 1) {
          // Double-click on/near the segment being drawn: end this segment, tool stays active for the next one.
          if (segments.length < SEGMENT_CAP) {
            // include the double-click point itself as the final vertex
            current.push([e.latlng.lat, e.latlng.lng]);
            addSegment(current.slice()); // addSegment silently no-ops if fewer than 2 points
          }
          current = [];
          redrawCurLayer();
          updateReadout();
        } else {
          // Double-click on an empty map with nothing in progress: finish the whole session.
          finishDrawing();
        }
      });
    }

    function startPointMode() {
      m.off(L.Draw.Event.CREATED);
      m.off('click');
      m.off('dblclick');
      try { m.doubleClickZoom.enable(); } catch (e) {}
      L.DomUtil.removeClass(m.getContainer(), 'wch-line-drawing');
      if (finishBtn) finishBtn.classList.remove('show');
      if (lineTool) { try { lineTool.disable(); } catch (e) {} lineTool = null; }
      m.on('click', function (e) {
        drawn.clearLayers();
        L.circleMarker(e.latlng, { radius: 9, fillColor: opts.pinColor, color: '#fff', weight: 2, fillOpacity: 0.95 }).addTo(drawn);
        geoState[opts.key] = { type: 'point', lat: e.latlng.lat, lng: e.latlng.lng };
        updateReadout();
      });
    }

    function startMultipointMode() {
      m.off(L.Draw.Event.CREATED);
      m.off('click');
      m.off('dblclick');
      try { m.doubleClickZoom.enable(); } catch (e) {}
      L.DomUtil.removeClass(m.getContainer(), 'wch-line-drawing');
      if (finishBtn) finishBtn.classList.remove('show');
      if (lineTool) { try { lineTool.disable(); } catch (e) {} lineTool = null; }
      m.on('click', function (e) {
        L.circleMarker(e.latlng, { radius: 7, fillColor: opts.pinColor, color: '#fff', weight: 2, fillOpacity: 0.9 }).addTo(drawn);
        multiPins.push([e.latlng.lat, e.latlng.lng]);
        geoState[opts.key] = { type: 'multipoint', points: multiPins.slice() };
        updateReadout();
      });
    }

    function setMode(mode) {
      currentMode = mode;
      clearAll();
      if (mode === 'line') startLineMode();
      else if (mode === 'point') startPointMode();
      else if (mode === 'multipoint') startMultipointMode();
    }

    // Build the toggle and wire it
    var ctrl = buildModeToggle(wrapEl, opts.key, opts.modes, currentMode, setMode);

    // Toolbar row: puts the mode toggle and "Finish drawing" button side by side.
    // buildModeToggle already inserted ctrl.el right before wrapEl; wrap it in a
    // flex row here and move it in, so anything appended after it sits on the same line.
    var toolbar = document.createElement('div');
    toolbar.className = 'wch-map-toolbar';
    ctrl.el.parentNode.insertBefore(toolbar, ctrl.el);
    toolbar.appendChild(ctrl.el);

    // "Finish drawing" button — only relevant to Route (line) mode; shown/hidden by startLineMode/startPointMode/startMultipointMode
    var hasLineMode = opts.modes.some(function (mo) { return mo.value === 'line'; });
    if (hasLineMode) {
      finishBtn = document.createElement('button');
      finishBtn.type = 'button';
      finishBtn.className = 'wch-finish-draw-btn';
      finishBtn.textContent = 'Finish drawing';
      finishBtn.addEventListener('click', function () { finishDrawing(); });
      toolbar.appendChild(finishBtn);
    }

    // Save controller so external callers (form reset) can trigger a mode reset
    mapCtrl[opts.key] = {
      toggle: ctrl,
      setMode: setMode,
      clearAll: clearAll,
      defaultMode: opts.defaultMode || 'line',
      currentMode: function () { return currentMode; }
    };

    // Start in default mode
    setMode(currentMode);
  }

  function initAllMaps() {
    // ROW: Route or Pin
    setupModeMap({
      key: 'row',
      mapId: 'row-map',
      readoutId: 'row-map-readout',
      lineColor: '#00505A',
      pinColor: '#00505A',
      defaultMode: 'line',
      modes: [
        { value: 'line',  label: 'Route' },
        { value: 'point', label: 'Pin' }
      ]
    });

    // Driveway: single pin only (unchanged behavior)
    var dwEl = document.getElementById('dw-map');
    if (dwEl && !maps.dw) {
      maps.dw = L.map('dw-map', { scrollWheelZoom: true }).setView([46.2250, -89.8850], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '\u00A9 OSM', maxZoom: 18 }).addTo(maps.dw);
      hallMarker(maps.dw);
      var dwDrawn = new L.FeatureGroup().addTo(maps.dw);
      maps.dw.on('click', function (e) {
        dwDrawn.clearLayers();
        L.circleMarker(e.latlng, { radius: 9, fillColor: '#A59664', color: '#fff', weight: 2, fillOpacity: 0.95 }).addTo(dwDrawn);
        geoState.dw = { type: 'point', lat: e.latlng.lat, lng: e.latlng.lng };
        var readout = document.getElementById('dw-map-readout');
        if (readout) readout.textContent = 'Pin set \u2014 ' + e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
      });
      // Expose a minimal controller so we can reset dw map on submit success
      mapCtrl.dw = {
        clearAll: function () {
          dwDrawn.clearLayers();
          geoState.dw = null;
          var readout = document.getElementById('dw-map-readout');
          if (readout) readout.textContent = 'Click the map to mark where the driveway meets the road.';
        }
      };
    }

    // Road Construction: Route, Pin, or Multi-pin
    setupModeMap({
      key: 'rc',
      mapId: 'rc-map',
      readoutId: 'rc-map-readout',
      lineColor: '#D97A1F',
      pinColor: '#D97A1F',
      defaultMode: 'line',
      modes: [
        { value: 'line',       label: 'Route' },
        { value: 'point',      label: 'Pin' },
        { value: 'multipoint', label: 'Multi-pin' }
      ]
    });

    // Hide the legacy "Clear pins" button on RC (multi-point mode is retired)
    var rcClear = document.getElementById('rc-clear-pins');
    if (rcClear) rcClear.style.display = 'none';
  }

  // ---- County-highway handling ----
  // ROW form: just shows the existing notification (county work not blocked; Town Clerk still tracks)
  // Driveway form: FULL LOCKOUT — hides all fields below road selector, shows redirect card,
  //   disables submit. Cleared if user picks a Town road.
  var sel = document.getElementById('row-road');
  if (sel) {
    sel.addEventListener('change', function () {
      var opt = sel.options[sel.selectedIndex];
      var isCounty = opt && opt.getAttribute('data-county') === '1';
      var el = document.getElementById('row-county-redirect');
      if (el) {
        el.className = isCounty ? 'note warn show' : 'note warn';
        el.style.display = isCounty ? 'block' : 'none';
      }
    });
  }

  // Driveway lockout
  (function driveewayCountyLockout() {
    var dwForm = document.getElementById('wch-form-driveway');
    var dwSel = document.getElementById('dw-road');
    if (!dwForm || !dwSel) return;

    // Build the lockout card once and hide it
    var lockCard = document.createElement('div');
    lockCard.id = 'dw-county-lockout';
    lockCard.setAttribute('style', 'display:none;background:#FCEBEB;border:2px solid #A32D2D;border-radius:8px;padding:22px 26px;margin:14px 0;font-family:"Noto Sans",sans-serif;line-height:1.6;');
    lockCard.innerHTML =
      '<div style="font-family:Electrolize,sans-serif;font-size:18px;font-weight:700;color:#791F1F;margin-bottom:10px;">County Highway Driveway Permits Are Not Issued by the Town</div>' +
      '<div style="color:#2a2a2a;font-size:14px;margin-bottom:14px;">County trunk highways (W, K, J, O) fall under the jurisdiction of the <b>Vilas County Highway Department</b>. Driveway access permits within the county right-of-way must be issued by the County, not the Town of Winchester.</div>' +
      '<div style="background:#fff;border-radius:6px;padding:14px 18px;margin-bottom:12px;">' +
        '<div style="font-weight:700;color:#193C3C;margin-bottom:6px;font-size:14px;">Vilas County Highway Department</div>' +
        '<div style="font-size:13px;color:#333;line-height:1.7;">' +
          '<b>Phone:</b> <a href="tel:+17154794641" style="color:#00505A;text-decoration:none;">715-479-4641</a><br>' +
          '<b>Email:</b> <a href="mailto:vchwy@vilascountywi.gov" style="color:#00505A;text-decoration:none;">vchwy@vilascountywi.gov</a><br>' +
          '<b>Address:</b> 2104 N. Railroad St., Eagle River WI 54521' +
        '</div>' +
      '</div>' +
      '<div style="font-size:13px;color:#2a2a2a;">' +
        '<a href="https://www.vilascountywi.gov/departments/services/highway_department/permit_applications___documents.php" target="_blank" rel="noopener" style="display:inline-block;padding:8px 16px;background:#00505A;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;font-size:13px;">Open County permit page</a>' +
      '</div>' +
      '<div style="font-size:12px;color:#555;margin-top:14px;font-style:italic;">If you believe this is in error, or your driveway is on a Town road, use the road selector above to pick a different road.</div>';

    // Insert the lockout card directly after the road selector so it appears
    // right below the "Road *" field, not at the bottom of the form. dwSel is
    // the <select>; its parent is the form. Insert as a form child right after
    // the select. This also makes fieldsBelowRoad() work correctly since the
    // lockCard is now in the form's direct children list.
    dwSel.parentNode.insertBefore(lockCard, dwSel.nextSibling);

    // Find every form element AFTER the road selector so we can hide/show them together.
    // We collect them relative to the lockout card's position in the form's DOM order.
    function fieldsBelowRoad() {
      var all = Array.from(dwForm.children);
      var lockIdx = all.indexOf(lockCard);
      if (lockIdx === -1) return [];
      return all.slice(lockIdx + 1);
    }

    // Also disable submit
    var submitBtn = dwForm.querySelector('.wch-submit-btn');

    function applyLockout(locked) {
      // Hide/show all form children after the lockout card
      fieldsBelowRoad().forEach(function (child) {
        child.style.display = locked ? 'none' : '';
      });
      lockCard.style.display = locked ? 'block' : 'none';
      if (submitBtn) {
        submitBtn.disabled = !!locked;
        submitBtn.style.opacity = locked ? '0.5' : '';
        submitBtn.style.cursor = locked ? 'not-allowed' : '';
      }
      // Also hide the plain "county redirect" note if it exists (superseded by the lockout card)
      var oldNote = document.getElementById('dw-county-redirect');
      if (oldNote) oldNote.style.display = 'none';
    }

    dwSel.addEventListener('change', function () {
      var opt = dwSel.options[dwSel.selectedIndex];
      var isCounty = opt && opt.getAttribute('data-county') === '1';
      applyLockout(isCounty);
    });

    // Initial state (in case a county road is somehow pre-selected on load)
    var initOpt = dwSel.options[dwSel.selectedIndex];
    if (initOpt && initOpt.getAttribute('data-county') === '1') {
      applyLockout(true);
    }
  })();

  // ---- Driveway culvert conditional ----
  var culvertRadios = app.querySelectorAll('input[name="culvert_exists"]');
  culvertRadios.forEach(function (r) {
    r.addEventListener('change', function () {
      var details = document.getElementById('dw-culvert-details');
      if (details) details.className = r.value === 'yes' ? 'cond show' : 'cond';
    });
  });

  // ---- Signature dates auto-fill ----
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function setSignatureDates() {
    var today = todayISO();
    ['row-sigdate', 'dw-sigdate', 'rc-sigdate'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = today;
    });
  }
  setSignatureDates();

  // ---- Date-in-past warnings on start_date / end_date fields ----
  function attachDateWarning(inputId) {
    var el = document.getElementById(inputId);
    if (!el) return;
    var warn = document.createElement('div');
    warn.className = 'wch-date-warn';
    warn.textContent = 'The date selected is before today. Please verify this is correct.';
    // Insert warning immediately after the input
    el.parentNode.appendChild(warn);
    function check() {
      if (!el.value) { warn.classList.remove('show'); return; }
      var t = todayISO();
      warn.classList.toggle('show', el.value < t);
    }
    el.addEventListener('change', check);
    el.addEventListener('input', check);
  }
  ['row-start', 'row-end', 'rc-start', 'rc-end'].forEach(attachDateWarning);

  // ---- Traffic impact: replace text input with dropdown + Other-description ----
  var TRAFFIC_OPTIONS = [
    'No traffic impact',
    'Flaggers',
    'Lane closure',
    'Full road closure',
    'Detour',
    'Other'
  ];

  function replaceTrafficField(inputId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    // Skip if already replaced
    if (input.tagName === 'SELECT') return;

    var name = input.name || 'traffic';
    var required = true; // both ROW and RC are required per spec

    // Build the select
    var sel = document.createElement('select');
    sel.id = inputId;
    sel.name = name;
    if (required) sel.required = true;

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select\u2026';
    sel.appendChild(placeholder);

    TRAFFIC_OPTIONS.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt;
      o.textContent = opt === 'Other' ? 'Other (describe)' : opt;
      sel.appendChild(o);
    });

    // Build the "Other" description field
    var otherWrap = document.createElement('div');
    otherWrap.className = 'wch-traffic-other';
    otherWrap.id = inputId + '-other-wrap';
    var otherInput = document.createElement('input');
    otherInput.type = 'text';
    otherInput.id = inputId + '-other';
    otherInput.placeholder = 'Describe the traffic impact';
    otherWrap.appendChild(otherInput);

    // Replace input with select in place
    input.parentNode.replaceChild(sel, input);
    // Insert Other-description wrap right after the select
    sel.parentNode.insertBefore(otherWrap, sel.nextSibling);

    // Toggle Other-description visibility
    sel.addEventListener('change', function () {
      otherWrap.classList.toggle('show', sel.value === 'Other');
      if (sel.value !== 'Other') otherInput.value = '';
    });

    // Update label to include asterisk if it doesn't already
    var label = document.querySelector('label[for="' + inputId + '"]');
    if (label && required && label.textContent.indexOf('*') === -1) {
      label.textContent = label.textContent.trim() + ' *';
    }
  }

  replaceTrafficField('row-traffic');
  replaceTrafficField('rc-traffic');

  // ---- Success message injection (top of form) ----
  function ensureTopMsg(formEl) {
    var top = formEl.querySelector('.wch-form-msg-top');
    if (top) return top;
    top = document.createElement('div');
    top.className = 'wch-form-msg-top';
    // Insert as first child of form
    formEl.insertBefore(top, formEl.firstChild);
    return top;
  }

  function showTopMsg(formEl, type, html) {
    var el = ensureTopMsg(formEl);
    el.style.display = 'block';
    el.style.background = type === 'error' ? '#FCEBEB' : type === 'success' ? '#E1F5EA' : '#E6F0F1';
    el.style.color = type === 'error' ? '#791F1F' : type === 'success' ? '#1a5c34' : '#193C3C';
    el.innerHTML = html;
    // Scroll form top into view so the message is visible
    try {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      formEl.scrollIntoView(true);
    }
  }

  function hideTopMsg(formEl) {
    var top = formEl.querySelector('.wch-form-msg-top');
    if (top) { top.style.display = 'none'; top.innerHTML = ''; }
  }

  // ---- Legacy bottom message (used for validation errors near the submit button) ----
  function showMsg(msgId, type, html) {
    var el = document.getElementById(msgId);
    if (!el) return;
    el.style.display = 'block';
    el.style.background = type === 'error' ? '#FCEBEB' : type === 'success' ? '#E1F5EA' : '#E6F0F1';
    el.style.color = type === 'error' ? '#791F1F' : type === 'success' ? '#1a5c34' : '#193C3C';
    el.innerHTML = html;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function hideMsg(msgId) {
    var el = document.getElementById(msgId);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }

  // ---- Full form reset on successful submission ----
  function resetFormFully(formEl, geoKey, msgId) {
    // Native reset first (clears text, selects, checkboxes)
    formEl.reset();
    // Belt-and-suspenders: explicitly uncheck every checkbox in the form
    var boxes = formEl.querySelectorAll('input[type="checkbox"]');
    boxes.forEach(function (b) { b.checked = false; });
    // Re-fill signature dates
    setSignatureDates();
    // Clear map + geo state
    if (mapCtrl[geoKey] && mapCtrl[geoKey].clearAll) {
      mapCtrl[geoKey].clearAll();
    } else {
      geoState[geoKey] = null;
    }
    // Reset ROW/RC map toggle to default mode
    if (mapCtrl[geoKey] && mapCtrl[geoKey].setMode) {
      var def = mapCtrl[geoKey].defaultMode || 'line';
      mapCtrl[geoKey].setMode(def);
      if (mapCtrl[geoKey].toggle) mapCtrl[geoKey].toggle.setActive(def);
    }
    // Hide conditional sections (culvert details on Driveway)
    var culvertDetails = document.getElementById('dw-culvert-details');
    if (culvertDetails) culvertDetails.className = 'cond';
    // Hide county redirect notes
    ['row-county-redirect', 'dw-county-redirect'].forEach(function (id) {
      var e = document.getElementById(id);
      if (e) { e.className = 'note warn'; e.style.display = 'none'; }
    });
    // Hide date warnings
    formEl.querySelectorAll('.wch-date-warn').forEach(function (w) { w.classList.remove('show'); });
    // Hide traffic "Other" description panel
    formEl.querySelectorAll('.wch-traffic-other').forEach(function (o) { o.classList.remove('show'); });
    // Hide the driveway county-highway lockout card and restore the fields
    if (geoKey === 'dw') {
      var lockCard = document.getElementById('dw-county-lockout');
      if (lockCard) {
        lockCard.style.display = 'none';
        // Un-hide any form fields that were hidden by the lockout
        var dwForm = document.getElementById('wch-form-driveway');
        if (dwForm) {
          Array.from(dwForm.children).forEach(function (child) {
            if (child.style.display === 'none' && child.id !== 'dw-county-lockout') {
              child.style.display = '';
            }
          });
        }
        var submitBtn = formEl.querySelector('.wch-submit-btn');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '';
          submitBtn.style.cursor = '';
        }
      }
    }
    // Clear the bottom message div
    hideMsg(msgId);
  }

  // ---- Form submission ----
  function submitForm(formEl, geoKey, msgId, requiredIds, ackPrefix, successMsg) {
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();

      // Clear any prior success banner at the top before validating
      hideTopMsg(formEl);

      // Validate required fields
      var missing = requiredIds.filter(function (r) {
        var el = document.getElementById(r[0]);
        return !el || !el.value.trim();
      });
      if (missing.length) {
        showMsg(msgId, 'error', 'Required: ' + missing.slice(0, 3).map(function (m) { return m[1]; }).join(', ') +
          (missing.length > 3 ? ' and ' + (missing.length - 3) + ' more' : ''));
        var first = document.getElementById(missing[0][0]);
        if (first) first.focus();
        return;
      }

      // Validate geo
      if (!geoState[geoKey]) {
        var geoMsg;
        if (geoKey === 'dw') {
          geoMsg = 'Click the map to mark the driveway location.';
        } else {
          // ROW and RC support line or point; RC also supports multipoint
          var mode = mapCtrl[geoKey] && mapCtrl[geoKey].currentMode ? mapCtrl[geoKey].currentMode() : 'line';
          if (mode === 'line') {
            geoMsg = 'Draw the work route on the map (click to start; double-click your last point, or use "Finish drawing", to end a segment).';
          } else if (mode === 'point') {
            geoMsg = 'Click the map to drop a pin at the work location.';
          } else if (mode === 'multipoint') {
            geoMsg = 'Click the map to drop pins at each project location.';
          }
        }
        showMsg(msgId, 'error', geoMsg);
        return;
      }

      // Validate acks
      var acks = formEl.querySelectorAll('input[type="checkbox"][name^="' + ackPrefix + '"]');
      var unchecked = Array.from(acks).filter(function (c) { return !c.checked; });
      if (unchecked.length) {
        showMsg(msgId, 'error', 'All acknowledgement boxes must be checked before submitting.');
        return;
      }

      // Special validation: if traffic dropdown is "Other", require the description field
      var trafficSel = formEl.querySelector('select[name="traffic"]');
      var trafficOther = formEl.querySelector('#' + (geoKey === 'row' ? 'row' : 'rc') + '-traffic-other');
      if (trafficSel && trafficSel.value === 'Other') {
        if (!trafficOther || !trafficOther.value.trim()) {
          showMsg(msgId, 'error', 'Please describe the traffic impact.');
          if (trafficOther) trafficOther.focus();
          return;
        }
      }

      // Gather data
      var data = {};
      var fields = formEl.querySelectorAll('input, select, textarea');
      fields.forEach(function (f) {
        if (f.name && f.value && f.type !== 'checkbox' && f.type !== 'radio') data[f.name] = f.value.trim();
      });
      // Coerce traffic value: if Other picked, combine with description
      if (trafficSel && trafficSel.value === 'Other' && trafficOther && trafficOther.value.trim()) {
        data.traffic = 'Other: ' + trafficOther.value.trim();
      }
      // Radio buttons
      formEl.querySelectorAll('input[type="radio"]:checked').forEach(function (r) {
        if (r.name) data[r.name] = r.value;
      });

      var geo = geoState[geoKey];
      if (geo.type === 'point') {
        data.geo_type = 'point';
        data.lat = geo.lat;
        data.lng = geo.lng;
      } else if (geo.type === 'multiline') {
        // Auto-detect: a single drawn segment is legacy single-line behavior; 2+ segments use route_segments.
        if (geo.segments.length === 1) {
          data.geo_type = 'line';
          data.route_coords = JSON.stringify(geo.segments[0]);
        } else {
          data.geo_type = 'multiline';
          data.route_segments = JSON.stringify(geo.segments);
        }
      } else if (geo.type === 'multipoint') {
        data.geo_type = 'multipoint';
        data.project_pins = JSON.stringify(geo.points);
      }
      data.submitted = new Date().toISOString();

      var btn = formEl.querySelector('.wch-submit-btn');
      btn.disabled = true;
      var origText = btn.textContent;
      btn.textContent = 'Submitting\u2026';

      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) {
          if (!r.ok) throw new Error('Status ' + r.status);
          // Full form reset + top-of-form success banner + scroll to top
          resetFormFully(formEl, geoKey, msgId);
          showTopMsg(formEl, 'success', successMsg);
        })
        .catch(function () {
          showMsg(msgId, 'error', 'Submission failed. Please try again or contact the Clerk directly at 715-686-2123.');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = origText;
        });
    });
  }

  // ---- Form enhancements: road list, placeholders, defaults, pre-fill ----
  // Adds Winchester's canonical town + county road list to the three road
  // dropdowns; sets better placeholder text; pre-fills city/state/zip/zoning
  // defaults for the Driveway form; and (with opt-in) remembers applicant
  // info across form sessions via localStorage.
  (function formEnhancements() {

    // ==== Canonical road list ====
    // Source: WisDOT R-03 Certified Mileage List for Town of Winchester (Vilas County)
    // https://trust.dot.state.wi.us/ftp/dtim/bshp/counties/63-Vilas/R-03/R-03-63-028-CY2021.pdf
    // 60 town-jurisdiction (Local) roads + 4 County Trunk Highways (CTH J/K/O/W).
    var TOWN_ROADS = [
      '1st St', '2nd St', '3rd St', 'Adelaide Rd', 'Agony Point Rd',
      'Arlen Rd', 'Barrs Rd', 'W Bay Rd', 'Birch Bay Rd', 'E Birch Lake Rd',
      'W Birch Lake Rd', 'Black Forest Rd', 'Bruette Rd', 'Bucks Rd',
      'Burnell Rd', 'Chicago Ave', 'Circle Lilly Rd', 'E Circle Lily Rd',
      'Harris Lake Rd', 'E Harris Lake Rd', 'W Harris Lake Rd', 'Harvey Lake Rd',
      'Haskins Rd', 'Hiawatha Lake Rd', 'Hiawatha Rd', 'Island View Rd',
      'Keppler Rd', 'Kling Rd', 'Lakeshore Rd', 'Lake St', 'Lake Yolanda Rd',
      'Little Papoose Lake Rd', 'Logan Blvd', 'Mud Lake Rd', 'Mueller Ln',
      'No Mans Rd', 'Noseeum Rd', 'Old Hwy O', 'Old Hwy W', 'Papoose Lake Rd',
      'Papoose Landing Rd', 'S Rainbow Lake Rd', 'Rita Ln', 'E Rock Lake Rd',
      'W Rock Lake Rd', 'Silver Blvd', 'N Star Rd', 'Streebe Rd', 'Sunset Rd',
      'Tillman Rd', 'TN RD 10', 'TN RD 45', "Tony's Blvd", 'Town Shed Rd',
      'Townsite Rd', 'Trails End Rd', 'N Turtle Dr', 'S Turtle Dr',
      'S Turtle Lake Rd', 'Vinge Rd'
    ];
    var COUNTY_ROADS = ['CTH J', 'CTH K', 'CTH O', 'CTH W'];

    function populateRoad(selectId) {
      var sel = document.getElementById(selectId);
      if (!sel) return;
      var currentValue = sel.value; // preserve if any (page re-render safety)
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      // Placeholder
      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = 'Select the road\u2026';
      sel.appendChild(ph);
      // Town roads grouped
      var townGroup = document.createElement('optgroup');
      townGroup.label = 'Town Roads';
      TOWN_ROADS.forEach(function (r) {
        var o = document.createElement('option');
        o.value = r;
        o.textContent = r;
        townGroup.appendChild(o);
      });
      sel.appendChild(townGroup);
      // County roads (data-county="1" triggers existing lockout / warning logic)
      var countyGroup = document.createElement('optgroup');
      countyGroup.label = 'County Roads';
      COUNTY_ROADS.forEach(function (r) {
        var o = document.createElement('option');
        o.value = r;
        o.textContent = r;
        o.setAttribute('data-county', '1');
        countyGroup.appendChild(o);
      });
      sel.appendChild(countyGroup);
      // Other
      var otherGroup = document.createElement('optgroup');
      otherGroup.label = 'Not listed';
      var otherOpt = document.createElement('option');
      otherOpt.value = 'Other Town road';
      otherOpt.textContent = "Other Town road (specify in 'additional info' section)";
      otherGroup.appendChild(otherOpt);
      sel.appendChild(otherGroup);
      // Restore selection if it existed
      if (currentValue) sel.value = currentValue;
    }
    ['row-road', 'dw-road', 'rc-road'].forEach(populateRoad);

    // ==== Placeholder improvements ====
    var PLACEHOLDERS = {
      // ROW
      'row-title':      'e.g., "Pole replacement on CTH W"',
      'row-sow':        'Describe what work will be done and why',
      'row-address':    'Nearest street address (e.g., 5230 CTH W)',
      'row-org':        'Company or property owner (leave blank if individual)',
      'row-applicant':  'Your full name',
      'row-phone':      '715-555-0100',
      'row-email':      'you@example.com',
      'row-pubname':    'On-site contact name',
      'row-pubphone':   '715-555-0100',
      // DW
      'dw-name':        'Your full name',
      'dw-address':     '1234 CTH W',
      'dw-phone':       '715-555-0100',
      'dw-email':       'you@example.com',
      'dw-parcel':      '28-XXXX (Vilas County parcel format)',
      'dw-width':       'Driveway width in feet (e.g., 12)',
      // RC
      'rc-title':       'Project name',
      'rc-sow':         'Describe the project scope',
      'rc-org':         'Organization name',
      'rc-contact':     'Your full name',
      'rc-phone':       '715-555-0100',
      'rc-email':       'you@example.com',
      'rc-pubname':     'Someone the public can call with questions',
      'rc-pubphone':    '715-555-0100'
    };
    Object.keys(PLACEHOLDERS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.placeholder = PLACEHOLDERS[id];
    });

    // ==== Cross-form pre-fill via localStorage (opt-in) ====
    // Maps a shared "prefill key" to the list of form field IDs that share
    // that value across forms. When user opts in and submits, values for
    // these keys are saved to localStorage; on next page load, matching
    // empty fields are pre-populated.
    var STORAGE_KEY = 'wch-permit-prefill-v1';
    var CROSS_FORM_FIELDS = [
      ['name',        ['row-applicant', 'dw-name', 'rc-contact']],
      ['phone',       ['row-phone', 'dw-phone', 'rc-phone']],
      ['email',       ['row-email', 'dw-email', 'rc-email']],
      ['org',         ['row-org', 'rc-org']],
      ['mail_addr',   ['dw-address']],
      ['city',        ['dw-city']],
      ['state',       ['dw-state']],
      ['zip',         ['dw-zip']],
      ['pubname',     ['row-pubname', 'rc-pubname']],
      ['pubphone',    ['row-pubphone', 'rc-pubphone']]
    ];

    function loadPrefill() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) || {}) : {};
      } catch (e) { return {}; }
    }
    function savePrefill(data) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
    }

    // Apply saved prefill first (only fills EMPTY fields)
    var prefillData = loadPrefill();
    CROSS_FORM_FIELDS.forEach(function (entry) {
      var val = prefillData[entry[0]];
      if (!val) return;
      entry[1].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && !el.value) el.value = val;
      });
    });

    // ==== Default values for Driveway form (applied after prefill) ====
    // If a field is still empty after prefill, apply Winchester-defaults.
    // Users who live outside Winchester (e.g., seasonal cabin owners) can
    // overwrite these manually.
    var DEFAULTS = {
      'dw-city':    'Winchester',
      'dw-state':   'WI',
      'dw-zip':     '54557',
      'dw-zoning':  'Residential'
    };
    Object.keys(DEFAULTS).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      // For selects: match option by value/text and select it. For inputs: set value.
      if (el.tagName === 'SELECT') {
        if (!el.value) {
          for (var i = 0; i < el.options.length; i++) {
            var opt = el.options[i];
            if ((opt.value || '').toLowerCase() === DEFAULTS[id].toLowerCase() ||
                (opt.textContent || '').trim().toLowerCase() === DEFAULTS[id].toLowerCase()) {
              el.selectedIndex = i;
              break;
            }
          }
        }
      } else if (!el.value) {
        el.value = DEFAULTS[id];
      }
    });

    // ==== Opt-in checkbox + save-on-submit ====
    function addRememberCheckbox(formId, prefix) {
      var form = document.getElementById(formId);
      if (!form) return;
      if (document.getElementById(prefix + '-remember')) return; // already added
      var submitBtn = form.querySelector('.wch-submit-btn');
      if (!submitBtn) return;

      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin:14px 0 10px 0; font-size:13px; color:#555;';

      // Row 1: checkbox + main label text, vertically centered together
      var row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:8px;';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = prefix + '-remember';
      cb.style.cssText = 'margin:0; flex-shrink:0;';
      var label = document.createElement('label');
      label.setAttribute('for', prefix + '-remember');
      label.style.cssText = 'cursor:pointer; margin:0; line-height:1.2;';
      label.textContent = 'Remember my info for next time';
      row.appendChild(cb);
      row.appendChild(label);

      // Row 2: hint text below, indented to align with label
      var hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px; color:#888; margin-top:4px; margin-left:24px; font-style:italic;';
      hint.textContent = 'Only use this on your personal device.';

      wrap.appendChild(row);
      wrap.appendChild(hint);
      submitBtn.parentNode.insertBefore(wrap, submitBtn);
    }
    addRememberCheckbox('wch-form-row', 'row');
    addRememberCheckbox('wch-form-driveway', 'dw');
    addRememberCheckbox('wch-form-roadcon', 'rc');

    function attachSaveOnSubmit(formId, prefix) {
      var form = document.getElementById(formId);
      if (!form) return;
      form.addEventListener('submit', function () {
        var cb = document.getElementById(prefix + '-remember');
        if (!cb || !cb.checked) return;
        var current = loadPrefill();
        CROSS_FORM_FIELDS.forEach(function (entry) {
          entry[1].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.value) current[entry[0]] = el.value;
          });
        });
        savePrefill(current);
      });
    }
    attachSaveOnSubmit('wch-form-row', 'row');
    attachSaveOnSubmit('wch-form-driveway', 'dw');
    attachSaveOnSubmit('wch-form-roadcon', 'rc');

    // ==== Rewrite driveway ordinance link to the latest version ====
    // The BB page may contain outdated links to a prior driveway ordinance PDF.
    // Find any anchor whose href references an "Ordinance" file with "Driveway"
    // in the URL and rewrite to the current version. This lets us bump ordinance
    // links from JS without touching BB modules.
    (function updateOrdinanceLinks() {
      var NEW_URL = 'https://winchesterwi.com/wp-content/uploads/2026/08/Ordinance_2026-01_Driveway_20260820.pdf';
      document.querySelectorAll('a[href]').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        // Match anything that looks like a driveway ordinance PDF hosted on the site
        if (/Ordinance.*Driveway.*\.pdf/i.test(href) || /Driveway.*Ordinance.*\.pdf/i.test(href)) {
          a.setAttribute('href', NEW_URL);
        }
      });
    })();

    // ==== Group contractor name + phone into a single row ====
    // BB may render these as two separate stacked rows. Wrap the two
    // (label + input) pairs in a shared 2-column grid so they display
    // side-by-side. No-op if either field is missing.
    (function pairContractorFields() {
      var nameEl = document.getElementById('dw-contractor') ||
                   document.querySelector('input[name="contractor"]');
      var phoneEl = document.getElementById('dw-contractor-phone') ||
                    document.querySelector('input[name="contractor_phone"]');
      if (!nameEl || !phoneEl) return;
      // Skip if already grouped
      if (nameEl.closest('.wch-contractor-pair')) return;
      // Find each field's label (preceding sibling <label>) and container row
      function labelFor(input) {
        var id = input.id;
        return id ? document.querySelector('label[for="' + id + '"]') : null;
      }
      var nameLabel = labelFor(nameEl);
      var phoneLabel = labelFor(phoneEl);
      if (!nameLabel || !phoneLabel) return;
      // Build sub-columns for each field
      function buildColumn(label, input) {
        var col = document.createElement('div');
        col.style.cssText = 'display:flex; flex-direction:column; min-width:0;';
        col.appendChild(label);
        col.appendChild(input);
        return col;
      }
      // Insert wrapper before the first (name) label, then move both pairs into it
      var wrapper = document.createElement('div');
      wrapper.className = 'wch-contractor-pair';
      wrapper.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:16px 0 0 0;';
      nameLabel.parentNode.insertBefore(wrapper, nameLabel);
      wrapper.appendChild(buildColumn(nameLabel, nameEl));
      wrapper.appendChild(buildColumn(phoneLabel, phoneEl));
      // Reset any inherited top-margin on the labels so grid alignment is clean
      nameLabel.style.marginTop = '0';
      phoneLabel.style.marginTop = '0';
    })();
  })();

  // ---- Wire up ROW form ----
  var rowForm = document.getElementById('wch-form-row');
  if (rowForm) {
    submitForm(rowForm, 'row', 'row-msg', [
      ['row-type', 'type of work'], ['row-title', 'project title'], ['row-road', 'road'],
      ['row-sow', 'description'], ['row-address', 'property address'],
      ['row-start', 'start date'], ['row-end', 'end date'],
      ['row-traffic', 'traffic impact'],
      ['row-org', 'company or owner'], ['row-applicant', 'your name'],
      ['row-phone', 'phone'], ['row-email', 'email'],
      ['row-pubname', 'on-site contact name'], ['row-pubphone', 'on-site contact phone'],
      ['row-sig', 'signature'], ['row-sigdate', 'date']
    ], 'row_ack',
    'Application received. The Town Clerk will confirm receipt and advise the meeting date at which your application will be considered.');
  }

  // ---- Wire up Driveway form ----
  var dwForm = document.getElementById('wch-form-driveway');
  if (dwForm) {
    submitForm(dwForm, 'dw', 'dw-msg', [
      ['dw-name', 'full name'], ['dw-address', 'mailing address'],
      ['dw-city', 'city'], ['dw-state', 'state'], ['dw-zip', 'ZIP'],
      ['dw-phone', 'phone'], ['dw-email', 'email'],
      ['dw-parcel', 'property address or parcel'], ['dw-road', 'road'],
      ['dw-access-to', 'access to'], ['dw-surface', 'surface material'], ['dw-width', 'driveway width'],
      ['dw-sig', 'signature'], ['dw-sigdate', 'date']
    ], 'dw_ack',
    'Driveway permit application received. The Town Clerk will confirm receipt and advise the meeting date at which your application will be considered. ' +
    'A $100 non-refundable fee is due with this application \u2014 <a href="https://connect.intuit.com/pay/Winchester/scs-v1-36a2f2555b2d440c960bc969f42bcecdb6967870cccc407b91e01d00ec801d6a6b0a30687b5648029a36b7fc34cd2314-0?locale=EN_US&cta=copylistmultilink" target="_blank" rel="noopener" style="color:#00505A">pay online here</a> or pay by check/cash.');
  }

  // ---- Wire up Road Construction form ----
  var rcForm = document.getElementById('wch-form-roadcon');
  if (rcForm) {
    submitForm(rcForm, 'rc', 'rc-msg', [
      ['rc-type', 'type of work'], ['rc-title', 'project title'], ['rc-road', 'road(s)'],
      ['rc-sow', 'description'], ['rc-start', 'start date'], ['rc-end', 'end date'],
      ['rc-traffic', 'traffic impact'],
      ['rc-org', 'organization'], ['rc-contact', 'contact name'],
      ['rc-phone', 'phone'], ['rc-email', 'email'],
      ['rc-pubname', 'public contact'], ['rc-pubphone', 'public contact phone'],
      ['rc-sig', 'signature'], ['rc-sigdate', 'date']
    ], 'rc_ack',
    'Road construction project submitted. The Town Clerk will review and respond with next steps.');
  }
})();


// ---- Permits page: collapsible sections & permit list ----
(function () {
  var COLLAPSED = [
    'fl-node-bow2p310ghfc', // Who Issues the Permit?
    'fl-node-rhlmdeuagscf', // Driveway Permits
    'fl-node-k6rc35aytwu4', // Right-of-Way & Utility Permits
    'fl-node-df6qvkp5cju0'  // Emergency Work
  ];

  function isEyebrow(el) {
    if (!el || /^H[1-6]$/.test(el.tagName)) return false;
    var t = el.textContent.trim();
    return t.length > 0 && t.length < 60 && t === t.toUpperCase();
  }

  function wrapAccordion(mod) {
    if (!mod || mod.getAttribute('data-wch-acc')) return;
    var content = mod.querySelector('.fl-module-content') || mod;
    if (!content) return;
    var h = content.querySelector('h2, h3');
    if (!h) return;
    mod.setAttribute('data-wch-acc', '1');

    var eyeEl = h.previousElementSibling;
    var eyeTxt = isEyebrow(eyeEl) ? eyeEl.textContent.trim() : '';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wch-acc-toggle';
    btn.setAttribute('aria-expanded', 'false');
    if (eyeTxt) {
      var e = document.createElement('span');
      e.className = 'wch-acc-eyebrow';
      e.textContent = eyeTxt;
      btn.appendChild(e);
    }
    var t = document.createElement('span');
    t.className = 'wch-acc-title';
    t.textContent = h.textContent.trim();
    btn.appendChild(t);

    var body = document.createElement('div');
    body.className = 'wch-acc-body';
    while (content.firstChild) body.appendChild(content.firstChild);

    if (eyeTxt && eyeEl) eyeEl.style.display = 'none';
    h.style.display = 'none';

    content.appendChild(btn);
    content.appendChild(body);

    btn.addEventListener('click', function () {
      var open = body.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function buildSections() {
    // Hardcoded module IDs (kept for backward compat)
    COLLAPSED.forEach(function (cls) {
      wrapAccordion(document.querySelector('.' + cls));
    });
    // Anything marked with wch-collapsible class works too
    document.querySelectorAll('.wch-collapsible').forEach(wrapAccordion);
  }

  function locationOf(details) {
    var n = details.childNodes, i, j, out;
    for (i = 0; i < n.length; i++) {
      if (n[i].nodeType === 1 && n[i].tagName === 'B' && /^location/i.test(n[i].textContent.trim())) {
        out = '';
        for (j = i + 1; j < n.length; j++) {
          if (n[j].nodeType === 1 && (n[j].tagName === 'BR' || n[j].tagName === 'B')) break;
          out += n[j].textContent;
        }
        return out.trim();
      }
    }
    return '';
  }

  function buildList() {
    var list = document.getElementById('winchester-row-list');
    if (!list) return;

    [].slice.call(list.children).forEach(function (card) {
      if (card.getAttribute('data-wch-acc')) return;
      var head = card.children[0], details = card.children[1];
      if (!head || !details) return;
      card.setAttribute('data-wch-acc', '1');

      var loc = locationOf(details);
      var titleEl = head.querySelector('div div');
      if (titleEl && loc) {
        var original = titleEl.textContent.trim();
        titleEl.textContent = loc;
        if (original) {
          details.insertBefore(document.createElement('br'), details.firstChild);
          details.insertBefore(document.createTextNode(' ' + original), details.firstChild);
          var b = document.createElement('b');
          b.textContent = 'Permit:';
          details.insertBefore(b, details.firstChild);
        }
      }

      card.className += ' wch-permit-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-expanded', 'false');
      details.className += ' wch-permit-details';

      function toggle() {
        var open = details.classList.toggle('is-open');
        card.setAttribute('aria-expanded', open ? 'true' : 'false');
        // Zoom the map to fit this project when the card is opened.
        // (Don't zoom on close — that would jarringly re-center after collapse.)
        if (open) {
          var pid = card.getAttribute('data-permit-id');
          if (pid) {
            document.dispatchEvent(new CustomEvent('wch:zoomToPermit', { detail: pid }));
          }
        }
      }
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });
    });
  }

  function init() {
    buildSections();
    var list = document.getElementById('winchester-row-list');
    if (!list) return;
    buildList();
    new MutationObserver(buildList).observe(list, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


// ---- Smooth in-page jumps ----
(function () {
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;

    ev.preventDefault();

    var body = target.closest ? target.closest('.wch-acc-body') : null;
    if (body && !body.classList.contains('is-open')) {
      body.classList.add('is-open');
      var btn = body.previousElementSibling;
      if (btn && btn.classList.contains('wch-acc-toggle')) {
        btn.setAttribute('aria-expanded', 'true');
      }
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });
})();

/* ==========================================================================
   Permit form email guard: Town of Winchester (/permits/)
   --------------------------------------------------------------------------
   Why: the three permit forms use `novalidate`, so the browser never checks
   the email format. On 9/25/2026 a ROW application arrived with
   "name@company.com - Permit Agent" in the email box. Make's router rejected
   it and it never reached the tracker.

   What this does (applies to all three forms: ROW, Driveway, Road Construction):
     1. Format check, using the SAME pattern as the Make router filter,
        so anything the form accepts, Make also accepts.
     2. Catches common domain typos (gmial.com, yahoo.con, ...) and offers
        a one-click fix.
     3. Checks that the email's domain has a mail server (DNS MX lookup via
        dns.google). If the lookup itself fails (network hiccup), it does NOT
        block the applicant; only a definite "no mail server" blocks.
   It runs before the existing submit handler and only stops the submission
   when the email is bad. Nothing else about the forms changes.

   Install: paste at the very END of the existing permits JS in
   Simple Custom CSS and JS (after everything else), save, clear the
   Beaver Builder cache.
   ========================================================================== */
(function wchPermitEmailGuard() {
  'use strict';

  // Keep this identical to the Make router filter on all three routes.
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var EMAIL_FIND_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

  var FORM_IDS = ['wch-form-row', 'wch-form-driveway', 'wch-form-roadcon'];
  var CLERK_PHONE = '715-686-2123';

  var TYPOS = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com',
    'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
    'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com',
    'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com',
    'icloud.co': 'icloud.com', 'icloud.con': 'icloud.com', 'aol.co': 'aol.com', 'aol.con': 'aol.com'
  };

  var domainCache = {}; // domain -> Promise<'ok'|'bad'|'unknown'>

  function checkDomain(domain) {
    domain = domain.toLowerCase();
    if (domainCache[domain]) return domainCache[domain];
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
    var p = fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX',
                  ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return 'unknown';
        if (j.Status === 3) return 'bad';               // domain does not exist
        if (j.Status !== 0) return 'unknown';           // DNS server trouble: don't block
        var mx = (j.Answer || []).filter(function (a) { return a.type === 15; });
        if (!mx.length) return 'bad';                   // domain exists but takes no email
        if (mx.length === 1 && /^0\s+\.$/.test(String(mx[0].data).trim())) return 'bad'; // "null MX"
        return 'ok';
      })
      .catch(function () { return 'unknown'; })         // offline, blocked, timed out: don't block
      .then(function (res) { clearTimeout(timer); return res; });
    domainCache[domain] = p;
    return p;
  }

  // Resolves to null when OK, or { msg, fix } when the email should be blocked.
  function validate(value) {
    var v = (value || '').trim();
    if (!v) return Promise.resolve(null); // empty: the existing "Required" check handles it

    if (!EMAIL_RE.test(v)) {
      var found = v.match(EMAIL_FIND_RE);
      return Promise.resolve({
        msg: 'Enter only an email address, like name@company.com. Please leave out names, titles, or other text.',
        fix: found ? found[0] : null
      });
    }

    var at = v.lastIndexOf('@');
    var local = v.slice(0, at);
    var domain = v.slice(at + 1).toLowerCase();

    if (v.indexOf('..') !== -1 || domain.charAt(0) === '.' || domain.charAt(0) === '-') {
      return Promise.resolve({ msg: 'That email address doesn\'t look right. Please double-check it.', fix: null });
    }

    if (TYPOS[domain]) {
      return Promise.resolve({
        msg: 'That domain looks like a typo.',
        fix: local + '@' + TYPOS[domain]
      });
    }

    return checkDomain(domain).then(function (res) {
      if (res === 'bad') {
        return {
          msg: 'We couldn\'t find a mail server for "' + domain + '". Please double-check the address. ' +
               'If it is correct, call the Clerk at ' + CLERK_PHONE + '.',
          fix: null
        };
      }
      return null; // 'ok' or 'unknown' (fail open)
    });
  }

  function errBox(input) {
    var id = input.id + '-email-err';
    var box = document.getElementById(id);
    if (!box) {
      box = document.createElement('div');
      box.id = id;
      box.setAttribute('role', 'alert');
      box.setAttribute('aria-live', 'polite');
      box.style.cssText = 'display:none;margin:6px 0 0 !important;padding:8px 10px !important;' +
        'background:#FCEBEB;border-left:3px solid #A32D2D;color:#A32D2D;' +
        'font-size:14px !important;line-height:1.4 !important;border-radius:4px;';
      input.insertAdjacentElement('afterend', box);
      input.setAttribute('aria-describedby',
        ((input.getAttribute('aria-describedby') || '') + ' ' + id).trim());
    }
    return box;
  }

  function showErr(input, problem) {
    var box = errBox(input);
    box.textContent = problem.msg + ' ';
    if (problem.fix) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Use ' + problem.fix;
      btn.style.cssText = 'margin-left:4px;padding:2px 8px !important;font-size:14px !important;' +
        'background:#fff;border:1px solid #A32D2D;color:#A32D2D;border-radius:4px;cursor:pointer;';
      btn.addEventListener('click', function () {
        input.value = problem.fix;
        clearErr(input);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
      });
      box.appendChild(btn);
    }
    box.style.display = 'block';
    input.setAttribute('aria-invalid', 'true');
    input.style.borderColor = '#A32D2D';
  }

  function clearErr(input) {
    var box = document.getElementById(input.id + '-email-err');
    if (box) { box.style.display = 'none'; box.textContent = ''; }
    input.removeAttribute('aria-invalid');
    input.style.borderColor = '';
  }

  function wire(form) {
    if (!form || form.dataset.wchEmailGuard) return;
    var input = form.querySelector('input[name="email"]');
    if (!input) return;
    form.dataset.wchEmailGuard = '1';

    // Check when the applicant leaves the field
    input.addEventListener('change', function () {
      var value = input.value;
      validate(value).then(function (problem) {
        if (input.value !== value) return; // they kept typing
        if (problem) showErr(input, problem); else clearErr(input);
      });
    });
    input.addEventListener('input', function () { clearErr(input); });

    // Gate the submit. Capture phase on the form runs before the existing handler.
    form.addEventListener('submit', function (e) {
      if (form.dataset.wchEmailPassed === '1') { // second pass after a successful check
        delete form.dataset.wchEmailPassed;
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      var btn = form.querySelector('.wch-submit-btn');
      if (btn) btn.disabled = true;
      validate(input.value).then(function (problem) {
        if (btn) btn.disabled = false;
        if (problem) {
          showErr(input, problem);
          input.focus();
          if (input.scrollIntoView) input.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
        clearErr(input);
        form.dataset.wchEmailPassed = '1';
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      });
    }, true);
  }

  function init() { FORM_IDS.forEach(function (id) { wire(document.getElementById(id)); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
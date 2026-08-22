/* Winchester WI — All Site JS
   Replace existing JS with this single file
   Set to: Footer */

// ── Weather + Search Bar ────────────────────────────────
(function () {
  function initWeather() {
    var searchModule = document.querySelector('.fl-node-zux34r6blifm');
    if (!searchModule) return;
    if (document.getElementById('ww-weather-row')) return;

    var row = document.createElement('div');
    row.id = 'ww-weather-row';

    var weatherWidget = document.createElement('div');
    weatherWidget.id = 'ww-weather-widget';
    weatherWidget.innerHTML = '<span class="ww-weather-loading">Loading…</span>';

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

        if (cl.includes('thunder'))                                     icon = '\u26C8\uFE0F';
        else if (cl.includes('snow') || cl.includes('blizzard'))        icon = '\u2744\uFE0F';
        else if (cl.includes('rain') || cl.includes('shower') || cl.includes('drizzle')) icon = '\uD83C\uDF27\uFE0F';
        else if (cl.includes('fog'))                                     icon = '\uD83C\uDF2B\uFE0F';
        else if (cl.includes('clear') || cl.includes('sunny'))          icon = '\u2600\uFE0F';
        else if (cl.includes('mostly sunny') || cl.includes('mostly clear')) icon = '\uD83C\uDF24\uFE0F';
        else if (cl.includes('partly'))                                  icon = '\u26C5';
        else if (cl.includes('cloud') || cl.includes('overcast'))       icon = '\u2601\uFE0F';
        else if (cl.includes('wind'))                                    icon = '\uD83D\uDCA8';

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


// ── Calendar Filters ─────────────────────────────────────
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


// ── Mobile Header: fire danger label + hamburger icon ────
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


// ── ROW Permit Map ──────────────────────────────────────
(function () {
  var el = document.getElementById('winchester-row-map');
  if (!el) return;

  var DATA_URL = 'https://winclerk.github.io/permits.json';
  var HALL = { lat: 46.21196, lng: -89.88619 };
  var COLORS = { proposed: '#B8952E', upcoming: '#2B7BA8', active: '#D97A1F', complete: '#2D8A56' };
  var LABELS = { proposed: 'Pending', upcoming: 'Approved', active: 'Active', complete: 'Complete' };

  function loadCSS(url) {
    if (document.querySelector('link[href="' + url + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url;
    document.head.appendChild(l);
  }
  function loadJS(url, cb) {
    if (window.L) { cb(); return; }
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

  /* HTML-escape using charCodes */
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
    if (p.status === 'proposed') return 'proposed';
    var t = d0(), s = pd(p.startDate), e = pd(p.endDate);
    if (t < s) return 'upcoming'; if (t > e) return 'complete'; return 'active';
  }
  function visible(p) {
    if (p.status === 'denied' || p.status === 'withdrawn') return false;
    if (statusOf(p) === 'complete') return (d0() - pd(p.endDate)) / 864e5 <= 90;
    return true;
  }

  function initMap() {
    var map = L.map('winchester-row-map', { scrollWheelZoom: false }).setView([46.2250, -89.8850], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00A9 OpenStreetMap contributors', maxZoom: 18
    }).addTo(map);
    map.on('click', function () { map.scrollWheelZoom.enable(); });

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
    layer.clearLayers();
    var pts = [[HALL.lat, HALL.lng]];
    var shown = jobs.filter(visible);

    shown.forEach(function (p) {
      var s = statusOf(p), info = p.jurisdiction && p.jurisdiction !== 'town';
      var shape;

      if (p.geoType === 'line' && p.coordinates && p.coordinates.length > 1) {
        shape = L.polyline(p.coordinates, {
          color: info ? '#999999' : COLORS[s],
          weight: s === 'active' ? 7 : 5,
          opacity: 0.85,
          lineCap: 'round', lineJoin: 'round',
          dashArray: s === 'proposed' ? '10,8' : null
        });
        [p.coordinates[0], p.coordinates[p.coordinates.length - 1]].forEach(function (pt) {
          L.circleMarker(pt, {
            radius: 5, fillColor: info ? '#ffffff' : COLORS[s],
            color: '#ffffff', weight: 2, fillOpacity: 1
          }).addTo(layer);
          pts.push(pt);
        });
        p.coordinates.forEach(function (pt) { pts.push(pt); });
      } else {
        shape = L.circleMarker([p.lat, p.lng], {
          radius: s === 'active' ? 10 : 8,
          fillColor: info ? '#ffffff' : COLORS[s],
          color: info ? '#999999' : '#ffffff',
          weight: info ? 3 : 2, fillOpacity: .92
        });
      }

      shape.bindPopup(
        '<div style="font-family:Noto Sans,sans-serif;min-width:220px">' +
        '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:3px 9px;border-radius:3px;background:' +
          ({ active: '#FEF0E1', upcoming: '#E3F0F7', complete: '#E1F5EA', proposed: '#FDF5E1' }[s] || '#f5f5f5') +
          ';color:' + COLORS[s] + '">' + esc(LABELS[s]) + '</span>' +
        '<div style="font-weight:700;color:#193C3C;margin:7px 0 2px;font-size:14px">' + esc(p.title) + '</div>' +
        '<div style="font-size:11px;color:#999;margin-bottom:8px">' + esc(p.org) + '</div>' +
        '<div style="font-size:12px;color:#555;line-height:1.7">' +
          '<b>Location:</b> ' + esc(p.location) + '<br>' +
          '<b>Dates:</b> ' + fmt(p.startDate) + ' \u2013 ' + fmt(p.endDate) +
          (p.geoType === 'line' ? '<br><b>Extent:</b> route shown on map' : '') +
          (p.traffic ? '<br><b>Traffic:</b> ' + esc(p.traffic) : '') +
        '</div>' +
        (p.contactName ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #E8E8E8;font-size:11px;color:#555">' +
          '<b>On-site contact:</b> ' + esc(p.contactName) + (p.contactPhone ? ' \u00B7 ' + esc(p.contactPhone) : '') + '</div>' : '') +
        (info ? '<div style="margin-top:7px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#A59664;font-weight:700">' + esc(p.jurisdiction) + ' project</div>' : '') +
        '</div>'
      );
      shape.addTo(layer);
      if (!(p.geoType === 'line' && p.coordinates && p.coordinates.length > 1)) {
        pts.push([p.lat, p.lng]);
      }
    });

    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [45, 45], maxZoom: 12 });

    /* Stat bar */
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

    /* Permit list */
    var list = document.getElementById('winchester-row-list');
    if (!shown.length) {
      list.innerHTML = '<p style="text-align:center;color:#999;padding:32px 0;font-size:14px">No permitted work currently on record.</p>';
      return;
    }
    var order = { active: 0, upcoming: 1, proposed: 2, complete: 3 };
    list.innerHTML = shown.slice().sort(function (a, b) { return order[statusOf(a)] - order[statusOf(b)]; }).map(function (p) {
      var s = statusOf(p), info = p.jurisdiction && p.jurisdiction !== 'town';
      var bc = COLORS[s] || '#D4D4D4';
      var bgc = { active: '#FEF0E1', upcoming: '#E3F0F7', complete: '#E1F5EA', proposed: '#FDF5E1' }[s] || '#f5f5f5';
      return '<div style="border:1px solid #E8E8E8;border-radius:6px;padding:16px 18px;margin-bottom:10px;border-left:4px solid ' + bc + ';background:#fff">' +
        '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;padding-right:24px">' +
        '<div><div style="font-weight:700;font-size:14px;color:#193C3C">' + esc(p.title) + '</div>' +
        '<div style="font-size:12px;color:#555;margin-top:2px">' + esc(p.org) + '</div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:3px 9px;border-radius:3px;background:' + bgc + ';color:' + bc + '">' + esc(LABELS[s]) + '</span>' +
        (info ? '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:3px 9px;border-radius:3px;background:#E6F0F1;color:#00505A">' + esc(p.jurisdiction) + '</span>' : '') +
        '</div></div>' +
        '<div style="display:flex;gap:16px;margin-top:9px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="flex:1 1 320px;font-size:12px;color:#555;line-height:1.7;min-width:0">' +
        '<b style="color:#2A2A2A">Location:</b> ' + esc(p.location) + '<br>' +
        '<b style="color:#2A2A2A">Dates:</b> ' + fmt(p.startDate) + ' \u2013 ' + fmt(p.endDate) +
        (p.traffic ? '<br><b style="color:#2A2A2A">Traffic:</b> ' + esc(p.traffic) : '') +
        (p.contactName ? '<br><b style="color:#2A2A2A">Contact:</b> ' + esc(p.contactName) + (p.contactPhone ? ' \u00B7 ' + esc(p.contactPhone) : '') : '') +
        '</div>' +
        (p.pdfUrl ? '<a href="https://winclerk.github.io' + esc(p.pdfUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="flex:0 0 auto;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 18px;background:#A59664;color:#fff;border-radius:4px;text-decoration:none;font-family:\'Noto Sans\',sans-serif;text-align:center;line-height:1.3;min-width:130px">' +
          '<span style="font-size:9px;text-transform:uppercase;letter-spacing:1px;opacity:.85;margin-bottom:3px">Permit Record</span>' +
          '<span style="font-size:13px;font-weight:600">View PDF</span>' +
        '</a>' : '') +
        '</div></div>';
    }).join('');
  }
})();


// ── ROW Permit Application Form ─────────────────────────
(function () {
  var form = document.getElementById('wch-permit-form');
  if (!form) return;

  var WEBHOOK_URL = 'https://hook.us2.make.com/gatf2jagb2qfxkmczko6gugq2qx80uxr';
  var HALL = { lat: 46.21196, lng: -89.88619 };

  function loadCSS(url) {
    if (document.querySelector('link[href="' + url + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url;
    document.head.appendChild(l);
  }
  function loadJS(url, cb) {
    var s = document.createElement('script'); s.src = url; s.onload = cb;
    s.onerror = function () {
      document.getElementById('app-map').innerHTML =
        '<p style="text-align:center;padding:40px;color:#999">Map could not load. Refresh the page.</p>';
    };
    document.head.appendChild(s);
  }

  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css');

  function boot() {
    if (window.L && window.L.Draw) { initMap(); return; }
    if (window.L && !window.L.Draw) {
      loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js', initMap);
      return;
    }
    loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', function () {
      loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js', initMap);
    });
  }
  boot();

  var map, drawnItems, currentMode = 'pin', geoData = null;

  function initMap() {
    map = L.map('app-map', { scrollWheelZoom: true }).setView([46.2250, -89.8850], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00A9 OpenStreetMap contributors', maxZoom: 18
    }).addTo(map);

    L.marker([HALL.lat, HALL.lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:12px;height:12px;background:#193C3C;border:2px solid #fff"></div>',
        iconSize: [12, 12], iconAnchor: [6, 6]
      })
    }).addTo(map).bindTooltip('Town Hall');

    drawnItems = new L.FeatureGroup().addTo(map);

    map.on('click', function (e) {
      if (currentMode !== 'pin') return;
      drawnItems.clearLayers();
      L.circleMarker(e.latlng, {
        radius: 9, fillColor: '#A59664', color: '#fff', weight: 2, fillOpacity: 0.95
      }).addTo(drawnItems);
      geoData = { type: 'point', lat: e.latlng.lat, lng: e.latlng.lng };
      updateReadout();
    });

    var lineDrawer = new L.Draw.Polyline(map, {
      shapeOptions: { color: '#00505A', weight: 4, opacity: 0.8 }
    });

    map.on(L.Draw.Event.CREATED, function (e) {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      var coords = e.layer.getLatLngs().map(function (ll) { return [ll.lat, ll.lng]; });
      geoData = { type: 'line', coordinates: coords };
      updateReadout();
    });

    var btns = document.querySelectorAll('#map-mode-btns .map-mode-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentMode = btn.getAttribute('data-mode');
        drawnItems.clearLayers();
        geoData = null;
        updateReadout();
        if (currentMode === 'line') { lineDrawer.enable(); }
        else { lineDrawer.disable(); }
      });
    });

    setTimeout(function () { map.invalidateSize(); }, 500);
  }

  function updateReadout() {
    var readout = document.getElementById('map-readout');
    if (!geoData) {
      readout.textContent = currentMode === 'pin'
        ? 'No location selected \u2014 click the map to drop a pin.'
        : 'No route drawn \u2014 click the map to start, double-click to finish.';
      return;
    }
    if (geoData.type === 'point') {
      readout.textContent = 'Pin set \u2014 ' + geoData.lat.toFixed(5) + ', ' + geoData.lng.toFixed(5);
    } else {
      readout.textContent = 'Route drawn \u2014 ' + geoData.coordinates.length + ' points';
    }
  }

  var typeSelect = document.getElementById('app-type');
  var roadSelect = document.getElementById('app-road');
  var secDriveway = document.getElementById('sec-driveway');
  var secUtility = document.getElementById('sec-utility');
  var secEmergency = document.getElementById('sec-emergency');
  var countyRedirect = document.getElementById('county-redirect');

  var DRIVEWAY_TYPES = ['New driveway', 'Driveway reconstruction', 'Driveway reroute',
    'Driveway slope alteration', 'Temporary driveway'];
  var UTILITY_TYPES = ['Buried utility \u2014 mainline', 'Buried utility \u2014 service lateral',
    'Overhead utility', 'Road crossing / bore', 'Utility maintenance / repair',
    'Ditch / drainage / grading', 'Vegetation / tree removal',
    'Temporary use / obstruction'];

  typeSelect.addEventListener('change', function () {
    var v = typeSelect.value;
    secDriveway.className = DRIVEWAY_TYPES.indexOf(v) >= 0 ? 'cond show' : 'cond';
    secUtility.className = UTILITY_TYPES.indexOf(v) >= 0 ? 'cond show' : 'cond';
    secEmergency.className = v === 'Emergency repair' ? 'cond show' : 'cond';
    if (DRIVEWAY_TYPES.indexOf(v) >= 0) { setMapMode('pin'); }
    else if (UTILITY_TYPES.indexOf(v) >= 0) { setMapMode('line'); }
  });

  function setMapMode(mode) {
    currentMode = mode;
    var btns = document.querySelectorAll('#map-mode-btns .map-mode-btn');
    btns.forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    if (drawnItems) drawnItems.clearLayers();
    geoData = null;
    updateReadout();
  }

  roadSelect.addEventListener('change', function () {
    var opt = roadSelect.options[roadSelect.selectedIndex];
    var isCounty = opt.getAttribute('data-county') === '1';
    countyRedirect.className = isCounty ? 'note warn show' : '';
    countyRedirect.style.display = isCounty ? 'block' : 'none';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var required = [
      ['app-type', 'type of work'], ['app-title', 'project name'], ['app-road', 'road'],
      ['app-sow', 'description'], ['app-address', 'property address'],
      ['app-start', 'start date'], ['app-end', 'end date'],
      ['app-org', 'company or owner'], ['app-applicant', 'your name'],
      ['app-phone', 'phone'], ['app-email', 'email'],
      ['app-pub-name', 'public contact name'], ['app-pub-phone', 'public contact phone'],
      ['app-sig', 'signature'], ['app-sigdate', 'date']
    ];
    var missing = required.filter(function (r) { return !document.getElementById(r[0]).value.trim(); });
    if (missing.length) {
      showMsg('error', 'Required: ' + missing.slice(0, 3).map(function (m) { return m[1]; }).join(', ') +
        (missing.length > 3 ? ' and ' + (missing.length - 3) + ' more' : ''));
      document.getElementById(missing[0][0]).focus();
      return;
    }

    if (!geoData) {
      showMsg('error', 'Mark the work location on the map \u2014 ' +
        (currentMode === 'pin' ? 'click to drop a pin.' : 'click to draw the route, double-click to finish.'));
      return;
    }

    var acks = ['ack-1', 'ack-2', 'ack-3', 'ack-4', 'ack-5'];
    var unchecked = acks.filter(function (id) { return !document.getElementById(id).checked; });
    if (unchecked.length) {
      showMsg('error', 'All five acknowledgement boxes must be checked before submitting.');
      return;
    }

    var data = {};
    var fields = form.querySelectorAll('input, select, textarea');
    fields.forEach(function (f) {
      if (f.name && f.value) data[f.name] = f.value.trim();
    });
    data.geo = geoData;
    data.geo_type = geoData ? geoData.type : '';
    data.lat = (geoData && geoData.type === 'point') ? geoData.lat : '';
    data.lng = (geoData && geoData.type === 'point') ? geoData.lng : '';
    data.route_coords = (geoData && geoData.type === 'line') ? JSON.stringify(geoData.coordinates) : '';
    data.submitted = new Date().toISOString();

    var btn = document.getElementById('wch-submit');
    btn.disabled = true;
    btn.textContent = 'Submitting\u2026';

    if (!WEBHOOK_URL) {
      var subject = encodeURIComponent('Permit Application: ' + (data.title || ''));
      var body = encodeURIComponent(Object.keys(data).map(function (k) {
        var v = typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k];
        return k + ': ' + v;
      }).join('\n'));
      window.location.href = 'mailto:clerk@winchester.wi.gov?subject=' + subject + '&body=' + body;
      btn.disabled = false;
      btn.textContent = 'Submit Application';
      showMsg('info', 'Your email client should open with the application. If it does not, email clerk@winchester.wi.gov directly.');
      return;
    }

    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Status ' + r.status);
        form.reset();
        if (drawnItems) drawnItems.clearLayers();
        geoData = null;
        updateReadout();
        secDriveway.className = 'cond';
        secUtility.className = 'cond';
        secEmergency.className = 'cond';
        showMsg('success',
          'Application received. The Town Clerk will confirm receipt and advise the meeting date at which your application will be considered. ' +
          'Driveway permit applications require a $100 non-refundable fee \u2014 pay by check, cash or ' +
          '<a href="https://connect.intuit.com/pay/Winchester/scs-v1-36a2f2555b2d440c960bc969f42bcecdb6967870cccc407b91e01d00ec801d6a6b0a30687b5648029a36b7fc34cd2314-0?locale=EN_US&cta=copylistmultilink" target="_blank" rel="noopener" style="color:#00505A">pay online here</a>.');
      })
      .catch(function () {
        showMsg('error', 'Submission failed. Please try again or contact the Clerk directly at 715-686-2123.');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Submit Application';
      });
  });

  function showMsg(type, html) {
    var msgEl = document.getElementById('wch-form-msg');
    msgEl.style.display = 'block';
    msgEl.style.background = type === 'error' ? '#FCEBEB' : type === 'success' ? '#E1F5EA' : '#E6F0F1';
    msgEl.style.color = type === 'error' ? '#791F1F' : type === 'success' ? '#1a5c34' : '#193C3C';
    msgEl.innerHTML = html;
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  var sigDate = document.getElementById('app-sigdate');
  if (sigDate) sigDate.value = new Date().toISOString().slice(0, 10);
})();


// ── Permits page — collapsible sections & permit list ───
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

  function buildSections() {
    COLLAPSED.forEach(function (cls) {
      var mod = document.querySelector('.' + cls);
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
    });
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


// ── Smooth in-page jumps ────────────────────────────────
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

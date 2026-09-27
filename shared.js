const MEETINGS_JSON = 'data.json';

async function loadData() {
  const res = await fetch(MEETINGS_JSON + '?t=' + Date.now());
  if (!res.ok) throw new Error('Failed to load');
  const data = await res.json();
  window.__portalData = data;
  updateNextDot(data);
  return data;
}

// Inner pages: the next-meeting dot only pulses when the next meeting
// is within 7 calendar days (matches the homepage Town Board tile).
function updateNextDot(data) {
  const dot = document.querySelector('.next-dot');
  if (!dot) return;
  const upcoming = ((data && data.meetings) || []).find(m => m.status === 'upcoming');
  let active = false;
  if (upcoming && upcoming.date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(upcoming.date + 'T00:00:00');
    const daysUntil = Math.round((day - today) / (1000 * 60 * 60 * 24));
    active = daysUntil >= 0 && daysUntil <= 7;
  }
  dot.classList.toggle('active', active);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getIconClass(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return ['icon-pdf', 'PDF'];
  if (['doc', 'docx'].includes(ext)) return ['icon-doc', 'DOC'];
  if (['xls', 'xlsx'].includes(ext)) return ['icon-xlsx', 'XLS'];
  return ['icon-file', ext.toUpperCase() || 'FILE'];
}

function getDocTag(filename) {
  const f = (filename || '').toLowerCase();
  if (f.includes('agenda')) return 'agenda';
  if (f.includes('minutes') || f.includes('minute')) return 'minutes';
  return 'other';
}

function isDraft(filename) {
  return (filename || '').toLowerCase().includes('draft');
}

function meetingTotalDocs(m) {
  const docs = (m.documents || []).length;
  const sfDocs = (m.subfolders || []).reduce((s, sf) => s + (sf.documents || []).length, 0);
  return docs + sfDocs;
}

function renderStatTiles(data, folderDocCount) {
  const upcoming = (data.meetings || []).find(m => m.status === 'upcoming');
  const totalDocs = (data.meetings || []).reduce((sum, m) => sum + meetingTotalDocs(m), 0);

  const nextDate = upcoming ? formatDate(upcoming.date) : 'TBD';
  const nextTime = upcoming ? (upcoming.time || '') : '';
  const nextLoc = upcoming ? (upcoming.location || '') : '';
  const nextSub = [nextTime, nextLoc].filter(Boolean).join(' &middot; ');

  return `
    <div class="stat-tiles">
      <div class="stat-tile stat-tile-accent">
        <div class="stat-label">Next meeting</div>
        <div class="stat-value">${nextDate}</div>
        ${nextSub ? `<div class="stat-sub">${nextSub}</div>` : ''}
      </div>
      <div class="stat-tile">
        <div class="stat-label">Documents here</div>
        <div class="stat-value">${folderDocCount}</div>
        <div class="stat-sub">In this folder</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Total documents</div>
        <div class="stat-value">${totalDocs}</div>
        <div class="stat-sub">Across all meetings</div>
      </div>
    </div>`;
}

function renderFileRow(doc) {
  const [iconClass, iconLabel] = getIconClass(doc.filename);
  const tag = getDocTag(doc.filename);
  const draft = isDraft(doc.filename);
  const dateStr = doc.updated ? `Updated ${formatDateShort(doc.updated)}` : (doc.date ? formatDateShort(doc.date) : '');
  const tagHtml = tag !== 'other' ? `<span class="file-tag tag-${tag}">${tag}</span>` : '';
  const draftHtml = draft ? `<span class="file-tag tag-draft">Draft</span>` : '';

  return `
    <div class="file-row" data-tag="${tag}">
      <div class="file-left">
        <div class="file-icon ${iconClass}">${iconLabel}</div>
        <div class="file-info">
          <div class="file-name">${doc.label || doc.filename}${tagHtml}${draftHtml}</div>
          ${dateStr ? `<div class="file-date">${dateStr}</div>` : ''}
        </div>
      </div>
      <a class="file-view" href="${doc.url}" target="_self">View &rarr;</a>
    </div>`;
}

function filterFiles(tag, el, containerId) {
  el.closest('.filter-bar').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(containerId).querySelectorAll('.file-row').forEach(row => {
    row.style.display = (tag === 'all' || row.dataset.tag === tag) ? '' : 'none';
  });
}

function renderFolderCard(name, meta, count, href) {
  return `
    <a class="folder-card" href="${href}">
      <div class="folder-top">
        <div class="folder-icon-wrap">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A59664" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="folder-name">${name}</div>
      </div>
      <div class="folder-bottom">
        <div class="folder-meta">${meta}</div>
        <div class="folder-count">${count}</div>
        <div class="folder-arrow">View folder &rarr;</div>
      </div>
    </a>`;
}

/* =====================================================================
   Site-wide search
   ---------------------------------------------------------------------
   Adds a search box to the top bar of every portal page (any page whose
   top bar has the .topbar-portal class). It searches:
     - document names, meeting titles, library/folder names and dates
       (from data.json, which every page already loads), and
     - the text inside PDF and Word files (from search-index.json, which
       sync.py builds; it is only downloaded the first time someone
       uses the search box).
   On the homepage all results are listed together. On an inside page,
   results from that page's section are listed first, followed by
   "Also found elsewhere in the portal".
   ===================================================================== */
(function () {
  const SECTION_LABELS = {
    townBoard: 'Town Board',
    boardsCommissions: 'Committees & Commissions',
    governance: 'Governance',
    elections: 'Elections'
  };
  const SECTION_PAGES = {
    governance: 'governance.html',
    elections: 'elections.html'
  };
  const PAGE_SECTIONS = {
    'town-board.html': 'townBoard',
    'meeting.html': 'townBoard',
    'next-meeting.html': 'townBoard',
    'previous-regular.html': 'townBoard',
    'previous-special.html': 'townBoard',
    'governance.html': 'governance',
    'elections.html': 'elections',
    'committees.html': 'boardsCommissions',
    'agendas-minutes.html': 'agendas'
  };
  const INITIAL_SHOWN = 8;

  const S = {
    docs: null,          // built from data.json
    textLoaded: false,
    textLoading: null,
    query: '',
    expanded: {},
    els: {}
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
  }
  function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  function currentSection() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return PAGE_SECTIONS[file] || null;
  }

  function buildDocs(data) {
    const out = [];
    const seen = new Set();
    function add(doc, section, context, contextHref) {
      if (!doc || !doc.url || seen.has(doc.url)) return;
      seen.add(doc.url);
      const dateStr = doc.date ? formatDate(doc.date) : '';
      out.push({
        doc, section, context, contextHref,
        tag: getDocTag(doc.filename),
        name: norm([doc.label, doc.filename, context, SECTION_LABELS[section], dateStr, doc.date].join(' | ')),
        text: ''
      });
    }
    (data.meetings || []).forEach(m => {
      const href = 'meeting.html?id=' + encodeURIComponent(m.id);
      (m.documents || []).forEach(d => add(d, 'townBoard', m.title, href));
      (m.subfolders || []).forEach(sf =>
        (sf.documents || []).forEach(d => add(d, 'townBoard', m.title + ' / ' + sf.name, href)));
    });
    Object.keys(data.sites || {}).forEach(key => {
      (data.sites[key].libraries || []).forEach(lib => {
        const page = SECTION_PAGES[key];
        const href = page ? page + '#lib-' + slug(lib.name) : null;
        (lib.documents || []).forEach(d =>
          add(d, key, lib.name + (d.folder && d.folder !== 'General' ? ' / ' + d.folder : ''), href));
      });
    });
    return out;
  }

  async function ensureDocs() {
    if (S.docs) return;
    const data = window.__portalData || await loadData();
    S.docs = buildDocs(data);
  }

  function ensureText() {
    if (S.textLoaded || S.textLoading) return S.textLoading;
    S.textLoading = fetch('search-index.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(idx => {
        if (idx && idx.docs && S.docs) {
          const byUrl = {};
          idx.docs.forEach(d => { byUrl[d.u] = d.t || ''; });
          S.docs.forEach(d => {
            const t = byUrl[d.doc.url];
            if (t) { d.rawText = t.replace(/\s+/g, ' '); d.text = norm(d.rawText); }
          });
        }
      })
      .catch(() => {})
      .then(() => { S.textLoaded = true; S.textLoading = null; });
    return S.textLoading;
  }

  function terms(q) {
    return norm(q).split(' ').map(t => t.replace(/^[^\w]+|[^\w]+$/g, '')).filter(t => t.length >= 2);
  }

  function countOf(hay, t, cap) {
    let n = 0, i = hay.indexOf(t);
    while (i !== -1 && n < cap) { n++; i = hay.indexOf(t, i + t.length); }
    return n;
  }

  function score(d, ts, phrase) {
    let s = 0;
    for (const t of ts) {
      const inName = d.name.indexOf(t) !== -1;
      const inText = d.text && d.text.indexOf(t) !== -1;
      if (!inName && !inText) return 0;
      if (inName) s += 10;
      if (inText) s += 1 + countOf(d.text, t, 10) / 2;
    }
    if (ts.length > 1) {
      if (d.name.indexOf(phrase) !== -1) s += 15;
      else if (d.text && d.text.indexOf(phrase) !== -1) s += 8;
    }
    return s;
  }

  function highlight(text, ts) {
    const parts = ts.slice().sort((a, b) => b.length - a.length)
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!parts.length) return esc(text);
    const re = new RegExp('(' + parts.join('|') + ')', 'gi');
    return String(text).split(re).map((piece, i) => (i % 2 ? '<mark>' + esc(piece) + '</mark>' : esc(piece))).join('');
  }

  function snippet(d, ts, phrase) {
    if (!d.text) return '';
    let pos = ts.length > 1 ? d.text.indexOf(phrase) : -1;
    if (pos === -1) {
      for (const t of ts) { const p = d.text.indexOf(t); if (p !== -1 && (pos === -1 || p < pos)) pos = p; }
    }
    if (pos === -1) return '';
    let start = Math.max(0, pos - 70), end = Math.min(d.rawText.length, pos + 150);
    if (start > 0) { const sp = d.rawText.indexOf(' ', start); if (sp !== -1 && sp < pos) start = sp + 1; }
    if (end < d.rawText.length) { const sp = d.rawText.lastIndexOf(' ', end); if (sp > pos) end = sp; }
    return (start > 0 ? '&hellip;' : '') + highlight(d.rawText.slice(start, end), ts) + (end < d.rawText.length ? '&hellip;' : '');
  }

  function renderResult(r, ts, phrase) {
    const d = r.d, doc = d.doc;
    const [iconClass, iconLabel] = getIconClass(doc.filename);
    const draft = isDraft(doc.filename) ? '<span class="file-tag tag-draft">Draft</span>' : '';
    const tag = d.tag !== 'other' ? `<span class="file-tag tag-${d.tag}">${d.tag}</span>` : '';
    const ctx = d.contextHref
      ? `<a href="${esc(d.contextHref)}">${esc(d.context)}</a>`
      : esc(d.context);
    const date = doc.date ? ' &middot; ' + formatDateShort(doc.date) : '';
    const snip = snippet(d, ts, phrase);
    return `
      <div class="ps-result">
        <div class="file-icon ${iconClass}">${iconLabel}</div>
        <div class="ps-result-body">
          <a class="ps-result-title" href="${esc(doc.url)}">${highlight(doc.label || doc.filename, ts)}</a>${tag}${draft}
          <div class="ps-result-meta"><span class="ps-chip">${esc(SECTION_LABELS[d.section] || '')}</span>${ctx}${date}</div>
          ${snip ? `<div class="ps-snippet">${snip}</div>` : ''}
        </div>
      </div>`;
  }

  function renderGroup(key, title, list, ts, phrase) {
    if (!list.length) return '';
    const shown = S.expanded[key] ? list : list.slice(0, INITIAL_SHOWN);
    const more = list.length > shown.length
      ? `<button type="button" class="ps-more" data-group="${key}">Show all ${list.length}</button>` : '';
    return `
      <div class="ps-group">
        <div class="ps-group-title">${esc(title)} <span>${list.length}</span></div>
        ${shown.map(r => renderResult(r, ts, phrase)).join('')}
        ${more}
      </div>`;
  }

  function run() {
    const panelBody = S.els.body;
    const q = S.query.trim();
    const ts = terms(q);
    if (!ts.length) { closePanel(); return; }
    openPanel();
    if (!S.docs) { panelBody.innerHTML = '<div class="ps-status">Loading&hellip;</div>'; return; }

    const phrase = ts.join(' ');
    const results = [];
    S.docs.forEach(d => { const s = score(d, ts, phrase); if (s) results.push({ d, s }); });
    results.sort((a, b) => b.s - a.s || String(b.d.doc.date || '').localeCompare(String(a.d.doc.date || '')));

    const sec = currentSection();
    const inSection = r => sec === 'agendas' ? (r.d.tag !== 'other') : r.d.section === sec;
    const secTitle = sec === 'agendas' ? 'In agendas & minutes' : 'In ' + (SECTION_LABELS[sec] || 'this section');

    const note = S.textLoaded ? '' : '<div class="ps-status ps-status-inline">Searching names now; document text is still loading&hellip;</div>';
    let html = `<div class="ps-summary" role="status">${results.length} result${results.length !== 1 ? 's' : ''} for &ldquo;${esc(q)}&rdquo;</div>${note}`;

    if (!results.length) {
      html += `<div class="ps-empty">No documents match. Try fewer words or a different spelling.<br>Scanned documents can only be found by their name.</div>`;
    } else if (sec) {
      const mine = results.filter(inSection);
      const rest = results.filter(r => !inSection(r));
      html += mine.length
        ? renderGroup('here', secTitle, mine, ts, phrase)
        : `<div class="ps-group"><div class="ps-group-title">${esc(secTitle)} <span>0</span></div><div class="ps-empty ps-empty-sm">No matches on this page.</div></div>`;
      html += renderGroup('else', 'Also found elsewhere in the portal', rest, ts, phrase);
    } else {
      html += renderGroup('all', 'All records', results, ts, phrase);
    }
    panelBody.innerHTML = html;
  }

  let timer = null;
  function onInput() {
    S.query = S.els.input.value;
    S.expanded = {};
    S.els.clear.hidden = !S.query;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await ensureDocs().catch(() => {});
      run();
      const p = ensureText();
      if (p) p.then(() => { if (S.query.trim()) run(); });
    }, 120);
  }

  function positionPanel() {
    const bar = document.querySelector('.topbar-portal');
    const top = bar ? bar.getBoundingClientRect().bottom : 64;
    S.els.panel.style.top = Math.max(0, top) + 8 + 'px';
    S.els.panel.style.maxHeight = `calc(100vh - ${Math.max(0, top) + 24}px)`;
  }
  function openPanel() {
    if (!S.els.panel.hidden) return;
    positionPanel();
    S.els.panel.hidden = false;
    S.els.backdrop.hidden = false;
    S.els.input.setAttribute('aria-expanded', 'true');
  }
  function closePanel() {
    S.els.panel.hidden = true;
    S.els.backdrop.hidden = true;
    S.els.input.setAttribute('aria-expanded', 'false');
  }
  function clearSearch() {
    S.els.input.value = '';
    S.query = '';
    S.els.clear.hidden = true;
    closePanel();
  }

  function mount() {
    const bar = document.querySelector('.topbar-portal');
    if (!bar || bar.querySelector('.portal-search')) return;

    const form = document.createElement('form');
    form.className = 'portal-search';
    form.setAttribute('role', 'search');
    form.innerHTML = `
      <button type="button" class="ps-open" aria-label="Search records">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      </button>
      <div class="ps-field">
        <svg class="ps-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="search" class="ps-input" placeholder="Search records" aria-label="Search all records"
               autocomplete="off" spellcheck="false" aria-controls="ps-panel" aria-expanded="false">
        <button type="button" class="ps-clear" aria-label="Clear search" hidden>&times;</button>
        <button type="button" class="ps-close" aria-label="Close search">Cancel</button>
      </div>`;
    const links = bar.querySelector('.topbar-links');
    bar.insertBefore(form, links || null);

    const backdrop = document.createElement('div');
    backdrop.className = 'ps-backdrop';
    backdrop.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'ps-panel';
    panel.id = 'ps-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Search results');
    panel.innerHTML = '<div class="ps-body"></div>';
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    S.els = {
      form, backdrop, panel,
      body: panel.querySelector('.ps-body'),
      input: form.querySelector('.ps-input'),
      clear: form.querySelector('.ps-clear')
    };

    form.addEventListener('submit', e => { e.preventDefault(); onInput(); });
    S.els.input.addEventListener('input', onInput);
    S.els.input.addEventListener('focus', () => {
      ensureDocs().then(ensureText).catch(() => {});
      if (S.query.trim()) openPanel();
    });
    S.els.clear.addEventListener('click', () => { clearSearch(); S.els.input.focus(); });
    form.querySelector('.ps-open').addEventListener('click', () => {
      bar.classList.add('ps-mobile-open');
      S.els.input.focus();
    });
    form.querySelector('.ps-close').addEventListener('click', () => {
      clearSearch();
      bar.classList.remove('ps-mobile-open');
    });
    backdrop.addEventListener('click', closePanel);
    panel.addEventListener('click', e => {
      const more = e.target.closest('.ps-more');
      if (more) { S.expanded[more.dataset.group] = true; run(); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!S.els.panel.hidden) { closePanel(); S.els.input.focus(); }
        else if (S.query) clearSearch();
        bar.classList.remove('ps-mobile-open');
      } else if (e.key === '/' && !/^(input|textarea|select)$/i.test((e.target.tagName || ''))) {
        e.preventDefault();
        S.els.input.focus();
      }
    });
    window.addEventListener('resize', () => { if (!S.els.panel.hidden) positionPanel(); });
    window.addEventListener('scroll', () => { if (!S.els.panel.hidden) positionPanel(); }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

const MEETINGS_JSON = 'data.json';

// Arrow used in every View / Watch button: a drawn icon instead of the
// "\u2192" text character, so it is centered and the same in every font.
const BTN_ARROW = '<svg class="btn-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"/></svg>';

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
  const name = filename || '';
  // A file uploaded without an extension would otherwise show its whole
  // name inside the icon; treat it as a generic file.
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!ext || ext.length > 5) return ['icon-file', 'FILE'];
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

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Document type, read from the filename prefix before the first underscore
// ("Map_...", "Letter_...", "Resolution_..."). A leading "SUPERSEDED-" is
// ignored. Each type belongs to a color family (shared.css .type-<family>),
// so a Letter is the same color on every page of the portal. Files without
// a recognized prefix get no type tag, except older agenda/minutes files,
// which keep the Agenda/Minutes tag they always had.
const DOC_TYPES = {
  'agenda':        ['Agenda', 'agenda'],
  'minutes':       ['Minutes', 'minutes'],
  'ordinance':     ['Ordinance', 'legal'],
  'resolution':    ['Resolution', 'legal'],
  'policy':        ['Policy', 'legal'],
  'report':        ['Report', 'finance'],
  'statement':     ['Statement', 'finance'],
  'disbursements': ['Disbursements', 'finance'],
  'fee-schedule':  ['Fee Schedule', 'finance'],
  'quote':         ['Quote', 'finance'],
  'letter':        ['Letter', 'corresp'],
  'email':         ['Email', 'corresp'],
  'memo':          ['Memo', 'corresp'],
  'comm':          ['Communication', 'corresp'],
  'notice':        ['Notice', 'notice'],
  'form':          ['Form', 'notice'],
  'permit':        ['Permit', 'notice'],
  'affidavit':     ['Affidavit', 'notice'],
  'handbook':      ['Handbook', 'ref'],
  'guide':         ['Guide', 'ref'],
  'pocket-guide':  ['Pocket Guide', 'ref'],
  'proposal':      ['Proposal', 'ref'],
  'map':           ['Map', 'ref']
};

function getDocType(filename) {
  const m = /^(?:SUPERSEDED-)?([A-Za-z-]+)_/i.exec(filename || '');
  const t = m && DOC_TYPES[m[1].toLowerCase()];
  if (t) return { label: t[0], family: t[1] };
  const tag = getDocTag(filename);
  if (tag === 'agenda') return { label: 'Agenda', family: 'agenda' };
  if (tag === 'minutes') return { label: 'Minutes', family: 'minutes' };
  return null;
}

function typeTagHtml(filename) {
  const t = getDocType(filename);
  return t ? `<span class="file-tag type-${t.family}">${t.label}</span>` : '';
}

// Type + Draft tags. Every page shows them in one place: on the line under
// the file title, after the date.
function docTagsHtml(filename) {
  return typeTagHtml(filename) + (isDraft(filename) ? '<span class="file-tag tag-draft">Draft</span>' : '');
}

// File title for display. The Draft tag already says it, so a draft's
// title drops "(Draft)" or a standalone "DRAFT" word.
function docLabel(doc) {
  let label = doc.label || doc.filename || '';
  if (isDraft(doc.filename)) {
    const cleaned = label.replace(/\s*\(draft\)/ig, '').replace(/(^|[\s_-])draft(?=$|[\s_-])/ig, '$1')
      .replace(/\s{2,}/g, ' ').replace(/\s+-\s*$/, '').trim();
    if (cleaned) label = cleaned;
  }
  return label;
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
  // Opens the Next Meeting folder page, except on that page itself.
  const onNextPage = /next-meeting\.html$/.test(window.location.pathname);
  const nextInner = `
        <div class="stat-label">Next meeting</div>
        <div class="stat-value">${nextDate}</div>
        ${nextSub ? `<div class="stat-sub">${nextSub}</div>` : ''}`;
  const nextTile = upcoming && !onNextPage
    ? `<a class="stat-tile stat-tile-accent stat-tile-link" href="next-meeting.html">${nextInner}</a>`
    : `<div class="stat-tile stat-tile-accent">${nextInner}</div>`;

  return `
    <div class="stat-tiles">
      ${nextTile}
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
  const dateStr = doc.updated ? `Updated ${formatDateShort(doc.updated)}` : (doc.date ? formatDateShort(doc.date) : '');
  const dateHtml = dateStr ? `<span class="file-date">${dateStr}</span>` : '';
  const metaHtml = dateHtml + docTagsHtml(doc.filename);
  const label = docLabel(doc);

  return `
    <div class="file-row" data-tag="${tag}">
      <div class="file-left">
        <div class="file-icon ${iconClass}">${iconLabel}</div>
        <div class="file-info">
          <div class="file-name">${label}</div>
          ${metaHtml ? `<div class="file-meta">${metaHtml}</div>` : ''}
        </div>
      </div>
      <a class="file-view" href="${doc.url}" target="_self">View${BTN_ARROW}</a>
    </div>`;
}

// Meeting recordings come from data.json "recordings" (collected by sync.py
// from the Video column on winchesterwi.com). Each is {date, title, url, body}.
const RECORDING_TAG = '<span class="file-tag tag-recording">Recording</span>';

function getRecordings(data, test) {
  return (data.recordings || []).filter(r => r && r.url && (!test || test(r)));
}

function renderRecordingRow(rec, metaHtml) {
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dateStr = rec.date ? formatDateShort(rec.date) : '';
  // The Recording tag sits on the line under the title like every file row.
  // A page passing its own meta line includes the tag in it (RECORDING_TAG).
  const nameHtml = esc(rec.label || rec.title || 'Meeting recording');
  const meta = metaHtml != null
    ? metaHtml
    : `<div class="file-meta">${dateStr ? `<span class="file-date">${dateStr}</span>` : ''}${RECORDING_TAG}</div>`;
  return `
    <div class="file-row" data-tag="recording">
      <div class="file-left">
        <div class="file-icon icon-video">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="file-info">
          <div class="file-name">${nameHtml}</div>
          ${meta}
        </div>
      </div>
      <a class="file-view" href="${esc(rec.url)}" target="_blank" rel="noopener">Watch${BTN_ARROW}</a>
    </div>`;
}

function filterFiles(tag, el, containerId) {
  el.closest('.filter-bar').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const root = document.getElementById(containerId);
  const filtering = tag !== 'all';
  root.querySelectorAll('.file-row').forEach(row => {
    row.style.display = (!filtering || row.dataset.tag === tag) ? '' : 'none';
  });
  const visible = node => Array.from(node.querySelectorAll('.file-row')).filter(r => r.style.display !== 'none').length;

  // Folder sections, inner folder groups and lists with no matching files
  // are hidden while a filter is on, so no empty boxes are left behind.
  if (!root.matches('.file-list')) {
    root.querySelectorAll('.file-list').forEach(list => {
      if (!list.querySelector('.file-row')) return; // empty lists keep their own state
      list.hidden = filtering && visible(list) === 0;
    });
  }
  root.querySelectorAll('.doc-group, .subfolder-section').forEach(g => {
    g.hidden = filtering && visible(g) === 0;
  });
  // Agenda item sections: hide the ones with no matches, open the rest so
  // the matching files are visible, and show the matching count. Clearing
  // the filter puts every section back the way the visitor left it.
  root.querySelectorAll('.agenda-item').forEach(sec => {
    const n = visible(sec);
    sec.hidden = filtering && n === 0;
    const count = sec.querySelector('.agenda-count');
    if (count) count.textContent = docCountText(filtering ? n : Number(sec.dataset.total || 0));
    setAgendaItemOpen(sec, filtering ? true : sec.dataset.userOpen === 'true');
  });
  updateAgendaToggleAll();

  if (!root.matches('.file-list')) {
    let empty = root.querySelector(':scope > .filter-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'file-list filter-empty';
      empty.innerHTML = '<div class="no-docs">No files match this filter.</div>';
      root.prepend(empty);
    }
    empty.hidden = !(filtering && visible(root) === 0);
  }
}

function docCountText(n) {
  return `${n} document${n === 1 ? '' : 's'}`;
}

/* ---------------------------------------------------------------------
   Meeting folders (next-meeting.html, meeting.html)
   ---------------------------------------------------------------------
   When a meeting has folders numbered to match the agenda ("3. Minutes",
   "7. Discussion-Possible Action"), they are shown as collapsible agenda
   item sections in number order, followed by any unnumbered folders
   (e.g. "Financial"). Meetings without numbered folders keep the plain
   folder sections. Files from a folder's own inner folders (sync.py marks
   them with doc.group) are shown as labeled groups inside that folder.
   --------------------------------------------------------------------- */
function splitSectionName(name) {
  const m = /^\s*(\d+)\s*[.)\-]?\s+(\S.*)$/.exec(name || '');
  return m ? { num: m[1], title: m[2].trim() } : { num: '', title: (name || '').trim() };
}

const FOLDER_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

function renderFolderDocs(sf) {
  const docs = sf.documents || [];
  const loose = docs.filter(d => !d.group);
  const order = (sf.groups || []).map(g => g.name);
  docs.forEach(d => { if (d.group && !order.includes(d.group)) order.push(d.group); });

  let html = loose.map(doc => renderFileRow(doc)).join('');
  order.forEach(name => {
    const gDocs = docs.filter(d => d.group === name);
    if (!gDocs.length) return;
    html += `
      <div class="doc-group">
        <div class="doc-group-head">
          ${FOLDER_SVG}
          <span class="doc-group-name">${escHtml(name)}</span>
          <span class="doc-group-count">${docCountText(gDocs.length)}</span>
        </div>
        ${gDocs.map(doc => renderFileRow(doc)).join('')}
      </div>`;
  });
  return html || '<div class="no-docs">No documents in this folder.</div>';
}

function renderMeetingFolders(subfolders) {
  const folders = (subfolders || []).map((sf, i) => Object.assign({ i }, splitSectionName(sf.name), { sf }));
  const accordion = folders.some(f => f.num);

  if (!accordion) {
    const html = folders.map(({ sf }) => {
      const n = (sf.documents || []).length;
      return `
        <div class="subfolder-section">
          <div class="subfolder-header">
            <span class="subfolder-icon">${FOLDER_SVG}</span>
            <span class="subfolder-name">${escHtml(sf.name)}</span>
            <span class="subfolder-count">${docCountText(n)}</span>
          </div>
          <div class="file-list">${renderFolderDocs(sf)}</div>
        </div>`;
    }).join('');
    return { html, accordion: false };
  }

  const numbered = folders.filter(f => f.num).sort((a, b) => (Number(a.num) - Number(b.num)) || (a.i - b.i));
  const others = folders.filter(f => !f.num);
  const html = '<div class="agenda-items">' + numbered.concat(others).map((f, idx) => {
    const n = (f.sf.documents || []).length;
    const badge = f.num
      ? `<span class="agenda-num" aria-hidden="true">${escHtml(f.num)}</span>`
      : `<span class="agenda-num agenda-num-folder" aria-hidden="true">${FOLDER_SVG}</span>`;
    const label = f.num ? `Agenda item ${f.num}: ${f.title}` : f.title;
    return `
      <section class="agenda-item" data-total="${n}" data-user-open="false">
        <h2 class="agenda-item-heading">
          <button type="button" class="agenda-item-toggle" id="agenda-item-btn-${idx}" aria-expanded="false" aria-controls="agenda-item-panel-${idx}" aria-label="${escHtml(label)}" onclick="toggleAgendaItem(this)">
            ${badge}
            <span class="agenda-title">${escHtml(f.title)}</span>
            <span class="agenda-count">${docCountText(n)}</span>
            <svg class="agenda-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </h2>
        <div class="agenda-panel" id="agenda-item-panel-${idx}" role="region" aria-labelledby="agenda-item-btn-${idx}" inert>
          <div class="agenda-panel-inner">
            ${renderFolderDocs(f.sf)}
          </div>
        </div>
      </section>`;
  }).join('') + '</div>';
  return { html, accordion: true };
}

function setAgendaItemOpen(sec, open) {
  const btn = sec.querySelector('.agenda-item-toggle');
  const panel = sec.querySelector('.agenda-panel');
  sec.classList.toggle('open', open);
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (panel) panel.inert = !open;
}

function toggleAgendaItem(btn) {
  const sec = btn.closest('.agenda-item');
  const open = btn.getAttribute('aria-expanded') !== 'true';
  sec.dataset.userOpen = open ? 'true' : 'false';
  setAgendaItemOpen(sec, open);
  updateAgendaToggleAll();
}

function agendaToggleAllHtml() {
  return '<button type="button" class="agenda-toggle-all" onclick="toggleAllAgendaItems()">Expand all</button>';
}

function toggleAllAgendaItems() {
  const secs = Array.from(document.querySelectorAll('.agenda-item:not([hidden])'));
  const open = secs.some(s => !s.classList.contains('open'));
  secs.forEach(s => { s.dataset.userOpen = open ? 'true' : 'false'; setAgendaItemOpen(s, open); });
  updateAgendaToggleAll();
}

function updateAgendaToggleAll() {
  const btn = document.querySelector('.agenda-toggle-all');
  if (!btn) return;
  const secs = Array.from(document.querySelectorAll('.agenda-item:not([hidden])'));
  btn.textContent = secs.length && secs.every(s => s.classList.contains('open')) ? 'Collapse all' : 'Expand all';
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
    boardsCommissions: 'committees.html',
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
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

  const S = {
    open: false,
    lastKeys: '',
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

  function renderResult(r, ts, phrase, i, animate) {
    const d = r.d, doc = d.doc;
    const [iconClass, iconLabel] = getIconClass(doc.filename);
    const tags = docTagsHtml(doc.filename);
    const ctx = d.contextHref
      ? `<a href="${esc(d.contextHref)}">${esc(d.context)}</a>`
      : esc(d.context);
    const date = doc.date ? ' &middot; ' + formatDateShort(doc.date) : '';
    const snip = snippet(d, ts, phrase);
    return `
      <div class="ps-result${animate && i < 6 ? ' ps-enter' : ''}"${animate && i < 6 ? ` style="animation-delay:${i * 25}ms"` : ''}>
        <div class="file-icon ${iconClass}">${iconLabel}</div>
        <div class="ps-result-body">
          <a class="ps-result-title" href="${esc(doc.url)}">${highlight(docLabel(doc), ts)}</a>
          <div class="ps-result-meta"><span class="ps-chip">${esc(SECTION_LABELS[d.section] || '')}</span>${ctx}${date}${tags ? `<span class="tag-group">${tags}</span>` : ''}</div>
          ${snip ? `<div class="ps-snippet">${snip}</div>` : ''}
        </div>
      </div>`;
  }

  function renderGroup(key, title, list, ts, phrase, counter, animate) {
    if (!list.length) return '';
    const shown = S.expanded[key] ? list : list.slice(0, INITIAL_SHOWN);
    const more = list.length > shown.length
      ? `<button type="button" class="ps-more" data-group="${key}">Show all ${list.length}</button>` : '';
    return `
      <div class="ps-group">
        <div class="ps-group-title">${esc(title)} <span>${list.length}</span></div>
        ${shown.map(r => renderResult(r, ts, phrase, counter.i++, animate)).join('')}
        ${more}
      </div>`;
  }

  function run() {
    const panelBody = S.els.body;
    const q = S.query.trim();
    const ts = terms(q);
    if (!ts.length) { closePanel(); return; }
    openPanel();
    if (!S.docs) { setPanelContent('<div class="ps-status">Loading&hellip;</div>'); return; }

    const phrase = ts.join(' ');
    const results = [];
    S.docs.forEach(d => { const s = score(d, ts, phrase); if (s) results.push({ d, s }); });
    results.sort((a, b) => b.s - a.s || String(b.d.doc.date || '').localeCompare(String(a.d.doc.date || '')));

    const sec = currentSection();
    const inSection = r => sec === 'agendas' ? (r.d.tag !== 'other') : r.d.section === sec;
    const secTitle = sec === 'agendas' ? 'In agendas & minutes' : 'In ' + (SECTION_LABELS[sec] || 'this section');

    // Fade the first few rows in only when the set of results actually changes
    const keys = results.slice(0, 12).map(r => r.d.doc.url).join('|');
    const animate = keys !== S.lastKeys;
    S.lastKeys = keys;
    const counter = { i: 0 };

    const note = S.textLoaded ? '' : '<div class="ps-status ps-status-inline">Searching names now; document text is still loading&hellip;</div>';
    let html = `<div class="ps-summary" role="status">${results.length} result${results.length !== 1 ? 's' : ''} for &ldquo;${esc(q)}&rdquo;</div>${note}`;

    if (!results.length) {
      html += `<div class="ps-empty">No documents match. Try fewer words or a different spelling.<br>Scanned documents can only be found by their name.</div>`;
    } else if (sec) {
      const mine = results.filter(inSection);
      const rest = results.filter(r => !inSection(r));
      html += mine.length
        ? renderGroup('here', secTitle, mine, ts, phrase, counter, animate)
        : `<div class="ps-group"><div class="ps-group-title">${esc(secTitle)} <span>0</span></div><div class="ps-empty ps-empty-sm">No matches on this page.</div></div>`;
      html += renderGroup('else', 'Also found elsewhere in the portal', rest, ts, phrase, counter, animate);
    } else {
      html += renderGroup('all', 'All records', results, ts, phrase, counter, animate);
    }
    setPanelContent(html);
  }

  // Swap in new results and let the panel smoothly grow or shrink to fit.
  function setPanelContent(html) {
    const panel = S.els.panel;
    const wasShown = S.open && !S.justOpened && panel.offsetHeight > 0;
    S.justOpened = false;
    const from = wasShown ? panel.offsetHeight : 0;
    S.els.body.innerHTML = html;
    if (!wasShown || REDUCED_MOTION.matches) { panel.style.height = ''; return; }
    panel.style.height = '';
    const to = panel.offsetHeight;
    if (Math.abs(to - from) < 2) return;
    panel.style.height = from + 'px';
    panel.getBoundingClientRect();           // commit the start height
    panel.style.height = to + 'px';
    clearTimeout(S.heightTimer);
    S.heightTimer = setTimeout(() => { panel.style.height = ''; }, 260);
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
    const top = Math.max(0, bar ? bar.getBoundingClientRect().bottom : 64);
    S.els.panel.style.top = top + 8 + 'px';
    S.els.panel.style.maxHeight = `calc(100vh - ${top + 24}px)`;
    // The dimmed layer starts below the top bar, so the search box stays bright.
    S.els.backdrop.style.top = top + 'px';
  }
  function openPanel() {
    if (S.open) return;
    positionPanel();
    S.open = true;
    S.justOpened = true;
    S.els.panel.classList.add('is-open');
    S.els.backdrop.classList.add('is-open');
    S.els.input.setAttribute('aria-expanded', 'true');
  }
  function closePanel() {
    if (!S.open) return;
    S.open = false;
    S.lastKeys = '';
    S.els.panel.style.height = '';
    S.els.panel.classList.remove('is-open');
    S.els.backdrop.classList.remove('is-open');
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
    const panel = document.createElement('div');
    panel.className = 'ps-panel';
    panel.id = 'ps-panel';
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
        if (S.open) { closePanel(); S.els.input.focus(); }
        else if (S.query) clearSearch();
        bar.classList.remove('ps-mobile-open');
      } else if (e.key === '/' && !/^(input|textarea|select)$/i.test((e.target.tagName || ''))) {
        e.preventDefault();
        S.els.input.focus();
      }
    });
    window.addEventListener('resize', () => { if (S.open) positionPanel(); });
    window.addEventListener('scroll', () => { if (S.open) positionPanel(); }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

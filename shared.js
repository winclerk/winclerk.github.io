const MEETINGS_JSON = 'data.json';

async function loadData() {
  const res = await fetch(MEETINGS_JSON + '?t=' + Date.now());
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
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

function renderStatTiles(data, folderDocCount) {
  const upcoming = (data.meetings || []).find(m => m.status === 'upcoming');
  const totalDocs = (data.meetings || []).reduce((sum, m) => sum + (m.documents || []).length, 0);

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

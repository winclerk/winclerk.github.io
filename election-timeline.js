/* ═══════════════════════════════════════════════════════════════
   Election timeline — Town of Winchester Records Portal
   Edit the dates below for future elections. Everything else is
   automatic:
     • Shows from the first milestone through the day before HIDE_ON
     • "You are here" marker moves daily between milestones
     • After Election Day, shows "Election complete" + results link
     • On HIDE_ON (two weeks after the election) it disappears

   Preview any date by adding ?today=YYYY-MM-DD to the page URL,
   e.g. elections.html?today=2026-11-05
   ═══════════════════════════════════════════════════════════════ */

const ELECTION_TIMELINE = {
  title: 'November 3, 2026 General Election',
  hideOn: '2026-11-17',
  resultsUrl: 'https://www.vilascountywi.gov/residents/elections/election_results.php',
  milestones: [
    { date: '2026-09-17', name: 'Absentee Voting Starts',                short: 'Absentee starts' },
    { date: '2026-10-20', name: 'In-Person Absentee Voting Begins',      short: 'In-person opens' },
    { date: '2026-10-30', name: 'Last Day for In-Person Absentee Voting', short: 'Last in-person day' },
    { date: '2026-11-03', name: 'Election Day',                           short: 'Election Day', electionDay: true }
  ]
};

(function () {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function parseDay(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function getToday() {
    const override = new URLSearchParams(window.location.search).get('today');
    if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return parseDay(override);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }
  function shortDate(d) { return `${MONTHS[d.getMonth()]} ${d.getDate()}`; }
  function longDate(d) { return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`; }

  const CHECK_SVG = (size, stroke) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

  // Works out where "today" sits. Milestones are spaced evenly so labels
  // never collide; today is placed proportionally inside its segment.
  function computeState() {
    const cfg = ELECTION_TIMELINE;
    const today = getToday();
    const stops = cfg.milestones.map(m => Object.assign({}, m, { day: parseDay(m.date) }));
    const first = stops[0].day;
    const electionDay = stops[stops.length - 1].day;
    const hideOn = parseDay(cfg.hideOn);

    if (today < first || today >= hideOn) return null;

    const n = stops.length;
    const step = 100 / (n - 1);
    stops.forEach((s, i) => {
      s.pos = i * step;
      s.past = s.day <= today;
    });

    let herePos = 100;
    for (let i = 0; i < n - 1; i++) {
      const a = stops[i].day, b = stops[i + 1].day;
      if (today >= a && today < b) {
        herePos = (i + (today - a) / (b - a)) * step;
        break;
      }
    }

    const complete = today > electionDay;
    const next = stops.find(s => s.day >= today) || null;
    return { cfg, today, stops, herePos, complete, next, isElectionDay: +today === +electionDay };
  }

  /* ── Full timeline (elections.html) ── */
  function renderFull(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const st = computeState();
    if (!st) { el.innerHTML = ''; el.hidden = true; return; }

    const last = st.stops.length - 1;
    const stopsHtml = st.stops.map((s, i) => {
      const cls = ['etl-stop', s.past ? 'is-past' : '', i === 0 ? 'is-first' : '', i === last ? 'is-last' : ''].join(' ').trim();
      const marker = s.electionDay
        ? `<span class="etl-check${st.isElectionDay ? ' is-today' : ''}">${CHECK_SVG(15, 3)}</span>`
        : `<span class="etl-dot"></span>`;
      const status = s.past ? (+s.day === +st.today ? 'today' : 'passed') : 'upcoming';
      return `
        <li class="${cls}" style="--pos:${s.pos}%">
          ${marker}
          <div class="etl-label">
            <div class="etl-date">${shortDate(s.day)}</div>
            <div class="etl-name">${s.name}</div>
            <span class="etl-sr">(${status})</span>
          </div>
        </li>`;
    }).join('');

    const align = st.herePos < 10 ? ' align-left' : (st.herePos > 90 ? ' align-right' : '');
    const hereHtml = (st.complete || st.isElectionDay) ? '' : `
      <li class="etl-here${align}" style="--pos:${st.herePos}%" aria-label="You are here: today, ${longDate(st.today)}">
        <span class="etl-here-tag" aria-hidden="true">You are here<span class="etl-here-date"> &middot; ${shortDate(st.today)}</span></span>
        <span class="etl-here-dot"></span>
      </li>`;

    const footer = st.complete
      ? `
        <div class="etl-complete">
          <div class="etl-complete-text">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 10"/></svg>
            <span><strong>Election complete!</strong> View Vilas County results here.</span>
          </div>
          <a class="etl-complete-btn" href="${st.cfg.resultsUrl}" target="_blank" rel="noopener">See Election Results &rarr;</a>
        </div>`
      : `
        <div class="etl-notice">
          <svg class="etl-notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>
          <div><strong>Election Day notice:</strong> All absentee ballots must be turned in, and any errors corrected (cured), by <strong>8:00 PM on Election Day</strong> to be counted.</div>
        </div>`;

    el.hidden = false;
    el.innerHTML = `
      <div class="section-label">Election timeline</div>
      <div class="etl-card">
        <div class="etl-card-head">
          <div class="etl-card-title">${st.cfg.title}</div>
          <div class="etl-card-sub">${st.complete ? 'Election complete' : (st.isElectionDay ? 'Today is Election Day' : 'Key absentee voting dates')}</div>
        </div>
        <div class="etl-body">
          <ol class="etl-track" style="--fill:${st.herePos}%">
            <li class="etl-line" aria-hidden="true"></li>
            <li class="etl-fill" aria-hidden="true"></li>
            ${stopsHtml}
            ${hereHtml}
          </ol>
        </div>
        ${footer}
      </div>`;
  }

  /* ── Mini timeline (homepage Elections tile) ── */
  function renderMini(bodyId) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const st = computeState();
    if (!st) return; // leave the normal tile description in place

    const dots = st.stops.map(s => s.electionDay
      ? `<span class="etl-mini-check${st.isElectionDay ? ' is-today' : ''}" style="--pos:${s.pos}%">${CHECK_SVG(8, 4)}</span>`
      : `<span class="etl-mini-dot${s.past ? ' is-past' : ''}" style="--pos:${s.pos}%"></span>`
    ).join('');
    const here = (st.complete || st.isElectionDay) ? '' : `<span class="etl-mini-here" style="--pos:${st.herePos}%"></span>`;

    let caption;
    if (st.complete) {
      caption = '<strong>Election complete</strong> &middot; see results';
    } else if (st.isElectionDay) {
      caption = '<strong>Election Day</strong> &middot; ballots due 8 PM';
    } else if (st.next) {
      caption = `Next: <strong>${shortDate(st.next.day)}</strong> &middot; ${st.next.short}`;
    } else {
      caption = '';
    }

    body.classList.add('etl-mini-active');
    body.innerHTML = `
      <div class="etl-mini" role="img" aria-label="Election timeline. ${st.complete ? 'Election complete.' : 'Today is ' + longDate(st.today) + '.'} ${st.next && !st.complete ? 'Next: ' + st.next.name + ', ' + longDate(st.next.day) + '.' : ''}">
        <div class="etl-mini-track" style="--fill:${st.herePos}%">
          <span class="etl-mini-line"></span>
          <span class="etl-mini-fill"></span>
          ${dots}
          ${here}
        </div>
        <div class="etl-mini-caption" aria-hidden="true">${caption}</div>
      </div>`;
  }

  window.ElectionTimeline = { renderFull, renderMini };
})();

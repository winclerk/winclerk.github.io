/* ═══════════════════════════════════════════════════════════════
   Election timeline — Town of Winchester Records Portal
   Fully automatic — nothing to edit before each election:
     • Election Days come from the Wisconsin election calendar below
       (Spring Election every April; Partisan Primary and General
       Election in even-numbered years).
     • Every milestone is counted back from Election Day using the
       same number of days each election (MILESTONES below).
     • The timeline appears on the first milestone (absentee voting
       starts) and disappears two weeks after Election Day.
     • "We are here" moves daily; after Election Day it shows
       "Election complete" + the Vilas County results link.

   Preview any date by adding ?today=YYYY-MM-DD to the page URL,
   e.g. elections.html?today=2026-11-05
   ═══════════════════════════════════════════════════════════════ */

const ELECTION_TIMELINE = {
  resultsUrl: 'https://www.vilascountywi.gov/residents/elections/election_results.php',
  hideAfterDays: 14,          // days after Election Day the timeline stays up
  // Milestones, in days before Election Day (0 = Election Day).
  milestones: [
    { daysBefore: 47, name: 'Absentee Voting Starts',                short: 'Absentee starts' },
    { daysBefore: 14, name: 'In-Person Absentee Voting Begins',      short: 'In-person early voting opens' },
    { daysBefore: 8,  name: 'In-Person Absentee Hours',              short: 'Walk-in 10am\u20131pm', detail: '10:00 AM \u2013 1:00 PM', walkIn: true },
    { daysBefore: 4,  name: 'Last Day for In-Person Absentee Voting', short: 'Last in-person day', lastInPerson: true },
    { daysBefore: 0,  name: 'Election Day',                           short: 'Election Day', electionDay: true }
  ],
  // In-person absentee hours note, shown under the timeline through the
  // last in-person absentee day. {walkIn} becomes the walk-in day's date.
  hoursNote: '<strong>In-person absentee voting:</strong> Walk-in hours are <strong>{walkIn}, 10:00 AM \u2013 1:00 PM</strong> at Winchester Town Hall, or by appointment. Call <a href="tel:+17156862123">(715) 686-2123</a> to schedule.'
};

/* Wisconsin election calendar (shared with elections.html). */
function nthWeekdayOfMonth(year, month, weekday, n) {
  const d = new Date(year, month, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === weekday) {
      count++;
      if (count === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
}

function getWisconsinElections(year) {
  const elections = [
    { name: 'Spring Election', date: nthWeekdayOfMonth(year, 3, 2, 1) }
  ];
  if (year % 2 === 0) {
    elections.push({ name: 'Partisan Primary', date: nthWeekdayOfMonth(year, 7, 2, 2) });
    const firstMonday = nthWeekdayOfMonth(year, 10, 1, 1);
    const general = new Date(firstMonday);
    general.setDate(general.getDate() + 1);
    elections.push({ name: 'General Election', date: general });
  }
  return elections;
}

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
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Picks the election whose window (first milestone through
  // hideAfterDays after Election Day) contains today, if any.
  function currentElection(today) {
    const cfg = ELECTION_TIMELINE;
    const lead = Math.max.apply(null, cfg.milestones.map(m => m.daysBefore));
    const y = today.getFullYear();
    const all = [y - 1, y, y + 1].reduce((list, yr) => list.concat(getWisconsinElections(yr)), []);
    return all.find(e => today >= addDays(e.date, -lead) && today < addDays(e.date, cfg.hideAfterDays)) || null;
  }

  // Works out where "today" sits. Milestones are spaced evenly so labels
  // never collide; today is placed proportionally inside its segment.
  function computeState() {
    const cfg = ELECTION_TIMELINE;
    const today = getToday();
    const election = currentElection(today);
    if (!election) return null;
    const electionDay = election.date;

    const stops = cfg.milestones
      .slice()
      .sort((a, b) => b.daysBefore - a.daysBefore)
      .map(m => Object.assign({}, m, { day: addDays(electionDay, -m.daysBefore) }));

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

    const walkIn = stops.find(s => s.walkIn);
    const lastInPerson = stops.find(s => s.lastInPerson);
    const title = `${MONTHS_LONG[electionDay.getMonth()]} ${electionDay.getDate()}, ${electionDay.getFullYear()} ${election.name}`;
    const hoursNote = walkIn && cfg.hoursNote
      ? cfg.hoursNote.replace('{walkIn}', `${WEEKDAYS[walkIn.day.getDay()]}, ${longDate(walkIn.day)}`)
      : '';

    const complete = today > electionDay;
    const next = stops.find(s => s.day >= today) || null;
    return {
      cfg, today, stops, herePos, complete, next, title, hoursNote,
      hoursNoteUntil: lastInPerson ? lastInPerson.day : electionDay,
      isElectionDay: +today === +electionDay
    };
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
      // Election Day box stays empty until the election is over
      const marker = s.electionDay
        ? `<span class="etl-check${st.isElectionDay ? ' is-today' : ''}${st.complete ? '' : ' is-unchecked'}">${st.complete ? CHECK_SVG(15, 3) : ''}</span>`
        : `<span class="etl-dot"></span>`;
      const status = s.past ? (+s.day === +st.today ? 'today' : 'passed') : 'upcoming';
      return `
        <li class="${cls}" style="--pos:${s.pos}%">
          ${marker}
          <div class="etl-label">
            <div class="etl-date">${shortDate(s.day)}</div>
            <div class="etl-name">${s.name}</div>
            ${s.detail ? `<div class="etl-detail">${s.detail}</div>` : ''}
            <span class="etl-sr">(${status})</span>
          </div>
        </li>`;
    }).join('');

    const align = st.herePos < 10 ? ' align-left' : (st.herePos > 90 ? ' align-right' : '');
    const hereHtml = (st.complete || st.isElectionDay) ? '' : `
      <li class="etl-here${align}" style="--pos:${st.herePos}%" aria-label="We are here: today, ${longDate(st.today)}">
        <span class="etl-here-tag" aria-hidden="true">We are here<span class="etl-here-date"> &middot; ${shortDate(st.today)}</span></span>
        <span class="etl-here-dot"></span>
      </li>`;

    const showHours = !st.complete && st.hoursNote && st.today <= st.hoursNoteUntil;
    const hoursHtml = showHours ? `
        <div class="etl-notice etl-hours">
          <svg class="etl-notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <div>${st.hoursNote}</div>
        </div>` : '';

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
          <div class="etl-card-title">${st.title}</div>
          ${st.complete || st.isElectionDay ? `<div class="etl-card-sub">${st.complete ? 'Election complete' : 'Today is Election Day'}</div>` : ''}
        </div>
        <div class="etl-body">
          <ol class="etl-track" style="--fill:${st.herePos}%">
            <li class="etl-line" aria-hidden="true"></li>
            <li class="etl-fill" aria-hidden="true"></li>
            ${stopsHtml}
            ${hereHtml}
          </ol>
        </div>
        ${hoursHtml}
        ${footer}
      </div>`;
  }

  /* ── Homepage Elections tile: text-only status line ── */
  function renderMini(bodyId) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const st = computeState();
    if (!st) return; // leave the normal tile description in place

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
    body.innerHTML = `<div class="portal-tile-desc etl-mini-caption">${caption}</div>`;
  }

  window.ElectionTimeline = { renderFull, renderMini };
})();

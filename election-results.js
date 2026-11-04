/* ──────────────────────────────────────────────────────────────
   Election results module (elections.html)

   To post a new election: replace the ELECTION_RESULTS object below.
   Everything on the card (turnout, percentages, margins, leaders,
   "by the numbers" facts) is calculated from these numbers.

   Set "status" to "Unofficial" on election night and "Official"
   after the county canvass. Set "showUntil" (YYYY-MM-DD) to hide the
   card automatically, or leave it null to keep it up.
   ────────────────────────────────────────────────────────────── */

const ELECTION_RESULTS = {
  title: 'November 3, 2026 General Election',
  status: 'Unofficial',
  showUntil: null,
  ward: 'Ward 1',

  population: 534,           // WI DOA final Jan 1, 2026 estimate
  votingAgePopulation: 490,  // WI DOA approximate voting-age population (Wis. Stat. 5.66)
  registeredVoters: 447,
  totalVoters: 369,          // highest number on poll list
  provisionalOutstanding: 0,
  pollsOpen: 7,              // polls open 7:00am (24-hour clock)
  pollHours: 13,             // ...until 8:00pm
  absentee: {
    total: 78,
    inPerson: 27             // in-person absentee (early voting at Town Hall)
    // by mail / other = total - inPerson
  },

  source: 'Town of Winchester Ward 1 Election Night Call-In Return Sheet, November 3, 2026.',
  populationSource: 'Population and voting-age estimates: Wisconsin Department of Administration, Demographic Services Center (final January 1, 2026 estimate).',
  partySource: 'Party affiliations from public candidate coverage (Ballotpedia, Wisconsin Examiner, WPR).',
  countyResultsUrl: 'https://www.vilascountywi.gov/residents/elections/election_results.php',

  races: [
    {
      office: 'Governor / Lieutenant Governor',
      candidates: [
        { name: 'Tom Tiffany / David Varnam', party: 'R', votes: 238 },
        { name: 'David Crowley / Sarah Godlewski', party: 'D', votes: 131 }
      ],
      writeIns: [
        ['Ieshuh Griffin', 0], ['Jamie Jo Carothers (Independent)', 0], ['David D. King', 0],
        ['Chad Muellenberg', 0], ['Mary Morgan', 0], ['Mark Grimek', 0], ['Brayden Donnelly', 0],
        ['Christine Kirchmiller', 0], ['Reese Wood / Daniel Wagner', 0], ['Scattering', 0]
      ]
    },
    {
      office: 'Attorney General',
      candidates: [
        { name: 'Eric Toney', party: 'R', votes: 231 },
        { name: 'Josh Kaul', party: 'D', votes: 136 }
      ],
      writeIns: [['Scattering', 0]]
    },
    {
      office: 'Secretary of State',
      candidates: [
        { name: 'Jay Schroeder', party: 'R', votes: 232 },
        { name: 'JoCasta Zamarripa', party: 'D', votes: 126 },
        { name: 'Pete Karas', party: 'G', votes: 5 }
      ],
      writeIns: [['Michael Chianese', 0], ['Scattering', 0]]
    },
    {
      office: 'State Treasurer',
      candidates: [
        { name: 'John S. Leiber', party: 'R', votes: 234 },
        { name: 'Yee Leng Xiong', party: 'D', votes: 127 }
      ],
      writeIns: [['Joseph Kexel', 0], ['Scattering', 1]]
    }
  ]
};

const ElectionResults = (function () {
  const PARTIES = {
    R: { label: 'Republican', color: 'var(--er-rep)' },
    D: { label: 'Democratic', color: 'var(--er-dem)' },
    G: { label: 'Wisconsin Green', color: 'var(--er-grn)' },
    I: { label: 'Independent', color: 'var(--er-other)' }
  };
  const OTHER_COLOR = 'var(--er-other)';
  const METHOD_COLORS = ['var(--td)', 'var(--gold)', '#7fa3a6'];

  let mode = 'votes';

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (n, d, digits = 1) => (d ? (100 * n / d) : 0).toFixed(digits) + '%';
  const sum = arr => arr.reduce((s, n) => s + n, 0);

  function raceStats(r) {
    const writeInTotal = sum(r.writeIns.map(w => w[1]));
    const total = sum(r.candidates.map(c => c.votes)) + writeInTotal;
    const sorted = [...r.candidates].sort((a, b) => b.votes - a.votes);
    const margin = sorted[0].votes - (sorted[1] ? sorted[1].votes : 0);
    return { writeInTotal, total, leader: sorted[0], margin, marginPts: total ? 100 * margin / total : 0 };
  }

  function oneInN(part, whole) {
    if (!part) return '';
    const n = Math.round(whole / part);
    return n >= 2 ? `About 1 in ${n} voters` : '';
  }

  /* ── Sections ── */

  /* ── Geometry helpers for the SVG charts ── */
  function polar(cx, cy, r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arcPath(cx, cy, r, startDeg, endDeg) {
    const [x1, y1] = polar(cx, cy, r, startDeg);
    const [x2, y2] = polar(cx, cy, r, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  /* Turnout: three concentric rings */
  function turnoutViz(d) {
    const rings = [
      { label: 'Registered voters who voted', n: d.totalVoters, of: d.registeredVoters, color: 'var(--td)',
        detail: `${d.totalVoters} of ${d.registeredVoters} registered` },
      { label: 'Voting-age residents who voted', n: d.totalVoters, of: d.votingAgePopulation, color: 'var(--tm)',
        detail: `${d.totalVoters} of about ${d.votingAgePopulation} adults` },
      { label: 'Voting-age residents registered', n: d.registeredVoters, of: d.votingAgePopulation, color: 'var(--gold)',
        detail: `${d.registeredVoters} of about ${d.votingAgePopulation} adults` }
    ].filter(r => r.of);
    const size = 220, c = size / 2, stroke = 14, gap = 6;
    const svgRings = rings.map((r, i) => {
      const radius = c - stroke / 2 - 2 - i * (stroke + gap);
      const C = 2 * Math.PI * radius;
      const frac = Math.min(r.n / r.of, 1);
      return `
        <circle class="er-ring-track" cx="${c}" cy="${c}" r="${radius}" style="stroke-width:${stroke}"></circle>
        <circle class="er-ring-value" cx="${c}" cy="${c}" r="${radius}" style="stroke:${r.color};stroke-width:${stroke}"
          stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" data-target="${(C * (1 - frac)).toFixed(2)}"></circle>`;
    }).join('');

    return `
      <section class="er-viz">
        <div class="er-block-title">Turnout</div>
        <div class="er-viz-body">
          <div class="er-rings" role="img" aria-label="${rings.map(r => `${r.label}: ${pct(r.n, r.of)}`).join('; ')}">
            <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${svgRings}</svg>
            <div class="er-rings-center" aria-hidden="true">
              <div class="er-rings-num">${d.totalVoters}</div>
              <div class="er-rings-sub">voters</div>
            </div>
          </div>
          <ul class="er-ring-legend">
            ${rings.map(r => `
              <li>
                <span class="er-swatch er-swatch-round" style="background:${r.color}"></span>
                <div>
                  <div class="er-ring-legend-pct">${pct(r.n, r.of)}</div>
                  <div class="er-ring-legend-label">${r.label}</div>
                  <div class="er-ring-legend-detail">${r.detail}</div>
                </div>
              </li>`).join('')}
          </ul>
        </div>
        ${d.population ? `<p class="er-viz-note">Winchester has about ${d.population} residents; roughly ${d.votingAgePopulation} are 18 or older (state estimate).</p>` : ''}
      </section>`;
  }

  /* Election Day pace: a 270° gauge, one segment per hour the polls were open */
  function paceViz(d) {
    const electionDay = d.totalVoters - d.absentee.total;
    const hours = d.pollHours;
    const perHour = electionDay / hours;
    const minutesEach = Math.round(60 / perHour);
    const size = 220, c = size / 2, r = 86, sweep = 270, startA = -135, segGap = 2.2;
    const step = sweep / hours;
    const segs = Array.from({ length: hours }, (_, i) => {
      const a0 = startA + i * step + segGap / 2;
      const a1 = startA + (i + 1) * step - segGap / 2;
      return `<path class="er-pace-seg" d="${arcPath(c, c, r, a0, a1)}" style="transition-delay:${i * 45}ms"></path>`;
    }).join('');
    const openHour = d.pollsOpen || 7;
    const labelAt = (h, text) => {
      const [x, y] = polar(c, c, r + 22, startA + (h - openHour) * step);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="er-pace-tick" text-anchor="middle" dominant-baseline="middle">${text}</text>`;
    };

    return `
      <section class="er-viz">
        <div class="er-block-title">Election Day pace</div>
        <div class="er-viz-body er-viz-body-center">
          <div class="er-pace" role="img" aria-label="About ${Math.round(perHour)} voters per hour: ${electionDay} Election Day voters over ${hours} hours">
            <svg viewBox="-14 -6 ${size + 28} ${size + 4}" aria-hidden="true">
              ${segs}
              ${labelAt(openHour, '7 AM')}
              ${labelAt(12, 'Noon')}
              ${labelAt(openHour + hours, '8 PM')}
            </svg>
            <div class="er-pace-center" aria-hidden="true">
              <div class="er-rings-num">~${Math.round(perHour)}</div>
              <div class="er-rings-sub">voters per hour</div>
            </div>
          </div>
        </div>
        <p class="er-viz-note">${electionDay} people voted at Town Hall over ${hours} hours, about one every ${minutesEach} minutes on average.</p>
      </section>`;
  }

  function methodBlock(d) {
    const byMail = d.absentee.total - d.absentee.inPerson;
    const electionDay = d.totalVoters - d.absentee.total;
    const methods = [
      { name: 'In person on Election Day', n: electionDay },
      { name: 'In-person absentee (early voting)', n: d.absentee.inPerson },
      { name: 'Absentee by mail', n: byMail }
    ];
    return `
      <div class="er-block">
        <div class="er-block-title">How Winchester voted</div>
        <p class="er-method-lead"><strong>${d.totalVoters} residents</strong> cast a ballot. ${oneInN(d.absentee.total, d.totalVoters) ? oneInN(d.absentee.total, d.totalVoters) + ' voted absentee' : ''} (${pct(d.absentee.total, d.totalVoters)}), and ${pct(electionDay, d.totalVoters)} voted at Town Hall on Election Day.</p>
        <div class="er-stack" role="img" aria-label="${methods.map(m => `${m.name}: ${m.n}`).join(', ')}">
          ${methods.map((m, i) => `<div class="er-stack-seg" style="background:${METHOD_COLORS[i]}" data-target="${(100 * m.n / d.totalVoters).toFixed(2)}%"></div>`).join('')}
        </div>
        <ul class="er-method-list">
          ${methods.map((m, i) => `
            <li>
              <span class="er-swatch" style="background:${METHOD_COLORS[i]}"></span>
              <div>
                <div class="er-method-name">${esc(m.name)}</div>
                <div><span class="er-method-num">${m.n}</span> <span class="er-method-pct">${pct(m.n, d.totalVoters)}</span></div>
              </div>
            </li>`).join('')}
        </ul>
      </div>`;
  }

  function racesBlock(d) {
    const usedParties = [...new Set(d.races.flatMap(r => r.candidates.map(c => c.party)))];
    return `
      <div class="er-block">
        <div class="er-race-bar-head">
          <div class="er-block-title">Statewide races</div>
          <div class="er-toggle" role="group" aria-label="Show results as">
            <button type="button" data-er-mode="votes" aria-pressed="${mode === 'votes'}">Votes</button>
            <button type="button" data-er-mode="pct" aria-pressed="${mode === 'pct'}">Percent</button>
          </div>
        </div>
        <div class="er-legend" aria-label="Party colors" style="margin-bottom:14px">
          ${usedParties.map(p => `<span><span class="er-dot" style="background:${PARTIES[p].color}"></span>${PARTIES[p].label}</span>`).join('')}
          <span><span class="er-dot" style="background:${OTHER_COLOR}"></span>Write-ins &amp; scattering</span>
        </div>
        <div class="er-races" id="er-races">${d.races.map(raceCard).join('')}</div>
      </div>`;
  }

  function raceCard(r) {
    const s = raceStats(r);
    const rows = r.candidates.map(c => ({ ...c, color: PARTIES[c.party].color, partyLabel: PARTIES[c.party].label }));
    rows.push({ name: 'Write-ins & scattering', votes: s.writeInTotal, color: OTHER_COLOR, writeIns: r.writeIns });
    const max = Math.max(...rows.map(x => x.votes), 1);

    return `
      <article class="er-race">
        <div class="er-race-title">${esc(r.office)}</div>
        <div class="er-race-meta">${s.total} votes cast &middot; ${ELECTION_RESULTS.totalVoters - s.total} left blank</div>
        ${rows.map(x => {
          const isLead = x === rows.find(y => y.name === s.leader.name);
          const share = pct(x.votes, s.total);
          const primary = mode === 'votes' ? x.votes : share;
          const secondary = mode === 'votes' ? share : `${x.votes} votes`;
          const nonzero = x.writeIns ? x.writeIns.filter(w => w[1] > 0) : [];
          return `
            <div class="er-row">
              <div class="er-row-top">
                <div class="er-name">${esc(x.name)}${isLead ? '<span class="er-lead">Leading</span>' : ''}
                  ${x.partyLabel ? `<span class="er-party"><span class="er-dot" style="background:${x.color}"></span>${x.partyLabel}</span>` : ''}
                </div>
                <div class="er-val">${primary}<small>${secondary}</small></div>
              </div>
              <div class="er-track"><div class="er-bar" style="background:${x.color}" data-target="${(100 * x.votes / max).toFixed(2)}%"></div></div>
              ${x.writeIns ? `<div class="er-writein-detail">${nonzero.length ? nonzero.map(w => `${esc(w[0])}: ${w[1]}`).join(' &middot; ') : `${x.writeIns.length} write-in line${x.writeIns.length === 1 ? '' : 's'} on the ballot, no votes`}</div>` : ''}
            </div>`;
        }).join('')}
        <div class="er-margin">${esc(s.leader.name)} leads by ${s.margin} votes (${s.marginPts.toFixed(1)} points)</div>
      </article>`;
  }

  function animateIn(root) {
    const go = () => {
      root.querySelectorAll('.er-ring-value').forEach(el => { el.style.strokeDashoffset = el.dataset.target; });
      root.querySelectorAll('.er-pace').forEach(el => el.classList.add('is-in'));
      root.querySelectorAll('.er-stack-seg, .er-bar').forEach(el => { el.style.width = el.dataset.target; });
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
  }

  function bindToggle(root) {
    root.querySelectorAll('[data-er-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.erMode;
        root.querySelectorAll('[data-er-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        const races = root.querySelector('#er-races');
        races.innerHTML = ELECTION_RESULTS.races.map(raceCard).join('');
        // Bars are already at full width after a toggle; set them directly.
        races.querySelectorAll('.er-bar').forEach(el => { el.style.transition = 'none'; el.style.width = el.dataset.target; });
      });
    });
  }

  function render(containerId) {
    const el = document.getElementById(containerId);
    const d = ELECTION_RESULTS;
    if (!el || !d) return;

    if (d.showUntil) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const until = new Date(d.showUntil + 'T00:00:00');
      if (today > until) { el.hidden = true; return; }
    }

    el.innerHTML = `
      <div class="section-label">Election results</div>
      <div class="er er-card">
        <div class="er-head">
          <div class="er-head-title">${esc(d.title)} &middot; Town of Winchester</div>
          <span class="er-status">${esc(d.status)} results</span>
        </div>
        <div class="er-block"><div class="er-viz-grid">${turnoutViz(d)}${paceViz(d)}</div></div>
        ${methodBlock(d)}
        ${racesBlock(d)}
        <div class="er-foot">
          <div class="er-foot-text">${esc(d.status)} results as reported to the Vilas County Clerk on election night. ${d.status === 'Unofficial' ? 'Official results are certified after the county canvass.' : ''} Percentages are each candidate's share of votes cast in that race. Source: ${esc(d.source)} ${d.populationSource ? esc(d.populationSource) + ' ' : ''}${esc(d.partySource)}</div>
          <a class="er-foot-btn" href="${d.countyResultsUrl}" target="_blank" rel="noopener">Vilas County results &rarr;</a>
        </div>
      </div>`;
    el.hidden = false;
    bindToggle(el);
    animateIn(el);
  }

  return { render };
})();

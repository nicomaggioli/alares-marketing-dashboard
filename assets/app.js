/* Alares Marketing Dashboard: reads a Google Sheet and renders each page. */
const SHEET_ID = '1RveiXszU6RwoVePI_BQsdZLc7AIJE_VB-nrUCH7WwMY';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const TARGET_HOURS = 20;
const TABS = ['Opportunities', 'Outreach', 'Posts', 'Newsletter', 'Listings', 'Hours', 'Reports'];
const PAGES = [
  ['index.html', 'Overview'], ['opportunities.html', 'Opportunities'], ['outreach.html', 'Outreach'],
  ['content.html', 'Content calendar'], ['design/posting-calendar.html', 'Post builder'], ['design/brand-guidelines.html', 'Brand guidelines'], ['newsletter.html', 'Newsletter'], ['listings.html', 'Listings'],
  ['hours.html', 'Hours'], ['reports.html', 'Reports']
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '';
const link = (u, text) => safeUrl(u) ? `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(text)}</a>` : '';
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const isExample = r => /^EXAMPLE/i.test(Object.values(r)[0] || '');

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
async function loadTab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}&_=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const rows = parseCSV(await res.text());
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.some(c => c.trim() !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
function parseDate(s) {
  if (!s) return null;
  let m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
  m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s); return isNaN(d) ? null : d;
}
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysFrom = d => d ? Math.round((d - today()) / 864e5) : null;
const fmt = (d, o = { month: 'short', day: 'numeric' }) => d ? d.toLocaleDateString('en-US', o) : '';
const fmtLong = d => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
function when(d) {
  const n = daysFrom(d); if (n === null) return '';
  if (n === 0) return 'today'; if (n === 1) return 'tomorrow'; if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

const TONE = {
  Watching: '', Reviewing: 'blue', Bidding: 'amber', Submitted: 'blue', Won: 'green', Lost: 'red', Passed: '',
  'To contact': '', Contacted: 'blue', Replied: 'amber', 'Meeting set': 'amber', Teaming: 'green', 'Not a fit': '',
  Planned: '', Drafted: 'amber', Scheduled: 'blue', Posted: 'green', Published: 'green', Skipped: '', 'No blog': '',
  Idea: '', Sent: 'green', Correct: 'green', 'Needs fix': 'red', 'In progress': 'amber', 'Not claimed': 'amber'
};
const pill = s => s ? `<span class="pill ${TONE[s] || ''}">${esc(s)}</span>` : '<span class="pill">Not set</span>';
const OPEN_OPP = ['Watching', 'Reviewing', 'Bidding'];
const OPEN_OUT = ['To contact', 'Contacted', 'Replied', 'Meeting set'];
const HOUR_COLS = ['Social posts', 'Blog', 'Opportunity tracking', 'Outreach', 'Proposal support', 'Newsletter', 'Listings', 'Reporting'];
const rowHours = r => HOUR_COLS.reduce((t, c) => t + num(r[c]), 0);

function stats(D) {
  const opps = D.Opportunities.filter(r => !isExample(r));
  const openOpps = opps.filter(r => OPEN_OPP.includes(r.Status) || !r.Status);
  const dueSoon = openOpps.filter(r => { const n = daysFrom(parseDate(r['Due date'])); return n !== null && n >= 0 && n <= 14; });
  const out = D.Outreach.filter(r => !isExample(r));
  const followUps = out.filter(r => OPEN_OUT.includes(r.Status) && (() => { const n = daysFrom(parseDate(r['Next step date'])); return n !== null && n <= 0; })());
  const fixes = D.Listings.filter(r => r.Status && r.Status !== 'Correct');
  const upcoming = D.Posts.map(r => ({ ...r, _d: parseDate(r.Date) })).filter(r => r._d && daysFrom(r._d) >= 0).sort((a, b) => a._d - b._d);
  const t = today(); const monday = new Date(t); monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const weekRow = D.Hours.find(r => { const d = parseDate(r['Week of']); return d && d.getTime() === monday.getTime(); });
  return { opps, openOpps, dueSoon, out, followUps, fixes, upcoming, weekHours: weekRow ? rowHours(weekRow) : 0, monday };
}

function table(cols, rows, emptyMsg) {
  if (!rows.length) return `<div class="empty">${esc(emptyMsg)}</div>`;
  return `<div class="tablewrap"><table><thead><tr>${cols.map(c => `<th class="${c.cls === 'num' ? 'num' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.cls || ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function chips(el, rows, key, order, draw) {
  let active = 'All';
  const counts = s => s === 'All' ? rows.length : rows.filter(r => (r[key] || 'Not set') === s).length;
  const names = ['All', ...order.filter(s => counts(s)), ...(rows.some(r => !r[key]) ? ['Not set'] : [])];
  const paint = () => {
    el.querySelector('.chips').innerHTML = names.map(s => `<button class="chip ${s === active ? 'on' : ''}" data-s="${esc(s)}">${esc(s)}<b>${counts(s)}</b></button>`).join('');
    el.querySelector('.out').innerHTML = draw(active === 'All' ? rows : rows.filter(r => (r[key] || 'Not set') === active));
  };
  el.innerHTML = '<div class="chips"></div><div class="out"></div>';
  el.addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { active = b.dataset.s; paint(); } });
  paint();
}

const VIEW = {
  'index.html': {
    label: 'Marketing', title: 'Alares Marketing Dashboard',
    sub: 'What is being worked on this week across social posts, the blog, federal opportunities and partner outreach.',
    draw(el, D, S) {
      const next = S.upcoming[0];
      const pct = Math.min(100, Math.round(S.weekHours / TARGET_HOURS * 100));
      const week = S.upcoming.filter(r => daysFrom(r._d) <= 7);
      const hoursRows = D.Hours.map(r => ({ d: parseDate(r['Week of']), h: rowHours(r) })).filter(r => r.d).sort((a, b) => a.d - b.d).slice(-8);
      const max = Math.max(TARGET_HOURS, ...hoursRows.map(r => r.h));
      el.innerHTML = `
      <div class="tiles">
        <a class="tile" href="hours.html"><span class="label">Hours this week</span><div class="n">${S.weekHours}<small> / ${TARGET_HOURS}</small></div><div class="meter"><b style="width:${pct}%"></b></div><div class="d">Week of ${fmt(S.monday)}</div></a>
        <a class="tile" href="opportunities.html"><span class="label">Open opportunities</span><div class="n">${S.openOpps.length}</div><div class="d">Watching, reviewing or bidding</div></a>
        <a class="tile ${S.dueSoon.length ? 'alert' : ''}" href="opportunities.html"><span class="label">Due in 14 days</span><div class="n">${S.dueSoon.length}</div><div class="d">Response deadlines coming up</div></a>
        <a class="tile ${S.followUps.length ? 'alert' : ''}" href="outreach.html"><span class="label">Follow-ups due</span><div class="n">${S.followUps.length}</div><div class="d">Of ${S.out.length} firms tracked</div></a>
        <a class="tile" href="content.html"><span class="label">Next post</span><div class="n" style="font-size:24px;padding-top:6px">${next ? esc(fmtLong(next._d)) : 'None'}</div><div class="d">${next ? esc(next.Title) : 'Nothing scheduled'}</div></a>
        <a class="tile ${S.fixes.length ? 'alert' : ''}" href="listings.html"><span class="label">Listings to fix</span><div class="n">${S.fixes.length}</div><div class="d">Of ${D.Listings.length} listings checked</div></a>
      </div>
      <div class="cols">
        <div><h2>Next 7 days: posts</h2><div class="list">${week.length ? week.map(r => `<div class="row"><div><b>${esc(r.Title)}</b><small>${esc(r.Type || 'Post')}</small></div><span class="m">${esc(fmtLong(r._d))}</span></div>`).join('') : '<div class="row"><span class="m">No posts scheduled in the next 7 days.</span></div>'}</div></div>
        <div><h2>Deadlines and follow-ups</h2><div class="list">${[
          ...S.dueSoon.map(r => ({ d: parseDate(r['Due date']), t: r.Title, s: `Opportunity · ${r.Agency || ''}` })),
          ...S.followUps.map(r => ({ d: parseDate(r['Next step date']), t: r.Firm, s: `Outreach · ${r['Next step'] || 'Follow up'}` }))
        ].sort((a, b) => a.d - b.d).map(r => `<div class="row"><div><b>${esc(r.t)}</b><small>${esc(r.s)}</small></div><span class="m">${esc(when(r.d))}</span></div>`).join('') || '<div class="row"><span class="m">Nothing due. Add opportunities and outreach in the sheet.</span></div>'}</div></div>
      </div>
      <h2>Hours by week</h2>
      ${hoursRows.some(r => r.h) ? `<div class="bars"><div class="target" style="bottom:${TARGET_HOURS / max * 100}%">${TARGET_HOURS}-hour target</div>${hoursRows.map(r => `<div class="bar">${r.h || ''}<div style="height:${r.h / max * 100}%"></div><span>${esc(fmt(r.d))}</span></div>`).join('')}</div><div style="height:30px"></div>` : '<div class="empty">No hours logged yet. Fill in the Hours tab of the sheet and this chart appears.</div>'}
      <h2>Listings that need attention</h2>
      ${table([{ h: 'Listing', cls: 't', f: r => esc(r.Listing) }, { h: 'Status', f: r => pill(r.Status) }, { h: 'Next step', cls: 'note', f: r => esc(r['Next step']) }], S.fixes, 'Every listing is correct.')}`;
    }
  },
  'opportunities.html': {
    label: 'Federal work', title: 'Opportunities',
    sub: 'Solicitations and sources-sought notices worth a look, mostly from SAM.gov. Sorted by response deadline.',
    draw(el, D) {
      const rows = D.Opportunities.map(r => ({ ...r, _d: parseDate(r['Due date']) })).sort((a, b) => (a._d || 9e15) - (b._d || 9e15));
      chips(el, rows, 'Status', ['Watching', 'Reviewing', 'Bidding', 'Submitted', 'Won', 'Lost', 'Passed'], list => table([
        { h: 'Opportunity', cls: 't', f: r => `${link(r.Link, r.Title) || esc(r.Title)}<br><span class="stamp">${esc([r.Agency, r.Location].filter(Boolean).join(' · '))}</span>` },
        { h: 'Type', cls: 'nowrap', f: r => esc(r.Type) }, { h: 'Set-aside', cls: 'nowrap', f: r => esc(r['Set-aside']) }, { h: 'NAICS', f: r => esc(r.NAICS) },
        { h: 'Due', cls: 'nowrap', f: r => r._d ? `${esc(fmt(r._d))}<br><span class="stamp">${esc(when(r._d))}</span>` : '' },
        { h: 'Status', f: r => pill(r.Status) }, { h: 'Notes', cls: 'note', f: r => esc(r.Notes) }
      ], list, 'No opportunities yet. Add rows to the Opportunities tab of the sheet.'));
    }
  },
  'outreach.html': {
    label: 'Teaming', title: 'Outreach',
    sub: 'Primes, small businesses and agency offices to build relationships with. Firms only: contact details stay out of this site.',
    draw(el, D) {
      const rows = D.Outreach.map(r => ({ ...r, _d: parseDate(r['Next step date']) })).sort((a, b) => (a._d || 9e15) - (b._d || 9e15));
      chips(el, rows, 'Status', ['To contact', 'Contacted', 'Replied', 'Meeting set', 'Teaming', 'Not a fit'], list => table([
        { h: 'Firm', cls: 't', f: r => `${esc(r.Firm)}<br><span class="stamp">${esc(r.Type)}</span>` },
        { h: 'Why them', cls: 'note', f: r => esc(r['Why them']) }, { h: 'Channel', f: r => esc(r.Channel) },
        { h: 'Last contact', cls: 'nowrap', f: r => esc(fmt(parseDate(r['Last contact']))) },
        { h: 'Next step', f: r => `${esc(r['Next step'])}${r._d ? `<br><span class="stamp">${esc(fmt(r._d))} · ${esc(when(r._d))}</span>` : ''}` },
        { h: 'Status', f: r => pill(r.Status) }, { h: 'Notes', cls: 'note', f: r => esc(r.Notes) }
      ], list, 'No firms yet. Add rows to the Outreach tab of the sheet.'));
    }
  },
  'content.html': {
    label: 'Tuesdays and Thursdays', title: 'Content calendar',
    sub: 'Blog posts and the social posts that go with them on LinkedIn, X, Instagram and Facebook.',
    draw(el, D, S) {
      const P = ['Blog', 'LinkedIn', 'X', 'Instagram', 'Facebook'];
      const past = D.Posts.map(r => ({ ...r, _d: parseDate(r.Date) })).filter(r => r._d && daysFrom(r._d) < 0).sort((a, b) => b._d - a._d);
      el.innerHTML = `<div class="note-box">The post builder from Claude Design is here too: preview each post's carousel, captions and cards, and download them. <a href="design/posting-calendar.html"><b>Open the post builder</b></a></div><h2 style="margin-top:0">Coming up</h2>
      ${S.upcoming.length ? `<div class="cards">${S.upcoming.map(r => `<div class="card ${daysFrom(r._d) === 0 ? 'today' : ''}"><span class="label">${esc(fmtLong(r._d))} · ${esc(when(r._d))}</span><h3>${esc(r.Title || 'To be decided')}</h3><div class="plat">${P.map(p => `<span>${p}</span>${pill(r[p])}`).join('')}</div><div class="foot">${link(r['Drive folder'], 'Drive folder')}${link(r['Blog link'], 'Blog post')}</div></div>`).join('')}</div>` : '<div class="empty">Nothing scheduled. Add rows to the Posts tab of the sheet.</div>'}
      <h2>Published</h2>
      ${table([{ h: 'Date', cls: 'nowrap', f: r => esc(fmt(r._d, { month: 'short', day: 'numeric', year: 'numeric' })) }, { h: 'Post', cls: 't', f: r => link(r['Blog link'], r.Title) || esc(r.Title) }, { h: 'Type', cls: 'nowrap', f: r => esc(r.Type) }, ...P.map(p => ({ h: p, f: r => pill(r[p]) }))], past, 'No past posts listed.')}`;
    }
  },
  'newsletter.html': {
    label: 'Email', title: 'Newsletter',
    sub: 'A monthly email to past clients and partners that reuses the blog posts.',
    draw(el, D) {
      el.innerHTML = table([{ h: 'Month', cls: 'nowrap', f: r => esc(r.Month) }, { h: 'Subject', cls: 't', f: r => esc(r.Subject) }, { h: 'Status', f: r => pill(r.Status) }, { h: 'Sent', cls: 'nowrap', f: r => esc(fmt(parseDate(r['Send date']))) }, { h: 'Recipients', cls: 'num', f: r => esc(r.Recipients) }, { h: 'Open rate', cls: 'num', f: r => r['Open rate %'] ? esc(r['Open rate %']) + '%' : '' }, { h: 'Click rate', cls: 'num', f: r => r['Click rate %'] ? esc(r['Click rate %']) + '%' : '' }, { h: 'Notes', cls: 'note', f: r => esc(r.Notes) }], D.Newsletter, 'No newsletters yet. Add rows to the Newsletter tab of the sheet.');
    }
  },
  'listings.html': {
    label: 'Where Alares appears', title: 'Listings',
    sub: 'Every place that shows the company address, phone number and description, and whether it is correct.',
    draw(el, D) {
      const order = { 'Needs fix': 0, 'In progress': 1, 'Not claimed': 2, Correct: 3 };
      const rows = [...D.Listings].sort((a, b) => (order[a.Status] ?? 2) - (order[b.Status] ?? 2));
      el.innerHTML = table([{ h: 'Listing', cls: 't', f: r => link(r.Link, r.Listing) || esc(r.Listing) }, { h: 'Status', f: r => pill(r.Status) }, { h: 'What it shows now', cls: 'note', f: r => esc(r['What it shows now']) }, { h: 'Next step', cls: 'note', f: r => esc(r['Next step']) }], rows, 'No listings yet.');
    }
  },
  'hours.html': {
    label: 'Time', title: 'Hours',
    sub: `Hours worked each week by type of work, against a ${TARGET_HOURS}-hour weekly target.`,
    draw(el, D) {
      const rows = D.Hours.map(r => ({ ...r, _d: parseDate(r['Week of']), _t: rowHours(r) })).filter(r => r._d).sort((a, b) => b._d - a._d);
      el.innerHTML = table([{ h: 'Week of', cls: 'nowrap t', f: r => esc(fmt(r._d, { month: 'short', day: 'numeric', year: 'numeric' })) }, ...HOUR_COLS.map(c => ({ h: c, cls: 'num', f: r => r[c] ? esc(r[c]) : '' })), { h: 'Total', cls: 'num', f: r => `<b>${r._t}</b> / ${TARGET_HOURS}` }, { h: 'Notes', cls: 'note', f: r => esc(r.Notes) }], rows, 'No weeks yet. Add rows to the Hours tab of the sheet.');
    }
  },
  'reports.html': {
    label: 'Results', title: 'Reports',
    sub: 'Month-end numbers from the website analytics and social accounts.',
    draw(el, D) {
      el.innerHTML = table([{ h: 'Month', cls: 'nowrap t', f: r => esc(r.Month) }, ...['Website visits', 'Blog views', 'Inquiries', 'LinkedIn followers'].map(c => ({ h: c, cls: 'num', f: r => r[c] ? esc(num(r[c]).toLocaleString('en-US')) : '' })), { h: 'Top post', f: r => esc(r['Top post']) }, { h: 'Notes', cls: 'note', f: r => esc(r.Notes) }], D.Reports, 'No reports yet. Add rows to the Reports tab of the sheet.');
    }
  }
};

async function boot() {
  const file = (location.pathname.split('/').pop() || 'index.html').replace(/^$/, 'index.html');
  const view = VIEW[file] || VIEW['index.html'];
  document.title = view.title === 'Alares Marketing Dashboard' ? view.title : `${view.title} | Alares Marketing Dashboard`;
  document.body.innerHTML = `<div class="shell">
    <aside class="side"><a class="brand" href="index.html"><img src="assets/alares-wing.svg" alt=""><div><b>Alares</b><span>Marketing</span></div></a>
      <nav class="nav">${PAGES.map(([f, t]) => `<a href="${f}" data-f="${f}" class="${f === file || (!VIEW[file] && f === 'index.html') ? 'on' : ''}"><span>${t}</span></a>`).join('')}</nav>
      <div class="side-foot">Internal working page.<br>Not linked from the public site.</div></aside>
    <main class="main"><div class="top"><div><span class="label">${esc(view.label)}</span><h1>${esc(view.title)}</h1><p class="sub">${esc(view.sub)}</p></div>
      <div class="actions"><span class="stamp" id="stamp">Loading…</span><button class="btn ghost" id="refresh">Refresh</button><a class="btn" href="${SHEET_URL}" target="_blank" rel="noopener">Edit in Google Sheets</a></div></div>
      <div id="view"><div class="empty">Loading the latest numbers…</div></div></main></div>`;
  const el = document.getElementById('view');
  const load = async () => {
    document.getElementById('stamp').textContent = 'Loading…';
    try {
      const data = await Promise.all(TABS.map(loadTab));
      const D = Object.fromEntries(TABS.map((t, i) => [t, data[i]]));
      const S = stats(D);
      const fresh = el.cloneNode(false); el.replaceWith(fresh); fresh.id = 'view';
      view.draw(fresh, D, S);
      const badge = (f, n, warn) => { const a = document.querySelector(`.nav a[data-f="${f}"]`); a.querySelector('i')?.remove(); if (n) a.insertAdjacentHTML('beforeend', `<i class="${warn ? 'warn' : ''}">${n}</i>`); };
      badge('opportunities.html', S.dueSoon.length, true); badge('outreach.html', S.followUps.length, true); badge('listings.html', S.fixes.length, false);
      document.getElementById('stamp').textContent = `Updated ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } catch (e) {
      document.getElementById('view').innerHTML = `<div class="error">Could not read the Google Sheet (${esc(e.message)}). Check that the sheet is still shared as "Anyone with the link can view" and that the tab names are unchanged.</div>`;
      document.getElementById('stamp').textContent = 'Not loaded';
    }
  };
  document.getElementById('refresh').addEventListener('click', () => { load(); });
  load();
}
boot();

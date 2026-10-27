// MysteryVerse admin dashboard. All data is rendered as text nodes via h(); nothing
// from the server or from players is ever inserted as HTML.
import { h, clear, toast, modal, segmented, switchRow, cap, DIFFS } from './ui.js';
import { api } from './api.js';

const root = document.getElementById('admin');

const TABS = [
  ['overview', '📊', 'Overview'],
  ['challenges', '🧩', 'Challenges'],
  ['generate', '⚙️', 'Generate'],
  ['reports', '🚩', 'Reports'],
  ['media', '🖼️', 'Media'],
  ['settings', '🛠️', 'Settings'],
  ['audit', '📜', 'Audit log'],
  ['learned', '🧠', 'Learned'],
];
const STATUSES = ['approved', 'pending', 'rejected', 'removed'];
const SOURCES = ['curated', 'ai', 'procedural', 'admin'];
const MODES = ['casual', 'challenge', 'hardcore', 'classroom'];
const GEN_LABEL = { ai: 'AI generation', procedural: 'Procedural (offline)' };

let games = [];           // [{ id, title, emoji, generationKind, ... }] from the overview
let lastOverview = null;
let main = null;
let nav = null;
let aiPill = null;
let pollTimer = null;

// ---------------------------------------------------------------- helpers

const fmtNum = (n) => (Number(n) || 0).toLocaleString();
const fmtUsd = (n) => `$${(Number(n) || 0).toFixed((Number(n) || 0) < 1 ? 4 : 2)}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');
const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const gameOf = (id) => games.find((g) => g.id === id) || { id, title: id, emoji: '❔' };
const statusPill = (s) => h('span', { class: `pill st-${s}` }, s);
const diffPill = (d) => h('span', { class: `pill diff-pill diff-${d}` }, d);

/** Run an API call; 401 sends the admin back to the login screen, other errors become toasts. */
async function call(promise, { quiet = false } = {}) {
  try {
    return await promise;
  } catch (err) {
    if (err.status === 401) {
      stopPolling();
      renderLogin('Your session ended. Please log in again.');
    } else if (!quiet) toast(err.message, 'bad');
    throw err;
  }
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function parseHash() {
  const [tab, qs] = location.hash.replace(/^#/, '').split('?');
  return { tab: TABS.some((t) => t[0] === tab) ? tab : 'overview', params: new URLSearchParams(qs || '') };
}

function selectEl(options, value, attrs = {}) {
  const el = h('select', { class: 'input sel', ...attrs }, options.map(([v, label]) => h('option', { value: v }, label)));
  el.value = value ?? '';
  return el;
}

function field(label, control, help = '') {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, help ? h('div', { class: 'help' }, help) : null);
}

function table(headers, rows, empty = 'Nothing here yet.') {
  if (!rows.length) return h('div', { class: 'empty panel' }, empty);
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, rows)));
}

function problemList(title, items, cls = 'bad') {
  if (!items?.length) return null;
  return h('div', { class: `problems ${cls}` }, h('b', {}, title), h('ul', {}, items.map((p) => h('li', {}, String(p)))));
}

function checksSummary(validation, moderation) {
  const out = [];
  if (validation) {
    out.push(h('div', { class: 'row' }, h('b', {}, 'Validation:'), validation.ok ? h('span', { class: 'pill good' }, 'passed') : h('span', { class: 'pill bad' }, 'failed')));
    out.push(problemList('Problems', validation.problems));
    out.push(problemList('Warnings', validation.warnings, 'warn'));
  }
  if (moderation) {
    out.push(h('div', { class: 'row' }, h('b', {}, 'Moderation:'),
      moderation.ok ? h('span', { class: 'pill good' }, 'passed') : h('span', { class: 'pill bad' }, 'blocked'),
      moderation.needsReview ? h('span', { class: 'pill warn' }, 'needs human review') : null,
      moderation.ai ? h('span', { class: 'pill' }, `AI review: ${moderation.ai.safe ? 'safe' : 'unsafe'} (${moderation.ai.severity})`) : h('span', { class: 'pill' }, 'local scan only'),
      moderation.checkedAt ? h('span', { class: 'muted small' }, fmtDate(moderation.checkedAt)) : null));
    out.push(problemList('Blocked terms', (moderation.local?.hits || []).map((x) => `"${x.term}" (${x.category})${x.text ? ` in: ${x.text}` : ''}`)));
    out.push(problemList('AI reviewer issues', moderation.ai?.issues));
    if (moderation.aiError) out.push(problemList('AI review error', [moderation.aiError], 'warn'));
  }
  return out.filter(Boolean);
}

function previewUrl(c) {
  return `/#/play/${encodeURIComponent(c.game)}?c=${encodeURIComponent(c.id)}&d=${encodeURIComponent(c.difficulty)}`;
}

// ---------------------------------------------------------------- login + shell

function renderLogin(message = '') {
  stopPolling();
  main = null;
  const input = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Admin password', placeholder: 'Admin password' });
  const err = h('div', { class: 'feedback bad', role: 'alert' }, message);
  const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Log in');
  const form = h('form', { class: 'login panel', onsubmit: async (e) => {
    e.preventDefault();
    btn.disabled = true;
    err.textContent = '';
    try {
      await api.post('/api/admin/login', { password: input.value });
      startShell();
    } catch (ex) {
      err.textContent = ex.message;
      input.select();
    } finally {
      btn.disabled = false;
    }
  } },
  h('div', { class: 'login-brand' }, h('span', { class: 'emoji' }, '🔐'), h('div', {}, h('div', { class: 'grad-text login-title' }, 'MYSTERYVERSE'), h('div', { class: 'muted' }, 'Teacher & admin dashboard'))),
  field('Password', input),
  btn, err,
  h('p', { class: 'muted small' }, 'First run? The server prints a generated password and saves it in data/ADMIN_PASSWORD.txt. You can also set the ADMIN_PASSWORD environment variable before starting the server.'),
  h('a', { href: '/', class: 'small' }, '⟵ Back to the games'));
  clear(root).append(h('div', { class: 'login-wrap' }, form));
  setTimeout(() => input.focus(), 50);
}

async function startShell() {
  nav = h('nav', { class: 'adm-nav', 'aria-label': 'Admin sections' });
  main = h('main', { class: 'adm-main', id: 'adm-main', tabindex: '-1' });
  aiPill = h('span', { class: 'pill' }, 'AI: …');
  const top = h('header', { class: 'adm-top' },
    h('div', { class: 'adm-brand' }, h('span', { class: 'emoji' }, '🔮'), h('span', { class: 'grad-text' }, 'MYSTERYVERSE'), h('span', { class: 'muted' }, 'Admin')),
    h('div', { class: 'row adm-top-right' }, aiPill,
      h('a', { class: 'btn sm', href: '/', target: '_blank', rel: 'noopener' }, '🎮 Open site'),
      h('button', { class: 'btn sm ghost', onclick: logout }, 'Log out')));
  clear(root).append(h('div', { class: 'adm' }, top, h('div', { class: 'adm-body' }, nav, main)));
  try {
    await refreshOverview();
  } catch {
    return;
  }
  renderTab();
}

async function refreshOverview() {
  lastOverview = await call(api.get('/api/admin/overview'));
  games = lastOverview.byGame;
  const ai = lastOverview.ai;
  aiPill.className = `pill ${ai.enabled ? 'good' : 'warn'}`;
  aiPill.textContent = ai.enabled ? `🤖 AI on · ${ai.model}` : `🧠 AI off · ${ai.reason}`;
  aiPill.title = ai.enabled ? 'AI provider connected' : ai.reason;
  return lastOverview;
}

async function logout() {
  stopPolling();
  try {
    await api.post('/api/admin/logout');
  } catch { /* already logged out */ }
  renderLogin('Logged out.');
}

function renderNav(active) {
  const openReports = lastOverview?.openReports || 0;
  const pending = games.reduce((s, g) => s + (g.pending || 0), 0);
  nav.replaceChildren(...TABS.map(([id, icon, label]) => {
    const badge = id === 'reports' && openReports ? openReports : id === 'challenges' && pending ? pending : null;
    return h('a', { href: `#${id}`, class: `adm-link ${id === active ? 'on' : ''}`, 'aria-current': id === active ? 'page' : null },
      h('span', { class: 'emoji' }, icon), h('span', {}, label), badge ? h('span', { class: 'adm-badge', title: id === 'reports' ? 'Open reports' : 'Pending challenges' }, String(badge)) : null);
  }));
}

async function renderTab() {
  if (!main) return;
  stopPolling();
  const { tab, params } = parseHash();
  renderNav(tab);
  clear(main).append(h('div', { class: 'loading small-loading' }, h('div', { class: 'spinner' })));
  const views = { overview: viewOverview, challenges: viewChallenges, generate: viewGenerate, reports: viewReports, media: viewMedia, settings: viewSettings, audit: viewAudit, learned: viewLearned };
  try {
    await views[tab](params);
  } catch (err) {
    if (err.status !== 401) clear(main).append(h('div', { class: 'empty panel' }, `Could not load this section: ${err.message}`));
  }
}

function pageHead(title, sub, ...actions) {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), h('div', { class: 'row' }, actions));
}

// ---------------------------------------------------------------- overview

async function viewOverview() {
  const o = await refreshOverview();
  renderNav('overview');
  const usage = await call(api.get('/api/admin/usage'));
  const today = o.usage.today || { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, failures: 0 };
  const total = o.usage.total;
  const tile = (label, value, sub, cls = '') => h('div', { class: `tile panel ${cls}` }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'muted small' }, sub) : null);
  const totals = games.reduce((s, g) => ({ approved: s.approved + g.approved, pending: s.pending + g.pending, plays: s.plays + g.plays, solves: s.solves + g.solves }), { approved: 0, pending: 0, plays: 0, solves: 0 });

  const gameCards = games.map((g) => h('div', { class: 'gcard panel' },
    h('div', { class: 'gcard-head' }, h('span', { class: 'emoji gcard-emoji' }, g.emoji), h('div', {}, h('b', {}, g.title), h('div', { class: 'muted small' }, GEN_LABEL[g.generationKind] || 'Curated / uploaded only'))),
    h('div', { class: 'gstats' },
      h('a', { href: `#challenges?game=${g.id}&status=approved` }, h('b', {}, fmtNum(g.approved)), h('span', {}, 'approved')),
      h('a', { href: `#challenges?game=${g.id}&status=pending`, class: g.pending ? 'warn' : '' }, h('b', {}, fmtNum(g.pending)), h('span', {}, 'pending')),
      h('a', { href: `#challenges?game=${g.id}&status=rejected` }, h('b', {}, fmtNum(g.rejected)), h('span', {}, 'rejected')),
      h('a', { href: `#challenges?game=${g.id}&status=removed` }, h('b', {}, fmtNum(g.removed)), h('span', {}, 'removed'))),
    h('div', { class: 'muted small' }, `Sources: ${g.curated} curated · ${g.ai} AI · ${g.procedural} procedural · ${g.admin} admin`),
    h('div', { class: 'muted small' }, `${fmtNum(g.plays)} plays · ${fmtNum(g.solves)} solves${g.plays ? ` · ${Math.round((g.solves / g.plays) * 100)}% solve rate` : ''}`)));

  const purposes = Object.entries(usage.usage.byPurpose || {}).sort((a, b) => b[1].costUsd - a[1].costUsd);
  clear(main).append(
    pageHead('Overview', 'Content, activity and AI usage at a glance.', h('button', { class: 'btn sm', onclick: renderTab }, '↻ Refresh')),
    h('div', { class: 'tiles' },
      tile('AI provider', o.ai.enabled ? 'Connected' : 'Offline', o.ai.enabled ? o.ai.model : o.ai.reason, o.ai.enabled ? 'ok' : 'warn'),
      tile('Approved challenges', fmtNum(totals.approved), `${fmtNum(totals.pending)} waiting for review`),
      tile('Open reports', fmtNum(o.openReports), o.openReports ? h('a', { href: '#reports' }, 'Review now') : 'All clear', o.openReports ? 'warn' : ''),
      tile('Generation queue', fmtNum(o.queue), o.queue ? h('a', { href: '#generate' }, 'View jobs') : 'Idle'),
      tile('Plays / solves', `${fmtNum(totals.plays)} / ${fmtNum(totals.solves)}`, 'All games, all time'),
      tile('AI today', fmtUsd(today.costUsd), `${fmtNum(today.requests)} requests · ${fmtNum(today.inputTokens + today.outputTokens)} tokens${today.failures ? ` · ${today.failures} failed` : ''}`),
      tile('AI all time', fmtUsd(total.costUsd), `${fmtNum(total.requests)} requests · ${fmtNum(total.inputTokens)} in / ${fmtNum(total.outputTokens)} out`)),
    h('h2', { class: 'section-title' }, 'Games'),
    h('div', { class: 'gcards' }, gameCards),
    h('h2', { class: 'section-title' }, 'AI usage by purpose'),
    table(['Purpose', 'Requests', 'Input tokens', 'Output tokens', 'Failures', 'Est. cost'], purposes.map(([p, u]) => h('tr', {},
      h('td', {}, h('code', {}, p)), h('td', {}, fmtNum(u.requests)), h('td', {}, fmtNum(u.inputTokens)), h('td', {}, fmtNum(u.outputTokens)), h('td', {}, fmtNum(u.failures)), h('td', {}, fmtUsd(u.costUsd)))),
    'No AI calls yet. Costs are estimates from token counts.'),
  );
}

// ---------------------------------------------------------------- challenges

const PAGE = 60;

async function viewChallenges(params) {
  const f = { game: params.get('game') || '', status: params.get('status') || '', difficulty: params.get('difficulty') || '', source: params.get('source') || '', q: params.get('q') || '' };
  let page = 0;
  const gameSel = selectEl([['', 'All games'], ...games.map((g) => [g.id, `${g.emoji} ${g.title}`])], f.game, { 'aria-label': 'Game' });
  const statusSel = selectEl([['', 'Any status'], ...STATUSES.map((s) => [s, cap(s)])], f.status, { 'aria-label': 'Status' });
  const diffSel = selectEl([['', 'Any difficulty'], ...DIFFS.map((d) => [d, cap(d)])], f.difficulty, { 'aria-label': 'Difficulty' });
  const sourceSel = selectEl([['', 'Any source'], ...SOURCES.map((s) => [s, cap(s)])], f.source, { 'aria-label': 'Source' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search title, id or content…', value: f.q, 'aria-label': 'Search' });
  const results = h('div', {});
  const count = h('span', { class: 'muted' });

  const syncHash = () => {
    const q = new URLSearchParams(Object.entries({ game: gameSel.value, status: statusSel.value, difficulty: diffSel.value, source: sourceSel.value, q: search.value.trim() }).filter(([, v]) => v));
    history.replaceState(null, '', `#challenges${q.toString() ? `?${q}` : ''}`);
    return q;
  };

  let list = [];
  const load = async () => {
    const q = syncHash();
    results.replaceChildren(h('div', { class: 'muted' }, 'Loading…'));
    list = (await call(api.get(`/api/admin/challenges?${q}`))).challenges;
    page = 0;
    render();
  };

  const render = () => {
    count.textContent = `${fmtNum(list.length)} challenge${list.length === 1 ? '' : 's'}`;
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const slice = list.slice(page * PAGE, page * PAGE + PAGE);
    const rows = slice.map((c) => challengeRow(c, load));
    results.replaceChildren(
      table(['Challenge', 'Game', 'Difficulty', 'Status', 'Source', 'Plays / solves', 'Checks', 'Actions'], rows, 'No challenges match these filters.'),
      pages > 1 ? h('div', { class: 'row pager' },
        h('button', { class: 'btn sm', disabled: page === 0, onclick: () => { page--; render(); } }, '‹ Prev'),
        h('span', { class: 'muted' }, `Page ${page + 1} of ${pages}`),
        h('button', { class: 'btn sm', disabled: page >= pages - 1, onclick: () => { page++; render(); } }, 'Next ›')) : null);
  };

  for (const el of [gameSel, statusSel, diffSel, sourceSel]) el.addEventListener('change', load);
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(load, 300);
  });

  clear(main).append(
    pageHead('Challenges', 'Review, edit, approve and remove challenges. Players only ever see approved ones.',
      h('button', { class: 'btn sm primary', onclick: () => newChallenge(load) }, '＋ New challenge')),
    h('div', { class: 'filters panel' }, gameSel, statusSel, diffSel, sourceSel, h('div', { class: 'grow' }, search), count),
    results);
  await load();
}

function challengeRow(c, reload) {
  const g = gameOf(c.game);
  const diff = selectEl(DIFFS.map((d) => [d, cap(d)]), c.difficulty, { 'aria-label': `Difficulty of ${c.title || c.id}`, class: `input sel sel-sm diff-${c.difficulty}` });
  diff.addEventListener('change', async () => {
    try {
      await call(api.put(`/api/admin/challenges/${encodeURIComponent(c.id)}`, { difficulty: diff.value }));
      c.difficulty = diff.value;
      toast(`Difficulty set to ${diff.value}`, 'good');
    } catch {
      diff.value = c.difficulty;
    }
  });
  const setStatus = async (status) => {
    try {
      await call(api.put(`/api/admin/challenges/${encodeURIComponent(c.id)}`, { status }));
      toast(`Marked ${status}`, 'good');
      reload();
    } catch { /* toast shown */ }
  };
  const flags = [];
  if (c.validation && !c.validation.ok) flags.push(h('span', { class: 'pill bad', title: (c.validation.problems || []).join('\n') }, '✖ invalid'));
  if (c.validation?.warnings?.length) flags.push(h('span', { class: 'pill warn', title: c.validation.warnings.join('\n') }, `⚠ ${c.validation.warnings.length}`));
  if (c.moderation?.needsReview) flags.push(h('span', { class: 'pill warn', title: 'Generated without an AI safety review; a human must check it' }, 'review'));
  if (c.moderation && !c.moderation.ok) flags.push(h('span', { class: 'pill bad' }, 'blocked'));
  if (!flags.length) flags.push(h('span', { class: 'muted small' }, c.validation || c.moderation ? 'ok' : '—'));
  const s = c.stats || {};
  return h('tr', {},
    h('td', { class: 'td-title' }, h('button', { class: 'linkish', onclick: () => details(c.id, reload), title: 'Details' }, c.title || '(untitled)'), h('div', { class: 'muted small mono' }, c.id)),
    h('td', {}, h('span', { title: g.title }, `${g.emoji} ${g.title}`)),
    h('td', {}, diff),
    h('td', {}, statusPill(c.status)),
    h('td', {}, h('span', { class: 'small' }, c.source)),
    h('td', { class: 'num' }, `${fmtNum(s.plays)} / ${fmtNum(s.solves)}`),
    h('td', {}, h('div', { class: 'row tight' }, flags)),
    h('td', {}, h('div', { class: 'row tight actions' },
      h('a', { class: 'btn sm', href: previewUrl(c), target: '_blank', rel: 'noopener', title: 'Play it in a new tab' }, '👁'),
      h('button', { class: 'btn sm', title: 'Edit', onclick: () => editChallenge(c.id, reload) }, '✏️'),
      c.status !== 'approved' ? h('button', { class: 'btn sm ok-btn', title: 'Approve', onclick: () => setStatus('approved') }, '✔') : null,
      c.status !== 'rejected' ? h('button', { class: 'btn sm', title: 'Reject', onclick: () => setStatus('rejected') }, '✖') : null,
      c.status !== 'removed' ? h('button', { class: 'btn sm', title: 'Remove from rotation', onclick: () => setStatus('removed') }, '🚫') : null,
      h('button', { class: 'btn sm danger', title: 'Delete permanently', onclick: () => deleteChallenge(c, reload) }, '🗑'))));
}

function deleteChallenge(c, reload) {
  modal({
    title: 'Delete this challenge?',
    body: h('div', {}, h('p', {}, h('b', {}, c.title || c.id)), h('p', { class: 'muted' }, c.source === 'curated'
      ? 'This is a curated challenge: it will be added back from the built-in library the next time the server restarts. Use "Remove" to keep it out of rotation permanently.'
      : 'This cannot be undone.')),
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: 'Delete', primary: true, onClick: async (close) => {
        try {
          await call(api.del(`/api/admin/challenges/${encodeURIComponent(c.id)}`));
          toast('Deleted', 'good');
          close();
          reload?.();
        } catch { /* toast shown */ }
      } },
    ],
  });
}

async function details(id, reload) {
  const { challenge: c } = await call(api.get(`/api/admin/challenges/${encodeURIComponent(id)}`));
  const g = gameOf(c.game);
  const checks = h('div', { class: 'checks' }, checksSummary(c.validation, c.moderation));
  if (!checks.childNodes.length) checks.append(h('p', { class: 'muted' }, 'No stored checks yet. Run them now:'));
  const s = c.stats || {};
  const m = modal({
    title: `${g.emoji} ${c.title || c.id}`,
    wide: true,
    body: h('div', {},
      h('div', { class: 'row' }, diffPill(c.difficulty), statusPill(c.status), h('span', { class: 'pill' }, c.source), (c.tags || []).map((t) => h('span', { class: 'pill' }, `#${t}`))),
      h('dl', { class: 'meta' },
        h('dt', {}, 'ID'), h('dd', { class: 'mono' }, c.id),
        h('dt', {}, 'Created'), h('dd', {}, fmtDate(c.createdAt)),
        h('dt', {}, 'Updated'), h('dd', {}, fmtDate(c.updatedAt)),
        h('dt', {}, 'Stats'), h('dd', {}, `${fmtNum(s.plays)} plays · ${fmtNum(s.solves)} solves · ${fmtNum(s.fails)} fails · ${fmtNum(s.skips)} skips${s.solves ? ` · avg ${Math.round((s.totalSeconds || 0) / Math.max(1, s.solves + s.fails))}s` : ''}`),
        c.editedByAdmin ? [h('dt', {}, 'Edited'), h('dd', {}, 'Edited by an admin (curated updates will not overwrite it)')] : null),
      h('h3', {}, 'Checks'), checks,
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const r = await call(api.post(`/api/admin/challenges/${encodeURIComponent(c.id)}/validate`));
          checks.replaceChildren(...checksSummary(r.validation, r.moderation));
          toast('Checks complete', r.validation.ok && r.moderation.ok ? 'good' : 'bad');
        } catch { /* toast shown */ } finally {
          btn.disabled = false;
        }
      } }, '🔎 Run validation + moderation')),
      h('h3', {}, 'Data'),
      h('pre', { class: 'json' }, JSON.stringify(c.data, null, 2))),
    actions: [
      { label: 'Preview ↗', onClick: () => window.open(previewUrl(c), '_blank', 'noopener') },
      { label: 'Edit', primary: true, onClick: (close) => { close(); editChallenge(c.id, reload); } },
    ],
  });
  return m;
}

function jsonEditor(value) {
  const ta = h('textarea', { class: 'input json-edit', spellcheck: 'false', rows: 18, 'aria-label': 'Challenge data (JSON)' });
  ta.value = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b } = ta;
      ta.value = `${ta.value.slice(0, a)}  ${ta.value.slice(b)}`;
      ta.selectionStart = ta.selectionEnd = a + 2;
    }
  });
  return ta;
}

function parseJson(ta, out) {
  try {
    const v = JSON.parse(ta.value);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('The data must be a JSON object { ... }');
    return v;
  } catch (err) {
    out.replaceChildren(problemList('JSON error', [err.message]));
    return null;
  }
}

async function editChallenge(id, reload) {
  const { challenge: c } = await call(api.get(`/api/admin/challenges/${encodeURIComponent(id)}`));
  const title = h('input', { class: 'input', value: c.title || '', maxlength: 200 });
  const tags = h('input', { class: 'input', value: (c.tags || []).join(', ') });
  const ta = jsonEditor(c.data);
  const out = h('div', { class: 'checks', 'aria-live': 'polite' });
  modal({
    title: `✏️ Edit ${gameOf(c.game).emoji} ${c.title || c.id}`,
    wide: true,
    body: h('div', {},
      h('div', { class: 'grid2' }, field('Title', title), field('Tags (comma separated)', tags, 'Use "jewish" for Jewish-themed content so it follows the Jewish-content setting.')),
      field('Data (JSON)', ta, 'Saving re-runs validation and the content-safety scan. Nothing is saved if a check fails.'),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { const v = parseJson(ta, out); if (v) { ta.value = JSON.stringify(v, null, 2); out.replaceChildren(h('div', { class: 'muted' }, 'JSON is well-formed.')); } } }, '{ } Format')),
      out),
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: 'Validate & save', primary: true, onClick: async (close) => {
        const data = parseJson(ta, out);
        if (!data) return;
        out.replaceChildren(h('div', { class: 'muted' }, 'Checking…'));
        try {
          const r = await call(api.put(`/api/admin/challenges/${encodeURIComponent(c.id)}`, {
            title: title.value.trim(), tags: tags.value.split(',').map((x) => x.trim()).filter(Boolean), data,
          }));
          if (!r.ok) {
            out.replaceChildren(h('b', { class: 'bad-text' }, 'Not saved. Fix these problems:'), ...checksSummary(r.validation, r.moderation));
            return;
          }
          toast('Saved', 'good');
          close();
          reload?.();
        } catch (err) {
          out.replaceChildren(problemList('Error', [err.message]));
        }
      } },
    ],
  });
}

async function newChallenge(reload) {
  const gameSel = selectEl(games.map((g) => [g.id, `${g.emoji} ${g.title}`]), games[0]?.id, {});
  const diffSel = selectEl(DIFFS.map((d) => [d, cap(d)]), 'easy', {});
  const statusSel = selectEl([['approved', 'Approved (live now)'], ['pending', 'Pending (review later)']], 'approved', {});
  const title = h('input', { class: 'input', maxlength: 200, placeholder: 'Optional; a summary is generated if empty' });
  const tags = h('input', { class: 'input', placeholder: 'e.g. jewish' });
  const ta = jsonEditor('{}');
  const notes = h('div', { class: 'muted small' });
  const out = h('div', { class: 'checks', 'aria-live': 'polite' });
  const loadTemplate = async () => {
    try {
      const t = await call(api.get(`/api/admin/templates/${encodeURIComponent(gameSel.value)}`));
      ta.value = t.example ? JSON.stringify(t.example.data, null, 2) : '{}';
      if (t.example) diffSel.value = t.example.difficulty;
      notes.textContent = t.schemaNotes || (t.example ? 'Loaded an existing challenge as a starting point. Change it before saving.' : 'This game has no example yet.');
      out.replaceChildren();
    } catch { /* toast shown */ }
  };
  gameSel.addEventListener('change', loadTemplate);
  modal({
    title: '＋ New challenge',
    wide: true,
    body: h('div', {},
      h('div', { class: 'grid3' }, field('Game', gameSel), field('Difficulty', diffSel), field('Status', statusSel)),
      h('div', { class: 'grid2' }, field('Title', title), field('Tags (comma separated)', tags)),
      field('Data (JSON)', ta), notes,
      h('p', { class: 'muted small' }, 'Media URLs from the Media tab can be used here (for example an item "image", a sound "audioUrl", or a "video" clip).'),
      out),
    actions: [
      { label: 'Reload example', onClick: loadTemplate },
      { label: 'Validate & create', primary: true, onClick: async (close) => {
        const data = parseJson(ta, out);
        if (!data) return;
        out.replaceChildren(h('div', { class: 'muted' }, 'Checking…'));
        try {
          const r = await call(api.post('/api/admin/challenges', {
            game: gameSel.value, difficulty: diffSel.value, status: statusSel.value, title: title.value.trim(),
            tags: tags.value.split(',').map((x) => x.trim()).filter(Boolean), data,
          }));
          if (!r.ok) {
            out.replaceChildren(h('b', { class: 'bad-text' }, 'Not created. Fix these problems:'), ...checksSummary(r.validation, r.moderation));
            return;
          }
          toast('Challenge created', 'good');
          close();
          reload?.();
        } catch (err) {
          out.replaceChildren(problemList('Error', [err.message]));
        }
      } },
    ],
  });
  loadTemplate();
}

// ---------------------------------------------------------------- generate

async function viewGenerate() {
  await refreshOverview();
  const ai = lastOverview.ai;
  const gameSel = selectEl(games.map((g) => [g.id, `${g.emoji} ${g.title} — ${GEN_LABEL[g.generationKind] || 'not supported'}`]), (games.find((g) => g.generationKind) || games[0])?.id, {});
  const diffSel = selectEl(DIFFS.map((d) => [d, cap(d)]), 'easy', {});
  const countIn = h('input', { class: 'input', type: 'number', min: 1, max: 20, value: 3 });
  const hint = h('div', { class: 'help' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Queue generation');
  const updateHint = () => {
    const g = gameOf(gameSel.value);
    if (g.generationKind === 'ai') hint.textContent = ai.enabled ? 'Uses the AI provider. Each puzzle is validated, independently checked and safety-reviewed before it is saved.' : `Needs an AI provider, which is currently off (${ai.reason}). Add an API key in Settings.`;
    else if (g.generationKind === 'procedural') hint.textContent = 'Built by the offline procedural generator. No API key needed; results are auto-approved because they are generated from vetted parts.';
    else hint.textContent = 'This game does not support automatic generation. Add challenges by hand (Challenges > New) or upload media.';
    submit.disabled = !g.generationKind || (g.generationKind === 'ai' && !ai.enabled);
  };
  gameSel.addEventListener('change', updateHint);
  updateHint();
  const jobsBox = h('div', {});
  const form = h('form', { class: 'panel gen-form', onsubmit: async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const r = await call(api.post('/api/admin/generate', { game: gameSel.value, difficulty: diffSel.value, count: Math.max(1, Math.min(20, Number(countIn.value) || 1)) }));
      toast(`Queued ${r.jobs.length} job${r.jobs.length === 1 ? '' : 's'}`, 'good');
      loadJobs();
    } catch { /* toast shown */ } finally {
      updateHint();
    }
  } }, h('div', { class: 'grid3' }, field('Game', gameSel), field('Difficulty', diffSel), field('How many (1-20)', countIn)), hint, h('div', { class: 'row' }, submit));

  const loadJobs = async () => {
    let r;
    try {
      r = await call(api.get('/api/admin/jobs'), { quiet: true });
    } catch {
      stopPolling();
      return;
    }
    const active = r.jobs.some((j) => j.status === 'queued' || j.status === 'running');
    jobsBox.replaceChildren(
      h('div', { class: 'row' }, h('h2', { class: 'section-title grow' }, 'Jobs'), h('span', { class: 'muted small' }, active ? `Refreshing every 3 s · ${r.queue} queued` : 'Idle'), h('button', { class: 'btn sm', onclick: loadJobs }, '↻')),
      table(['Created', 'Game', 'Difficulty', 'Kind', 'Status', 'By', 'Problems / errors', 'Result'], r.jobs.map((j) => {
        const g = gameOf(j.game);
        const issues = [...(j.problems || []), ...(j.error ? [j.error] : [])];
        return h('tr', {},
          h('td', { class: 'small' }, fmtDate(j.createdAt)),
          h('td', {}, `${g.emoji} ${g.title}`),
          h('td', {}, diffPill(j.difficulty)),
          h('td', { class: 'small' }, j.kind || '—'),
          h('td', {}, h('span', { class: `pill job-${j.status}` }, j.status === 'running' ? '⏳ running' : j.status)),
          h('td', { class: 'small' }, j.by || ''),
          h('td', { class: 'small' }, issues.length ? h('ul', { class: 'issues' }, issues.slice(0, 6).map((x) => h('li', {}, String(x)))) : h('span', { class: 'muted' }, '—')),
          h('td', {}, j.challengeId ? h('button', { class: 'btn sm', onclick: () => details(j.challengeId, loadJobs) }, 'Review') : h('span', { class: 'muted' }, '—')));
      }), 'No generation jobs yet.'));
    stopPolling();
    if (active && parseHash().tab === 'generate') pollTimer = setInterval(loadJobs, 3000);
  };

  clear(main).append(
    pageHead('Generate challenges', 'Build fresh challenges in the background so players never wait.'),
    h('div', { class: 'note panel' },
      h('p', {}, h('b', {}, 'How it works. '), 'AI generation (Connection, Password, Mystery Box, Twenty Questions) needs an API key. Procedural games (Find the Fake, Guess the Sound) generate offline. Every result passes validation and the content-safety scan; anything that fails is saved as "rejected" so you can see why.'),
      h('p', {}, 'When "Require approval" is on in Settings, AI-generated challenges stay ', h('b', {}, 'pending'), ' until you approve them in the Challenges tab. Generated content that could not get an AI safety review always waits for a human.')),
    form, jobsBox);
  await loadJobs();
}

// ---------------------------------------------------------------- reports

async function viewReports(params) {
  let filter = params.get('status') || 'open';
  const box = h('div', {});
  const load = async () => {
    const { reports } = await call(api.get('/api/admin/reports'));
    const list = filter === 'all' ? reports : reports.filter((r) => r.status === filter);
    const setReport = async (r, status) => {
      try {
        await call(api.put(`/api/admin/reports/${encodeURIComponent(r.id)}`, { status }));
        toast(`Report ${status}`, 'good');
        await refreshOverview();
        renderNav('reports');
        load();
      } catch { /* toast shown */ }
    };
    const setChallenge = async (r, status) => {
      try {
        await call(api.put(`/api/admin/challenges/${encodeURIComponent(r.challengeId)}`, { status }));
        toast(status === 'removed' ? 'Challenge removed from rotation' : 'Challenge approved again', 'good');
        load();
      } catch { /* toast shown */ }
    };
    box.replaceChildren(table(['Time', 'Game', 'Challenge', 'Reason', 'Note', 'Status', 'Actions'], list.map((r) => {
      const g = gameOf(r.game);
      return h('tr', {},
        h('td', { class: 'small' }, fmtDate(r.at)),
        h('td', {}, `${g.emoji} ${g.title}`),
        h('td', {}, r.challenge ? h('div', {}, h('button', { class: 'linkish', onclick: () => details(r.challengeId, load) }, r.challenge.title || r.challengeId), ' ', statusPill(r.challenge.status)) : h('span', { class: 'muted' }, `${r.challengeId} (deleted)`)),
        h('td', {}, h('span', { class: `pill ${r.reason === 'inappropriate' ? 'bad' : ''}` }, r.reason)),
        h('td', { class: 'note-cell' }, r.note || h('span', { class: 'muted' }, '—')),
        h('td', {}, h('span', { class: `pill rep-${r.status}` }, r.status)),
        h('td', {}, h('div', { class: 'row tight actions' },
          r.status !== 'resolved' ? h('button', { class: 'btn sm ok-btn', onclick: () => setReport(r, 'resolved') }, 'Resolve') : null,
          r.status !== 'dismissed' ? h('button', { class: 'btn sm', onclick: () => setReport(r, 'dismissed') }, 'Dismiss') : null,
          r.status !== 'open' ? h('button', { class: 'btn sm ghost', onclick: () => setReport(r, 'open') }, 'Reopen') : null,
          r.challenge && r.challenge.status !== 'removed' ? h('button', { class: 'btn sm danger', onclick: () => setChallenge(r, 'removed') }, '🚫 Remove challenge') : null,
          r.challenge && r.challenge.status !== 'approved' ? h('button', { class: 'btn sm', onclick: () => setChallenge(r, 'approved') }, '✔ Re-approve') : null,
          r.challenge ? h('button', { class: 'btn sm', onclick: () => editChallenge(r.challengeId, load) }, '✏️') : null)));
    }), filter === 'open' ? 'No open reports. 🎉' : 'No reports here.'));
  };
  clear(main).append(
    pageHead('Reports', 'Problems flagged by players and teachers. "Not appropriate" reports automatically hold the challenge (status pending) until you decide.',
      segmented([{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'dismissed', label: 'Dismissed' }, { value: 'all', label: 'All' }], filter, (v) => {
        filter = v;
        history.replaceState(null, '', `#reports?status=${v}`);
        load();
      })),
    box);
  await load();
}

// ---------------------------------------------------------------- media

function uploadFile(file, onProgress) {
  // XHR (not fetch) so we can show upload progress for large videos.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/upload?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(Object.assign(new Error(body?.error || `Upload failed (${xhr.status})`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.send(file);
  });
}

async function viewMedia() {
  const listBox = h('div', {});
  const queue = h('div', { class: 'upload-queue' });
  const input = h('input', { type: 'file', multiple: true, accept: 'image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm', class: 'visually-hidden', id: 'media-file' });
  const handleFiles = async (files) => {
    for (const file of files) {
      if (file.size > 60_000_000) {
        toast(`${file.name} is larger than 60 MB`, 'bad');
        continue;
      }
      const bar = h('i');
      const status = h('span', { class: 'muted small' }, 'Uploading…');
      queue.prepend(h('div', { class: 'upload-item panel' }, h('b', {}, file.name), h('span', { class: 'muted small' }, fmtBytes(file.size)), h('div', { class: 'bar grow' }, bar), status));
      try {
        const r = await uploadFile(file, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
        bar.style.width = '100%';
        status.textContent = `✔ ${r.media.url}`;
        status.className = 'small good-text';
      } catch (err) {
        status.textContent = `✖ ${err.message}`;
        status.className = 'small bad-text';
        if (err.status === 401) return renderLogin('Your session ended. Please log in again.');
      }
    }
    load();
  };
  input.addEventListener('change', () => {
    handleFiles([...input.files]);
    input.value = '';
  });
  const drop = h('label', { class: 'dropzone', for: 'media-file', tabindex: '0', onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.click()) },
    h('div', { class: 'emoji drop-ico' }, '📤'),
    h('div', {}, h('b', {}, 'Drop files here'), ' or click to choose'),
    h('div', { class: 'muted small' }, 'PNG, JPG, GIF, WEBP · MP3, WAV, OGG · MP4, WEBM · up to 60 MB each. Files are type-checked by content; SVG and HTML are never accepted.'));
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => handleFiles([...(e.dataTransfer?.files || [])]));

  const load = async () => {
    const { media } = await call(api.get('/api/admin/media'));
    listBox.replaceChildren(media.length ? h('div', { class: 'media-grid' }, media.map((m) => mediaCard(m, load))) : h('div', { class: 'empty panel' }, 'No uploads yet.'));
  };
  clear(main).append(
    pageHead('Media library', 'Upload licensed images, sounds and video clips to use in challenges.'),
    h('div', { class: 'note panel' },
      h('p', {}, h('b', {}, 'Where to use a URL: '), 'Connection items accept an ', h('code', {}, '"image"'), ' URL (shown instead of the emoji). Guess the Sound challenges accept an ', h('code', {}, '"audioUrl"'), '. What Happens Next accepts ', h('code', {}, '"video"'), ' clips with a pause timestamp. Paste the URL into the challenge JSON in the Challenges tab.'),
      h('p', { class: 'muted small' }, 'Only upload media you are licensed to use and that meets the content policy: you are the reviewer for uploaded files.')),
    input, drop, queue,
    h('h2', { class: 'section-title' }, 'Uploaded files'),
    listBox);
  await load();
}

function mediaCard(m, reload) {
  const preview = m.kind === 'image' ? h('img', { src: m.url, alt: m.name, loading: 'lazy' })
    : m.kind === 'audio' ? h('audio', { src: m.url, controls: true, preload: 'none' })
      : h('video', { src: m.url, controls: true, preload: 'metadata', muted: true });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.url);
      toast('URL copied', 'good');
    } catch {
      toast(m.url);
    }
  };
  return h('div', { class: 'media-card panel' },
    h('div', { class: `media-prev kind-${m.kind}` }, preview),
    h('div', { class: 'media-meta' },
      h('b', { title: m.name }, m.name),
      h('div', { class: 'muted small' }, `${m.kind} · ${fmtBytes(m.size)} · ${fmtDate(m.at)}`),
      h('code', { class: 'url' }, m.url),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn sm', onclick: copy }, '📋 Copy URL'),
        h('a', { class: 'btn sm', href: m.url, target: '_blank', rel: 'noopener' }, 'Open'),
        h('button', { class: 'btn sm danger', onclick: () => modal({
          title: 'Delete this file?',
          body: h('p', { class: 'muted' }, `${m.name} will be deleted. Challenges that use ${m.url} will lose this media.`),
          actions: [
            { label: 'Cancel', onClick: (close) => close() },
            { label: 'Delete', primary: true, onClick: async (close) => {
              try {
                await call(api.del(`/api/admin/media/${encodeURIComponent(m.id)}`));
                toast('Deleted', 'good');
                close();
                reload();
              } catch { /* toast shown */ }
            } },
          ],
        }) }, '🗑'))));
}

// ---------------------------------------------------------------- settings

async function viewSettings() {
  const { settings: s, envKeySet } = await call(api.get('/api/admin/settings'));
  const draft = structuredClone(s);
  delete draft.ai.apiKey;
  let newKey = '';
  let clearKey = false;

  const section = (title, sub, ...children) => h('section', { class: 'panel set-section' }, h('h2', {}, title), sub ? h('p', { class: 'muted small' }, sub) : null, children);
  const num = (obj, key, attrs = {}) => {
    const el = h('input', { class: 'input', type: 'number', value: obj[key], ...attrs });
    el.addEventListener('input', () => (obj[key] = Number(el.value)));
    return el;
  };
  const slider = (label, obj, key) => {
    const val = h('span', { class: 'mono' }, `${Math.round(obj[key] * 100)}%`);
    const el = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: obj[key], 'aria-label': label });
    el.addEventListener('input', () => {
      obj[key] = Number(el.value);
      val.textContent = `${Math.round(el.value * 100)}%`;
    });
    return h('div', { class: 'range' }, h('span', {}, label), el, val);
  };

  const terms = h('textarea', { class: 'input mono', rows: 5, placeholder: 'one word or phrase per line' });
  terms.value = (s.content.extraBlockedTerms || []).join('\n');
  terms.addEventListener('input', () => (draft.content.extraBlockedTerms = terms.value.split('\n').map((t) => t.trim()).filter(Boolean)));

  const model = h('input', { class: 'input mono', value: s.ai.model || 'claude-opus-5-5', placeholder: 'claude-opus-5-5' });
  model.addEventListener('input', () => (draft.ai.model = model.value.trim()));
  const keyInput = h('input', { class: 'input mono', type: 'password', autocomplete: 'off', placeholder: s.ai.apiKey ? `Stored key ${s.ai.apiKey} (type to replace)` : 'sk-ant-…' });
  keyInput.addEventListener('input', () => (newKey = keyInput.value.trim()));
  const keyState = h('div', { class: 'help' }, s.ai.apiKey ? `A key ending in ${s.ai.apiKey.replace(/•/g, '')} is stored on the server.` : envKeySet ? 'Using the ANTHROPIC_API_KEY environment variable.' : 'No key stored. AI features run in offline mode until one is added.',
    envKeySet && s.ai.apiKey ? ' (It overrides the ANTHROPIC_API_KEY environment variable.)' : '');
  const effortSeg = (key) => segmented(['low', 'medium', 'high'].map((v) => ({ value: v, label: cap(v) })), s.ai[key], (v) => (draft.ai[key] = v));
  const testOut = h('div', { class: 'help', 'aria-live': 'polite' });
  const testBtn = h('button', { class: 'btn sm', type: 'button', onclick: async () => {
    testBtn.disabled = true;
    testOut.textContent = 'Testing… (save first if you just changed the key)';
    try {
      const r = await call(api.post('/api/admin/ai-test'));
      testOut.textContent = r.ok ? `✔ Connected to ${r.result.model} in ${r.result.ms} ms (replied "${r.result.word}")` : `✖ ${r.error}`;
      testOut.className = `help ${r.ok ? 'good-text' : 'bad-text'}`;
    } catch (err) {
      testOut.textContent = `✖ ${err.message}`;
    } finally {
      testBtn.disabled = false;
      refreshOverview().catch(() => {});
    }
  } }, '🔌 Test AI connection');

  const save = h('button', { class: 'btn primary', onclick: async () => {
    save.disabled = true;
    try {
      const body = structuredClone(draft);
      if (newKey) body.ai.apiKey = newKey;
      if (clearKey) body.ai.clearApiKey = true;
      await call(api.put('/api/admin/settings', body));
      toast('Settings saved', 'good');
      await refreshOverview();
      viewSettings();
    } catch { /* toast shown */ } finally {
      save.disabled = false;
    }
  } }, '💾 Save settings');

  // password form
  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const next = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 8 });
  const conf = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const pwOut = h('div', { class: 'help', 'aria-live': 'polite' });
  const pwForm = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    if (next.value !== conf.value) {
      pwOut.textContent = 'The new passwords do not match.';
      pwOut.className = 'help bad-text';
      return;
    }
    try {
      await call(api.post('/api/admin/password', { current: cur.value, next: next.value }), { quiet: true });
      pwOut.textContent = '✔ Password changed.';
      pwOut.className = 'help good-text';
      cur.value = next.value = conf.value = '';
    } catch (err) {
      pwOut.textContent = `✖ ${err.message}`;
      pwOut.className = 'help bad-text';
    }
  } }, h('div', { class: 'grid3' }, field('Current password', cur), field('New password (8+ characters)', next), field('Confirm new password', conf)), h('button', { class: 'btn sm', type: 'submit' }, 'Change password'), pwOut);

  clear(main).append(
    pageHead('Settings', 'Server-wide defaults. Players cannot change the content policy.', save),
    section('🛡️ Content policy', 'Applies to everything players see. The core blocklist (profanity, romance, substances, violence, occult, hate) is always on and cannot be turned off.',
      switchRow('Strict Yeshiva Mode', s.content.strictMode, (v) => (draft.content.strictMode = v), 'Adds the extended list: other religions\' holidays, politics, non-kosher food, entertainment media, crude and scary words.'),
      switchRow('Jewish-themed challenges', s.content.jewishContent, (v) => (draft.content.jewishContent = v), 'Include challenges tagged "jewish" (holidays, Shabbos, Israel...) in rotation.'),
      switchRow('Require approval for AI-generated content', s.content.requireApproval, (v) => (draft.content.requireApproval = v), 'Recommended. Generated challenges wait as "pending" until an admin approves them.'),
      field('Extra blocked words', terms, 'Added to the blocklist for generated content, AI dialogue and player input in strict mode.')),
    section('🤖 AI provider', 'Without a key every game still works with curated content and offline engines.',
      switchRow('AI enabled', s.ai.enabled, (v) => (draft.ai.enabled = v)),
      h('div', { class: 'grid2' }, field('Provider', h('input', { class: 'input', value: 'Anthropic (Claude)', disabled: true })), field('Model', model, 'Default: claude-opus-5-5')),
      field('API key', keyInput, ''), keyState,
      s.ai.apiKey ? switchRow('Remove the stored key on save', false, (v) => (clearKey = v)) : null,
      h('div', { class: 'grid2' }, field('In-game chat effort', h('div', {}, effortSeg('chatEffort')), 'Low keeps answers fast for live play.'), field('Generation effort', h('div', {}, effortSeg('generationEffort')))),
      h('div', { class: 'grid3' },
        field('Daily token budget', num(draft.ai, 'dailyTokenBudget', { min: 1000, step: 100000 }), 'AI switches off for the day when reached.'),
        field('Max AI calls per level', num(draft.ai, 'maxAiCallsPerRound', { min: 1 })),
        field('AI requests / minute / IP', num(draft.ai, 'aiRequestsPerMinutePerIp', { min: 1 }))),
      h('div', { class: 'row' }, testBtn), testOut),
    section('🔊 Audio defaults', 'Starting volumes for a browser the first time it opens the site. Each classroom can still adjust its own.',
      slider('Music', draft.audio, 'musicVolume'), slider('Effects', draft.audio, 'sfxVolume'), slider('Voice', draft.audio, 'voiceVolume'),
      switchRow('Background music on', s.audio.musicEnabled, (v) => (draft.audio.musicEnabled = v))),
    section('🎙️ Host', '',
      switchRow('Game-show host on', s.host.enabled, (v) => (draft.host.enabled = v)),
      switchRow('Host voice (browser text-to-speech)', s.host.voice, (v) => (draft.host.voice = v))),
    section('🎮 Gameplay defaults', '',
      field('Default game mode', h('div', {}, segmented(MODES.map((m) => ({ value: m, label: cap(m) })), s.gameplay.defaultMode, (v) => (draft.gameplay.defaultMode = v)))),
      switchRow('Level timer on by default', s.gameplay.timerEnabled, (v) => (draft.gameplay.timerEnabled = v)),
      switchRow('Auto-generate AI challenges when pools run low', s.gameplay.autoGenerate, (v) => (draft.gameplay.autoGenerate = v), 'Only runs when approval is NOT required, so nothing unreviewed goes live.')),
    h('div', { class: 'row save-row' }, save.cloneNode(true)),
    section('🔐 Admin password', '', pwForm),
  );
  // the cloned save button needs its own handler
  main.querySelector('.save-row .btn').addEventListener('click', () => save.click());
}

// ---------------------------------------------------------------- audit + learned

async function viewAudit() {
  const { audit } = await call(api.get('/api/admin/audit'));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter…', 'aria-label': 'Filter audit log' });
  const box = h('div', {});
  const render = () => {
    const q = search.value.toLowerCase();
    const rows = audit.filter((a) => !q || `${a.actor} ${a.action} ${a.detail}`.toLowerCase().includes(q));
    box.replaceChildren(table(['Time', 'Actor', 'Action', 'Detail'], rows.map((a) => h('tr', {},
      h('td', { class: 'small' }, fmtDate(a.at)), h('td', {}, a.actor), h('td', {}, h('code', {}, a.action)), h('td', { class: 'small' }, a.detail || '')))));
  };
  search.addEventListener('input', render);
  clear(main).append(pageHead('Audit log', 'The latest 500 admin and system actions.', search), box);
  render();
}

async function viewLearned() {
  const { learned } = await call(api.get('/api/admin/learned'));
  clear(main).append(
    pageHead('Learned objects', 'Things classes used to beat the AI in "AI vs Class" Twenty Questions. Good candidates for new subjects.'),
    table(['When', 'Object', 'Questions the AI asked'], learned.map((l) => h('tr', {},
      h('td', { class: 'small' }, fmtDate(l.at)),
      h('td', {}, h('b', {}, l.name)),
      h('td', {}, l.history?.length ? h('details', {}, h('summary', {}, `${l.history.length} question${l.history.length === 1 ? '' : 's'}`),
        h('ol', { class: 'small' }, l.history.map((x) => h('li', {}, `${x.q} → ${x.a}`)))) : h('span', { class: 'muted' }, '—')))),
    'Nobody has stumped the AI yet.'));
}

// ---------------------------------------------------------------- boot

addEventListener('hashchange', () => {
  if (main) renderTab();
});

(async () => {
  try {
    const me = await api.get('/api/admin/me');
    if (me.admin) startShell();
    else renderLogin();
  } catch (err) {
    clear(root).append(h('div', { class: 'login-wrap' }, h('div', { class: 'login panel' }, h('h2', {}, 'Cannot reach the server'), h('p', { class: 'muted' }, err.message), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Retry'))));
  }
})();

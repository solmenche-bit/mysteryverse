// MYSTERYVERSE app: routing, home hub, lobbies, Mystery Shuffle and settings panels.
import { h, clear, toast, modal, confetti, sleep, startParticles, toggleFullscreen, difficultyPicker, segmented, switchRow, cap, DIFFS } from './ui.js';
import { api } from './api.js';
import { audio } from './audio/engine.js';
import { host } from './host.js';
import { store } from './store.js';
import { GameSession, showShortcuts } from './shell.js';
import { loadGame } from './games/registry.js';

const app = document.getElementById('app');
let status = null;
let session = null;

const MODE_OPTIONS = [
  { value: 'casual', label: 'Casual', help: 'Unlimited guesses' },
  { value: 'challenge', label: 'Challenge', help: 'Three mistakes per level' },
  { value: 'hardcore', label: 'Hardcore', help: 'One mistake ends the run' },
  { value: 'classroom', label: 'Classroom', help: 'No game over; keep trying as long as you like' },
];

// ---------------------------------------------------------------- boot

function applyRootClasses() {
  const s = store.settings;
  document.documentElement.classList.toggle('projector', !!s.projector);
  document.documentElement.classList.toggle('reduce-motion', !!s.reducedMotion);
}

function unlockAudioOnce() {
  const go = () => {
    audio.unlock();
    removeEventListener('pointerdown', go, true);
    removeEventListener('keydown', go, true);
    document.querySelector('.sound-nudge')?.remove();
  };
  addEventListener('pointerdown', go, true);
  addEventListener('keydown', go, true);
}

/** Opening splash with the credit. Stays at least ~1.8s (or until clicked) while the app loads. */
function showSplash() {
  const splash = h('div', { class: 'splash', role: 'presentation' },
    h('div', { class: 'splash-inner' },
      h('div', { class: 'splash-orb emoji' }, '🔮'),
      h('div', { class: 'logo' }, h('span', { class: 'lg' }, 'MYSTERYVERSE')),
      h('div', { class: 'tagline' }, 'One Screen. One Team. Endless Mysteries.'),
      h('div', { class: 'splash-credit' }, 'Made by Gedalia G'),
      h('div', { class: 'splash-skip muted' }, 'Click anywhere to start')));
  document.body.append(splash);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    splash.classList.add('out');
    setTimeout(() => splash.remove(), 500);
  };
  splash.addEventListener('click', close);
  return { close, minTime: sleep(store.settings.reducedMotion ? 600 : 1800) };
}

async function boot() {
  applyRootClasses();
  startParticles();
  unlockAudioOnce();
  const splash = showSplash();
  try {
    status = await api.status();
    store.applyServerDefaults(status.settings);
  } catch (err) {
    splash.close();
    clear(app).append(h('div', { class: 'loading' }, h('h2', {}, 'Cannot reach the MysteryVerse server'), h('p', { class: 'muted' }, err.message), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Retry')));
    return;
  }
  addEventListener('hashchange', route);
  route();
  await splash.minTime;
  splash.close();
}

const gameMeta = (id) => status.games.find((g) => g.id === id);
const readyGames = () => status.games.filter((g) => g.ready);

function route() {
  session?.destroy();
  session = null;
  const [path, qs] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  scrollTo(0, 0);
  if (parts[0] === 'game' && gameMeta(parts[1])) return renderLobby(gameMeta(parts[1]));
  if (parts[0] === 'play' && gameMeta(parts[1])) return startPlay(gameMeta(parts[1]), params);
  if (parts[0] === 'shuffle') return renderShuffleSetup();
  if (parts[0] === 'daily') return startDaily();
  renderHome();
}

const go = (hash) => {
  if (location.hash === hash) route();
  else location.hash = hash;
};

// ---------------------------------------------------------------- home

const DECO = {
  connection: '<svg viewBox="0 0 300 170"><g stroke="white" stroke-width="2" fill="none" opacity=".8"><circle cx="40" cy="40" r="10"/><circle cx="250" cy="35" r="12"/><circle cx="70" cy="140" r="9"/><circle cx="240" cy="135" r="10"/><circle cx="150" cy="85" r="16"/><path d="M48 46 136 80M240 42 164 80M77 133 138 95M232 128 162 95"/></g></svg>',
  password: '<svg viewBox="0 0 300 170"><g fill="white" font-family="monospace" font-size="16" opacity=".7"><text x="10" y="30">01001101 10110</text><text x="150" y="60">1101 00101</text><text x="20" y="150">0110 1011 0101</text><text x="190" y="140">101101</text></g></svg>',
  mysterybox: '<svg viewBox="0 0 300 170"><g stroke="white" stroke-width="2" fill="none" opacity=".7"><path d="M30 60 60 45 90 60 60 75Z M30 60v35l30 15V75 M90 60v35l-30 15"/><path d="M210 30l25-12 25 12-25 12Z M210 30v28l25 12V42 M260 30v28l-25 12"/></g></svg>',
  nextup: '<svg viewBox="0 0 300 170"><g fill="white" opacity=".55"><rect x="0" y="10" width="300" height="22"/><rect x="0" y="138" width="300" height="22"/></g><g fill="#0b1230">' + Array.from({ length: 12 }, (_, i) => `<rect x="${8 + i * 25}" y="15" width="12" height="12" rx="2"/><rect x="${8 + i * 25}" y="143" width="12" height="12" rx="2"/>`).join('') + '</g></svg>',
  fake: '<svg viewBox="0 0 300 170"><g stroke="white" stroke-width="3" fill="none" opacity=".7"><circle cx="60" cy="60" r="28"/><path d="M80 80 105 105"/><circle cx="240" cy="120" r="18"/><path d="M253 133 270 150"/></g></svg>',
  sound: '<svg viewBox="0 0 300 170"><path d="M0 85 ' + Array.from({ length: 60 }, (_, i) => `L${i * 5} ${85 + Math.sin(i * 0.7) * (10 + (i % 7) * 6)}`).join(' ') + '" stroke="white" stroke-width="2" fill="none" opacity=".7"/></svg>',
  twenty: '<svg viewBox="0 0 300 170"><g fill="white" font-family="sans-serif" font-weight="900" opacity=".5"><text x="20" y="60" font-size="44">?</text><text x="230" y="50" font-size="30">?</text><text x="250" y="150" font-size="50">?</text><text x="40" y="150" font-size="26">?</text></g></svg>',
};

function gameCard(g) {
  const p = store.progress(g.id);
  const total = Object.values(g.counts).reduce((a, b) => a + b, 0) || 1;
  const pct = Math.min(100, Math.round((p.completed / total) * 100));
  const diffIndex = DIFFS.indexOf(store.settings.difficulty);
  const card = h('article', { class: 'card', tabindex: '0', role: 'button', 'aria-label': `Play ${g.title}`, style: { '--accent': g.accent },
    onclick: () => go(`#/game/${g.id}`), onkeydown: (e) => e.key === 'Enter' && go(`#/game/${g.id}`) },
    h('div', { class: 'card-art' }, h('div', { class: 'deco', html: DECO[g.id] || '' }), h('div', { class: 'big-emoji emoji' }, g.emoji)),
    !g.ready ? h('span', { class: 'pill warn badge-soon' }, 'Coming soon') : null,
    h('div', { class: 'card-body' },
      h('h3', {}, g.title),
      h('p', {}, g.description),
      h('div', { class: 'card-meta' },
        h('span', { title: `Difficulty: ${cap(store.settings.difficulty)}` }, h('span', { class: 'dots' }, DIFFS.map((d, i) => h('i', { class: i <= diffIndex ? 'on' : '' }))), ' ', cap(store.settings.difficulty)),
        h('span', {}, `🏆 Best ${p.bestScore.toLocaleString()}`)),
      h('div', { class: 'bar', title: `${p.completed} levels completed` }, h('i', { style: { width: `${pct}%` } })),
      h('div', { class: 'card-meta' }, h('span', {}, `${p.completed} solved`), h('button', { class: 'btn sm primary', onclick: (e) => { e.stopPropagation(); go(`#/play/${g.id}`); } }, 'Play ▶'))),
  );
  return card;
}

function renderHome() {
  audio.setMood('menu');
  const last = store.last && gameMeta(store.last.game);
  const quick = [
    last ? { ico: '⏯️', title: 'Continue', sub: `${last.title} · ${cap(store.last.difficulty)}`, on: () => { store.setSettings({ difficulty: store.last.difficulty }); go(`#/play/${last.id}`); } } : null,
    { ico: '🎲', title: 'Random Game', sub: 'Surprise me!', on: () => { const r = readyGames(); go(`#/play/${r[Math.floor(Math.random() * r.length)].id}`); } },
    { ico: '📅', title: 'Daily Mystery', sub: 'Same puzzle for everyone today', on: () => go('#/daily') },
    { ico: '🏁', title: 'Group Challenge', sub: 'Split into teams and compete', on: () => teamSetup(() => go('#/shuffle')) },
    { ico: '🔊', title: 'Sound', sub: 'Music, effects and voice', on: soundSettings },
    { ico: '🧑‍🏫', title: 'Teacher Controls', sub: 'Modes, timer, host, projector', on: teacherControls },
  ].filter(Boolean);
  const diffPicker = difficultyPicker(store.settings.difficulty, (d) => {
    store.setSettings({ difficulty: d });
    renderCards();
  });
  const cards = h('div', { class: 'cards' });
  const renderCards = () => cards.replaceChildren(...status.games.map(gameCard));
  renderCards();
  const ai = status.ai;
  clear(app).append(h('div', { class: 'home' },
    h('section', { class: 'hero' },
      h('h1', { class: 'logo', 'aria-label': 'MYSTERYVERSE' }, h('span', { class: 'lg' }, 'MYSTERY'), h('span', { class: 'orb emoji', 'aria-hidden': 'true' }, '🔮'), h('span', { class: 'lg' }, 'VERSE')),
      h('div', { class: 'tagline' }, h('b', {}, 'One Screen.'), ' ', h('b', {}, 'One Team.'), ' Endless Mysteries.'),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn primary huge', onclick: () => document.getElementById('games').scrollIntoView({ behavior: 'smooth' }) }, '▶ Start Playing'),
        h('button', { class: 'btn huge cyan', onclick: () => go('#/shuffle') }, '🌀 Mystery Shuffle'))),
    h('section', { class: 'quick' }, quick.map((q) => h('button', { onclick: () => { audio.sfx('click'); q.on(); } }, h('span', { class: 'q-ico emoji' }, q.ico), h('span', { class: 'q-title' }, q.title), h('span', { class: 'q-sub' }, q.sub)))),
    h('div', { class: 'toolbar', id: 'games' }, h('h2', {}, 'Choose your mystery'), h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Difficulty'), diffPicker)),
    cards,
    h('footer', { class: 'footer' },
      status.settings.strictMode ? h('span', { class: 'pill good' }, '🛡️ Strict Yeshiva Mode ON') : h('span', { class: 'pill warn' }, 'Strict mode off'),
      ai.enabled ? h('span', { class: 'pill good' }, `🤖 AI connected (${ai.model})`) : h('span', { class: 'pill', title: ai.reason }, '🧠 Offline engines (no AI key)'),
      h('span', { class: 'pill' }, `⭐ Total score ${store.totalScore.toLocaleString()}`),
      h('button', { class: 'pill', style: { cursor: 'pointer' }, onclick: showShortcuts }, '⌨️ Shortcuts'),
      h('a', { class: 'pill', href: '/admin' }, '🔐 Admin')),
    h('div', { class: 'credit' }, 'Made by Gedalia G'),
  ));
  if (!audio.ready) app.prepend(h('div', { class: 'sound-nudge pill', style: { position: 'fixed', top: '14px', right: '14px', zIndex: 30 } }, '🔊 Click anywhere to turn on sound'));
}

// ---------------------------------------------------------------- lobby

async function renderLobby(g) {
  audio.setMood('menu');
  let difficulty = store.settings.difficulty;
  const opts = {};
  const mod = await loadGame(g.id).catch(() => null);
  const optionRows = (mod?.options || []).map((o) => {
    opts[o.key] = o.choices[0].value;
    return h('div', { class: 'field' }, h('div', { class: 'label' }, o.label), segmented(o.choices, o.choices[0].value, (v) => (opts[o.key] = v)));
  });
  clear(app).append(h('div', { class: 'lobby', style: { '--accent': g.accent } },
    h('button', { class: 'btn sm ghost', onclick: () => go('#/') }, '⟵ All games'),
    h('div', { class: 'lobby-hero' }, h('div', { class: 'big-emoji emoji' }, g.emoji), h('div', {}, h('h1', {}, g.title), h('div', { class: 'tagline', style: { margin: 0 } }, g.tagline))),
    h('div', { class: 'section panel' }, h('h3', {}, 'How to play'), h('ul', { class: 'howto' }, (mod?.howTo || [g.description]).map((t) => h('li', {}, t)))),
    h('div', { class: 'section panel' },
      h('h3', {}, 'Difficulty'), difficultyPicker(difficulty, (d) => { difficulty = d; store.setSettings({ difficulty: d }); }, g.counts),
      optionRows,
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Game mode'), segmented(MODE_OPTIONS, store.settings.mode, (m) => store.setSettings({ mode: m })),
        h('div', { class: 'help' }, 'Casual: unlimited guesses · Challenge: 3 mistakes per level · Hardcore: 1 mistake ends the run · Classroom: never game over'))),
    h('div', { class: 'lobby-start' },
      g.ready
        ? h('button', { class: 'btn primary huge', onclick: () => { const q = new URLSearchParams({ d: difficulty, ...Object.fromEntries(Object.entries(opts).map(([k, v]) => [`o_${k}`, String(v)])) }); go(`#/play/${g.id}?${q}`); } }, `▶ Start Level ${store.levelNumber(g.id, difficulty)}`)
        : h('p', { class: 'muted' }, 'This game is still being built.')),
  ));
}

function parseOptions(params) {
  const o = {};
  for (const [k, v] of params) if (k.startsWith('o_')) o[k.slice(2)] = v === 'true' ? true : v === 'false' ? false : v;
  return o;
}

function startPlay(g, params, extra = {}) {
  const difficulty = DIFFS.includes(params.get('d')) ? params.get('d') : store.settings.difficulty;
  const options = { slowReveal: store.settings.slowReveal, ...parseOptions(params) };
  session = new GameSession(app, { meta: g, difficulty, challengeId: params.get('c'), options, onExit: () => go('#/'), ...extra });
  session.startLevel();
}

async function startDaily() {
  try {
    const d = await api.daily();
    const g = gameMeta(d.game);
    if (!g || !d.challengeId) throw new Error('No daily mystery today.');
    clear(app).append(h('div', { class: 'shuffle-setup' },
      h('div', { class: 'emoji', style: { fontSize: '5rem' } }, '📅'),
      h('h1', {}, 'Daily Mystery'),
      h('p', { class: 'tagline' }, `Today: ${g.emoji} ${g.title} · ${cap(d.difficulty)}`),
      h('p', { class: 'muted' }, 'Every group gets the same mystery today. Can your class crack it?'),
      h('button', { class: 'btn primary huge', onclick: () => startPlay(g, new URLSearchParams({ d: d.difficulty, c: d.challengeId })) }, '▶ Play today\'s mystery'),
      h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn ghost', onclick: () => go('#/') }, '⟵ Home'))));
  } catch (err) {
    toast(err.message, 'bad');
    go('#/');
  }
}

// ---------------------------------------------------------------- shuffle

function renderShuffleSetup() {
  audio.setMood('shuffle');
  let rounds = 5;
  let diff = 'ramp';
  clear(app).append(h('div', { class: 'shuffle-setup' },
    h('button', { class: 'btn sm ghost', onclick: () => go('#/') }, '⟵ Home'),
    h('div', { class: 'emoji', style: { fontSize: '5rem', marginTop: '20px' } }, '🌀'),
    h('h1', { class: 'grad-text', style: { fontSize: 'clamp(2.4rem, 7vw, 4.4rem)', fontWeight: 900 } }, 'Mystery Shuffle'),
    h('p', { class: 'tagline' }, 'Every round is a surprise game. It\'s a mystery game show!'),
    h('div', { class: 'section panel', style: { padding: '20px', textAlign: 'left' } },
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Rounds'), segmented([{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 20, label: '20' }, { value: 0, label: 'Endless ∞' }], 5, (v) => (rounds = v))),
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Difficulty'), segmented([{ value: 'ramp', label: 'Ramp up 📈' }, ...DIFFS.map((d) => ({ value: d, label: cap(d) }))], 'ramp', (v) => (diff = v))),
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Game mode'), segmented(MODE_OPTIONS, store.settings.mode, (m) => store.setSettings({ mode: m }))),
      switchRow('Team mode', store.settings.teams.enabled, (v) => store.setSettings({ teams: { enabled: v } }), 'Teams take turns; points go to the team whose turn it is.'),
      h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onclick: () => teamSetup() }, '✏️ Edit teams'))),
    h('div', { style: { marginTop: '24px' } }, h('button', { class: 'btn primary huge', onclick: () => runShuffle(rounds, diff) }, '▶ Start the show')),
  ));
}

async function runShuffle(totalRounds, diffSetting) {
  const games = readyGames();
  let round = 0;
  let score = 0;
  let wins = 0;
  let lastGame = null;
  const diffFor = (r) => (diffSetting === 'ramp' ? DIFFS[Math.min(4, Math.floor(r / Math.max(2, Math.ceil((totalRounds || 10) / 5))))] : diffSetting);

  const next = async (result) => {
    if (result) {
      score += result.points;
      if (result.outcome === 'win') wins++;
    }
    session?.destroy();
    session = null;
    if (result?.runOver || (totalRounds && round >= totalRounds)) return shuffleSummary(round, wins, score);
    round++;
    const pool = games.filter((g) => g.id !== lastGame);
    const g = pool[Math.floor(Math.random() * pool.length)];
    lastGame = g.id;
    await slotReveal(round, totalRounds, g, games);
    if (!location.hash.startsWith('#/shuffle')) return;
    session = new GameSession(app, {
      meta: g, difficulty: diffFor(round - 1), options: { slowReveal: store.settings.slowReveal },
      shuffle: { label: totalRounds ? `${round}/${totalRounds}` : `${round}`, score, isLast: !!totalRounds && round >= totalRounds, onNext: next },
      onExit: () => go('#/'),
    });
    session.startLevel();
  };
  next(null);
}

async function slotReveal(round, total, game, games) {
  audio.setMood('shuffle');
  audio.sfx('drumroll');
  const reel = h('div', { class: 'slot-reel' });
  const sequence = [];
  for (let i = 0; i < 14; i++) sequence.push(games[i % games.length]);
  sequence.push(game);
  reel.append(...sequence.map((g) => h('div', { class: 'slot-item' }, h('span', { class: 'emoji' }, g.emoji), g.title)));
  const name = h('div', { class: 'slot-name hidden' }, game.title);
  const overlay = h('div', { class: 'slot' }, h('div', { class: 'slot-inner' },
    h('div', { class: 'slot-round' }, total ? `Round ${round} of ${total}` : `Round ${round}`),
    h('div', { class: 'slot-window' }, reel), name,
    h('div', { class: 'muted', style: { marginTop: '10px' } }, host.line('shuffle'))));
  document.body.append(overlay);
  const itemH = 180;
  const dist = (sequence.length - 1) * itemH;
  reel.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${dist}px)` }], { duration: 1700, easing: 'cubic-bezier(0.15, 0.6, 0.2, 1)', fill: 'forwards' });
  await sleep(1750);
  name.classList.remove('hidden');
  audio.sfx('reveal');
  await sleep(1100);
  overlay.remove();
}

function shuffleSummary(rounds, wins, score) {
  audio.setMood('menu');
  if (wins) {
    audio.sting('victory');
    confetti(4000);
  }
  const t = store.settings.teams;
  const best = t.enabled ? [...t.list].sort((a, b) => b.score - a.score) : [];
  clear(app).append(h('div', { class: 'shuffle-setup' },
    h('div', { class: 'emoji', style: { fontSize: '5rem' } }, '🏆'),
    h('h1', { class: 'grad-text', style: { fontSize: 'clamp(2.4rem, 7vw, 4.4rem)', fontWeight: 900 } }, 'Show complete!'),
    h('div', { class: 'points' }, `${score.toLocaleString()} POINTS`),
    h('p', { class: 'tagline' }, `${wins} of ${rounds} mysteries solved`),
    best.length ? h('div', { class: 'panel', style: { padding: '16px', margin: '16px auto', maxWidth: '420px' } }, best.map((team, i) => h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '1.3rem' } }, h('b', {}, `${i === 0 ? '👑 ' : ''}${team.name}`), h('span', {}, team.score.toLocaleString())))) : null,
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '20px' } },
      h('button', { class: 'btn primary big', onclick: () => go('#/shuffle') }, 'Play again'),
      h('button', { class: 'btn big', onclick: () => go('#/') }, 'Home'))));
}

// ---------------------------------------------------------------- panels

function soundSettings() {
  const a = store.settings.audio;
  const slider = (label, key) => {
    const val = h('span', {}, `${Math.round(a[key] * 100)}`);
    const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: a[key], 'aria-label': label });
    input.addEventListener('input', () => {
      store.setSettings({ audio: { [key]: Number(input.value) } });
      val.textContent = `${Math.round(input.value * 100)}`;
      audio.applyVolumes();
    });
    input.addEventListener('change', () => audio.sfx(key === 'music' ? 'click' : 'correct'));
    return h('div', { class: 'range' }, h('span', {}, label), input, val);
  };
  modal({
    title: '🔊 Sound',
    body: h('div', {},
      slider('Master', 'master'), slider('Music', 'music'), slider('Effects', 'sfx'), slider('Voice', 'voice'),
      switchRow('Mute everything', a.muted, (v) => { store.setSettings({ audio: { muted: v } }); audio.applyVolumes(); }),
      switchRow('Background music', a.musicOn, (v) => { store.setSettings({ audio: { musicOn: v } }); audio.applyVolumes(); }),
      switchRow('Sound effects', a.sfxOn, (v) => { store.setSettings({ audio: { sfxOn: v } }); audio.applyVolumes(); }),
      switchRow('Host voice', store.settings.host.voice, (v) => store.setSettings({ host: { voice: v } }), 'Uses your browser\'s built-in text-to-speech.'),
      h('p', { class: 'muted' }, 'All music is original, generated live in your browser. Instrumental only.'),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => audio.sting('victory') }, 'Test victory'), h('button', { class: 'btn sm', onclick: () => audio.sfx('wrong') }, 'Test wrong answer'), h('button', { class: 'btn sm', onclick: () => { store.setSettings({ host: { voice: true } }); host.say('welcome'); audio.speak('Welcome to Mysteryverse!'); } }, 'Test voice'))),
  });
}

function teacherControls() {
  const s = store.settings;
  const secs = h('input', { class: 'input', type: 'number', min: 20, max: 900, step: 10, value: s.timer.seconds, style: { maxWidth: '140px' } });
  secs.addEventListener('change', () => store.setSettings({ timer: { seconds: Math.max(20, Math.min(900, Number(secs.value) || 120)) } }));
  modal({
    title: '🧑‍🏫 Teacher controls',
    body: h('div', {},
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Game mode'), segmented(MODE_OPTIONS, s.mode, (m) => store.setSettings({ mode: m })),
        h('div', { class: 'help' }, 'Classroom mode never ends a level by itself. The group can keep trying.')),
      switchRow('Level timer', s.timer.enabled, (v) => store.setSettings({ timer: { enabled: v } }), 'Countdown with tension music in the last 10 seconds. Harder levels get more time.'),
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Timer seconds (easy level)'), secs),
      switchRow('Game-show host', s.host.enabled, (v) => store.setSettings({ host: { enabled: v } }), 'Friendly commentary between guesses.'),
      switchRow('Host voice', s.host.voice, (v) => store.setSettings({ host: { voice: v } })),
      switchRow('Projector mode (extra large)', s.projector, (v) => { store.setSettings({ projector: v }); applyRootClasses(); }),
      switchRow('Reduce motion', s.reducedMotion, (v) => { store.setSettings({ reducedMotion: v }); applyRootClasses(); }),
      switchRow('Connection: reveal pictures one at a time', s.slowReveal, (v) => store.setSettings({ slowReveal: v }), 'Bonus points for solving before all five appear.'),
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('button', { class: 'btn sm', onclick: () => teamSetup() }, '🏁 Teams'),
        h('button', { class: 'btn sm', onclick: toggleFullscreen }, '⛶ Fullscreen'),
        h('button', { class: 'btn sm danger', onclick: () => { if (confirm('Reset all scores and progress on this computer?')) { store.resetProgress(); toast('Progress reset'); route(); } } }, 'Reset progress'),
        h('a', { class: 'btn sm', href: '/admin' }, '🔐 Admin dashboard'))),
    onClose: () => route(),
  });
}

function teamSetup(after) {
  const t = store.settings.teams;
  let count = Math.max(2, t.list.length);
  const names = t.list.map((x) => x.name);
  const defaults = ['Team Blue', 'Team Purple', 'Team Cyan', 'Team Gold', 'Team Green', 'Team Pink'];
  const list = h('div', {});
  const renderList = () => list.replaceChildren(...Array.from({ length: count }, (_, i) => {
    const input = h('input', { class: 'input', value: names[i] || defaults[i], maxlength: 24, style: { fontSize: '1.05rem', marginBottom: '8px' } });
    input.addEventListener('input', () => (names[i] = input.value));
    names[i] ||= defaults[i];
    return input;
  }));
  renderList();
  modal({
    title: '🏁 Group Challenge: teams',
    body: h('div', {},
      h('p', { class: 'muted' }, 'Teams take turns. When a level is solved, the points go to the team whose turn it is. Cooperative play is still the default: turn team mode off any time.'),
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Number of teams'), segmented([2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) })), count, (n) => { count = n; renderList(); })),
      list),
    actions: [
      { label: 'Turn teams off', onClick: (close) => { store.setSettings({ teams: { enabled: false } }); close(); toast('Team mode off'); } },
      { label: 'Reset scores & start', primary: true, onClick: (close) => {
        store.setSettings({ teams: { enabled: true, active: 0, list: names.slice(0, count).map((n, i) => ({ name: (n || defaults[i]).trim().slice(0, 24), score: 0 })) } });
        close();
        toast('Teams ready!', 'good');
        after?.();
      } },
    ],
  });
}

boot();

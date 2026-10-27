// Per-browser settings and progress (localStorage). Everything degrades gracefully
// when storage is unavailable: the game simply forgets between visits.
const KEY = 'mysteryverse.v1';

const DEFAULTS = {
  settings: {
    difficulty: 'easy',
    mode: 'casual',
    timer: { enabled: false, seconds: 120 },
    host: { enabled: true, voice: false },
    audio: { master: 0.8, music: 0.35, sfx: 0.7, voice: 0.8, muted: false, musicOn: true, sfxOn: true },
    projector: false,
    reducedMotion: false,
    slowReveal: false,
    showHowTo: true,
    teams: { enabled: false, list: [{ name: 'Team Blue', score: 0 }, { name: 'Team Purple', score: 0 }], active: 0 },
  },
  progress: {},
  last: null,
  totalScore: 0,
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const deepMerge = (base, over) => {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  return out;
};

let state = deepMerge(DEFAULTS, read());
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or storage full */
  }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get settings() { return state.settings; },
  get last() { return state.last; },
  get totalScore() { return state.totalScore; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  setSettings(patch) {
    state.settings = deepMerge(state.settings, patch);
    save();
  },
  /** Apply server-side admin defaults the first time this browser runs. */
  applyServerDefaults(s) {
    if (state.serverDefaultsApplied) return;
    state.settings.audio.music = s.audio.musicVolume;
    state.settings.audio.sfx = s.audio.sfxVolume;
    state.settings.audio.voice = s.audio.voiceVolume;
    state.settings.audio.musicOn = s.audio.musicEnabled;
    state.settings.host.enabled = s.host.enabled;
    state.settings.host.voice = s.host.voice;
    state.settings.mode = s.gameplay.defaultMode;
    state.settings.timer.enabled = s.gameplay.timerEnabled;
    state.serverDefaultsApplied = true;
    save();
  },

  progress(game) {
    return (state.progress[game] ||= { completed: 0, bestScore: 0, totalScore: 0, hints: 0, mistakes: 0, seconds: 0, levels: {}, played: [] });
  },
  played(game) { return this.progress(game).played; },
  markPlayed(game, challengeId) {
    const p = this.progress(game);
    p.played = [...p.played.filter((id) => id !== challengeId), challengeId].slice(-300);
    save();
  },
  levelNumber(game, difficulty) { return (this.progress(game).levels[difficulty] || 0) + 1; },
  recordResult(game, difficulty, { solved, points = 0, hints = 0, mistakes = 0, seconds = 0 }) {
    const p = this.progress(game);
    if (solved) {
      p.completed += 1;
      p.levels[difficulty] = (p.levels[difficulty] || 0) + 1;
      p.totalScore += points;
      p.bestScore = Math.max(p.bestScore, points);
      state.totalScore += points;
    }
    p.hints += hints;
    p.mistakes += mistakes;
    p.seconds += seconds;
    save();
  },
  setLast(last) {
    state.last = { ...last, at: Date.now() };
    save();
  },
  addTeamPoints(points) {
    const t = state.settings.teams;
    if (!t.enabled || !t.list.length) return null;
    const team = t.list[t.active % t.list.length];
    team.score += points;
    save();
    return team;
  },
  nextTeam() {
    const t = state.settings.teams;
    if (!t.enabled || !t.list.length) return null;
    t.active = (t.active + 1) % t.list.length;
    save();
    return t.list[t.active];
  },
  resetProgress() {
    state.progress = {};
    state.totalScore = 0;
    state.last = null;
    save();
  },
};

// Server-side game rounds. Each round holds the hidden solution state for one level;
// the browser only ever receives the public view.
import crypto from 'node:crypto';

const rounds = new Map();
const TTL_MS = 6 * 3600_000;
const MAX_ROUNDS = 20_000;

export const MODE_LIMITS = { casual: Infinity, challenge: 3, hardcore: 1, classroom: Infinity };
export const BASE_POINTS = { easy: 100, medium: 200, hard: 300, expert: 400, insane: 500 };

export function createRound({ game, challenge, difficulty, mode }) {
  if (rounds.size >= MAX_ROUNDS) prune(true);
  const round = {
    id: crypto.randomBytes(16).toString('hex'),
    game,
    challengeId: challenge.id,
    difficulty,
    mode: MODE_LIMITS[mode] !== undefined ? mode : 'casual',
    startedAt: Date.now(),
    touchedAt: Date.now(),
    hintsUsed: 0,
    mistakes: 0,
    aiCalls: 0,
    solved: false,
    finished: false,
    bonuses: [],
    state: {},
  };
  rounds.set(round.id, round);
  return round;
}

export function getRound(id) {
  const r = rounds.get(String(id || ''));
  if (r) r.touchedAt = Date.now();
  return r || null;
}

function prune(full = false) {
  const now = Date.now();
  for (const [id, r] of rounds) if (now - r.touchedAt > TTL_MS) rounds.delete(id);
  if (full && rounds.size >= MAX_ROUNDS) {
    // Still full: drop the least recently used tenth.
    [...rounds.values()].sort((a, b) => a.touchedAt - b.touchedAt).slice(0, MAX_ROUNDS / 10).forEach((r) => rounds.delete(r.id));
  }
}
setInterval(prune, 10 * 60_000).unref();

export const mistakesAllowed = (round) => (Number.isFinite(MODE_LIMITS[round.mode]) ? MODE_LIMITS[round.mode] : null);

/** Count a wrong guess. Returns the fields every game merges into its action result. */
export function registerMistake(round) {
  round.mistakes += 1;
  const limit = MODE_LIMITS[round.mode];
  const failed = round.mistakes >= limit;
  if (failed) round.finished = true;
  return {
    mistake: true,
    mistakes: round.mistakes,
    mistakesAllowed: mistakesAllowed(round),
    failed,
    runOver: failed && round.mode === 'hardcore',
  };
}

export function addBonus(round, label, points) {
  round.bonuses.push({ label, points: Math.round(points) });
}

export function computeScore(round, estSeconds = 120) {
  const base = BASE_POINTS[round.difficulty] ?? 100;
  const lines = [{ label: `${cap(round.difficulty)} level`, points: base }];
  if (round.hintsUsed) lines.push({ label: `${round.hintsUsed} hint${round.hintsUsed > 1 ? 's' : ''} used`, points: -Math.round(base * Math.min(0.6, 0.2 * round.hintsUsed)) });
  else lines.push({ label: 'No hints bonus', points: Math.round(base * 0.25) });
  if (round.mistakes) lines.push({ label: `${round.mistakes} wrong guess${round.mistakes > 1 ? 'es' : ''}`, points: -Math.round(base * Math.min(0.5, 0.1 * round.mistakes)) });
  const seconds = (Date.now() - round.startedAt) / 1000;
  if (seconds < estSeconds * 0.5) lines.push({ label: 'Lightning fast', points: Math.round(base * 0.15) });
  lines.push(...round.bonuses);
  const raw = lines.reduce((s, l) => s + l.points, 0);
  const total = Math.max(Math.round(base * 0.25 / 10) * 10, Math.round(raw / 10) * 10);
  return { total, lines, seconds: Math.round(seconds) };
}

/** Mark solved and compute the score. */
export function solveRound(round, estSeconds) {
  round.solved = true;
  round.finished = true;
  round.score = computeScore(round, estSeconds);
  return { solved: true, correct: true, score: round.score };
}

export function failRound(round) {
  round.finished = true;
  return { failed: true, runOver: round.mode === 'hardcore' };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

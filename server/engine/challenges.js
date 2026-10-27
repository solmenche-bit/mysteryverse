// Challenge library: curated seed content, generated/procedural content, admin edits, and selection.
import crypto from 'node:crypto';
import { db, persist, getSettings } from '../db.js';
import { DIFFICULTIES } from '../config.js';

const hashOf = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12);
const now = () => new Date().toISOString();

export function newChallenge({ game, difficulty, data, source, status, title = '', tags = [], validation = null, moderation = null, id }) {
  const ch = {
    id: id || `${game}-${source}-${crypto.randomBytes(5).toString('hex')}`,
    game,
    difficulty,
    title,
    tags,
    source,            // curated | ai | procedural | admin
    status,            // approved | pending | rejected | removed
    data,
    validation,
    moderation,
    stats: { plays: 0, solves: 0, fails: 0, skips: 0, totalSeconds: 0 },
    createdAt: now(),
    updatedAt: now(),
  };
  db().challenges[ch.id] = ch;
  persist();
  return ch;
}

/** Insert curated challenges; refresh ones the admin hasn't edited when the source changes. */
export function seedCurated(games) {
  const all = db().challenges;
  let added = 0;
  let updated = 0;
  for (const g of games) {
    for (const c of g.curated || []) {
      if ((db().deletedCurated || []).includes(c.id)) continue;
      const hash = hashOf(c);
      const existing = all[c.id];
      const title = c.title || g.summarize?.(c.data) || c.id;
      if (!existing) {
        newChallenge({ id: c.id, game: g.id, difficulty: c.difficulty, data: c.data, source: 'curated', status: 'approved', title, tags: c.tags || [] });
        all[c.id].curatedHash = hash;
        added++;
      } else if (existing.source === 'curated' && !existing.editedByAdmin && existing.curatedHash !== hash) {
        Object.assign(existing, { data: c.data, difficulty: c.difficulty, title, tags: c.tags || [], curatedHash: hash, updatedAt: now() });
        updated++;
      }
    }
  }
  persist();
  return { added, updated };
}

export function getChallenge(id) {
  return db().challenges[id] || null;
}

export function listChallenges({ game, status, difficulty, source, q } = {}) {
  const needle = (q || '').toLowerCase();
  return Object.values(db().challenges)
    .filter((c) => (!game || c.game === game) && (!status || c.status === status) && (!difficulty || c.difficulty === difficulty) && (!source || c.source === source))
    .filter((c) => !needle || c.id.toLowerCase().includes(needle) || (c.title || '').toLowerCase().includes(needle) || JSON.stringify(c.data).toLowerCase().includes(needle))
    .sort((a, b) => a.game.localeCompare(b.game) || DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty) || a.id.localeCompare(b.id));
}

export function countByDifficulty(gameId) {
  const out = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0]));
  for (const c of Object.values(db().challenges)) if (c.game === gameId && c.status === 'approved') out[c.difficulty] = (out[c.difficulty] || 0) + 1;
  return out;
}

const playable = (c, gameId, jewishOk) => c.game === gameId && c.status === 'approved' && (jewishOk || !(c.tags || []).includes('jewish'));

/**
 * Pick the next challenge for a game/difficulty, avoiding ones this group played recently.
 * Procedural games mint a fresh challenge when the stored pool runs out.
 */
export function pickChallenge(game, difficulty, { exclude = [] } = {}) {
  const jewishOk = getSettings().content.jewishContent;
  const all = Object.values(db().challenges).filter((c) => playable(c, game.id, jewishOk));
  const seen = new Set(exclude);
  const atLevel = all.filter((c) => c.difficulty === difficulty);
  let fresh = atLevel.filter((c) => !seen.has(c.id));

  if (!fresh.length && game.procedural) {
    const data = game.procedural(difficulty);
    const ch = newChallenge({ game: game.id, difficulty, data, source: 'procedural', status: 'approved', title: game.summarize?.(data) || 'Generated level' });
    return { challenge: ch, recycled: false, generated: true };
  }
  let recycled = false;
  if (!fresh.length && atLevel.length) {
    fresh = atLevel;
    recycled = true;
  }
  if (!fresh.length) {
    // Nothing at this difficulty: walk outward to the nearest difficulty that has content.
    const i = DIFFICULTIES.indexOf(difficulty);
    for (let d = 1; d < DIFFICULTIES.length && !fresh.length; d++) {
      for (const j of [i - d, i + d]) {
        const near = all.filter((c) => c.difficulty === DIFFICULTIES[j]);
        const nearFresh = near.filter((c) => !seen.has(c.id));
        if (nearFresh.length || near.length) {
          fresh = nearFresh.length ? nearFresh : near;
          break;
        }
      }
    }
  }
  if (!fresh.length) return null;
  return { challenge: fresh[Math.floor(Math.random() * fresh.length)], recycled };
}

/** Same pick for everyone on a given date. */
export function dailyPick(games) {
  const day = new Date().toISOString().slice(0, 10);
  const h = parseInt(hashOf(day), 16);
  const game = games[h % games.length];
  const difficulty = ['easy', 'medium', 'medium', 'hard', 'hard', 'expert', 'insane'][new Date().getDay()];
  const jewishOk = getSettings().content.jewishContent;
  const pool = Object.values(db().challenges)
    .filter((c) => playable(c, game.id, jewishOk) && c.difficulty === difficulty && c.source !== 'procedural')
    .sort((a, b) => a.id.localeCompare(b.id));
  const challenge = pool.length ? pool[h % pool.length] : null;
  return { day, game: game.id, difficulty, challengeId: challenge?.id || null };
}

export function updateChallenge(id, patch, actor = 'admin') {
  const c = db().challenges[id];
  if (!c) return null;
  for (const k of ['difficulty', 'status', 'title', 'tags', 'data', 'validation', 'moderation']) if (k in patch) c[k] = patch[k];
  if ('data' in patch || 'difficulty' in patch) c.editedByAdmin = actor === 'admin' || c.editedByAdmin;
  c.updatedAt = now();
  persist();
  return c;
}

export function deleteChallenge(id) {
  const existed = !!db().challenges[id];
  delete db().challenges[id];
  persist();
  return existed;
}

export function recordStat(id, field, seconds) {
  const c = db().challenges[id];
  if (!c) return;
  c.stats ||= { plays: 0, solves: 0, fails: 0, skips: 0, totalSeconds: 0 };
  c.stats[field] = (c.stats[field] || 0) + 1;
  if (seconds) c.stats.totalSeconds += seconds;
  persist();
}

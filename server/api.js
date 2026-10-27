// HTTP API: public play endpoints and the protected admin API.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRouter, HttpError, readBody, clientIp, isHttps } from './http.js';
import { DIFFICULTIES, MODES, UPLOAD_DIR } from './config.js';
import { db, persist, audit, getSettings, updateSettings } from './db.js';
import { GAMES, GAME_MAP } from './games/index.js';
import { createRound, getRound, mistakesAllowed, failRound } from './engine/rounds.js';
import {
  pickChallenge, getChallenge, listChallenges, countByDifficulty, dailyPick, newChallenge, updateChallenge, deleteChallenge, recordStat,
} from './engine/challenges.js';
import { enqueueGeneration, maybeAutoRefill, queueLength } from './engine/generation.js';
import { aiStatus, aiSelfTest } from './ai/provider.js';
import { moderateChallenge } from './safety/moderate.js';
import { scanPlayerText } from './safety/policy.js';
import {
  rateLimit, isAdmin, verifyAdminPassword, createAdminSession, destroyAdminSession, adminCookie, clearAdminCookie, setAdminPassword,
} from './security.js';

export const router = createRouter();
const r = router;

const requireAdmin = (req) => {
  if (!isAdmin(req)) throw new HttpError(401, 'Admin login required');
};

const gameMeta = (g) => ({
  id: g.id, title: g.title, tagline: g.tagline, description: g.description, emoji: g.emoji, accent: g.accent,
  ready: !!(g.curated?.length || g.procedural), generationKind: g.generationKind, counts: countByDifficulty(g.id),
});

// ---------------------------------------------------------------- public

r.get('/api/status', () => {
  const s = getSettings();
  return {
    name: 'MYSTERYVERSE',
    ai: aiStatus(),
    games: GAMES.map(gameMeta),
    settings: {
      strictMode: s.content.strictMode,
      jewishContent: s.content.jewishContent,
      audio: s.audio,
      host: s.host,
      gameplay: { defaultMode: s.gameplay.defaultMode, timerEnabled: s.gameplay.timerEnabled },
    },
  };
});

r.get('/api/daily', () => dailyPick(GAMES.filter((g) => g.curated?.length)));

r.post('/api/play/start', async ({ body, req }) => {
  const game = GAME_MAP[body.game];
  if (!game) throw new HttpError(404, 'Unknown game');
  const settings = getSettings();
  const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : 'easy';
  const mode = MODES.includes(body.mode) ? body.mode : settings.gameplay.defaultMode;
  let challenge;
  let recycled = false;
  if (body.challengeId) {
    challenge = getChallenge(String(body.challengeId));
    if (!challenge || challenge.game !== game.id) throw new HttpError(404, 'Challenge not found');
    if (challenge.status !== 'approved' && !isAdmin(req)) throw new HttpError(403, 'That challenge is not available');
  } else {
    const exclude = Array.isArray(body.exclude) ? body.exclude.slice(-400).map(String) : [];
    const pick = pickChallenge(game, difficulty, { exclude });
    if (!pick) throw new HttpError(404, `No ${game.title} challenges are available yet.`);
    challenge = pick.challenge;
    recycled = pick.recycled;
  }
  const round = createRound({ game: game.id, challenge, difficulty: challenge.difficulty, mode });
  const view = await game.start(round, challenge, body.options || {});
  recordStat(challenge.id, 'plays');
  maybeAutoRefill(game.id, challenge.difficulty);
  return {
    roundId: round.id,
    game: game.id,
    challengeId: round.challengeId,
    difficulty: round.difficulty,
    mode: round.mode,
    mistakesAllowed: mistakesAllowed(round),
    recycled,
    source: challenge.source,
    view,
  };
});

const AI_ACTIONS = new Set(['ask', 'guess', 'chat', 'question', 'predict', 'rnext', 'ranswer', 'explain']);

r.post('/api/play/action', async ({ body, req }) => {
  const round = getRound(body.roundId);
  if (!round) throw new HttpError(410, 'This level has expired. Start a new one!');
  const game = GAME_MAP[round.game];
  const challenge = getChallenge(round.challengeId);
  if (!challenge) throw new HttpError(410, 'This challenge was removed by the admin. Start a new level!');
  const action = String(body.action || '');
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const elapsed = () => Math.round((Date.now() - round.startedAt) / 1000);

  if (round.finished && action !== 'reveal' && !(game.postGameActions || []).includes(action)) return { ok: false, finished: true, message: 'This level is already over.' };
  if (AI_ACTIONS.has(action) && aiStatus().enabled) {
    if (!rateLimit(`ai:${clientIp(req)}`, getSettings().ai.aiRequestsPerMinutePerIp)) {
      throw new HttpError(429, 'Whoa, slow down! The AI needs a few seconds to catch its breath.');
    }
  }

  switch (action) {
    case 'hint': {
      const hint = game.hint(round, challenge);
      if (!hint) return { ok: true, hint: null, message: 'No more hints for this one!' };
      round.hintsUsed += 1;
      return { ok: true, hint, hintsUsed: round.hintsUsed };
    }
    case 'giveup':
    case 'timeout': {
      const fail = failRound(round);
      recordStat(challenge.id, 'fails', elapsed());
      return { ok: true, ...fail, timeout: action === 'timeout', reveal: game.reveal(round, challenge) };
    }
    case 'skip': {
      round.finished = true;
      recordStat(challenge.id, 'skips');
      return { ok: true, skipped: true, reveal: game.reveal(round, challenge) };
    }
    case 'reveal':
      if (!round.finished) throw new HttpError(400, 'Finish the level first');
      return { ok: true, reveal: game.reveal(round, challenge) };
    default: {
      const fn = game.actions?.[action];
      if (typeof fn !== 'function') throw new HttpError(400, `Unknown action "${action}"`);
      const result = (await game.actions[action](round, challenge, payload, { req })) || {};
      if (result.solved) {
        recordStat(challenge.id, 'solves', elapsed());
        result.reveal ||= game.reveal(round, challenge);
      } else if (result.failed) {
        recordStat(challenge.id, 'fails', elapsed());
        result.reveal ||= game.reveal(round, challenge);
      }
      return { ok: true, ...result };
    }
  }
});

r.post('/api/play/report', ({ body, req }) => {
  if (!rateLimit(`report:${clientIp(req)}`, 10)) throw new HttpError(429, 'Too many reports. Try again in a minute.');
  const challenge = getChallenge(String(body.challengeId || ''));
  if (!challenge) throw new HttpError(404, 'Challenge not found');
  const reasons = ['inappropriate', 'wrong-answer', 'broken', 'too-hard', 'too-easy', 'other'];
  const note = String(body.note || '').slice(0, 500);
  const report = {
    id: crypto.randomBytes(6).toString('hex'),
    challengeId: challenge.id,
    game: challenge.game,
    reason: reasons.includes(body.reason) ? body.reason : 'other',
    note: scanPlayerText(note).ok ? note : '[note removed by filter]',
    at: new Date().toISOString(),
    status: 'open',
  };
  db().reports.unshift(report);
  db().reports.length = Math.min(db().reports.length, 2000);
  // Content reports pull the challenge from rotation right away until an admin reviews it.
  if (report.reason === 'inappropriate' && challenge.status === 'approved') {
    updateChallenge(challenge.id, { status: 'pending' }, 'system');
    audit('system', 'auto-hold', `${challenge.id} held after an "inappropriate" report`);
  }
  persist();
  return { ok: true, message: 'Thanks! The admin will review it.' };
});

// ---------------------------------------------------------------- admin

r.post('/api/admin/login', ({ body, req, res }) => {
  if (!rateLimit(`login:${clientIp(req)}`, 8)) throw new HttpError(429, 'Too many attempts. Wait a minute.');
  if (!verifyAdminPassword(String(body.password || ''))) {
    audit('anon', 'login-failed', clientIp(req));
    throw new HttpError(401, 'Wrong password');
  }
  res.setHeader('Set-Cookie', adminCookie(createAdminSession(), isHttps(req)));
  audit('admin', 'login', clientIp(req));
  return { ok: true };
});

r.post('/api/admin/logout', ({ req, res }) => {
  destroyAdminSession(req);
  res.setHeader('Set-Cookie', clearAdminCookie);
  return { ok: true };
});

r.get('/api/admin/me', ({ req }) => ({ admin: isAdmin(req) }));

r.get('/api/admin/overview', ({ req }) => {
  requireAdmin(req);
  const all = Object.values(db().challenges);
  const byGame = GAMES.map((g) => {
    const mine = all.filter((c) => c.game === g.id);
    const count = (k, v) => mine.filter((c) => c[k] === v).length;
    return {
      id: g.id, title: g.title, emoji: g.emoji, generationKind: g.generationKind,
      approved: count('status', 'approved'), pending: count('status', 'pending'), rejected: count('status', 'rejected'), removed: count('status', 'removed'),
      curated: count('source', 'curated'), ai: count('source', 'ai'), procedural: count('source', 'procedural'), admin: count('source', 'admin'),
      plays: mine.reduce((s, c) => s + (c.stats?.plays || 0), 0),
      solves: mine.reduce((s, c) => s + (c.stats?.solves || 0), 0),
    };
  });
  const day = new Date().toISOString().slice(0, 10);
  return {
    ai: aiStatus(),
    byGame,
    openReports: db().reports.filter((x) => x.status === 'open').length,
    queue: queueLength(),
    usage: { today: db().usage.daily[day] || null, total: db().usage.total },
  };
});

r.get('/api/admin/challenges', ({ req, query }) => {
  requireAdmin(req);
  return { challenges: listChallenges({ game: query.game, status: query.status, difficulty: query.difficulty, source: query.source, q: query.q }) };
});

r.get('/api/admin/challenges/:id', ({ req, params }) => {
  requireAdmin(req);
  const c = getChallenge(params.id);
  if (!c) throw new HttpError(404, 'Not found');
  return { challenge: c };
});

async function runChecks(game, data, difficulty, source) {
  const validation = await game.validate(data, { difficulty, generated: false });
  const moderation = await moderateChallenge(game.id, data, { source });
  return { validation, moderation };
}

r.post('/api/admin/challenges', async ({ req, body }) => {
  requireAdmin(req);
  const game = GAME_MAP[body.game];
  if (!game) throw new HttpError(400, 'Unknown game');
  const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : 'easy';
  if (!body.data || typeof body.data !== 'object') throw new HttpError(400, 'data must be an object');
  const { validation, moderation } = await runChecks(game, body.data, difficulty, 'curated');
  if (!validation.ok || !moderation.ok) return { ok: false, validation, moderation };
  const c = newChallenge({
    game: game.id, difficulty, data: body.data, source: 'admin', status: body.status === 'pending' ? 'pending' : 'approved',
    title: body.title || game.summarize?.(body.data) || 'Admin challenge', tags: Array.isArray(body.tags) ? body.tags : [], validation, moderation,
  });
  audit('admin', 'challenge-create', c.id);
  return { ok: true, challenge: c };
});

r.put('/api/admin/challenges/:id', async ({ req, params, body }) => {
  requireAdmin(req);
  const c = getChallenge(params.id);
  if (!c) throw new HttpError(404, 'Not found');
  const patch = {};
  if (body.difficulty && DIFFICULTIES.includes(body.difficulty)) patch.difficulty = body.difficulty;
  if (body.status && ['approved', 'pending', 'rejected', 'removed'].includes(body.status)) patch.status = body.status;
  if (typeof body.title === 'string') patch.title = body.title.slice(0, 200);
  if (Array.isArray(body.tags)) patch.tags = body.tags.map(String).slice(0, 20);
  if (body.data && typeof body.data === 'object') {
    const game = GAME_MAP[c.game];
    const checks = await runChecks(game, body.data, patch.difficulty || c.difficulty, 'curated');
    if (!checks.validation.ok || !checks.moderation.ok) return { ok: false, ...checks };
    Object.assign(patch, { data: body.data, ...checks });
  }
  const updated = updateChallenge(c.id, patch);
  audit('admin', 'challenge-update', `${c.id} ${Object.keys(patch).join(',')}`);
  return { ok: true, challenge: updated };
});

r.delete('/api/admin/challenges/:id', ({ req, params }) => {
  requireAdmin(req);
  const c = getChallenge(params.id);
  // Remember deleted curated challenges so the seed doesn't bring them back on restart.
  if (c?.source === 'curated') (db().deletedCurated ||= []).push(c.id);
  if (!deleteChallenge(params.id)) throw new HttpError(404, 'Not found');
  audit('admin', 'challenge-delete', params.id);
  return { ok: true };
});

r.post('/api/admin/challenges/:id/validate', async ({ req, params }) => {
  requireAdmin(req);
  const c = getChallenge(params.id);
  if (!c) throw new HttpError(404, 'Not found');
  const checks = await runChecks(GAME_MAP[c.game], c.data, c.difficulty, c.source === 'ai' ? 'generated' : 'curated');
  updateChallenge(c.id, checks, 'system');
  return { ok: true, ...checks };
});

r.get('/api/admin/templates/:game', ({ req, params }) => {
  requireAdmin(req);
  const game = GAME_MAP[params.game];
  if (!game) throw new HttpError(404, 'Unknown game');
  const example = game.curated?.[0] || (game.procedural ? { difficulty: 'easy', data: game.procedural('easy') } : null);
  return { game: game.id, example: example ? { difficulty: example.difficulty, data: example.data } : null, schemaNotes: game.schemaNotes || '' };
});

r.post('/api/admin/generate', ({ req, body }) => {
  requireAdmin(req);
  if (!GAME_MAP[body.game]) throw new HttpError(400, 'Unknown game');
  const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : 'easy';
  try {
    const jobs = enqueueGeneration({ game: body.game, difficulty, count: Number(body.count) || 1 });
    audit('admin', 'generate', `${body.game}/${difficulty} x${jobs.length}`);
    return { ok: true, jobs };
  } catch (err) {
    throw new HttpError(400, err.message);
  }
});

r.get('/api/admin/jobs', ({ req }) => {
  requireAdmin(req);
  return { jobs: Object.values(db().jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200), queue: queueLength() };
});

r.get('/api/admin/reports', ({ req }) => {
  requireAdmin(req);
  return {
    reports: db().reports.slice(0, 500).map((x) => {
      const ch = getChallenge(x.challengeId);
      return { ...x, challenge: ch ? { title: ch.title, status: ch.status } : null };
    }),
  };
});

r.put('/api/admin/reports/:id', ({ req, params, body }) => {
  requireAdmin(req);
  const rep = db().reports.find((x) => x.id === params.id);
  if (!rep) throw new HttpError(404, 'Not found');
  if (['open', 'dismissed', 'resolved'].includes(body.status)) rep.status = body.status;
  persist();
  audit('admin', 'report-update', `${rep.id} -> ${rep.status}`);
  return { ok: true, report: rep };
});

const maskKey = (k) => (k ? `••••${k.slice(-4)}` : '');

r.get('/api/admin/settings', ({ req }) => {
  requireAdmin(req);
  const s = getSettings();
  return { settings: { ...s, ai: { ...s.ai, apiKey: maskKey(s.ai.apiKey) } }, envKeySet: !!process.env.ANTHROPIC_API_KEY };
});

r.put('/api/admin/settings', ({ req, body }) => {
  requireAdmin(req);
  const patch = {};
  const pickBool = (v) => (typeof v === 'boolean' ? v : undefined);
  if (body.content) {
    patch.content = {};
    for (const k of ['strictMode', 'jewishContent', 'requireApproval']) if (pickBool(body.content[k]) !== undefined) patch.content[k] = body.content[k];
    if (Array.isArray(body.content.extraBlockedTerms)) patch.content.extraBlockedTerms = body.content.extraBlockedTerms.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 500);
  }
  if (body.ai) {
    patch.ai = {};
    if (pickBool(body.ai.enabled) !== undefined) patch.ai.enabled = body.ai.enabled;
    if (typeof body.ai.model === 'string' && /^[a-z0-9.-]{3,60}$/.test(body.ai.model)) patch.ai.model = body.ai.model;
    for (const k of ['chatEffort', 'generationEffort']) if (['low', 'medium', 'high'].includes(body.ai[k])) patch.ai[k] = body.ai[k];
    for (const k of ['dailyTokenBudget', 'maxAiCallsPerRound', 'aiRequestsPerMinutePerIp']) if (Number(body.ai[k]) > 0) patch.ai[k] = Math.round(Number(body.ai[k]));
    if (typeof body.ai.apiKey === 'string' && body.ai.apiKey && !body.ai.apiKey.startsWith('••••')) patch.ai.apiKey = body.ai.apiKey.trim();
    if (body.ai.clearApiKey) patch.ai.apiKey = '';
  }
  if (body.audio) {
    patch.audio = {};
    for (const k of ['musicVolume', 'sfxVolume', 'voiceVolume']) if (Number(body.audio[k]) >= 0 && Number(body.audio[k]) <= 1) patch.audio[k] = Number(body.audio[k]);
    if (pickBool(body.audio.musicEnabled) !== undefined) patch.audio.musicEnabled = body.audio.musicEnabled;
  }
  if (body.host) {
    patch.host = {};
    for (const k of ['enabled', 'voice']) if (pickBool(body.host[k]) !== undefined) patch.host[k] = body.host[k];
  }
  if (body.gameplay) {
    patch.gameplay = {};
    if (MODES.includes(body.gameplay.defaultMode)) patch.gameplay.defaultMode = body.gameplay.defaultMode;
    for (const k of ['timerEnabled', 'autoGenerate']) if (pickBool(body.gameplay[k]) !== undefined) patch.gameplay[k] = body.gameplay[k];
  }
  updateSettings(patch);
  audit('admin', 'settings-update', Object.keys(patch).join(','));
  const s = getSettings();
  return { ok: true, settings: { ...s, ai: { ...s.ai, apiKey: maskKey(s.ai.apiKey) } } };
});

r.post('/api/admin/password', ({ req, body }) => {
  requireAdmin(req);
  if (!verifyAdminPassword(String(body.current || ''))) throw new HttpError(400, 'Current password is wrong');
  const next = String(body.next || '');
  if (next.length < 8) throw new HttpError(400, 'Use at least 8 characters');
  setAdminPassword(next);
  audit('admin', 'password-change');
  return { ok: true };
});

r.post('/api/admin/ai-test', async ({ req }) => {
  requireAdmin(req);
  try {
    return { ok: true, result: await aiSelfTest() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

r.get('/api/admin/usage', ({ req }) => {
  requireAdmin(req);
  return { usage: db().usage };
});

r.get('/api/admin/audit', ({ req }) => {
  requireAdmin(req);
  return { audit: db().audit.slice(0, 500) };
});

r.get('/api/admin/learned', ({ req }) => {
  requireAdmin(req);
  return { learned: db().learned };
});

// ---- media uploads (magic-byte checked; SVG/HTML are never accepted) ----

const SIGNATURES = [
  { ext: 'png', kind: 'image', test: (b) => b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { ext: 'jpg', kind: 'image', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', kind: 'image', test: (b) => b.slice(0, 4).toString('ascii') === 'GIF8' },
  { ext: 'webp', kind: 'image', test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  { ext: 'wav', kind: 'audio', test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WAVE' },
  { ext: 'mp3', kind: 'audio', test: (b) => b.slice(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { ext: 'ogg', kind: 'audio', test: (b) => b.slice(0, 4).toString('ascii') === 'OggS' },
  { ext: 'mp4', kind: 'video', test: (b) => b.slice(4, 8).toString('ascii') === 'ftyp' },
  { ext: 'webm', kind: 'video', test: (b) => b.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
];

r.post('/api/admin/upload', async ({ req, query }) => {
  requireAdmin(req);
  const buf = await readBody(req, 60_000_000);
  if (buf.length < 16) throw new HttpError(400, 'Empty file');
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig) throw new HttpError(415, 'Unsupported file type. Use PNG, JPG, GIF, WEBP, MP3, WAV, OGG, MP4 or WEBM.');
  const id = crypto.randomBytes(8).toString('hex');
  const file = `${id}.${sig.ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  const meta = { id, file, url: `/uploads/${file}`, kind: sig.kind, size: buf.length, name: String(query.name || file).replace(/[^\w.\- ]/g, '').slice(0, 80), at: new Date().toISOString() };
  db().media.unshift(meta);
  persist();
  audit('admin', 'upload', `${meta.name} -> ${meta.url}`);
  return { ok: true, media: meta };
}, { rawBody: true });

r.get('/api/admin/media', ({ req }) => {
  requireAdmin(req);
  return { media: db().media };
});

r.delete('/api/admin/media/:id', ({ req, params }) => {
  requireAdmin(req);
  const i = db().media.findIndex((m) => m.id === params.id);
  if (i < 0) throw new HttpError(404, 'Not found');
  const [m] = db().media.splice(i, 1);
  fs.rmSync(path.join(UPLOAD_DIR, m.file), { force: true });
  persist();
  audit('admin', 'media-delete', m.url);
  return { ok: true };
});

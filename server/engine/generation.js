// Background generation queue. Jobs run one at a time so a classroom never waits on them;
// nothing generated is shown to players until it passes validation, moderation and approval rules.
import crypto from 'node:crypto';
import { db, persist, getSettings, audit } from '../db.js';
import { moderateChallenge } from '../safety/moderate.js';
import { newChallenge, countByDifficulty } from './challenges.js';

let registry = {};
const queue = [];
let running = false;

export function initGeneration(gameMap) {
  registry = gameMap;
  // Jobs interrupted by a restart are retried; finished ones stay as history.
  for (const job of Object.values(db().jobs)) {
    if (job.status === 'running' || job.status === 'queued') {
      job.status = 'queued';
      queue.push(job.id);
    }
  }
  persist();
  kick();
}

export function enqueueGeneration({ game, difficulty, count = 1, by = 'admin' }) {
  const mod = registry[game];
  if (!mod?.generate) throw new Error(`${mod?.title || game} does not support generation`);
  const jobs = [];
  for (let i = 0; i < Math.min(20, Math.max(1, count)); i++) {
    const job = { id: crypto.randomBytes(6).toString('hex'), game, difficulty, by, status: 'queued', createdAt: new Date().toISOString(), kind: mod.generationKind };
    db().jobs[job.id] = job;
    queue.push(job.id);
    jobs.push(job);
  }
  trimJobs();
  persist();
  kick();
  return jobs;
}

function trimJobs() {
  const all = Object.values(db().jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const j of all.slice(500)) if (j.status !== 'queued' && j.status !== 'running') delete db().jobs[j.id];
}

export const queueLength = () => queue.length;

async function kick() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = db().jobs[queue.shift()];
    if (job && job.status === 'queued') await runJob(job);
  }
  running = false;
}

async function runJob(job) {
  const mod = registry[job.game];
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  persist();
  try {
    const data = await mod.generate({ difficulty: job.difficulty });
    const validation = await mod.validate(data, { generated: true, difficulty: job.difficulty });
    const procedural = mod.generationKind === 'procedural';
    const moderation = await moderateChallenge(job.game, data, { source: procedural ? 'curated' : 'generated' });
    const passed = validation.ok && moderation.ok;
    const settings = getSettings().content;
    const autoApprove = procedural || (!settings.requireApproval && !moderation.needsReview);
    const status = !passed ? 'rejected' : autoApprove ? 'approved' : 'pending';
    const ch = newChallenge({
      game: job.game,
      difficulty: job.difficulty,
      data,
      source: procedural ? 'procedural' : 'ai',
      status,
      title: mod.summarize?.(data) || 'Generated challenge',
      tags: data.tags || [],
      validation,
      moderation,
    });
    job.challengeId = ch.id;
    job.status = passed ? 'done' : 'rejected';
    job.problems = [
      ...(validation.problems || []),
      ...(moderation.local?.hits || []).map((h) => `Blocked term "${h.term}" (${h.category})`),
      ...(moderation.ai?.issues || []),
    ];
    audit('system', `generate:${job.status}`, `${job.game}/${job.difficulty} -> ${ch.id}`);
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
  }
  job.finishedAt = new Date().toISOString();
  persist();
}

/** Optional background refill: keep a small stock of approved generated challenges per level. */
export function maybeAutoRefill(gameId, difficulty) {
  const s = getSettings();
  const mod = registry[gameId];
  if (!s.gameplay.autoGenerate || !mod?.generate || mod.generationKind !== 'ai') return;
  if (!s.content.requireApproval && countByDifficulty(gameId)[difficulty] < 30 && queue.length < 3) {
    enqueueGeneration({ game: gameId, difficulty, count: 1, by: 'auto-refill' });
  }
}

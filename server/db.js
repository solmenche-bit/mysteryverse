// JSON-file persistence. One document holds every collection; writes are
// debounced and atomic (write temp file, then rename). Good for a single
// classroom server; see README for the PostgreSQL upgrade path.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DEFAULT_SETTINGS } from './config.js';

const FILE = path.join(DATA_DIR, 'db.json');

const empty = () => ({
  version: 1,
  challenges: {},   // id -> challenge record
  reports: [],      // player/teacher reports
  jobs: {},         // generation jobs
  audit: [],        // admin + system audit log (newest first)
  usage: { daily: {}, total: { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, failures: 0 }, byPurpose: {} },
  settings: {},     // overrides of DEFAULT_SETTINGS
  admin: null,      // { salt, hash }
  learned: [],      // objects the class used to beat the AI in reverse 20Q
  media: [],        // uploaded media metadata
});

let state = empty();
let timer = null;
let loaded = false; // never write state that was not loaded from disk (e.g. in unit tests)

export function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      state = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
    } catch {
      const bad = `${FILE}.corrupt-${Date.now()}`;
      fs.renameSync(FILE, bad);
      console.error(`[db] db.json was unreadable; moved it to ${bad} and started fresh.`);
      state = empty();
    }
  }
  loaded = true;
  return state;
}

export const db = () => state;

export function persist() {
  if (!loaded) return;
  clearTimeout(timer);
  timer = setTimeout(writeNow, 300);
}

export function writeNow() {
  clearTimeout(timer);
  if (!loaded) return;
  const json = JSON.stringify(state);
  const tmp = `${FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, FILE);
  } catch {
    // Windows can refuse the rename while another process holds the file.
    fs.writeFileSync(FILE, json);
  }
}

export function audit(actor, action, detail = '') {
  state.audit.unshift({ at: new Date().toISOString(), actor, action, detail: String(detail).slice(0, 500) });
  if (state.audit.length > 2000) state.audit.length = 2000;
  persist();
}

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}

export const getSettings = () => merge(DEFAULT_SETTINGS, state.settings);

export function updateSettings(patch) {
  state.settings = merge(state.settings, patch);
  persist();
  return getSettings();
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency). Real environment variables win.
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

export const PORT = Number(process.env.PORT || 3000);
export const DATA_DIR = process.env.MYSTERYVERSE_DATA_DIR || path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'insane'];
export const MODES = ['casual', 'challenge', 'hardcore', 'classroom'];

// Admin-configurable settings. Anything not stored in the DB falls back to these.
export const DEFAULT_SETTINGS = {
  content: {
    strictMode: true,          // Strict Yeshiva Mode: extended blocklist on all generated content
    jewishContent: true,       // include Jewish-themed challenges in rotation
    requireApproval: true,     // AI-generated challenges wait for admin approval
    extraBlockedTerms: [],     // admin additions to the blocklist
  },
  ai: {
    enabled: true,
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    apiKey: '',                // stored server-side only; env ANTHROPIC_API_KEY also works
    chatEffort: 'low',         // in-game conversation (latency sensitive)
    generationEffort: 'medium',
    dailyTokenBudget: 3_000_000,
    maxAiCallsPerRound: 80,
    aiRequestsPerMinutePerIp: 40,
  },
  audio: {
    musicVolume: 0.35,
    sfxVolume: 0.7,
    voiceVolume: 0.8,
    musicEnabled: true,
  },
  host: {
    enabled: true,
    voice: false,
  },
  gameplay: {
    defaultMode: 'casual',
    timerEnabled: false,
    autoGenerate: false,       // background-refill AI challenge pools when they run low
  },
};

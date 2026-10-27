// AI provider integration. Every model call in the app goes through aiJSON(),
// which enforces structured JSON output, budgets, usage tracking and refusal handling.
import Anthropic from '@anthropic-ai/sdk';
import { db, getSettings, persist } from '../db.js';

export class AIUnavailable extends Error {}
export class AIError extends Error {}

// USD per million tokens [input, output]; used for the admin cost monitor.
const PRICES = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-1': [10, 50],
};

let client = null;
let clientKey = null;

function apiKey() {
  return getSettings().ai.apiKey || process.env.ANTHROPIC_API_KEY || '';
}

export function aiStatus() {
  const s = getSettings().ai;
  if (!s.enabled) return { enabled: false, provider: s.provider, model: s.model, reason: 'AI disabled by admin' };
  if (!apiKey()) return { enabled: false, provider: s.provider, model: s.model, reason: 'No API key configured' };
  const today = usageToday();
  if (today.inputTokens + today.outputTokens >= s.dailyTokenBudget) {
    return { enabled: false, provider: s.provider, model: s.model, reason: 'Daily AI budget reached' };
  }
  return { enabled: true, provider: s.provider, model: s.model, reason: null };
}

export const aiAvailable = () => aiStatus().enabled;

let testClient = null;
/** Test seam: route calls to a fake client (tests only). */
export function __setClientForTests(fake) {
  testClient = fake;
}

function getClient() {
  if (testClient) return testClient;
  const key = apiKey();
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key, maxRetries: 1 });
    clientKey = key;
  }
  return client;
}

const dayKey = () => new Date().toISOString().slice(0, 10);

function usageToday() {
  const u = db().usage;
  return (u.daily[dayKey()] ||= { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, failures: 0 });
}

function recordUsage(purpose, model, usage, failed = false) {
  const u = db().usage;
  const [pin, pout] = PRICES[model] || PRICES['claude-opus-5-5'];
  const input = usage?.input_tokens || 0;
  const output = usage?.output_tokens || 0;
  const cost = (input * pin + output * pout) / 1e6;
  for (const bucket of [u.total, usageToday(), (u.byPurpose[purpose] ||= { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, failures: 0 })]) {
    bucket.requests += 1;
    bucket.inputTokens += input;
    bucket.outputTokens += output;
    bucket.costUsd = Math.round((bucket.costUsd + cost) * 1e6) / 1e6;
    if (failed) bucket.failures += 1;
  }
  persist();
}

/**
 * Ask the model for JSON matching `schema`.
 * @param {object} o
 * @param {string} o.purpose   label for usage tracking ("twenty.answer", "connection.generate", ...)
 * @param {string} o.system    system prompt
 * @param {Array}  o.messages  Messages API messages
 * @param {object} o.schema    JSON schema (objects need additionalProperties:false + required)
 * @param {'low'|'medium'|'high'} [o.effort]
 * @param {number} [o.maxTokens]
 * @param {number} [o.timeoutMs]
 */
export async function aiJSON({ purpose, system, messages, schema, effort, maxTokens = 4000, timeoutMs = 45_000 }) {
  const status = aiStatus();
  if (!status.enabled) throw new AIUnavailable(status.reason);
  const settings = getSettings().ai;
  const model = settings.model;
  let res;
  try {
    res = await getClient().beta.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages,
        output_config: { format: { type: 'json_schema', schema }, effort: effort || settings.chatEffort },
        // On a safety decline the API retries on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { timeout: timeoutMs },
    );
  } catch (err) {
    recordUsage(purpose, model, null, true);
    throw new AIError(`AI request failed: ${err.status || ''} ${err.message}`.trim());
  }
  recordUsage(purpose, model, res.usage, res.stop_reason !== 'end_turn');
  if (res.stop_reason === 'refusal') throw new AIError('AI declined the request');
  if (res.stop_reason === 'max_tokens') throw new AIError('AI response was cut off');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError('AI returned invalid JSON');
  }
}

/** Minimal connectivity check used by the admin panel. */
export async function aiSelfTest() {
  const t0 = Date.now();
  const out = await aiJSON({
    purpose: 'admin.selftest',
    system: 'You are a connectivity check. Reply with the requested JSON only.',
    messages: [{ role: 'user', content: 'Return {"ok": true, "word": "<any friendly one-word greeting>"}' }],
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, word: { type: 'string' } },
      required: ['ok', 'word'],
      additionalProperties: false,
    },
    effort: 'low',
    maxTokens: 1000,
  });
  return { ...out, ms: Date.now() - t0, model: getSettings().ai.model };
}

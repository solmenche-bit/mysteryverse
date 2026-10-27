// Moderation pipeline: local policy scan first, then an independent AI review for
// anything generated. Never assume the generating model followed its instructions.
import { aiAvailable, aiJSON } from '../ai/provider.js';
import { CONTENT_POLICY, objectSchema, bool, arr, str, oneOf } from '../ai/prompts.js';
import { scanObject, scanText, collectStrings } from './policy.js';

const REVIEW_SCHEMA = objectSchema({
  safe: bool('true only if every part is appropriate for a yeshiva classroom'),
  severity: oneOf(['none', 'low', 'high']),
  issues: arr(str(), 'specific problems found; empty when safe'),
});

/**
 * Moderate a whole challenge payload.
 * @returns {Promise<{ok: boolean, local: object, ai: object|null, needsReview: boolean, checkedAt: string}>}
 */
export async function moderateChallenge(game, data, { source = 'generated' } = {}) {
  const local = scanObject(data);
  const result = { ok: local.ok, local, ai: null, needsReview: false, checkedAt: new Date().toISOString() };
  if (!local.ok || source === 'curated') return result;

  if (!aiAvailable()) {
    // Generated content that could not get an AI review always goes to a human.
    result.needsReview = true;
    return result;
  }
  try {
    result.ai = await aiJSON({
      purpose: 'safety.review',
      system: `You are a strict content reviewer for a school party-game website.\n${CONTENT_POLICY}\n
Review the JSON challenge you are given. Mark safe=false for ANY policy problem, including subtle ones
(innuendo, double meanings, scary imagery, disrespect to Jewish practice, non-kosher food, brand-name entertainment).`,
      messages: [{ role: 'user', content: `Game: ${game}\nChallenge JSON:\n${JSON.stringify(data).slice(0, 12000)}` }],
      schema: REVIEW_SCHEMA,
      effort: 'low',
      maxTokens: 2000,
    });
    result.ok = result.ai.safe && result.ai.severity !== 'high';
  } catch (err) {
    result.needsReview = true;
    result.aiError = err.message;
  }
  return result;
}

/** Check a single AI-produced line of dialogue before showing it to the class. */
export function dialogueIsSafe(text) {
  return scanText(text).ok;
}

export { collectStrings };

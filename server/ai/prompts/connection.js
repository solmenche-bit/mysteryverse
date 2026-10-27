import { CONTENT_POLICY, objectSchema, str, arr, num, oneOf } from '../prompts.js';
import { SAFE_EMOJI_LIST } from '../../safety/policy.js';

const DIFFICULTY_GUIDE = {
  easy: 'A direct, visible shared property (a color, a place they are all found, an obvious category). Solvable in under a minute.',
  medium: 'A less obvious shared feature or a familiar category that needs a moment of thought (things with shells, things that come in pairs).',
  hard: 'An action or feature that applies in different ways (things you can catch, things that have eyes). Requires lateral thinking.',
  expert: 'A single word with several different meanings across the pictures (bills, scales, charge), or a hidden number pattern.',
  insane: 'Very subtle but completely fair: wordplay on the item NAMES, rare word meanings, or a multi-layer link. Every item must still clearly fit once explained.',
};

const ITEM = objectSchema({
  emoji: str('exactly one emoji from the allowed list'),
  label: str('short caption, 1-3 words'),
  link: str('how this item fits the connection, under 12 words'),
});

export const PUZZLE_SCHEMA = objectSchema({
  answer: str('the connection, 1-4 words'),
  accepted: arr(str(), 'other phrasings players might type that should count as correct'),
  items: arr(ITEM, 'exactly five items'),
  extra: ITEM,
  hints: arr(str(), 'exactly three hints from vague to strong; never state the answer'),
  explanation: str('one or two sentences explaining the connection'),
  estSeconds: num('estimated solve time for a group, in seconds'),
  theme: oneOf(['everyday', 'jewish', 'nature', 'science', 'food', 'sports', 'places', 'wordplay']),
});

export function generatePrompt(difficulty, avoidAnswers) {
  return {
    system: `You design puzzles for "What's the Connection?", a group party game shown on a classroom projector.
Players see five pictures that look unrelated and must discover what links them.
${CONTENT_POLICY}

Rules for a great puzzle:
- All five items must genuinely share the connection; no item may be a stretch.
- The connection must be unique: no other equally good answer should fit all five.
- Items should look unrelated at first glance (mix animals, objects, places, foods...).
- Pictures are emoji. Use ONLY emoji from this allowed list: ${SAFE_EMOJI_LIST()}
- Labels must not contain the answer word.
- Hints go from gentle to strong and never contain the answer.
- The sixth "extra" item is a bonus clue for stuck groups.
- About one puzzle in five may use a Jewish theme (holidays, Shabbos, kosher food, Israel), respectfully.`,
    user: `Create one ${difficulty.toUpperCase()} puzzle.\nDifficulty guide: ${DIFFICULTY_GUIDE[difficulty]}\nDo not reuse these answers: ${avoidAnswers.slice(0, 80).join(', ') || '(none)'}`,
  };
}

export const SOLVER_SCHEMA = objectSchema({
  guesses: arr(str(), 'your three best guesses for the connection, best first'),
});

export function solverPrompt(items) {
  return {
    system: `You are a sharp puzzle solver testing a "What's the Connection?" puzzle. Five pictures share one hidden connection.
Give your three best guesses, best first. Be concise: 1-4 words each.`,
    user: items.map((i, n) => `${n + 1}. ${i.emoji} ${i.label}`).join('\n'),
  };
}

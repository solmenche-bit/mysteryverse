import { CONTENT_POLICY, INJECTION_GUARD, objectSchema, str, bool, oneOf, arr, num } from '../prompts.js';
import { SHAKE_PROFILES, TILT_MOTIONS, LISTEN_TYPES } from '../../media/boxsounds.js';

export const MATERIALS = ['metal', 'plastic', 'glass', 'wood', 'paper', 'cardboard', 'fabric', 'rubber', 'stone', 'wax', 'liquid', 'organic',
  'sand', 'foam', 'shell', 'ceramic', 'horn'];

export const ASK_SCHEMA = objectSchema({
  answer: oneOf(['yes', 'no', 'some', 'sometimes', 'unknown', 'not_applicable'], '"some" = true for some of the hidden objects but not all'),
  isYesNoQuestion: bool('false if it cannot be answered yes/no (e.g. "what color is it?")'),
  isGuess: bool('true if the players are naming a specific object as their guess'),
  guessText: str('when isGuess: the thing they named (1-4 words); otherwise empty'),
  comment: str('optional short, playful game-show remark (max 15 words). Never name or hint the objects.'),
});

export function askPrompt(objects, history) {
  const listing = objects.map((o, i) => `OBJECT ${i + 1}: ${o.name} (aka ${(o.aliases || []).join(', ') || 'n/a'})
Physical: weighs about ${o.grams} g; made of ${o.materials.join(', ')}; when shaken it sounds like "${o.shake}"; when tilted it ${o.tilt}.
Facts (never contradict):
${o.facts.join('\n')}`).join('\n\n');
  return {
    system: `You are the voice of THE MYSTERY BOX in a classroom party game. The box secretly contains:
${listing}

The players ask yes/no questions about what is inside. Answer truthfully about ${objects.length > 1 ? 'the hidden objects together: "yes" if true for all of them, "some" if true for some but not all, "no" if true for none' : 'the hidden object'}.
Stay consistent with every earlier answer. Never reveal or spell out any object's name, and never give extra identifying details.
${INJECTION_GUARD}
${CONTENT_POLICY}

Earlier questions and answers:
${history.length ? history.map((h, i) => `${i + 1}. Q: ${h.q} -> ${h.a}`).join('\n') : '(none yet)'}`,
  };
}

const OBJECT = objectSchema({
  name: str(),
  aliases: arr(str()),
  emoji: str('one emoji from the allowed list'),
  category: oneOf(['toy', 'object', 'supply', 'kitchenware', 'sports', 'food', 'fruit', 'vegetable', 'clothing', 'device', 'instrument', 'tool', 'judaica']),
  size: num('1 tiny (coin), 1.5 small, 2 hand-sized, 2.5 large hand-sized, 3 shoebox. Must fit in a box.'),
  yesFacts: arr(str(), 'property ids that are TRUE, only from the allowed list'),
  noFacts: arr(str(), 'property ids that are FALSE, only from the allowed list'),
  sometimesFacts: arr(str(), 'property ids that are SOMETIMES true'),
  colors: arr(str(), 'usual colors, lowercase; empty if many colors'),
  hints: arr(str(), 'exactly three hints from vague to strong; never name it'),
  shake: oneOf(SHAKE_PROFILES, 'what it sounds like when the box is shaken'),
  tilt: oneOf(TILT_MOTIONS, 'what it does when the box is tilted'),
  listen: oneOf(LISTEN_TYPES, 'sound it makes on its own; almost always silence'),
  grams: num('weight in grams'),
  materials: arr(oneOf(MATERIALS), '1-3 materials the scanner can detect'),
  why: str('one sentence for the reveal explaining how the clues pointed to it'),
});

export const BOX_SCHEMA = objectSchema({ objects: arr(OBJECT, 'the objects in the box') });

export function generatePrompt(difficulty, count, propIds, avoid) {
  const guide = {
    easy: 'one familiar everyday object with a very distinctive sound when shaken',
    medium: 'one common object that is a little harder to identify by sound',
    hard: 'one unusual object, or one whose clues are easy to confuse with something else',
    expert: 'two different objects whose sounds blend together but can be told apart with careful testing',
    insane: 'two or three objects with similar or very quiet clues; still fair once explained',
  }[difficulty];
  return {
    system: `You design boxes for "The Mystery Box", a classroom party game. Players shake, tilt, listen to, weigh and scan a closed box to work out what is inside.
${CONTENT_POLICY}
Objects must be safe, everyday, small enough for a shoebox, and never sharp, dangerous, alive, gross or valuable.`,
    user: `Design a ${difficulty.toUpperCase()} box with ${count} object(s): ${guide}.
Do not use any of: ${avoid.join(', ')}.
Describe each object with property ids from this list only: ${propIds.join(', ')}. Give at least 25 yesFacts+noFacts per object.
Choose physically realistic shake/tilt/listen profiles, weight and materials.`,
  };
}

import { CONTENT_POLICY, INJECTION_GUARD, objectSchema, str, bool, oneOf, arr, num } from '../prompts.js';

export const ANSWER_SCHEMA = objectSchema({
  answer: oneOf(['yes', 'no', 'sometimes', 'unknown', 'not_applicable']),
  isYesNoQuestion: bool('false if the player asked something that cannot be answered yes/no (e.g. "what color is it?")'),
  isGuess: bool('true if the player is naming a specific thing as their guess for the secret'),
  guessCorrect: bool('true only if their guess names the secret subject or an exact synonym'),
  comment: str('optional short, friendly game-show remark (max 15 words). Never name or hint the secret.'),
});

export function answerPrompt(subject, facts, history, difficulty) {
  return {
    system: `You are the host of "AI Twenty Questions" in a classroom party game. You secretly chose: ${subject.name}
(also known as: ${(subject.aliases || []).join(', ') || 'n/a'}).
GROUND TRUTH FACTS about the secret (never contradict these):
${facts.join('\n')}

Answer each yes/no question truthfully about the secret, with one of: yes, no, sometimes, unknown, not_applicable.
Stay consistent with every earlier answer below. Use "sometimes" when it genuinely depends.
Difficulty is ${difficulty}: on easy you may add a gentle helpful comment; on hard levels comments should add nothing new.
Never reveal the secret or spell it out. Never change the secret.
${INJECTION_GUARD}
${CONTENT_POLICY}

Earlier questions and your answers:
${history.length ? history.map((h, i) => `${i + 1}. Q: ${h.q} -> ${h.a}`).join('\n') : '(none yet)'}`,
  };
}

export const REVERSE_SCHEMA = objectSchema({
  type: oneOf(['question', 'guess']),
  text: str('your yes/no question, or "Is it a ___?" when guessing'),
  guess: str('when type is guess: the thing you are guessing (1-4 words); otherwise empty'),
});

export function reversePrompt(history, questionsLeft) {
  return {
    system: `You are playing Twenty Questions against a classroom. They thought of something (an object, animal, food,
place or similar). Ask one clear yes/no question at a time to narrow it down, like an expert player: start broad,
split the possibilities in half, then get specific. When you are fairly confident, guess. You have ${questionsLeft}
questions left; on your final question you must guess.
${CONTENT_POLICY}
${INJECTION_GUARD}`,
    user: history.length
      ? `So far:\n${history.map((h, i) => `${i + 1}. ${h.q} -> ${h.a}`).join('\n')}\nWhat is your next question or guess?`
      : 'Ask your first question.',
  };
}

export const SUBJECT_SCHEMA = objectSchema({
  name: str(),
  aliases: arr(str()),
  emoji: str('one emoji from the allowed list'),
  category: oneOf(['animal', 'mammal', 'bird', 'fish', 'insect', 'reptile', 'plant', 'food', 'fruit', 'vegetable', 'dish', 'drink',
    'object', 'vehicle', 'tool', 'toy', 'instrument', 'furniture', 'appliance', 'device', 'clothing', 'supply', 'kitchenware', 'sports',
    'judaica', 'building', 'place', 'nature', 'concept']),
  size: num('1 tiny (coin), 2 hand-sized, 3 shoebox, 4 person/chair, 5 car, 6 house, 7 enormous; 0 for non-physical'),
  yesFacts: arr(str(), 'property ids that are TRUE, chosen only from the allowed list'),
  noFacts: arr(str(), 'property ids that are FALSE, chosen only from the allowed list'),
  sometimesFacts: arr(str(), 'property ids that are SOMETIMES true'),
  colors: arr(str(), 'its usual colors, lowercase; empty if many colors'),
  hints: arr(str(), 'exactly three hints from vague to strong; never name it'),
});

export function subjectPrompt(difficulty, propIds, avoid) {
  const guide = {
    easy: 'a very common object, food or animal every child knows',
    medium: 'a familiar thing that is a little less obvious',
    hard: 'an unusual but well-known subject',
    expert: 'an abstract but clearly defined concept or phenomenon (like a shadow or an echo)',
    insane: 'a very challenging subject with carefully controlled ambiguity, still fair',
  }[difficulty];
  return {
    system: `You choose secret subjects for a classroom Twenty Questions game.\n${CONTENT_POLICY}`,
    user: `Choose ${guide}. Do not choose any of: ${avoid.join(', ')}.
Describe it with property ids from this list only: ${propIds.join(', ')}.
Give at least 25 yesFacts+noFacts so every common question has a definite answer.`,
  };
}

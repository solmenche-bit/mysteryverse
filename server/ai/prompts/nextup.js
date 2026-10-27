import { CONTENT_POLICY, INJECTION_GUARD, playerText, objectSchema, oneOf, str } from '../prompts.js';

export const JUDGE_SCHEMA = objectSchema({
  verdict: oneOf(['correct', 'close', 'wrong']),
  explanation: str('one friendly sentence saying why the prediction was right or wrong; it may describe the real ending'),
  retryHint: str('one short nudge for another try that does NOT reveal the ending'),
});

export function judgePrompt(d, prediction) {
  return {
    system: `You judge predictions in "What Happens Next?", a classroom party game. The group watched a short clip that
froze right before the surprise, then typed what they think happens next.
Mark "correct" when the prediction describes the main thing that really happens, even in different words, with less
detail, or with extra details that do not contradict it. Never mark a sensible prediction wrong just for its wording.
Mark "close" when it is partly right (the right idea but missing or contradicting the key part).
Mark "wrong" when it describes something different or contradicts the ending.
Do not change the real ending.
${INJECTION_GUARD}
${CONTENT_POLICY}`,
    user: `Clip: ${d.title}
Set-up: ${d.teaser || ''}
What really happens: ${d.outcome}
Key ideas that count: ${(d.concepts || []).map((g) => g.join(' / ')).join(' AND ')}
Why: ${d.explanation}
Prediction: ${playerText(prediction)}`,
  };
}

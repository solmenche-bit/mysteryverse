// AI integration plumbing, exercised with a fake Claude client (no network, no key needed).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY = 'test-key';
const { aiJSON, aiStatus, __setClientForTests, AIError } = await import('../server/ai/provider.js');
const { checkAnswer } = await import('../server/engine/answers.js');
const { createRound } = await import('../server/engine/rounds.js');
const twenty = (await import('../server/games/twenty.js')).default;
const connection = (await import('../server/games/connection.js')).default;

let queue = [];
const requests = [];
__setClientForTests({
  beta: {
    messages: {
      async create(body) {
        requests.push(body);
        const next = queue.shift();
        if (!next) throw new Error('fake client: no queued response');
        if (next.refusal) return { stop_reason: 'refusal', usage: { input_tokens: 5, output_tokens: 0 }, content: [] };
        return { stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: JSON.stringify(next) }] };
      },
    },
  },
});

test('requests use structured output, effort, and server-side fallbacks', async () => {
  assert.equal(aiStatus().enabled, true);
  queue = [{ ok: true }];
  const out = await aiJSON({ purpose: 't', system: 's', messages: [{ role: 'user', content: 'x' }], schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }, effort: 'low' });
  assert.deepEqual(out, { ok: true });
  const req = requests.at(-1);
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.output_config.effort, 'low');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.thinking, undefined);
});

test('refusals become AIError', async () => {
  queue = [{ refusal: true }];
  await assert.rejects(aiJSON({ purpose: 't', system: 's', messages: [{ role: 'user', content: 'x' }], schema: { type: 'object' } }), AIError);
});

test('semantic judge accepts paraphrases and never leaks the answer in a "close" reason', async () => {
  queue = [{ verdict: 'correct', reason: 'Same idea, different words.' }];
  assert.equal((await checkAnswer('how long things take', { answer: 'Time', cacheKey: 'judge-1' })).correct, true);
  queue = [{ verdict: 'close', reason: 'Think about TIME more broadly.' }];
  const r = await checkAnswer('hours', { answer: 'Time', cacheKey: 'judge-2' });
  assert.equal(r.correct, false);
  assert.equal(r.reason, '');
  assert.match(requests.at(-1).messages[0].content, /<player>hours<\/player>/);
});

test('twenty questions: AI answers are used, guesses need independent confirmation, comments cannot leak', async () => {
  const challenge = twenty.curated.find((c) => c.data.subjectId === 'dog');
  const round = createRound({ game: 'twenty', challenge, difficulty: 'easy', mode: 'casual' });
  twenty.start(round, challenge, {});
  queue = [{ answer: 'yes', isYesNoQuestion: true, isGuess: false, guessCorrect: false, comment: 'Woof! I mean... it is a dog.' }];
  const a = await twenty.actions.ask(round, challenge, { text: 'Is it a pet?' });
  assert.equal(a.answer, 'yes');
  assert.equal(a.comment, '', 'a comment naming the secret is dropped');
  // The model claims a wrong guess is correct; the server must not accept it.
  queue = [{ answer: 'yes', isYesNoQuestion: true, isGuess: true, guessCorrect: true, comment: '' }, { verdict: 'wrong', reason: 'Not it.' }];
  const g = await twenty.actions.ask(round, challenge, { text: 'Is it a hamster?' });
  assert.equal(g.solved, undefined);
  assert.equal(g.answer, 'no');
  queue = [{ answer: 'yes', isYesNoQuestion: true, isGuess: true, guessCorrect: true, comment: 'Yes!' }];
  const ok = await twenty.actions.ask(round, challenge, { text: 'Is it a puppy?' });
  assert.equal(ok.solved, true);
});

test('connection generation runs an independent solver and validation uses its result', async () => {
  const puzzle = {
    answer: 'Wheels', accepted: ['wheels', 'things with wheels'], theme: 'everyday', estSeconds: 60,
    items: [['🚲', 'Bicycle'], ['🛹', 'Skateboard'], ['🚗', 'Car'], ['🛒', 'Shopping cart'], ['🚂', 'Train']].map(([emoji, label]) => ({ emoji, label, link: `${label} rolls on wheels` })),
    extra: { emoji: '🚜', label: 'Tractor', link: 'Huge back wheels' },
    hints: ['Think about how they move.', 'They roll.', 'Round things underneath.'],
    explanation: 'They all move on wheels.',
  };
  queue = [puzzle, { guesses: ['Things with wheels', 'Transport', 'Vehicles'] }];
  const d = await connection.generate({ difficulty: 'easy' });
  assert.equal(d.solverCheck.solvedOnTry, 1);
  const v = connection.validate(d, { generated: true, difficulty: 'easy' });
  assert.ok(v.ok, v.problems.join('; '));
  queue = [{ ...puzzle }, { guesses: ['Red things', 'Toys', 'Metal'] }, { verdict: 'wrong', reason: '' }, { verdict: 'wrong', reason: '' }, { verdict: 'wrong', reason: '' }];
  const bad = await connection.generate({ difficulty: 'easy' });
  assert.equal(bad.solverCheck.solvedOnTry, null);
  assert.equal(connection.validate(bad, { generated: true, difficulty: 'easy' }).ok, false);
});

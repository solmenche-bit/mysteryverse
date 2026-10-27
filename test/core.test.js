import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAnswer, checkAnswer, canonical } from '../server/engine/answers.js';
import { scanText, scanPlayerText, isSafeEmoji } from '../server/safety/policy.js';
import { createRound, registerMistake, solveRound, computeScore } from '../server/engine/rounds.js';
import connection from '../server/games/connection.js';

test('answer matching: case, punctuation, articles, plurals, synonyms, typos', () => {
  const yes = [
    ['TIME!', ['time']], ['the time', ['time']], ['Black & White', ['black and white']], ['white and black', ['black and white']],
    ['things with shells', ['shells']], ['bike', ['bicycle']], ['passover', ['pesach']], ['someone typing', ['keyboard typing']],
    ['refrigirator', ['refrigerator']], ['telephone', ['phone']], ['they all have teeth', ['teeth']], ['hanukkah', ['chanukah']],
  ];
  for (const [g, acc] of yes) assert.ok(matchAnswer(g, acc).match, `${g} should match ${acc}`);
  const no = [['cat', ['car']], ['time or water or money', ['time']], ['fruit', ['yellow']], ['', ['time']], ['ring', ['king']]];
  for (const [g, acc] of no) assert.ok(!matchAnswer(g, acc).match, `${g} should not match ${acc}`);
  assert.ok(matchAnswer('black', ['black and white']).close, 'partial answers count as close');
  assert.equal(canonical('The Bicycles!'), 'bicycle');
});

test('checkAnswer works offline without an API key', async () => {
  const r = await checkAnswer('time', { answer: 'Time', accepted: [] });
  assert.equal(r.correct, true);
  const w = await checkAnswer('space', { answer: 'Time', accepted: [] });
  assert.equal(w.correct, false);
  assert.equal(w.method, 'local');
});

test('safety filter catches blocked content and evasions but not innocent words', () => {
  assert.equal(scanPlayerText('is it a b33r').ok, false);
  assert.equal(scanPlayerText('is it a g.u.n').ok, false);
  assert.equal(scanPlayerText('is it a shooting star').ok, true);
  assert.equal(scanPlayerText('hello class, is it warm?').ok, true);
  assert.equal(scanText('a ham sandwich', { strict: true }).ok, false);
  assert.equal(scanText('a hamster wheel', { strict: true }).ok, true);
  assert.equal(scanText('a christmas tree', { strict: true }).ok, false);
  assert.equal(isSafeEmoji('🚲'), true);
  assert.equal(isSafeEmoji('🍺'), false);
  assert.equal(isSafeEmoji('🔪'), false);
});

test('rounds: mistake limits per mode and scoring', () => {
  const ch = { id: 'x' };
  const casual = createRound({ game: 'g', challenge: ch, difficulty: 'easy', mode: 'casual' });
  for (let i = 0; i < 5; i++) assert.equal(registerMistake(casual).failed, false);
  const challenge = createRound({ game: 'g', challenge: ch, difficulty: 'easy', mode: 'challenge' });
  registerMistake(challenge);
  registerMistake(challenge);
  assert.equal(registerMistake(challenge).failed, true);
  const hard = createRound({ game: 'g', challenge: ch, difficulty: 'insane', mode: 'hardcore' });
  const m = registerMistake(hard);
  assert.equal(m.failed && m.runOver, true);
  const r = createRound({ game: 'g', challenge: ch, difficulty: 'hard', mode: 'casual' });
  const s = solveRound(r, 120);
  assert.ok(s.score.total >= 300, 'no hints, no mistakes earns at least the base');
  r.hintsUsed = 3;
  r.mistakes = 4;
  assert.ok(computeScore(r).total < s.score.total);
});

test('every curated connection puzzle is valid and safe', () => {
  for (const c of connection.curated) {
    const v = connection.validate(c.data);
    assert.ok(v.ok, `${c.id}: ${v.problems.join('; ')}`);
  }
});

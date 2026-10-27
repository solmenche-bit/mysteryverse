import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../server/games/sound.js';
import { RECIPES, ENVIRONMENTS, buildRecipe, buildEnvironment, validateSpec, repeatStarts } from '../server/media/soundlib.js';
import { createRound } from '../server/engine/rounds.js';
import { DIFFICULTIES } from '../server/config.js';

const allNumbers = (v, out = []) => {
  if (typeof v === 'number') out.push(v);
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allNumbers(x, out));
  return out;
};

test('every recipe builds valid specs for several seeds', () => {
  assert.ok(RECIPES.length >= 26, `only ${RECIPES.length} recipes`);
  for (const r of RECIPES) {
    assert.equal(r.hints.length, 3, `${r.id} needs 3 hints`);
    assert.ok(r.accepted.length >= 3, `${r.id} needs synonyms`);
    for (const seed of [1, 42, 9999]) {
      const spec = buildRecipe(r.id, seed);
      const v = validateSpec(spec);
      assert.ok(v.ok, `${r.id}/${seed}: ${v.problems.join('; ')}`);
      assert.ok(allNumbers(spec).every(Number.isFinite), `${r.id} has NaN`);
      for (const ev of spec.events) {
        const starts = repeatStarts(ev);
        assert.ok(starts.at(-1) + ev.dur <= spec.duration + 0.001, `${r.id}: event runs past the end`);
      }
    }
  }
});

test('every environment builds valid layer specs', () => {
  for (const e of ENVIRONMENTS) {
    const specs = buildEnvironment(e.id, 3);
    assert.ok(specs.length >= 2, `${e.id} should layer sounds`);
    for (const s of specs) assert.ok(validateSpec(s).ok, `${e.id}: ${validateSpec(s).problems.join('; ')}`);
  }
});

test('curated challenges validate and cover every difficulty', () => {
  assert.ok(game.curated.length >= 24);
  for (const d of DIFFICULTIES) assert.ok(game.curated.filter((c) => c.difficulty === d).length >= 4, `need 4+ ${d}`);
  const modes = new Set(game.curated.map((c) => c.data.mode));
  for (const m of ['classic', 'reverse', 'slow', 'onesecond', 'layers', 'environment']) assert.ok(modes.has(m), `missing mode ${m}`);
  for (const c of game.curated) {
    const v = game.validate(c.data);
    assert.ok(v.ok, `${c.id}: ${v.problems.join('; ')}`);
  }
});

test('procedural levels validate at every difficulty', () => {
  for (const d of DIFFICULTIES) {
    for (let i = 0; i < 30; i++) {
      const data = game.procedural(d);
      const v = game.validate(data);
      assert.ok(v.ok, `${d}: ${JSON.stringify(data)} ${v.problems.join('; ')}`);
    }
  }
});

test('views never reveal the answer', () => {
  const challenges = [...game.curated, ...DIFFICULTIES.flatMap((d) => Array.from({ length: 10 }, (_, i) => ({ id: `p-${d}-${i}`, difficulty: d, data: game.procedural(d) })))];
  for (const c of challenges) {
    const round = createRound({ game: 'sound', challenge: c, difficulty: c.difficulty, mode: 'casual' });
    const json = JSON.stringify(game.start(round, c));
    const reveal = game.reveal(round, c);
    const words = new Set();
    for (const s of reveal.sounds) {
      const recipe = RECIPES.find((r) => r.name === s.answer);
      const env = ENVIRONMENTS.find((e) => e.name === s.answer);
      for (const a of [s.answer, ...(recipe?.accepted || env?.accepted || [])]) {
        for (const w of a.toLowerCase().split(/[^a-z]+/)) if (w.length > 3) words.add(w);
      }
    }
    for (const w of words) assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(json), `${c.id} view leaks "${w}"`);
    for (const r of RECIPES) assert.ok(!json.includes(`"${r.id}"`), `${c.id} view leaks recipe id ${r.id}`);
  }
});

test('a layered challenge is solved by naming each sound', async () => {
  const c = game.curated.find((x) => x.id === 'snd-layer-rain-clock');
  const round = createRound({ game: 'sound', challenge: c, difficulty: c.difficulty, mode: 'challenge' });
  const view = game.start(round, c);
  assert.equal(view.slots, 2);
  assert.equal(view.specs.length, 2);

  const wrong = await game.actions.guess(round, c, { text: 'a helicopter' });
  assert.equal(wrong.mistake, true);

  const first = await game.actions.guess(round, c, { text: 'rain on the window' });
  assert.equal(first.partial, true);
  assert.equal(first.remaining, 1);

  const again = await game.actions.guess(round, c, { text: 'rain' });
  assert.equal(again.already, true);
  assert.equal(round.mistakes, 1, 'repeating a found sound is not a mistake');

  const hint = game.hint(round, c);
  assert.match(hint.text, /^Sound 2:/, 'hints focus on the unfound sound');

  const done = await game.actions.guess(round, c, { text: 'ticking clock' });
  assert.equal(done.solved, true);
  assert.ok(done.score.total > 0);
  assert.equal(game.reveal(round, c).sounds.every((s) => s.found), true);
});

test('both layers can be named in one guess', async () => {
  const c = game.curated.find((x) => x.id === 'snd-layer-doorbell-typing');
  const round = createRound({ game: 'sound', challenge: c, difficulty: c.difficulty, mode: 'casual' });
  game.start(round, c);
  const res = await game.actions.guess(round, c, { text: 'someone typing and a doorbell' });
  assert.equal(res.solved, true);
});

test('environment and one-second challenges accept synonyms', async () => {
  for (const [id, text] of [['snd-env-beach', 'the seashore'], ['snd-1s-soda', 'opening a can of soda'], ['snd-shofar', 'blowing the shofar'], ['snd-typing', 'someone typing']]) {
    const c = game.curated.find((x) => x.id === id);
    const round = createRound({ game: 'sound', challenge: c, difficulty: c.difficulty, mode: 'casual' });
    game.start(round, c);
    const res = await game.actions.guess(round, c, { text });
    assert.equal(res.solved, true, `${id} should accept "${text}"`);
  }
});

test('uploaded audio challenges validate', () => {
  assert.ok(game.validate({ mode: 'classic', audioUrl: '/uploads/abc123.mp3', answer: 'Dog barking', accepted: ['dog'], hints: ['It is a pet.'] }).ok);
  assert.ok(!game.validate({ mode: 'layers', audioUrl: '/uploads/abc123.mp3', answer: 'x', hints: ['y'] }).ok);
  assert.ok(!game.validate({ mode: 'layers', layers: [{ recipe: 'clock' }, { recipe: 'metronome' }] }).ok, 'confusable layers are rejected');
});

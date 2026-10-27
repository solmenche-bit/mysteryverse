import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../server/games/mysterybox.js';
import { createRound } from '../server/engine/rounds.js';
import { getSubject, interpret } from '../server/engine/kb.js';
import { canonical } from '../server/engine/answers.js';
import { MATERIALS } from '../server/ai/prompts/mysterybox.js';
import { shakeSpec, tiltSpec, listenSpec } from '../server/media/boxsounds.js';

const newRound = (c, mode = 'casual') => {
  const r = createRound({ game: 'mysterybox', challenge: c, difficulty: c.difficulty, mode });
  r.view = game.start(r, c);
  return r;
};
const box = (id) => game.curated.find((c) => c.id === id);

function assertSpec(spec, label) {
  assert.ok(spec && spec.duration > 0 && Array.isArray(spec.events) && spec.events.length, `${label}: empty spec`);
  assert.ok(spec.gain > 0 && spec.gain <= 1, `${label}: gain`);
  const walk = (v, path) => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${label}: ${path} is not finite`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(spec, 'spec');
  for (const ev of spec.events) {
    assert.ok(ev.t >= 0 && ev.t < spec.duration, `${label}: event starts outside the sound (${ev.t})`);
    assert.ok(ev.dur > 0, `${label}: event has no length`);
    const end = ev.t + (ev.repeat ? ev.repeat.every * (ev.repeat.count - 1) : 0);
    assert.ok(end < spec.duration, `${label}: repeated event runs past the end`);
    assert.ok(['osc', 'noise'].includes(ev.src), `${label}: bad source`);
  }
}

// Everything the browser sees during play must be free of the objects' names.
function assertNoNames(c, payload, label) {
  const json = ` ${canonical(JSON.stringify(payload))} `;
  for (const o of c.data.objects) {
    const subj = getSubject(o.subjectId);
    for (const n of [subj.name, ...(subj.aliases || []), o.subjectId]) {
      const cn = canonical(n);
      if (!cn || MATERIALS.includes(cn) || MATERIALS.includes(n.toLowerCase())) continue;
      assert.ok(!json.includes(` ${cn} `), `${label}: leaks "${n}"`);
    }
  }
}

test('at least 22 curated boxes, at least 4 per difficulty, all valid', () => {
  assert.ok(game.curated.length >= 22);
  const per = {};
  for (const c of game.curated) {
    per[c.difficulty] = (per[c.difficulty] || 0) + 1;
    const v = game.validate(c.data, { difficulty: c.difficulty });
    assert.ok(v.ok, `${c.id}: ${v.problems.join('; ')}`);
    assert.deepEqual(v.warnings, [], `${c.id} warnings`);
  }
  for (const d of ['easy', 'medium', 'hard', 'expert', 'insane']) assert.ok(per[d] >= 4, `${d} has ${per[d]}`);
  assert.ok(game.curated.filter((c) => c.difficulty === 'insane').every((c) => c.data.objects.length >= 2));
});

test('tool responses are valid sound specs and never reveal the contents', () => {
  for (const c of game.curated) {
    const r = newRound(c);
    assertNoNames(c, r.view, `${c.id} view`);
    const responses = [game.actions.shake(r, c), game.actions.shake(r, c), game.actions.tilt(r, c, { direction: 'left' }),
      game.actions.tilt(r, c, { direction: 'right' }), game.actions.listen(r, c), game.actions.weigh(r, c), game.actions.scan(r, c)];
    for (const res of responses) {
      if (res.spec) assertSpec(res.spec, `${c.id}`);
      assertNoNames(c, res, `${c.id} tool`);
    }
    assert.ok(responses[5].needle >= 1 && responses[5].needle < 6);
  }
});

test('soft contents sound quieter than metal ones, and silence is quiet', () => {
  const sponge = box('box-sponge').data.objects;
  const keys = box('box-keys').data.objects;
  assert.ok(shakeSpec(sponge, 1).gain < shakeSpec(keys, 1).gain / 2);
  assert.ok(listenSpec(keys, 1).gain < 0.1);
  assert.ok(listenSpec(box('box-clock').data.objects, 1).gain > 0.2);
  assertSpec(tiltSpec(box('box-two-sloshes').data.objects, 9), 'tilt');
});

test('scanner reveals materials and runs out', () => {
  const c = box('box-phone-book'); // expert: 2 scans
  const r = newRound(c);
  const a = game.actions.scan(r, c);
  const b = game.actions.scan(r, c);
  assert.ok(a.material && b.material && a.material !== b.material);
  const empty = game.actions.scan(r, c);
  assert.equal(empty.ok, false);
  assert.equal(empty.scansLeft, 0);
});

test('multi-object boxes need every object found', async () => {
  const c = box('box-keys-clips');
  const r = newRound(c);
  const first = await game.actions.guess(r, c, { text: 'keys' });
  assert.equal(first.partial, true);
  assert.equal(first.remaining, 1);
  assert.ok(!r.solved);
  const wrong = await game.actions.guess(r, c, { text: 'a banana' });
  assert.equal(wrong.mistake, true);
  const done = await game.actions.guess(r, c, { text: 'paperclips' });
  assert.equal(done.solved, true);
  assert.ok(done.score.total > 0);

  const c2 = box('box-rattles');
  const r2 = newRound(c2);
  const all = await game.actions.guess(r2, c2, { text: 'walnuts, buttons and crayons' });
  assert.equal(all.solved, true);
});

test('questions in the ask box that name an object count as guesses', async () => {
  const c = box('box-marbles');
  const r = newRound(c);
  const res = await game.actions.ask(r, c, { text: 'Is there a marble inside the box?' });
  assert.equal(res.solved, true);
});

test('ask() answers agree with the knowledge base', async () => {
  const qs = ['Is it made of metal?', 'Can you eat it?', 'Is it alive?', 'Is it round?', 'Is it made of glass?', 'Is it a toy?', 'Does it make a sound?'];
  for (const c of game.curated.filter((x) => x.data.objects.length === 1)) {
    const r = newRound(c);
    const subj = getSubject(c.data.objects[0].subjectId);
    for (const q of qs) {
      const res = await game.actions.ask(r, c, { text: q });
      const expect = interpret(subj, q);
      if (expect.kind === 'answer') assert.equal(res.answer, expect.value, `${c.id}: ${q}`);
    }
  }
  // Multi-object answers aggregate across the hidden objects.
  const c = box('box-quiet-trio'); // balloon, sock, sponge
  const r = newRound(c);
  assert.equal((await game.actions.ask(r, c, { text: 'Are they made of rubber?' })).answer, 'some');
  assert.equal((await game.actions.ask(r, c, { text: 'Are they alive?' })).answer, 'no');
  assert.equal((await game.actions.ask(r, c, { text: 'What color is it?' })).answer, null);
});

test('hints and reveal', () => {
  const c = box('box-two-sloshes');
  const r = newRound(c);
  const h1 = game.hint(r, c);
  assert.ok(h1.text && h1.total >= 4);
  assertNoNames(c, h1, 'first hint');
  const rev = game.reveal(r, c);
  assert.equal(rev.objects.length, 2);
  assert.match(rev.answer, /Snow Globe/);
});

test('validation rejects bad boxes', () => {
  assert.equal(game.validate({ objects: [] }).ok, false);
  const bad = { objects: [{ subjectId: 'keys', shake: 'boom', tilt: 'rolls', listen: 'silence', grams: 50, materials: ['metal'], why: 'x' }] };
  assert.equal(game.validate(bad).ok, false);
  const leak = { objects: [{ subjectId: 'keys', shake: 'jingle', tilt: 'slides', tiltText: 'The keys slide over.', listen: 'silence', grams: 50, materials: ['metal'], why: 'x' }] };
  assert.equal(game.validate(leak).ok, false);
});

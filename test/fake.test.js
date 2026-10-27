import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, SCENE_TYPES, ANOMALIES, renderScene, svgProblems, composeLevel, MIN_RADIUS } from '../server/media/scenes.js';
import fake from '../server/games/fake.js';
import { createRound } from '../server/engine/rounds.js';
import { DIFFICULTIES } from '../server/config.js';

const SEEDS = [1, 7, 42, 999, 123456, 31337];

const tags = (svg) => new Set([...svg.matchAll(/<([a-z]+)[\s>/]/g)].map((m) => m[1]));
const attrs = (svg) => new Set([...svg.matchAll(/\s([a-z-]+)="/g)].map((m) => m[1]));

test('there are at least 16 scene types, each with at least one anomaly, across all difficulties', () => {
  assert.ok(SCENE_TYPES.length >= 16, `${SCENE_TYPES.length} scene types`);
  for (const t of SCENE_TYPES) assert.ok(Object.keys(SCENES[t].anomalies).length >= 1, t);
  for (const d of DIFFICULTIES) assert.ok(ANOMALIES.some((a) => a.difficulty === d), `no ${d} anomaly`);
});

test('every scene renders valid, safe SVG (normal and every anomaly, several seeds)', () => {
  for (const type of SCENE_TYPES) {
    for (const seed of SEEDS) {
      const normal = renderScene(type, seed);
      assert.deepEqual(svgProblems(normal.svg), [], `${type} #${seed} normal`);
      assert.equal(normal.region, null);
      assert.ok(normal.note);
      for (const anomaly of Object.keys(SCENES[type].anomalies)) {
        const f = renderScene(type, seed, anomaly);
        assert.deepEqual(svgProblems(f.svg), [], `${type}.${anomaly} #${seed}`);
        assert.ok(f.region.r >= MIN_RADIUS, `${type}.${anomaly} region too small`);
        assert.ok(f.region.cx >= 0 && f.region.cx <= 400 && f.region.cy >= 0 && f.region.cy <= 300, `${type}.${anomaly} region off-canvas`);
        assert.ok(f.explanation && f.title && f.hint && f.keywords.length, `${type}.${anomaly} metadata`);
        assert.notEqual(f.svg, normal.svg, `${type}.${anomaly} #${seed} looks identical to the normal picture`);
      }
    }
  }
});

test('fake pictures use the same markup vocabulary as real ones (nothing leaks which is fake)', () => {
  for (const type of SCENE_TYPES) {
    const normalTags = new Set();
    const normalAttrs = new Set();
    for (const seed of [...SEEDS, 2, 3, 4, 5, 6, 8, 9, 10]) {
      const svg = renderScene(type, seed).svg;
      tags(svg).forEach((t) => normalTags.add(t));
      attrs(svg).forEach((a) => normalAttrs.add(a));
    }
    for (const anomaly of Object.keys(SCENES[type].anomalies)) {
      for (const seed of SEEDS) {
        const svg = renderScene(type, seed, anomaly).svg;
        for (const t of tags(svg)) assert.ok(normalTags.has(t), `${type}.${anomaly} uses <${t}> which real pictures never use`);
        for (const a of attrs(svg)) assert.ok(normalAttrs.has(a), `${type}.${anomaly} uses attribute ${a} which real pictures never use`);
        assert.ok(!/anomal|fake|wrong|impossible/i.test(svg), `${type}.${anomaly} markup mentions the answer`);
      }
    }
  }
});

test('rendering is deterministic for a seed', () => {
  for (const type of SCENE_TYPES) assert.equal(renderScene(type, 77).svg, renderScene(type, 77).svg, type);
});

test('every curated level validates, with at least 4 per difficulty and 22 in total', () => {
  assert.ok(fake.curated.length >= 22);
  for (const d of DIFFICULTIES) assert.ok(fake.curated.filter((c) => c.difficulty === d).length >= 4, d);
  const ids = new Set();
  for (const c of fake.curated) {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    const v = fake.validate(c.data);
    assert.deepEqual(v.problems, [], c.id);
    const f = c.data.scenes.find((s) => s.anomaly);
    assert.equal(SCENES[f.type].anomalies[f.anomaly].difficulty === c.difficulty || c.difficulty === 'insane', true, `${c.id} anomaly difficulty`);
  }
});

test('procedural levels validate for every difficulty', () => {
  for (const d of DIFFICULTIES) {
    for (let k = 0; k < 20; k++) {
      const data = fake.procedural(d);
      assert.deepEqual(fake.validate(data).problems, [], `${d} #${k}`);
      if (d === 'insane') assert.equal(new Set(data.scenes.map((s) => s.type)).size, 1);
      if (d === 'easy') assert.equal(new Set(data.scenes.map((s) => s.type)).size, 6);
    }
  }
  assert.equal(composeLevel('hard', 5).length, 6);
});

test('validation rejects broken levels', () => {
  const good = fake.curated[0].data;
  assert.equal(fake.validate({ scenes: good.scenes.slice(0, 5) }).ok, false);
  assert.equal(fake.validate({ scenes: good.scenes.map((s) => ({ ...s, anomaly: undefined })) }).ok, false);
  assert.equal(fake.validate({ scenes: good.scenes.map((s) => ({ type: s.type, seed: s.seed, anomaly: 'thirteen' })) }).ok, false);
  assert.equal(fake.validate({ scenes: [...good.scenes.slice(0, 5), { type: 'unicorn', seed: 1 }] }).ok, false);
});

function play(challengeData, mode = 'casual', difficulty = 'easy') {
  const challenge = { id: 'test-fake', data: challengeData };
  const round = createRound({ game: 'fake', challenge, difficulty, mode });
  const view = fake.start(round, challenge);
  return { round, challenge, view };
}

test('start sends six shuffled SVGs and nothing else', () => {
  const { view, round } = play(fake.curated[0].data);
  assert.deepEqual(Object.keys(view).sort(), ['count', 'images']);
  assert.equal(view.images.length, 6);
  assert.ok(view.images.every((s) => s.startsWith('<svg')));
  assert.ok(round.state.fakeSlot >= 0 && round.state.fakeSlot < 6);
});

test('pick: wrong picture is marked real and counts a mistake; right picture solves', async () => {
  const { round, challenge } = play(fake.curated[0].data);
  const wrong = [0, 1, 2, 3, 4, 5].find((k) => k !== round.state.fakeSlot);
  const r1 = await fake.actions.pick(round, challenge, { index: wrong });
  assert.equal(r1.mistake, true);
  assert.equal(r1.real, true);
  assert.ok(r1.note);
  const again = await fake.actions.pick(round, challenge, { index: wrong });
  assert.equal(again.ok, false);
  const r2 = await fake.actions.pick(round, challenge, { index: round.state.fakeSlot });
  assert.equal(r2.solved, true);
  assert.equal(r2.reasonCorrect, null);
  const reveal = fake.reveal(round, challenge);
  assert.equal(reveal.fakeIndex, round.state.fakeSlot);
  assert.ok(reveal.region.r >= MIN_RADIUS && reveal.image.startsWith('<svg'));
});

test('pick: a correct reason earns the bonus, a wrong reason does not', async () => {
  const data = fake.curated.find((c) => c.id === 'fake-e1').data; // clock with a 13
  const a = play(data);
  const good = await fake.actions.pick(a.round, a.challenge, { index: a.round.state.fakeSlot, reason: 'The clock has a 13 instead of a 12' });
  assert.equal(good.reasonCorrect, true);
  assert.ok(good.score.lines.some((l) => /why/i.test(l.label)));
  const b = play(data);
  const bad = await fake.actions.pick(b.round, b.challenge, { index: b.round.state.fakeSlot, reason: 'the colors look funny' });
  assert.equal(bad.solved, true);
  assert.equal(bad.reasonCorrect, false);
  assert.ok(!bad.score.lines.some((l) => /why/i.test(l.label)));
  assert.ok(good.score.total > bad.score.total);
});

test('hardcore mode: one wrong pick ends the run', async () => {
  const { round, challenge } = play(fake.curated[0].data, 'hardcore');
  const wrong = [0, 1, 2, 3, 4, 5].find((k) => k !== round.state.fakeSlot);
  const r = await fake.actions.pick(round, challenge, { index: wrong });
  assert.equal(r.failed, true);
  assert.equal(r.runOver, true);
});

test('hints eliminate real pictures, point where to look, and never reveal the fake', () => {
  const { round, challenge } = play(fake.curated[3].data);
  const h1 = fake.hint(round, challenge);
  round.hintsUsed++;
  assert.equal(h1.eliminate.length, 2);
  assert.ok(!h1.eliminate.includes(round.state.fakeSlot));
  const h2 = fake.hint(round, challenge);
  round.hintsUsed++;
  assert.ok(h2.text.length > 5 && !h2.eliminate);
  const h3 = fake.hint(round, challenge);
  round.hintsUsed++;
  assert.equal(h3.eliminate.length, 1);
  assert.ok(!h3.eliminate.includes(round.state.fakeSlot));
  assert.equal(fake.hint(round, challenge), null);
  const remaining = [0, 1, 2, 3, 4, 5].filter((k) => !round.state.eliminated.includes(k));
  assert.ok(remaining.length >= 2 && remaining.includes(round.state.fakeSlot));
});

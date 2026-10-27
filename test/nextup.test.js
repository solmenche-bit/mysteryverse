import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import game, { matchPrediction, MODES } from '../server/games/nextup.js';
import { CANVAS_CLIPS } from '../server/content/nextup.js';
import { validateClip } from '../server/media/video.js';
import { createRound } from '../server/engine/rounds.js';
import { CLIPS } from '../public/js/games/nextup-clips.js';

const byId = (id) => game.curated.find((c) => c.id === id);

test('curated challenges validate and cover every difficulty', () => {
  assert.ok(game.curated.length >= 22, `only ${game.curated.length} challenges`);
  const counts = {};
  for (const c of game.curated) {
    const v = game.validate(c.data);
    assert.ok(v.ok, `${c.id}: ${v.problems.join('; ')}`);
    counts[c.difficulty] = (counts[c.difficulty] || 0) + 1;
  }
  for (const d of ['easy', 'medium', 'hard', 'expert', 'insane']) assert.ok(counts[d] >= 4, `${d} has ${counts[d] || 0}`);
});

test('server clip list matches the client clip file', () => {
  const src = fs.readFileSync(new URL('../public/js/games/nextup-clips.js', import.meta.url), 'utf8');
  const found = {};
  for (const m of src.matchAll(/id: '(\w+)', duration: ([\d.]+), pauseAt: ([\d.]+)/g)) found[m[1]] = { duration: Number(m[2]), pauseAt: Number(m[3]) };
  assert.deepEqual(found, CANVAS_CLIPS);
  assert.deepEqual(Object.keys(CLIPS).sort(), Object.keys(CANVAS_CLIPS).sort());
  assert.ok(Object.keys(CLIPS).length >= 20);
  for (const [id, c] of Object.entries(CLIPS)) {
    assert.equal(c.duration, CANVAS_CLIPS[id].duration);
    const ratio = c.pauseAt / c.duration;
    assert.ok(ratio > 0.3 && ratio < 0.8, `${id} pauses at ${Math.round(ratio * 100)}%`);
  }
  const used = new Set(game.curated.map((c) => c.data.clip.clipId));
  for (const id of Object.keys(CLIPS)) assert.ok(used.has(id), `clip ${id} is not used by any challenge`);
});

/** Minimal 2D context stand-in that rejects non-finite geometry. */
function mockContext() {
  const numeric = new Set(['arc', 'ellipse', 'rect', 'roundRect', 'moveTo', 'lineTo', 'translate', 'scale', 'rotate', 'bezierCurveTo', 'fillRect', 'fillText', 'strokeText', 'clearRect', 'createLinearGradient', 'createRadialGradient']);
  const calls = { count: 0 };
  return new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return () => ({ width: 120 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return (...args) => {
        for (const a of args) assert.ok(Number.isFinite(a), `${prop} got ${a}`);
        return { addColorStop() {} };
      };
      return (...args) => {
        calls.count++;
        if (numeric.has(prop)) for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${String(prop)} got ${a}`);
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

test('every clip renders every frame without errors or NaN', () => {
  for (const [id, c] of Object.entries(CLIPS)) {
    for (let t = 0; t <= c.duration + 0.5; t += 0.04) {
      try {
        c.draw(mockContext(), t, 1280, 720);
      } catch (err) {
        assert.fail(`${id} at t=${t.toFixed(2)}: ${err.message}`);
      }
    }
    for (const [ct, name] of c.cues || []) assert.ok(ct > 0 && ct <= c.duration && typeof name === 'string', `${id} cue`);
  }
});

test('answer sets: four different choices, exactly one correct', () => {
  for (const c of game.curated) {
    for (const set of [{ choices: c.data.choices, correct: c.data.correct }, c.data.twist, c.data.impossible]) {
      assert.equal(set.choices.length, 4, c.id);
      assert.equal(new Set(set.choices).size, 4, c.id);
      assert.ok([0, 1, 2, 3].includes(set.correct), c.id);
    }
  }
});

test('prediction matching accepts paraphrases and rejects wrong ideas', () => {
  const yes = [
    ['nx-cups', 'the wind blows the tower over'], ['nx-cups', 'The cups all come tumbling down'],
    ['nx-penguin', 'it knocks down all the pins'], ['nx-penguin', 'STRIKE!'],
    ['nx-cradle', 'two balls swing out on the other side'], ['nx-toast', 'it lands upside down with the jam on the floor'],
    ['nx-pendulum', "it stops right before his nose and doesn't hit him"], ['nx-soccer', 'the ball bounces off the bar and goes in'],
    ['nx-coin', 'it lands on its edge'], ['nx-illusion', 'they are the same length'], ['nx-plane', 'the fan blows it back to him'],
    ['nx-sprinkler', 'he opens his umbrella'], ['nx-birds', 'the little birds slide down to the middle'],
    ['nx-dominogap', 'the chain stops because the gap is too big'], ['nx-magnet', 'the paper clips jump up and stick to it'],
    ['nx-balloon', 'it popped'], ['nx-pancake', "it lands on the chef's head"], ['nx-catcup', 'the cat pushes the cup off the table'],
    ['nx-loop', 'it goes all the way around the loop'], ['nx-icecube', 'it melts really fast'],
    ['nx-snowball', 'it hits the snowman and the head lands on top of it'], ['nx-tail', "the dog's tail knocks it over"],
    ['nx-rube', 'the bucket spills water on the plant'], ['nx-seesaw', 'the ball flies into the basket'],
    ['nx-trickshot', 'it goes in the hoop'], ['nx-bigdomino', 'the last domino rings the bell'],
  ];
  const no = [
    ['nx-cups', 'the boy adds another cup'], ['nx-cups', 'the tower stays standing'], ['nx-penguin', 'it stops before the pins'],
    ['nx-cradle', 'one ball flies out'], ['nx-toast', 'it lands jam side up'], ['nx-pendulum', 'it hits him in the face'],
    ['nx-soccer', 'it hits the crossbar and misses'], ['nx-coin', 'heads'], ['nx-illusion', 'the top one is longer'],
    ['nx-plane', 'it gets stuck in the fan'], ['nx-sprinkler', 'he gets soaked'], ['nx-birds', 'they all fly away'],
    ['nx-dominogap', 'they all fall down'], ['nx-pancake', 'it falls on the floor'], ['nx-loop', 'it falls off at the top'],
    ['nx-snowball', 'it crashes into the snowman'], ['nx-cups', 'the tower does not fall'],
  ];
  const bad = [];
  for (const [id, text] of yes) if (matchPrediction(text, byId(id).data).verdict !== 'correct') bad.push(`should accept ${id}: "${text}"`);
  for (const [id, text] of no) if (matchPrediction(text, byId(id).data).verdict === 'correct') bad.push(`should reject ${id}: "${text}"`);
  assert.deepEqual(bad, []);
});

test('views never leak the ending or the correct choice', () => {
  for (const c of game.curated) {
    for (const variant of MODES) {
      const round = createRound({ game: 'nextup', challenge: c, difficulty: c.difficulty, mode: 'casual' });
      const view = game.start(round, c, { variant });
      const json = JSON.stringify(view);
      assert.ok(!json.includes(c.data.outcome), `${c.id}/${variant} leaks outcome`);
      assert.ok(!json.includes(c.data.outcomeShort), `${c.id}/${variant} leaks outcomeShort`);
      assert.ok(!json.includes(c.data.explanation), `${c.id}/${variant} leaks explanation`);
      assert.ok(!/"correct"/.test(json), `${c.id}/${variant} leaks the correct index`);
      assert.equal(view.mode, variant);
      if (variant === 'predict') assert.equal(view.choices, null);
      else assert.equal(view.choices.length, 4);
    }
  }
});

test('choice modes: wrong answers are eliminated, the right one solves', () => {
  const c = byId('nx-penguin');
  const round = createRound({ game: 'nextup', challenge: c, difficulty: c.difficulty, mode: 'casual' });
  game.start(round, c, { variant: 'pick' });
  const right = round.state.order.indexOf(c.data.correct);
  const wrong = (right + 1) % 4;
  const r1 = game.actions.choose(round, c, { index: wrong });
  assert.equal(r1.mistake, true);
  assert.deepEqual(r1.eliminated, [wrong]);
  assert.equal(game.actions.choose(round, c, { index: wrong }).ok, false);
  const r2 = game.actions.choose(round, c, { index: right });
  assert.equal(r2.solved, true);
  assert.equal(game.reveal(round, c).correctChoice, right);
});

test('predict mode: correct solves with a bonus, wrong ends the level (except Classroom)', async () => {
  const c = byId('nx-cups');
  let round = createRound({ game: 'nextup', challenge: c, difficulty: c.difficulty, mode: 'casual' });
  game.start(round, c, { variant: 'predict' });
  const win = await game.actions.predict(round, c, { text: 'A gust of wind knocks the tower down' });
  assert.equal(win.solved, true);
  assert.ok(win.score.lines.some((l) => /own words/.test(l.label)));

  round = createRound({ game: 'nextup', challenge: c, difficulty: c.difficulty, mode: 'casual' });
  game.start(round, c, { variant: 'predict' });
  const lose = await game.actions.predict(round, c, { text: 'The boy adds a cup on top' });
  assert.equal(lose.failed, true);

  round = createRound({ game: 'nextup', challenge: c, difficulty: c.difficulty, mode: 'classroom' });
  game.start(round, c, { variant: 'predict' });
  const again = await game.actions.predict(round, c, { text: 'The boy adds a cup on top' });
  assert.equal(again.failed, false);
  assert.equal(again.mistake, true);
});

test('choice-mode hints end by ruling out a wrong option', () => {
  const c = byId('nx-coin');
  const round = createRound({ game: 'nextup', challenge: c, difficulty: c.difficulty, mode: 'casual' });
  game.start(round, c, { variant: 'impossible' });
  round.hintsUsed = c.data.hints.length;
  const h = game.hint(round, c);
  assert.ok(Number.isInteger(h.eliminate));
  assert.notEqual(round.state.order[h.eliminate], c.data.impossible.correct);
});

test('video files: uploaded/linked clips validate, bad ones are rejected', () => {
  assert.deepEqual(validateClip({ clip: { kind: 'file', url: '/uploads/abc123.mp4', pauseAt: 4.5 } }), []);
  assert.deepEqual(validateClip({ clip: { kind: 'file', url: 'https://cdn.example.org/clips/cups.webm', pauseAt: 3, duration: 8 } }), []);
  assert.ok(validateClip({ clip: { kind: 'file', url: 'javascript:alert(1)', pauseAt: 3 } }).length);
  assert.ok(validateClip({ clip: { kind: 'file', url: '/uploads/a.mp4', pauseAt: 0 } }).length);
  assert.ok(validateClip({ clip: { kind: 'generative' } }).length);
  assert.ok(validateClip({ clip: { kind: 'canvas', clipId: 'nope' } }).length);
});

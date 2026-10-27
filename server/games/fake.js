// Game 5: Find the Fake. Six procedurally drawn pictures; exactly one hides a
// deliberate impossibility. Pictures are rendered on the server and shuffled per
// round, so the browser never learns which one is fake.
import crypto from 'node:crypto';
import { registerMistake, solveRound, addBonus, BASE_POINTS } from '../engine/rounds.js';
import { checkAnswer, canonical } from '../engine/answers.js';
import { aiAvailable } from '../ai/provider.js';
import { scanPlayerText, scanObject } from '../safety/policy.js';
import { SCENES, SCENE_TYPES, renderScene, svgProblems, composeLevel, MIN_RADIUS } from '../media/scenes.js';
import { FAKE_LEVELS } from '../content/fake.js';
import { DIFFICULTIES } from '../config.js';

const EST = { easy: 45, medium: 70, hard: 100, expert: 140, insane: 180 };

const shuffled = (n) => {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const fakeIndexOf = (d) => d.scenes.findIndex((s) => s.anomaly);

/** Does the group's "why" mention the actual anomaly? Keyword match first, AI judge if connected. */
async function reasonMatches(reason, fake) {
  const c = ` ${canonical(reason)} `;
  if (fake.keywords.some((k) => canonical(k) && c.includes(` ${canonical(k)} `))) return true;
  if (!aiAvailable()) return false;
  const res = await checkAnswer(reason, { answer: fake.title, accepted: fake.keywords, context: `Why the picture is fake: ${fake.explanation}`, cacheKey: `fake:${fake.title}` });
  return res.correct;
}

function renderAll(d) {
  return d.scenes.map((s) => renderScene(s.type, s.seed, s.anomaly || null));
}

export default {
  id: 'fake',
  title: 'Find the Fake',
  tagline: 'Five are real. One is impossible.',
  description: 'Six pictures. One of them hides something impossible. Spot the fake and say why.',
  emoji: '🔍',
  accent: '#34d399',
  generationKind: 'procedural',
  curated: FAKE_LEVELS,
  schemaNotes: `{ "scenes": [ { "type": "clock", "seed": 123 }, ... six entries, exactly one with "anomaly" ], "estSeconds": 90 }
Scene types and anomalies: ${SCENE_TYPES.map((t) => `${t} (${Object.keys(SCENES[t].anomalies).join(', ')})`).join('; ')}`,

  summarize(d) {
    const f = d.scenes?.find((s) => s.anomaly);
    if (!f || !SCENES[f.type]?.anomalies[f.anomaly]) return 'Find the Fake level';
    const kinds = new Set(d.scenes.map((s) => s.type));
    return `${SCENES[f.type].anomalies[f.anomaly].title} (${kinds.size === 1 ? `six ${SCENES[f.type].label.toLowerCase()} pictures` : `${kinds.size} kinds of pictures`})`;
  },

  procedural(difficulty) {
    const d = DIFFICULTIES.includes(difficulty) ? difficulty : 'easy';
    return { scenes: composeLevel(d), estSeconds: EST[d] };
  },

  async generate({ difficulty }) {
    return this.procedural(difficulty);
  },

  start(round, challenge) {
    const d = challenge.data;
    const order = shuffled(d.scenes.length); // order[displaySlot] = scene index
    const rendered = renderAll(d);
    const fakeScene = fakeIndexOf(d);
    const fake = rendered[fakeScene];
    round.state = {
      order,
      fakeSlot: order.indexOf(fakeScene),
      eliminated: [],
      fake: { title: fake.title, explanation: fake.explanation, hint: fake.hint, keywords: fake.keywords, region: fake.region },
      notes: order.map((i) => rendered[i].note),
      fakeSvg: fake.svg,
    };
    return { images: order.map((i) => rendered[i].svg), count: order.length };
  },

  actions: {
    async pick(round, challenge, { index, reason }) {
      const i = Number(index);
      const st = round.state;
      if (!Number.isInteger(i) || i < 0 || i >= st.order.length) return { ok: false, message: 'Pick one of the six pictures.' };
      if (st.eliminated.includes(i)) return { ok: false, message: `Picture ${i + 1} is already known to be real.` };
      const why = String(reason || '').trim().slice(0, 200);
      if (why && !scanPlayerText(why).ok) return { ok: false, blocked: true, message: "Let's keep it classroom-friendly!" };
      if (i === st.fakeSlot) {
        let reasonCorrect = null;
        if (why) {
          reasonCorrect = await reasonMatches(why, st.fake);
          if (reasonCorrect) addBonus(round, 'Explained exactly why', (BASE_POINTS[round.difficulty] ?? 100) * 0.3);
        }
        const est = challenge.data.estSeconds || EST[round.difficulty] || 90;
        return { ...solveRound(round, est), index: i, reasonCorrect };
      }
      st.eliminated.push(i);
      return { ...registerMistake(round), correct: false, index: i, real: true, note: st.notes[i] };
    },
  },

  hint(round) {
    const st = round.state;
    const n = round.hintsUsed;
    const realLeft = () => st.order.map((_, k) => k).filter((k) => k !== st.fakeSlot && !st.eliminated.includes(k));
    const eliminate = (count) => {
      const pool = realLeft();
      const chosen = [];
      // Always leave at least one real picture in play so the hint never gives the answer away.
      while (chosen.length < count && pool.length > 1) chosen.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
      st.eliminated.push(...chosen);
      return chosen.sort((a, b) => a - b);
    };
    if (n === 0 || n === 2) {
      const gone = eliminate(n === 0 ? 2 : 1);
      if (!gone.length) return n === 0 ? { text: st.fake.hint, index: n + 1, total: 3 } : null;
      const list = gone.map((k) => k + 1).join(' and ');
      return { text: `Picture${gone.length > 1 ? 's' : ''} ${list} ${gone.length > 1 ? 'are' : 'is'} definitely real.`, index: n + 1, total: 3, eliminate: gone };
    }
    if (n === 1) return { text: st.fake.hint, index: 2, total: 3 };
    return null;
  },

  reveal(round, challenge) {
    const st = round.state?.order ? round.state : null;
    if (!st) {
      const f = challenge.data.scenes[fakeIndexOf(challenge.data)];
      const fake = renderScene(f.type, f.seed, f.anomaly);
      return { answer: fake.title, explanation: fake.explanation, region: fake.region, image: fake.svg };
    }
    return {
      answer: `Picture ${st.fakeSlot + 1}: ${st.fake.title}`,
      explanation: st.fake.explanation,
      fakeIndex: st.fakeSlot,
      region: st.fake.region,
      image: st.fakeSvg,
      notes: st.notes.map((note, k) => (k === st.fakeSlot ? null : note)),
    };
  },

  validate(d) {
    const problems = [];
    if (!d || !Array.isArray(d.scenes)) return { ok: false, problems: ['data.scenes must be a list of six scenes'] };
    if (d.scenes.length !== 6) problems.push('Exactly six scenes are required');
    const fakes = d.scenes.filter((s) => s && s.anomaly);
    if (fakes.length !== 1) problems.push(`Exactly one scene must have an anomaly (found ${fakes.length})`);
    for (const [k, s] of d.scenes.entries()) {
      if (!s || !SCENES[s.type]) {
        problems.push(`Scene ${k + 1}: unknown type "${s?.type}"`);
        continue;
      }
      if (s.anomaly && !SCENES[s.type].anomalies[s.anomaly]) {
        problems.push(`Scene ${k + 1}: "${s.type}" has no anomaly "${s.anomaly}" (options: ${Object.keys(SCENES[s.type].anomalies).join(', ')})`);
        continue;
      }
      if (!Number.isFinite(Number(s.seed))) problems.push(`Scene ${k + 1}: seed must be a number`);
      let r;
      try {
        r = renderScene(s.type, s.seed, s.anomaly || null);
      } catch (err) {
        problems.push(`Scene ${k + 1}: ${err.message}`);
        continue;
      }
      for (const p of svgProblems(r.svg)) problems.push(`Scene ${k + 1}: ${p}`);
      if (s.anomaly) {
        if (!r.region || r.region.r < MIN_RADIUS) problems.push('The fake detail is too small to see on a projector');
        else if (r.region.cx < 0 || r.region.cx > 400 || r.region.cy < 0 || r.region.cy > 300) problems.push('The fake detail is outside the picture');
        if (!r.explanation) problems.push('The fake needs an explanation');
      }
    }
    const safety = scanObject({ scenes: d.scenes });
    if (!safety.ok) problems.push(...safety.hits.map((h) => `Blocked term "${h.term}"`));
    return { ok: problems.length === 0, problems };
  },
};

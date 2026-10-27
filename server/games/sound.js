// Game 6: Guess the Sound.
import { checkAnswer, matchAnswer } from '../engine/answers.js';
import { registerMistake, solveRound, addBonus, BASE_POINTS } from '../engine/rounds.js';
import { scanPlayerText, scanObject } from '../safety/policy.js';
import { getSettings } from '../db.js';
import {
  RECIPES, RECIPE_MAP, ENVIRONMENTS, ENV_MAP, buildRecipe, buildEnvironment, validateSpec, confusable,
} from '../media/soundlib.js';
import { SOUND_CHALLENGES } from '../content/sound.js';

const MODES = {
  classic: { label: 'Classic', playback: { rate: 1, reverse: false } },
  reverse: { label: 'Reversed', playback: { rate: 1, reverse: true } },
  slow: { label: 'Slow motion', playback: { rate: 0.5, reverse: false } },
  onesecond: { label: 'One second', playback: { rate: 1, reverse: false, maxSeconds: 1 } },
  layers: { label: 'Sound layers', playback: { rate: 1, reverse: false } },
  environment: { label: 'Mystery environment', playback: { rate: 1, reverse: false } },
};
const SINGLE = new Set(['classic', 'reverse', 'slow', 'onesecond']);
const EST_SECONDS = { easy: 40, medium: 60, hard: 80, expert: 120, insane: 150 };

/** Answer slots for a challenge: one per sound that must be named. */
function slotsFor(d) {
  if (d.audioUrl) return [{ answer: d.answer, accepted: d.accepted || [], hints: d.hints || [], emoji: d.emoji || '🎧', explanation: d.explanation || '' }];
  if (d.mode === 'environment') {
    const env = ENV_MAP[d.environment];
    return [{ answer: env.name, accepted: env.accepted, hints: env.hints, emoji: env.emoji, explanation: env.explanation }];
  }
  return d.layers.map((l) => {
    const r = RECIPE_MAP[l.recipe];
    return { answer: r.name, accepted: r.accepted, hints: r.hints, emoji: r.emoji, explanation: r.explanation };
  });
}

/** The synthesized specs the browser renders (environment and layers are mixed client-side). */
function specsFor(d) {
  if (d.audioUrl) return [];
  if (d.mode === 'environment') return buildEnvironment(d.environment, d.seed || 1);
  const gain = d.layers.length > 1 ? 0.7 : 0.8;
  return d.layers.map((l) => buildRecipe(l.recipe, l.seed || 1, { gain: l.gain ?? gain }));
}

function playbackFor(d) {
  const p = { ...MODES[d.mode].playback };
  if (d.mode === 'slow' && d.rate) p.rate = d.rate;
  return p;
}

const describe = (d) => (d.audioUrl ? d.answer : d.mode === 'environment' ? ENV_MAP[d.environment]?.name : d.layers.map((l) => RECIPE_MAP[l.recipe]?.name).join(' + '));

// ---------------------------------------------------------------- procedural levels

function shuffled(list, rnd) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick n recipes from the pool that are never confusable with each other. */
function pickDistinct(pool, n, rnd) {
  const out = [];
  for (const r of shuffled(pool, rnd)) {
    if (out.every((o) => !confusable(o.id, r.id) && o.category !== r.category)) out.push(r);
    if (out.length === n) return out;
  }
  return out.length === n ? out : null;
}

export function proceduralSound(difficulty, rnd = Math.random) {
  const jewishOk = getSettings().content.jewishContent;
  const pool = (levels, filter = () => true) => RECIPES.filter((r) => levels.includes(r.difficulty) && (jewishOk || !r.tags?.includes('jewish')) && filter(r));
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const seed = () => 1 + Math.floor(rnd() * 99_999);
  const single = (mode, levels, filter) => ({ mode, layers: [{ recipe: pick(pool(levels, filter)).id, seed: seed() }] });
  const layered = (n, levels) => {
    const chosen = pickDistinct(pool(levels), n, rnd);
    return { mode: 'layers', layers: chosen.map((r) => ({ recipe: r.id, seed: seed() })) };
  };
  const env = () => ({ mode: 'environment', environment: pick(ENVIRONMENTS).id, seed: seed() });
  const x = rnd();
  let data;
  switch (difficulty) {
    case 'easy': data = single('classic', ['easy']); break;
    case 'medium': data = x < 0.75 ? single('classic', ['medium']) : single('slow', ['easy']); break;
    case 'hard': data = x < 0.45 ? single('classic', ['hard']) : x < 0.75 ? single('reverse', ['easy', 'medium'], (r) => r.quick) : single('slow', ['medium']); break;
    case 'expert': data = x < 0.55 ? layered(2, ['easy', 'medium']) : env(); break;
    default: data = x < 0.45 ? layered(3, ['easy', 'medium', 'hard']) : x < 0.75 ? single('onesecond', ['medium', 'hard'], (r) => r.quick) : env();
  }
  const usesJewish = data.layers?.some((l) => RECIPE_MAP[l.recipe].tags?.includes('jewish'));
  if (usesJewish) data.tags = ['jewish'];
  return data;
}

// ---------------------------------------------------------------- module

export default {
  id: 'sound',
  title: 'Guess the Sound',
  tagline: 'Listen closely.',
  description: 'Play a mystery sound and figure out what made it. Reversed, slowed down, layered...',
  emoji: '🎧',
  accent: '#fb7185',
  generationKind: 'procedural',
  curated: SOUND_CHALLENGES,
  schemaNotes: 'mode: classic | reverse | slow | onesecond | layers | environment. layers: [{ recipe, seed }] (1 for single modes, 2-3 for layers). environment: environment id + seed. For an uploaded recording: { mode: "classic", audioUrl: "/uploads/...", answer, accepted: [...], hints: [...], emoji, explanation }.',

  summarize: (d) => `${MODES[d.mode]?.label || d.mode}: ${describe(d)}`,

  start(round, challenge) {
    const d = challenge.data;
    const slots = slotsFor(d);
    const playback = playbackFor(d);
    const specs = specsFor(d);
    round.state = { found: [], hintCount: slots.map(() => 0), plays: 0, wrong: [] };
    const longest = specs.length ? Math.max(...specs.map((s) => s.duration)) : null;
    const audible = longest == null ? null : Math.min(longest, playback.maxSeconds ?? longest) / playback.rate;
    return {
      mode: d.mode,
      specs,
      audioUrl: d.audioUrl || null,
      playback,
      slots: slots.length,
      durationSeconds: audible == null ? null : Math.round(audible * 10) / 10,
    };
  },

  actions: {
    async guess(round, challenge, { text }) {
      const guess = String(text || '').trim().slice(0, 120);
      if (!guess) return { ok: false, message: 'Type a guess first!' };
      if (!scanPlayerText(guess).ok) return { ok: false, blocked: true, message: "Let's keep it classroom-friendly!" };
      const d = challenge.data;
      const slots = slotsFor(d);
      const st = round.state;
      // "rain and a clock" can name two layers at once.
      const split = slots.length > 1 ? guess.split(/\s*(?:,|&|\+|\band\b|\bplus\b|\bwith\b)\s*/i).filter(Boolean) : [];
      const parts = split.length > 1 ? split.slice(0, slots.length) : [guess];
      const newly = [];
      let close = false;
      let reason = '';
      for (const part of parts) {
        for (let i = 0; i < slots.length; i++) {
          if (st.found.includes(i)) continue;
          const res = await checkAnswer(part, {
            answer: slots[i].answer,
            accepted: slots[i].accepted,
            context: `Guess-the-sound game. The sound is: ${slots[i].answer}. ${slots[i].explanation}`,
            cacheKey: `${challenge.id}:${i}`,
          });
          if (res.correct) {
            st.found.push(i);
            newly.push(i);
            break;
          }
          close ||= res.close;
          reason ||= res.reason || '';
        }
      }
      const found = st.found.map((i) => ({ index: i, answer: slots[i].answer, emoji: slots[i].emoji }));
      if (newly.length) {
        if (st.found.length === slots.length) {
          if (st.plays <= 1) addBonus(round, 'Got it on the first listen', BASE_POINTS[round.difficulty] * 0.1);
          return { ...solveRound(round, EST_SECONDS[round.difficulty]), guess, found, slots: slots.length };
        }
        return { ok: true, correct: true, partial: true, guess, found, slots: slots.length, remaining: slots.length - st.found.length };
      }
      if (st.found.some((i) => matchAnswer(guess, [slots[i].answer, ...slots[i].accepted]).match)) {
        return { ok: true, correct: false, already: true, guess, found, slots: slots.length, message: 'You already found that one! Listen for the other sounds.' };
      }
      st.wrong.push(guess);
      return { ...registerMistake(round), correct: false, close, guess, reason, found, slots: slots.length };
    },

    played(round) {
      round.state.plays += 1;
      return { ok: true, plays: round.state.plays };
    },
  },

  hint(round, challenge) {
    const slots = slotsFor(challenge.data);
    const st = round.state;
    const total = slots.reduce((s, x) => s + x.hints.length, 0);
    const open = slots.map((s, i) => i).filter((i) => !st.found.includes(i) && st.hintCount[i] < slots[i].hints.length);
    if (!open.length) return null;
    const i = open.reduce((best, j) => (st.hintCount[j] < st.hintCount[best] ? j : best), open[0]);
    const text = slots[i].hints[st.hintCount[i]++];
    return { text: slots.length > 1 ? `Sound ${i + 1}: ${text}` : text, index: round.hintsUsed + 1, total };
  },

  reveal(round, challenge) {
    const d = challenge.data;
    const slots = slotsFor(d);
    const found = round.state.found || [];
    const explanation = d.explanation || (slots.length === 1 ? slots[0].explanation : slots.map((s) => s.answer).join(', ') + '.');
    return {
      answer: slots.map((s) => s.answer).join(' + '),
      emoji: slots.map((s) => s.emoji).join(''),
      explanation,
      sounds: slots.map((s, i) => ({ answer: s.answer, emoji: s.emoji, found: found.includes(i) })),
      mode: d.mode,
    };
  },

  validate(d) {
    const problems = [];
    if (!d || typeof d !== 'object') return { ok: false, problems: ['Missing data'] };
    if (!MODES[d.mode]) problems.push(`Unknown mode "${d.mode}"`);
    if (d.audioUrl) {
      if (!/^\/uploads\/[\w.-]+$/.test(d.audioUrl) && !/^https:\/\/\S+$/.test(d.audioUrl)) problems.push('audioUrl must be an uploaded file (/uploads/...) or an https URL');
      if (!SINGLE.has(d.mode)) problems.push('Uploaded audio works with classic, reverse, slow or onesecond mode');
      if (!d.answer || String(d.answer).length > 60) problems.push('answer (1-60 characters) is required for uploaded audio');
      if (!Array.isArray(d.hints) || d.hints.length < 1) problems.push('Give at least one hint');
      if (d.accepted && !Array.isArray(d.accepted)) problems.push('accepted must be a list');
    } else if (d.mode === 'environment') {
      if (!ENV_MAP[d.environment]) problems.push(`Unknown environment "${d.environment}" (choose: ${ENVIRONMENTS.map((e) => e.id).join(', ')})`);
    } else if (MODES[d.mode]) {
      const layers = Array.isArray(d.layers) ? d.layers : [];
      if (SINGLE.has(d.mode) && layers.length !== 1) problems.push(`${MODES[d.mode].label} mode needs exactly one sound`);
      if (d.mode === 'layers' && (layers.length < 2 || layers.length > 3)) problems.push('Layers mode needs 2 or 3 sounds');
      for (const l of layers) if (!RECIPE_MAP[l?.recipe]) problems.push(`Unknown sound "${l?.recipe}" (choose: ${RECIPES.map((r) => r.id).join(', ')})`);
      for (let i = 0; i < layers.length; i++) for (let j = i + 1; j < layers.length; j++) {
        if (RECIPE_MAP[layers[i].recipe] && confusable(layers[i].recipe, layers[j].recipe)) problems.push(`"${layers[i].recipe}" and "${layers[j].recipe}" sound too alike to layer together`);
      }
    }
    if (d.rate != null && !(d.rate >= 0.25 && d.rate <= 2)) problems.push('rate must be between 0.25 and 2');
    if (!problems.length && !d.audioUrl) {
      try {
        for (const spec of specsFor(d)) problems.push(...validateSpec(spec).problems);
      } catch (err) {
        problems.push(err.message);
      }
    }
    const safety = scanObject({ answer: d.answer, accepted: d.accepted, hints: d.hints, explanation: d.explanation });
    if (!safety.ok) problems.push(...safety.hits.map((h) => `Blocked term "${h.term}"`));
    return { ok: problems.length === 0, problems };
  },

  procedural: (difficulty) => proceduralSound(difficulty),
  generate: async ({ difficulty }) => proceduralSound(difficulty),
};

// Game 4: What Happens Next?
import crypto from 'node:crypto';
import { registerMistake, solveRound, failRound, addBonus, BASE_POINTS } from '../engine/rounds.js';
import { normalize, levenshtein } from '../engine/answers.js';
import { aiAvailable, aiJSON } from '../ai/provider.js';
import { scanPlayerText, scanObject, scanText } from '../safety/policy.js';
import { NEXTUP_CHALLENGES } from '../content/nextup.js';
import { resolveClip, validateClip } from '../media/video.js';
import { JUDGE_SCHEMA, judgePrompt } from '../ai/prompts/nextup.js';

export const MODES = ['predict', 'pick', 'twist', 'impossible'];

const QUESTIONS = {
  predict: 'What happens next?',
  pick: 'How does it end?',
  twist: 'Which detail gives the ending away?',
  impossible: 'These all sound impossible... but ONE really happens. Which one?',
};

// ---------------------------------------------------------------- prediction matching

/** Light stemmer so fall/falls/falling/fallen-style variants line up. */
function key(w) {
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /(ch|sh|x|ss|z|o)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w.replace(/([b-df-hj-np-tv-z])\1$/, '$1');
}

const words = (s) => normalize(s).split(' ').filter(Boolean).map(key);

function hasPhrase(toks, phrase) {
  const p = words(phrase);
  if (!p.length) return false;
  for (let i = 0; i + p.length <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < p.length && ok; j++) {
      const a = toks[i + j];
      const b = p[j];
      ok = a === b || (p.length === 1 && b.length >= 6 && Math.abs(a.length - b.length) <= 1 && levenshtein(a, b) <= 1);
    }
    if (ok) return true;
  }
  return false;
}

// Non-answers that should not use up the group's one prediction.
const FILLER = /^(h+m+|u+m+|u+h+|idk|i dont know|dunno|no idea|not sure|ok|okay|yes|no|maybe|test|asdf|nothing)$/;

const NEGATION = /\b(not|never|no|nothing|nobody|doesnt|dont|wont|didnt|isnt|cant|cannot|wouldnt|arent|without)\b/;

/**
 * Offline semantic check: every concept group needs at least one hit (in the main
 * set or any `alsoAccept` set). Negations and "blocker" phrases downgrade to close.
 * @returns {{verdict: 'correct'|'close'|'wrong'}}
 */
export function matchPrediction(text, d) {
  const toks = words(text);
  if (!toks.length) return { verdict: 'wrong' };
  let best = 0;
  let full = false;
  for (const groups of [d.concepts, ...(d.alsoAccept || [])]) {
    if (!groups?.length) continue;
    const hits = groups.filter((g) => g.some((kw) => hasPhrase(toks, kw))).length;
    best = Math.max(best, hits / groups.length);
    if (hits === groups.length) full = true;
  }
  const blocked = (d.blockers || []).some((b) => hasPhrase(toks, b));
  if (full && !blocked && (d.negationOk || !NEGATION.test(normalize(text)))) return { verdict: 'correct' };
  if (full || best >= 0.5) return { verdict: 'close' };
  return { verdict: 'wrong' };
}

// ---------------------------------------------------------------- helpers

function answerSet(d, mode) {
  if (mode === 'pick') return { choices: d.choices, correct: d.correct };
  if (mode === 'twist') return d.twist;
  if (mode === 'impossible') return d.impossible;
  return null;
}

function shuffled(n) {
  const a = [...Array(n).keys()];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const choiceSetProblems = (set, label) => {
  const problems = [];
  if (!set || !Array.isArray(set.choices) || set.choices.length !== 4) problems.push(`${label}: exactly 4 choices are required`);
  else {
    if (new Set(set.choices.map((c) => String(c).toLowerCase().trim())).size !== 4) problems.push(`${label}: choices must all be different`);
    if (set.choices.some((c) => !c || String(c).length > 140)) problems.push(`${label}: each choice must be 1-140 characters`);
  }
  if (!Number.isInteger(set?.correct) || set.correct < 0 || set.correct > 3) problems.push(`${label}: correct must be 0, 1, 2 or 3`);
  return problems;
};

async function aiJudge(d, prediction) {
  const p = judgePrompt(d, prediction);
  const out = await aiJSON({
    purpose: 'nextup.judge', system: p.system, messages: [{ role: 'user', content: p.user }],
    schema: JUDGE_SCHEMA, effort: 'low', maxTokens: 1500, timeoutMs: 20_000,
  });
  return {
    verdict: out.verdict,
    explanation: scanText(out.explanation).ok ? out.explanation : '',
    retryHint: scanText(out.retryHint).ok ? out.retryHint : '',
  };
}

// ---------------------------------------------------------------- module

export default {
  id: 'nextup',
  title: 'What Happens Next?',
  tagline: 'Pause. Predict. Reveal.',
  description: 'Watch a clip, freeze it right before the twist, and predict what happens next.',
  emoji: '🎬',
  accent: '#f472b6',
  generationKind: null, // new clips need new media; add them in Admin (upload a video, then create a challenge)
  curated: NEXTUP_CHALLENGES,
  schemaNotes: 'clip: { kind: "canvas", clipId } for a built-in animation, or { kind: "file", url: "/uploads/x.mp4", pauseAt: 4.5, duration? }. '
    + 'concepts: list of keyword groups; a typed prediction is accepted when every group has a hit (alsoAccept: alternative group lists; '
    + 'blockers: phrases that make a prediction only "close"; negationOk: true when the ending itself is a "doesn\'t happen"). '
    + 'choices + correct (Pick the Ending), twist { question, choices, correct }, impossible { choices, correct }: 4 choices each, correct is 0-3.',

  summarize: (d) => d.title || d.outcomeShort || 'Clip',

  start(round, challenge, opts = {}) {
    const d = challenge.data;
    const mode = MODES.includes(opts.variant) ? opts.variant : 'predict';
    const set = answerSet(d, mode);
    const order = set ? shuffled(set.choices.length) : null;
    round.state = { mode, order, eliminated: [], predictions: [], closeTries: 0 };
    const clip = resolveClip(d);
    return {
      clip,
      pauseAt: clip.pauseAt,
      mode,
      title: d.title,
      teaser: d.teaser || '',
      question: QUESTIONS[mode],
      choices: set ? order.map((i) => set.choices[i]) : null,
      replayAllowed: d.replayAllowed !== false,
      hintsTotal: d.hints.length + (set ? 1 : 0),
    };
  },

  actions: {
    async predict(round, challenge, { text }) {
      const st = round.state;
      if (st.mode !== 'predict') return { ok: false, message: 'Pick one of the endings!' };
      const prediction = String(text || '').trim().slice(0, 300);
      if (prediction.length < 3 || FILLER.test(normalize(prediction))) return { ok: false, message: 'Describe what you think happens next!' };
      if (!scanPlayerText(prediction).ok) return { ok: false, blocked: true, message: "Let's keep it classroom-friendly!" };
      const d = challenge.data;
      let { verdict } = matchPrediction(prediction, d);
      let explanation = '';
      let retryHint = '';
      let method = 'offline';
      if (verdict !== 'correct' && aiAvailable()) {
        try {
          round.aiCalls++;
          ({ verdict, explanation, retryHint } = await aiJudge(d, prediction));
          method = 'ai';
        } catch {
          /* keep the offline verdict */
        }
      }
      st.predictions.push({ text: prediction, verdict });
      if (verdict === 'correct') {
        addBonus(round, 'Called it in your own words', BASE_POINTS[round.difficulty] * 0.25);
        return { ...solveRound(round, d.estSeconds), prediction, verdict, method, explanation: explanation || `Yes! ${d.outcome}` };
      }
      if (verdict === 'close' && st.closeTries < 1) {
        st.closeTries += 1;
        return { ok: true, correct: false, close: true, prediction, verdict, message: retryHint || "You're on the right track... can you be more specific?" };
      }
      const m = registerMistake(round);
      if (m.failed) return { ...m, prediction, verdict, method, explanation };
      if (round.mode === 'classroom') {
        return { ...m, correct: false, close: verdict === 'close', prediction, verdict, message: retryHint || 'Not quite. Talk it over and try another prediction!' };
      }
      return { ...m, ...failRound(round), prediction, verdict, method, explanation };
    },

    choose(round, challenge, { index }) {
      const st = round.state;
      const set = answerSet(challenge.data, st.mode);
      if (!set) return { ok: false, message: 'Type your prediction instead!' };
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i >= st.order.length) return { ok: false, message: 'Pick A, B, C or D.' };
      if (st.eliminated.includes(i)) return { ok: false, message: 'That one is already ruled out!' };
      if (st.order[i] === set.correct) return { ...solveRound(round, challenge.data.estSeconds), choice: i };
      st.eliminated.push(i);
      return { ...registerMistake(round), correct: false, choice: i, eliminated: st.eliminated };
    },
  },

  hint(round, challenge) {
    const d = challenge.data;
    const st = round.state;
    const set = answerSet(d, st.mode);
    const total = d.hints.length + (set ? 1 : 0);
    const i = round.hintsUsed;
    if (i < d.hints.length) return { text: d.hints[i], index: i + 1, total };
    if (set && i === d.hints.length) {
      // Last hint in the multiple-choice modes rules out one wrong ending.
      const wrong = st.order.map((orig, shown) => ({ orig, shown })).filter((o) => o.orig !== set.correct && !st.eliminated.includes(o.shown));
      if (wrong.length <= 1) return null;
      const out = wrong[crypto.randomInt(wrong.length)];
      st.eliminated.push(out.shown);
      return { text: `It is NOT ${'ABCD'[out.shown]}.`, index: i + 1, total, eliminate: out.shown };
    }
    return null;
  },

  reveal(round, challenge) {
    const d = challenge.data;
    const st = round.state || {};
    const set = answerSet(d, st.mode);
    return {
      answer: d.outcomeShort,
      explanation: `${d.outcome} ${d.explanation}`,
      outcome: d.outcome,
      correctChoice: set && st.order ? st.order.indexOf(set.correct) : null,
      playFrom: resolveClip(d).pauseAt,
      predictions: st.predictions || [],
    };
  },

  validate(d) {
    const problems = [];
    if (!d || typeof d !== 'object') return { ok: false, problems: ['Missing data'] };
    problems.push(...validateClip(d));
    for (const k of ['title', 'outcomeShort', 'outcome', 'explanation']) if (!d[k] || typeof d[k] !== 'string') problems.push(`${k} is required`);
    const groupsOk = (gs) => Array.isArray(gs) && gs.length > 0 && gs.every((g) => Array.isArray(g) && g.length > 0 && g.every((k) => typeof k === 'string' && k.trim()));
    if (!groupsOk(d.concepts)) problems.push('concepts must be a non-empty list of non-empty keyword lists');
    if (d.alsoAccept && !(Array.isArray(d.alsoAccept) && d.alsoAccept.every(groupsOk))) problems.push('alsoAccept must be a list of concept-group lists');
    if (d.blockers && !(Array.isArray(d.blockers) && d.blockers.every((b) => typeof b === 'string'))) problems.push('blockers must be a list of phrases');
    problems.push(...choiceSetProblems({ choices: d.choices, correct: d.correct }, 'Pick the Ending'));
    problems.push(...choiceSetProblems(d.twist, 'Spot the Twist'));
    if (!d.twist?.question) problems.push('Spot the Twist: question is required');
    problems.push(...choiceSetProblems(d.impossible, 'Impossible Ending'));
    if (!Array.isArray(d.hints) || d.hints.length < 2) problems.push('At least two hints are required');
    if (d.safety?.approved !== true) problems.push('safety.approved must be true (only safety-reviewed clips can be played)');
    if (typeof d.replayAllowed !== 'boolean') problems.push('replayAllowed must be true or false');
    if (!(Number(d.estSeconds) > 0)) problems.push('estSeconds must be a positive number');
    if (d.outcome && matchPrediction(d.outcome, d).verdict !== 'correct') problems.push('The outcome text itself does not match the concepts - the matcher would reject a perfect prediction');
    if (d.teaser && d.outcomeShort && normalize(d.teaser).includes(normalize(d.outcomeShort))) problems.push('The teaser gives away the ending');
    const safety = scanObject(d);
    if (!safety.ok) problems.push(...safety.hits.map((h) => `Blocked term "${h.term}"`));
    return { ok: problems.length === 0, problems };
  },
};

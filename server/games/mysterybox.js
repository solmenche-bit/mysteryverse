// Game 3: The Mystery Box. Every physical property of the contents is fixed before play
// and lives only on the server; the browser receives sound specs and readouts, never names.
import crypto from 'node:crypto';
import { registerSubjects, getSubject, interpret, describe, PROPS, allSubjects } from '../engine/kb.js';
import { registerMistake, solveRound, addBonus, BASE_POINTS } from '../engine/rounds.js';
import { checkAnswer, canonical } from '../engine/answers.js';
import { aiAvailable, aiJSON } from '../ai/provider.js';
import { scanPlayerText, scanText, scanObject, isSafeEmoji } from '../safety/policy.js';
import { playerText } from '../ai/prompts.js';
import { SUBJECTS } from '../content/subjects.js';
import { BOX_SUBJECTS, MYSTERY_BOXES } from '../content/mysterybox.js';
import {
  shakeSpec, tiltSpec, listenSpec, TILT_TEXT, LISTEN_TEXT, SHAKE_TEXT, SHAKE_TIMES, SHAKE_PROFILES, TILT_MOTIONS, LISTEN_TYPES,
} from '../media/boxsounds.js';
import { ASK_SCHEMA, askPrompt, BOX_SCHEMA, generatePrompt, MATERIALS } from '../ai/prompts/mysterybox.js';

registerSubjects(SUBJECTS);
registerSubjects(BOX_SUBJECTS);

const SCANS = { easy: 3, medium: 3, hard: 2, expert: 2, insane: 1 };
const EST = { easy: 90, medium: 120, hard: 160, expert: 220, insane: 280 };
const OBJECT_COUNT = { easy: [1, 1], medium: [1, 1], hard: [1, 1], expert: [2, 2], insane: [2, 3] };

// Scale buckets: [upper bound in grams, label, comparison]
const WEIGHTS = [
  [25, 'Feather-light', 'lighter than a pencil'],
  [150, 'Light', 'about as heavy as a banana, or less'],
  [600, 'Medium', 'about as heavy as a full lunchbox'],
  [1500, 'Heavy', 'about as heavy as a big pineapple'],
  [6000, 'Very heavy', 'as heavy as a bowling ball'],
];

const SINGLE = {
  yes: ['Yes!', 'Yes.', 'Yep!'],
  no: ['No.', 'Nope.', 'Definitely not.'],
  sometimes: ['Sometimes!', 'It depends...'],
  unknown: ["Hmm, the box isn't sure.", 'Hard to say.'],
  na: ["That doesn't really apply.", 'Not applicable!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function boxObjects(challenge) {
  return challenge.data.objects.map((o, index) => {
    if (o.subject && !getSubject(o.subject.id)) registerSubjects([o.subject]);
    return { ...o, index, subj: getSubject(o.subject?.id || o.subjectId) };
  });
}

const unfound = (round, objs) => objs.filter((o) => !round.state.found[o.index]);
const pubFound = (o) => ({ index: o.index, name: o.subj.name, emoji: o.subj.emoji });

function sizeText(size) {
  if (size <= 1) return 'tiny, about as small as a grape';
  if (size <= 1.5) return 'small enough to hide in your palm';
  if (size <= 2) return 'about the size of your hand';
  if (size <= 2.5) return 'a bit bigger than your hand';
  return 'about the size of a shoebox';
}

function weighReading(grams) {
  const edges = [1, ...WEIGHTS.map((w) => w[0])];
  const g = Math.max(1, Math.min(5999, grams));
  const i = Math.max(0, WEIGHTS.findIndex((w) => g < w[0]));
  const lo = Math.log(edges[i]);
  const hi = Math.log(edges[i + 1]);
  const needle = Math.min(5.95, i + 1 + (Math.log(g) - lo) / (hi - lo));
  return { category: WEIGHTS[i][1], compare: WEIGHTS[i][2], needle: Math.round(needle * 100) / 100 };
}

/** Turn box-specific phrasing ("is there a ... inside?", "are they ...") into plain KB questions. */
export function rephrase(q) {
  let s = String(q).trim().replace(/[?!.]+$/, '');
  s = s.replace(/\b(in|inside) (the|this) (box|crate)\b/gi, '').replace(/\s+(inside|in there)$/i, '').trim();
  s = s.replace(/^(is there|are there)\s+(an?|any|some)?\s*/i, 'Is it a ');
  s = s.replace(/^(does|do) (the box|it|this box|the crate) (contain|have|hold)\s+(an?|any|some)?\s*/i, 'Is it a ');
  s = s.replace(/^(is|are) (one|any|some|all|both|either) of (them|the objects|the things|the items)\s*/i, 'Is it ');
  s = s.replace(/^(are|is) (they|the objects|the things|the items|both of them|all of them)\b/i, 'Is it');
  s = s.replace(/^(do|does) (they|any of them|one of them|both of them|all of them)\b/i, 'Does it');
  s = s.replace(/^(can|could) (they|one of them|any of them)\b/i, 'Can it');
  return `${s}?`;
}

const guessTextFrom = (q) => String(q).trim()
  .replace(/[?!.]+$/, '')
  .replace(/^(is it|is this|is there|is one of them|are they|are there|could it be|maybe|is the answer|do you have|i think it is|it is|its)\s+(an?|the|some|any)?\s*/i, '')
  .replace(/\s+(in|inside) (the|this) (box|crate)$/i, '')
  .trim();

function aggregate(values) {
  const n = values.length;
  if (n === 1) return { value: values[0], text: pick(SINGLE[values[0]] || SINGLE.unknown) };
  const count = (v) => values.filter((x) => x === v).length;
  const yes = count('yes');
  if (yes === n) return { value: 'yes', text: n === 2 ? 'Yes, both of them!' : 'Yes, all of them!' };
  if (yes > 0) return { value: 'some', text: yes === 1 ? 'One of them, yes!' : `${yes} of them, yes!` };
  if (count('no') === n) return { value: 'no', text: n === 2 ? 'No, neither of them.' : 'No, none of them.' };
  if (count('sometimes') > 0) return { value: 'sometimes', text: 'Sometimes...' };
  return { value: 'unknown', text: "Hmm, that's hard to say for these." };
}

function leaksName(text, objs) {
  const t = ` ${canonical(text)} `;
  return objs.some((o) => [o.subj.name, ...(o.subj.aliases || [])].some((n) => canonical(n) && t.includes(` ${canonical(n)} `)));
}

async function doGuess(round, challenge, text) {
  const objs = boxObjects(challenge);
  const d = round.difficulty;
  const parts = [...new Set([text, ...text.split(/\s*(?:,|&|\+|\band\b|\bplus\b|\bwith\b)\s*/i)].map((s) => s.trim()).filter((s) => s.length > 1))];
  const newly = [];
  let close = false;
  for (const part of parts) {
    for (const o of unfound(round, objs)) {
      const r = await checkAnswer(part, {
        answer: o.subj.name,
        accepted: [...(o.subj.aliases || []), ...(o.accepted || [])],
        context: `An object hidden in a mystery box. ${o.why}`,
        cacheKey: `${challenge.id}:${o.index}`,
        semantic: part === text || parts.length <= 3,
      });
      if (r.correct) {
        round.state.found[o.index] = true;
        newly.push(o);
        break;
      }
      close ||= r.close;
    }
  }
  const foundAll = objs.filter((o) => round.state.found[o.index]).map(pubFound);
  if (newly.length) {
    const left = unfound(round, objs).length;
    if (!left) {
      const spare = SCANS[d] - round.state.scansUsed;
      if (spare > 0) addBonus(round, `${spare} scan${spare > 1 ? 's' : ''} left unused`, BASE_POINTS[d] * 0.05 * spare);
      return { ...solveRound(round, EST[d]), guess: text, found: newly.map(pubFound), foundAll };
    }
    return {
      ok: true, correct: true, partial: true, guess: text, found: newly.map(pubFound), foundAll, remaining: left,
      message: `Yes! You found the ${newly.map((o) => o.subj.name.toLowerCase()).join(' and the ')}! ${left === 1 ? 'One more thing is' : `${left} more things are`} still hiding.`,
    };
  }
  return { ...registerMistake(round), correct: false, close, guess: text, foundAll };
}

function tiltLines(lines) {
  const unique = [...new Set(lines)];
  if (lines.length === 1) return lines[0];
  if (unique.length === 1) return unique[0].replace(/^Something/, 'Everything').replace(/^Lots of/, 'Lots of');
  return unique.map((l, i) => `${i === 0 ? 'One thing' : 'Another'}: ${l.charAt(0).toLowerCase()}${l.slice(1)}`).join(' ');
}

async function aiAsk(round, objs, question) {
  const p = askPrompt(objs.map((o) => ({
    name: o.subj.name, aliases: o.subj.aliases, grams: o.grams, materials: o.materials, shake: SHAKE_TEXT[o.shake], tilt: o.tilt, facts: describe(o.subj),
  })), round.state.history);
  round.aiCalls++;
  return aiJSON({
    purpose: 'mysterybox.ask', system: p.system,
    messages: [{ role: 'user', content: `Player question: ${playerText(question)}` }],
    schema: ASK_SCHEMA, maxTokens: 2500, timeoutMs: 25_000,
  });
}

const actions = {
  shake(round, challenge) {
    const objs = boxObjects(challenge);
    const st = round.state;
    st.shakes += 1;
    const grams = objs.reduce((s, o) => s + o.grams, 0);
    return {
      ok: true,
      spec: shakeSpec(objs, st.seed + st.shakes * 101),
      times: SHAKE_TIMES,
      intensity: Math.round((0.35 + 0.65 * Math.min(1, Math.log10(grams + 1) / 3.2)) * 100) / 100,
      text: `You hear ${objs.map((o) => SHAKE_TEXT[o.shake]).join(', plus ')}.`,
    };
  },

  tilt(round, challenge, { direction }) {
    const objs = boxObjects(challenge);
    const st = round.state;
    st.tilts += 1;
    const dir = direction === 'left' ? 'left' : 'right';
    const lines = objs.map((o) => o.tiltText || TILT_TEXT[o.tilt]);
    return {
      ok: true,
      direction: dir,
      motion: objs[0].tilt,
      motions: objs.map((o) => o.tilt),
      spec: tiltSpec(objs, st.seed + st.tilts * 211),
      text: tiltLines(lines),
    };
  },

  listen(round, challenge) {
    const objs = boxObjects(challenge);
    const loud = objs.filter((o) => o.listen && o.listen !== 'silence');
    return {
      ok: true,
      sound: loud[0]?.listen || 'silence',
      spec: listenSpec(objs, round.state.seed + 7),
      text: loud.length ? loud.map((o) => o.listenText || LISTEN_TEXT[o.listen]).join(' ') : objs.length > 1 ? 'Silence. None of them make a sound on their own.' : LISTEN_TEXT.silence,
    };
  },

  weigh(round, challenge) {
    const objs = boxObjects(challenge);
    const w = weighReading(objs.reduce((s, o) => s + o.grams, 0));
    return { ok: true, ...w, text: `The scale reads ${w.category.toUpperCase()}: ${w.compare}${objs.length > 1 ? ' (all together)' : ''}.` };
  },

  scan(round, challenge) {
    const objs = boxObjects(challenge);
    const st = round.state;
    const limit = SCANS[round.difficulty];
    if (st.scansUsed >= limit) return { ok: false, scansLeft: 0, message: 'The scanner battery is empty!' };
    const order = [];
    for (let i = 0; i < 3; i++) for (const o of objs) if (o.materials[i] && !order.includes(o.materials[i])) order.push(o.materials[i]);
    const next = order.find((m) => !st.materialsShown.includes(m));
    if (!next) return { ok: true, material: null, scansLeft: limit - st.scansUsed, text: 'Scan complete: no new materials detected.' };
    st.materialsShown.push(next);
    st.scansUsed += 1;
    return { ok: true, material: next, scansLeft: limit - st.scansUsed, text: `Material detected: ${next.toUpperCase()}` };
  },

  async ask(round, challenge, { text }) {
    const question = String(text || '').trim().slice(0, 200);
    if (!question) return { ok: false, message: 'Type a question first.' };
    if (!scanPlayerText(question).ok) return { ok: false, blocked: true, message: "Let's keep it classroom-friendly! Try another question." };
    if (round.aiCalls > 80) return { ok: false, message: 'That is a lot of questions! Time to guess.' };
    const objs = boxObjects(challenge);
    const targets = unfound(round, objs).length ? unfound(round, objs) : objs;
    const st = round.state;
    const partialNote = targets.length < objs.length ? (targets.length === 1 ? ' (about the one you haven\'t found yet)' : ' (about the ones still hiding)') : '';

    if (aiAvailable()) {
      try {
        const out = await aiAsk(round, targets, question);
        if (out.isGuess) return doGuess(round, challenge, out.guessText || guessTextFrom(question));
        if (!out.isYesNoQuestion) return { ok: true, counted: false, question, answer: null, message: 'The box only answers yes-or-no questions!' };
        let value = out.answer === 'not_applicable' ? 'na' : out.answer;
        if (targets.length === 1 && value === 'some') value = 'sometimes';
        const comment = out.comment && scanText(out.comment).ok && !leaksName(out.comment, objs) ? out.comment : '';
        st.asked += 1;
        st.history.push({ q: question, a: value });
        const said = value === 'some' ? 'Some of them, yes!' : pick(SINGLE[value] || SINGLE.unknown);
        return { ok: true, counted: true, question, answer: value, answerText: said + partialNote, comment, asked: st.asked, source: 'ai' };
      } catch {
        /* fall back to the offline engine below */
      }
    }

    const q = rephrase(question);
    const results = targets.map((o) => interpret(o.subj, q));
    if (results.every((r) => r.kind === 'notyesno')) return { ok: true, counted: false, question, answer: null, message: 'The box only answers yes-or-no questions!' };
    const answered = results.filter((r) => r.kind === 'answer');
    if (!answered.length) {
      if (results.some((r) => r.kind === 'guess')) return doGuess(round, challenge, guessTextFrom(question));
      return { ok: true, counted: false, question, answer: null, message: "The box isn't sure how to answer that. Try asking about size, material, or where you'd find it." };
    }
    const values = results.map((r) => (r.kind === 'answer' ? r.value : r.kind === 'guess' ? 'no' : 'unknown'));
    const agg = aggregate(values);
    st.asked += 1;
    st.history.push({ q: question, a: agg.value });
    const comment = targets.length === 1 ? results[0].comment || '' : '';
    return { ok: true, counted: true, question, answer: agg.value, answerText: agg.text + partialNote, comment, asked: st.asked, source: 'offline' };
  },

  async guess(round, challenge, { text }) {
    const t = String(text || '').trim().slice(0, 120);
    if (!t) return { ok: false, message: 'Type your guess first!' };
    if (!scanPlayerText(t).ok) return { ok: false, blocked: true, message: "Let's keep it classroom-friendly!" };
    return doGuess(round, challenge, guessTextFrom(t) || t);
  },
};

function hintList(round, challenge) {
  const objs = boxObjects(challenge);
  const hidden = unfound(round, objs).length ? unfound(round, objs) : objs;
  const biggest = Math.max(...hidden.map((o) => o.subj.size || 2));
  const list = [hidden.length > 1 ? `The biggest hidden object is ${sizeText(biggest)}.` : `It is ${sizeText(biggest)}.`];
  for (let k = 0; k < 3; k++) {
    for (const o of hidden) if (o.subj.hints?.[k]) list.push(hidden.length > 1 ? `One of them: ${o.subj.hints[k]}` : o.subj.hints[k]);
  }
  return list;
}

export default {
  id: 'mysterybox',
  title: 'The Mystery Box',
  tagline: 'Shake it. Scan it. Solve it.',
  description: 'Something is inside the box. Shake it, tilt it, listen to it and question it until you know what it is.',
  emoji: '📦',
  accent: '#f59e0b',
  generationKind: 'ai',
  curated: MYSTERY_BOXES,
  schemaNotes: `objects: 1-3 entries, each { subjectId (knowledge-base id) or subject (full definition), shake: ${SHAKE_PROFILES.join('|')}, tilt: ${TILT_MOTIONS.join('|')}, tiltText?, listen: ${LISTEN_TYPES.join('|')}, listenText?, grams, materials: [${MATERIALS.join('|')}], accepted: [extra answers], why }`,

  summarize: (d) => (d.objects || []).map((o) => o.subject?.name || getSubject(o.subjectId)?.name || o.subjectId).join(' + '),

  start(round, challenge) {
    const objs = boxObjects(challenge);
    const maxSize = Math.max(...objs.map((o) => o.subj?.size || 2));
    const boxSize = maxSize <= 1.5 ? 'small' : maxSize <= 2.5 ? 'medium' : 'large';
    round.state = { found: objs.map(() => false), scansUsed: 0, materialsShown: [], shakes: 0, tilts: 0, asked: 0, history: [], seed: crypto.randomInt(1, 2 ** 31 - 1) };
    return {
      count: objs.length,
      boxSize,
      boxLabel: { small: 'A small crate', medium: 'A shoebox-sized crate', large: 'A big crate' }[boxSize],
      scans: SCANS[round.difficulty],
      aiMode: aiAvailable() ? 'ai' : 'offline',
    };
  },

  actions,

  hint(round, challenge) {
    const list = hintList(round, challenge);
    const i = round.hintsUsed;
    return i < list.length ? { text: list[i], index: i + 1, total: list.length } : null;
  },

  reveal(round, challenge) {
    const objs = boxObjects(challenge);
    return {
      answer: objs.map((o) => o.subj.name).join(' + '),
      emoji: objs.map((o) => o.subj.emoji).join(' '),
      explanation: objs.length === 1 ? objs[0].why : 'Here is how every clue fits:',
      objects: objs.map((o) => ({ ...pubFound(o), why: o.why, found: !!round.state.found?.[o.index] })),
    };
  },

  validate(d, opts = {}) {
    const problems = [];
    const warnings = [];
    if (!d || !Array.isArray(d.objects) || d.objects.length < 1 || d.objects.length > 3) return { ok: false, problems: ['A box needs 1 to 3 objects'], warnings };
    const seen = new Set();
    for (const [n, o] of d.objects.entries()) {
      const label = `Object ${n + 1}`;
      const subj = o.subject || getSubject(o.subjectId);
      if (!subj) problems.push(`${label}: unknown subject "${o.subjectId}"`);
      else if (seen.has(subj.id)) problems.push(`${label}: the same object appears twice`);
      if (subj) seen.add(subj.id);
      if (o.subject) {
        if (!o.subject.id || !o.subject.name) problems.push(`${label}: subject needs an id and a name`);
        if (!isSafeEmoji(o.subject.emoji)) problems.push(`${label}: emoji is not on the safe list`);
        if ((o.subject.hints || []).length !== 3) problems.push(`${label}: exactly three hints are required`);
        if (String(o.subject.p || '').split(/\s+/).filter(Boolean).length < 20) problems.push(`${label}: needs at least 20 facts for consistent answers`);
        if (!(o.subject.size >= 0.5 && o.subject.size <= 3.5)) problems.push(`${label}: must be small enough to fit in a box (size 0.5-3.5)`);
      }
      if (!SHAKE_PROFILES.includes(o.shake)) problems.push(`${label}: shake must be one of ${SHAKE_PROFILES.join(', ')}`);
      if (!TILT_MOTIONS.includes(o.tilt)) problems.push(`${label}: tilt must be one of ${TILT_MOTIONS.join(', ')}`);
      if (!LISTEN_TYPES.includes(o.listen)) problems.push(`${label}: listen must be one of ${LISTEN_TYPES.join(', ')}`);
      if (!(Number(o.grams) >= 1 && Number(o.grams) <= 20000)) problems.push(`${label}: grams must be between 1 and 20000`);
      if (!Array.isArray(o.materials) || !o.materials.length || o.materials.some((m) => !MATERIALS.includes(m))) problems.push(`${label}: materials must be a non-empty list from ${MATERIALS.join(', ')}`);
      if (!o.why || String(o.why).length > 240) problems.push(`${label}: "why" explanation is required (max 240 characters)`);
      for (const k of ['tiltText', 'listenText']) if (o[k] != null && (typeof o[k] !== 'string' || o[k].length > 200)) problems.push(`${label}: ${k} must be a short sentence`);
      if (o.accepted != null && !Array.isArray(o.accepted)) problems.push(`${label}: accepted must be a list`);
      // Clue texts must never name an object.
      if (subj && [o.tiltText, o.listenText].some((t) => t && leaksName(t, [{ subj }]))) problems.push(`${label}: a clue text names the object`);
    }
    const [lo, hi] = OBJECT_COUNT[opts.difficulty] || [1, 3];
    if (opts.difficulty && (d.objects.length < lo || d.objects.length > hi)) {
      (opts.generated ? problems : warnings).push(`${opts.difficulty} boxes usually hold ${lo === hi ? lo : `${lo}-${hi}`} object(s)`);
    }
    const safety = scanObject(d);
    if (!safety.ok) problems.push(...safety.hits.map((h) => `Blocked term "${h.term}"`));
    return { ok: problems.length === 0, problems, warnings };
  },

  async generate({ difficulty }) {
    if (!aiAvailable()) throw new Error('AI generation needs an API key (see Admin > Settings).');
    const [lo, hi] = OBJECT_COUNT[difficulty] || [1, 1];
    const count = lo + Math.floor(Math.random() * (hi - lo + 1));
    const props = PROPS.map((p) => p.id);
    const p = generatePrompt(difficulty, count, props, allSubjects().map((s) => s.name).slice(0, 250));
    const out = await aiJSON({ purpose: 'mysterybox.generate', system: p.system, messages: [{ role: 'user', content: p.user }], schema: BOX_SCHEMA, effort: 'medium', maxTokens: 12000 });
    const clean = (list) => (list || []).filter((x) => props.includes(x));
    const cats = ['toy', 'object', 'supply', 'kitchenware', 'sports', 'food', 'fruit', 'vegetable', 'clothing', 'device', 'instrument', 'tool', 'judaica'];
    const objects = (out.objects || []).slice(0, count).map((g) => {
      const id = `gen-box-${canonical(g.name).replace(/ /g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
      const subject = {
        id, name: g.name, aliases: g.aliases || [], cat: cats.includes(g.category) ? g.category : 'object', emoji: g.emoji,
        size: Math.max(0.5, Math.min(3, Number(g.size) || 2)), colors: g.colors?.length ? g.colors : '*', tags: [g.category],
        p: [...clean(g.yesFacts), ...clean(g.noFacts).map((x) => `${x}-`), ...clean(g.sometimesFacts).map((x) => `${x}~`)].join(' '),
        hints: (g.hints || []).slice(0, 3),
      };
      return {
        subjectId: id, subject, shake: g.shake, tilt: g.tilt, listen: g.listen,
        grams: Math.max(1, Math.min(20000, Math.round(Number(g.grams) || 100))),
        materials: (g.materials || []).filter((m) => MATERIALS.includes(m)).slice(0, 3),
        accepted: [g.name.toLowerCase(), ...(g.aliases || [])], why: g.why,
      };
    });
    return { objects, tags: [] };
  },
};

// Game 7: AI Twenty Questions (classic: class asks; reverse: AI vs Class).
import {
  registerSubjects, getSubject, interpret, describe, isSubjectGuess, ANSWER_TEXT, PROPS,
  newReverseState, reverseNext, reverseAnswer, matchSubjectName, allSubjects,
} from '../engine/kb.js';
import { registerMistake, solveRound, failRound, addBonus, BASE_POINTS } from '../engine/rounds.js';
import { checkAnswer, canonical } from '../engine/answers.js';
import { aiAvailable, aiJSON } from '../ai/provider.js';
import { scanPlayerText, scanText, isSafeEmoji } from '../safety/policy.js';
import { playerText } from '../ai/prompts.js';
import { ANSWER_SCHEMA, answerPrompt, REVERSE_SCHEMA, reversePrompt, SUBJECT_SCHEMA, subjectPrompt } from '../ai/prompts/twenty.js';
import { SUBJECTS } from '../content/subjects.js';
import { db, persist } from '../db.js';

registerSubjects(SUBJECTS);

const LIMIT = 20;
const T = (id, difficulty, subjectId, tags = []) => ({ id, difficulty, tags, data: { subjectId } });

const CURATED = [
  ...['dog', 'apple', 'car', 'pizza', 'banana', 'phone', 'basketball', 'sun', 'cat', 'airplane'].map((s) => T(`twenty-${s}`, 'easy', s)),
  ...['penguin', 'umbrella', 'toothbrush', 'guitar', 'dreidel', 'honey', 'candle', 'kite', 'giraffe'].map((s) => T(`twenty-${s}`, 'medium', s, ['dreidel', 'honey'].includes(s) ? ['jewish'] : [])),
  ...['shofar', 'cactus', 'magnet', 'sukkah', 'kotel', 'yoyo', 'ladder', 'lightning', 'volcano'].map((s) => T(`twenty-${s}`, 'hard', s, ['shofar', 'sukkah', 'kotel'].includes(s) ? ['jewish'] : [])),
  ...['shadow', 'echo', 'rainbow', 'wind', 'deadsea', 'alphabet'].map((s) => T(`twenty-${s}`, 'expert', s)),
  ...['gravity', 'zero', 'leapyear', 'silence', 'reflection', 'time'].map((s) => T(`twenty-${s}`, 'insane', s)),
];

const SAY = {
  yes: ['Yes!', 'Yes.', 'Yep!', 'That is a yes.'],
  no: ['No.', 'Nope.', 'No, it is not.', 'Negative.'],
  sometimes: ['Sometimes!', 'It depends...', 'Sometimes, yes.'],
  unknown: ["Hmm, I can't really say.", 'That one is unclear.'],
  na: ["That doesn't really apply.", 'Not applicable!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function subjectFor(challenge) {
  const d = challenge.data;
  if (d.subject && !getSubject(d.subject.id)) registerSubjects([d.subject]);
  return getSubject(d.subject?.id || d.subjectId);
}

function leaksName(text, subj) {
  const t = ` ${canonical(text)} `;
  return subj.names.some((n) => canonical(n) && t.includes(` ${canonical(n)} `));
}

async function answerQuestion(round, subj, question, difficulty) {
  const offline = interpret(subj, question);
  if (!aiAvailable()) return { ...offline, source: 'offline' };
  try {
    const p = answerPrompt(subj, describe(subj), round.state.history.filter((h) => h.counted), difficulty);
    round.aiCalls++;
    const out = await aiJSON({
      purpose: 'twenty.answer', system: p.system,
      messages: [{ role: 'user', content: `Player question: ${playerText(question)}` }],
      schema: ANSWER_SCHEMA, maxTokens: 2500, timeoutMs: 25_000,
    });
    let comment = out.comment || '';
    if (!scanText(comment).ok || leaksName(comment, subj)) comment = '';
    if (!out.isYesNoQuestion && !out.isGuess) return { kind: 'notyesno', source: 'ai' };
    if (out.isGuess) {
      // The model's verdict must agree with an independent check before a guess counts.
      let correct = offline.kind === 'guess' ? offline.correct : isSubjectGuess(subj, question);
      if (!correct && out.guessCorrect) {
        correct = (await checkAnswer(question.replace(/^(is it|could it be|maybe)\s+(an?|the)?\s*/i, ''), { answer: subj.name, accepted: subj.aliases || [], context: 'Twenty Questions secret subject' })).correct;
      }
      return { kind: 'guess', correct, guess: question, comment: correct ? comment : '', source: 'ai' };
    }
    const value = out.answer === 'not_applicable' ? 'na' : out.answer;
    return { kind: 'answer', value, comment, source: 'ai' };
  } catch {
    return { ...offline, source: 'offline' };
  }
}

export default {
  id: 'twenty',
  title: 'AI Twenty Questions',
  tagline: 'Twenty questions. One secret.',
  description: 'The AI is thinking of something. You get twenty yes-or-no questions to figure it out, or flip it and stump the AI.',
  emoji: '❓',
  accent: '#a78bfa',
  generationKind: 'ai',
  curated: CURATED,
  postGameActions: ['teach'],

  summarize: (d) => (d.subject?.name || getSubject(d.subjectId)?.name || d.subjectId || 'AI vs Class'),

  start(round, challenge, opts = {}) {
    if (opts.variant === 'reverse') {
      round.state = { reverse: true, history: [], asked: 0, kb: newReverseState(), pending: null, wrongGuesses: [] };
      return { variant: 'reverse', limit: LIMIT, aiMode: aiAvailable() ? 'ai' : 'offline' };
    }
    const subj = subjectFor(challenge);
    round.state = { history: [], asked: 0, limit: Number(opts.questionLimit) || LIMIT };
    return { variant: 'classic', limit: round.state.limit, aiMode: aiAvailable() ? 'ai' : 'offline', category: subj.chain.includes('concept') ? 'Something abstract' : null };
  },

  actions: {
    async ask(round, challenge, { text }) {
      if (round.state.reverse) return { ok: false, message: 'In AI vs Class mode, the AI asks the questions!' };
      const question = String(text || '').trim().slice(0, 200);
      if (!question) return { ok: false, message: 'Type a question first.' };
      if (!scanPlayerText(question).ok) return { ok: false, blocked: true, message: "Let's keep it classroom-friendly! Try another question." };
      if (round.aiCalls > 80) return { ok: false, message: 'That is a lot of questions! Make a guess.' };
      const subj = subjectFor(challenge);
      const res = await answerQuestion(round, subj, question, round.difficulty);
      const st = round.state;

      if (res.kind === 'notyesno') return { ok: true, counted: false, question, answer: null, message: 'I can only answer yes-or-no questions! Try rephrasing.' };
      if (res.kind === 'unclear') return { ok: true, counted: false, question, answer: null, message: "I'm not sure how to answer that one. Try asking about its size, what it's made of, or where you'd find it." };

      st.asked += 1;
      const left = st.limit - st.asked;
      if (res.kind === 'guess') {
        st.history.push({ q: question, a: res.correct ? 'CORRECT' : 'no', counted: true });
        if (res.correct) {
          addBonus(round, `Solved with ${left} question${left === 1 ? '' : 's'} to spare`, BASE_POINTS[round.difficulty] * 0.02 * left);
          return { ...solveRound(round, 240), question, answer: 'yes', answerText: 'YES! You got it!', questionsUsed: st.asked, questionsLeft: left, history: st.history };
        }
        const m = registerMistake(round);
        const out = { ...m, question, answer: 'no', answerText: `No, it's not ${res.guess.replace(/^(is it|could it be)\s+/i, '').replace(/\?$/, '')}.`, questionsUsed: st.asked, questionsLeft: left, history: st.history };
        if (!m.failed && left <= 0) Object.assign(out, failRound(round));
        return out;
      }
      const value = res.value;
      st.history.push({ q: question, a: value, counted: true });
      const out = { ok: true, counted: true, question, answer: value, answerText: pick(SAY[value] || SAY.unknown), comment: res.comment || '', questionsUsed: st.asked, questionsLeft: left, history: st.history, source: res.source };
      if (left <= 0) Object.assign(out, failRound(round), { message: 'That was question twenty!' });
      return out;
    },

    async guess(round, challenge, { text }) {
      const t = String(text || '').trim();
      return this.ask(round, challenge, { text: /^(is it|could it be)/i.test(t) ? t : `Is it ${t}?` });
    },

    // ----- Reverse mode -----
    async rnext(round) {
      const st = round.state;
      if (!st.reverse) return { ok: false };
      if (st.pending) return { ok: true, turn: st.pending, asked: st.asked, limit: LIMIT };
      const left = LIMIT - st.asked;
      if (left <= 0) return { ...solveRound(round, 300), classWins: true, message: 'Twenty questions and I still could not get it. You win!', reveal: { answer: null, explanation: 'The AI used all twenty questions and could not guess your secret!' } };
      let turn = null;
      if (aiAvailable()) {
        try {
          const p = reversePrompt(st.history, left);
          round.aiCalls++;
          const out = await aiJSON({ purpose: 'twenty.reverse', system: p.system, messages: [{ role: 'user', content: p.user }], schema: REVERSE_SCHEMA, maxTokens: 2500, timeoutMs: 25_000 });
          if (scanText(out.text).ok && out.text) turn = { type: out.type, text: out.text, guess: out.guess || '', source: 'ai' };
        } catch { /* fall back to the offline engine */ }
      }
      if (!turn) {
        const n = reverseNext(st.kb, left);
        if (n.type === 'giveup') return { ...solveRound(round, 300), classWins: true, message: "I give up! You've stumped me. What was it?", reveal: { answer: null, explanation: `The AI gave up after ${st.asked} questions!` } };
        if (n.type === 'guess') {
          const s = getSubject(n.subjectId);
          turn = { type: 'guess', text: `Is it ${/^[aeiou]/i.test(s.name) ? 'an' : 'a'} ${s.name.toLowerCase()}?`, guess: s.name, subjectId: s.id, emoji: s.emoji, source: 'offline' };
        } else {
          turn = { type: 'question', text: n.text, qid: n.qid, source: 'offline' };
        }
      }
      st.pending = turn;
      return { ok: true, turn, asked: st.asked, limit: LIMIT };
    },

    async ranswer(round, challenge, { answer }) {
      const st = round.state;
      if (!st.reverse || !st.pending) return { ok: false, message: 'No question to answer.' };
      const a = ['yes', 'no', 'sometimes', 'unknown'].includes(answer) ? answer : 'unknown';
      const turn = st.pending;
      st.pending = null;
      st.asked += 1;
      st.history.push({ q: turn.text, a });
      if (turn.type === 'guess') {
        if (a === 'yes') {
          round.finished = true;
          return { ok: true, aiWins: true, failed: true, message: `I knew it! It was ${turn.guess}!`, asked: st.asked, reveal: { answer: turn.guess, emoji: turn.emoji || '', explanation: `The AI guessed your secret in ${st.asked} question${st.asked === 1 ? '' : 's'}. Pick something sneakier next time!` } };
        }
        if (turn.subjectId) st.kb.rejected.push(turn.subjectId);
        st.wrongGuesses.push(turn.guess);
      } else if (turn.qid) {
        reverseAnswer(st.kb, turn.qid, a);
      }
      return this.rnext(round, challenge);
    },

    teach(round, challenge, { name }) {
      const n = String(name || '').trim().slice(0, 60);
      if (!n || !scanPlayerText(n).ok) return { ok: false, message: 'Hmm, try another name.' };
      db().learned.unshift({ name: n, at: new Date().toISOString(), history: round.state.history?.slice(0, 20) || [] });
      db().learned.length = Math.min(db().learned.length, 500);
      persist();
      const known = matchSubjectName(n);
      return { ok: true, message: known ? `Ahh, ${n}! I'll ask better questions next time.` : `${n}! That's a new one for me. I've passed it to the game admin.` };
    },
  },

  hint(round, challenge) {
    if (round.state.reverse) return null;
    const subj = subjectFor(challenge);
    const i = round.hintsUsed;
    if (i < subj.hints.length) return { text: subj.hints[i], index: i + 1, total: subj.hints.length };
    return null;
  },

  reveal(round, challenge) {
    if (round.state.reverse) return { answer: null, explanation: 'The AI did not guess your secret.' };
    const subj = subjectFor(challenge);
    return {
      answer: subj.name,
      emoji: subj.emoji,
      explanation: subj.hints[subj.hints.length - 1],
      facts: describe(subj).filter((l) => / Yes$/.test(l)).slice(0, 6),
      history: round.state.history,
    };
  },

  validate(d) {
    const problems = [];
    const subj = d.subject || getSubject(d.subjectId);
    if (!subj) problems.push(`Unknown subject "${d.subjectId}"`);
    if (d.subject) {
      if (!d.subject.id || !d.subject.name) problems.push('Subject needs id and name');
      if (!isSafeEmoji(d.subject.emoji)) problems.push('Emoji is not on the safe list');
      if ((d.subject.hints || []).length !== 3) problems.push('Exactly three hints are required');
      if ((d.subject.p || '').split(/\s+/).filter(Boolean).length < 20) problems.push('Needs at least 20 facts for consistent answers');
      if (!scanText(JSON.stringify(d.subject)).ok) problems.push('Contains blocked terms');
      if (matchSubjectName(d.subject.name) && !getSubject(d.subject.id)) problems.push('A subject with this name already exists');
    }
    return { ok: problems.length === 0, problems };
  },

  async generate({ difficulty }) {
    if (!aiAvailable()) throw new Error('AI generation needs an API key (see Admin > Settings).');
    const props = PROPS.map((p) => p.id);
    const avoid = allSubjects().map((s) => s.name);
    const p = subjectPrompt(difficulty, props, avoid);
    const out = await aiJSON({ purpose: 'twenty.generate', system: p.system, messages: [{ role: 'user', content: p.user }], schema: SUBJECT_SCHEMA, effort: 'medium', maxTokens: 6000 });
    const clean = (list) => (list || []).filter((x) => props.includes(x));
    const id = `gen-${canonical(out.name).replace(/ /g, '-')}-${Date.now().toString(36)}`;
    const subject = {
      id, name: out.name, aliases: out.aliases || [], cat: out.category, emoji: out.emoji, size: out.size || undefined,
      colors: out.colors?.length ? out.colors : '*', tags: [out.category],
      p: [...clean(out.yesFacts), ...clean(out.noFacts).map((x) => `${x}-`), ...clean(out.sometimesFacts).map((x) => `${x}~`)].join(' '),
      hints: (out.hints || []).slice(0, 3),
    };
    return { subjectId: id, subject };
  },
};

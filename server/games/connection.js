// Game 1: What's the Connection?
import { checkAnswer, matchAnswer } from '../engine/answers.js';
import { registerMistake, solveRound, addBonus, BASE_POINTS } from '../engine/rounds.js';
import { aiAvailable, aiJSON } from '../ai/provider.js';
import { scanPlayerText, isSafeEmoji, scanObject } from '../safety/policy.js';
import { db } from '../db.js';
import { CONNECTION_PUZZLES } from '../content/connection.js';
import { PUZZLE_SCHEMA, SOLVER_SCHEMA, generatePrompt, solverPrompt } from '../ai/prompts/connection.js';

const publicItem = (i) => ({ emoji: i.emoji, label: i.label, image: i.image || null });

export default {
  id: 'connection',
  title: "What's the Connection?",
  tagline: 'Five pictures. One hidden link.',
  description: 'Five pictures that look totally unrelated. Find the one thing that connects them all.',
  emoji: '🔗',
  accent: '#38bdf8',
  generationKind: 'ai',
  curated: CONNECTION_PUZZLES,

  summarize: (d) => `${d.answer} (${d.items.map((i) => i.label).join(', ')})`,

  start(round, challenge, opts = {}) {
    const d = challenge.data;
    round.state = { visible: opts.slowReveal ? 2 : d.items.length, extraShown: false, guesses: [], slowReveal: !!opts.slowReveal };
    return {
      items: d.items.slice(0, round.state.visible).map(publicItem),
      totalItems: d.items.length,
      hasExtra: !!d.extra,
      hintsTotal: d.hints.length + 1,
      slowReveal: !!opts.slowReveal,
      answerShape: d.answer.replace(/[A-Za-z0-9]/g, '_'),
    };
  },

  actions: {
    async guess(round, challenge, { text }) {
      const guess = String(text || '').trim().slice(0, 120);
      if (!guess) return { ok: false, message: 'Type a guess first!' };
      if (!scanPlayerText(guess).ok) return { ok: false, blocked: true, message: "Let's keep it classroom-friendly!" };
      const d = challenge.data;
      round.state.guesses.push(guess);
      const result = await checkAnswer(guess, {
        answer: d.answer,
        accepted: d.accepted,
        context: `Pictures: ${d.items.map((i) => i.label).join(', ')}. Explanation: ${d.explanation}`,
        cacheKey: challenge.id,
      });
      if (result.correct) {
        const hidden = d.items.length - round.state.visible;
        if (hidden > 0) addBonus(round, `Solved with ${hidden} picture${hidden > 1 ? 's' : ''} still hidden`, BASE_POINTS[round.difficulty] * 0.1 * hidden);
        return { ...solveRound(round, d.estSeconds), guess, judged: result.method === 'ai' ? result.reason : '' };
      }
      return { ...registerMistake(round), correct: false, close: result.close, guess, reason: result.reason || '' };
    },

    more(round, challenge) {
      const d = challenge.data;
      if (round.state.visible >= d.items.length) return { ok: false, message: 'All five pictures are already showing.' };
      const index = round.state.visible++;
      return { index, item: publicItem(d.items[index]), visible: round.state.visible };
    },

    extra(round, challenge) {
      const d = challenge.data;
      if (!d.extra) return { ok: false, message: 'There is no bonus picture for this one.' };
      if (!round.state.extraShown) {
        round.state.extraShown = true;
        addBonus(round, 'Used the sixth picture', -BASE_POINTS[round.difficulty] * 0.15);
      }
      return { item: publicItem(d.extra) };
    },
  },

  hint(round, challenge) {
    const d = challenge.data;
    const i = round.hintsUsed;
    if (i < d.hints.length) return { text: d.hints[i], index: i + 1, total: d.hints.length + 1 };
    if (i === d.hints.length) {
      const words = d.answer.split(/\s+/);
      return { text: `The answer has ${words.length} word${words.length > 1 ? 's' : ''} and starts with "${d.answer[0].toUpperCase()}".`, index: i + 1, total: d.hints.length + 1 };
    }
    return null;
  },

  reveal(round, challenge) {
    const d = challenge.data;
    return {
      answer: d.answer,
      explanation: d.explanation,
      links: d.items.map((i) => ({ ...publicItem(i), link: i.link })),
      extra: d.extra ? { ...publicItem(d.extra), link: d.extra.link } : null,
    };
  },

  validate(d, opts = {}) {
    const problems = [];
    const warnings = [];
    if (!d || typeof d !== 'object') return { ok: false, problems: ['Missing data'] };
    if (!d.answer || String(d.answer).length > 40) problems.push('Answer must be 1-40 characters');
    if (!Array.isArray(d.items) || d.items.length !== 5) problems.push('Exactly five items are required');
    for (const [n, i] of (d.items || []).entries()) {
      if (!i.label || i.label.length > 30) problems.push(`Item ${n + 1}: label must be 1-30 characters`);
      if (!i.image && !isSafeEmoji(i.emoji)) problems.push(`Item ${n + 1}: emoji "${i.emoji}" is not on the safe list`);
      if (!i.link) problems.push(`Item ${n + 1}: missing link explanation`);
      if (i.label && matchAnswer(i.label, [d.answer]).match) problems.push(`Item ${n + 1}: label gives away the answer`);
    }
    if (d.extra && !d.extra.image && !isSafeEmoji(d.extra.emoji)) problems.push('Extra item emoji is not on the safe list');
    if (!Array.isArray(d.hints) || d.hints.length < 2) problems.push('At least two hints are required');
    for (const h of d.hints || []) if (matchAnswer(h, [d.answer]).type === 'exact') problems.push('A hint states the answer');
    if (!d.explanation) problems.push('Explanation is required');
    if (!Array.isArray(d.accepted)) problems.push('accepted must be a list');
    const labels = new Set((d.items || []).map((i) => (i.label || '').toLowerCase()));
    if (labels.size !== (d.items || []).length) problems.push('Item labels must be different');
    const safety = scanObject(d);
    if (!safety.ok) problems.push(...safety.hits.map((h) => `Blocked term "${h.term}"`));
    if (opts.generated && d.solverCheck) {
      const tries = d.solverCheck.solvedOnTry;
      const guessed = (d.solverCheck.guesses || []).join(' / ');
      if (!tries && ['easy', 'medium', 'hard'].includes(opts.difficulty)) problems.push(`An independent solver could not find the answer (it guessed: ${guessed}), so it is probably ambiguous`);
      else if (!tries) warnings.push(`Independent solver did not get it (guessed: ${guessed}); check it is fair`);
      if (tries === 1 && ['expert', 'insane'].includes(opts.difficulty)) warnings.push('Solver got it on the first try; it may be easier than rated');
    }
    return { ok: problems.length === 0, problems, warnings };
  },

  async generate({ difficulty }) {
    if (!aiAvailable()) throw new Error('AI generation needs an API key (see Admin > Settings).');
    const avoid = Object.values(db().challenges).filter((c) => c.game === 'connection').map((c) => c.data.answer);
    const p = generatePrompt(difficulty, avoid);
    const d = await aiJSON({ purpose: 'connection.generate', system: p.system, messages: [{ role: 'user', content: p.user }], schema: PUZZLE_SCHEMA, effort: 'medium', maxTokens: 8000 });
    d.items = (d.items || []).slice(0, 5);
    d.hints = (d.hints || []).slice(0, 3);
    d.accepted = [...new Set([d.answer.toLowerCase(), ...(d.accepted || [])])];
    d.estSeconds = Math.max(30, Math.min(300, Number(d.estSeconds) || 90));
    d.tags = d.theme === 'jewish' ? ['jewish'] : [];

    // Independent solve attempt: a fresh model call that never sees the answer.
    const s = solverPrompt(d.items);
    const solver = await aiJSON({ purpose: 'connection.solve-check', system: s.system, messages: [{ role: 'user', content: s.user }], schema: SOLVER_SCHEMA, effort: 'medium', maxTokens: 4000 });
    const hits = [];
    for (const g of (solver.guesses || []).slice(0, 3)) {
      hits.push((await checkAnswer(g, { answer: d.answer, accepted: d.accepted, context: d.explanation })).correct);
    }
    d.solverCheck = { guesses: solver.guesses, solvedOnTry: hits.indexOf(true) + 1 || null };
    return d;
  },

};

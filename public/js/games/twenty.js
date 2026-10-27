// Game 7 client: AI Twenty Questions (classic and AI vs Class).
import { h, sleep } from '../ui.js';

let current = null;
const STAMP = { yes: 'YES', no: 'NO', sometimes: 'SOMETIMES', unknown: 'UNKNOWN', na: 'N/A', CORRECT: 'CORRECT' };
const SUGGESTIONS = ['Is it alive?', 'Can you eat it?', 'Is it bigger than a shoebox?', 'Does it use electricity?', 'Would you find it in a kitchen?', 'Is it made of metal?', 'Can you hold it in one hand?', 'Is it found outside?'];

function avatar() {
  return h('div', { class: 'tq-bot', 'aria-hidden': 'true' }, h('div', { class: 'tq-eyes' }, h('i'), h('i')), h('div', { class: 'tq-mouth' }));
}

function dots(limit, used) {
  return h('div', { class: 'tq-dots', 'aria-label': `${used} of ${limit} questions used` }, Array.from({ length: limit }, (_, i) => h('i', { class: i < used ? 'used' : '' })));
}

export default {
  id: 'twenty',
  music: 'thinking',
  howTo: [
    'Classic: the AI secretly picks something. Ask up to 20 yes-or-no questions to find it.',
    'Answers can be Yes, No, Sometimes, Unknown or Not applicable.',
    'Think you know? Just ask "Is it a ___?" - a wrong guess uses a question.',
    'AI vs Class: your class picks a secret object and the AI tries to guess it. The class wins if the AI fails!',
  ],
  options: [
    { key: 'variant', label: 'Who asks?', choices: [{ value: 'classic', label: 'Class asks (classic)' }, { value: 'reverse', label: 'AI vs Class' }] },
  ],

  mount(el, view, ctx) {
    current = { ctx, view };
    return view.variant === 'reverse' ? mountReverse(el, view, ctx) : mountClassic(el, view, ctx);
  },

  renderReveal(slot, reveal, outcome) {
    if (current?.view.variant === 'reverse' && outcome === 'win') slot.append(teachForm(current.ctx));
    if (reveal.facts?.length) {
      slot.append(h('div', { class: 'tq-facts' }, h('div', { class: 'muted' }, 'Some facts about it:'), h('div', { class: 'row', style: { justifyContent: 'center' } }, reveal.facts.map((f) => h('span', { class: 'chip' }, f.replace(/ Yes$/, ' ✔'))))));
    }
  },
};

function teachForm(ctx) {
  const input = h('input', { class: 'input', placeholder: 'So... what was it?', maxlength: 60 });
  const form = h('form', { class: 'input-row', onsubmit: async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    const r = await ctx.act('teach', { name: input.value });
    form.replaceWith(h('div', { class: 'feedback good' }, r.message || 'Thanks for teaching me!'));
  } }, input, h('button', { class: 'btn primary' }, 'Teach the AI'));
  return form;
}

function mountClassic(el, view, ctx) {
  let used = 0;
  let busy = false;
  const bot = avatar();
  const counter = h('div', { class: 'tq-count' }, h('b', {}, '0'), ` / ${view.limit}`);
  const dotsWrap = h('div', {}, dots(view.limit, 0));
  const speech = h('div', { class: 'tq-speech' }, view.category ? `I'm thinking of... ${view.category.toLowerCase()}. Ask away!` : "I'm thinking of something. Ask me a yes-or-no question!");
  const history = h('ol', { class: 'tq-history', reversed: true });
  const input = h('input', { class: 'input', placeholder: 'Ask a yes-or-no question...  (or "Is it a ___?")', maxlength: 200, autocomplete: 'off', 'aria-label': 'Your question' });
  const askBtn = h('button', { class: 'btn primary big', type: 'submit' }, 'Ask');
  const chips = h('div', { class: 'tq-suggest' }, SUGGESTIONS.map((q) => h('button', { class: 'chip', type: 'button', onclick: () => ask(q) }, q)));

  async function ask(q) {
    const text = (q ?? input.value).trim();
    if (!text || busy || ctx.finished) return;
    busy = true;
    askBtn.disabled = true;
    bot.classList.add('thinking');
    speech.textContent = '...';
    const res = await ctx.act('ask', { text });
    bot.classList.remove('thinking');
    busy = false;
    askBtn.disabled = false;
    if (res.ok === false || res.answer == null) {
      speech.textContent = res.message || res.error || 'Try another question.';
      return;
    }
    input.value = '';
    used = res.questionsUsed;
    counter.firstChild.textContent = String(used);
    dotsWrap.replaceChildren(dots(view.limit, used));
    ctx.setStat('q', 'Questions', `${used}/${view.limit}`);
    const a = res.solved ? 'CORRECT' : res.answer;
    speech.replaceChildren(h('span', { class: `tq-stamp tq-${a}` }, STAMP[a] || a), ' ', res.comment || (res.solved ? '' : ''));
    bot.dataset.mood = a;
    ctx.sfx(a === 'yes' || a === 'CORRECT' ? 'correct' : a === 'no' ? 'click' : 'pop');
    history.prepend(h('li', { class: 'tq-item' }, h('span', { class: 'tq-q' }, text), h('span', { class: `tq-stamp tq-${a}` }, STAMP[a] || a)));
    if (!res.solved && res.questionsLeft <= 3 && res.questionsLeft > 0) ctx.say(`Only ${res.questionsLeft} question${res.questionsLeft === 1 ? '' : 's'} left!`);
    input.focus();
  }

  const form = h('form', { class: 'input-row', onsubmit: (e) => { e.preventDefault(); ask(); } }, input, askBtn);
  el.append(
    h('div', { class: 'tq-top' },
      h('div', { class: 'tq-host' }, bot, h('div', {}, h('div', { class: 'tq-name' }, view.aiMode === 'ai' ? 'AI Host' : 'Quizbot (offline engine)'), speech)),
      h('div', { class: 'tq-meter panel' }, h('div', { class: 'muted' }, 'Questions used'), counter, dotsWrap)),
    h('div', { class: 'panel tq-ask' }, form, chips),
    history,
  );
  ctx.setStat('q', 'Questions', `0/${view.limit}`);
  setTimeout(() => input.focus(), 300);
  return {
    onKey(e) {
      if (e.key === 'Enter' || e.key === '/') {
        input.focus();
        return true;
      }
      return false;
    },
    async onFinish(outcome) {
      input.disabled = true;
      askBtn.disabled = true;
      bot.dataset.mood = outcome === 'win' ? 'CORRECT' : 'no';
      await sleep(600);
    },
  };
}

function mountReverse(el, view, ctx) {
  let busy = false;
  let turn = null;
  const bot = avatar();
  const qText = h('div', { class: 'tq-big-q' }, 'Think of something... anything! (Keep it secret.)');
  const counter = h('div', { class: 'tq-count' }, h('b', {}, '0'), ` / ${view.limit}`);
  const dotsWrap = h('div', {}, dots(view.limit, 0));
  const answers = h('div', { class: 'tq-answers' });
  const log = h('ol', { class: 'tq-history', reversed: true });

  const btn = (label, value, cls, key) => h('button', { class: `btn big ${cls}`, onclick: () => answer(value) }, label, ' ', h('span', { class: 'kbd' }, key));

  function render() {
    if (!turn) return;
    bot.classList.remove('thinking');
    if (turn.type === 'guess') {
      qText.replaceChildren(h('span', {}, turn.emoji ? h('span', { class: 'emoji', style: { marginRight: '12px' } }, turn.emoji) : null, turn.text));
      answers.replaceChildren(btn('YES! You got it', 'yes', 'good', 'Y'), btn('NO, wrong!', 'no', 'danger', 'N'));
      ctx.say('Is this it?');
    } else {
      qText.textContent = turn.text;
      answers.replaceChildren(btn('YES', 'yes', 'good', 'Y'), btn('NO', 'no', 'danger', 'N'), btn('SOMETIMES', 'sometimes', '', 'S'), btn("DON'T KNOW", 'unknown', 'ghost', 'D'));
    }
  }

  function apply(res) {
    if (res.turn) turn = res.turn;
    const asked = res.asked ?? 0;
    counter.firstChild.textContent = String(asked);
    dotsWrap.replaceChildren(dots(view.limit, asked));
    ctx.setStat('q', 'AI questions', `${asked}/${view.limit}`);
    if (res.classWins || res.aiWins) {
      qText.textContent = res.message;
      answers.replaceChildren();
    } else render();
  }

  async function begin() {
    bot.classList.add('thinking');
    answers.replaceChildren(h('button', { class: 'btn primary huge', onclick: async () => { answers.replaceChildren(); apply(await ctx.act('rnext')); } }, "We've picked! Start ▶"));
    bot.classList.remove('thinking');
  }

  async function answer(value) {
    if (busy || !turn || ctx.finished) return;
    busy = true;
    log.prepend(h('li', { class: 'tq-item' }, h('span', { class: 'tq-q' }, turn.text), h('span', { class: `tq-stamp tq-${value}` }, STAMP[value] || value)));
    ctx.sfx('click');
    bot.classList.add('thinking');
    qText.textContent = 'Hmm... let me think...';
    answers.replaceChildren();
    const res = await ctx.act('ranswer', { answer: value });
    busy = false;
    if (res.ok === false) {
      qText.textContent = res.message || res.error || 'Something went wrong.';
      return;
    }
    apply(res);
  }

  el.append(
    h('div', { class: 'tq-top' },
      h('div', { class: 'tq-host' }, bot, h('div', {}, h('div', { class: 'tq-name' }, view.aiMode === 'ai' ? 'AI Challenger' : 'Quizbot (offline engine)'), h('div', { class: 'tq-speech' }, 'I get twenty questions. Can your class stump me?'))),
      h('div', { class: 'tq-meter panel' }, h('div', { class: 'muted' }, 'My questions'), counter, dotsWrap)),
    h('div', { class: 'panel tq-reverse' }, qText, answers),
    log,
  );
  begin();
  return {
    onKey(e) {
      const map = { y: 'yes', n: 'no', s: 'sometimes', d: 'unknown' };
      const v = map[e.key.toLowerCase()];
      if (v && turn && (turn.type !== 'guess' || v === 'yes' || v === 'no')) {
        answer(v);
        return true;
      }
      return false;
    },
  };
}

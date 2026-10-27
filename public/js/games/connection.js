// Game 1 client: What's the Connection?
import { h, sleep } from '../ui.js';

function tile(item, i) {
  return h('div', { class: 'cx-tile', style: { animationDelay: `${i * 110}ms` } },
    item.image ? h('img', { src: item.image, alt: item.label, class: 'cx-img', onerror: (e) => e.target.replaceWith(h('div', { class: 'cx-emoji emoji' }, '🖼️')) }) : h('div', { class: 'cx-emoji emoji' }, item.emoji),
    h('div', { class: 'cx-label' }, item.label));
}

function hiddenTile(onReveal) {
  return h('button', { class: 'cx-tile cx-hidden', onclick: onReveal, title: 'Reveal the next picture' },
    h('div', { class: 'cx-emoji' }, '❔'), h('div', { class: 'cx-label' }, 'Reveal'));
}

export default {
  id: 'connection',
  music: 'thinking',
  howTo: [
    'Five pictures appear. They look unrelated... but they all share ONE thing.',
    'Shout out ideas, then type your best guess. Wording doesn\'t have to be perfect.',
    'Stuck? Take a hint or reveal a bonus sixth picture (costs a few points).',
    'Solve it without hints for bonus points.',
  ],
  options: [
    { key: 'slowReveal', label: 'Pictures', choices: [{ value: false, label: 'All at once' }, { value: true, label: 'One at a time (bonus points)' }] },
  ],

  mount(el, view, ctx) {
    const items = [...view.items];
    const grid = h('div', { class: 'cx-grid' });
    const extraSlot = h('div', { class: 'cx-extra' });
    const guesses = h('div', { class: 'cx-guesses' });
    const feedback = h('div', { class: 'feedback' });
    const input = h('input', { class: 'input', placeholder: 'What connects them all?', maxlength: 120, autocomplete: 'off', 'aria-label': 'Your guess' });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, 'Submit');
    let busy = false;

    const renderGrid = () => {
      const tiles = items.map((it, i) => tile(it, i));
      for (let i = items.length; i < view.totalItems; i++) tiles.push(i === items.length ? hiddenTile(revealMore) : h('div', { class: 'cx-tile cx-hidden cx-locked' }, h('div', { class: 'cx-emoji' }, '🔒')));
      grid.replaceChildren(...tiles);
    };

    async function revealMore() {
      const res = await ctx.act('more');
      if (res.item) {
        items.push(res.item);
        ctx.sfx('pop');
        renderGrid();
      }
    }

    async function showExtra() {
      const res = await ctx.act('extra');
      if (res.item) {
        ctx.sfx('reveal');
        extraBtn.remove();
        extraSlot.append(h('div', { class: 'cx-extra-tile' }, h('div', { class: 'cx-extra-tag' }, 'Bonus picture'), tile(res.item, 0)));
      }
    }
    const extraBtn = view.hasExtra ? h('button', { class: 'btn', onclick: showExtra, title: 'Shows one more picture that fits the connection (costs 15% of the points)' }, '🎁 Show a 6th picture') : null;

    const form = h('form', { class: 'input-row', onsubmit: async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || busy || ctx.finished) return;
      busy = true;
      submit.disabled = true;
      feedback.className = 'feedback';
      feedback.textContent = 'Checking...';
      const res = await ctx.act('guess', { text });
      busy = false;
      submit.disabled = false;
      if (res.solved) {
        feedback.className = 'feedback good';
        feedback.textContent = `"${text}" is correct!`;
        grid.classList.add('cx-win');
        return;
      }
      if (res.ok === false) {
        feedback.textContent = res.message || res.error || '';
        return;
      }
      guesses.prepend(h('span', { class: `chip ${res.close ? 'cx-close' : ''}` }, res.close ? '🔥 ' : '✖ ', text));
      feedback.className = `feedback ${res.close ? 'close' : 'bad'}`;
      feedback.textContent = res.reason || (res.close ? 'Close! You\'re on the right track.' : 'Not it. Keep thinking!');
      input.select();
    } }, input, submit);

    const shape = ['easy', 'medium'].includes(ctx.difficulty) && view.answerShape
      ? h('div', { class: 'cx-shape', title: 'Letters in the answer' }, view.answerShape.split('').map((c) => (c === '_' ? h('i') : h('span', {}, c === ' ' ? ' ' : c))))
      : null;

    renderGrid();
    el.append(
      grid,
      h('div', { class: 'cx-tools row' }, shape, h('div', { class: 'grow' }), extraBtn),
      extraSlot,
      h('div', { class: 'cx-answer panel' }, form, feedback, guesses),
    );
    setTimeout(() => input.focus(), 400);

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
        submit.disabled = true;
        if (outcome === 'win') await sleep(900);
      },
      destroy() {},
    };
  },

  /** Animated explanation: every picture lights up with its link to the answer. */
  renderReveal(slot, reveal) {
    if (!reveal.links) return;
    const wrap = h('div', { class: 'cx-explain' },
      h('div', { class: 'cx-hub' }, reveal.answer),
      h('div', { class: 'cx-links' }, [...reveal.links, ...(reveal.extra ? [reveal.extra] : [])].map((l, i) =>
        h('div', { class: 'cx-link', style: { animationDelay: `${300 + i * 350}ms` } },
          h('span', { class: 'emoji' }, l.emoji), h('b', {}, l.label), h('span', { class: 'muted' }, l.link)))));
    slot.append(wrap);
  },
};

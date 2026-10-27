// Game 5 client: Find the Fake.
import { h, modal, sleep } from '../ui.js';

const NS = 'http://www.w3.org/2000/svg';

/** Server-generated SVG (drawn and validated on our own server, never user content). */
function picture(markup) {
  const wrap = h('div', { class: 'ff-svg' });
  wrap.innerHTML = markup;
  return wrap;
}

/** Red circle drawn around the impossible detail, in the picture's own coordinates. */
function ring(region, animate = true) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 400 300');
  svg.setAttribute('class', 'ff-ring');
  svg.setAttribute('aria-hidden', 'true');
  const r = region.r + 6;
  const len = 2 * Math.PI * r;
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', region.cx);
  c.setAttribute('cy', region.cy);
  c.setAttribute('r', r);
  c.style.strokeDasharray = `${len}`;
  c.style.strokeDashoffset = animate ? `${len}` : '0';
  if (!animate) c.style.animation = 'none';
  svg.append(c);
  return svg;
}

export default {
  id: 'fake',
  music: 'thinking',
  howTo: [
    'Six pictures appear. Five are perfectly normal. One hides something impossible.',
    'Study them together, then click the fake (or press 1-6) and lock it in.',
    'Say WHY it\'s fake for bonus points - "the clock has a 13" counts!',
    'Wrong picks are stamped REAL. Hints rule out pictures or tell you where to look.',
  ],

  mount(el, view, ctx) {
    const st = { selected: null, real: new Set(), busy: false };
    const cards = view.images.map((svg, i) =>
      h('div', {
        class: 'ff-card', role: 'button', tabindex: '0', 'aria-label': `Picture ${i + 1}`,
        onclick: () => select(i),
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            select(i);
          }
        },
      },
      picture(svg),
      h('span', { class: 'ff-num' }, String(i + 1)),
      h('button', { class: 'ff-zoom', type: 'button', title: 'Zoom in (Z)', 'aria-label': `Zoom in on picture ${i + 1}`, onclick: (e) => { e.stopPropagation(); zoom(i); } }, '🔍'),
      h('span', { class: 'ff-stamp' }, 'REAL ✓')));

    const why = h('input', { class: 'input', placeholder: 'Why is it fake? (optional, bonus points)', maxlength: 200, autocomplete: 'off', 'aria-label': 'Why is it fake?' });
    const selLabel = h('b', {}, '');
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, '🔒 Lock it in');
    const bar = h('form', { class: 'ff-bar panel hidden', onsubmit: (e) => { e.preventDefault(); lockIn(); } },
      h('div', { class: 'ff-bar-label' }, '🔎 ', selLabel), why, submit,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => select(null) }, 'Cancel'));
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    el.append(
      h('div', { class: 'ff-prompt' }, 'Which picture is ', h('b', {}, 'impossible'), '? Click it or press ', h('span', { class: 'kbd' }, '1'), '–', h('span', { class: 'kbd' }, '6'), '.'),
      h('div', { class: 'ff-grid' }, cards),
      bar,
      feedback,
    );

    function select(i) {
      if (ctx.finished || st.busy) return;
      if (i != null && st.real.has(i)) {
        feedback.className = 'feedback';
        feedback.textContent = `Picture ${i + 1} is already known to be real.`;
        return;
      }
      st.selected = i;
      cards.forEach((c, k) => c.classList.toggle('selected', k === i));
      bar.classList.toggle('hidden', i == null);
      if (i == null) return;
      ctx.sfx('click');
      selLabel.textContent = `Picture ${i + 1}`;
      feedback.textContent = '';
      setTimeout(() => why.focus(), 30);
    }

    function markReal(i, note) {
      st.real.add(i);
      const c = cards[i];
      c.classList.remove('selected');
      c.classList.add('ff-real');
      if (note) c.title = note;
    }

    async function lockIn() {
      if (st.selected == null || st.busy || ctx.finished) return;
      st.busy = true;
      submit.disabled = true;
      const index = st.selected;
      const res = await ctx.act('pick', { index, reason: why.value.trim() });
      st.busy = false;
      submit.disabled = false;
      if (res.solved) {
        feedback.className = 'feedback good';
        feedback.textContent = res.reasonCorrect ? 'Fake found AND explained! Bonus points!' : res.reasonCorrect === false ? 'You found the fake! (No bonus for that reason.)' : 'You found the fake!';
        return;
      }
      if (res.real) {
        markReal(index, res.note);
        select(null);
        why.value = '';
        feedback.className = 'feedback bad';
        feedback.textContent = `Picture ${index + 1} is real. ${res.note || ''}`;
        if (res.failed) bar.classList.add('hidden');
        return;
      }
      if (res.ok === false) {
        feedback.className = 'feedback';
        feedback.textContent = res.message || res.error || '';
      }
    }

    function zoom(start) {
      let idx = start;
      const big = h('div', { class: 'ff-zoom-view' });
      const label = h('b', { class: 'ff-zoom-label' });
      const render = () => {
        big.replaceChildren(picture(view.images[idx]));
        label.textContent = `Picture ${idx + 1}${st.real.has(idx) ? ' (real)' : ''}`;
      };
      const nav = (d) => {
        idx = (idx + d + view.images.length) % view.images.length;
        render();
      };
      const onArrow = (e) => {
        if (e.key === 'ArrowLeft') nav(-1);
        else if (e.key === 'ArrowRight') nav(1);
      };
      document.addEventListener('keydown', onArrow);
      const m = modal({
        title: '🔍 Take a closer look',
        wide: true,
        body: h('div', { class: 'ff-zoom-wrap' },
          h('div', { class: 'ff-zoom-nav' },
            h('button', { class: 'btn', type: 'button', onclick: () => nav(-1), 'aria-label': 'Previous picture' }, '◀'),
            label,
            h('button', { class: 'btn', type: 'button', onclick: () => nav(1), 'aria-label': 'Next picture' }, '▶')),
          big,
          h('div', { class: 'ff-zoom-actions' },
            h('span', { class: 'muted' }, 'Use ◀ ▶ (arrow keys) to compare pictures.'),
            h('button', { class: 'btn primary', type: 'button', onclick: () => { m.close(); select(idx); } }, 'This one is fake!'))),
        onClose: () => document.removeEventListener('keydown', onArrow),
      });
      render();
    }

    return {
      onKey(e) {
        if (ctx.finished) return false;
        if (/^[1-6]$/.test(e.key) && Number(e.key) <= cards.length) {
          select(Number(e.key) - 1);
          return true;
        }
        if (e.key === 'z' || e.key === 'Z') {
          zoom(st.selected ?? 0);
          return true;
        }
        if (e.key === 'Enter' && st.selected != null) {
          lockIn();
          return true;
        }
        return false;
      },
      onHint(hint) {
        for (const k of hint.eliminate || []) markReal(k, 'Ruled out by a hint');
        if (st.selected != null && st.real.has(st.selected)) select(null);
      },
      async onFinish(outcome, res) {
        bar.classList.add('hidden');
        const rv = res.reveal;
        if (!rv || rv.fakeIndex == null) return;
        cards.forEach((c, k) => {
          c.classList.remove('selected');
          if (k !== rv.fakeIndex) c.classList.add('ff-dim');
        });
        const card = cards[rv.fakeIndex];
        card.classList.add('ff-fake');
        card.querySelector('.ff-stamp').textContent = outcome === 'win' ? 'FAKE! ✔' : 'FAKE!';
        if (rv.region) card.querySelector('.ff-svg').append(ring(rv.region, !ctx.reducedMotion));
        if (outcome === 'win' && res.reasonCorrect) ctx.say('And you explained exactly why. Brilliant detective work!');
        ctx.sfx('scan');
        await sleep(ctx.reducedMotion ? 500 : 2000);
      },
    };
  },

  renderReveal(slot, reveal) {
    if (!reveal.image) return;
    const pic = picture(reveal.image);
    if (reveal.region) pic.append(ring(reveal.region, true));
    slot.append(h('div', { class: 'ff-reveal' }, pic));
  },
};

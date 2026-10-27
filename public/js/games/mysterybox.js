// Game 3 client: The Mystery Box. A CSS 3D crate the class can shake, tilt, listen to,
// weigh and scan. Every clue comes from the server; the contents are only shown on reveal.
import { h, sleep } from '../ui.js';

const STAMP = { yes: 'YES', no: 'NO', some: 'SOME!', sometimes: 'SOMETIMES', unknown: 'UNKNOWN', na: 'N/A' };
const SUGGEST_ONE = ['Is it made of metal?', 'Can you eat it?', 'Is it a toy?', 'Would you find it in a kitchen?', 'Is it used at school?', 'Is it round?'];
const SUGGEST_MANY = ['Are they made of metal?', 'Can you eat any of them?', 'Is one of them a toy?', 'Are they used in a kitchen?', 'Is one of them round?', 'Are they used at school?'];
const LOG_ICON = { shake: '🫨', tilt: '↔️', listen: '👂', weigh: '⚖️', scan: '📡', ask: '❓', found: '✅' };

export default {
  id: 'mysterybox',
  music: 'box',
  howTo: [
    'Something is hidden inside the box. Figure out what it is!',
    'Shake it (S), tilt it (◀ ▶), listen closely (L), weigh it (W) and scan it for materials (X). Drag the box to turn it.',
    'Ask the box yes-or-no questions, then type what you think is inside.',
    'Expert and Insane boxes hold two or three things: you must name every one.',
  ],

  mount(el, view, ctx) {
    const reduced = ctx.reducedMotion;
    const many = view.count > 1;
    let scansLeft = view.scans;
    let busy = false;
    let destroyed = false;

    // ---------------- 3D crate ----------------
    const faces = ['front', 'back', 'left', 'right', 'bottom'].map((f) => h('div', { class: `mb-face mb-f-${f}` }, f === 'front' ? h('div', { class: 'mb-seal' }, '?') : h('div', { class: 'mb-stencil' }, f === 'back' ? 'FRAGILE' : f === 'left' ? '⬆ THIS SIDE UP' : 'MYSTERY')));
    const lid = h('div', { class: 'mb-lid' }, h('div', { class: 'mb-face mb-f-top' }, h('div', { class: 'mb-seal small' }, '?')));
    const inside = h('div', { class: 'mb-inside' });
    const cube = h('div', { class: 'mb-cube' }, faces, h('div', { class: 'mb-hinge' }, lid), inside);
    const sway = h('div', { class: 'mb-sway' }, cube);
    const beam = h('div', { class: 'mb-beam' });
    const burst = h('div', { class: 'mb-burst' });
    const scene = h('div', { class: `mb-scene mb-${view.boxSize}`, title: 'Drag to turn the box. Click to tap it.' }, burst, sway, beam, h('div', { class: 'mb-shadow' }));

    let rx = -16;
    let ry = -28;
    let dragging = false;
    let lastDrag = 0;
    let raf = 0;
    const applyRot = () => { cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; };
    const loop = () => {
      if (destroyed) return;
      if (!dragging && !reduced && Date.now() - lastDrag > 1800 && !scene.classList.contains('open')) ry += 0.12;
      applyRot();
      raf = requestAnimationFrame(loop);
    };
    loop();

    let start = null;
    scene.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, rx, ry, moved: false };
      dragging = true;
      scene.setPointerCapture(e.pointerId);
    });
    scene.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true;
      ry = start.ry + dx * 0.5;
      rx = Math.max(-60, Math.min(25, start.rx - dy * 0.4));
      lastDrag = Date.now();
    });
    const endDrag = () => {
      if (start && !start.moved) poke();
      start = null;
      dragging = false;
      lastDrag = Date.now();
    };
    scene.addEventListener('pointerup', endDrag);
    scene.addEventListener('pointercancel', endDrag);

    function animate(target, frames, opts) {
      if (reduced) return Promise.resolve();
      return target.animate(frames, opts).finished.catch(() => {});
    }

    function poke() {
      ctx.sfx('click');
      animate(sway, [{ transform: 'translateY(0)' }, { transform: 'translateY(-14px) scale(1.03)' }, { transform: 'translateY(0)' }], { duration: 320, easing: 'ease-out' });
    }

    // ---------------- readout panel ----------------
    const readout = h('div', { class: 'mb-readout panel' }, h('div', { class: 'muted' }, view.boxLabel + (many ? ` with ${view.count} things inside` : '') + '. Try a tool!'));
    const showReadout = (...nodes) => readout.replaceChildren(...nodes);

    function gauge(needle, category) {
      const angle = -90 + ((Math.min(5.95, needle) - 1) / 5) * 180;
      const n = h('div', { class: 'mb-needle', style: { transform: 'rotate(-90deg)' } });
      const g = h('div', { class: 'mb-gauge' }, n, h('div', { class: 'mb-hub' }));
      requestAnimationFrame(() => requestAnimationFrame(() => { n.style.transform = `rotate(${angle}deg)`; }));
      const labels = h('div', { class: 'mb-dial-labels' }, ['Feather', 'Light', 'Medium', 'Heavy', 'Very heavy'].map((l) => h('span', { class: l.startsWith(category.split('-')[0]) ? 'on' : '' }, l)));
      return h('div', { class: 'mb-weigh' }, g, labels, h('div', { class: 'mb-readout-big' }, category));
    }

    function motionTrack(motion, direction) {
      const dot = h('div', { class: `mb-dot mb-m-${motion}` });
      const track = h('div', { class: `mb-track dir-${direction}` }, dot);
      if (motion === 'sloshes') track.append(h('div', { class: 'mb-liquid' }));
      return track;
    }

    // ---------------- clue log ----------------
    const log = h('ul', { class: 'mb-log' });
    const seen = new Map();
    function addClue(kind, text) {
      if (!text) return;
      const key = `${kind}:${text}`;
      if (seen.has(key)) {
        const li = seen.get(key);
        li.classList.remove('mb-pulse');
        void li.offsetWidth;
        li.classList.add('mb-pulse');
        log.prepend(li);
        return;
      }
      const li = h('li', {}, h('span', { class: 'emoji' }, LOG_ICON[kind] || '•'), h('span', {}, text));
      seen.set(key, li);
      log.prepend(li);
    }

    // ---------------- tools ----------------
    async function tool(name, run) {
      if (busy || ctx.finished) return;
      busy = true;
      toolButtons.forEach((b) => (b.disabled = true));
      try {
        await run();
      } finally {
        busy = false;
        toolButtons.forEach((b) => (b.disabled = false));
        if (scansLeft <= 0) scanBtn.disabled = true;
      }
    }

    const shake = () => tool('shake', async () => {
      const res = await ctx.act('shake');
      if (!res.spec) return;
      const handle = await ctx.audio.playSpec(res.spec);
      const amp = 14 * (res.intensity || 0.6);
      const frames = [{ transform: 'translateX(0) rotate(0deg)', offset: 0 }];
      res.times.forEach((t, i) => {
        const side = i % 2 ? -1 : 1;
        frames.push({ transform: `translateX(${side * amp}px) rotate(${side * amp * 0.45}deg)`, offset: Math.min(0.95, t / 1.45) });
      });
      frames.push({ transform: 'translateX(0) rotate(0deg)', offset: 1 });
      showReadout(h('div', { class: 'mb-readout-big' }, '🫨 SHAKE'), h('p', {}, res.text));
      addClue('shake', res.text);
      await animate(sway, frames, { duration: 1450, easing: 'linear' });
      if (!handle) await sleep(200);
    });

    const tilt = (direction) => tool('tilt', async () => {
      const res = await ctx.act('tilt', { direction });
      if (!res.spec) return;
      ctx.audio.playSpec(res.spec);
      const deg = direction === 'left' ? -16 : 16;
      showReadout(h('div', { class: 'mb-readout-big' }, direction === 'left' ? '◀ TILT LEFT' : 'TILT RIGHT ▶'), motionTrack(res.motion, direction), h('p', {}, res.text));
      addClue('tilt', res.text);
      await animate(sway, [
        { transform: 'rotate(0deg)' }, { transform: `rotate(${deg}deg)`, offset: 0.2 }, { transform: `rotate(${deg}deg)`, offset: 0.8 }, { transform: 'rotate(0deg)' },
      ], { duration: 1800, easing: 'ease-in-out' });
    });

    const listen = () => tool('listen', async () => {
      const res = await ctx.act('listen');
      if (!res.spec) return;
      ctx.audio.playSpec(res.spec, { duck: true });
      const waves = h('div', { class: `mb-ear ${res.sound === 'silence' ? 'quiet' : ''}` }, h('span', { class: 'emoji' }, '👂'), h('i'), h('i'), h('i'));
      showReadout(h('div', { class: 'mb-readout-big' }, 'LISTENING...'), waves, h('p', {}, res.text));
      scene.classList.add('listening');
      await sleep(reduced ? 600 : 2900);
      scene.classList.remove('listening');
      addClue('listen', res.text);
    });

    const weigh = () => tool('weigh', async () => {
      const res = await ctx.act('weigh');
      if (!res.category) return;
      ctx.sfx('scan');
      showReadout(gauge(res.needle, res.category), h('p', {}, res.text));
      addClue('weigh', res.text);
      await animate(sway, [{ transform: 'translateY(0)' }, { transform: 'translateY(10px)' }, { transform: 'translateY(0)' }], { duration: 900, easing: 'ease-out' });
    });

    const scan = () => tool('scan', async () => {
      const res = await ctx.act('scan');
      if (res.scansLeft != null) scansLeft = res.scansLeft;
      scanBtn.querySelector('.mb-count').textContent = `(${scansLeft})`;
      if (res.ok === false) {
        showReadout(h('div', { class: 'mb-readout-big bad' }, '🔋 EMPTY'), h('p', {}, res.message));
        return;
      }
      ctx.sfx('scan');
      scene.classList.add('scanning');
      showReadout(h('div', { class: 'mb-readout-big mono' }, 'SCANNING...'));
      await sleep(reduced ? 300 : 1300);
      scene.classList.remove('scanning');
      showReadout(h('div', { class: 'mb-readout-big mono' }, res.material ? res.material.toUpperCase() : 'NOTHING NEW'), h('p', { class: 'mono' }, res.text));
      addClue('scan', res.text);
    });

    const btn = (icon, label, key, fn, extra = null) => h('button', { class: 'btn mb-tool', onclick: fn, title: `${label} (${key})` }, h('span', { class: 'emoji' }, icon), ` ${label} `, extra, h('span', { class: 'kbd' }, key));
    const scanBtn = btn('📡', 'Scan', 'X', scan, h('span', { class: 'mb-count' }, `(${scansLeft})`));
    const toolButtons = [
      btn('🫨', 'Shake', 'S', shake),
      btn('◀', 'Tilt', '←', () => tilt('left')),
      btn('▶', 'Tilt', '→', () => tilt('right')),
      btn('👂', 'Listen', 'L', listen),
      btn('⚖️', 'Weigh', 'W', weigh),
      scanBtn,
    ];

    // ---------------- questions ----------------
    const answers = h('ol', { class: 'mb-answers', reversed: true });
    const askInput = h('input', { class: 'input', placeholder: many ? 'Ask a yes/no question about what\'s inside...' : 'Ask the box a yes/no question...', maxlength: 200, autocomplete: 'off', 'aria-label': 'Question for the box' });
    const askBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Ask');
    const askNote = h('div', { class: 'feedback' });
    let asking = false;
    async function ask(q) {
      const text = (q ?? askInput.value).trim();
      if (!text || asking || ctx.finished) return;
      asking = true;
      askBtn.disabled = true;
      askNote.className = 'feedback';
      askNote.textContent = '...';
      const res = await ctx.act('ask', { text });
      asking = false;
      askBtn.disabled = false;
      askNote.textContent = '';
      if (res.found || res.correct === false) return handleGuess(res, text);
      if (res.ok === false || res.answer == null) {
        askNote.textContent = res.message || res.error || 'Try another question.';
        return;
      }
      askInput.value = '';
      ctx.sfx(res.answer === 'yes' || res.answer === 'some' ? 'correct' : 'click');
      answers.prepend(h('li', { class: 'mb-answer' }, h('span', {}, text), h('span', { class: `mb-stamp mb-${res.answer}` }, STAMP[res.answer] || res.answer)));
      askNote.textContent = [res.answerText, res.comment].filter(Boolean).join(' ');
      addClue('ask', `${text} ${STAMP[res.answer]}`);
      askInput.focus();
    }
    const askForm = h('form', { class: 'input-row', onsubmit: (e) => { e.preventDefault(); ask(); } }, askInput, askBtn);
    const chips = h('div', { class: 'mb-suggest' }, (many ? SUGGEST_MANY : SUGGEST_ONE).map((q) => h('button', { class: 'chip', type: 'button', onclick: () => ask(q) }, q)));

    // ---------------- guesses ----------------
    const slots = Array.from({ length: view.count }, (_, i) => h('div', { class: 'mb-slot' }, h('span', { class: 'emoji' }, '❔'), h('span', {}, many ? `Item ${i + 1}` : 'Mystery item')));
    const guessInput = h('input', { class: 'input', placeholder: many ? 'Name one (or all) of the things inside...' : "What's inside the box?", maxlength: 120, autocomplete: 'off', 'aria-label': 'Your guess' });
    const guessBtn = h('button', { class: 'btn primary big', type: 'submit' }, 'Guess!');
    const guessNote = h('div', { class: 'feedback' });
    let guessing = false;

    function fillSlots(foundAll = []) {
      for (const f of foundAll) {
        const s = slots[f.index];
        if (s && !s.classList.contains('found')) {
          s.classList.add('found');
          s.replaceChildren(h('span', { class: 'emoji' }, f.emoji), h('span', {}, f.name));
          addClue('found', `Found: ${f.name}`);
        }
      }
    }

    function handleGuess(res, text) {
      if (res.foundAll) fillSlots(res.foundAll);
      if (res.solved) {
        guessNote.className = 'feedback good';
        guessNote.textContent = 'You got it!';
        return;
      }
      if (res.partial) {
        ctx.sfx('correct');
        ctx.flashStage();
        guessNote.className = 'feedback good';
        guessNote.textContent = res.message;
        guessInput.value = '';
        ctx.say(res.message);
        return;
      }
      if (res.ok === false) {
        guessNote.className = 'feedback';
        guessNote.textContent = res.message || res.error || '';
        return;
      }
      guessNote.className = `feedback ${res.close ? 'close' : 'bad'}`;
      guessNote.textContent = res.close ? `"${text}"... close, but not quite!` : `Nope, it's not "${res.guess || text}".`;
    }

    const guessForm = h('form', { class: 'input-row', onsubmit: async (e) => {
      e.preventDefault();
      const text = guessInput.value.trim();
      if (!text || guessing || ctx.finished) return;
      guessing = true;
      guessBtn.disabled = true;
      guessNote.className = 'feedback';
      guessNote.textContent = 'Checking...';
      const res = await ctx.act('guess', { text });
      guessing = false;
      guessBtn.disabled = false;
      handleGuess(res, text);
      if (!res.solved) guessInput.select();
    } }, guessInput, guessBtn);

    el.append(h('div', { class: 'mb-layout' },
      h('section', { class: 'mb-col-l' },
        scene,
        h('div', { class: 'mb-tools' }, toolButtons),
        readout),
      h('section', { class: 'mb-col-r' },
        h('div', { class: 'panel mb-panel' }, h('h3', {}, many ? `What's inside? (${view.count} things)` : "What's inside?"), h('div', { class: 'mb-slots' }, slots), guessForm, guessNote),
        h('div', { class: 'panel mb-panel' }, h('h3', {}, view.aiMode === 'ai' ? 'Ask the box (AI)' : 'Ask the box'), askForm, chips, askNote, answers),
        h('div', { class: 'panel mb-panel' }, h('h3', {}, 'Clue log'), log))));

    return {
      onKey(e) {
        if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          ry += e.key === 'ArrowLeft' ? -20 : 20;
          lastDrag = Date.now();
          return true;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          rx = Math.max(-60, Math.min(25, rx + (e.key === 'ArrowUp' ? -10 : 10)));
          lastDrag = Date.now();
          return true;
        }
        const map = { s: shake, l: listen, w: weigh, x: scan, arrowleft: () => tilt('left'), arrowright: () => tilt('right') };
        const fn = map[e.key.toLowerCase()];
        if (fn) {
          fn();
          return true;
        }
        if (e.key === 'g' || e.key === 'G') {
          guessInput.focus();
          return true;
        }
        if (e.key === 'Enter' || e.key === '/') {
          askInput.focus();
          return true;
        }
        return false;
      },

      async onFinish(outcome, res) {
        [askInput, askBtn, guessInput, guessBtn, ...toolButtons].forEach((b) => (b.disabled = true));
        const objects = res.reveal?.objects || [];
        fillSlots(objects.map((o) => ({ index: o.index, name: o.name, emoji: o.emoji })));
        inside.replaceChildren(...objects.map((o, i) => {
          const prize = h('div', { class: 'mb-prize emoji' }, o.emoji);
          prize.style.setProperty('--i', String(i));
          prize.style.setProperty('--n', String(objects.length));
          return prize;
        }));
        rx = -18;
        ry = 0;
        applyRot();
        scene.classList.add('open', outcome === 'win' ? 'win' : 'lose');
        ctx.sfx('whoosh');
        await sleep(reduced ? 300 : 1900);
      },

      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
      },
    };
  },

  renderReveal(slot, reveal) {
    if (!reveal.objects?.length) return;
    slot.append(h('div', { class: 'mb-reveal' }, reveal.objects.map((o, i) => h('div', { class: 'mb-reveal-card', style: { animationDelay: `${200 + i * 250}ms` } },
      h('div', { class: 'emoji' }, o.emoji),
      h('b', {}, o.name),
      reveal.objects.length > 1 ? h('span', { class: `pill ${o.found ? 'good' : 'bad'}` }, o.found ? 'Found ✔' : 'Missed') : null,
      reveal.objects.length > 1 ? h('p', { class: 'muted' }, o.why) : null))));
  },
};

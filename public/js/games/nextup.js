// Game 4 client: What Happens Next?
// A cinematic player (canvas animation or an uploaded video) that freezes right before
// the twist, collects the group's prediction, then plays the ending.
import { h, sleep } from '../ui.js';
import { CLIPS } from './nextup-clips.js';

const MODE_LABEL = { predict: 'Predict It', pick: 'Pick the Ending', twist: 'Spot the Twist', impossible: 'Impossible Ending' };
const KEYS = ['A', 'B', 'C', 'D'];
let current = null;

/** Plays a clip between two timestamps. Works for canvas clips and video files. */
class ClipPlayer {
  constructor(view, onCue) {
    this.view = view;
    this.onCue = onCue;
    this.clip = view.clip.kind === 'canvas' ? CLIPS[view.clip.clipId] || null : null;
    this.t = 0;
    this.raf = 0;
    this.token = 0;
    this.el = h('div', { class: 'nx-screen' });
    if (view.clip.kind === 'file') {
      this.video = h('video', { class: 'nx-media', src: view.clip.url, preload: 'auto', playsinline: true });
      this.el.append(this.video);
      this.duration = view.clip.duration || null;
      this.ready = new Promise((resolve) => {
        this.video.addEventListener('loadedmetadata', () => {
          this.duration = this.video.duration || this.duration;
          resolve(true);
        }, { once: true });
        this.video.addEventListener('error', () => resolve(false), { once: true });
      });
    } else {
      this.canvas = h('canvas', { class: 'nx-media', width: 1600, height: 900 });
      this.el.append(this.canvas);
      this.duration = this.clip?.duration || 0;
      this.ready = Promise.resolve(!!this.clip);
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.el);
    }
    this.pauseAt = view.pauseAt ?? view.clip.pauseAt ?? this.clip?.pauseAt ?? 0;
  }

  resize() {
    const w = this.el.clientWidth;
    if (!this.canvas || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr);
    const H = Math.round((w * 9 / 16) * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.draw(this.t);
  }

  draw(t) {
    this.t = t;
    if (this.canvas && this.clip) {
      try {
        this.clip.draw(this.canvas.getContext('2d'), t, this.canvas.width, this.canvas.height);
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** Play from `from` to `to` seconds. Resolves true when it reaches `to`, false if interrupted. */
  async play(from, to) {
    this.stop();
    const token = ++this.token;
    const ok = await this.ready;
    if (token !== this.token) return false;
    if (!ok) return true; // missing media: skip straight to the question
    if (this.video) return this.playVideo(from, to, token);
    return new Promise((resolve) => {
      const start = performance.now();
      let last = from;
      const step = (now) => {
        if (token !== this.token) return resolve(false);
        const t = Math.min(to, from + (now - start) / 1000);
        for (const [ct, name] of this.clip.cues || []) if (ct > last && ct <= t) this.onCue?.(name);
        last = t;
        this.draw(t);
        if (t >= to) return resolve(true);
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  playVideo(from, to, token) {
    const v = this.video;
    return new Promise((resolve) => {
      try {
        v.currentTime = from;
      } catch { /* not seekable yet */ }
      v.play().catch(() => {});
      const check = () => {
        if (token !== this.token) return resolve(false);
        if (v.ended || v.currentTime >= to - 0.03) {
          v.pause();
          return resolve(true);
        }
        this.raf = requestAnimationFrame(check);
      };
      this.raf = requestAnimationFrame(check);
    });
  }

  stop() {
    this.token++;
    cancelAnimationFrame(this.raf);
    this.video?.pause();
  }

  destroy() {
    this.stop();
    this.ro?.disconnect();
  }
}

function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export default {
  id: 'nextup',
  music: 'thinking',
  howTo: [
    'Watch a short clip. It FREEZES right before something unexpected happens.',
    'Argue it out as a group: what happens next?',
    'Predict It: type your prediction in your own words. Other modes: pick one of four answers (keys 1-4).',
    'Then watch the ending and see who called it!',
  ],
  options: [
    { key: 'variant', label: 'Mode', choices: [
      { value: 'predict', label: 'Predict It ✍️' },
      { value: 'pick', label: 'Pick the Ending' },
      { value: 'twist', label: 'Spot the Twist' },
      { value: 'impossible', label: 'Impossible Ending' },
    ] },
  ],

  mount(el, view, ctx) {
    current?.mini?.destroy();
    const st = { phase: 'ready', watched: false, finished: false, destroyed: false, busy: false, lastPrediction: null, lastResult: null };
    const player = new ClipPlayer(view, (name) => ctx.sfx(name));
    current = { view, ctx, st, mini: null };
    const missing = view.clip.kind === 'canvas' && !player.clip;

    const stamp = h('div', { class: 'nx-stamp hidden' });
    const count = h('div', { class: 'nx-count hidden' });
    const titleCard = h('div', { class: 'nx-title' },
      h('div', { class: 'nx-kicker' }, `🎬 ${MODE_LABEL[view.mode] || 'Predict It'}`),
      h('h2', {}, view.title || 'What happens next?'),
      view.teaser ? h('p', {}, view.teaser) : null,
      h('button', { class: 'nx-bigplay', onclick: () => watch(), 'aria-label': 'Play the clip' }, '▶'),
      h('div', { class: 'nx-hint' }, missing ? 'This clip could not be found.' : 'Press Space to play'));
    const frame = h('div', { class: `nx-frame ${ctx.reducedMotion ? 'nx-calm' : ''}` }, player.el, h('div', { class: 'nx-grain' }), h('div', { class: 'nx-vignette' }), stamp, count, titleCard);
    const replayBtn = h('button', { class: 'btn', disabled: true, onclick: () => watch() }, '↺ Replay to the freeze ', h('span', { class: 'kbd' }, 'Space'));
    const feedback = h('div', { class: 'feedback' });
    const locked = h('div', { class: 'nx-locked' }, '👀 Watch the clip first!');

    // ----- answer area
    let input = null;
    let lockBtn = null;
    let buttons = [];
    let answerUi;
    if (view.mode === 'predict') {
      input = h('textarea', { class: 'input nx-input', rows: 2, maxlength: 300, placeholder: 'Describe what you think happens next...', 'aria-label': 'Your prediction' });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitPrediction();
        }
      });
      lockBtn = h('button', { class: 'btn primary big', type: 'submit' }, '🔒 Lock it in');
      answerUi = h('form', { class: 'nx-predict', onsubmit: (e) => { e.preventDefault(); submitPrediction(); } }, input, lockBtn);
    } else {
      buttons = (view.choices || []).map((c, i) => h('button', { class: 'nx-choice', onclick: () => choose(i) }, h('span', { class: 'nx-key' }, KEYS[i]), h('span', { class: 'nx-choice-text' }, c)));
      answerUi = h('div', { class: 'nx-choices' }, buttons);
    }
    const panel = h('div', { class: 'nx-panel panel is-locked' },
      h('div', { class: 'nx-question' }, view.question || 'What happens next?'),
      answerUi, feedback, locked);

    el.append(h('div', { class: 'nx-wrap' },
      frame,
      h('div', { class: 'nx-controls' }, h('span', { class: 'pill' }, `🎬 ${MODE_LABEL[view.mode]}`), h('span', { class: 'grow' }), replayBtn),
      panel));
    requestAnimationFrame(() => player.resize());
    player.ready.then((ok) => {
      if (!ok && !st.destroyed) titleCard.querySelector('.nx-hint').textContent = 'This video could not load. You can still make a prediction!';
    });

    function unfreeze() {
      frame.classList.remove('nx-frozen');
      stamp.classList.add('hidden');
      count.classList.add('hidden');
    }

    async function freeze(withCountdown) {
      frame.classList.add('nx-frozen');
      stamp.textContent = 'WHAT HAPPENS NEXT?';
      stamp.classList.remove('hidden');
      retrigger(stamp, 'nx-pop');
      ctx.sfx('whoosh');
      if (withCountdown && !ctx.reducedMotion) {
        for (const n of [3, 2, 1]) {
          count.textContent = String(n);
          count.classList.remove('hidden');
          retrigger(count, 'nx-pop');
          ctx.sfx('countdown');
          await sleep(650);
          if (st.destroyed || st.finished) return;
        }
        count.classList.add('hidden');
      }
      ctx.say(view.mode === 'predict' ? 'FREEZE! What happens next? Talk it over!' : 'FREEZE! Which one is it? Discuss!');
    }

    async function watch() {
      if (st.finished || st.phase === 'playing' || st.busy || missing) return;
      titleCard.classList.add('hidden');
      unfreeze();
      st.phase = 'playing';
      replayBtn.disabled = true;
      ctx.sfx('click');
      const done = await player.play(0, player.pauseAt);
      if (!done || st.destroyed || st.finished || st.phase !== 'playing') return;
      await freeze(!st.watched);
      if (st.destroyed || st.finished) return;
      st.watched = true;
      st.phase = 'frozen';
      replayBtn.disabled = false;
      panel.classList.remove('is-locked');
      input?.focus();
    }

    async function submitPrediction() {
      const text = input.value.trim();
      if (!st.watched || st.busy || st.finished || !text) return;
      st.busy = true;
      lockBtn.disabled = true;
      feedback.className = 'feedback';
      feedback.textContent = 'Checking your prediction...';
      const res = await ctx.act('predict', { text });
      st.busy = false;
      lockBtn.disabled = false;
      st.lastPrediction = text;
      st.lastResult = res;
      if (res.solved) {
        feedback.className = 'feedback good';
        feedback.textContent = 'Locked in... and you called it!';
      } else if (res.failed) {
        feedback.className = 'feedback bad';
        feedback.textContent = 'Locked in! Let\'s see what really happens...';
      } else if (res.ok === false) {
        feedback.textContent = res.message || res.error || '';
      } else {
        feedback.className = `feedback ${res.close ? 'close' : 'bad'}`;
        feedback.textContent = res.message || 'Not quite. Try again!';
        input.select();
      }
    }

    async function choose(i) {
      const b = buttons[i];
      if (!b || !st.watched || st.busy || st.finished || b.disabled) return;
      st.busy = true;
      b.classList.add('picked');
      const res = await ctx.act('choose', { index: i });
      st.busy = false;
      b.classList.remove('picked');
      if (res.solved) b.classList.add('right');
      else if (res.mistake || res.failed) {
        b.classList.add('wrong');
        b.disabled = true;
        if (!res.failed) feedback.textContent = 'Nope! That one is out.';
      } else if (res.ok === false) feedback.textContent = res.message || res.error || '';
    }

    return {
      onKey(e) {
        if (e.key === ' ') {
          e.preventDefault();
          if (!st.finished) watch();
          return true;
        }
        if (/^[1-4]$/.test(e.key) && buttons.length) {
          choose(Number(e.key) - 1);
          return true;
        }
        if (e.key === 'Enter' && input) {
          input.focus();
          return true;
        }
        return false;
      },
      onHint(hint) {
        if (hint.eliminate != null && buttons[hint.eliminate]) {
          buttons[hint.eliminate].disabled = true;
          buttons[hint.eliminate].classList.add('ruled-out');
        }
      },
      async onFinish(outcome, res) {
        st.finished = true;
        panel.classList.add('is-done');
        if (input) input.disabled = true;
        if (lockBtn) lockBtn.disabled = true;
        buttons.forEach((b) => (b.disabled = true));
        const correct = res.reveal?.correctChoice;
        if (correct != null && buttons[correct]) buttons[correct].classList.add('right');
        player.stop();
        titleCard.classList.add('hidden');
        stamp.textContent = outcome === 'win' ? 'YOU CALLED IT!' : "LET'S SEE...";
        stamp.classList.remove('hidden');
        count.classList.add('hidden');
        retrigger(stamp, 'nx-pop');
        await sleep(1000);
        if (st.destroyed) return;
        unfreeze();
        st.phase = 'revealing';
        const end = player.duration || player.pauseAt + 3;
        await player.play(player.pauseAt, end);
        if (!st.destroyed) await sleep(700);
      },
      destroy() {
        st.destroyed = true;
        player.destroy();
      },
    };
  },

  renderReveal(slot, reveal) {
    if (!current) return;
    const { st, view } = current;
    if (st.lastPrediction) {
      slot.append(h('div', { class: 'nx-yours' },
        h('div', { class: 'muted' }, 'Your prediction'),
        h('div', { class: 'nx-quote' }, `"${st.lastPrediction}"`),
        st.lastResult?.explanation && st.lastResult.method === 'ai' ? h('div', { class: 'muted' }, st.lastResult.explanation) : null));
    }
    if (view.replayAllowed === false) return;
    current.mini?.destroy();
    const mini = new ClipPlayer(view, null);
    current.mini = mini;
    const box = h('div', { class: 'nx-mini hidden' }, mini.el);
    const btn = h('button', { class: 'btn', onclick: async () => {
      btn.disabled = true;
      box.classList.remove('hidden');
      mini.resize();
      await mini.play(0, mini.duration || (reveal.playFrom || 0) + 3);
      btn.disabled = false;
    } }, '↺ Watch the whole clip again');
    slot.append(h('div', { class: 'nx-replay' }, box, btn));
  },
};

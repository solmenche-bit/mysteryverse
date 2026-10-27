// Game 6 client: Guess the Sound.
import { h, sleep } from '../ui.js';
import { normalize } from '../audio/synth.js';

const MODE_INFO = {
  classic: ['🎧', 'CLASSIC', 'Listen carefully. What made this sound?'],
  reverse: ['⏪', 'REVERSED', 'Played backwards! What is it really?'],
  slow: ['🐢', 'SLOW MOTION', 'Slowed down to half speed. Everything sounds lower.'],
  onesecond: ['⚡', 'ONE SECOND', 'You only get the very first second. Listen closely!'],
  layers: ['🎚️', 'SOUND LAYERS', 'Several sounds at once. Name every one of them!'],
  environment: ['🗺️', 'MYSTERY PLACE', 'Where are you? Name the place from its sounds.'],
};

let current = null;

/** Render every spec and mix them into one buffer (each layer keeps its own level). */
async function buildBuffer(view, audio) {
  if (view.audioUrl) return audio.loadUrl(view.audioUrl);
  const bufs = await Promise.all(view.specs.map((s) => audio.renderSpec(s)));
  if (bufs.length === 1) return bufs[0];
  const sampleRate = bufs[0].sampleRate;
  const length = Math.max(...bufs.map((b) => b.length));
  const out = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  for (let c = 0; c < 2; c++) {
    const dst = out.getChannelData(c);
    for (const b of bufs) {
      const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      for (let i = 0; i < src.length; i++) dst[i] += src[i];
    }
  }
  return normalize(out, 0.85);
}

/** Peak envelope of exactly the part of the buffer the class will hear. */
function computePeaks(buf, bins, { reverse = false, maxSeconds } = {}) {
  const total = buf.length;
  const len = maxSeconds ? Math.min(total, Math.floor(maxSeconds * buf.sampleRate)) : total;
  const a = buf.getChannelData(0);
  const b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const peaks = new Float32Array(bins);
  let max = 0;
  for (let i = 0; i < bins; i++) {
    const s = Math.floor((i * len) / bins);
    const e = Math.max(s + 1, Math.floor(((i + 1) * len) / bins));
    let m = 0;
    for (let j = s; j < e; j += 3) {
      const idx = reverse ? total - 1 - j : j;
      const v = Math.abs((a[idx] + b[idx]) / 2);
      if (v > m) m = v;
    }
    peaks[i] = m;
    if (m > max) max = m;
  }
  for (let i = 0; i < bins; i++) peaks[i] = max ? Math.sqrt(peaks[i] / max) : 0;
  return peaks;
}

function drawWave(canvas, peaks, progress, level, idle) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (!w || !hgt) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  const mid = hgt / 2;
  if (!peaks) {
    // Still rendering: a gently breathing flat line.
    const t = performance.now() / 600;
    g.strokeStyle = 'rgba(148, 163, 255, 0.5)';
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= w; x += 6) g.lineTo(x, mid + Math.sin(x / 40 + t) * 6);
    g.stroke();
    return;
  }
  const n = peaks.length;
  const bw = w / n;
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#22d3ee');
  grad.addColorStop(0.5, '#8b5cf6');
  grad.addColorStop(1, '#fb7185');
  const breathe = idle ? 0.85 + Math.sin(performance.now() / 500) * 0.06 : 1;
  for (let i = 0; i < n; i++) {
    const played = i / n <= progress;
    const amp = Math.max(2, peaks[i] * hgt * 0.44) * (played ? 1 + level * 0.35 : breathe);
    g.fillStyle = played ? grad : 'rgba(255, 255, 255, 0.16)';
    const x = i * bw + bw * 0.18;
    const width = Math.max(1, bw * 0.64);
    g.beginPath();
    if (g.roundRect) g.roundRect(x, mid - amp, width, amp * 2, width / 2);
    else g.rect(x, mid - amp, width, amp * 2);
    g.fill();
  }
  if (progress > 0 && progress < 1) {
    const x = progress * w;
    g.save();
    g.shadowColor = '#22d3ee';
    g.shadowBlur = 22;
    g.strokeStyle = '#e0faff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, 6);
    g.lineTo(x, hgt - 6);
    g.stroke();
    g.restore();
  }
}

export default {
  id: 'sound',
  music: 'thinking',
  howTo: [
    'Press PLAY (or the Space bar) to hear a mystery sound. Replay it as often as you like.',
    'Shout out what you think made it, then type your best guess. Wording does not have to be perfect.',
    'Watch the mode: some sounds are REVERSED, slowed down, cut to ONE SECOND, or LAYERED.',
    'In Mystery Place levels, name WHERE you are from the sounds around you.',
  ],

  mount(el, view, ctx) {
    const [modeIcon, modeName, modeHelp] = MODE_INFO[view.mode] || MODE_INFO.classic;
    const pb = view.playback || { rate: 1 };
    let buffer = null;
    let peaks = null;
    let handle = null;
    let raf = 0;
    let plays = 0;
    let busy = false;
    let destroyed = false;
    const found = new Map();

    const canvas = h('canvas', { class: 'snd-wave', 'aria-label': 'Sound waveform' });
    const playBtn = h('button', { class: 'snd-play', 'aria-label': 'Play the sound (Space)', disabled: true, onclick: () => play() },
      h('span', { class: 'snd-play-icon' }, '▶'), h('span', { class: 'snd-play-label' }, 'Loading...'));
    const playsEl = h('span', { class: 'chip' }, h('small', {}, 'Plays'), '0');
    const durEl = h('span', { class: 'chip' }, h('small', {}, 'Length'), view.durationSeconds ? `${view.durationSeconds.toFixed(1)} s` : '...');
    const slotWrap = h('div', { class: 'snd-slots' });
    const feedback = h('div', { class: 'feedback' });
    const guesses = h('div', { class: 'snd-guesses' });
    const input = h('input', { class: 'input', placeholder: view.mode === 'environment' ? 'Where are you?' : view.slots > 1 ? 'Name one of the sounds...' : 'What made that sound?', maxlength: 120, autocomplete: 'off', 'aria-label': 'Your guess' });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, 'Guess');

    const renderSlots = () => {
      if (view.slots < 2) return;
      slotWrap.replaceChildren(...Array.from({ length: view.slots }, (_, i) => {
        const f = found.get(i);
        return h('div', { class: `snd-slot ${f ? 'found' : ''}` },
          f ? h('span', { class: 'emoji snd-slot-emoji' }, f.emoji) : h('span', { class: 'snd-slot-q' }, '?'),
          h('span', { class: 'snd-slot-name' }, f ? f.answer : `Sound ${i + 1}`));
      }));
    };

    const loop = () => {
      if (destroyed) return;
      let progress = 0;
      let level = 0;
      const actx = ctx.audio.ctx;
      if (handle && actx) {
        progress = Math.min(1, Math.max(0, (actx.currentTime - handle.startedAt) / handle.duration));
        if (handle.analyser) {
          const data = new Float32Array(handle.analyser.fftSize);
          handle.analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        }
        playBtn.style.setProperty('--level', level.toFixed(3));
      }
      drawWave(canvas, peaks, handle ? progress : 0, level, !handle);
      raf = requestAnimationFrame(loop);
    };

    function play() {
      if (!buffer) return;
      handle?.stop();
      const duration = pb.maxSeconds ? Math.min(pb.maxSeconds, buffer.duration) : undefined;
      let mine = null;
      mine = ctx.audio.playBuffer(buffer, {
        rate: pb.rate || 1, reverse: !!pb.reverse, duration, analyser: true,
        onended: () => {
          if (handle !== mine) return; // a newer replay took over
          handle = null;
          el.classList.remove('snd-playing');
          playBtn.style.setProperty('--level', '0');
        },
      });
      handle = mine;
      if (!handle) {
        ctx.toast('Sound is not available in this browser.', 'bad');
        return;
      }
      el.classList.add('snd-playing');
      plays += 1;
      playsEl.lastChild.textContent = String(plays);
      playBtn.querySelector('.snd-play-icon').textContent = '⟳';
      playBtn.querySelector('.snd-play-label').textContent = 'Replay';
      if (!ctx.finished) ctx.act('played');
    }

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
      for (const f of res.found || []) found.set(f.index, f);
      renderSlots();
      if (res.solved) {
        feedback.className = 'feedback good';
        feedback.textContent = `"${text}" is right!`;
        return;
      }
      if (res.ok === false) {
        feedback.textContent = res.message || res.error || '';
        return;
      }
      input.value = '';
      if (res.partial) {
        ctx.sfx('correct');
        ctx.say(`Got one! ${res.remaining} more to go.`);
        feedback.className = 'feedback good';
        feedback.textContent = `✔ Yes! ${res.remaining} more sound${res.remaining === 1 ? '' : 's'} to find.`;
        return;
      }
      if (res.already) {
        feedback.className = 'feedback close';
        feedback.textContent = res.message;
        return;
      }
      guesses.prepend(h('span', { class: `chip ${res.close ? 'snd-close' : ''}` }, res.close ? '🔥 ' : '✖ ', text));
      feedback.className = `feedback ${res.close ? 'close' : 'bad'}`;
      feedback.textContent = res.reason || (res.close ? 'Close! You\'re on the right track.' : 'Not that. Listen again!');
      input.focus();
    } }, input, submit);

    el.append(
      h('div', { class: 'snd-head row' },
        h('div', { class: `snd-mode snd-mode-${view.mode}` }, h('span', { class: 'emoji' }, modeIcon), h('b', {}, modeName)),
        h('div', { class: 'snd-help grow' }, modeHelp),
        durEl, playsEl),
      h('div', { class: 'snd-stage panel' }, canvas, playBtn),
      slotWrap,
      h('div', { class: 'snd-answer panel' }, form, feedback, guesses),
    );
    renderSlots();
    loop();

    buildBuffer(view, ctx.audio).then((buf) => {
      if (destroyed) return;
      buffer = buf;
      current = { ctx, view, buffer };
      peaks = computePeaks(buf, 160, { reverse: pb.reverse, maxSeconds: pb.maxSeconds });
      if (!view.durationSeconds) durEl.lastChild.textContent = `${(Math.min(buf.duration, pb.maxSeconds || Infinity) / (pb.rate || 1)).toFixed(1)} s`;
      playBtn.disabled = false;
      playBtn.querySelector('.snd-play-label').textContent = 'Play';
      playBtn.classList.add('ready');
    }).catch((err) => {
      console.error(err);
      feedback.className = 'feedback bad';
      feedback.textContent = 'This sound could not be loaded. Try skipping to the next level.';
    });
    current = { ctx, view, buffer: null };

    return {
      onKey(e) {
        if (e.key === ' ' || e.code === 'Space') {
          play();
          return true;
        }
        if (e.key === 'Enter' || e.key === '/') {
          input.focus();
          return true;
        }
        return false;
      },
      async onFinish(outcome) {
        input.disabled = true;
        submit.disabled = true;
        if (outcome === 'win') await sleep(700);
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        handle?.stop();
      },
    };
  },

  /** After the reveal: the found/missed sounds, and buttons to hear them normally. */
  renderReveal(slot, reveal) {
    const sounds = reveal.sounds || [];
    if (sounds.length > 1) {
      slot.append(h('div', { class: 'snd-reveal-cards' }, sounds.map((s) => h('div', { class: `snd-slot ${s.found ? 'found' : 'missed'}` },
        h('span', { class: 'emoji snd-slot-emoji' }, s.emoji), h('span', { class: 'snd-slot-name' }, s.answer), h('span', { class: 'muted' }, s.found ? 'found ✔' : 'missed')))));
    }
    const cur = current;
    if (!cur?.buffer) return;
    const { ctx, view, buffer } = cur;
    let playing = null;
    const playBuf = (buf) => {
      playing?.stop();
      playing = ctx.audio.playBuffer(buf, { rate: 1 });
    };
    const buttons = [h('button', { class: 'btn', onclick: () => playBuf(buffer) },
      view.mode === 'reverse' ? '▶ Hear it forwards' : view.mode === 'slow' ? '▶ Hear it at normal speed' : view.mode === 'onesecond' ? '▶ Hear the whole sound' : '▶ Hear it again')];
    if (view.mode === 'layers') {
      view.specs.forEach((spec, i) => buttons.push(h('button', { class: 'btn sm', onclick: async () => playBuf(await ctx.audio.renderSpec(spec)) }, `${sounds[i]?.emoji || '🔊'} ${sounds[i]?.answer || `Sound ${i + 1}`} alone`)));
    }
    slot.append(h('div', { class: 'row snd-reveal-actions' }, buttons));
  },
};

// Adaptive audio engine: original procedural music (instrumental, no samples),
// crossfading moods, sound effects, stingers, spec playback and host voice.
import { renderSpec, reverseBuffer, loadAudioUrl } from './synth.js';
import { store } from '../store.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------------------------------------------------------------- instruments
// Each takes (ctx, out, time, ...) and schedules a short voice.

function env(ctx, t, a, peak, d) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  return g;
}

let noise = null;
function noiseBuf(ctx) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

const I = {
  kick(ctx, out, t, g = 0.5) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const e = env(ctx, t, 0.002, g, 0.3);
    o.connect(e).connect(out);
    o.start(t);
    o.stop(t + 0.35);
  },
  hat(ctx, out, t, g = 0.08, open = false) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const e = env(ctx, t, 0.001, g, open ? 0.22 : 0.045);
    s.connect(f).connect(e).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + (open ? 0.3 : 0.08));
  },
  clap(ctx, out, t, g = 0.18) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1700;
    f.Q.value = 0.9;
    const e = env(ctx, t, 0.002, g, 0.16);
    s.connect(f).connect(e).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.22);
  },
  tick(ctx, out, t, g = 0.06) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2600;
    const e = env(ctx, t, 0.001, g, 0.02);
    o.connect(e).connect(out);
    o.start(t);
    o.stop(t + 0.04);
  },
  bass(ctx, out, t, freq, dur, g = 0.22) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.04);
    f.frequency.exponentialRampToValueAtTime(240, t + dur);
    const e = env(ctx, t, 0.005, g, dur);
    o.connect(f).connect(e).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  sub(ctx, out, t, freq, dur, g = 0.25) {
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const e = env(ctx, t, 0.02, g, dur);
    o.connect(e).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  pluck(ctx, out, t, freq, dur = 0.25, g = 0.08, wave = 'square') {
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(600, t + dur);
    const e = env(ctx, t, 0.003, g, dur);
    o.connect(f).connect(e).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  bell(ctx, out, t, freq, g = 0.07, dur = 1.6) {
    for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * mult;
      const e = env(ctx, t, 0.003, g * amp, dur / mult);
      o.connect(e).connect(out);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  },
  pad(ctx, out, t, freqs, dur, g = 0.05) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1300;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(g, t + Math.min(0.8, dur * 0.3));
    e.gain.setValueAtTime(g, t + dur * 0.7);
    e.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(e).connect(out);
    for (const fr of freqs) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  },
  riser(ctx, out, t, dur, g = 0.05) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf(ctx);
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(5000, t + dur);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(g, t + dur * 0.95);
    e.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(e).connect(out);
    s.start(t);
    s.stop(t + dur + 0.05);
  },
  rattle(ctx, out, t, g = 0.04) {
    for (let i = 0; i < 4; i++) {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf(ctx);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2500 + Math.random() * 2000;
      f.Q.value = 6;
      const tt = t + i * (0.03 + Math.random() * 0.03);
      const e = env(ctx, tt, 0.001, g, 0.05);
      s.connect(f).connect(e).connect(out);
      s.start(tt, Math.random() * 0.5);
      s.stop(tt + 0.08);
    }
  },
};

// ---------------------------------------------------------------- moods
// chords: MIDI note arrays, one per bar. play(step, time, out, ctx, r, mood)

const chord = (root, minor = true) => [root, root + (minor ? 3 : 4), root + 7];

const MOODS = {
  menu: {
    bpm: 118,
    chords: [chord(57), chord(53, false), chord(48, false), chord(55, false)], // Am F C G
    play(s, t, out, ctx, r, bar, sd) {
      const c = this.chords[bar % 4];
      if (s % 4 === 0) I.kick(ctx, out, t, 0.42);
      if (s % 8 === 4) I.clap(ctx, out, t, 0.12);
      if (s % 2 === 0) I.hat(ctx, out, t + (s % 4 === 2 ? 0 : 0.005), s % 4 === 2 ? 0.07 : 0.035);
      if ([0, 3, 6, 8, 10, 14].includes(s)) I.bass(ctx, out, t, mtof(c[0] - 12), sd * 1.8, 0.16);
      const arp = [0, 1, 2, 1, 2, 0, 1, 2];
      I.pluck(ctx, out, t, mtof(c[arp[s % 8]] + 12 + (s >= 8 && bar % 2 ? 12 : 0)), sd * 1.5, 0.035);
      if (s === 0) I.pad(ctx, out, t, c.map((n) => mtof(n)), sd * 16, 0.022);
      if (bar % 2 === 1 && [0, 3, 6, 10].includes(s)) I.bell(ctx, out, t, mtof(c[[2, 1, 0, 2][[0, 3, 6, 10].indexOf(s)]] + 24), 0.03, 1);
    },
  },
  shuffle: {
    bpm: 124,
    chords: [chord(60, false), chord(57), chord(53, false), chord(55, false)], // C Am F G
    play(s, t, out, ctx, r, bar, sd) {
      const c = this.chords[bar % 4];
      if (s % 4 === 0) I.kick(ctx, out, t, 0.45);
      if (s % 8 === 4) I.clap(ctx, out, t, 0.14);
      I.hat(ctx, out, t, s % 2 ? 0.03 : 0.06);
      if (s % 2 === 0) I.bass(ctx, out, t, mtof(c[0] - 12 + (s % 4 === 2 ? 12 : 0)), sd * 1.6, 0.15);
      I.pluck(ctx, out, t, mtof(c[s % 3] + 12 + (s % 8 > 3 ? 12 : 0)), sd * 1.2, 0.03, 'triangle');
      if (s === 0) I.pad(ctx, out, t, c.map((n) => mtof(n)), sd * 16, 0.02);
    },
  },
  thinking: {
    bpm: 84,
    chords: [chord(50), chord(46, false), chord(53, false), chord(48, false)], // Dm Bb F C
    play(s, t, out, ctx, r, bar, sd) {
      const c = this.chords[bar % 4];
      if (s === 0 || s === 8) I.kick(ctx, out, t, 0.18);
      if (s === 4 || s === 12) I.hat(ctx, out, t, 0.04);
      if (s % 2 === 1) I.hat(ctx, out, t, 0.012);
      if ([0, 6, 8].includes(s)) I.sub(ctx, out, t, mtof(c[0] - 12), sd * 3, 0.16);
      if (s === 0) I.pad(ctx, out, t, c.map((n) => mtof(n)), sd * 16, 0.02);
      if (s % 2 === 0 && r() < 0.2) {
        const penta = [0, 2, 3, 7, 10];
        I.bell(ctx, out, t, mtof(62 + 12 + penta[(r() * 5) | 0]), 0.02, 1.8);
      }
    },
  },
  tension: {
    bpm: 112,
    chords: [chord(52), chord(48, false), chord(57), chord(59, false)], // Em C Am B
    play(s, t, out, ctx, r, bar, sd) {
      const c = this.chords[bar % 4];
      if (s % 4 === 0 || s === 10) I.kick(ctx, out, t, 0.4);
      I.tick(ctx, out, t, s % 4 === 0 ? 0.05 : 0.02);
      if (s % 8 === 4) I.clap(ctx, out, t, 0.1);
      if (s % 2 === 0) I.bass(ctx, out, t, mtof(c[0] - 12), sd * 1.8, 0.18);
      I.pluck(ctx, out, t, mtof(c[s % 3] + 12 + Math.floor(s / 6) * 12), sd, 0.028, 'sawtooth');
      if (s === 0 && bar % 4 === 3) I.riser(ctx, out, t, sd * 16, 0.035);
    },
  },
  countdown: {
    bpm: 140,
    chords: [chord(52), chord(52), chord(53, false), chord(55, false)],
    play(s, t, out, ctx, r, bar, sd) {
      const c = this.chords[bar % 4];
      if (s % 4 === 0) I.kick(ctx, out, t, 0.5);
      if (s % 8 === 4) I.clap(ctx, out, t, 0.16);
      I.hat(ctx, out, t, 0.05);
      I.bass(ctx, out, t, mtof(c[0] - 12 + (s % 2 ? 12 : 0)), sd, 0.16);
      if (s % 4 === 0) I.pluck(ctx, out, t, mtof(76 + bar * 2), sd, 0.05, 'square');
      if (s === 0) I.riser(ctx, out, t, sd * 16, 0.05);
    },
  },
  terminal: {
    bpm: 100,
    chords: [chord(48), chord(44, false), chord(51, false), chord(46, false)], // Cm Ab Eb Bb
    play(s, t, out, ctx, r, bar, sd) {
      const c = this.chords[bar % 4];
      if (s === 0 || s === 10) I.kick(ctx, out, t, 0.25);
      if (s % 4 === 2) I.hat(ctx, out, t, 0.03);
      if (s % 4 === 0) I.sub(ctx, out, t, mtof(c[0] - 12), sd * 3, 0.16);
      if (r() < 0.55) I.pluck(ctx, out, t, mtof(c[(r() * 3) | 0] + 24 + (r() < 0.3 ? 12 : 0)), sd * 0.6, 0.022, 'square');
      if (s === 0) I.pad(ctx, out, t, c.map((n) => mtof(n)), sd * 16, 0.016);
      if (r() < 0.04) I.tick(ctx, out, t, 0.03);
    },
  },
  box: {
    bpm: 72,
    chords: [chord(45), chord(41, false), chord(48, false), chord(43, false)], // Am F C G (low)
    play(s, t, out, ctx, r, bar, sd) {
      const c = this.chords[bar % 4];
      if (s === 0) {
        I.pad(ctx, out, t, c.map((n) => mtof(n + 12)), sd * 16, 0.022);
        I.sub(ctx, out, t, mtof(c[0] - 12), sd * 14, 0.12);
      }
      if (s % 4 === 0 && r() < 0.35) I.bell(ctx, out, t, mtof(c[(r() * 3) | 0] + 36), 0.018, 2.4);
      if (r() < 0.05) I.rattle(ctx, out, t, 0.02);
      if (s === 8) I.hat(ctx, out, t, 0.02, true);
    },
  },
};

// ---------------------------------------------------------------- engine

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.players = [];
    this.mood = null;
    this.pendingMood = 'menu';
    this.bufferCache = new Map();
  }

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    this.master.connect(limiter).connect(c.destination);
    this.musicBus = c.createGain();
    this.musicDuck = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus.connect(this.musicDuck).connect(this.master);
    this.sfxBus.connect(this.master);
    this.applyVolumes();
    this.timer = setInterval(() => this.schedule(), 25);
    const m = this.pendingMood;
    this.mood = null;
    if (m) this.setMood(m);
  }

  get ready() { return !!this.ctx; }

  applyVolumes() {
    if (!this.ctx) return;
    const a = store.settings.audio;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.muted ? 0 : a.master, now, 0.05);
    this.musicBus.gain.setTargetAtTime(a.musicOn ? a.music * 0.9 : 0, now, 0.1);
    this.sfxBus.gain.setTargetAtTime(a.sfxOn ? a.sfx : 0, now, 0.05);
  }

  toggleMute() {
    store.setSettings({ audio: { muted: !store.settings.audio.muted } });
    this.applyVolumes();
    if (store.settings.audio.muted) window.speechSynthesis?.cancel();
    return store.settings.audio.muted;
  }

  /** Crossfade to a music mood: menu | thinking | tension | countdown | terminal | box | shuffle | silent */
  setMood(name) {
    if (!this.ctx) {
      this.pendingMood = name;
      return;
    }
    if (name === this.mood) return;
    this.mood = name;
    const now = this.ctx.currentTime;
    for (const p of this.players) {
      if (p.stopping) continue;
      p.stopping = now + 1.6;
      p.out.gain.cancelScheduledValues(now);
      p.out.gain.setValueAtTime(p.out.gain.value, now);
      p.out.gain.linearRampToValueAtTime(0.0001, now + 1.5);
    }
    const def = MOODS[name];
    if (!def) return;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(1, now + 1.5);
    out.connect(this.musicBus);
    this.players.push({ def, out, step: 0, bar: 0, next: now + 0.08, r: rng(Date.now() & 0xffff), stopping: 0 });
  }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const ahead = c.currentTime + 0.12;
    for (const p of this.players) {
      const sd = 60 / p.def.bpm / 4;
      while (p.next < ahead && (!p.stopping || p.next < p.stopping)) {
        try {
          p.def.play(p.step, p.next, p.out, c, p.r, p.bar, sd);
        } catch {
          /* never let a music glitch break the game */
        }
        p.step = (p.step + 1) % 16;
        if (p.step === 0) p.bar += 1;
        p.next += sd;
      }
    }
    this.players = this.players.filter((p) => {
      if (p.stopping && c.currentTime > p.stopping) {
        p.out.disconnect();
        return false;
      }
      return true;
    });
  }

  duck(level = 0.3, ms = 2500) {
    if (!this.ctx) return;
    const g = this.musicDuck.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(level, now, 0.08);
    g.setTargetAtTime(1, now + ms / 1000, 0.4);
  }

  // ---------------- sound effects ----------------
  sfx(name) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.01;
    const o = this.sfxBus;
    switch (name) {
      case 'click': I.pluck(c, o, t, 880, 0.06, 0.06, 'triangle'); break;
      case 'type': I.tick(c, o, t, 0.04); break;
      case 'tick': I.tick(c, o, t, 0.1); break;
      case 'beep': I.pluck(c, o, t, 1046, 0.15, 0.1, 'square'); break;
      case 'pop': {
        const osc = c.createOscillator();
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(900, t + 0.08);
        osc.connect(env(c, t, 0.002, 0.2, 0.1)).connect(o);
        osc.start(t);
        osc.stop(t + 0.15);
        break;
      }
      case 'correct': I.bell(c, o, t, 1046, 0.18, 0.8); I.bell(c, o, t + 0.09, 1568, 0.14, 1); break;
      case 'wrong': {
        // Short, soft and a little goofy - never harsh.
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, t);
        osc.frequency.exponentialRampToValueAtTime(196, t + 0.35);
        osc.connect(env(c, t, 0.01, 0.22, 0.4)).connect(o);
        osc.start(t);
        osc.stop(t + 0.45);
        break;
      }
      case 'hint': I.bell(c, o, t, 784, 0.12, 0.9); I.bell(c, o, t + 0.12, 1175, 0.1, 1.1); break;
      case 'whoosh': I.riser(c, o, t, 0.45, 0.18); break;
      case 'reveal': I.riser(c, o, t, 0.8, 0.12); [60, 64, 67, 72].forEach((n, i) => I.bell(c, o, t + 0.7 + i * 0.06, mtof(n + 12), 0.09, 1.4)); break;
      case 'shake': I.rattle(c, o, t, 0.12); break;
      case 'scan': {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.linearRampToValueAtTime(1600, t + 0.6);
        osc.frequency.linearRampToValueAtTime(800, t + 0.9);
        osc.connect(env(c, t, 0.05, 0.08, 0.9)).connect(o);
        osc.start(t);
        osc.stop(t + 1);
        break;
      }
      case 'unlock': [60, 64, 67, 72, 76].forEach((n, i) => I.pluck(c, o, t + i * 0.07, mtof(n + 12), 0.2, 0.1, 'square')); break;
      case 'deny': I.pluck(c, o, t, 140, 0.18, 0.14, 'square'); I.pluck(c, o, t + 0.2, 120, 0.25, 0.14, 'square'); break;
      case 'drumroll': {
        for (let i = 0; i < 26; i++) I.clap(c, o, t + i * 0.06, 0.03 + i * 0.006);
        const s = c.createBufferSource();
        s.buffer = noiseBuf(c);
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 3000;
        s.connect(f).connect(env(c, t + 1.6, 0.005, 0.16, 1.4)).connect(o);
        s.start(t + 1.6);
        s.stop(t + 3.1);
        I.kick(c, o, t + 1.6, 0.6);
        break;
      }
      case 'countdown': I.pluck(c, o, t, 660, 0.2, 0.12, 'square'); break;
      default: break;
    }
  }

  /** Short musical stingers. */
  sting(name) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.02;
    const o = this.sfxBus;
    if (name === 'victory') {
      this.duck(0.15, 4200);
      const notes = [60, 64, 67, 72, 76, 79];
      notes.forEach((n, i) => I.pluck(c, o, t + i * 0.08, mtof(n + 12), 0.35, 0.09, 'square'));
      I.kick(c, o, t + 0.5, 0.6);
      I.pad(c, o, t + 0.5, [mtof(60), mtof(64), mtof(67), mtof(72)], 2.6, 0.06);
      [84, 88, 91, 96].forEach((n, i) => I.bell(c, o, t + 0.6 + i * 0.12, mtof(n), 0.06, 1.6));
      I.bass(c, o, t + 0.5, mtof(36), 1.2, 0.25);
    } else if (name === 'fail') {
      this.duck(0.3, 1800);
      [[67, 0], [66, 0.28], [65, 0.56]].forEach(([n, d]) => {
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(mtof(n), t + d);
        if (d > 0.5) osc.frequency.exponentialRampToValueAtTime(mtof(n - 2), t + d + 0.6);
        osc.connect(env(c, t + d, 0.02, 0.16, d > 0.5 ? 0.7 : 0.25)).connect(o);
        osc.start(t + d);
        osc.stop(t + d + 0.8);
      });
    } else if (name === 'level') {
      I.riser(c, o, t, 0.6, 0.08);
      I.bell(c, o, t + 0.55, mtof(84), 0.07, 1.2);
    }
  }

  // ---------------- spec / buffer playback ----------------
  async renderSpec(spec) {
    const key = JSON.stringify(spec);
    if (this.bufferCache.has(key)) return this.bufferCache.get(key);
    const buf = await renderSpec(spec);
    this.bufferCache.set(key, buf);
    if (this.bufferCache.size > 40) this.bufferCache.delete(this.bufferCache.keys().next().value);
    return buf;
  }

  async loadUrl(url) {
    this.unlock();
    if (this.bufferCache.has(url)) return this.bufferCache.get(url);
    const buf = await loadAudioUrl(this.ctx, url);
    this.bufferCache.set(url, buf);
    return buf;
  }

  /**
   * Play an AudioBuffer through the effects bus.
   * opts: rate, reverse, offset (s), duration (s), analyser (bool), duck (bool), onended
   */
  playBuffer(buf, opts = {}) {
    this.unlock();
    const c = this.ctx;
    if (!c) return null;
    const src = c.createBufferSource();
    src.buffer = opts.reverse ? reverseBuffer(c, buf) : buf;
    src.playbackRate.value = opts.rate || 1;
    let node = src;
    let analyser = null;
    if (opts.analyser) {
      analyser = c.createAnalyser();
      analyser.fftSize = 2048;
      node.connect(analyser);
      node = analyser;
    }
    node.connect(this.sfxBus);
    const offset = opts.offset || 0;
    const duration = opts.duration ?? (buf.duration - offset);
    if (opts.duck !== false) this.duck(0.2, (duration / (opts.rate || 1)) * 1000 + 300);
    src.start(c.currentTime + 0.02, offset, duration);
    src.onended = () => opts.onended?.();
    return { source: src, analyser, startedAt: c.currentTime + 0.02, duration: duration / (opts.rate || 1), stop: () => { try { src.stop(); } catch { /* already stopped */ } } };
  }

  async playSpec(spec, opts = {}) {
    this.unlock();
    if (!this.ctx) return null;
    const buf = await this.renderSpec(spec);
    return this.playBuffer(buf, opts);
  }

  // ---------------- host voice (browser text-to-speech) ----------------
  speak(text) {
    const a = store.settings.audio;
    if (!('speechSynthesis' in window) || a.muted || !store.settings.host.voice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.volume = Math.min(1, a.master * a.voice);
    u.rate = 1.05;
    u.pitch = 1.05;
    const voices = speechSynthesis.getVoices().filter((v) => v.lang?.startsWith('en'));
    u.voice = voices.find((v) => /natural|neural|google us|aria|jenny|guy/i.test(v.name)) || voices[0] || null;
    speechSynthesis.speak(u);
  }
}

export const audio = new AudioEngine();

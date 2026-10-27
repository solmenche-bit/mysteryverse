// Renders declarative sound specs (sent by the server) into AudioBuffers.
// The spec describes oscillators and filtered noise, never what the sound "is",
// so the answer to a sound puzzle never reaches the browser.
//
// SoundSpec  = { duration: s, gain?: peak 0-1 (default 0.8), seed?: number, events: SoundEvent[] }
// SoundEvent = {
//   t, dur                       start time and length in seconds
//   src: 'osc' | 'noise'
//   wave?: 'sine'|'square'|'sawtooth'|'triangle'      (osc)
//   freq?, freqEnd?              Hz; freqEnd ramps exponentially over the event
//   bend?: [[fraction, Hz], ...] piecewise pitch curve (overrides freqEnd)
//   detune?                      cents
//   noise?: 'white'|'pink'|'brown'
//   filter?, filter2?: { type, freq, freqEnd?, q? }   BiquadFilter stages
//   gain?                        peak level (default 0.5)
//   env?: 'perc' | 'hold' | 'swell'  (default 'perc')
//   attack?, release?            seconds
//   lfo?: { rate, depth, target: 'freq'|'gain'|'filter' }
//   pan?                         -1..1
//   repeat?: { count, every, jitter?, gainJitter?, freqJitter?, decay?, accel? }
// }

const SR = 44100;
const noiseCache = new Map();

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseBuffer(ctx, type) {
  const key = `${type}:${ctx.sampleRate}`;
  if (noiseCache.has(key) && noiseCache.get(key).ctx === ctx) return noiseCache.get(key).buf;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = mulberry32(type.length * 7919);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    if (type === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else if (type === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  noiseCache.set(key, { ctx, buf });
  return buf;
}

/** Expand `repeat` blocks into individual events. */
export function expandEvents(spec) {
  const rnd = mulberry32(spec.seed ?? 12345);
  const out = [];
  for (const ev of spec.events || []) {
    const rep = ev.repeat;
    if (!rep) {
      out.push(ev);
      continue;
    }
    let t = ev.t || 0;
    let every = rep.every || 0.25;
    let g = ev.gain ?? 0.5;
    for (let i = 0; i < (rep.count || 1); i++) {
      const jitter = rep.jitter ? (rnd() * 2 - 1) * rep.jitter : 0;
      const gj = rep.gainJitter ? 1 - rnd() * rep.gainJitter : 1;
      const fj = rep.freqJitter ? 1 + (rnd() * 2 - 1) * rep.freqJitter : 1;
      out.push({
        ...ev, repeat: undefined, t: Math.max(0, t + jitter), gain: g * gj,
        freq: ev.freq ? ev.freq * fj : ev.freq, freqEnd: ev.freqEnd ? ev.freqEnd * fj : ev.freqEnd,
        filter: ev.filter && rep.freqJitter ? { ...ev.filter, freq: ev.filter.freq * fj } : ev.filter,
      });
      t += every;
      every *= rep.accel || 1;
      g *= rep.decay || 1;
    }
  }
  return out;
}

function applyEnvelope(param, ev, peak) {
  const t0 = ev.t;
  const dur = Math.max(0.005, ev.dur);
  const a = Math.min(ev.attack ?? 0.005, dur * 0.9);
  const env = ev.env || 'perc';
  param.setValueAtTime(0.0001, t0);
  if (env === 'hold') {
    const r = Math.min(ev.release ?? 0.05, dur - a);
    param.linearRampToValueAtTime(peak, t0 + a);
    param.setValueAtTime(peak, t0 + dur - r);
    param.linearRampToValueAtTime(0.0001, t0 + dur);
  } else if (env === 'swell') {
    param.linearRampToValueAtTime(peak, t0 + dur * 0.5);
    param.linearRampToValueAtTime(0.0001, t0 + dur);
  } else {
    param.linearRampToValueAtTime(peak, t0 + a);
    param.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
}

function buildFilter(ctx, f, ev) {
  const node = ctx.createBiquadFilter();
  node.type = f.type || 'lowpass';
  node.Q.value = f.q ?? 1;
  node.frequency.setValueAtTime(f.freq || 1000, ev.t);
  if (f.freqEnd) node.frequency.exponentialRampToValueAtTime(Math.max(20, f.freqEnd), ev.t + ev.dur);
  return node;
}

function scheduleEvent(ctx, dest, ev) {
  let src;
  if (ev.src === 'noise') {
    src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, ev.noise || 'white');
    src.loop = true;
  } else {
    src = ctx.createOscillator();
    src.type = ev.wave || 'sine';
    const f = src.frequency;
    f.setValueAtTime(ev.freq || 440, ev.t);
    if (ev.bend?.length) for (const [frac, hz] of ev.bend) f.exponentialRampToValueAtTime(Math.max(20, hz), ev.t + ev.dur * frac);
    else if (ev.freqEnd) f.exponentialRampToValueAtTime(Math.max(20, ev.freqEnd), ev.t + ev.dur);
    if (ev.detune) src.detune.value = ev.detune;
  }
  let node = src;
  const filters = [ev.filter, ev.filter2].filter(Boolean).map((f) => buildFilter(ctx, f, ev));
  for (const f of filters) {
    node.connect(f);
    node = f;
  }
  const amp = ctx.createGain();
  applyEnvelope(amp.gain, ev, ev.gain ?? 0.5);
  node.connect(amp);
  let out = amp;
  if (ev.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, ev.pan));
    amp.connect(p);
    out = p;
  }
  out.connect(dest);

  if (ev.lfo) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = ev.lfo.rate || 5;
    const depth = ctx.createGain();
    depth.gain.value = ev.lfo.depth || 10;
    lfo.connect(depth);
    if (ev.lfo.target === 'gain') {
      const trem = ctx.createGain();
      trem.gain.value = 1;
      amp.disconnect();
      amp.connect(trem);
      trem.connect(ev.pan ? out : dest);
      depth.gain.value = Math.min(1, ev.lfo.depth || 0.5);
      depth.connect(trem.gain);
    } else if (ev.lfo.target === 'filter' && filters[0]) depth.connect(filters[0].frequency);
    else if (src.frequency) depth.connect(src.frequency);
    lfo.start(ev.t);
    lfo.stop(ev.t + ev.dur + 0.05);
  }
  const offset = ev.src === 'noise' ? (ev.t * 7.3) % 1.5 : 0;
  src.start(ev.t, offset);
  src.stop(ev.t + ev.dur + 0.05);
}

/** Render a spec into a normalized AudioBuffer. */
export async function renderSpec(spec) {
  const duration = Math.min(30, Math.max(0.1, spec.duration || 3));
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  for (const ev of expandEvents(spec)) {
    if (ev.t >= duration) continue;
    scheduleEvent(ctx, master, { ...ev, dur: Math.min(ev.dur || 0.2, duration - ev.t) });
  }
  const buf = await ctx.startRendering();
  normalize(buf, spec.gain ?? 0.8);
  return buf;
}

/** Peak-normalize, then cap loudness (RMS) so no sound is uncomfortably loud. */
export function normalize(buf, peakTarget = 0.8) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
      sum += v * v;
      n++;
    }
  }
  if (!peak) return buf;
  const rms = Math.sqrt(sum / n);
  const scale = Math.min(peakTarget / peak, rms ? 0.2 / rms : Infinity);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= scale;
  }
  return buf;
}

/** Copy of a buffer played backwards. */
export function reverseBuffer(ctx, buf) {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0, j = src.length - 1; i < src.length; i++, j--) dst[i] = src[j];
  }
  return out;
}

/** Decode an uploaded audio file (admin media) and normalize it. */
export async function loadAudioUrl(ctx, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load audio');
  const buf = await ctx.decodeAudioData(await res.arrayBuffer());
  return normalize(buf, 0.8);
}

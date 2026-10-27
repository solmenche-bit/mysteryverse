// Sound specs for the Mystery Box. Each object has a physical sound profile; these
// builders turn profiles into SoundSpec objects (format: public/js/audio/synth.js).
// Specs describe only oscillators and filtered noise, never what the object is.

export const SHAKE_PROFILES = ['jingle', 'tinkle', 'coins', 'marbles', 'rattle', 'clatter', 'clack', 'clunk', 'clang', 'roll', 'bounce',
  'hollow', 'thud', 'slosh', 'grains', 'rustle', 'crinkle', 'soft', 'squeak', 'bell', 'ratchet', 'scratch', 'beep'];
export const TILT_MOTIONS = ['rolls', 'slides', 'sloshes', 'tumbles', 'shifts', 'stays'];
export const LISTEN_TYPES = ['silence', 'tick', 'buzz', 'trickle', 'hum', 'fizz'];

// Relative loudness of each profile; becomes the spec's normalized peak so a sponge
// stays quiet and a bag of coins stays bright.
const LOUDNESS = {
  soft: 0.2, squeak: 0.45, rustle: 0.35, crinkle: 0.45, scratch: 0.45, hollow: 0.5, tinkle: 0.55, grains: 0.55, bounce: 0.6,
  roll: 0.6, slosh: 0.65, clatter: 0.6, rattle: 0.65, clack: 0.7, clunk: 0.7, marbles: 0.7, jingle: 0.75, coins: 0.75, bell: 0.75,
  ratchet: 0.75, beep: 0.65, thud: 0.8, clang: 0.8,
};

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

const r2 = (n) => Math.round(n * 10000) / 10000;
const between = (r, a, b) => a + r() * (b - a);
const osc = (t, dur, freq, o = {}) => ({ t: r2(t), dur: r2(dur), src: 'osc', wave: o.wave || 'sine', freq: r2(freq), ...o, ...(o.freqEnd ? { freqEnd: r2(o.freqEnd) } : {}) });
const noise = (t, dur, o = {}) => ({ t: r2(t), dur: r2(dur), src: 'noise', noise: o.noise || 'white', ...o });
const bp = (freq, q = 1, freqEnd) => ({ type: 'bandpass', freq: r2(freq), q, ...(freqEnd ? { freqEnd: r2(freqEnd) } : {}) });
const lp = (freq, q = 1, freqEnd) => ({ type: 'lowpass', freq: r2(freq), q, ...(freqEnd ? { freqEnd: r2(freqEnd) } : {}) });
const hp = (freq, q = 1) => ({ type: 'highpass', freq: r2(freq), q });

/** The cardboard crate itself being knocked about (same for every box). */
function knock(t, r, g = 1) {
  return [
    noise(t, 0.12, { filter: lp(between(r, 180, 260)), gain: 0.32 * g }),
    osc(t, 0.1, between(r, 85, 105), { freqEnd: 55, gain: 0.22 * g }),
  ];
}

// One impact of the contents against the box wall, per profile: (t, rng, index) => events
const IMPACT = {
  jingle(t, r) {
    const out = [noise(t, 0.03, { filter: hp(6000), gain: 0.1 })];
    const n = 4 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const tt = t + 0.004 + j * 0.013 + r() * 0.02;
      const f = between(r, 2600, 5400);
      const d = between(r, 0.18, 0.33);
      out.push(osc(tt, d, f, { gain: 0.17 }), osc(tt, d * 0.6, f * 2.41, { gain: 0.06 }));
    }
    return out;
  },
  tinkle(t, r) {
    const out = [];
    const n = 2 + Math.floor(r() * 2);
    for (let j = 0; j < n; j++) out.push(osc(t + j * 0.018 + r() * 0.01, between(r, 0.07, 0.12), between(r, 3200, 6000), { gain: 0.13 }));
    return out;
  },
  coins(t, r) {
    const out = [noise(t, 0.03, { filter: bp(5000, 2), gain: 0.14 })];
    const n = 2 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const tt = t + j * 0.025 + r() * 0.02;
      const f = between(r, 2200, 4500);
      const d = between(r, 0.35, 0.6);
      out.push(osc(tt, d, f, { gain: 0.15 }), osc(tt, d * 0.7, f * 1.47, { gain: 0.07 }));
    }
    return out;
  },
  marbles(t, r) {
    const out = [noise(t, 0.22, { filter: lp(900), gain: 0.06, lfo: { rate: 18, depth: 300, target: 'filter' } })];
    const n = 3 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const tt = t + j * 0.022 + r() * 0.015;
      out.push(osc(tt, between(r, 0.04, 0.06), between(r, 2600, 3800), { gain: 0.2 }), noise(tt, 0.02, { filter: bp(3500, 8), gain: 0.18 }));
    }
    return out;
  },
  rattle(t, r) {
    const out = [];
    const n = 4 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) out.push(noise(t + j * 0.017 + r() * 0.012, 0.025, { filter: bp(between(r, 2200, 3200), 5), gain: 0.26 }));
    return out;
  },
  clatter(t, r) {
    const out = [];
    const n = 5 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) {
      const tt = t + j * 0.015 + r() * 0.012;
      out.push(noise(tt, 0.03, { filter: bp(between(r, 1400, 2000), 3), gain: 0.2 }), osc(tt, 0.03, between(r, 700, 900), { wave: 'triangle', gain: 0.05 }));
    }
    return out;
  },
  clack(t, r) {
    const out = [];
    const n = 2 + Math.floor(r() * 2);
    for (let j = 0; j < n; j++) {
      const tt = t + j * 0.03 + r() * 0.015;
      out.push(noise(tt, 0.05, { filter: bp(between(r, 900, 1300), 4), gain: 0.34 }), osc(tt, 0.05, between(r, 500, 750), { wave: 'triangle', gain: 0.15 }));
    }
    return out;
  },
  clunk(t, r) {
    return [noise(t, 0.08, { filter: bp(600, 2), gain: 0.4 }), osc(t, 0.1, between(r, 220, 300), { freqEnd: 150, gain: 0.25 })];
  },
  clang(t, r) {
    const f = between(r, 600, 900);
    return [
      osc(t, 0.7, f, { gain: 0.17 }), osc(t, 0.45, f * 2.1, { gain: 0.07 }), osc(t, 0.3, f * 3.7, { gain: 0.04 }),
      noise(t, 0.05, { filter: bp(2500, 2), gain: 0.18 }), osc(t, 0.12, 120, { freqEnd: 70, gain: 0.2 }),
    ];
  },
  roll(t, r) {
    return [osc(t, 0.12, between(r, 100, 125), { freqEnd: 70, gain: 0.34 }), noise(t, 0.26, { filter: lp(400), gain: 0.14, env: 'swell' })];
  },
  bounce(t, r) {
    const f = between(r, 170, 200);
    return [
      osc(t, 0.09, f, { freqEnd: 110, gain: 0.4 }), noise(t, 0.06, { filter: lp(700), gain: 0.2 }),
      osc(t + 0.09, 0.07, f, { freqEnd: 120, gain: 0.16 }),
    ];
  },
  hollow(t, r) {
    return [
      osc(t, 0.03, between(r, 1100, 1300), { freqEnd: 900, gain: 0.3 }), noise(t, 0.02, { filter: bp(2500, 3), gain: 0.2 }),
      osc(t + 0.06, 0.025, 1100, { freqEnd: 900, gain: 0.14 }), osc(t + 0.1, 0.02, 1100, { freqEnd: 900, gain: 0.07 }),
    ];
  },
  thud(t, r) {
    return [osc(t, 0.18, between(r, 75, 90), { freqEnd: 45, gain: 0.5 }), noise(t, 0.12, { filter: lp(300), gain: 0.35 })];
  },
  slosh(t, r) {
    const f = between(r, 500, 900);
    return [
      noise(t, 0.32, { filter: bp(f, 1.5, f * 1.8), gain: 0.34, env: 'swell' }),
      osc(t + 0.05, 0.08, between(r, 260, 320), { freqEnd: 180, gain: 0.09 }),
      osc(t + 0.14, 0.07, between(r, 240, 300), { freqEnd: 170, gain: 0.07 }),
    ];
  },
  grains(t, r) {
    return [noise(t, 0.22, { filter: bp(between(r, 4500, 5500), 0.8), gain: 0.3, env: 'swell' }), noise(t + 0.02, 0.05, { filter: hp(3500), gain: 0.12 })];
  },
  rustle(t, r) {
    return [noise(t, 0.16, { filter: hp(between(r, 2400, 3200)), gain: 0.16, env: 'swell' })];
  },
  crinkle(t, r) {
    const out = [];
    const n = 6 + Math.floor(r() * 5);
    for (let j = 0; j < n; j++) out.push(noise(t + j * 0.011 + r() * 0.008, 0.012, { filter: bp(between(r, 3500, 4800), 2), gain: 0.2 }));
    return out;
  },
  soft(t, r) {
    return [noise(t, 0.1, { filter: lp(150), gain: 0.12 }), osc(t, 0.08, between(r, 65, 80), { gain: 0.08 })];
  },
  squeak(t, r, i) {
    const out = IMPACT.soft(t, r);
    if (i % 2 === 0) {
      out.push(osc(t + 0.03, 0.15, between(r, 900, 1000), { wave: 'triangle', freqEnd: 1500, gain: 0.17, env: 'swell' }));
      out.push(osc(t + 0.03, 0.15, 1900, { wave: 'sine', freqEnd: 2900, gain: 0.04, env: 'swell' }));
    }
    return out;
  },
  bell(t, r) {
    const f = between(r, 1800, 2200);
    return [
      osc(t, 0.7, f, { gain: 0.19 }), osc(t, 0.4, f * 2.76, { gain: 0.06 }),
      osc(t + 0.03, 0.05, between(r, 4000, 5000), { gain: 0.05 }), noise(t, 0.02, { filter: hp(5000), gain: 0.08 }),
    ];
  },
  ratchet(t, r) {
    const out = [noise(t, 0.05, { filter: bp(1000, 4), gain: 0.2 })];
    const n = 3 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) out.push(noise(t + 0.01 + j * 0.026, 0.015, { filter: bp(1600, 6), gain: 0.34 }));
    return out;
  },
  scratch(t, r) {
    return [noise(t, 0.08, { filter: bp(2500, 1), gain: 0.15 }), noise(t + 0.02, 0.04, { filter: bp(1100, 4), gain: 0.16 })];
  },
  beep(t, r, i) {
    const out = IMPACT.clunk(t, r);
    if (i === 2) out.push(osc(t + 0.08, 0.09, 1000, { wave: 'square', gain: 0.07 }), osc(t + 0.2, 0.09, 1300, { wave: 'square', gain: 0.07 }));
    return out;
  },
};

const SHAKE_TIMES = [0.06, 0.34, 0.62, 0.9, 1.18];

function loudness(objects) {
  return Math.max(0.15, ...objects.map((o) => LOUDNESS[o.shake] ?? 0.6));
}

/** Five back-and-forth shakes: the crate knocks and every object hits the walls. */
export function shakeSpec(objects, seed) {
  const r = mulberry32(seed);
  const events = [];
  for (const [i, t0] of SHAKE_TIMES.entries()) {
    const t = t0 + (r() - 0.5) * 0.04;
    events.push(...knock(t, r));
    for (const o of objects) events.push(...(IMPACT[o.shake] || IMPACT.thud)(t + 0.01 + r() * 0.02, r, i));
  }
  return { duration: 1.9, gain: loudness(objects), seed, events };
}

const MOTION_LAYER = {
  rolls: (r) => [noise(0.15, 1.15, { filter: lp(between(r, 320, 480)), gain: 0.18, env: 'swell', lfo: { rate: 9, depth: 120, target: 'filter' } })],
  slides: (r) => [noise(0.2, 0.7, { filter: bp(between(r, 800, 1100), 2), gain: 0.12, env: 'hold', attack: 0.08, release: 0.1 })],
  sloshes: (r) => [
    noise(0.15, 0.9, { filter: bp(600, 1.2, 1200), gain: 0.3, env: 'swell' }),
    noise(0.85, 0.6, { filter: bp(900, 1.2, 500), gain: 0.2, env: 'swell' }),
    osc(0.5, 0.08, 280, { freqEnd: 180, gain: 0.07 }),
  ],
  tumbles: () => [],
  shifts: () => [],
  stays: () => [],
};
const MOTION_HITS = { rolls: [1.32], slides: [0.92], sloshes: [], tumbles: [0.3, 0.62, 0.88], shifts: [0.6], stays: [] };

/** Tilting the crate: the contents roll, slide, slosh or tumble, then hit the low wall. */
export function tiltSpec(objects, seed) {
  const r = mulberry32(seed);
  const events = [osc(0.02, 0.35, 70, { freqEnd: 55, gain: 0.06, env: 'swell' })]; // the crate creaks as it leans
  for (const o of objects) {
    events.push(...(MOTION_LAYER[o.tilt] || MOTION_LAYER.slides)(r));
    for (const [i, t] of (MOTION_HITS[o.tilt] || []).entries()) {
      events.push(...knock(t, r, o.tilt === 'shifts' ? 0.4 : 0.8 - i * 0.15));
      events.push(...(IMPACT[o.shake] || IMPACT.thud)(t + 0.01, r, i));
    }
  }
  const all = objects.every((o) => o.tilt === 'stays');
  return { duration: 1.8, gain: all ? 0.08 : Math.min(0.7, loudness(objects)), seed, events };
}

/** Holding an ear to the crate. Most things are silent; some tick, buzz or trickle. */
export function listenSpec(objects, seed) {
  const r = mulberry32(seed);
  const events = [noise(0, 3, { noise: 'pink', filter: lp(500), gain: 0.03, env: 'hold', attack: 0.3, release: 0.4 })];
  const types = objects.map((o) => o.listen || 'silence');
  for (const type of types) {
    if (type === 'tick') {
      events.push(osc(0.2, 0.012, 2400, { wave: 'square', gain: 0.18, repeat: { count: 6, every: 0.5 } }));
      events.push(noise(0.45, 0.01, { filter: bp(3200, 6), gain: 0.14, repeat: { count: 5, every: 0.5 } }));
    } else if (type === 'buzz') {
      events.push(osc(0.4, 0.55, 155, { wave: 'sawtooth', gain: 0.16, env: 'hold', filter: lp(600), lfo: { rate: 30, depth: 0.6, target: 'gain' } }));
      events.push(osc(1.5, 0.55, 155, { wave: 'sawtooth', gain: 0.16, env: 'hold', filter: lp(600), lfo: { rate: 30, depth: 0.6, target: 'gain' } }));
    } else if (type === 'trickle') {
      events.push(noise(0.1, 2.8, { filter: bp(between(r, 5000, 6000), 1.5), gain: 0.08, env: 'hold', attack: 0.4, release: 0.4, lfo: { rate: 11, depth: 0.3, target: 'gain' } }));
    } else if (type === 'hum') {
      events.push(osc(0.1, 2.8, 120, { gain: 0.07, env: 'hold', attack: 0.3, release: 0.3 }), osc(0.1, 2.8, 240, { gain: 0.03, env: 'hold', attack: 0.3, release: 0.3 }));
    } else if (type === 'fizz') {
      events.push(noise(0.1, 0.006, { filter: hp(6000), gain: 0.12, repeat: { count: 60, every: 0.045, jitter: 0.02, gainJitter: 0.7 } }));
    }
  }
  const quiet = types.every((t) => t === 'silence');
  return { duration: 3, gain: quiet ? 0.04 : 0.35, seed, events };
}

export const TILT_TEXT = {
  rolls: 'Something rolls smoothly across the box and bumps the far wall.',
  slides: 'Something slides across the bottom and stops with a bump.',
  sloshes: 'You hear and feel a slosh, like liquid moving inside.',
  tumbles: 'Something tumbles over itself a few times.',
  shifts: 'Something soft barely shifts. You can hardly tell it moved.',
  stays: 'Nothing seems to move at all.',
};

export const LISTEN_TEXT = {
  silence: 'Silence. It does not make a sound on its own.',
  tick: 'A faint, steady tick... tick... tick...',
  buzz: 'BZZZ... BZZZ... something vibrates, then stops.',
  trickle: 'A soft, steady hiss, like something very fine falling.',
  hum: 'A low electrical hum.',
  fizz: 'Tiny crackly fizzing sounds.',
};

/** Plain-language description of a shake, for the clue log (and players with sound off). */
export const SHAKE_TEXT = {
  jingle: 'a bright metallic jingling', tinkle: 'light, tiny metallic tinkles', coins: 'ringing metal clinks', marbles: 'hard glassy clicks and rolling',
  rattle: 'a light plasticky rattle', clatter: 'a clatter of light little sticks', clack: 'hard wooden clacks', clunk: 'a hard, hollow clunk',
  clang: 'a deep metal clang', roll: 'a soft thump and a roll', bounce: 'springy, bouncy thumps', hollow: 'a very light, hollow "pok"',
  thud: 'heavy, solid thuds', slosh: 'a watery slosh', grains: 'a soft "shh-shh" like pouring sand', rustle: 'a papery rustle',
  crinkle: 'crispy, crackly crinkles', soft: 'almost nothing: a faint, soft bump', squeak: 'soft bumps and a little squeak', bell: 'a clear ringing',
  ratchet: 'fast, rattly clicking: click-click-click', scratch: 'a light, scratchy tumble', beep: 'clunks and an electronic beep',
};

export { SHAKE_TIMES };

// Synthesized sound library for Guess the Sound (and anything else that needs
// recognizable everyday sounds). Each recipe builds a SoundSpec in the format
// documented at the top of public/js/audio/synth.js. Specs only describe
// oscillators and filtered noise, never what the sound is, so the browser can
// render them without ever learning the answer.

// ---------------------------------------------------------------- helpers

export function mulberry32(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const osc = (t, dur, freq, o = {}) => ({ t, dur, src: 'osc', wave: 'sine', freq, ...o });
const noise = (t, dur, o = {}) => ({ t, dur, src: 'noise', noise: 'white', ...o });
const bp = (freq, q = 1, freqEnd) => ({ type: 'bandpass', freq, q, ...(freqEnd ? { freqEnd } : {}) });
const lp = (freq, q = 0.7, freqEnd) => ({ type: 'lowpass', freq, q, ...(freqEnd ? { freqEnd } : {}) });
const hp = (freq, q = 0.7, freqEnd) => ({ type: 'highpass', freq, q, ...(freqEnd ? { freqEnd } : {}) });
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const vary = (r, amount) => 1 + (r() - 0.5) * 2 * amount;

/** Nominal start times of an event's repeats (ignoring random jitter). */
export function repeatStarts(ev) {
  const rep = ev.repeat;
  if (!rep) return [ev.t || 0];
  const out = [];
  let t = ev.t || 0;
  let every = rep.every || 0.25;
  for (let i = 0; i < (rep.count || 1); i++) {
    out.push(t);
    t += every;
    every *= rep.accel || 1;
  }
  return out;
}

const round = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, round(x)])) : v);

/** Fit every event inside the spec duration, then round numbers to keep the payload small. */
function finalize(spec) {
  const duration = spec.duration;
  const events = [];
  for (const ev0 of spec.events) {
    const ev = { ...ev0 };
    if (ev.t >= duration - 0.02) continue;
    if (ev.repeat) {
      ev.repeat = { ...ev.repeat };
      while (ev.repeat.count > 1) {
        const starts = repeatStarts(ev);
        if (starts[starts.length - 1] + ev.dur <= duration) break;
        ev.repeat.count -= 1;
      }
      if (ev.repeat.count <= 1) delete ev.repeat;
    }
    if (!ev.repeat && ev.t + ev.dur > duration) ev.dur = duration - ev.t;
    if (ev.dur < 0.004) continue;
    events.push(ev);
  }
  return round({ ...spec, events });
}

// ---------------------------------------------------------------- recipes
// difficulty = how hard the sound is on its own; quick = recognizable from the first second.

const R = (meta, build) => ({ ...meta, build });

export const RECIPES = [
  R({ id: 'clock', name: 'Ticking clock', emoji: '🕰️', category: 'household', difficulty: 'easy',
    accepted: ['ticking clock', 'clock ticking', 'ticking', 'tick tock', 'tick-tock', 'wall clock', 'grandfather clock', 'watch ticking', 'watch'],
    hints: ['You can hear this in a very quiet classroom.', 'It never stops and keeps a perfectly steady beat.', 'Tick... tock... tick... tock...'],
    explanation: 'A clock\'s gears make two slightly different clicks: tick and tock.' },
  (r) => {
    const k = vary(r, 0.06);
    return { duration: 6.3, events: [
      noise(0.15, 0.035, { filter: bp(3400 * k, 9), gain: 0.8, repeat: { count: 6, every: 1 } }),
      osc(0.15, 0.03, 5200 * k, { gain: 0.1, repeat: { count: 6, every: 1 } }),
      noise(0.65, 0.035, { filter: bp(2300 * k, 9), gain: 0.65, repeat: { count: 6, every: 1 } }),
      osc(0.65, 0.03, 3900 * k, { gain: 0.08, repeat: { count: 6, every: 1 } }),
    ] };
  }),

  R({ id: 'doorbell', name: 'Doorbell', emoji: '🔔', category: 'household', difficulty: 'easy', quick: true,
    accepted: ['door bell', 'ding dong', 'doorbell ringing', 'someone at the door', 'door chime', 'chime'],
    hints: ['It means someone has arrived.', 'You hear it at the front of a house.', 'Ding... dong!'],
    explanation: 'Two chimes, high then low: the classic ding-dong of a doorbell.' },
  (r) => {
    const f1 = 659 * vary(r, 0.04);
    const f2 = f1 * 0.794;
    const tone = (t, f, d) => [osc(t, d, f, { gain: 0.6 }), osc(t, d * 0.55, f * 2, { gain: 0.12 }), osc(t, d, f, { wave: 'triangle', gain: 0.15 })];
    return { duration: 5.9, events: [...tone(0.2, f1, 1.8), ...tone(0.85, f2, 2.2), ...tone(3.0, f1, 1.8), ...tone(3.65, f2, 2.2)] };
  }),

  R({ id: 'phone', name: 'Telephone ringing', emoji: '☎️', category: 'household', difficulty: 'easy', quick: true,
    accepted: ['phone', 'phone ringing', 'telephone', 'ringing phone', 'someone calling', 'phone call', 'ringing', 'home phone'],
    hints: ['Somebody wants to talk to you.', 'You would run to pick it up.', 'Ring... ring...'],
    explanation: 'Two close tones switched on and off very fast make the classic telephone ring.' },
  () => {
    const ev = [];
    for (const t of [0.2, 2.6]) {
      for (const f of [440, 480]) ev.push(osc(t, 1.7, f, { env: 'hold', attack: 0.02, gain: 0.35, lfo: { rate: 20, depth: 0.9, target: 'gain' } }));
      for (const f of [1250, 1500]) ev.push(osc(t, 1.7, f, { wave: 'triangle', env: 'hold', gain: 0.07, lfo: { rate: 20, depth: 0.9, target: 'gain' } }));
    }
    return { duration: 4.6, events: ev };
  }),

  R({ id: 'siren', name: 'Ambulance siren', emoji: '🚑', category: 'vehicle', difficulty: 'easy', quick: true,
    accepted: ['siren', 'ambulance', 'police car', 'police siren', 'fire truck', 'fire engine', 'ambulance siren', 'emergency vehicle', 'emergency siren', 'police'],
    hints: ['When you hear it, cars pull over to the side.', 'It rises and falls, again and again.', 'It is on top of an emergency vehicle.'],
    explanation: 'A siren slowly sweeps its pitch up and down so everyone notices it.' },
  () => ({ duration: 5.6, events: [
    osc(0.1, 5.3, 900, { wave: 'square', env: 'hold', attack: 0.25, release: 0.4, gain: 0.25, filter: lp(2400), lfo: { rate: 0.55, depth: 330, target: 'freq' } }),
    osc(0.1, 5.3, 900, { env: 'hold', attack: 0.25, release: 0.4, gain: 0.25, lfo: { rate: 0.55, depth: 330, target: 'freq' } }),
  ] })),

  R({ id: 'carhorn', name: 'Car horn', emoji: '🚗', category: 'vehicle', difficulty: 'easy', quick: true,
    accepted: ['horn', 'car honking', 'honking', 'honk', 'beep beep', 'horn honking', 'truck horn', 'honking horn'],
    hints: ['You hear it in traffic.', 'A driver uses it to say "Watch out!"', 'Beep beep!'],
    explanation: 'Two buzzy tones played together make a car horn.' },
  () => {
    const honk = (t, d) => [405, 510].map((f) => osc(t, d, f, { wave: 'square', env: 'hold', attack: 0.01, release: 0.03, gain: 0.3, filter: lp(1800) }));
    return { duration: 2.6, events: [...honk(0.2, 0.22), ...honk(0.55, 0.22), ...honk(1.2, 1.0)] };
  }),

  R({ id: 'heartbeat', name: 'Heartbeat', emoji: '💓', category: 'body', difficulty: 'medium',
    accepted: ['heart', 'heart beating', 'heart beat', 'pulse', 'beating heart', 'heartbeats', 'stethoscope'],
    hints: ['A doctor listens to this.', 'It goes faster when you run.', 'Lub-dub, lub-dub...'],
    explanation: 'Two thumps close together - "lub-dub" - are the sound of a beating heart.' },
  (r) => {
    const beat = 60 / (68 + r() * 10);
    const rep = { count: 6, every: beat };
    return { duration: 5.6, events: [
      osc(0.2, 0.16, 110, { freqEnd: 50, gain: 0.9, repeat: rep }),
      noise(0.2, 0.08, { noise: 'brown', filter: lp(300), gain: 0.5, repeat: rep }),
      osc(0.44, 0.13, 95, { freqEnd: 45, gain: 0.65, repeat: rep }),
      noise(0.44, 0.06, { noise: 'brown', filter: lp(280), gain: 0.35, repeat: rep }),
    ] };
  }),

  R({ id: 'rain', name: 'Rain on a window', emoji: '🌧️', category: 'weather', difficulty: 'medium', quick: true,
    accepted: ['rain on a window', 'raining', 'rainfall', 'rain drops', 'raindrops', 'rain storm', 'rainy day', 'rain falling'],
    hints: ['It is weather you can hear.', 'Better have an umbrella.', 'Drops tapping on the glass.'],
    explanation: 'Thousands of tiny filtered taps on top of a soft hiss sound like rain.' },
  () => ({ duration: 6.2, events: [
    noise(0, 6.2, { noise: 'pink', env: 'hold', attack: 0.5, release: 0.5, filter: bp(2500, 0.5), gain: 0.25 }),
    noise(0.05, 0.025, { filter: bp(3500, 5), gain: 0.5, repeat: { count: 110, every: 0.053, jitter: 0.03, gainJitter: 0.8, freqJitter: 0.45 } }),
    noise(0.1, 0.06, { filter: bp(1200, 3), gain: 0.35, repeat: { count: 35, every: 0.165, jitter: 0.08, gainJitter: 0.8, freqJitter: 0.3 } }),
  ] })),

  R({ id: 'waves', name: 'Ocean waves', emoji: '🌊', category: 'nature', difficulty: 'medium',
    accepted: ['ocean waves', 'ocean', 'sea', 'waves crashing', 'surf', 'sea waves', 'beach waves', 'the sea'],
    hints: ['You might hear this on vacation.', 'It rushes in... and slides back out.', 'Surf\'s up!'],
    explanation: 'Slow swells of noise that brighten as they "crash" sound like waves on a beach.' },
  () => ({ duration: 8, events: [
    noise(0, 4, { noise: 'pink', env: 'swell', filter: lp(500, 0.7, 2200), gain: 0.8 }),
    noise(1.8, 2.6, { env: 'swell', filter: hp(2500), gain: 0.18 }),
    noise(3.6, 4, { noise: 'pink', env: 'swell', filter: lp(450, 0.7, 2000), gain: 0.8 }),
    noise(5.4, 2.5, { env: 'swell', filter: hp(2500), gain: 0.18 }),
    noise(0, 8, { noise: 'brown', env: 'hold', attack: 0.8, release: 0.8, filter: lp(300), gain: 0.3 }),
  ] })),

  R({ id: 'thunder', name: 'Thunder', emoji: '⛈️', category: 'weather', difficulty: 'medium',
    accepted: ['thunder', 'thunder storm', 'storm', 'rumbling', 'thunder rumbling', 'thunderclap', 'lightning'],
    hints: ['It is weather you can hear.', 'It follows a flash in the sky.', 'Count the seconds after the lightning!'],
    explanation: 'A sharp crack followed by a long low rumble is thunder.' },
  () => ({ duration: 5.2, events: [
    noise(0.3, 0.5, { filter: lp(4000, 0.7, 600), gain: 0.55 }),
    noise(0.35, 4.2, { noise: 'brown', attack: 0.15, filter: lp(380), gain: 1, lfo: { rate: 2.5, depth: 0.5, target: 'gain' } }),
    noise(1.2, 3.2, { noise: 'brown', env: 'swell', filter: lp(220), gain: 0.7 }),
  ] })),

  R({ id: 'wind', name: 'Howling wind', emoji: '🌬️', category: 'weather', difficulty: 'hard',
    accepted: ['wind', 'windy', 'howling wind', 'wind blowing', 'breeze', 'gust', 'windstorm', 'strong wind'],
    hints: ['You cannot see it, but you can hear it.', 'It whistles around the corners of a house.', 'It moves the trees and flies kites.'],
    explanation: 'Noise through a slowly moving filter rises and falls like a gusting wind.' },
  () => ({ duration: 7, events: [
    noise(0, 6.9, { noise: 'pink', env: 'swell', filter: bp(500, 2.5), gain: 0.8, lfo: { rate: 0.35, depth: 350, target: 'filter' } }),
    noise(0.8, 5.5, { env: 'swell', filter: bp(1100, 12), gain: 0.35, lfo: { rate: 0.6, depth: 450, target: 'filter' } }),
  ] })),

  R({ id: 'typing', name: 'Keyboard typing', emoji: '⌨️', category: 'office', difficulty: 'medium', quick: true,
    accepted: ['typing', 'computer keyboard', 'someone typing', 'keyboard typing', 'keyboard', 'typing on a keyboard', 'computer typing', 'clicking keys'],
    hints: ['You hear it in an office.', 'Lots of small clicks with fingers.', 'Someone is writing an email.'],
    explanation: 'Quick uneven clicks with an occasional bigger "thock" (the space bar) are keyboard typing.' },
  () => ({ duration: 5, events: [
    noise(0.1, 0.03, { filter: bp(2600, 1.2), gain: 0.55, repeat: { count: 38, every: 0.12, jitter: 0.045, gainJitter: 0.5, freqJitter: 0.35 } }),
    noise(0.1, 0.045, { filter: lp(900), gain: 0.35, repeat: { count: 38, every: 0.12, jitter: 0.045, gainJitter: 0.5 } }),
    noise(1.3, 0.07, { filter: bp(1400, 1), gain: 0.6, repeat: { count: 3, every: 1.4 } }),
  ] })),

  R({ id: 'bouncingball', name: 'Bouncing ball', emoji: '⚾', category: 'sports', difficulty: 'easy',
    accepted: ['bouncing ball', 'ball bouncing', 'ball', 'bouncing', 'rubber ball', 'dropping a ball', 'ball dropping'],
    hints: ['Gravity is at work.', 'Each bump comes a little sooner than the last.', 'Boing... boing.. boing.boing'],
    explanation: 'Each bounce is lower than the one before, so the thumps get quieter and closer together.' },
  () => {
    const rep = { count: 13, every: 0.62, accel: 0.8, decay: 0.86 };
    return { duration: 3.9, events: [
      osc(0.2, 0.14, 160, { freqEnd: 70, gain: 0.9, repeat: rep }),
      noise(0.2, 0.05, { filter: bp(900, 1.5), gain: 0.45, repeat: rep }),
    ] };
  }),

  R({ id: 'dribble', name: 'Basketball dribble', emoji: '🏀', category: 'sports', difficulty: 'medium',
    accepted: ['basketball', 'dribbling', 'dribbling a basketball', 'basketball bouncing', 'basketball game', 'dribble', 'basketball dribbling'],
    hints: ['You hear it in a gym.', 'Squeaky sneakers are part of it.', 'Bounce, bounce, bounce... shoot!'],
    explanation: 'Steady bounces on a hard floor and a squeaky sneaker: someone dribbling a basketball.' },
  () => ({ duration: 4.8, events: [
    osc(0.2, 0.11, 170, { freqEnd: 80, gain: 0.9, repeat: { count: 10, every: 0.46, jitter: 0.015 } }),
    noise(0.2, 0.07, { filter: bp(700, 1.5), gain: 0.55, repeat: { count: 10, every: 0.46, jitter: 0.015 } }),
    osc(1.25, 0.12, 2300, { freqEnd: 2900, env: 'hold', gain: 0.1 }),
    osc(3.1, 0.1, 2500, { freqEnd: 3100, env: 'hold', gain: 0.09 }),
  ] })),

  R({ id: 'coins', name: 'Coins dropping', emoji: '🪙', category: 'household', difficulty: 'medium', quick: true,
    accepted: ['coins', 'coins dropping', 'dropping coins', 'money', 'change', 'coins falling', 'piggy bank', 'loose change', 'coin', 'falling coins', 'coins jingling', 'tzedakah box'],
    hints: ['It is metal.', 'It might go into a tzedakah box.', 'Small, round and shiny... clink, clink!'],
    explanation: 'High metallic pings that bounce and spin to a stop are coins hitting a hard surface.' },
  () => {
    const rep = { count: 16, every: 0.15, accel: 0.88, jitter: 0.02, freqJitter: 0.25, decay: 0.95 };
    return { duration: 3.2, events: [
      osc(0.2, 0.5, 4200, { gain: 0.35, repeat: rep }),
      osc(0.2, 0.35, 6100, { gain: 0.15, repeat: rep }),
      noise(0.2, 0.02, { filter: hp(4000), gain: 0.3, repeat: { count: 16, every: 0.15, accel: 0.88, jitter: 0.02 } }),
      osc(1.6, 1.4, 3800, { gain: 0.2, attack: 0.05, lfo: { rate: 14, depth: 0.8, target: 'gain' } }),
    ] };
  }),

  R({ id: 'microwave', name: 'Microwave beeping', emoji: '🍿', category: 'kitchen', difficulty: 'medium',
    accepted: ['microwave', 'microwave beeping', 'microwave beep', 'microwave beeps', 'microwave oven', 'microwave finished'],
    hints: ['It is in the kitchen.', 'A low hum, then it tells you it is done.', 'Your leftovers are warm now.'],
    explanation: 'A humming motor followed by three beeps: the microwave is done.' },
  () => ({ duration: 4.8, events: [
    osc(0.1, 2.6, 120, { wave: 'sawtooth', env: 'hold', attack: 0.1, filter: lp(350), gain: 0.35 }),
    noise(0.1, 2.6, { noise: 'pink', env: 'hold', filter: bp(900, 1), gain: 0.08 }),
    osc(3.0, 0.32, 1950, { wave: 'square', env: 'hold', filter: lp(4500), gain: 0.25, repeat: { count: 3, every: 0.6 } }),
  ] })),

  R({ id: 'alarm', name: 'Alarm clock', emoji: '⏰', category: 'household', difficulty: 'easy', quick: true,
    accepted: ['alarm', 'digital alarm', 'wake up alarm', 'alarm going off', 'beeping alarm', 'alarm clock beeping', 'alarm clock'],
    hints: ['Nobody likes hearing this early in the morning.', 'It sits next to your bed.', 'Time to wake up!'],
    explanation: 'Groups of four quick high beeps are a digital alarm clock.' },
  () => ({ duration: 5.2, events: [0, 1, 2, 3, 4].map((g) => osc(0.15 + g, 0.075, 2600, { wave: 'square', env: 'hold', filter: lp(6000), gain: 0.3, repeat: { count: 4, every: 0.13 } })) })),

  R({ id: 'footsteps', name: 'Footsteps', emoji: '👣', category: 'people', difficulty: 'medium',
    accepted: ['footsteps', 'walking', 'someone walking', 'steps', 'feet', 'people walking', 'foot steps', 'walking on a floor', 'person walking'],
    hints: ['Somebody is coming.', 'Left, right, left, right...', 'It is the sound of shoes on a floor.'],
    explanation: 'Alternating thumps from the left and right are someone walking.' },
  (r) => {
    const step = 0.52 + r() * 0.08;
    const rep = { count: 5, every: step * 2, jitter: 0.02 };
    return { duration: 6.3, events: [
      osc(0.2, 0.11, 120, { freqEnd: 60, gain: 0.8, pan: -0.25, repeat: rep }),
      noise(0.2, 0.06, { filter: bp(1400, 1.5), gain: 0.4, pan: -0.25, repeat: rep }),
      osc(0.2 + step, 0.11, 115, { freqEnd: 58, gain: 0.75, pan: 0.25, repeat: rep }),
      noise(0.2 + step, 0.06, { filter: bp(1300, 1.5), gain: 0.38, pan: 0.25, repeat: rep }),
    ] };
  }),

  R({ id: 'dripping', name: 'Dripping water', emoji: '💧', category: 'household', difficulty: 'medium',
    accepted: ['water dripping', 'dripping', 'drip', 'dripping water', 'leaky faucet', 'leaking faucet', 'faucet dripping', 'drops of water', 'water drops', 'dripping tap', 'leak'],
    hints: ['It might keep you up at night.', 'Somebody did not close the tap all the way.', 'Plip... plop... plip...'],
    explanation: 'A short tone that quickly rises in pitch is a water drop landing in water.' },
  () => {
    const rep = { count: 6, every: 0.95, jitter: 0.12, freqJitter: 0.18 };
    return { duration: 6, events: [
      osc(0.3, 0.09, 700, { freqEnd: 1600, attack: 0.002, gain: 0.6, repeat: rep }),
      osc(0.34, 0.12, 900, { freqEnd: 1900, gain: 0.18, repeat: rep }),
      noise(0.3, 0.02, { filter: bp(3000, 3), gain: 0.15, repeat: { count: 6, every: 0.95, jitter: 0.12 } }),
    ] };
  }),

  R({ id: 'train', name: 'Steam train', emoji: '🚂', category: 'vehicle', difficulty: 'medium', quick: true,
    accepted: ['train', 'steam train', 'train whistle', 'choo choo', 'locomotive', 'train horn', 'steam engine', 'railroad', 'train passing', 'choo choo train'],
    hints: ['It runs on tracks.', 'Chugga-chugga...', 'Choo choo!'],
    explanation: 'Rhythmic chugging plus a three-note steam whistle: a train.' },
  () => ({ duration: 5.7, events: [
    noise(0.1, 0.2, { filter: bp(380, 1.2), gain: 0.75, repeat: { count: 14, every: 0.27 } }),
    noise(0.235, 0.12, { filter: bp(900, 1.5), gain: 0.35, repeat: { count: 14, every: 0.27 } }),
    noise(0.1, 0.03, { filter: hp(2500), gain: 0.35, repeat: { count: 7, every: 0.54 } }),
    ...[440, 554, 659].map((f) => osc(3.9, 1.6, f, { wave: 'sawtooth', env: 'hold', attack: 0.12, release: 0.3, filter: lp(1600), gain: 0.18, lfo: { rate: 5, depth: 4, target: 'freq' } })),
    noise(3.9, 1.6, { env: 'hold', attack: 0.12, release: 0.3, filter: bp(1500, 2), gain: 0.06 }),
  ] })),

  R({ id: 'zipper', name: 'Zipper', emoji: '🧥', category: 'household', difficulty: 'hard', quick: true,
    accepted: ['zip', 'zipping', 'unzipping', 'zipping a jacket', 'opening a zipper', 'zipping a bag', 'zipper on a bag', 'zippers', 'closing a zipper', 'jacket zipper', 'coat'],
    hints: ['You hear it when someone gets ready to go outside.', 'Lots of tiny teeth, one after another.', 'It is on jackets, bags and backpacks.'],
    explanation: 'Dozens of tiny clicks in a fast sweep are the teeth of a zipper.' },
  () => ({ duration: 2.8, events: [
    noise(0.3, 0.012, { filter: bp(3200, 2.5), gain: 0.55, repeat: { count: 55, every: 0.011, jitter: 0.002, gainJitter: 0.5, freqJitter: 0.25 } }),
    noise(0.3, 0.6, { env: 'swell', filter: bp(2000, 1, 4500), gain: 0.2 }),
    noise(1.7, 0.01, { filter: bp(3600, 2.5), gain: 0.55, repeat: { count: 70, every: 0.009, jitter: 0.002, gainJitter: 0.5, freqJitter: 0.25 } }),
    noise(1.7, 0.63, { env: 'swell', filter: bp(4200, 1, 2200), gain: 0.2 }),
  ] })),

  R({ id: 'camera', name: 'Camera shutter', emoji: '📷', category: 'device', difficulty: 'hard', quick: true,
    accepted: ['camera', 'camera shutter', 'taking a picture', 'taking a photo', 'shutter', 'camera click', 'photo', 'picture being taken', 'snapshot', 'taking pictures'],
    hints: ['Say cheese!', 'Click... whirr.', 'It captures a moment.'],
    explanation: 'Two quick mechanical clicks and a short whirr: a camera taking a picture.' },
  () => {
    const shot = (t) => [noise(t, 0.025, { filter: bp(4200, 1), gain: 0.9 }), noise(t + 0.07, 0.03, { filter: bp(2600, 1.2), gain: 0.8 }), osc(t, 0.02, 1800, { gain: 0.15 }),
      osc(t + 0.2, 0.42, 320, { freqEnd: 620, wave: 'sawtooth', env: 'hold', filter: lp(2200), gain: 0.18 })];
    return { duration: 2.8, events: [...shot(0.3), ...shot(1.9)] };
  }),

  R({ id: 'helicopter', name: 'Helicopter', emoji: '🚁', category: 'vehicle', difficulty: 'medium', quick: true,
    accepted: ['helicopter', 'chopper', 'helicopter flying', 'helicopter blades', 'propeller', 'helicopter overhead'],
    hints: ['It flies.', 'It can hover in one spot.', 'Whup-whup-whup-whup...'],
    explanation: 'Fast, steady thumps from the spinning blades: a helicopter getting closer.' },
  () => ({ duration: 5.1, events: [
    noise(0.05, 0.1, { filter: lp(520), gain: 0.9, repeat: { count: 46, every: 0.105, decay: 1.006 } }),
    noise(0.05, 0.07, { filter: bp(1200, 1), gain: 0.2, repeat: { count: 46, every: 0.105, decay: 1.006 } }),
    osc(0, 5, 95, { wave: 'sawtooth', env: 'hold', attack: 0.8, filter: lp(500), gain: 0.22 }),
    osc(0, 5, 2300, { env: 'hold', attack: 1, gain: 0.03 }),
  ] })),

  R({ id: 'crickets', name: 'Crickets', emoji: '🦗', category: 'animal', difficulty: 'medium', quick: true,
    accepted: ['crickets', 'cricket', 'crickets chirping', 'chirping crickets', 'insects', 'bugs', 'grasshopper', 'grasshoppers', 'insects chirping'],
    hints: ['You hear this outside on a summer night.', 'Tiny creatures make it with their wings.', 'Chirp... chirp... chirp...'],
    explanation: 'High buzzy chirps repeating in the dark: crickets.' },
  () => {
    const trill = (rate) => ({ rate, depth: 1, target: 'gain' });
    return { duration: 6.4, events: [
      osc(0.1, 0.22, 4400, { env: 'hold', attack: 0.01, release: 0.04, gain: 0.3, lfo: trill(32), pan: -0.3, repeat: { count: 10, every: 0.6, jitter: 0.04 } }),
      osc(0.38, 0.18, 4900, { env: 'hold', attack: 0.01, release: 0.04, gain: 0.2, lfo: trill(28), pan: 0.4, repeat: { count: 10, every: 0.62, jitter: 0.05 } }),
      osc(0.2, 0.3, 3900, { env: 'hold', attack: 0.01, release: 0.04, gain: 0.12, lfo: trill(35), repeat: { count: 7, every: 0.85 } }),
    ] };
  }),

  R({ id: 'owl', name: 'Owl hooting', emoji: '🦉', category: 'animal', difficulty: 'medium',
    accepted: ['owl', 'owl hooting', 'hooting', 'hoot', 'owls', 'hoot owl', 'owl at night'],
    hints: ['It is a bird.', 'It is awake when you are asleep.', 'Who... who-who... who?'],
    explanation: 'Soft, low "hoo... hoo-hoo... hoooo" calls: an owl.' },
  (r) => {
    const f = 390 + r() * 30;
    const hoo = (t, d, k = 1) => [
      osc(t, d, f * k, { freqEnd: f * k * 0.9, env: 'hold', attack: 0.07, release: 0.12, gain: 0.6 }),
      osc(t, d, f * k * 2, { freqEnd: f * k * 1.8, env: 'hold', attack: 0.07, release: 0.12, gain: 0.06 }),
      noise(t, d, { filter: bp(f * k, 6), env: 'hold', attack: 0.07, release: 0.12, gain: 0.08 }),
    ];
    const call = (t) => [...hoo(t, 0.45), ...hoo(t + 0.85, 0.22, 1.05), ...hoo(t + 1.15, 0.22, 1.05), ...hoo(t + 1.55, 0.7)];
    return { duration: 6.4, events: [...call(0.3), ...call(3.6)] };
  }),

  R({ id: 'birds', name: 'Birds chirping', emoji: '🐦', category: 'animal', difficulty: 'medium', quick: true,
    accepted: ['birds', 'birds chirping', 'bird', 'chirping', 'birds singing', 'tweeting', 'songbirds', 'bird song', 'birdsong', 'chirping birds', 'tweet tweet'],
    hints: ['You might hear this early in the morning.', 'They sit in the trees.', 'Tweet tweet!'],
    explanation: 'Quick whistling sweeps up and down, scattered around: birds singing.' },
  (r) => {
    const ev = [];
    let t = 0.1;
    while (t < 5.4) {
      const base = 2800 + r() * 1800;
      const pan = (r() - 0.5) * 1.2;
      if (r() < 0.5) ev.push(osc(t, 0.07, base, { freqEnd: base * 1.5, gain: 0.4, pan, repeat: { count: 3 + Math.floor(r() * 4), every: 0.09, freqJitter: 0.08 } }));
      else ev.push(osc(t, 0.12, base * 1.4, { freqEnd: base * 0.9, gain: 0.35, pan, repeat: { count: 2 + Math.floor(r() * 3), every: 0.16 } }));
      t += 0.35 + r() * 0.6;
    }
    return { duration: 6.3, events: ev };
  }),

  R({ id: 'popcorn', name: 'Popcorn popping', emoji: '🍿', category: 'kitchen', difficulty: 'medium',
    accepted: ['popcorn', 'popcorn popping', 'popping corn', 'making popcorn', 'popping', 'microwave popcorn', 'corn popping'],
    hints: ['It is a snack.', 'It starts slow, gets really busy, then slows down again.', 'Pop! Pop-pop-pop!'],
    explanation: 'Random pops that speed up and then slow down: popcorn in a pot.' },
  () => {
    const pop = (t, count, every, jitter) => [
      noise(t, 0.03, { filter: bp(1600, 1.5), gain: 0.75, repeat: { count, every, jitter, gainJitter: 0.6, freqJitter: 0.45 } }),
      osc(t, 0.04, 380, { freqEnd: 160, gain: 0.25, repeat: { count, every, jitter, gainJitter: 0.6 } }),
    ];
    return { duration: 6, events: [noise(0, 6, { env: 'hold', attack: 0.5, filter: hp(3500), gain: 0.05 }), ...pop(0.4, 5, 0.35, 0.15), ...pop(2.2, 22, 0.075, 0.035), ...pop(4.0, 6, 0.28, 0.12)] };
  }),

  R({ id: 'kettle', name: 'Whistling kettle', emoji: '🫖', category: 'kitchen', difficulty: 'medium',
    accepted: ['kettle', 'tea kettle', 'kettle whistle', 'whistling kettle', 'boiling water', 'kettle boiling', 'teapot', 'kettle whistling', 'water boiling'],
    hints: ['It is in the kitchen.', 'A rumble that turns into a high whistle.', 'Time for tea!'],
    explanation: 'Boiling rumble, then a steady high whistle: the water in the kettle is ready.' },
  () => ({ duration: 5, events: [
    noise(0, 2.4, { noise: 'brown', env: 'swell', filter: lp(500), gain: 0.5 }),
    noise(0.4, 2.0, { env: 'swell', filter: bp(1200, 3), gain: 0.08 }),
    osc(1.6, 3.2, 1750, { freqEnd: 2150, env: 'hold', attack: 0.9, release: 0.3, gain: 0.3, lfo: { rate: 6, depth: 18, target: 'freq' } }),
    noise(1.6, 3.2, { env: 'hold', attack: 0.9, release: 0.3, filter: bp(1950, 18), gain: 0.18 }),
  ] })),

  R({ id: 'knock', name: 'Knocking on a door', emoji: '🚪', category: 'household', difficulty: 'easy', quick: true,
    accepted: ['knocking', 'knocking on a door', 'knock', 'door knock', 'someone knocking', 'knock knock', 'knocking on the door', 'knocking on wood', 'door'],
    hints: ['Someone wants to come in.', 'Who\'s there?', 'Knuckles on wood.'],
    explanation: 'Three firm wooden thuds, twice: someone knocking on a door.' },
  () => {
    const knock = (t) => [osc(t, 0.1, 170, { freqEnd: 95, gain: 0.9 }), noise(t, 0.06, { filter: bp(750, 2.5), gain: 0.65 }), noise(t, 0.015, { filter: hp(3000), gain: 0.15 })];
    return { duration: 3.4, events: [0.3, 0.55, 0.8, 2.3, 2.55, 2.8].flatMap(knock) };
  }),

  R({ id: 'piano', name: 'Piano scale', emoji: '🎹', category: 'music', difficulty: 'easy', quick: true,
    accepted: ['piano', 'piano scale', 'scale', 'musical scale', 'playing piano', 'piano notes', 'do re mi', 'someone playing piano', 'piano music', 'scales'],
    hints: ['It is a musical instrument.', 'It goes up step by step.', 'Do, re, mi, fa, sol...'],
    explanation: 'Eight notes going up one step at a time: a major scale on the piano.' },
  () => ({ duration: 4.1, events: [60, 62, 64, 65, 67, 69, 71, 72].flatMap((m, i) => {
    const t = 0.2 + i * 0.36;
    return [osc(t, 1.1, mtof(m), { wave: 'triangle', gain: 0.5 }), osc(t, 0.7, mtof(m) * 2, { gain: 0.12 }), osc(t, 0.4, mtof(m) * 3, { gain: 0.05 }), noise(t, 0.02, { filter: bp(2000, 1), gain: 0.06 })];
  }) })),

  R({ id: 'drumroll', name: 'Drum roll', emoji: '🥁', category: 'music', difficulty: 'medium', quick: true,
    accepted: ['drum roll', 'drumroll', 'drums', 'drum', 'snare drum', 'snare', 'drumming', 'cymbal crash', 'drum roll and cymbal'],
    hints: ['You hear it right before a big announcement.', 'It gets louder and louder...', 'Ba-da-da-da-da... CRASH!'],
    explanation: 'Very fast snare hits that grow louder, then a cymbal crash: a drum roll.' },
  () => ({ duration: 4.6, events: [
    noise(0.1, 0.07, { filter: bp(2100, 0.9), gain: 0.25, repeat: { count: 42, every: 0.052, decay: 1.035, gainJitter: 0.2 } }),
    osc(0.1, 0.06, 220, { freqEnd: 170, gain: 0.08, repeat: { count: 42, every: 0.052, decay: 1.035 } }),
    noise(2.35, 2.2, { filter: hp(3500), gain: 0.6 }),
    osc(2.35, 0.4, 120, { freqEnd: 50, gain: 0.9 }),
  ] })),

  R({ id: 'shofar', name: 'Shofar blowing', emoji: '📯', category: 'jewish', difficulty: 'medium', tags: ['jewish'],
    accepted: ['shofar', 'rams horn', 'ram\'s horn', 'shofar blowing', 'blowing the shofar', 'tekiah', 'tekia', 'shofar blast', 'shevarim', 'rosh hashana', 'rosh hashanah'],
    hints: ['It is an instrument made by nature, not in a factory.', 'You hear it in shul once a year (and every day in Elul).', 'Tekiah... shevarim...'],
    explanation: 'One long blast (tekiah) and three broken ones (shevarim): the shofar.' },
  (r) => {
    const f = 230 + r() * 20;
    const blast = (t, d) => [
      osc(t, d, f * 0.85, { wave: 'sawtooth', env: 'hold', attack: 0.1, release: 0.12, gain: 0.45, bend: [[0.12, f], [0.85, f * 1.02], [1, f * 1.18]], filter: lp(1500, 2.5), lfo: { rate: 5.5, depth: 3, target: 'freq' } }),
      noise(t, d, { env: 'hold', attack: 0.1, release: 0.12, filter: bp(f * 3, 3), gain: 0.05 }),
    ];
    return { duration: 5.6, events: [...blast(0.3, 2.6), ...blast(3.4, 0.55), ...blast(4.1, 0.55), ...blast(4.8, 0.55)] };
  }),

  R({ id: 'gragger', name: 'Gragger', emoji: '📢', category: 'jewish', difficulty: 'hard', quick: true, tags: ['jewish'],
    accepted: ['gragger', 'grogger', 'groger', 'gregger', 'grager', 'noisemaker', 'ratchet', 'purim noisemaker', 'purim gragger', 'purim', 'rattle', 'graggers'],
    hints: ['It is a toy made to be LOUD.', 'You spin it by the handle.', 'It drowns out a certain name once a year.'],
    explanation: 'A wooden ratchet clicking around and around: a Purim gragger.' },
  () => {
    const spin = (t, count, every) => [
      noise(t, 0.016, { filter: bp(1900, 3.5), gain: 0.6, repeat: { count, every, jitter: 0.003, gainJitter: 0.35 } }),
      osc(t, 0.02, 950, { wave: 'triangle', gain: 0.25, repeat: { count, every, jitter: 0.003 } }),
    ];
    return { duration: 5.4, events: [...spin(0.2, 45, 0.026), ...spin(1.9, 70, 0.022), ...spin(4.0, 40, 0.03)] };
  }),

  R({ id: 'soda', name: 'Opening a soda can', emoji: '🥤', category: 'kitchen', difficulty: 'hard', quick: true,
    accepted: ['soda can', 'opening a can', 'can opening', 'soda', 'soda can opening', 'opening a soda', 'fizzy drink', 'can of soda', 'seltzer', 'opening a drink', 'pop can', 'carbonated drink', 'fizz', 'fizzing', 'cracking open a can'],
    hints: ['It happens in less than a second... then keeps whispering.', 'Click, then psssst.', 'A cold, fizzy drink.'],
    explanation: 'A metal click, a burst of gas and then tiny fizzing bubbles: a soda can being opened.' },
  () => ({ duration: 3.8, events: [
    noise(0.4, 0.02, { filter: bp(3200, 1.5), gain: 0.9 }),
    osc(0.4, 0.02, 1400, { gain: 0.2 }),
    noise(0.42, 0.7, { filter: hp(2800), attack: 0.004, gain: 0.6 }),
    noise(0.9, 2.6, { env: 'hold', attack: 0.2, release: 0.6, filter: hp(5500), gain: 0.07 }),
    noise(0.9, 0.006, { filter: bp(6500, 4), gain: 0.25, repeat: { count: 120, every: 0.021, jitter: 0.01, gainJitter: 0.9, freqJitter: 0.3 } }),
  ] })),

  R({ id: 'hammer', name: 'Hammering a nail', emoji: '🔨', category: 'tools', difficulty: 'medium', quick: true,
    accepted: ['hammer', 'hammering', 'hammering a nail', 'nail', 'pounding', 'banging a nail', 'building', 'carpenter', 'hammering nails', 'construction', 'hammer and nail'],
    hints: ['A carpenter does this.', 'Metal hitting metal, again and again.', 'Bang! Bang! Bang!'],
    explanation: 'Ringing metal hits, a little higher each time as the nail goes in: hammering.' },
  (r) => {
    const f0 = 2300 + r() * 300;
    const hit = (t, f) => [osc(t, 0.3, f, { gain: 0.35 }), osc(t, 0.2, f * 1.47, { gain: 0.15 }), noise(t, 0.04, { filter: bp(1600, 1.2), gain: 0.7 }), osc(t, 0.08, 220, { freqEnd: 120, gain: 0.5 })];
    return { duration: 3.6, events: [0, 1, 2, 3, 4, 5].flatMap((i) => hit(0.25 + i * 0.55, f0 * (1 + i * 0.03))) };
  }),

  R({ id: 'saw', name: 'Sawing wood', emoji: '🪚', category: 'tools', difficulty: 'hard', quick: true,
    accepted: ['saw', 'sawing', 'sawing wood', 'handsaw', 'hand saw', 'cutting wood', 'woodworking', 'carpenter sawing', 'saw cutting wood', 'sawing a log'],
    hints: ['A carpenter does this too.', 'Back and forth, back and forth.', 'Lots of tiny metal teeth cutting through a board.'],
    explanation: 'A raspy sound pushing forward and pulling back: a saw cutting wood.' },
  () => ({ duration: 4.8, events: Array.from({ length: 9 }, (_, i) => noise(0.15 + i * 0.5, 0.46, {
    env: 'swell', filter: bp(i % 2 ? 2100 : 2700, 1.4, i % 2 ? 2700 : 2000), gain: 0.65, lfo: { rate: 38 + (i % 2) * 10, depth: 0.7, target: 'gain' },
  })).concat([noise(0.15, 0.46, { noise: 'brown', env: 'swell', filter: lp(400), gain: 0.25, repeat: { count: 9, every: 0.5 } })]) })),

  R({ id: 'applause', name: 'Applause', emoji: '👏', category: 'people', difficulty: 'easy', quick: true,
    accepted: ['applause', 'clapping', 'people clapping', 'audience clapping', 'clap', 'clapping hands', 'cheering', 'hands clapping', 'round of applause', 'crowd clapping', 'claps'],
    hints: ['It happens at the end of a great performance.', 'Lots of people do it at once.', 'Give them a big hand!'],
    explanation: 'Hundreds of uneven claps at once: an audience applauding.' },
  () => ({ duration: 5.2, events: [
    noise(0.1, 0.018, { filter: bp(1700, 1.2), gain: 0.6, repeat: { count: 220, every: 0.022, jitter: 0.02, gainJitter: 0.75, freqJitter: 0.45 } }),
    noise(0.1, 4.9, { noise: 'pink', env: 'swell', filter: bp(1500, 0.7), gain: 0.12 }),
  ] })),

  R({ id: 'pouring', name: 'Pouring water', emoji: '🥛', category: 'kitchen', difficulty: 'hard',
    accepted: ['pouring water', 'pouring', 'filling a glass', 'water pouring', 'pouring a drink', 'filling a cup', 'pouring a glass of water', 'filling a bottle', 'pouring juice', 'pouring milk', 'filling'],
    hints: ['Listen to the pitch: it keeps rising.', 'Something is getting full.', 'Glug, glug... careful not to spill!'],
    explanation: 'The pitch rises as the space left in the glass gets smaller: pouring water into a glass.' },
  () => ({ duration: 4.3, events: [
    noise(0.3, 3.6, { env: 'hold', attack: 0.15, release: 0.3, filter: bp(450, 6, 1500), gain: 0.6 }),
    noise(0.3, 3.6, { env: 'hold', attack: 0.15, release: 0.3, filter: hp(3000), gain: 0.07 }),
    osc(0.4, 0.05, 900, { freqEnd: 1500, gain: 0.25, repeat: { count: 30, every: 0.11, jitter: 0.05, freqJitter: 0.35, gainJitter: 0.7 } }),
  ] })),

  R({ id: 'schoolbell', name: 'School bell', emoji: '🛎️', category: 'school', difficulty: 'easy', quick: true,
    accepted: ['school bell', 'bell', 'bell ringing', 'electric bell', 'class bell', 'ringing bell', 'recess bell', 'the bell', 'bells'],
    hints: ['Everyone in the class is waiting for it.', 'It means time is up!', 'Recess!'],
    explanation: 'A metal bell hit very fast by an electric hammer: the school bell.' },
  () => ({ duration: 3.8, events: [
    osc(0.2, 3.2, 1900, { wave: 'triangle', env: 'hold', gain: 0.35, lfo: { rate: 24, depth: 0.95, target: 'gain' } }),
    osc(0.2, 3.2, 2650, { env: 'hold', gain: 0.18, lfo: { rate: 24, depth: 0.95, target: 'gain' } }),
    noise(0.2, 3.2, { env: 'hold', filter: bp(3200, 4), gain: 0.06, lfo: { rate: 24, depth: 0.9, target: 'gain' } }),
  ] })),

  R({ id: 'bikebell', name: 'Bicycle bell', emoji: '🚲', category: 'vehicle', difficulty: 'medium', quick: true,
    accepted: ['bike bell', 'bicycle bell', 'bell', 'ring ring', 'bicycle', 'cycle bell', 'bell on a bike', 'bike'],
    hints: ['It says "excuse me!" on the sidewalk.', 'You press it with your thumb.', 'It is on handlebars.'],
    explanation: 'A small bright bell that trills twice: a bicycle bell.' },
  () => {
    const ring = (t) => [osc(t, 0.5, 2900, { gain: 0.35, lfo: { rate: 18, depth: 0.7, target: 'gain' } }), osc(t, 0.5, 4150, { gain: 0.15, lfo: { rate: 18, depth: 0.7, target: 'gain' } })];
    return { duration: 3.6, events: [...ring(0.2), ...ring(0.85), ...ring(2.2), ...ring(2.85)] };
  }),

  R({ id: 'whistle', name: 'Referee whistle', emoji: '🏅', category: 'sports', difficulty: 'easy', quick: true,
    accepted: ['whistle', 'referee whistle', 'sports whistle', 'coach whistle', 'blowing a whistle', 'gym whistle', 'referee', 'coach blowing a whistle', 'whistle blowing'],
    hints: ['It stops the game.', 'The coach has one around their neck.', 'Tweet, tweet, tweeeeet!'],
    explanation: 'A shrill trilling tone: the pea inside a referee\'s whistle rattles very fast.' },
  () => {
    const blow = (t, d) => [osc(t, d, 2600, { env: 'hold', attack: 0.02, release: 0.05, gain: 0.3, lfo: { rate: 32, depth: 160, target: 'freq' } }), noise(t, d, { env: 'hold', filter: bp(2600, 8), gain: 0.06 })];
    return { duration: 2.2, events: [...blow(0.3, 0.18), ...blow(0.62, 0.18), ...blow(0.95, 0.9)] };
  }),

  R({ id: 'horse', name: 'Horse galloping', emoji: '🐎', category: 'animal', difficulty: 'medium', quick: true,
    accepted: ['horse', 'horse galloping', 'galloping', 'hooves', 'horse trotting', 'horses', 'clip clop', 'horse running', 'pony', 'trotting'],
    hints: ['It is an animal on the move.', 'Four legs in a fast rhythm.', 'Clip-clop, clip-clop!'],
    explanation: 'A three-beat rhythm of hard clops: hooves galloping.' },
  () => {
    const clop = (t) => [osc(t, 0.07, 650, { freqEnd: 420, gain: 0.6 }), noise(t, 0.04, { filter: bp(1100, 3), gain: 0.5 })];
    const ev = [];
    for (let b = 0; b < 10; b++) for (const o of [0, 0.1, 0.19]) ev.push(...clop(0.2 + b * 0.52 + o));
    return { duration: 5.4, events: ev };
  }),

  R({ id: 'cow', name: 'Cow mooing', emoji: '🐄', category: 'animal', difficulty: 'easy',
    accepted: ['cow', 'cow mooing', 'moo', 'mooing', 'cattle', 'bull', 'moo cow', 'cows'],
    hints: ['It lives on a farm.', 'It gives us milk.', 'Mooooo!'],
    explanation: 'A low voice that opens up from "mmm" to "ooo": a cow mooing.' },
  () => {
    const bend = [[0.2, 150], [0.75, 140], [1, 105]];
    const moo = (t) => [
      osc(t, 1.6, 120, { wave: 'sawtooth', env: 'hold', attack: 0.15, release: 0.35, bend, filter: lp(300, 4, 950), gain: 0.55, lfo: { rate: 5, depth: 3, target: 'freq' } }),
      osc(t, 1.6, 120, { wave: 'sawtooth', env: 'hold', attack: 0.15, release: 0.35, bend, filter: bp(700, 2), gain: 0.15 }),
    ];
    return { duration: 4.6, events: [...moo(0.3), ...moo(2.6)] };
  }),

  R({ id: 'chicken', name: 'Chickens clucking', emoji: '🐔', category: 'animal', difficulty: 'medium',
    accepted: ['chicken', 'chickens', 'hen', 'hens', 'clucking', 'chicken clucking', 'rooster', 'poultry', 'chickens clucking'],
    hints: ['It lives on a farm.', 'It gives us eggs.', 'Cluck, cluck, bawk!'],
    explanation: 'Short throaty clucks and a squawk: chickens in a coop.' },
  (r) => {
    const ev = [];
    for (const g of [0.3, 1.6, 3.0, 4.2]) {
      const n = 3 + Math.floor(r() * 3);
      const f = 480 + r() * 120;
      ev.push(osc(g, 0.09, f, { wave: 'sawtooth', freqEnd: f * 0.7, filter: bp(1100, 2), gain: 0.5, repeat: { count: n, every: 0.14, freqJitter: 0.08 } }));
      if (r() < 0.6) ev.push(osc(g + n * 0.14 + 0.05, 0.35, 600, { wave: 'sawtooth', bend: [[0.3, 900], [1, 500]], filter: bp(1300, 2), env: 'hold', attack: 0.02, release: 0.1, gain: 0.4 }));
    }
    return { duration: 5.4, events: ev };
  }),

  R({ id: 'seagulls', name: 'Seagulls', emoji: '🕊️', category: 'animal', difficulty: 'hard',
    accepted: ['seagulls', 'seagull', 'gulls', 'gull', 'sea gulls', 'birds at the beach', 'sea birds', 'seabirds'],
    hints: ['It is a bird.', 'It loves the beach and might steal your sandwich.', 'Squawk! Ha-ha-ha!'],
    explanation: 'Loud bending cries and a "ha-ha-ha" laugh: seagulls.' },
  (r) => {
    const cry = (t, f, pan) => osc(t, 0.5, f, { wave: 'sawtooth', bend: [[0.25, f * 1.35], [1, f * 0.8]], filter: bp(f * 1.5, 2), filter2: lp(4000), env: 'hold', attack: 0.04, release: 0.15, gain: 0.35, pan });
    const laugh = (t, f, pan) => osc(t, 0.16, f * 1.2, { wave: 'sawtooth', bend: [[0.4, f * 1.4], [1, f]], filter: bp(f * 1.5, 2), env: 'hold', attack: 0.02, release: 0.05, gain: 0.3, pan, repeat: { count: 4, every: 0.21 } });
    const f = 1100 + r() * 200;
    return { duration: 5.2, events: [cry(0.3, f, -0.4), cry(1.0, f * 1.1, 0.3), laugh(1.9, f, 0.1), cry(3.4, f * 0.95, -0.2), laugh(4.0, f * 1.05, 0.4)] };
  }),

  R({ id: 'carpassing', name: 'Car driving by', emoji: '🚙', category: 'vehicle', difficulty: 'hard',
    accepted: ['car', 'car passing', 'car driving by', 'car going by', 'traffic', 'a car', 'car driving', 'vehicle passing', 'car zooming by', 'passing car', 'cars'],
    hints: ['It comes from far away, gets loud, then fades.', 'Its engine drops in pitch as it goes past you.', 'Vroooom!'],
    explanation: 'Engine noise that swells and drops in pitch as it passes from one side to the other: a car driving by.' },
  () => ({ duration: 4, events: [
    noise(0.2, 1.8, { noise: 'pink', env: 'swell', filter: lp(700, 0.7, 1500), gain: 0.55, pan: -0.6 }),
    noise(1.0, 1.6, { noise: 'pink', env: 'swell', filter: lp(1500, 0.7, 900), gain: 0.7 }),
    noise(1.8, 1.9, { noise: 'pink', env: 'swell', filter: lp(900, 0.7, 500), gain: 0.5, pan: 0.6 }),
    osc(0.2, 3.4, 125, { wave: 'sawtooth', env: 'swell', freqEnd: 80, filter: lp(500), gain: 0.35 }),
  ] })),

  R({ id: 'frying', name: 'Frying in a pan', emoji: '🍳', category: 'kitchen', difficulty: 'hard',
    accepted: ['frying', 'sizzling', 'frying pan', 'sizzle', 'cooking', 'frying food', 'frying eggs', 'frying an egg', 'oil sizzling', 'sizzling pan', 'frying latkes', 'latkes frying', 'hot oil'],
    hints: ['It is in the kitchen, on the stove.', 'Hot oil makes it.', 'Sssssizzle!'],
    explanation: 'A bright hiss full of tiny crackles: food sizzling in hot oil.' },
  () => ({ duration: 5.3, events: [
    noise(0.1, 5.1, { env: 'hold', attack: 0.3, release: 0.4, filter: hp(2200), gain: 0.25 }),
    noise(0.1, 0.012, { filter: bp(4500, 2), gain: 0.7, repeat: { count: 160, every: 0.03, jitter: 0.025, gainJitter: 0.9, freqJitter: 0.4 } }),
    noise(0.1, 5.1, { noise: 'pink', env: 'hold', filter: bp(1200, 0.8), gain: 0.06, lfo: { rate: 7, depth: 0.4, target: 'gain' } }),
  ] })),

  R({ id: 'blender', name: 'Blender', emoji: '🥤', category: 'kitchen', difficulty: 'hard', quick: true,
    accepted: ['blender', 'mixer', 'food processor', 'blending', 'smoothie maker', 'blender running', 'juicer', 'making a smoothie', 'electric mixer'],
    hints: ['It is in the kitchen.', 'A motor that spins really fast.', 'Perfect for a smoothie.'],
    explanation: 'A buzzing motor that speeds up with a grinding whoosh: a blender.' },
  () => ({ duration: 4.4, events: [
    osc(0.3, 3.8, 140, { freqEnd: 210, wave: 'sawtooth', env: 'hold', attack: 0.4, release: 0.3, filter: lp(900), gain: 0.35, lfo: { rate: 11, depth: 6, target: 'freq' } }),
    osc(0.3, 3.8, 280, { freqEnd: 420, wave: 'square', env: 'hold', attack: 0.4, release: 0.3, filter: bp(900, 2), gain: 0.1 }),
    noise(0.3, 3.8, { env: 'hold', attack: 0.4, release: 0.3, filter: bp(1800, 0.8), gain: 0.25, lfo: { rate: 9, depth: 0.5, target: 'gain' } }),
  ] })),

  R({ id: 'fire', name: 'Crackling fire', emoji: '🔥', category: 'nature', difficulty: 'hard',
    accepted: ['fire', 'campfire', 'crackling fire', 'fireplace', 'bonfire', 'fire crackling', 'burning wood', 'lag baomer bonfire', 'wood burning', 'flames'],
    hints: ['It is warm and glowing.', 'Wood pops and snaps inside it.', 'Perfect for Lag BaOmer.'],
    explanation: 'A low roar with random pops and snaps: burning wood in a fire.' },
  () => ({ duration: 5.6, events: [
    noise(0, 5.5, { noise: 'brown', env: 'hold', attack: 0.5, release: 0.5, filter: lp(500), gain: 0.5, lfo: { rate: 0.8, depth: 0.3, target: 'gain' } }),
    noise(0.1, 0.01, { filter: bp(2500, 1.5), gain: 0.7, repeat: { count: 70, every: 0.075, jitter: 0.06, gainJitter: 0.9, freqJitter: 0.5 } }),
    noise(0.3, 0.03, { filter: bp(900, 2), gain: 0.6, repeat: { count: 12, every: 0.42, jitter: 0.2, gainJitter: 0.6 } }),
  ] })),

  R({ id: 'ice', name: 'Ice in a glass', emoji: '🧊', category: 'kitchen', difficulty: 'hard',
    accepted: ['ice', 'ice cubes', 'ice in a glass', 'clinking ice', 'ice clinking', 'glass of ice', 'ice cubes in a glass', 'clinking glass', 'ice cubes clinking', 'cold drink'],
    hints: ['It is cold.', 'Bright little clinks in a cup.', 'It keeps a drink chilled.'],
    explanation: 'Short glassy clinks: ice cubes knocking around in a glass.' },
  (r) => {
    const clink = (t, f) => [osc(t, 0.35, f, { gain: 0.4 }), osc(t, 0.25, f * 2.3, { gain: 0.15 }), noise(t, 0.01, { filter: hp(4000), gain: 0.2 })];
    const times = [0.3, 0.45, 0.62, 1.4, 1.52, 2.6, 2.7, 2.78, 3.5, 3.62];
    return { duration: 4.2, events: times.flatMap((t) => clink(t + r() * 0.04, 2600 + r() * 1000)) };
  }),

  R({ id: 'woodpecker', name: 'Woodpecker', emoji: '🌳', category: 'animal', difficulty: 'hard', quick: true,
    accepted: ['woodpecker', 'woodpecker pecking', 'bird pecking wood', 'pecking', 'bird pecking', 'woodpeckers'],
    hints: ['It is a bird.', 'It makes holes in trees.', 'Rat-a-tat-tat-tat!'],
    explanation: 'Bursts of very fast taps on wood: a woodpecker drumming on a tree.' },
  () => {
    const burst = (t, n) => [osc(t, 0.02, 1200, { freqEnd: 800, gain: 0.6, repeat: { count: n, every: 0.045 } }), noise(t, 0.015, { filter: bp(1500, 2), gain: 0.5, repeat: { count: n, every: 0.045 } })];
    return { duration: 4.6, events: [...burst(0.3, 16), ...burst(1.9, 18), ...burst(3.4, 14)] };
  }),

  R({ id: 'metronome', name: 'Metronome', emoji: '🎼', category: 'music', difficulty: 'hard',
    accepted: ['metronome', 'metronome ticking', 'music metronome', 'click track', 'tempo', 'beat keeper'],
    hints: ['It is NOT a clock, even though it sounds like one.', 'Musicians practice with it.', 'Every fourth click is a little different.'],
    explanation: 'Identical clicks at a steady tempo with an accent on the first beat: a metronome.' },
  () => ({ duration: 5.2, events: [
    osc(0.2, 0.03, 1500, { gain: 0.6, repeat: { count: 10, every: 0.5 } }),
    noise(0.2, 0.015, { filter: bp(4000, 4), gain: 0.5, repeat: { count: 10, every: 0.5 } }),
    osc(0.2, 0.04, 2100, { gain: 0.4, repeat: { count: 3, every: 2 } }),
  ] })),

  R({ id: 'typewriter', name: 'Typewriter', emoji: '📜', category: 'office', difficulty: 'hard', quick: true,
    accepted: ['typewriter', 'typewriter typing', 'old typewriter', 'typing on a typewriter', 'typewriter bell'],
    hints: ['Your great-grandparents used one.', 'Loud clacks, then a "ding!" at the end of the line.', 'It is like a keyboard that prints right onto paper.'],
    explanation: 'Heavy clacks, a little bell and the carriage sliding back: an old typewriter.' },
  () => ({ duration: 5.2, events: [
    noise(0.2, 0.05, { filter: bp(1800, 1.2), gain: 0.7, repeat: { count: 22, every: 0.16, jitter: 0.05, gainJitter: 0.4 } }),
    osc(0.2, 0.04, 400, { freqEnd: 200, gain: 0.35, repeat: { count: 22, every: 0.16, jitter: 0.05 } }),
    osc(3.85, 1.1, 2800, { gain: 0.4 }),
    noise(4.1, 0.6, { env: 'swell', filter: bp(1200, 1.5, 700), gain: 0.4 }),
  ] })),

  R({ id: 'pingpong', name: 'Ping pong', emoji: '🏓', category: 'sports', difficulty: 'hard', quick: true,
    accepted: ['ping pong', 'table tennis', 'ping-pong', 'ping pong ball', 'ping pong game', 'playing ping pong', 'ping pong rally'],
    hints: ['It is a game with a tiny, light ball.', 'Paddle, table, paddle, table...', 'Two players across a small net.'],
    explanation: 'Alternating paddle hits and table bounces, left and right: a ping pong rally.' },
  () => {
    const ev = [];
    for (let i = 0; i < 12; i++) {
      const t = 0.2 + i * 0.36;
      const paddle = i % 2 === 0;
      const pan = i % 4 < 2 ? -0.4 : 0.4;
      ev.push(osc(t, 0.05, paddle ? 1500 : 1100, { freqEnd: paddle ? 1300 : 900, gain: 0.55, pan }), noise(t, 0.02, { filter: bp(paddle ? 2500 : 1800, 2), gain: 0.45, pan }));
    }
    return { duration: 4.6, events: ev };
  }),
];

export const RECIPE_MAP = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Never layer two of these together: they are too easy to confuse with each other. */
export const CONFUSABLE = [
  ['clock', 'metronome', 'alarm', 'microwave'],
  ['typing', 'typewriter'],
  ['rain', 'frying', 'fire', 'applause', 'popcorn', 'soda'],
  ['waves', 'wind', 'carpassing', 'thunder'],
  ['bouncingball', 'dribble', 'pingpong'],
  ['doorbell', 'schoolbell', 'bikebell', 'phone'],
  ['knock', 'footsteps', 'hammer', 'horse', 'woodpecker', 'heartbeat'],
  ['birds', 'seagulls', 'crickets', 'chicken'],
  ['train', 'helicopter', 'blender'],
  ['siren', 'whistle', 'kettle'],
  ['carhorn', 'shofar'],
  ['pouring', 'dripping', 'ice'],
  ['zipper', 'saw', 'gragger'],
];

export const confusable = (a, b) => a === b || CONFUSABLE.some((g) => g.includes(a) && g.includes(b));

// ---------------------------------------------------------------- environments

const chime = () => ({ duration: 3.2, events: [784, 659, 523].flatMap((f, i) => [osc(0.2 + i * 0.6, 1.6, f, { gain: 0.5 }), osc(0.2 + i * 0.6, 0.9, f * 2, { gain: 0.1 })]) });
const drill = () => ({ duration: 3.4, events: [
  osc(0.4, 1.2, 320, { freqEnd: 900, wave: 'sawtooth', env: 'hold', attack: 0.1, release: 0.2, filter: lp(2500), gain: 0.3, lfo: { rate: 30, depth: 20, target: 'freq' } }),
  osc(2.0, 1.0, 380, { freqEnd: 1000, wave: 'sawtooth', env: 'hold', attack: 0.1, release: 0.2, filter: lp(2500), gain: 0.3, lfo: { rate: 30, depth: 20, target: 'freq' } }),
] });
const COMPONENTS = { chime, drill };

export const ENVIRONMENTS = [
  { id: 'beach', name: 'The beach', emoji: '🏖️', duration: 8,
    accepted: ['beach', 'the beach', 'seashore', 'seaside', 'shore', 'ocean', 'by the ocean', 'by the sea', 'sea', 'coast', 'boardwalk'],
    hints: ['Somewhere people go in the summer.', 'Birds overhead and water rushing in.', 'Bring sunscreen and a towel.'],
    explanation: 'Crashing waves, crying seagulls and a breeze: you are at the beach.',
    layers: [{ recipe: 'waves', gain: 0.8 }, { recipe: 'seagulls', gain: 0.45, offset: 0.8 }, { recipe: 'wind', gain: 0.25 }] },
  { id: 'storm', name: 'A thunderstorm', emoji: '⛈️', duration: 8,
    accepted: ['thunderstorm', 'storm', 'rainstorm', 'rain storm', 'rainy day', 'thunder and rain', 'bad weather', 'stormy night', 'storm outside'],
    hints: ['It is not a place - it is the weather outside right now!', 'Something flashes, then rumbles.', 'Stay inside!'],
    explanation: 'Rain, wind and rolling thunder: a thunderstorm.',
    layers: [{ recipe: 'rain', gain: 0.7 }, { recipe: 'thunder', gain: 0.85, offset: 2 }, { recipe: 'wind', gain: 0.3 }] },
  { id: 'forest', name: 'A forest in the morning', emoji: '🌲', duration: 8,
    accepted: ['forest', 'woods', 'the woods', 'jungle', 'nature', 'park', 'forest in the morning', 'in the forest', 'outdoors', 'trees', 'nature trail', 'garden'],
    hints: ['Lots of trees around you.', 'The birds are just waking up.', 'Someone is drumming on a tree trunk.'],
    explanation: 'Birdsong, a woodpecker and a soft breeze: a forest in the morning.',
    layers: [{ recipe: 'birds', gain: 0.75 }, { recipe: 'woodpecker', gain: 0.4, offset: 1.5 }, { recipe: 'wind', gain: 0.2 }] },
  { id: 'city', name: 'A busy city street', emoji: '🏙️', duration: 8,
    accepted: ['city', 'city street', 'street', 'traffic', 'downtown', 'busy street', 'road', 'the city', 'sidewalk', 'intersection', 'new york'],
    hints: ['Lots of people and cars.', 'Someone is in a hurry.', 'Crossing at the light...'],
    explanation: 'Cars passing, a horn and footsteps on the sidewalk: a busy city street.',
    layers: [{ recipe: 'carpassing', gain: 0.7 }, { recipe: 'carhorn', gain: 0.4, offset: 3.2 }, { recipe: 'footsteps', gain: 0.45, offset: 0.4 }] },
  { id: 'farm', name: 'A farm', emoji: '🚜', duration: 8,
    accepted: ['farm', 'barn', 'farmyard', 'on a farm', 'the farm', 'a farm', 'ranch', 'countryside', 'petting zoo'],
    hints: ['Animals live here.', 'Someone gives milk and someone lays eggs.', 'Old MacDonald had one.'],
    explanation: 'Mooing, clucking and birds: life on a farm.',
    layers: [{ recipe: 'cow', gain: 0.7 }, { recipe: 'chicken', gain: 0.55, offset: 1 }, { recipe: 'birds', gain: 0.25 }] },
  { id: 'station', name: 'A train station', emoji: '🚉', duration: 8,
    accepted: ['train station', 'station', 'railway station', 'subway station', 'platform', 'train platform', 'railroad station', 'subway'],
    hints: ['People are waiting here with tickets.', 'Listen to the announcement chime.', 'All aboard!'],
    explanation: 'An announcement chime, footsteps and an arriving train: a train station.',
    layers: [{ component: 'chime', gain: 0.5 }, { recipe: 'train', gain: 0.75, offset: 2.2 }, { recipe: 'footsteps', gain: 0.4, offset: 0.4 }] },
  { id: 'night', name: 'The countryside at night', emoji: '🌙', duration: 8,
    accepted: ['night', 'nighttime', 'night time', 'countryside at night', 'campsite', 'camping', 'night in the woods', 'forest at night', 'outdoors at night', 'woods at night', 'summer night'],
    hints: ['It is dark outside.', 'Tiny insects and a sleepy bird are the only ones awake.', 'Time for bed...'],
    explanation: 'Crickets, an owl and a gentle breeze: a quiet night in the countryside.',
    layers: [{ recipe: 'crickets', gain: 0.6 }, { recipe: 'owl', gain: 0.55, offset: 1 }, { recipe: 'wind', gain: 0.18 }] },
  { id: 'kitchen', name: 'A busy kitchen', emoji: '🍳', duration: 8,
    accepted: ['kitchen', 'cooking', 'someone cooking', 'restaurant kitchen', 'the kitchen', 'making dinner', 'making food', 'kitchen cooking'],
    hints: ['A room in your house.', 'Something is sizzling and something is beeping.', 'Dinner is almost ready!'],
    explanation: 'Sizzling oil, pouring water and the microwave beeping: a busy kitchen.',
    layers: [{ recipe: 'frying', gain: 0.5 }, { recipe: 'microwave', gain: 0.55, offset: 2 }, { recipe: 'pouring', gain: 0.35, offset: 0.2 }] },
  { id: 'gym', name: 'A basketball game', emoji: '🏀', duration: 8,
    accepted: ['gym', 'basketball game', 'basketball court', 'gymnasium', 'sports game', 'basketball', 'gym class', 'game', 'court'],
    hints: ['A big room with a shiny floor.', 'Someone is dribbling and the crowd is excited.', 'Two hoops at each end.'],
    explanation: 'Dribbling, a whistle and applause: a basketball game in the gym.',
    layers: [{ recipe: 'dribble', gain: 0.75 }, { recipe: 'whistle', gain: 0.5, offset: 3.6 }, { recipe: 'applause', gain: 0.35, offset: 4.4 }] },
  { id: 'campfire', name: 'A campfire', emoji: '🏕️', duration: 8,
    accepted: ['campfire', 'bonfire', 'camping', 'camp', 'campsite', 'lag baomer', 'fire', 'camp fire', 'sitting by a fire', 'fireplace'],
    hints: ['You might roast something on a stick here.', 'It is dark and warm.', 'Lag BaOmer!'],
    explanation: 'Crackling wood and crickets in the dark: sitting around a campfire.',
    layers: [{ recipe: 'fire', gain: 0.7 }, { recipe: 'crickets', gain: 0.35 }] },
  { id: 'construction', name: 'A construction site', emoji: '🏗️', duration: 8,
    accepted: ['construction', 'construction site', 'workshop', 'building site', 'carpentry', 'building', 'carpenter', 'woodshop', 'workers building'],
    hints: ['Hard hats are required here.', 'Hammers, saws and drills.', 'Something new is being built.'],
    explanation: 'Hammering, sawing and a power drill: a construction site.',
    layers: [{ recipe: 'hammer', gain: 0.7 }, { recipe: 'saw', gain: 0.55, offset: 3.4 }, { component: 'drill', gain: 0.35, offset: 1.4 }] },
];

export const ENV_MAP = Object.fromEntries(ENVIRONMENTS.map((e) => [e.id, e]));

// ---------------------------------------------------------------- builders

/** Build a recipe's SoundSpec. */
export function buildRecipe(id, seed = 1, { gain = 0.8 } = {}) {
  const recipe = RECIPE_MAP[id];
  if (!recipe) throw new Error(`Unknown sound recipe "${id}"`);
  const spec = recipe.build(mulberry32(seed));
  return finalize({ duration: spec.duration, gain, seed, events: spec.events });
}

function shifted(events, by) {
  return events.map((e) => ({ ...e, t: e.t + by }));
}

/** Loop and offset a spec so it fills `duration` seconds. */
function fill(spec, duration, offset = 0) {
  const events = [];
  for (let start = offset; start < duration; start += spec.duration) events.push(...shifted(spec.events, start));
  return finalize({ ...spec, duration, events });
}

/** Build the separate layer specs for an environment (the browser mixes them). */
export function buildEnvironment(id, seed = 1) {
  const env = ENV_MAP[id];
  if (!env) throw new Error(`Unknown environment "${id}"`);
  return env.layers.map((l, i) => {
    const base = l.component ? COMPONENTS[l.component]() : RECIPE_MAP[l.recipe].build(mulberry32(seed + i * 101));
    return fill({ duration: base.duration, gain: l.gain, seed: seed + i, events: base.events }, env.duration, l.offset || 0);
  });
}

/**
 * Check a spec is well-formed: positive duration, every event (and every repeat) starts and ends
 * inside the duration, and no NaN/Infinity anywhere.
 */
export function validateSpec(spec) {
  const problems = [];
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!spec || !finite(spec.duration) || spec.duration <= 0 || spec.duration > 30) problems.push('duration must be between 0 and 30 seconds');
  if (!Array.isArray(spec?.events) || !spec.events.length) return { ok: false, problems: [...problems, 'events must be a non-empty list'] };
  const walk = (v, path) => {
    if (typeof v === 'number' && !Number.isFinite(v)) problems.push(`${path} is not a finite number`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(spec, 'spec');
  spec.events.forEach((ev, i) => {
    if (ev.src !== 'osc' && ev.src !== 'noise') problems.push(`event ${i}: src must be osc or noise`);
    if (!finite(ev.t) || ev.t < 0) problems.push(`event ${i}: bad start time`);
    if (!finite(ev.dur) || ev.dur <= 0) problems.push(`event ${i}: bad duration`);
    if (ev.src === 'osc' && !(ev.freq > 0 && ev.freq < 20000)) problems.push(`event ${i}: frequency out of range`);
    if (ev.gain != null && !(ev.gain >= 0 && ev.gain <= 1.5)) problems.push(`event ${i}: gain out of range`);
    for (const f of [ev.filter, ev.filter2]) if (f && !(f.freq > 0 && f.freq < 22000)) problems.push(`event ${i}: filter frequency out of range`);
    if (ev.repeat && !(ev.repeat.count >= 1 && ev.repeat.count <= 400 && ev.repeat.every > 0)) problems.push(`event ${i}: bad repeat`);
    const starts = repeatStarts(ev);
    const end = starts[starts.length - 1] + ev.dur;
    if (end > spec.duration + 0.001) problems.push(`event ${i}: ends at ${end.toFixed(2)}s, after the ${spec.duration}s duration`);
  });
  return { ok: problems.length === 0, problems };
}

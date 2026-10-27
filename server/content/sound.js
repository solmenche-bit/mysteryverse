// Curated "Guess the Sound" challenges. Data stays on the server; the browser only
// receives the synthesized specs built from it.
import { RECIPE_MAP } from '../media/soundlib.js';

const L = (recipe, seed = 1) => ({ recipe, seed });

function C(id, difficulty, mode, layers, extra = {}) {
  const tags = layers.some((l) => RECIPE_MAP[l.recipe]?.tags?.includes('jewish')) || extra.jewish ? ['jewish'] : [];
  const { jewish, ...rest } = extra;
  return { id, difficulty, tags, data: { mode, layers, ...rest } };
}
const ENV = (id, difficulty, environment, seed = 3) => ({ id, difficulty, tags: [], data: { mode: 'environment', environment, seed } });

export const SOUND_CHALLENGES = [
  // ---------- Easy: clear everyday sounds ----------
  C('snd-doorbell', 'easy', 'classic', [L('doorbell', 11)]),
  C('snd-phone', 'easy', 'classic', [L('phone', 4)]),
  C('snd-carhorn', 'easy', 'classic', [L('carhorn', 2)]),
  C('snd-knock', 'easy', 'classic', [L('knock', 5)]),
  C('snd-piano', 'easy', 'classic', [L('piano', 1)]),
  C('snd-bouncingball', 'easy', 'classic', [L('bouncingball', 8)]),
  C('snd-schoolbell', 'easy', 'classic', [L('schoolbell', 3)]),

  // ---------- Medium: less obvious, still familiar ----------
  C('snd-typing', 'medium', 'classic', [L('typing', 21)]),
  C('snd-coins', 'medium', 'classic', [L('coins', 9)]),
  C('snd-kettle', 'medium', 'classic', [L('kettle', 2)]),
  C('snd-popcorn', 'medium', 'classic', [L('popcorn', 17)]),
  C('snd-shofar', 'medium', 'classic', [L('shofar', 6)]),
  C('snd-owl', 'medium', 'classic', [L('owl', 12)]),
  C('snd-slow-alarm', 'medium', 'slow', [L('alarm', 4)]),

  // ---------- Hard: similar-sounding, reversed or slowed ----------
  C('snd-zipper', 'hard', 'classic', [L('zipper', 14)]),
  C('snd-camera', 'hard', 'classic', [L('camera', 3)]),
  C('snd-gragger', 'hard', 'classic', [L('gragger', 8)]),
  C('snd-metronome', 'hard', 'classic', [L('metronome', 1)], { explanation: 'It sounds like a clock, but every click is identical and every fourth one is accented: a metronome.' }),
  C('snd-rev-piano', 'hard', 'reverse', [L('piano', 2)], { explanation: 'Backwards, the scale goes DOWN and every note swells up instead of fading: a piano scale played in reverse.' }),
  C('snd-slow-coins', 'hard', 'slow', [L('coins', 31)], { explanation: 'At half speed every ping is lower and longer, but those are still coins hitting the floor.' }),
  C('snd-slow-birds', 'hard', 'slow', [L('birds', 7)], { explanation: 'Slowed down, birdsong sounds like slide whistles!' }),

  // ---------- Expert: layers and environments ----------
  C('snd-layer-rain-clock', 'expert', 'layers', [L('rain', 5), L('clock', 2)], { explanation: 'A clock ticking away while rain taps on the window.' }),
  C('snd-layer-doorbell-typing', 'expert', 'layers', [L('doorbell', 4), L('typing', 8)], { explanation: 'Someone typing... and then the doorbell rings.' }),
  C('snd-layer-owl-kettle', 'expert', 'layers', [L('owl', 3), L('kettle', 5)], { explanation: 'A late-night cup of tea while an owl hoots outside.' }),
  ENV('snd-env-beach', 'expert', 'beach', 4),
  ENV('snd-env-farm', 'expert', 'farm', 2),
  ENV('snd-env-station', 'expert', 'station', 6),
  ENV('snd-env-storm', 'expert', 'storm', 9),

  // ---------- Insane: three layers, one-second clips, busy places ----------
  C('snd-layer3-coins-birds-hammer', 'insane', 'layers', [L('coins', 2), L('birds', 11), L('hammer', 4)], { explanation: 'Coins, birds and a hammer all at once!' }),
  C('snd-layer3-shofar-applause-microwave', 'insane', 'layers', [L('shofar', 3), L('applause', 6), L('microwave', 2)], { explanation: 'A shofar, applause and a microwave, layered on top of each other.' }),
  C('snd-1s-soda', 'insane', 'onesecond', [L('soda', 5)], { explanation: 'Just one second: a click and a pssst. Someone opened a soda can.' }),
  C('snd-1s-saw', 'insane', 'onesecond', [L('saw', 3)], { explanation: 'Two quick raspy strokes in one second: a saw cutting wood.' }),
  C('snd-1s-gragger', 'insane', 'onesecond', [L('gragger', 2)], { explanation: 'One second of rattling clicks: a gragger.' }),
  ENV('snd-env-kitchen', 'insane', 'kitchen', 7),
  ENV('snd-env-construction', 'insane', 'construction', 5),
];

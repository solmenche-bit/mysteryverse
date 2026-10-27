// Curated "Find the Fake" levels. Each level is a composition of six scenes;
// exactly one carries an anomaly. Seeds make every picture reproducible.

const EST = { easy: 45, medium: 70, hard: 100, expert: 140, insane: 180 };

/**
 * L(id, difficulty, 'type.anomaly', [five other scene types], seed)
 * The fake's position is derived from the seed; the server reshuffles positions every play anyway.
 */
function L(id, difficulty, fake, others, seed) {
  const [type, anomaly] = fake.split('.');
  const scenes = others.map((t, i) => ({ type: t, seed: seed * 31 + i * 17 + 3 }));
  scenes.splice(seed % 6, 0, { type, seed: seed * 31 + 101, anomaly });
  return { id, difficulty, data: { scenes, estSeconds: EST[difficulty] } };
}

const five = (t) => [t, t, t, t, t];

export const FAKE_LEVELS = [
  // Easy: six different pictures, one obviously impossible.
  L('fake-e1', 'easy', 'clock.thirteen', ['trafficlight', 'rainbow', 'candle', 'scale', 'keyboard'], 11),
  L('fake-e2', 'easy', 'stopsign.spelling', ['hourglass', 'ladybug', 'calendar', 'gears', 'die'], 22),
  L('fake-e3', 'easy', 'bicycle.square', ['clock', 'snowflake', 'domino', 'weather', 'shadows'], 33),
  L('fake-e4', 'easy', 'candle.flame', ['chessboard', 'ruler', 'stopsign', 'rainbow', 'glass'], 44),
  L('fake-e5', 'easy', 'hourglass.upward', ['bicycle', 'tictactoe', 'scale', 'lake', 'trafficlight'], 55),
  L('fake-e6', 'easy', 'weather.mismatch', ['die', 'keyboard', 'candle', 'clock', 'ladybug'], 66),
  L('fake-e7', 'easy', 'die.seven', ['stopsign', 'gears', 'rainbow', 'weather', 'calendar'], 77),

  // Medium: small inconsistencies; the fake's kind of picture may appear twice.
  L('fake-m1', 'medium', 'trafficlight.order', ['clock', 'bicycle', 'candle', 'hourglass', 'domino'], 101),
  L('fake-m2', 'medium', 'calendar.feb30', ['calendar', 'keyboard', 'ruler', 'clock', 'scale'], 112),
  L('fake-m3', 'medium', 'rainbow.order', ['rainbow', 'snowflake', 'weather', 'lake', 'gears'], 123),
  L('fake-m4', 'medium', 'scale.heavy', ['scale', 'die', 'ladybug', 'stopsign', 'glass'], 134),
  L('fake-m5', 'medium', 'clock.duplicate', ['clock', 'calendar', 'trafficlight', 'tictactoe', 'bicycle'], 145),
  L('fake-m6', 'medium', 'ruler.skip', ['ruler', 'keyboard', 'domino', 'candle', 'chessboard'], 156),
  L('fake-m7', 'medium', 'calendar.weekday', ['calendar', 'clock', 'ruler', 'hourglass', 'keyboard'], 167),

  // Hard: subtle physical impossibilities among look-alikes.
  L('fake-h1', 'hard', 'stopsign.sides', ['stopsign', 'stopsign', 'trafficlight', 'bicycle', 'shadows'], 201),
  L('fake-h2', 'hard', 'snowflake.eight', ['snowflake', 'snowflake', 'weather', 'rainbow', 'candle'], 212),
  L('fake-h3', 'hard', 'ladybug.legs', ['ladybug', 'ladybug', 'scale', 'glass', 'lake'], 223),
  L('fake-h4', 'hard', 'chessboard.adjacent', ['chessboard', 'chessboard', 'tictactoe', 'die', 'domino'], 234),
  L('fake-h5', 'hard', 'domino.seven', ['domino', 'domino', 'die', 'die', 'chessboard'], 245),
  L('fake-h6', 'hard', 'clock.swapped', ['clock', 'clock', 'clock', 'calendar', 'ruler'], 256),

  // Expert: careful comparison of mostly identical kinds of pictures.
  L('fake-x1', 'expert', 'glass.tilted', ['glass', 'glass', 'glass', 'scale', 'hourglass'], 301),
  L('fake-x2', 'expert', 'gears.same', ['gears', 'gears', 'gears', 'bicycle', 'clock'], 312),
  L('fake-x3', 'expert', 'tictactoe.counts', ['tictactoe', 'tictactoe', 'tictactoe', 'chessboard', 'domino'], 323),
  L('fake-x4', 'expert', 'keyboard.swap', ['keyboard', 'keyboard', 'keyboard', 'ruler', 'calendar'], 334),
  L('fake-x5', 'expert', 'shadows.wrong', ['shadows', 'shadows', 'shadows', 'weather', 'lake'], 345),

  // Insane: six believable pictures of the same thing, one hidden contradiction.
  L('fake-i1', 'insane', 'clock.hands', five('clock'), 401),
  L('fake-i2', 'insane', 'lake.unreversed', five('lake'), 412),
  L('fake-i3', 'insane', 'tictactoe.twowinners', five('tictactoe'), 423),
  L('fake-i4', 'insane', 'die.opposite', five('die'), 434),
  L('fake-i5', 'insane', 'bicycle.chain', five('bicycle'), 445),
];

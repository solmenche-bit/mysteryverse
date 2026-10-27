// Procedural SVG scenes for "Find the Fake". Every scene type draws an ordinary,
// physically possible picture from a seed, and can draw the same picture with one
// deliberate, specific impossibility. Fakes are never accidental: each anomaly is a
// named variant with an explanation, a hint, a visible region and "why" keywords.
//
// All markup is generated here (no user input), uses the same element/attribute
// vocabulary for real and fake pictures, and carries no ids, classes, comments,
// scripts or external references, so the browser cannot tell which one is fake.

const W = 400;
const H = 300;
export const MIN_RADIUS = 30;
export const VIEWBOX = `0 0 ${W} ${H}`;

// ---------------------------------------------------------------- utilities

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

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rand(r) {
  return {
    f: (a, b) => a + r() * (b - a),
    i: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    shuffle: (arr) => {
      const out = [...arr];
      for (let k = out.length - 1; k > 0; k--) {
        const j = Math.floor(r() * (k + 1));
        [out[k], out[j]] = [out[j], out[k]];
      }
      return out;
    },
  };
}

const fmt = (v) => {
  const n = Math.round(v * 10) / 10;
  return String(Object.is(n, -0) ? 0 : n);
};
const fmt2 = (v) => String(Math.round(v * 100) / 100);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rad = (deg) => (deg * Math.PI) / 180;

// Attributes are always emitted in the same order.
function paint(o = {}) {
  let s = '';
  if (o.fill !== undefined) s += ` fill="${o.fill}"`;
  if (o.stroke) s += ` stroke="${o.stroke}"`;
  if (o.sw != null) s += ` stroke-width="${fmt(o.sw)}"`;
  if (o.cap) s += ` stroke-linecap="${o.cap}"`;
  if (o.join) s += ` stroke-linejoin="${o.join}"`;
  if (o.op != null) s += ` opacity="${fmt2(o.op)}"`;
  if (o.tf) s += ` transform="${o.tf}"`;
  return s;
}

const rect = (x, y, w, h, o = {}) => `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"${o.rx != null ? ` rx="${fmt(o.rx)}"` : ''}${paint(o)}/>`;
const circ = (cx, cy, r, o = {}) => `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}"${paint(o)}/>`;
const ell = (cx, cy, rx, ry, o = {}) => `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}"${paint(o)}/>`;
const line = (x1, y1, x2, y2, o = {}) => `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}"${paint({ cap: 'round', ...o })}/>`;
const pts = (p) => p.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
const poly = (p, o = {}) => `<polygon points="${pts(p)}"${paint({ join: 'round', ...o })}/>`;
const pline = (p, o = {}) => `<polyline points="${pts(p)}"${paint({ fill: 'none', cap: 'round', join: 'round', ...o })}/>`;
const path = (d, o = {}) => `<path d="${d}"${paint(o)}/>`;
const text = (x, y, s, o = {}) =>
  `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fmt(o.size || 16)}" font-weight="${o.weight || 700}" text-anchor="${o.anchor || 'middle'}"${paint({ fill: '#111827', ...o })}>${esc(s)}</text>`;
const g = (children, o = {}) => `<g${paint(o)}>${children}</g>`;

const regPoly = (cx, cy, r, n, startDeg) =>
  Array.from({ length: n }, (_, k) => {
    const a = rad(startDeg + (k * 360) / n);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

const rotPt = ([px, py], [cx, cy], deg) => {
  const a = rad(deg);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** Keep the part of a polygon below the horizontal line y = Y (screen y grows downward). */
function clipBelow(polygon, Y) {
  const out = [];
  for (let k = 0; k < polygon.length; k++) {
    const A = polygon[k];
    const B = polygon[(k + 1) % polygon.length];
    const ain = A[1] >= Y;
    const bin = B[1] >= Y;
    if (ain) out.push(A);
    if (ain !== bin) {
      const t = (Y - A[1]) / (B[1] - A[1]);
      out.push([A[0] + t * (B[0] - A[0]), Y]);
    }
  }
  return out;
}

const SKIES = ['#bae6fd', '#c7d2fe', '#a5f3fc', '#dbeafe', '#e0e7ff'];
const WALLS = ['#fde68a', '#bfdbfe', '#c7d2fe', '#fbcfe8', '#bbf7d0', '#fed7aa', '#e9d5ff'];
const INK = '#111827';

// Standard pip layouts on a unit square (7 exists only for anomalies).
const PIPS = {
  0: [],
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.2], [0.75, 0.2], [0.25, 0.5], [0.75, 0.5], [0.25, 0.8], [0.75, 0.8]],
  7: [[0.25, 0.2], [0.75, 0.2], [0.25, 0.5], [0.5, 0.5], [0.75, 0.5], [0.25, 0.8], [0.75, 0.8]],
};

function cloud(cx, cy, s = 1) {
  return circ(cx - 22 * s, cy + 4 * s, 16 * s, { fill: '#ffffff' }) + circ(cx, cy - 6 * s, 22 * s, { fill: '#ffffff' }) + circ(cx + 24 * s, cy + 4 * s, 16 * s, { fill: '#ffffff' })
    + rect(cx - 38 * s, cy + 2 * s, 78 * s, 18 * s, { rx: 9 * s, fill: '#ffffff' });
}

function sun(cx, cy, r = 26) {
  let s = '';
  for (let k = 0; k < 12; k++) {
    const a = rad(k * 30);
    s += line(cx + (r + 6) * Math.cos(a), cy + (r + 6) * Math.sin(a), cx + (r + 16) * Math.cos(a), cy + (r + 16) * Math.sin(a), { stroke: '#f59e0b', sw: 4 });
  }
  return s + circ(cx, cy, r, { fill: '#fbbf24' });
}

// ---------------------------------------------------------------- scenes
// render(x, anomaly) -> { body, region?, note?, explanation? }

export const SCENES = {
  clock: {
    label: 'Clock',
    anomalies: {
      thirteen: {
        difficulty: 'easy', title: 'A clock with a 13',
        explanation: 'Clocks only go up to 12, but this one has a 13 at the top.',
        hint: 'Read every number on every clock face.',
        keywords: ['13', 'thirteen', 'no 12', 'extra number', 'wrong number', 'numbers'],
      },
      duplicate: {
        difficulty: 'medium', title: 'A clock with the same number twice',
        explanation: 'One number appears twice on this clock face, so another number is missing.',
        hint: 'Check that every clock has each number from 1 to 12 exactly once.',
        keywords: ['twice', 'same number', 'duplicate', 'repeated', 'missing number', 'two of the same', 'numbers'],
      },
      swapped: {
        difficulty: 'hard', title: 'A clock with two numbers swapped',
        explanation: 'Two neighboring numbers are in the wrong order on this clock face.',
        hint: 'Go around each clock in order: 1, 2, 3, 4...',
        keywords: ['swapped', 'switched', 'wrong order', 'order', 'backwards', 'out of order', 'numbers'],
      },
      hands: {
        difficulty: 'insane', title: 'A clock with an impossible hour hand',
        explanation: 'At half past the hour, the hour hand should sit halfway between two numbers. Here the minute hand points at the 6, but the hour hand points exactly at a number.',
        hint: 'Compare where the short hand points with where the long hand points.',
        keywords: ['hour hand', 'short hand', 'hands', 'halfway', 'half past', 'between', 'should be between'],
      },
    },
    render(x, a) {
      const wall = x.pick(WALLS);
      const rim = x.pick(['#1f2937', '#7c2d12', '#1e3a8a', '#065f46', '#6b21a8', '#b91c1c', '#0f766e']);
      const face = x.pick(['#ffffff', '#fffbeb', '#f8fafc', '#ecfeff']);
      const h = x.i(1, 12);
      let m = x.i(0, 11) * 5;
      const sec = x.i(0, 59);
      const p = x.i(1, 10);
      const shelf = x.f(250, 268);
      if (a === 'hands') m = 30;
      const cx = 200;
      const cy = 132;
      const R = 110;
      const rn = R - 40;
      const labels = Array.from({ length: 13 }, (_, k) => String(k));
      if (a === 'thirteen') labels[12] = '13';
      if (a === 'duplicate') labels[p] = String(((p + 5) % 12) + 1);
      if (a === 'swapped') [labels[p], labels[p + 1]] = [labels[p + 1], labels[p]];
      const pos = (k, r) => [cx + r * Math.sin(rad(k * 30)), cy - r * Math.cos(rad(k * 30))];
      let b = rect(0, 0, W, H, { fill: wall }) + rect(0, shelf, W, H - shelf, { fill: '#000000', op: 0.12 });
      b += circ(cx + 6, cy + 9, R, { fill: '#000000', op: 0.18 }) + circ(cx, cy, R, { fill: rim }) + circ(cx, cy, R - 12, { fill: face });
      for (let k = 0; k < 60; k++) {
        const major = k % 5 === 0;
        const ang = rad(k * 6);
        const r1 = R - 18;
        const r2 = major ? R - 30 : R - 24;
        b += line(cx + r1 * Math.sin(ang), cy - r1 * Math.cos(ang), cx + r2 * Math.sin(ang), cy - r2 * Math.cos(ang), { stroke: '#374151', sw: major ? 3.5 : 1.5 });
      }
      for (let k = 1; k <= 12; k++) {
        const [nx, ny] = pos(k, rn);
        b += text(nx, ny + 9, labels[k], { size: 25, fill: INK });
      }
      const hourA = rad((h % 12) * 30 + (a === 'hands' ? 0 : m * 0.5));
      const hand = (ang, len, w, color, tail) =>
        line(cx - tail * Math.sin(ang), cy + tail * Math.cos(ang), cx + len * Math.sin(ang), cy - len * Math.cos(ang), { stroke: color, sw: w });
      b += hand(hourA, 50, 9, INK, 10) + hand(rad(m * 6), 78, 6, INK, 12) + hand(rad(sec * 6), 84, 2.5, '#dc2626', 18);
      b += circ(cx, cy, 8, { fill: INK }) + circ(cx, cy, 3.5, { fill: '#dc2626' });
      let region = null;
      if (a === 'thirteen') region = { cx, cy: cy - rn, r: 32 };
      if (a === 'duplicate') { const [qx, qy] = pos(p, rn); region = { cx: qx, cy: qy, r: 32 }; }
      if (a === 'swapped') { const [ax, ay] = pos(p, rn); const [bx, by] = pos(p + 1, rn); region = { cx: (ax + bx) / 2, cy: (ay + by) / 2, r: 44 }; }
      if (a === 'hands') region = { cx, cy, r: 72 };
      return { body: b, region, note: `An ordinary clock showing ${h}:${String(m).padStart(2, '0')}.` };
    },
  },

  trafficlight: {
    label: 'Traffic light',
    anomalies: {
      order: {
        difficulty: 'medium', title: 'An upside-down traffic light',
        explanation: 'Traffic lights always have red at the top and green at the bottom. This one has them the other way around.',
        hint: 'Check the order of the colors on every traffic light.',
        keywords: ['red', 'green', 'order', 'upside down', 'top', 'bottom', 'colors', 'backwards', 'wrong order'],
      },
    },
    render(x, a) {
      const sky = x.pick(SKIES);
      const housing = x.pick(['#1f2937', '#334155', '#27272a', '#a16207']);
      const lit = x.i(0, 2);
      let b = rect(0, 0, W, H, { fill: sky });
      let bx = 0;
      while (bx < W) {
        const bw = x.f(50, 90);
        const bh = x.f(60, 150);
        b += rect(bx, H - bh, bw - 4, bh, { fill: x.pick(['#64748b', '#475569', '#94a3b8', '#7c8798']), op: 0.55 });
        bx += bw;
      }
      b += rect(190, 232, 20, 68, { fill: '#374151' });
      b += rect(138, 16, 124, 224, { rx: 24, fill: housing, stroke: '#0b0f19', sw: 4 });
      const order = a === 'order' ? ['g', 'y', 'r'] : ['r', 'y', 'g'];
      const ON = { r: '#ef4444', y: '#facc15', g: '#22c55e' };
      const OFF = { r: '#5b1a1a', y: '#5a4a10', g: '#14432a' };
      const litColor = ['r', 'y', 'g'][lit];
      order.forEach((c, k) => {
        const cy = 62 + k * 66;
        b += path(`M168 ${fmt(cy - 31)} Q200 ${fmt(cy - 47)} 232 ${fmt(cy - 31)}`, { fill: 'none', stroke: '#0b0f19', sw: 5, cap: 'round' });
        if (c === litColor) b += circ(200, cy, 44, { fill: ON[c], op: 0.3 });
        b += circ(200, cy, 29, { fill: c === litColor ? ON[c] : OFF[c], stroke: '#0b0f19', sw: 3 });
        if (c === litColor) b += circ(190, cy - 9, 7, { fill: '#ffffff', op: 0.5 });
      });
      return { body: b, region: a ? { cx: 200, cy: 128, r: 100 } : null, note: 'A normal traffic light: red on top, green on the bottom.' };
    },
  },

  stopsign: {
    label: 'Stop sign',
    anomalies: {
      spelling: {
        difficulty: 'easy', title: 'A misspelled stop sign',
        explanation: 'The sign is misspelled. It should say STOP.',
        hint: 'Read the words on every sign carefully.',
        keywords: ['spelled', 'spelling', 'misspelled', 'letters', 'stpo', 'sotp', 'wrong word', 'typo', 'says'],
      },
      sides: {
        difficulty: 'hard', title: 'A stop sign with 7 sides',
        explanation: 'A stop sign always has 8 sides (an octagon). This one only has 7.',
        hint: 'Count the sides of every stop sign.',
        keywords: ['7 sides', 'seven sides', 'sides', 'shape', 'octagon', 'heptagon', 'not 8', 'corners', 'edges'],
      },
    },
    render(x, a) {
      const sky = x.pick(SKIES);
      const grass = x.pick(['#86efac', '#4ade80', '#a3e635']);
      const tree = x.chance(0.6);
      const tx = x.pick([60, 340]);
      const cloudX = x.f(60, 340);
      const word = a === 'spelling' ? x.pick(['STPO', 'SOTP']) : x.pick(['STOP', 'STOP']);
      let b = rect(0, 0, W, H, { fill: sky }) + cloud(cloudX, 42, 0.9) + rect(0, 232, W, 68, { fill: grass });
      if (tree) b += rect(tx - 8, 150, 16, 88, { fill: '#7c2d12' }) + circ(tx, 140, 42, { fill: '#15803d' });
      b += rect(194, 180, 12, 112, { fill: '#9ca3af' });
      const n = a === 'sides' ? 7 : 8;
      const start = -90 + 180 / n;
      b += poly(regPoly(200, 112, 92, n, start), { fill: '#ffffff', stroke: '#6b7280', sw: 2 });
      b += poly(regPoly(200, 112, 84, n, start), { fill: '#dc2626' });
      b += text(200, 129, word, { size: 48, fill: '#ffffff', weight: 900 });
      let region = null;
      if (a === 'sides') region = { cx: 200, cy: 112, r: 100 };
      if (a === 'spelling') region = { cx: 200, cy: 113, r: 64 };
      return { body: b, region, note: 'A normal eight-sided stop sign.' };
    },
  },

  die: {
    label: 'Die',
    anomalies: {
      seven: {
        difficulty: 'easy', title: 'A die with seven dots',
        explanation: 'A die only goes up to six dots. This face has seven!',
        hint: 'Count the dots on every face.',
        keywords: ['7', 'seven', 'dots', 'too many dots', 'spots', 'pips'],
      },
      double: {
        difficulty: 'hard', title: 'A die showing the same number twice',
        explanation: 'Each number appears only once on a die, so two visible faces can never show the same number.',
        hint: 'Compare the three faces of each die with each other.',
        keywords: ['same number', 'twice', 'two faces', 'same', 'repeated', 'double', 'duplicate'],
      },
      opposite: {
        difficulty: 'expert', title: 'A die showing two opposite faces',
        explanation: 'Opposite faces of a die always add up to 7 (1-6, 2-5, 3-4), so you can never see both at once. This die shows a pair of opposite faces next to each other.',
        hint: 'On a real die, opposite faces add up to 7.',
        keywords: ['opposite', 'add up to 7', 'add up to seven', 'adds up', 'both visible', 'opposite sides', 'opposite faces'],
      },
    },
    render(x, a) {
      const wall = x.pick(WALLS);
      const table = x.pick(['#92400e', '#78350f', '#a16207', '#57534e']);
      const s = x.pick([
        { front: '#f8fafc', top: '#ffffff', right: '#cbd5e1', pip: INK, edge: '#334155' },
        { front: '#dc2626', top: '#ef4444', right: '#991b1b', pip: '#ffffff', edge: '#450a0a' },
        { front: '#2563eb', top: '#3b82f6', right: '#1e40af', pip: '#ffffff', edge: '#172554' },
        { front: '#1f2937', top: '#374151', right: '#111827', pip: '#ffffff', edge: '#000000' },
        { front: '#16a34a', top: '#22c55e', right: '#166534', pip: '#ffffff', edge: '#052e16' },
      ]);
      const t = x.i(1, 6);
      let fr = x.pick([1, 2, 3, 4, 5, 6].filter((v) => v !== t && v !== 7 - t));
      let rt = x.pick([1, 2, 3, 4, 5, 6].filter((v) => ![t, 7 - t, fr, 7 - fr].includes(v)));
      if (a === 'seven') fr = 7;
      if (a === 'double') rt = fr;
      if (a === 'opposite') rt = 7 - fr;
      const m = (u) => 0.08 + 0.84 * u;
      const front = (u, v) => [135 + 120 * m(u), 120 + 120 * m(v)];
      const top = (u, v) => [135 + 120 * m(u) + 45 * (1 - m(v)), 75 + 45 * m(v)];
      const right = (u, v) => [255 + 45 * m(u), 120 - 45 * m(u) + 120 * m(v)];
      let b = rect(0, 0, W, 180, { fill: wall }) + rect(0, 180, W, 120, { fill: table }) + ell(222, 244, 108, 14, { fill: '#000000', op: 0.25 });
      const edge = { stroke: s.edge, sw: 3 };
      b += poly([[135, 120], [255, 120], [300, 75], [180, 75]], { fill: s.top, ...edge });
      b += poly([[135, 120], [255, 120], [255, 240], [135, 240]], { fill: s.front, ...edge });
      b += poly([[255, 120], [300, 75], [300, 195], [255, 240]], { fill: s.right, ...edge });
      for (const [u, v] of PIPS[t]) { const [px, py] = top(u, v); b += ell(px, py, 9, 5, { fill: s.pip }); }
      for (const [u, v] of PIPS[fr]) { const [px, py] = front(u, v); b += circ(px, py, 10, { fill: s.pip }); }
      for (const [u, v] of PIPS[rt]) { const [px, py] = right(u, v); b += ell(px, py, 5.5, 9, { fill: s.pip }); }
      let region = null;
      if (a === 'seven') region = { cx: 195, cy: 180, r: 68 };
      if (a === 'double') region = { cx: 248, cy: 145, r: 95 };
      if (a === 'opposite') region = { cx: 228, cy: 155, r: 105 };
      return { body: b, region, note: `An ordinary die showing ${t}, ${fr} and ${rt}.` };
    },
  },

  chessboard: {
    label: 'Chessboard',
    anomalies: {
      adjacent: {
        difficulty: 'hard', title: 'A chessboard with two neighboring squares the same color',
        explanation: 'On a real chessboard the squares always alternate colors. Here two neighboring squares are the same color.',
        hint: 'Follow the checkered pattern square by square.',
        keywords: ['same color', 'two squares', 'squares', 'pattern', 'alternate', 'checkered', 'square', 'colors'],
      },
      columns: {
        difficulty: 'expert', title: 'A chessboard with 9 columns',
        explanation: 'A chessboard is always 8 squares by 8 squares. This one has 9 columns.',
        hint: 'Count the squares across each board.',
        keywords: ['9', 'nine', 'columns', 'rows', '8 by 8', 'too many', 'extra column', 'size', 'squares across'],
      },
    },
    render(x, a) {
      const bg = x.pick(['#e2e8f0', '#fde68a', '#d9f99d', '#fecdd3', '#c7d2fe']);
      const [light, dark] = x.pick([['#f0d9b5', '#b58863'], ['#eeeed2', '#769656'], ['#e5e7eb', '#4b5563'], ['#fde68a', '#92400e'], ['#dbeafe', '#1e40af']]);
      const ar = x.i(1, 6);
      const ac = x.i(1, 6);
      const cols = a === 'columns' ? 9 : 8;
      const cw = 240 / cols;
      let b = rect(0, 0, W, H, { fill: bg }) + rect(70, 20, 268, 268, { rx: 8, fill: '#000000', op: 0.2 }) + rect(66, 16, 268, 268, { rx: 8, fill: '#3f2a14' });
      for (let rr = 0; rr < 8; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          let isLight = (rr + cc) % 2 === 0;
          if (a === 'adjacent' && rr === ar && cc === ac) isLight = !isLight;
          b += rect(80 + cc * cw, 30 + rr * 30, cw + 0.4, 30.4, { fill: isLight ? light : dark });
        }
      }
      const count = x.i(5, 9);
      const used = new Set([`${ar},${ac}`]);
      for (let k = 0; k < count; k++) {
        const rr = x.i(0, 7);
        const cc = x.i(0, 7);
        const kind = x.pick(['pawn', 'pawn', 'rook']);
        const white = x.chance(0.5);
        if (used.has(`${rr},${cc}`)) continue;
        used.add(`${rr},${cc}`);
        const px = 80 + (cc + 0.5) * cw;
        const py = 30 + (rr + 0.5) * 30;
        const o = { fill: white ? '#fafafa' : '#111827', stroke: white ? '#111827' : '#fafafa', sw: 1.5 };
        if (kind === 'pawn') b += circ(px, py - 6, 5.5, o) + path(`M${fmt(px - 8)} ${fmt(py + 11)} L${fmt(px - 4)} ${fmt(py - 1)} L${fmt(px + 4)} ${fmt(py - 1)} L${fmt(px + 8)} ${fmt(py + 11)} Z`, o);
        else b += rect(px - 8, py - 10, 16, 21, { rx: 2, ...o }) + rect(px - 10, py - 12, 20, 5, { rx: 1, ...o });
      }
      let region = null;
      if (a === 'adjacent') region = { cx: 80 + (ac + 0.5) * cw, cy: 30 + (ar + 0.5) * 30, r: 32 };
      if (a === 'columns') region = { cx: 200, cy: 150, r: 130 };
      return { body: b, region, note: 'A normal 8-by-8 chessboard.' };
    },
  },

  calendar: {
    label: 'Calendar',
    anomalies: {
      feb30: {
        difficulty: 'medium', title: 'February with 30 days',
        explanation: 'February never has 30 days. It has 28, or 29 in a leap year.',
        hint: 'Check how many days each month has.',
        keywords: ['february', '30', '30 days', 'thirty', 'too many days', 'days', 'leap year', '29', '28'],
      },
      sep31: {
        difficulty: 'hard', title: 'A 30-day month with a 31st',
        explanation: 'This month only has 30 days, but the calendar shows a 31st.',
        hint: '"Thirty days hath September, April, June and November..."',
        keywords: ['31', 'thirty one', '30 days', 'days', 'too many days', 'extra day', 'april', 'june', 'september', 'november'],
      },
      weekday: {
        difficulty: 'medium', title: 'A week with two Wednesdays',
        explanation: 'The days of the week are wrong: Wednesday appears twice and Thursday is missing.',
        hint: 'Read the days of the week across the top of each calendar.',
        keywords: ['wednesday', 'wed', 'thursday', 'thu', 'twice', 'days of the week', 'missing', 'week', 'two wednesdays'],
      },
    },
    render(x, a) {
      const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
      const bg = x.pick(WALLS);
      const band = x.pick(['#dc2626', '#2563eb', '#059669', '#7c3aed', '#ea580c', '#0891b2']);
      let month = x.i(0, 11);
      const year = x.i(2025, 2031);
      const alt = x.pick([3, 5, 8, 10]);
      const mark = x.i(1, 28);
      if (a === 'feb30') month = 1;
      if (a === 'sep31') month = alt;
      const realDays = new Date(year, month + 1, 0).getDate();
      const days = a === 'feb30' ? 30 : a === 'sep31' ? 31 : realDays;
      const first = new Date(year, month, 1).getDay();
      const headers = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      if (a === 'weekday') headers[4] = 'WED';
      const colW = 300 / 7;
      const cellX = (col) => 50 + colW * (col + 0.5);
      let b = rect(0, 0, W, H, { fill: bg }) + rect(56, 24, 300, 266, { rx: 10, fill: '#000000', op: 0.15 }) + rect(50, 18, 300, 266, { rx: 10, fill: '#ffffff' });
      b += rect(50, 18, 300, 52, { rx: 10, fill: band }) + rect(50, 50, 300, 20, { fill: band });
      for (const rx of [110, 170, 230, 290]) b += circ(rx, 18, 6, { fill: '#9ca3af' });
      b += text(200, 54, `${MONTHS[month]} ${year}`, { size: 24, fill: '#ffffff', weight: 800 });
      headers.forEach((d, k) => { b += text(cellX(k), 90, d, { size: 12, fill: k === 6 ? band : '#6b7280', weight: 800 }); });
      let markPos = null;
      let oddPos = null;
      for (let d = 1; d <= days; d++) {
        const idx = first + d - 1;
        const col = idx % 7;
        const row = Math.floor(idx / 7);
        const y = 118 + row * 27;
        b += text(cellX(col), y, String(d), { size: 17, fill: col === 6 ? band : '#1f2937', weight: 600 });
        if (d === mark) markPos = [cellX(col), y - 6];
        if (d === days) oddPos = [cellX(col), y - 6];
      }
      b += circ(markPos[0], markPos[1], 15, { fill: 'none', stroke: '#ef4444', sw: 2.5 });
      let region = null;
      let explanation;
      if (a === 'feb30' || a === 'sep31') region = { cx: oddPos[0], cy: oddPos[1], r: 30 };
      if (a === 'sep31') explanation = `${MONTHS[month][0]}${MONTHS[month].slice(1).toLowerCase()} only has 30 days, but this calendar shows the 31st.`;
      if (a === 'weekday') region = { cx: cellX(4), cy: 86, r: 32 };
      const name = `${MONTHS[month][0]}${MONTHS[month].slice(1).toLowerCase()}`;
      return { body: b, region, explanation, note: `A correct calendar page for ${name} ${year}.` };
    },
  },

  bicycle: {
    label: 'Bicycle',
    anomalies: {
      square: {
        difficulty: 'easy', title: 'A bicycle with a square wheel',
        explanation: 'A wheel has to be round to roll. This bicycle has a square wheel!',
        hint: 'Look closely at the wheels.',
        keywords: ['square', 'wheel', 'not round', 'square wheel', 'shape'],
      },
      chain: {
        difficulty: 'expert', title: 'A bicycle chained to the front wheel',
        explanation: 'The chain runs from the pedals to the FRONT wheel, which has to turn left and right for steering. A bicycle chain always drives the back wheel.',
        hint: 'Follow each bicycle chain from the pedals to where it ends.',
        keywords: ['chain', 'front wheel', 'front', 'back wheel', 'pedals', 'steering'],
      },
    },
    render(x, a) {
      const sky = x.pick(SKIES);
      const frame = x.pick(['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777']);
      const ground = x.pick(['#a3a3a3', '#d6d3d1', '#86efac']);
      const crank = x.f(0, 360);
      const which = x.pick(['front', 'rear']);
      const bushX = x.f(30, 370);
      const Rw = [115, 205];
      const Fw = [285, 205];
      const C = [196, 210];
      const S = [176, 122];
      const Ht = [262, 118];
      const Hb = [270, 142];
      const wheel = ([cx, cy], square) => {
        let w = square
          ? rect(cx - 56, cy - 56, 112, 112, { rx: 8, fill: 'none', stroke: INK, sw: 8 }) + rect(cx - 50, cy - 50, 100, 100, { rx: 6, fill: 'none', stroke: '#9ca3af', sw: 2 })
          : circ(cx, cy, 56, { fill: 'none', stroke: INK, sw: 8 }) + circ(cx, cy, 50, { fill: 'none', stroke: '#9ca3af', sw: 2 });
        for (let k = 0; k < 12; k++) {
          const an = rad(k * 30);
          w += line(cx, cy, cx + 48 * Math.cos(an), cy + 48 * Math.sin(an), { stroke: '#9ca3af', sw: 1.5 });
        }
        return w + circ(cx, cy, 6, { fill: '#4b5563' });
      };
      let b = rect(0, 0, W, H, { fill: sky }) + circ(bushX, 250, 34, { fill: '#22c55e', op: 0.7 }) + circ(bushX + 34, 256, 24, { fill: '#16a34a', op: 0.7 });
      b += rect(0, 262, W, 38, { fill: ground });
      b += wheel(Rw, a === 'square' && which === 'rear') + wheel(Fw, a === 'square' && which === 'front');
      const target = a === 'chain' ? Fw : Rw;
      b += circ(target[0], target[1], 10, { fill: 'none', stroke: '#4b5563', sw: 3 }) + circ(C[0], C[1], 18, { fill: 'none', stroke: '#4b5563', sw: 4 });
      b += line(C[0], C[1] - 18, target[0], target[1] - 10, { stroke: '#374151', sw: 3 }) + line(C[0], C[1] + 18, target[0], target[1] + 10, { stroke: '#374151', sw: 3 });
      const fr = { stroke: frame, sw: 7 };
      b += line(Rw[0], Rw[1], C[0], C[1], fr) + line(Rw[0], Rw[1], S[0], S[1], fr) + line(S[0], S[1], C[0], C[1], fr) + line(S[0], S[1], Ht[0], Ht[1], fr);
      b += line(C[0], C[1], Hb[0], Hb[1], fr) + line(Hb[0], Hb[1], Ht[0], Ht[1], fr) + line(Hb[0], Hb[1], Fw[0], Fw[1], fr);
      b += line(S[0], S[1], 172, 106, { stroke: '#4b5563', sw: 5 }) + rect(153, 98, 40, 10, { rx: 5, fill: INK });
      b += pline([[262, 118], [256, 98], [284, 92]], { stroke: INK, sw: 6 });
      const px = C[0] + 24 * Math.cos(rad(crank));
      const py = C[1] + 24 * Math.sin(rad(crank));
      b += line(C[0], C[1], px, py, { stroke: INK, sw: 6 }) + rect(px - 9, py - 3, 18, 6, { rx: 2, fill: INK });
      let region = null;
      if (a === 'square') region = { cx: which === 'rear' ? Rw[0] : Fw[0], cy: 205, r: 72 };
      if (a === 'chain') region = { cx: 240, cy: 207, r: 62 };
      return { body: b, region, note: 'A normal bicycle with round wheels and the chain on the back wheel.' };
    },
  },

  rainbow: {
    label: 'Rainbow',
    anomalies: {
      order: {
        difficulty: 'medium', title: 'A rainbow in the wrong order',
        explanation: 'A rainbow\'s colors always come in the same order: red, orange, yellow, green, blue, indigo, violet. Two colors here are swapped.',
        hint: 'Read each rainbow\'s colors from the outside in.',
        keywords: ['colors', 'colours', 'order', 'swapped', 'wrong order', 'roygbiv', 'green', 'orange', 'yellow', 'blue'],
      },
    },
    render(x, a) {
      const sky = x.pick(['#7dd3fc', '#93c5fd', '#a5b4fc', '#bae6fd']);
      const hill = x.pick(['#22c55e', '#16a34a', '#4ade80']);
      const sunX = x.pick([50, 350]);
      const Rb = x.f(150, 168);
      const swap = x.pick([[1, 3], [2, 4]]);
      const colors = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#4f46e5', '#a855f7'];
      if (a === 'order') [colors[swap[0]], colors[swap[1]]] = [colors[swap[1]], colors[swap[0]]];
      let b = rect(0, 0, W, H, { fill: sky }) + sun(sunX, 48, 22);
      colors.forEach((c, k) => {
        const r = Rb - k * 13;
        b += path(`M${fmt(200 - r)} 270 A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(200 + r)} 270`, { fill: 'none', stroke: c, sw: 13.5 });
      });
      b += ell(90, 300, 170, 60, { fill: hill }) + ell(330, 305, 160, 55, { fill: hill, op: 0.85 });
      b += cloud(200 - Rb + 40, 262, 1) + cloud(200 + Rb - 40, 262, 1);
      return { body: b, region: a ? { cx: 200, cy: 270 - (Rb - 3 * 13), r: 52 } : null, note: 'A real rainbow: red, orange, yellow, green, blue, indigo, violet.' };
    },
  },

  snowflake: {
    label: 'Snowflake',
    anomalies: {
      eight: {
        difficulty: 'hard', title: 'A snowflake with eight arms',
        explanation: 'Real snowflakes always have six arms because of the way water freezes. This one has eight.',
        hint: 'Count the arms on the big snowflakes.',
        keywords: ['8 arms', 'eight', 'arms', 'points', 'six', '6', 'branches', 'sides', '8'],
      },
    },
    render(x, a) {
      const bg = x.pick(['#0f172a', '#1e3a8a', '#164e63', '#312e81', '#1e293b']);
      const color = x.pick(['#e0f2fe', '#ffffff', '#cffafe']);
      const rot = x.f(0, 60);
      const p = { b1: x.f(0.35, 0.5), b2: x.f(0.62, 0.78), l1: x.f(24, 34), l2: x.f(16, 24) };
      const dots = Array.from({ length: 40 }, () => [x.f(0, W), x.f(0, H), x.f(1, 2.6)]);
      const small = Array.from({ length: 3 }, (_, k) => [[48, 352, 60][k], x.f(40, 260), x.f(18, 26), x.f(0, 60)]);
      const flake = (cx, cy, len, n, r0, sw) => {
        let s = '';
        for (let k = 0; k < n; k++) {
          const an = rad(r0 + (k * 360) / n);
          const dx = Math.cos(an);
          const dy = Math.sin(an);
          s += line(cx, cy, cx + dx * len, cy + dy * len, { stroke: color, sw });
          for (const [f, l] of [[p.b1, p.l1 * len / 105], [p.b2, p.l2 * len / 105]]) {
            const bx = cx + dx * len * f;
            const by = cy + dy * len * f;
            for (const side of [-1, 1]) {
              const ba = an + side * rad(45);
              s += line(bx, by, bx + Math.cos(ba) * l, by + Math.sin(ba) * l, { stroke: color, sw: sw * 0.7 });
            }
          }
        }
        return s + circ(cx, cy, len * 0.13, { fill: color });
      };
      let b = rect(0, 0, W, H, { fill: bg });
      for (const [dx, dy, dr] of dots) b += circ(dx, dy, dr, { fill: '#ffffff', op: 0.6 });
      for (const [sx, sy, sl, sr] of small) b += flake(sx, sy, sl, 6, sr, 2.5);
      b += flake(200, 150, 105, a === 'eight' ? 8 : 6, rot, 7);
      return { body: b, region: a ? { cx: 200, cy: 150, r: 115 } : null, note: 'A real six-armed snowflake.' };
    },
  },

  ladybug: {
    label: 'Ladybug',
    anomalies: {
      legs: {
        difficulty: 'hard', title: 'A ladybug with eight legs',
        explanation: 'Ladybugs are insects, and insects always have six legs. This one has eight!',
        hint: 'Count the legs on every ladybug.',
        keywords: ['8 legs', 'eight legs', 'legs', 'six legs', '6 legs', 'too many legs', 'eight', 'spider'],
      },
    },
    render(x, a) {
      const bg = x.pick(['#bbf7d0', '#fef9c3', '#d9f99d', '#e0f2fe']);
      const leaf = x.pick(['#16a34a', '#22c55e', '#15803d']);
      const shell = x.pick(['#dc2626', '#ef4444', '#ea580c']);
      const tilt = x.f(-25, 25);
      const leafTilt = x.f(-20, 20);
      const pairs = x.i(2, 3);
      const spots = Array.from({ length: pairs }, () => [x.f(14, 40), x.f(-30, 38), x.f(7, 11)]);
      const perSide = a === 'legs' ? 4 : 3;
      let bug = '';
      for (const side of [-1, 1]) {
        for (let k = 0; k < perSide; k++) {
          const y = -32 + (64 * k) / (perSide - 1);
          bug += pline([[side * 48, y], [side * 82, y - 12], [side * 96, y + 8]], { stroke: INK, sw: 6 });
        }
      }
      bug += line(-10, -78, -24, -102, { stroke: INK, sw: 3 }) + line(10, -78, 24, -102, { stroke: INK, sw: 3 });
      bug += circ(-24, -102, 4, { fill: INK }) + circ(24, -102, 4, { fill: INK });
      bug += circ(0, -62, 28, { fill: INK }) + circ(-11, -70, 5, { fill: '#ffffff' }) + circ(11, -70, 5, { fill: '#ffffff' });
      bug += circ(0, 0, 62, { fill: shell, stroke: INK, sw: 3 }) + line(0, -60, 0, 61, { stroke: INK, sw: 4 });
      for (const [sx, sy, sr] of spots) bug += circ(-sx, sy, sr, { fill: INK }) + circ(sx, sy, sr, { fill: INK });
      bug += ell(-24, -30, 12, 7, { fill: '#ffffff', op: 0.3, tf: 'rotate(-30)' });
      let b = rect(0, 0, W, H, { fill: bg });
      b += g(ell(0, 0, 190, 110, { fill: leaf }) + line(-175, 0, 175, 0, { stroke: '#14532d', sw: 4 }), { tf: `translate(200 155) rotate(${fmt(leafTilt)})` });
      b += g(bug, { tf: `translate(200 165) rotate(${fmt(tilt)})` });
      return { body: b, region: a ? { cx: 200, cy: 160, r: 100 } : null, note: 'A real ladybug with six legs.' };
    },
  },

  scale: {
    label: 'Balance scale',
    anomalies: {
      heavy: {
        difficulty: 'medium', title: 'A balance tipping the wrong way',
        explanation: 'On a balance scale the heavier side goes down, but here the side with the light object is the lower one.',
        hint: 'On every balance, ask: which side should be heavier?',
        keywords: ['heavier', 'lighter', 'heavy', 'light', 'feather', 'leaf', 'weight', 'wrong side', 'should go down', 'tilted', 'balance'],
      },
    },
    render(x, a) {
      const wall = x.pick(WALLS);
      const table = x.pick(['#92400e', '#78350f', '#57534e']);
      const metal = x.pick(['#d4d4d8', '#fbbf24', '#cbd5e1']);
      const balanced = x.chance(0.3) && a !== 'heavy';
      const heavySide = x.pick(['left', 'right']);
      const theta = rad(x.f(10, 15));
      const heavy = x.pick(['brick', 'weight', 'books', 'melon']);
      const light = x.pick(['feather', 'leaf']);
      const lower = balanced ? null : a === 'heavy' ? (heavySide === 'left' ? 'right' : 'left') : heavySide;
      const s = lower === 'left' ? 1 : lower === 'right' ? -1 : 0;
      const P = [200, 95];
      const L = [200 - 120 * Math.cos(theta), 95 + s * 120 * Math.sin(theta)];
      const R = [200 + 120 * Math.cos(theta), 95 - s * 120 * Math.sin(theta)];
      const OBJ = {
        brick: (px, py) => rect(px - 30, py - 26, 60, 26, { rx: 2, fill: '#b45309', stroke: '#7c2d12', sw: 2 }) + line(px - 30, py - 13, px + 30, py - 13, { stroke: '#7c2d12', sw: 1.5 })
          + line(px - 6, py - 26, px - 6, py - 13, { stroke: '#7c2d12', sw: 1.5 }) + line(px + 12, py - 13, px + 12, py, { stroke: '#7c2d12', sw: 1.5 }),
        weight: (px, py) => path(`M${fmt(px - 24)} ${fmt(py)} L${fmt(px - 17)} ${fmt(py - 34)} L${fmt(px + 17)} ${fmt(py - 34)} L${fmt(px + 24)} ${fmt(py)} Z`, { fill: '#374151' })
          + rect(px - 8, py - 44, 16, 12, { rx: 4, fill: 'none', stroke: '#374151', sw: 4 }) + text(px, py - 11, '5 kg', { size: 12, fill: '#ffffff' }),
        books: (px, py) => rect(px - 30, py - 12, 60, 12, { rx: 2, fill: '#2563eb' }) + rect(px - 26, py - 24, 54, 12, { rx: 2, fill: '#dc2626' }) + rect(px - 28, py - 36, 56, 12, { rx: 2, fill: '#16a34a' }),
        melon: (px, py) => ell(px, py - 22, 34, 22, { fill: '#15803d' }) + path(`M${fmt(px - 20)} ${fmt(py - 38)} Q${fmt(px - 26)} ${fmt(py - 22)} ${fmt(px - 20)} ${fmt(py - 6)}`, { fill: 'none', stroke: '#86efac', sw: 3 })
          + path(`M${fmt(px + 8)} ${fmt(py - 43)} Q${fmt(px + 2)} ${fmt(py - 22)} ${fmt(px + 8)} ${fmt(py - 1)}`, { fill: 'none', stroke: '#86efac', sw: 3 }),
        feather: (px, py) => path(`M${fmt(px - 36)} ${fmt(py - 2)} Q${fmt(px - 6)} ${fmt(py - 34)} ${fmt(px + 34)} ${fmt(py - 26)} Q${fmt(px + 4)} ${fmt(py - 2)} ${fmt(px - 36)} ${fmt(py - 2)} Z`, { fill: '#c4b5fd', stroke: '#5b21b6', sw: 2 })
          + line(px - 38, py, px + 32, py - 25, { stroke: '#4c1d95', sw: 2 }),
        leaf: (px, py) => path(`M${fmt(px - 30)} ${fmt(py - 4)} Q${fmt(px)} ${fmt(py - 30)} ${fmt(px + 30)} ${fmt(py - 4)} Q${fmt(px)} ${fmt(py + 6)} ${fmt(px - 30)} ${fmt(py - 4)} Z`, { fill: '#65a30d' })
          + line(px - 26, py - 4, px + 26, py - 6, { stroke: '#365314', sw: 1.5 }),
      };
      const pan = ([ex, ey]) => line(ex, ey, ex - 40, ey + 80, { stroke: '#6b7280', sw: 2 }) + line(ex, ey, ex + 40, ey + 80, { stroke: '#6b7280', sw: 2 })
        + path(`M${fmt(ex - 46)} ${fmt(ey + 80)} Q${fmt(ex)} ${fmt(ey + 106)} ${fmt(ex + 46)} ${fmt(ey + 80)} Z`, { fill: metal, stroke: '#52525b', sw: 2 });
      let b = rect(0, 0, W, H, { fill: wall }) + rect(0, 262, W, 38, { fill: table });
      b += path('M150 264 L170 244 L230 244 L250 264 Z', { fill: '#52525b' }) + rect(193, 95, 14, 152, { fill: '#71717a' });
      b += pan(L) + pan(R);
      const leftObj = balanced ? heavy : heavySide === 'left' ? heavy : light;
      const rightObj = balanced ? heavy : heavySide === 'left' ? light : heavy;
      b += OBJ[leftObj](L[0], L[1] + 82) + OBJ[rightObj](R[0], R[1] + 82);
      b += line(L[0], L[1], R[0], R[1], { stroke: '#3f3f46', sw: 7 }) + circ(P[0], P[1], 10, { fill: '#3f3f46' }) + circ(P[0], P[1] - 16, 6, { fill: '#3f3f46' });
      const low = lower === 'left' ? L : R;
      return {
        body: b,
        region: a ? { cx: low[0], cy: low[1] + 70, r: 58 } : null,
        note: balanced ? 'A balance with two equal objects, so it stays level.' : 'A normal balance: the heavy side is lower.',
      };
    },
  },

  glass: {
    label: 'Glass of water',
    anomalies: {
      tilted: {
        difficulty: 'expert', title: 'Water that tilts with its glass',
        explanation: 'Water always stays level, even when the glass leans. Here the water\'s surface tilts along with the glass.',
        hint: 'Look at the top surface of the water in each glass.',
        keywords: ['water', 'level', 'tilted', 'surface', 'slanted', 'flat', 'gravity', 'crooked', 'straight'],
      },
    },
    render(x, a) {
      const wall = x.pick(WALLS);
      const table = x.pick(['#92400e', '#78350f', '#a16207', '#57534e']);
      const tilt = x.f(15, 26) * x.pick([-1, 1]);
      const hw = x.f(50, 92);
      const water = x.pick(['#38bdf8', '#60a5fa', '#22d3ee']);
      const book = x.pick(['#dc2626', '#2563eb', '#16a34a', '#7c3aed']);
      const outerL = [[-44, 0], [44, 0], [54, -150], [-54, -150]];
      const innerL = [[-38, -6], [38, -6], [47, -146], [-47, -146]];
      const rot = (p) => rotPt(p, [0, 0], tilt);
      const outerR = outerL.map(rot);
      const dy = 246 - Math.max(...outerR.map((p) => p[1]));
      const toW = (p) => { const [rx, ry] = rot(p); return [200 + rx, ry + dy]; };
      const outer = outerL.map(toW);
      const inner = innerL.map(toW);
      const bottom = [outer[0], outer[1]].sort((p, q) => p[1] - q[1]);
      const raised = bottom[0];
      const Q = toW([0, -hw]);
      const spread = (9 * hw) / 140;
      const waterPoly = a === 'tilted'
        ? [[-38, -6], [38, -6], [38 + spread, -hw], [-38 - spread, -hw]].map(toW)
        : clipBelow(inner, Q[1]);
      let b = rect(0, 0, W, H, { fill: wall }) + rect(0, 246, W, 54, { fill: table });
      b += rect(raised[0] - 36, raised[1], 72, 246 - raised[1], { rx: 3, fill: book });
      b += line(raised[0] - 30, raised[1] + 5, raised[0] + 30, raised[1] + 5, { stroke: '#ffffff', sw: 2, op: 0.6 });
      b += poly(waterPoly, { fill: water, stroke: '#e0f2fe', sw: 2, op: 0.8 });
      b += poly(outer, { fill: '#ffffff', stroke: '#e2e8f0', sw: 4, op: 0.35 });
      b += poly(outer, { fill: 'none', stroke: '#f8fafc', sw: 4 });
      const s1 = toW([-34, -20]);
      const s2 = toW([-44, -128]);
      b += line(s1[0], s1[1], s2[0], s2[1], { stroke: '#ffffff', sw: 4, op: 0.6 });
      return { body: b, region: a ? { cx: Q[0], cy: Q[1], r: 58 } : null, note: 'A leaning glass with a level water surface, just like real water.' };
    },
  },

  tictactoe: {
    label: 'Tic-tac-toe game',
    anomalies: {
      counts: {
        difficulty: 'expert', title: 'A tic-tac-toe game where X played too many times',
        explanation: 'Players take turns, so X can never be more than one move ahead of O. Here X has played three more times than O.',
        hint: 'Count the X\'s and O\'s on each board.',
        keywords: ['too many x', 'turns', 'count', 'more x', 'x has more', 'extra x', 'moves', 'cheating', 'too many', 'xs'],
      },
      twowinners: {
        difficulty: 'insane', title: 'A tic-tac-toe game with two winners',
        explanation: 'Both X and O have three in a row, but the game ends as soon as one player wins, so both can never win.',
        hint: 'Look for three in a row on every board.',
        keywords: ['both win', 'two winners', 'both', 'three in a row', 'both have', 'game would have ended', 'two lines', 'both won'],
      },
    },
    render(x, a) {
      const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      const wins = (cells, m) => LINES.some((l) => l.every((k) => cells[k] === m));
      const chalk = x.chance(0.5);
      const nx = x.i(2, 4);
      const lag = x.i(0, 1);
      const bigX = x.i(4, 5);
      const useRows = x.chance(0.5);
      const i1 = x.i(0, 2);
      let i2 = x.i(0, 1);
      if (i2 >= i1) i2++;
      let cells = Array(9).fill('');
      if (a === 'twowinners') {
        const lineOf = (k) => (useRows ? [k * 3, k * 3 + 1, k * 3 + 2] : [k, k + 3, k + 6]);
        lineOf(i1).forEach((k) => (cells[k] = 'X'));
        lineOf(i2).forEach((k) => (cells[k] = 'O'));
      } else {
        const want = a === 'counts' ? { X: bigX, O: bigX - 3 } : { X: nx, O: nx - lag };
        let ok = false;
        for (let tries = 0; tries < 600 && !ok; tries++) {
          const order = x.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
          cells = Array(9).fill('');
          order.slice(0, want.X).forEach((k) => (cells[k] = 'X'));
          order.slice(want.X, want.X + want.O).forEach((k) => (cells[k] = 'O'));
          ok = !wins(cells, 'X') && !wins(cells, 'O');
        }
        if (!ok) cells = a === 'counts' ? ['X', 'X', '', 'X', 'O', 'X', '', 'X', 'O'] : ['X', 'O', '', '', 'X', '', 'O', '', ''];
      }
      const ink = chalk ? { bg: '#14532d', grid: '#e5e7eb', X: '#f8fafc', O: '#fde68a' } : { bg: '#fefce8', grid: '#1f2937', X: '#1d4ed8', O: '#dc2626' };
      let b = rect(0, 0, W, H, { fill: chalk ? '#78350f' : '#e2e8f0' }) + rect(14, 12, 372, 276, { rx: 10, fill: ink.bg });
      for (const p of [167, 233]) b += line(p, 52, p, 248, { stroke: ink.grid, sw: 6, op: 0.9 }) + line(101, p - 50, 299, p - 50, { stroke: ink.grid, sw: 6, op: 0.9 });
      cells.forEach((c, k) => {
        const cx = 134 + (k % 3) * 66;
        const cy = 84 + Math.floor(k / 3) * 66;
        if (c === 'X') b += line(cx - 19, cy - 19, cx + 19, cy + 19, { stroke: ink.X, sw: 7 }) + line(cx + 19, cy - 19, cx - 19, cy + 19, { stroke: ink.X, sw: 7 });
        if (c === 'O') b += circ(cx, cy, 21, { fill: 'none', stroke: ink.O, sw: 7 });
      });
      const nX = cells.filter((c) => c === 'X').length;
      const nO = cells.filter((c) => c === 'O').length;
      return { body: b, region: a ? { cx: 200, cy: 150, r: 118 } : null, note: `A normal game in progress (${nX} X's, ${nO} O's, nobody has won yet).` };
    },
  },

  domino: {
    label: 'Dominoes',
    anomalies: {
      seven: {
        difficulty: 'hard', title: 'A domino with seven dots',
        explanation: 'A standard domino set only goes up to six dots on each half. One half here has seven.',
        hint: 'Count the dots on each half of every domino.',
        keywords: ['7', 'seven', 'dots', 'too many dots', 'pips', 'spots', 'more than six'],
      },
    },
    render(x, a) {
      const felt = x.pick(['#166534', '#1e3a8a', '#78350f', '#3f3f46', '#0f766e']);
      const st = x.pick([
        { tile: '#fffbeb', pip: INK, edge: '#a8a29e' },
        { tile: '#111827', pip: '#ffffff', edge: '#000000' },
        { tile: '#f8fafc', pip: '#b91c1c', edge: '#94a3b8' },
      ]);
      const bases = [[115, 75], [285, 150], [125, 228]];
      const tiles = bases.map(([bx, by]) => ({ cx: bx + x.f(-12, 12), cy: by + x.f(-8, 8), rot: x.f(-10, 10), v: [x.i(0, 6), x.i(0, 6)] }));
      const ak = x.i(0, 2);
      const ah = x.i(0, 1);
      if (a === 'seven') tiles[ak].v[ah] = 7;
      let b = rect(0, 0, W, H, { fill: felt });
      for (const t of tiles) {
        let s = rect(t.cx - 77, t.cy - 33, 160, 72, { rx: 10, fill: '#000000', op: 0.25 });
        s += rect(t.cx - 80, t.cy - 36, 160, 72, { rx: 10, fill: st.tile, stroke: st.edge, sw: 3 });
        s += line(t.cx, t.cy - 28, t.cx, t.cy + 28, { stroke: st.edge, sw: 3 });
        t.v.forEach((val, half) => {
          const hx = t.cx + (half ? 40 : -40);
          for (const [u, v] of PIPS[val]) s += circ(hx - 26 + 52 * u, t.cy - 26 + 52 * v, 6.5, { fill: st.pip });
        });
        b += g(s, { tf: `rotate(${fmt(t.rot)} ${fmt(t.cx)} ${fmt(t.cy)})` });
      }
      let region = null;
      if (a === 'seven') {
        const t = tiles[ak];
        const [rx, ry] = rotPt([t.cx + (ah ? 40 : -40), t.cy], [t.cx, t.cy], t.rot);
        region = { cx: rx, cy: ry, r: 42 };
      }
      return { body: b, region, note: 'Ordinary dominoes, none with more than six dots on a half.' };
    },
  },

  gears: {
    label: 'Gears',
    anomalies: {
      same: {
        difficulty: 'expert', title: 'Meshing gears turning the same way',
        explanation: 'When two gears mesh, they always turn in opposite directions. The arrows here show two touching gears turning the same way.',
        hint: 'Check which way each arrow says its gear turns.',
        keywords: ['same direction', 'direction', 'arrows', 'both clockwise', 'opposite', 'same way', 'turn', 'spin'],
      },
    },
    render(x, a) {
      const bg = x.pick(['#e2e8f0', '#fef3c7', '#dbeafe', '#ede9fe', '#1e293b']);
      const metal = x.pick(['#94a3b8', '#d97706', '#64748b', '#b45309']);
      const metal2 = x.pick(['#cbd5e1', '#f59e0b', '#9ca3af', '#a16207']);
      const three = x.chance(0.5);
      const startCw = x.chance(0.5);
      const phase = x.f(0, 30);
      const gears = three ? [{ cx: 95, r: 52 }, { cx: 189, r: 42 }, { cx: 283, r: 52 }] : [{ cx: 140, r: 70 }, { cx: 258, r: 48 }];
      const dirs = gears.map((_, k) => ((k % 2 === 0) === startCw ? 'cw' : 'ccw'));
      if (a === 'same') dirs[1] = dirs[0];
      const arrowColor = bg === '#1e293b' ? '#f8fafc' : '#1f2937';
      let b = rect(0, 0, W, H, { fill: bg });
      gears.forEach((gr, k) => {
        const cy = 168;
        const n = Math.round((2 * Math.PI * gr.r) / 22);
        const step = 360 / n;
        const ph = phase + (k % 2 ? step / 2 : 0);
        const ptsArr = [];
        for (let t = 0; t < n; t++) {
          const a0 = ph + t * step;
          for (const [f, rr] of [[0, gr.r - 6], [0.2, gr.r + 7], [0.5, gr.r + 7], [0.7, gr.r - 6]]) {
            const an = rad(a0 + f * step);
            ptsArr.push([gr.cx + rr * Math.cos(an), cy + rr * Math.sin(an)]);
          }
        }
        b += poly(ptsArr, { fill: k % 2 ? metal2 : metal, stroke: '#3f3f46', sw: 2 });
        b += circ(gr.cx, cy, gr.r * 0.6, { fill: 'none', stroke: '#3f3f46', sw: 2, op: 0.5 });
        for (let h = 0; h < 5; h++) {
          const an = rad(ph + h * 72);
          b += circ(gr.cx + gr.r * 0.38 * Math.cos(an), cy + gr.r * 0.38 * Math.sin(an), gr.r * 0.1, { fill: bg });
        }
        b += circ(gr.cx, cy, 8, { fill: '#27272a' });
        // Rotation arrow over the top of the gear.
        const ar = gr.r + 22;
        const P = (deg) => [gr.cx + ar * Math.cos(rad(deg)), cy + ar * Math.sin(rad(deg))];
        const [x1, y1] = P(-125);
        const [x2, y2] = P(-55);
        b += path(`M${fmt(x1)} ${fmt(y1)} A${fmt(ar)} ${fmt(ar)} 0 0 1 ${fmt(x2)} ${fmt(y2)}`, { fill: 'none', stroke: arrowColor, sw: 5, cap: 'round' });
        const endDeg = dirs[k] === 'cw' ? -55 : -125;
        const [ex, ey] = P(endDeg);
        const tan = dirs[k] === 'cw' ? [-Math.sin(rad(endDeg)), Math.cos(rad(endDeg))] : [Math.sin(rad(endDeg)), -Math.cos(rad(endDeg))];
        const nrm = [-tan[1], tan[0]];
        b += poly([[ex + tan[0] * 13, ey + tan[1] * 13], [ex + nrm[0] * 9 - tan[0] * 4, ey + nrm[1] * 9 - tan[1] * 4], [ex - nrm[0] * 9 - tan[0] * 4, ey - nrm[1] * 9 - tan[1] * 4]], { fill: arrowColor });
      });
      const mesh = gears[0].cx + gears[0].r;
      return { body: b, region: a ? { cx: mesh, cy: 128, r: 85 } : null, note: 'Meshing gears correctly turning in opposite directions.' };
    },
  },

  candle: {
    label: 'Candles',
    anomalies: {
      flame: {
        difficulty: 'easy', title: 'A candle flame pointing down',
        explanation: 'Flames always point up because hot air rises. One flame here points down!',
        hint: 'Look at the flames.',
        keywords: ['flame', 'upside down', 'down', 'fire', 'pointing down', 'backwards', 'downward'],
      },
    },
    render(x, a) {
      const wall = x.pick(['#1e1b4b', '#312e81', '#3b0764', '#0f172a', '#422006']);
      const tableC = x.pick(['#78350f', '#57534e', '#7c2d12']);
      const n = x.i(1, 3);
      const k = x.i(0, n - 1);
      const xs = n === 1 ? [200] : n === 2 ? [140, 260] : [100, 200, 300];
      const candles = xs.map((cx) => ({
        cx: cx + x.f(-10, 10), h: x.f(70, 140),
        wax: x.pick(['#fef3c7', '#fde68a', '#fecaca', '#bfdbfe', '#ffffff', '#bbf7d0']),
        holder: x.pick(['#d4d4d8', '#fbbf24', '#a16207']),
      }));
      let b = rect(0, 0, W, H, { fill: wall }) + rect(0, 250, W, 50, { fill: tableC });
      let region = null;
      candles.forEach((c, i) => {
        const topY = 232 - c.h;
        const wick = topY - 10;
        b += circ(c.cx, wick, 52, { fill: '#fde047', op: 0.15 });
        b += ell(c.cx, 248, 44, 9, { fill: c.holder }) + rect(c.cx - 26, 232, 52, 16, { rx: 6, fill: c.holder });
        b += rect(c.cx - 16, topY, 32, c.h, { rx: 3, fill: c.wax });
        b += path(`M${fmt(c.cx - 16)} ${fmt(topY + 4)} Q${fmt(c.cx - 10)} ${fmt(topY + 26)} ${fmt(c.cx - 4)} ${fmt(topY + 4)} Z`, { fill: c.wax, stroke: '#00000022', sw: 1 });
        b += line(c.cx, topY, c.cx, wick, { stroke: INK, sw: 2.5 });
        const down = a === 'flame' && i === k;
        b += g(path('M0 -46 C14 -24 13 -4 0 0 C-13 -4 -14 -24 0 -46 Z', { fill: '#f59e0b' }) + path('M0 -30 C7 -17 6 -5 0 -2 C-6 -5 -7 -17 0 -30 Z', { fill: '#fef08a' }),
          { tf: down ? `translate(${fmt(c.cx)} ${fmt(wick)}) scale(1 -1)` : `translate(${fmt(c.cx)} ${fmt(wick)}) scale(1 1)` });
        if (down) region = { cx: c.cx, cy: wick + 23, r: 40 };
      });
      return { body: b, region, note: 'Ordinary candles with flames pointing up.' };
    },
  },

  weather: {
    label: 'Thermometer',
    anomalies: {
      mismatch: {
        difficulty: 'easy', title: 'A thermometer that doesn\'t match the weather',
        explanation: 'The temperature on the thermometer is impossible for the weather in the picture.',
        hint: 'Compare each thermometer with the weather around it.',
        keywords: ['temperature', 'thermometer', 'hot', 'cold', 'degrees', 'melt', 'freezing', 'snow', 'weather', 'summer', 'winter'],
      },
    },
    render(x, a) {
      const winter = x.chance(0.5);
      const tNormal = winter ? x.i(5, 30) : x.i(75, 95);
      const tOdd = winter ? x.i(92, 100) : x.i(-5, 15);
      const temp = a === 'mismatch' ? tOdd : tNormal;
      const trees = [x.f(30, 70), x.f(190, 240)];
      const flakes = Array.from({ length: 30 }, () => [x.f(0, 270), x.f(0, 230)]);
      const flowers = Array.from({ length: 6 }, () => [x.f(20, 250), x.f(245, 290), x.pick(['#f472b6', '#facc15', '#f87171', '#a78bfa'])]);
      let b;
      if (winter) {
        b = rect(0, 0, W, H, { fill: '#cbd5e1' }) + ell(140, 300, 260, 80, { fill: '#f8fafc' }) + rect(0, 240, W, 60, { fill: '#f1f5f9' });
        for (const tx of trees) b += rect(tx - 5, 196, 10, 30, { fill: '#7c2d12' }) + poly([[tx - 30, 200], [tx, 120], [tx + 30, 200]], { fill: '#166534' }) + poly([[tx - 12, 152], [tx, 120], [tx + 12, 152]], { fill: '#f8fafc' });
        b += circ(140, 226, 30, { fill: '#ffffff', stroke: '#94a3b8', sw: 2 }) + circ(140, 180, 22, { fill: '#ffffff', stroke: '#94a3b8', sw: 2 }) + circ(140, 146, 16, { fill: '#ffffff', stroke: '#94a3b8', sw: 2 });
        b += circ(134, 142, 2.5, { fill: INK }) + circ(146, 142, 2.5, { fill: INK }) + poly([[140, 148], [158, 151], [140, 153]], { fill: '#f97316' });
        for (const [fx, fy] of flakes) b += circ(fx, fy, 2.5, { fill: '#ffffff' });
      } else {
        b = rect(0, 0, W, H, { fill: '#7dd3fc' }) + sun(56, 52, 26) + rect(0, 236, W, 64, { fill: '#4ade80' });
        b += rect(trees[1] - 8, 160, 16, 80, { fill: '#7c2d12' }) + circ(trees[1], 140, 44, { fill: '#16a34a' });
        for (const [fx, fy, fc] of flowers) b += line(fx, fy, fx, fy + 12, { stroke: '#15803d', sw: 2 }) + circ(fx, fy, 6, { fill: fc });
      }
      const yOf = (t) => 186 - ((t + 20) / 130) * 128;
      b += rect(276, 34, 64, 196, { rx: 12, fill: '#ffffff', stroke: '#64748b', sw: 2 }) + rect(302, 50, 12, 142, { rx: 6, fill: '#e5e7eb' });
      for (let t = -20; t <= 100; t += 20) b += line(316, yOf(t), 324, yOf(t), { stroke: '#475569', sw: 2 }) + text(332, yOf(t) + 3.5, String(t), { size: 9, anchor: 'start', fill: '#334155' });
      b += rect(304, yOf(temp), 8, 192 - yOf(temp), { fill: '#dc2626' }) + circ(308, 198, 14, { fill: '#dc2626' });
      b += rect(268, 238, 80, 36, { rx: 10, fill: INK }) + text(308, 263, `${temp}°F`, { size: 20, fill: '#ffffff' });
      let explanation;
      if (a === 'mismatch') {
        explanation = winter
          ? `The thermometer says ${temp}°F, which is very hot, but there is snow everywhere and the snowman isn't melting!`
          : `It's a sunny summer day with flowers and green grass, but the thermometer says ${temp}°F, which is below freezing.`;
      }
      return {
        body: b,
        region: a ? { cx: 308, cy: 152, r: 75 } : null,
        explanation,
        note: winter ? `A cold winter day at ${temp}°F.` : `A warm summer day at ${temp}°F.`,
      };
    },
  },

  keyboard: {
    label: 'Keyboard',
    anomalies: {
      swap: {
        difficulty: 'expert', title: 'A keyboard with two letters swapped',
        explanation: 'Keyboard letters are always in the same QWERTY order. Two neighboring keys here are swapped.',
        hint: 'Read each keyboard row from left to right: Q W E R T Y...',
        keywords: ['letters', 'swapped', 'keys', 'order', 'wrong order', 'switched', 'qwerty', 'backwards'],
      },
    },
    render(x, a) {
      const desk = x.pick(['#fde68a', '#e2e8f0', '#bbf7d0', '#fbcfe8', '#c7d2fe']);
      const dark = x.chance(0.5);
      const body = dark ? '#1f2937' : '#e5e7eb';
      const key = dark ? '#374151' : '#ffffff';
      const ink = dark ? '#f9fafb' : INK;
      const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((r) => r.split(''));
      const sr = x.i(0, 2);
      const si = x.i(0, rows[sr].length - 2);
      const pressR = x.i(0, 2);
      const pressI = x.i(0, rows[pressR].length - 1);
      if (a === 'swap') [rows[sr][si], rows[sr][si + 1]] = [rows[sr][si + 1], rows[sr][si]];
      const offs = [17.5, 36, 72];
      let b = rect(0, 0, W, H, { fill: desk }) + rect(16, 76, 380, 176, { rx: 16, fill: '#000000', op: 0.15 }) + rect(10, 70, 380, 176, { rx: 16, fill: body });
      let region = null;
      rows.forEach((row, r) => {
        row.forEach((ch, i) => {
          const kx = offs[r] + i * 37;
          const ky = 84 + r * 40;
          const pressed = r === pressR && i === pressI;
          b += rect(kx, ky, 32, 34, { rx: 6, fill: pressed ? (dark ? '#4b5563' : '#dbeafe') : key, stroke: dark ? '#111827' : '#9ca3af', sw: 1.5 });
          b += text(kx + 16, ky + 23, ch, { size: 17, fill: ink });
        });
      });
      b += rect(110, 206, 180, 28, { rx: 6, fill: key, stroke: dark ? '#111827' : '#9ca3af', sw: 1.5 });
      if (a === 'swap') region = { cx: offs[sr] + si * 37 + 34.5, cy: 84 + sr * 40 + 17, r: 42 };
      return { body: b, region, note: 'A normal QWERTY keyboard.' };
    },
  },

  shadows: {
    label: 'Shadows',
    anomalies: {
      wrong: {
        difficulty: 'expert', title: 'A shadow pointing toward the sun',
        explanation: 'With only one sun, every shadow points away from it. One shadow here points the opposite way.',
        hint: 'Find the sun in each picture, then check every shadow.',
        keywords: ['shadow', 'shadows', 'wrong way', 'direction', 'opposite', 'toward the sun', 'sun', 'other way'],
      },
    },
    render(x, a) {
      const sky = x.pick(SKIES);
      const ground = x.pick(['#86efac', '#fde68a', '#bbf7d0', '#d9f99d']);
      const sunLeft = x.chance(0.5);
      const kinds = x.shuffle(['tree', 'lamp', 'mailbox', 'tree', 'post']).slice(0, 3);
      const k = x.i(0, 2);
      const d = sunLeft ? 1 : -1;
      const cloudX = x.f(150, 250);
      let b = rect(0, 0, W, H, { fill: sky }) + sun(sunLeft ? 56 : 344, 52, 26) + cloud(cloudX, 46, 0.8) + rect(0, 192, W, 108, { fill: ground });
      let region = null;
      [86, 200, 314].forEach((ox, i) => {
        const kind = kinds[i];
        const dir = a === 'wrong' && i === k ? -d : d;
        const len = kind === 'tree' ? 90 : kind === 'lamp' ? 84 : 60;
        const w = kind === 'tree' ? 9 : kind === 'lamp' ? 5 : 7;
        b += poly([[ox - w, 194], [ox + w, 194], [ox + w + dir * len, 218], [ox - w + dir * len, 218]], { fill: '#000000', op: 0.28 });
        b += ell(ox + dir * len, 218, kind === 'tree' ? 32 : kind === 'post' ? 26 : 16, kind === 'tree' ? 11 : 6, { fill: '#000000', op: 0.28 });
        if (kind === 'tree') b += rect(ox - 8, 122, 16, 72, { fill: '#7c2d12' }) + circ(ox, 110, 38, { fill: '#16a34a' });
        if (kind === 'lamp') b += rect(ox - 4, 96, 8, 98, { fill: '#374151' }) + rect(ox - 15, 84, 30, 14, { rx: 4, fill: '#374151' }) + circ(ox, 101, 5, { fill: '#fde047' });
        if (kind === 'mailbox') b += rect(ox - 5, 150, 10, 44, { fill: '#78350f' }) + rect(ox - 24, 126, 48, 28, { rx: 10, fill: '#2563eb' }) + rect(ox + 14, 112, 4, 18, { fill: '#dc2626' });
        if (kind === 'post') b += rect(ox - 7, 140, 14, 54, { fill: '#a16207' }) + rect(ox - 30, 150, 60, 8, { fill: '#a16207' });
        if (a === 'wrong' && i === k) region = { cx: ox + (dir * len) / 2, cy: 208, r: Math.max(48, len / 2 + 14) };
      });
      return { body: b, region, note: 'Every shadow points away from the sun.' };
    },
  },

  lake: {
    label: 'Lake reflection',
    anomalies: {
      unreversed: {
        difficulty: 'insane', title: 'A reflection with readable words',
        explanation: 'Reflections in water are upside down. Everything in this reflection is flipped except the words on the sign, which read normally.',
        hint: 'Compare each sign with its reflection in the water.',
        keywords: ['reflection', 'upside down', 'words', 'text', 'sign', 'letters', 'not flipped', 'backwards', 'mirror', 'reads normally'],
      },
    },
    render(x, a) {
      const sky = x.pick(['#bae6fd', '#fde68a', '#fbcfe8', '#c7d2fe']);
      const water = x.pick(['#0369a1', '#1d4ed8', '#0e7490']);
      const mtn = x.pick(['#64748b', '#6b7280', '#475569']);
      const word = x.pick(['LAKE', 'PARK', 'FISH', 'BOATS', 'TRAIL', 'BIRDS']);
      const sx = x.f(130, 270);
      const peaks = [[x.f(40, 120), x.f(60, 100)], [x.f(160, 240), x.f(50, 90)], [x.f(280, 360), x.f(60, 100)]];
      const trees = Array.from({ length: 4 }, () => [x.f(20, 380), x.f(30, 50)]);
      const hx = x.chance(0.5) ? x.f(40, 90) : x.f(310, 360);
      const ripples = Array.from({ length: 8 }, () => [x.f(10, 340), x.f(195, 290), x.f(20, 50)]);
      let above = '';
      for (const [px, py] of peaks) above += poly([[px - 85, 180], [px, py], [px + 85, 180]], { fill: mtn }) + poly([[px - 18, py + 20], [px, py], [px + 18, py + 20]], { fill: '#f8fafc' });
      for (const [tx, th] of trees) above += rect(tx - 3, 168, 6, 12, { fill: '#7c2d12' }) + poly([[tx - th * 0.45, 170], [tx, 170 - th], [tx + th * 0.45, 170]], { fill: '#15803d' });
      above += rect(hx - 22, 150, 44, 30, { fill: '#fef3c7' }) + poly([[hx - 28, 152], [hx, 130], [hx + 28, 152]], { fill: '#b91c1c' }) + rect(hx - 6, 164, 12, 16, { fill: '#7c2d12' });
      above += rect(sx - 30, 150, 5, 30, { fill: '#78350f' }) + rect(sx + 25, 150, 5, 30, { fill: '#78350f' }) + rect(sx - 44, 122, 88, 32, { rx: 4, fill: '#92400e' });
      let b = rect(0, 0, W, 182, { fill: sky }) + above + text(sx, 145, word, { size: 18, fill: '#ffffff', weight: 800 });
      b += rect(0, 180, W, 120, { fill: water });
      b += g(above, { op: 0.45, tf: 'matrix(1 0 0 -1 0 360)' });
      b += text(sx, a === 'unreversed' ? 228 : 145, word, { size: 18, fill: '#ffffff', weight: 800, op: 0.45, tf: a === 'unreversed' ? 'matrix(1 0 0 1 0 0)' : 'matrix(1 0 0 -1 0 360)' });
      for (const [rx, ry, rw] of ripples) b += line(rx, ry, rx + rw, ry, { stroke: '#ffffff', sw: 2, op: 0.35 });
      b += rect(0, 179, W, 3, { fill: '#ffffff', op: 0.5 });
      return { body: b, region: a ? { cx: sx, cy: 222, r: 54 } : null, note: 'A calm lake with an upside-down reflection.' };
    },
  },

  hourglass: {
    label: 'Hourglass',
    anomalies: {
      upward: {
        difficulty: 'easy', title: 'An hourglass with sand stuck to the top',
        explanation: 'Sand falls down. In this hourglass the sand in the top half is stuck to the ceiling instead of resting at the bottom of the bulb.',
        hint: 'Look at where the sand sits inside each hourglass.',
        keywords: ['sand', 'upside down', 'top', 'gravity', 'floating', 'ceiling', 'falling up', 'stuck'],
      },
    },
    render(x, a) {
      const bg = x.pick(WALLS);
      const wood = x.pick(['#92400e', '#78350f', '#a16207', '#57534e']);
      const sand = x.pick(['#f59e0b', '#fbbf24', '#d97706', '#fcd34d']);
      const t = x.f(0.25, 0.75);
      const hwTop = (y) => 5 + 45 * Math.sqrt(Math.min(1, Math.max(0, (150 - y) / 96)));
      const hwBot = (y) => 5 + 45 * Math.sqrt(Math.min(1, Math.max(0, (y - 150) / 96)));
      const sideL = [];
      for (let y = 54; y <= 150; y += 8) sideL.push([200 - hwTop(y), y]);
      for (let y = 158; y <= 246; y += 8) sideL.push([200 - hwBot(y), y]);
      const glass = [...sideL, ...sideL.map(([sx, sy]) => [400 - sx, sy]).reverse()];
      const hs = 14 + 56 * t;
      const span = (y0, y1, hw) => {
        const left = [];
        for (let y = y0; y <= y1 + 0.01; y += (y1 - y0) / 8) left.push([200 - hw(y), y]);
        return [...left, ...left.map(([px, py]) => [400 - px, py]).reverse()];
      };
      const topSand = a === 'upward' ? span(54, 54 + hs, hwTop) : span(147 - hs, 147, hwTop);
      const hb = 16 + 54 * (1 - t);
      const pile = [...span(246 - hb, 246, hwBot)];
      const peakY = 246 - hb - 12;
      let b = rect(0, 0, W, H, { fill: bg }) + rect(0, 262, W, 38, { fill: '#000000', op: 0.1 });
      b += poly(glass, { fill: '#e0f2fe', op: 0.45 });
      b += poly(topSand, { fill: sand });
      b += poly(pile, { fill: sand }) + poly([[170, 246 - hb + 1], [200, peakY], [230, 246 - hb + 1]], { fill: sand });
      b += line(200, 150, 200, peakY, { stroke: sand, sw: 2.5 });
      b += poly(glass, { fill: 'none', stroke: '#94a3b8', sw: 3 });
      b += rect(130, 38, 140, 16, { rx: 4, fill: wood }) + rect(130, 246, 140, 16, { rx: 4, fill: wood });
      b += rect(136, 54, 8, 192, { fill: wood }) + rect(256, 54, 8, 192, { fill: wood });
      return { body: b, region: a ? { cx: 200, cy: 54 + hs / 2, r: Math.max(42, hs / 2 + 20) } : null, note: 'A normal hourglass with sand falling to the bottom.' };
    },
  },

  ruler: {
    label: 'Ruler',
    anomalies: {
      skip: {
        difficulty: 'medium', title: 'A ruler that skips a number',
        explanation: 'A ruler counts up one at a time, but this one skips a number.',
        hint: 'Count along each ruler: 0, 1, 2, 3...',
        keywords: ['skips', 'skipped', 'missing', 'missing number', 'numbers', 'jumps', 'skip'],
      },
      swap: {
        difficulty: 'hard', title: 'A ruler with two numbers swapped',
        explanation: 'The numbers on a ruler always count up in order. Two of them here are swapped.',
        hint: 'Read every number on each ruler in order.',
        keywords: ['numbers', 'swapped', 'order', 'wrong order', 'switched', 'backwards'],
      },
    },
    render(x, a) {
      const desk = x.pick(['#fde68a', '#e2e8f0', '#bbf7d0', '#fbcfe8', '#c7d2fe']);
      const body = x.pick(['#fbbf24', '#fcd34d', '#a7f3d0', '#e0f2fe', '#f5d0fe']);
      const p = x.i(2, 8);
      const pencilY = x.f(222, 248);
      const pencil = x.pick(['#f59e0b', '#3b82f6', '#22c55e', '#ef4444']);
      const eraserX = x.f(40, 300);
      const labels = Array.from({ length: 11 }, (_, i) => i);
      if (a === 'swap') [labels[p], labels[p + 1]] = [labels[p + 1], labels[p]];
      if (a === 'skip') for (let i = p; i <= 10; i++) labels[i] = i + 1;
      let b = rect(0, 0, W, H, { fill: desk });
      b += rect(eraserX, 34, 62, 30, { rx: 7, fill: '#f9a8d4', stroke: '#be185d', sw: 1.5 });
      b += rect(60, pencilY, 240, 16, { rx: 3, fill: pencil }) + poly([[300, pencilY], [330, pencilY + 8], [300, pencilY + 16]], { fill: '#fde68a' }) + poly([[322, pencilY + 4], [330, pencilY + 8], [322, pencilY + 12]], { fill: INK });
      b += rect(44, pencilY, 18, 16, { rx: 3, fill: '#f472b6' });
      b += rect(26, 101, 360, 86, { rx: 6, fill: '#000000', op: 0.15 }) + rect(20, 95, 360, 86, { rx: 6, fill: body, stroke: '#78350f', sw: 2 });
      for (let i = 0; i <= 100; i++) {
        const tx = 35 + i * 3.3;
        const len = i % 10 === 0 ? 28 : i % 5 === 0 ? 19 : 11;
        b += line(tx, 95, tx, 95 + len, { stroke: '#1f2937', sw: i % 10 === 0 ? 2 : 1.2 });
      }
      for (let i = 0; i <= 10; i++) b += text(35 + i * 33, 150, String(labels[i]), { size: 19, fill: INK });
      b += text(360, 172, 'cm', { size: 12, fill: '#374151' });
      let region = null;
      if (a === 'swap') region = { cx: 35 + (p + 0.5) * 33, cy: 144, r: 42 };
      if (a === 'skip') region = { cx: 35 + p * 33, cy: 144, r: 34 };
      return { body: b, region, note: 'A normal ruler counting 0 to 10.' };
    },
  },
};

// ---------------------------------------------------------------- public API

export const SCENE_TYPES = Object.keys(SCENES);

/** Every anomaly as { type, anomaly, difficulty }. */
export const ANOMALIES = SCENE_TYPES.flatMap((type) =>
  Object.entries(SCENES[type].anomalies).map(([anomaly, m]) => ({ type, anomaly, difficulty: m.difficulty })));

/**
 * Render one scene to SVG.
 * @returns {{svg: string, region: {cx, cy, r}|null, note: string, title?, explanation?, hint?, keywords?, difficulty?}}
 */
export function renderScene(type, seed, anomaly = null) {
  const sc = SCENES[type];
  if (!sc) throw new Error(`Unknown scene type "${type}"`);
  if (anomaly && !sc.anomalies[anomaly]) throw new Error(`Unknown anomaly "${anomaly}" for ${type}`);
  const r = mulberry32(((Number(seed) || 0) >>> 0) ^ hashStr(type));
  const out = sc.render(rand(r), anomaly || null);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" font-family="Outfit, Arial, sans-serif">${out.body}</svg>`;
  if (!anomaly) return { svg, region: null, note: out.note || `An ordinary ${sc.label.toLowerCase()}.` };
  const meta = sc.anomalies[anomaly];
  const reg = out.region || { cx: W / 2, cy: H / 2, r: 120 };
  return {
    svg,
    region: { cx: Math.round(reg.cx * 10) / 10, cy: Math.round(reg.cy * 10) / 10, r: Math.max(MIN_RADIUS, Math.round(reg.r)) },
    note: out.note,
    title: meta.title,
    explanation: out.explanation || meta.explanation,
    hint: meta.hint,
    keywords: meta.keywords,
    difficulty: meta.difficulty,
  };
}

/** Structural safety check for generated markup. Returns a list of problems (empty = fine). */
export function svgProblems(svg) {
  const problems = [];
  if (typeof svg !== 'string' || !svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') || !svg.endsWith('</svg>')) problems.push('not a complete SVG document');
  const banned = [/<script/i, /\son[a-z]+\s*=/i, /href/i, /url\(/i, /<!--/, /\sid=/, /\sclass=/, /\sdata-/, /<foreignObject/i, /<image/i, /\sstyle=/i, /NaN|undefined|Infinity/];
  for (const re of banned) if (re.test(svg)) problems.push(`contains forbidden markup ${re}`);
  for (const tag of ['g', 'text', 'svg']) {
    const open = (svg.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const close = (svg.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) problems.push(`unbalanced <${tag}> tags`);
  }
  if (svg.length < 300) problems.push('image is suspiciously empty');
  return problems;
}

const SAME_TYPE_COUNT = { easy: 0, medium: 1, hard: 2, expert: 3, insane: 5 };
const POOLS = {
  easy: ['easy'],
  medium: ['medium'],
  hard: ['hard'],
  expert: ['expert'],
  insane: ['insane', 'expert'],
};

/**
 * Compose a fresh level. Easy levels mix six different scene types; harder levels
 * repeat the fake's scene type so the group has to compare near-identical pictures.
 */
export function composeLevel(difficulty, seed = Math.floor(Math.random() * 2 ** 31)) {
  const x = rand(mulberry32(seed));
  const pool = ANOMALIES.filter((an) => POOLS[difficulty].includes(an.difficulty));
  const fake = x.pick(pool);
  const same = SAME_TYPE_COUNT[difficulty] ?? 0;
  const others = [];
  for (let k = 0; k < same; k++) others.push(fake.type);
  const rest = x.shuffle(SCENE_TYPES.filter((t) => t !== fake.type));
  while (others.length < 5) others.push(rest[others.length - same]);
  const seedOf = () => x.i(1, 999_999);
  const scenes = x.shuffle([...others.map((type) => ({ type, seed: seedOf() })), { type: fake.type, seed: seedOf(), anomaly: fake.anomaly }]);
  return scenes;
}

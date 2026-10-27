// Original animated clips for "What Happens Next?".
// Every clip is a deterministic function of time: scene(ctx, t) draws one frame on a
// 1600x900 virtual stage (scaled to the real canvas). Like a video file, the code
// contains the ending; the correct answer and accepted predictions live on the server.
// `id`, `duration` and `pauseAt` must stay on one line: the server keeps a matching
// list (server/content/nextup.js) and a test checks the two agree.

export const VW = 1600;
export const VH = 900;
const TAU = Math.PI * 2;
const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const SANS = 'Outfit, system-ui, sans-serif';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = {
  in: (p) => p * p * p,
  out: (p) => 1 - (1 - p) ** 3,
  inOut: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  back: (p) => (p <= 0 ? 0 : 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2),
};
const rnd = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const bez = (p0, c, p1, p) => [
  (1 - p) ** 2 * p0[0] + 2 * (1 - p) * p * c[0] + p * p * p1[0],
  (1 - p) ** 2 * p0[1] + 2 * (1 - p) * p * c[1] + p * p * p1[1],
];
/** Step function: pick(t, [[0, a], [2, b]]) -> a before t=2, then b. */
const pick = (t, list) => list.reduce((v, [at, val]) => (t >= at ? val : v), list[0][1]);
/** Position along a list of [t0, t1, from, control, to] quadratic arcs. */
function along(t, arcs, before) {
  for (const [a, b, p0, c, p1] of arcs) if (t >= a && t <= b) return bez(p0, c, p1, (t - a) / (b - a));
  return t < arcs[0][0] ? before : arcs[arcs.length - 1][4];
}

// ---------------------------------------------------------------- drawing helpers

function emoji(ctx, ch, x, y, size, { rot = 0, alpha = 1, sx = 1, sy = 1 } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(ch, 0, size * 0.05);
  ctx.restore();
}

function box(ctx, x, y, w, h, fill, r = 0, stroke = null, lw = 4) {
  ctx.beginPath();
  if (r && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function disc(ctx, x, y, r, fill, stroke = null, lw = 4) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function oval(ctx, x, y, rx, ry, fill, rot = 0, stroke = null, lw = 4) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function line(ctx, pts, stroke, lw = 6, dash = null) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function say(ctx, str, x, y, size, color = '#fde047', { scale = 1, rot = 0, alpha = 1 } = {}) {
  if (scale <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.font = `900 ${size}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeText(str, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

/** Text that pops in at t0 and (optionally) fades out at t1. */
function popText(ctx, str, x, y, size, t, t0, t1 = Infinity, color = '#fde047', rot = -0.05) {
  if (t < t0 || t > t1 + 0.4) return;
  say(ctx, str, x, y, size, color, { scale: ease.back(seg(t, t0, t0 + 0.35)), rot, alpha: 1 - seg(t, t1, t1 + 0.4) });
}

function bubble(ctx, str, x, y, size = 50) {
  ctx.save();
  ctx.font = `900 ${size}px ${SANS}`;
  const w = ctx.measureText(str).width + size;
  box(ctx, x - w / 2, y - size * 0.85, w, size * 1.7, '#ffffff', size * 0.5, '#0f172a', 4);
  ctx.beginPath();
  ctx.moveTo(x - 16, y + size * 0.8);
  ctx.lineTo(x + 4, y + size * 0.85 + 30);
  ctx.lineTo(x + 20, y + size * 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y + 3);
  ctx.restore();
}

function sparkles(ctx, x, y, t, t0, n = 6, spread = 130) {
  const d = t - t0;
  if (d < 0 || d > 1.4) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.4;
    emoji(ctx, '✨', x + Math.cos(a) * spread * ease.out(clamp(d / 0.8)), y + Math.sin(a) * spread * 0.7 * ease.out(clamp(d / 0.8)), 48, { alpha: 1 - seg(d, 0.8, 1.4) });
  }
}

function room(ctx, { wall = ['#34407a', '#232c5a'], floor = ['#8a5a32', '#6b4325'], floorY = 700 } = {}) {
  box(ctx, 0, 0, VW, floorY, grad(ctx, 0, 0, 0, floorY, [[0, wall[0]], [1, wall[1]]]));
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 0; x < VW; x += 120) ctx.fillRect(x, 0, 60, floorY);
  box(ctx, 0, floorY, VW, VH - floorY, grad(ctx, 0, floorY, 0, VH, [[0, floor[0]], [1, floor[1]]]));
  box(ctx, 0, floorY - 14, VW, 14, 'rgba(255,255,255,0.14)');
  for (let x = 0; x <= VW + 200; x += 170) line(ctx, [[x, floorY], [x - 110, VH]], 'rgba(0,0,0,0.16)', 3);
}

function outdoors(ctx, { sky = ['#3fa9f5', '#c4ebff'], ground = ['#63c34f', '#3f8d33'], groundY = 720, sun = true } = {}) {
  box(ctx, 0, 0, VW, groundY, grad(ctx, 0, 0, 0, groundY, [[0, sky[0]], [1, sky[1]]]));
  if (sun) disc(ctx, 1420, 120, 60, '#fde68a');
  for (const [cx, cy, s] of [[260, 140, 1], [760, 90, 0.8], [1120, 190, 0.9]]) {
    disc(ctx, cx, cy, 42 * s, 'rgba(255,255,255,0.9)');
    disc(ctx, cx + 45 * s, cy - 15 * s, 52 * s, 'rgba(255,255,255,0.9)');
    disc(ctx, cx + 95 * s, cy, 40 * s, 'rgba(255,255,255,0.9)');
  }
  box(ctx, 0, groundY, VW, VH - groundY, grad(ctx, 0, groundY, 0, VH, [[0, ground[0]], [1, ground[1]]]));
}

function table(ctx, x1, x2, y, { top = '#b5733f', leg = '#7c4a26', floorY = 700 } = {}) {
  for (const x of [x1 + 30, x2 - 50]) box(ctx, x, y + 26, 20, floorY - y - 26, leg);
  box(ctx, x1, y, x2 - x1, 30, top, 8);
  box(ctx, x1, y + 22, x2 - x1, 8, 'rgba(0,0,0,0.2)');
}

/** A simple cartoon person: emoji head on a drawn body. Arm angles: 0 = down, PI/2 = out sideways, PI = up. */
function kid(ctx, x, gy, { face = '🙂', shirt = '#3b82f6', pants = '#334155', s = 1, armL = 0.3, armR = 0.3, lean = 0, sit = false } = {}) {
  const skin = '#ffcc4d';
  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(s, s);
  ctx.rotate(lean);
  if (sit) {
    line(ctx, [[-15, -100], [50, -100], [55, -10]], pants, 24);
    line(ctx, [[15, -100], [80, -100], [85, -10]], pants, 24);
  } else {
    line(ctx, [[-18, -100], [-24, 0]], pants, 24);
    line(ctx, [[18, -100], [24, 0]], pants, 24);
  }
  const arm = (sx, a, side) => {
    const ex = sx + side * Math.sin(a) * 92;
    const ey = -200 + Math.cos(a) * 92;
    line(ctx, [[sx, -200], [ex, ey]], skin, 20);
    disc(ctx, ex, ey, 13, skin);
    return [ex, ey];
  };
  const hl = arm(-40, armL, -1);
  const hr = arm(40, armR, 1);
  box(ctx, -48, -222, 96, 128, shirt, 28);
  emoji(ctx, face, 0, -285, 125);
  ctx.restore();
  return { left: [x + s * hl[0], gy + s * hl[1]], right: [x + s * hr[0], gy + s * hr[1]], head: [x, gy - 285 * s] };
}

function toyCar(ctx, x, y, rot = 0, color = '#ef4444') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  box(ctx, -70, -34, 140, 40, color, 14);
  box(ctx, -36, -62, 70, 34, color, 12);
  box(ctx, -28, -56, 26, 22, '#bae6fd', 5);
  box(ctx, 4, -56, 24, 22, '#bae6fd', 5);
  disc(ctx, 64, -18, 6, '#fde047');
  for (const wx of [-42, 42]) {
    disc(ctx, wx, 8, 19, '#111827');
    disc(ctx, wx, 8, 7, '#9ca3af');
  }
  ctx.restore();
}

function cup(ctx, x, y, rot, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-36, 41);
  ctx.lineTo(36, 41);
  ctx.lineTo(25, -41);
  ctx.lineTo(-25, -41);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  ctx.stroke();
  box(ctx, -36, 30, 72, 11, 'rgba(255,255,255,0.35)');
  ctx.restore();
}

function pin(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -45);
  ctx.bezierCurveTo(14, -45, 12, -22, 8, -14);
  ctx.bezierCurveTo(22, 0, 20, 34, 12, 45);
  ctx.lineTo(-12, 45);
  ctx.bezierCurveTo(-20, 34, -22, 0, -8, -14);
  ctx.bezierCurveTo(-12, -22, -14, -45, 0, -45);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.stroke();
  box(ctx, -9, -21, 18, 5, '#ef4444');
  box(ctx, -10, -12, 20, 5, '#ef4444');
  ctx.restore();
}

function domino(ctx, px, py, w, hgt, rot) {
  // pivot is the bottom-right corner, so a positive rot tips it to the right
  ctx.save();
  ctx.translate(px + w, py);
  ctx.rotate(rot);
  box(ctx, -w, -hgt, w, hgt, '#111827', Math.min(10, w * 0.2), '#e5e7eb', Math.max(2, w * 0.06));
  line(ctx, [[-w * 0.8, -hgt / 2], [-w * 0.2, -hgt / 2]], '#e5e7eb', Math.max(2, w * 0.05));
  const r = Math.max(2.5, w * 0.09);
  for (const [fx, fy] of [[0.5, 0.25], [0.3, 0.68], [0.7, 0.82]]) disc(ctx, -w * fx, -hgt * fy, r, '#f8fafc');
  ctx.restore();
}

function horseshoe(ctx, x, y) {
  ctx.save();
  ctx.lineWidth = 44;
  ctx.strokeStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(x, y, 58, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
  box(ctx, x - 80, y, 44, 48, '#dc2626');
  box(ctx, x + 36, y, 44, 48, '#dc2626');
  box(ctx, x - 80, y + 48, 44, 30, '#cbd5e1');
  box(ctx, x + 36, y + 48, 44, 30, '#cbd5e1');
}

function clip(def) {
  return {
    ...def,
    draw(ctx, t, W, H) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.scale(W / VW, H / VH);
      try {
        def.scene(ctx, clamp(t, 0, def.duration));
      } finally {
        ctx.restore();
      }
    },
  };
}

// ---------------------------------------------------------------- the clips

const LIST = [
  clip({
    id: 'cups', duration: 9, pauseAt: 5.4, title: 'The Cup Tower', cues: [[4.2, 'click'], [5.85, 'whoosh'], [6.15, 'shake'], [6.5, 'pop']],
    scene(ctx, t) {
      room(ctx);
      // a window: it is a very windy day outside
      ctx.save();
      box(ctx, 960, 150, 220, 170, grad(ctx, 0, 150, 0, 320, [[0, '#7cc8ff'], [1, '#d6f0ff']]), 8);
      ctx.clip();
      emoji(ctx, '🌳', 1100, 300, 150, { rot: Math.sin(t * 3) * 0.14 });
      for (let i = 0; i < 5; i++) {
        const p = (t * 0.8 + i * 0.21) % 1;
        emoji(ctx, '🍃', 950 + p * 260, 180 + i * 28 + Math.sin(t * 5 + i) * 10, 34, { rot: t * 6 + i });
      }
      ctx.restore();
      box(ctx, 960, 150, 220, 170, null, 8, '#e2e8f0', 10);
      line(ctx, [[1070, 150], [1070, 320]], '#e2e8f0', 6);
      // the doorway and door
      const open = ease.inOut(seg(t, 4.2, 5.9));
      box(ctx, 1290, 250, 190, 450, grad(ctx, 0, 250, 0, 700, [[0, '#9ad8ff'], [0.6, '#d8f3ff'], [0.61, '#6cc35a'], [1, '#4e9d3f']]));
      emoji(ctx, '🌳', 1400, 560, 170, { rot: Math.sin(t * 3 + 1) * 0.1 });
      const dw = 190 * Math.cos(open * 1.25);
      box(ctx, 1480 - dw, 250, dw, 450, '#8b4a24', 4, '#5c2f15', 4);
      if (dw > 40) disc(ctx, 1480 - dw + 22, 480, 9, '#fbbf24');
      box(ctx, 1280, 240, 210, 12, '#5c2f15');
      box(ctx, 1280, 240, 12, 460, '#5c2f15');
      box(ctx, 1478, 240, 12, 460, '#5c2f15');
      // the gust
      for (let i = 0; i < 7; i++) {
        const s = t - 5.75 - i * 0.12;
        if (s > 0 && s < 1.5) {
          const x = 1300 - s * 1100;
          line(ctx, [[x, 330 + i * 52], [x + 170, 330 + i * 52]], `rgba(255,255,255,${0.55 * (1 - s / 1.5)})`, 6);
        }
      }
      for (let i = 0; i < 6; i++) {
        const s = t - 5.5 - i * 0.15;
        if (s > 0) emoji(ctx, '🍃', 1320 - s * 520, 330 + rnd(i) * 300 + Math.sin(s * 6 + i) * 30, 40, { rot: s * 8 });
      }
      // the tower: 15 cups built one by one
      const rows = [5, 4, 3, 2, 1];
      let idx = 0;
      for (let r = 0; r < rows.length; r++) {
        for (let k = 0; k < rows[r]; k++, idx++) {
          const ta = 0.3 + idx * 0.22;
          if (t < ta) continue;
          const x0 = 760 + (k - (rows[r] - 1) / 2) * 78;
          const y0 = 700 - 41 - r * 82;
          let x = x0;
          let y = y0 - 50 * (1 - ease.out(seg(t, ta, ta + 0.18)));
          let rot = 0;
          const ts = 5.95 + (1000 - x0) / 1100 + (4 - r) * 0.04;
          if (t > ts) {
            const d = t - ts;
            x = x0 - (140 + rnd(idx) * 320) * ease.out(clamp(d / 1.4));
            y = Math.min(668, y0 - 120 * rnd(idx + 7) * d + 1100 * d * d);
            rot = -(1.4 + rnd(idx + 3) * 2.2) * ease.out(clamp(d / 1.2));
          }
          cup(ctx, x, y, rot, idx % 2 ? '#3b82f6' : '#ef4444');
        }
      }
      const face = pick(t, [[0, '🙂'], [3.6, '😃'], [5.95, '😮'], [7.6, '😅']]);
      const building = t < 3.6;
      kid(ctx, 330, 700, {
        face, shirt: '#22c55e',
        armR: building ? 1.1 + Math.sin(t * 7) * 0.4 : t < 5.95 ? 2.7 : 0.8,
        armL: building ? 0.4 : t < 5.95 ? 2.7 : 0.8,
      });
    },
  }),

  clip({
    id: 'catcup', duration: 9, pauseAt: 5.5, title: 'The Curious Cat', cues: [[1.6, 'click'], [2.9, 'click'], [4.1, 'click'], [5.2, 'click'], [6.2, 'whoosh'], [6.75, 'pop']],
    scene(ctx, t) {
      room(ctx, { wall: ['#4a3b7a', '#30265a'] });
      box(ctx, 160, 140, 200, 150, '#fde68a', 6, '#a16207', 10);
      emoji(ctx, '🐟', 260, 215, 80);
      table(ctx, 380, 1000, 470);
      const pushes = [1.6, 2.9, 4.1, 5.2];
      let cx = 800;
      for (const p of pushes) cx += 50 * ease.out(seg(t, p, p + 0.35));
      let cy = 425;
      let crot = t > 5.2 && t < 6.2 ? Math.sin((t - 5.2) * 10) * 0.07 * seg(t, 5.2, 5.5) : 0;
      if (t >= 6.2) {
        const d = t - 6.2;
        cx = 1000 + 110 * ease.out(clamp(d / 0.55));
        cy = Math.min(615, 425 - 150 * d + 1500 * d * d);
        crot = Math.min(2.4, d * 6);
      }
      const reach = Math.max(...[...pushes, 6.15].map((p) => Math.sin(seg(t, p - 0.3, p + 0.3) * Math.PI)));
      emoji(ctx, '☕', cx, cy, 100, { rot: crot });
      emoji(ctx, '🧺', 1110, 640, 200, { sy: 1 - 0.12 * Math.sin(seg(t, 6.7, 7.0) * Math.PI) });
      // the cat
      const lean = reach * 0.22;
      line(ctx, [[560, 440], [500, 400 + Math.sin(t * 3) * 25], [470, 360]], '#f59e0b', 18);
      oval(ctx, 640, 420, 95, 52, '#f59e0b');
      if (reach > 0.02) {
        const px = lerp(720, cx - 55, reach);
        line(ctx, [[700, 420], [px, 428]], '#f59e0b', 22);
        disc(ctx, px, 428, 18, '#fde68a');
      }
      emoji(ctx, t > 6.8 ? '😼' : '🐱', 690 + lean * 60, 340, 170, { rot: lean });
      if (t > 6.8) emoji(ctx, '✨', 1110, 520 - (t - 6.8) * 30, 70, { alpha: clamp(1 - (t - 7.6)) });
    },
  }),

  clip({
    id: 'penguin', duration: 9, pauseAt: 4.8, title: 'Penguin Bowling', cues: [[1.7, 'whoosh'], [4.97, 'shake'], [5.1, 'pop'], [6.7, 'correct']],
    scene(ctx, t) {
      box(ctx, 0, 0, VW, 600, grad(ctx, 0, 0, 0, 600, [[0, '#0f1e4a'], [1, '#1f3d8a']]));
      for (let i = 0; i < 8; i++) disc(ctx, 100 + i * 200, 80, 14, `rgba(255,255,220,${0.5 + 0.3 * Math.sin(t * 2 + i)})`);
      box(ctx, 0, 520, VW, 80, '#c7d2fe');
      for (let i = 0; i < 16; i++) box(ctx, i * 100 + 10, 535, 70, 40, i % 2 ? '#6366f1' : '#ec4899', 6);
      box(ctx, 0, 600, VW, 300, grad(ctx, 0, 600, 0, 900, [[0, '#e0f2fe'], [1, '#bae6fd']]));
      for (let i = 0; i < 6; i++) {
        const off = (t * 60) % 300;
        line(ctx, [[i * 300 - off, 720 + i * 25], [i * 300 + 160 - off, 720 + i * 25]], 'rgba(255,255,255,0.75)', 4);
      }
      const pins = [];
      [1330, 1378, 1426, 1474].forEach((x, r) => {
        for (let k = 0; k <= r; k++) pins.push([x, 650 + (k - r / 2) * 26, pins.length]);
      });
      pins.sort((a, b) => a[1] - b[1]);
      for (const [px, py, i] of pins) {
        let x = px;
        let y = py - 45;
        let rot = 0;
        const th = 4.97 + (px - 1330) / 500;
        if (t > th) {
          const d = t - th;
          const dir = rnd(i + 2) > 0.5 ? 1 : -1;
          x = Math.min(1570, px + (120 + rnd(i) * 380) * d);
          y = py - 45 - (380 + rnd(i + 4) * 520) * d + 1500 * d * d;
          rot = dir * Math.min(Math.PI / 2 + rnd(i) * 1.2, d * (6 + rnd(i) * 6));
          if (y >= py - 14) {
            y = py - 14;
            rot = dir * Math.PI / 2;
          }
        }
        pin(ctx, x, y, rot);
      }
      let x;
      let y = 640;
      let rot = 0;
      if (t < 1.7) {
        x = 120 + 110 * t;
        y = 590 - Math.abs(Math.sin(t * 9)) * 12;
        rot = Math.sin(t * 9) * 0.12;
      } else {
        const d = t - 1.7;
        x = Math.min(1480, 307 + 300 * d - 6 * d * d - (t > 4.97 ? 60 * (t - 4.97) ** 2 : 0));
        rot = (Math.PI / 2) * ease.out(clamp(d / 0.25));
        if (t > 6.4) {
          rot = (Math.PI / 2) * (1 - ease.inOut(seg(t, 6.4, 6.9)));
          y = 640 - 40 * ease.inOut(seg(t, 6.4, 6.9));
        }
      }
      emoji(ctx, '🐧', x, y, 150, { rot });
      popText(ctx, 'STRIKE!', 800, 300, 170, t, 6.6);
      sparkles(ctx, 800, 300, t, 6.7, 8, 360);
    },
  }),

  clip({
    id: 'tail', duration: 8, pauseAt: 4.7, title: 'Waggy Tail', cues: [[2.6, 'pop'], [5.05, 'shake'], [5.4, 'click']],
    scene(ctx, t) {
      room(ctx, { wall: ['#1f4e5f', '#163845'] });
      box(ctx, 120, 160, 160, 120, '#fef3c7', 8, '#92400e', 8);
      emoji(ctx, '🏠', 200, 222, 70);
      const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
      for (let i = 0; i < 6; i++) {
        let x = 945;
        let y = 660 - i * 80;
        let rot = 0;
        const ts = 5.05 + i * 0.05;
        if (t > ts) {
          const d = t - ts;
          x = 945 + (i === 0 ? 120 * ease.out(clamp(d / 0.6)) : (60 + i * 55) * ease.out(clamp(d / 0.9)));
          y = Math.min(660, y + 1400 * d * d);
          rot = (0.6 + rnd(i) * 1.4) * ease.out(clamp(d / 0.8));
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        box(ctx, -40, -40, 80, 80, colors[i], 10, 'rgba(0,0,0,0.25)', 4);
        say(ctx, 'ABCDEF'[i], 0, 3, 50, '#ffffff');
        ctx.restore();
      }
      const dx = 640 + 30 * ease.inOut(seg(t, 4.8, 5.0));
      const excite = seg(t, 2.6, 4.7);
      const amp = 0.3 + 0.45 * excite + (t > 4.8 ? 0.25 : 0);
      const th = -0.95 + amp * Math.sin(t * (7 + 9 * excite));
      const ax = dx + 115;
      const ay = 590;
      const tip = [ax + 135 * Math.cos(th), ay + 135 * Math.sin(th)];
      line(ctx, [[ax, ay], [(ax + tip[0]) / 2 + 10, (ay + tip[1]) / 2 - 15], tip], '#b45309', 18);
      for (const lx of [-70, -35, 45, 80]) line(ctx, [[dx + lx, 620], [dx + lx, 698]], '#b45309', 22);
      oval(ctx, dx, 605, 125, 58, '#d97706');
      emoji(ctx, '🐶', dx - 120, 540 + Math.sin(t * 6) * 4 * excite, 160, { rot: -0.1 });
      if (t > 5.3 && t < 7.6) bubble(ctx, 'Oops!', dx - 120, 400);
      const face = pick(t, [[0, '🙂'], [2.6, '😄'], [5.15, '😮'], [6.3, '😂']]);
      const hands = kid(ctx, 1300, 700, { face, shirt: '#f97316', armL: t > 2.4 ? 1.5 + Math.sin(t * 5) * 0.15 : 0.3, armR: 0.3 });
      if (t > 2.4) emoji(ctx, '🦴', hands.left[0] - 20, hands.left[1] - 10, 80, { rot: -0.4 });
    },
  }),

  clip({
    id: 'magnet', duration: 8, pauseAt: 4.4, title: 'Magnet Magic', cues: [[4.6, 'pop'], [4.8, 'pop'], [4.95, 'shake'], [6.0, 'whoosh']],
    scene(ctx, t) {
      room(ctx, { wall: ['#29496b', '#1c3450'] });
      table(ctx, 260, 1340, 640);
      emoji(ctx, '✏️', 1110, 612, 110, { rot: 0.8 });
      box(ctx, 430, 606, 90, 34, '#f9a8d4', 8, '#be185d', 3);
      const my = t < 6.0 ? lerp(-120, 300, ease.inOut(seg(t, 0.6, 4.2))) : 300 - 200 * ease.inOut(seg(t, 6.0, 7.4));
      const mx = 800;
      box(ctx, mx - 38, -40, 76, my - 40 + 40, '#475569');
      disc(ctx, mx, my - 52, 40, '#ffcc4d');
      horseshoe(ctx, mx, my);
      for (let i = 0; i < 10; i++) {
        const px = 690 + rnd(i) * 220;
        const py = 618 - rnd(i + 20) * 18;
        const prot = rnd(i + 5) * TAU;
        const side = i % 2 ? 1 : -1;
        const k = Math.floor(i / 2);
        const sway = t > 6 ? Math.sin(t * 3 + k) * k * 4 * seg(t, 6, 6.4) : 0;
        const ts = 4.55 + i * 0.07;
        const p = ease.back(seg(t, ts, ts + 0.35));
        emoji(ctx, '📎', lerp(px, mx + side * 58 + sway, p), lerp(py, my + 100 + k * 42, p), 54, { rot: lerp(prot, Math.PI / 2, seg(t, ts, ts + 0.35)) });
      }
    },
  }),

  clip({
    id: 'trickshot', duration: 9, pauseAt: 6.0, title: 'Two-Wall Trick Shot', cues: [[2.9, 'tick'], [4.2, 'tick'], [6.4, 'tick'], [7.3, 'pop'], [7.5, 'correct']],
    scene(ctx, t) {
      room(ctx, { wall: ['#3f3a6b', '#2a2650'], floor: ['#c98b4f', '#a86d3a'] });
      box(ctx, 0, 0, 60, 700, '#1e1b3a');
      box(ctx, 1540, 0, 60, 700, '#1e1b3a');
      // hoop
      box(ctx, 1440, 190, 22, 210, '#e2e8f0', 4);
      box(ctx, 1402, 270, 38, 8, '#94a3b8');
      oval(ctx, 1355, 332, 58, 11, null, 0, '#f97316', 7);
      const ball = along(t, [
        [2.0, 2.9, [375, 430], [230, 230], [92, 330]],
        [2.9, 4.2, [92, 330], [330, 250], [720, 660]],
        [4.2, 6.4, [720, 660], [1150, 60], [1508, 270]],
        [6.4, 7.15, [1508, 270], [1440, 170], [1355, 300]],
        [7.15, 7.5, [1355, 300], [1355, 380], [1355, 440]],
        [7.5, 8.0, [1355, 440], [1355, 520], [1360, 660]],
        [8.0, 8.5, [1360, 660], [1365, 560], [1372, 660]],
      ], [375, 430]);
      emoji(ctx, '🏀', ball[0], ball[1], 82, { rot: t * 7 });
      for (let i = 0; i < 6; i++) {
        const sw = t > 7.3 && t < 7.8 ? Math.sin((t - 7.3) * 20) * 6 : 0;
        line(ctx, [[1300 + i * 22, 336], [1318 + i * 14 + sw, 430]], 'rgba(255,255,255,0.8)', 3);
      }
      const face = pick(t, [[0, '🙂'], [1.6, '😎'], [7.4, '🤩']]);
      const cheer = t > 7.4;
      kid(ctx, 470, 700, { face, shirt: '#6366f1', armL: cheer ? 2.8 : t < 2.0 ? 2.5 : 1.0, armR: cheer ? 2.8 : 0.3 });
      popText(ctx, 'SWISH!', 1180, 200, 130, t, 7.4);
    },
  }),

  clip({
    id: 'seesaw', duration: 8, pauseAt: 3.85, title: 'Seesaw Launch', cues: [[3.1, 'click'], [4.03, 'shake'], [4.1, 'whoosh'], [5.25, 'pop'], [5.3, 'correct']],
    scene(ctx, t) {
      outdoors(ctx, { groundY: 700 });
      // tall stand with a basket
      box(ctx, 185, 330, 30, 370, '#a16207');
      box(ctx, 110, 318, 180, 22, '#78350f', 6);
      // ledge on the right
      box(ctx, 1110, 250, 260, 24, '#78350f', 6);
      box(ctx, 1330, 274, 24, 426, '#92400e');
      // box nudged off the ledge by a squirrel
      let bx = 1190;
      let by = 200;
      let brot = 0;
      if (t > 3.15) bx = 1190 - 100 * ease.inOut(seg(t, 3.15, 3.5));
      if (t > 3.5) {
        const d = t - 3.5;
        by = Math.min(451, 200 + 900 * d * d);
        brot = -0.3 * seg(t, 3.5, 3.8);
      }
      const a = t < 4.03 ? -0.27 : lerp(-0.27, 0.27, ease.out(seg(t, 4.03, 4.18)));
      if (t >= 4.03) {
        by = 451 + (616 - 451) * ease.out(seg(t, 4.03, 4.18));
        brot = 0.27 * seg(t, 4.03, 4.18);
      }
      // seesaw
      ctx.beginPath();
      ctx.moveTo(760, 700);
      ctx.lineTo(840, 700);
      ctx.lineTo(800, 600);
      ctx.fillStyle = '#475569';
      ctx.fill();
      ctx.save();
      ctx.translate(800, 600);
      ctx.rotate(a);
      box(ctx, -310, -14, 620, 28, '#ef4444', 10);
      ctx.restore();
      emoji(ctx, '📦', bx, by, 110, { rot: brot });
      // ball
      let ball = [515, 636];
      if (t >= 4.05) ball = along(t, [[4.05, 5.25, [515, 636], [420, -40], [200, 262]]], ball);
      if (t < 5.3) emoji(ctx, '🎾', ball[0], ball[1], 64, { rot: t > 4.05 ? (t - 4.05) * 9 : 0 });
      emoji(ctx, '🧺', 200, 270, 150, { sy: 1 - 0.1 * Math.sin(seg(t, 5.25, 5.55) * Math.PI) });
      sparkles(ctx, 200, 230, t, 5.3);
      // squirrel
      let sx = 1700;
      if (t > 2.4) sx = 1700 - 440 * ease.out(seg(t, 2.4, 3.1));
      if (t > 3.6) sx = 1260 + 500 * ease.in(seg(t, 3.6, 4.4));
      emoji(ctx, '🐿️', sx, 205, 90);
      const face = pick(t, [[0, '🙂'], [4.05, '😮'], [5.3, '🤩']]);
      kid(ctx, 1470, 700, { face, shirt: '#0ea5e9', armL: t > 5.3 ? 2.8 : 0.3, armR: t > 5.3 ? 2.8 : 0.3 });
      popText(ctx, 'IN!', 330, 140, 120, t, 5.35);
    },
  }),

  clip({
    id: 'plane', duration: 8, pauseAt: 3.4, title: 'Paper Airplane vs. Fan', cues: [[1.5, 'whoosh'], [4.25, 'whoosh'], [6.0, 'pop']],
    scene(ctx, t) {
      room(ctx, { wall: ['#1d4e89', '#163a66'] });
      // fan (switched on)
      box(ctx, 1310, 682, 160, 20, '#334155', 8);
      box(ctx, 1380, 470, 16, 214, '#64748b');
      disc(ctx, 1388, 400, 126, '#cbd5e1');
      disc(ctx, 1388, 400, 112, '#0f172a');
      for (let b = 0; b < 3; b++) {
        const ang = t * 25 + (b * TAU) / 3;
        oval(ctx, 1388 + Math.cos(ang) * 55, 400 + Math.sin(ang) * 55, 55, 22, 'rgba(96,165,250,0.85)', ang);
      }
      disc(ctx, 1388, 400, 20, '#e2e8f0');
      for (const r of [60, 95, 120]) disc(ctx, 1388, 400, r, null, 'rgba(226,232,240,0.6)', 3);
      for (let i = 0; i < 5; i++) {
        const p = (t * 1.2 + i * 0.2) % 1;
        const x = 1250 - p * 700;
        line(ctx, [[x, 330 + i * 35], [x + 120, 330 + i * 35]], `rgba(255,255,255,${0.35 * (1 - p)})`, 5);
      }
      // the plane: thrown, slowed by the wind, blown back
      const hand = [374, 462];
      let px = hand[0];
      let dir = 1;
      if (t >= 1.5 && t < 4.25) {
        const d = t - 1.5;
        px = hand[0] + 330 * d - 60 * d * d;
      } else if (t >= 4.25) {
        const d = t - 4.25;
        px = Math.max(hand[0], 835 - 150 * d * d);
        dir = -1;
      }
      const flying = t >= 1.5 && px > hand[0] + 1;
      const py = flying ? 445 + 22 * Math.sin((t - 1.5) * 3) : hand[1];
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(dir, 1);
      ctx.rotate(flying ? Math.sin(t * 3) * 0.08 : -0.2);
      ctx.beginPath();
      ctx.moveTo(62, 0);
      ctx.lineTo(-50, -32);
      ctx.lineTo(-28, 0);
      ctx.lineTo(-50, 26);
      ctx.closePath();
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.stroke();
      line(ctx, [[62, 0], [-28, 0]], '#94a3b8', 3);
      ctx.restore();
      const face = pick(t, [[0, '🙂'], [1.6, '😎'], [4.3, '😮'], [6.0, '😄']]);
      kid(ctx, 250, 700, { face, shirt: '#f97316', armR: t < 1.5 ? 2.0 : t < 1.8 ? 1.6 : t > 5.7 ? 2.0 : 0.6, armL: 0.3 });
      popText(ctx, 'Boomerang!', 650, 230, 100, t, 6.1);
    },
  }),

  clip({
    id: 'balloon', duration: 8, pauseAt: 5.0, title: 'Balloon Meets Cactus', cues: [[1.0, 'click'], [5.3, 'pop'], [5.4, 'reveal']],
    scene(ctx, t) {
      room(ctx, { wall: ['#5b3b8c', '#3f2a66'] });
      box(ctx, 1100, 250, 300, 22, '#78350f', 6);
      box(ctx, 1150, 175, 72, 75, '#c2410c', 8);
      emoji(ctx, '🌵', 1186, 135, 120);
      const hand = [418, 418];
      const p = seg(t, 1, 5.3) ** 1.1;
      const bx = t < 1 ? hand[0] : lerp(hand[0], 1075, p);
      const by = t < 1 ? hand[1] - 140 : lerp(hand[1] - 140, 170, ease.out(seg(t, 1, 5.3))) + Math.sin(t * 2) * 8;
      if (t < 5.3) {
        line(ctx, [[bx, by + 80], [bx - 8 + Math.sin(t * 3) * 10, by + 140], t < 1 ? hand : [bx - 4, by + 210]], '#e2e8f0', 3);
        oval(ctx, bx, by, 62, 78, 'rgba(244,63,94,0.6)');
        for (let i = 0; i < 16; i++) {
          const cx = bx + (rnd(i) - 0.5) * 80 + Math.sin(t * 2 + i) * 4;
          const cy = by + (rnd(i + 1) - 0.5) * 100 + Math.cos(t * 2 + i) * 4;
          box(ctx, cx - 4, cy - 3, 9, 6, ['#fde047', '#22d3ee', '#a3e635', '#ffffff'][i % 4]);
        }
        oval(ctx, bx - 22, by - 30, 12, 20, 'rgba(255,255,255,0.45)', -0.4);
        ctx.beginPath();
        ctx.moveTo(bx - 9, by + 86);
        ctx.lineTo(bx + 9, by + 86);
        ctx.lineTo(bx, by + 74);
        ctx.fillStyle = '#be123c';
        ctx.fill();
      } else {
        const d = t - 5.3;
        for (let i = 0; i < 60; i++) {
          const a = rnd(i) * TAU;
          const s = 200 + rnd(i + 3) * 500;
          const x = 1072 + Math.cos(a) * s * d * 0.9 + Math.sin(d * 4 + i) * 10;
          const y = Math.min(694, 170 + Math.sin(a) * s * d * 0.8 + 260 * d * d);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(d * 6 + i);
          box(ctx, -7, -4, 14, 8, ['#fde047', '#22d3ee', '#a3e635', '#f472b6', '#ffffff'][i % 5]);
          ctx.restore();
        }
        popText(ctx, 'POP!', 1000, 170, 130, t, 5.3, 6.4, '#f472b6');
      }
      const face = pick(t, [[0, '🙂'], [1.05, '😮'], [1.6, '🙂'], [5.3, '😲'], [5.9, '🤩']]);
      kid(ctx, 330, 700, { face, shirt: '#14b8a6', armR: t < 1 ? 2.6 : 0.4, armL: t > 5.9 ? 2.7 : 0.3 });
    },
  }),

  clip({
    id: 'bigdomino', duration: 9, pauseAt: 5.2, title: 'Growing Dominoes', cues: [[1.1, 'click'], [6.21, 'reveal']],
    scene(ctx, t) {
      room(ctx, { wall: ['#3b305f', '#271f45'] });
      const hs = [60, 76, 96, 122, 154, 195, 246, 310];
      let x = 160;
      const ds = hs.map((hgt, k) => {
        const w = Math.round(hgt * 0.42);
        const d = { x, h: hgt, w, t0: 1.1 + 0.62 * k, fd: 0.42 + 0.05 * k };
        x += w + hgt * 0.5;
        return d;
      });
      const bellHit = ds[7].t0 + ds[7].fd;
      const shakeBell = t > bellHit ? Math.sin((t - bellHit) * 30) * 0.25 * (1 - seg(t, bellHit, bellHit + 1.5)) : 0;
      emoji(ctx, '🔔', 1440, 610, 160, { rot: shakeBell });
      ds.forEach((d, k) => {
        let rot;
        if (k < 7) {
          const rest = Math.asin(0.5);
          const n = ds[k + 1];
          rot = rest * ease.in(seg(t, d.t0, d.t0 + d.fd)) + (1.25 - rest) * seg(t, n.t0, n.t0 + n.fd);
        } else rot = 0.97 * ease.in(seg(t, d.t0, d.t0 + d.fd));
        domino(ctx, d.x, 700, d.w, d.h, rot);
      });
      emoji(ctx, '👉', lerp(40, 118, ease.inOut(seg(t, 0.5, 1.1))), 670, 70);
      popText(ctx, 'DING!', 1300, 380, 130, t, bellHit + 0.05);
      sparkles(ctx, 1440, 560, t, bellHit, 8, 170);
    },
  }),

  clip({
    id: 'rube', duration: 11, pauseAt: 6.0, title: 'The Marble Machine', cues: [[1.9, 'tick'], [3.3, 'tick'], [4.85, 'click'], [6.25, 'shake'], [6.6, 'whoosh'], [8.6, 'reveal']],
    scene(ctx, t) {
      room(ctx, { wall: ['#264653', '#1b3640'], floorY: 860 });
      const ramps = [[[120, 200], [700, 280]], [[760, 345], [180, 425]], [[120, 490], [690, 570]]];
      for (const [a, b] of ramps) {
        line(ctx, [a, b], '#b5733f', 16);
        line(ctx, [[a[0] + 30, a[1]], [a[0] + 30, a[1] - 80]], 'rgba(0,0,0,0.25)', 6);
      }
      // shelf with the car and bucket
      box(ctx, 650, 660, 640, 24, '#8a5a32', 6);
      box(ctx, 680, 684, 20, 176, '#6b4325');
      box(ctx, 1250, 684, 20, 176, '#6b4325');
      // marble
      const on = (r, p) => [lerp(r[0][0], r[1][0], p), lerp(r[0][1], r[1][1], p) - 26];
      let m;
      if (t < 0.4) m = on(ramps[0], 0);
      else if (t < 1.9) m = on(ramps[0], seg(t, 0.4, 1.9) ** 2);
      else if (t < 2.05) m = bez(on(ramps[0], 1), [740, 270], on(ramps[1], 0), seg(t, 1.9, 2.05));
      else if (t < 3.3) m = on(ramps[1], seg(t, 2.05, 3.3) ** 2);
      else if (t < 3.45) m = bez(on(ramps[1], 1), [140, 420], on(ramps[2], 0), seg(t, 3.3, 3.45));
      else if (t < 4.6) m = on(ramps[2], seg(t, 3.45, 4.6) ** 2);
      else if (t < 4.85) m = bez(on(ramps[2], 1), [720, 560], [705, 640], seg(t, 4.6, 4.85));
      else m = [705 - 10 * ease.out(seg(t, 4.85, 5.2)), 640];
      const g = ctx.createRadialGradient(m[0] - 6, m[1] - 6, 2, m[0], m[1], 18);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#64748b');
      disc(ctx, m[0], m[1], 18, g);
      // car rolls to the bucket
      const cx = t < 4.85 ? 800 : Math.min(1100, 800 + 220 * (t - 4.85));
      toyCar(ctx, cx, 633, 0, '#ef4444');
      // bucket tips over the plant
      const tip = 1.9 * ease.inOut(seg(t, 6.25, 6.75));
      ctx.save();
      ctx.translate(1270, 660);
      ctx.rotate(tip);
      emoji(ctx, '🪣', -55, -52, 110);
      ctx.restore();
      for (let i = 0; i < 30; i++) {
        const d = t - (6.6 + i * 0.05);
        if (d > 0 && d < 0.6) {
          const y = 690 + 700 * d * d;
          if (y < 775) disc(ctx, 1300 + rnd(i) * 40 + d * 30, y, 7, '#38bdf8');
        }
      }
      // plant pot
      ctx.beginPath();
      ctx.moveTo(1295, 790);
      ctx.lineTo(1405, 790);
      ctx.lineTo(1390, 860);
      ctx.lineTo(1310, 860);
      ctx.closePath();
      ctx.fillStyle = '#c2410c';
      ctx.fill();
      box(ctx, 1290, 780, 120, 18, '#9a3412', 6);
      if (t < 8.6) emoji(ctx, '🌱', 1350, 742 - 10 * seg(t, 7.2, 8.4), 90 * (1 + 0.35 * ease.out(seg(t, 7.2, 8.4))));
      else emoji(ctx, '🌻', 1350, 760 - 90 * ease.back(seg(t, 8.6, 9.1)), 170 * ease.back(seg(t, 8.6, 9.1)));
      sparkles(ctx, 1350, 640, t, 8.7, 8, 160);
    },
  }),

  clip({
    id: 'toast', duration: 8, pauseAt: 3.62, title: 'Toast Off the Table', cues: [[3.0, 'click'], [3.79, 'pop'], [5.0, 'whoosh']],
    scene(ctx, t) {
      room(ctx, { wall: ['#7c4a2a', '#5c3720'], floor: ['#9ca3af', '#6b7280'] });
      for (let x = 0; x < VW; x += 80) for (let y = 0; y < 300; y += 80) box(ctx, x + 2, y + 2, 76, 76, 'rgba(255,255,255,0.05)');
      table(ctx, 450, 1000, 470);
      oval(ctx, 760, 466, 90, 14, '#f8fafc');
      // the toast (jam on one side)
      let x = 940;
      let y = 456;
      let rot = 0;
      if (t > 3.05) x = 940 + 70 * ease.out(seg(t, 3.05, 3.3));
      if (t > 3.3) {
        const d = t - 3.3;
        x = 1010 + 60 * clamp(d / 0.49);
        y = Math.min(682, 456 + 1000 * d * d);
        rot = Math.PI * clamp(d / 0.49);
      }
      const eaten = seg(t, 6.0, 7.3);
      if (t > 3.78) oval(ctx, 1072, 695, 70 * (1 - eaten), 9, `rgba(220,38,38,${0.8 * (1 - eaten)})`);
      if (eaten < 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(1 - eaten, 1 - eaten);
        box(ctx, -56, -14, 112, 28, '#d4a056', 8, '#92400e', 4);
        box(ctx, -50, -18, 100, 9, '#dc2626', 4);
        ctx.restore();
      }
      // the dog trots in from the left and cleans up
      const hx = t < 4.8 ? -250 : lerp(-250, 990, ease.out(seg(t, 4.8, 5.9)));
      const bob = t > 5.9 && t < 7.3 ? Math.abs(Math.sin(t * 9)) * 12 : 0;
      for (const lx of [-190, -160, -80, -50]) line(ctx, [[hx + lx, 630], [hx + lx, 698]], '#b45309', 20);
      oval(ctx, hx - 120, 615, 110, 50, '#d97706');
      line(ctx, [[hx - 225, 600], [hx - 270, 560 + Math.sin(t * 14) * 15]], '#b45309', 14);
      emoji(ctx, '🐶', hx, 560 + bob, 140);
      const face = pick(t, [[0, '🙂'], [3.3, '😮'], [4.2, '😩'], [6.3, '😂']]);
      kid(ctx, 1180, 700, { face, shirt: '#8b5cf6', armL: t < 2.9 ? 0.4 : t < 3.3 ? lerp(0.4, 1.7, seg(t, 2.9, 3.05)) : 1.0, armR: 0.4 });
      popText(ctx, 'SPLAT!', 1060, 560, 90, t, 3.82, 4.9, '#f87171');
    },
  }),

  clip({
    id: 'loop', duration: 8, pauseAt: 3.6, title: 'The Loop-the-Loop', cues: [[0.8, 'click'], [3.3, 'whoosh'], [6.0, 'shake'], [6.2, 'correct']],
    scene(ctx, t) {
      room(ctx, { wall: ['#0f3d3e', '#0b2c2d'] });
      line(ctx, [[80, 120], [700, 700]], '#f97316', 16);
      line(ctx, [[700, 700], [1560, 700]], '#f97316', 16);
      for (const [sx, sy] of [[200, 232], [400, 420], [560, 570]]) line(ctx, [[sx, sy + 10], [sx, 700]], '#64748b', 8);
      ctx.save();
      ctx.lineWidth = 16;
      ctx.strokeStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(1000, 520, 180, 0, TAU);
      ctx.stroke();
      ctx.restore();
      line(ctx, [[1000, 700], [1000, 720]], '#64748b', 10);
      const ang = Math.atan2(580, 620);
      let pos;
      let rot = 0;
      if (t < 0.8) {
        pos = [80 + Math.sin(ang) * 30 + 20, 120 - Math.cos(ang) * 30 + 15];
        rot = ang;
      } else if (t < 2.6) {
        const p = seg(t, 0.8, 2.6) ** 2;
        pos = [lerp(100, 700, p) + Math.sin(ang) * 30, lerp(140, 700, p) - Math.cos(ang) * 30];
        rot = ang;
      } else if (t < 3.3) {
        pos = [lerp(720, 1000, seg(t, 2.6, 3.3)), 672];
        rot = ang * (1 - seg(t, 2.6, 2.8));
      } else if (t < 4.8) {
        const p = seg(t, 3.3, 4.8);
        const phi = TAU * (p - 0.06 * Math.sin(TAU * p));
        pos = [1000 + 152 * Math.sin(phi), 520 + 152 * Math.cos(phi)];
        rot = -phi;
      } else {
        pos = [1000 + 410 * ease.out(seg(t, 4.8, 6.0)), 672];
      }
      toyCar(ctx, pos[0], pos[1] + 6, rot, '#2563eb');
      // cardboard garage
      const wob = t > 6.0 ? Math.sin((t - 6) * 25) * 4 * (1 - seg(t, 6, 6.8)) : 0;
      box(ctx, 1380 + wob, 560, 190, 140, '#c8a26b', 6, '#8a6a3f', 4);
      box(ctx, 1380 + wob, 610, 70, 90, '#3f2d17', 4);
      say(ctx, 'GARAGE', 1505 + wob, 590, 30, '#5b3f1d');
      if (t > 6.1) emoji(ctx, '🏁', 1475, 520 - 30 * ease.back(seg(t, 6.1, 6.5)), 80, { rot: Math.sin(t * 6) * 0.15 });
      popText(ctx, 'Made it!', 760, 250, 110, t, 6.2);
    },
  }),

  clip({
    id: 'icecube', duration: 9, pauseAt: 2.85, title: 'Ice Cube vs. Hot Pan', cues: [[2.6, 'click'], [2.98, 'scan'], [4.0, 'scan']],
    scene(ctx, t) {
      box(ctx, 0, 0, VW, VH, '#e8eef5');
      for (let x = 0; x < VW; x += 100) line(ctx, [[x, 0], [x, 600]], 'rgba(100,116,139,0.25)', 3);
      for (let y = 0; y < 600; y += 100) line(ctx, [[0, y], [VW, y]], 'rgba(100,116,139,0.25)', 3);
      box(ctx, 200, 600, 1200, 300, '#1e293b');
      const g = ctx.createRadialGradient(800, 610, 10, 800, 610, 330);
      g.addColorStop(0, 'rgba(255,120,30,0.95)');
      g.addColorStop(1, 'rgba(255,120,30,0)');
      oval(ctx, 800, 610, 330, 40, g);
      for (let i = 0; i < 6; i++) {
        const x0 = 560 + i * 90;
        const pts = [];
        for (let k = 0; k <= 10; k++) pts.push([x0 + Math.sin(t * 4 + k * 0.8 + i) * 10, 540 - k * 22 - ((t * 60) % 22)]);
        line(ctx, pts, 'rgba(255,170,90,0.35)', 4);
      }
      box(ctx, 520, 560, 560, 40, '#111827', 18);
      box(ctx, 1080, 568, 260, 22, '#0f172a', 10);
      // tongs drop the cube
      const hy = lerp(80, 230, ease.inOut(seg(t, 0.3, 2.3)));
      const open = seg(t, 2.5, 2.6) * 18;
      box(ctx, 760, -10, 80, hy + 10, '#475569');
      line(ctx, [[790, hy], [770 - open, hy + 85]], '#94a3b8', 10);
      line(ctx, [[810, hy], [830 + open, hy + 85]], '#94a3b8', 10);
      let cx = 800;
      let cy = hy + 110;
      let rot = 0;
      let size = 80;
      if (t > 2.6) {
        const d = t - 2.6;
        cy = Math.min(520, 340 + 1250 * d * d);
      }
      if (t > 2.98) {
        const d = t - 2.98;
        size = 80 * (1 - 0.85 * seg(t, 3.0, 7.6));
        cx = 800 + 170 * Math.sin(2.2 * d) * (1 - 0.08 * d) + 50 * Math.sin(5.3 * d);
        cy = 560 - size / 2 - 6 * Math.abs(Math.sin(9 * d));
        rot = d * 3;
      }
      for (let i = 0; i < 16; i++) {
        const ti = 3.0 + i * 0.3;
        const d = t - ti;
        if (d > 0 && d < 1.6 && ti < 7.8) {
          const sx = 800 + 170 * Math.sin(2.2 * (ti - 2.98)) + Math.sin(d * 3 + i) * 20;
          disc(ctx, sx, 520 - d * 170, 14 + d * 30, `rgba(255,255,255,${0.55 * (1 - d / 1.6)})`);
        }
      }
      if (t < 7.6) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        box(ctx, -size / 2, -size / 2, size, size, 'rgba(186,230,253,0.92)', size * 0.18, '#7dd3fc', 4);
        box(ctx, -size / 3, -size / 3, size / 3, size / 5, 'rgba(255,255,255,0.8)', 4);
        ctx.restore();
      } else if (t < 8.4) {
        for (let k = 0; k < 3; k++) disc(ctx, cx + (k - 1) * 30 + Math.sin(t * 20 + k) * 8, 548 - Math.abs(Math.sin(t * 14 + k)) * 14, 6 * (1 - seg(t, 7.6, 8.4)), '#7dd3fc');
      }
      popText(ctx, 'TSSSSS!', 800, 300, 110, t, 3.0, 4.4, '#f97316');
    },
  }),

  clip({
    id: 'illusion', duration: 10, pauseAt: 4.5, title: 'Which Line Is Longer?', cues: [[6.0, 'whoosh'], [7.6, 'correct']],
    scene(ctx, t) {
      box(ctx, 0, 0, VW, VH, '#3b2a1a');
      box(ctx, 100, 60, 1400, 780, '#7c4a26', 20);
      box(ctx, 130, 90, 1340, 720, '#14532d', 10);
      box(ctx, 160, 800, 1280, 22, '#a16207', 6);
      const chalk = 'rgba(248,250,252,0.92)';
      const q = 'Which line is LONGER?';
      const shown = q.slice(0, Math.round(q.length * seg(t, 0.4, 1.8)));
      ctx.save();
      ctx.font = `800 64px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = chalk;
      ctx.fillText(shown, 800, 200);
      ctx.restore();
      const draw = (x1, y1, x2, y2, p, alpha = 1) => {
        if (p <= 0 || alpha <= 0) return;
        line(ctx, [[x1, y1], [lerp(x1, x2, p), lerp(y1, y2, p)]], `rgba(248,250,252,${0.92 * alpha})`, 10);
      };
      const fade = 1 - seg(t, 5.0, 5.8);
      draw(500, 340, 1100, 340, seg(t, 1.6, 2.4));
      for (const [a, b] of [[[500, 340], [445, 285]], [[500, 340], [445, 395]], [[1100, 340], [1155, 285]], [[1100, 340], [1155, 395]]]) draw(a[0], a[1], b[0], b[1], seg(t, 2.4, 2.9), fade);
      draw(500, 600, 1100, 600, seg(t, 2.9, 3.7));
      for (const [a, b] of [[[500, 600], [555, 545]], [[500, 600], [555, 655]], [[1100, 600], [1045, 545]], [[1100, 600], [1045, 655]]]) draw(a[0], a[1], b[0], b[1], seg(t, 3.7, 4.2), fade);
      if (t > 6.0) {
        const p = seg(t, 6.0, 6.8);
        for (const x of [500, 1100]) line(ctx, [[x, 300], [x, lerp(300, 650, p)]], 'rgba(253,224,71,0.9)', 6, [18, 14]);
      }
      if (t > 6.8) {
        for (const y of [300, 560]) {
          line(ctx, [[500, y], [1100, y]], 'rgba(253,224,71,0.9)', 5);
          say(ctx, '60 cm', 800, y - 30, 40, '#fde047', { scale: ease.back(seg(t, 6.8, 7.1)) });
        }
      }
      popText(ctx, 'SAME LENGTH!', 800, 470, 110, t, 7.6, Infinity, '#fde047', -0.03);
    },
  }),

  clip({
    id: 'sprinkler', duration: 10, pauseAt: 5.3, title: 'Here Comes the Sprinkler', cues: [[6.1, 'pop'], [7.2, 'correct']],
    scene(ctx, t) {
      outdoors(ctx, { groundY: 760 });
      for (let x = 20; x < VW; x += 60) box(ctx, x, 560, 34, 200, '#f8fafc', 6);
      box(ctx, 0, 610, VW, 14, '#e2e8f0');
      // bench
      box(ctx, 1140, 634, 260, 22, '#92400e', 6);
      box(ctx, 1150, 560, 240, 18, '#92400e', 6);
      for (const x of [1160, 1370]) box(ctx, x, 656, 16, 104, '#78350f');
      // the sweeping spray
      const phi = -0.85 + 2.0 * seg(t, 0, 6.6) - 2.0 * ease.inOut(seg(t, 7.4, 10));
      let lx = 560 + 760 * Math.sin(phi);
      const shielded = t > 6.3 && lx > 1150;
      const endY = shielded ? 470 : 760;
      if (shielded) lx = 1160;
      for (let j = 0; j < 18; j++) {
        const p = (j / 18 + t * 1.4) % 1;
        const x = lerp(560, lx, p);
        const y = 735 - 4 * 300 * p * (1 - p) * (shielded ? 0.75 : 1) + p * (endY - 735);
        disc(ctx, x, y, 6 + (j % 3), 'rgba(56,189,248,0.85)');
      }
      if (shielded) {
        for (let i = 0; i < 8; i++) {
          const d = (t * 2 + i / 8) % 1;
          disc(ctx, 1160 - d * 120, 470 - d * 60 + d * d * 200, 5, 'rgba(125,211,252,0.8)');
        }
      }
      box(ctx, 530, 740, 60, 20, '#334155', 6);
      line(ctx, [[560, 740], [560 + Math.sin(phi) * 26, 740 - Math.cos(phi) * 26]], '#64748b', 10);
      // kid reading on the bench, umbrella at the ready
      const opened = t > 6.1;
      if (!opened) emoji(ctx, '🌂', 1128, 640, 150, { rot: -0.35 });
      const face = pick(t, [[0, '🙂'], [5.9, '😮'], [7.2, '😎']]);
      kid(ctx, 1250, 734, { face, shirt: '#e11d48', sit: true, armL: opened ? 2.9 : 1.2, armR: 1.2 });
      emoji(ctx, '📖', 1305, 540, 90);
      if (opened) emoji(ctx, '☂️', 1255, 420, 270 * ease.back(seg(t, 6.1, 6.35)));
      popText(ctx, 'Dry!', 1250, 220, 110, t, 7.3);
    },
  }),

  clip({
    id: 'cradle', duration: 9, pauseAt: 4.2, title: "Newton's Cradle", cues: [[4.35, 'tick'], [5.85, 'tick'], [7.35, 'tick']],
    scene(ctx, t) {
      box(ctx, 0, 0, VW, VH, grad(ctx, 0, 0, 0, VH, [[0, '#1e293b'], [1, '#0f172a']]));
      box(ctx, 380, 760, 840, 40, '#334155', 10);
      for (const x of [470, 1130]) box(ctx, x - 8, 200, 16, 562, '#94a3b8');
      box(ctx, 462, 196, 676, 16, '#94a3b8', 6);
      const L = 360;
      const T0 = 4.35;
      const P = 1.5;
      const angles = [0, 0, 0, 0, 0];
      if (t < T0) {
        const pull = t < 3.6 ? -0.7 * ease.inOut(seg(t, 1.0, 3.0)) : -0.7 * Math.cos((Math.PI / 2) * ((t - 3.6) / 0.75));
        angles[0] = angles[1] = pull;
      } else {
        const n = Math.floor((t - T0) / P);
        const s = t - T0 - n * P;
        const A = 0.7 * 0.88 ** n;
        if (n % 2 === 0) angles[3] = angles[4] = A * Math.sin((Math.PI * s) / P);
        else angles[0] = angles[1] = -A * Math.sin((Math.PI * s) / P);
      }
      for (let i = 0; i < 5; i++) {
        const px = 640 + i * 80;
        const bx = px + L * Math.sin(angles[i]);
        const by = 212 + L * Math.cos(angles[i]);
        line(ctx, [[px, 212], [bx, by]], 'rgba(226,232,240,0.8)', 3);
        const g = ctx.createRadialGradient(bx - 12, by - 14, 4, bx, by, 40);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#64748b');
        disc(ctx, bx, by, 40, g);
      }
      if (t > 0.8 && t < 3.6) {
        const bx = 640 + L * Math.sin(angles[0]);
        const by = 212 + L * Math.cos(angles[0]);
        emoji(ctx, '🤏', bx - 70, by + 10, 90, { alpha: seg(t, 0.8, 1.0) });
      }
    },
  }),

  clip({
    id: 'birds', duration: 9, pauseAt: 4.8, title: 'Birds on a Wire', cues: [[4.05, 'shake'], [5.0, 'whoosh'], [5.9, 'pop']],
    scene(ctx, t) {
      box(ctx, 0, 0, VW, VH, grad(ctx, 0, 0, 0, VH, [[0, '#f59e0b'], [0.55, '#fb7185'], [1, '#7c3aed']]));
      disc(ctx, 1250, 620, 120, 'rgba(253,224,71,0.8)');
      ctx.beginPath();
      ctx.moveTo(0, 760);
      for (let x = 0; x <= VW; x += 40) ctx.lineTo(x, 740 - Math.sin(x / 180) * 40);
      ctx.lineTo(VW, VH);
      ctx.lineTo(0, VH);
      ctx.fillStyle = '#4c1d95';
      ctx.fill();
      for (const x of [80, 1520]) box(ctx, x - 14, 270, 28, 600, '#7c4a26');
      const sag = 22 + 230 * ease.out(seg(t, 4.0, 4.5));
      const wy = (x) => {
        const u = (x - 800) / 720;
        return 300 + sag * (0.7 * (1 - Math.abs(u)) + 0.3 * (1 - u * u));
      };
      const pts = [];
      for (let x = 80; x <= 1520; x += 20) pts.push([x, wy(x)]);
      line(ctx, pts, '#111827', 5);
      const xs = [250, 420, 590, 1010, 1180, 1350];
      xs.forEach((x0, i) => {
        const ta = 0.3 + i * 0.35;
        if (t < ta) return;
        const left = x0 < 800;
        const rank = left ? Math.round((800 - x0) / 170) - 1 : Math.round((x0 - 800) / 170) - 1;
        const target = left ? 800 - 95 - 62 * rank : 800 + 95 + 62 * rank;
        const ts = 5.0 + rnd(i) * 0.2;
        const x = lerp(x0, target, ease.in(seg(t, ts, ts + 0.8)));
        const land = ease.out(seg(t, ta, ta + 0.5));
        const slope = (wy(x + 5) - wy(x - 5)) / 10;
        const y = lerp(-60, wy(x) - 32, land);
        const fx = lerp(x - 180, x, land);
        emoji(ctx, '🐦', fx, y, 64, { rot: Math.atan(slope) * 0.8 });
        if (t > 4.9 && t < 5.5) say(ctx, '!', fx, y - 55, 40, '#ffffff');
      });
      const ty = t < 3.6 ? -200 : lerp(-200, wy(800) - 62, ease.out(seg(t, 3.6, 4.2)));
      emoji(ctx, '🦃', 800, ty, 140, { sy: t < 4.2 ? 1 + Math.sin(t * 25) * 0.08 : 1 });
    },
  }),

  clip({
    id: 'pancake', duration: 8, pauseAt: 3.7, title: 'The Big Flip', cues: [[2.6, 'whoosh'], [4.1, 'pop']],
    scene(ctx, t) {
      room(ctx, { wall: ['#f1f5f9', '#cbd5e1'], floor: ['#64748b', '#475569'], floorY: 760 });
      for (let x = 0; x < VW; x += 90) for (let y = 0; y < 760; y += 90) box(ctx, x + 3, y + 3, 84, 84, 'rgba(148,163,184,0.18)', 6);
      box(ctx, 1150, 560, 380, 200, '#334155', 8);
      box(ctx, 1170, 540, 340, 24, '#1e293b', 6);
      const face = pick(t, [[0, '🙂'], [2.5, '😃'], [3.1, '😮'], [4.1, '😳'], [5.0, '😂']]);
      const flick = t > 2.5 && t < 2.75 ? -30 * Math.sin(seg(t, 2.5, 2.75) * Math.PI) : 0;
      kid(ctx, 800, 760, { face, shirt: '#f8fafc', pants: '#1f2937', armR: 1.7, armL: 0.4 });
      // chef's hat
      const hx = 800;
      const hy = 475;
      box(ctx, hx - 45, hy - 112, 90, 56, '#ffffff', 8, '#cbd5e1', 3);
      for (const [dx, dy, r] of [[-34, -122, 34], [0, -140, 40], [34, -122, 34]]) disc(ctx, hx + dx, hy + dy, r, '#ffffff', '#cbd5e1', 3);
      // pan
      line(ctx, [[931, 548 + flick], [990, 545 + flick]], '#111827', 14);
      oval(ctx, 1060, 545 + flick, 75, 16, '#1f2937');
      // pancake
      let px = 1060;
      let py = 528 + flick;
      let ry = 16;
      let top = true;
      if (t > 2.65 && t < 4.1) {
        const d = t - 2.65;
        px = 1060 - 255 * ease.inOut(clamp(d / 1.4));
        py = 528 - 980 * d + 560 * d * d;
        const spin = d * 9;
        ry = 16 * Math.abs(Math.cos(spin)) + 3;
        top = Math.cos(spin) > 0;
      }
      if (t >= 4.1) {
        const squish = 1 + 0.25 * Math.sin(seg(t, 4.1, 4.4) * Math.PI);
        oval(ctx, 790, 296, 88 * squish, 20, '#d9a441');
        oval(ctx, 712, 318, 18, 30, '#d9a441', 0.3);
        oval(ctx, 870, 318, 18, 30, '#d9a441', -0.3);
        for (const [sx, sy] of [[760, 290], [810, 300], [835, 288]]) disc(ctx, sx, sy, 5, '#a16207');
      } else {
        oval(ctx, px, py, 72, ry, top ? '#f2c46d' : '#d9a441');
        if (ry > 8) for (const [sx, sy] of [[-25, -3], [12, 4], [30, -4]]) disc(ctx, px + sx, py + sy * (ry / 16), 5, '#c2851f');
      }
      popText(ctx, 'Ta-da!', 1100, 230, 100, t, 5.2);
    },
  }),

  clip({
    id: 'snowball', duration: 9, pauseAt: 5.6, title: 'The Runaway Snowball', cues: [[0.9, 'click'], [5.95, 'shake'], [6.6, 'pop'], [7.2, 'correct']],
    scene(ctx, t) {
      box(ctx, 0, 0, VW, VH, grad(ctx, 0, 0, 0, VH, [[0, '#93c5fd'], [1, '#e0f2fe']]));
      ctx.beginPath();
      ctx.moveTo(0, 240);
      ctx.lineTo(300, 260);
      ctx.lineTo(1250, 700);
      ctx.lineTo(VW, 700);
      ctx.lineTo(VW, VH);
      ctx.lineTo(0, VH);
      ctx.closePath();
      ctx.fillStyle = grad(ctx, 0, 240, 0, VH, [[0, '#ffffff'], [1, '#dbeafe']]);
      ctx.fill();
      emoji(ctx, '🌲', 120, 160, 120);
      emoji(ctx, '🌲', 1540, 600, 140);
      for (let i = 0; i < 40; i++) {
        const x = (rnd(i) * VW + t * 20 * (rnd(i + 1) - 0.5) + VW) % VW;
        const y = (rnd(i + 2) * VH + t * 60 * (0.5 + rnd(i + 3))) % VH;
        disc(ctx, x, y, 3 + rnd(i) * 3, 'rgba(255,255,255,0.85)');
      }
      // snowman at the bottom
      const hit = 5.95;
      const baseX = 1500 + (t > hit ? 220 * ease.out(seg(t, hit, hit + 0.6)) : 0);
      const baseA = 1 - seg(t, hit + 0.2, hit + 0.7);
      if (baseA > 0) {
        ctx.save();
        ctx.globalAlpha = baseA;
        disc(ctx, baseX, 638, 62, '#ffffff', '#cbd5e1', 3);
        ctx.restore();
      }
      const s = seg(t, 0.9, 5.9) ** 2;
      const r = 22 + 108 * s;
      let bc = [lerp(300, 1250, s) + 0.42 * r, lerp(260, 700, s) - 0.906 * r];
      if (t > 5.9) bc = [1305, 570];
      const midStart = [1500, 536];
      const headStart = [1500, 462];
      const fly = ease.inOut(seg(t, 6.0, 6.6));
      const mid = t > 6.0 ? bez(midStart, [1440, 230], [1305, 397], fly) : midStart;
      const head = t > 6.0 ? bez(headStart, [1450, 120], [1305, 325], fly) : headStart;
      disc(ctx, bc[0], bc[1], r, '#ffffff', '#cbd5e1', 3);
      if (t < 5.9) {
        const roll = (s * 1050) / r;
        line(ctx, [[bc[0] + Math.cos(roll) * r * 0.6, bc[1] + Math.sin(roll) * r * 0.6], [bc[0] + Math.cos(roll) * r * 0.75, bc[1] + Math.sin(roll) * r * 0.75]], '#cbd5e1', 4);
      }
      disc(ctx, mid[0], mid[1], 46, '#ffffff', '#cbd5e1', 3);
      for (const k of [0, 1]) disc(ctx, mid[0], mid[1] - 12 + k * 24, 5, '#1f2937');
      disc(ctx, head[0], head[1], 34, '#ffffff', '#cbd5e1', 3);
      disc(ctx, head[0] - 11, head[1] - 6, 4, '#1f2937');
      disc(ctx, head[0] + 9, head[1] - 6, 4, '#1f2937');
      ctx.beginPath();
      ctx.moveTo(head[0] - 4, head[1] + 4);
      ctx.lineTo(head[0] - 40, head[1] + 10);
      ctx.lineTo(head[0] - 4, head[1] + 13);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      box(ctx, head[0] - 26, head[1] - 34, 52, 8, '#111827', 3);
      box(ctx, head[0] - 17, head[1] - 72, 34, 40, '#111827', 4);
      const face = pick(t, [[0, '🙂'], [1.0, '😄'], [5.95, '😮'], [6.8, '🤩']]);
      kid(ctx, 175, 252, { face, shirt: '#dc2626', s: 0.7, armR: t < 1.0 ? 1.4 : 0.4, armL: t > 6.8 ? 2.8 : 0.3 });
      popText(ctx, 'New snowman!', 900, 240, 100, t, 7.0);
    },
  }),

  clip({
    id: 'dominogap', duration: 8, pauseAt: 3.5, title: 'The Domino Chain', cues: [[1.0, 'click'], [4.2, 'tick']],
    scene(ctx, t) {
      room(ctx, { wall: ['#3a3157', '#262040'] });
      const xs = [];
      for (let k = 0; k < 14; k++) xs.push(k <= 9 ? 260 + 84 * k : 260 + 84 * 9 + 235 + 84 * (k - 10));
      const t0 = (k) => 1.0 + 0.3 * k;
      const rest = Math.asin((84 - 46) / 130);
      for (let k = 0; k < 14; k++) {
        let rot = 0;
        if (k < 9) rot = rest * ease.in(seg(t, t0(k), t0(k) + 0.32)) + (1.2 - rest) * seg(t, t0(k + 1), t0(k + 1) + 0.35);
        else if (k === 9) rot = (Math.PI / 2) * ease.in(seg(t, t0(9), t0(9) + 0.5));
        domino(ctx, xs[k], 700, 46, 130, rot);
      }
      emoji(ctx, '👉', lerp(130, 228, ease.inOut(seg(t, 0.6, 1.0))), 640, 60);
      const face = pick(t, [[0, '🙂'], [1.0, '😃'], [4.6, '😐'], [5.6, '😑'], [6.6, '😅']]);
      kid(ctx, 110, 700, { face, shirt: '#0891b2', s: 0.85 });
      if (t > 5.0) bubble(ctx, '...', 110, 360, 54);
    },
  }),

  clip({
    id: 'pendulum', duration: 9, pauseAt: 4.5, title: 'The Brave Teacher', cues: [[2.0, 'whoosh'], [5.2, 'tick']],
    scene(ctx, t) {
      room(ctx, { wall: ['#3f3f46', '#27272a'], floor: ['#78350f', '#5b2a0b'], floorY: 780 });
      box(ctx, 160, 140, 520, 300, '#14532d', 10, '#78350f', 14);
      ctx.save();
      ctx.font = `700 46px ${SANS}`;
      ctx.fillStyle = 'rgba(248,250,252,0.85)';
      ctx.fillText('Energy in = energy out', 200, 300);
      ctx.restore();
      box(ctx, 840, 20, 80, 30, '#71717a', 6);
      const piv = [880, 40];
      const L = 491;
      const th0 = 0.576;
      let th = th0;
      if (t > 2.0) {
        const d = t - 2.0;
        th = th0 * Math.cos((TAU * d) / 3.2) * (1 - 0.08 * (d / 3.2));
      }
      const bx = piv[0] + L * Math.sin(th);
      const by = piv[1] + L * Math.cos(th);
      line(ctx, [piv, [bx, by]], '#d4d4d8', 5);
      const g = ctx.createRadialGradient(bx - 20, by - 22, 6, bx, by, 62);
      g.addColorStop(0, '#6366f1');
      g.addColorStop(1, '#1e1b4b');
      disc(ctx, bx, by, 62, g);
      for (const [dx, dy] of [[-14, -18], [10, -22], [-2, 2]]) disc(ctx, bx + dx, by + dy, 7, '#0b0a1f');
      const face = pick(t, [[0, '🙂'], [4.4, '😬'], [5.4, '😌'], [6.3, '😎']]);
      const hands = kid(ctx, 1270, 780, { face, shirt: '#1d4ed8', s: 1.15, armL: t < 2.0 ? 2.6 : 0.25, armR: t > 6.3 ? 2.5 : 0.25 });
      if (t > 6.3) emoji(ctx, '👍', hands.right[0] + 10, hands.right[1] - 30, 80);
      popText(ctx, 'Phew!', 1270, 230, 100, t, 5.4);
    },
  }),

  clip({
    id: 'coin', duration: 8, pauseAt: 3.4, title: 'The Coin Flip', cues: [[1.0, 'click'], [3.2, 'tick'], [3.5, 'tick'], [4.9, 'reveal']],
    scene(ctx, t) {
      box(ctx, 0, 0, VW, 620, grad(ctx, 0, 0, 0, 620, [[0, '#1e3a8a'], [1, '#3b82f6']]));
      box(ctx, 0, 620, VW, 280, grad(ctx, 0, 620, 0, VH, [[0, '#b5733f'], [1, '#7c4a26']]));
      for (let x = -60; x < VW; x += 200) line(ctx, [[x, 620], [x + 120, VH]], 'rgba(0,0,0,0.12)', 4);
      const kidFace = pick(t, [[0, '🙂'], [1.0, '😃'], [5.0, '😮'], [5.8, '🤯']]);
      emoji(ctx, kidFace, 260, 420, 200);
      emoji(ctx, t > 5.0 ? '🙀' : '🐱', 1360, 470, 170);
      emoji(ctx, '👍', 800, 760, 140, { rot: t > 0.9 && t < 1.2 ? -0.4 : 0 });
      let y = 640;
      let rx = 42;
      let ry = 42;
      let heads = true;
      if (t > 1.0 && t < 3.2) {
        const d = t - 1.0;
        y = 640 - 945 * d + 430 * d * d;
        const spin = d * 14;
        ry = Math.max(3, 42 * Math.abs(Math.cos(spin)));
        heads = Math.cos(spin) > 0;
      } else if (t >= 3.2 && t < 3.45) {
        y = 612 - 40 * Math.sin(seg(t, 3.2, 3.45) * Math.PI);
        ry = 10;
      } else if (t >= 3.45) {
        const stand = ease.inOut(seg(t, 4.4, 4.9));
        const wob = (1 - stand) * Math.abs(Math.sin(14 * (t - 3.45))) * 16 * (1 - seg(t, 3.45, 4.6) * 0.5);
        ry = lerp(8 + wob, 42, stand);
        y = lerp(612, 578, stand);
        rx = 42 - (t > 4.9 ? Math.sin((t - 4.9) * 18) * 3 * (1 - seg(t, 4.9, 5.4)) : 0);
      }
      oval(ctx, 800, y + 4, rx, ry, '#a16207');
      oval(ctx, 800, y, rx, ry, heads ? '#facc15' : '#eab308', 0, '#ca8a04', 3);
      if (ry > 20) say(ctx, heads ? '★' : '5', 800, y + 2, 40 * (ry / 42), '#a16207');
      popText(ctx, 'ON ITS EDGE!', 800, 220, 110, t, 5.3);
    },
  }),

  clip({
    id: 'soccer', duration: 8, pauseAt: 3.9, title: 'The Penalty Kick', cues: [[2.6, 'click'], [4.2, 'tick'], [4.55, 'pop'], [5.4, 'correct']],
    scene(ctx, t) {
      outdoors(ctx, { groundY: 700 });
      for (let x = 0; x < VW; x += 160) box(ctx, x, 700, 80, 200, 'rgba(255,255,255,0.06)');
      line(ctx, [[1100, 700], [1580, 700]], '#ffffff', 6);
      // goal (side view)
      const bulge = t > 5.2 ? Math.sin(seg(t, 5.2, 5.7) * Math.PI) * 30 : 0;
      for (let i = 0; i <= 8; i++) line(ctx, [[1320 + i * 25, 380 - i * 2.5], [1320 + i * 25 + (i > 4 ? bulge * (i - 4) / 4 : 0), 700]], 'rgba(255,255,255,0.45)', 2);
      for (let j = 0; j <= 10; j++) line(ctx, [[1320, 380 + j * 32], [1520 + bulge, 360 + j * 34]], 'rgba(255,255,255,0.45)', 2);
      line(ctx, [[1320, 700], [1320, 380], [1520, 360], [1520, 700]], '#ffffff', 12);
      // goalie dives too early and ends up lying under the bar
      const dive = ease.inOut(seg(t, 2.9, 3.4));
      kid(ctx, lerp(1400, 1430, dive), lerp(700, 690, dive), { face: pick(t, [[0, '😤'], [3.4, '😵'], [5.3, '😮']]), shirt: '#16a34a', armL: lerp(0.5, 2.9, dive), armR: lerp(0.5, 2.9, dive), lean: (-Math.PI / 2) * dive, s: 0.95 });
      const ball = along(t, [
        [2.6, 4.2, [330, 676], [800, 120], [1325, 395]],
        [4.2, 4.55, [1325, 395], [1352, 450], [1372, 610]],
        [4.55, 5.2, [1372, 610], [1420, 540], [1475, 676]],
      ], [330, 676]);
      emoji(ctx, '⚽', ball[0], ball[1], 64, { rot: t > 2.6 ? t * 8 : 0 });
      const cheer = t > 5.4;
      kid(ctx, 250, 700, { face: pick(t, [[0, '🙂'], [2.6, '😤'], [5.4, '🤩']]), shirt: '#2563eb', armL: cheer ? 2.8 : 0.4, armR: cheer ? 2.8 : 0.4, lean: t > 2.4 && t < 2.8 ? -0.15 : 0 });
      popText(ctx, 'GOAL!', 800, 260, 160, t, 5.4);
    },
  }),
];

export const CLIPS = Object.fromEntries(LIST.map((c) => [c.id, c]));
export const CLIP_IDS = LIST.map((c) => c.id);

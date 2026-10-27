// DOM helpers, toasts, modals and celebration effects shared by every screen.

/**
 * Build an element: h('button', { class: 'btn', onclick: fn }, 'Label', child, ...)
 * props: class, style (string|object), dataset, html (trusted markup only), on* handlers, any attribute.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // CSS custom properties ("--accent") only work through setProperty.
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clear = (el) => { el.replaceChildren(); return el; };

export function toast(message, type = '') {
  const t = h('div', { class: `toast ${type}` }, message);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 3200);
}

/** Simple modal. Returns { close, el }. */
export function modal({ title, body, actions = [], onClose, wide = false }) {
  const back = h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const box = h('div', { class: 'modal panel', style: wide ? { width: 'min(900px, 100%)' } : null },
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, title), h('button', { class: 'btn icon ghost', 'aria-label': 'Close', onclick: close }, '✕')),
    body,
    actions.length ? h('div', { class: 'actions' }, actions.map((a) => h('button', { class: `btn ${a.primary ? 'primary' : ''}`, onclick: () => a.onClick?.(close) }, a.label))) : null,
  );
  back.append(box);
  back.addEventListener('mousedown', (e) => e.target === back && close());
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  setTimeout(() => box.querySelector('input, button.primary, button')?.focus(), 50);
  return { close, el: box };
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

export function flash(el, cls = 'flash-good') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function countUp(el, to, ms = 1200) {
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const reducedMotion = () =>
  document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Burst of confetti over the whole screen. */
export function confetti(ms = 3500) {
  if (reducedMotion()) return;
  const c = h('canvas', { id: 'confetti' });
  document.body.append(c);
  const ctx = c.getContext('2d');
  const W = (c.width = innerWidth);
  const H = (c.height = innerHeight);
  const colors = ['#22d3ee', '#3b82f6', '#8b5cf6', '#ec4899', '#fbbf24', '#34d399', '#ffffff'];
  const parts = Array.from({ length: 220 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 18 - 6,
    s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0], shape: Math.random() < 0.3,
  }));
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.42;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / ms);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.shape) {
        ctx.beginPath();
        ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (t < ms) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

/** Ambient floating particles on the page background. */
export function startParticles() {
  const c = document.getElementById('bg-particles');
  if (!c) return;
  const ctx = c.getContext('2d');
  let W, H, dots;
  const resize = () => {
    W = c.width = innerWidth;
    H = c.height = innerHeight;
    dots = Array.from({ length: Math.min(90, Math.round((W * H) / 22000)) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.8 + 0.4, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, h: Math.random() < 0.5 ? 190 : 265,
    }));
  };
  resize();
  addEventListener('resize', resize);
  const frame = () => {
    if (!reducedMotion()) {
      ctx.clearRect(0, 0, W, H);
      for (const d of dots) {
        d.x = (d.x + d.vx + W) % W;
        d.y = (d.y + d.vy + H) % H;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${d.h}, 90%, 70%, 0.8)`;
        ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  };
  frame();
}

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen is not available here.'));
}

export const DIFFS = ['easy', 'medium', 'hard', 'expert', 'insane'];
export const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/** Difficulty selector. onChange(diff). counts optional {easy: n, ...}. */
export function difficultyPicker(value, onChange, counts = null) {
  const seg = h('div', { class: 'seg diff', role: 'radiogroup', 'aria-label': 'Difficulty' });
  const render = (v) => {
    seg.replaceChildren(...DIFFS.map((d) => h('button', {
      class: `diff-${d} ${d === v ? 'on' : ''}`, role: 'radio', 'aria-checked': String(d === v),
      onclick: () => { render(d); onChange(d); },
    }, cap(d), counts ? h('span', { class: 'muted', style: { marginLeft: '6px', fontSize: '0.8em' } }, counts[d] ?? 0) : null)));
  };
  render(value);
  return seg;
}

export function segmented(options, value, onChange) {
  const seg = h('div', { class: 'seg', role: 'radiogroup' });
  const render = (v) => {
    seg.replaceChildren(...options.map((o) => h('button', {
      class: o.value === v ? 'on' : '', role: 'radio', 'aria-checked': String(o.value === v), title: o.help || '',
      onclick: () => { render(o.value); onChange(o.value); },
    }, o.label)));
  };
  render(value);
  return seg;
}

export function switchRow(label, checked, onChange, help = '') {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch' }, h('span', {}, h('b', {}, label), help ? h('div', { class: 'muted', style: { fontSize: '0.85rem' } }, help) : null), input);
}

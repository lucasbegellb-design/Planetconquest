export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function wrapDx(dx, W) {
  if (dx > W / 2) return dx - W;
  if (dx < -W / 2) return dx + W;
  return dx;
}

export const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

const nfInt = typeof Intl !== 'undefined' ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }) : null;
const nf1 = typeof Intl !== 'undefined' ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }) : null;

export function fmtInt(n) { return nfInt ? nfInt.format(Math.round(n)) : String(Math.round(n)); }
export function fmt1(n) { return nf1 ? nf1.format(n) : n.toFixed(1); }

// Grands nombres compacts : 12,4 k / 3,2 M / 1,1 Md
export function fmtBig(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return fmt1(n / 1e9) + ' Md';
  if (a >= 1e6) return fmt1(n / 1e6) + ' M';
  if (a >= 1e4) return fmt1(n / 1e3) + ' k';
  return fmtInt(n);
}

// Population stockée en millions
export function fmtPop(millions) { return fmtBig(millions * 1e6); }

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

export function rgbToCss(c, a = 1) {
  return a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

export function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mixRgb(a, b, t) {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

export function colorDist(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  const rm = (a[0] + b[0]) / 2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

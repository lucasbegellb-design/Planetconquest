// Caméra 2D (monde cyclique horizontalement) + gestion souris / tactile (tap, glisser, pincer).
import { clamp, wrapDx } from '../core/util.js';

export class Camera {
  constructor(W, H, wrap = true) {
    this.W = W; this.H = H; this.wrap = wrap;
    this.x = W / 2; this.y = H / 2; this.zoom = 1;
    this.cw = 1; this.ch = 1; this.base = 1;
    this.fly = null;
    this.topInset = 0;
  }
  resize(cw, ch) {
    this.cw = cw; this.ch = ch;
    this.base = Math.min(cw / this.W, (ch * 1.6) / this.H);
    this.minZoom = Math.min(1, ch / this.H / this.base) * 0.9;
    this.minZoom = Math.min(this.minZoom, 1);
    this.maxZoom = 9 / this.base;
    this.clamp();
  }
  get scale() { return this.base * this.zoom; }
  toScreen(wx, wy) {
    const s = this.scale;
    const dx = this.wrap ? wrapDx(wx - this.x, this.W) : wx - this.x;
    return [dx * s + this.cw / 2, (wy - this.y) * s + this.ch / 2];
  }
  toWorld(sx, sy) {
    const s = this.scale;
    let x = (sx - this.cw / 2) / s + this.x;
    if (this.wrap) x = ((x % this.W) + this.W) % this.W;
    return [x, (sy - this.ch / 2) / s + this.y];
  }
  clamp() {
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    const s = this.scale, hh = this.ch / 2 / s;
    const mapH = this.H * s;
    if (mapH <= this.ch) this.y = this.H / 2;
    else this.y = clamp(this.y, hh - this.topInset / s, this.H - hh);
    if (this.wrap) this.x = ((this.x % this.W) + this.W) % this.W;
    else this.x = clamp(this.x, 0, this.W);
  }
  pan(dx, dy) { const s = this.scale; this.x -= dx / s; this.y -= dy / s; this.fly = null; this.clamp(); }
  zoomAt(sx, sy, f) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = clamp(this.zoom * f, this.minZoom, this.maxZoom);
    const s = this.scale;
    this.x = wx - (sx - this.cw / 2) / s;
    this.y = wy - (sy - this.ch / 2) / s;
    this.fly = null;
    this.clamp();
  }
  flyTo(wx, wy, zoom = this.zoom, dur = 0.8) {
    this.fly = { x0: this.x, y0: this.y, z0: this.zoom, dx: this.wrap ? wrapDx(wx - this.x, this.W) : wx - this.x, y1: wy, z1: clamp(zoom, this.minZoom, this.maxZoom), t: 0, dur };
  }
  update(dt) {
    const f = this.fly;
    if (!f) return false;
    f.t = Math.min(1, f.t + dt / f.dur);
    const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
    this.x = f.x0 + f.dx * e;
    this.y = f.y0 + (f.y1 - f.y0) * e;
    this.zoom = Math.exp(Math.log(f.z0) + (Math.log(f.z1) - Math.log(f.z0)) * e);
    this.clamp();
    if (f.t >= 1) this.fly = null;
    return true;
  }
  // décalages (en unités monde) des copies visibles de la carte
  copies() {
    if (!this.wrap) return [0];
    const s = this.scale;
    const left = this.x - this.cw / 2 / s, right = this.x + this.cw / 2 / s;
    const out = [];
    for (let k = Math.floor(left / this.W); k <= Math.floor(right / this.W); k++) out.push(k * this.W);
    return out;
  }
}

export function attachInput(el, cam, handlers) {
  const ptrs = new Map();
  let drag = null, pinch = null;
  const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    const p = pos(e);
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 1) drag = { x: p[0], y: p[1], sx: p[0], sy: p[1], t: performance.now(), moved: false };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
      if (drag) drag.moved = true;
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (!ptrs.has(e.pointerId)) { handlers.hover && handlers.hover(p[0], p[1]); return; }
    ptrs.set(e.pointerId, p);
    if (ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      cam.pan(mx - pinch.mx, my - pinch.my);
      if (pinch.d > 0) cam.zoomAt(mx, my, d / pinch.d);
      pinch = { d, mx, my };
    } else if (drag) {
      const dx = p[0] - drag.x, dy = p[1] - drag.y;
      if (!drag.moved && Math.hypot(p[0] - drag.sx, p[1] - drag.sy) > 7) drag.moved = true;
      if (drag.moved) cam.pan(dx, dy);
      drag.x = p[0]; drag.y = p[1];
    }
  });
  const end = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0 && drag) {
      if (!drag.moved && performance.now() - drag.t < 600 && e.type === 'pointerup') handlers.tap && handlers.tap(drag.sx, drag.sy);
      drag = null;
    } else if (ptrs.size === 1) {
      const [p] = [...ptrs.values()];
      drag = { x: p[0], y: p[1], sx: p[0], sy: p[1], t: 0, moved: true };
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pos(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    cam.zoomAt(p[0], p[1], Math.exp(-dy * 0.0016));
  }, { passive: false });
  el.addEventListener('dblclick', (e) => { const p = pos(e); cam.zoomAt(p[0], p[1], 2); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Rendu canvas : carte raster (1 drawImage / copie), animations de conquête pixel par pixel,
// flèches d'offensive, explosions sur les fronts, étiquettes des pays, mini-carte.
import { MapPainter } from './paint.js';
import { Camera } from './camera.js';
import { wrapDx, clamp, rgbToCss, fmtBig, mixRgb } from '../core/util.js';
import { ERAS } from '../tech/techtree.js';

// Niveaux de qualité (ajustés automatiquement selon la fluidité mesurée)
const QUALITY = [
  { dpr: 2, particles: 450, smoke: true },
  { dpr: 1.5, particles: 220, smoke: true },
  { dpr: 1, particles: 90, smoke: false },
];

export class Renderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    const { W, H } = map;
    this.W = W; this.H = H;
    this.painter = new MapPainter(map, map.palette || {});
    this.off = document.createElement('canvas');
    this.off.width = W; this.off.height = H;
    this.octx = this.off.getContext('2d');
    this.img = new ImageData(this.painter.buf, W, H);
    this.cam = new Camera(W, H, true);
    this.dirty = [];
    this.anims = new Map();
    this.pending = [];
    this.particles = [];
    this.rings = [];
    this.labels = [];
    this.labelVer = -1; this.labelT = 0;
    this.textW = new Map();
    this.game = null;
    this.selCell = -1; this.selCountry = -1;
    this.time = 0;
    this.stamp = new Int32Array(W * H);
    this.stampId = 0;
    this.frontCache = new Map();
    this.showLabels = true;
    this.pickMode = false;
    this.resize();
  }

  resize() {
    this.quality ??= 0;
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr);
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.cam.resize(w, h);
  }

  // ---------- liaison avec la simulation ----------
  attach(game) {
    this.game = game;
    const p = this.painter;
    p.ownerOf = (id) => game.owner[id];
    p.colorOf = (o) => game.countries[o].color;
    p.isNeutral = (o) => game.countries[o].neutral;
    p.playerId = game.playerId;
    game.on('capture', (e) => this.onCapture(e));
    game.on('disaster', (e) => {
      const c = this.map.cells[e.cell];
      this.rings.push({ x: c.ax, y: c.ay, color: [255, 120, 60], age: 0, life: 1.6, r: 10 });
    });
    this.fullRepaint();
  }
  // coloration « initiale » (écran de choix du pays, avant la création de la partie)
  attachStatic(ownerArr, colors, neutralFn) {
    const p = this.painter;
    p.ownerOf = (id) => ownerArr[id];
    p.colorOf = (o) => colors[o] || [150, 142, 128];
    p.isNeutral = neutralFn;
    p.playerId = -1;
    this.fullRepaint();
  }

  fullRepaint() {
    this.painter.paintAll();
    this.octx.putImageData(this.img, 0, 0);
    this.dirty.length = 0;
  }

  markCell(id) {
    const c = this.map.cells[id], W = this.W;
    const y0 = c.y0, h = c.y1 - c.y0 + 1;
    let x0 = c.x0, x1 = c.x1;
    if (x0 < 0) { this.dirty.push([x0 + W, y0, W - (x0 + W), h]); x0 = 0; }
    if (x1 >= W) { this.dirty.push([0, y0, x1 - W + 1, h]); x1 = W - 1; }
    this.dirty.push([x0, y0, x1 - x0 + 1, h]);
  }
  flush() {
    if (!this.dirty.length) return;
    this.halfDirty = true;
    if (this.dirty.length > 40) {
      this.octx.putImageData(this.img, 0, 0);
    } else {
      for (const [x, y, w, h] of this.dirty) if (w > 0 && h > 0) this.octx.putImageData(this.img, 0, 0, x, y, w, h);
    }
    this.dirty.length = 0;
  }

  repaintCell(id) { this.painter.paintCell(id); this.markCell(id); }
  repaintCountry(cid) {
    if (cid < 0 || !this.game) return;
    const set = this.game.cellsOf[cid];
    if (!set) return;
    const touched = new Set();
    for (const id of set) {
      this.painter.paintCell(id); this.markCell(id);
      for (const nb of this.map.cells[id].nbrs) if (!set.has(nb)) touched.add(nb);
    }
    for (const nb of touched) { this.painter.paintEdges(nb); this.markCell(nb); }
  }
  setSelection(cell, country) {
    const oldC = this.selCountry, oldCell = this.selCell;
    this.selCell = cell; this.selCountry = country;
    this.painter.selCell = cell; this.painter.selCountry = country;
    if (this.pickMode) {
      // en mode choix : repeint via la coloration statique
      const repaintStatic = (k) => {
        if (k < 0) return;
        for (const c of this.map.cells) if (this.painter.ownerOf(c.id) === k) { this.painter.paintCell(c.id); this.markCell(c.id); }
      };
      if (oldC !== country) { repaintStatic(oldC); repaintStatic(country); }
      return;
    }
    if (oldC !== country) { this.repaintCountry(oldC); this.repaintCountry(country); }
    if (oldCell >= 0) this.repaintCell(oldCell);
    if (cell >= 0) this.repaintCell(cell);
  }

  // ---------- animation de conquête ----------
  onCapture(e) {
    if (e.delay > 0) this.pending.push({ ...e, at: this.time + e.delay });
    else this.startAnim(e);
  }
  startAnim(e) {
    const prev = this.anims.get(e.cell);
    if (prev) this.finishAnim(prev);
    const cell = this.map.cells[e.cell];
    const order = this.buildOrder(cell, e.to);
    const n = order.length;
    this.anims.set(e.cell, { cell: e.cell, to: e.to, order, n, start: this.time, dur: 0.5 + 0.25 * Math.sqrt(n / 900), done: 0 });
    const col = this.game.countries[e.to].color;
    this.rings.push({ x: cell.ax, y: cell.ay, color: col, age: 0, life: 0.9, r: 5 + Math.sqrt(cell.n) * 0.35 });
    this.frontCache.clear();
  }
  buildOrder(cell, to) {
    const { W, H, cellOf } = this.map;
    const owner = this.game.owner;
    const id = cell.id, n = cell.px.length;
    const order = new Int32Array(n);
    const st = ++this.stampId, stamp = this.stamp;
    let qt = 0;
    for (let i = 0; i < cell.edge.length; i++) {
      const nb = cell.edgeNbr[i];
      if (nb >= 0 && nb !== id && owner[nb] === to) { const p = cell.edge[i]; if (stamp[p] !== st) { stamp[p] = st; order[qt++] = p; } }
    }
    if (qt === 0) {
      // conquête maritime ou capitulation : propagation depuis le centre
      const ap = Math.round(cell.ay) * W + Math.round(cell.ax);
      const start = cellOf[ap] === id ? ap : cell.px[0];
      stamp[start] = st; order[qt++] = start;
    }
    let qh = 0;
    while (qh < qt) {
      const p = order[qh++];
      const x = p % W, y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          let xx = x + dx; if (xx < 0) xx += W; else if (xx >= W) xx -= W;
          const q = yy * W + xx;
          if (cellOf[q] === id && stamp[q] !== st) { stamp[q] = st; order[qt++] = q; }
        }
      }
    }
    if (qt < n) for (const p of cell.px) if (stamp[p] !== st) { stamp[p] = st; order[qt++] = p; }
    return order;
  }
  stepAnims() {
    if (this.pending.length) {
      const now = this.time;
      const ready = this.pending.filter((p) => p.at <= now);
      if (ready.length) {
        this.pending = this.pending.filter((p) => p.at > now);
        for (const e of ready) this.startAnim(e);
      }
    }
    if (!this.anims.size) return;
    const buf = this.painter.buf, c = [0, 0, 0];
    for (const a of this.anims.values()) {
      const t = clamp((this.time - a.start) / a.dur, 0, 1);
      const e = 1 - (1 - t) * (1 - t);
      const k = Math.floor(e * a.n);
      const band = Math.max(6, Math.floor(a.n * 0.1));
      const col = this.game.countries[a.to].color;
      const glow = mixRgb(col, [255, 250, 220], 0.75);
      for (let i = Math.max(0, a.done - band); i < k; i++) {
        const p = a.order[i];
        this.painter._base(p, a.to, c);
        const d = k - i;
        if (d < band) { const g = (1 - d / band) * 0.85; c[0] += (glow[0] - c[0]) * g; c[1] += (glow[1] - c[1]) * g; c[2] += (glow[2] - c[2]) * g; }
        const o = p * 4;
        buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
      }
      a.done = k;
      this.markCell(a.cell);
      if (t >= 1) this.finishAnim(a);
    }
  }
  finishAnim(a) {
    this.anims.delete(a.cell);
    this.painter.paintCell(a.cell);
    this.markCell(a.cell);
    for (const nb of this.map.cells[a.cell].nbrs) { this.painter.paintEdges(nb); this.markCell(nb); }
  }

  // ---------- étiquettes ----------
  computeLabels() { this._labels(this.game.cellsOf, this.game.countries); }
  // étiquettes à partir d'un tableau de propriétaires (timelapse)
  computeLabelsFrom(owner, countries) {
    const sets = countries.map(() => new Set());
    for (let i = 0; i < owner.length; i++) sets[owner[i]].add(i);
    this._labels(sets, countries, true);
  }
  _labels(cellsOf, countries, ignoreAlive = false) {
    const cells = this.map.cells, W = this.W;
    const out = [];
    for (const c of countries) {
      if (c.neutral || (!ignoreAlive && !c.alive)) continue;
      const set = cellsOf[c.id];
      if (!set.size) continue;
      let cs = 0, sn = 0, sy = 0, tot = 0;
      for (const id of set) {
        const cl = cells[id], a = (cl.cx / W) * Math.PI * 2;
        cs += Math.cos(a) * cl.n; sn += Math.sin(a) * cl.n; sy += cl.cy * cl.n; tot += cl.n;
      }
      let mx = (Math.atan2(sn, cs) / (Math.PI * 2)) * W; if (mx < 0) mx += W;
      const my = sy / tot;
      let best = -1, bd = Infinity;
      for (const id of set) {
        const cl = cells[id];
        let nOwn = 0;
        for (const nb of cl.nbrs) if (set.has(nb)) nOwn++;
        const d = Math.hypot(wrapDx(cl.cx - mx, W), cl.cy - my) / (1 + nOwn * 0.15);
        if (d < bd) { bd = d; best = id; }
      }
      const b = cells[best];
      out.push({ id: c.id, x: b.cx, y: b.cy, size: clamp(Math.sqrt(tot) * 0.16, 3.2, 60), text: c.name });
    }
    out.sort((a, b) => b.size - a.size);
    this.labels = out;
  }
  labelsStatic(countries) {
    const cells = this.map.cells;
    this.labels = countries.map((c, i) => {
      const tot = c.cells.reduce((s, id) => s + cells[id].n, 0);
      const cap = cells[c.capital];
      return { id: i, x: cap.cx, y: cap.cy, size: clamp(Math.sqrt(tot) * 0.16, 3.2, 60), text: c.name };
    }).sort((a, b) => b.size - a.size);
  }
  measure(text) {
    let w = this.textW.get(text);
    if (w === undefined) { this.ctx.font = '600 100px ' + this.fontFamily(); w = this.ctx.measureText(text).width / 100; this.textW.set(text, w); }
    return w;
  }
  fontFamily() {
    const era = document.body.dataset.era;
    if (this._fontEra !== era) {
      this._fontEra = era;
      this._font = getComputedStyle(document.body).getPropertyValue('--head').trim() || 'Georgia, serif';
      this.textW.clear();
    }
    return this._font;
  }

  // ---------- effets ----------
  explosion(x, y, scale = 1) {
    const Q = QUALITY[this.quality];
    if (this.particles.length > Q.particles) return;
    const P = this.particles;
    P.push({ k: 0, x, y, age: 0, life: 0.32, r: 2.2 * scale });
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (8 + Math.random() * 16) * scale;
      P.push({ k: 1, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, age: 0, life: 0.35 + Math.random() * 0.35 });
    }
    if (Q.smoke && Math.random() < 0.6) P.push({ k: 2, x: x + (Math.random() - 0.5) * 2, y, vx: (Math.random() - 0.5) * 2, vy: -3 - Math.random() * 3, age: 0, life: 1 + Math.random() * 0.8, r: 1.2 * scale });
  }
  frontPixels(o) {
    const key = o.cur * 4096 + o.a;
    let list = this.frontCache.get(key);
    if (!list) {
      const cell = this.map.cells[o.cur];
      list = [];
      if (cell) for (let i = 0; i < cell.edge.length; i++) { const nb = cell.edgeNbr[i]; if (nb >= 0 && this.game.owner[nb] === o.a) list.push(cell.edge[i]); }
      this.frontCache.set(key, list);
    }
    return list;
  }

  // ---------- boucle de rendu ----------
  render(dt) {
    this.time += dt;
    this.adaptQuality(dt);
    this.cam.update(dt);
    if (this.game && !this.replayMode) {
      this.stepAnims();
      this.spawnBattleFx(dt);
      if (this.game.ownVer !== this.labelVer && this.time - this.labelT > 0.4) {
        this.labelVer = this.game.ownVer; this.labelT = this.time;
        this.computeLabels();
        this.frontCache.clear();
      }
    }
    this.flush();
    const ctx = this.ctx, cam = this.cam, s = cam.scale, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cam.cw, cam.ch);
    ctx.imageSmoothingEnabled = s < 1.6;
    ctx.imageSmoothingQuality = 'high';
    const copies = cam.copies();
    const ox = cam.cw / 2 - cam.x * s, oy = cam.ch / 2 - cam.y * s;
    this.drawMap(ctx, s, ox, oy, copies);

    for (const k of copies) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(ox + k * s, oy);
      if (this.game && !this.replayMode) {
        this.drawCapitals(ctx, s);
        this.drawOffensives(ctx, s);
      }
      this.drawParticles(ctx, s, dt);
      if (this.showLabels) this.drawLabels(ctx, s);
      this.drawSelection(ctx, s);
      this.drawAim(ctx, s);
      ctx.restore();
    }
    // vieillissement des particules (une seule fois par image)
    this.ageFx(dt);
    if (this.rocket) this.stepRocket(dt);
  }

  // Baisse la résolution / les effets si les images mettent trop de temps, remonte si tout va bien
  adaptQuality(dt) {
    if (dt <= 0 || dt >= 0.1) return;
    this.ema = this.ema ? this.ema * 0.94 + dt * 0.06 : dt;
    if (this.ema > 0.026) { this.slowT = (this.slowT || 0) + dt; this.fastT = 0; }
    else if (this.ema < 0.0175) { this.fastT = (this.fastT || 0) + dt; this.slowT = 0; }
    if (this.slowT > 2.5 && this.quality < 2) { this.quality++; this.slowT = 0; this.resize(); }
    else if (this.fastT > 20 && this.quality > 0) { this.quality--; this.fastT = 0; this.resize(); }
  }

  // ---------- décollage de la fusée ----------
  launchRocket(cell, done) {
    const c = this.map.cells[cell];
    this.cam.flyTo(c.ax, c.ay - 20, Math.min(this.cam.maxZoom * 0.3, Math.max(this.cam.zoom, 6 / this.cam.base)), 1);
    this.rocket = { x: c.ax, y: c.ay, t: -1.1, done };
  }
  stepRocket(dt) {
    const R = this.rocket;
    R.t += dt;
    const t = Math.max(0, R.t), lift = t * t * 26;
    if (R.t > 0) {
      for (let k = 0; k < 3; k++) {
        this.particles.push({ k: 2, x: R.x + (Math.random() - 0.5) * 2, y: R.y - lift + 3, vx: (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 4, age: 0, life: 1.4 + Math.random(), r: 1.8 });
        this.particles.push({ k: 0, x: R.x + (Math.random() - 0.5), y: R.y - lift + 3.5, age: 0, life: 0.25, r: 1.4 });
      }
      this.cam.y = Math.min(this.cam.y, R.y - lift + 10);
    }
    const ctx = this.ctx, s = this.cam.scale;
    const [sx, sy] = this.cam.toScreen(R.x, R.y - lift);
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const k = Math.max(1.2, Math.min(3, s / 3));
    ctx.translate(sx, sy); ctx.scale(k, k);
    ctx.fillStyle = `rgba(255,${160 + Math.random() * 80},60,0.95)`;
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(0, 12 + Math.random() * 7); ctx.lineTo(3, 6); ctx.fill();
    ctx.fillStyle = '#eef2f7'; ctx.strokeStyle = '#223'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(5, -6, 4, 6); ctx.lineTo(-4, 6); ctx.quadraticCurveTo(-5, -6, 0, -12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9473b';
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(3.5, -8, 3.8, -5); ctx.lineTo(-3.8, -5); ctx.quadraticCurveTo(-3.5, -8, 0, -12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(-7, 8); ctx.lineTo(-4, 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(7, 8); ctx.lineTo(4, 6); ctx.fill();
    ctx.fillStyle = '#7fd4ff'; ctx.beginPath(); ctx.arc(0, -2, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (R.t > 2.6) {
      const a = Math.min(1, (R.t - 2.6) / 0.8);
      ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = `rgba(2,3,9,${a})`; ctx.fillRect(0, 0, this.cam.cw, this.cam.ch);
      ctx.restore();
    }
    if (R.t > 3.5) { const d = R.done; this.rocket = null; d && d(); }
  }

  // Ne copie que la partie visible ; demi-résolution quand on est dézoomé (bien plus rapide sans GPU)
  drawMap(ctx, s, ox, oy, copies) {
    const cam = this.cam, W = this.W, H = this.H;
    let src = this.off, f = 1;
    if (s < 0.55) {
      if (!this.half) {
        this.half = document.createElement('canvas');
        this.half.width = Math.ceil(W / 2); this.half.height = Math.ceil(H / 2);
        this.hctx = this.half.getContext('2d');
        this.halfDirty = true; this.halfT = -1;
      }
      if (this.halfDirty && this.time - this.halfT > 0.25) {
        this.hctx.imageSmoothingEnabled = true; this.hctx.imageSmoothingQuality = 'high';
        this.hctx.drawImage(this.off, 0, 0, this.half.width, this.half.height);
        this.halfDirty = false; this.halfT = this.time;
      }
      src = this.half; f = this.half.width / W;
    }
    const left = cam.x - cam.cw / 2 / s, right = cam.x + cam.cw / 2 / s;
    const top = Math.max(0, cam.y - cam.ch / 2 / s - 1), bottom = Math.min(H, cam.y + cam.ch / 2 / s + 1);
    if (bottom <= top) return;
    for (const k of copies) {
      const wx0 = Math.max(k, left - 1), wx1 = Math.min(k + W, right + 1);
      if (wx1 <= wx0) continue;
      const sx = wx0 - k, sw = wx1 - wx0;
      ctx.drawImage(src, sx * f, top * f, sw * f, (bottom - top) * f, ox + wx0 * s, oy + top * s, sw * s, (bottom - top) * s);
    }
  }

  spawnBattleFx(dt) {
    const g = this.game, W = this.W;
    for (const o of g.offensives) {
      if (o.cur < 0) continue;
      o._fx = (o._fx || 0) + dt * (1.5 + 9 * (o.fight || 0));
      while (o._fx >= 1) {
        o._fx -= 1;
        const list = this.frontPixels(o);
        let x, y;
        if (list.length) { const p = list[Math.floor(Math.random() * list.length)]; x = (p % W) + Math.random(); y = Math.floor(p / W) + Math.random(); }
        else { const c = this.map.cells[o.cur]; x = c.ax + (Math.random() - 0.5) * 6; y = c.ay + (Math.random() - 0.5) * 6; }
        this.explosion(x, y, 0.8 + (o.fight || 0) * 0.8);
      }
    }
  }
  ageFx(dt) {
    const P = this.particles;
    let j = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.vx !== undefined) { p.x += p.vx * dt * 0.25; p.y += p.vy * dt * 0.25; p.vy += 6 * dt; }
      P[j++] = p;
    }
    P.length = j;
    this.rings = this.rings.filter((r) => (r.age += dt) < r.life);
  }

  drawParticles(ctx, s, dt) {
    const z = Math.sqrt(s), TAU = Math.PI * 2;
    // un style par type, l'opacité passe par globalAlpha (évite des milliers de chaînes rgba)
    ctx.fillStyle = '#ffb347';
    for (const p of this.particles) {
      if (p.k !== 0) continue;
      const t = p.age / p.life;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath(); ctx.arc(p.x * s, p.y * s, p.r * (0.5 + t) * z * 1.6, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#ffe28a';
    for (const p of this.particles) {
      if (p.k !== 1) continue;
      const t = p.age / p.life;
      ctx.globalAlpha = 1 - t;
      const r = Math.max(0.8, 1.3 * z * (1 - t));
      ctx.fillRect(p.x * s - r / 2, p.y * s - r / 2, r, r);
    }
    ctx.fillStyle = '#46464a';
    for (const p of this.particles) {
      if (p.k !== 2) continue;
      const t = p.age / p.life;
      ctx.globalAlpha = 0.45 * (1 - t);
      ctx.beginPath(); ctx.arc(p.x * s, p.y * s, p.r * (1 + t * 2) * z * 1.5, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const t = r.age / r.life;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.css ||= rgbToCss(mixRgb(r.color, [255, 255, 255], 0.35));
      ctx.lineWidth = Math.max(1, 2.5 * (1 - t) * Math.min(2, z));
      ctx.beginPath(); ctx.arc(r.x * s, r.y * s, r.r * (0.4 + t) * s, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // flèche de visée (glisser pour attaquer)
  drawAim(ctx, s) {
    const A = this.aim;
    if (!A) return;
    const src = this.map.cells[A.src];
    const x0 = src.ax * s, y0 = src.ay * s;
    const x1 = (src.ax + wrapDx(A.x - src.ax, this.W)) * s, y1 = A.y * s;
    const ok = A.ok;
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 7]); ctx.lineDashOffset = -this.time * 40;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = ok ? '#ffd27a' : 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ok ? '#ffd27a' : 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(x1, y1, 9, 0, Math.PI * 2); ctx.fill();
    if (A.label) {
      ctx.font = '700 13px system-ui, sans-serif';
      const w = ctx.measureText(A.label).width + 16;
      ctx.fillStyle = 'rgba(8,12,20,0.92)';
      roundRect(ctx, x1 - w / 2, y1 - 44, w, 24, 12); ctx.fill();
      ctx.strokeStyle = A.color || '#ffd27a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(A.label, x1, y1 - 32);
    }
  }

  drawCapitals(ctx, s) {
    if (s < 0.45) return;
    const g = this.game, cells = this.map.cells;
    const size = clamp(2.2 * Math.sqrt(s), 2.5, 7);
    for (const c of g.countries) {
      if (c.neutral || !c.alive || c.capital < 0) continue;
      if (g.cellsOf[c.id].size < 2 && s < 1.2) continue;
      const cl = cells[c.capital];
      drawStar(ctx, cl.ax * s, cl.ay * s, size, c.isPlayer ? '#fff6c8' : 'rgba(255,255,255,0.85)', 'rgba(0,0,0,0.6)');
    }
  }

  drawOffensives(ctx, s) {
    const g = this.game, cells = this.map.cells, W = this.W;
    const pid = g.playerId;
    for (const o of g.offensives) {
      if (o.cur < 0 || o.src < 0) continue;
      const A = g.countries[o.a];
      const mine = o.a === pid, vsMe = o.d === pid;
      const big = o.troops > 20000 || mine || vsMe;
      if (!big && s < 0.6) continue;
      const a = cells[o.src], b = cells[o.cur];
      const x0 = a.ax, y0 = a.ay;
      const x1 = x0 + wrapDx(b.ax - x0, W), y1 = b.ay;
      const X0 = x0 * s, Y0 = y0 * s, X1 = x1 * s, Y1 = y1 * s;
      const len = Math.hypot(X1 - X0, Y1 - Y0);
      if (len < 4) continue;
      const nx = -(Y1 - Y0) / len, ny = (X1 - X0) / len;
      const bend = Math.min(40, len * 0.18);
      const cx = (X0 + X1) / 2 + nx * bend, cy = (Y0 + Y1) / 2 + ny * bend;
      const w = clamp(1.2 + Math.log10(1 + o.troops) * 0.6 * Math.min(1.6, Math.sqrt(s)), 1.5, 7);
      const col = rgbToCss(mixRgb(A.color, [255, 255, 255], 0.25));
      ctx.lineCap = 'round';
      ctx.setLineDash(o.naval ? [w * 2, w * 1.6] : []);
      ctx.lineDashOffset = -this.time * 30;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = w + 2.5;
      ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.quadraticCurveTo(cx, cy, X1, Y1); ctx.stroke();
      ctx.strokeStyle = vsMe ? `rgba(255,${90 + 60 * Math.sin(this.time * 6)},80,1)` : col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.quadraticCurveTo(cx, cy, X1, Y1); ctx.stroke();
      ctx.setLineDash([]);
      // pointe
      const tx = X1 - cx, ty = Y1 - cy, tl = Math.hypot(tx, ty) || 1;
      const ux = tx / tl, uy = ty / tl, hs = w * 2.4 + 3;
      ctx.fillStyle = vsMe ? '#ff6a5a' : col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(X1 + ux * hs * 0.4, Y1 + uy * hs * 0.4);
      ctx.lineTo(X1 - ux * hs - uy * hs * 0.6, Y1 - uy * hs + ux * hs * 0.6);
      ctx.lineTo(X1 - ux * hs + uy * hs * 0.6, Y1 - uy * hs - ux * hs * 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // unités en marche
      const unit = o.naval ? 'ship' : ERAS[A.era].unit;
      const us = clamp(5 * Math.sqrt(s), 4.5, 11);
      for (let k = 0; k < 2; k++) {
        const t = ((this.time * 0.35 + k * 0.5 + o.id * 0.13) % 1) * 0.8 + 0.05;
        const px = (1 - t) * (1 - t) * X0 + 2 * (1 - t) * t * cx + t * t * X1;
        const py = (1 - t) * (1 - t) * Y0 + 2 * (1 - t) * t * cy + t * t * Y1;
        drawUnit(ctx, unit, px, py, us, A.color);
      }
      // effectifs
      if (mine || vsMe || s > 1.2) {
        const mx = 0.25 * X0 + 0.5 * cx + 0.25 * X1, my = 0.25 * Y0 + 0.5 * cy + 0.25 * Y1;
        const txt = fmtBig(o.troops);
        ctx.font = '700 11px system-ui, sans-serif';
        const tw = ctx.measureText(txt).width + 10;
        ctx.fillStyle = 'rgba(8,12,20,0.85)';
        roundRect(ctx, mx - tw / 2, my - 18, tw, 15, 7); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, mx, my - 10.5);
      }
    }
  }

  drawLabels(ctx, s) {
    const fam = this.fontFamily();
    const placed = [];
    const g = this.game;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const L of this.labels) {
      let fs = L.size * s;
      const special = g && (L.id === g.playerId || L.id === this.selCountry);
      if (fs < 9) { if (!special || s < 0.25) continue; fs = 10; }
      fs = Math.min(fs, 34);
      const w = this.measure(L.text) * fs, h = fs;
      const x = L.x * s, y = L.y * s;
      let overlap = false;
      for (const r of placed) if (Math.abs(r[0] - x) < (r[2] + w) / 2 && Math.abs(r[1] - y) < (r[3] + h) / 2) { overlap = true; break; }
      if (overlap && !special) continue;
      placed.push([x, y, w, h]);
      ctx.font = `600 ${fs.toFixed(1)}px ${fam}`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = Math.max(2, fs / 5);
      ctx.strokeText(L.text, x, y);
      ctx.fillStyle = special ? '#fff6d8' : 'rgba(255,255,255,0.92)';
      ctx.fillText(L.text, x, y);
    }
  }

  drawSelection(ctx, s) {
    if (this.selCell < 0) return;
    const c = this.map.cells[this.selCell];
    const r = (6 + Math.sin(this.time * 4) * 1.5) * Math.max(1, Math.sqrt(s));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.ax * s, c.ay * s, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c.ax * s, c.ay * s, r + 2, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------- sélection ----------
  cellAt(sx, sy) {
    const [wx, wy] = this.cam.toWorld(sx, sy);
    const { W, H, cellOf } = this.map;
    const x = Math.floor(wx), y = Math.floor(wy);
    if (y < 0 || y >= H) return -1;
    const id = cellOf[y * W + ((x % W) + W) % W];
    if (id >= 0) return id;
    // tolérance (petites îles) : recherche autour, rayon dépendant du zoom
    const R = Math.ceil(clamp(10 / this.cam.scale, 2, 30));
    let best = -1, bd = Infinity;
    for (let dy = -R; dy <= R; dy += 1) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let dx = -R; dx <= R; dx += 1) {
        const d = dx * dx + dy * dy; if (d > R * R || d >= bd) continue;
        const c = cellOf[yy * W + (((x + dx) % W) + W) % W];
        if (c >= 0) { bd = d; best = c; }
      }
    }
    return best;
  }

  // ---------- mini-carte ----------
  renderMinimap(mc) {
    const ctx = mc.getContext('2d');
    const w = mc.width, h = mc.height;
    const sc = Math.min(w / this.W, h / this.H);
    const mw = this.W * sc, mh = this.H * sc, ox = (w - mw) / 2, oy = (h - mh) / 2;
    // image de fond mise en cache, rafraîchie au plus toutes les 1,5 s
    if (!this.miniBase || this.miniBase.width !== w || this.time - this.miniT > 1.5) {
      this.miniBase ||= document.createElement('canvas');
      this.miniBase.width = w; this.miniBase.height = h;
      const b = this.miniBase.getContext('2d');
      b.imageSmoothingEnabled = true;
      b.fillStyle = '#08101c'; b.fillRect(0, 0, w, h);
      b.drawImage(this.half && !this.halfDirty ? this.half : this.off, ox, oy, mw, mh);
      this.miniT = this.time;
    }
    ctx.drawImage(this.miniBase, 0, 0);
    const cam = this.cam, s = cam.scale;
    const vw = (cam.cw / s) * sc, vh = (cam.ch / s) * sc;
    const vx = ox + (cam.x - cam.cw / 2 / s) * sc, vy = oy + (cam.y - cam.ch / 2 / s) * sc;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
    for (const k of [-mw, 0, mw]) ctx.strokeRect(vx + k, vy, Math.min(vw, mw), vh);
    this.miniGeom = { ox, oy, sc };
  }
  minimapToWorld(x, y) {
    const g = this.miniGeom;
    if (!g) return null;
    return [(x - g.ox) / g.sc, (y - g.oy) / g.sc];
  }
}

// ---------- dessins vectoriels ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawStar(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
}
export function drawUnit(ctx, kind, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = rgbToCss(color);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  switch (kind) {
    case 'spear':
      ctx.moveTo(-r, r * 0.6); ctx.lineTo(r * 0.7, -r * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r, -r * 0.75); ctx.lineTo(r * 0.35, -r * 0.55); ctx.lineTo(r * 0.75, -r * 0.1); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-r * 0.3, r * 0.1, r * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'knight':
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, -r * 0.6); ctx.lineTo(r * 0.7, r * 0.3); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, r * 0.3); ctx.lineTo(-r * 0.8, -r * 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, r * 0.6); ctx.moveTo(-r * 0.4, -r * 0.1); ctx.lineTo(r * 0.4, -r * 0.1);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
      break;
    case 'cannon':
      ctx.save(); ctx.rotate(-0.4);
      ctx.rect(-r * 0.2, -r * 0.3, r * 1.3, r * 0.6); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(-r * 0.2, r * 0.35, r * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#3a2a1c'; ctx.fill(); ctx.stroke();
      break;
    case 'tank':
      ctx.rect(-r, -r * 0.1, r * 2, r * 0.8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(-r * 0.45, -r * 0.6, r * 0.9, r * 0.55); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.35); ctx.lineTo(r * 1.3, -r * 0.45); ctx.lineWidth = 2; ctx.stroke();
      break;
    case 'mech':
      ctx.shadowColor = 'rgba(127,243,255,0.9)'; ctx.shadowBlur = 6;
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = '#7ff3ff'; ctx.fill();
      break;
    case 'ship':
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.lineTo(r * 0.6, r * 0.55); ctx.lineTo(-r * 0.6, r * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r); ctx.lineTo(r * 0.6, -r * 0.2); ctx.closePath();
      ctx.fillStyle = '#f2efe6'; ctx.fill(); ctx.stroke();
      break;
    default:
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

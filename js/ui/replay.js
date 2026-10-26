// Timelapse : rejoue l'évolution des frontières, avec un classement animé façon « country battles ».
import { $, esc } from './dom.js';
import { fmtTime, rgbToCss } from '../core/util.js';

const SPEEDS = [10, 20, 40, 80, 160];

export class Replay {
  constructor(app) {
    this.app = app;
    this.el = $('#replay');
    $('#rp-close').onclick = () => this.close();
    $('#rp-play').onclick = () => {
      if (this.t >= this.tEnd) this.seek(0);
      this.playing = !this.playing;
      this.ui();
    };
    $('#rp-speed').onclick = () => { this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length]; this.ui(); };
    $('#rp-seek').addEventListener('input', (e) => { this.playing = false; this.seek((+e.target.value / 1000) * this.tEnd); });
  }

  open(onClose) {
    const app = this.app, g = app.game, r = app.renderer;
    g.flushHist();
    app.select(-1);
    this.g = g; this.r = r; this.onClose = onClose;
    this.frames = g.hist.frames;
    this.init = g.hist.init;
    this.owner = Int16Array.from(this.init);
    this.idx = 0; this.t = 0; this.acc = 0; this.labT = 0;
    this.tEnd = Math.max(1, g.t);
    // ≈ 45 s de film quelle que soit la durée de la partie
    this.speed = SPEEDS.reduce((b, s) => (Math.abs(this.tEnd / s - 45) < Math.abs(this.tEnd / b - 45) ? s : b), SPEEDS[0]);
    this.playing = true;
    this.prevMode = app.mode;
    app.mode = 'replay';
    r.replayMode = true;
    r.anims.clear(); r.pending.length = 0; r.particles.length = 0; r.rings.length = 0;
    r.painter.ownerOf = (id) => this.owner[id];
    r.fullRepaint();
    r.computeLabelsFrom(this.owner, g.countries);
    app.fitWorld(r);
    $('#hud').hidden = true;
    this.el.hidden = false;
    $('#rp-planet').textContent = g.planet.name === 'Terre' ? 'la Terre' : g.planet.name;
    $('#rp-board').innerHTML = '';
    this.rows = new Map();
    this.updBoard();
    this.ui();
  }

  step(dt) {
    if (this.playing) {
      this.t = Math.min(this.tEnd, this.t + dt * this.speed);
      this.apply(false);
      if (this.t >= this.tEnd) this.playing = false;
    }
    this.acc += dt;
    if (this.acc > 0.25) { this.acc = 0; this.updBoard(); this.ui(); }
  }

  apply(full) {
    const r = this.r, cells = this.g.map.cells;
    const changed = full ? null : new Set();
    while (this.idx < this.frames.length && this.frames[this.idx].t <= this.t) {
      const ch = this.frames[this.idx++].ch;
      for (let i = 0; i < ch.length; i += 2) { this.owner[ch[i]] = ch[i + 1]; if (changed) changed.add(ch[i]); }
    }
    if (full) {
      r.fullRepaint();
      r.computeLabelsFrom(this.owner, this.g.countries);
      return;
    }
    if (!changed.size) return;
    const edges = new Set();
    for (const c of changed) {
      r.painter.paintCell(c); r.markCell(c);
      for (const nb of cells[c].nbrs) if (!changed.has(nb)) edges.add(nb);
    }
    for (const nb of edges) { r.painter.paintEdges(nb); r.markCell(nb); }
    if (changed.size < 6) for (const c of changed) {
      const cl = cells[c];
      r.rings.push({ x: cl.ax, y: cl.ay, color: this.g.countries[this.owner[c]].color, age: 0, life: 0.6, r: 4 + Math.sqrt(cl.n) * 0.3 });
    }
    if (r.time - this.labT > 0.35) { this.labT = r.time; r.computeLabelsFrom(this.owner, this.g.countries); }
  }

  seek(t) {
    this.owner.set(this.init);
    this.idx = 0;
    this.t = t;
    this.apply(true);
    this.updBoard();
    this.ui();
  }

  // classement animé (barres qui se réordonnent)
  updBoard() {
    const counts = new Map();
    for (let i = 0; i < this.owner.length; i++) {
      const o = this.owner[i];
      if (o > 0) counts.set(o, (counts.get(o) || 0) + 1);
    }
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = top.length ? top[0][1] : 1;
    const box = $('#rp-board');
    const keep = new Set();
    top.forEach(([id, n], rank) => {
      keep.add(id);
      let row = this.rows.get(id);
      const c = this.g.countries[id];
      if (!row) {
        row = document.createElement('div');
        row.className = 'rp-row';
        row.innerHTML = `<span class="rp-nm">${esc(c.name)}${id === this.g.playerId ? ' ★' : ''}</span><span class="rp-bar"><i style="background:${rgbToCss(c.color)}"></i></span><em></em>`;
        row.style.transform = `translateY(${8 * 30}px)`;
        box.appendChild(row);
        this.rows.set(id, row);
      }
      row.style.transform = `translateY(${rank * 30}px)`;
      row.style.opacity = '1';
      row.querySelector('i').style.width = Math.max(3, (n / max) * 100) + '%';
      row.querySelector('em').textContent = n;
    });
    for (const [id, row] of this.rows) {
      if (keep.has(id)) continue;
      row.style.opacity = '0';
      row.style.transform = `translateY(${8 * 30}px)`;
    }
  }

  ui() {
    $('#rp-play').textContent = this.playing ? '⏸' : '▶';
    $('#rp-speed').textContent = 'x' + this.speed;
    $('#rp-time').textContent = `${fmtTime(this.t)} / ${fmtTime(this.tEnd)}`;
    $('#rp-seek').value = String(Math.round((this.t / this.tEnd) * 1000));
  }

  close() {
    const app = this.app, g = this.g, r = this.r;
    r.replayMode = false;
    r.painter.ownerOf = (id) => g.owner[id];
    r.rings.length = 0;
    r.fullRepaint();
    r.labelVer = -1;
    this.el.hidden = true;
    $('#hud').hidden = false;
    app.mode = this.prevMode || 'play';
    if (this.onClose) this.onClose();
  }
}

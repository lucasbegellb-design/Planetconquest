// Vue « système solaire » : planètes en orbite, choix de la prochaine conquête, héritages (bonus persistants).
import { $, esc, toast } from '../ui/dom.js';
import { PLANET_TYPES } from '../map/planetTypes.js';
import { ERAS } from '../tech/techtree.js';
import { RNG } from '../core/rng.js';
import { fmtTime, hexToRgb, rgbToCss, mixRgb } from '../core/util.js';
import { describeSystem, systemDone, planetParams, rollPerks, advanceSystem, SYSTEMS_PER_GALAXY } from './progression.js';
import { DIFFICULTIES } from '../sim/balance.js';

export class SpaceView {
  constructor(app) {
    this.app = app;
    this.el = $('#space');
    this.canvas = $('#space-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.t = 0;
    this.sel = null;
    this.state = 'browse';
    const rng = new RNG('etoiles');
    this.stars = Array.from({ length: 260 }, () => ({ x: rng.next(), y: rng.next(), r: rng.next() * 1.4 + 0.2, p: rng.next() * 6 }));
    this.pos = [];
    this.canvas.addEventListener('pointerup', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 40;
      for (const p of this.pos) { const d = Math.hypot(p.x - x, p.y - y) - p.r; if (d < bd) { bd = d; best = p.planet; } }
      if (best) { this.sel = best; this.state = 'browse'; this.renderCard(); }
    });
    $('#space-card').addEventListener('click', (e) => this.onClick(e));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
  }

  show(meta) {
    this.meta = meta;
    this.sys = describeSystem(meta);
    this.el.hidden = false;
    this.resize();
    this.state = 'browse';
    this.sel = this.sys.planets.find((p) => !p.home && !meta.conquered[p.key]) || this.sys.planets[0];
    this.renderCrumbs();
    this.renderCard();
  }
  hide() { this.el.hidden = true; }

  renderCrumbs() {
    const m = this.meta;
    $('#space-crumbs').innerHTML = `
      <span>🌌 ${esc(this.sys.galaxyName)}</span><span class="sep">›</span>
      <span>☀️ ${esc(this.sys.name)} <small class="hint">(${m.system + 1}/${SYSTEMS_PER_GALAXY})</small></span><span class="sep">›</span>
      <span class="hint">Planètes conquises : <b>${m.level}</b></span>
      <button class="btn small ghost" id="sp-home" style="margin-left:auto">🏠 Accueil</button>`;
    $('#sp-home').onclick = () => { this.app.autosave(); this.app.toMenu(); };
  }

  renderCard() {
    const p = this.sel, m = this.meta, card = $('#space-card');
    if (!p) { card.innerHTML = ''; return; }
    const T = PLANET_TYPES[p.type] || PLANET_TYPES.terran;
    const done = p.home || m.conquered[p.key];
    const allDone = systemDone(m, this.sys);
    let h = `<h3>${esc(p.name)}</h3><div class="hint">Planète ${esc(T.name.toLowerCase())}${p.home ? ' · monde natal' : ''}</div>`;
    if (this.state === 'perk' && !done) {
      const perks = rollPerks(m);
      h += `<p>Avant le départ, choisissez un <b>héritage</b> pour votre civilisation. Il s'appliquera sur toutes les planètes suivantes.</p>
        <div class="perks">${perks.map((k) => `<button class="perk" data-perk="${k.id}"><b>${k.icon} ${esc(k.name)}</b><small>${esc(k.desc)}</small></button>`).join('')}</div>
        <div class="btn-row"><button class="btn ghost small" data-a="back">← Retour</button></div>`;
      card.innerHTML = h;
      return;
    }
    h += `<p class="hint" style="margin:8px 0">${esc(T.desc)}</p>`;
    if (done) {
      const c = m.conquered[p.key];
      h += `<p>✅ <b>Conquise</b>${c ? ` en ${fmtTime(c.time)}` : ''}.</p>`;
    } else {
      const k = planetParams(m, p);
      h += `<div class="kv">
        <div><span>Territoires</span><b>≈ ${k.targetCells}</b></div>
        <div><span>Civilisations</span><b>${k.nAI}</b></div>
        <div><span>Époque des IA</span><b>${ERAS[k.aiEra].name}</b></div>
        <div><span>Bonus des IA</span><b>+${Math.round((k.aiBonus - 1) * 100)} %</b></div>
        <div><span>Difficulté</span><b class="stars">${'★'.repeat(k.stars)}${'☆'.repeat(5 - k.stars)}</b></div>
        <div><span>Règle</span><b>${T.rules.air ? 'Combats aériens' : T.rules.freeNavigation ? 'Navigation libre' : 'Standard'}</b></div>
      </div>
      <button class="btn primary big" data-a="choose">🚀 Mettre le cap sur ${esc(p.name)}</button>`;
    }
    if (allDone) h += `<div style="margin-top:10px"><button class="btn primary big" data-a="jump">🌌 Saut hyperspatial vers le système suivant</button></div>`;
    const perks = m.perksTaken.length ? `<p class="hint" style="margin-top:10px">Héritages : ${m.perksTaken.length} · Difficulté : ${DIFFICULTIES[m.difficulty || 'normal'].label}</p>` : '';
    card.innerHTML = h + perks;
  }

  onClick(e) {
    const b = e.target.closest('[data-a],[data-perk]');
    if (!b) return;
    if (b.dataset.perk) { this.app.colonize(this.sel, b.dataset.perk); return; }
    switch (b.dataset.a) {
      case 'choose': this.state = 'perk'; this.renderCard(); break;
      case 'back': this.state = 'browse'; this.renderCard(); break;
      case 'jump':
        advanceSystem(this.meta);
        toast('🌌 Saut hyperspatial réussi !', 'ok');
        this.show(this.meta);
        this.app.autosave();
        break;
    }
  }

  render(dt) {
    if (this.el.hidden) return;
    this.t += dt;
    const ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(w * 0.3, h * 0.5, 10, w * 0.3, h * 0.5, Math.max(w, h));
    bg.addColorStop(0, '#0d1424'); bg.addColorStop(1, '#020309');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // nébuleuse
    const neb = ctx.createRadialGradient(w * 0.8, h * 0.25, 0, w * 0.8, h * 0.25, w * 0.5);
    neb.addColorStop(0, 'rgba(120,80,200,0.16)'); neb.addColorStop(1, 'rgba(120,80,200,0)');
    ctx.fillStyle = neb; ctx.fillRect(0, 0, w, h);
    for (const s of this.stars) {
      const a = 0.45 + 0.55 * Math.sin(this.t * 1.3 + s.p);
      ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.6 * a * s.r / 1.6})`;
      ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
    }
    const mobile = w < 760;
    const cx = mobile ? w * 0.5 : w * 0.36, cy = mobile ? h * 0.36 : h * 0.52;
    const sys = this.sys;
    const maxR = mobile ? Math.min(w * 0.46, h * 0.5) : Math.min(w * 0.33, h * 0.75);
    const n = sys.planets.length;
    const starRGB = hexToRgb(sys.star.color);
    // soleil
    const sr = sys.star.size * (mobile ? 0.7 : 1);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr * 4);
    glow.addColorStop(0, rgbToCss(starRGB, 0.9)); glow.addColorStop(0.25, rgbToCss(starRGB, 0.35)); glow.addColorStop(1, rgbToCss(starRGB, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, sr * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgbToCss(mixRgb(starRGB, [255, 255, 255], 0.5)); ctx.beginPath(); ctx.arc(cx, cy, sr, 0, Math.PI * 2); ctx.fill();
    this.pos = [];
    const m = this.meta;
    sys.planets.forEach((p, i) => {
      const rr = sr * 2.2 + ((maxR - sr * 2.2) * (i + 0.5)) / n;
      const ey = 0.42;
      ctx.strokeStyle = 'rgba(160,180,220,0.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * ey, 0, 0, Math.PI * 2); ctx.stroke();
      const ang = p.phase + this.t * p.speed;
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * ey;
      const T = PLANET_TYPES[p.type] || PLANET_TYPES.terran;
      const pr = (mobile ? 9 : 12) * (p.type === 'gas' ? 1.6 : 1) * (p.size || 1) * (p.home ? 1.1 : 1);
      const done = p.home || m.conquered[p.key];
      drawPlanet(ctx, x, y, pr, T.globe, p.type, p.ring, this.t + i);
      if (done) {
        ctx.strokeStyle = rgbToCss(m.color, 0.9); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, pr + 4, 0, Math.PI * 2); ctx.stroke();
      }
      if (this.sel === p) {
        ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(this.t * 4)})`; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, pr + 9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = done ? '#bff5d6' : 'rgba(230,235,245,0.9)';
      ctx.fillText((done ? '✓ ' : '') + p.name, x, y + pr + 16);
      this.pos.push({ x, y, r: pr, planet: p });
    });
    // mini-galaxie
    const gx = w - (mobile ? 54 : 90), gy = mobile ? 70 : 110, gr = mobile ? 34 : 60;
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(this.t * 0.05);
    for (let k = 0; k < 220; k++) {
      const arm = k % 2, f = (k / 220);
      const a = f * Math.PI * 4 + arm * Math.PI;
      const rad = f * gr;
      const jitter = Math.sin(k * 12.9898) * 4;
      ctx.fillStyle = `rgba(200,190,255,${0.15 + 0.4 * (1 - f)})`;
      ctx.fillRect(Math.cos(a) * rad + jitter, Math.sin(a) * rad * 0.6 + jitter * 0.5, 1.3, 1.3);
    }
    for (let s = 0; s < SYSTEMS_PER_GALAXY; s++) {
      const f = (s + 1) / (SYSTEMS_PER_GALAXY + 1), a = f * Math.PI * 4;
      const x = Math.cos(a) * f * gr, y = Math.sin(a) * f * gr * 0.6;
      ctx.fillStyle = s < m.system ? '#4cc38a' : s === m.system ? '#ffd27a' : 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(x, y, s === m.system ? 3.5 : 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(230,235,245,0.7)'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`Galaxie ${m.galaxy + 1}`, gx, gy + gr * 0.6 + 18);
  }
}

function drawPlanet(ctx, x, y, r, colors, type, ring, t) {
  const [c0, c1, c2] = colors.map(hexToRgb);
  if (ring) {
    ctx.strokeStyle = 'rgba(230,210,170,0.55)'; ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.9, r * 0.55, -0.35, Math.PI, Math.PI * 2); ctx.stroke();
  }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, rgbToCss(mixRgb(c0, [255, 255, 255], 0.25)));
  g.addColorStop(0.6, rgbToCss(c0));
  g.addColorStop(1, rgbToCss(mixRgb(c1, [0, 0, 0], 0.45)));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  if (type === 'gas') {
    for (let k = -3; k <= 3; k++) {
      ctx.fillStyle = rgbToCss(k % 2 ? c1 : c2, 0.35);
      ctx.fillRect(x - r, y + k * r * 0.28 + Math.sin(t + k) * 1.5, r * 2, r * 0.13);
    }
  } else {
    ctx.fillStyle = rgbToCss(c2, 0.55);
    for (let k = 0; k < 3; k++) {
      const a = t * 0.3 + k * 2.1;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(k * 1.7) * r * 0.4, r * 0.35, r * 0.22, k, 0, Math.PI * 2); ctx.fill();
    }
  }
  const sh = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  sh.addColorStop(0.45, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = sh; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  if (ring) {
    ctx.strokeStyle = 'rgba(230,210,170,0.7)'; ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.9, r * 0.55, -0.35, 0, Math.PI); ctx.stroke();
  }
}

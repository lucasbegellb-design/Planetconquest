// Barre supérieure, fil d'actualité, propositions diplomatiques, mini-carte.
import { $, $$, esc, toast, openModal } from './dom.js';
import { fmtBig, fmtPop, fmtInt, fmt1, fmtTime, rgbToCss } from '../core/util.js';
import { ERAS, TECHS, REPEATABLES, canResearch, repeatCost } from '../tech/techtree.js';
import { Art } from '../core/fr.js';

export class Hud {
  constructor(app) {
    this.app = app;
    this.newsBox = $('#news');
    this.lastStats = '';
    $$('#speed button').forEach((b) => b.addEventListener('click', () => app.setSpeed(+b.dataset.speed)));
    $('#btn-tech').addEventListener('click', () => app.openTech());
    $('#btn-goals').addEventListener('click', () => app.openGoals());
    $('#btn-menu').addEventListener('click', () => app.openGameMenu());
    $('#tb-country').addEventListener('click', () => app.focusPlayer(true));
    this.newsBox.addEventListener('click', () => this.openLog());
    const mm = $('#minimap');
    let dragging = false;
    const go = (e) => {
      const r = mm.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * mm.width, sy = ((e.clientY - r.top) / r.height) * mm.height;
      const w = app.renderer && app.renderer.minimapToWorld(sx, sy);
      if (w) { app.renderer.cam.x = w[0]; app.renderer.cam.y = w[1]; app.renderer.cam.fly = null; app.renderer.cam.clamp(); }
    };
    mm.addEventListener('pointerdown', (e) => { dragging = true; mm.setPointerCapture(e.pointerId); go(e); });
    mm.addEventListener('pointermove', (e) => { if (dragging) go(e); });
    mm.addEventListener('pointerup', () => { dragging = false; });
  }

  reset() {
    this.newsBox.innerHTML = '';
    $('#toasts').innerHTML = '';
    this.lastStats = '';
  }

  setSpeed(sp) { $$('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === sp)); }

  update() {
    const g = this.app.game;
    if (!g) return;
    const P = g.countries[g.playerId];
    const st = P.st;
    const engaged = g.offTroops(g.playerId);
    const net = st.income - st.upkeep;
    $('#tb-country').innerHTML = `<span class="swatch" style="background:${rgbToCss(P.color)}"></span>${esc(P.name)}`;
    const n = g.cellsOf[g.playerId].size;
    const html = [
      `<div class="stat" title="Population">👥 ${fmtPop(st.pop)}</div>`,
      `<div class="stat" title="Armée en réserve / effectifs max${engaged ? ' — engagés au front : ' + fmtBig(engaged) : ''}">⚔️ ${fmtBig(P.army)}<small>/ ${fmtBig(st.armyCap)}</small>${engaged ? `<small>+${fmtBig(engaged)} au front</small>` : ''}</div>`,
      `<div class="stat" title="Or (revenu net par seconde)">💰 ${fmtInt(P.gold)} <small class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : ''}${fmt1(net)}/s</small></div>`,
      `<div class="stat" title="Points de recherche">🔬 ${fmtInt(P.rp)} <small class="up">+${fmt1(st.rp)}/s</small></div>`,
      `<div class="stat" title="Moral">${P.morale > 60 ? '😊' : P.morale > 35 ? '😐' : '😟'} ${Math.round(P.morale)}</div>`,
      `<div class="stat" title="Territoires contrôlés">🗺️ ${n}<small>/ ${g.nCells} (${Math.floor((n / g.nCells) * 100)} %)</small></div>`,
      `<div class="stat" title="Époque">🏛️ ${ERAS[P.era].name}</div>`,
    ].join('');
    if (html !== this.lastStats) { $('#tb-stats').innerHTML = html; this.lastStats = html; }
    $('#tb-time').textContent = '⏱ ' + fmtTime(g.t);
    // techno disponibles
    let afford = TECHS.filter((t) => canResearch(P.techs, P.era, t) && P.rp >= t.cost).length;
    if (P.era >= 4 && !TECHS.some((t) => canResearch(P.techs, P.era, t))) afford += REPEATABLES.filter((r) => P.rp >= repeatCost(r, P.repeat[r.id] || 0)).length;
    const badge = $('#tech-badge');
    badge.hidden = afford === 0;
    badge.textContent = afford;
    // fil : vieillissement
    const now = performance.now();
    for (const el of [...this.newsBox.children]) {
      const age = now - +el.dataset.t;
      if (age > 26000) el.remove();
      else if (age > 11000) el.classList.add('old');
    }
    if (document.body.dataset.era !== String(P.era)) document.body.dataset.era = P.era;
  }

  addNews(item) {
    const g = this.app.game;
    if (!item.player && !item.imp && g && Math.random() < 0.5 && this.newsBox.children.length >= 3) return;
    const el = document.createElement('div');
    el.className = 'news-item' + (item.player ? ' player' : '') + (item.imp ? ' imp' : '');
    el.dataset.t = performance.now();
    el.textContent = item.text;
    this.newsBox.appendChild(el);
    while (this.newsBox.children.length > 4) this.newsBox.firstChild.remove();
  }

  openLog() {
    const g = this.app.game;
    if (!g) return;
    const items = g.news.slice().reverse().map((n) => `<div class="${n.player ? 'player' : ''}"><time>${fmtTime(n.t)}</time>${esc(n.text)}</div>`).join('');
    openModal(`<h2>📰 Fil d'actualité</h2><div class="log">${items || '<p class="hint">Rien à signaler pour le moment.</p>'}</div>`, { narrow: true });
  }

  showProposal(p) {
    const g = this.app.game, F = g.countries[p.from];
    const what = p.type === 'peace' ? `🕊️ <b>${esc(Art(F))}</b> vous propose la paix.` : `🤝 <b>${esc(Art(F))}</b> vous propose une alliance.`;
    const t = toast(`${what}<div class="acts"><button class="btn small good" data-a="1">Accepter</button><button class="btn small" data-a="0">Refuser</button></div>`, '', 0);
    if (!t) return;
    const kill = setTimeout(() => t.remove(), Math.max(1000, (p.until - g.t) * 1000 / Math.max(1, this.app.speed || 1)));
    t.addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (a === undefined) return;
      g.answer(p.id, a === '1');
      clearTimeout(kill);
      t.remove();
      this.app.panel.render(true);
    });
  }
}

// Barre supérieure, fil d'actualité, propositions diplomatiques, mini-carte.
import { $, $$, esc, toast, openModal } from './dom.js';
import { fmtBig, fmtPop, fmtInt, fmt1, fmtTime, rgbToCss } from '../core/util.js';
import { ERAS, TECHS, REPEATABLES, canResearch, repeatCost } from '../tech/techtree.js';
import { Art, v } from '../core/fr.js';

export class Hud {
  constructor(app) {
    this.app = app;
    this.propToasts = new Map();
    this.newsBox = $('#news');
    this.lastStats = '';
    $$('#speed button').forEach((b) => b.addEventListener('click', () => app.setSpeed(+b.dataset.speed)));
    $('#btn-tech').addEventListener('click', () => app.openTech());
    $('#btn-goals').addEventListener('click', () => app.openGoals());
    $('#btn-menu').addEventListener('click', () => app.openGameMenu());
    $('#tb-country').addEventListener('click', () => app.selectPlayer());
    this.newsBox.addEventListener('click', () => this.openLog());
    $('#tb-stats').addEventListener('click', (e) => { if (e.target.closest('[data-open="rank"]')) this.openRanking(); });
    const fab = $('#aim-pct');
    fab.addEventListener('click', () => {
      const P = [25, 50, 75, 100];
      const v = P[(P.indexOf(app.pct) + 1) % P.length] || 50;
      app.panel.setPct(v);
      app.sound.click();
      if (!this.fabHint) {
        this.fabHint = true;
        toast(matchMedia('(hover: hover)').matches
          ? '⚔️ Part de l’armée engagée. Astuce : <b>clic droit glissé</b> depuis votre territoire vers une cible pour attaquer.'
          : '⚔️ Part de l’armée engagée. Astuce : <b>appui long</b> sur votre territoire puis <b>glissez</b> vers une cible.', '', 5000);
      }
    });
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
    this.propToasts.clear();
    this.lastStats = '';
  }

  updateFab() { $('#aim-pct').textContent = `⚔️ ${this.app.pct} %`; }

  rank(g) {
    const mine = g.cellsOf[g.playerId].size;
    let r = 1, alive = 0;
    for (const c of g.countries) {
      if (c.neutral || !c.alive) continue;
      alive++;
      if (c.id !== g.playerId && g.cellsOf[c.id].size > mine) r++;
    }
    this.alive = alive;
    return '#' + r;
  }

  openRanking() {
    const g = this.app.game;
    if (!g) return;
    const list = g.countries.filter((c) => !c.neutral && c.alive).sort((a, b) => g.cellsOf[b.id].size - g.cellsOf[a.id].size);
    const rows = list.slice(0, 20).map((c, i) => `<tr class="${c.id === g.playerId ? 'me' : ''}"><td>${i + 1}</td>
      <td><span class="swatch" style="background:${rgbToCss(c.color)}"></span>${esc(c.name)}</td>
      <td>${g.cellsOf[c.id].size}</td><td>${fmtPop(c.st.pop)}</td><td>${fmtBig(c.army + g.offTroops(c.id))}</td><td>${ERAS[c.era].name}</td></tr>`).join('');
    const me = list.findIndex((c) => c.id === g.playerId);
    openModal(`<h2>🏆 Classement mondial</h2><p class="hint">${list.length} civilisations en vie · vous êtes ${me + 1}<sup>e</sup>.</p>
      <div class="table-wrap"><table class="rank"><thead><tr><th>#</th><th>Pays</th><th>Terr.</th><th>Pop.</th><th>Armée</th><th>Époque</th></tr></thead><tbody>${rows}</tbody></table></div>`, { narrow: true });
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
      `<div class="stat link" data-open="rank" title="Classement mondial">🏆 ${this.rank(g)}<small>/ ${this.alive}</small></div>`,
    ].join('');
    if (html !== this.lastStats) { $('#tb-stats').innerHTML = html; this.lastStats = html; }
    const left = g.match ? Math.max(0, g.match.ends - g.t) : -1;
    const tt = $('#tb-time');
    tt.textContent = left >= 0 ? '⏳ ' + fmtTime(left) : '⏱ ' + fmtTime(g.t);
    tt.classList.toggle('urgent', left >= 0 && left < 60);
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
    // propositions expirées
    for (const [id, el] of this.propToasts) {
      if (!g.proposals.some((p) => p.id === id)) { el.remove(); this.propToasts.delete(id); }
    }
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
    if (p.to !== undefined && p.to !== g.playerId) return;
    const what = `${p.type === 'peace' ? '🕊️' : p.type === 'nap' ? '📜' : '🤝'} <b>${esc(Art(F))}</b> ${v(F, 'vous propose', 'vous proposent')} ${p.type === 'peace' ? 'la paix' : p.type === 'nap' ? 'un pacte de non-agression' : 'une alliance'}.`;
    const t = toast(`${what}<div class="acts"><button class="btn small good" data-a="1">Accepter</button><button class="btn small" data-a="0">Refuser</button></div>`, '', 0);
    if (!t) return;
    this.propToasts.set(p.id, t);
    t.addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (a === undefined) return;
      this.app.cmd('answer', p.id, a === '1');
      this.propToasts.delete(p.id);
      t.remove();
      this.app.panel.render(true);
    });
  }
}

// Barre supérieure, fil d'actualité, propositions diplomatiques, mini-carte.
import { bonusOf } from '../sim/match.js';
import { MAP_MODES, legendHtml } from '../map/mapModes.js';
import { settings } from './settings.js';
import { statTip } from './stats.js';
import { SEASONS, CRISES, seasonOf } from '../sim/military.js';
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
    $('#btn-empire').addEventListener('click', () => app.openEmpire());
    $('#btn-goals').addEventListener('click', () => app.openGoals());
    $('#btn-menu').addEventListener('click', () => app.openGameMenu());
    $('#tb-country').addEventListener('click', () => app.selectPlayer());
    this.newsBox.addEventListener('click', (e) => {
      const it = e.target.closest('[data-cell]');
      if (it) app.goToCell(+it.dataset.cell); else this.openLog();
    });
    this.logFilter = 'all';
    $('#tb-stats').addEventListener('click', (e) => {
      if (e.target.closest('[data-open="rank"]')) this.openRanking();
      if (e.target.closest('[data-open="score"]')) this.app.multi.openScores();
      const t = e.target.closest('[data-tip]');
      if (t) this.toggleTip(t.dataset.tip, t);
    });
    document.addEventListener('pointerdown', (e) => { if (this.tipKey && !e.target.closest('#stat-tip,[data-tip]')) this.hideTip(); });
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
    // modes de carte
    const mmb = $('#map-mode'), box = $('#map-modes');
    mmb.addEventListener('click', () => { box.hidden = !box.hidden; if (!box.hidden) this.renderModes(); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      app.setMapMode(b.dataset.mode);
      box.hidden = true;
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
    this.hideTip();
  }

  // détail d'un chiffre de la barre supérieure
  toggleTip(key, el) {
    if (this.tipKey === key) { this.hideTip(); return; }
    this.tipKey = key;
    const tip = $('#stat-tip'), r = el.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(innerWidth - 328, r.left)) + 'px';
    tip.style.top = r.bottom + 6 + 'px';
    tip.hidden = false;
    this.tipHtml = '';
    this.renderTip();
  }
  renderTip() {
    const h = statTip(this.app, this.tipKey);
    if (h !== this.tipHtml) { this.tipHtml = h; $('#stat-tip').innerHTML = h; }
  }
  hideTip() { this.tipKey = null; $('#stat-tip').hidden = true; }

  renderModes() {
    const cur = this.app.mapMode || 'pol';
    $('#map-modes').innerHTML = MAP_MODES.map((m) => `<button class="btn ${m.id === cur ? 'on' : ''}" data-mode="${m.id}">${m.icon} ${m.name}</button>`).join('');
  }
  showLegend(mode) {
    const lg = $('#map-legend'), m = MAP_MODES.find((x) => x.id === mode);
    lg.hidden = mode === 'pol';
    if (mode !== 'pol') lg.innerHTML = `<b>${m.icon} ${m.name}</b> <button class="btn small" data-mode-off>✕</button><div class="lg">${legendHtml(mode, settings.get('colorblind'))}</div>`;
    const off = lg.querySelector('[data-mode-off]');
    if (off) off.onclick = () => this.app.setMapMode('pol');
    $('#map-mode').textContent = m ? m.icon : '🗺️';
    $('#map-mode').classList.toggle('on', mode !== 'pol');
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
      `<div class="stat link" data-tip="pop" title="Population — cliquez pour le détail">👥 ${fmtPop(st.pop)}</div>`,
      `<div class="stat link" data-tip="army" title="Armée en réserve / effectifs max${engaged ? ' — engagés au front : ' + fmtBig(engaged) : ''} — cliquez pour le détail">⚔️ ${fmtBig(P.army)}<small>/ ${fmtBig(st.armyCap)}</small>${engaged ? `<small>+${fmtBig(engaged)} au front</small>` : ''}</div>`,
      `<div class="stat link" data-tip="gold" title="Or (revenu net par seconde) — cliquez pour le détail">💰 ${fmtInt(P.gold)} <small class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : ''}${fmt1(net)}/s</small></div>`,
      `<div class="stat link" data-tip="rp" title="Points de recherche — cliquez pour le détail">🔬 ${fmtInt(P.rp)} <small class="up">+${fmt1(st.rp)}/s</small></div>`,
      `<div class="stat link" data-tip="morale" title="Moral — cliquez pour le détail">${P.morale > 60 ? '😊' : P.morale > 35 ? '😐' : '😟'} ${Math.round(P.morale)}</div>`,
      `<div class="stat" title="Territoires contrôlés">🗺️ ${n}<small>/ ${g.nCells} (${Math.floor((n / g.nCells) * 100)} %)</small></div>`,
      `<div class="stat" title="Époque">🏛️ ${ERAS[P.era].name}</div>`,
      g.match && g.match.names
        ? `<div class="stat link" data-open="score" title="Score de la partie">🎯 ${g.cellsOf[g.playerId].size + bonusOf(g, g.playerId)}<small> pts</small></div>`
        : `<div class="stat link" data-open="rank" title="Classement mondial">🏆 ${this.rank(g)}<small>/ ${this.alive}</small></div>`,
    ].join('');
    if (html !== this.lastStats) { $('#tb-stats').innerHTML = html; this.lastStats = html; }
    const left = g.match ? Math.max(0, g.match.ends - g.t) : -1;
    const tt = $('#tb-time');
    const se = SEASONS[seasonOf(g)], cr = g.crisis && g.crisis.until > g.t ? CRISES[g.crisis.id] : null;
    tt.textContent = `${se.icon} ${left >= 0 ? '⏳ ' + fmtTime(left) : fmtTime(g.t)}${cr ? ' ' + cr.icon : ''}`;
    tt.title = `${se.name} (hémisphère nord)${cr ? ` · ${cr.name} : ${cr.desc}, encore ${Math.ceil(g.crisis.until - g.t)} s` : ''}`;
    tt.classList.toggle('urgent', left >= 0 && left < 60);
    if (this.tipKey) this.renderTip();
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
    if (item.cell !== undefined) { el.dataset.cell = item.cell; el.title = 'Voir sur la carte'; el.append(' 📍'); }
    this.newsBox.appendChild(el);
    while (this.newsBox.children.length > 4) this.newsBox.firstChild.remove();
  }

  openLog() {
    const g = this.app.game;
    if (!g) return;
    const F = [
      ['all', 'Tout', () => true],
      ['me', 'Vous', (n) => n.player],
      ['war', '⚔️ Guerres', (n) => ['war', 'capture', 'annex', 'revolt'].includes(n.kind)],
      ['dip', '🤝 Diplomatie', (n) => ['peace', 'alliance'].includes(n.kind)],
      ['other', '✨ Événements', (n) => ['event', 'era', 'info', 'space', 'victory'].includes(n.kind)],
    ];
    const root = openModal('<h2>📰 Fil d\'actualité</h2><div class="tabs log-tabs"></div><div class="log"></div><p class="hint">📍 : cliquez pour voir le lieu sur la carte.</p>', { narrow: true });
    const render = () => {
      root.querySelector('.log-tabs').innerHTML = F.map(([k, l]) => `<button class="tab ${this.logFilter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('');
      const f = (F.find((x) => x[0] === this.logFilter) || F[0])[2];
      const items = g.news.filter(f).reverse().map((n) => `<div class="${n.player ? 'player' : ''}${n.cell !== undefined ? ' go' : ''}" ${n.cell !== undefined ? `data-goto="${n.cell}"` : ''}><time>${fmtTime(n.t)}</time>${esc(n.text)}${n.cell !== undefined ? ' 📍' : ''}</div>`).join('');
      root.querySelector('.log').innerHTML = items || '<p class="hint">Rien à signaler pour le moment.</p>';
    };
    root.addEventListener('click', (e) => { const t = e.target.closest('[data-f]'); if (t) { this.logFilter = t.dataset.f; render(); } });
    render();
  }

  showProposal(p) {
    const g = this.app.game, F = g.countries[p.from];
    if (p.to !== undefined && p.to !== g.playerId) return;
    const K = { peace: ['🕊️', 'la paix'], nap: ['📜', 'un pacte de non-agression'], trade: ['🚢', 'un accord commercial (+6 % d’or)'], alliance: ['🤝', 'une alliance'] }[p.type] || ['🤝', 'une alliance'];
    const what = `${K[0]} <b>${esc(Art(F))}</b> ${v(F, 'vous propose', 'vous proposent')} ${K[1]}.`;
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

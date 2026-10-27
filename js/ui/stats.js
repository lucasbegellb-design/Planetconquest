// Statistiques : historique (relevé toutes les 10 s de jeu), graphiques comparés aux grandes puissances,
// et détail des chiffres de la barre supérieure (d'où viennent l'or, l'armée, la recherche, le moral…).
import { openModal, esc } from './dom.js';
import { fmtBig, fmtPop, fmt1, fmtTime, rgbToCss } from '../core/util.js';
import { ERAS } from '../tech/techtree.js';
import { explainMods, GOV_BY_ID } from '../sim/empire.js';
import { CRISES } from '../sim/military.js';
import { vassalsOf, overlordOf, TRIBUTE } from '../sim/statecraft.js';

const EVERY = 10, TOP = 5;
export const METRICS = [
  { id: 'cells', name: 'Territoires', icon: '🗺️', get: (g, c) => g.cellsOf[c.id].size, fmt: (v) => String(Math.round(v)) },
  { id: 'army', name: 'Armée', icon: '⚔️', get: (g, c) => c.army + g.offTroops(c.id), fmt: fmtBig },
  { id: 'income', name: 'Revenu net', icon: '💰', get: (g, c) => c.st.income - c.st.upkeep, fmt: (v) => fmt1(v) + '/s' },
  { id: 'rp', name: 'Recherche', icon: '🔬', get: (g, c) => c.st.rp, fmt: (v) => fmt1(v) + '/s' },
  { id: 'pop', name: 'Population', icon: '👥', get: (g, c) => c.st.pop, fmt: fmtPop },
];

// ---------- relevés ----------
export class StatsRecorder {
  constructor() { this.reset(); }
  reset(data) { this.data = data && data.t ? data : { t: [], rows: [] }; this.next = 0; }
  sample(g) {
    if (g.t < this.next) return;
    this.next = g.t + EVERY;
    const alive = g.countries.filter((c) => !c.neutral && c.alive);
    const top = alive.sort((a, b) => g.cellsOf[b.id].size - g.cellsOf[a.id].size).slice(0, TOP);
    const ids = new Set(top.map((c) => c.id));
    ids.add(g.playerId);
    for (const c of g.countries) if (c.isPlayer && c.alive) ids.add(c.id);
    this.data.t.push(Math.round(g.t));
    this.data.rows.push([...ids].map((id) => { const c = g.countries[id]; return [id, ...METRICS.map((m) => Math.round(m.get(g, c) * 10) / 10)]; }));
    // au-delà de 400 relevés, on garde un point sur deux (parties très longues)
    if (this.data.t.length > 400) { this.data.t = this.data.t.filter((_, i) => i % 2 === 0); this.data.rows = this.data.rows.filter((_, i) => i % 2 === 0); }
  }
}

// ---------- fenêtre des statistiques ----------
export function openStats(app) {
  const g = app.game;
  if (!g) return;
  app.statTab ||= 'cells';
  const body = openModal(`<h2>📈 Statistiques</h2><div class="tabs stat-tabs"></div><canvas id="stat-chart" class="stat-chart"></canvas><div id="stat-legend" class="stat-legend"></div>`);
  const render = () => {
    const mi = METRICS.findIndex((m) => m.id === app.statTab), M = METRICS[mi];
    body.querySelector('.stat-tabs').innerHTML = METRICS.map((m) => `<button class="tab ${m.id === app.statTab ? 'active' : ''}" data-m="${m.id}">${m.icon} ${m.name}</button>`).join('');
    const D = app.stats.data;
    // séries : le joueur + les puissances présentes au dernier relevé
    const last = D.rows[D.rows.length - 1] || [];
    const ids = last.map((r) => r[0]);
    const series = ids.map((id) => ({ id, c: g.countries[id], pts: D.rows.map((row, i) => { const r = row.find((x) => x[0] === id); return r ? [D.t[i], r[1 + mi]] : null; }).filter(Boolean) }));
    drawChart(body.querySelector('#stat-chart'), series, g.playerId, M.fmt);
    body.querySelector('#stat-legend').innerHTML = series.sort((a, b) => (b.pts.at(-1)?.[1] ?? 0) - (a.pts.at(-1)?.[1] ?? 0)).map((s) =>
      `<span class="${s.id === g.playerId ? 'me' : ''}"><i style="background:${rgbToCss(s.c.color)}"></i>${esc(s.c.name)} <b>${M.fmt(s.pts.at(-1)?.[1] ?? 0)}</b></span>`).join('')
      + (D.t.length < 2 ? '<p class="hint">Les courbes se dessinent au fil de la partie (un relevé toutes les 10 s de jeu).</p>' : '');
  };
  body.addEventListener('click', (e) => { const t = e.target.closest('[data-m]'); if (t) { app.statTab = t.dataset.m; render(); } });
  render();
}

function drawChart(cv, series, me, fmt) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600, h = cv.clientHeight || 260;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const pad = { l: 52, r: 10, t: 10, b: 22 };
  const all = series.flatMap((s) => s.pts);
  if (all.length < 2) return;
  const t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0]));
  const v0 = Math.min(0, ...all.map((p) => p[1])), v1 = Math.max(1, ...all.map((p) => p[1]));
  const X = (t) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((v - v0) / (v1 - v0)) * (h - pad.t - pad.b);
  const css = getComputedStyle(document.body);
  ctx.strokeStyle = 'rgba(148,170,210,0.18)'; ctx.fillStyle = css.getPropertyValue('--muted') || '#94a0b8';
  ctx.font = '11px system-ui, sans-serif'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = v0 + ((v1 - v0) * i) / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(fmt(v), pad.l - 6, y + 4);
  }
  ctx.textAlign = 'left'; ctx.fillText(fmtTime(t0), pad.l, h - 6);
  ctx.textAlign = 'right'; ctx.fillText(fmtTime(t1), w - pad.r, h - 6);
  for (const s of [...series].sort((a, b) => (a.id === me) - (b.id === me))) { // le joueur par-dessus
    if (s.pts.length < 2) continue;
    ctx.strokeStyle = rgbToCss(s.c.color);
    ctx.lineWidth = s.id === me ? 3.2 : 1.6;
    ctx.globalAlpha = s.id === me ? 1 : 0.85;
    ctx.beginPath();
    s.pts.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- détail des chiffres de la barre supérieure ----------
const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} %`;
function modList(g, c, key, unit = pct) {
  const L = explainMods(g, c, key);
  // un effet temporaire qui finit avec la crise mondiale en cours porte son nom
  const cr = g.crisis && g.crisis.until > g.t ? g.crisis : null;
  const name = (x) => (cr && x.until === cr.until ? `${CRISES[cr.id].icon} ${CRISES[cr.id].name}` : x.label);
  return L.length ? `<ul class="tip-list">${L.map((x) => `<li><span>${esc(name(x))}</span><b class="${x.v >= 0 ? 'up' : 'down'}">${unit(x.v)}</b></li>`).join('')}</ul>` : '<p class="hint">Aucun bonus pour l’instant.</p>';
}

export function statTip(app, key) {
  const g = app.game, c = g.countries[g.playerId], st = c.st;
  const row = (l, v, cls = '') => `<li><span>${l}</span><b class="${cls}">${v}</b></li>`;
  if (key === 'gold') {
    const tribIn = vassalsOf(g, c.id).reduce((s, v) => s + Math.max(0, g.countries[v].st.income) * TRIBUTE, 0);
    const ov = overlordOf(g, c.id), tribOut = ov >= 0 ? Math.max(0, st.income) * TRIBUTE : 0;
    return `<h4>💰 Or</h4><ul class="tip-list">${row('Revenus (territoires, impôts)', '+' + fmt1(st.income) + '/s', 'up')}${row('Entretien de l’armée', '−' + fmt1(st.upkeep) + '/s', 'down')}
      ${tribIn ? row('Tributs de vos vassaux', '+' + fmt1(tribIn) + '/s', 'up') : ''}${tribOut ? row('Tribut versé au suzerain', '−' + fmt1(tribOut) + '/s', 'down') : ''}
      ${row('Moral (efficacité)', '×' + fmt1(0.7 + (0.6 * c.morale) / 100))}</ul><h5>Bonus d’or</h5>${modList(g, c, 'eco')}
      <p class="hint">L’entretien grandit avec l’armée et l’époque. Mines, usines, ports et commerce augmentent les revenus.</p>`;
  }
  if (key === 'army') {
    return `<h4>⚔️ Armée</h4><ul class="tip-list">${row('En réserve (défend vos frontières)', fmtBig(c.army))}${row('Engagée au front', fmtBig(g.offTroops(c.id)))}
      ${row('Effectifs maximum', fmtBig(st.armyCap))}${row('Recrutement', '+' + fmtBig(st.recruit) + '/s', 'up')}
      ${row('Qualité d’attaque', '×' + fmt1(g.atkQ(c)))}${row('Qualité de défense', '×' + fmt1(g.defQ(c)))}${row(`Époque ${ERAS[c.era].adj}`, '×' + fmt1(ERAS[c.era].mult))}</ul>
      <h5>Attaque</h5>${modList(g, c, 'atk')}<h5>Défense</h5>${modList(g, c, 'def')}<h5>Effectifs</h5>${modList(g, c, 'manpower')}`;
  }
  if (key === 'rp') return `<h4>🔬 Recherche</h4><ul class="tip-list">${row('Production', '+' + fmt1(st.rp) + '/s', 'up')}</ul><h5>Bonus de recherche</h5>${modList(g, c, 'research')}<p class="hint">Universités, population développée et certains régimes accélèrent la recherche.</p>`;
  if (key === 'pop') return `<h4>👥 Population</h4><ul class="tip-list">${row('Habitants', fmtPop(st.pop))}${row('Territoires', String(st.ncells))}</ul><h5>Croissance</h5>${modList(g, c, 'growth')}<p class="hint">Les fermes augmentent la population maximale ; les territoires conquis sont agités et produisent moins au début.</p>`;
  if (key === 'morale') {
    const wars = g.warCount(c.id), G = GOV_BY_ID[c.gov] || {};
    const parts = [row('Base', '64'), row(wars ? `${wars} guerre(s)` : 'En paix', wars ? `−${5 * Math.min(3, wars)}` : '+10', wars ? 'down' : 'up')];
    if (G.weary && wars) parts.push(row(`${G.icon} ${G.name} : lassitude de la guerre`, `−${4 * Math.min(3, wars)}`, 'down'));
    if (st.bankrupt) parts.push(row('Faillite', '−25', 'down'));
    return `<h4>😊 Moral : ${Math.round(c.morale)}</h4><ul class="tip-list">${parts.join('')}</ul><h5>Autres effets</h5>${modList(g, c, 'morale', (v) => (v >= 0 ? '+' : '−') + Math.round(Math.abs(v)))}
      <p class="hint">Le moral tend vers sa valeur cible. Il influence l’or (×${fmt1(0.7 + (0.6 * c.morale) / 100)}) et la qualité des troupes (×${fmt1(g.moraleF(c))}).</p>`;
  }
  return '';
}


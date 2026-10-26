// Gestion automatique de l'empire : construction selon une priorité, et « construire partout ».
import { BUILDINGS, BI, NB } from '../tech/buildings.js';
import { BAL } from './balance.js';
import { TECHS, REPEATABLES, canResearch, repeatCost } from '../tech/techtree.js';

export const GOV_MODES = {
  equilibre: { label: 'Équilibré', w: { farm: 1, mine: 1.2, university: 1.1, factory: 1.2, barracks: 0.6, port: 0.5 } },
  or: { label: 'Or', w: { mine: 1.7, factory: 1.5, port: 0.9, farm: 0.6, university: 0.3, barracks: 0.3 } },
  science: { label: 'Recherche', w: { university: 1.9, farm: 0.8, mine: 0.6, factory: 0.5, barracks: 0.2, port: 0.2 } },
  armee: { label: 'Armée', w: { barracks: 1.7, farm: 1.0, mine: 0.9, factory: 0.7, university: 0.3, port: 0.4 } },
};

const isBorder = (g, id, cell) => g.map.cells[cell].nbrs.some((nb) => g.owner[nb] !== id);

// Construit au plus `max` bâtiments rentables ; renvoie le nombre construit
export function governorTick(g, id, mode = 'equilibre', max = 1) {
  const c = g.countries[id], W = (GOV_MODES[mode] || GOV_MODES.equilibre).w;
  let built = 0;
  for (let k = 0; k < max; k++) {
    const budget = c.gold - Math.max(60, c.st.income * 15);
    if (budget <= 0) break;
    let best = null, bv = 0;
    for (const cell of g.cellsOf[id]) {
      if (g.unrest[cell] > 0.5) continue;
      const pop = g.pop[cell], dev = BAL.DEV_F[g.map.cells[cell].dev] || 1;
      for (const bid in W) {
        if (bid === 'barracks' && !isBorder(g, id, cell)) continue;
        const r = g.canBuild(id, cell, bid);
        if (!r.ok || r.cost > budget) continue;
        const scale = bid === 'barracks' || bid === 'port' ? 6 : Math.pow(pop * (bid === 'farm' ? 1 : dev), 0.7);
        const v = (W[bid] * scale) / r.cost;
        if (v > bv) { bv = v; best = [cell, bid]; }
      }
    }
    if (!best) break;
    g.buildIn(id, best[0], best[1]);
    built++;
  }
  return built;
}

// Monte d'un niveau le bâtiment `bid` dans tous les territoires possibles (les plus peuplés d'abord)
export function bulkBuild(g, id, bid) {
  const c = g.countries[id];
  const cells = [...g.cellsOf[id]].sort((a, b) => g.pop[b] - g.pop[a]);
  let n = 0, spent = 0;
  for (const cell of cells) {
    const r = g.canBuild(id, cell, bid);
    if (!r.ok) continue;
    spent += r.cost;
    g.buildIn(id, cell, bid);
    n++;
  }
  return { n, spent, left: c.gold };
}

// Coût total pour monter `bid` d'un niveau partout où c'est possible (sans contrainte d'or)
export function bulkCost(g, id, bid) {
  const b = BUILDINGS[BI[bid]];
  let total = 0, n = 0;
  for (const cell of g.cellsOf[id]) {
    const lvl = g.build[cell * NB + BI[bid]];
    if (lvl >= b.max) continue;
    const r = g.canBuild(id, cell, bid);
    if (r.locked || r.msg === 'Niveau maximum atteint') continue;
    if (r.cost !== undefined) { total += r.cost; n++; }
  }
  return { total, n };
}

// Recherche automatique : la technologie disponible la moins chère, puis les répétables
export function autoResearchTick(g, id) {
  const P = g.countries[id];
  const avail = TECHS.filter((t) => canResearch(P.techs, P.era, t)).sort((a, b) => a.cost - b.cost);
  if (avail.length) { if (P.rp >= avail[0].cost) g.research(id, avail[0].id); return; }
  if (P.era >= 4) {
    const r = [...REPEATABLES].sort((a, b) => repeatCost(a, P.repeat[a.id] || 0) - repeatCost(b, P.repeat[b.id] || 0))[0];
    if (P.rp >= repeatCost(r, P.repeat[r.id] || 0)) g.researchRepeat(id, r.id);
  }
}

// Outils communs aux générateurs : statistiques de terrain, voisinage des pays, noms de régions.
import { BIOMES } from './biomes.js';
import { wrapDx } from '../core/util.js';

export function computeCellTerrain(map) {
  const { cells, biome } = map;
  const hist = new Float64Array(BIOMES.length);
  for (const c of cells) {
    hist.fill(0);
    let fert = 0, gold = 0, def = 0;
    for (let i = 0; i < c.px.length; i++) hist[biome[c.px[i]]]++;
    let best = 0;
    for (let b = 0; b < hist.length; b++) {
      if (hist[b] > hist[best]) best = b;
      const w = hist[b] / c.n;
      fert += w * BIOMES[b].fert; gold += w * BIOMES[b].gold; def += w * BIOMES[b].def;
    }
    c.terrain = best;
    c.fert = fert; c.gold = gold; c.def = 0.5 * def + 0.5 * BIOMES[best].def;
  }
}

export function countryNeighbors(cells, ownerOf, nCountries, withSea = true) {
  const sets = Array.from({ length: nCountries }, () => new Set());
  for (const c of cells) {
    const a = ownerOf[c.id];
    if (a < 0) continue;
    for (const nb of c.nbrs) { const b = ownerOf[nb]; if (b >= 0 && b !== a) { sets[a].add(b); sets[b].add(a); } }
    if (withSea) for (const s of c.seas) { const b = ownerOf[s.to]; if (b >= 0 && b !== a && s.len < 30) { sets[a].add(b); sets[b].add(a); } }
  }
  return sets;
}

const DIRS = ['Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest', 'Nord', 'Nord-Est'];
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

// Noms « boussole » des régions d'un pays : Nord, Sud-Est, Centre…
export function compassNames(map, cellIds, capitalCell) {
  const { W, cells } = map;
  if (cellIds.length === 1) { cells[cellIds[0]].region = ''; return; }
  let cs = 0, sn = 0, sy = 0, tot = 0;
  for (const id of cellIds) {
    const c = cells[id], a = (c.cx / W) * Math.PI * 2;
    cs += Math.cos(a) * c.n; sn += Math.sin(a) * c.n; sy += c.cy * c.n; tot += c.n;
  }
  let ccx = (Math.atan2(sn, cs) / (Math.PI * 2)) * W; if (ccx < 0) ccx += W;
  const ccy = sy / tot;
  let rMax = 1;
  for (const id of cellIds) {
    const c = cells[id];
    rMax = Math.max(rMax, Math.hypot(wrapDx(c.cx - ccx, W), c.cy - ccy));
  }
  const count = {};
  for (const id of cellIds) {
    const c = cells[id];
    let name;
    if (id === capitalCell) name = 'Capitale';
    else {
      const dx = wrapDx(c.cx - ccx, W), dy = c.cy - ccy;
      if (Math.hypot(dx, dy) < rMax * 0.28) name = 'Centre';
      else {
        const ang = Math.atan2(dy, dx);
        name = DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
      }
    }
    count[name] = (count[name] || 0) + 1;
    c.region = name + (ROMAN[count[name] - 1] ?? ' ' + count[name]);
  }
}

// Répartit une population totale entre les cellules selon surface × fertilité (+ bonus capitale).
export function distributePopulation(cells, cellIds, totalPop, capitalCell) {
  let sum = 0;
  const w = cellIds.map((id) => {
    const c = cells[id];
    let v = Math.sqrt(c.area) * (0.08 + c.fert) + 0.02;
    if (id === capitalCell) v *= cellIds.length > 1 ? 3 : 1;
    sum += v;
    return v;
  });
  cellIds.forEach((id, i) => { cells[id].basePop = (totalPop * w[i]) / sum; });
}

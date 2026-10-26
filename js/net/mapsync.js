// Vérification et transfert de la carte : si deux navigateurs génèrent une carte légèrement
// différente (arrondis), l'hôte envoie la sienne (identifiants de territoires compressés).
import { finalizeCells } from '../map/cells.js';
import { computeCellTerrain } from '../map/mapCommon.js';

export function mapHash(map) {
  let h = 2166136261 >>> 0;
  const a = map.cellOf;
  for (let i = 0; i < a.length; i += 3) { h ^= a[i] & 0xffff; h = Math.imul(h, 16777619) >>> 0; }
  h ^= map.cells.length; h = Math.imul(h, 16777619) >>> 0;
  for (const c of map.countries0) for (let i = 0; i < c.name.length; i++) { h ^= c.name.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function encodeMap(map) {
  const a = map.cellOf, rle = [];
  let prev = a[0], run = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === prev) run++;
    else { rle.push(prev, run); prev = a[i]; run = 1; }
  }
  rle.push(prev, run);
  return {
    W: map.W, H: map.H, rle,
    cells: map.cells.map((c) => [c.initOwner, Math.round(c.basePop * 1e4) / 1e4, c.dev, c.region || '', c.key ?? 0]),
    countries0: map.countries0.map((c) => ({ ...c, neighbors: c.neighbors ? [...c.neighbors] : [] })),
    seaLinks: map.seaLinks,
  };
}

// Remplace la géométrie de `map` (générée localement) par celle de l'hôte, en gardant ses couleurs de relief
export function applyMapData(map, d) {
  const cellOf = new Int16Array(d.W * d.H);
  let p = 0;
  for (let i = 0; i < d.rle.length; i += 2) cellOf.fill(d.rle[i], p, p + d.rle[i + 1]), (p += d.rle[i + 1]);
  const cells = finalizeCells(d.W, d.H, cellOf, d.cells.length, map.rowWeight);
  d.cells.forEach((v, i) => {
    const c = cells[i];
    [c.initOwner, c.basePop, c.dev, c.region, c.key] = v;
  });
  for (const [a, b, len] of d.seaLinks) { cells[a].seas.push({ to: b, len }); cells[b].seas.push({ to: a, len }); }
  map.cellOf = cellOf;
  map.cells = cells;
  map.seaLinks = d.seaLinks;
  map.countries0 = d.countries0.map((c) => ({ ...c, neighbors: new Set(c.neighbors) }));
  computeCellTerrain(map);
  return map;
}

// Génération de la carte « Terre réelle » à partir du TopoJSON world-atlas 110m.
// Projection équirectangulaire (cylindrique => la carte boucle d'est en ouest).
import { decodeTopology, rasterizePolygon } from './topojson.js';
import { EARTH_COUNTRIES, EARTH_COLORS } from './earthData.js';
import { buildCells, computeWater } from './cells.js';
import { earthBiome } from './biomes.js';
import { computeCellTerrain, countryNeighbors, compassNames, distributePopulation } from './mapCommon.js';
import { assignColors } from './colors.js';
import { makeNoise3, cylinderFbm } from '../core/noise.js';
import { RNG } from '../core/rng.js';
import { wrapDx } from '../core/util.js';

export const LAT_TOP = 84, LAT_BOTTOM = -56;

export function earthDims(scale = 1) {
  const W = Math.round(2304 * scale / 8) * 8;
  return { W, H: Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360) };
}

export async function generateEarth(topology, opts = {}, progress = async () => {}) {
  const { W, H } = earthDims(opts.scale || 1);
  const N = W * H;
  const rng = new RNG('terre-' + (opts.seed || 'terra'));
  const lonOf = (x) => (x / W) * 360 - 180;
  const latOf = (y) => LAT_TOP - (y / H) * (LAT_TOP - LAT_BOTTOM);

  await progress(0.05, 'Projection des pays…');
  const features = decodeTopology(topology, 'countries');
  const raw = [];
  const key = new Int16Array(N).fill(-1);
  for (const f of features) {
    const d = EARTH_COUNTRIES[f.name];
    if (!d) continue;
    const idx = raw.length;
    raw.push({ src: f.name, name: d[0], art: d[1], pop: d[2], dev: d[3], capLon: d[4], capLat: d[5] });
    for (const poly of f.polygons) {
      const rings = poly.map((ring) => {
        let prev = ring[0][0], off = 0;
        return ring.map(([lon, lat]) => {
          if (lon - prev > 180) off -= 360; else if (lon - prev < -180) off += 360;
          prev = lon;
          return [((lon + off + 180) / 360) * W, ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H];
        });
      });
      rasterizePolygon(rings, W, H, idx, key);
    }
  }

  const rowWeight = new Float32Array(H);
  for (let y = 0; y < H; y++) rowWeight[y] = Math.cos((latOf(y + 0.5) * Math.PI) / 180);
  const kmX = (360 / W) * 111.32, kmY = ((LAT_TOP - LAT_BOTTOM) / H) * 111.32;
  const areaKm = new Float64Array(raw.length);
  for (let p = 0; p < N; p++) if (key[p] >= 0) areaKm[key[p]] += rowWeight[(p / W) | 0] * kmX * kmY;

  // Nombre de territoires : croît avec la surface et la population (Europe plus détaillée que la Sibérie)
  const target = opts.targetCells || 440;
  let want = raw.map((c, i) => (areaKm[i] > 0 ? 0.9 * Math.pow(areaKm[i] / 50000, 0.55) + 0.25 * Math.pow(c.pop, 0.45) : 0));
  const sumWant = want.reduce((a, b) => a + b, 0);
  want = want.map((v) => (v > 0 ? Math.max(1, (v * target) / sumWant) : 0));

  await progress(0.25, 'Découpage des territoires…');
  const { cellOf, cells } = buildCells({ W, H, key, rowWeight, cellsForKey: want, rng, minCompPx: 45, minCompArea: 90 });

  await progress(0.55, 'Relief et climats…');
  const noise = makeNoise3(rng);
  const biome = new Uint8Array(N);
  const shade = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (cellOf[p] < 0) continue;
    const x = p % W, y = (p - x) / W;
    const u = x / W, v = y / W;
    const j = cylinderFbm(noise, u, v, 9, 2, 1);
    const b = earthBiome(lonOf(x + 0.5), latOf(y + 0.5), j);
    biome[p] = b;
    const h = cylinderFbm(noise, u, v, 40, 3, 1, 17.3);
    shade[p] = Math.max(0, Math.min(255, 128 + h * (b === 5 ? 110 : 45)));
  }

  await progress(0.7, 'Océans et routes maritimes…');
  const water = computeWater(W, H, cellOf, cells, 46);
  const depth = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (cellOf[p] < 0) depth[p] = Math.min(255, water.dist[p] * 3);

  const map = {
    kind: 'earth', W, H, cellOf, cells, biome, shade, depth, rowWeight,
    lonOf, latOf,
  };
  computeCellTerrain(map);

  await progress(0.85, 'Population et capitales…');
  // Pays initiaux (on ignore ceux qui n'ont aucun territoire à cette résolution)
  const cellsByKey = new Map();
  for (const c of cells) {
    if (!cellsByKey.has(c.key)) cellsByKey.set(c.key, []);
    cellsByKey.get(c.key).push(c.id);
  }
  const countries0 = [];
  const ownerOf = new Int16Array(cells.length);
  for (let k = 0; k < raw.length; k++) {
    const ids = cellsByKey.get(k);
    if (!ids) continue;
    const r = raw[k];
    const idx = countries0.length;
    // capitale : cellule du pays la plus proche de la vraie capitale
    const capX = ((r.capLon + 180) / 360) * W, capY = ((LAT_TOP - r.capLat) / (LAT_TOP - LAT_BOTTOM)) * H;
    let capital = ids[0], bd = Infinity;
    const capPix = Math.max(0, Math.min(H - 1, Math.floor(capY))) * W + (((Math.floor(capX) % W) + W) % W);
    if (cellOf[capPix] >= 0 && cells[cellOf[capPix]].key === k) capital = cellOf[capPix];
    else for (const id of ids) {
      const c = cells[id];
      const d = Math.hypot(wrapDx(c.cx - capX, W), c.cy - capY);
      if (d < bd) { bd = d; capital = id; }
    }
    for (const id of ids) ownerOf[id] = idx;
    distributePopulation(cells, ids, r.pop, capital);
    compassNames(map, ids, capital);
    for (const id of ids) cells[id].dev = r.dev;
    countries0.push({ name: r.name, art: r.art, pop: r.pop, dev: r.dev, capital, cells: ids, src: r.src, area: areaKm[k] });
  }
  const nb = countryNeighbors(cells, ownerOf, countries0.length);
  const fixed = new Map();
  countries0.forEach((c, i) => { if (EARTH_COLORS[c.src]) fixed.set(i, EARTH_COLORS[c.src]); });
  const colors = assignColors(countries0.length, nb, rng, fixed);
  countries0.forEach((c, i) => { c.color = colors[i]; c.neighbors = nb[i]; });
  for (const c of cells) c.initOwner = ownerOf[c.id];

  map.countries0 = countries0;
  map.seaLinks = water.links;
  await progress(1, 'Terminé');
  return map;
}

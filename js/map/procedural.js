// Génération procédurale d'une planète : bruit Simplex (continents) + cellules raster + pays.
import { RNG } from '../core/rng.js';
import { makeNoise3, cylinderFbm } from '../core/noise.js';
import { MinHeap } from '../core/heap.js';
import { wrapDx, smoothstep, clamp } from '../core/util.js';
import { buildCells, computeWater, labelComponents } from './cells.js';
import { PLANET_TYPES, pickBiome, specialWater } from './planetTypes.js';
import { computeCellTerrain, countryNeighbors } from './mapCommon.js';
import { assignColors } from './colors.js';
import { NameGen } from './names.js';

export function proceduralDims(targetCells, scale = 1) {
  let W = 2048 * Math.sqrt(targetCells / 440) * scale;
  W = Math.round(clamp(W, 1024, 2816) / 8) * 8;
  return { W, H: Math.round(W * 0.42) };
}

/**
 * spec : { seed, type, nCountries, targetCells, scale, neutralShare, totalPop, devRange:[a,b] }
 */
export async function generatePlanet(spec, progress = async () => {}) {
  const type = PLANET_TYPES[spec.type] ? spec.type : 'terran';
  const T = PLANET_TYPES[type];
  const targetCells = spec.targetCells || 440;
  const { W, H } = proceduralDims(targetCells, spec.scale || 1);
  const N = W * H;
  const rng = new RNG(`planete-${spec.seed}-${type}`);
  const noise = makeNoise3(rng);

  await progress(0.05, 'Soulèvement des continents…');
  // Relief à demi-résolution (puis interpolation) pour rester rapide
  const cw = W >> 1, ch = H >> 1;
  const hc = new Float32Array(cw * ch), mc = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    const lat = (y / (ch - 1)) * 2 - 1;
    const polarCut = T.polar ? smoothstep(0.74, 1, Math.abs(lat)) * 0.7 : smoothstep(0.9, 1, Math.abs(lat)) * 0.35;
    for (let x = 0; x < cw; x++) {
      const u = x / cw, v = y / cw;
      const wx = cylinderFbm(noise, u, v, 2.5, 2, 1, 11.1) * 0.07;
      const wy = cylinderFbm(noise, u, v, 2.5, 2, 1, 23.7) * 0.07;
      let h = cylinderFbm(noise, u + wx, v + wy, T.freq, 6, 1);
      const c = cylinderFbm(noise, u, v, T.freq * 0.45, 2, 1, 37.3);
      h = h * 0.75 + c * 0.55 - polarCut;
      hc[y * cw + x] = h;
      mc[y * cw + x] = cylinderFbm(noise, u, v, 3.2, 3, 1, 71.9);
    }
  }
  const h = new Float32Array(N), moist = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(ch - 1.001, (y / H) * ch), y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = (x / W) * cw, x0 = Math.floor(fx) % cw, x1 = (x0 + 1) % cw, tx = fx - Math.floor(fx);
      const i00 = y0 * cw + x0, i10 = y0 * cw + x1, i01 = (y0 + 1) * cw + x0, i11 = (y0 + 1) * cw + x1;
      const p = y * W + x;
      h[p] = (hc[i00] * (1 - tx) + hc[i10] * tx) * (1 - ty) + (hc[i01] * (1 - tx) + hc[i11] * tx) * ty;
      moist[p] = (mc[i00] * (1 - tx) + mc[i10] * tx) * (1 - ty) + (mc[i01] * (1 - tx) + mc[i11] * tx) * ty;
    }
  }
  // détail fin des côtes
  for (let p = 0; p < N; p++) {
    const x = p % W, y = (p - x) / W;
    h[p] += 0.03 * cylinderFbm(noise, x / W, y / W, 70, 1, 1, 91.3);
  }

  await progress(0.2, 'Remplissage des océans…');
  const sample = [];
  for (let p = 0; p < N; p += 37) sample.push(h[p]);
  sample.sort((a, b) => a - b);
  const sea = sample[Math.floor(sample.length * (1 - T.land))];
  const hmax = sample[sample.length - 1];
  const key = new Int16Array(N);
  for (let p = 0; p < N; p++) key[p] = h[p] > sea ? 0 : -1;
  // supprime les îlots et comble les petits lacs
  {
    const land = labelComponents(W, H, key);
    const kill = land.sizes.map((s) => s < 40);
    for (let p = 0; p < N; p++) if (land.comp[p] >= 0 && kill[land.comp[p]]) key[p] = -1;
    const inv = new Int16Array(N);
    for (let p = 0; p < N; p++) inv[p] = key[p] < 0 ? 0 : -1;
    const wat = labelComponents(W, H, inv);
    const fill = wat.sizes.map((s) => s < 140);
    for (let p = 0; p < N; p++) if (wat.comp[p] >= 0 && fill[wat.comp[p]]) key[p] = 0;
  }

  await progress(0.35, 'Climats et biomes…');
  const biome = new Uint8Array(N), shade = new Uint8Array(N);
  const span = Math.max(0.05, hmax - sea);
  for (let p = 0; p < N; p++) {
    if (key[p] < 0) continue;
    const x = p % W, y = (p - x) / W;
    const hn = clamp((h[p] - sea) / span, 0, 1);
    const lat = Math.abs((y / (H - 1)) * 2 - 1);
    let t = 1 - Math.pow(lat, 1.25) * 1.05 - hn * 0.35;
    if (type === 'glacial') t = t * 0.55 + 0.05;
    else if (type === 'desert' || type === 'volcanic' || type === 'jungle') t = 0.35 + t * 0.65;
    const m = clamp(moist[p] * 0.9 + 0.5 + (type === 'jungle' ? 0.15 : 0) - (type === 'desert' ? 0.12 : 0), 0, 1);
    const n = moist[(p + 7919) % N];
    biome[p] = pickBiome(type, hn, clamp(t, 0, 1), m, n);
    const q = y > 0 ? p - W - (x > 0 ? 1 : 1 - W) : p;
    const dh = h[p] - h[q];
    shade[p] = clamp(128 + dh * 2600 + hn * 30, 20, 235);
  }

  await progress(0.5, 'Découpage des territoires…');
  const rowWeight = new Float32Array(H).fill(1);
  const { cellOf, cells } = buildCells({ W, H, key, rowWeight, cellsForKey: [targetCells], rng, minCompPx: 40 });

  await progress(0.65, 'Routes maritimes…');
  const water = computeWater(W, H, cellOf, cells, T.linkDist * (W / 2048));
  const depth = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (cellOf[p] < 0) depth[p] = Math.min(255, water.dist[p] * 3);

  const map = { kind: 'proc', W, H, cellOf, cells, biome, shade, depth, rowWeight, planetType: type, spec };
  computeCellTerrain(map);

  await progress(0.8, 'Naissance des civilisations…');
  const names = new NameGen(rng, type);
  const nC = Math.max(2, Math.min(spec.nCountries || 24, Math.floor(cells.length / 3)));
  const owner = assignCountries(map, nC, spec.neutralShare || 0, rng);

  const countries0 = [];
  const [dmin, dmax] = spec.devRange || [1, 3];
  for (let k = 0; k < nC; k++) {
    const nm = names.country();
    countries0.push({ ...nm, cells: [], dev: rng.int(dmin, dmax), density: 0.6 + rng.next() * 0.9, capital: -1 });
  }
  for (const c of cells) {
    c.region = names.region();
    c.initOwner = owner.owner[c.id];
    if (c.initOwner >= 0) countries0[c.initOwner].cells.push(c.id);
  }
  owner.capitals.forEach((cid, k) => { countries0[k].capital = cid; });
  // Population : surface × fertilité × densité du pays
  const totalPop = spec.totalPop || 7000;
  let sum = 0;
  const w = cells.map((c) => {
    const k = c.initOwner;
    let v = Math.sqrt(c.area) * (0.08 + c.fert) * (k >= 0 ? countries0[k].density : 0.45);
    if (k >= 0 && countries0[k].capital === c.id) v *= 2.5;
    sum += v;
    return v;
  });
  cells.forEach((c, i) => {
    c.basePop = (totalPop * w[i]) / sum;
    c.dev = c.initOwner >= 0 ? countries0[c.initOwner].dev : Math.max(1, dmin - 1);
  });
  for (const k of countries0) k.pop = k.cells.reduce((s, id) => s + cells[id].basePop, 0);

  const ownerArr = Int16Array.from(cells.map((c) => c.initOwner));
  const nb = countryNeighbors(cells, ownerArr, nC);
  const colors = assignColors(nC, nb, rng);
  countries0.forEach((c, i) => { c.color = colors[i]; c.neighbors = nb[i]; });

  map.countries0 = countries0;
  map.seaLinks = water.links;
  const wf = specialWater(type, noise);
  map.palette = { ...T.palette, waterFn: wf || undefined };
  await progress(1, 'Terminé');
  return map;
}

// Croissance de régions depuis des capitales bien espacées (Dijkstra sur le graphe des cellules).
function assignCountries(map, nC, neutralShare, rng) {
  const { cells, W } = map;
  const n = cells.length;
  const dist2 = (a, b) => {
    const dx = wrapDx(a.cx - b.cx, W), dy = a.cy - b.cy;
    return dx * dx + dy * dy;
  };
  // capitales : échantillonnage du point le plus éloigné (avec un peu d'aléa)
  const reach = cells.map((c) => c.nbrs.length);
  const capitals = [];
  const minD = new Float64Array(n).fill(Infinity);
  let first = rng.weighted(cells.filter((c) => reach[c.id] >= 2), (c) => c.n);
  if (!first) first = cells[0];
  capitals.push(first.id);
  while (capitals.length < nC) {
    const last = cells[capitals[capitals.length - 1]];
    for (let i = 0; i < n; i++) minD[i] = Math.min(minD[i], dist2(cells[i], last));
    const cand = [];
    for (let i = 0; i < n; i++) if (!capitals.includes(i)) cand.push(i);
    cand.sort((a, b) => minD[b] * (reach[b] >= 2 ? 1 : 0.3) - minD[a] * (reach[a] >= 2 ? 1 : 0.3));
    capitals.push(cand[Math.floor(rng.next() * Math.min(4, cand.length))]);
  }
  const strength = capitals.map(() => 0.55 + rng.next() * 1.1);
  const owner = new Int16Array(n).fill(-1);
  const cost = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap(4096);
  capitals.forEach((cid, k) => { cost[cid] = 0; heap.push(0, cid * 128 + k); });
  while (heap.size) {
    const v = heap.pop(), d = heap.lastKey;
    const cid = Math.floor(v / 128), k = v % 128;
    if (owner[cid] >= 0) continue;
    owner[cid] = k; cost[cid] = d;
    const c = cells[cid];
    for (const nb of c.nbrs) {
      if (owner[nb] >= 0) continue;
      const step = (1 + (cells[nb].def - 1) * 1.5) * (0.7 + rng.next() * 0.6) / strength[k];
      heap.push(d + step, nb * 128 + k);
    }
    for (const s of c.seas) {
      if (owner[s.to] >= 0) continue;
      heap.push(d + (3 + s.len / 12) / strength[k], s.to * 128 + k);
    }
  }
  if (neutralShare > 0) {
    const order = [...Array(n).keys()].filter((i) => !capitals.includes(i)).sort((a, b) => cost[b] - cost[a]);
    const kill = Math.floor(n * neutralShare);
    for (let i = 0; i < kill && i < order.length; i++) owner[order[i]] = -1;
  }
  return { owner, capitals };
}

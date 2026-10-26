// Découpage raster d'un monde en territoires (cellules) contigus.
// Commun à la Terre réelle et aux planètes procédurales.
//  - key[p] : -1 = eau, sinon groupe (pays pour la Terre, 0 pour une planète vierge)
//  - les cellules ne débordent jamais d'un groupe ni d'une masse terrestre
//  - la carte boucle horizontalement (x = W-1 voisin de x = 0)
import { MinHeap } from '../core/heap.js';
import { wrapDx } from '../core/util.js';

export function labelComponents(W, H, key) {
  const N = W * H;
  const comp = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const sizes = [], keys = [], firsts = [];
  let n = 0;
  for (let p = 0; p < N; p++) {
    const k = key[p];
    if (k < 0 || comp[p] >= 0) continue;
    let sp = 0, size = 0;
    stack[sp++] = p; comp[p] = n;
    while (sp > 0) {
      const q = stack[--sp]; size++;
      const x = q % W, row = q - x;
      const l = row + (x === 0 ? W - 1 : x - 1), r = row + (x === W - 1 ? 0 : x + 1);
      if (key[l] === k && comp[l] < 0) { comp[l] = n; stack[sp++] = l; }
      if (key[r] === k && comp[r] < 0) { comp[r] = n; stack[sp++] = r; }
      if (row > 0) { const u = q - W; if (key[u] === k && comp[u] < 0) { comp[u] = n; stack[sp++] = u; } }
      if (row < N - W) { const d = q + W; if (key[d] === k && comp[d] < 0) { comp[d] = n; stack[sp++] = d; } }
    }
    sizes.push(size); keys.push(k); firsts.push(p); n++;
  }
  return { comp, n, sizes, keys, firsts };
}

// Regroupe les indices de pixels par étiquette (tri par comptage).
export function groupPixels(labels, nLabels) {
  const counts = new Int32Array(nLabels + 1);
  for (let p = 0; p < labels.length; p++) { const l = labels[p]; if (l >= 0) counts[l + 1]++; }
  for (let i = 0; i < nLabels; i++) counts[i + 1] += counts[i];
  const offsets = counts.slice();
  const list = new Int32Array(offsets[nLabels]);
  const cur = offsets.slice(0, nLabels);
  for (let p = 0; p < labels.length; p++) { const l = labels[p]; if (l >= 0) list[cur[l]++] = p; }
  return { offsets, list };
}

function circularMeanX(pixels, W, step = 1) {
  let cs = 0, sn = 0;
  for (let i = 0; i < pixels.length; i += step) {
    const a = ((pixels[i] % W) / W) * Math.PI * 2;
    cs += Math.cos(a); sn += Math.sin(a);
  }
  let x = (Math.atan2(sn, cs) / (Math.PI * 2)) * W;
  if (x < 0) x += W;
  return x;
}

// k-means (avec init k-means++) sur un échantillon des pixels d'une composante.
function kmeans(pixels, k, W, rng) {
  const n = pixels.length;
  const refX = circularMeanX(pixels, W, Math.max(1, Math.floor(n / 2000)));
  const maxS = 3000 + k * 150;
  const step = Math.max(1, Math.floor(n / maxS));
  const S = Math.ceil(n / step);
  const sx = new Float32Array(S), sy = new Float32Array(S), sp = new Int32Array(S);
  let m = 0;
  const off = Math.floor(rng.next() * step);
  for (let i = off; i < n && m < S; i += step) {
    const p = pixels[i], x = p % W;
    sx[m] = refX + wrapDx(x - refX, W); sy[m] = (p - x) / W; sp[m] = p; m++;
  }
  const cx = new Float64Array(k), cy = new Float64Array(k);
  // k-means++
  const d2 = new Float64Array(m).fill(Infinity);
  let first = Math.floor(rng.next() * m);
  cx[0] = sx[first]; cy[0] = sy[first];
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < m; i++) {
      const dx = sx[i] - cx[c - 1], dy = sy[i] - cy[c - 1];
      const d = dx * dx + dy * dy;
      if (d < d2[i]) d2[i] = d;
      total += d2[i];
    }
    let r = rng.next() * total, pick = m - 1;
    for (let i = 0; i < m; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    cx[c] = sx[pick]; cy[c] = sy[pick];
  }
  const assign = new Int32Array(m);
  const accX = new Float64Array(k), accY = new Float64Array(k), cnt = new Int32Array(k);
  for (let it = 0; it < 7; it++) {
    accX.fill(0); accY.fill(0); cnt.fill(0);
    for (let i = 0; i < m; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dx = sx[i] - cx[c], dy = sy[i] - cy[c];
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best; accX[best] += sx[i]; accY[best] += sy[i]; cnt[best]++;
    }
    for (let c = 0; c < k; c++) {
      if (cnt[c] > 0) { cx[c] = accX[c] / cnt[c]; cy[c] = accY[c] / cnt[c]; }
      else { const i = Math.floor(rng.next() * m); cx[c] = sx[i]; cy[c] = sy[i]; }
    }
  }
  // pixel de départ = pixel de l'échantillon le plus proche du centre
  const seeds = [];
  const used = new Set();
  for (let c = 0; c < k; c++) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < m; i++) {
      if (used.has(i)) continue;
      const dx = sx[i] - cx[c], dy = sy[i] - cy[c];
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) continue;
    used.add(best);
    seeds.push({ x: ((cx[c] % W) + W) % W, y: cy[c], pixel: sp[best] });
  }
  return seeds;
}

/**
 * Construit les cellules.
 * @param {object} o
 *  W, H, key (Int16Array), rowWeight (Float32Array H) poids d'aire réelle par ligne,
 *  cellsForKey (number[]) nombre de cellules désiré par groupe,
 *  rng, minCompPx (taille min d'une île pour avoir sa propre cellule)
 */
export function buildCells(o) {
  const { W, H, key, rowWeight, cellsForKey, rng } = o;
  const minCompPx = o.minCompPx ?? 50;
  const minCompArea = o.minCompArea ?? minCompPx;
  const N = W * H;
  const { comp, n: nComp, sizes, keys } = labelComponents(W, H, key);
  const grouped = groupPixels(comp, nComp);
  const compPixels = (c) => grouped.list.subarray(grouped.offsets[c], grouped.offsets[c + 1]);

  const compArea = new Float64Array(nComp);
  for (let c = 0; c < nComp; c++) {
    const px = compPixels(c);
    let a = 0;
    for (let i = 0; i < px.length; i++) a += rowWeight[(px[i] / W) | 0];
    compArea[c] = a;
  }

  // Composantes par groupe
  const byKey = new Map();
  for (let c = 0; c < nComp; c++) {
    if (!byKey.has(keys[c])) byKey.set(keys[c], []);
    byKey.get(keys[c]).push(c);
  }

  const seeds = []; // {x, y, pixel, key, comp}
  for (const [k, comps] of byKey) {
    comps.sort((a, b) => sizes[b] - sizes[a]);
    const eligible = comps.filter((c, i) => i === 0 || (sizes[c] >= minCompPx && compArea[c] >= minCompArea));
    const want = Math.max(eligible.length, Math.round(cellsForKey[k] || 1));
    let totalArea = 0;
    for (const c of eligible) totalArea += compArea[c];
    for (const c of eligible) {
      const cap = Math.max(1, Math.floor(sizes[c] / 18));
      const nSeeds = Math.min(cap, Math.max(1, Math.round((want * compArea[c]) / totalArea)));
      const s = kmeans(compPixels(c), nSeeds, W, rng);
      for (const sd of s) seeds.push({ ...sd, key: k, comp: c });
    }
  }

  // Inondation priorisée depuis les graines (Voronoï contraint, cellules contiguës)
  const cellOf = new Int16Array(N).fill(-1);
  if (seeds.length > 32000) throw new Error('Trop de cellules');
  const heap = new MinHeap(1 << 16);
  const sxs = new Float64Array(seeds.length), sys = new Float64Array(seeds.length);
  seeds.forEach((s, i) => {
    sxs[i] = s.x; sys[i] = s.y;
    cellOf[s.pixel] = i;
    heap.push(0, s.pixel);
  });
  while (heap.size > 0) {
    const p = heap.pop();
    const c = cellOf[p], cp = comp[p];
    const x = p % W, row = p - x;
    const sx = sxs[c], sy = sys[c];
    const nb0 = row + (x === 0 ? W - 1 : x - 1);
    const nb1 = row + (x === W - 1 ? 0 : x + 1);
    const nb2 = row > 0 ? p - W : -1;
    const nb3 = row < N - W ? p + W : -1;
    for (let j = 0; j < 4; j++) {
      const q = j === 0 ? nb0 : j === 1 ? nb1 : j === 2 ? nb2 : nb3;
      if (q < 0 || cellOf[q] !== -1 || comp[q] !== cp) continue;
      cellOf[q] = c;
      const qx = q % W, qy = (q - qx) / W;
      const dx = wrapDx(qx - sx, W), dy = qy - sy;
      heap.push(dx * dx + dy * dy, q);
    }
  }

  // Petites îles sans graine : rattachées à la cellule la plus proche du même groupe
  const seededComp = new Uint8Array(nComp);
  for (const s of seeds) seededComp[s.comp] = 1;
  const seedsByKey = new Map();
  seeds.forEach((s, i) => {
    if (!seedsByKey.has(s.key)) seedsByKey.set(s.key, []);
    seedsByKey.get(s.key).push(i);
  });
  for (let c = 0; c < nComp; c++) {
    if (seededComp[c]) continue;
    const px = compPixels(c);
    const cand = seedsByKey.get(keys[c]);
    let best = -1;
    if (cand) {
      const p0 = px[0], x0 = p0 % W, y0 = (p0 - x0) / W;
      let bd = Infinity;
      for (const i of cand) {
        const dx = wrapDx(sxs[i] - x0, W), dy = sys[i] - y0;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      // une île trop lointaine (> 1/5 de la carte) redevient de l'eau
      if (bd > (W / 5) * (W / 5)) best = -1;
    }
    for (let i = 0; i < px.length; i++) cellOf[px[i]] = best;
  }

  const cells = finalizeCells(W, H, cellOf, seeds.length, rowWeight);
  cells.forEach((cell, i) => { cell.key = seeds[i].key; });
  return { cellOf, cells };
}

// Calcule pour chaque cellule : pixels, contour, voisins, centre, boîte englobante.
export function finalizeCells(W, H, cellOf, nCells, rowWeight) {
  const N = W * H;
  const { offsets, list } = groupPixels(cellOf, nCells);
  const cells = [];
  const pairLen = new Map();
  for (let i = 0; i < nCells; i++) {
    const px = list.slice(offsets[i], offsets[i + 1]);
    const cx = circularMeanX(px, W, Math.max(1, Math.floor(px.length / 3000)));
    let sumY = 0, area = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let j = 0; j < px.length; j++) {
      const p = px[j], x = p % W, y = (p - x) / W;
      sumY += y; area += rowWeight ? rowWeight[y] : 1;
      const ux = cx + wrapDx(x - cx, W);
      if (ux < minX) minX = ux; if (ux > maxX) maxX = ux;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const cy = px.length ? sumY / px.length : 0;
    // point d'ancrage = pixel de la cellule le plus proche du centre
    let ax = cx, ay = cy, bd = Infinity;
    for (let j = 0; j < px.length; j++) {
      const p = px[j], x = p % W, y = (p - x) / W;
      const dx = wrapDx(x - cx, W), dy = y - cy;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; ax = x; ay = y; }
    }
    // contours
    const edge = [], edgeNbr = [];
    let coastal = false;
    for (let j = 0; j < px.length; j++) {
      const p = px[j], x = p % W, row = p - x;
      const l = row + (x === 0 ? W - 1 : x - 1), r = row + (x === W - 1 ? 0 : x + 1);
      const u = row > 0 ? p - W : -2, d = row < N - W ? p + W : -2;
      let nb = -3; // -3 : intérieur
      for (const q of [l, r, u, d]) {
        if (q === -2) continue;
        const oc = cellOf[q];
        if (oc === i) continue;
        if (oc >= 0) { nb = oc; if (q === r || q === d) { const key = i * 65536 + oc; pairLen.set(key, (pairLen.get(key) || 0) + 1); } }
        else { coastal = true; if (nb === -3) nb = -1; }
      }
      if (nb !== -3) { edge.push(p); edgeNbr.push(nb); }
    }
    cells.push({
      id: i, px, n: px.length, area, cx, cy, ax, ay,
      x0: Math.floor(minX), x1: Math.ceil(maxX), y0: minY, y1: maxY,
      edge: Int32Array.from(edge), edgeNbr: Int32Array.from(edgeNbr),
      coastal, nbrs: [], border: {}, seas: [],
    });
  }
  for (const [key, len] of pairLen) {
    const a = Math.floor(key / 65536), b = key % 65536;
    const A = cells[a], B = cells[b];
    A.border[b] = (A.border[b] || 0) + len;
    B.border[a] = (B.border[a] || 0) + len;
  }
  for (const c of cells) c.nbrs = Object.keys(c.border).map(Number);
  return cells;
}

/**
 * Parcours en largeur de l'eau : profondeur (distance à la côte) et routes maritimes
 * entre cellules côtières. Garantit un graphe connexe (algorithme de Kruskal).
 */
export function computeWater(W, H, cellOf, cells, maxLinkDist) {
  const N = W * H;
  const dist = new Uint16Array(N).fill(65535);
  const lab = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  const cand = new Map();
  const addCand = (a, b, len) => {
    if (a === b) return;
    const key = a < b ? a * 65536 + b : b * 65536 + a;
    const prev = cand.get(key);
    if (prev === undefined || len < prev) cand.set(key, len);
  };
  for (let p = 0; p < N; p++) {
    if (cellOf[p] >= 0) continue;
    const x = p % W, row = p - x;
    const nbs = [row + (x === 0 ? W - 1 : x - 1), row + (x === W - 1 ? 0 : x + 1), row > 0 ? p - W : -1, row < N - W ? p + W : -1];
    for (const q of nbs) {
      if (q >= 0 && cellOf[q] >= 0) {
        if (lab[p] === -1) { lab[p] = cellOf[q]; dist[p] = 1; queue[qt++] = p; }
        else addCand(lab[p], cellOf[q], 1);
      }
    }
  }
  while (qh < qt) {
    const u = queue[qh++];
    const x = u % W, row = u - x;
    const lu = lab[u], du = dist[u];
    const nbs0 = row + (x === 0 ? W - 1 : x - 1), nbs1 = row + (x === W - 1 ? 0 : x + 1);
    const nbs2 = row > 0 ? u - W : -1, nbs3 = row < N - W ? u + W : -1;
    for (let j = 0; j < 4; j++) {
      const v = j === 0 ? nbs0 : j === 1 ? nbs1 : j === 2 ? nbs2 : nbs3;
      if (v < 0 || cellOf[v] >= 0) continue;
      if (lab[v] === -1) { lab[v] = lu; dist[v] = du + 1; queue[qt++] = v; }
      else if (lab[v] !== lu) addCand(lu, lab[v], du + dist[v]);
    }
  }

  // Union-find sur le graphe terrestre
  const parent = new Int32Array(cells.length).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) { parent[a] = b; return true; } return false; };
  for (const c of cells) for (const nb of c.nbrs) unite(c.id, nb);

  const list = [];
  for (const [key, len] of cand) {
    const a = Math.floor(key / 65536), b = key % 65536;
    if (cells[a].border[b]) continue;
    list.push([a, b, len]);
  }
  list.sort((p, q) => p[2] - q[2]);
  const links = [];
  for (const [a, b, len] of list) {
    if (len <= maxLinkDist) { links.push([a, b, len]); unite(a, b); }
  }
  for (const [a, b, len] of list) {
    if (len > maxLinkDist && unite(a, b)) links.push([a, b, len]);
  }
  for (const [a, b, len] of links) {
    cells[a].seas.push({ to: b, len });
    cells[b].seas.push({ to: a, len });
  }
  return { dist, links };
}

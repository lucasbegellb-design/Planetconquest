// Attribution de couleurs distinctes aux pays (coloration gloutonne du graphe des voisins).
import { hslToRgb, hexToRgb, colorDist } from '../core/util.js';

export function makePalette(rng, count) {
  const out = [];
  let h = rng.next();
  for (let i = 0; i < count; i++) {
    h = (h + 0.618033988749895) % 1;
    const s = 0.42 + rng.next() * 0.38;
    const l = 0.4 + rng.next() * 0.22;
    out.push(hslToRgb(h, s, l));
  }
  return out;
}

/**
 * @param n nombre de pays
 * @param neighbors tableau de Set d'indices voisins
 * @param fixed Map index -> '#hex' pour les couleurs imposées
 */
export function assignColors(n, neighbors, rng, fixed = new Map()) {
  const colors = new Array(n).fill(null);
  for (const [i, hex] of fixed) colors[i] = hexToRgb(hex);
  const palette = makePalette(rng, Math.max(80, n * 2));
  const used = new Uint8Array(palette.length);
  const order = [...Array(n).keys()].sort((a, b) => neighbors[b].size - neighbors[a].size);
  for (const i of order) {
    if (colors[i]) continue;
    let best = -1, bestScore = -Infinity;
    for (let k = 0; k < palette.length; k++) {
      let minD = 1e9;
      for (const nb of neighbors[i]) {
        const c = colors[nb];
        if (c) { const d = colorDist(c, palette[k]); if (d < minD) minD = d; }
      }
      const score = Math.min(minD, 600) - (used[k] ? 250 : 0) + rng.next() * 20;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    used[best] = 1;
    colors[i] = palette[best].slice();
  }
  return colors;
}

export function randomCountryColor(rng, avoid = []) {
  let best = null, bestD = -1;
  for (let t = 0; t < 24; t++) {
    const c = hslToRgb(rng.next(), 0.45 + rng.next() * 0.35, 0.4 + rng.next() * 0.2);
    let minD = 1e9;
    for (const a of avoid) minD = Math.min(minD, colorDist(a, c));
    if (minD > bestD) { bestD = minD; best = c; }
  }
  return best;
}

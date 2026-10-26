// Test Node : génère une carte et écrit un aperçu PNG.
//   node tests/genmap.mjs earth
//   node tests/genmap.mjs proc <seed> <type>
import { readFileSync } from 'node:fs';
import { writePng } from './png.mjs';
import { generateEarth } from '../js/map/earth.js';
import { MapPainter } from '../js/map/paint.js';

const mode = process.argv[2] || 'earth';
const out = process.argv[5] || `/tmp/claude-0/map-${mode}.png`;
const t0 = performance.now();
let map;
if (mode === 'earth') {
  const topo = JSON.parse(readFileSync(new URL('../data/countries-110m.json', import.meta.url)));
  map = await generateEarth(topo, {}, async (p, msg) => console.log(`  ${(p * 100) | 0}% ${msg} ${(performance.now() - t0) | 0}ms`));
} else {
  const { generatePlanet } = await import('../js/map/procedural.js');
  map = await generatePlanet({ seed: process.argv[3] || 'abc', type: process.argv[4] || 'terran', nCountries: 30 },
    async (p, msg) => console.log(`  ${(p * 100) | 0}% ${msg} ${(performance.now() - t0) | 0}ms`));
}
console.log('time', (performance.now() - t0) | 0, 'ms', 'W', map.W, 'H', map.H);
console.log('cells', map.cells.length, 'countries', map.countries0.length, 'seaLinks', map.seaLinks.length);
const sizes = map.cells.map((c) => c.n).sort((a, b) => a - b);
console.log('cell px min/med/max', sizes[0], sizes[sizes.length >> 1], sizes[sizes.length - 1]);
const isolated = map.cells.filter((c) => c.nbrs.length === 0 && c.seas.length === 0).length;
console.log('isolated cells', isolated);
const big = [...map.countries0].sort((a, b) => b.cells.length - a.cells.length).slice(0, 12);
console.log(big.map((c) => `${c.name}:${c.cells.length}`).join(' '));
if (mode === 'earth') {
  for (const n of ['France', 'Belgique', 'Luxembourg', 'Royaume-Uni', 'Japon', 'Islande', 'Nouvelle-Zélande', 'Madagascar']) {
    const c = map.countries0.find((x) => x.name === n);
    console.log(n, c ? `${c.cells.length} cells, cap=${map.cells[c.capital].region}, seas=${c.cells.map((i) => map.cells[i].seas.length).join(',')}` : 'MISSING');
  }
}
const owner = new Int16Array(map.cells.length);
map.cells.forEach((c) => { owner[c.id] = c.initOwner; });
const painter = new MapPainter(map, map.palette || {});
painter.ownerOf = (id) => owner[id];
painter.colorOf = (o) => map.countries0[o].color;
painter.isNeutral = (o) => o < 0;
painter.paintAll();
writePng(out, map.W, map.H, painter.buf);
console.log('wrote', out);

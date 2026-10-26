// Joueur pacifique : économie + pactes, n'attaque jamais. Mesure la pression militaire de l'IA.
//   node tests/passive.mjs [difficulté] [minutes] [pays] [pactes 0/1]
import { readFileSync } from 'node:fs';
import { generateEarth } from '../js/map/earth.js';
import { Game } from '../js/sim/game.js';
import { governorTick, autoResearchTick } from '../js/sim/governor.js';

const diff = process.argv[2] || 'normal', minutes = +(process.argv[3] || 20), name = process.argv[4] || 'France';
const naps = process.argv[5] !== '0';
const topo = JSON.parse(readFileSync(new URL('../data/countries-110m.json', import.meta.url)));
const map = await generateEarth(topo, {});
const g = Game.create(map, { difficulty: diff, playerIndex: map.countries0.findIndex((c) => c.name === name), simSeed: +(process.env.SEED || 3) });
const id = g.playerId, P = g.countries[id];
let firstWar = null, wars = 0;
g.on('war', (w) => { if (w.b === id) { wars++; if (firstWar === null) firstWar = g.t; } });
const out = [];
for (let s = 1; s <= minutes * 60; s++) {
  if (s % 2 === 0) governorTick(g, id, 'equilibre', 2);
  autoResearchTick(g, id);
  for (const p of [...g.proposals]) if (p.to === id) g.answer(p.id, p.type !== 'alliance' || true, id);
  if (naps && s % 30 === 0) for (const n of g.neighborsOf(id)) if (n > 0 && !g.inTruce(id, n)) g.proposeNap(id, n);
  if (s % 20 === 0) for (const e of g.enemiesOf(id)) g.proposePeace(id, e);
  g.advance(1);
  if (g.over) { out.push(`MORT à ${(g.t / 60).toFixed(1)} min`); break; }
  if (s % 300 === 0) out.push(`${s / 60}m: ${g.cellsOf[id].size} terr., armée ${Math.round(P.army / 1000)}k/${Math.round(P.st.armyCap / 1000)}k`);
}
console.log(`${diff} ${name} pactes=${naps} | 1re guerre: ${firstWar === null ? 'aucune' : (firstWar / 60).toFixed(1) + ' min'} | guerres subies: ${wars} | ${out.join(' | ')}`);

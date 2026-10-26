// Équilibrage des planètes extraterrestres : node tests/space-sim.mjs <niveau> [minutes] [index planète]
import { generatePlanet } from '../js/map/procedural.js';
import { Game } from '../js/sim/game.js';
import { TECHS } from '../js/tech/techtree.js';
import { newMeta, describeSystem, planetSpec, planetInfo, PERKS } from '../js/space/progression.js';
import { botTick } from './bot.mjs';

const L = +(process.argv[2] || 1);
const minutes = +(process.argv[3] || 40);
const pi = +(process.argv[4] || 1);
const fakeP = { name: 'France', art: 'la', title: '', color: [58, 111, 216], techs: new Set(TECHS.map((t) => t.id)), repeat: {} };
const meta = newMeta({ name: 'Terre', type: 'earth', seed: 'equilibre' }, fakeP);
meta.level = L;
for (let i = 0; i < L - 1; i++) PERKS[i % 4].apply(meta);
const R = +(process.env.REP || 1);
meta.repeat = { orbital: Math.round(L * R), shields: Math.round(L * R), stellar: Math.floor((L * R) / 2), warp: Math.floor((L * R) / 2) };
const sys = describeSystem(meta);
const p = sys.planets.filter((x) => !x.home)[pi % (sys.planets.length - 1)];
const spec = planetSpec(meta, p);
const map = await generatePlanet(spec);
// atterrissage : la cellule neutre la plus « centrale » (beaucoup de voisins)
const cands = map.cells.filter((c) => c.initOwner < 0).sort((a, b) => b.nbrs.length - a.nbrs.length);
const landing = (cands[0] || map.cells[0]).id;
const g = Game.create(map, {
  difficulty: 'normal', planet: planetInfo(spec), landing, simSeed: 7,
  meta: { name: meta.name, art: meta.art, title: '', color: meta.color, techs: meta.techs, repeat: meta.repeat, perk: meta.perk, bonusGold: meta.bonusGold },
});
const P = g.countries[g.playerId];
console.log(`planet ${spec.name} (${spec.type}) L=${L} cells=${g.nCells} AI=${spec.nCountries} aiEra=${spec.aiEra} aiBonus=${spec.aiBonus.toFixed(2)}`);
console.log(`player start: cells=${g.cellsOf[g.playerId].size} army=${P.army | 0} atkQ=${g.atkQ(P).toFixed(2)}`);
const ais = g.countries.filter((c) => !c.neutral && !c.isPlayer).sort((a, b) => b.st.armyCap - a.st.armyCap);
console.log(`top AI: ${ais.slice(0, 3).map((c) => `${c.name} army=${c.army | 0} atkQ=${g.atkQ(c).toFixed(2)} cells=${c.st.ncells}`).join(' | ')}`);
let done = null;
g.on('conquered', () => { done = g.t; });
for (let s = 0; s < minutes * 60 && !done && !g.over; s++) {
  botTick(g);
  g.advance(1);
  if (s % 300 === 299) {
    const alive = g.countries.filter((c) => !c.neutral && c.alive).length;
    console.log(`t=${((s + 1) / 60) | 0}m P cells=${g.cellsOf[g.playerId].size}/${g.nCells} army=${(P.army / 1000) | 0}k alive=${alive}`);
  }
}
console.log(done ? `CONQUERED at ${(done / 60).toFixed(1)} min` : g.over ? `DEFEAT at ${(g.t / 60).toFixed(1)} min` : 'timeout');
if (process.argv.includes('news')) for (const n of g.news.filter((x) => x.player)) console.log(`  [${(n.t | 0)}s] ${n.text}`);

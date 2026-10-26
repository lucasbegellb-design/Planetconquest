// Test rapide (CI) : génération des cartes, quelques minutes de simulation, sauvegarde/restauration.
import { readFileSync } from 'node:fs';
import { generateEarth } from '../js/map/earth.js';
import { generatePlanet } from '../js/map/procedural.js';
import { Game } from '../js/sim/game.js';
import { governorTick } from '../js/sim/governor.js';
import { botTick } from './bot.mjs';

const fail = (m) => { console.error('ÉCHEC :', m); process.exit(1); };
const topo = JSON.parse(readFileSync(new URL('../data/countries-110m.json', import.meta.url)));
const earth = await generateEarth(topo, {});
if (earth.cells.length < 400 || earth.cells.some((c) => !c.nbrs.length && !c.seas.length)) fail('carte Terre');
const g = Game.create(earth, { playerIndex: earth.countries0.findIndex((c) => c.name === 'France'), simSeed: 1 });
for (let s = 0; s < 240; s++) { botTick(g); if (s % 2 === 0) governorTick(g, g.playerId, 'equilibre', 2); g.advance(1); }
if (g.cellsOf[g.playerId].size <= 4) fail('le bot ne progresse pas');
if (!g.hist.frames.length) fail('historique vide');
const g2 = Game.restore(earth, {}, JSON.parse(JSON.stringify(g.serialize())));
if (g2.cellsOf[g2.playerId].size !== g.cellsOf[g.playerId].size) fail('restauration');
const planet = await generatePlanet({ seed: 'ci', type: 'ocean', nCountries: 12, targetCells: 300 });
if (planet.cells.length < 200 || planet.countries0.length !== 12) fail('planète procédurale');
console.log(`OK — Terre ${earth.cells.length} territoires, France ${g.cellsOf[g.playerId].size} après 4 min, planète ${planet.cells.length}`);

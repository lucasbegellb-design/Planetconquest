// Simulation headless : node tests/sim.mjs [minutes] [pays joueur] [bot] [difficulté]
import { readFileSync } from 'node:fs';
import { generateEarth } from '../js/map/earth.js';
import { Game } from '../js/sim/game.js';
import { botTick } from './bot.mjs';

const minutes = +(process.argv[2] || 10);
const playerName = process.argv[3] || 'France';
const useBot = process.argv[4] === 'bot';
const difficulty = process.argv[5] || 'normal';
const quiet = process.argv.includes('quiet');
const topo = JSON.parse(readFileSync(new URL('../data/countries-110m.json', import.meta.url)));
const map = await generateEarth(topo, {});
const pIdx = map.countries0.findIndex((c) => c.name === playerName);
const g = Game.create(map, { difficulty, playerIndex: pIdx, simSeed: +(process.env.SEED || 12345) });
const P = g.countries[g.playerId];
console.log('player', P.name, 'cells', g.cellsOf[g.playerId].size, 'army', P.army | 0, 'cap', P.st.armyCap | 0, 'income', P.st.income.toFixed(2), 'rp', P.st.rp.toFixed(2));
let lastNews = 0;
const t0 = performance.now();
let conqueredAt = null;
g.on('conquered', () => { conqueredAt = g.t; });
for (let s = 0; s < minutes * 60; s++) {
  if (useBot) botTick(g);
  g.advance(1);
  if (g.over) { console.log('GAME OVER', g.over, 'at', (g.t / 60).toFixed(1), 'min'); break; }
  if (conqueredAt) { console.log('CONQUERED at', (conqueredAt / 60).toFixed(1), 'min'); break; }
  if (s % 60 === 59) {
    const alive = g.countries.filter((c) => !c.neutral && c.alive);
    const top = [...alive].sort((a, b) => b.st.ncells - a.st.ncells).slice(0, 6);
    console.log(`t=${(g.t / 60).toFixed(0)}m alive=${alive.length} offs=${g.offensives.length} wars=${g.wars.size} allies=${g.alliances.size} | ` +
      top.map((c) => `${c.name}:${c.st.ncells}/e${c.era}`).join(' ') +
      ` | P cells=${g.cellsOf[g.playerId].size} army=${(P.army / 1000) | 0}k gold=${P.gold | 0} rp=${P.st.rp.toFixed(1)} era=${P.era} techs=${P.techs.size}`);
    if (!quiet) {
      const imp = g.news.slice(lastNews).filter((n) => n.imp || n.player).slice(-6);
      for (const n of imp) console.log('   ', n.text);
      lastNews = g.news.length;
    }
  }
}
console.log('sim time', ((performance.now() - t0) / 1000).toFixed(1), 's for', (g.t / 60).toFixed(1), 'game min');
const json = JSON.stringify(g.serialize());
console.log('save size', (json.length / 1024).toFixed(0), 'KB');
const g2 = Game.restore(map, { difficulty }, JSON.parse(json));
console.log('restore ok', g2.countries.length, g2.cellsOf[g2.playerId].size);

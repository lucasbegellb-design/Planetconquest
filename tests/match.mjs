// Partie chronométrée multijoueur sans réseau : 4 bots en 2 équipes, objectifs, score, fin de partie.
// Usage : node tests/match.mjs [minutes] [ffa]
import { readFileSync } from 'node:fs';
import { generateEarth } from '../js/map/earth.js';
import { Game } from '../js/sim/game.js';
import { governorTick } from '../js/sim/governor.js';
import { setupMatch, teamRanking, sameTeam } from '../js/sim/match.js';
import { botTick } from './bot.mjs';

const minutes = +(process.argv[2] || 10), ffa = process.argv[3] === 'ffa';
const fail = (m) => { console.error('ÉCHEC :', m); process.exit(1); };
const topo = JSON.parse(readFileSync(new URL('../data/countries-110m.json', import.meta.url)));
const earth = await generateEarth(topo, {});
const k = (n) => earth.countries0.findIndex((c) => c.name === n);
const picks = ['France', 'Allemagne', 'Espagne', 'Italie'].map(k);
const g = Game.create(earth, { playerIndex: picks[0], humans: picks.slice(1), simSeed: 3, match: { duration: minutes * 60 } });
const ids = picks.map((p) => g.humanIdOf(p));
const names = Object.fromEntries(ids.map((id, i) => [id, ['Alice', 'Bob', 'Chloé', 'Dan'][i]]));
setupMatch(g, names, ffa ? null : { [ids[0]]: 0, [ids[1]]: 0, [ids[2]]: 1, [ids[3]]: 1 });
let end = null;
g.on('matchEnd', (e) => { end = e; });
for (let s = 0; s < minutes * 60 + 5 && !end; s++) {
  for (const id of ids) {
    g.playerId = id;
    botTick(g);
    if (s % 2 === 0) governorTick(g, id, 'equilibre', 2);
  }
  g.playerId = ids[0];
  g.advance(1);
  if (!ffa && (g.atWar(ids[0], ids[1]) || !g.allied(ids[2], ids[3]) && g.countries[ids[2]].alive && g.countries[ids[3]].alive)) fail('coéquipiers en guerre ou alliance rompue');
}
if (!end) fail('pas de fin de partie');
const r = end.ranking.filter((x) => names[x.id]);
for (const x of r) console.log(`${names[x.id].padEnd(6)} ${x.name.padEnd(10)} terr. ${String(x.cells).padStart(3)} + bonus ${String(x.bonus).padStart(2)} = ${x.score}${x.alive ? '' : ' 💀'}`);
console.log('objectifs :', JSON.stringify(Object.fromEntries(Object.entries(g.match.done).map(([o, id]) => [o, names[id]]))));
if (!ffa) {
  const t = teamRanking(g, end.ranking);
  console.log('équipes :', t.map((x) => `${x.team}: ${x.score}`).join(' / '));
  if (!sameTeam(g, ids[0], ids[1]) || sameTeam(g, ids[0], ids[2])) fail('équipes');
}
if (!Object.keys(g.match.done).length) fail('aucun objectif attribué');
console.log(`OK — fin « ${end.reason} » à ${(g.t / 60).toFixed(1)} min`);

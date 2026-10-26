// Événements aléatoires : révoltes, épidémies, ruées vers l'or, catastrophes propres à chaque planète…
import { Art, art, en, cap, v } from '../core/fr.js';
import { fmtInt, fmtBig } from '../core/util.js';
import { NB } from '../tech/buildings.js';
import { NameGen } from '../map/names.js';
import { randomCountryColor } from '../map/colors.js';
import { B } from '../map/biomes.js';

const DISASTERS = {
  seisme: { icon: '🌋', label: 'Séisme', pop: 0.15, damage: 0.5 },
  inondation: { icon: '🌊', label: 'Inondations', pop: 0.08, noGrowth: 30 },
  ouragan: { icon: '🌀', label: 'Ouragan', pop: 0.1, damage: 0.25 },
  tempete_sable: { icon: '🏜️', label: 'Tempête de sable', pop: 0.03, temp: ['speed', -0.4, 25] },
  canicule: { icon: '☀️', label: 'Canicule', pop: 0.06, temp: ['morale', -8, 40] },
  tsunami: { icon: '🌊', label: 'Tsunami', pop: 0.15, coastal: true, damage: 0.4 },
  maree: { icon: '🌊', label: 'Grande marée', pop: 0.05, coastal: true, noGrowth: 30 },
  blizzard: { icon: '❄️', label: 'Blizzard', pop: 0.03, temp: ['speed', -0.5, 25] },
  avalanche: { icon: '🏔️', label: 'Avalanche', pop: 0.1, damage: 0.3 },
  eruption: { icon: '🌋', label: 'Éruption volcanique', pop: 0.25, damage: 0.7 },
  pluie_cendres: { icon: '🌫️', label: 'Pluie de cendres', pop: 0.04, temp: ['research', -0.3, 30] },
  cyclone: { icon: '🌀', label: 'Cyclone géant', pop: 0.06, temp: ['speed', -0.4, 25] },
  foudre: { icon: '⚡', label: 'Tempête de foudre', pop: 0.04, damage: 0.5 },
  turbulences: { icon: '💨', label: 'Turbulences', pop: 0.02, temp: ['def', -0.2, 25] },
  epidemie_exotique: { icon: '🦠', label: 'Fièvre de la jungle', pop: 0.1, noGrowth: 25 },
  meteorites: { icon: '☄️', label: 'Pluie de météorites', pop: 0.12, damage: 0.5 },
};

const EVENTS = [
  { id: 'revolt', w: 1.1 },
  { id: 'epidemic', w: 0.9 },
  { id: 'goldrush', w: 1 },
  { id: 'disaster', w: 1.4 },
  { id: 'discovery', w: 0.8 },
  { id: 'goldenage', w: 0.6 },
];

export function eventsTick(g, dt) {
  if (g.t < g.nextEvent) return;
  g.nextEvent = g.t + 14 + g.rng.next() * 18;
  const alive = g.countries.filter((c) => !c.neutral && c.alive);
  if (!alive.length) return;
  const ev = g.rng.weighted(EVENTS, (e) => e.w);
  const handlers = { revolt, epidemic, goldrush, disaster, discovery, goldenage };
  handlers[ev.id](g, alive);
}

function pickTarget(g, alive, weightFn) {
  return g.rng.weighted(alive, (c) => weightFn(c) * (c.isPlayer ? 2.5 : 1));
}
const shout = (g, c) => g.involvesPlayer(c.id) || g.notable(c.id);

function revolt(g, alive) {
  // pas de révolte en début de partie ni dans les petits pays ; le joueur est épargné les 5 premières minutes
  const cands = alive.filter((c) => c.st.ncells >= 6 && g.t > 90 && !(c.isPlayer && g.t < 300));
  if (!cands.length) return;
  const D = pickTarget(g, cands, (c) => {
    let u = 0;
    for (const cell of g.cellsOf[c.id]) u += g.unrest[cell];
    return (u + 0.2) * (1.6 - c.morale / 100) * (c.isPlayer ? 0.6 : 1);
  });
  // foyer : territoire le plus agité (hors capitale)
  let seed = -1, best = -1;
  for (const cell of g.cellsOf[D.id]) {
    if (cell === D.capital) continue;
    const s = g.unrest[cell] * 2 + g.rng.next() + (g.map.cells[cell].initOwner !== g.map.cells[D.capital]?.initOwner ? 0.8 : 0);
    if (s > best) { best = s; seed = cell; }
  }
  if (seed < 0) return;
  const size = 1 + Math.floor(g.rng.next() * Math.min(4, D.st.ncells / 6));
  const group = [seed], seen = new Set(group);
  for (let i = 0; i < group.length && group.length < size; i++) {
    for (const nb of g.map.cells[group[i]].nbrs) {
      if (!seen.has(nb) && g.owner[nb] === D.id && nb !== D.capital && group.length < size) { seen.add(nb); group.push(nb); }
    }
  }
  // Ancien pays ressuscité si possible, sinon nouveau pays
  const orig = g.map.cells[seed].initOwner;
  let R = null, revived = false;
  if (orig >= 0) {
    const src = g.map.countries0[orig];
    R = g.countries.find((c) => !c.neutral && !c.alive && c.name === src.name);
    if (R) { revived = true; R.alive = true; }
  }
  if (!R) {
    let name, artv, title;
    if (g.map.kind === 'earth') {
      name = D.name + ' libre'; artv = D.art; title = 'Gouvernement provisoire';
    } else {
      const nm = new NameGen(g.rng, g.planet.type).country();
      name = nm.name; artv = nm.art; title = 'République';
    }
    const color = randomCountryColor(g.rng, g.countries.filter((c) => c.alive).map((c) => c.color));
    R = g._addCountry({ name, art: artv, title, color, capital: seed });
    g.landN.push(new Map()); g.seaN.push(new Map());
  }
  R.techs = new Set(D.techs); R.repeat = { ...D.repeat };
  g._refreshTech(R, true);
  R.capital = seed; R.morale = 75; R.gold = 30; R.peakCells = group.length;
  R.ai.next = 3;
  let mil = 0;
  for (const cell of group) mil += g.militia(cell);
  R.army = mil * 3;
  for (const cell of group) g.capture(cell, R.id, -1, 0);
  g.wars.set(D.id < R.id ? D.id * 4096 + R.id : R.id * 4096 + D.id, { a: R.id, b: D.id, since: g.t });
  g.computeBorders();
  if (shout(g, D)) {
    const msg = revived
      ? `🔥 Révolte ${en(D)} : ${art(R)} ${v(R, 'renaît de ses', 'renaissent de leurs')} cendres !`
      : `🔥 Révolte ${en(D)} : ${art(R)} ${v(R, 'proclame son', 'proclament leur')} indépendance !`;
    g.say(msg, 'revolt', { player: D.isPlayer, imp: D.isPlayer || revived });
  }
  g.emit('revolt', { id: R.id, from: D.id });
}

function epidemic(g, alive) {
  const D = pickTarget(g, alive, (c) => Math.sqrt(c.st.pop + 1));
  const sev = (0.07 + g.rng.next() * 0.08) * (D.mods.medicine ? 0.45 : 1);
  for (const cell of g.cellsOf[D.id]) g.pop[cell] *= 1 - sev;
  D.morale = Math.max(5, D.morale - 8);
  g.addTemp(D, 'noGrowth', 1, 25);
  if (shout(g, D)) g.say(`🦠 Épidémie ${en(D)} : la population chute de ${Math.round(sev * 100)} %.`, 'event', { player: D.isPlayer });
}

function goldrush(g, alive) {
  const D = pickTarget(g, alive, () => 1);
  const gain = Math.max(60, D.st.income * (35 + g.rng.next() * 45));
  D.gold += gain;
  if (shout(g, D)) g.say(`💰 Ruée vers l'or ${en(D)} ! (+${fmtInt(gain)} or)`, 'event', { player: D.isPlayer });
}

function discovery(g, alive) {
  const D = pickTarget(g, alive, () => 1);
  const gain = Math.max(25, D.st.rp * (35 + g.rng.next() * 30));
  D.rp += gain;
  if (shout(g, D)) g.say(`🔬 Découverte scientifique ${en(D)} ! (+${fmtInt(gain)} recherche)`, 'event', { player: D.isPlayer });
}

function goldenage(g, alive) {
  const D = pickTarget(g, alive, () => 1);
  D.morale = Math.min(100, D.morale + 15);
  g.addTemp(D, 'eco', 0.25, 60);
  g.addTemp(D, 'morale', 10, 60);
  if (shout(g, D)) g.say(`✨ Âge d'or ${en(D)} : prospérité et moral au beau fixe.`, 'event', { player: D.isPlayer });
}

function disaster(g, alive) {
  const list = (g.planet.events && g.planet.events.length) ? g.planet.events.slice() : ['seisme', 'inondation', 'ouragan'];
  if ((g.planet.level || 0) >= 2) list.push('meteorites');
  const id = list[Math.floor(g.rng.next() * list.length)];
  const def = DISASTERS[id] || DISASTERS.seisme;
  const D = pickTarget(g, alive, (c) => Math.sqrt(c.st.ncells));
  let cells = [...g.cellsOf[D.id]];
  if (def.coastal) cells = cells.filter((c) => g.map.cells[c].coastal);
  if (id === 'avalanche') { const m = cells.filter((c) => g.map.cells[c].terrain === B.MOUNTAIN); if (m.length) cells = m; }
  if (!cells.length) return;
  const center = cells[Math.floor(g.rng.next() * cells.length)];
  const zone = [center, ...g.map.cells[center].nbrs.filter((nb) => g.owner[nb] === D.id)].slice(0, 4);
  let lost = 0;
  for (const cell of zone) {
    const l = g.pop[cell] * def.pop * (cell === center ? 1 : 0.5);
    g.pop[cell] -= l; lost += l;
    if (def.damage) for (let k = 0; k < NB; k++) {
      const i = cell * NB + k;
      if (g.build[i] && g.rng.chance(def.damage * (cell === center ? 1 : 0.4))) g.build[i]--;
    }
  }
  if (def.noGrowth) g.addTemp(D, 'noGrowth', 1, def.noGrowth);
  if (def.temp) g.addTemp(D, def.temp[0], def.temp[1], def.temp[2]);
  g.emit('disaster', { id, cell: center, country: D.id });
  if (shout(g, D)) {
    const where = g.map.cells[center].region ? ` (${g.map.cells[center].region})` : '';
    const victims = lost >= 0.01 ? ` — ${fmtBig(lost * 1e6)} victimes` : '';
    g.say(`${def.icon} ${def.label} ${en(D)}${where}${victims}.`, 'event', { player: D.isPlayer });
  }
}

export { DISASTERS, cap };

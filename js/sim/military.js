// Affaires militaires : généraux, arme atomique, saisons et crises mondiales.
import { Art, art, de, v } from '../core/fr.js';
import { NB } from '../tech/buildings.js';
import { hasRes, wondersOf } from './empire.js';

// ---------- généraux ----------
const GEN_NAMES = ['Aurelian', 'Bayard', 'Castellan', 'Dumas', 'Erwin', 'Faidherbe', 'Galland', 'Hannon', 'Iskandar', 'Jomini', 'Kutuzov', 'Lannes',
  'Masséna', 'Nakamura', 'Okonkwo', 'Pélissier', 'Quintus', 'Radetzky', 'Saxe', 'Tamerlan', 'Ulric', 'Valdés', 'Wolfe', 'Xénon', 'Yamato', 'Zhukov',
  'Arminius', 'Bélisaire', 'Cid', 'Davout', 'Esteban', 'Fabius', 'Grant', 'Hoche', 'Ibarra', 'Joukov', 'Kléber', 'Leclerc', 'Murat', 'Ney', 'Ord', 'Patton'];
export const GEN_MAX = 3, GEN_LVL = 5;
export const genBonus = (gen) => (gen ? { atk: 0.025 * gen.lvl, speed: 0.02 * gen.lvl } : { atk: 0, speed: 0 });

export function generalOf(g, o) {
  if (!o.gen) return null;
  return (g.countries[o.a].generals || []).find((x) => x.id === o.gen) || null;
}
export function assignGeneral(g, o) {
  const A = g.countries[o.a];
  const free = (A.generals || []).filter((x) => !x.off).sort((a, b) => b.lvl - a.lvl);
  if (!free.length) return;
  free[0].off = o.id;
  o.gen = free[0].id;
}
// réaffecter un général (commande du joueur) ; offId = 0 pour le mettre en réserve
export function moveGeneral(g, id, genId, offId) {
  const A = g.countries[id], gen = (A.generals || []).find((x) => x.id === genId);
  if (!gen) return { ok: false, msg: 'Général introuvable' };
  const o = offId ? g.offensives.find((x) => x.id === offId && x.a === id) : null;
  if (offId && !o) return { ok: false, msg: 'Offensive introuvable' };
  const old = gen.off && g.offensives.find((x) => x.id === gen.off);
  if (old) old.gen = 0;
  if (o && o.gen) { const prev = generalOf(g, o); if (prev) prev.off = 0; }
  gen.off = o ? o.id : 0;
  if (o) o.gen = gen.id;
  return { ok: true, msg: o ? `${gen.name} prend la tête de l’offensive` : `${gen.name} rejoint l’état-major` };
}
export function generalEnd(g, o, reason) {
  const gen = generalOf(g, o);
  if (!gen) return;
  gen.off = 0;
  const A = g.countries[o.a];
  if (reason === 'exhausted' && o.captured === 0 && g.rng.chance(0.3)) {
    A.generals = A.generals.filter((x) => x !== gen);
    if (A.isPlayer || g.notable(A.id)) g.say(`⚰️ Le général ${gen.name} ${de(A)} est tombé au combat.`, 'war', { player: A.isPlayer, to: A.isPlayer ? A.id : undefined });
    return;
  }
  gen.xp += o.captured;
  while (gen.lvl < GEN_LVL && gen.xp >= 10 * gen.lvl) {
    gen.xp -= 10 * gen.lvl;
    gen.lvl++;
    if (A.isPlayer) g.say(`🎖️ Le général ${gen.name} gagne en expérience (${'★'.repeat(gen.lvl)}).`, 'info', { player: true, to: A.id });
  }
}
// les victoires font naître des généraux
export function militaryCapture(g, a, d) {
  const A = g.countries[a];
  if (A.neutral || g.countries[d].neutral && g.rng.chance(0.5)) return;
  A.feats = (A.feats || 0) + 1;
  const gens = A.generals || (A.generals = []);
  if (gens.length >= GEN_MAX || A.feats < 15 * (gens.length + 1)) return;
  A.feats = 0;
  A.genSeq = (A.genSeq || 0) + 1;
  const gen = { id: A.genSeq, name: g.rng.pick(GEN_NAMES), lvl: 1, xp: 0, off: 0 };
  gens.push(gen);
  if (A.isPlayer) g.say(`🎖️ Vos victoires révèlent un nouveau général : ${gen.name}. Il mènera votre prochaine offensive.`, 'info', { player: true, imp: true, to: a });
}

// ---------- arme atomique ----------
export const NUKE_MAX = 3;
export const nukeCost = (g, c) => (wondersOf(g, c.id).some((w) => w.id === 'manhattan') ? 900 : 1800);
export function canBuildNuke(g, id) {
  const c = g.countries[id];
  const manhattan = wondersOf(g, id).some((w) => w.id === 'manhattan');
  if (c.era < 3) return { ok: false, msg: 'Époque moderne requise' };
  if (!manhattan && !hasRes(c, 'uranium')) return { ok: false, msg: 'Il faut de l’uranium (ou le Projet Manhattan)' };
  if ((c.nukes || 0) >= NUKE_MAX) return { ok: false, msg: `Arsenal plein (${NUKE_MAX})` };
  const cost = nukeCost(g, c);
  if (c.gold < cost) return { ok: false, msg: `Il faut ${cost} or` };
  return { ok: true, cost };
}
export function buildNuke(g, id) {
  const r = canBuildNuke(g, id);
  if (!r.ok) return r;
  const c = g.countries[id];
  c.gold -= r.cost;
  c.nukes = (c.nukes || 0) + 1;
  return { ok: true, msg: '☢️ Bombe atomique prête' };
}
export function nuke(g, a, cell) {
  const A = g.countries[a], d = g.owner[cell], D = g.countries[d];
  if (!(A.nukes > 0)) return { ok: false, msg: 'Aucune bombe atomique' };
  if (!D || D.neutral || !g.atWar(a, d)) return { ok: false, msg: 'Cible : un pays avec lequel vous êtes en guerre' };
  A.nukes--;
  const cells = g.map.cells;
  const hit = (i, f) => {
    g.pop[i] *= 1 - 0.75 * f;
    g.base[i] *= 1 - 0.3 * f;
    g.unrest[i] = Math.max(g.unrest[i], f);
    for (let k = 0; k < NB; k++) if (f >= 1 || g.rng.chance(f)) g.build[i * NB + k] = 0;
  };
  hit(cell, 1);
  for (const nb of cells[cell].nbrs) hit(nb, 0.35);
  D.army *= 0.75;
  D.morale = Math.max(5, D.morale - 25);
  for (const o of g.offensives) if (o.d === d && o.cur === cell) o.troops *= 0.5;
  g.say(`☢️ ${Art(A)} ${v(A, 'lance', 'lancent')} une bombe atomique sur ${art(D)} ! Le monde entier est horrifié.`, 'war', { imp: true, player: g.involvesPlayer(a, d), cell });
  // indignation mondiale : relations effondrées, coalition des voisins
  let joined = 0;
  for (const c of g.countries) {
    if (c.neutral || !c.alive || c.id === a) continue;
    g.addRel(a, c.id, c.id === d ? -100 : -35);
    if (c.isPlayer || g.allied(a, c.id) || g.atWar(a, c.id) || joined >= 4) continue;
    const near = g.landN[a] && (g.landN[a].has(c.id) || (g.seaN[a] && g.seaN[a].has(c.id)));
    if (near && g.power(c) > 0.25 * g.power(A) && g.rng.chance(0.55)) { g.declareWar(c.id, a); joined++; }
  }
  g.lastNuke = g.t;
  g.emit('nuke', { a, d, cell });
  return { ok: true, msg: '☢️ Frappe atomique effectuée' };
}

// ---------- saisons ----------
export const YEAR = 240;
export const SEASONS = [
  { name: 'Printemps', icon: '🌱' }, { name: 'Été', icon: '☀️' }, { name: 'Automne', icon: '🍂' }, { name: 'Hiver', icon: '❄️' },
];
// saison de l'hémisphère nord
export const seasonOf = (g) => Math.floor((g.t % YEAR) / (YEAR / 4));
export function latOf(g, cell) {
  return 90 - (g.map.cells[cell].cy / g.map.H) * 180;
}
// hiver : hautes latitudes de l'hémisphère concerné (plus large pendant un âge glaciaire)
export function climateAt(g, cell) {
  const s = seasonOf(g), lat = latOf(g, cell), ice = g.crisis && g.crisis.id === 'ice' && g.crisis.until > g.t;
  const lim = ice ? 22 : 38;
  if ((s === 3 && lat > lim) || (s === 1 && lat < -lim) || (ice && Math.abs(lat) > 50)) return 'winter';
  if (s === 1 && Math.abs(lat) < 18 && !ice) return 'monsoon';
  return null;
}
// effet sur une offensive qui attaque ce territoire
export function climateF(g, cell) {
  if (g.planet.type === 'gas') return { atk: 1, speed: 1 };
  const c = climateAt(g, cell);
  return c === 'winter' ? { atk: 0.9, speed: 0.65 } : c === 'monsoon' ? { atk: 1, speed: 0.8 } : { atk: 1, speed: 1 };
}

// ---------- crises mondiales ----------
export const CRISES = {
  pandemic: { icon: '🦠', name: 'Pandémie mondiale', dur: 90, desc: 'croissance stoppée, population en baisse' },
  crash: { icon: '📉', name: 'Krach boursier mondial', dur: 120, desc: '−30 % d’or partout' },
  ice: { icon: '🧊', name: 'Petit âge glaciaire', dur: 160, desc: 'hivers plus longs et plus étendus, croissance ralentie' },
  renaissance: { icon: '✨', name: 'Renaissance mondiale', dur: 120, desc: '+25 % de recherche partout' },
};
function startCrisis(g, id) {
  const C = CRISES[id];
  g.crisis = { id, until: g.t + C.dur };
  for (const c of g.countries) {
    if (c.neutral || !c.alive) continue;
    if (id === 'pandemic') { g.addTemp(c, 'noGrowth', 1, C.dur); g.addTemp(c, 'morale', -6, C.dur); }
    else if (id === 'crash') g.addTemp(c, 'eco', -0.3, C.dur);
    else if (id === 'ice') g.addTemp(c, 'growth', -0.3, C.dur);
    else if (id === 'renaissance') g.addTemp(c, 'research', 0.25, C.dur);
  }
  if (id === 'pandemic') for (let i = 0; i < g.nCells; i++) g.pop[i] *= 0.95;
  g.say(`${C.icon} ${C.name} : ${C.desc} pendant ${Math.round(C.dur / 60 * 10) / 10} min.`, 'event', { imp: true, player: true });
  g.emit('crisis', g.crisis);
}

export function militaryTick(g, dt) {
  if (g.nextCrisis === undefined) g.nextCrisis = 480 + g.rng.next() * 240;
  if (g.t >= g.nextCrisis) {
    g.nextCrisis = g.t + 540 + g.rng.next() * 300;
    const ids = Object.keys(CRISES).filter((k) => k !== 'pandemic' || !g.countries[g.playerId]?.mods.medicine);
    startCrisis(g, g.rng.pick(ids));
  }
  if (g.crisis && g.crisis.until <= g.t) {
    g.say(`${CRISES[g.crisis.id].icon} Fin de la crise : ${CRISES[g.crisis.id].name.toLowerCase()}.`, 'event', { player: true });
    g.crisis = null;
  }
  // changement de saison
  const s = seasonOf(g);
  if (g.season !== undefined && s !== g.season && (s === 3 || s === 1)) {
    g.say(s === 3 ? '❄️ L’hiver tombe sur l’hémisphère nord : les offensives y ralentissent.' : '❄️ L’hiver austral commence ; la mousson balaie les tropiques.', 'event', { player: true });
  }
  g.season = s;
}

// ---------- IA ----------
export function aiMilitary(g, c) {
  // arsenal atomique : surtout les bellicistes, quand l'or abonde
  if (c.era >= 3 && !c.nukes && !c.nuked && c.gold > 4000 && (c.ai.style === 'belliciste' || g.rng.chance(0.2)) && canBuildNuke(g, c.id).ok) buildNuke(g, c.id);
  // tabou atomique : au plus une frappe d'IA toutes les 5 minutes sur la planète, une seule par pays
  if (!(c.nukes > 0) || c.nuked || g.t - (g.lastNuke ?? -1e9) < 300) return;
  // frappe : uniquement en mauvaise posture face à un ennemi bien plus fort
  for (const e of g.enemiesOf(c.id)) {
    const E = g.countries[e];
    if (!E.alive || E.neutral || g.power(E) < 1.6 * g.power(c) || !g.rng.chance(0.15)) continue;
    const target = E.capital >= 0 ? E.capital : [...g.cellsOf[e]][0];
    if (target >= 0) { nuke(g, c.id, target); c.nuked = true; return; }
  }
}

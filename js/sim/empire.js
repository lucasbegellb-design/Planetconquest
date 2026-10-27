// Gestion de l'empire : ressources stratégiques, merveilles (uniques sur la planète) et formes de gouvernement.
// Tout passe par les modificateurs du pays (c.mods), recalculés à chaque pas d'économie.
import { TECH_BY_ID, ERAS } from '../tech/techtree.js';
import { Art, v } from '../core/fr.js';

// ---------- ressources ----------
// w : poids par biome (index de BIOMES), rare : rareté relative
export const RESOURCES = [
  { id: 'horses', name: 'Chevaux', icon: '🐎', fx: { speed: 0.06, atk: 0.03 }, desc: '+6 % de vitesse, +3 % d’attaque', w: { 0: 3, 8: 4, 7: 2 }, rare: 1 },
  { id: 'iron', name: 'Fer', icon: '⛓️', fx: { atk: 0.04, def: 0.04 }, desc: '+4 % d’attaque, +4 % de défense', w: { 5: 4, 1: 1, 4: 2, 9: 2 }, rare: 1 },
  { id: 'gems', name: 'Pierres précieuses', icon: '💎', fx: { eco: 0.1 }, desc: '+10 % d’or', w: { 2: 3, 5: 1, 9: 2, 13: 2, 7: 1 }, rare: 0.8 },
  { id: 'oil', name: 'Pétrole', icon: '🛢️', era: 2, fx: { atk: 0.06, speed: 0.08, prod: 0.1 }, desc: 'Dès l’ère industrielle : +6 % d’attaque, +8 % de vitesse, +10 % de production. Indispensable aux Blindés et à l’Aviation', w: { 3: 4, 11: 4, 4: 2, 12: 1, 8: 1 }, rare: 1 },
  { id: 'uranium', name: 'Uranium', icon: '☢️', era: 3, fx: { research: 0.06 }, desc: 'Dès l’ère moderne : +6 % de recherche. Indispensable à la bombe atomique et à la Fusion', w: { 5: 2, 3: 1, 4: 1, 9: 1 }, rare: 0.45 },
];
export const RI = Object.fromEntries(RESOURCES.map((r, i) => [r.id, i]));
export const NR = RESOURCES.length;
// technologies dont l'effet est réduit de moitié sans la ressource
const NEEDS = { tanks: 'oil', aviation: 'oil', fusion: 'uranium' };
export const techNeeds = (id) => NEEDS[id];

export function placeResources(g) {
  const cells = g.map.cells, r = g.rng;
  g.res.fill(-1);
  for (let i = 0; i < cells.length; i++) {
    if (!r.chance(0.11)) continue;
    const t = cells[i].terrain;
    const opts = RESOURCES.map((x, k) => [k, (x.w[t] || 0) * x.rare]).filter((x) => x[1] > 0);
    if (opts.length) g.res[i] = r.weighted(opts, (x) => x[1])[0];
  }
}
export const hasRes = (c, rid) => !!(c.resN && c.resN[RI[rid]] > 0);

// ---------- merveilles ----------
const WCOST = [350, 700, 1300, 2400, 4000], WTIME = [60, 75, 90, 105, 120];
export const WONDERS = [
  { id: 'pyramids', era: 0, name: 'Pyramides', icon: '🔺', fx: { prod: 0.15, growth: 0.1 }, desc: '+15 % de production, +10 % de croissance' },
  { id: 'wall', era: 0, name: 'Grande Muraille', icon: '🧱', fx: { def: 0.15 }, desc: '+15 % de défense' },
  { id: 'library', era: 0, name: 'Bibliothèque d’Alexandrie', icon: '📜', fx: { research: 0.15 }, desc: '+15 % de recherche' },
  { id: 'machu', era: 1, name: 'Machu Picchu', icon: '🏔️', fx: { eco: 0.15 }, desc: '+15 % d’or' },
  { id: 'forbidden', era: 1, name: 'Cité interdite', icon: '🏯', fx: { manpower: 0.15, morale: 6 }, desc: '+15 % de soldats max, +6 de moral' },
  { id: 'liberty', era: 2, name: 'Statue de la Liberté', icon: '🗽', fx: { growth: 0.15, eco: 0.08 }, desc: '+15 % de croissance, +8 % d’or' },
  { id: 'eiffel', era: 2, name: 'Tour Eiffel', icon: '🗼', fx: { eco: 0.12, research: 0.05 }, desc: '+12 % d’or, +5 % de recherche' },
  { id: 'manhattan', era: 3, name: 'Projet Manhattan', icon: '☢️', fx: { atk: 0.05 }, desc: 'Bombes atomiques à moitié prix, même sans uranium, +5 % d’attaque' },
  { id: 'internet', era: 3, name: 'Internet', icon: '🌐', fx: { research: 0.2 }, desc: '+20 % de recherche' },
  { id: 'elevator', era: 4, name: 'Ascenseur spatial', icon: '🛰️', fx: { prod: 0.25, speed: 0.1 }, desc: '+25 % de production, +10 % de vitesse' },
].map((w) => ({ ...w, cost: WCOST[w.era], time: WTIME[w.era] }));
export const WONDER_BY_ID = Object.fromEntries(WONDERS.map((w) => [w.id, w]));

export const wonderOwner = (g, wid) => (g.wonders[wid] ? g.owner[g.wonders[wid].cell] : -1);
export const wondersOf = (g, id) => WONDERS.filter((w) => g.wonders[w.id] && g.owner[g.wonders[w.id].cell] === id);

export function canWonder(g, id, wid) {
  const c = g.countries[id], w = WONDER_BY_ID[wid];
  if (!w || !c || !c.alive) return { ok: false, msg: 'Merveille inconnue' };
  if (g.wonders[wid]) return { ok: false, msg: 'Déjà construite' };
  if (c.era < w.era) return { ok: false, msg: `Époque ${ERAS[w.era].adj} requise` };
  if (c.job) return { ok: false, msg: 'Un chantier est déjà en cours' };
  if (c.gold < w.cost) return { ok: false, msg: `Il faut ${w.cost} or` };
  return { ok: true };
}
export function startWonder(g, id, wid) {
  const r = canWonder(g, id, wid);
  if (!r.ok) return r;
  const c = g.countries[id], w = WONDER_BY_ID[wid];
  c.gold -= w.cost;
  c.job = { wid, left: w.time, paid: w.cost };
  if (c.isPlayer) g.say(`🏗️ Chantier lancé : ${w.icon} ${w.name} (${w.time} s).`, 'info', { player: true, to: id });
  return { ok: true, msg: `Chantier lancé : ${w.name}` };
}

function wonderTick(g, dt) {
  for (const c of g.countries) {
    const j = c.job;
    if (!j) continue;
    if (!c.alive) { c.job = null; continue; }
    const w = WONDER_BY_ID[j.wid];
    if (g.wonders[j.wid]) {
      // un autre pays l'a achevée avant nous
      c.gold += j.paid * 0.5;
      c.job = null;
      if (c.isPlayer) g.say(`🏚️ Chantier abandonné : ${w.name} a été achevé ailleurs. La moitié de l’or est récupérée.`, 'info', { player: true, to: c.id });
      continue;
    }
    j.left -= dt * (1 + 0.5 * (c.mods.prod || 0));
    if (j.left > 0) continue;
    c.job = null;
    g.wonders[j.wid] = { cell: c.capital >= 0 ? c.capital : [...g.cellsOf[c.id]][0], t: g.t };
    g.say(`${w.icon} ${Art(c)} ${v(c, 'achève', 'achèvent')} la merveille « ${w.name} » !`, 'era', { imp: true, player: c.isPlayer });
    g.emit('wonder', { id: c.id, wid: j.wid });
  }
}

// appelé par g.capture : une merveille change de mains avec son territoire
export function wonderCaptured(g, cell, a, d) {
  for (const w of WONDERS) {
    const s = g.wonders[w.id];
    if (s && s.cell === cell) {
      const A = g.countries[a];
      g.say(`${w.icon} ${Art(A)} ${v(A, "s'empare", "s'emparent")} de la merveille « ${w.name} » !`, 'capture', { imp: true, player: g.involvesPlayer(a, d) });
    }
  }
}

// ---------- gouvernements ----------
export const GOVS = [
  { id: 'tribe', era: 0, name: 'Chefferie', icon: '🪶', fx: {}, desc: 'Aucun effet particulier.' },
  { id: 'monarchy', era: 0, name: 'Monarchie', icon: '👑', fx: { manpower: 0.1, morale: 4, research: -0.05 }, desc: '+10 % de soldats, +4 de moral, −5 % de recherche' },
  { id: 'republic', era: 1, name: 'République', icon: '🏛️', fx: { eco: 0.15, research: 0.1, manpower: -0.1 }, weary: 1, desc: '+15 % d’or, +10 % de recherche, −10 % de soldats ; les guerres pèsent sur le moral' },
  { id: 'theocracy', era: 1, name: 'Théocratie', icon: '⛪', fx: { morale: 10, def: 0.05, research: -0.15 }, desc: '+10 de moral, +5 % de défense, −15 % de recherche' },
  { id: 'dictatorship', era: 2, name: 'Dictature', icon: '🎖️', fx: { atk: 0.12, manpower: 0.2, recruit: 0.2, eco: -0.15 }, feared: 1, desc: '+12 % d’attaque, +20 % de soldats et de recrutement, −15 % d’or ; inquiète les voisins' },
  { id: 'communism', era: 3, name: 'Communisme', icon: '⚒️', fx: { prod: 0.3, manpower: 0.15, research: 0.05, eco: -0.1 }, desc: '+30 % de production, +15 % de soldats, +5 % de recherche, −10 % d’or' },
  { id: 'democracy', era: 3, name: 'Démocratie', icon: '🗳️', fx: { eco: 0.2, research: 0.15, atk: -0.05 }, weary: 1, trusted: 1, desc: '+20 % d’or, +15 % de recherche, −5 % d’attaque ; les voisins vous font confiance, les guerres pèsent sur le moral' },
  { id: 'technocracy', era: 4, name: 'Technocratie', icon: '🤖', fx: { research: 0.3, prod: 0.1, manpower: -0.15 }, desc: '+30 % de recherche, +10 % de production, −15 % de soldats' },
];
export const GOV_BY_ID = Object.fromEntries(GOVS.map((x) => [x.id, x]));
export const GOV_ANARCHY = 30, GOV_COOL = 180;
// préférences de l'IA selon sa personnalité (du plus au moins voulu)
const AI_GOVS = {
  pacifique: ['technocracy', 'democracy', 'theocracy', 'monarchy'],
  marchand: ['technocracy', 'democracy', 'republic', 'monarchy'],
  expansionniste: ['communism', 'dictatorship', 'monarchy'],
  belliciste: ['dictatorship', 'communism', 'monarchy'],
};

export function canGov(g, id, gid) {
  const c = g.countries[id], G = GOV_BY_ID[gid];
  if (!G || !c) return { ok: false, msg: 'Gouvernement inconnu' };
  if (c.gov === gid) return { ok: false, msg: 'C’est déjà votre gouvernement' };
  if (c.era < G.era) return { ok: false, msg: `Époque ${ERAS[G.era].adj} requise` };
  const left = Math.ceil((c.govT || -1e9) + GOV_COOL - g.t);
  if (left > 0) return { ok: false, msg: `Changement possible dans ${left} s` };
  return { ok: true };
}
export function setGov(g, id, gid) {
  const r = canGov(g, id, gid);
  if (!r.ok) return r;
  const c = g.countries[id], G = GOV_BY_ID[gid];
  c.gov = gid;
  c.govT = g.t;
  const first = c.govT0 === undefined; // le premier choix (Chefferie → …) se fait sans anarchie
  c.govT0 = g.t;
  if (!first) { g.addTemp(c, 'eco', -0.5, GOV_ANARCHY); g.addTemp(c, 'research', -0.5, GOV_ANARCHY); g.addTemp(c, 'morale', -12, GOV_ANARCHY); }
  if (c.isPlayer || g.notable(id)) g.say(`${G.icon} ${Art(c)} ${v(c, 'adopte', 'adoptent')} la ${G.name.toLowerCase()}${first ? '' : ' (période de transition)'}.`, 'info', { player: c.isPlayer });
  return { ok: true, msg: `${G.name} adoptée${first ? '' : ' : 30 s de transition'}` };
}

// ---------- modificateurs ----------
// Ajoute à c.mods (déjà rempli par les technologies) les effets du gouvernement, des merveilles et des ressources
export function structMods(g, c) {
  const m = c.mods;
  const add = (fx, f = 1) => { for (const k in fx) m[k] = (m[k] || 0) + fx[k] * f; };
  m.morale = m.morale || 0;
  add((GOV_BY_ID[c.gov] || GOV_BY_ID.tribe).fx);
  for (const w of WONDERS) { const s = g.wonders[w.id]; if (s && g.owner[s.cell] === c.id) add(w.fx); }
  const n = c.resN;
  if (n) {
    let extra = 0;
    RESOURCES.forEach((r, i) => {
      if (!n[i] || (r.era && c.era < r.era)) return;
      add(r.fx);
      extra += Math.min(4, n[i] - 1);
    });
    m.eco += 0.01 * extra; // surplus échangé
  }
  if (g.tradeN) m.eco += 0.06 * g.tradeN[c.id]; // accords commerciaux
  for (const tid in NEEDS) if (c.techs.has(tid) && !hasRes(c, NEEDS[tid])) add(TECH_BY_ID[tid].fx, -0.5);
}

// ---------- pas de temps ----------
export function empireTick(g, dt) {
  wonderTick(g, dt);
  // effets diplomatiques des gouvernements (toutes les secondes environ)
  g.govAcc = (g.govAcc || 0) + dt;
  if (g.govAcc < 1) return;
  const s = g.govAcc;
  g.govAcc = 0;
  for (const c of g.countries) {
    if (c.neutral || !c.alive || !g.landN[c.id]) continue;
    const G = GOV_BY_ID[c.gov];
    if (!G || (!G.feared && !G.trusted)) continue;
    for (const n of g.landN[c.id].keys()) {
      if (n <= 0 || g.atWar(c.id, n)) continue;
      g.addRel(c.id, n, (G.trusted ? 0.04 : -0.04) * s);
    }
  }
}

// ---------- IA ----------
export function aiEmpire(g, c) {
  const pref = AI_GOVS[c.ai.style] || AI_GOVS.expansionniste;
  // gouvernement : le premier disponible dans l'ordre de préférence
  const want = pref.find((gid) => c.era >= GOV_BY_ID[gid].era);
  if (want && want !== c.gov && g.t > 60 && canGov(g, c.id, want).ok && g.rng.chance(c.govT0 === undefined ? 0.08 : 0.2)) setGov(g, c.id, want);
  // merveille : si l'or le permet largement (surtout les marchands et pacifiques)
  if (!c.job) {
    const keen = c.ai.style === 'marchand' || c.ai.style === 'pacifique' ? 1.3 : 2;
    const rivals = (wid) => g.countries.filter((o) => o.job && o.job.wid === wid).length;
    const w = WONDERS.find((x) => !g.wonders[x.id] && c.era >= x.era && c.gold > x.cost * keen && rivals(x.id) < 2);
    if (w && g.rng.chance(0.25)) startWonder(g, c.id, w.id);
  }
}

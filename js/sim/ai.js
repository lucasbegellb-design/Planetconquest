// Intelligence artificielle des pays : simple mais crédible.
//  - cible les voisins faibles (ou déjà en guerre), garde des réserves si menacée
//  - fait la paix quand la guerre s'enlise, capitule quand tout est perdu
//  - cherche des alliés face à un voisin trop puissant, trahit parfois
import { TECHS, REPEATABLES, canResearch, repeatCost } from '../tech/techtree.js';
import { BUILDINGS, BI, NB, buildCost } from '../tech/buildings.js';
import { clamp } from '../core/util.js';
import { BAL } from './balance.js';

const pairKey = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a);

export function aiTick(g, dt) {
  for (const c of g.countries) {
    if (c.neutral || c.isPlayer || !c.alive) continue;
    c.ai.next -= dt;
    if (c.ai.next > 0) continue;
    c.ai.next = (5 + g.rng.next() * 4) * g.diff.think;
    think(g, c);
    if (!c.alive || g.over) return;
  }
}

export function aiResearch(g, c) {
  for (let k = 0; k < 2; k++) {
    const avail = TECHS.filter((t) => canResearch(c.techs, c.era, t));
    if (!avail.length) {
      if (c.era < 4) return;
      const r = REPEATABLES[Math.floor(g.rng.next() * REPEATABLES.length)];
      if (c.rp >= repeatCost(r, c.repeat[r.id] || 0)) g.researchRepeat(c.id, r.id);
      return;
    }
    avail.sort((a, b) => a.cost - b.cost);
    const pick = avail[Math.min(avail.length - 1, Math.floor(g.rng.next() * 2))];
    if (c.rp < pick.cost) return;
    g.research(c.id, pick.id);
  }
}

function avgMilitia(g, n) {
  const st = n.st;
  return st.ncells > 0 ? (st.pop / st.ncells) * BAL.MILITIA : 0;
}

function think(g, c) {
  const r = g.rng;
  aiBuild(g, c);
  if (aiDiplomacy(g, c)) return;

  const st = c.st;
  const myOffs = g.offensives.filter((o) => o.a === c.id);
  let threat = 0;
  for (const o of g.offensives) if (o.d === c.id) threat += o.troops * g.atkQ(g.countries[o.a]);
  const maxOff = 1 + Math.floor(st.ncells / 30);
  const reserve = (threat / Math.max(0.1, g.defQ(c))) * 0.6;
  const avail = c.army - reserve;
  if (myOffs.length >= maxOff || c.army < st.armyCap * 0.5 || avail < c.army * 0.4 || g.t < c.ai.cool) return;

  // une IA en paix n'ouvre un nouveau conflit que de temps en temps
  const wantsWar = g.warCount(c.id) === 0 ? r.chance(BAL.AI_WAR_CHANCE * c.ai.aggr * g.diff.aggr) : r.chance(0.5);
  const grace = g.t < BAL.AI_GRACE || !wantsWar;
  const playerShare = g.playerId >= 0 ? g.cellsOf[g.playerId].size / g.nCells : 0;
  const playerGrace = g.t < (BAL.AI_GRACE * 1.6 + (g.planet.level > 0 ? 150 : 0)) / g.diff.aggr;
  let best = -1, bestS = 0;
  for (const nid of g.neighborsOf(c.id)) {
    const n = g.countries[nid];
    if (!n.neutral && !n.alive) continue;
    if (g.allied(c.id, nid) || g.inTruce(c.id, nid)) continue;
    if (myOffs.some((o) => o.d === nid)) continue;
    const atWar = g.atWar(c.id, nid);
    if (!n.neutral && !atWar && (grace || (n.isPlayer && playerGrace))) continue;
    if (!n.neutral && atWar && !wantsWar && r.chance(0.5)) continue;
    let defense;
    if (n.neutral) {
      const f = g.findFront(c.id, 0, -1);
      if (!f) continue;
      defense = g.militia(f.cur) * g.defQ(n) * g.map.cells[f.cur].def;
    } else defense = (n.army * 0.7 + avgMilitia(g, n)) * g.defQ(n);
    const mine = avail * 0.55 * g.atkQ(c);
    let s = (mine / Math.max(1, defense)) * c.ai.aggr * g.diff.aggr;
    if (n.isPlayer) s *= g.diff.playerBias * (1 + 1.5 * Math.max(0, playerShare - 0.25));
    if (atWar) s *= 1.35;
    else if (!n.neutral) {
      s *= Math.max(0.3, 1 - g.rel(c.id, nid) / 120);
      s /= 1 + g.warCount(c.id) * 0.7;
      if (g.warCount(nid) > 0) s *= 1.2;
    }
    if (n.neutral) s *= 1.25;
    if (!(g.landN[c.id] && g.landN[c.id].has(nid))) s *= 0.7;
    if (s > bestS) { bestS = s; best = nid; }
  }
  const threshold = 2.1;
  if (best >= 0 && bestS > threshold) {
    const frac = clamp(0.4 + 0.12 * (bestS - threshold), 0.4, 0.8) * (avail / c.army);
    let target = -1;
    const n = g.countries[best];
    if (!n.neutral && r.chance(0.5)) target = n.capital;
    const res = g.launch(c.id, best, frac, target);
    if (res.ok) c.ai.cool = g.t + 25 + r.next() * 35;
  }
}

function aiDiplomacy(g, c) {
  const r = g.rng;
  for (const e of g.enemiesOf(c.id)) {
    const E = g.countries[e];
    const w = g.wars.get(pairKey(c.id, e));
    if (!w) continue;
    const dur = g.t - w.since;
    const pc = g.power(c), pe = g.power(E);
    const attacked = g.offensives.some((o) => o.a === e && o.d === c.id);
    // capitulation (plus probable quand l'ennemi domine déjà la planète)
    const share = g.cellsOf[e].size / g.nCells;
    const lim = share > 0.7 ? 0.4 : 0.2;
    if (attacked && c.st.ncells <= Math.max(2, c.peakCells * (share > 0.7 ? 0.6 : 0.35)) && pc < pe * lim && r.chance(0.12)) {
      g.surrender(c.id, e);
      return true;
    }
    if (dur < 45) continue;
    const active = attacked || g.offensives.some((o) => o.a === c.id && o.d === e);
    if ((!active && r.chance(0.25)) || (attacked && pc < pe * 0.6 && r.chance(0.12))) {
      if (E.isPlayer) g.propose('peace', c.id);
      else if (acceptPeace(g, e, c.id)) g.makePeace(c.id, e);
    }
  }
  // recherche d'alliés face à une menace (coalition contre un joueur trop dominant)
  const share = g.playerId >= 0 ? g.cellsOf[g.playerId].size / g.nCells : 0;
  if (r.chance(0.12 + Math.max(0, share - 0.2)) && g.alliesOf(c.id).length < 2) {
    let strong = -1, sp = g.power(c) * 1.5;
    const nb = g.neighborsOf(c.id);
    for (const id of nb) {
      const n = g.countries[id];
      if (n.neutral || !n.alive || g.allied(c.id, id)) continue;
      const p = g.power(n);
      if (p > sp) { sp = p; strong = id; }
    }
    if (strong >= 0) {
      const cand = new Set([...nb, ...g.neighborsOf(strong)]);
      for (const y of cand) {
        const Y = g.countries[y];
        if (y === c.id || y === strong || Y.neutral || !Y.alive) continue;
        if (g.atWar(c.id, y) || g.allied(c.id, y) || g.allied(y, strong) || g.rel(c.id, y) < -15) continue;
        if (Y.isPlayer) { if (r.chance(0.35)) g.propose('alliance', c.id); }
        else if (acceptAlliance(g, y, c.id)) g.makeAlliance(c.id, y);
        break;
      }
    }
  }
  // trahison opportuniste
  if (c.ai.aggr > 1.1 && r.chance(0.03)) {
    for (const ally of g.alliesOf(c.id)) {
      const A = g.countries[ally];
      if (g.power(A) < g.power(c) * 0.3 && g.landN[c.id]?.has(ally)) { g.breakAlliance(c.id, ally); break; }
    }
  }
  return false;
}

function aiBuild(g, c) {
  if (c.gold < 45) return;
  if (g.warCount(c.id) > 0 && c.gold > 400 + c.st.income * 60 && c.army < c.st.armyCap * 1.1) {
    g.hireMercenaries(c.id, Math.min(c.gold * 0.4, (c.st.armyCap * 1.15 - c.army) * g.mercInfo(c.id).price));
  }
  const r = g.rng;
  const cells = [...g.cellsOf[c.id]];
  if (!cells.length) return;
  const threatened = g.offensives.some((o) => o.d === c.id);
  const opts = [
    ['farm', 1.2], ['mine', 1.3], ['barracks', threatened ? 2.2 : 0.7], ['university', 1.1],
    ['factory', 1.4], ['port', 0.5],
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    const cell = cells[Math.floor(r.next() * cells.length)];
    const pick = r.weighted(opts, (o) => o[1])[0];
    const res = g.canBuild(c.id, cell, pick);
    if (res.ok && res.cost < c.gold * 0.7) { g.buildIn(c.id, cell, pick); return; }
  }
}

export function acceptPeace(g, who, from) {
  const W = g.countries[who], F = g.countries[from];
  if (W.isPlayer) return false;
  const w = g.wars.get(pairKey(who, from));
  const dur = w ? g.t - w.since : 0;
  const pw = g.power(W), pf = g.power(F);
  const winning = g.offensives.some((o) => o.a === who && o.d === from && (o.ratio || 0) > 1.2);
  if (winning && pw > pf * 1.2) return g.rng.chance(0.06);
  const p = 0.2 + Math.min(0.4, dur / 400) + (pw < pf ? 0.3 : 0) + (W.morale < 40 ? 0.2 : 0);
  return g.rng.chance(p);
}

export function acceptAlliance(g, who, from) {
  const W = g.countries[who];
  if (W.isPlayer || g.atWar(who, from) || g.alliesOf(who).length >= 3) return false;
  const eW = new Set(g.enemiesOf(who));
  const common = g.enemiesOf(from).some((e) => eW.has(e));
  let p = 0.12 + g.rel(who, from) / 150 + (common ? 0.4 : 0);
  if (g.power(g.countries[from]) > g.power(W) * 1.5) p += 0.15;
  return g.rng.chance(clamp(p, 0, 0.9));
}

export function acceptSurrender(g, who, from) {
  const W = g.countries[who];
  if (W.isPlayer) return false;
  const pw = g.power(W), pf = g.power(g.countries[from]);
  const lost = 1 - W.st.ncells / Math.max(1, W.peakCells);
  const attacked = g.offensives.some((o) => o.a === from && o.d === who);
  const share = g.cellsOf[from].size / g.nCells;
  let p = (pw < pf * 0.2 ? 0.3 : 0) + (lost > 0.4 ? 0.3 : 0) + (W.st.ncells <= 2 ? 0.15 : 0) + (W.morale < 30 ? 0.2 : 0);
  p += Math.max(0, share - 0.6) * 0.8;
  if (pw > pf * (share > 0.7 ? 0.6 : 0.4)) p -= 0.6;
  if (lost < 0.25) p -= 0.3;
  if (!attacked) p *= 0.4;
  return g.rng.chance(clamp(p, 0, 0.9));
}

// Partie chronométrée multijoueur : équipes, objectifs secondaires et score (territoires + bonus).
import { art } from '../core/fr.js';
const pairKey = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a); // comme game.js (évite un import circulaire)

// pts × unité (l'unité dépend de la taille de la carte : 2 sur la Terre)
export const OBJECTIVES = [
  { id: 'era1', icon: '🏰', name: 'Premier à l’époque médiévale', pts: 2, test: (g, c) => c.era >= 1 },
  { id: 'double', icon: '🗺️', name: 'Premier à doubler son territoire', pts: 2, test: (g, c) => g.cellsOf[c.id].size >= 2 * Math.max(3, g.match.start[c.id] || 0) },
  { id: 'capital', icon: '👑', name: 'Première capitale ennemie conquise', pts: 2 },
  { id: 'era2', icon: '🏭', name: 'Premier à l’époque industrielle', pts: 3, test: (g, c) => c.era >= 2 },
  { id: 'army', icon: '⚔️', name: 'Plus grande armée à la fin', pts: 3, end: (g, c) => c.army + g.offTroops(c.id) },
  { id: 'tech', icon: '🔬', name: 'Le plus de technologies à la fin', pts: 2, end: (g, c) => c.techs.size + Object.values(c.repeat).reduce((a, b) => a + b, 0) },
];
const OBJ = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));

const humans = (g) => Object.keys(g.match.names || {}).map(Number);

// teams : { idPays: 0|1 } ou null (chacun pour soi)
export function setupMatch(g, names, teams = null) {
  const m = g.match;
  m.names = names;
  m.teams = teams;
  m.unit = Math.max(1, Math.round(g.nCells / 200));
  m.done = {};
  m.start = {};
  for (const id of humans(g)) m.start[id] = g.cellsOf[id].size;
  if (teams) {
    const ids = humans(g);
    for (const a of ids) for (const b of ids) {
      if (a < b && teams[a] === teams[b]) {
        if (g.atWar(a, b)) g.makePeace(a, b, true);
        g.alliances.add(pairKey(a, b));
        g.addRel(a, b, 60);
      }
    }
  }
}

export const sameTeam = (g, a, b) => !!(g.match && g.match.teams && g.match.teams[a] !== undefined && g.match.teams[a] === g.match.teams[b]);
export const pointsOf = (g, id) => OBJ[id] ? OBJ[id].pts * (g.match.unit || 1) : 0;

export function bonusOf(g, cid) {
  let b = 0;
  for (const [oid, who] of Object.entries((g.match && g.match.done) || {})) if (who === cid) b += pointsOf(g, oid);
  return b;
}

function award(g, oid, cid) {
  const m = g.match;
  if (m.done[oid] !== undefined) return;
  m.done[oid] = cid;
  const o = OBJ[oid];
  g.say(`🎯 ${m.names[cid]} (${art(g.countries[cid])}) remporte l’objectif « ${o.name} » : +${pointsOf(g, oid)} points !`, 'info', { imp: true });
}

// Appelé chaque seconde par l'hôte
export function matchTick(g) {
  if (!g.match || !g.match.names || g.over) return;
  for (const o of OBJECTIVES) {
    if (!o.test || g.match.done[o.id] !== undefined) continue;
    const ok = humans(g).filter((id) => g.countries[id].alive && o.test(g, g.countries[id]));
    if (ok.length) award(g, o.id, ok.sort((a, b) => g.cellsOf[b].size - g.cellsOf[a].size)[0]);
  }
}

export function matchCapital(g, a, d) {
  if (g.match && g.match.names && g.match.names[a] && !sameTeam(g, a, d) && a !== d) award(g, 'capital', a);
}

export function finalAwards(g) {
  if (!g.match || !g.match.names) return;
  for (const o of OBJECTIVES) {
    if (!o.end || g.match.done[o.id] !== undefined) continue;
    const alive = humans(g).filter((id) => g.countries[id].alive);
    if (alive.length) award(g, o.id, alive.sort((a, b) => o.end(g, g.countries[b]) - o.end(g, g.countries[a]))[0]);
  }
}

// La partie s'arrête quand un seul joueur (ou une seule équipe) survit
export function matchDecided(g) {
  const alive = humans(g).filter((id) => g.countries[id].alive);
  if (g.match.teams) return new Set(alive.map((id) => g.match.teams[id])).size <= 1;
  return alive.length <= 1;
}

// Classement par équipe : somme des scores des membres
export function teamRanking(g, ranking) {
  if (!g.match || !g.match.teams) return null;
  const t = [0, 1].map((team) => ({ team, score: 0, members: [] }));
  for (const r of ranking) {
    const team = g.match.teams[r.id];
    if (team === undefined) continue;
    t[team].score += r.score;
    t[team].members.push(r.id);
  }
  return t.sort((a, b) => b.score - a.score);
}

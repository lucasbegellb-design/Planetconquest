// Méta-progression : systèmes, galaxies, difficulté croissante à l'infini, bonus persistants.
import { RNG } from '../core/rng.js';
import { PLANET_TYPES } from '../map/planetTypes.js';
import { starName, galaxyName, planetName } from '../map/names.js';

export const SYSTEMS_PER_GALAXY = 6;

export const PERKS = [
  { id: 'atk', icon: '⚔️', name: 'Doctrine offensive', desc: '+10 % d’attaque', apply: (m) => { m.perk.atk += 0.1; } },
  { id: 'def', icon: '🛡️', name: 'Boucliers ancestraux', desc: '+10 % de défense', apply: (m) => { m.perk.def += 0.1; } },
  { id: 'eco', icon: '💰', name: 'Héritage marchand', desc: '+15 % d’or', apply: (m) => { m.perk.eco += 0.15; } },
  { id: 'research', icon: '🔬', name: 'Archives galactiques', desc: '+15 % de recherche', apply: (m) => { m.perk.research += 0.15; } },
  { id: 'growth', icon: '🌱', name: 'Colons fertiles', desc: '+15 % de croissance démographique', apply: (m) => { m.perk.growth += 0.15; } },
  { id: 'manpower', icon: '🧬', name: 'Clones de combat', desc: '+15 % d’effectifs max', apply: (m) => { m.perk.manpower += 0.15; } },
  { id: 'speed', icon: '💨', name: 'Propulseurs tactiques', desc: '+10 % de vitesse des offensives', apply: (m) => { m.perk.speed += 0.1; } },
  { id: 'cells', icon: '🛸', name: 'Vaisseau-colonie élargi', desc: '+2 territoires au débarquement', apply: (m) => { m.perk.startCells += 2; } },
  { id: 'army', icon: '🎖️', name: 'Légion d’élite', desc: 'Armée de départ +50 %', apply: (m) => { m.perk.startArmy += 0.5; } },
  { id: 'gold', icon: '👑', name: 'Trésor impérial', desc: '+800 or au débarquement', apply: (m) => { m.bonusGold += 800; } },
];

export function newMeta(home, P) {
  return {
    level: 0, galaxy: 0, system: 0,
    homeName: home.name, homeType: home.type, seedBase: home.seed,
    name: P.name, art: P.art, title: P.title || '', color: P.color.slice(),
    techs: [...P.techs], repeat: { ...P.repeat },
    perk: { atk: 0, def: 0, eco: 0, research: 0, growth: 0, manpower: 0, speed: 0, recruit: 0, prod: 0, naval: 0, startCells: 0, startArmy: 0 },
    bonusGold: 0,
    conquered: {},   // clé "g-s-p" → { name, time }
    history: [],
    current: null,   // planète en cours { key, ... }
    perksTaken: [],
  };
}

const SOL = [
  { name: 'Mars', type: 'desert' }, { name: 'Vénus', type: 'volcanic' }, { name: 'Europe', type: 'glacial' },
  { name: 'Titan', type: 'ocean' }, { name: 'Jupiter', type: 'gas' }, { name: 'Ganymède', type: 'jungle' },
];
const ALIEN_TYPES = ['desert', 'ocean', 'glacial', 'volcanic', 'gas', 'jungle', 'terran'];

// Description déterministe d'un système stellaire
export function describeSystem(meta, gi = meta.galaxy, si = meta.system) {
  const rng = new RNG(`${meta.seedBase}-g${gi}-s${si}`);
  const isSol = gi === 0 && si === 0 && meta.homeType === 'earth';
  const name = isSol ? 'Système solaire' : gi === 0 && si === 0 ? 'Système de ' + meta.homeName : 'Système ' + starName(rng);
  const starColors = ['#ffd27a', '#ffb36b', '#fff1c4', '#9fc6ff', '#ff8a6b'];
  const star = { color: isSol ? '#ffd27a' : rng.pick(starColors), size: 26 + rng.next() * 16 };
  const n = isSol ? SOL.length : rng.int(4, 6);
  const planets = [];
  if (gi === 0 && si === 0) planets.push({ key: 'home', home: true, name: meta.homeName, type: meta.homeType === 'earth' ? 'terran' : meta.homeType, orbit: 0 });
  for (let i = 0; i < n; i++) {
    const type = isSol ? SOL[i].type : rng.pick(ALIEN_TYPES);
    planets.push({ key: `${gi}-${si}-${i}`, name: isSol ? SOL[i].name : planetName(rng, type), type, seed: `${meta.seedBase}-${gi}-${si}-${i}`, size: 0.85 + rng.next() * 0.4, ring: type === 'gas' || rng.chance(0.15) });
  }
  planets.forEach((p, i) => { p.orbit = i; p.phase = rng.next() * Math.PI * 2; p.speed = 0.08 / Math.sqrt(i + 1); });
  return { name, star, planets, galaxyName: galaxyName(gi, new RNG(`${meta.seedBase}-galaxy-${gi}`)) };
}

export function systemDone(meta, sys) {
  return sys.planets.every((p) => p.home || meta.conquered[p.key]);
}

// Paramètres de difficulté pour la prochaine planète
export function planetParams(meta, p) {
  const L = Math.max(1, meta.level);
  const gal = meta.galaxy;
  const T = PLANET_TYPES[p.type];
  const aiEra = Math.min(4, L + gal);
  return {
    L,
    targetCells: Math.min(900, Math.round((380 + 40 * L) * p.size)),
    nAI: Math.min(60, 12 + 3 * L + 5 * gal),
    aiEra,
    aiBonus: 1 + 0.1 * L + 0.25 * gal,      // économie et recherche des IA
    aiQuality: 1 + 0.05 * L + 0.12 * gal,   // qualité de leurs soldats
    stars: Math.min(5, 1 + Math.floor(L / 2)),
    typeName: T.name,
  };
}

export function planetSpec(meta, p) {
  const k = planetParams(meta, p);
  return {
    kind: 'proc', seed: p.seed, type: p.type, name: p.name,
    nCountries: k.nAI, targetCells: k.targetCells, neutralShare: 0.14,
    totalPop: 6000 * (1 + 0.15 * k.L), devRange: [Math.min(4, 1 + Math.floor(k.L / 3)), Math.min(5, 3 + Math.floor(k.L / 3))],
    level: k.L, aiEra: k.aiEra, aiBonus: k.aiBonus, aiQuality: k.aiQuality,
  };
}

export function planetInfo(spec) {
  const T = PLANET_TYPES[spec.type] || PLANET_TYPES.terran;
  return {
    name: spec.name, type: spec.type, level: spec.level || 0, rules: T.rules, events: T.events,
    aiBonus: spec.aiBonus || 1, aiQuality: spec.aiQuality || 1, aiEra: spec.aiEra || 0, neutralEra: Math.max(0, (spec.aiEra || 0) - 1),
  };
}

export function rollPerks(meta) {
  const rng = new RNG(`${meta.seedBase}-perks-${meta.level}`);
  return rng.shuffle(PERKS.slice()).slice(0, 3);
}

// Après la conquête d'une planète : enregistre la civilisation et avance dans la galaxie
export function recordConquest(meta, P, planetKey, planetName, time) {
  meta.techs = [...P.techs];
  meta.repeat = { ...P.repeat };
  meta.conquered[planetKey] = { name: planetName, time: Math.round(time) };
  meta.history.push({ name: planetName, time: Math.round(time), level: meta.level });
  meta.level++;
}

export function advanceSystem(meta) {
  meta.system++;
  if (meta.system >= SYSTEMS_PER_GALAXY) { meta.system = 0; meta.galaxy++; }
}

// Arbre technologique : 5 époques, 6 technologies chacune + technologies répétables (infinies).
export const ERAS = [
  { id: 0, name: 'Antiquité', adj: 'antique', mult: 1.0, color: '#d6a85a', unit: 'spear' },
  { id: 1, name: 'Médiéval', adj: 'médiévale', mult: 1.35, color: '#c0504d', unit: 'knight' },
  { id: 2, name: 'Industriel', adj: 'industrielle', mult: 1.85, color: '#b08850', unit: 'cannon' },
  { id: 3, name: 'Moderne', adj: 'moderne', mult: 2.6, color: '#4f8fd6', unit: 'tank' },
  { id: 4, name: 'Spatial', adj: 'spatiale', mult: 3.6, color: '#9a6cff', unit: 'mech' },
];
export const TECHS_TO_ADVANCE = 4;

// fx : atk, def, eco, growth, research, manpower, recruit, speed, prod, naval (réduction du malus naval)
export const TECHS = [
  { id: 'agriculture', era: 0, name: 'Agriculture', icon: '🌾', cost: 55, fx: { growth: 0.2 }, desc: '+20 % de croissance et de population max' },
  { id: 'bronze', era: 0, name: 'Travail du bronze', icon: '⚔️', cost: 60, fx: { atk: 0.12 }, desc: '+12 % d’attaque' },
  { id: 'writing', era: 0, name: 'Écriture', icon: '📜', cost: 60, fx: { research: 0.2 }, unlock: 'university', desc: '+20 % de recherche, débloque l’Université' },
  { id: 'navigation', era: 0, name: 'Navigation', icon: '⛵', cost: 70, fx: { naval: 0.0 }, unlock: 'port', navigation: true, desc: 'Permet les attaques navales, débloque le Port' },
  { id: 'masonry', era: 0, name: 'Maçonnerie', icon: '🧱', cost: 60, fx: { def: 0.15 }, desc: '+15 % de défense' },
  { id: 'currency', era: 0, name: 'Monnaie', icon: '🪙', cost: 65, fx: { eco: 0.15 }, desc: '+15 % d’or' },

  { id: 'feudalism', era: 1, name: 'Féodalité', icon: '🏰', cost: 190, fx: { manpower: 0.2 }, desc: '+20 % d’effectifs max' },
  { id: 'fortifications', era: 1, name: 'Fortifications', icon: '🛡️', cost: 200, fx: { def: 0.2 }, desc: '+20 % de défense' },
  { id: 'steel', era: 1, name: 'Acier', icon: '🗡️', cost: 210, fx: { atk: 0.15 }, desc: '+15 % d’attaque' },
  { id: 'scholastic', era: 1, name: 'Scolastique', icon: '🎓', cost: 190, fx: { research: 0.25 }, desc: '+25 % de recherche' },
  { id: 'banking', era: 1, name: 'Banque', icon: '🏦', cost: 200, fx: { eco: 0.2 }, desc: '+20 % d’or' },
  { id: 'cartography', era: 1, name: 'Cartographie', icon: '🧭', cost: 180, fx: { naval: 0.15, speed: 0.05 }, desc: 'Malus naval réduit, +5 % de vitesse' },

  { id: 'steam', era: 2, name: 'Machine à vapeur', icon: '🚂', cost: 470, fx: { prod: 0.25, eco: 0.05 }, unlock: 'factory', desc: '+25 % de production, débloque l’Usine' },
  { id: 'railways', era: 2, name: 'Chemin de fer', icon: '🛤️', cost: 500, fx: { speed: 0.25 }, desc: '+25 % de vitesse des offensives' },
  { id: 'artillery', era: 2, name: 'Artillerie', icon: '💣', cost: 520, fx: { atk: 0.25 }, desc: '+25 % d’attaque' },
  { id: 'medicine', era: 2, name: 'Médecine', icon: '💊', cost: 460, fx: { growth: 0.3 }, medicine: true, desc: '+30 % de croissance, épidémies atténuées' },
  { id: 'conscription', era: 2, name: 'Conscription', icon: '🎖️', cost: 490, fx: { manpower: 0.3, recruit: 0.3 }, desc: '+30 % d’effectifs et de recrutement' },
  { id: 'industry', era: 2, name: 'Industrialisation', icon: '🏭', cost: 480, fx: { eco: 0.25, prod: 0.15 }, desc: '+25 % d’or, +15 % de production' },

  { id: 'electricity', era: 3, name: 'Électricité', icon: '💡', cost: 1050, fx: { research: 0.3, prod: 0.1 }, desc: '+30 % de recherche' },
  { id: 'tanks', era: 3, name: 'Blindés', icon: '🛞', cost: 1150, fx: { atk: 0.3, speed: 0.15 }, desc: '+30 % d’attaque, +15 % de vitesse' },
  { id: 'aviation', era: 3, name: 'Aviation', icon: '✈️', cost: 1100, fx: { naval: 0.3, speed: 0.1 }, desc: 'Traversées maritimes facilitées, +10 % de vitesse' },
  { id: 'radar', era: 3, name: 'Radar', icon: '📡', cost: 1100, fx: { def: 0.3 }, desc: '+30 % de défense' },
  { id: 'computers', era: 3, name: 'Informatique', icon: '💻', cost: 1200, fx: { research: 0.35 }, desc: '+35 % de recherche' },
  { id: 'globalization', era: 3, name: 'Mondialisation', icon: '🌐', cost: 1100, fx: { eco: 0.3 }, desc: '+30 % d’or' },

  { id: 'rocketry', era: 4, name: 'Fusées', icon: '🚀', cost: 2100, fx: { prod: 0.15 }, unlock: 'spaceport', desc: 'Débloque le Spatioport' },
  { id: 'satellites', era: 4, name: 'Satellites', icon: '🛰️', cost: 2300, fx: { def: 0.3, research: 0.2 }, desc: '+30 % de défense, +20 % de recherche' },
  { id: 'lasers', era: 4, name: 'Armes laser', icon: '🔫', cost: 2500, fx: { atk: 0.4 }, desc: '+40 % d’attaque' },
  { id: 'fusion', era: 4, name: 'Fusion nucléaire', icon: '⚛️', cost: 2400, fx: { eco: 0.4, prod: 0.4 }, desc: '+40 % d’or et de production' },
  { id: 'ai', era: 4, name: 'Intelligence artificielle', icon: '🤖', cost: 2600, fx: { research: 0.4, speed: 0.2 }, desc: '+40 % de recherche, +20 % de vitesse' },
  { id: 'colonization', era: 4, name: 'Colonisation spatiale', icon: '🪐', cost: 2800, fx: { growth: 0.2 }, req: ['rocketry'], desc: 'Indispensable pour lancer la fusée' },
];

// Technologies répétables (époque spatiale) : coût × 1,35 à chaque niveau
export const REPEATABLES = [
  { id: 'orbital', name: 'Armement orbital', icon: '☄️', base: 3200, fx: { atk: 0.08 }, desc: '+8 % d’attaque par niveau' },
  { id: 'shields', name: 'Boucliers planétaires', icon: '🔰', base: 3200, fx: { def: 0.08 }, desc: '+8 % de défense par niveau' },
  { id: 'stellar', name: 'Économie stellaire', icon: '💫', base: 3000, fx: { eco: 0.1, research: 0.05 }, desc: '+10 % d’or, +5 % de recherche par niveau' },
  { id: 'warp', name: 'Logistique hyperspatiale', icon: '🌀', base: 3400, fx: { speed: 0.06, recruit: 0.08 }, desc: '+6 % de vitesse, +8 % de recrutement par niveau' },
];

export const TECH_BY_ID = Object.fromEntries(TECHS.map((t) => [t.id, t]));
export const REPEAT_BY_ID = Object.fromEntries(REPEATABLES.map((t) => [t.id, t]));

export const repeatCost = (r, lvl) => Math.round(r.base * Math.pow(1.35, lvl));

export function eraOf(techSet) {
  let era = 0;
  for (let e = 0; e < 4; e++) {
    let n = 0;
    for (const t of TECHS) if (t.era === e && techSet.has(t.id)) n++;
    if (n >= TECHS_TO_ADVANCE) era = e + 1; else break;
  }
  return era;
}

export function canResearch(techSet, era, t) {
  if (techSet.has(t.id) || t.era > era) return false;
  if (t.req && !t.req.every((r) => techSet.has(r))) return false;
  return true;
}

// Somme des effets des technologies (+ niveaux répétables)
export function techMods(techSet, repeat = {}) {
  const m = { atk: 0, def: 0, eco: 0, growth: 0, research: 0, manpower: 0, recruit: 0, speed: 0, prod: 0, naval: 0, navigation: false, medicine: false };
  for (const id of techSet) {
    const t = TECH_BY_ID[id];
    if (!t) continue;
    for (const k in t.fx) m[k] += t.fx[k];
    if (t.navigation) m.navigation = true;
    if (t.medicine) m.medicine = true;
  }
  for (const id in repeat) {
    const r = REPEAT_BY_ID[id];
    if (!r) continue;
    for (const k in r.fx) m[k] += r.fx[k] * repeat[id];
  }
  return m;
}

// Toutes les technologies des époques < era (pour les IA avancées des autres planètes)
export function techsBeforeEra(era, rng, extraInEra = 0) {
  const s = new Set();
  for (const t of TECHS) if (t.era < era) s.add(t.id);
  if (extraInEra > 0) {
    const pool = TECHS.filter((t) => t.era === era && !t.req);
    for (let i = 0; i < extraInEra && pool.length; i++) s.add(pool.splice(Math.floor(rng.next() * pool.length), 1)[0].id);
  }
  return s;
}

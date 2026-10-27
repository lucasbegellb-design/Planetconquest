// Constantes d'équilibrage (calibrées pour qu'une conquête de la Terre prenne ~20-40 min en x1).
export const BAL = {
  TICK: 0.1,            // pas de simulation (s de jeu)
  ECON_DT: 0.5,         // pas de l'économie
  K_GOLD: 0.06,         // or/s par (M hab × développement), avant rendements décroissants
  LAND_TAX: 0.1,        // or/s par territoire
  K_UPKEEP: 3.0e-6,     // or/s par soldat
  K_RESEARCH: 0.032,    // recherche/s par (M hab × développement), rendements très décroissants
  UNI_RP: 0.08,         // recherche/s par niveau d'université (en plus de +30 % local)
  K_PROD: 0.03,
  MANPOWER: 11000,      // effectifs max = MANPOWER × pop^0.85
  BARRACKS_CAP: 6000,
  RECRUIT: 0.009,       // fraction des effectifs max recrutée par seconde
  GROWTH: 0.004,        // croissance démographique /s
  MILITIA: 2000,        // miliciens par million d'habitants
  KILL: 0.03,           // létalité des combats
  CAPTURE_SPEED: 0.08,  // territoires/s à forces égales
  GARRISON: 0.07,       // part des troupes initiales laissée en garnison à chaque conquête
  AI_GRACE: 60,         // s de paix initiale entre pays (hors terres libres)
  AI_WAR_CHANCE: 0.06,  // probabilité qu'une IA en paix ouvre une nouvelle guerre à chaque réflexion
  UNREST_TIME: 150,     // s pour pacifier un territoire conquis
  ASSIMILATION: 0.7,    // rendement d'un territoire qui n'est pas « historique »
  DEV_F: [0, 0.55, 0.85, 1.2, 1.6, 2.0],
  MERC_COST: 0.004,     // or par mercenaire (plafond : 150 % des effectifs max)
  ROCKET_COST: 2500,
  ROCKET_WORK: 1600,
};

// grace : secondes de paix garanties pour les joueurs humains ; war : envie de guerre des IA ;
// styles : poids des personnalités [pacifique, marchand, expansionniste, belliciste]
export const DIFFICULTIES = {
  facile: { label: 'Facile', eco: 0.85, research: 0.9, aggr: 0.75, playerBias: 0.5, think: 1.3, quality: 0.95, grace: 360, war: 0.55, styles: [4, 3, 2, 1] },
  normal: { label: 'Normal', eco: 1, research: 1, aggr: 0.9, playerBias: 0.68, think: 1, quality: 1, grace: 240, war: 0.8, styles: [3, 3, 3, 1] },
  difficile: { label: 'Difficile', eco: 1.12, research: 1.1, aggr: 1.05, playerBias: 0.92, think: 0.9, quality: 1.07, grace: 150, war: 0.98, styles: [2, 2, 4, 2] },
  impossible: { label: 'Impossible', eco: 1.32, research: 1.25, aggr: 1.2, playerBias: 1.2, think: 0.75, quality: 1.1, grace: 100, war: 1.2, styles: [1, 1, 4, 4] },
};

// Personnalités des IA : agressivité et branche technologique préférée
export const AI_STYLES = [
  { id: 'pacifique', label: 'Pacifique', aggr: 0.45, tech: { pop: 2, eco: 1.5, mil: 0.7 } },
  { id: 'marchand', label: 'Marchand', aggr: 0.7, tech: { eco: 2, pop: 1.2, mil: 0.8 } },
  { id: 'expansionniste', label: 'Expansionniste', aggr: 1.0, tech: { mil: 1.3, eco: 1.1, pop: 1.1 } },
  { id: 'belliciste', label: 'Belliciste', aggr: 1.4, tech: { mil: 2, pop: 1, eco: 0.8 } },
];

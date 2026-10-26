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

export const DIFFICULTIES = {
  facile: { label: 'Facile', eco: 0.8, research: 0.85, aggr: 0.7, playerBias: 0.6, think: 1.3, quality: 0.95 },
  normal: { label: 'Normal', eco: 1, research: 1, aggr: 1, playerBias: 1, think: 1, quality: 1 },
  difficile: { label: 'Difficile', eco: 1.2, research: 1.15, aggr: 1.25, playerBias: 1.3, think: 0.85, quality: 1.05 },
  impossible: { label: 'Impossible', eco: 1.45, research: 1.35, aggr: 1.5, playerBias: 1.6, think: 0.7, quality: 1.12 },
};

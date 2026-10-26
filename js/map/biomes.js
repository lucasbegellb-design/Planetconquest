// Biomes : effets de jeu (défense, fertilité, richesse) et couleurs par défaut.
export const B = {
  PLAINS: 0, FOREST: 1, JUNGLE: 2, DESERT: 3, TUNDRA: 4, MOUNTAIN: 5, ICE: 6, SAVANNA: 7,
  STEPPE: 8, VOLCANIC: 9, PLATFORM: 10, DUNES: 11, PACKICE: 12, REEF: 13,
};

export const BIOMES = [
  { name: 'Plaines', color: '#9fb36a', def: 1.0, fert: 1.0, gold: 1.0 },
  { name: 'Forêt', color: '#4f7d43', def: 1.15, fert: 0.75, gold: 1.0 },
  { name: 'Jungle', color: '#2f6b3a', def: 1.3, fert: 0.65, gold: 1.05 },
  { name: 'Désert', color: '#d9c38c', def: 1.1, fert: 0.18, gold: 1.25 },
  { name: 'Toundra', color: '#a9a58e', def: 1.15, fert: 0.15, gold: 1.1 },
  { name: 'Montagnes', color: '#8c7a66', def: 1.5, fert: 0.35, gold: 1.4 },
  { name: 'Glacier', color: '#e8eef2', def: 1.25, fert: 0.04, gold: 0.9 },
  { name: 'Savane', color: '#c2b162', def: 1.0, fert: 0.6, gold: 1.0 },
  { name: 'Steppe', color: '#b5b07a', def: 0.95, fert: 0.55, gold: 1.0 },
  { name: 'Terres volcaniques', color: '#5a4a48', def: 1.3, fert: 0.5, gold: 1.5 },
  { name: 'Station flottante', color: '#9aa4b0', def: 1.2, fert: 0.8, gold: 1.2 },
  { name: 'Dunes', color: '#e2b77a', def: 1.05, fert: 0.12, gold: 1.3 },
  { name: 'Banquise', color: '#cfe3ee', def: 1.15, fert: 0.08, gold: 1.0 },
  { name: 'Atoll', color: '#7fc6a4', def: 1.1, fert: 0.9, gold: 1.1 },
];

const inBox = (lon, lat, b) => lon >= b[0] && lat >= b[1] && lon <= b[2] && lat <= b[3];

// [lonMin, latMin, lonMax, latMax]
const DESERTS = [
  [-17, 15, 34, 32], [34, 15, 58, 31], [55, 24, 72, 32], [76, 37, 112, 46], [117, -31, 141, -19],
  [12, -27, 25, -18], [-72, -27, -68, -16], [-117, 27, -106, 37], [52, 37, 66, 45],
];
const MOUNTAINS = [
  [74, 28, 101, 37], [5.5, 44.5, 15.5, 47.6], [-79, -5, -72, 8], [-79, -18, -66, -5], [-71, -40, -66, -18],
  [-74, -52, -70, -40], [-124, 36, -106, 60], [38, 41, 49, 43.8], [46, 28, 57, 36], [35.5, 6, 40.5, 13.5],
  [57, 51, 61, 67], [20, 45.5, 26.5, 49], [-1.5, 42, 2.5, 43], [6, 60, 17, 69], [70, 39, 92, 49],
  [-150, 59, -135, 64], [-108, 17, -98, 25], [140, 35, 146, 43], [104, 26, 110, 33],
];

export function earthBiome(lon, lat, jit) {
  const la = lat + jit * 2.5, lo = lon + jit * 2.5;
  if (lon > -58 && lon < -18 && lat > 61) return B.ICE; // calotte groenlandaise
  for (const b of MOUNTAINS) if (inBox(lo, la, b)) return B.MOUNTAIN;
  if (la > 67 || (la > 59 && lon < -60) || (la > 63 && lon > 60)) return B.TUNDRA;
  for (const b of DESERTS) if (inBox(lo, la, b)) return B.DESERT;
  if (la > 50 && la <= 67 && !(lon > -12 && lon < 30 && la < 57)) return B.FOREST;
  const tropic = Math.abs(la) < 9;
  if (tropic && ((lon > -82 && lon < -35) || (lon > 8 && lon < 31) || (lon > 95 && lon < 155))) return B.JUNGLE;
  if (lon > -18 && lon < 50 && ((la > 7 && la < 16) || (la < -5 && la > -21))) return B.SAVANNA;
  if (lon > -62 && lon < -40 && la < -5 && la > -22) return B.SAVANNA;
  if (lon > 120 && lon < 145 && la < -11 && la > -19) return B.SAVANNA;
  if ((lon > 45 && lon < 125 && la > 42 && la < 52) || (lon > -106 && lon < -96 && la > 32 && la < 52)) return B.STEPPE;
  if (lon > -70 && lon < -64 && la < -40) return B.STEPPE;
  return B.PLAINS;
}

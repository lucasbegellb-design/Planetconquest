// Types de planètes : forme du relief, biomes, palettes et règles de jeu propres.
import { B } from './biomes.js';
import { smoothstep } from '../core/util.js';

export const PLANET_TYPES = {
  terran: {
    name: 'Tempérée', adj: 'tempérée', land: 0.36, freq: 4.2, linkDist: 40, polar: true,
    palette: { shallow: '#2f6b8f', deep: '#0d2238', foam: '#5d9cbc' },
    globe: ['#2f6b8f', '#5f9a4a', '#d9c38c'],
    rules: { naval: 0.65, freeNavigation: false, speed: 1, growth: 1 },
    events: ['seisme', 'inondation', 'ouragan'],
    desc: 'Un monde semblable à la Terre : continents, océans et climats variés.',
  },
  desert: {
    name: 'Désertique', adj: 'désertique', land: 0.66, freq: 3.4, linkDist: 34, polar: false,
    palette: { shallow: '#2e7f7a', deep: '#123c40', foam: '#69b3a6', biomes: { [B.PLAINS]: '#c9a76b', [B.STEPPE]: '#b89a62', [B.MOUNTAIN]: '#8a5a3c' } },
    globe: ['#d9a35f', '#b8763d', '#2e7f7a'],
    rules: { naval: 0.6, freeNavigation: false, speed: 1.1, growth: 0.8 },
    events: ['tempete_sable', 'seisme', 'canicule'],
    desc: 'Dunes à perte de vue et rares mers intérieures. Les armées avancent vite, la population croît lentement.',
  },
  ocean: {
    name: 'Océanique', adj: 'océanique', land: 0.17, freq: 5.5, linkDist: 75, polar: true,
    palette: { shallow: '#1f8fae', deep: '#062c4c', foam: '#7fd4e4', biomes: { [B.PLAINS]: '#7fbf7a' } },
    globe: ['#1f8fae', '#0b3d63', '#7fc6a4'],
    rules: { naval: 0.9, freeNavigation: true, speed: 1, growth: 1.1 },
    events: ['tsunami', 'ouragan', 'maree'],
    desc: 'Un archipel planétaire : presque tous les combats sont navals.',
  },
  glacial: {
    name: 'Glaciaire', adj: 'glaciaire', land: 0.44, freq: 4, linkDist: 44, polar: false,
    palette: { shallow: '#4b7891', deep: '#14283a', foam: '#bfe3f2', biomes: { [B.PLAINS]: '#b8c9c2', [B.FOREST]: '#3f6b5c', [B.MOUNTAIN]: '#8b97a6' } },
    globe: ['#dfeef6', '#8fb3c9', '#4b7891'],
    rules: { naval: 0.6, freeNavigation: false, speed: 0.8, growth: 0.75 },
    events: ['blizzard', 'avalanche', 'seisme'],
    desc: 'Banquises et toundras gelées. Les offensives sont ralenties par le froid.',
  },
  volcanic: {
    name: 'Volcanique', adj: 'volcanique', land: 0.52, freq: 4.8, linkDist: 30, polar: false,
    palette: { shallow: '#ff8a2a', deep: '#7a1a08', foam: '#ffd36b', biomes: { [B.PLAINS]: '#6b5a50', [B.DESERT]: '#4a3e3a', [B.MOUNTAIN]: '#3a3030' }, lava: true },
    globe: ['#3a2b28', '#ff6a1a', '#7a1a08'],
    rules: { naval: 0.45, freeNavigation: false, speed: 1, growth: 0.9 },
    events: ['eruption', 'seisme', 'pluie_cendres'],
    desc: 'Des mers de lave séparent des plateaux de basalte. Traverser la lave coûte cher.',
  },
  gas: {
    name: 'Géante gazeuse', adj: 'gazeuse', land: 0.13, freq: 7, linkDist: 100, polar: false,
    palette: { shallow: '#d8a66a', deep: '#8a5a3a', foam: '#f2d7a8', gas: true },
    globe: ['#e2b07a', '#b97a4a', '#f2d7a8'],
    rules: { naval: 0.85, freeNavigation: true, speed: 1.15, growth: 0.9, air: true },
    events: ['cyclone', 'foudre', 'turbulences'],
    desc: 'Des stations flottantes dérivent dans les nuages. Toute attaque est aérienne.',
  },
  jungle: {
    name: 'Luxuriante', adj: 'luxuriante', land: 0.42, freq: 4.4, linkDist: 40, polar: true,
    palette: { shallow: '#2a8a7a', deep: '#0b2f2c', foam: '#7fd0b0', biomes: { [B.PLAINS]: '#6fae4a' } },
    globe: ['#2f7a3a', '#2a8a7a', '#9fd06a'],
    rules: { naval: 0.65, freeNavigation: false, speed: 0.9, growth: 1.25 },
    events: ['epidemie_exotique', 'inondation', 'ouragan'],
    desc: 'Une jungle dense et fertile : population nombreuse, défense facilitée.',
  },
};

// Choix du biome selon altitude relative h (0 = côte, 1 = sommet), température t et humidité m (0..1)
export function pickBiome(type, h, t, m, n) {
  switch (type) {
    case 'desert':
      if (h > 0.6) return B.MOUNTAIN;
      if (t < 0.12) return B.TUNDRA;
      if (m < 0.42) return n > 0 ? B.DUNES : B.DESERT;
      if (m < 0.6) return B.STEPPE;
      return t > 0.6 ? B.SAVANNA : B.PLAINS;
    case 'ocean':
      if (h > 0.62) return B.MOUNTAIN;
      if (h < 0.12) return B.REEF;
      if (t < 0.18) return B.TUNDRA;
      if (t > 0.65 && m > 0.45) return B.JUNGLE;
      return m > 0.55 ? B.FOREST : B.PLAINS;
    case 'glacial':
      if (h > 0.6) return B.MOUNTAIN;
      if (t < 0.4) return n > 0.1 ? B.ICE : B.PACKICE;
      if (t < 0.62) return B.TUNDRA;
      return m > 0.55 ? B.FOREST : B.PLAINS;
    case 'volcanic':
      if (h > 0.55) return B.MOUNTAIN;
      if (m < 0.45) return B.VOLCANIC;
      return m < 0.62 ? B.DESERT : B.PLAINS;
    case 'gas':
      return B.PLATFORM;
    case 'jungle':
      if (h > 0.66) return B.MOUNTAIN;
      if (t < 0.15) return B.TUNDRA;
      if (m > 0.42) return B.JUNGLE;
      return m > 0.3 ? B.FOREST : B.PLAINS;
    default:
      if (h > 0.62) return B.MOUNTAIN;
      if (t < 0.1) return B.ICE;
      if (t < 0.24) return B.TUNDRA;
      if (m < 0.3 && t > 0.55) return B.DESERT;
      if (t > 0.72 && m > 0.58) return B.JUNGLE;
      if (t > 0.6 && m < 0.45) return B.SAVANNA;
      if (m > 0.55) return B.FOREST;
      if (m < 0.38) return B.STEPPE;
      return B.PLAINS;
  }
}

// Couleur de « mer » spéciale (bandes de gaz, lave) — sinon null
export function specialWater(type, noise) {
  if (type === 'gas') {
    return (x, y, d, W, H) => {
      const v = y / H, a = (x / W) * Math.PI * 2, R = W / (Math.PI * 2);
      const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
      const band = Math.sin(v * 38 + noise(cx / 140, y / 60, cz / 140) * 2.4) * 0.5 + 0.5;
      const sw = noise(cx / 60 + 9.7, y / 25, cz / 60) * 0.5 + 0.5;
      const t = band * 0.7 + sw * 0.3;
      const glow = d < 6 ? (6 - d) / 6 : 0;
      return [
        200 + (232 - 200) * t - 70 * (1 - t) * 0.5 + glow * 20,
        150 + (190 - 150) * t - 40 * (1 - t) * 0.5 + glow * 20,
        100 + (150 - 100) * t + glow * 25,
      ];
    };
  }
  if (type === 'volcanic') {
    return (x, y, d, W) => {
      const a = (x / W) * Math.PI * 2, R = W / (Math.PI * 2);
      const n = noise(Math.cos(a) * R / 30, y / 30, Math.sin(a) * R / 30) * 0.5 + 0.5;
      const near = smoothstep(18, 0, d);
      const heat = Math.min(1, near * 0.8 + n * 0.45);
      return [120 + 135 * heat, 25 + 140 * heat * heat, 10 + 50 * heat * heat * heat];
    };
  }
  return null;
}

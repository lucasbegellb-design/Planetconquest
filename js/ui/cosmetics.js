// Cosmétiques débloqués par les succès : emblèmes, couleurs de pays, thèmes d'interface, effets de conquête, titres.
// Aucun effet sur le jeu : uniquement l'apparence.
const KEY = 'terra-conquest-cosmetics';

export const COSMETICS = {
  emblem: {
    name: 'Emblèmes', icon: '🛡️', desc: 'Affiché à côté de votre nom et sur votre capitale.',
    items: [
      { id: 'none', name: 'Étoile', icon: '⭐', free: true },
      { id: 'sword', name: 'Épée', icon: '⚔️' }, { id: 'castle', name: 'Château', icon: '🏰' }, { id: 'crown', name: 'Couronne', icon: '👑' },
      { id: 'eagle', name: 'Aigle', icon: '🦅' }, { id: 'lion', name: 'Lion', icon: '🦁' }, { id: 'dragon', name: 'Dragon', icon: '🐉' },
      { id: 'rocket', name: 'Fusée', icon: '🚀' }, { id: 'atom', name: 'Atome', icon: '☢️' }, { id: 'trophy', name: 'Trophée', icon: '🏆' },
      { id: 'dove', name: 'Colombe', icon: '🕊️' }, { id: 'ant', name: 'Fourmi', icon: '🐜' }, { id: 'film', name: 'Bobine', icon: '🎬' },
      { id: 'spy', name: 'Masque', icon: '🎭' }, { id: 'medal', name: 'Médaille', icon: '🎖️' },
    ],
  },
  color: {
    name: 'Couleurs du pays', icon: '🎨', desc: 'Remplace la couleur de votre pays au début d’une partie solo.',
    items: [
      { id: 'none', name: 'D’origine', rgb: null, free: true },
      { id: 'gold', name: 'Or royal', rgb: [222, 178, 64] }, { id: 'purple', name: 'Pourpre impérial', rgb: [128, 54, 168] },
      { id: 'azure', name: 'Azur', rgb: [48, 128, 232] }, { id: 'emerald', name: 'Émeraude', rgb: [28, 160, 100] },
      { id: 'scarlet', name: 'Écarlate', rgb: [210, 40, 52] }, { id: 'obsidian', name: 'Obsidienne', rgb: [52, 50, 64] },
      { id: 'marble', name: 'Marbre', rgb: [226, 222, 210] }, { id: 'nebula', name: 'Nébuleuse', rgb: [212, 84, 196] },
    ],
  },
  theme: {
    name: 'Thèmes d’interface', icon: '🖌️', desc: 'Couleur d’accent des boutons et des menus.',
    items: [
      { id: 'none', name: 'Classique', sw: '#d6a85a', free: true },
      { id: 'ice', name: 'Glace', sw: '#6cc8ff' }, { id: 'ember', name: 'Braise', sw: '#ff6a3d' }, { id: 'jade', name: 'Jade', sw: '#3fcf8e' },
      { id: 'amethyst', name: 'Améthyste', sw: '#a47bff' }, { id: 'neon', name: 'Néon', sw: '#ff4fd8' }, { id: 'obsidian', name: 'Obsidienne', sw: '#c9ccd6' },
    ],
  },
  effect: {
    name: 'Effets de conquête', icon: '✨', desc: 'Joués quand vous prenez un territoire.',
    items: [
      { id: 'none', name: 'Sobre', icon: '◯', free: true },
      { id: 'gold', name: 'Étincelles d’or', icon: '✨' }, { id: 'fireworks', name: 'Feux d’artifice', icon: '🎆' },
      { id: 'petals', name: 'Pétales', icon: '🌸' }, { id: 'flames', name: 'Flammes', icon: '🔥' },
    ],
  },
  title: {
    name: 'Titres', icon: '📜', desc: 'Affiché sous votre nom dans la barre du haut et dans le salon multijoueur.',
    items: [
      { id: 'none', name: 'Aucun', free: true },
      { id: 'conqueror', name: 'le Conquérant' }, { id: 'builder', name: 'le Bâtisseur' }, { id: 'diplomat', name: 'le Diplomate' },
      { id: 'strategist', name: 'le Stratège' }, { id: 'peaceful', name: 'le Pacifique' }, { id: 'lightning', name: 'l’Éclair' },
      { id: 'invincible', name: 'l’Invincible' }, { id: 'starborn', name: 'l’Enfant des étoiles' }, { id: 'david', name: 'David contre Goliath' },
      { id: 'apocalypse', name: 'l’Apocalyptique' }, { id: 'loyal', name: 'le Fidèle' }, { id: 'spymaster', name: 'le Maître espion' },
    ],
  },
};
export const find = (cat, id) => COSMETICS[cat].items.find((x) => x.id === id) || COSMETICS[cat].items[0];

let eq = { emblem: 'none', color: 'none', theme: 'none', effect: 'none', title: 'none' };
try { eq = { ...eq, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* ignore */ }

export const equipped = () => ({ ...eq });
export function equip(cat, id) {
  eq[cat] = id;
  try { localStorage.setItem(KEY, JSON.stringify(eq)); } catch { /* ignore */ }
}
export const emblemIcon = () => (eq.emblem !== 'none' ? find('emblem', eq.emblem).icon : '');
export const titleText = () => (eq.title !== 'none' ? find('title', eq.title).name : '');

// Applique les cosmétiques équipés (thème, emblème et effet sur la carte)
export function applyCosmetics(app) {
  document.body.dataset.theme = eq.theme;
  if (app.renderer) {
    app.renderer.emblem = emblemIcon();
    app.renderer.captureFx = eq.effect !== 'none' ? eq.effect : null;
  }
}
// Couleur choisie appliquée au pays du joueur au début d'une partie solo
export function applyCountryColor(game) {
  const c = find('color', eq.color);
  if (!c.rgb || !game) return false;
  game.countries[game.playerId].color = c.rgb.slice();
  return true;
}

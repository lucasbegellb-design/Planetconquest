// Bâtiments constructibles dans chaque territoire.
export const BUILDINGS = [
  { id: 'farm', name: 'Ferme', icon: '🌾', max: 3, base: 45, desc: '+20 % de population max, +25 % de croissance par niveau' },
  { id: 'mine', name: 'Mine', icon: '⛏️', max: 3, base: 55, desc: '+30 % d’or produit par le territoire par niveau' },
  { id: 'barracks', name: 'Caserne', icon: '🛡️', max: 3, base: 60, desc: '+6 000 soldats max, +25 % de défense locale, recrutement accéléré' },
  { id: 'university', name: 'Université', icon: '🎓', max: 3, base: 80, req: 'writing', desc: '+30 % de recherche du territoire et +0,3 point/s par niveau' },
  { id: 'factory', name: 'Usine', icon: '🏭', max: 3, base: 140, req: 'steam', desc: '+25 % d’or et +50 % de production par niveau' },
  { id: 'port', name: 'Port', icon: '⚓', max: 1, base: 70, req: 'navigation', coastal: true, desc: 'Attaques navales sans malus depuis ce territoire, +15 % d’or' },
  { id: 'spaceport', name: 'Spatioport', icon: '🚀', max: 1, base: 1200, req: 'rocketry', unique: true, fixedCost: true, desc: 'Indispensable pour construire la fusée interplanétaire' },
];
export const NB = BUILDINGS.length;
export const BI = Object.fromEntries(BUILDINGS.map((b, i) => [b.id, i]));

// Coût du prochain niveau : dépend du niveau et de la population du territoire
export function buildCost(b, level, cellPop) {
  if (b.fixedCost) return b.base;
  const popF = 0.45 + 0.55 * Math.sqrt(Math.max(0.05, cellPop) / 10);
  return Math.round(b.base * Math.pow(level + 1, 1.6) * Math.min(3, popF));
}

// Conseiller : une astuce adaptée à la situation du joueur (pur, sans DOM).
// Renvoie les conseils pertinents, du plus urgent au moins urgent : { k: clé, text, prio }.
import { TECHS, canResearch } from '../tech/techtree.js';
import { Art } from '../core/fr.js';
import { fmtBig } from '../core/util.js';
import { GOVS, WONDERS, canWonder, canGov, hasRes } from './empire.js';
import { vassalsOf, canIntegrate } from './statecraft.js';

export function advise(g, id) {
  const P = g.countries[id];
  if (!P || !P.alive) return [];
  const out = [], add = (k, prio, text) => out.push({ k, prio, text });
  const st = P.st, nb = g.landN[id] || new Map(), auto = P.auto || {};
  const reserve = P.army, front = g.offTroops(id);

  // finances
  if (st.income - st.upkeep < 0 && P.gold < st.upkeep * 20) add('debt', 95, '📉 Vos dépenses dépassent vos revenus : l’armée coûte cher. Construisez des mines et des usines, ou laissez-la fondre en évitant de nouvelles offensives.');
  // menace directe
  for (const [w] of g.wars) {
    const a = Math.floor(w / 4096), b = w % 4096, e = a === id ? b : b === id ? a : -1;
    if (e < 0) continue;
    const E = g.countries[e];
    if (E.alive && g.power(E) > 2 * g.power(P) && nb.has(e)) {
      add('threat', 90, `🛡️ ${Art(E)} est bien plus puissant que vous. Proposez la paix ou un pacte de non-agression depuis son panneau, et gardez des troupes en réserve.`);
      break;
    }
  }
  // réserve vide
  if (front > 0 && reserve < 0.15 * st.armyCap && nb.size > 1) add('reserve', 80, '⚠️ Presque toute votre armée est engagée au front : vos frontières sont exposées. Gardez une réserve.');
  // agitation
  let agit = 0;
  for (const c of g.cellsOf[id]) if (g.unrest[c] > 0.5) agit++;
  if (agit >= 4 && agit > g.cellsOf[id].size * 0.3) add('unrest', 60, '😠 Beaucoup de vos territoires sont agités : ils produisent peu tant qu’ils ne sont pas calmés. Laissez-leur le temps avant de trop vous étendre.');
  // recherche disponible
  if (!auto.res) {
    const t = TECHS.find((x) => canResearch(P.techs, P.era, x) && P.rp >= x.cost);
    if (t) add('tech', 70, `🔬 Vous pouvez rechercher « ${t.name} » : ouvrez les technologies (🔬 ou touche T).`);
  }
  // or qui dort
  if (!auto.gov && P.gold > Math.max(250, st.income * 40)) add('gold', 65, `💰 ${fmtBig(P.gold)} d’or dort dans vos caisses : construisez (touchez un de vos territoires) ou activez le gouverneur automatique dans le panneau de votre pays.`);
  // terres libres à prendre
  if (nb.has(0) && reserve > 0.4 * st.armyCap && !g.offensives.some((o) => o.a === id && o.d === 0)) add('free', 55, '🗺️ Des terres libres bordent votre pays : elles sont faciles à conquérir. Touchez-en une puis « Attaquer ».');
  // voisin faible
  if (reserve > 0.5 * st.armyCap) {
    // parmi les voisins nettement plus faibles, celui avec la plus longue frontière
    let best = null, bl = 0;
    for (const [e, len] of nb) {
      const E = g.countries[e];
      if (!E || E.neutral || !E.alive || g.allied(id, e) || g.inTruce(id, e)) continue;
      if (g.power(P) > 1.8 * g.power(E) && len > bl) { bl = len; best = E; }
    }
    if (best) add('weak', 50, `⚔️ ${Art(best)} est nettement plus faible que vous (armée ${fmtBig(best.army)}) : une offensive a de bonnes chances.`);
  }
  // armée au maximum
  if (reserve >= 0.97 * st.armyCap && !front && g.t > 120) add('cap', 40, '🪖 Votre armée a atteint son maximum : elle ne grossira plus. Utilisez-la, ou construisez des casernes pour l’agrandir.');
  // voisin hostile en paix
  for (const [e] of nb) {
    const E = g.countries[e];
    if (!E || E.neutral || !E.alive || g.atWar(id, e) || g.inTruce(id, e) || g.allied(id, e)) continue;
    if (g.rel(id, e) < -30 && g.power(E) > g.power(P)) {
      add('hostile', 45, `😾 ${Art(E)} vous est hostile et plus puissant : un pacte de non-agression vous mettrait à l’abri pendant 5 minutes.`);
      break;
    }
  }
  // gouvernement, merveilles, ressources, vassaux, généraux
  if (P.gov === 'tribe' && g.t > 45) add('gov', 75, '🏛️ Choisissez un gouvernement (bouton 🏛️ ou touche E) : le premier choix est gratuit et chacun a ses atouts.');
  else if (GOVS.some((x) => x.era === P.era && P.era > 0 && canGov(g, id, x.id).ok) && (GOVS.find((x) => x.id === P.gov) || {}).era < P.era) add('govnew', 35, '🏛️ De nouveaux régimes sont disponibles à votre époque (bouton 🏛️).');
  if (!P.job) {
    const w = WONDERS.find((x) => canWonder(g, id, x.id).ok && P.gold > x.cost * 1.3);
    if (w) add('wonder', 58, `${w.icon} Vous pouvez bâtir la merveille « ${w.name} » (${w.desc.toLowerCase()}) avant les autres : bouton 🏛️ → Merveilles.`);
  }
  if ((P.techs.has('tanks') || P.techs.has('aviation')) && !hasRes(P, 'oil')) add('oil', 72, '🛢️ Sans pétrole, vos Blindés et votre Aviation ne donnent que la moitié de leur effet : conquérez un territoire marqué 🛢️.');
  if (vassalsOf(g, id).some((x) => canIntegrate(g, id, x).ok)) add('integrate', 42, '⛓️ Un de vos vassaux peut être intégré pacifiquement (bouton 🏛️ → Relations).');
  if ((P.generals || []).some((x) => !x.off) && g.offensives.some((o) => o.a === id && !o.gen)) add('general', 52, '🎖️ Un général attend en réserve alors qu’une offensive n’a pas de chef : affectez-le (🏛️ → Armée).');
  return out.sort((a, b) => b.prio - a.prio);
}

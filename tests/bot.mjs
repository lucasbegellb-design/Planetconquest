// Joueur automatique simple pour estimer la durée d'une conquête.
import { TECHS, REPEATABLES, canResearch, repeatCost } from '../js/tech/techtree.js';

export function botTick(g) {
  const id = g.playerId, P = g.countries[id];
  if (!P.alive) return;
  if (!P.bot) {
    P.bot = { lastCells: 0, stallT: 0, failed: new Map() };
    // mémorise les offensives qui échouent pour ne pas s'acharner
    g.on('offensiveEnd', ({ o, reason }) => { if (o.a === id && o.captured === 0 && reason === 'exhausted') P.bot.failed.set(o.d, g.t); });
  }
  // recherche : la moins chère disponible, puis répétables
  const avail = TECHS.filter((t) => canResearch(P.techs, P.era, t)).sort((a, b) => a.cost - b.cost);
  if (avail.length && P.rp >= avail[0].cost) g.research(id, avail[0].id);
  else if (!avail.length && P.era >= 4) {
    const r = REPEATABLES[0];
    if (P.rp >= repeatCost(r, P.repeat[r.id] || 0)) g.researchRepeat(id, r.id);
  }
  // bâtiments
  if (P.gold > 120) {
    const cells = [...g.cellsOf[id]].sort((a, b) => g.pop[b] - g.pop[a]).slice(0, 15);
    for (const bid of ['university', 'mine', 'farm', 'factory', 'barracks', 'port', 'spaceport']) {
      let done = false;
      for (const cell of cells) {
        const r = g.canBuild(id, cell, bid);
        if (r.ok && r.cost < P.gold * 0.5) { g.buildIn(id, cell, bid); done = true; break; }
      }
      if (done) break;
    }
  }
  if (P.gold > 2000) g.hireMercenaries(id, P.gold * 0.5);
  for (const p of [...g.proposals]) g.answer(p.id, p.type === 'alliance' ? false : g.offensives.filter((o) => o.d === id).length > 1);
  // stagnation ?
  const n = g.cellsOf[id].size;
  if (n > P.bot.lastCells) { P.bot.lastCells = n; P.bot.stallT = g.t; }
  const stalled = g.t - P.bot.stallT > 60;
  if (g.t - P.bot.stallT > 120 && P.gold > 300) g.hireMercenaries(id, P.gold);
  const myOffs = g.offensives.filter((o) => o.a === id);
  const maxOff = n < 30 ? 1 : 2 + Math.floor(n / 50);
  // prêt à attaquer : armée reconstituée, ou plafonnée par l'entretien (l'or ne suit plus)
  const ready = P.army > P.st.armyCap * 0.45 || (P.army > P.st.armyCap * 0.15 && P.st.upkeep > P.st.income * 0.7);
  if (myOffs.length < maxOff && ready) {
    let best = -1, bs = 0;
    const frac = g.t - P.bot.stallT > 120 ? 1 : stalled ? 0.85 : 0.6;
    for (const nb of g.neighborsOf(id)) {
      const N = g.countries[nb];
      if ((!N.neutral && !N.alive) || g.allied(id, nb) || g.inTruce(id, nb) || myOffs.some((o) => o.d === nb)) continue;
      if (g.t - (P.bot.failed.get(nb) ?? -1e9) < 90) continue;
      const est = g.estimateAttack(id, nb, frac, -1);
      if (!est) continue;
      let s = Math.min(est.ratio, 6) * (N.neutral ? 1.5 : 1);
      if (!N.neutral && !g.atWar(id, nb)) s /= 1 + g.warCount(id);
      if (g.offensives.some((o) => o.a === nb && o.d === id)) s *= 2;
      if (s > bs) { bs = s; best = nb; }
    }
    if (best >= 0 && (bs > 1.4 || (stalled && bs > 0.8) || (frac === 1 && bs > 0.9))) g.launch(id, best, frac, -1);
  }
  if (g.rng.next() < 0.05) for (const e of g.enemiesOf(id)) g.playerDemandSurrender(e);
  if (g.conquered && g.rocket.stage === 0) g.startRocket();
}

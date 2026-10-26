// Point d'entrée unique des actions d'un joueur humain (solo, hôte ou joueur distant).
import { bulkBuild } from './governor.js';

export function runCommand(g, id, name, a = []) {
  const C = g.countries[id];
  if (!C || (!C.alive && name !== 'answer')) return { ok: false, msg: 'Votre civilisation a disparu' };
  switch (name) {
    case 'research': return g.research(id, a[0]);
    case 'researchRepeat': return g.researchRepeat(id, a[0]);
    case 'launch': return g.launch(id, a[0], a[1], a[2]);
    case 'recall': {
      const o = g.offensives.find((x) => x.id === a[0] && x.a === id);
      if (o) g.recall(o.id);
      return { ok: !!o };
    }
    case 'build': return g.buildIn(id, a[0], a[1]);
    case 'bulk': return { ok: true, ...bulkBuild(g, id, a[0]) };
    case 'merc': return g.hireMercenaries(id, a[0]);
    case 'peace': return g.proposePeace(id, a[0]);
    case 'alliance': return g.proposeAlliance(id, a[0]);
    case 'nap': return g.proposeNap(id, a[0]);
    case 'surrender': return g.demandSurrender(id, a[0]);
    case 'breakAlliance': g.breakAlliance(id, a[0]); return { ok: true };
    case 'answer': g.answer(a[0], a[1], id); return { ok: true };
    case 'auto': C.auto = { gov: !!a[0], mode: a[1] || 'equilibre', res: !!a[2] }; return { ok: true };
    case 'startRocket': return id === g.playerId ? g.startRocket() : { ok: false };
    case 'launchRocket': return id === g.playerId ? g.launchRocket() : { ok: false };
  }
  return { ok: false, msg: 'Commande inconnue' };
}

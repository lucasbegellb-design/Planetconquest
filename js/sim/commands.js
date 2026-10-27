// Point d'entrée unique des actions d'un joueur humain (solo, hôte ou joueur distant).
import { bulkBuild } from './governor.js';
import { setGov, startWonder } from './empire.js';
import { buildNuke, nuke, moveGeneral } from './military.js';
import { proposeTrade, breakTrade, spy, integrate } from './statecraft.js';

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
    case 'surrender': return g.demandSurrender(id, a[0], a[1] === 'vassal' ? 'vassal' : 'annex');
    case 'breakAlliance': g.breakAlliance(id, a[0]); return { ok: true };
    case 'answer': g.answer(a[0], a[1], id); return { ok: true };
    case 'auto': C.auto = { gov: !!a[0], mode: a[1] || 'equilibre', res: !!a[2] }; return { ok: true };
    case 'gov': return setGov(g, id, a[0]);
    case 'wonder': return startWonder(g, id, a[0]);
    case 'buildNuke': return buildNuke(g, id);
    case 'nuke': return nuke(g, id, a[0]);
    case 'general': return moveGeneral(g, id, a[0], a[1]);
    case 'trade': return proposeTrade(g, id, a[0]);
    case 'breakTrade': breakTrade(g, id, a[0]); return { ok: true, msg: 'Accord rompu' };
    case 'spy': return spy(g, id, a[0], a[1]);
    case 'integrate': return integrate(g, id, a[0]);
    case 'startRocket': return id === g.playerId ? g.startRocket() : { ok: false };
    case 'launchRocket': return id === g.playerId ? g.launchRocket() : { ok: false };
  }
  return { ok: false, msg: 'Commande inconnue' };
}

// Diplomatie avancée : vassaux, accords commerciaux, espionnage.
import { Art, art, de, en, v } from '../core/fr.js';
import { TECHS, canResearch, TECH_BY_ID } from '../tech/techtree.js';
import { NB } from '../tech/buildings.js';
import { clamp } from '../core/util.js';

const pk = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a);
export const TRIBUTE = 0.25;

// ---------- vassaux ----------
// Un vassal garde ses territoires, paie un tribut, combat aux côtés de son suzerain (alliance permanente) et peut se révolter.
export const overlordOf = (g, id) => (g.vassals.has(id) ? g.vassals.get(id) : -1);
export const vassalsOf = (g, id) => [...g.vassals].filter(([, o]) => o === id).map(([vid]) => vid);
export const isVassalPair = (g, a, b) => g.vassals.get(a) === b || g.vassals.get(b) === a;

export function vassalize(g, vid, oid) {
  const V = g.countries[vid], O = g.countries[oid];
  // le vassal quitte ses guerres et ses anciennes alliances (sauf contre les ennemis du suzerain)
  for (const [k, w] of [...g.wars]) if (w.a === vid || w.b === vid) g.wars.delete(k);
  for (const k of [...g.alliances]) if (Math.floor(k / 4096) === vid || k % 4096 === vid) g.alliances.delete(k);
  for (const [vv, o] of [...g.vassals]) if (o === vid) g.vassals.delete(vv); // ses propres vassaux s'émancipent
  for (const o of [...g.offensives]) if (o.a === vid || o.d === vid) g.endOffensive(o, 'peace');
  g.vassals.set(vid, oid);
  g.alliances.add(pk(vid, oid));
  g.addRel(vid, oid, 30);
  V.vassalT = g.t;
  for (const e of g.enemiesOf(oid)) if (e !== vid) g._setWar(vid, e);
  g.say(`🏳️ ${Art(V)} ${v(V, 'capitule', 'capitulent')} et ${v(V, 'devient', 'deviennent')} ${V.art === 'les' ? 'des vassaux' : 'vassal' + (V.art === 'la' ? 'e' : '')} ${de(O)}.`, 'annex', { imp: true, player: g.involvesPlayer(vid, oid) });
}

// Annexion pacifique d'un vassal (après 3 minutes de vassalité, contre de l'or)
export const integrateCost = (g, vid) => Math.round(25 * g.cellsOf[vid].size + 100);
export function canIntegrate(g, oid, vid) {
  if (overlordOf(g, vid) !== oid) return { ok: false, msg: 'Ce pays n’est pas votre vassal' };
  const left = Math.ceil((g.countries[vid].vassalT || 0) + 180 - g.t);
  if (left > 0) return { ok: false, msg: `Possible dans ${left} s` };
  const cost = integrateCost(g, vid);
  if (g.countries[oid].gold < cost) return { ok: false, msg: `Il faut ${cost} or` };
  return { ok: true, cost };
}
export function integrate(g, oid, vid) {
  const r = canIntegrate(g, oid, vid);
  if (!r.ok) return r;
  const O = g.countries[oid], V = g.countries[vid];
  O.gold -= r.cost;
  g.say(`🤝 ${Art(O)} ${v(O, 'intègre', 'intègrent')} pacifiquement ${art(V)}.`, 'annex', { imp: true, player: g.involvesPlayer(oid, vid) });
  const cells = [...g.cellsOf[vid]];
  cells.forEach((c, i) => { g.capture(c, oid, -1, i * 0.08); g.unrest[c] = 0.3; });
  return { ok: true, msg: 'Vassal intégré' };
}

function vassalTick(g, dt) {
  for (const [vid, oid] of [...g.vassals]) {
    const V = g.countries[vid], O = g.countries[oid];
    if (!V.alive || !O.alive) { g.vassals.delete(vid); g.alliances.delete(pk(vid, oid)); continue; }
    // tribut
    const t = Math.max(0, V.st.income) * TRIBUTE * dt;
    V.gold = Math.max(0, V.gold - t);
    O.gold += t;
    // émancipation : vassal devenu fort ou suzerain détesté
    if (V.isPlayer) continue;
    const strong = g.power(V) > 0.9 * g.power(O), hate = g.rel(vid, oid) < -40;
    if ((strong || hate) && g.rng.chance(0.004 * dt * (strong && hate ? 3 : 1))) {
      g.vassals.delete(vid);
      g.alliances.delete(pk(vid, oid));
      g.say(`🔥 ${Art(V)} ${v(V, 'se soulève', 'se soulèvent')} contre ${art(O)} et ${v(V, 'proclame', 'proclament')} son indépendance !`, 'war', { imp: true, player: g.involvesPlayer(vid, oid) });
      g.declareWar(vid, oid);
    }
  }
}

// ---------- commerce ----------
export const maxTrades = (c) => 2 + c.era;
export const tradesOf = (g, id) => { const out = []; for (const k of g.trades) { const a = Math.floor(k / 4096), b = k % 4096; if (a === id) out.push(b); else if (b === id) out.push(a); } return out; };
export const trading = (g, a, b) => g.trades.has(pk(a, b));
export const TRADE_ECO = 0.06;

export function evalTrade(g, id, from) {
  const c = g.countries[id];
  if (g.atWar(id, from)) return { ok: false, why: 'vous êtes en guerre' };
  if (tradesOf(g, id).length >= maxTrades(c)) return { ok: false, why: 'trop d’accords en cours' };
  const r = g.rel(id, from), likes = c.ai.style === 'marchand' ? 25 : c.ai.style === 'belliciste' ? -15 : 0;
  const score = r + likes + 10;
  if (score < 0) return { ok: false, why: 'relations trop mauvaises' };
  return { ok: true, score };
}
export function makeTrade(g, a, b) {
  if (trading(g, a, b)) return;
  g.trades.add(pk(a, b));
  g.addRel(a, b, 8);
  if (g.involvesPlayer(a, b)) g.say(`🚢 Accord commercial entre ${art(g.countries[a])} et ${art(g.countries[b])}.`, 'peace', { player: true });
}
export function proposeTrade(g, from, target) {
  const F = g.countries[from];
  return g._ask(from, target, 'trade', () => (g.atWar(from, target) ? 'Faites d’abord la paix' : trading(g, from, target) ? 'Accord déjà en vigueur' : tradesOf(g, from).length >= maxTrades(F) ? `Au plus ${maxTrades(F)} accords à votre époque` : null),
    evalTrade, 90, () => makeTrade(g, from, target), 'Accord commercial signé', ['refuse l’accord', 'refusent l’accord']);
}
export function breakTrade(g, a, b, why = '') {
  if (!g.trades.delete(pk(a, b))) return;
  g.addRel(a, b, -20);
  const A = g.countries[a];
  if (g.involvesPlayer(a, b) || why) g.say(`📦 ${Art(A)} ${v(A, 'rompt', 'rompent')} l’accord commercial avec ${art(g.countries[b])}${why}.`, 'war', { player: g.involvesPlayer(a, b) });
}
export function tradeCounts(g) {
  const n = new Uint8Array(g.countries.length);
  for (const k of g.trades) { n[Math.floor(k / 4096)]++; n[k % 4096]++; }
  return n;
}

// ---------- espionnage ----------
export const SPY = {
  sabotage: { icon: '💣', name: 'Saboter', cost: 120, desc: 'Détruit un niveau de bâtiment (ou retarde une merveille)' },
  steal: { icon: '📂', name: 'Voler une technologie', cost: 200, desc: 'Récupère une technologie qu’ils possèdent' },
  revolt: { icon: '🔥', name: 'Fomenter des troubles', cost: 150, desc: 'Agite plusieurs territoires et fait baisser leur moral' },
};
export const spyCost = (c, act) => Math.round(SPY[act].cost * (1 + 0.5 * c.era));
export const SPY_COOL = 60;

export function spy(g, from, target, act) {
  const A = g.countries[from], T = g.countries[target];
  if (!SPY[act] || !T || T.neutral || !T.alive || from === target) return { ok: false, msg: 'Cible invalide' };
  const left = g.coolLeft(from, target, 'spy');
  if (left) return { ok: false, msg: `Vos espions se font discrets : encore ${left} s`, cool: left };
  const cost = spyCost(A, act);
  if (A.gold < cost) return { ok: false, msg: `Il faut ${cost} or` };
  A.gold -= cost;
  g.setCool(from, target, 'spy', SPY_COOL);
  const chance = clamp(0.62 + 0.06 * (A.era - T.era) + (T.gov === 'dictatorship' ? -0.1 : 0), 0.25, 0.9);
  const ok = g.rng.chance(chance);
  let msg = '';
  if (ok) msg = doSpy(g, A, T, act);
  const caught = g.rng.chance(ok ? 0.15 : 0.65);
  if (caught) {
    g.addRel(from, target, -30);
    g.say(`🕵️ Un espion ${de(A)} a été démasqué ${en(T)} ! Incident diplomatique.`, 'war', { player: g.involvesPlayer(from, target), imp: g.involvesPlayer(from, target) });
    if (!T.isPlayer && !g.atWar(from, target) && !g.allied(from, target) && g.rel(from, target) < -50 && g.power(T) > 0.7 * g.power(A) && g.rng.chance(0.4)) g.declareWar(target, from);
  } else if (ok && T.isPlayer) {
    g.say(`🕵️ Des agents inconnus ont frappé chez vous : ${msg.toLowerCase()}`, 'war', { player: true, to: target });
  }
  if (!ok) return { ok: false, msg: caught ? 'Échec : l’espion a été capturé' : 'Échec de la mission (espion non identifié)' };
  return { ok: true, msg: msg + (caught ? ' — mais l’espion a été démasqué' : '') };
}

function doSpy(g, A, T, act) {
  const tcells = [...g.cellsOf[T.id]];
  if (act === 'sabotage') {
    if (T.job && g.rng.chance(0.5)) { T.job.left += 25; return 'Chantier de merveille retardé de 25 s'; }
    const built = tcells.filter((c) => { for (let k = 0; k < NB; k++) if (g.build[c * NB + k]) return true; return false; });
    if (!built.length) { T.gold = Math.max(0, T.gold * 0.85); return 'Trésor pillé (−15 % d’or)'; }
    const c = g.rng.pick(built), ks = [];
    for (let k = 0; k < NB; k++) if (g.build[c * NB + k]) ks.push(k);
    g.build[c * NB + g.rng.pick(ks)]--;
    return 'Bâtiment saboté';
  }
  if (act === 'steal') {
    const cands = [...T.techs].map((id) => TECH_BY_ID[id]).filter((t) => t && !A.techs.has(t.id) && canResearch(A.techs, A.era, t));
    if (!cands.length) { const cheap = TECHS.filter((t) => canResearch(A.techs, A.era, t)).sort((x, y) => x.cost - y.cost)[0]; if (cheap) A.rp += cheap.cost * 0.3; return 'Plans volés : +30 % d’une recherche'; }
    const t = g.rng.pick(cands);
    A.techs.add(t.id);
    g._refreshTech(A);
    return `Technologie volée : ${t.name}`;
  }
  // troubles
  const pick = g.rng.shuffle(tcells.slice()).slice(0, 4);
  for (const c of pick) if (c !== T.capital) g.unrest[c] = 1;
  T.morale = Math.max(5, T.morale - 8);
  return 'Troubles déclenchés';
}

// ---------- pas de temps ----------
export function statecraftTick(g, dt) {
  vassalTick(g, dt);
  // les partenaires commerciaux se rapprochent
  g.tradeAcc = (g.tradeAcc || 0) + dt;
  if (g.tradeAcc >= 2) {
    for (const k of g.trades) g.addRel(Math.floor(k / 4096), k % 4096, 0.03 * g.tradeAcc);
    g.tradeAcc = 0;
  }
}

// ---------- IA ----------
export function aiStatecraft(g, c) {
  const nb = g.landN[c.id];
  if (!nb) return;
  // commerce avec un voisin en paix
  if (tradesOf(g, c.id).length < maxTrades(c) && g.rng.chance(c.ai.style === 'marchand' ? 0.35 : 0.12)) {
    const cands = [...nb.keys()].filter((n) => n > 0 && g.countries[n].alive && !g.atWar(c.id, n) && !trading(g, c.id, n) && g.rel(c.id, n) > -5);
    const n = cands.length ? g.rng.pick(cands) : -1;
    if (n > 0) {
      const N = g.countries[n];
      if (N.isPlayer) g.propose('trade', c.id, n);
      else if (evalTrade(g, n, c.id).ok && tradesOf(g, n).length < maxTrades(N)) makeTrade(g, c.id, n);
    }
  }
  // espionnage contre un rival (rare)
  if (c.gold > 600 && g.rng.chance(c.ai.style === 'belliciste' ? 0.06 : 0.025)) {
    const rivals = [...nb.keys()].filter((n) => n > 0 && g.countries[n].alive && !g.allied(c.id, n) && g.rel(c.id, n) < -10);
    if (rivals.length) {
      const t = g.rng.pick(rivals), acts = Object.keys(SPY);
      spy(g, c.id, t, acts[Math.floor(g.rng.next() * acts.length)]);
    }
  }
}

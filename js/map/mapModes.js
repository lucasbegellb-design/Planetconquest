// Modes de carte : diplomatie, ressources, agitation, front. Chaque mode colore les territoires
// selon une information de jeu ; une légende accompagne la carte.
import { RESOURCES } from '../sim/empire.js';

const GREY = (c) => { const m = (c[0] + c[1] + c[2]) / 3; return [m * 0.55 + 30, m * 0.55 + 30, m * 0.55 + 34]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// palettes normale / daltonienne (rouge-vert remplacés par orange-bleu)
const PAL = {
  normal: { me: [235, 195, 90], war: [210, 55, 50], ally: [70, 165, 90], vassal: [60, 175, 165], lord: [150, 100, 205], truce: [125, 145, 200], trade: [90, 155, 215], bad: [140, 95, 90], good: [115, 155, 115], calm: [80, 160, 100], hot: [215, 60, 45] },
  cb: { me: [240, 228, 66], war: [213, 94, 0], ally: [0, 114, 178], vassal: [86, 180, 233], lord: [204, 121, 167], truce: [150, 150, 190], trade: [0, 158, 115], bad: [160, 110, 60], good: [90, 130, 175], calm: [0, 114, 178], hot: [230, 120, 0] },
};
const RES_COLORS = [[205, 165, 100], [150, 172, 198], [215, 95, 205], [240, 185, 40], [120, 235, 95]];

export const MAP_MODES = [
  { id: 'pol', icon: '🏳️', name: 'Politique' },
  { id: 'dip', icon: '🤝', name: 'Diplomatie' },
  { id: 'res', icon: '⛏️', name: 'Ressources' },
  { id: 'unrest', icon: '😠', name: 'Agitation' },
  { id: 'front', icon: '🛡️', name: 'Front' },
];

export function modeTint(mode, g, cb) {
  const P = cb ? PAL.cb : PAL.normal, pid = g.playerId, base = (o) => g.countries[o].color;
  if (mode === 'dip') {
    return (cell, o) => {
      const C = g.countries[o];
      if (C.neutral) return null;
      if (o === pid) return P.me;
      if (g.atWar(pid, o)) return P.war;
      if (g.vassals.get(o) === pid) return P.vassal;
      if (g.vassals.get(pid) === o) return P.lord;
      if (g.allied(pid, o)) return P.ally;
      if (g.inTruce(pid, o)) return P.truce;
      if (g.trades.has(pid < o ? pid * 4096 + o : o * 4096 + pid)) return P.trade;
      const r = g.rel(pid, o) / 100;
      return r < 0 ? mix([128, 128, 128], P.bad, -r) : mix([128, 128, 128], P.good, r);
    };
  }
  if (mode === 'res') {
    return (cell, o) => {
      const r = g.res[cell];
      if (r >= 0) return RES_COLORS[r];
      return g.countries[o].neutral ? [70, 70, 72] : GREY(base(o));
    };
  }
  if (mode === 'unrest') {
    return (cell, o) => {
      if (g.countries[o].neutral) return [70, 70, 72];
      const u = g.unrest[cell];
      return u < 0.05 ? GREY(base(o)) : mix(mix(P.calm, P.hot, 0.45), P.hot, Math.min(1, u));
    };
  }
  if (mode === 'front') {
    return (cell, o) => {
      if (o !== pid) return g.countries[o].neutral ? [70, 70, 72] : g.atWar(pid, o) ? mix(GREY(base(o)), P.war, 0.35) : GREY(base(o));
      let lvl = 0;
      for (const nb of g.map.cells[cell].nbrs) {
        const n = g.owner[nb];
        if (n === pid) continue;
        if (g.atWar(pid, n)) { lvl = 3; break; }
        if (!g.countries[n].neutral && !g.allied(pid, n) && !g.inTruce(pid, n)) lvl = Math.max(lvl, 2);
        else lvl = Math.max(lvl, 1);
      }
      return [P.calm, P.trade, [225, 175, 60], P.war][lvl];
    };
  }
  return null;
}

// signature : quand elle change, la carte est repeinte
export function modeSig(mode, g) {
  if (mode === 'dip') return `${g.ownVer}|${g.wars.size}|${g.alliances.size}|${g.truces.size}|${g.vassals.size}|${g.trades.size}|${Math.round(g.t / 5)}`;
  if (mode === 'unrest') return `${g.ownVer}|${Math.round(g.t / 2)}`;
  if (mode === 'front') return `${g.ownVer}|${g.wars.size}|${g.alliances.size}|${g.truces.size}`;
  return `${g.ownVer}`;
}

export function legendHtml(mode, cb) {
  const P = cb ? PAL.cb : PAL.normal;
  const sw = (c, l) => `<span><i style="background:rgb(${c.map(Math.round).join(',')})"></i>${l}</span>`;
  if (mode === 'dip') return [sw(P.me, 'Vous'), sw(P.war, 'En guerre'), sw(P.ally, 'Allié'), sw(P.vassal, 'Votre vassal'), sw(P.lord, 'Suzerain'), sw(P.truce, 'Trêve / pacte'), sw(P.trade, 'Commerce'), sw(P.bad, 'Hostile'), sw(P.good, 'Amical')].join('');
  if (mode === 'res') return RESOURCES.map((r, i) => sw(RES_COLORS[i], `${r.icon} ${r.name}`)).join('');
  if (mode === 'unrest') return [sw(mix(P.calm, P.hot, 0.45), 'Agité'), sw(P.hot, 'Révolte possible')].join('');
  if (mode === 'front') return [sw(P.calm, 'Intérieur'), sw(P.trade, 'Frontière sûre (allié, trêve, terres libres)'), sw([225, 175, 60], 'Frontière avec un voisin'), sw(P.war, 'Front : en guerre')].join('');
  return '';
}

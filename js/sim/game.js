// Cœur de la simulation : état du monde, économie, offensives, diplomatie, sauvegarde.
// Aucune dépendance au DOM : tourne aussi en Node (tests d'équilibrage).
import { RNG } from '../core/rng.js';
import { BAL, DIFFICULTIES } from './balance.js';
import { BUILDINGS, NB, BI, buildCost } from '../tech/buildings.js';
import { TECHS, TECH_BY_ID, ERAS, REPEAT_BY_ID, eraOf, techMods, canResearch, repeatCost, techsBeforeEra } from '../tech/techtree.js';
import { Art, art, de, a as aFr, v } from '../core/fr.js';
import { wrapDx, clamp } from '../core/util.js';
import { aiTick, aiResearch, acceptPeace, acceptAlliance, acceptSurrender } from './ai.js';
import { eventsTick } from './events.js';

export const pairKey = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a);
const NEUTRAL = 0;

const emptyMods = () => ({ atk: 0, def: 0, eco: 0, growth: 0, research: 0, manpower: 0, recruit: 0, speed: 0, prod: 0, naval: 0 });

export class Game {
  constructor(map, opts = {}) {
    this.map = map;
    this.opts = opts;
    this.rng = new RNG(opts.simSeed ?? ((Math.random() * 4294967296) >>> 0));
    this.diff = DIFFICULTIES[opts.difficulty] || DIFFICULTIES.normal;
    this.planet = opts.planet || { name: 'Terre', type: 'earth', level: 0, rules: { naval: 0.65, freeNavigation: false, speed: 1, growth: 1 }, aiBonus: 1, aiEra: 0, neutralEra: 0 };
    const n = map.cells.length;
    this.nCells = n;
    this.t = 0;
    this.owner = new Int16Array(n);
    this.pop = new Float32Array(n);
    this.base = new Float32Array(n);
    this.build = new Uint8Array(n * NB);
    this.unrest = new Float32Array(n);
    this.countries = [];
    this.cellsOf = [];
    this.offensives = [];
    this.wars = new Map();
    this.alliances = new Set();
    this.truces = new Map();
    this.relations = new Map();
    this.news = [];
    this.proposals = [];
    this.listeners = {};
    this.econAcc = 0; this.tickAcc = 0;
    this.nextOffId = 1; this.nextPropId = 1;
    this.ownVer = 0;
    this.playerId = -1;
    this.conquered = false;
    this.over = null;
    this.rocket = { stage: 0, progress: 0 };
    this.nextEvent = 30;
    this.eraFirsts = [true, false, false, false, false];
    this.landN = []; this.seaN = [];
    // historique des frontières pour le timelapse : état initial + changements groupés
    this.hist = { init: null, frames: [], pend: [], next: 0 };
    for (let i = 0; i < n; i++) { this.base[i] = map.cells[i].basePop; this.pop[i] = map.cells[i].basePop; }
    // nom du pays « historique » de chaque territoire (null = terres libres)
    this.coreName = map.cells.map((c) => (c.initOwner >= 0 && map.countries0[c.initOwner] ? map.countries0[c.initOwner].name : null));
  }

  // ---------- événements ----------
  on(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, data) { const l = this.listeners[type]; if (l) for (const fn of l) fn(data); }

  say(text, kind = 'info', opts = {}) {
    const item = { t: this.t, text, kind, player: !!opts.player, imp: !!opts.imp };
    this.news.push(item);
    if (this.news.length > 250) this.news.splice(0, this.news.length - 250);
    this.emit('news', item);
  }
  involvesPlayer(...ids) { return ids.includes(this.playerId); }
  notable(id) {
    const c = this.countries[id];
    return c && (c.isPlayer || (c.st && c.st.ncells >= 8) || this.isNearPlayer(id));
  }
  isNearPlayer(id) {
    const m = this.landN[this.playerId];
    return !!(m && m.has(id)) || !!(this.seaN[this.playerId] && this.seaN[this.playerId].has(id));
  }

  // ---------- création ----------
  static create(map, opts) {
    const g = new Game(map, opts);
    g.setup(opts);
    return g;
  }

  _addCountry(src) {
    const id = this.countries.length;
    const r = this.rng;
    const c = {
      id, name: src.name, art: src.art ?? 'le', title: src.title || '', color: src.color.slice(),
      neutral: !!src.neutral, isPlayer: false, alive: true, capital: src.capital ?? -1,
      army: 0, gold: 0, morale: 60, rp: 0, techs: new Set(), repeat: {}, era: 0,
      mods: techMods(new Set()), perk: emptyMods(), temp: [], tmod: emptyMods(),
      peakCells: 0, losses: 0,
      ai: { aggr: 0.65 + r.next() * 0.7, next: 1 + r.next() * 5, cool: 0, loyal: r.next() },
      st: { pop: 0, ncells: 0, income: 0, upkeep: 0, armyCap: 0, recruit: 0, rp: 0, prod: 0, bankrupt: false },
    };
    this.countries.push(c);
    this.cellsOf.push(new Set());
    return c;
  }

  setup(opts) {
    const map = this.map, c0 = map.countries0;
    this._addCountry({ name: 'Terres libres', art: 'les', color: [150, 142, 128], neutral: true });
    let active = new Set(c0.map((_, i) => i));
    const pIdx = opts.playerIndex ?? -1;
    if (opts.nAI && opts.nAI < c0.length - (pIdx >= 0 ? 1 : 0)) {
      const sorted = c0.map((_, i) => i).filter((i) => i !== pIdx).sort((a, b) => c0[b].pop - c0[a].pop);
      active = new Set(sorted.slice(0, opts.nAI));
      if (pIdx >= 0) active.add(pIdx);
    }
    const idOf = new Int16Array(c0.length).fill(NEUTRAL);
    c0.forEach((src, i) => { if (active.has(i)) idOf[i] = this._addCountry(src).id; });
    for (const cell of map.cells) this.owner[cell.id] = cell.initOwner >= 0 ? idOf[cell.initOwner] : NEUTRAL;

    // IA plus avancées sur les autres planètes
    const aiEra = this.planet.aiEra || 0;
    for (const c of this.countries) {
      if (c.neutral) continue;
      if (aiEra > 0) c.techs = techsBeforeEra(aiEra, this.rng, Math.floor(this.rng.next() * 3));
    }

    if (pIdx >= 0) this.playerId = idOf[pIdx];
    else if (opts.landing != null) this._landPlayer(opts.landing, opts.meta);
    this._recount();
    const P = this.countries[this.playerId];
    if (P) P.isPlayer = true;
    if (opts.meta) this._applyMeta(opts.meta);

    for (const c of this.countries) {
      if (c.neutral) continue;
      this._refreshTech(c, true);
      if (c.capital < 0 || this.owner[c.capital] !== c.id) this._relocateCapital(c);
    }
    this.econ(0.01);
    this.computeBorders();
    for (const c of this.countries) {
      if (c.neutral) continue;
      c.army = c.st.armyCap * (c.isPlayer ? 0.6 : 0.55 + this.rng.next() * 0.2);
      c.gold = 40 + c.st.income * 25;
      c.peakCells = c.st.ncells;
    }
    if (P && opts.landing != null) this._expedition(P, opts.meta || {});
    this.hist.init = Array.from(this.owner);
  }

  // Débarquement : colons et force expéditionnaire à la mesure des armées locales
  _expedition(P, meta) {
    const ais = this.countries.filter((c) => !c.neutral && !c.isPlayer && c.alive);
    let sumPop = 0, nCells = 0, sumArmy = 0;
    for (const c of ais) { sumPop += c.st.pop; nCells += c.st.ncells; sumArmy += c.army; }
    const avgCellPop = nCells ? sumPop / nCells : 5;
    for (const cell of this.cellsOf[P.id]) {
      const v = Math.max(this.pop[cell], avgCellPop * 2.5);
      this.pop[cell] = v; this.base[cell] = Math.max(this.base[cell], v);
    }
    this.econ(0.01);
    // force effective = 2 × celle d'une civilisation locale moyenne
    let avgQ = 0;
    for (const c of ais) avgQ += this.atkQ(c);
    avgQ = ais.length ? avgQ / ais.length : 1;
    const avgArmy = ais.length ? sumArmy / ais.length : P.st.armyCap;
    const exp = (avgArmy * avgQ * 2) / Math.max(0.1, this.atkQ(P));
    P.army = Math.max(P.st.armyCap * 0.8, exp * (1 + (meta.perk?.startArmy || 0)));
    P.gold += 300 + (meta.bonusGold || 0);
    // tête de pont : défense renforcée pendant l'installation
    this.addTemp(P, 'def', 0.8, 240);
  }

  _landPlayer(cellId, meta) {
    const P = this._addCountry({ name: meta.name, art: meta.art, title: meta.title, color: meta.color, capital: cellId });
    const want = 4 + (meta.perk?.startCells || 0);
    const seen = new Set([cellId]), q = [cellId], got = [];
    while (q.length && got.length < want) {
      const c = q.shift();
      got.push(c);
      for (const nb of this.map.cells[c].nbrs) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
    }
    for (const cid of got) {
      this.owner[cid] = P.id;
      this.unrest[cid] = 0.5;
    }
    this.playerId = P.id;
  }

  _applyMeta(meta) {
    const P = this.countries[this.playerId];
    if (!P) return;
    if (meta.techs) P.techs = new Set(meta.techs);
    if (meta.repeat) P.repeat = { ...meta.repeat };
    if (meta.perk) for (const k in P.perk) P.perk[k] = meta.perk[k] || 0;
  }

  _recount() {
    for (const s of this.cellsOf) s.clear();
    for (let i = 0; i < this.nCells; i++) this.cellsOf[this.owner[i]].add(i);
    for (const c of this.countries) if (!c.neutral && this.cellsOf[c.id].size === 0) c.alive = false;
    this.ownVer++;
  }

  // ---------- qualités militaires ----------
  moraleF(c) { return 0.65 + (0.7 * c.morale) / 100; }
  aiQ(c) { return c.isPlayer ? 1 : this.diff.quality * (this.planet.aiQuality || 1); }
  atkQ(c) {
    if (c.neutral) return ERAS[this.planet.neutralEra || 0].mult * 0.9;
    return ERAS[c.era].mult * (1 + c.mods.atk + c.perk.atk + c.tmod.atk) * this.moraleF(c) * this.aiQ(c);
  }
  defQ(c) {
    if (c.neutral) return ERAS[this.planet.neutralEra || 0].mult * 0.85;
    return ERAS[c.era].mult * (1 + c.mods.def + c.perk.def + c.tmod.def) * this.moraleF(c) * this.aiQ(c);
  }
  canNavigate(c) { return this.planet.rules.freeNavigation || c.mods.navigation; }
  militia(cell) {
    return this.pop[cell] * BAL.MILITIA * (1 + 0.5 * this.build[cell * NB + BI.barracks]);
  }
  // Puissance militaire estimée (pour l'IA et l'interface)
  power(c) {
    if (c.neutral) return 1;
    return (c.army + 0.25 * c.st.armyCap + this.offTroops(c.id)) * this.atkQ(c);
  }
  offTroops(id) { let s = 0; for (const o of this.offensives) if (o.a === id) s += o.troops; return s; }

  // ---------- économie ----------
  econ(dt) {
    const C = this.countries.length, n = this.nCells, map = this.map;
    const aPop = new Float64Array(C), aW = new Float64Array(C), aSci = new Float64Array(C), aUni = new Float64Array(C);
    const aProd = new Float64Array(C), aBar = new Float64Array(C), aN = new Float64Array(C), aFac = new Float64Array(C);
    const aMan = new Float64Array(C);
    for (const c of this.countries) this._tempMods(c);
    const growthPlanet = this.planet.rules.growth || 1;
    for (let i = 0; i < n; i++) {
      const o = this.owner[i], c = this.countries[o], cell = map.cells[i], b = i * NB;
      const farm = this.build[b + BI.farm], mine = this.build[b + BI.mine], bar = this.build[b + BI.barracks];
      const uni = this.build[b + BI.university], fac = this.build[b + BI.factory], port = this.build[b + BI.port];
      const gm = 1 + c.mods.growth + c.perk.growth + c.tmod.growth;
      const capP = this.base[i] * (1 + 0.2 * farm) * (1 + 0.5 * (gm - 1)) * (1 + 0.06 * c.era);
      let p = this.pop[i];
      if (!c.tmod.noGrowth) p += p * BAL.GROWTH * Math.max(0.2, gm) * growthPlanet * (1 + 0.25 * farm) * (1 - p / Math.max(0.001, capP)) * dt;
      p = Math.max(0.005, p);
      this.pop[i] = p;
      if (this.unrest[i] > 0) this.unrest[i] = Math.max(0, this.unrest[i] - dt / BAL.UNREST_TIME);
      const cn = this.coreName[i];
      const core = cn === null ? 0.9 : cn === c.name ? 1 : BAL.ASSIMILATION;
      const dev = BAL.DEV_F[cell.dev] || 1, ur = (1 - 0.6 * this.unrest[i]) * core;
      aPop[o] += p; aN[o]++;
      aMan[o] += p * (0.5 + 0.5 * core) * (1 - 0.7 * this.unrest[i]);
      aW[o] += p * dev * cell.gold * (1 + 0.3 * mine) * (1 + 0.25 * fac) * (port ? 1.15 : 1) * ur;
      aSci[o] += p * dev * (1 + 0.3 * uni) * ur;
      aUni[o] += uni;
      aProd[o] += p * dev * (1 + 0.5 * fac) * ur;
      aBar[o] += bar; aFac[o] += fac;
    }
    for (const c of this.countries) {
      const id = c.id, st = c.st;
      st.pop = aPop[id]; st.ncells = aN[id];
      if (c.neutral || !c.alive) continue;
      const P = Math.max(0.01, aPop[id]), f = Math.pow(P, -0.2), fr = Math.pow(P, -0.4);
      const ai = !c.isPlayer, boost = ai ? this.planet.aiBonus || 1 : 1;
      const mf = 0.7 + (0.6 * c.morale) / 100;
      st.income = (BAL.K_GOLD * aW[id] * f * (1 + c.mods.eco + c.perk.eco + c.tmod.eco) * mf + BAL.LAND_TAX * aN[id]) * (ai ? this.diff.eco * boost : 1);
      st.upkeep = c.army * BAL.K_UPKEEP * (1 + 0.1 * c.era);
      st.armyCap = (BAL.MANPOWER * Math.pow(Math.max(0.01, aMan[id]), 0.85) + BAL.BARRACKS_CAP * aBar[id]) * (1 + c.mods.manpower + c.perk.manpower);
      st.recruit = st.armyCap * BAL.RECRUIT * (1 + c.mods.recruit + c.perk.recruit + 0.04 * aBar[id] + 0.05 * aFac[id]) * (0.6 + 0.4 * mf);
      st.rp = (BAL.K_RESEARCH * aSci[id] * fr + BAL.UNI_RP * aUni[id]) * (1 + c.mods.research + c.perk.research + c.tmod.research) * (ai ? this.diff.research * boost : 1);
      st.prod = BAL.K_PROD * aProd[id] * f * (1 + c.mods.prod + c.perk.prod);
      c.gold += (st.income - st.upkeep) * dt;
      st.bankrupt = c.gold < 0;
      if (st.bankrupt) {
        c.gold = 0;
        c.army -= c.army * 0.03 * dt;
        c.morale -= 1.2 * dt;
      }
      if (c.army < st.armyCap) c.army = Math.min(st.armyCap, c.army + st.recruit * dt * (st.bankrupt ? 0.2 : 1));
      else c.army -= (c.army - st.armyCap) * 0.1 * dt;
      c.rp += st.rp * dt;
      const wars = this.warCount(id);
      const target = 64 + (wars === 0 ? 10 : -5 * Math.min(3, wars)) - (st.bankrupt ? 25 : 0) + c.tmod.morale;
      c.morale = clamp(c.morale + (target - c.morale) * 0.012 * dt, 5, 100);
      if (aN[id] > c.peakCells) c.peakCells = aN[id];
      if (ai) aiResearch(this, c);
    }
    // fusée
    const P = this.countries[this.playerId];
    if (P && this.rocket.stage === 1 && this.conquered) {
      this.rocket.progress += P.st.prod * dt * (1 + (P.perk.speed || 0));
      if (this.rocket.progress >= BAL.ROCKET_WORK) {
        this.rocket.stage = 2;
        this.say('🚀 La fusée interplanétaire est prête au décollage !', 'space', { player: true, imp: true });
        this.emit('rocketReady');
      }
    }
  }

  _tempMods(c) {
    const m = emptyMods();
    m.morale = 0; m.noGrowth = false;
    if (c.temp.length) {
      c.temp = c.temp.filter((e) => e.until > this.t);
      for (const e of c.temp) {
        if (e.k === 'noGrowth') m.noGrowth = true;
        else m[e.k] = (m[e.k] || 0) + e.v;
      }
    }
    c.tmod = m;
  }
  addTemp(c, k, v, dur) { c.temp.push({ k, v, until: this.t + dur }); this._tempMods(c); }

  // Voisinages entre pays (terrestres et maritimes)
  computeBorders() {
    const C = this.countries.length;
    this.landN = Array.from({ length: C }, () => new Map());
    this.seaN = Array.from({ length: C }, () => new Map());
    const cells = this.map.cells;
    for (let i = 0; i < this.nCells; i++) {
      const a = this.owner[i], cell = cells[i];
      for (const nb of cell.nbrs) {
        const b = this.owner[nb];
        if (b !== a) this.landN[a].set(b, (this.landN[a].get(b) || 0) + 1);
      }
      for (const s of cell.seas) {
        const b = this.owner[s.to];
        if (b !== a) this.seaN[a].set(b, Math.min(this.seaN[a].get(b) ?? 9999, s.len));
      }
    }
  }
  neighborsOf(id) {
    const out = new Set(this.landN[id] ? this.landN[id].keys() : []);
    if (this.canNavigate(this.countries[id]) && this.seaN[id]) for (const k of this.seaN[id].keys()) out.add(k);
    return out;
  }

  // ---------- technologies ----------
  _refreshTech(c, silent = false) {
    c.mods = techMods(c.techs, c.repeat);
    const era = eraOf(c.techs);
    if (era > c.era) {
      c.era = era;
      if (!silent) {
        if (c.isPlayer) this.say(`🏛️ Vous entrez dans l'époque ${ERAS[era].adj} !`, 'era', { player: true, imp: true });
        else if (!this.eraFirsts[era]) this.say(`🏛️ ${Art(c)} ${v(c, 'est', 'sont')} la première civilisation à entrer dans l'époque ${ERAS[era].adj}.`, 'era', { imp: true });
        this.eraFirsts[era] = true;
        this.emit('era', { id: c.id, era });
      }
    }
  }
  research(id, techId) {
    const c = this.countries[id], t = TECH_BY_ID[techId];
    if (!t || !canResearch(c.techs, c.era, t)) return { ok: false, msg: 'Technologie indisponible' };
    if (c.rp < t.cost) return { ok: false, msg: 'Points de recherche insuffisants' };
    c.rp -= t.cost;
    c.techs.add(t.id);
    this._refreshTech(c);
    if (c.isPlayer) this.emit('tech', { id, tech: t.id });
    return { ok: true };
  }
  researchRepeat(id, rid) {
    const c = this.countries[id], r = REPEAT_BY_ID[rid];
    if (!r || c.era < 4) return { ok: false, msg: 'Époque spatiale requise' };
    const lvl = c.repeat[rid] || 0, cost = repeatCost(r, lvl);
    if (c.rp < cost) return { ok: false, msg: 'Points de recherche insuffisants' };
    c.rp -= cost;
    c.repeat[rid] = lvl + 1;
    this._refreshTech(c);
    if (c.isPlayer) this.emit('tech', { id, tech: rid });
    return { ok: true };
  }

  // ---------- bâtiments ----------
  buildingLevel(cell, bid) { return this.build[cell * NB + BI[bid]]; }
  hasBuilding(countryId, bid) {
    for (const cell of this.cellsOf[countryId]) if (this.build[cell * NB + BI[bid]] > 0) return cell;
    return -1;
  }
  canBuild(id, cell, bid) {
    const b = BUILDINGS[BI[bid]], c = this.countries[id];
    if (this.owner[cell] !== id) return { ok: false, msg: 'Territoire étranger' };
    const lvl = this.build[cell * NB + BI[bid]];
    if (lvl >= b.max) return { ok: false, msg: 'Niveau maximum atteint' };
    if (b.req && !c.techs.has(b.req)) return { ok: false, msg: `Nécessite : ${TECH_BY_ID[b.req].name}`, locked: true };
    if (b.coastal && !this.map.cells[cell].coastal) return { ok: false, msg: 'Territoire côtier requis', locked: true };
    if (b.unique && lvl === 0 && this.hasBuilding(id, bid) >= 0) return { ok: false, msg: 'Un seul par civilisation', locked: true };
    const cost = buildCost(b, lvl, this.pop[cell]);
    if (c.gold < cost) return { ok: false, msg: 'Or insuffisant', cost };
    return { ok: true, cost };
  }
  buildIn(id, cell, bid) {
    const r = this.canBuild(id, cell, bid);
    if (!r.ok) return r;
    this.countries[id].gold -= r.cost;
    this.build[cell * NB + BI[bid]]++;
    this.emit('build', { id, cell, bid });
    return r;
  }

  // ---------- mercenaires : convertit de l'or en soldats ----------
  mercInfo(id) {
    const c = this.countries[id];
    const room = Math.max(0, c.st.armyCap * 1.5 - c.army);
    const price = BAL.MERC_COST * (1 + 0.15 * c.era);
    return { room, price, max: Math.min(room, c.gold / price) };
  }
  hireMercenaries(id, gold) {
    const c = this.countries[id];
    const { price, max } = this.mercInfo(id);
    const n = Math.min(max, Math.max(0, gold) / price);
    if (n < 100) return { ok: false, msg: c.gold < price * 100 ? 'Or insuffisant' : 'Effectifs déjà au maximum' };
    c.gold -= n * price;
    c.army += n;
    return { ok: true, n };
  }

  // ---------- diplomatie ----------
  atWar(a, b) { return this.wars.has(pairKey(a, b)); }
  allied(a, b) { return this.alliances.has(pairKey(a, b)); }
  inTruce(a, b) { const u = this.truces.get(pairKey(a, b)); return u !== undefined && u > this.t; }
  warCount(id) { let n = 0; for (const w of this.wars.values()) if (w.a === id || w.b === id) n++; return n; }
  enemiesOf(id) { const out = []; for (const w of this.wars.values()) { if (w.a === id) out.push(w.b); else if (w.b === id) out.push(w.a); } return out; }
  alliesOf(id) {
    const out = [];
    for (const k of this.alliances) { const a = Math.floor(k / 4096), b = k % 4096; if (a === id) out.push(b); else if (b === id) out.push(a); }
    return out;
  }
  rel(a, b) {
    const k = pairKey(a, b);
    if (!this.relations.has(k)) this.relations.set(k, ((((a * 7919 + b * 104729) % 41) + 41) % 41) - 20);
    return this.relations.get(k);
  }
  addRel(a, b, v) { this.relations.set(pairKey(a, b), clamp(this.rel(a, b) + v, -100, 100)); }

  _setWar(a, b) {
    if (this.atWar(a, b)) return false;
    this.wars.set(pairKey(a, b), { a, b, since: this.t });
    this.addRel(a, b, -50);
    return true;
  }
  declareWar(a, b) {
    const A = this.countries[a], B = this.countries[b];
    if (B.neutral || this.atWar(a, b)) return;
    if (this.allied(a, b)) {
      this.alliances.delete(pairKey(a, b));
      this.say(`🗡️ Trahison : ${Art(A)} ${v(A, 'rompt', 'rompent')} l'alliance et ${v(A, 'attaque', 'attaquent')} ${art(B)} !`, 'war', { player: this.involvesPlayer(a, b), imp: true });
    }
    this._setWar(a, b);
    if (this.involvesPlayer(a, b) || this.isNearPlayer(a) || this.isNearPlayer(b) || (this.notable(a) && this.notable(b))) {
      this.say(`⚔️ ${Art(A)} ${v(A, 'déclare', 'déclarent')} la guerre ${aFr(B)} !`, 'war', { player: this.involvesPlayer(a, b), imp: this.involvesPlayer(a, b) });
    }
    for (const ally of this.alliesOf(b)) {
      if (ally === a || this.allied(ally, a) || !this.countries[ally].alive) continue;
      if (this._setWar(ally, a) && (this.involvesPlayer(ally, a) || this.notable(ally))) {
        this.say(`🤝 ${Art(this.countries[ally])} ${v(this.countries[ally], 'entre', 'entrent')} en guerre aux côtés ${de(B)}.`, 'war', { player: this.involvesPlayer(ally, a) });
      }
    }
    this.emit('war', { a, b });
  }
  makePeace(a, b, silent = false) {
    if (!this.atWar(a, b)) return;
    this.wars.delete(pairKey(a, b));
    this.truces.set(pairKey(a, b), this.t + 90);
    for (const o of [...this.offensives]) if ((o.a === a && o.d === b) || (o.a === b && o.d === a)) this.endOffensive(o, 'peace');
    this.addRel(a, b, 15);
    if (!silent && (this.involvesPlayer(a, b) || this.notable(a) || this.notable(b))) {
      this.say(`🕊️ Paix signée entre ${art(this.countries[a])} et ${art(this.countries[b])}.`, 'peace', { player: this.involvesPlayer(a, b) });
    }
    this.emit('peace', { a, b });
  }
  makeAlliance(a, b) {
    if (this.allied(a, b)) return;
    if (this.atWar(a, b)) this.makePeace(a, b, true);
    this.alliances.add(pairKey(a, b));
    this.addRel(a, b, 40);
    if (this.involvesPlayer(a, b) || this.isNearPlayer(a) || this.isNearPlayer(b) || (this.notable(a) && this.notable(b))) {
      this.say(`🤝 Alliance entre ${art(this.countries[a])} et ${art(this.countries[b])}.`, 'alliance', { player: this.involvesPlayer(a, b), imp: this.involvesPlayer(a, b) });
    }
    this.emit('alliance', { a, b });
  }
  breakAlliance(a, b) {
    if (!this.allied(a, b)) return;
    this.alliances.delete(pairKey(a, b));
    this.addRel(a, b, -40);
    this.say(`💔 ${Art(this.countries[a])} ${v(this.countries[a], 'rompt son', 'rompent leur')} alliance avec ${art(this.countries[b])}.`, 'alliance', { player: this.involvesPlayer(a, b) });
  }

  // ---------- offensives ----------
  dist(cellA, cellB) {
    const a = this.map.cells[cellA], b = this.map.cells[cellB];
    return Math.hypot(wrapDx(a.cx - b.cx, this.map.W), a.cy - b.cy);
  }
  findFront(a, d, target) {
    const A = this.countries[a], D = this.countries[d];
    const nav = this.canNavigate(A);
    const cells = this.map.cells, owner = this.owner;
    if (target == null || target < 0 || owner[target] !== d) target = D.neutral ? -1 : D.capital;
    let best = null, bestS = Infinity;
    for (const x of this.cellsOf[d]) {
      const cx = cells[x];
      let src = -1, naval = false, len = 0;
      for (const nb of cx.nbrs) if (owner[nb] === a) { src = nb; break; }
      if (src < 0 && nav) {
        for (const s of cx.seas) if (owner[s.to] === a && (src < 0 || s.len < len)) { src = s.to; len = s.len; naval = true; }
      }
      if (src < 0) continue;
      let s = target >= 0 ? this.dist(x, target) : this.dist(x, src) * 0.2;
      if (naval) s += 30 + len * 0.6;
      s += this.rng.next() * 4;
      if (s < bestS) { bestS = s; best = { cur: x, src, naval, len }; }
    }
    return best;
  }
  // territoire « historique » du pays (patriotisme : +25 % de défense)
  isCore(cell, D) { return this.coreName[cell] === D.name; }
  canReach(a, d) { return !!this.findFront(a, d, -1); }
  // Défense d'un territoire face à une offensive de `troops` soldats (load = total des offensives contre D)
  defenseAt(D, cell, troops, load) {
    const cd = this.map.cells[cell];
    const bar = this.build[cell * NB + BI.barracks];
    const share = D.neutral ? 0 : troops / (load + 0.35 * D.army + 1);
    const dArmy = D.neutral ? 0 : D.army * Math.min(1, share);
    const dTroops = this.militia(cell) + dArmy;
    const core = !D.neutral && this.isCore(cell, D) ? 1.25 : 1;
    const qd = this.defQ(D) * cd.def * (1 + 0.25 * bar) * (cell === D.capital ? 1.3 : 1) * core * (1 - 0.3 * this.unrest[cell]);
    return { dArmy, dTroops, qd };
  }
  // Rapport de force estimé d'une attaque (pour l'interface)
  estimateAttack(a, d, frac, target = -1) {
    const A = this.countries[a], D = this.countries[d];
    const f = this.findFront(a, d, target);
    if (!f) return null;
    const ex = this.offensives.find((o) => o.a === a && o.d === d);
    const troops = A.army * frac + (ex ? ex.troops : 0);
    let load = troops;
    for (const o of this.offensives) if (o.d === d && o !== ex) load += o.troops;
    const qa = this.atkQ(A) * (f.naval ? this.navalMult(A, { src: f.src, len: f.len }) : 1);
    const { dTroops, qd } = this.defenseAt(D, f.cur, troops, load);
    return { ratio: (troops * qa) / Math.max(1, dTroops * qd), naval: f.naval, cell: f.cur };
  }
  navalMult(A, o) {
    let m = (this.planet.rules.naval || 0.65) + A.mods.naval + (this.build[o.src * NB + BI.port] ? 0.25 : 0) - o.len / 500;
    return clamp(m, 0.3, 1);
  }

  launch(a, d, frac, target = -1) {
    const A = this.countries[a], D = this.countries[d];
    if (!A || !D || a === d || !A.alive) return { ok: false, msg: 'Cible invalide' };
    if (!D.neutral && !D.alive) return { ok: false, msg: 'Ce pays n’existe plus' };
    if (this.allied(a, d)) return { ok: false, msg: 'Vous êtes alliés : rompez d’abord l’alliance' };
    if (this.inTruce(a, d)) return { ok: false, msg: 'Une trêve est en cours' };
    const troops = A.army * clamp(frac, 0, 1);
    if (troops < 50) return { ok: false, msg: 'Armée insuffisante' };
    const front = this.findFront(a, d, target);
    if (!front) {
      const nav = this.canNavigate(A);
      return { ok: false, msg: nav ? 'Aucune frontière commune' : 'Aucune frontière terrestre (recherchez la Navigation)' };
    }
    if (!D.neutral && !this.atWar(a, d)) this.declareWar(a, d);
    A.army -= troops;
    const ex = this.offensives.find((o) => o.a === a && o.d === d);
    if (ex) {
      ex.troops += troops; ex.initial = Math.max(ex.initial, ex.troops);
      if (target >= 0) ex.target = target;
      return { ok: true, off: ex, merged: true };
    }
    const o = { id: this.nextOffId++, a, d, troops, initial: troops, target, cur: front.cur, src: front.src, naval: front.naval, len: front.len, progress: 0, fight: 0, t0: this.t, captured: 0 };
    this.offensives.push(o);
    this.emit('offensive', o);
    return { ok: true, off: o };
  }
  recall(offId) {
    const o = this.offensives.find((x) => x.id === offId);
    if (o) this.endOffensive(o, 'recall');
  }
  endOffensive(o, reason) {
    const i = this.offensives.indexOf(o);
    if (i < 0) return;
    this.offensives.splice(i, 1);
    const A = this.countries[o.a];
    if (A.alive) A.army += Math.max(0, o.troops) * (reason === 'recall' ? 0.9 : 1);
    if (o.a === this.playerId && (reason === 'exhausted' || reason === 'nofront') && o.captured === 0) {
      this.say(`🏳️ Notre offensive contre ${art(this.countries[o.d])} a échoué.`, 'war', { player: true });
    }
    this.emit('offensiveEnd', { o, reason });
  }

  stepOffensives(dt) {
    if (!this.offensives.length) return;
    const load = new Map();
    for (const o of this.offensives) load.set(o.d, (load.get(o.d) || 0) + o.troops);
    const cells = this.map.cells, rules = this.planet.rules;
    for (const o of [...this.offensives]) {
      const A = this.countries[o.a], D = this.countries[o.d];
      if (!A.alive || (!D.neutral && !D.alive)) { this.endOffensive(o, 'gone'); continue; }
      if (o.cur < 0 || this.owner[o.cur] !== o.d || this.owner[o.src] !== o.a) {
        const f = this.findFront(o.a, o.d, o.target);
        if (!f) { this.endOffensive(o, 'nofront'); continue; }
        o.cur = f.cur; o.src = f.src; o.naval = f.naval; o.len = f.len;
        o.progress = Math.min(o.progress, 0.25);
      }
      const cell = o.cur, cd = cells[cell];
      const qa = this.atkQ(A) * (o.naval ? this.navalMult(A, o) : 1);
      const { dArmy, dTroops, qd } = this.defenseAt(D, cell, o.troops, load.get(o.d) || 0);
      const sA = o.troops * qa, sD = dTroops * qd;
      const r = sA / Math.max(1, sD);
      const f = (1.7 * r * r) / (0.7 + r * r);
      const spd = BAL.CAPTURE_SPEED * (1 + A.mods.speed + A.perk.speed + A.tmod.speed) * (rules.speed || 1) * (o.naval ? 0.75 : 1);
      const size = Math.pow(cd.n / 900, 0.25);
      o.progress += (dt * spd * f) / Math.max(0.6, size);
      const killA = (BAL.KILL * sD * dt) / Math.sqrt(qa);
      const killD = (BAL.KILL * sA * dt) / Math.sqrt(qd);
      o.troops -= killA;
      A.losses += killA;
      if (dTroops > 0) {
        const fa = dArmy / dTroops;
        if (!D.neutral) { D.army = Math.max(0, D.army - Math.min(dArmy, killD * fa)); D.losses += killD * fa; }
        this.pop[cell] = Math.max(0.005, this.pop[cell] - (killD * (1 - fa)) / 1e6 * 0.4);
      }
      o.fight = Math.min(1, Math.log10(1 + (killA + killD) / dt) / 5);
      o.ratio = r;
      if (o.progress >= 1) {
        o.progress -= 1;
        o.captured++;
        this.capture(cell, o.a, o.src);
        o.cur = -1;
        // garnison : une partie des troupes reste sur place (rendue à la réserve)
        const gar = Math.min(o.troops, Math.max(this.militia(cell) * 1.5, o.initial * BAL.GARRISON));
        o.troops -= gar;
        A.army += gar;
      }
      if (this.offensives.includes(o) && o.troops < Math.max(150, o.initial * 0.03)) this.endOffensive(o, 'exhausted');
    }
  }

  capture(cell, a, src = -1, delay = 0) {
    const d = this.owner[cell];
    if (d === a) return;
    const A = this.countries[a], D = this.countries[d];
    this.owner[cell] = a;
    this.cellsOf[d].delete(cell);
    this.cellsOf[a].add(cell);
    this.ownVer++;
    this.unrest[cell] = 1;
    this.pop[cell] *= 0.96;
    for (let k = 0; k < NB; k++) {
      const idx = cell * NB + k;
      if (this.build[idx] && this.rng.chance(0.3)) this.build[idx]--;
    }
    if (this.build[cell * NB + BI.spaceport]) {
      for (const c of this.cellsOf[a]) if (c !== cell && this.build[c * NB + BI.spaceport]) { this.build[cell * NB + BI.spaceport] = 0; break; }
    }
    A.morale = Math.min(100, A.morale + 0.4);
    if (!D.neutral) D.morale = Math.max(5, D.morale - 0.8);
    this.hist.pend.push(cell, a);
    this.emit('capture', { cell, from: d, to: a, src, delay });
    if (!D.neutral) {
      if (this.cellsOf[d].size === 0) this.eliminate(d, a);
      else if (D.capital === cell) {
        this._relocateCapital(D);
        D.morale = Math.max(5, D.morale - 10);
        if (this.involvesPlayer(a, d) || this.notable(d)) {
          this.say(`🏰 ${Art(A)} ${v(A, "s'empare", "s'emparent")} de la capitale ${de(D)} !`, 'capture', { player: this.involvesPlayer(a, d), imp: true });
        }
      }
    }
    if (a === this.playerId && !this.conquered && this.cellsOf[a].size === this.nCells) {
      this.conquered = true;
      this.say(`🌍 Vous contrôlez toute la planète ${this.planet.name} !`, 'victory', { player: true, imp: true });
      this.emit('conquered');
    }
    if (d === this.playerId && this.conquered && this.cellsOf[d].size < this.nCells) this.conquered = false;
  }

  _relocateCapital(c) {
    let best = -1, bp = -1;
    for (const cell of this.cellsOf[c.id]) if (this.pop[cell] > bp) { bp = this.pop[cell]; best = cell; }
    c.capital = best;
  }

  eliminate(d, by) {
    const D = this.countries[d], A = this.countries[by];
    D.alive = false; D.army = 0;
    for (const o of [...this.offensives]) {
      if (o.a === d) { o.troops = 0; this.endOffensive(o, 'gone'); }
      else if (o.d === d) this.endOffensive(o, 'victory');
    }
    for (const [k, w] of this.wars) if (w.a === d || w.b === d) this.wars.delete(k);
    for (const k of [...this.alliances]) if (Math.floor(k / 4096) === d || k % 4096 === d) this.alliances.delete(k);
    this.proposals = this.proposals.filter((p) => p.from !== d);
    const pl = this.involvesPlayer(d, by);
    this.say(`💥 ${Art(A)} ${v(A, 'annexe', 'annexent')} ${art(D)} !`, 'annex', { player: pl, imp: pl || this.notable(by) || D.peakCells >= 6 });
    this.emit('eliminated', { id: d, by });
    if (d === this.playerId) {
      this.over = 'defeat';
      this.emit('defeat');
    }
  }

  surrender(loser, winner) {
    const L = this.countries[loser], Wn = this.countries[winner];
    this.say(`🏳️ ${Art(L)} ${v(L, 'capitule', 'capitulent')} face ${aFr(Wn)} !`, 'annex', { player: this.involvesPlayer(loser, winner), imp: true });
    const cells = [...this.cellsOf[loser]];
    const ref = Wn.capital >= 0 ? Wn.capital : cells[0];
    cells.sort((x, y) => this.dist(x, ref) - this.dist(y, ref));
    cells.forEach((cid, i) => this.capture(cid, winner, -1, i * 0.12));
  }

  // ---------- propositions de l'IA au joueur ----------
  propose(type, from) {
    if (this.proposals.some((p) => p.from === from && p.type === type)) return;
    const F = this.countries[from];
    if (F.ai.lastProp && this.t - F.ai.lastProp < 120) return;
    if (this.proposals.length >= 3) return;
    F.ai.lastProp = this.t;
    const p = { id: this.nextPropId++, type, from, until: this.t + 35 };
    this.proposals.push(p);
    this.emit('proposal', p);
  }
  answer(propId, accept) {
    const p = this.proposals.find((x) => x.id === propId);
    if (!p) return;
    this.proposals = this.proposals.filter((x) => x !== p);
    const F = this.countries[p.from];
    if (!F.alive) return;
    if (!accept) { this.addRel(p.from, this.playerId, -10); return; }
    if (p.type === 'peace') this.makePeace(p.from, this.playerId);
    else if (p.type === 'alliance') this.makeAlliance(p.from, this.playerId);
  }

  // ---------- actions diplomatiques du joueur ----------
  playerProposePeace(target) {
    if (!this.atWar(this.playerId, target)) return { ok: false, msg: 'Vous n’êtes pas en guerre' };
    if (acceptPeace(this, target, this.playerId)) { this.makePeace(this.playerId, target); return { ok: true, msg: 'Paix acceptée' }; }
    this.addRel(this.playerId, target, -3);
    return { ok: false, msg: `${Art(this.countries[target])} ${v(this.countries[target], 'refuse', 'refusent')} la paix` };
  }
  playerProposeAlliance(target) {
    if (this.atWar(this.playerId, target)) return { ok: false, msg: 'Faites d’abord la paix' };
    if (this.allied(this.playerId, target)) return { ok: false, msg: 'Déjà alliés' };
    if (acceptAlliance(this, target, this.playerId)) { this.makeAlliance(this.playerId, target); return { ok: true, msg: 'Alliance conclue' }; }
    this.addRel(this.playerId, target, -2);
    return { ok: false, msg: `${Art(this.countries[target])} ${v(this.countries[target], 'décline', 'déclinent')} l'alliance` };
  }
  playerDemandSurrender(target) {
    if (!this.atWar(this.playerId, target)) return { ok: false, msg: 'Vous n’êtes pas en guerre' };
    if (acceptSurrender(this, target, this.playerId)) { this.surrender(target, this.playerId); return { ok: true, msg: 'Reddition acceptée !' }; }
    this.addRel(this.playerId, target, -8);
    return { ok: false, msg: `${Art(this.countries[target])} ${v(this.countries[target], 'refuse', 'refusent')} de capituler` };
  }

  // ---------- fusée ----------
  rocketStatus() {
    const P = this.countries[this.playerId];
    return {
      conquered: this.conquered,
      space: P.era >= 4,
      colonization: P.techs.has('colonization'),
      spaceport: this.hasBuilding(this.playerId, 'spaceport') >= 0,
      gold: P.gold >= BAL.ROCKET_COST,
    };
  }
  startRocket() {
    const s = this.rocketStatus();
    if (this.rocket.stage !== 0) return { ok: false };
    if (!(s.conquered && s.space && s.colonization && s.spaceport)) return { ok: false, msg: 'Conditions non remplies' };
    if (!s.gold) return { ok: false, msg: 'Or insuffisant' };
    this.countries[this.playerId].gold -= BAL.ROCKET_COST;
    this.rocket.stage = 1;
    this.say('🏗️ Construction de la fusée interplanétaire lancée.', 'space', { player: true });
    return { ok: true };
  }
  launchRocket() {
    if (this.rocket.stage !== 2) return { ok: false };
    this.rocket.stage = 3;
    this.emit('launch');
    return { ok: true };
  }

  // ---------- boucle ----------
  advance(seconds) {
    this.tickAcc += seconds;
    let n = 0;
    while (this.tickAcc >= BAL.TICK && n < 80) {
      this.tick(BAL.TICK);
      this.tickAcc -= BAL.TICK;
      n++;
    }
    if (n >= 80) this.tickAcc = 0;
  }
  tick(dt) {
    if (this.over) return;
    this.t += dt;
    this.stepOffensives(dt);
    this.econAcc += dt;
    if (this.econAcc >= BAL.ECON_DT) {
      this.econ(this.econAcc);
      this.econAcc = 0;
      this.computeBorders();
    }
    aiTick(this, dt);
    eventsTick(this, dt);
    if (this.t >= this.hist.next) this.flushHist();
    if (this.proposals.length) this.proposals = this.proposals.filter((p) => p.until > this.t);
  }

  flushHist() {
    const h = this.hist;
    if (h.pend.length) { h.frames.push({ t: Math.round(this.t * 10) / 10, ch: h.pend }); h.pend = []; }
    h.next = this.t + 2;
  }

  // ---------- sauvegarde ----------
  serialize() {
    return {
      v: 1, t: this.t, playerId: this.playerId, conquered: this.conquered, over: this.over,
      rocket: this.rocket, nextEvent: this.nextEvent, eraFirsts: this.eraFirsts, rng: this.rng.s,
      nextOffId: this.nextOffId, nextPropId: this.nextPropId,
      owner: Array.from(this.owner),
      pop: Array.from(this.pop, (v) => Math.round(v * 1000) / 1000),
      base: Array.from(this.base, (v) => Math.round(v * 1000) / 1000),
      build: Array.from(this.build),
      unrest: Array.from(this.unrest, (v) => Math.round(v * 100) / 100),
      countries: this.countries.map((c) => ({
        id: c.id, name: c.name, art: c.art, title: c.title, color: c.color, neutral: c.neutral, isPlayer: c.isPlayer,
        alive: c.alive, capital: c.capital, army: Math.round(c.army), gold: Math.round(c.gold * 10) / 10,
        morale: Math.round(c.morale * 10) / 10, rp: Math.round(c.rp * 10) / 10, techs: [...c.techs], repeat: c.repeat,
        perk: c.perk, temp: c.temp, peakCells: c.peakCells, losses: Math.round(c.losses), ai: c.ai,
      })),
      offensives: this.offensives.map((o) => ({ ...o })),
      wars: [...this.wars.values()],
      alliances: [...this.alliances],
      truces: [...this.truces],
      relations: [...this.relations],
      news: this.news.slice(-60),
      proposals: this.proposals,
      hist: (this.flushHist(), { init: this.hist.init, frames: this.hist.frames }),
    };
  }

  static restore(map, opts, s) {
    const g = new Game(map, opts);
    g.t = s.t; g.playerId = s.playerId; g.conquered = s.conquered; g.over = s.over; g.rocket = s.rocket;
    g.nextEvent = s.nextEvent; g.eraFirsts = s.eraFirsts; g.rng.s = s.rng; g.nextOffId = s.nextOffId; g.nextPropId = s.nextPropId;
    g.owner.set(s.owner); g.pop.set(s.pop); g.base.set(s.base); g.build.set(s.build); g.unrest.set(s.unrest);
    for (const d of s.countries) {
      const c = g._addCountry({ name: d.name, art: d.art, title: d.title, color: d.color, neutral: d.neutral, capital: d.capital });
      Object.assign(c, {
        isPlayer: d.isPlayer, alive: d.alive, army: d.army, gold: d.gold, morale: d.morale, rp: d.rp,
        techs: new Set(d.techs), repeat: d.repeat || {}, perk: { ...emptyMods(), ...d.perk }, temp: d.temp || [],
        peakCells: d.peakCells, losses: d.losses || 0, ai: d.ai,
      });
      if (!c.neutral) g._refreshTech(c, true);
    }
    g._recount();
    for (const c of g.countries) if (!c.neutral) c.alive = s.countries[c.id].alive && g.cellsOf[c.id].size > 0;
    g.offensives = s.offensives;
    for (const w of s.wars) g.wars.set(pairKey(w.a, w.b), w);
    g.alliances = new Set(s.alliances);
    g.truces = new Map(s.truces);
    g.relations = new Map(s.relations);
    g.news = s.news || [];
    g.proposals = s.proposals || [];
    if (s.hist && s.hist.init) { g.hist.init = s.hist.init; g.hist.frames = s.hist.frames || []; }
    else g.hist.init = Array.from(g.owner);
    g.hist.next = g.t + 2;
    g.econ(0.01);
    g.computeBorders();
    return g;
  }
}

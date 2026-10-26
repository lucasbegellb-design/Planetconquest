// Générateur de noms (pays, régions, planètes, étoiles) aux sonorités propres à chaque type de planète.
import { articleFor, cap } from '../core/fr.js';

const SETS = {
  terran: {
    a: ['Val', 'Mor', 'Ar', 'Bel', 'Cal', 'Dor', 'El', 'Fal', 'Gar', 'Hel', 'Is', 'Kar', 'Lor', 'Mar', 'Nor', 'Or', 'Pel', 'Ros', 'Sal', 'Tor', 'Ul', 'Var', 'Zan', 'Bren', 'Cor', 'Drav', 'Ess', 'Fen', 'Gal', 'Lun', 'Mel', 'Ost', 'Rav', 'Sev', 'Tal', 'Ves', 'Alb', 'Brev', 'Cast', 'Lys'],
    m: ['', '', 'a', 'e', 'i', 'o', 'an', 'en', 'ar', 'or', 'el', 'il', 'ad', 'ur', 'ov', 'en'],
    z: ['ie', 'ia', 'and', 'or', 'ane', 'ise', 'onie', 'avie', 'ence', 'ark', 'ur', 'is', 'ande', 'ovie', 'istan', 'ène', 'erre', 'ac', 'onne', 'ugue', 'ois'],
  },
  desert: {
    a: ['Khar', 'Zah', 'Sar', 'Ash', 'Dun', 'Rab', 'Tam', 'Qas', 'Mer', 'Nub', 'Sab', 'Jaz', 'Kel', 'Ouar', 'Tib', 'Ham', 'Adr', 'Zir', 'Bak', 'Sul'],
    m: ['', '', 'a', 'i', 'ou', 'an', 'ar', 'eb', 'im'],
    z: ['ad', 'an', 'ir', 'ah', 'ara', 'oum', 'esh', 'ie', 'abad', 'ine', 'ane', 'out', 'ia', 'em'],
  },
  ocean: {
    a: ['Thal', 'Mar', 'Cor', 'Aqu', 'Lag', 'Nai', 'Per', 'Sel', 'Ond', 'Nér', 'Kel', 'Abys', 'Ran', 'Bry', 'Oce', 'Ul', 'Tri', 'Sir'],
    m: ['', 'a', 'e', 'i', 'o', 'al', 'is', 'en'],
    z: ['ée', 'ine', 'ys', 'os', 'ide', 'arée', 'ie', 'ia', 'ène', 'ule', 'ane', 'ondie'],
  },
  glacial: {
    a: ['Fros', 'Niv', 'Hel', 'Skad', 'Bor', 'Ys', 'Kri', 'Vint', 'Gla', 'Hiv', 'Jar', 'Nor', 'Sval', 'Tun', 'Iss', 'Kald', 'Rim', 'Brum'],
    m: ['', 'a', 'e', 'i', 'o', 'en', 'ar'],
    z: ['heim', 'ard', 'und', 'ik', 'ève', 'ane', 'ie', 'ia', 'or', 'ise', 'old', 'aune', 'ence'],
  },
  volcanic: {
    a: ['Ign', 'Pyr', 'Vul', 'Cendr', 'Mag', 'Ardh', 'Sulf', 'Brul', 'Fum', 'Obs', 'Bas', 'Tef', 'Kra', 'Lav', 'Sco', 'Ather'],
    m: ['', 'a', 'e', 'i', 'o', 'ar', 'or', 'ul'],
    z: ['ax', 'or', 'ion', 'ère', 'arque', 'eth', 'ie', 'ia', 'ane', 'ombe', 'yre', 'idie'],
  },
  gas: {
    a: ['Aer', 'Neb', 'Zeph', 'Strat', 'Cumul', 'Vap', 'Ion', 'Hel', 'Nim', 'Cir', 'Alt', 'Aur', 'Plas', 'Éth', 'Sil', 'Vor'],
    m: ['', 'a', 'e', 'i', 'o', 'el', 'is'],
    z: ['is', 'a', 'ion', 'ée', 'ys', 'ane', 'ie', 'ia', 'ore', 'ule', 'ence', 'ine'],
  },
  jungle: {
    a: ['Ver', 'Sylv', 'Lian', 'Mang', 'Orch', 'Tal', 'Ombr', 'Cay', 'Mal', 'Tuk', 'Xan', 'Amaz', 'Bam', 'Kap', 'Zul', 'Yuc'],
    m: ['', 'a', 'e', 'i', 'o', 'an', 'ou', 'al'],
    z: ['ie', 'ana', 'ora', 'ève', 'ine', 'ia', 'ec', 'ango', 'ari', 'ule', 'aya', 'ande'],
  },
};

const TITLES_F = ['République', 'Fédération', 'Principauté', 'Confédération', 'Union', 'Théocratie', 'Ligue'];
const TITLES_M = ['Royaume', 'Empire', 'Sultanat', 'Duché', 'Califat', 'Khanat', 'Dominion', 'Protectorat'];

export class NameGen {
  constructor(rng, type = 'terran') {
    this.rng = rng;
    this.set = SETS[type] || SETS.terran;
    this.used = new Set();
  }
  _raw(parts = 3) {
    const r = this.rng, s = this.set;
    let n = r.pick(s.a);
    if (parts >= 3 && r.chance(0.55)) n += r.pick(s.m);
    n += r.pick(s.z);
    n = n.replace(/([aeiouy])\1+/g, '$1').replace(/([^aeiouy])\1\1+/g, '$1$1');
    return cap(n.toLowerCase());
  }
  unique(parts = 3) {
    for (let t = 0; t < 40; t++) {
      const n = this._raw(parts);
      if (n.length >= 4 && n.length <= 13 && !this.used.has(n)) { this.used.add(n); return n; }
    }
    const n = this._raw(parts) + ' ' + (this.used.size + 1);
    this.used.add(n);
    return n;
  }
  country() {
    const name = this.unique(3);
    const art = articleFor(name);
    const r = this.rng;
    const title = r.chance(0.5) ? r.pick(TITLES_F) : r.pick(TITLES_M);
    return { name, art, title };
  }
  region() { return this.unique(2); }
}

const GREEK = ['Alpha', 'Bêta', 'Gamma', 'Delta', 'Epsilon', 'Zêta', 'Êta', 'Thêta', 'Iota', 'Kappa', 'Lambda', 'Sigma', 'Tau', 'Oméga'];
const STAR_A = ['Kep', 'Gli', 'Ross', 'Wolf', 'Lal', 'Trap', 'Vega', 'Alde', 'Proc', 'Rig', 'Cast', 'Deneb', 'Mira', 'Sirr', 'Achern', 'Bellat', 'Zaur', 'Talith'];
const STAR_Z = ['ler', 'ese', 'an', 'is', 'ar', 'ion', 'ah', 'ux', 'el', 'or', 'ia', 'ys'];
const GALAXIES = ['Voie lactée', 'Andromède', 'Triangle', 'Grand Nuage de Magellan', 'Sombrero', 'Tourbillon', 'Moulinet', 'Œil Noir', 'Cigare', 'Roue de Chariot'];

export function starName(rng) {
  const r = rng.next();
  if (r < 0.35) return rng.pick(GREEK) + ' ' + rng.pick(['Ceti', 'Centauri', 'Draconis', 'Eridani', 'Pavonis', 'Lyrae', 'Orionis', 'Cygni', 'Hydrae', 'Aquilae']);
  if (r < 0.65) return rng.pick(['Kepler', 'Gliese', 'HD', 'TOI', 'Ross', 'Wolf', 'TRAPPIST', 'LHS']) + '-' + rng.int(10, 1999);
  return cap(rng.pick(STAR_A) + rng.pick(STAR_Z));
}

export function galaxyName(index, rng) {
  if (index < GALAXIES.length) return GALAXIES[index];
  return rng.pick(['NGC', 'Messier', 'IC', 'UGC']) + ' ' + rng.int(100, 9999);
}

export function planetName(rng, type) {
  const g = new NameGen(rng, type);
  return g.unique(rng.chance(0.5) ? 2 : 3);
}

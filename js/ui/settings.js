// Réglages de l'interface, conservés dans le navigateur.
const KEY = 'terra-conquest-settings';
const DEFAULTS = {
  pauseWar: true,        // pause automatique quand un pays vous déclare la guerre
  pauseAttack: false,    // … quand une offensive vise votre territoire
  pauseProposal: false,  // … quand une proposition diplomatique arrive
  pauseCrisis: false,    // … quand une crise mondiale éclate
  volume: 0.5,           // volume des effets sonores (0–1)
  textScale: 1,          // taille du texte de l'interface
  colorblind: false,     // palette adaptée (rouge/vert remplacés par bleu/orange)
  reduceMotion: false,   // moins d'animations (secousses, particules)
  vibration: 1,          // intensité des vibrations (0–1)
};

let cur = { ...DEFAULTS };
try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* stockage indisponible */ }
const listeners = [];

export const settings = {
  get: (k) => cur[k],
  all: () => ({ ...cur }),
  set(k, v) {
    cur[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ }
    for (const fn of listeners) fn(k, v);
  },
  onChange: (fn) => listeners.push(fn),
  reset() { for (const k in DEFAULTS) settings.set(k, DEFAULTS[k]); },
};

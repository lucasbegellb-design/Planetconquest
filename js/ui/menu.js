// Écran d'accueil : mode de jeu, graine, paramètres.
import { $, $$, toast } from './dom.js';
import { PLANET_TYPES } from '../map/planetTypes.js';
import { randomSeed } from '../core/rng.js';

const PREFS = 'terra-conquest-prefs';
const EARTH_MAX = 175;

export function initMenu(h) {
  const card = $('.menu-card');
  const seed = $('#seed'), ptype = $('#ptype'), nai = $('#nai'), naiVal = $('#nai-val');
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { prefs = {}; }

  for (const [id, t] of Object.entries(PLANET_TYPES)) {
    if (id === 'gas') continue;
    const o = document.createElement('option');
    o.value = id; o.textContent = t.name;
    ptype.appendChild(o);
  }

  const params = new URLSearchParams(location.search);
  let mode = params.get('seed') ? 'proc' : prefs.mode || 'earth';
  seed.value = params.get('seed') || randomSeed();
  ptype.value = params.get('type') && PLANET_TYPES[params.get('type')] ? params.get('type') : prefs.type || 'terran';
  if (prefs.difficulty) $('#diff').value = prefs.difficulty;
  if (prefs.speed) $('#speed0').value = String(prefs.speed);
  if (prefs.pace) $('#pace').value = String(prefs.pace);
  const naiFor = { earth: prefs.naiEarth || EARTH_MAX, proc: prefs.naiProc || 24 };

  const updNai = () => {
    const v = +nai.value;
    naiVal.textContent = mode === 'earth' && v >= EARTH_MAX ? 'tous (≈ 175)' : String(v);
  };
  const setMode = (m) => {
    mode = m;
    card.classList.toggle('proc', m === 'proc');
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    nai.min = m === 'earth' ? 10 : 6;
    nai.max = m === 'earth' ? EARTH_MAX : 60;
    nai.value = naiFor[m];
    updNai();
  };
  $$('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
  nai.addEventListener('input', () => { naiFor[mode] = +nai.value; updNai(); });
  $('#seed-rand').addEventListener('click', () => { seed.value = randomSeed(); });
  $('#seed-share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?seed=${encodeURIComponent(seed.value.trim())}&type=${ptype.value}`;
    try { await navigator.clipboard.writeText(url); toast('🔗 Lien copié dans le presse-papiers', 'ok'); }
    catch { prompt('Lien de partage :', url); }
  });
  setMode(mode);

  const settings = () => {
    const s = {
      mode, seed: (seed.value.trim() || randomSeed()).slice(0, 24), type: ptype.value,
      nAI: mode === 'earth' && +nai.value >= EARTH_MAX ? 0 : +nai.value,
      difficulty: $('#diff').value, speed: +$('#speed0').value, pace: +$('#pace').value,
    };
    try {
      localStorage.setItem(PREFS, JSON.stringify({ mode, type: s.type, difficulty: s.difficulty, speed: s.speed, pace: s.pace, naiEarth: naiFor.earth, naiProc: naiFor.proc }));
    } catch { /* stockage indisponible */ }
    return s;
  };

  $('#btn-new').addEventListener('click', () => h.onNew(settings()));
  $('#btn-continue').addEventListener('click', () => h.onContinue());
  $('#btn-help').addEventListener('click', () => h.onHelp());
  $('#btn-load').addEventListener('click', () => h.onLoad());
  $('#btn-settings').addEventListener('click', () => h.onSettings());
  $('#btn-ach').addEventListener('click', () => h.onAchievements());
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) h.onImport(await f.text());
  });
  return { setContinue: (on) => { $('#btn-continue').hidden = !on; }, settings };
}

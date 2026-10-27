// Écran des réglages et application des préférences (son, vibrations, texte, couleurs, animations, pauses).
import { openModal, toast } from './dom.js';
import { settings } from './settings.js';

const PAUSES = [
  ['pauseWar', 'quand un pays vous déclare la guerre'],
  ['pauseAttack', 'quand une offensive vise votre territoire'],
  ['pauseProposal', 'quand une proposition diplomatique arrive'],
  ['pauseCrisis', 'quand une crise mondiale éclate'],
];
const SCALES = [[0.9, 'Petit'], [1, 'Normal'], [1.15, 'Grand'], [1.3, 'Très grand']];

// applique les réglages à la page (appelé au démarrage et à chaque changement)
export function applySettings(app) {
  const s = settings.all();
  document.documentElement.style.setProperty('--ui-scale', s.textScale);
  document.body.classList.toggle('ui-scaled', s.textScale !== 1);
  document.body.classList.toggle('cb', !!s.colorblind);
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  if (app.sound) app.sound.setVolume(s.volume, s.vibration);
  if (app.renderer) app.renderer.reduceMotion = !!s.reduceMotion;
  if (app.game && app.mapMode && app.mapMode !== 'pol') app.setMapMode(app.mapMode); // palette daltonienne
}

export function openSettings(app) {
  const root = openModal('<div id="set-root"></div>', { narrow: true });
  const box = root.querySelector('#set-root');
  const render = () => {
    const s = settings.all(), snd = app.sound;
    box.innerHTML = `<h2>⚙️ Réglages</h2>
      <h3>🔊 Son et vibrations</h3>
      <label class="check"><input type="checkbox" data-k="sound" ${snd.on ? 'checked' : ''}> Effets sonores</label>
      <div class="set-row"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume" ${snd.on ? '' : 'disabled'}><b>${Math.round(s.volume * 100)} %</b></div>
      <label class="check"><input type="checkbox" data-k="haptics" ${snd.haptics ? 'checked' : ''}> Vibrations (mobile)</label>
      <div class="set-row"><span>Intensité</span><input type="range" min="0.2" max="1.5" step="0.1" value="${s.vibration}" data-k="vibration" ${snd.haptics ? '' : 'disabled'}><b>${Math.round(s.vibration * 100)} %</b></div>
      <p class="hint">Le jeu n’a pas de musique : seulement des effets (combats, conquêtes, alertes).</p>
      <h3>👁️ Affichage</h3>
      <div class="set-row"><span>Taille du texte</span><select data-k="textScale">${SCALES.map(([v, l]) => `<option value="${v}" ${v === s.textScale ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" data-k="colorblind" ${s.colorblind ? 'checked' : ''}> Mode daltonien (bleu / orange au lieu de vert / rouge)</label>
      <label class="check"><input type="checkbox" data-k="reduceMotion" ${s.reduceMotion ? 'checked' : ''}> Réduire les animations (explosions, particules, effets)</label>
      <h3>⏸ Pause automatique</h3>
      ${PAUSES.map(([k, l]) => `<label class="check"><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}> ${l}</label>`).join('')}
      <p class="hint">Sans effet en multijoueur (la partie ne s’arrête pas pour tout le monde).</p>
      <h3>🎓 Aide</h3>
      <label class="check"><input type="checkbox" data-k="advisor" ${app.advisor.on ? 'checked' : ''}> Conseiller (astuces selon la situation)</label>
      <div class="btn-row"><button class="btn" data-a="tuto">🎓 Revoir le tutoriel</button><button class="btn ghost" data-a="reset">↺ Réglages par défaut</button></div>`;
  };
  box.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (k === 'volume' || k === 'vibration') {
      settings.set(k, +e.target.value);
      e.target.nextElementSibling.textContent = Math.round(+e.target.value * 100) + ' %';
      applySettings(app);
      if (k === 'volume') app.sound.click(); else app.sound.buzz(40);
    }
  });
  box.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k || k === 'volume' || k === 'vibration') return;
    const v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    if (k === 'sound') app.sound.setSound(v);
    else if (k === 'haptics') app.sound.setHaptics(v);
    else if (k === 'advisor') app.advisor.setOn(v);
    else settings.set(k, v);
    applySettings(app);
    render();
  });
  box.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'reset') { settings.reset(); applySettings(app); render(); toast('Réglages par défaut rétablis.', 'ok'); }
    else if (a.dataset.a === 'tuto') { app.tutorial.restart(); toast('🎓 Le tutoriel reprendra dans votre partie.', 'ok'); }
  });
  render();
}

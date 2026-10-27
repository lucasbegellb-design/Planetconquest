// Tutoriel des premières minutes : une suite d'objectifs simples, cochés automatiquement.
import { $, toast } from './dom.js';
import { NB } from '../tech/buildings.js';

const KEY = 'terra-conquest-tuto';
const STEPS = [
  { id: 'select', title: 'Touchez votre pays', how: 'Touchez un de vos territoires (ou votre nom en haut à gauche) pour ouvrir son panneau.', ok: (app, g, s) => app.sel.cell >= 0 && g.owner[app.sel.cell] === g.playerId },
  { id: 'build', title: 'Construisez un bâtiment', how: 'Dans le panneau de votre territoire, construisez une ferme ou une mine. Le gouverneur automatique peut s’en charger ensuite.', ok: (app, g, s) => buildings(g) > s.builds },
  { id: 'conquer', title: 'Conquérez un territoire', how: 'Touchez des terres libres (grises) ou un voisin faible, puis « Attaquer ». Astuce : glissez depuis votre pays vers la cible.', ok: (app, g, s) => g.cellsOf[g.playerId].size > s.cells },
  { id: 'tech', title: 'Recherchez une technologie', how: 'Ouvrez les technologies (🔬 ou touche T) et choisissez dans l’un des trois arbres.', ok: (app, g, s) => g.countries[g.playerId].techs.size > s.techs },
  { id: 'gov', title: 'Choisissez un gouvernement', how: 'Ouvrez l’Empire (🏛️ ou touche E) : le premier choix est gratuit.', ok: (app, g) => g.countries[g.playerId].gov !== 'tribe' },
  { id: 'map', title: 'Essayez un mode de carte', how: 'Le bouton 🗺️ (ou M) colore la carte par diplomatie, ressources, agitation ou front.', ok: (app) => app.mapMode && app.mapMode !== 'pol' },
  { id: 'detail', title: 'Comprenez vos chiffres', how: 'Touchez l’or ou l’armée dans la barre du haut pour voir d’où ils viennent. Les statistiques (touche S) comparent votre empire aux autres.', ok: (app) => !!app.hud.tipKey || app.statTab !== undefined },
];
const buildings = (g) => { let n = 0; for (const c of g.cellsOf[g.playerId]) for (let k = 0; k < NB; k++) n += g.build[c * NB + k]; return n; };

export class Tutorial {
  constructor(app) {
    this.app = app;
    this.el = $('#tuto');
    try { this.done = localStorage.getItem(KEY) === 'done'; } catch { this.done = true; }
    this.active = false;
    this.el.addEventListener('click', (e) => { if (e.target.closest('[data-skip]')) this.finish(true); });
  }
  restart() { this.done = false; try { localStorage.removeItem(KEY); } catch { /* ignore */ } if (this.app.game) this.start(this.app.game); }
  start(g) {
    this.active = !this.done && !this.app.multi.active && g.planet.level === 0;
    this.el.hidden = !this.active;
    document.body.classList.toggle('tuto-on', this.active);
    if (!this.active) return;
    this.step = 0;
    this.snap(g);
    this.render();
  }
  // état de référence pour l'étape en cours
  snap(g) {
    const P = g.countries[g.playerId];
    this.s = { builds: buildings(g), cells: g.cellsOf[g.playerId].size, techs: P.techs.size };
  }
  tick() {
    const app = this.app, g = app.game;
    if (!this.active || !g) return;
    if (STEPS[this.step].ok(app, g, this.s)) {
      app.sound.click();
      this.step++;
      if (this.step >= STEPS.length) { this.finish(false); return; }
      this.snap(g);
      this.render();
    }
  }
  render() {
    const st = STEPS[this.step];
    this.el.innerHTML = `<div class="tuto-head"><b>🎓 Premiers pas</b><span class="hint">${this.step + 1}/${STEPS.length}</span><button class="btn small ghost" data-skip title="Passer le tutoriel">Passer</button></div>
      <div class="meter"><div style="width:${(this.step / STEPS.length) * 100}%"></div></div>
      <p><b>${st.title}</b><br>${st.how}</p>`;
  }
  finish(skipped) {
    this.active = false;
    this.done = true;
    this.el.hidden = true;
    document.body.classList.remove('tuto-on');
    try { localStorage.setItem(KEY, 'done'); } catch { /* ignore */ }
    if (!skipped) toast('🎓 Tutoriel terminé ! Le conseiller 🧭 prend le relais. À vous de jouer.', 'ok', 5000);
  }
  hide() { this.el.hidden = true; document.body.classList.remove('tuto-on'); this.active = false; }
}

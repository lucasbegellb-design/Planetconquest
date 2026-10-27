// Conseiller à l'écran : de temps en temps, l'astuce la plus utile du moment (jamais la même deux fois de suite).
import { $, esc, toast, modalOpen } from './dom.js';
import { advise } from '../sim/advisor.js';

const KEY = 'terra-conquest-advisor';
const FIRST = 20, EVERY = 40, SHOW = 14, REPEAT = 240; // secondes réelles

export class Advisor {
  constructor(app) {
    this.app = app;
    this.el = $('#advisor');
    try { this.on = localStorage.getItem(KEY) !== 'off'; } catch { this.on = true; }
    this.reset();
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      this.hide();
      if (b.dataset.a === 'off') { this.setOn(false); toast('🧭 Conseiller désactivé (réactivable dans le menu ☰).', '', 3500); }
    });
  }
  setOn(v) {
    this.on = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* ignore */ }
    if (!v) this.hide();
  }
  reset() { this.clock = 0; this.nextAt = FIRST; this.hideAt = 0; this.last = new Map(); this.hide(); }
  hide() { this.el.hidden = true; }

  tick(dt) {
    const g = this.app.game;
    if (!this.on || !g || g.over || modalOpen()) return;
    this.clock += dt;
    if (!this.el.hidden && this.clock > this.hideAt) this.hide();
    if (this.clock < this.nextAt) return;
    this.nextAt = this.clock + EVERY;
    const tip = advise(g, g.playerId).find((t) => !(this.clock - (this.last.get(t.k) ?? -1e9) < REPEAT));
    if (tip) this.show(tip);
  }
  show(t) {
    this.last.set(t.k, this.clock);
    this.hideAt = this.clock + SHOW;
    this.el.innerHTML = `<div class="adv-head">🧭 Conseiller</div><p>${esc(t.text)}</p>
      <div class="adv-btns"><button class="btn small" data-a="ok">Compris</button><button class="btn small ghost" data-a="off">Ne plus afficher</button></div>`;
    this.el.hidden = false;
  }
}

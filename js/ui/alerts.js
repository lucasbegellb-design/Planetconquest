// Alertes importantes : regroupées, cliquables (la carte se rend sur place) et pause automatique optionnelle.
import { toast, esc } from './dom.js';
import { Art, v } from '../core/fr.js';
import { CRISES } from '../sim/military.js';
import { settings } from './settings.js';

const GROUP_MS = 4000;

export class Alerts {
  constructor(app) {
    this.app = app;
    this.groups = new Map(); // clé -> { el, items, t }
    this.lastAttack = new Map();
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]');
      if (!b) return;
      e.stopPropagation();
      this.app.goToCell(+b.dataset.goto);
    });
  }

  attach(game) {
    this.groups.clear();
    this.lastAttack.clear();
    const pid = () => game.playerId;
    game.on('war', (w) => {
      if (w.b !== pid()) return;
      this.push('war', { name: game.countries[w.a], cell: game.borderCell(pid(), w.a) }, (items) => {
        const C = items[0].name;
        return items.length === 1
          ? `⚔️ ${esc(Art(C))} ${v(C, 'vous déclare', 'vous déclarent')} la guerre !`
          : `⚔️ ${items.length} pays vous déclarent la guerre : ${items.map((x) => esc(x.name.name)).join(', ')}`;
      }, 'err', 'pauseWar', 'déclaration de guerre');
    });
    game.on('offensive', (o) => {
      if (o.d !== pid() || game.countries[o.a].neutral) return;
      if (game.t - (this.lastAttack.get(o.a) ?? -1e9) < 40) return; // pas plus d'une alerte par attaquant toutes les 40 s
      this.lastAttack.set(o.a, game.t);
      this.push('attack', { name: game.countries[o.a], cell: o.cur }, (items) => items.length === 1
        ? `🛡️ ${esc(Art(items[0].name))} ${v(items[0].name, 'lance', 'lancent')} une offensive contre vous`
        : `🛡️ ${items.length} offensives contre vous (${items.map((x) => esc(x.name.name)).join(', ')})`, 'err', 'pauseAttack', 'offensive ennemie');
    });
    game.on('crisis', (c) => {
      const C = CRISES[c.id];
      this.push('crisis', { cell: -1 }, () => `${C.icon} ${C.name} : ${C.desc}`, '', 'pauseCrisis', 'crise mondiale');
    });
    game.on('proposal', (p) => { if (p.to === pid()) this.autoPause('pauseProposal', 'proposition diplomatique'); });
  }

  // regroupe les alertes de même nature arrivées en rafale
  push(key, item, render, kind, pauseKey, why) {
    const now = performance.now();
    let gr = this.groups.get(key);
    if (gr && now - gr.t < GROUP_MS && gr.el.isConnected) gr.items.push(item);
    else {
      gr = { items: [item], t: now, el: toast('', kind, 6000) };
      if (!gr.el) return;
      this.groups.set(key, gr);
    }
    gr.t = now;
    const cell = gr.items.find((x) => x.cell >= 0)?.cell ?? -1;
    gr.el.innerHTML = render(gr.items) + (cell >= 0 ? ` <button class="btn small goto" data-goto="${cell}">📍 Voir</button>` : '');
    gr.el.classList.add('alert');
    if (pauseKey) this.autoPause(pauseKey, why);
  }

  autoPause(key, why) {
    const app = this.app;
    if (!settings.get(key) || app.multi.active || app.speed === 0 || app.mode !== 'play') return;
    app.setSpeed(0);
    const how = matchMedia('(hover: hover)').matches ? 'Espace' : 'touchez x1';
    toast(`⏸ Pause automatique (${why}). <small>${how} pour reprendre · réglable dans ☰ → Réglages</small>`, '', 3500);
  }
}


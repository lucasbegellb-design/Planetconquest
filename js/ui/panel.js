// Panneau du territoire / pays sélectionné : informations, attaque, diplomatie, bâtiments, armée.
import { $, $$, esc, toast } from './dom.js';
import { fmtBig, fmtPop, fmtInt, fmt1, rgbToCss } from '../core/util.js';
import { BUILDINGS, BI, NB } from '../tech/buildings.js';
import { ERAS } from '../tech/techtree.js';
import { BIOMES } from '../map/biomes.js';
import { Art, art } from '../core/fr.js';
import { BAL } from '../sim/balance.js';
import { GOV_MODES, bulkCost } from '../sim/governor.js';
import { AI_STYLES } from '../sim/balance.js';
import { pairKey } from '../sim/game.js';

const PRESETS = [25, 50, 75, 100];
const mobile = () => matchMedia('(max-width: 760px), (max-height: 500px)').matches;

export class Panel {
  constructor(app) {
    this.app = app;
    this.el = $('#panel');
    this.sig = '';
    this.pct = 50;
    this.busy = false;
    this.el.addEventListener('pointerdown', () => { this.busy = true; });
    window.addEventListener('pointerup', () => { setTimeout(() => { this.busy = false; }, 50); });
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.bulkB = 'farm';
    this.el.addEventListener('input', (e) => {
      if (e.target.id === 'atk-pct') this.setPct(+e.target.value);
    });
    this.el.addEventListener('change', (e) => {
      if (e.target.id === 'gov-mode') this.app.setAuto({ mode: e.target.value });
      else if (e.target.id === 'bulk-b') { this.bulkB = e.target.value; this.updateValues(); }
    });
    this.initSheet();
  }

  // Sur mobile : panneau en « bottom sheet » — glisser la poignée vers le haut pour agrandir, vers le bas pour fermer
  initSheet() {
    let y0 = null, dy = 0;
    this.el.addEventListener('pointerdown', (e) => {
      if (!mobile() || !e.target.closest('.p-head')) return;
      y0 = e.clientY; dy = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (y0 === null) return;
      dy = e.clientY - y0;
      if (dy > 0) this.el.style.transform = `translateY(${dy}px)`;
    });
    window.addEventListener('pointerup', () => {
      if (y0 === null) return;
      y0 = null;
      this.el.style.transform = '';
      if (dy > 70) this.app.select(-1);
      else if (dy < -30) this.el.classList.add('full');
      else if (Math.abs(dy) < 6 && this.el.classList.contains('full')) this.el.classList.remove('full');
      else if (Math.abs(dy) < 6) this.el.classList.add('full');
    });
  }

  setPct(v) {
    this.pct = v;
    this.app.pct = v;
    const sl = this.el.querySelector('#atk-pct');
    if (sl && +sl.value !== v) sl.value = v;
    this.el.querySelectorAll('[data-act="pct"]').forEach((b) => b.classList.toggle('on', +b.dataset.v === v));
    this.app.hud.updateFab();
    this.updateValues();
  }

  hide() {
    this.el.classList.add('empty');
    this.el.classList.remove('full');
    document.body.classList.remove('panel-open');
    this.sig = '';
  }

  render(force = false) {
    const app = this.app, g = app.game;
    const cell = app.sel.cell;
    if (!g || cell < 0) { this.hide(); return; }
    const pid = g.playerId, xid = g.owner[cell];
    const X = g.countries[xid], P = g.countries[pid];
    if (app.renderer.selCountry !== xid) app.renderer.setSelection(cell, xid);
    const mine = xid === pid;
    const flags = [g.atWar(pid, xid), g.allied(pid, xid), g.inTruce(pid, xid), X.alive].map(Number).join('');
    const b = [];
    for (let k = 0; k < NB; k++) b.push(g.build[cell * NB + k]);
    let extra = '';
    if (mine) extra = BUILDINGS.map((bd) => (g.canBuild(pid, cell, bd.id).ok ? 1 : 0)).join('');
    else extra = g.canReach(pid, xid) ? 'R' : 'r';
    if (!mine && !X.neutral) extra += ['peace', 'alliance', 'nap', 'surrender'].map((t) => (g.coolLeft(pid, xid, t) ? 1 : 0)).join('') + (Math.round(g.rel(pid, xid) / 10));
    if (mine) extra += this.app.auto.gov ? 'G' : 'g';
    const offs = g.offensives.filter((o) => (o.a === pid && (mine || o.d === xid)) || (o.d === pid && (mine || o.a === xid))).map((o) => o.id).join(',');
    const sig = [cell, xid, flags, b.join(''), P.techs.size, extra, offs, g.over || ''].join('|');
    this.el.classList.remove('empty');
    document.body.classList.add('panel-open');
    if (!force && sig === this.sig) { this.updateValues(); return; }
    if (this.busy && !force && this.sig) return;
    this.sig = sig;
    this.el.innerHTML = this.build(g, cell, X, P, mine);
    this.updateValues();
  }

  build(g, cell, X, P, mine) {
    const map = g.map, cl = map.cells[cell], pid = g.playerId, xid = X.id;
    const tags = [];
    if (mine) tags.push('<span class="tag me">Vous</span>');
    else if (X.neutral) tags.push('<span class="tag">Neutre</span>');
    else {
      if (g.atWar(pid, xid)) tags.push('<span class="tag war">En guerre</span>');
      else if (g.allied(pid, xid)) tags.push('<span class="tag ally">Allié</span>');
      else if (g.inTruce(pid, xid)) tags.push('<span class="tag truce">Trêve</span>');
      else tags.push('<span class="tag">En paix</span>');
      const allies = g.alliesOf(xid).map((id) => g.countries[id].name);
      if (allies.length) tags.push(`<span class="tag ally" title="Alliés">🤝 ${esc(allies.slice(0, 2).join(', '))}${allies.length > 2 ? '…' : ''}</span>`);
    }
    const core = g.coreName[cell];
    const region = (cl.region || X.name) + (core && core !== X.name ? ` <span class="hint">(ex-${esc(core)})</span>` : '');
    const foreignActions = mine ? '' : this.buildForeign(g, cell, X, P);
    const blds = BUILDINGS.map((bd, k) => { const l = g.build[cell * NB + k]; return l ? `<span class="tag" title="${esc(bd.name)}">${bd.icon}${bd.max > 1 ? ' ' + l : ''}</span>` : ''; }).join('');
    let h = `
      <div class="p-head"><span class="p-grip"></span>
        <div class="flag" style="background:${rgbToCss(X.color)}"></div>
        <div><h2>${esc(X.name)}</h2><div class="sub">${X.title ? esc(X.title) + ' · ' : ''}${tags.join('')}</div></div>
        <button class="p-close" data-act="close" aria-label="Fermer">✕</button>
      </div>
      ${foreignActions}
      <div class="p-sec">
        <h4>Territoire</h4>
        <div><b>${region}</b> · <span class="hint">${BIOMES[cl.terrain].name}${cl.coastal ? ' · côtier' : ''}</span></div>
        <div class="kv">
          <div><span>Population</span><b data-k="c-pop"></b></div>
          <div><span>Défense</span><b data-k="c-def"></b></div>
          <div><span>Agitation</span><b data-k="c-unrest"></b></div>
          <div><span>Relief</span><b>×${fmt1(cl.def)}</b></div>
        </div>
        ${blds ? `<div>${blds}</div>` : ''}
      </div>`;
    if (!X.neutral) {
      h += `
      <div class="p-sec">
        <h4>${mine ? 'Votre civilisation' : 'Pays'}</h4>
        <div class="kv">
          <div><span>Population</span><b data-k="x-pop"></b></div>
          <div><span>Armée</span><b data-k="x-army"></b></div>
          <div><span>Territoires</span><b data-k="x-cells"></b></div>
          <div><span>Époque</span><b>${ERAS[X.era].name}</b></div>
          <div><span>Moral</span><b data-k="x-morale"></b></div>
          <div><span>${mine ? 'Revenu' : 'Puissance'}</span><b data-k="${mine ? 'x-income' : 'x-power'}"></b></div>
        </div>
      </div>`;
    }
    if (mine) h += this.buildOwn(g, cell, P);
    return h;
  }

  buildOwn(g, cell, P) {
    const pid = g.playerId;
    let h = `<div class="p-sec"><h4>Construire dans ce territoire</h4><div class="buildings">`;
    BUILDINGS.forEach((bd, k) => {
      const lvl = g.build[cell * NB + k];
      const r = g.canBuild(pid, cell, bd.id);
      const max = lvl >= bd.max;
      const hide = r.locked && (r.msg === 'Territoire côtier requis' || r.msg === 'Un seul par civilisation') && lvl === 0;
      if (hide) return;
      h += `<div class="bld ${r.locked ? 'locked' : ''}">
        <div class="ic">${bd.icon}</div>
        <div class="nm">${esc(bd.name)}<span class="lv">${bd.max > 1 ? `niv. ${lvl}/${bd.max}` : lvl ? 'construit' : ''}</span><small>${esc(r.locked ? r.msg : bd.desc)}</small></div>
        <button class="btn small" data-act="build" data-b="${bd.id}" ${r.ok ? '' : 'disabled'}>${max ? '✔' : r.cost !== undefined ? '💰 ' + fmtInt(r.cost) : '🔒'}</button>
      </div>`;
    });
    h += `</div></div>`;
    h += `<div class="p-sec"><h4>Armée</h4>
      <div class="actions">
        <button class="btn" data-act="merc">🪙 Recruter des mercenaires <span class="hint" data-k="merc-txt"></span></button>
      </div>
      ${this.offList(g, (o) => o.a === pid || o.d === pid)}
    </div>`;
    const gov = { on: this.app.auto.gov, mode: this.app.auto.mode };
    const bulkOpts = BUILDINGS.filter((b) => !b.unique && (!b.req || P.techs.has(b.req)));
    if (!bulkOpts.some((b) => b.id === this.bulkB)) this.bulkB = 'farm';
    h += `<div class="p-sec"><h4>Gestion de l'empire</h4>
      <div class="actions">
        <label class="check"><input type="checkbox" data-act="gov" ${gov.on ? 'checked' : ''}> 🤖 Gouverneur : construit automatiquement</label>
        <select id="gov-mode">${Object.entries(GOV_MODES).map(([k, m]) => `<option value="${k}" ${k === gov.mode ? 'selected' : ''}>Priorité : ${m.label}</option>`).join('')}</select>
        <div class="two">
          <select id="bulk-b">${bulkOpts.map((b) => `<option value="${b.id}" ${b.id === this.bulkB ? 'selected' : ''}>${b.icon} ${esc(b.name)}</option>`).join('')}</select>
          <button class="btn" data-act="bulk">Construire partout</button>
        </div>
        <p class="hint" data-k="bulk-txt"></p>
      </div>
    </div>`;
    if (g.conquered || g.countries[pid].era >= 4) h += `<div class="p-sec"><button class="btn primary" style="width:100%" data-act="goals">🚀 Objectifs spatiaux</button></div>`;
    return h;
  }

  buildForeign(g, cell, X, P) {
    const pid = g.playerId, xid = X.id;
    const atWar = g.atWar(pid, xid), allied = g.allied(pid, xid), truce = g.inTruce(pid, xid);
    let h = `<div class="p-sec"><h4>Actions</h4><div class="actions">`;
    if (!X.alive && !X.neutral) h += `<p class="hint">Ce pays a disparu.</p>`;
    else if (allied) h += `<p class="hint">Vous êtes alliés : impossible d'attaquer sans rompre l'alliance.</p>`;
    else if (truce) h += `<p class="hint">Une trêve est en cours : attaque impossible pour le moment.</p>`;
    else if (!g.canReach(pid, xid)) {
      h += `<p class="hint">${g.canNavigate(P) ? 'Aucune frontière commune avec ce pays.' : 'Aucune frontière terrestre. Recherchez la <b>Navigation</b> pour lancer des attaques navales.'}</p>`;
    } else {
      h += `<div><div class="slider-row"><span>Troupes engagées</span><span data-k="atk-txt"></span></div>
        <input type="range" id="atk-pct" min="5" max="100" step="5" value="${this.pct}">
        <div class="presets">${PRESETS.map((v) => `<button class="btn small ${v === this.pct ? 'on' : ''}" data-act="pct" data-v="${v}">${v} %</button>`).join('')}</div></div>
        <div class="slider-row"><span>⚖️ Rapport de force estimé</span><b data-k="atk-est"></b></div>
        <button class="btn primary" data-act="attack">⚔️ ${atWar || X.neutral ? 'Attaquer' : 'Déclarer la guerre et attaquer'}</button>
        <p class="hint" data-k="atk-hint"></p>`;
    }
    if (!X.neutral && X.alive) {
      const rel = Math.round(g.rel(pid, xid));
      const word = rel <= -40 ? 'hostiles' : rel < -10 ? 'méfiantes' : rel < 10 ? 'neutres' : rel < 40 ? 'cordiales' : 'amicales';
      const style = X.isPlayer ? 'joueur humain' : (AI_STYLES.find((s) => s.id === X.ai.style) || {}).label || '';
      const tl = truce ? g.truces.get(pairKey(pid, xid)) - g.t : 0;
      h += `<p class="hint">🤝 Relations ${word} (${rel > 0 ? '+' : ''}${rel}) · ${esc(style)}${tl > 0 ? ` · 📜 trêve/pacte encore ${Math.ceil(tl)} s` : ''}</p><div class="two">`;
      const btn = (type, act, label, cls = '') => {
        const left = g.coolLeft(pid, xid, type);
        return `<button class="btn ${cls}" data-act="${act}" ${left ? 'disabled' : ''}>${label}${left ? ` <small>(${left} s)</small>` : ''}</button>`;
      };
      if (atWar) {
        h += btn('peace', 'peace', '🕊️ Proposer la paix') + btn('surrender', 'surrender', '🏳️ Exiger la reddition');
      } else if (allied) {
        h += `<button class="btn danger" data-act="break">💔 Rompre l'alliance</button>`;
      } else {
        h += btn('alliance', 'alliance', '🤝 Proposer une alliance');
        if (!truce) h += btn('nap', 'nap', '📜 Pacte de non-agression');
      }
      h += `</div>`;
    }
    h += `</div>${this.offList(g, (o) => (o.a === pid && o.d === xid) || (o.a === xid && o.d === pid))}</div>`;
    return h;
  }

  offList(g, filter) {
    const list = g.offensives.filter(filter);
    if (!list.length) return '';
    const pid = g.playerId;
    return `<div class="offs" style="margin-top:8px">${list.map((o) => {
      const mine = o.a === pid;
      const other = g.countries[mine ? o.d : o.a];
      return `<div class="off">
        <span>${mine ? '⚔️ Offensive contre' : '🛡️ Attaque de'} <b>${esc(art(other))}</b> — <b data-off="${o.id}"></b></span>
        ${mine ? `<button class="btn small" data-act="recall" data-o="${o.id}">Rappeler</button>` : '<span></span>'}
        <div class="pb"><div data-offp="${o.id}"></div></div>
      </div>`;
    }).join('')}</div>`;
  }

  updateValues() {
    const g = this.app.game;
    if (!g) return;
    const cell = this.app.sel.cell;
    if (cell < 0) return;
    const pid = g.playerId, X = g.countries[g.owner[cell]], P = g.countries[pid];
    const set = (k, v) => { const e = this.el.querySelector(`[data-k="${k}"]`); if (e && e.textContent !== v) e.textContent = v; };
    set('c-pop', fmtPop(g.pop[cell]));
    const bar = g.build[cell * NB + BI.barracks];
    set('c-def', fmtBig(g.militia(cell) * g.defQ(X) * g.map.cells[cell].def * (1 + 0.25 * bar)));
    set('c-unrest', Math.round(g.unrest[cell] * 100) + ' %');
    if (!X.neutral) {
      set('x-pop', fmtPop(X.st.pop));
      const eng = g.offTroops(X.id);
      set('x-army', fmtBig(X.army) + (eng ? ` (+${fmtBig(eng)})` : ''));
      set('x-cells', String(g.cellsOf[X.id].size));
      set('x-morale', String(Math.round(X.morale)));
      set('x-income', `${fmt1(X.st.income - X.st.upkeep)} or/s`);
      const pr = g.power(X) / Math.max(1, g.power(P));
      set('x-power', pr >= 10 ? '×' + Math.round(pr) : '×' + fmt1(pr));
    }
    const troops = P.army * this.pct / 100;
    set('atk-txt', `${this.pct} % · ${fmtBig(troops)}`);
    if (X.id !== pid && this.el.querySelector('[data-k="atk-est"]')) {
      const est = g.estimateAttack(pid, X.id, this.pct / 100, cell);
      const e = this.el.querySelector('[data-k="atk-est"]');
      if (est) {
        const r = est.ratio;
        const [txt, col] = r < 0.7 ? ['défavorable', 'var(--bad)'] : r < 1.2 ? ['incertain', 'var(--warn)'] : r < 3 ? ['favorable', 'var(--good)'] : ['écrasant', 'var(--good)'];
        e.textContent = `×${r >= 10 ? Math.round(r) : fmt1(r)} — ${txt}${est.naval ? ' (naval)' : ''}`;
        e.style.color = col;
      }
    }
    if (X.id !== pid) {
      set('atk-hint', X.neutral ? 'Terres libres : seule une milice locale défend.' : `Armée adverse : ${fmtBig(X.army)} · qualité ×${fmt1(g.defQ(X))} (vous : ×${fmt1(g.atkQ(P))})`);
    }
    if (this.el.querySelector('[data-k="bulk-txt"]')) {
      const bc = bulkCost(g, pid, this.bulkB);
      set('bulk-txt', bc.n ? `${bc.n} territoire${bc.n > 1 ? 's' : ''} améliorable${bc.n > 1 ? 's' : ''} · 💰 ${fmtInt(bc.total)} au total (les plus peuplés d'abord)` : 'Rien à construire pour ce bâtiment.');
    }
    const mi = g.mercInfo(pid);
    const n = Math.min(mi.room, (P.gold * 0.5) / mi.price);
    set('merc-txt', n >= 100 ? `(+${fmtBig(n)} pour ${fmtInt(n * mi.price)} or)` : mi.room < 100 ? '(effectifs au max)' : '(or insuffisant)');
    for (const o of g.offensives) {
      const e = this.el.querySelector(`[data-off="${o.id}"]`);
      if (e) e.textContent = fmtBig(o.troops);
      const p = this.el.querySelector(`[data-offp="${o.id}"]`);
      if (p) p.style.width = Math.round(Math.min(1, o.progress) * 100) + '%';
    }
  }

  onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const app = this.app, g = app.game;
    const cell = app.sel.cell;
    const pid = g.playerId, xid = g.owner[cell];
    let r;
    switch (btn.dataset.act) {
      case 'close': app.select(-1); return;
      case 'build': {
        r = app.cmd('build', cell, btn.dataset.b);
        const bd = BUILDINGS[BI[btn.dataset.b]];
        if (r.pending) break;
        if (r.ok) toast(`🏗️ ${bd.name} construit${bd.fem ? 'e' : ''} !`, 'ok', 1600);
        else toast(r.msg, 'err');
        break;
      }
      case 'merc': {
        const mi = g.mercInfo(pid);
        r = app.cmd('merc', Math.min(g.countries[pid].gold * 0.5, mi.room * mi.price));
        if (r.pending) break;
        if (r.ok) toast(`🪙 ${fmtBig(r.n)} mercenaires rejoignent vos rangs.`, 'ok'); else toast(r.msg, 'err');
        break;
      }
      case 'attack': app.attack(xid, this.pct / 100, cell); break;
      case 'recall': app.cmd('recall', +btn.dataset.o); toast('Troupes rappelées (10 % de pertes en retraite).', '', 2000); break;
      case 'peace': case 'alliance': case 'nap': case 'surrender':
        r = app.cmd(btn.dataset.act, xid);
        if (!r.pending) toast(esc(r.msg), r.ok ? 'ok' : 'err', 3500);
        break;
      case 'break': app.cmd('breakAlliance', xid); break;
      case 'goals': app.openGoals(); return;
      case 'pct': this.setPct(+btn.dataset.v); app.sound.click(); return;
      case 'gov':
        app.setAuto({ gov: btn.checked });
        toast(btn.checked ? '🤖 Gouverneur activé' : 'Gouverneur désactivé', btn.checked ? 'ok' : '', 1500);
        return;
      case 'bulk': {
        const res = app.cmd('bulk', this.bulkB);
        const bd = BUILDINGS[BI[this.bulkB]];
        if (!res.pending) toast(res.n ? `🏗️ ${res.n} × ${bd.name} (💰 ${fmtInt(res.spent)})` : 'Or insuffisant ou rien à construire.', res.n ? 'ok' : 'err');
        break;
      }
    }
    this.render(true);
  }
}

export { BAL };

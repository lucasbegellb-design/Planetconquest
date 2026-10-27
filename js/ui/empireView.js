// Fenêtre « Empire » : gouvernement, merveilles, ressources, armée (généraux, arsenal) et relations (vassaux, commerce).
import { openModal, toast, esc } from './dom.js';
import { ERAS } from '../tech/techtree.js';
import { fmtInt } from '../core/util.js';
import { art } from '../core/fr.js';
import { GOVS, GOV_BY_ID, canGov, WONDERS, WONDER_BY_ID, canWonder, wonderOwner, RESOURCES, techNeeds } from '../sim/empire.js';
import { canBuildNuke, nukeCost, NUKE_MAX, GEN_LVL } from '../sim/military.js';
import { vassalsOf, overlordOf, canIntegrate, integrateCost, tradesOf, maxTrades, TRIBUTE } from '../sim/statecraft.js';

const TABS = [
  { id: 'gov', icon: '🏛️', name: 'Gouvernement' },
  { id: 'wonders', icon: '🗿', name: 'Merveilles' },
  { id: 'res', icon: '⛏️', name: 'Ressources' },
  { id: 'army', icon: '🎖️', name: 'Armée' },
  { id: 'rel', icon: '🤝', name: 'Relations' },
];

export function openEmpireView(app, tab) {
  const body = openModal('<div id="emp-root"></div>');
  const root = body.querySelector('#emp-root');
  if (tab) app.empTab = tab;
  app.empTab ||= 'gov';
  let sig = '';
  const render = (force) => {
    const g = app.game;
    if (!g) return;
    const a = document.activeElement;
    if (!force && a && a.tagName === 'SELECT' && root.contains(a)) return; // ne pas fermer une liste ouverte
    const P = g.countries[g.playerId];
    const html = view(app, g, P);
    if (!force && html === sig) return;
    sig = html;
    root.innerHTML = html;
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { app.empTab = t.dataset.tab; render(true); return; }
    const b = e.target.closest('[data-do]');
    if (!b || b.disabled) return;
    const a = b.dataset;
    const r = a.do === 'gov' ? app.cmd('gov', a.v)
      : a.do === 'wonder' ? app.cmd('wonder', a.v)
        : a.do === 'nuke' ? app.cmd('buildNuke')
          : a.do === 'integrate' ? app.cmd('integrate', +a.v)
            : a.do === 'breakTrade' ? app.cmd('breakTrade', +a.v)
              : a.do === 'general' ? app.cmd('general', +a.v, +a.o) : null;
    if (r && !r.pending && r.msg) toast(esc(r.msg), r.ok ? 'ok' : 'err', 2500);
    app.sound.click();
    setTimeout(() => render(true), 60);
  });
  render(true);
  const iv = setInterval(() => { if (!root.isConnected) clearInterval(iv); else render(false); }, 1000);
}

function view(app, g, P) {
  const tabs = TABS.map((t) => `<button class="tab ${app.empTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.icon} ${t.name}</button>`).join('');
  const G = GOV_BY_ID[P.gov] || GOVS[0];
  const head = `<div class="tech-head"><div><h2>🏛️ Votre empire</h2>
    <div class="hint">${G.icon} ${G.name} · ${ERAS[P.era].name} · 💰 ${fmtInt(P.gold)} or</div></div></div>
    <div class="tabs emp-tabs">${tabs}</div>`;
  const body = { gov: govTab, wonders: wonderTab, res: resTab, army: armyTab, rel: relTab }[app.empTab](g, P);
  return head + body;
}

const card = (cls, top, right, desc, btn = '') => `<div class="tech ${cls}"><div class="t1"><span>${top}</span><span>${right}</span></div><div class="t2">${desc}</div>${btn}</div>`;

function govTab(g, P) {
  const cool = Math.ceil((P.govT ?? -1e9) + 180 - g.t);
  let h = `<p class="hint">Chaque gouvernement oriente votre empire. Changer provoque 30 s de transition (or, recherche et moral en baisse), puis il faut attendre 3 min avant le suivant${cool > 0 ? ` — <b>encore ${cool} s</b>` : ''}. Le premier choix est gratuit.</p><div class="emp-grid">`;
  for (const x of GOVS) {
    const cur = P.gov === x.id, r = canGov(g, P.id, x.id), locked = P.era < x.era;
    const btn = cur ? '' : `<button class="btn small" data-do="gov" data-v="${x.id}" ${r.ok ? '' : 'disabled'}>${locked ? '🔒 ' + ERAS[x.era].name : 'Adopter'}</button>`;
    h += card(cur ? 'done' : locked ? 'locked' : 'avail', `${x.icon} ${x.name}`, cur ? '✔ actuel' : '', esc(x.desc), btn);
  }
  return h + '</div>';
}

function wonderTab(g, P) {
  let h = `<p class="hint">Un seul exemplaire de chaque merveille sur la planète : le premier qui l’achève l’emporte (les autres récupèrent la moitié de leur or). Elle est bâtie dans votre capitale ; qui prend ce territoire prend la merveille.</p>`;
  if (P.job) {
    const w = WONDER_BY_ID[P.job.wid];
    h += `<div class="emp-job">🏗️ Chantier : <b>${w.icon} ${w.name}</b> — encore ${Math.ceil(P.job.left)} s<div class="meter"><div style="width:${Math.round((1 - P.job.left / w.time) * 100)}%"></div></div></div>`;
  }
  h += '<div class="emp-grid">';
  for (const w of WONDERS) {
    const own = wonderOwner(g, w.id), built = own >= 0;
    const rivals = g.countries.filter((c) => c.job && c.job.wid === w.id && c.id !== P.id).length;
    const r = canWonder(g, P.id, w.id);
    let right = built ? (own === P.id ? '✔ à vous' : esc(g.countries[own].name)) : `💰 ${fmtInt(w.cost)} · ${w.time} s`;
    let btn = '';
    if (!built && !(P.job && P.job.wid === w.id)) btn = `<button class="btn small" data-do="wonder" data-v="${w.id}" ${r.ok ? '' : 'disabled'} title="${esc(r.msg || '')}">${P.era < w.era ? '🔒 ' + ERAS[w.era].name : 'Construire'}</button>`;
    const note = !built && rivals ? ` · ⚠️ ${rivals} chantier${rivals > 1 ? 's' : ''} concurrent${rivals > 1 ? 's' : ''}` : '';
    h += card(built ? (own === P.id ? 'done' : 'locked') : P.era < w.era ? 'locked' : 'avail', `${w.icon} ${w.name}`, right, esc(w.desc) + note, btn);
  }
  return h + '</div>';
}

function resTab(g, P) {
  const n = P.resN || [];
  let h = `<p class="hint">Les ressources se trouvent dans certains territoires (icônes sur la carte). En contrôler une suffit pour son bonus ; chaque exemplaire supplémentaire rapporte +1 % d’or (commerce).</p><div class="emp-grid">`;
  RESOURCES.forEach((r, i) => {
    const k = n[i] || 0, early = r.era && P.era < r.era;
    const needs = Object.entries({ tanks: 'Blindés', aviation: 'Aviation', fusion: 'Fusion nucléaire' }).filter(([t]) => techNeeds(t) === r.id && P.techs.has(t)).map(([, nm]) => nm);
    const warn = !k && needs.length ? `<br><b style="color:var(--bad)">⚠️ Sans ${r.name.toLowerCase()}, ${needs.join(' et ')} ne fonctionne${needs.length > 1 ? 'nt' : ''} qu’à moitié.</b>` : '';
    h += card(k && !early ? 'done' : k ? 'avail' : 'locked', `${r.icon} ${r.name}`, k ? `× ${k}` : 'aucun', esc(r.desc) + (early ? ` <i>(actif à l’époque ${ERAS[r.era].adj})</i>` : '') + warn);
  });
  return h + '</div>';
}

function armyTab(g, P) {
  const offs = g.offensives.filter((o) => o.a === P.id);
  let h = `<h3 class="emp-h">🎖️ Généraux <small>${(P.generals || []).length}/3</small></h3>
    <p class="hint">Vos victoires font naître des généraux (au plus 3). Chacun mène une offensive : +2,5 % d’attaque et +2 % de vitesse par étoile (jusqu’à ${GEN_LVL}). Ils gagnent de l’expérience en conquérant… et peuvent tomber si l’offensive échoue.</p>`;
  if (!(P.generals || []).length) h += '<p class="hint"><i>Aucun général pour l’instant : remportez des batailles.</i></p>';
  h += '<div class="emp-grid">';
  for (const gen of P.generals || []) {
    const opts = [`<option value="0" ${!gen.off ? 'selected' : ''}>En réserve</option>`].concat(offs.map((o) => `<option value="${o.id}" ${gen.off === o.id ? 'selected' : ''}>⚔️ ${esc(art(g.countries[o.d]))}</option>`)).join('');
    h += card('avail', `🎖️ ${esc(gen.name)}`, '★'.repeat(gen.lvl) + '☆'.repeat(GEN_LVL - gen.lvl),
      `Expérience ${gen.xp}/${10 * gen.lvl}`, `<select class="gen-sel" data-gen="${gen.id}">${opts}</select>`);
  }
  h += '</div>';
  const r = canBuildNuke(g, P.id);
  h += `<h3 class="emp-h">☢️ Arsenal atomique <small>${P.nukes || 0}/${NUKE_MAX}</small></h3>
    <p class="hint">Époque moderne + uranium (ou Projet Manhattan). Une frappe dévaste un territoire ennemi, mais le monde entier se retourne contre vous. Pour frapper : sélectionnez un territoire d’un pays en guerre contre vous.</p>
    <button class="btn" data-do="nuke" ${r.ok ? '' : 'disabled'}>☢️ Construire une bombe (💰 ${fmtInt(nukeCost(g, P))})</button> <span class="hint">${r.ok ? '' : esc(r.msg)}</span>`;
  return h;
}

function relTab(g, P) {
  const ov = overlordOf(g, P.id);
  let h = ov >= 0 ? `<p class="warn">⛓️ Vous êtes vassal ${esc(art(g.countries[ov]))}.</p>` : '';
  const vs = vassalsOf(g, P.id);
  h += `<h3 class="emp-h">⛓️ Vassaux <small>${vs.length}</small></h3>
    <p class="hint">Exigez la reddition d’un pays en guerre en choisissant « vassal » : il garde ses terres, vous verse ${Math.round(TRIBUTE * 100)} % de ses revenus et combat à vos côtés. Un vassal trop fort ou mécontent peut se révolter. Après 3 min, vous pouvez l’intégrer pacifiquement.</p><div class="emp-grid">`;
  for (const id of vs) {
    const V = g.countries[id], r = canIntegrate(g, P.id, id);
    h += card('avail', esc(V.name), `${g.cellsOf[id].size} terr.`, `Relations ${Math.round(g.rel(P.id, id))}`,
      `<button class="btn small" data-do="integrate" data-v="${id}" ${r.ok ? '' : 'disabled'}>Intégrer (💰 ${fmtInt(integrateCost(g, id))})${r.ok ? '' : ' · ' + esc(r.msg)}</button>`);
  }
  if (!vs.length) h += '<p class="hint"><i>Aucun vassal.</i></p>';
  const tr = tradesOf(g, P.id);
  h += `</div><h3 class="emp-h">🚢 Accords commerciaux <small>${tr.length}/${maxTrades(P)}</small></h3>
    <p class="hint">+6 % d’or par accord et des relations qui s’améliorent. Proposez-en depuis le panneau d’un pays en paix. Déclarer la guerre à un partenaire rompt l’accord.</p><div class="emp-grid">`;
  for (const id of tr) h += card('done', esc(g.countries[id].name), '+6 % or', '', `<button class="btn small" data-do="breakTrade" data-v="${id}">Rompre</button>`);
  if (!tr.length) h += '<p class="hint"><i>Aucun accord.</i></p>';
  return h + '</div>';
}

// sélection d'une offensive pour un général (change, pas click)
export function bindEmpireChange(app) {
  document.addEventListener('change', (e) => {
    const s = e.target.closest && e.target.closest('.gen-sel');
    if (!s || !app.game) return;
    const r = app.cmd('general', +s.dataset.gen, +s.value);
    if (r && !r.pending && r.msg) toast(esc(r.msg), r.ok ? 'ok' : 'err', 2000);
  });
}

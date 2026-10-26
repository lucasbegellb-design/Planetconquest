// Fenêtre de l'arbre technologique.
import { openModal, toast, esc } from './dom.js';
import { ERAS, TECHS, REPEATABLES, TECHS_TO_ADVANCE, canResearch, repeatCost } from '../tech/techtree.js';
import { fmtInt, fmt1 } from '../core/util.js';

export function openTechView(app) {
  const body = openModal('<div id="tech-root"></div>');
  const root = body.querySelector('#tech-root');
  const render = () => {
    const g = app.game, P = g.countries[g.playerId];
    const cols = ERAS.map((era) => {
      const list = TECHS.filter((t) => t.era === era.id);
      const done = list.filter((t) => P.techs.has(t.id)).length;
      const cls = era.id === P.era ? 'current' : era.id > P.era ? 'future' : '';
      const cards = list.map((t) => {
        const has = P.techs.has(t.id);
        const avail = canResearch(P.techs, P.era, t);
        const afford = avail && P.rp >= t.cost;
        const c = has ? 'done' : avail ? 'avail' + (afford ? ' afford' : '') : 'locked';
        const req = t.req && !has ? ` · requiert ${t.req.map((r) => TECHS.find((x) => x.id === r).name).join(', ')}` : '';
        return `<button class="tech ${c}" data-t="${t.id}" ${has || !avail ? 'disabled' : ''}>
          <div class="t1"><span>${t.icon} ${esc(t.name)}</span><span>${has ? '✔' : '🔬 ' + fmtInt(t.cost)}</span></div>
          <div class="t2">${esc(t.desc)}${req}</div></button>`;
      }).join('');
      const next = era.id < 4 ? `${Math.min(done, TECHS_TO_ADVANCE)}/${TECHS_TO_ADVANCE}` : `${done}/6`;
      return `<div class="era-col ${cls}"><h3>${era.name}<small>${next}</small></h3>${cards}</div>`;
    }).join('');
    let rep = '';
    if (P.era >= 4) {
      rep = `<h3 style="margin:16px 0 4px;font-family:var(--head)">♾️ Technologies infinies</h3><div class="repeat-row">` +
        REPEATABLES.map((r) => {
          const lvl = P.repeat[r.id] || 0, cost = repeatCost(r, lvl);
          return `<button class="tech avail ${P.rp >= cost ? 'afford' : ''}" data-r="${r.id}">
            <div class="t1"><span>${r.icon} ${esc(r.name)} <small>niv. ${lvl}</small></span><span>🔬 ${fmtInt(cost)}</span></div>
            <div class="t2">${esc(r.desc)}</div></button>`;
        }).join('') + '</div>';
    }
    root.innerHTML = `
      <div class="tech-head">
        <div><h2>🔬 Technologies</h2><div class="hint">Recherchez ${TECHS_TO_ADVANCE} technologies d'une époque pour accéder à la suivante. Époque actuelle : <b>${ERAS[P.era].name}</b> (soldats ×${fmt1(ERAS[P.era].mult)}).</div></div>
        <div class="tech-rp">Points de recherche : <b>${fmtInt(P.rp)}</b> <span class="hint">(+${fmt1(P.st.rp)}/s)</span><br>
          <label class="hint"><input type="checkbox" id="auto-res" ${app.autoResearch ? 'checked' : ''}> Recherche automatique</label></div>
      </div>
      <div class="eras">${cols}</div>${rep}`;
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t],[data-r]');
    if (!t || t.disabled) return;
    const g = app.game;
    const r = t.dataset.t ? g.research(g.playerId, t.dataset.t) : g.researchRepeat(g.playerId, t.dataset.r);
    if (!r.ok) toast(r.msg, 'err');
    render();
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'auto-res') app.autoResearch = e.target.checked; });
  render();
}

// Recherche automatique : la technologie disponible la moins chère
export function autoResearch(g) {
  const P = g.countries[g.playerId];
  const avail = TECHS.filter((t) => canResearch(P.techs, P.era, t)).sort((a, b) => a.cost - b.cost);
  if (avail.length) { if (P.rp >= avail[0].cost) g.research(P.id, avail[0].id); return; }
  if (P.era >= 4) {
    const r = [...REPEATABLES].sort((a, b) => repeatCost(a, P.repeat[a.id] || 0) - repeatCost(b, P.repeat[b.id] || 0))[0];
    if (P.rp >= repeatCost(r, P.repeat[r.id] || 0)) g.researchRepeat(P.id, r.id);
  }
}

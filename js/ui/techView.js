// Fenêtre de l'arbre technologique.
import { openModal, toast, esc } from './dom.js';
import { ERAS, TECHS, REPEATABLES, BRANCHES, TECHS_TO_ADVANCE, canResearch, repeatCost } from '../tech/techtree.js';
import { fmtInt, fmt1 } from '../core/util.js';
import { autoResearchTick } from '../sim/governor.js';

export function openTechView(app) {
  const body = openModal('<div id="tech-root"></div>');
  const root = body.querySelector('#tech-root');
  app.techTab ||= 'mil';
  const render = () => {
    const g = app.game, P = g.countries[g.playerId];
    const inEra = TECHS.filter((t) => t.era === P.era && P.techs.has(t.id)).length;
    const tabs = BRANCHES.map((b) => {
      const n = TECHS.filter((t) => t.branch === b.id && P.techs.has(t.id)).length;
      const ready = TECHS.some((t) => t.branch === b.id && canResearch(P.techs, P.era, t) && P.rp >= t.cost);
      return `<button class="tab ${app.techTab === b.id ? 'active' : ''}" data-tab="${b.id}">${b.icon} ${b.name} <small>${n}/10</small>${ready ? ' <span class="dot"></span>' : ''}</button>`;
    }).join('');
    const branch = BRANCHES.find((b) => b.id === app.techTab);
    const cols = ERAS.map((era) => {
      const list = TECHS.filter((t) => t.era === era.id && t.branch === branch.id);
      const cls = era.id === P.era ? 'current' : era.id > P.era ? 'future' : '';
      const cards = list.map((t) => {
        const has = P.techs.has(t.id);
        const avail = canResearch(P.techs, P.era, t);
        const afford = avail && P.rp >= t.cost;
        const c = has ? 'done' : avail ? 'avail' + (afford ? ' afford' : '') : 'locked';
        let why = '';
        if (!has && !avail) {
          if (t.era > P.era) why = ` · époque ${ERAS[t.era].adj}`;
          else if (t.req && !t.req.every((r) => P.techs.has(r))) why = ` · requiert ${t.req.map((r) => TECHS.find((x) => x.id === r).name).join(', ')}`;
          else why = ' · requiert une technologie de cette branche à l’époque précédente';
        }
        return `<button class="tech ${c}" data-t="${t.id}" ${has || !avail ? 'disabled' : ''}>
          <div class="t1"><span>${t.icon} ${esc(t.name)}</span><span>${has ? '✔' : '🔬 ' + fmtInt(t.cost)}</span></div>
          <div class="t2">${esc(t.desc)}${why}</div></button>`;
      }).join('');
      return `<div class="era-col ${cls}"><h3>${era.name}</h3>${cards}</div>`;
    }).join('');
    let rep = '';
    if (P.era >= 4) {
      rep = `<h3 style="margin:14px 0 4px;font-family:var(--head)">♾️ Technologies infinies</h3><div class="repeat-row">` +
        REPEATABLES.filter((r) => r.branch === branch.id).map((r) => {
          const lvl = P.repeat[r.id] || 0, cost = repeatCost(r, lvl);
          return `<button class="tech avail ${P.rp >= cost ? 'afford' : ''}" data-r="${r.id}">
            <div class="t1"><span>${r.icon} ${esc(r.name)} <small>niv. ${lvl}</small></span><span>🔬 ${fmtInt(cost)}</span></div>
            <div class="t2">${esc(r.desc)}</div></button>`;
        }).join('') + '</div>';
    }
    const next = P.era < 4
      ? `${Math.min(inEra, TECHS_TO_ADVANCE)}/${TECHS_TO_ADVANCE} technologies de l’époque ${ERAS[P.era].adj} pour passer à l’époque ${ERAS[P.era + 1].adj}`
      : 'Époque finale atteinte';
    root.innerHTML = `
      <div class="tech-head">
        <div><h2>🔬 Technologies</h2><div class="hint">Époque : <b>${ERAS[P.era].name}</b> (soldats ×${fmt1(ERAS[P.era].mult)}) · ${next}</div>
          <div class="meter" style="max-width:360px"><div style="width:${P.era < 4 ? Math.min(100, (inEra / TECHS_TO_ADVANCE) * 100) : 100}%"></div></div></div>
        <div class="tech-rp">Points de recherche : <b>${fmtInt(P.rp)}</b> <span class="hint">(+${fmt1(P.st.rp)}/s)</span><br>
          <label class="hint"><input type="checkbox" id="auto-res" ${app.auto.res ? 'checked' : ''}> Recherche automatique</label></div>
      </div>
      <div class="tabs tech-tabs">${tabs}</div>
      <p class="hint">${branch.icon} ${esc(branch.desc)}. Chaque technologie demande une technologie de la même branche à l’époque précédente.</p>
      <div class="eras">${cols}</div>${rep}`;
  };
  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { app.techTab = tab.dataset.tab; render(); return; }
    const t = e.target.closest('[data-t],[data-r]');
    if (!t || t.disabled) return;
    const r = t.dataset.t ? app.cmd('research', t.dataset.t) : app.cmd('researchRepeat', t.dataset.r);
    if (r && !r.ok && r.msg) toast(r.msg, 'err');
    render();
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'auto-res') app.setAuto({ res: e.target.checked }); });
  render();
}

// Recherche automatique (logique dans la simulation)
export const autoResearch = (g) => autoResearchTick(g, g.playerId);

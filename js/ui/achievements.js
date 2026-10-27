// Succès : conservés d'une partie à l'autre, ils débloquent des cosmétiques (voir cosmetics.js).
import { openModal, toast, esc } from './dom.js';
import { NB } from '../tech/buildings.js';
import { DIFFICULTIES } from '../sim/balance.js';
import { wondersOf, RESOURCES } from '../sim/empire.js';
import { vassalsOf, tradesOf } from '../sim/statecraft.js';
import { COSMETICS, find, equipped, equip, applyCosmetics } from './cosmetics.js';

const KEY = 'terra-conquest-achievements';
// r : récompenses [catégorie, id] ; goal/life : progression cumulée (toutes parties)
export const ACHIEVEMENTS = [
  { id: 'first', icon: '⚔️', name: 'Premier sang', desc: 'Conquérir un premier territoire.', r: [['emblem', 'sword']] },
  { id: 'empire', icon: '🦅', name: 'Empire', desc: 'Contrôler 100 territoires dans une même partie.', r: [['emblem', 'eagle'], ['color', 'emerald']] },
  { id: 'warlord', icon: '🦁', name: 'Seigneur de guerre', desc: 'Conquérir 500 territoires au total (toutes parties).', life: 'captures', goal: 500, r: [['emblem', 'lion']] },
  { id: 'builder', icon: '🏗️', name: 'Bâtisseur', desc: 'Avoir 40 niveaux de bâtiments dans une partie.', r: [['title', 'builder']] },
  { id: 'wonder', icon: '🏛️', name: 'Merveille du monde', desc: 'Achever une merveille.', r: [['emblem', 'castle']] },
  { id: 'wonders5', icon: '🗿', name: 'Gardien du patrimoine', desc: 'Posséder 5 merveilles en même temps.', r: [['color', 'marble']] },
  { id: 'collector', icon: '💎', name: 'Collectionneur', desc: 'Contrôler les 5 ressources stratégiques en même temps.', r: [['effect', 'gold']] },
  { id: 'diplomat', icon: '🚢', name: 'Diplomate', desc: 'Avoir 3 accords commerciaux en même temps.', r: [['title', 'diplomat']] },
  { id: 'suzerain', icon: '⛓️', name: 'Suzerain', desc: 'Faire d’un pays votre vassal.', r: [['emblem', 'crown']] },
  { id: 'strategist', icon: '🎖️', name: 'Stratège', desc: 'Former un général 5 étoiles.', r: [['title', 'strategist'], ['emblem', 'medal']] },
  { id: 'spymaster', icon: '🕵️', name: 'Maître espion', desc: 'Réussir 10 missions d’espionnage (toutes parties).', life: 'spyOk', goal: 10, r: [['title', 'spymaster'], ['emblem', 'spy']] },
  { id: 'revolution', icon: '✊', name: 'Révolutionnaire', desc: 'Changer 3 fois de gouvernement dans une partie.', r: [['color', 'scarlet']] },
  { id: 'pacifist', icon: '🕊️', name: 'Pacifiste', desc: 'Atteindre l’époque industrielle sans jamais déclarer de guerre.', r: [['emblem', 'dove'], ['title', 'peaceful'], ['theme', 'jade']] },
  { id: 'spaceage', icon: '🛰️', name: 'Âge spatial', desc: 'Atteindre l’époque spatiale.', r: [['theme', 'neon']] },
  { id: 'atom', icon: '☢️', name: 'L’ère atomique', desc: 'Lancer une bombe atomique.', r: [['emblem', 'atom'], ['title', 'apocalypse']] },
  { id: 'survivor', icon: '🛡️', name: 'Survivant', desc: 'Tenir 2 minutes après avoir subi une frappe atomique.', r: [['theme', 'obsidian']] },
  { id: 'conqueror', icon: '🌍', name: 'Conquérant', desc: 'Conquérir toute une planète.', r: [['title', 'conqueror'], ['color', 'gold']] },
  { id: 'hard', icon: '🔥', name: 'À la dure', desc: 'Conquérir une planète en difficulté Difficile ou Impossible.', r: [['color', 'obsidian'], ['effect', 'flames']] },
  { id: 'impossible', icon: '💀', name: 'L’Invincible', desc: 'Conquérir une planète en difficulté Impossible.', r: [['title', 'invincible'], ['effect', 'fireworks'], ['emblem', 'dragon']] },
  { id: 'lightning', icon: '⚡', name: 'Éclair', desc: 'Conquérir une planète en moins de 30 minutes de jeu.', r: [['title', 'lightning'], ['theme', 'ember']] },
  { id: 'david', icon: '🐜', name: 'David contre Goliath', desc: 'Conquérir la Terre en partant d’un pays de 3 territoires ou moins.', r: [['title', 'david'], ['emblem', 'ant']] },
  { id: 'stars', icon: '🚀', name: 'Voyageur interstellaire', desc: 'Débarquer sur une autre planète.', r: [['emblem', 'rocket'], ['theme', 'ice'], ['title', 'starborn']] },
  { id: 'galactic', icon: '🌌', name: 'Galactique', desc: 'Atteindre la 6e planète.', r: [['color', 'nebula'], ['theme', 'amethyst']] },
  { id: 'champion', icon: '🏆', name: 'Champion', desc: 'Remporter une partie multijoueur.', r: [['emblem', 'trophy'], ['color', 'purple']] },
  { id: 'team', icon: '🤝', name: 'Esprit d’équipe', desc: 'Remporter une partie multijoueur en équipe.', r: [['title', 'loyal'], ['color', 'azure']] },
  { id: 'historian', icon: '🎬', name: 'Historien', desc: 'Regarder le timelapse de votre histoire.', r: [['emblem', 'film']] },
  { id: 'marathon', icon: '⏳', name: 'Marathon', desc: 'Jouer 3 heures au total.', life: 'playSec', goal: 3 * 3600, r: [['effect', 'petals']] },
];
const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

let store = { unlocked: {}, life: { captures: 0, spyOk: 0, playSec: 0 } };
try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); store = { unlocked: s.unlocked || {}, life: { ...store.life, ...(s.life || {}) } }; } catch { /* ignore */ }
let saveT = 0;
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ } };

export const isUnlocked = (id) => !!store.unlocked[id];
// un cosmétique est disponible s'il est gratuit ou si un succès débloqué le donne
export function cosmeticUnlocked(cat, id) {
  if (find(cat, id).free) return true;
  return ACHIEVEMENTS.some((a) => store.unlocked[a.id] && a.r.some(([c, i]) => c === cat && i === id));
}
export const sourceOf = (cat, id) => ACHIEVEMENTS.find((a) => a.r.some(([c, i]) => c === cat && i === id));

// ---------- suivi pendant une partie ----------
export class AchievementTracker {
  constructor(app) { this.app = app; this.T = null; }

  // T : compteurs propres à la partie (sauvegardés avec elle)
  attach(game, saved) {
    const pid = () => game.playerId;
    this.game = game;
    this.T = saved || { startCells: game.cellsOf[game.playerId].size, warsDeclared: 0, govChanges: 0, gov: game.countries[game.playerId].gov, nukedAt: null };
    this.acc = 0;
    game.on('capture', (e) => {
      if (e.to !== pid()) return;
      store.life.captures++;
      this.unlock('first');
      if (store.life.captures >= 500) this.unlock('warlord');
    });
    game.on('war', (w) => { if (w.a === pid()) this.T.warsDeclared++; });
    game.on('nuke', (e) => { if (e.a === pid()) this.unlock('atom'); if (e.d === pid() || game.owner[e.cell] === pid()) this.T.nukedAt = game.t; });
    game.on('wonder', (e) => { if (e.id === pid()) this.unlock('wonder'); });
    game.on('conquered', () => this.onConquered());
    game.on('matchEnd', (e) => this.onMatchEnd(e.ranking));
  }

  onConquered() {
    const g = this.game;
    this.unlock('conqueror');
    if (g.diff === DIFFICULTIES.difficile || g.diff === DIFFICULTIES.impossible) this.unlock('hard');
    if (g.diff === DIFFICULTIES.impossible) this.unlock('impossible');
    if (g.t < 1800) this.unlock('lightning');
    if (g.planet.level === 0 && this.T.startCells <= 3) this.unlock('david');
  }
  onMatchEnd(ranking) {
    const g = this.game, m = g.match, me = g.playerId;
    if (!m || !m.names) return;
    const humans = ranking.filter((r) => m.names[r.id] || r.id === me);
    if (m.teams) {
      const score = [0, 0];
      for (const r of humans) score[m.teams[r.id] || 0] += r.score;
      if (score[m.teams[me]] > score[1 - m.teams[me]]) { this.unlock('champion'); this.unlock('team'); }
    } else if (humans[0] && humans[0].id === me) this.unlock('champion');
  }
  onCommand(name, r) {
    if (name === 'spy' && r && r.ok) { store.life.spyOk++; if (store.life.spyOk >= 10) this.unlock('spymaster'); persist(); }
  }

  // contrôles réguliers de l'état de la partie
  tick(dt) {
    const g = this.game;
    if (!g || !this.T) return;
    store.life.playSec += dt;
    if (store.life.playSec >= 3 * 3600) this.unlock('marathon');
    if ((saveT += dt) > 20) { saveT = 0; persist(); }
    if ((this.acc += dt) < 2) return;
    this.acc = 0;
    const id = g.playerId, P = g.countries[id];
    if (!P || !P.alive) return;
    const cells = g.cellsOf[id];
    if (cells.size >= 100) this.unlock('empire');
    let b = 0;
    for (const c of cells) for (let k = 0; k < NB; k++) b += g.build[c * NB + k];
    if (b >= 40) this.unlock('builder');
    if (wondersOf(g, id).length >= 5) this.unlock('wonders5');
    if (P.resN && RESOURCES.every((_, i) => P.resN[i] > 0)) this.unlock('collector');
    if (tradesOf(g, id).length >= 3) this.unlock('diplomat');
    if (vassalsOf(g, id).length) this.unlock('suzerain');
    if ((P.generals || []).some((x) => x.lvl >= 5)) this.unlock('strategist');
    if (P.gov !== this.T.gov) { this.T.gov = P.gov; this.T.govChanges++; if (this.T.govChanges >= 3) this.unlock('revolution'); }
    if (P.era >= 2 && this.T.warsDeclared === 0 && !g.match) this.unlock('pacifist');
    if (P.era >= 4) this.unlock('spaceage');
    if (this.T.nukedAt !== null && g.t - this.T.nukedAt > 120) this.unlock('survivor');
    if (g.planet.level >= 1) this.unlock('stars');
    if (g.planet.level >= 5) this.unlock('galactic');
  }

  unlock(aid) {
    if (store.unlocked[aid]) return;
    const a = BY_ID[aid];
    store.unlocked[aid] = Date.now();
    persist();
    const rew = a.r.map(([c, i]) => { const it = find(c, i); return `${it.icon || COSMETICS[c].icon} ${esc(it.name)}`; }).join(', ');
    toast(`<div class="ach-toast"><span class="big">${a.icon}</span><div><b>🏅 Succès débloqué : ${esc(a.name)}</b><br><small>${esc(a.desc)}</small><br><small>Récompense : ${rew}</small></div></div>`, 'ok', 6000);
    this.app.sound.fanfare();
  }
}

// ---------- fenêtre succès & cosmétiques ----------
export function openAchievements(app, tab = 'ach') {
  const body = openModal('<div id="ach-root"></div>');
  const root = body.querySelector('#ach-root');
  let cur = tab;
  const render = () => {
    const n = ACHIEVEMENTS.filter((a) => store.unlocked[a.id]).length;
    let h = `<h2>🏅 Succès et cosmétiques</h2><div class="tabs ach-tabs">
      <button class="tab ${cur === 'ach' ? 'active' : ''}" data-t="ach">🏅 Succès <small>${n}/${ACHIEVEMENTS.length}</small></button>
      <button class="tab ${cur === 'cos' ? 'active' : ''}" data-t="cos">🎨 Cosmétiques</button></div>`;
    if (cur === 'ach') {
      h += `<div class="meter"><div style="width:${(n / ACHIEVEMENTS.length) * 100}%"></div></div><div class="ach-grid">`;
      for (const a of ACHIEVEMENTS) {
        const ok = store.unlocked[a.id];
        const prog = !ok && a.life ? Math.min(1, store.life[a.life] / a.goal) : null;
        const rew = a.r.map(([c, i]) => { const it = find(c, i); return `<span class="chip">${it.icon || COSMETICS[c].icon} ${esc(it.name)}</span>`; }).join('');
        h += `<div class="ach ${ok ? 'done' : ''}"><div class="ach-ic">${ok ? a.icon : '🔒'}</div><div><b>${esc(a.name)}</b><div class="hint">${esc(a.desc)}</div>
          ${prog !== null ? `<div class="meter"><div style="width:${prog * 100}%"></div></div><small class="hint">${a.life === 'playSec' ? `${(store.life.playSec / 3600).toFixed(1)} h / 3 h` : `${store.life[a.life]} / ${a.goal}`}</small>` : ''}
          <div class="chips">${rew}</div>${ok ? `<small class="hint">Débloqué le ${new Date(ok).toLocaleDateString('fr-FR')}</small>` : ''}</div></div>`;
      }
      h += '</div>';
    } else {
      const eq = equipped();
      h += '<p class="hint">Purement esthétique : aucun effet sur le jeu. La couleur s’applique à votre prochaine partie solo.</p>';
      for (const [cat, C] of Object.entries(COSMETICS)) {
        h += `<h3 class="emp-h">${C.icon} ${C.name}</h3><p class="hint">${C.desc}</p><div class="cos-grid">`;
        for (const it of C.items) {
          const un = cosmeticUnlocked(cat, it.id), on = eq[cat] === it.id, src = un ? null : sourceOf(cat, it.id);
          const sw = it.rgb ? `<i class="sw" style="background:rgb(${it.rgb.join(',')})"></i>` : it.sw ? `<i class="sw" style="background:${it.sw}"></i>` : it.icon ? `<span class="ic">${it.icon}</span>` : '';
          h += `<button class="cos ${on ? 'on' : ''} ${un ? '' : 'locked'}" data-c="${cat}" data-i="${it.id}" ${un ? '' : 'disabled'} title="${un ? 'Équiper' : `À débloquer : ${esc(src ? src.name : '')}`}">
            ${sw}<span>${esc(it.name)}</span><small>${on ? '✔ équipé' : un ? '' : '🔒 ' + esc(src ? src.name : '')}</small></button>`;
        }
        h += '</div>';
      }
    }
    root.innerHTML = h;
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]');
    if (t) { cur = t.dataset.t; render(); return; }
    const b = e.target.closest('[data-c]');
    if (!b || b.disabled) return;
    equip(b.dataset.c, b.dataset.i);
    applyCosmetics(app);
    app.onCosmeticsChanged && app.onCosmeticsChanged(b.dataset.c);
    app.sound.click();
    render();
  });
  render();
}


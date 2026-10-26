// Terra Conquest — orchestration : menu, génération, choix du pays, partie, conquête spatiale.
import { $, toast, openModal, closeModal, modalOpen, initModal, esc } from './ui/dom.js';
import { initMenu } from './ui/menu.js';
import { HELP_HTML } from './ui/help.js';
import { Hud } from './ui/hud.js';
import { Panel } from './ui/panel.js';
import { openTechView, autoResearch } from './ui/techView.js';
import { hasSave, readSave, writeSave, exportFile, validateSave } from './ui/save.js';
import { generateEarth } from './map/earth.js';
import { generatePlanet } from './map/procedural.js';
import { planetName } from './map/names.js';
import { PLANET_TYPES } from './map/planetTypes.js';
import { Renderer } from './map/renderer.js';
import { attachInput } from './map/camera.js';
import { Game } from './sim/game.js';
import { BAL, DIFFICULTIES } from './sim/balance.js';
import { ERAS } from './tech/techtree.js';
import { RNG } from './core/rng.js';
import { fmtBig, fmtPop, fmtInt, fmt1, fmtTime, rgbToCss, nextFrame, clamp } from './core/util.js';
import { Art, art, v } from './core/fr.js';
import { newMeta, recordConquest, planetSpec, planetInfo, PERKS } from './space/progression.js';
import { SpaceView } from './space/spaceView.js';

class App {
  constructor() {
    this.mode = 'menu';
    this.canvas = $('#map');
    this.renderer = null;
    this.game = null;
    this.map = null;
    this.topology = null;
    this.speed = 1;
    this.sel = { cell: -1 };
    this.autoResearch = false;
    this.meta = null;
    this.setup = null;
    this.timers = { hud: 0, panel: 0, mini: 0, save: 0, auto: 0 };
    initModal();
    this.menu = initMenu({
      onNew: (s) => this.newGame(s),
      onContinue: () => this.continueGame(),
      onImport: (txt) => this.importSave(txt),
      onHelp: () => openModal(HELP_HTML),
    });
    this.menu.setContinue(hasSave());
    this.hud = new Hud(this);
    this.panel = new Panel(this);
    this.space = new SpaceView(this);
    this.bindInput();
    window.addEventListener('resize', () => { if (this.renderer) this.renderer.resize(); this.space.resize(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(); });
    window.addEventListener('beforeunload', () => this.autosave());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- entrées ----------
  bindInput() {
    // la caméra change avec chaque carte : on passe par un proxy
    const self = this;
    const noop = () => {};
    const camProxy = new Proxy({}, {
      get: (_, k) => {
        const c = self.renderer && self.renderer.cam;
        if (!c) return noop;
        const v = c[k];
        return typeof v === 'function' ? v.bind(c) : v;
      },
    });
    attachInput(this.canvas, camProxy, {
      tap: (sx, sy) => this.onTap(sx, sy),
      hover: (sx, sy) => this.onHover(sx, sy),
    });
    this.canvas.addEventListener('pointerleave', () => { $('#tip').hidden = true; });
    this.canvas.addEventListener('pointerdown', () => { $('#tip').hidden = true; });
  }

  onHover(sx, sy) {
    const tip = $('#tip');
    if (!this.renderer || !matchMedia('(hover: hover)').matches || this.mode === 'space' || this.mode === 'menu') { tip.hidden = true; return; }
    const cell = this.renderer.cellAt(sx, sy);
    if (cell < 0) { tip.hidden = true; return; }
    const c = this.map.cells[cell];
    let who;
    if (this.game) {
      const X = this.game.countries[this.game.owner[cell]];
      who = X.neutral ? 'Terres libres' : X.name;
      if (X.id === this.game.playerId) who += ' (vous)';
    } else {
      who = c.initOwner >= 0 ? this.map.countries0[c.initOwner].name : 'Terres libres';
    }
    tip.innerHTML = `<b>${esc(who)}</b>${c.region ? ` · ${esc(c.region)}` : ''}`;
    tip.style.left = sx + 'px'; tip.style.top = sy + 'px';
    tip.hidden = false;
  }

  onTap(sx, sy) {
    if (!this.renderer) return;
    const cell = this.renderer.cellAt(sx, sy);
    if (this.mode === 'pick') this.pickTap(cell);
    else if (this.mode === 'land') this.landTap(cell);
    else if (this.mode === 'play') this.select(cell);
  }

  onKey(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (e.key === 'Escape') {
      if (modalOpen()) { if ($('#modal').dataset.closable) closeModal(); }
      else if (this.mode === 'play') { if (this.sel.cell >= 0) this.select(-1); else this.openGameMenu(); }
      return;
    }
    if (this.mode !== 'play' || modalOpen()) return;
    if (e.key === ' ') { e.preventDefault(); this.setSpeed(this.speed > 0 ? 0 : this.prevSpeed || 1); }
    else if (e.key >= '1' && e.key <= '4') this.setSpeed([1, 2, 4, 4][+e.key - 1]);
    else if (e.key === 't' || e.key === 'T') this.openTech();
    else if (e.key === 'f' || e.key === 'F') this.focusPlayer(false);
    else if (e.key === 'l' || e.key === 'L') this.renderer.showLabels = !this.renderer.showLabels;
  }

  // ---------- génération ----------
  async buildMap(spec) {
    const screen = $('#loading');
    screen.hidden = false;
    const bar = $('#loading-bar'), msg = $('#loading-msg');
    const progress = async (p, m) => { bar.style.width = Math.round(p * 100) + '%'; msg.textContent = m; await nextFrame(); };
    await progress(0.01, 'Préparation…');
    let map;
    try {
      if (spec.kind === 'earth') {
        if (!this.topology) {
          await progress(0.02, 'Chargement de la carte du monde…');
          const r = await fetch('data/countries-110m.json');
          if (!r.ok) throw new Error('Carte introuvable');
          this.topology = await r.json();
        }
        map = await generateEarth(this.topology, { scale: spec.scale || 1 }, progress);
      } else {
        map = await generatePlanet(spec, progress);
      }
    } finally {
      screen.hidden = true;
    }
    return map;
  }

  makeRenderer(map) {
    if (this.renderer) this.renderer = null;
    this.map = map;
    const r = new Renderer(this.canvas, map);
    r.resize();
    this.renderer = r;
    return r;
  }

  homePlanet(spec) {
    if (spec.kind === 'earth') return { name: 'Terre', type: 'terran', level: 0, rules: PLANET_TYPES.terran.rules, events: PLANET_TYPES.terran.events, aiBonus: 1, aiEra: 0, neutralEra: 0 };
    return planetInfo({ ...spec, level: 0, aiEra: 0, aiBonus: 1 });
  }

  // ---------- nouvelle partie ----------
  async newGame(s) {
    this.settings = s;
    this.meta = null;
    this.speed = s.speed;
    let spec;
    if (s.mode === 'earth') spec = { kind: 'earth' };
    else spec = { kind: 'proc', seed: s.seed, type: s.type, nCountries: s.nAI + 1, targetCells: 440, name: planetName(new RNG('nom-' + s.seed), s.type) };
    this.setup = { spec, settings: s, planetKey: 'home' };
    $('#menu').hidden = true;
    let map;
    try { map = await this.buildMap(spec); }
    catch (err) { console.error(err); toast('Impossible de générer la carte : ' + esc(err.message), 'err', 5000); $('#menu').hidden = false; return; }
    this.enterPick(map);
  }

  enterPick(map) {
    const r = this.makeRenderer(map);
    this.game = null;
    this.mode = 'pick';
    r.pickMode = true;
    const owner = Int16Array.from(map.cells.map((c) => c.initOwner));
    r.attachStatic(owner, map.countries0.map((c) => c.color), (o) => o < 0);
    r.labelsStatic(map.countries0);
    this.fitWorld(r);
    $('#pick').hidden = false;
    $('#pick-card').hidden = true;
    $('.pick-banner b').textContent = 'Choisissez votre pays';
    $('#pick-random').hidden = false;
    $('#pick-random').onclick = () => {
      const k = Math.floor(Math.random() * map.countries0.length);
      const c = map.countries0[k];
      this.pickTap(c.capital);
      r.cam.flyTo(map.cells[c.capital].cx, map.cells[c.capital].cy, Math.max(r.cam.zoom, 2.5));
    };
    $('#pick-back').onclick = () => this.toMenu();
  }

  // vue d'ensemble : la carte remplit au moins 70 % de la hauteur de l'écran
  fitWorld(r) {
    const cam = r.cam;
    cam.x = this.map.W / 2; cam.y = this.map.H / 2;
    cam.zoom = Math.max(1, (cam.ch * 0.7) / this.map.H / cam.base);
    cam.clamp();
  }

  // estimation de la difficulté selon la puissance relative
  pickDifficulty(map, k) {
    const score = (c) => Math.pow(c.pop, 0.85) * (0.5 + c.dev * 0.25) * Math.sqrt(c.cells.length);
    const sorted = map.countries0.map((c, i) => [i, score(c)]).sort((a, b) => b[1] - a[1]);
    const rank = sorted.findIndex((x) => x[0] === k);
    const n = sorted.length;
    if (rank < Math.max(3, n * 0.04)) return ['Facile', '#4cc38a'];
    if (rank < n * 0.15) return ['Normale', '#9fd06a'];
    if (rank < n * 0.4) return ['Difficile', '#f2b84b'];
    if (rank < n * 0.75) return ['Très difficile', '#ef8a5b'];
    return ['Extrême', '#ef5b5b'];
  }

  pickTap(cell) {
    const map = this.map, r = this.renderer;
    if (cell < 0) { r.setSelection(-1, -1); $('#pick-card').hidden = true; return; }
    const k = map.cells[cell].initOwner;
    if (k < 0) { toast('Terres libres : choisissez un pays.', '', 1500); return; }
    r.setSelection(cell, k);
    const c = map.countries0[k];
    const army = BAL.MANPOWER * Math.pow(c.pop, 0.85) * 0.6;
    const income = BAL.K_GOLD * c.pop * BAL.DEV_F[c.dev] * Math.pow(c.pop, -0.2) + BAL.LAND_TAX * c.cells.length;
    const [dl, dc] = this.pickDifficulty(map, k);
    const card = $('#pick-card');
    card.hidden = false;
    card.innerHTML = `
      <h3><span class="swatch" style="background:${rgbToCss(c.color)}"></span>${esc(c.name)}</h3>
      <div class="hint">${c.title ? esc(c.title) + ' · ' : ''}Difficulté estimée : <span class="diff-tag" style="color:${dc}">${dl}</span></div>
      <div class="kv">
        <div><span>Population</span><b>${fmtPop(c.pop)}</b></div>
        <div><span>Armée</span><b>${fmtBig(army)}</b></div>
        <div><span>Territoires</span><b>${c.cells.length}</b></div>
        <div><span>Revenu</span><b>${fmt1(income)} or/s</b></div>
        <div><span>Développement</span><b>${'★'.repeat(c.dev)}${'☆'.repeat(5 - c.dev)}</b></div>
        <div><span>Voisins</span><b>${c.neighbors ? c.neighbors.size : 0}</b></div>
      </div>
      <button class="btn primary big" id="pick-go">Jouer avec ${esc(art(c))}</button>`;
    $('#pick-go').onclick = () => this.startHome(k);
  }

  startHome(k) {
    const s = this.setup.settings, map = this.map;
    const planet = this.homePlanet(this.setup.spec);
    const game = Game.create(map, { difficulty: s.difficulty, playerIndex: k, nAI: s.nAI, planet });
    $('#pick').hidden = true;
    this.beginPlay(game, true);
    const P = game.countries[game.playerId];
    this.welcome();
    game.say(`👑 ${Art(P)} ${v(P, 'entre', 'entrent')} dans l'Histoire. Conquérez ${planet.name === 'Terre' ? 'la Terre' : planet.name} !`, 'info', { player: true, imp: true });
  }

  welcome() {
    let seen = false;
    try { seen = !!localStorage.getItem('terra-conquest-welcome'); localStorage.setItem('terra-conquest-welcome', '1'); } catch { /* ignore */ }
    if (seen) return;
    openModal(`<div class="help"><h2>👋 Bienvenue, souverain·e !</h2>
      <ul>
        <li><b>Touchez un pays voisin</b> puis choisissez le % de votre armée à engager et lancez l'attaque. Le <b>rapport de force estimé</b> vous indique vos chances.</li>
        <li>Votre <b>armée en réserve</b> défend vos frontières : n'engagez pas tout d'un coup.</li>
        <li>Touchez <b>vos propres territoires</b> pour y construire fermes, mines, casernes, universités…</li>
        <li>Ouvrez les <b>technologies 🔬</b> dès que vous avez des points de recherche (ou activez la recherche automatique).</li>
        <li>La simulation est <b>en pause</b> pendant que cette fenêtre est ouverte. Vitesse : ⏸ x1 x2 x4.</li>
      </ul>
      <div class="btn-row"><button class="btn primary" onclick="document.getElementById('modal-close').click()">C'est parti !</button></div></div>`, { narrow: true });
  }

  beginPlay(game, focus) {
    const r = this.renderer;
    this.game = game;
    this.mode = 'play';
    r.pickMode = false;
    r.selCell = -1; r.selCountry = -1; r.painter.selCell = -1; r.painter.selCountry = -1;
    r.attach(game);
    r.labelVer = -1;
    this.sel = { cell: -1 };
    game.on('news', (n) => this.hud.addNews(n));
    game.on('proposal', (p) => this.hud.showProposal(p));
    game.on('era', (e) => { if (e.id === game.playerId) this.onPlayerEra(e.era); });
    game.on('conquered', () => this.onConquered());
    game.on('defeat', () => this.onDefeat());
    game.on('rocketReady', () => toast('🚀 La fusée est prête ! Ouvrez les objectifs pour la lancer.', 'ok', 6000));
    game.on('launch', () => this.onLaunch());
    game.on('war', (w) => { if (w.b === game.playerId) toast(`⚔️ ${esc(Art(game.countries[w.a]))} ${v(game.countries[w.a], 'vous déclare', 'vous déclarent')} la guerre !`, 'err', 4000); });
    this.hud.reset();
    $('#hud').hidden = false;
    this.panel.hide();
    this.setSpeed(this.speed || 1);
    document.body.dataset.era = game.countries[game.playerId].era;
    for (const n of game.news.slice(-3)) this.hud.addNews(n);
    if (focus) this.focusPlayer(true);
    this.hud.update();
    this.autosave();
  }

  selectPlayer() {
    const g = this.game;
    if (!g) return;
    const cap = g.countries[g.playerId].capital;
    if (cap >= 0) this.select(cap);
    this.focusPlayer(true);
  }

  focusPlayer(zoomIn) {
    const g = this.game;
    if (!g) return;
    const own = g.cellsOf[g.playerId];
    if (!own.size) return;
    const r = this.renderer, map = this.map, W = map.W;
    let cap = g.countries[g.playerId].capital;
    if (cap < 0 || !own.has(cap)) cap = [...own][0];
    const c0 = map.cells[cap];
    // composante terrestre principale autour de la capitale (ignore les territoires lointains)
    const cells = [cap], seen = new Set(cells);
    for (let i = 0; i < cells.length && cells.length < 80; i++) {
      for (const nb of map.cells[cells[i]].nbrs) if (own.has(nb) && !seen.has(nb)) { seen.add(nb); cells.push(nb); }
    }
    let minX = 0, maxX = 0, minY = Infinity, maxY = -Infinity;
    for (const id of cells) {
      const c = map.cells[id];
      let dx = c.cx - c0.cx; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      minX = Math.min(minX, dx + c.x0 - c.cx); maxX = Math.max(maxX, dx + c.x1 - c.cx);
      minY = Math.min(minY, c.y0); maxY = Math.max(maxY, c.y1);
    }
    const bw = Math.max(40, maxX - minX), bh = Math.max(30, maxY - minY);
    const cam = r.cam;
    const z = clamp(Math.min(cam.cw / (bw * 3.2), cam.ch / (bh * 3.2)) / cam.base, cam.minZoom, cam.maxZoom * 0.6);
    cam.flyTo(c0.cx + (minX + maxX) / 2, (minY + maxY) / 2, zoomIn ? z : cam.zoom, 1.1);
  }

  select(cell) {
    const g = this.game;
    this.sel = { cell };
    this.renderer.setSelection(cell, cell >= 0 ? g.owner[cell] : -1);
    this.panel.render(true);
  }

  attack(xid, frac, cell) {
    const g = this.game;
    const r = g.launch(g.playerId, xid, frac, cell);
    if (!r.ok) { toast(r.msg, 'err'); return; }
    const D = g.countries[xid];
    toast(r.merged ? `⚔️ Renforts envoyés contre ${esc(art(D))}.` : `⚔️ Offensive lancée contre ${esc(art(D))} !`, 'ok', 1800);
  }

  setSpeed(sp) {
    if (sp > 0) this.prevSpeed = sp;
    this.speed = sp;
    this.hud.setSpeed(sp);
  }

  // ---------- fenêtres ----------
  openTech() { if (this.game) openTechView(this); }

  openGoals() {
    const g = this.game;
    if (!g) return;
    const render = () => {
      const s = g.rocketStatus(), P = g.countries[g.playerId];
      const n = g.cellsOf[g.playerId].size;
      const goal = (ok, title, sub) => `<div class="goal ${ok ? 'ok' : ''}"><div class="ck">${ok ? '✔' : ''}</div><div><b>${title}</b><small>${sub}</small></div></div>`;
      let rocket = '';
      if (g.rocket.stage === 0) {
        const can = s.conquered && s.space && s.colonization && s.spaceport;
        rocket = `<button class="btn primary big" id="rk-build" ${can && s.gold ? '' : 'disabled'}>🏗️ Construire la fusée (${fmtInt(BAL.ROCKET_COST)} or)</button>`;
        if (can && !s.gold) rocket += `<p class="hint center">Il vous faut ${fmtInt(BAL.ROCKET_COST)} or.</p>`;
      } else if (g.rocket.stage === 1) {
        const pct = Math.min(100, (g.rocket.progress / BAL.ROCKET_WORK) * 100);
        rocket = `<p>Construction en cours… <b>${Math.floor(pct)} %</b> <span class="hint">(dépend de votre production : ${fmt1(P.st.prod)}/s${g.conquered ? '' : ' — en pause : la planète n’est plus entièrement sous votre contrôle'})</span></p><div class="meter"><div style="width:${pct}%"></div></div>`;
      } else if (g.rocket.stage === 2) {
        rocket = `<button class="btn primary big" id="rk-launch">🚀 Lancer la fusée !</button>`;
      }
      const body = `
        <h2>🚀 Objectifs : quitter ${g.planet.name === 'Terre' ? 'la Terre' : esc(g.planet.name)}</h2>
        <p class="hint">Pour partir à la conquête d'une nouvelle planète, réunissez toutes ces conditions.</p>
        <div class="goals">
          ${goal(s.conquered, 'Contrôler 100 % de la planète', `${n} / ${g.nCells} territoires (${Math.floor((n / g.nCells) * 100)} %)`)}
          ${goal(s.space, 'Atteindre l’époque spatiale', `Époque actuelle : ${ERAS[P.era].name}`)}
          ${goal(s.colonization, 'Rechercher la Colonisation spatiale', 'Technologie de l’époque spatiale')}
          ${goal(s.spaceport, 'Construire un spatioport', 'Bâtiment débloqué par la technologie Fusées')}
          ${goal(g.rocket.stage >= 2, 'Construire la fusée', `${fmtInt(BAL.ROCKET_COST)} or + travail de production`)}
        </div>
        ${rocket}
        ${this.meta ? `<p class="hint center">Planètes conquises : ${this.meta.level} · Galaxie : ${esc(this.meta.galaxy + 1 + '')}</p>` : ''}`;
      const root = openModal(body, { narrow: true });
      const b = root.querySelector('#rk-build');
      if (b) b.onclick = () => { const r = g.startRocket(); if (!r.ok) toast(r.msg, 'err'); render(); };
      const l = root.querySelector('#rk-launch');
      if (l) l.onclick = () => { closeModal(); g.launchRocket(); };
    };
    render();
  }

  openGameMenu() {
    if (!this.game) return;
    const root = openModal(`
      <h2>☰ Menu</h2>
      <div class="actions" style="margin-top:12px">
        <button class="btn big" data-m="resume">▶️ Reprendre</button>
        <button class="btn big" data-m="save">💾 Sauvegarder</button>
        <button class="btn big" data-m="export">📤 Exporter la sauvegarde (.json)</button>
        <button class="btn big" data-m="log">📰 Fil d'actualité complet</button>
        <button class="btn big" data-m="labels">🏷️ ${this.renderer.showLabels ? 'Masquer' : 'Afficher'} les noms</button>
        <button class="btn big" data-m="help">❓ Comment jouer</button>
        <button class="btn big danger" data-m="quit">🏠 Quitter vers l'accueil</button>
      </div>
      <p class="hint center">Difficulté : ${DIFFICULTIES[this.setup.settings.difficulty]?.label || ''} · Temps de jeu : ${fmtTime(this.game.t)}</p>`, { narrow: true });
    root.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]');
      if (!m) return;
      switch (m.dataset.m) {
        case 'resume': closeModal(); break;
        case 'save': { const ok = this.autosave(); toast(ok ? '💾 Partie sauvegardée' : 'Sauvegarde impossible (stockage indisponible)', ok ? 'ok' : 'err'); closeModal(); break; }
        case 'export': exportFile(this.makeSave()); break;
        case 'log': closeModal(); this.hud.openLog(); break;
        case 'labels': this.renderer.showLabels = !this.renderer.showLabels; closeModal(); break;
        case 'help': openModal(HELP_HTML); break;
        case 'quit': closeModal(); this.autosave(); this.toMenu(); break;
      }
    });
  }

  onPlayerEra(era) {
    const E = ERAS[era];
    document.body.dataset.era = era;
    openModal(`<div class="center"><div class="big-emoji">🏛️</div><h2>Époque ${E.adj} !</h2>
      <p>Vos soldats sont désormais <b>×${E.mult.toFixed(2).replace('.', ',')}</b> plus efficaces et de nouvelles technologies sont disponibles.</p>
      ${era === 4 ? '<p>Construisez un <b>spatioport</b> et une <b>fusée</b> pour quitter la planète une fois celle-ci entièrement conquise.</p>' : ''}
      <div class="btn-row"><button class="btn primary" onclick="document.getElementById('modal-close').click()">Continuer</button></div></div>`, { narrow: true });
  }

  onConquered() {
    const g = this.game, P = g.countries[g.playerId];
    const space = P.era >= 4;
    openModal(`<div class="center"><div class="big-emoji">🌍</div><h2>${esc(g.planet.name)} est à vous !</h2>
      <p>Vous contrôlez 100 % de la planète après ${fmtTime(g.t)} de jeu.</p>
      <p>${space ? 'Il ne reste plus qu’à construire un <b>spatioport</b> et la <b>fusée</b> pour partir vers les étoiles.' : 'Développez votre civilisation jusqu’à l’<b>époque spatiale</b> pour construire une fusée. Attention aux révoltes !'}</p>
      <div class="btn-row"><button class="btn primary" id="vic-goals">🚀 Voir les objectifs</button><button class="btn" onclick="document.getElementById('modal-close').click()">Continuer</button></div></div>`, { narrow: true });
    $('#vic-goals').onclick = () => this.openGoals();
  }

  onDefeat() {
    const g = this.game;
    this.setSpeed(0);
    const retry = this.meta && this.setup.planetKey !== 'home';
    openModal(`<div class="center"><div class="big-emoji">💀</div><h2>Défaite</h2>
      <p>Votre civilisation a été rayée de la carte après ${fmtTime(g.t)}.</p>
      <div class="btn-row">${retry ? '<button class="btn primary" id="df-retry">🔁 Retenter cette planète</button>' : ''}<button class="btn ${retry ? '' : 'primary'}" id="df-menu">🏠 Accueil</button></div></div>`, { narrow: true, closable: false });
    $('#df-menu').onclick = () => { closeModal(); this.toMenu(); };
    if (retry) $('#df-retry').onclick = () => { closeModal(); this.colonize(this.meta.current, null); };
  }

  // ---------- conquête spatiale ----------
  onLaunch() {
    const g = this.game, P = g.countries[g.playerId];
    if (!this.meta) {
      const sp = this.setup.spec;
      this.meta = newMeta({ name: g.planet.name, type: sp.kind === 'earth' ? 'earth' : sp.type, seed: sp.kind === 'earth' ? 'terre-' + Math.floor(Math.random() * 1e6) : sp.seed }, P);
    }
    recordConquest(this.meta, P, this.setup.planetKey || 'home', g.planet.name, g.t);
    this.meta.difficulty = this.setup.settings.difficulty;
    this.meta.current = null;
    this.setSpeed(0);
    this.select(-1);
    let port = g.hasBuilding(g.playerId, 'spaceport');
    if (port < 0) port = P.capital;
    this.renderer.launchRocket(port, () => this.enterSpace());
  }

  enterSpace() {
    this.mode = 'space';
    this.game = null;
    $('#hud').hidden = true;
    this.panel.hide();
    this.renderer = null;
    this.autosave();
    this.space.show(this.meta);
  }

  async colonize(p, perkId) {
    const meta = this.meta;
    if (perkId) {
      const perk = PERKS.find((x) => x.id === perkId);
      if (perk) { perk.apply(meta); meta.perksTaken.push(perkId); }
    }
    meta.current = p;
    const spec = planetSpec(meta, p);
    this.setup = { spec, settings: { ...(this.setup ? this.setup.settings : {}), difficulty: meta.difficulty || 'normal' }, planetKey: p.key };
    this.space.hide();
    let map;
    try { map = await this.buildMap(spec); }
    catch (err) { console.error(err); toast('Erreur de génération : ' + esc(err.message), 'err', 5000); this.space.show(meta); return; }
    this.enterLanding(map);
  }

  enterLanding(map) {
    const r = this.makeRenderer(map);
    this.mode = 'land';
    r.pickMode = true;
    const owner = Int16Array.from(map.cells.map((c) => c.initOwner));
    r.attachStatic(owner, map.countries0.map((c) => c.color), (o) => o < 0);
    r.labelsStatic(map.countries0);
    this.fitWorld(r);
    $('#pick').hidden = false;
    $('#pick-card').hidden = true;
    $('.pick-banner b').textContent = `${this.setup.spec.name} — choisissez votre site d'atterrissage`;
    $('#pick-random').hidden = true;
    $('#pick-back').onclick = () => { $('#pick').hidden = true; this.renderer = null; this.mode = 'space'; this.space.show(this.meta); };
  }

  landTap(cell) {
    const map = this.map, r = this.renderer;
    if (cell < 0) return;
    const k = map.cells[cell].initOwner;
    r.setSelection(cell, k);
    const owner = k >= 0 ? map.countries0[k] : null;
    const card = $('#pick-card');
    card.hidden = false;
    card.innerHTML = `
      <h3>🛸 Site d'atterrissage</h3>
      <div class="hint">${esc(map.cells[cell].region || '')} · ${owner ? `territoire ${esc(owner.title ? owner.title + ' ' : '')}${esc(owner.name)}` : 'terres libres'}</div>
      <p class="hint">${owner ? 'Atterrir chez une civilisation déclenche immédiatement la guerre avec elle.' : 'Un atterrissage en terres libres est plus discret.'} Vous débarquez avec ${4 + (this.meta.perk.startCells || 0)} territoires.</p>
      <button class="btn primary big" id="land-go">🚀 Atterrir ici</button>`;
    $('#land-go').onclick = () => this.startLanding(cell);
  }

  startLanding(cell) {
    const meta = this.meta, spec = this.setup.spec;
    const game = Game.create(this.map, {
      difficulty: meta.difficulty || 'normal', planet: planetInfo(spec), landing: cell,
      meta: { name: meta.name, art: meta.art, title: meta.title, color: meta.color, techs: meta.techs, repeat: meta.repeat, perk: meta.perk, bonusGold: meta.bonusGold },
    });
    $('#pick').hidden = true;
    this.speed = this.prevSpeed || 1;
    this.beginPlay(game, true);
    const P = game.countries[game.playerId];
    game.say(`🛸 ${Art(P)} ${v(P, 'débarque', 'débarquent')} sur ${spec.name} ! Planète n° ${meta.level + 1} — conquérez-la.`, 'space', { player: true, imp: true });
  }

  // ---------- sauvegarde ----------
  makeSave() {
    const base = { v: 1, savedAt: Date.now(), setup: this.setup, meta: this.meta };
    if (this.mode === 'play' && this.game) {
      const cam = this.renderer.cam;
      return { ...base, phase: 'play', game: this.game.serialize(), view: { x: cam.x, y: cam.y, zoom: cam.zoom } };
    }
    if (this.mode === 'space' && this.meta) return { ...base, phase: 'space', game: { owner: [] } };
    return null;
  }
  autosave() {
    const data = this.makeSave();
    if (!data || (this.game && this.game.over)) return false;
    const ok = writeSave(data);
    this.menu.setContinue(true);
    return ok;
  }
  async continueGame() {
    const data = readSave();
    if (!data) { toast('Aucune sauvegarde trouvée.', 'err'); return; }
    await this.loadData(data);
  }
  async importSave(txt) {
    let data;
    try { data = JSON.parse(txt); } catch { toast('Fichier illisible.', 'err'); return; }
    if (!validateSave(data)) { toast('Ce fichier n’est pas une sauvegarde Terra Conquest valide.', 'err'); return; }
    await this.loadData(data);
  }
  async loadData(data) {
    if (!validateSave(data)) { toast('Sauvegarde invalide ou incompatible.', 'err'); return; }
    this.setup = data.setup;
    this.settings = data.setup.settings;
    this.meta = data.meta || null;
    $('#menu').hidden = true;
    if (data.phase === 'space') { this.mode = 'space'; this.space.show(this.meta); return; }
    let map;
    try { map = await this.buildMap(data.setup.spec); }
    catch (err) { console.error(err); toast('Impossible de recharger la carte.', 'err'); $('#menu').hidden = false; return; }
    const r = this.makeRenderer(map);
    const planet = data.setup.planetKey === 'home' ? this.homePlanet(data.setup.spec) : planetInfo(data.setup.spec);
    let game;
    try { game = Game.restore(map, { difficulty: data.setup.settings.difficulty, planet }, data.game); }
    catch (err) { console.error(err); toast('Sauvegarde corrompue.', 'err'); $('#menu').hidden = false; return; }
    this.speed = data.setup.settings.speed || 1;
    this.beginPlay(game, false);
    if (data.view) { r.cam.x = data.view.x; r.cam.y = data.view.y; r.cam.zoom = data.view.zoom; r.cam.clamp(); }
    toast('Partie chargée.', 'ok', 1500);
  }

  toMenu() {
    this.mode = 'menu';
    this.game = null;
    this.renderer = null;
    $('#hud').hidden = true;
    $('#pick').hidden = true;
    this.space.hide();
    this.panel.hide();
    document.body.dataset.era = 0;
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    $('#menu').hidden = false;
    this.menu.setContinue(hasSave());
  }

  // ---------- boucle ----------
  loop(ts) {
    const dt = Math.min(0.1, (ts - this.last) / 1000);
    this.last = ts;
    try {
      const paused = modalOpen() || document.hidden;
      if (this.mode === 'play' && this.game && !this.game.over && this.speed > 0 && !paused) this.game.advance(dt * this.speed);
      if (this.renderer && this.mode !== 'space' && this.mode !== 'menu') this.renderer.render(dt);
      if (this.mode === 'space') this.space.render(dt);
      if (this.mode === 'play' && this.game) {
        const T = this.timers;
        T.hud += dt; T.panel += dt; T.mini += dt; T.save += dt; T.auto += dt;
        if (T.hud > 0.25) { T.hud = 0; this.hud.update(); }
        if (T.panel > 0.5) { T.panel = 0; if (this.sel.cell >= 0) this.panel.render(); }
        if (T.mini > 0.3) { T.mini = 0; this.renderer.renderMinimap($('#minimap')); }
        if (T.auto > 1) { T.auto = 0; if (this.autoResearch && this.speed > 0) autoResearch(this.game); }
        if (T.save > 30) { T.save = 0; this.autosave(); }
      }
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Les modules sont différés : le DOM est déjà prêt ici.
window.app = new App();

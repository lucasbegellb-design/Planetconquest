// Terra Conquest — orchestration : menu, génération, choix du pays, partie, conquête spatiale.
import { $, toast, openModal, closeModal, modalOpen, initModal, esc } from './ui/dom.js';
import { initMenu } from './ui/menu.js';
import { HELP_HTML } from './ui/help.js';
import { Hud } from './ui/hud.js';
import { Panel } from './ui/panel.js';
import { openTechView } from './ui/techView.js';
import { hasSave, readSave, writeSave, exportFile, validateSave } from './ui/save.js';
import { generateEarth } from './map/earth.js';
import { generatePlanet } from './map/procedural.js';
import { planetName } from './map/names.js';
import { PLANET_TYPES, specialWater } from './map/planetTypes.js';
import { makeNoise3 } from './core/noise.js';
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
import { Sound } from './ui/sound.js';
import { Replay } from './ui/replay.js';
import { Multi } from './net/multiplayer.js';
import { mapHash } from './net/mapsync.js';
import { runCommand } from './sim/commands.js';
import { Advisor } from './ui/advisor.js';
import { Alerts } from './ui/alerts.js';
import { StatsRecorder, openStats } from './ui/stats.js';
import { Tutorial } from './ui/tutorial.js';
import { openSettings, applySettings } from './ui/settingsView.js';
import { openSlots } from './ui/slots.js';
import { settings } from './ui/settings.js';
import { MAP_MODES } from './map/mapModes.js';
import { openEmpireView, bindEmpireChange } from './ui/empireView.js';

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
    this.meta = null;
    this.setup = null;
    this.timers = { hud: 0, panel: 0, mini: 0, save: 0, boom: 0 };
    this.pct = 50;
    this.sound = new Sound();
    const unlock = () => this.sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    initModal();
    this.menu = initMenu({
      onNew: (s) => this.newGame(s),
      onContinue: () => this.continueGame(),
      onImport: (txt) => this.importSave(txt),
      onHelp: () => openModal(HELP_HTML),
      onLoad: () => openSlots(this, 'load'),
      onSettings: () => openSettings(this),
    });
    this.menu.setContinue(hasSave());
    this.hud = new Hud(this);
    this.panel = new Panel(this);
    this.space = new SpaceView(this);
    this.replay = new Replay(this);
    this.advisor = new Advisor(this);
    this.alerts = new Alerts(this);
    this.stats = new StatsRecorder();
    this.tutorial = new Tutorial(this);
    applySettings(this);
    settings.onChange(() => applySettings(this));
    bindEmpireChange(this);
    this.multi = new Multi(this);
    $('#btn-multi').addEventListener('click', () => this.mpOpen());
    $('#btn-emote').addEventListener('click', () => this.multi.openEmotes());
    const jp = new URLSearchParams(location.search).get('join');
    if (jp) setTimeout(() => this.mpOpen(jp), 50);
    this.registerPWA();
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
      canAim: (sx, sy) => this.canAim(sx, sy),
      aimStart: (sx, sy) => this.aimStart(sx, sy),
      aimMove: (sx, sy) => this.aimMove(sx, sy),
      aimEnd: (sx, sy, cancel) => this.aimEnd(sx, sy, cancel),
    });
    this.canvas.addEventListener('pointerleave', () => { $('#tip').hidden = true; });
    this.canvas.addEventListener('pointerdown', () => { $('#tip').hidden = true; });
  }

  // Application installable et jouable hors ligne (uniquement en HTTPS : GitHub Pages)
  registerPWA() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ---------- glisser pour attaquer ----------
  canAim(sx, sy) {
    if (this.mode !== 'play' || !this.game || this.game.over) return false;
    const cell = this.renderer.cellAt(sx, sy);
    return cell >= 0 && this.game.owner[cell] === this.game.playerId;
  }
  aimStart(sx, sy) {
    const cell = this.renderer.cellAt(sx, sy);
    // sur téléphone, le panneau masquerait la cible
    if (this.sel.cell >= 0 && matchMedia('(max-width: 760px), (max-height: 500px)').matches) this.select(-1);
    this.renderer.aim = { src: cell, x: 0, y: 0, ok: false, label: '' };
    $('#tip').hidden = true;
    this.sound.buzz(15);
    this.aimMove(sx, sy);
  }
  aimMove(sx, sy) {
    const A = this.renderer.aim, g = this.game;
    if (!A) return;
    const [wx, wy] = this.renderer.cam.toWorld(sx, sy);
    A.x = wx; A.y = wy;
    const cell = this.renderer.cellAt(sx, sy);
    A.target = cell; A.ok = false; A.label = ''; A.color = null;
    if (cell < 0) return;
    const o = g.owner[cell], pid = g.playerId;
    if (o === pid) { A.label = '↩︎ Relâchez sur une cible'; return; }
    const X = g.countries[o];
    if (g.allied(pid, o)) { A.label = '🤝 Allié'; return; }
    if (g.inTruce(pid, o)) { A.label = '🕊️ Trêve en cours'; return; }
    const est = g.estimateAttack(pid, o, this.pct / 100, cell);
    if (!est) { A.label = '🚫 Hors de portée'; return; }
    const r = est.ratio;
    A.ok = true;
    A.color = r < 0.7 ? '#ef5b5b' : r < 1.2 ? '#f2b84b' : '#4cc38a';
    A.label = `⚔️ ${X.name} · ${this.pct} % · ×${r >= 10 ? Math.round(r) : fmt1(r)}${est.naval ? ' ⛵' : ''}`;
  }
  aimEnd(sx, sy, cancel) {
    const A = this.renderer.aim;
    this.renderer.aim = null;
    if (!A || cancel || !A.ok) return;
    this.attack(this.game.owner[A.target], this.pct / 100, A.target);
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
    const SP = [0.5, 1, 2, 4];
    if (e.key === ' ') { e.preventDefault(); this.setSpeed(this.speed > 0 ? 0 : this.prevSpeed || 1); }
    else if (e.key >= '1' && e.key <= '3') this.setSpeed([1, 2, 4][+e.key - 1]);
    else if (e.key === '0') this.setSpeed(0.5);
    else if (e.key === '-' || e.key === '+' || e.key === '=') {
      const i = Math.max(0, SP.indexOf(this.speed > 0 ? this.speed : this.prevSpeed || 1));
      this.setSpeed(SP[Math.min(SP.length - 1, Math.max(0, i + (e.key === '-' ? -1 : 1)))]);
    } else if (e.key === 'Tab') { e.preventDefault(); this.cycleFront(e.shiftKey ? -1 : 1); }
    else if (e.key === 'c' || e.key === 'C') this.selectPlayer();
    else if (e.key === 'm' || e.key === 'M') this.cycleMapMode();
    else if (e.key === 's' || e.key === 'S') openStats(this);
    else if (e.key === 'n' || e.key === 'N') this.hud.openLog();
    else if (e.key === 'r' || e.key === 'R') this.hud.openRanking();
    else if (e.key === '?' || e.key === 'h' || e.key === 'H') openModal(HELP_HTML);
    else if (e.key === 't' || e.key === 'T') this.openTech();
    else if (e.key === 'e' || e.key === 'E') this.openEmpire();
    else if (e.key === 'f' || e.key === 'F') this.focusPlayer(false);
    else if (e.key === 'l' || e.key === 'L') this.renderer.showLabels = !this.renderer.showLabels;
  }

  // ---------- génération ----------
  async buildMap(spec) {
    const screen = $('#loading');
    screen.hidden = false;
    const bar = $('#loading-bar'), msg = $('#loading-msg');
    const progress = async (p, m) => { bar.style.width = Math.round(p * 100) + '%'; msg.textContent = m; };
    progress(0.01, 'Préparation…');
    let map = null;
    try {
      map = await this.genInWorker(spec, progress).catch((err) => { console.warn('Worker indisponible :', err.message); return null; });
      if (!map) map = await this.genInPage(spec, async (p, m) => { await progress(p, m); await nextFrame(); });
    } finally {
      screen.hidden = true;
    }
    if (map.planetType) {
      // fonction de couleur des mers spéciales (lave, gaz) recréée avec le même bruit
      const wf = specialWater(map.planetType, makeNoise3(new RNG(`planete-${spec.seed}-${map.planetType}`)));
      map.palette = { ...(map.palette || {}), waterFn: wf || undefined };
    }
    return map;
  }

  genInWorker(spec, progress) {
    return new Promise((resolve, reject) => {
      if (this.worker === null || typeof Worker === 'undefined') { reject(new Error('non supporté')); return; }
      try { this.worker ||= new Worker(new URL('./map/worker.js', import.meta.url), { type: 'module' }); }
      catch (err) { this.worker = null; reject(err); return; }
      const w = this.worker;
      w.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'progress') progress(d.p, d.m);
        else if (d.type === 'done') resolve(d.map);
        else { reject(new Error(d.message)); }
      };
      w.onerror = (e) => { e.preventDefault && e.preventDefault(); this.worker.terminate(); this.worker = null; reject(new Error(e.message || 'erreur du worker')); };
      w.postMessage({ spec });
    });
  }

  async genInPage(spec, progress) {
    if (spec.kind !== 'earth') return generatePlanet(spec, progress);
    if (!this.topology) {
      await progress(0.02, 'Chargement de la carte du monde…');
      const r = await fetch('data/countries-110m.json');
      if (!r.ok) throw new Error('Carte introuvable');
      this.topology = await r.json();
    }
    return generateEarth(this.topology, { scale: spec.scale || 1 }, progress);
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
  specFor(s, humans) {
    if (s.mode === 'earth') return { kind: 'earth' };
    return { kind: 'proc', seed: s.seed, type: s.type, nCountries: s.nAI + humans, targetCells: 440, name: planetName(new RNG('nom-' + s.seed), s.type) };
  }

  async newGame(s) {
    this.settings = s;
    this.meta = null;
    this.speed = s.speed;
    const spec = this.specFor(s, 1);
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
    if (this.multi.active) {
      const taken = this.multi.takenBy(k);
      const go = $('#pick-go');
      go.textContent = taken ? `Déjà pris par ${taken.name}` : `Choisir ${art(c)}`;
      go.disabled = !!taken;
      go.onclick = () => { this.multi.pick(k); toast(`Vous jouerez ${esc(art(c))}.`, 'ok', 1500); };
    } else $('#pick-go').onclick = () => this.startHome(k);
  }

  startHome(k) {
    const s = this.setup.settings, map = this.map;
    const planet = this.homePlanet(this.setup.spec);
    const game = Game.create(map, { difficulty: s.difficulty, pace: s.pace, playerIndex: k, nAI: s.nAI, planet });
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
        <li>Plus rapide : <b>appui long</b> sur votre territoire (ou <b>clic droit</b>) puis <b>glissez</b> vers la cible. Le bouton ⚔️ en bas à droite règle le % engagé.</li>
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
    this.advisor.reset();
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
    game.on('matchEnd', (e) => this.onMatchEnd(e.ranking));
    const mp = this.multi.active;
    document.body.classList.toggle('mp', mp);
    document.body.classList.toggle('mp-client', this.multi.isClient);
    $('#btn-emote').hidden = !mp;
    $('#btn-goals').textContent = mp ? '🎯' : '🚀';
    $('#btn-goals').title = mp ? 'Scores et objectifs' : 'Objectifs';
    game.on('rocketReady', () => toast('🚀 La fusée est prête ! Ouvrez les objectifs pour la lancer.', 'ok', 6000));
    game.on('launch', () => this.onLaunch());
    const pid = game.playerId, snd = this.sound;
    game.on('capture', (e) => { if (e.to === pid) snd.capture(); else if (e.from === pid) snd.lost(); });
    game.on('eliminated', (e) => { if (e.by === pid) snd.fanfare(); });
    game.on('war', (w) => { if (w.b === pid) snd.horn(); });
    game.on('era', (e) => { if (e.id === pid) snd.chord(); });
    this.alerts.attach(game);
    this.tutorial.start(game);
    if (this.renderer) this.renderer.reduceMotion = !!settings.get('reduceMotion');
    if (!this.keepStats) this.stats.reset();
    this.keepStats = false;
    this.setMapMode(this.mapMode || 'pol');
    this.hud.reset();
    $('#hud').hidden = false;
    this.panel.hide();
    this.setSpeed(this.speed || 1);
    this.panel.pct = this.pct;
    this.hud.updateFab();
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

  // modes de carte
  setMapMode(mode) {
    this.mapMode = mode;
    if (this.renderer) this.renderer.setMapMode(mode, settings.get('colorblind'));
    this.hud.showLegend(mode);
  }
  cycleMapMode() {
    const i = MAP_MODES.findIndex((m) => m.id === (this.mapMode || 'pol'));
    this.setMapMode(MAP_MODES[(i + 1) % MAP_MODES.length].id);
  }

  // centre la carte sur un territoire et le sélectionne (alertes, fil d'actualité)
  goToCell(cell) {
    if (!this.game || !this.renderer || cell < 0 || cell >= this.map.cells.length) return;
    if (modalOpen()) closeModal();
    const c = this.map.cells[cell], cam = this.renderer.cam;
    cam.flyTo(c.cx, c.cy, Math.max(cam.zoom, 2.2), 0.7);
    this.select(cell);
  }
  // Tab : passe d'un front à l'autre (vos offensives, puis celles qui vous visent)
  cycleFront(dir) {
    const g = this.game, pid = g.playerId;
    const list = g.offensives.filter((o) => o.a === pid).concat(g.offensives.filter((o) => o.d === pid)).filter((o) => o.cur >= 0);
    if (!list.length) { toast('Aucun front actif.', '', 1500); return; }
    this.frontIdx = ((this.frontIdx ?? -1) + dir + list.length) % list.length;
    this.goToCell(list[this.frontIdx].cur);
  }

  select(cell) {
    const g = this.game;
    this.sel = { cell };
    this.renderer.setSelection(cell, cell >= 0 ? g.owner[cell] : -1);
    this.panel.render(true);
  }

  // toutes les actions du joueur passent par ici (solo, hôte ou joueur distant)
  cmd(name, ...args) {
    if (this.multi.isClient) return this.multi.cmd(name, args);
    return runCommand(this.game, this.game.playerId, name, args);
  }
  get auto() {
    const g = this.game, P = g && g.countries[g.playerId];
    return (P && P.auto) || { gov: false, mode: 'equilibre', res: false };
  }
  setAuto(patch) {
    const a = { ...this.auto, ...patch };
    this.game.countries[this.game.playerId].auto = a;
    this.cmd('auto', a.gov, a.mode, a.res);
  }

  attack(xid, frac, cell) {
    const g = this.game;
    const r = this.cmd('launch', xid, frac, cell);
    if (r.pending) { this.sound.boom(1); this.sound.buzz(35); return; }
    if (!r.ok) { toast(r.msg, 'err'); return; }
    const D = g.countries[xid];
    toast(r.merged ? `⚔️ Renforts envoyés contre ${esc(art(D))}.` : `⚔️ Offensive lancée contre ${esc(art(D))} !`, 'ok', 1800);
    this.sound.boom(1); this.sound.buzz(35);
  }

  setSpeed(sp) {
    if (sp > 0) this.prevSpeed = sp;
    this.speed = sp;
    this.hud.setSpeed(sp);
  }

  // ---------- fenêtres ----------
  openTech() { if (this.game) openTechView(this); }
  openEmpire(tab) { if (this.game) openEmpireView(this, tab); }

  openGoals() {
    const g = this.game;
    if (!g) return;
    if (this.multi.active) { this.multi.openScores(); return; }
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
      if (b) b.onclick = () => { const r = this.cmd('startRocket'); if (!r.ok) toast(r.msg, 'err'); render(); };
      const l = root.querySelector('#rk-launch');
      if (l) l.onclick = () => { closeModal(); this.cmd('launchRocket'); };
    };
    render();
  }

  openGameMenu() {
    if (!this.game) return;
    const root = openModal(`
      <h2>☰ Menu</h2>
      <div class="actions" style="margin-top:12px">
        <button class="btn big" data-m="resume">▶️ Reprendre</button>
        <button class="btn big" data-m="save">💾 Sauvegarder…</button>
        <button class="btn big" data-m="export">📤 Exporter la sauvegarde (.json)</button>
        <button class="btn big" data-m="replay">🎬 Revoir l'histoire (timelapse)</button>
        <button class="btn big" data-m="rank">🏆 Classement mondial</button>
        <button class="btn big" data-m="stats">📈 Statistiques et graphiques</button>
        <button class="btn big" data-m="log">📰 Fil d'actualité complet</button>
        <div class="two"><button class="btn" data-m="sound">${this.sound.on ? '🔊 Son activé' : '🔇 Son coupé'}</button><button class="btn" data-m="haptics">${this.sound.haptics ? '📳 Vibrations' : '📴 Sans vibration'}</button></div>
        ${document.fullscreenEnabled ? '<button class="btn big" data-m="fs">⛶ Plein écran</button>' : ''}
        <button class="btn big" data-m="labels">🏷️ ${this.renderer.showLabels ? 'Masquer' : 'Afficher'} les noms</button>
        <button class="btn big" data-m="advisor">🧭 Conseiller : ${this.advisor.on ? 'activé' : 'désactivé'}</button>
        <button class="btn big" data-m="settings">⚙️ Réglages</button>
        <button class="btn big" data-m="help">❓ Comment jouer</button>
        <button class="btn big danger" data-m="quit">🏠 Quitter vers l'accueil</button>
      </div>
      <p class="hint center">Difficulté : ${DIFFICULTIES[this.setup.settings.difficulty]?.label || ''} · Rythme : ${({ 0.6: 'stratégique', 0.8: 'posé', 1: 'classique' })[this.game.pace] || this.game.pace} · Temps de jeu : ${fmtTime(this.game.t)}</p>`, { narrow: true });
    root.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]');
      if (!m) return;
      switch (m.dataset.m) {
        case 'resume': closeModal(); break;
        case 'save': this.autosave(); openSlots(this, 'save'); break;
        case 'settings': openSettings(this); break;
        case 'export': exportFile(this.makeSave()); break;
        case 'log': closeModal(); this.hud.openLog(); break;
        case 'replay': closeModal(); this.replay.open(); break;
        case 'rank': closeModal(); this.hud.openRanking(); break;
        case 'stats': closeModal(); openStats(this); break;
        case 'sound': this.sound.setSound(!this.sound.on); closeModal(); this.openGameMenu(); break;
        case 'haptics': this.sound.setHaptics(!this.sound.haptics); closeModal(); this.openGameMenu(); break;
        case 'fs': closeModal(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); break;
        case 'labels': this.renderer.showLabels = !this.renderer.showLabels; closeModal(); break;
        case 'advisor': this.advisor.setOn(!this.advisor.on); closeModal(); this.openGameMenu(); break;
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
      <div class="btn-row"><button class="btn primary" id="vic-goals">🚀 Voir les objectifs</button><button class="btn" id="vic-replay">🎬 Revoir la conquête</button><button class="btn" onclick="document.getElementById('modal-close').click()">Continuer</button></div></div>`, { narrow: true });
    $('#vic-goals').onclick = () => this.openGoals();
    $('#vic-replay').onclick = () => { closeModal(); this.replay.open(); };
    this.sound.fanfare();
  }

  onDefeat() {
    const g = this.game;
    if (this.multi.active) {
      openModal(`<div class="center"><div class="big-emoji">💀</div><h2>Vous avez été éliminé</h2>
        <p>La partie continue : vous pouvez la suivre en spectateur jusqu'à la fin.</p>
        <div class="btn-row"><button class="btn primary" onclick="document.getElementById('modal-close').click()">👀 Regarder</button><button class="btn" id="df-quit">🏠 Quitter</button></div></div>`, { narrow: true });
      $('#df-quit').onclick = () => { closeModal(); this.toMenu(); };
      return;
    }
    this.setSpeed(0);
    const retry = this.meta && this.setup.planetKey !== 'home';
    openModal(`<div class="center"><div class="big-emoji">💀</div><h2>Défaite</h2>
      <p>Votre civilisation a été rayée de la carte après ${fmtTime(g.t)}.</p>
      <div class="btn-row">${retry ? '<button class="btn primary" id="df-retry">🔁 Retenter cette planète</button>' : ''}<button class="btn" id="df-replay">🎬 Revoir la partie</button><button class="btn ${retry ? '' : 'primary'}" id="df-menu">🏠 Accueil</button></div></div>`, { narrow: true, closable: false });
    $('#df-menu').onclick = () => { closeModal(); this.toMenu(); };
    $('#df-replay').onclick = () => { closeModal(); this.replay.open(() => this.onDefeat()); };
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
    this.sound.launch();
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
      difficulty: meta.difficulty || 'normal', pace: this.setup.settings.pace, planet: planetInfo(spec), landing: cell,
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
    if (this.multi.active) return null; // pas de sauvegarde en multijoueur
    const base = { v: 1, savedAt: Date.now(), setup: this.setup, meta: this.meta, prefs: { pct: this.pct } };
    if (this.mode === 'play' && this.game) {
      const cam = this.renderer.cam;
      return { ...base, phase: 'play', game: this.game.serialize(), stats: this.stats.data, view: { x: cam.x, y: cam.y, zoom: cam.zoom } };
    }
    if (this.mode === 'space' && this.meta) return { ...base, phase: 'space', game: { owner: [] } };
    return null;
  }
  // description d'une sauvegarde (nom, pays, aperçu de la mini-carte)
  slotMeta() {
    const g = this.game;
    if (!g || this.mode !== 'play') return { name: 'Voyage spatial', planet: this.meta ? 'Système solaire' : '' };
    const P = g.countries[g.playerId];
    let thumb = '';
    try { thumb = $('#minimap').toDataURL('image/jpeg', 0.6); } catch { /* ignore */ }
    return { name: `${P.name} — ${g.planet.name}`, country: P.name, color: P.color, planet: g.planet.name, t: g.t, cells: g.cellsOf[P.id].size, thumb };
  }
  autosave() {
    const data = this.makeSave();
    if (!data || (this.game && this.game.over)) return false;
    data.slotMeta = this.slotMeta();
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
    if (data.prefs) this.pct = data.prefs.pct || 50;
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
    this.stats.reset(data.stats);
    this.keepStats = true;
    this.beginPlay(game, false);
    if (data.view) { r.cam.x = data.view.x; r.cam.y = data.view.y; r.cam.zoom = data.view.zoom; r.cam.clamp(); }
    toast('Partie chargée.', 'ok', 1500);
  }

  toMenu() {
    if (this.multi.active) this.multi.leave();
    document.body.classList.remove('mp', 'mp-client');
    $('#lobby-card').hidden = true;
    this.mode = 'menu';
    this.game = null;
    this.advisor.hide();
    this.tutorial.hide();
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

  // ---------- multijoueur ----------
  mpOpen(code = '') {
    let name = '';
    try { name = localStorage.getItem('terra-conquest-name') || ''; } catch { /* ignore */ }
    const root = openModal(`<h2>👥 Multijoueur</h2>
      <p class="hint">Partie chronométrée, en chacun pour soi ou en 2 équipes alliées : le meilleur score (territoires + objectifs) l'emporte. L'IA joue tous les autres pays.
      La partie tourne chez l'hôte, qui doit garder le jeu ouvert. Jusqu'à 6 joueurs.</p>
      <div class="form">
        <div class="row"><label>Votre pseudo</label><input type="text" id="mp-name" maxlength="18" value="${esc(name)}" placeholder="Pseudo"></div>
      </div>
      <h3>🌐 Créer une partie</h3>
      <p class="hint">La carte et les réglages de l'accueil sont utilisés (Terre ou monde procédural, difficulté, nombre de pays).</p>
      <div class="row two"><div><label>Durée</label><select id="mp-dur"><option value="10">10 min</option><option value="15">15 min</option><option value="20" selected>20 min</option><option value="30">30 min</option><option value="45">45 min</option></select></div>
        <div><label>Mode</label><select id="mp-mode"><option value="ffa">Chacun pour soi</option><option value="teams">2 équipes</option></select></div></div>
      <button class="btn primary" id="mp-create" style="width:100%">Créer la partie</button>
      <h3>🔑 Rejoindre une partie</h3>
      <div class="inline"><input type="text" id="mp-code" maxlength="5" placeholder="CODE" value="${esc(code)}" style="text-transform:uppercase;letter-spacing:3px;font-weight:700">
        <button class="btn primary" id="mp-join">Rejoindre</button></div>`, { narrow: true });
    const getName = () => {
      const n = root.querySelector('#mp-name').value.trim().slice(0, 18) || 'Joueur';
      try { localStorage.setItem('terra-conquest-name', n); } catch { /* ignore */ }
      return n;
    };
    const net = new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'peer';
    root.querySelector('#mp-create').onclick = async () => {
      const settings = { ...this.menu.settings(), duration: +root.querySelector('#mp-dur').value * 60, teams: root.querySelector('#mp-mode').value === 'teams', net }, name = getName();
      closeModal();
      try { await this.mpCreate(settings, name); } catch (err) { console.error(err); toast('🌐 ' + esc(err.message), 'err', 5000); this.toMenu(); }
    };
    root.querySelector('#mp-join').onclick = async () => {
      const c = root.querySelector('#mp-code').value.trim().toUpperCase();
      if (c.length < 4) { toast('Entrez le code de la partie.', 'err'); return; }
      const name = getName();
      closeModal();
      $('#menu').hidden = true;
      toast('🌐 Connexion…', '', 2000);
      try { await this.multi.join(c, name, net); } catch (err) { console.error(err); toast('🌐 ' + esc(err.message), 'err', 5000); this.toMenu(); }
    };
  }

  async mpCreate(settings, name) {
    const code = await this.multi.create(settings, name);
    this.speed = settings.speed;
    await this.mpEnterLobby(settings);
    this.multi.hash = mapHash(this.map);
    this.multi.broadcastLobby();
    toast(`🌐 Partie créée : code <b>${code}</b>. Invitez vos amis !`, 'ok', 5000);
  }

  async mpEnterLobby(settings) {
    this.settings = settings;
    this.meta = null;
    const spec = this.specFor(settings, 6);
    this.setup = { spec, settings, planetKey: 'home' };
    $('#menu').hidden = true;
    this.mapBuilding = true;
    const map = await this.buildMap(spec);
    this.mapBuilding = false;
    this.enterPick(map);
    $('.pick-banner b').textContent = 'Choisissez votre pays';
    $('#pick-random').hidden = true;
    $('#pick-back').onclick = () => this.mpQuit();
    if (this.multi.isClient) {
      this.multi.sendMapHash(map);
      if (this.multi.lobby) this.multi.renderLobby(this.multi.lobby);
      if (this.multi.pendingStart) { const d = this.multi.pendingStart; this.multi.pendingStart = null; this.mpStartClient(d.snap, d.assign, d.settings); }
    }
  }

  mpMapReplaced() {
    this.enterPick(this.map);
    $('#pick-random').hidden = true;
    $('#pick-back').onclick = () => this.mpQuit();
    if (this.multi.lobby) this.multi.renderLobby(this.multi.lobby);
  }

  mpStartHost() {
    const m = this.multi, s = this.settings;
    const ps = [...m.players.values()];
    const hostK = m.players.get('host').k;
    const game = Game.create(this.map, {
      difficulty: s.difficulty, pace: s.pace, playerIndex: hostK, humans: ps.filter((p) => p.id !== 'host').map((p) => p.k),
      nAI: s.nAI ? s.nAI + ps.length : 0, planet: this.homePlanet(this.setup.spec), match: { duration: s.duration },
    });
    $('#pick').hidden = true; $('#lobby-card').hidden = true;
    this.speed = s.speed;
    this.beginPlay(game, true);
    m.startHost(game);
    game.say(`🌐 La partie commence : ${Math.round(s.duration / 60)} minutes pour bâtir le plus grand empire !`, 'info', { imp: true });
  }

  mpStartClient(snap, assign, settings) {
    if (!this.map || this.mapBuilding) { this.multi.pendingStart = { snap, assign, settings }; if (!this.map && !this.mapBuilding) this.mpEnterLobby(settings); return; }
    if (!this.renderer) this.makeRenderer(this.map);
    const game = Game.restore(this.map, { difficulty: settings.difficulty, planet: this.homePlanet(this.setup.spec) }, snap);
    game.playerId = assign;
    game.countries[assign].isPlayer = true;
    this.multi.game = game;
    $('#pick').hidden = true; $('#lobby-card').hidden = true;
    this.speed = settings.speed;
    this.beginPlay(game, true);
  }

  hostSpeed(sp) {
    if (sp !== this.speed) { this.speed = sp; this.hud.setSpeed(sp); }
  }
  mpHostLost() {
    openModal(`<div class="center"><div class="big-emoji">🔌</div><h2>L'hôte a quitté la partie</h2>
      <p>La partie est terminée.</p><div class="btn-row"><button class="btn primary" id="hl-menu">🏠 Accueil</button></div></div>`, { narrow: true, closable: false });
    $('#hl-menu').onclick = () => { closeModal(); this.toMenu(); };
  }
  mpQuit() { this.toMenu(); }

  onMatchEnd(ranking) {
    this.sound.fanfare();
    const html = this.multi.showResults(ranking, this.game.playerId);
    openModal(html + `<div class="btn-row"><button class="btn primary" id="me-replay">🎬 Revoir la partie</button><button class="btn" id="me-menu">🏠 Accueil</button></div>`, { narrow: true, closable: false });
    $('#me-replay').onclick = () => { closeModal(); this.replay.open(() => this.onMatchEnd(ranking)); };
    $('#me-menu').onclick = () => { closeModal(); this.toMenu(); };
  }

  // ---------- boucle ----------
  loop(ts) {
    const dt = Math.min(0.1, (ts - this.last) / 1000);
    this.last = ts;
    try {
      const mp = this.multi.active;
      const paused = !mp && (modalOpen() || document.hidden);
      if (this.mode === 'play' && this.game && !this.game.over && this.speed > 0 && !paused && !this.multi.isClient) this.game.advance(dt * this.speed);
      if (mp && this.multi.isHost && this.game) this.multi.hostTick(dt);
      if (this.renderer && this.mode !== 'space' && this.mode !== 'menu') this.renderer.render(dt);
      if (this.mode === 'replay') this.replay.step(dt);
      if (this.mode === 'space') this.space.render(dt);
      if (this.mode === 'play' && this.game) {
        const T = this.timers;
        T.hud += dt; T.panel += dt; T.mini += dt; T.save += dt;
        if (T.hud > 0.25) { T.hud = 0; this.hud.update(); this.tutorial.tick(); }
        if (T.panel > 0.5) { T.panel = 0; if (this.sel.cell >= 0) this.panel.render(); }
        if (T.mini > 0.3) { T.mini = 0; this.renderer.renderMinimap($('#minimap')); }
        if (!this.tutorial.active) this.advisor.tick(dt);
        this.stats.sample(this.game);
        // ambiance sonore des combats du joueur
        if (this.speed > 0 && !paused && (T.boom -= dt) < 0) {
          const g = this.game, pid = g.playerId;
          let f = 0;
          for (const o of g.offensives) if (o.a === pid || o.d === pid) f = Math.max(f, o.fight || 0.3);
          if (f > 0) this.sound.boom(f);
          T.boom = 0.35 + Math.random() * 0.5;
        }
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

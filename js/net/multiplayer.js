// Multijoueur « hôte » : la simulation tourne chez l'hôte, les autres reçoivent l'état et envoient des ordres.
// Mode chacun pour soi, partie chronométrée, l'IA joue tous les pays restants.
import { $, esc, toast, openModal, closeModal } from '../ui/dom.js';
import { makeTransport, randomCode } from './transport.js';
import { mapHash, encodeMap, applyMapData } from './mapsync.js';
import { runCommand } from '../sim/commands.js';
import { pairKey } from '../sim/game.js';
import { rgbToCss, fmtTime } from '../core/util.js';
import { art } from '../core/fr.js';
import { setupMatch, teamRanking, OBJECTIVES } from '../sim/match.js';

const MAX_PLAYERS = 6;
const EMOTES = ['👋', '😂', '😡', '🤝', '😱', '🔥', 'GG'];
export const TEAMS = [{ name: 'Bleus', icon: '🔵' }, { name: 'Rouges', icon: '🔴' }];

export class Multi {
  constructor(app) {
    this.app = app;
    this.t = null;
    this.isHost = false;
    this.players = new Map(); // id -> { id, name, k, ready }
    this.assign = new Map();  // id réseau -> id de pays
    this.pending = new Map();
    this.rid = 1;
    this.chat = []; // derniers messages { name, text, team }
    // fermeture propre de la connexion quand l'onglet se ferme : les autres le savent tout de suite
    window.addEventListener('pagehide', () => { if (this.t) this.t.close(); });
  }

  get active() { return !!this.t; }
  get isClient() { return this.active && !this.isHost; }

  // ---------- connexion ----------
  async create(settings, name) {
    this.isHost = true;
    this.settings = settings;
    this.code = randomCode();
    this.t = makeTransport(settings.net);
    await this.t.start(this.code, true);
    this.me = 'host';
    this.players.set('host', { id: 'host', name, k: -1, ready: true, team: 0 });
    this.t.on('join', () => {});
    this.t.on('message', (from, d) => this.onHostMsg(from, d));
    this.t.on('leave', (id) => this.onLeave(id));
    return this.code;
  }

  async join(code, name, net) {
    this.isHost = false;
    this.code = code.toUpperCase();
    this.name = name;
    this.t = makeTransport(net);
    this.me = await this.t.start(this.code, false);
    this.t.on('message', (from, d) => this.onClientMsg(d));
    this.t.on('leave', (id) => { if (id === 'host') this.hostLost(); });
    this.t.on('error', (m) => toast('🌐 ' + esc(m), 'err', 4000));
    this.t.send('host', { t: 'hello', name });
  }

  leave() {
    if (this.t) this.t.close();
    this.t = null;
    this.players.clear(); this.assign.clear();
    this.game = null;
    clearInterval(this.bgTimer);
  }

  link() { return `${location.origin}${location.pathname}?join=${this.code}${this.settings && this.settings.net === 'local' ? '&net=local' : ''}`; }

  // ---------- salon ----------
  lobbyState() {
    return { t: 'lobby', settings: this.settings, code: this.code, players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, k: p.k, ready: p.ready, team: p.team })) };
  }
  broadcastLobby() {
    const s = this.lobbyState();
    this.t.broadcast(s);
    this.renderLobby(s);
  }

  onHostMsg(from, d) {
    const app = this.app;
    if (d.t === 'hello') {
      // reconnexion d'un joueur pendant la partie
      if (this.game) {
        const back = [...this.assign.entries()].find(([pid, cid]) => this.names.get(cid) === d.name && !this.players.has(pid));
        if (back) {
          const cid = back[1];
          this.assign.delete(back[0]);
          this.assign.set(from, cid);
          this.players.set(from, { id: from, name: d.name, k: -1, ready: false, rejoin: true });
          this.game.countries[cid].isPlayer = true;
          this.game.say(`🔌 ${d.name} reprend le contrôle de son pays.`, 'info', { imp: true });
          // le joueur reconstruit la carte, l'hôte vérifie le hash puis envoie l'état de la partie
          this.t.send(from, { t: 'rejoin', settings: this.settings });
        } else this.t.send(from, { t: 'kick', reason: 'La partie a déjà commencé.' });
        return;
      }
      if (this.players.size >= MAX_PLAYERS) { this.t.send(from, { t: 'kick', reason: 'La partie est complète.' }); return; }
      const n0 = [...this.players.values()].filter((q) => q.team === 0).length;
      this.players.set(from, { id: from, name: String(d.name || 'Joueur').slice(0, 18), k: -1, ready: false, team: n0 > this.players.size - n0 ? 1 : 0 });
      toast(`👤 ${esc(this.players.get(from).name)} a rejoint la partie`, 'ok');
      this.broadcastLobby();
      return;
    }
    const p = this.players.get(from);
    if (!p) return;
    if (d.t === 'mapHash') {
      if (d.h !== this.hash) this.t.send(from, { t: 'mapData', data: encodeMap(app.map) });
      if (this.game) {
        if (p.rejoin) {
          p.rejoin = false; p.ready = true;
          this.t.send(from, { t: 'start', snap: this.game.serialize(), assign: this.assign.get(from), settings: this.settings });
          if (this.game.over === 'match') this.t.send(from, { t: 'end', ranking: this.game.ranking(), md: this.game.match.done });
        }
      } else if (d.h === this.hash) { p.ready = true; this.broadcastLobby(); }
    } else if (d.t === 'mapOk') { if (!this.game) { p.ready = true; this.broadcastLobby(); } }
    else if (d.t === 'team') {
      if (!this.game) { p.team = 1 - (p.team || 0); this.broadcastLobby(); }
    } else if (d.t === 'chat') this.routeChat(p, d);
    else if (d.t === 'pick') {
      if (!this.game && this.free(d.k, from)) { p.k = d.k; this.broadcastLobby(); }
    } else if (d.t === 'cmd') {
      const cid = this.assign.get(from);
      let r = { ok: false, msg: 'Commande refusée' };
      if (this.game && cid !== undefined && !this.game.over) r = runCommand(this.game, cid, d.name, d.args);
      this.t.send(from, { t: 'res', rid: d.rid, r: { ok: !!r.ok, msg: r.msg || '', n: r.n, spent: r.spent } });
    } else if (d.t === 'emote') {
      this.emote(p.name, d.e);
      this.t.broadcast({ t: 'emote', name: p.name, e: d.e });
    }
  }

  free(k, who) { return k >= 0 && ![...this.players.values()].some((p) => p.k === k && p.id !== who); }

  onLeave(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.game) {
      const cid = this.assign.get(id);
      if (cid !== undefined && this.game.countries[cid].alive) {
        this.game.countries[cid].isPlayer = false;
        this.game.say(`🔌 ${p.name} a quitté la partie : l'IA prend le relais.`, 'info', { imp: true });
      }
    } else {
      toast(`👤 ${esc(p.name)} a quitté le salon`, '');
      this.broadcastLobby();
    }
  }

  // ---------- côté joueur ----------
  async onClientMsg(d) {
    const app = this.app;
    switch (d.t) {
      case 'rejoin':
        this.settings = d.settings;
        await app.mpEnterLobby(d.settings);
        $('.pick-banner b').textContent = 'Reconnexion à la partie…';
        break;
      case 'lobby': {
        if (this.game) break;
        const first = !this.settings;
        this.settings = d.settings;
        this.lobby = d;
        if (first) await app.mpEnterLobby(d.settings);
        this.renderLobby(d);
        break;
      }
      case 'kick': toast('🚫 ' + esc(d.reason), 'err', 5000); app.mpQuit(); break;
      case 'mapData':
        applyMapData(app.map, d.data);
        app.mpMapReplaced();
        this.t.send('host', { t: 'mapOk' });
        break;
      case 'start': this.settings = d.settings; app.mpStartClient(d.snap, d.assign, d.settings); break;
      case 'tick': this.applyTick(d); break;
      case 'res': if (d.r && d.r.msg) toast(esc(d.r.msg), d.r.ok ? 'ok' : 'err', 2200); break;
      case 'emote': this.emote(d.name, d.e); break;
      case 'chat': this.showChat(d); break;
      case 'end': if (this.game) { if (d.md && this.game.match) this.game.match.done = d.md; this.game.over = 'match'; this.game.emit('matchEnd', { ranking: d.ranking }); } break;
    }
  }

  sendMapHash(map) { this.t.send('host', { t: 'mapHash', h: mapHash(map) }); }
  pick(k) {
    if (this.isHost) { if (this.free(k, 'host')) { this.players.get('host').k = k; this.broadcastLobby(); } else toast('Ce pays est déjà pris.', 'err'); }
    else this.t.send('host', { t: 'pick', k });
  }
  takenBy(k) {
    const list = this.isHost ? [...this.players.values()] : (this.lobby ? this.lobby.players : []);
    return list.find((p) => p.k === k && p.id !== this.me);
  }

  cmd(name, args) {
    this.t.send('host', { t: 'cmd', rid: this.rid++, name, args });
    return { ok: true, pending: true };
  }
  sendEmote(e) {
    if (this.isHost) { this.emote(this.players.get('host').name, e); this.t.broadcast({ t: 'emote', name: this.players.get('host').name, e }); }
    else this.t.send('host', { t: 'emote', e });
  }
  emote(name, e) { toast(`<b>${esc(name)}</b> : <span style="font-size:20px">${esc(e)}</span>`, '', 2500); this.app.sound.click(); }
  switchTeam() {
    if (this.isHost) { const p = this.players.get('host'); p.team = 1 - (p.team || 0); this.broadcastLobby(); }
    else this.t.send('host', { t: 'team' });
  }

  // ---------- discussion ----------
  sendChat(text, team) {
    text = String(text).trim().slice(0, 140);
    if (!text) return;
    if (this.isHost) this.routeChat(this.players.get('host'), { text, team });
    else this.t.send('host', { t: 'chat', text, team: !!team });
  }
  // l'hôte relaie le message (aux coéquipiers seulement si « équipe »)
  routeChat(p, d) {
    const team = !!(d.team && this.settings.teams);
    const msg = { t: 'chat', name: p.name, text: String(d.text || '').slice(0, 140), team };
    for (const q of this.players.values()) {
      if (team && q.team !== p.team) continue;
      if (q.id === 'host') this.showChat(msg); else this.t.send(q.id, msg);
    }
  }
  showChat(m) {
    this.chat.push(m);
    if (this.chat.length > 40) this.chat.shift();
    const log = document.querySelector('#chat-log');
    if (log) { log.innerHTML = this.chatHtml(); log.scrollTop = log.scrollHeight; }
    else toast(`💬 ${m.team ? '<small>[équipe]</small> ' : ''}<b>${esc(m.name)}</b> : ${esc(m.text)}`, '', 4000);
    this.app.sound.click();
  }
  chatHtml() {
    return this.chat.map((m) => `<div class="${m.team ? 'team' : ''}"><b>${esc(m.name)}</b>${m.team ? ' <small>[équipe]</small>' : ''} : ${esc(m.text)}</div>`).join('') || '<p class="hint">Aucun message pour l’instant.</p>';
  }

  hostLost() { if (!this.t) return; toast('🔌 Connexion avec l’hôte perdue.', 'err', 6000); this.app.mpHostLost(); }

  // ---------- salon (affichage) ----------
  renderLobby(s) {
    const box = $('#lobby-card');
    if (!box) return;
    box.hidden = false;
    const map = this.app.map;
    const rows = s.players.map((p) => {
      const c = p.k >= 0 && map ? map.countries0[p.k] : null;
      const tm = s.settings.teams ? TEAMS[p.team || 0] : null;
      const chip = tm ? `<button class="team-chip t${p.team || 0}" ${p.id === this.me ? 'data-switch' : 'disabled'} title="${p.id === this.me ? 'Changer d’équipe' : ''}">${tm.icon} ${tm.name}</button>` : '';
      return `<div class="lb-row">${chip}<span class="swatch" style="background:${c ? rgbToCss(c.color) : '#555'}"></span>
        <b>${esc(p.name)}</b>${p.id === 'host' ? ' <small>(hôte)</small>' : ''}${p.id === this.me ? ' <small>(vous)</small>' : ''}
        <span class="hint">${c ? esc(c.name) : 'choisit son pays…'}${p.ready ? '' : ' · chargement'}</span></div>`;
    }).join('');
    const st = s.settings;
    const teamsOk = !s.settings.teams || new Set(s.players.map((p) => p.team || 0)).size === 2;
    const can = this.isHost && s.players.length >= 2 && teamsOk && s.players.every((p) => p.k >= 0 && p.ready);
    box.innerHTML = `
      <div class="lb-head"><b>🌐 Partie en ligne</b><span class="code">${esc(s.code)}</span>
        <button class="btn small" id="lb-copy">🔗 Inviter</button></div>
      <div class="lb-list">${rows}</div>
      <p class="hint">${st.mode === 'earth' ? 'Terre réelle' : 'Monde procédural'} · ${st.teams ? '2 équipes' : 'chacun pour soi'} · ${Math.round(st.duration / 60)} min · IA ${esc(st.difficulty)} · x${st.speed} · ${s.players.length}/${MAX_PLAYERS} joueurs</p>
      ${this.isHost ? `<button class="btn primary" id="lb-start" ${can ? '' : 'disabled'}>▶️ Lancer la partie</button>
        ${can ? '' : `<p class="hint">Il faut au moins 2 joueurs, chacun avec un pays${st.teams ? ', et les deux équipes représentées' : ''}.</p>`}` : '<p class="hint">En attente du lancement par l’hôte…</p>'}`;
    $('#lb-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(this.link()); toast('🔗 Lien d’invitation copié', 'ok'); }
      catch { prompt('Lien d’invitation :', this.link()); }
    };
    const sw = box.querySelector('[data-switch]');
    if (sw) sw.onclick = () => this.switchTeam();
    const b = $('#lb-start');
    if (b) b.onclick = () => this.app.mpStartHost();
  }

  // ---------- partie (hôte) ----------
  startHost(game) {
    this.game = game;
    this.names = new Map();
    for (const p of this.players.values()) {
      const cid = game.humanIdOf(p.k);
      this.assign.set(p.id, cid);
      this.names.set(cid, p.name);
    }
    const teams = this.settings.teams ? Object.fromEntries([...this.players.values()].map((p) => [game.humanIdOf(p.k), p.team || 0])) : null;
    setupMatch(game, Object.fromEntries(this.names), teams);
    this.buf = { cap: [], news: [], ev: [] };
    this.acc = { tick: 0, cs: 1, slow: 2 };
    this.techV = new Map();
    this.nCountries = game.countries.length;
    game.on('capture', (e) => this.buf.cap.push(e.cell, e.to, e.src, Math.round((e.delay || 0) * 100)));
    game.on('news', (n) => this.buf.news.push(n));
    game.on('war', (w) => this.buf.ev.push(['war', w.a, w.b]));
    game.on('eliminated', (e) => this.buf.ev.push(['eliminated', e.id, e.by]));
    game.on('era', (e) => this.buf.ev.push(['era', e.id, e.era]));
    game.on('matchEnd', (e) => this.t.broadcast({ t: 'end', ranking: e.ranking, md: game.match.done }));
    for (const [pid, cid] of this.assign) if (pid !== 'host') this.t.send(pid, { t: 'start', snap: game.serialize(), assign: cid, settings: this.settings });
    // l'hôte continue de simuler même si son onglet passe en arrière-plan
    this.bgLast = performance.now();
    this.bgTimer = setInterval(() => {
      const now = performance.now(), dt = (now - this.bgLast) / 1000;
      this.bgLast = now;
      if (document.hidden && this.game && !this.game.over && this.app.speed > 0) { this.game.advance(dt * this.app.speed); this.hostTick(dt); }
    }, 500);
  }

  hostTick(dt) {
    if (!this.game || !this.t) return;
    this.bgLast = performance.now();
    const g = this.game, A = this.acc;
    A.tick += dt; A.cs += dt; A.slow += dt;
    if (A.tick < 0.1) return;
    A.tick = 0;
    const base = { t: 'tick', T: Math.round(g.t * 100) / 100, sp: this.app.speed, cap: this.buf.cap, ev: this.buf.ev };
    base.offs = g.offensives.map((o) => [o.id, o.a, o.d, Math.round(o.troops), Math.round(o.initial), o.cur, o.src, o.naval ? 1 : 0, Math.round(o.progress * 100) / 100, Math.round((o.fight || 0) * 100) / 100, Math.round((o.ratio || 0) * 100) / 100]);
    if (g.countries.length > this.nCountries) {
      base.newC = g.countries.slice(this.nCountries).map((c) => ({ id: c.id, name: c.name, art: c.art, title: c.title, color: c.color, capital: c.capital }));
      this.nCountries = g.countries.length;
    }
    if (A.cs >= 1) {
      A.cs = 0;
      base.cs = g.countries.map((c) => [c.alive ? 1 : 0, Math.round(c.army), Math.round(c.gold), Math.round(c.morale), Math.round(c.rp), c.era, c.capital,
        Math.round(c.st.pop * 100) / 100, c.st.ncells, Math.round(c.st.armyCap), Math.round(c.st.income * 10) / 10, Math.round(c.st.upkeep * 10) / 10,
        Math.round(c.st.rp * 10) / 10, Math.round(c.st.prod * 10) / 10, c.peakCells, c.isPlayer ? 1 : 0]);
      base.dip = [[...g.wars.values()], [...g.alliances], [...g.truces]];
      base.tech = [];
      for (const c of g.countries) {
        const v = c.techs.size * 1000 + Object.values(c.repeat).reduce((a, b) => a + b, 0);
        if (this.techV.get(c.id) !== v) { this.techV.set(c.id, v); base.tech.push([c.id, [...c.techs], c.repeat]); }
      }
      base.cool = [...g.dipCool];
      base.md = g.match.done;
    }
    if (A.slow >= 2) {
      A.slow = 0;
      base.pop = Array.from(g.pop, (v) => Math.round(v * 100) / 100);
      base.unrest = Array.from(g.unrest, (v) => Math.round(v * 100) / 100);
      base.build = Array.from(g.build);
    }
    // messages privés et propositions : par destinataire
    for (const [pid, cid] of this.assign) {
      if (pid === 'host') continue;
      const msg = { ...base, news: this.buf.news.filter((n) => n.to === undefined || n.to === cid), props: g.proposals.filter((p) => p.to === cid), auto: g.countries[cid].auto };
      this.t.send(pid, msg);
    }
    this.buf = { cap: [], news: [], ev: [] };
  }

  // ---------- partie (joueur) ----------
  applyTick(d) {
    const g = this.game;
    if (!g) return;
    g.t = d.T;
    if (d.sp !== undefined) this.app.hostSpeed(d.sp);
    if (d.newC) for (const c of d.newC) if (!g.countries[c.id]) { g._addCountry(c); g.landN.push(new Map()); g.seaN.push(new Map()); }
    for (let i = 0; i < d.cap.length; i += 4) g.applyCapture(d.cap[i], d.cap[i + 1], d.cap[i + 2], d.cap[i + 3] / 100);
    g.offensives = d.offs.map((o) => ({ id: o[0], a: o[1], d: o[2], troops: o[3], initial: o[4], cur: o[5], src: o[6], naval: !!o[7], progress: o[8], fight: o[9], ratio: o[10], len: 0, captured: 0 }));
    if (d.cs) {
      d.cs.forEach((v, id) => {
        const c = g.countries[id];
        if (!c) return;
        [c.alive, c.army, c.gold, c.morale, c.rp, c.era, c.capital] = [!!v[0], v[1], v[2], v[3], v[4], v[5], v[6]];
        const st = c.st;
        [st.pop, st.ncells, st.armyCap, st.income, st.upkeep, st.rp, st.prod] = [v[7], v[8], v[9], v[10], v[11], v[12], v[13]];
        c.peakCells = v[14]; c.isPlayer = !!v[15];
      });
      g.wars = new Map(d.dip[0].map((w) => [pairKey(w.a, w.b), w]));
      g.alliances = new Set(d.dip[1]);
      g.truces = new Map(d.dip[2]);
      g.dipCool = new Map(d.cool);
      if (d.md && g.match) g.match.done = d.md;
      for (const [id, techs, rep] of d.tech) {
        const c = g.countries[id];
        if (!c) continue;
        c.techs = new Set(techs); c.repeat = rep;
        const era = c.era;
        g._refreshTech(c, true);
        c.era = era;
      }
      g.computeBorders();
    }
    if (d.pop) { g.pop.set(d.pop); g.unrest.set(d.unrest); g.build.set(d.build); }
    if (d.auto) g.countries[g.playerId].auto = d.auto;
    const mine = g.countries[g.playerId].name;
    for (const n of d.news) {
      const item = { ...n, player: n.player || n.text.includes(mine) };
      g.news.push(item);
      g.emit('news', item);
    }
    if (g.news.length > 250) g.news.splice(0, g.news.length - 250);
    const known = new Set(g.proposals.map((p) => p.id));
    g.proposals = d.props;
    for (const p of d.props) if (!known.has(p.id)) g.emit('proposal', p);
    for (const [k, a, b] of d.ev) {
      if (k === 'war') g.emit('war', { a, b });
      else if (k === 'eliminated') { g.emit('eliminated', { id: a, by: b }); if (a === g.playerId) g.emit('defeat'); }
      else if (k === 'era') g.emit('era', { id: a, era: b });
    }
    if (g.t >= g.hist.next) g.flushHist();
  }

  // ---------- fenêtres ----------
  openEmotes() {
    const teams = this.settings && this.settings.teams;
    const root = openModal(`<h2>💬 Discussion</h2>
      <div class="emotes">${EMOTES.map((e) => `<button class="btn big" data-e="${e}">${e}</button>`).join('')}</div>
      <div id="chat-log" class="chat-log">${this.chatHtml()}</div>
      <form class="inline" id="chat-form"><input type="text" id="chat-text" maxlength="140" placeholder="Votre message…" autocomplete="off">
        <button class="btn primary">Envoyer</button></form>
      ${teams ? '<label class="check"><input type="checkbox" id="chat-team"> Équipe seulement</label>' : ''}`, { narrow: true });
    const log = root.querySelector('#chat-log');
    log.scrollTop = log.scrollHeight;
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-e]');
      if (!b) return;
      this.sendEmote(b.dataset.e);
      closeModal();
    });
    root.querySelector('#chat-form').onsubmit = (ev) => {
      ev.preventDefault();
      const inp = root.querySelector('#chat-text'), tm = root.querySelector('#chat-team');
      this.sendChat(inp.value, tm && tm.checked);
      inp.value = '';
    };
  }

  // Tableau des scores et objectifs (bouton 🎯 en multijoueur)
  openScores() {
    const g = this.game;
    if (!g || !g.match) return;
    openModal(`<h2>🎯 Partie en cours</h2><p class="hint">Score = territoires + bonus d’objectifs. Fin dans <b>${fmtTime(Math.max(0, g.match.ends - g.t))}</b>.</p>`
      + this.scoreTable(g.ranking(), g.playerId) + this.objectivesHtml(g), { narrow: true });
  }
  objectivesHtml(g) {
    const m = g.match, names = m.names || {};
    return `<h3>Objectifs</h3><div class="objs">${OBJECTIVES.map((o) => {
      const who = m.done && m.done[o.id];
      return `<div class="obj ${who !== undefined ? 'done' : ''}"><span>${o.icon} ${o.name}</span><b>+${o.pts * (m.unit || 1)}</b>
        <small>${who !== undefined ? '✔ ' + esc(names[who] || '') : o.end ? 'attribué à la fin' : 'à prendre'}</small></div>`;
    }).join('')}</div>`;
  }
  scoreTable(ranking, me) {
    const medals = ['🥇', '🥈', '🥉'];
    const g = this.game, names = (g && g.match && g.match.names) || {}, teams = g && g.match && g.match.teams;
    const humans = ranking.filter((r) => names[r.id] || r.id === me);
    const row = (r, i) => `<tr class="${r.id === me ? 'me' : ''}"><td>${medals[i] || i + 1}</td>
      <td>${teams ? TEAMS[teams[r.id] || 0].icon + ' ' : ''}<b>${esc(names[r.id] || 'Vous')}</b> <span class="swatch" style="background:${rgbToCss(r.color)}"></span>${esc(r.name)}${r.alive ? '' : ' 💀'}</td>
      <td>${r.cells}</td><td>${r.bonus ? '+' + r.bonus : ''}</td><td><b>${r.score}</b></td></tr>`;
    const tr = teamRanking(g, ranking);
    const head = tr ? `<div class="team-score">${tr.map((t) => `<span class="team-chip t${t.team}">${TEAMS[t.team].icon} ${TEAMS[t.team].name} : <b>${t.score}</b></span>`).join('')}</div>` : '';
    return head + `<div class="table-wrap"><table class="rank"><thead><tr><th>#</th><th>Joueur</th><th>Terr.</th><th>Bonus</th><th>Score</th></tr></thead><tbody>${humans.map(row).join('')}</tbody></table></div>`;
  }

  showResults(ranking, me) {
    const g = this.game, names = (g && g.match && g.match.names) || {}, teams = g && g.match && g.match.teams;
    const humans = ranking.filter((r) => names[r.id] || r.id === me);
    const myRank = humans.findIndex((r) => r.id === me) + 1;
    let won = myRank === 1, msg;
    if (teams) {
      const tr = teamRanking(g, ranking), mine = teams[me];
      won = tr[0].team === mine && tr[0].score > tr[1].score;
      msg = tr[0].score === tr[1].score ? 'Égalité parfaite entre les deux équipes !'
        : won ? `<b>Victoire des ${TEAMS[mine].name} !</b> Votre équipe l’emporte.` : `Les ${TEAMS[tr[0].team].name} l’emportent.`;
    } else msg = won ? '<b>Victoire !</b> Votre empire a le meilleur score.' : `Vous terminez <b>${myRank}<sup>e</sup></b> sur ${humans.length} joueurs.`;
    const top = ranking.filter((r) => !names[r.id]).slice(0, 3).map((r) => `${esc(r.name)} (${r.cells})`).join(', ');
    return `<div class="center"><div class="big-emoji">${won ? '🏆' : '⏱️'}</div><h2>Fin de la partie</h2><p>${msg}</p></div>
      ${this.scoreTable(ranking, me)}
      ${g && g.match ? this.objectivesHtml(g) : ''}
      <p class="hint center">Plus grandes puissances IA : ${top}</p>`;
  }
}

export { EMOTES, fmtTime };

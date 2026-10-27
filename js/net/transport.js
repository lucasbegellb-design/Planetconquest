// Transports réseau à interface commune :
//  - PeerTransport : WebRTC via PeerJS (mise en relation par le serveur public gratuit de PeerJS)
//  - LocalTransport : BroadcastChannel entre onglets du même navigateur (tests, partie locale)
// Événements : 'message' (from, data), 'join' (id), 'leave' (id), 'error' (texte)

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';
const PREFIX = 'terraconquest-';
const CHUNK = 16000; // taille de morceau sûre pour tous les navigateurs (canal WebRTC)

// Messages en JSON texte (sérialisation « raw » de PeerJS) ; les gros messages sont découpés : « ~id:i:n:morceau »
function frames(d, ref) {
  const s = JSON.stringify(d);
  if (s.length <= CHUNK) return [s];
  const id = ++ref.n, n = Math.ceil(s.length / CHUNK), out = [];
  for (let i = 0; i < n; i++) out.push(`~${id}:${i}:${n}:` + s.slice(i * CHUNK, (i + 1) * CHUNK));
  return out;
}

class Emitter {
  constructor() { this.ls = {}; }
  on(t, fn) { (this.ls[t] ||= []).push(fn); }
  emit(t, ...a) { for (const fn of this.ls[t] || []) fn(...a); }
}

export function randomCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += ch[Math.floor(Math.random() * ch.length)];
  return s;
}

export class LocalTransport extends Emitter {
  async start(code, asHost) {
    this.host = asHost;
    this.id = asHost ? 'host' : 'p' + Math.random().toString(36).slice(2, 8);
    this.ch = new BroadcastChannel('tc-net-' + code);
    this.peers = new Map(); // id -> dernier signe de vie
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (m.to !== '*' && m.to !== this.id) return;
      if (m.from === this.id) return;
      if (m.k === 'hello') {
        if (!this.host) return;
        const known = this.peers.has(m.from);
        this.peers.set(m.from, Date.now());
        if (!known) this.emit('join', m.from);
        return;
      }
      if (m.k === 'ping') { this.peers.set(m.from, Date.now()); return; }
      if (m.k === 'bye') { if (this.peers.delete(m.from)) this.emit('leave', m.from); return; }
      this.peers.set(m.from, Date.now());
      this.emit('message', m.from, m.d);
    };
    this.beat = setInterval(() => {
      this.ch.postMessage({ k: 'ping', from: this.id, to: '*' });
      const now = Date.now();
      for (const [id, t] of this.peers) if (now - t > 7000) { this.peers.delete(id); this.emit('leave', id); }
    }, 2000);
    if (!asHost) {
      this.peers.set('host', Date.now());
      this.ch.postMessage({ k: 'hello', from: this.id, to: 'host' });
    }
    return this.id;
  }
  send(to, d) { this.ch.postMessage({ k: 'm', from: this.id, to, d }); }
  broadcast(d) { this.ch.postMessage({ k: 'm', from: this.id, to: '*', d }); }
  close() {
    if (!this.ch) return;
    try { this.ch.postMessage({ k: 'bye', from: this.id, to: '*' }); } catch { /* ignore */ }
    clearInterval(this.beat);
    this.ch.close();
    this.ch = null;
  }
}

export class PeerTransport extends Emitter {
  async start(code, asHost) {
    const { Peer } = await import(PEERJS_URL);
    this.host = asHost;
    this.conns = new Map();
    this.seen = new Map(); // id -> dernier signe de vie (WebRTC détecte mal les fermetures brutales)
    this.parts = new Map(); // id -> message découpé en cours de réception
    this.ref = { n: 0 };
    const peer = asHost ? new Peer(PREFIX + code) : new Peer();
    this.peer = peer;
    await new Promise((res, rej) => {
      peer.on('open', res);
      peer.on('error', (e) => rej(new Error(e.type === 'unavailable-id' ? 'Ce code de partie est déjà utilisé' : e.type === 'peer-unavailable' ? 'Partie introuvable' : 'Connexion impossible (' + e.type + ')')));
    });
    peer.on('error', (e) => this.emit('error', e.type === 'peer-unavailable' ? 'Partie introuvable' : 'Erreur réseau (' + e.type + ')'));
    if (asHost) {
      this.id = 'host';
      peer.on('connection', (conn) => this._bind(conn, conn.peer));
    } else {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
      await new Promise((res, rej) => {
        conn.on('open', res);
        conn.on('error', () => rej(new Error('Partie introuvable')));
        setTimeout(() => rej(new Error('Délai de connexion dépassé')), 15000);
      });
      this.id = peer.id;
      this._bind(conn, 'host');
    }
    this.beat = setInterval(() => {
      const now = Date.now();
      for (const [id, c] of this.conns) {
        if (now - (this.seen.get(id) || now) > 12000) { this._drop(id); try { c.close(); } catch { /* ignore */ } continue; }
        if (c.open) c.send('p');
      }
    }, 2000);
    return this.id;
  }
  _bind(conn, id) {
    const ready = () => { this.conns.set(id, conn); this.seen.set(id, Date.now()); if (this.host) this.emit('join', id); };
    if (conn.open) ready(); else conn.on('open', ready);
    conn.on('data', (raw) => {
      if (this.conns.get(id) !== conn || typeof raw !== 'string') return;
      this.seen.set(id, Date.now());
      if (raw === 'p') return;
      let s = raw;
      if (raw[0] === '~') {
        const m = /^~(\d+):(\d+):(\d+):/.exec(raw);
        if (!m) return;
        let st = this.parts.get(id);
        if (!st || st.id !== m[1]) this.parts.set(id, (st = { id: m[1], got: [] }));
        st.got[+m[2]] = raw.slice(m[0].length);
        if (+m[2] < +m[3] - 1) return;
        this.parts.delete(id);
        s = st.got.join('');
      }
      let d;
      try { d = JSON.parse(s); } catch { return; }
      this.emit('message', id, d);
    });
    conn.on('close', () => { if (this.conns.get(id) === conn) this._drop(id); });
  }
  _drop(id) { this.seen.delete(id); this.parts.delete(id); if (this.conns.delete(id)) this.emit('leave', id); }
  send(to, d) { const c = this.conns.get(to); if (c && c.open) for (const f of frames(d, this.ref)) c.send(f); }
  broadcast(d) {
    if (!this.conns.size) return;
    const fs = frames(d, this.ref);
    for (const c of this.conns.values()) if (c.open) for (const f of fs) c.send(f);
  }
  close() { clearInterval(this.beat); if (this.peer) { this.peer.destroy(); this.peer = null; } }
}

export function makeTransport(kind) {
  return kind === 'local' ? new LocalTransport() : new PeerTransport();
}

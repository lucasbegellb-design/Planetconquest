// Effets sonores synthétisés (Web Audio, aucun fichier) + vibrations sur mobile.
const PREF = 'terra-conquest-fx';

export class Sound {
  constructor() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { p = {}; }
    this.on = p.sound !== false;
    this.haptics = p.haptics !== false;
    this.ctx = null;
    this.last = {};
  }
  save() { try { localStorage.setItem(PREF, JSON.stringify({ sound: this.on, haptics: this.haptics })); } catch { /* ignore */ } }
  setSound(v) { this.on = v; this.save(); if (v) this.unlock(); }
  setHaptics(v) { this.haptics = v; this.save(); if (v) this.buzz(20); }

  // Le navigateur exige un geste de l'utilisateur pour démarrer l'audio
  unlock() {
    if (!this.on) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, len);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  ok(key, minGap) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (key && this.last[key] && now - this.last[key] < minGap) return false;
    if (key) this.last[key] = now;
    return true;
  }
  tone(freq, dur, type = 'sine', vol = 0.15, slide = 0, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, freq, sweep = 0) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq + sweep, t + dur);
    const gn = c.createGain();
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(gn).connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur);
  }

  capture() { if (this.ok('cap', 0.06)) { const f = 480 + Math.random() * 120; this.tone(f, 0.12, 'triangle', 0.12); this.tone(f * 1.5, 0.1, 'sine', 0.05, 0, 0.03); } }
  lost() { if (this.ok('lost', 0.15)) this.tone(240, 0.28, 'sawtooth', 0.06, -90); this.buzz(18); }
  boom(power = 1) { if (this.ok('boom', 0.09)) this.noise(0.25 + 0.2 * power, 0.08 + 0.1 * power, 300 + Math.random() * 300); }
  horn() { if (this.ok('horn', 1)) { this.tone(196, 0.7, 'sawtooth', 0.09); this.tone(147, 0.7, 'sawtooth', 0.07); } this.buzz([60, 40, 60]); }
  fanfare() { if (this.ok('fan', 0.8)) [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.1, 0, i * 0.09)); this.buzz([30, 30, 60]); }
  chord() { if (this.ok('chord', 1)) [392, 494, 587, 784].forEach((f) => this.tone(f, 1.1, 'sine', 0.06)); }
  click() { if (this.ok('click', 0.03)) this.tone(1100, 0.03, 'square', 0.025); }
  launch() { if (this.ok('launch', 2)) { this.noise(3, 0.3, 150, 1800); this.tone(80, 2.5, 'sawtooth', 0.05, 160); } this.buzz([80, 50, 120, 50, 200]); }

  buzz(p) {
    if (!this.haptics || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try { navigator.vibrate(p); } catch { /* ignore */ }
  }
}

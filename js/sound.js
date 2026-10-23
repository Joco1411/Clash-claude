'use strict';
// Tiny synthesized sound effects via WebAudio (no asset files).

const Sound = {
  ctx: null,
  last: {},
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC(); } catch (e) { return null; }
    return this.ctx;
  },
  tone(freq, dur, type, vol, slide) {
    const ac = this.ctx;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  },
  noise(dur, vol) {
    const ac = this.ctx;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf; g.gain.value = vol || 0.15;
    src.connect(g); g.connect(ac.destination); src.start();
  },
  play(name) {
    if (typeof S === 'undefined' || !S || !S.sound) return;
    if (!this.ensure() || this.ctx.state !== 'running') return;
    const t = performance.now();
    if (this.last[name] && t - this.last[name] < 60) return; // throttle spam
    this.last[name] = t;
    switch (name) {
      case 'click': this.tone(700, 0.05, 'square', 0.04); break;
      case 'build': this.tone(220, 0.08, 'square', 0.06); setTimeout(() => this.tone(330, 0.08, 'square', 0.06), 90); break;
      case 'done': this.tone(523, 0.1, 'triangle', 0.1); setTimeout(() => this.tone(784, 0.18, 'triangle', 0.1), 110); break;
      case 'collect': this.tone(988, 0.06, 'triangle', 0.08); setTimeout(() => this.tone(1319, 0.1, 'triangle', 0.08), 60); break;
      case 'deploy': this.tone(400, 0.05, 'sine', 0.06, 1.6); break;
      case 'cannon': this.noise(0.15, 0.12); this.tone(90, 0.15, 'sine', 0.15, 0.5); break;
      case 'arrow': this.tone(1200, 0.05, 'sawtooth', 0.02, 0.5); break;
      case 'mortar': this.tone(140, 0.2, 'sine', 0.12, 0.6); break;
      case 'boom': this.noise(0.35, 0.2); this.tone(60, 0.3, 'sine', 0.2, 0.4); break;
      case 'hit': this.noise(0.08, 0.08); break;
      case 'die': this.tone(300, 0.15, 'square', 0.04, 0.3); break;
      case 'star': this.tone(880, 0.12, 'triangle', 0.12); setTimeout(() => this.tone(1175, 0.12, 'triangle', 0.12), 120); setTimeout(() => this.tone(1568, 0.25, 'triangle', 0.12), 240); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.12), i * 130)); break;
      case 'lose': [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.1), i * 180)); break;
    }
  },
  unlock() {
    const ac = this.ensure();
    if (ac && ac.state === 'suspended') ac.resume();
  },
};

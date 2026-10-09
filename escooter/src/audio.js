export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.7;
  }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);

    // motor: two detuned oscillators through lowpass
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'triangle';
    this.mf = c.createBiquadFilter(); this.mf.type = 'lowpass'; this.mf.frequency.value = 600; this.mf.Q.value = 3;
    this.mg = c.createGain(); this.mg.gain.value = 0;
    this.o1.connect(this.mf); this.o2.connect(this.mf); this.mf.connect(this.mg); this.mg.connect(this.master);
    this.o1.start(); this.o2.start();

    // noise bed
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const mkNoise = (type, freq, q) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { f, g };
    };
    this.tire = mkNoise('bandpass', 500, 0.7);
    this.wind = mkNoise('highpass', 1200, 0.4);
    this.squeal = mkNoise('bandpass', 2600, 12);
    this.rainN = mkNoise('highpass', 3500, 0.4);
    this.city = mkNoise('lowpass', 220, 0.5);
    this.city.g.gain.value = 0.05;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  setVolume(v) {
    this.volume = v;
    if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  update(s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = Math.min(Math.abs(s.v), 150);
    const load = Math.min(1, Math.max(0, s.thr));
    if (!!s.moped !== !!this.mopedOn) { this.mopedOn = !!s.moped; this.o1.type = s.moped ? 'square' : 'sawtooth'; this.o2.type = s.moped ? 'sawtooth' : 'triangle'; }
    if (s.moped) { // two-stroke: low rattling idle that rises with speed, with a ring-ding wobble
      const wob = 1 + Math.sin(t * (14 + sp * 0.9)) * 0.045;
      const f = (46 + sp * 5.2 + load * 24) * wob;
      this.o1.frequency.setTargetAtTime(f, t, 0.03);
      this.o2.frequency.setTargetAtTime(f * 2.02, t, 0.03);
      this.mf.frequency.setTargetAtTime(420 + sp * 55 + load * 650, t, 0.06);
      this.mg.gain.setTargetAtTime(s.paused ? 0 : 0.045 + Math.min(sp / 14, 1) * 0.04 + load * 0.04, t, 0.05);
    } else {
    const f = 90 + sp * 24 + load * 40;
    this.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.o2.frequency.setTargetAtTime(f * 2.01, t, 0.05);
    this.mf.frequency.setTargetAtTime(380 + sp * 70 + load * 500, t, 0.08);
    this.mg.gain.setTargetAtTime(s.paused ? 0 : (0.018 + Math.min(sp / 14, 1) * 0.05 + load * 0.035) * (s.battEmpty ? 0.4 : 1), t, 0.06);
    }
    this.rainN.g.gain.setTargetAtTime(s.paused ? 0 : (s.rain || 0) * 0.07, t, 0.3);
    this.tire.g.gain.setTargetAtTime(s.paused ? 0 : Math.min(sp / 15, 1) * 0.16, t, 0.1);
    this.tire.f.frequency.setTargetAtTime(300 + sp * 45, t, 0.1);
    this.wind.g.gain.setTargetAtTime(s.paused ? 0 : Math.pow(Math.min(sp / 17, 1), 2) * 0.09, t, 0.1);
    this.squeal.g.gain.setTargetAtTime(s.paused ? 0 : (s.braking && sp > 4 ? Math.min((sp - 4) / 8, 1) * 0.045 * Math.min(1, (s.brakeAmt || 0)) : 0), t, 0.05);
  }
  /** ambulance two-tone horn */
  sirenEms(level) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.emsO) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 660;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1700;
      const g = c.createGain(); g.gain.value = 0; o.connect(f); f.connect(g); g.connect(this.master); o.start();
      this.emsO = o; this.emsG = g;
    }
    const t = c.currentTime;
    this.emsO.frequency.setTargetAtTime(Math.floor(t * 2.2) % 2 ? 1000 : 740, t, 0.01);
    this.emsG.gain.setTargetAtTime(Math.max(0, level) * 0.06, t, 0.1);
  }
  _reverb() {
    if (this._rv) return this._rv;
    const c = this.ctx, len = Math.floor(c.sampleRate * 0.9), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const cv = c.createConvolver(); cv.buffer = buf; const g = c.createGain(); g.gain.value = 0.5; cv.connect(g); g.connect(this.master);
    return (this._rv = cv);
  }
  step(run) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 500;
    const g = c.createGain(); g.gain.setValueAtTime(run ? 0.16 : 0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random() * 1.5); n.stop(t + 0.1);
  }
  click(kind = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(kind === 1 ? 1400 : kind === 2 ? 2600 : 900, t); o.frequency.exponentialRampToValueAtTime(kind === 2 ? 1800 : 300, t + 0.05);
    const g = c.createGain(); g.gain.setValueAtTime(kind === 2 ? 0.05 : 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 2 ? 0.06 : 0.07));
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.08);
  }
  shot(vol = 1, smg = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (smg) { // short, dry full-auto crack (cheap enough for 13 shots / s)
      const n = c.createBufferSource(); n.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.08); f.Q.value = 0.7;
      const g = c.createGain(); g.gain.setValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random() * 1.2); n.stop(t + 0.12);
      const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.06);
      const og = c.createGain(); og.gain.setValueAtTime(0.16 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.08);
      return;
    }
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    const g = c.createGain(); g.gain.setValueAtTime(0.7 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(f); f.connect(g); g.connect(this.master); g.connect(this._reverb()); n.start(t); n.stop(t + 0.32);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const og = c.createGain(); og.gain.setValueAtTime(0.6 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.28);
  }
  door() { // soft hiss + motor of an automatic glass door
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900, t + 0.4); f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.55);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(190, t + 0.4);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.025, t + 0.1); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.55);
  }
  scan() { // checkout beep
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1760;
    const g = c.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  whoosh() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.14);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t); n.stop(t + 0.2);
  }
  thud(power) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.min(0.9, 0.15 + power * 0.08), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1400;
    const ng = c.createGain(); ng.gain.setValueAtTime(Math.min(0.6, power * 0.07), t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(this.master);
    n.connect(nf); nf.connect(ng); ng.connect(this.master);
    o.start(t); o.stop(t + 0.4); n.start(t); n.stop(t + 0.3);
  }
  chime(notes = [660, 880, 1320]) {
    if (!this.ctx) return;
    const c = this.ctx;
    notes.forEach((fr, i) => {
      const t = c.currentTime + i * 0.09;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
    });
  }
  beep() { this.chime([520, 520]); }
  /** police siren (two-tone wail), level 0..1 = loudness by distance */
  siren(level) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.sirenO) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 700;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(this.master); o.start();
      this.sirenO = o; this.sirenG = g;
    }
    const t = c.currentTime;
    this.sirenO.frequency.setTargetAtTime(Math.floor(t * 1.6) % 2 ? 960 : 720, t, 0.04);
    this.sirenG.gain.setTargetAtTime(Math.max(0, level) * 0.07, t, 0.15);
  }
  /** horn (hold B): car = two-tone, moped = nasal beep, e-scooter = electric buzzer */
  hornStart(kind) {
    if (!this.ctx || this.hornO) return;
    const c = this.ctx, t = c.currentTime;
    const freqs = kind === 'car' ? [392, 494] : kind === 'moped' ? [500, 528] : [760, 1140];
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'car' ? 1700 : 2600;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(kind === 'car' ? 0.16 : 0.1, t + 0.03);
    const os = freqs.map((fr) => { const o = c.createOscillator(); o.type = kind === 'scooter' ? 'square' : 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(t); return o; });
    f.connect(g); g.connect(this.master);
    this.hornO = { os, g };
  }
  hornStop() {
    if (!this.hornO) return;
    const { os, g } = this.hornO, t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.03);
    for (const o of os) o.stop(t + 0.18);
    this.hornO = null;
  }
  honk(kind, dur = 0.3) { this.hornStart(kind); setTimeout(() => this.hornStop(), dur * 1000); }
  vape() { // coil crackle while drawing
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(2200, t + 1.0); f.Q.value = 2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.2); g.gain.linearRampToValueAtTime(0.05, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 1.2);
  }
  bell() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const fr of [2200, 3300]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.75);
    }
  }
}

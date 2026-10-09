// Synthetisierter Sound (WebAudio). Schallgeschwindigkeit wird simuliert:
// Der Knall kommt erst nach dist / 343 s an, Höhen werden mit der Entfernung gedämpft.
const SPEED_OF_SOUND = 343;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // Rauschen
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Hall (Häuserschluchten / See): Impulsantwort aus abklingendem Rauschen
    const rl = Math.floor(ctx.sampleRate * 2.6);
    const imp = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const a = imp.getChannelData(ch);
      for (let i = 0; i < rl; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.8);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = imp;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);

    this.startAmbient();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // Grillen + leises Rauschen der Menge
  startAmbient() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(bp).connect(g).connect(this.master);
    src.start();

    const osc = ctx.createOscillator();
    osc.frequency.value = 4300;
    const og = ctx.createGain();
    og.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 22;
    const lg = ctx.createGain();
    lg.gain.value = 0.0035;
    const lfo2 = ctx.createOscillator();
    lfo2.type = 'square';
    lfo2.frequency.value = 2.6;
    const lg2 = ctx.createGain();
    lg2.gain.value = 0.0035;
    lfo.connect(lg).connect(og.gain);
    lfo2.connect(lg2).connect(og.gain);
    osc.connect(og).connect(this.master);
    osc.start();
    lfo.start();
    lfo2.start();
  }

  _out(pan, wetAmt) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let node = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p);
      node = p;
    }
    node.connect(this.master);
    if (wetAmt > 0) {
      const w = ctx.createGain();
      w.gain.value = wetAmt;
      node.connect(w);
      w.connect(this.reverb);
    }
    return g;
  }

  _noise(when, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(when, Math.random() * 1.5);
    s.stop(when + dur);
    return s;
  }

  _at(dist) {
    return this.ctx.currentTime + dist / SPEED_OF_SOUND + 0.005;
  }

  // Große Aufbruch-Detonation. size: 0.15 (Rakete) … 1.4 (Großfeuerwerk)
  bang(dist, size, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this._at(dist);
    const air = 1 / (1 + dist / 110);
    const vol = Math.min(1.1, (0.25 + size) * (0.35 + 0.65 * air)) * 0.9;
    const out = this._out(pan, 0.55);

    const n = this._noise(t, 2.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 + 6500 * air * (0.4 + size * 0.4), t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.5 + size * 0.6);
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, t);
    eg.gain.linearRampToValueAtTime(vol, t + 0.004);
    eg.gain.exponentialRampToValueAtTime(vol * 0.12, t + 0.1 + size * 0.1);
    eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 + size * 1.4);
    n.connect(lp).connect(eg).connect(out);

    // Druckwelle (Bass)
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(vol * 0.85, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.45 + size * 0.7);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 1.6);

    // Grollen der Echos
    if (size > 0.45) {
      const r = this._noise(t + 0.08, 3);
      const rl = ctx.createBiquadFilter();
      rl.type = 'lowpass';
      rl.frequency.value = 180;
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.0001, t + 0.08);
      rg.gain.linearRampToValueAtTime(vol * 0.4, t + 0.25);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      r.connect(rl).connect(rg).connect(out);
    }
  }

  // Abschuss aus dem Mörser: dumpfes "Fump" + Zischen
  launch(dist, size = 0.5, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this._at(dist);
    const air = 1 / (1 + dist / 80);
    const vol = (0.12 + size * 0.28) * (0.3 + 0.7 * air);
    const out = this._out(pan, 0.2);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(vol, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.4);
    const n = this._noise(t, 0.6);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.8, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(bp).connect(ng).connect(out);
  }

  // Pfeifen einer Rakete
  whistle(dist, dur, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this._at(dist);
    const air = 1 / (1 + dist / 70);
    const vol = 0.07 * (0.3 + 0.7 * air);
    const out = this._out(pan, 0.15);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.linearRampToValueAtTime(3100, t + dur);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(1510, t);
    o2.frequency.linearRampToValueAtTime(3120, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.1);
    g.gain.setValueAtTime(vol, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(g);
    o2.connect(g);
    g.connect(out);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }

  // Knistern (Brokat-Crackle)
  crackle(dist, count = 10, spread = 0.5, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const base = this._at(dist);
    const air = 1 / (1 + dist / 90);
    const out = this._out(pan, 0.3);
    for (let i = 0; i < count; i++) {
      const t = base + Math.random() * spread;
      const n = this._noise(t, 0.04);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1500 + Math.random() * 2500;
      const g = ctx.createGain();
      const v = (0.05 + Math.random() * 0.12) * (0.3 + 0.7 * air);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      n.connect(hp).connect(g).connect(out);
    }
  }

  // Böller / Knallkörper: kurzer, harter Knall
  banger(dist, pan = 0, loud = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this._at(dist);
    const air = 1 / (1 + dist / 60);
    const vol = (0.5 + 0.4 * loud) * (0.25 + 0.75 * air);
    const out = this._out(pan, 0.5);
    const n = this._noise(t, 0.5);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800 + 9000 * air;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.15, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    n.connect(hp).connect(lp).connect(g).connect(out);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }

  // Kleiner Knall einer Kugel/Batterie
  pop(dist, pan = 0) {
    this.bang(dist, 0.12, pan);
  }

  // Dauerzischen (Fontäne, Vulkan, Wunderkerze). Rückgabe: Handle mit setDist/stop
  hiss(dist, dur, level = 1, pan = 0) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const t = ctx.currentTime + dist / SPEED_OF_SOUND;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const g = this._out(pan, 0.1);
    const att = (d) => 0.16 * level * (1 / (1 + d / 12));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(att(dist), t + 0.15);
    g.gain.setValueAtTime(att(dist), t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(hp).connect(g);
    src.start(t);
    src.stop(t + dur + 0.1);
    return {
      setDist: (d) => {
        if (ctx.currentTime < t + dur - 0.5) g.gain.setTargetAtTime(att(d), ctx.currentTime, 0.1);
      },
    };
  }

  // Applaus / "Ooooh" der Menge nach großen Bouquets
  cheer(level = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.4;
    const n = this._noise(t, 4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.08 * level, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    n.connect(bp).connect(g).connect(this.master);
  }
}

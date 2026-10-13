'use strict';
// Alle Geräusche und die Musik werden live mit der Web-Audio-API erzeugt – keine Audiodateien nötig.

const Sound = (() => {
  let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let muted = store.get('sk_muted', false);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.2; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (song && !timer) startTimer();
  }

  function tone(type, f0, f1, dur, vol = 0.3, delay = 0, bus = sfxBus, at = null) {
    if (!ctx) return;
    const t = (at == null ? ctx.currentTime : at) + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(dur, vol = 0.3, freq = 1200, delay = 0, type = 'lowpass', bus = sfxBus, at = null) {
    if (!ctx) return;
    const t = (at == null ? ctx.currentTime : at) + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  const notes = (list, step, type = 'square', vol = 0.14) =>
    list.forEach((f, i) => { if (f > 20) tone(type, f, f, step * 1.6, vol, i * step); });

  const SFX = {
    jump() { tone('square', 300, 640, 0.15, 0.13); },
    djump() { tone('square', 520, 1040, 0.13, 0.11); tone('triangle', 780, 1560, 0.12, 0.1, 0.04); },
    coin() { tone('square', 988, 988, 0.06, 0.1); tone('square', 1319, 1319, 0.24, 0.1, 0.06); },
    stomp() { tone('square', 420, 110, 0.13, 0.18); noise(0.08, 0.18, 900); },
    bump() { tone('triangle', 170, 90, 0.1, 0.28); },
    brick() { noise(0.28, 0.3, 2400); tone('square', 220, 60, 0.15, 0.12); },
    item() { notes([392, 523, 659, 784, 1047], 0.05, 'triangle', 0.16); },
    power() { notes([523, 659, 784, 1047, 784, 1047, 1319], 0.055, 'square', 0.1); },
    hurt() { tone('sawtooth', 640, 140, 0.4, 0.14); },
    die() { notes([784, 740, 698, 0.01], 0.12, 'square', 0.12); tone('square', 600, 120, 0.9, 0.12, 0.45); },
    fire() { tone('square', 900, 260, 0.1, 0.09); noise(0.06, 0.08, 3200); },
    kick() { tone('square', 260, 520, 0.08, 0.16); noise(0.05, 0.16, 1500); },
    spring() { tone('triangle', 180, 960, 0.32, 0.22); },
    roll() { noise(0.22, 0.14, 700, 0, 'bandpass'); tone('triangle', 200, 120, 0.18, 0.1); },
    oneup() { notes([659, 784, 1319, 1047, 1175, 1568], 0.08, 'square', 0.12); },
    gem() { notes([1047, 1319, 1568, 2093, 1568, 2093], 0.06, 'triangle', 0.16); },
    checkpoint() { notes([523, 784, 1047], 0.08, 'triangle', 0.18); },
    cannon() { noise(0.3, 0.35, 380); tone('sine', 130, 40, 0.3, 0.35); },
    thud() { noise(0.35, 0.4, 260); tone('sine', 90, 30, 0.35, 0.4); },
    bossHit() { tone('sawtooth', 300, 80, 0.35, 0.2); noise(0.2, 0.25, 600); },
    bossDie() { for (let i = 0; i < 6; i++) { noise(0.4, 0.3, 500 + i * 200, i * 0.15); tone('square', 400 - i * 50, 60, 0.3, 0.12, i * 0.15); } },
    flag() { tone('square', 1200, 300, 0.9, 0.1); },
    clear() { notes([523, 659, 784, 1047, 0.01, 784, 1047, 1319, 1568], 0.11, 'square', 0.12); notes([262, 330, 392, 523, 0.01, 392, 523, 659, 784], 0.11, 'triangle', 0.15); },
    pause() { tone('square', 660, 660, 0.06, 0.1); tone('square', 880, 880, 0.08, 0.1, 0.07); },
    select() { tone('square', 740, 740, 0.05, 0.08); },
    shell() { tone('square', 200, 140, 0.06, 0.12); },
  };

  function play(name) {
    if (!ctx || muted) return;
    const f = SFX[name];
    if (f) f();
  }

  // ---- Musik: kleiner Sequenzer (Achtelnoten, Token pro Schritt; "." Pause, "-" Note halten) ----
  const NOTE_BASE = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  function freq(n) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    if (!m) return 0;
    let semi = NOTE_BASE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) - 4) * 12;
    return 440 * Math.pow(2, semi / 12);
  }
  const parse = (s) => s.trim().split(/\s+/);

  const SONGS = {
    meadow: {
      bpm: 150, lead: 'square', bass: 'triangle',
      melody: 'E5 . G5 . C6 . G5 . A5 . F5 . A5 - - . G5 . E5 . C5 . E5 . D5 . B4 . G4 - - . ' +
              'E5 . G5 . C6 . E6 . D6 . C6 . A5 - - . G5 . F5 . E5 . D5 . C5 - - . . . . .',
      bassline: 'C3 . G3 . C3 . G3 . F3 . C4 . F3 . C4 . C3 . G3 . C3 . G3 . G2 . D3 . G2 . D3 . ' +
                'C3 . G3 . C3 . G3 . F3 . C4 . F3 . C4 . G2 . D3 . G2 . D3 . C3 . G2 . C3 . . .',
      drums: 'k.h.s.h.',
    },
    forest: {
      bpm: 118, lead: 'triangle', bass: 'triangle',
      melody: 'A4 . C5 . E5 . D5 . C5 . B4 . A4 - - . G4 . B4 . D5 . C5 . B4 . G4 . E4 - - . ' +
              'A4 . C5 . E5 . A5 . G5 . F5 . E5 - - . D5 . E5 . C5 . B4 . A4 - - . . . . .',
      bassline: 'A2 . E3 . A2 . E3 . F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 . E2 . B2 . E2 . B2 . ' +
                'A2 . E3 . A2 . E3 . F2 . C3 . F2 . C3 . G2 . D3 . E2 . B2 . A2 . E3 . A2 . . .',
      drums: 'k...s...',
    },
    desert: {
      bpm: 128, lead: 'square', bass: 'triangle',
      melody: 'D5 . Eb5 . F#5 . G5 . A5 . G5 . F#5 - Eb5 . D5 . . D5 Eb5 . D5 . C5 . Bb4 . A4 - - . ' +
              'A4 . Bb4 . C5 . D5 . Eb5 . D5 . C5 - Bb4 . A4 . Bb4 . A4 . G4 . A4 - - - . . . .',
      bassline: 'D3 . A2 . D3 . A2 . D3 . A2 . D3 . A2 . D3 . A2 . D3 . A2 . C3 . G2 . C3 . G2 . ' +
                'D3 . A2 . D3 . A2 . Eb3 . Bb2 . Eb3 . Bb2 . D3 . A2 . G2 . D3 . A2 . E3 . A2 . . .',
      drums: 'k..hs.h.',
    },
    ice: {
      bpm: 112, lead: 'triangle', bass: 'triangle',
      melody: 'E5 B5 G#5 B5 E5 B5 G#5 B5 C#5 A5 E5 A5 C#5 A5 E5 A5 B4 F#5 D#5 F#5 B4 F#5 D#5 F#5 E5 B5 G#5 E6 - - . . ' +
              'A4 E5 C#5 E5 A4 E5 C#5 E5 G#4 E5 B4 E5 G#4 E5 B4 E5 F#4 C#5 A4 C#5 B4 F#5 D#5 F#5 E5 G#5 B5 E6 - - . .',
      bassline: 'E2 - - - E3 - - - A2 - - - A3 - - - B2 - - - B3 - - - E2 - - - E3 - - - ' +
                'A2 - - - A3 - - - E2 - - - E3 - - - F#2 - - - B2 - - - E2 - - - E3 - - -',
      drums: 'k.......',
    },
    castle: {
      bpm: 160, lead: 'square', bass: 'sawtooth',
      melody: 'C5 . C5 Eb5 . C5 G5 . F5 . Eb5 . D5 . Bb4 . C5 . C5 Eb5 . G5 Ab5 . G5 . F5 . Eb5 . D5 . ' +
              'Eb5 . Eb5 G5 . Eb5 Bb5 . Ab5 . G5 . F5 . D5 . C5 . D5 . Eb5 . F5 . G5 - - - G4 . . .',
      bassline: 'C2 C3 C2 C3 C2 C3 C2 C3 Ab1 Ab2 Ab1 Ab2 Bb1 Bb2 Bb1 Bb2 C2 C3 C2 C3 C2 C3 C2 C3 G1 G2 G1 G2 G1 G2 G1 G2 ' +
                'Eb2 Eb3 Eb2 Eb3 Eb2 Eb3 Eb2 Eb3 Ab1 Ab2 Ab1 Ab2 F1 F2 F1 F2 C2 C3 C2 C3 Ab1 Ab2 Bb1 Bb2 G1 G2 G1 G2 G1 G2 G1 G2',
      drums: 'k.hsk.hs',
    },
    sky: {
      bpm: 132, lead: 'square', bass: 'triangle',
      melody: 'F5 . A5 . C6 . A5 . Bb5 . G5 . E5 - - . F5 . A5 . C6 . F6 . E6 . D6 . C6 - - . ' +
              'D6 . C6 . Bb5 . A5 . G5 . A5 . Bb5 - - . A5 . G5 . F5 . E5 . F5 - - . . . . .',
      bassline: 'F2 . C3 . F2 . C3 . C3 . G3 . C3 . G3 . F2 . C3 . F2 . C3 . C3 . G3 . C3 . G3 . ' +
                'Bb2 . F3 . Bb2 . F3 . C3 . G3 . C3 . G3 . F2 . C3 . C3 . G3 . F2 . C3 . F2 . . .',
      drums: 'k.h.s.hh',
    },
    boss: {
      bpm: 172, lead: 'square', bass: 'sawtooth',
      melody: 'E5 . E5 . G5 . E5 . F#5 . E5 . D5 . B4 . E5 . E5 . G5 . A5 . B5 . A5 . G5 . F#5 . ' +
              'C6 . C6 . B5 . A5 . B5 . A5 . G5 . F#5 . E5 . G5 . F#5 . D5 . E5 - - - . . . .',
      bassline: 'E2 E3 E2 E3 E2 E3 E2 E3 D2 D3 D2 D3 B1 B2 B1 B2 E2 E3 E2 E3 E2 E3 E2 E3 B1 B2 B1 B2 B1 B2 B1 B2 ' +
                'C2 C3 C2 C3 C2 C3 C2 C3 D2 D3 D2 D3 D2 D3 D2 D3 E2 E3 E2 E3 B1 B2 B1 B2 E2 E3 E2 E3 E2 E3 E2 E3',
      drums: 'kshskshs',
    },
  };
  for (const k in SONGS) { SONGS[k].m = parse(SONGS[k].melody); SONGS[k].b = parse(SONGS[k].bassline); }

  let song = null, songName = null, stepIdx = 0, nextTime = 0, timer = null;

  function holdLen(arr, i) {
    let n = 1;
    while (arr[(i + n) % arr.length] === '-' && n < 16) n++;
    return n;
  }

  function schedule() {
    if (!ctx || !song) return;
    const stepDur = 60 / song.bpm / 2;
    while (nextTime < ctx.currentTime + 0.12) {
      const i = stepIdx % song.m.length;
      const mt = song.m[i];
      if (mt !== '.' && mt !== '-') {
        const f = freq(mt);
        if (f) tone(song.lead, f, f, stepDur * holdLen(song.m, i) * 0.92, 0.09, 0, musicBus, nextTime);
      }
      const bi = stepIdx % song.b.length;
      const bt = song.b[bi];
      if (bt !== '.' && bt !== '-') {
        const f = freq(bt);
        if (f) tone(song.bass, f, f, stepDur * holdLen(song.b, bi) * 0.9, song.bass === 'sawtooth' ? 0.05 : 0.16, 0, musicBus, nextTime);
      }
      const d = song.drums[stepIdx % song.drums.length];
      if (d === 'k') tone('sine', 150, 45, 0.12, 0.35, 0, musicBus, nextTime);
      else if (d === 's') noise(0.1, 0.16, 1800, 0, 'highpass', musicBus, nextTime);
      else if (d === 'h') noise(0.03, 0.06, 7000, 0, 'highpass', musicBus, nextTime);
      nextTime += stepDur;
      stepIdx++;
    }
  }

  function startTimer() {
    stepIdx = 0;
    nextTime = ctx.currentTime + 0.08;
    timer = setInterval(schedule, 25);
  }

  function playMusic(name) {
    if (songName === name && (timer || !ctx)) return;
    stopMusic();
    songName = name;
    song = SONGS[name] || null;
    if (ctx && song) startTimer();
  }

  function stopMusic() {
    if (timer) clearInterval(timer);
    timer = null;
    song = null;
    songName = null;
  }

  function setMuted(m) {
    muted = m;
    store.set('sk_muted', m);
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
  }

  return {
    init, play, playMusic, stopMusic,
    toggleMute() { setMuted(!muted); return muted; },
    isMuted: () => muted,
    current: () => songName,
  };
})();

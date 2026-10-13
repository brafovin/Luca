'use strict';
// Spielablauf: Zustände, Level laden, Wechselwirkungen, Kamera, Zeichnen, HUD und Menüs.

const STEP = 1 / 120;
const COMBO = [100, 200, 400, 800, 1000, 2000, 4000, 8000];
const LEVEL_PAR = 300; // Sekunden für den Zeitbonus

const G = {
  state: 'boot', stateT: 0, prevState: null,
  lvl: null, levelIndex: 0, player: null,
  enemies: [], items: [], coins: [], gems: [], platforms: [], springs: [], checkpoints: [],
  cannons: [], fireballs: [], particles: [], popups: [], effects: [], timers: [], hints: [],
  flag: null, house: null, boss: null, bossActive: false,
  cam: { x: 0, y: 0, w: 960, h: 540 }, look: 0, shakeT: 0, shakeMag: 0,
  score: 0, coinCount: 0, lives: 3, levelTime: 0, levelCoins: 0, time: 0,
  cp: null, runGems: new Set(),
  save: Object.assign({ unlocked: 1, gems: {}, best: 0, cleared: {} }, store.get('sk_save', {})),
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let K = 1, OX = 0, OY = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  let vh = 540, vw = (W / H) * vh;
  if (vw < 720) { vw = 720; vh = Math.min((H / W) * vw, 640); }
  if (vw > 1500) vw = 1500;
  const scale = Math.min(W / vw, H / vh);
  K = scale * dpr;
  OX = Math.round(((W - vw * scale) / 2) * dpr);
  OY = Math.round(((H - vh * scale) / 2) * dpr);
  G.cam.w = vw; G.cam.h = vh;
  Render.setScale(K);
  if (G.lvl) clampCam(true);
}
window.addEventListener('resize', resize);

// ---- Hilfen für Effekte / Punkte ------------------------------------------------------
G.particle = (p) => {
  if (G.particles.length > 500) return;
  p.max = p.life; p.rot = p.rot || Math.random() * 6; p.vr = p.vr == null ? (Math.random() - 0.5) * 10 : p.vr;
  G.particles.push(p);
};
G.dust = (x, y, n, dir) => {
  const th = G.lvl ? THEMES[G.lvl.theme].bg : 'hills';
  const col = th === 'mountains' ? '#ffffff' : th === 'castle' ? '#8f879a' : th === 'clouds' ? '#ffffff' : th === 'desert' ? '#f6d993' : '#e8dcc0';
  for (let i = 0; i < n; i++) {
    G.particle({ x: x + (Math.random() - 0.5) * 12, y: y - 2, vx: (dir || (Math.random() - 0.5) * 2) * (40 + Math.random() * 80), vy: -20 - Math.random() * 60, life: 0.35 + Math.random() * 0.2, size: 3 + Math.random() * 3, color: col, grav: 100, shape: 'c' });
  }
};
G.splash = (x, y) => {
  for (let i = 0; i < 6; i++) G.particle({ x, y, vx: (Math.random() - 0.5) * 160, vy: -150 - Math.random() * 150, life: 0.5, size: 3, color: '#ffb02e', grav: 900 });
};
G.popup = (x, y, text, color = '#ffffff') => { G.popups.push({ x, y, text: String(text), life: 0.9, color }); };
G.shake = (m) => { G.shakeT = 0.3; G.shakeMag = Math.max(G.shakeMag, m); };
G.addScore = (n) => { G.score += Math.round(n * DIFF.score); };
G.after = (t, fn) => G.timers.push({ t, fn });

function oneUp(x, y) {
  G.lives++;
  Sound.play('oneup');
  G.popup(x, y, '1UP', '#7dff9b');
}
function addCoin(x, y) {
  G.coinCount++; G.levelCoins++;
  G.addScore(200);
  Sound.play('coin');
  if (G.coinCount >= 100) { G.coinCount -= 100; oneUp(x, y - 20); }
}
function comboScore(p, e) {
  const i = p.combo++;
  const x = e.x + e.w / 2, y = e.y - 4;
  if (i >= COMBO.length) oneUp(x, y);
  else { G.addScore(COMBO[i]); G.popup(x, y, COMBO[i]); }
}
G.chainScore = (shell, o) => {
  shell.chain = (shell.chain || 0) + 1;
  const i = Math.min(COMBO.length - 1, shell.chain + 1);
  G.addScore(COMBO[i]);
  G.popup(o.x + o.w / 2, o.y - 4, COMBO[i]);
};

// ---- Level aufbauen ---------------------------------------------------------------
function surfaceRow(tx) {
  for (let y = 2; y < G.lvl.h - 1; y++) {
    const t = tileAt(tx, y), b = tileAt(tx, y + 1);
    if (!SOLID[t] && t !== TL.ONEWAY && (SOLID[b] || b === TL.ONEWAY)) return y;
  }
  return G.lvl.gy - 1;
}

function spawnEnemy(s) {
  const tx = s.x;
  const row = s.y != null ? s.y : surfaceRow(tx);
  const standY = (h) => (row + 1) * T - h;
  const cx = (w) => tx * T + T / 2 - w / 2;
  let e = null;
  switch (s.type) {
    case 'slime': e = new Slime(cx(28), standY(24)); break;
    case 'beetle': e = new Beetle(cx(28), standY(28)); break;
    case 'hedgehog': e = new Hedgehog(cx(30), standY(26)); break;
    case 'frog': e = new Frog(cx(28), standY(26)); break;
    case 'bat': e = new Bat(cx(30), s.y * T + 5, s.opts); break;
    case 'lavaball': e = new Lavaball(cx(24), (G.lvl.gy + 1) * T + 8, s.opts); break;
    case 'stomper': e = new Stomper(tx * T + 2, s.y * T); G.platforms.push(e); break;
    case 'boss': {
      const Cls = BOSS_TYPES[s.opts.boss] || SlimeBoss;
      e = new Cls(tx * T + T / 2, (row + 1) * T, s.opts);
      G.boss = e;
      break;
    }
  }
  if (e) G.enemies.push(e);
}

function savedGems(index) { return G.save.gems[LEVELS[index].id] || []; }

function spawnLevel(index) {
  const L = buildLevel(index);
  L.bumps = {}; L.multi = {};
  G.lvl = L;
  G.levelIndex = index;
  G.enemies = []; G.items = []; G.coins = []; G.gems = []; G.platforms = []; G.springs = [];
  G.checkpoints = []; G.cannons = []; G.fireballs = []; G.particles = []; G.popups = []; G.effects = []; G.timers = [];
  G.boss = null; G.bossActive = false;
  G.hints = L.hints.map((h) => ({ ...h, text: IS_TOUCH && h.touch ? h.touch : h.text, near: 0 }));
  G.house = L.decor.find((d) => d.type === 'house') || null;
  const known = savedGems(index);
  for (const s of L.spawns) {
    switch (s.kind) {
      case 'coin': G.coins.push({ x: s.x * T + 6, y: s.y * T + 4, w: 20, h: 24, taken: false, mag: false }); break;
      case 'gem': G.gems.push({ id: s.id, x: s.x * T + 3, y: s.y * T + 3, w: 26, h: 26, taken: G.runGems.has(s.id), ghost: known.includes(s.id) }); break;
      case 'enemy': spawnEnemy(s); break;
      case 'spring': G.springs.push({ x: s.x * T + 2, y: (s.y + 1) * T - 22, w: 28, h: 22, comp: 0 }); break;
      case 'mplat': G.platforms.push(new MovingPlatform(s.x, s.y, s.w, s.opts)); break;
      case 'fplat': G.platforms.push(new FallingPlatform(s.x, s.y, s.w)); break;
      case 'checkpoint': if (!DIFF.checkpoints) break; G.checkpoints.push({ tx: s.x, ty: s.y, x: s.x * T + T / 2, y: (s.y + 1) * T, active: !!(G.cp && G.cp.x === s.x) }); break;
      case 'cannon': G.cannons.push(new Cannon(s.x, s.y)); break;
    }
  }
  const f = L.flag;
  G.flag = f ? {
    x: f.x * T + T / 2, top: (f.y + 1) * T - 10 * T, bottom: (f.y + 1) * T,
    clothY: (f.y + 1) * T - 10 * T + 6, hidden: f.hidden, appear: f.hidden ? 0 : 1,
  } : null;
  const sp = G.cp || L.start;
  G.player = new Player(sp.x * T + T / 2, (sp.y + 1) * T);
  if (DIFF.startPower) { G.player.power = DIFF.startPower; G.player.setBox(G.player.fullW, G.player.fullH); }
  G.look = 0;
  clampCam(true);
}

// ---- Blöcke -----------------------------------------------------------------------
function bumpEffects(tx, ty) {
  const top = ty * T;
  for (const e of G.enemies) {
    if (!e.alive || e.type === 'boss' || e.type === 'stomper') continue;
    if (Math.abs(e.y + e.h - top) < 6 && e.x + e.w > tx * T && e.x < (tx + 1) * T) {
      e.kill('flip', sign(e.x + e.w / 2 - (tx * T + T / 2)) || 1);
      G.addScore(200); G.popup(e.x + e.w / 2, e.y - 4, 200);
      Sound.play('kick');
    }
  }
  for (const it of G.items) {
    if (it.emerge > 0) continue;
    if (Math.abs(it.y + it.h - top) < 6 && it.x + it.w > tx * T && it.x < (tx + 1) * T) {
      it.vy = -360; it.dir = it.x + it.w / 2 < tx * T + T / 2 ? -1 : 1;
    }
  }
  for (const c of G.coins) {
    if (!c.taken && c.x + c.w > tx * T && c.x < (tx + 1) * T && c.y + c.h > top - T && c.y < top) {
      c.taken = true; addCoin(c.x, c.y);
      G.effects.push({ type: 'popcoin', x: c.x + c.w / 2, y: c.y + c.h / 2, vy: -300, t: 0.4 });
    }
  }
}

function popCoin(tx, ty) {
  addCoin(tx * T + T / 2, ty * T);
  G.effects.push({ type: 'popcoin', x: tx * T + T / 2, y: ty * T, vy: -460, t: 0.5 });
}

function breakBrick(tx, ty) {
  setTile(tx, ty, TL.EMPTY);
  const col = THEMES[G.lvl.theme].brick.base;
  for (let i = 0; i < 4; i++) {
    G.particle({ x: tx * T + 8 + (i % 2) * 16, y: ty * T + 8 + Math.floor(i / 2) * 16, vx: (i % 2 ? 1 : -1) * (80 + Math.random() * 60), vy: -420 + Math.floor(i / 2) * 150, life: 1.2, size: 9, color: col, grav: 1600, shape: 'sq' });
  }
  G.addScore(50);
  Sound.play('brick');
  bumpEffects(tx, ty);
}

G.hitBlock = (tx, ty, who) => {
  const L = G.lvl, idx = ty * L.w + tx, t = tileAt(tx, ty);
  if (t !== TL.QBLOCK && t !== TL.BRICK) { if (who === G.player) Sound.play('bump'); return; }
  const content = L.contents[idx];
  bumpEffects(tx, ty);
  if (content) {
    L.bumps[idx] = 0.18;
    if (content === 'coins') {
      if (L.multi[idx] == null) L.multi[idx] = 8;
      L.multi[idx]--;
      popCoin(tx, ty);
      if (L.multi[idx] <= 0) { setTile(tx, ty, TL.USED); delete L.contents[idx]; }
      return;
    }
    setTile(tx, ty, TL.USED);
    delete L.contents[idx];
    if (content === 'coin') { popCoin(tx, ty); return; }
    let type = content;
    if (content === 'power') type = G.player.power > 0 ? 'flower' : 'mushroom';
    G.items.push(new Item(type, tx * T + 2, ty * T + 4, true));
    Sound.play('item');
    return;
  }
  if (t === TL.BRICK && who && who.power > 0) breakBrick(tx, ty);
  else { L.bumps[idx] = 0.18; Sound.play('bump'); }
};

// Panzer, der seitlich gegen Blöcke prallt
G.hitBlockSide = (shell, hx) => {
  const tx = hx > 0 ? Math.floor((shell.x + shell.w + 1) / T) : Math.floor((shell.x - 1) / T);
  const ty = Math.floor((shell.y + shell.h / 2) / T);
  const t = tileAt(tx, ty);
  if (t === TL.BRICK || t === TL.QBLOCK) G.hitBlock(tx, ty, { power: 1 });
};

// ---- Spieler-Ereignisse ------------------------------------------------------------
G.killPlayer = (fell = false) => {
  const p = G.player;
  if (p.dead || G.state !== 'play') return;
  p.dead = true; p.star = 0; p.inv = 0; p.rolling = 0; p.auto = null;
  p.setBox(p.fullW, p.fullH);
  p.vx = 0; p.vy = -680;
  p.hidden = fell;
  G.state = 'dying'; G.stateT = 0;
  Sound.stopMusic();
  Sound.play('die');
};

// „Einfach“: Abgrund oder Lava kosten kein Leben, sondern setzen dich an den letzten sicheren Platz
G.rescuePlayer = () => {
  const p = G.player;
  if (p.dead || G.state !== 'play') return;
  const s = p.safe || { x: G.lvl.start.x * T + 5, bottom: (G.lvl.start.y + 1) * T };
  p.rolling = 0; p.auto = null; p.riding = null;
  p.power = p.power === 2 ? 1 : 0;
  p.setBox(p.fullW, p.fullH);
  p.x = s.x; p.y = s.bottom - p.h; p.vx = 0; p.vy = 0;
  p.inv = DIFF.inv;
  Sound.play('hurt');
  G.popup(p.cx, p.y - 10, 'Gerettet!', '#bfe8ff');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    G.particle({ x: p.cx, y: p.y + p.h / 2, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 0.5, size: 4, color: '#bfe8ff', grav: 0 });
  }
};

function collectItem(it) {
  const p = G.player;
  const x = p.cx, y = p.y - 6;
  it.remove = true;
  switch (it.type) {
    case 'mushroom':
      if (p.power === 0) { p.grow(1); G.popup(x, y, 'Groß!', '#ffe27a'); } else G.popup(x, y, '1000');
      break;
    case 'flower': p.grow(2); G.popup(x, y, 'Feuer! (F)', '#ffb02e'); break;
    case 'star': p.star = TIMED_POWERS.star.time; G.popup(x, y, 'Unbesiegbar!', '#ffe27a'); break;
    case 'feather': p.feather = TIMED_POWERS.feather.time; G.popup(x, y, 'Doppelsprung!', '#bfe8ff'); break;
    case 'magnet': p.magnet = TIMED_POWERS.magnet.time; G.popup(x, y, 'Münzmagnet!', '#ffb4b4'); break;
    case 'boots': p.boots = TIMED_POWERS.boots.time; G.popup(x, y, 'Turbo!', '#9fd8ff'); break;
    case 'heart': oneUp(x, y); return;
  }
  G.addScore(1000);
  Sound.play('power');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    G.particle({ x: p.cx, y: p.y + p.h / 2, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0.5, size: 3, color: '#fff3a0', grav: 0, shape: 'star' });
  }
}

function startClear() {
  const p = G.player, f = G.flag;
  G.state = 'clear'; G.stateT = 0;
  if (p.rolling > 0) { p.rolling = 0; p.setBox(p.fullW, p.fullH); }
  const frac = clamp((f.bottom - (p.y + p.h)) / (f.bottom - f.top), 0, 1);
  const bonus = frac > 0.85 ? 5000 : frac > 0.6 ? 2000 : frac > 0.4 ? 800 : frac > 0.2 ? 400 : 100;
  G.addScore(bonus);
  G.popup(f.x + 20, p.y, bonus, '#ffe27a');
  p.x = f.x - p.w - 2; p.vx = 0; p.vy = 0; p.face = 1;
  const doorX = G.house ? G.house.x * T + T / 2 : f.x + 6 * T;
  p.auto = { phase: 'slide', poleX: f.x, bottom: f.bottom, doorX, t: 0 };
  Sound.stopMusic();
  Sound.play('flag');
}

G.onEnteredHouse = () => {
  G.after(0.5, () => {
    Sound.play('clear');
    const timeBonus = Math.max(0, LEVEL_PAR - Math.floor(G.levelTime)) * 10;
    G.addScore(timeBonus);
    const def = LEVELS[G.levelIndex];
    const gems = new Set([...savedGems(G.levelIndex), ...G.runGems]);
    G.save.gems[def.id] = [...gems].sort();
    G.save.unlocked = Math.max(G.save.unlocked, Math.min(LEVELS.length, G.levelIndex + 2));
    G.save.cleared = G.save.cleared || {};
    G.save.cleared[def.id] = Math.max(G.save.cleared[def.id] ?? -1, DIFFICULTIES.indexOf(DIFF));
    G.save.best = Math.max(G.save.best, G.score);
    store.set('sk_save', G.save);
    for (let i = 0; i < 5; i++) G.after(i * 0.25, () => firework(G.cam.x + G.cam.w * (0.2 + Math.random() * 0.6), G.cam.y + 80 + Math.random() * 120));
    G.after(0.6, () => UI.showClear({ time: G.levelTime, timeBonus, coins: G.levelCoins, gems: G.runGems.size, total: G.gems.length }));
  });
};

function firework(x, y) {
  const hue = Math.random() * 360;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, sp = 140 + Math.random() * 60;
    G.particle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.9, size: 3, color: `hsl(${hue},100%,65%)`, grav: 160, shape: 'star' });
  }
  Sound.play('stomp');
}

G.bossStart = (b) => {
  G.bossActive = true;
  Sound.playMusic('boss');
  G.popup(b.cx, Math.max(b.y - 30, G.cam.y + 90), b.name + '!', '#ff9bd2');
  // Tor hinter dem Spieler schließt sich
  for (const g of G.lvl.gates) {
    if (!g.closing) continue;
    for (let y = g.y0; y <= g.y1; y++) setTile(g.x, y, TL.STONE);
    G.dust(g.x * T + T / 2, (g.y1 + 1) * T, 8, 0);
  }
  Sound.play('thud');
  G.shake(5);
};

G.bossDefeated = (b) => {
  G.addScore(5000);
  G.popup(b.x + b.w / 2, b.y - 20, '5000', '#ffe27a');
  Sound.play('bossDie');
  G.shake(12);
  for (let i = 0; i < 40; i++) {
    G.particle({ x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, vx: (Math.random() - 0.5) * 400, vy: -Math.random() * 500, life: 1.2, size: 5, color: i % 2 ? '#9b5ae0' : '#ffcf33', grav: 900 });
  }
  for (const e of G.enemies) {
    if (e === b || !e.alive || e.isPlatform) continue;
    if (e.x + e.w > b.arena[0] - T && e.x < b.arena[1] + T) e.kill('flip', 1);
  }
  G.after(1.4, () => {
    G.bossActive = false;
    Sound.playMusic(G.lvl.music);
    for (const g of G.lvl.gates) {
      for (let y = g.y0; y <= g.y1; y++) {
        setTile(g.x, y, TL.EMPTY);
        G.particle({ x: g.x * T + 16, y: y * T + 16, vx: 60 + Math.random() * 120, vy: -200 - Math.random() * 200, life: 1.2, size: 9, color: THEMES[G.lvl.theme].stone.base, grav: 1400, shape: 'sq' });
      }
    }
    Sound.play('brick');
    if (G.flag && G.flag.hidden) { G.flag.hidden = false; G.flag.appear = 0; }
    G.popup(b.arena[1] - 2 * T, G.lvl.gy * T - 4 * T, 'Das Tor ist offen!', '#7dff9b');
  });
};

// ---- Wechselwirkungen --------------------------------------------------------------
function inRange(e, pad = 320) {
  return e.x + e.w > G.cam.x - pad && e.x < G.cam.x + G.cam.w + 120;
}

function interactions(dt) {
  const p = G.player;
  if (p.dead || G.state !== 'play') return;
  const pb = inset(p, 2);

  for (const e of G.enemies) {
    if (!e.alive || e.ghost || !overlap(pb, e)) continue;
    if (p.dead || G.state !== 'play') break;
    if (e.type === 'stomper') { e.onTouch(p); continue; }
    if (p.star > 0 && e.starKill) {
      e.kill('flip', sign(e.x - p.x) || 1);
      comboScore(p, e);
      Sound.play('kick');
      continue;
    }
    const stomping = p.vy > 0 && p.prevBottom <= e.y + Math.max(10, e.h * 0.5);
    if (stomping && e.stompable) {
      const r = e.stomp(p);
      if (r === 'boss') { p.bounce(true); p.inv = Math.max(p.inv, 0.3); G.popup(e.x + e.w / 2, e.y - 10, e.hp > 0 ? `${e.hp} übrig` : 'Besiegt!', '#ff9bd2'); continue; }
      p.bounce();
      Sound.play('stomp');
      if (r === 'stomp') comboScore(p, e);
      continue;
    }
    if (p.rolling > 0) {
      const r = e.onRoll(p);
      if (r === 'kill') { comboScore(p, e); Sound.play('kick'); continue; }
      if (r === 'kick') continue;
      if (r === 'boss') {
        p.vx = -(sign(e.cx - p.cx) || p.face) * 240; p.vy = -460;
        p.inv = Math.max(p.inv, 0.5);
        G.popup(e.cx, e.y - 10, e.hp > 0 ? `${e.hp} übrig` : 'Besiegt!', '#ff9bd2');
        continue;
      }
    }
    e.onTouch(p);
  }

  // Feuerbälle
  for (const f of G.fireballs) {
    if (f.remove) continue;
    for (const e of G.enemies) {
      if (!e.alive || e.ghost || !overlap(f, e)) continue;
      if (e.type === 'boss') { e.fireHit(); f.poof(); break; }
      if (e.fireKill) { e.kill('flip', sign(f.vx)); G.addScore(e.score); G.popup(e.x + e.w / 2, e.y - 4, e.score); Sound.play('kick'); }
      f.poof();
      break;
    }
  }

  // Gegenstände
  for (const it of G.items) if (!it.remove && it.emerge <= 0 && overlap(pb, it)) collectItem(it);

  // Münzen (mit Magnet)
  const pcx = p.cx, pcy = p.y + p.h / 2;
  for (const c of G.coins) {
    if (c.taken) continue;
    if (p.magnet > 0 || c.mag) {
      const dx = pcx - (c.x + c.w / 2), dy = pcy - (c.y + c.h / 2), d = Math.hypot(dx, dy);
      if (d < 170 || c.mag) {
        c.mag = true;
        const sp = 520 * dt;
        c.x += (dx / (d || 1)) * Math.min(sp, d); c.y += (dy / (d || 1)) * Math.min(sp, d);
      }
    }
    if (overlap(p, c)) {
      c.taken = true;
      addCoin(c.x, c.y);
      for (let i = 0; i < 5; i++) G.particle({ x: c.x + c.w / 2, y: c.y + c.h / 2, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.35, size: 2.5, color: '#fff3a0', grav: 0, shape: 'star' });
    }
  }

  // Edelsteine
  for (const g of G.gems) {
    if (g.taken || !overlap(p, g)) continue;
    g.taken = true;
    G.runGems.add(g.id);
    G.addScore(2000);
    Sound.play('gem');
    G.popup(g.x + 13, g.y - 6, g.ghost ? '2000' : 'Edelstein!', '#bfe8ff');
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      G.particle({ x: g.x + 13, y: g.y + 13, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 0.6, size: 3, color: ['#ff4f7b', '#3fb6ff', '#3ee07a'][g.id % 3], grav: 0, shape: 'star' });
    }
  }

  // Sprungfedern
  for (const s of G.springs) {
    if (p.vy < 0 || p.x + p.w <= s.x + 2 || p.x >= s.x + s.w - 2) continue;
    const top = s.y + s.comp * 10;
    if (p.y + p.h >= top && p.prevBottom <= top + 10) {
      p.y = top - p.h;
      const hold = Input.down('jump');
      p.vy = -PHYS.SPRING;
      p.jumpHold = hold ? PHYS.HOLD_TIME : 0;
      p.onGround = false; p.riding = null; p.canDouble = true; p.combo = 0; p.airRolls = 1;
      s.comp = 1;
      Sound.play('spring');
    }
  }

  // Kontrollpunkte
  for (const c of G.checkpoints) {
    if (c.active) continue;
    if (p.x + p.w > c.x - 10 && p.x < c.x + 10 && p.y + p.h > c.y - 56 && p.y < c.y) {
      for (const o of G.checkpoints) o.active = false;
      c.active = true;
      G.cp = { x: c.tx, y: c.ty };
      Sound.play('checkpoint');
      G.popup(c.x, c.y - 70, 'Kontrollpunkt!', '#7dff9b');
      for (let i = 0; i < 12; i++) G.particle({ x: c.x + 10, y: c.y - 44, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200, life: 0.6, size: 3, color: '#7dff9b', grav: 300, shape: 'star' });
    }
  }

  // Zielflagge
  const f = G.flag;
  if (f && !f.hidden && f.appear >= 1 && p.x + p.w > f.x - 4 && p.x < f.x + 4 && p.y + p.h > f.top - 12) startClear();

  // Hinweisschilder: nur das nächste Schild zeigt seine Sprechblase
  let best = null, bestD = 150;
  for (const h of G.hints) {
    const d = Math.abs(p.cx - (h.x * T + T / 2));
    if (d < bestD && Math.abs(p.y + p.h - (h.y + 1) * T) < 150) { best = h; bestD = d; }
  }
  for (const h of G.hints) h.near = approach(h.near, h === best ? 1 : 0, dt * 6);
}

// ---- Kamera ---------------------------------------------------------------------
const TOUCH_EXTRA = IS_TOUCH ? 84 : 0; // zusätzliche Sicht unter dem Boden (Platz für die Knöpfe)

function clampCam(snap) {
  const p = G.player, cam = G.cam, L = G.lvl;
  if (!p || !L) return;
  const maxX = Math.max(0, L.w * T - cam.w);
  let tx = clamp(p.cx - cam.w * 0.42 + G.look, 0, maxX);
  if (G.bossActive && G.boss) {
    const a0 = G.boss.arena[0] - T, a1 = G.boss.arena[1] + T;
    tx = a1 - a0 <= cam.w ? (a0 + a1) / 2 - cam.w / 2 : clamp(tx, a0, a1 - cam.w);
    tx = clamp(tx, 0, maxX);
  }
  const bottom = L.h * T + TOUCH_EXTRA;
  let ty = p.y + p.h / 2 - cam.h * (IS_TOUCH ? 0.45 : 0.55);
  ty = bottom <= cam.h ? bottom - cam.h : clamp(ty, 0, bottom - cam.h);
  if (snap) { cam.x = tx; cam.y = ty; return; }
  cam.x = clamp(cam.x + (tx - cam.x) * 0.12, 0, maxX);
  cam.y = cam.y + (ty - cam.y) * 0.08;
}

function updateCamera(dt) {
  const p = G.player;
  if (G.state === 'title') {
    const L = G.lvl, maxX = L.w * T - G.cam.w;
    G.cam.x = (G.time * 45) % (2 * maxX);
    if (G.cam.x > maxX) G.cam.x = 2 * maxX - G.cam.x;
    G.cam.y = L.h * T <= G.cam.h ? L.h * T - G.cam.h : L.h * T - G.cam.h;
    return;
  }
  if (!p.dead) G.look = approach(G.look, p.face * 60 + p.vx * 0.15, 160 * dt);
  if (!p.dead) clampCam(false);
  G.shakeT = Math.max(0, G.shakeT - dt);
  if (G.shakeT <= 0) G.shakeMag = 0;
}

// ---- Schritt ------------------------------------------------------------------------
function updateWorld(dt, withPlayer) {
  const L = G.lvl;
  for (const k in L.bumps) { L.bumps[k] -= dt; if (L.bumps[k] <= 0) delete L.bumps[k]; }
  // Schwierigkeit: Gegner, Geschosse, Stampfer und Kanonen laufen schneller oder langsamer
  for (const p of G.platforms) if (!p.isPlatform || p.alive) p.update(p.isPlatform ? dt * DIFF.speed : dt);
  if (withPlayer) G.player.update(dt);
  for (const e of G.enemies) {
    if (e.isPlatform) continue;
    if (!e.alive) { e.deadUpdate(dt); continue; }
    if (e.type === 'boss' ? e.awake || inRange(e, 0) : inRange(e)) e.update(dt * (e.type === 'boss' ? DIFF.bossSpeed : DIFF.speed));
  }
  // Gegner drehen sich um, wenn sie sich berühren
  for (let i = 0; i < G.enemies.length; i++) {
    const a = G.enemies[i];
    if (!a.alive || !a.onGround || a.vx === 0 || a.type === 'boss' || (a.type === 'beetle' && a.shell)) continue;
    for (let j = i + 1; j < G.enemies.length; j++) {
      const b = G.enemies[j];
      if (!b.alive || !b.onGround || b.vx === 0 || b.type === 'boss' || (b.type === 'beetle' && b.shell)) continue;
      if (overlap(a, b) && sign(b.x - a.x) === sign(a.vx)) { a.vx = -a.vx; b.vx = -b.vx; }
    }
  }
  if (withPlayer) for (const c of G.cannons) c.update(dt * DIFF.speed);
  for (const it of G.items) it.update(dt);
  for (const f of G.fireballs) f.update(dt);
  for (const s of G.springs) s.comp = approach(s.comp, 0, dt * 4);
  for (const ef of G.effects) {
    ef.t -= dt; ef.vy += 1400 * dt; ef.y += ef.vy * dt;
    if (ef.t <= 0 && ef.type === 'popcoin') {
      for (let i = 0; i < 4; i++) G.particle({ x: ef.x, y: ef.y, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.3, size: 2.5, color: '#fff3a0', grav: 0, shape: 'star' });
    }
  }
  if (G.flag && G.flag.appear < 1 && !G.flag.hidden) G.flag.appear = Math.min(1, G.flag.appear + dt * 1.5);
  G.effects = G.effects.filter((e) => e.t > 0);
  G.enemies = G.enemies.filter((e) => !e.remove);
  G.items = G.items.filter((e) => !e.remove);
  G.fireballs = G.fireballs.filter((e) => !e.remove);
}

function updateParticles(dt) {
  for (const p of G.particles) {
    p.life -= dt;
    p.vy += (p.grav || 0) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  G.particles = G.particles.filter((p) => p.life > 0);
  for (const p of G.popups) { p.life -= dt; p.y -= 50 * dt; }
  G.popups = G.popups.filter((p) => p.life > 0);
}

function step(dt) {
  G.time += dt;
  G.stateT += dt;
  for (const t of G.timers) { t.t -= dt; if (t.t <= 0 && !t.done) { t.done = true; t.fn(); } }
  G.timers = G.timers.filter((t) => !t.done);

  switch (G.state) {
    case 'title':
      updateWorld(dt, false);
      updateParticles(dt);
      updateCamera(dt);
      break;
    case 'intro':
      for (const h of G.hints) h.near = 0;
      if (G.stateT > 1.7) beginPlay();
      break;
    case 'play':
      G.levelTime += dt;
      updateWorld(dt, true);
      interactions(dt);
      updateParticles(dt);
      updateCamera(dt);
      break;
    case 'dying':
      G.player.update(dt);
      updateParticles(dt);
      if (G.stateT > 2.4) afterDeath();
      break;
    case 'clear': {
      const f = G.flag;
      if (f) f.clothY = Math.min(f.clothY + 340 * dt, f.bottom - 44);
      updateWorld(dt, true);
      updateParticles(dt);
      updateCamera(dt);
      break;
    }
    case 'cleared':
      updateParticles(dt);
      break;
  }
}

// ---- Ablauf -------------------------------------------------------------------------
function startTitle() {
  G.state = 'title'; G.stateT = 0;
  G.cp = null; G.runGems = new Set();
  spawnLevel(0);
  G.player.hidden = true;
  G.player.x = -500;
  UI.show('title');
  UI.hud(false);
  Sound.playMusic('meadow');
}

function startGame(index) {
  G.score = 0; G.coinCount = 0; G.lives = DIFF.lives;
  startLevel(index);
}

function startLevel(index) {
  G.cp = null; G.runGems = new Set(); G.levelTime = 0; G.levelCoins = 0;
  spawnLevel(index);
  enterIntro();
}

function enterIntro() {
  G.state = 'intro'; G.stateT = 0;
  UI.show(null);
  UI.hud(true);
  UI.banner(LEVELS[G.levelIndex], G.lives);
  Sound.stopMusic();
  Input.clear();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function beginPlay() {
  G.state = 'play'; G.stateT = 0;
  UI.banner(null);
  Sound.playMusic(G.bossActive ? 'boss' : G.lvl.music);
}

function afterDeath() {
  G.lives--;
  if (G.lives <= 0) {
    G.state = 'over'; G.stateT = 0;
    G.save.best = Math.max(G.save.best, G.score);
    store.set('sk_save', G.save);
    UI.showOver();
    return;
  }
  spawnLevel(G.levelIndex);
  enterIntro();
}

function nextLevel() {
  if (G.levelIndex + 1 >= LEVELS.length) {
    G.state = 'won';
    UI.showWin();
    return;
  }
  startLevel(G.levelIndex + 1);
}

function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause';
  Sound.stopMusic();
  Sound.play('pause');
  UI.show('pause');
}

function resumeGame() {
  if (G.state !== 'pause') return;
  UI.show(null);
  G.state = 'play';
  Input.clear();
  Sound.playMusic(G.bossActive ? 'boss' : G.lvl.music);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---- Zeichnen -----------------------------------------------------------------------
function onScreen(e, cam, pad = 64) {
  return e.x + (e.w || 0) > cam.x - pad && e.x < cam.x + cam.w + pad && e.y + (e.h || 0) > cam.y - pad - 200 && e.y < cam.y + cam.h + pad;
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d16';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!G.lvl) return;
  const cam = { x: G.cam.x, y: G.cam.y, w: G.cam.w, h: G.cam.h };
  if (G.shakeT > 0) { cam.x += (Math.random() - 0.5) * G.shakeMag; cam.y += (Math.random() - 0.5) * G.shakeMag; }
  const t = G.time;

  ctx.save();
  ctx.beginPath(); ctx.rect(OX, OY, cam.w * K, cam.h * K); ctx.clip();
  ctx.setTransform(K, 0, 0, K, OX, OY);
  Render.drawBackground(ctx, G.lvl, cam, t);

  ctx.setTransform(K, 0, 0, K, OX - cam.x * K, OY - cam.y * K);
  for (const d of G.lvl.decor) {
    const x = d.x * T;
    if (x > cam.x - 160 && x < cam.x + cam.w + 160) Render.drawDecor(ctx, d, G.lvl.theme, t);
  }
  for (const h of G.hints) if (h.x * T > cam.x - 300 && h.x * T < cam.x + cam.w + 300) Render.drawHint(ctx, h, h.near);
  for (const it of G.items) if (it.emerge > 0) Render.drawItem(ctx, it, t);

  Render.drawTiles(ctx, G.lvl, cam, K, OX, OY, t);

  for (const c of G.checkpoints) if (c.x > cam.x - 64 && c.x < cam.x + cam.w + 64) Render.drawCheckpoint(ctx, c, t);
  if (G.flag && G.flag.x > cam.x - 100 && G.flag.x < cam.x + cam.w + 100) Render.drawFlag(ctx, G.flag, t);
  for (const p of G.platforms) if (!p.isPlatform && onScreen(p, cam)) Render.drawPlatform(ctx, p, G.lvl.theme, t);
  for (const s of G.springs) if (onScreen(s, cam)) Render.drawSpring(ctx, s);
  for (const c of G.coins) if (!c.taken && onScreen(c, cam)) Render.drawCoinShape(ctx, c.x + c.w / 2, c.y + c.h / 2, t);
  for (const g of G.gems) if (!g.taken && onScreen(g, cam)) Render.drawGemShape(ctx, g.x + 13, g.y + 13, g.id, t, g.ghost);
  for (const ef of G.effects) if (ef.type === 'popcoin') Render.drawCoinShape(ctx, ef.x, ef.y, t * 3);
  for (const it of G.items) if (it.emerge <= 0 && onScreen(it, cam)) Render.drawItem(ctx, it, t);
  for (const e of G.enemies) if (onScreen(e, cam)) Render.drawEnemy(ctx, e, t);
  if (G.player) Render.drawPlayer(ctx, G.player, t);
  for (const f of G.fireballs) Render.drawFireball(ctx, f, t);

  for (const p of G.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.shape === 'sq') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
    } else if (p.shape === 'star') {
      const s = p.size * (0.6 + a * 0.6);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-s, -s * 0.3, s * 2, s * 0.6); ctx.fillRect(-s * 0.3, -s, s * 0.6, s * 2);
      ctx.restore();
    } else if (p.shape === 'feather') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); Render.ellipse(ctx, 0, 0, p.size * 1.6, p.size * 0.6); ctx.fill(); ctx.restore();
    } else {
      Render.circle(ctx, p.x, p.y, p.size * (0.5 + a * 0.5)); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 18px "Lilita One", "Arial Black", sans-serif';
  ctx.lineJoin = 'round';
  for (const p of G.popups) {
    ctx.globalAlpha = clamp(p.life / 0.3, 0, 1);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,24,40,0.85)';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  ctx.setTransform(K, 0, 0, K, OX, OY);
  Render.drawWeather(ctx, G.lvl, cam, t);
  if (G.player && G.player.star > 0) {
    ctx.fillStyle = `hsla(${(t * 360) % 360},100%,70%,0.06)`;
    ctx.fillRect(0, 0, cam.w, cam.h);
  }
  ctx.restore();
}

// ---- Hauptschleife -------------------------------------------------------------------
let acc = 0, last = performance.now();

function frameInput() {
  Input.update();
  if (Input.pressed('pause')) {
    if (G.state === 'play') pauseGame();
    else if (G.state === 'pause') resumeGame();
  }
  const p = G.player;
  if (G.state === 'play' && p) {
    if (Input.pressed('jump')) p.jumpBuf = PHYS.JUMP_BUF;
    if (Input.pressed('roll')) p.rollBuf = 0.12;
    if (Input.pressed('fire')) p.fireReq = true;
  } else if (G.state === 'intro') {
    if (G.stateT > 0.4 && (Input.pressed('jump') || Input.pressed('confirm'))) beginPlay();
  } else if (Input.padPressed('confirm') || Input.padPressed('jump')) {
    const el = document.activeElement;
    if (el && el.tagName === 'BUTTON') el.click();
    else UI.clickPrimary();
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!SK.manual) {
    frameInput();
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 8) { step(STEP); acc -= STEP; n++; }
    if (n === 8) acc = 0;
  }
  render();
  UI.update();
  requestAnimationFrame(frame);
}

// Kleiner Haken für automatische Tests: SK.manual = true, dann SK.tick(frames)
const SK = {
  G, startGame, startLevel, spawnLevel, step, render, manual: false,
  tick(frames = 1) { for (let i = 0; i < frames; i++) { frameInput(); step(STEP); step(STEP); } },
};
window.SK = SK;

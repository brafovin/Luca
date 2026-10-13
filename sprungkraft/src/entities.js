'use strict';
// Spieler, Gegner, Gegenstände, Plattformen und Effekte.

const PHYS = {
  GRAV: 2100, GRAV_HOLD: 1150, HOLD_TIME: 0.34, MAX_FALL: 900,
  WALK: 200, RUN: 330, ROLL: 420, ROLL_TIME: 0.5, ROLL_CD: 0.22,
  ACC: 1700, ACC_AIR: 1100, DEC: 1900, ICE_ACC: 480, ICE_DEC: 150,
  JUMP: 550, JUMP_RUN_BONUS: 0.12, DJUMP: 500, SPRING: 950, STOMP: 430, STOMP_HOLD: 580,
  JUMP_BUF: 0.12, COYOTE: 0.1,
};

const TIMED_POWERS = {
  star: { label: 'Stern', time: 10 },
  feather: { label: 'Feder', time: 25 },
  magnet: { label: 'Magnet', time: 20 },
  boots: { label: 'Turbo', time: 15 },
};

// Schiebt eine Box ein paar Pixel zur Seite, falls sie nach einer Größenänderung in einer Wand steckt
function unstick(e) {
  if (boxFree(e.x, e.y, e.w, e.h)) return;
  for (let d = 1; d <= 6; d++) {
    if (boxFree(e.x + d, e.y, e.w, e.h)) { e.x += d; return; }
    if (boxFree(e.x - d, e.y, e.w, e.h)) { e.x -= d; return; }
  }
}

// ======================================================================================
class Player {
  constructor(cx, bottom) {
    this.power = 0;
    this.w = 22; this.h = 40;
    this.x = cx - this.w / 2; this.y = bottom - this.h;
    this.vx = 0; this.vy = 0; this.face = 1;
    this.onGround = false; this.groundTile = 0;
    this.coyote = 0; this.jumpBuf = 0; this.jumpHold = 0; this.canDouble = false;
    this.rolling = 0; this.rollCD = 0; this.rollAngle = 0;
    this.rollBuf = 0; this.fireReq = false;
    this.inv = 0; this.star = 0; this.feather = 0; this.magnet = 0; this.boots = 0; this.fireCD = 0;
    this.riding = null; this.walkPhase = 0; this.squash = 0; this.blinkSeed = Math.random() * 3;
    this.dead = false; this.deadSpin = 0; this.flagHold = false; this.hidden = false;
    this.combo = 0; this.prevBottom = bottom; this.auto = null; this.dustT = 0;
  }

  get fullW() { return this.power > 0 ? 24 : 22; }
  get fullH() { return this.power > 0 ? 56 : 40; }
  get cx() { return this.x + this.w / 2; }

  setBox(w, h) {
    const cx = this.x + this.w / 2, b = this.y + this.h;
    this.w = w; this.h = h;
    this.x = cx - w / 2; this.y = b - h;
    unstick(this);
  }
  canStand() {
    const w = this.fullW, h = this.fullH;
    return boxFree(this.x + this.w / 2 - w / 2, this.y + this.h - h, w, h);
  }

  startRoll(dir) {
    if (dir) this.face = dir;
    this.rolling = PHYS.ROLL_TIME;
    this.setBox(22, 24);
    const sp = PHYS.ROLL * (this.boots > 0 ? 1.2 : 1);
    this.vx = this.face * Math.max(Math.abs(this.vx), sp);
    Sound.play('roll');
    G.dust(this.cx, this.y + this.h, 6, -this.face);
  }
  endRoll() {
    this.rolling = 0;
    this.rollCD = PHYS.ROLL_CD;
    this.setBox(this.fullW, this.fullH);
  }

  jump() {
    if (this.rolling > 0) {
      if (!this.canStand()) { this.jumpBuf = 0; return; }
      this.endRoll();
    }
    this.vy = -(PHYS.JUMP + Math.abs(this.vx) * PHYS.JUMP_RUN_BONUS);
    this.jumpHold = PHYS.HOLD_TIME;
    this.jumpBuf = 0; this.coyote = 0;
    this.onGround = false; this.riding = null;
    Sound.play('jump');
    G.dust(this.cx, this.y + this.h, 4, 0);
  }
  doubleJump() {
    this.vy = -PHYS.DJUMP;
    this.jumpHold = 0.25;
    this.jumpBuf = 0; this.canDouble = false;
    Sound.play('djump');
    for (let i = 0; i < 8; i++) {
      G.particle({ x: this.cx, y: this.y + this.h, vx: (Math.random() - 0.5) * 220, vy: Math.random() * 120, life: 0.5, size: 4, color: '#ffffff', grav: 200, shape: 'feather' });
    }
  }
  bounce(strong = false) {
    const hold = Input.down('jump');
    this.vy = -(strong ? 680 : hold ? PHYS.STOMP_HOLD : PHYS.STOMP);
    this.jumpHold = hold ? 0.2 : 0;
    this.onGround = false; this.riding = null; this.canDouble = true;
  }

  hurt() {
    if (this.inv > 0 || this.star > 0 || this.dead || G.state !== 'play') return;
    if (this.power > 0) {
      this.power = this.power === 2 ? 1 : 0;
      if (this.rolling <= 0) this.setBox(this.fullW, this.fullH);
      this.inv = 2;
      Sound.play('hurt');
      G.shake(4);
      G.popup(this.cx, this.y - 8, this.power === 1 ? 'Feuer weg!' : 'Autsch!', '#ffb4b4');
    } else {
      G.killPlayer();
    }
  }

  grow(to) {
    const was = this.power;
    this.power = Math.max(this.power, to);
    if (this.rolling <= 0) this.setBox(this.fullW, this.fullH);
    if (was === 0 && this.power > 0) this.squash = -0.4;
  }

  update(dt) {
    if (this.dead) {
      this.vy = Math.min(this.vy + PHYS.GRAV * dt, PHYS.MAX_FALL);
      this.y += this.vy * dt;
      this.deadSpin += dt * 5;
      return;
    }
    if (this.auto) { this.autoUpdate(dt); return; }

    this.inv = Math.max(0, this.inv - dt);
    this.star = Math.max(0, this.star - dt);
    this.feather = Math.max(0, this.feather - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    this.boots = Math.max(0, this.boots - dt);
    this.fireCD = Math.max(0, this.fireCD - dt);
    this.rollCD = Math.max(0, this.rollCD - dt);
    this.squash = approach(this.squash, 0, dt * 4);

    // Plattform trägt den Spieler mit
    if (this.riding) {
      const p = this.riding;
      if (p.dx) moveX(this, p.dx);
      if (p.dy) moveY(this, p.dy);
    }
    this.prevBottom = this.y + this.h;

    const left = Input.down('left'), right = Input.down('right'), run = Input.down('run');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);

    if (this.rollBuf > 0) {
      this.rollBuf -= dt;
      if (this.onGround && this.rolling <= 0 && this.rollCD <= 0) { this.rollBuf = 0; this.startRoll(dir); }
    }

    const ice = this.onGround && this.groundTile === TL.ICE;
    const boost = this.boots > 0 ? 1.3 : 1;
    const maxSp = (run ? PHYS.RUN : PHYS.WALK) * boost;

    if (this.rolling > 0) {
      this.rolling -= dt;
      const stuck = !this.canStand();
      if (stuck && dir !== 0) this.face = dir;
      const target = this.face * PHYS.ROLL * (this.boots > 0 ? 1.2 : 1);
      if (this.onGround) this.vx = approach(this.vx, stuck ? target : this.vx, (ice ? 300 : 1200) * dt);
      if (this.rolling <= 0) {
        if (!stuck) this.endRoll();
        else { this.rolling = 0.05; if (Math.abs(this.vx) < 160) this.vx = this.face * 160; }
      }
    } else if (dir !== 0) {
      this.face = dir;
      let acc = this.onGround ? (ice ? PHYS.ICE_ACC : PHYS.ACC) : PHYS.ACC_AIR;
      if (this.onGround && !ice && sign(this.vx) === -dir) acc *= 1.6;
      if (Math.abs(this.vx) > maxSp && sign(this.vx) === dir) {
        this.vx = approach(this.vx, dir * maxSp, (this.onGround ? (ice ? 120 : 700) : 120) * dt);
      } else {
        this.vx = approach(this.vx, dir * maxSp, acc * dt);
      }
      // Bremsstaub beim Umdrehen
      if (this.onGround && sign(this.vx) === -dir && Math.abs(this.vx) > 120) {
        this.dustT -= dt;
        if (this.dustT <= 0) { this.dustT = 0.05; G.dust(this.cx, this.y + this.h, 1, dir); }
      }
    } else {
      const dec = this.onGround ? (ice ? PHYS.ICE_DEC : PHYS.DEC) : 260;
      this.vx = approach(this.vx, 0, dec * dt);
    }

    // Springen
    if (this.onGround) { this.coyote = PHYS.COYOTE; this.canDouble = true; }
    else this.coyote -= dt;
    if (this.jumpBuf > 0) {
      const fresh = this.jumpBuf > PHYS.JUMP_BUF - 0.02;
      this.jumpBuf -= dt;
      if (this.onGround || this.coyote > 0) this.jump();
      else if (fresh && this.feather > 0 && this.canDouble && this.rolling <= 0) this.doubleJump();
    }

    // Schwerkraft (Springen halten = höher)
    let g = PHYS.GRAV;
    if (this.jumpHold > 0) {
      if (Input.down('jump') && this.vy < 0) g = PHYS.GRAV_HOLD;
      else this.jumpHold = 0;
      this.jumpHold -= dt;
    }
    this.vy = Math.min(this.vy + g * dt, PHYS.MAX_FALL);

    // Bewegen
    if (moveX(this, this.vx * dt)) this.vx = 0;
    const wasGround = this.onGround;
    const vyBefore = this.vy;
    this.onGround = false;
    this.riding = null;
    const hy = moveY(this, this.vy * dt);
    if (hy === 1) this.land(vyBefore, wasGround);
    else if (hy === -1) this.headBump();

    // Bewegliche Plattformen (nur von oben begehbar)
    if (this.vy >= 0) {
      for (const p of G.platforms) {
        if (!p.solid) continue;
        if (this.x + this.w <= p.x + 1 || this.x >= p.x + p.w - 1) continue;
        const bottom = this.y + this.h;
        if (bottom >= p.y && this.prevBottom <= Math.max(p.y, p.prevY) + 6) {
          this.y = p.y - this.h;
          if (!this.onGround) this.land(vyBefore, wasGround);
          this.riding = p;
          if (p.onStand) p.onStand(this);
          break;
        }
      }
    }

    if (this.onGround && !this.riding) {
      const fy = Math.floor((this.y + this.h + 1) / T);
      let t = tileAt(Math.floor(this.cx / T), fy);
      if (!SOLID[t] && t !== TL.ONEWAY) t = tileAt(Math.floor(this.x / T), fy);
      if (!SOLID[t] && t !== TL.ONEWAY) t = tileAt(Math.floor((this.x + this.w - 1) / T), fy);
      this.groundTile = t;
    } else this.groundTile = 0;

    // Gefahren
    if (touchesTile(this, TL.LAVA, 4)) { G.killPlayer(); return; }
    const sx0 = Math.floor(this.x / T), sx1 = Math.floor((this.x + this.w - 1) / T);
    const sy0 = Math.floor(this.y / T), sy1 = Math.floor((this.y + this.h - 1) / T);
    for (let ty = sy0; ty <= sy1; ty++) for (let tx = sx0; tx <= sx1; tx++) {
      if (tileAt(tx, ty) !== TL.SPIKES) continue;
      if (overlap(this, { x: tx * T + 3, y: ty * T + 14, w: T - 6, h: T - 14 })) {
        if (this.inv <= 0 && this.star <= 0) { this.hurt(); if (!this.dead) this.vy = -480; }
      }
    }
    if (this.y > G.lvl.h * T + 60) { G.killPlayer(true); return; }

    // Feuerball
    if (this.fireReq) {
      this.fireReq = false;
      if (this.power === 2 && this.fireCD <= 0 && this.rolling <= 0 && G.fireballs.length < 2) {
        this.fireCD = 0.22;
        G.fireballs.push(new Fireball(this.cx + this.face * 10 - 7, this.y + Math.min(14, this.h * 0.3), this.face));
        Sound.play('fire');
      }
    }

    // Animation
    if (this.onGround) this.walkPhase += Math.abs(this.vx) * dt * 0.075;
    if (this.rolling > 0) this.rollAngle += (this.vx * dt) / 12;
    if (this.boots > 0 && Math.abs(this.vx) > 220 && Math.random() < 0.5) {
      G.particle({ x: this.cx - this.face * 8, y: this.y + this.h - 4, vx: -this.face * 40, vy: -20, life: 0.3, size: 3, color: '#7fd0ff', grav: 0 });
    }
    if (this.star > 0 && Math.random() < 0.5) {
      G.particle({ x: this.x + Math.random() * this.w, y: this.y + Math.random() * this.h, vx: 0, vy: -30, life: 0.4, size: 3, color: `hsl(${Math.random() * 360},100%,70%)`, grav: 0, shape: 'star' });
    }
  }

  land(vyBefore, wasGround) {
    this.vy = 0;
    this.onGround = true;
    this.combo = 0;
    if (!wasGround && vyBefore > 380) {
      this.squash = Math.min(0.5, vyBefore / 1800);
      G.dust(this.cx, this.y + this.h, 3, 0);
    }
  }

  headBump() {
    const ty = this.ceilTy;
    const l = Math.floor(this.x / T), r = Math.floor((this.x + this.w - 0.01) / T);
    // Ecken-Korrektur: knapp an einer Kante vorbei → seitlich vorbeischieben statt anstoßen
    if (l !== r) {
      const sl = solidAt(l, ty), sr = solidAt(r, ty);
      if (sl && !sr && (l + 1) * T - this.x <= 7 && boxFree((l + 1) * T, this.y - 4, this.w, this.h)) { this.x = (l + 1) * T; return; }
      if (sr && !sl && this.x + this.w - r * T <= 7 && boxFree(r * T - this.w, this.y - 4, this.w, this.h)) { this.x = r * T - this.w; return; }
    }
    let tx = Math.floor(this.cx / T);
    if (!solidAt(tx, ty)) tx = solidAt(l, ty) ? l : r;
    this.vy = 30;
    this.jumpHold = 0;
    G.hitBlock(tx, ty, this);
  }

  // Zielsequenz: an der Fahnenstange runterrutschen, dann ins Haus laufen
  autoUpdate(dt) {
    const a = this.auto;
    this.inv = 0;
    if (a.phase === 'slide') {
      this.flagHold = true;
      this.vx = 0; this.vy = 0;
      this.y = Math.min(this.y + 340 * dt, a.bottom - this.h);
      if (this.y >= a.bottom - this.h - 0.5 && G.flag.clothY >= a.bottom - 46) {
        a.phase = 'walk'; a.t = 0;
        this.flagHold = false;
        this.x = a.poleX + 6;
        this.face = 1;
        this.vy = -260;
      }
      return;
    }
    if (a.phase === 'walk') {
      a.t += dt;
      this.vx = 150;
      this.vy = Math.min(this.vy + PHYS.GRAV * dt, PHYS.MAX_FALL);
      moveX(this, this.vx * dt);
      const was = this.onGround;
      this.onGround = false;
      if (moveY(this, this.vy * dt) === 1) { this.vy = 0; this.onGround = true; if (!was) G.dust(this.cx, this.y + this.h, 3, 0); }
      this.walkPhase += Math.abs(this.vx) * dt * 0.075;
      if (this.cx >= a.doorX || a.t > 6) { a.phase = 'in'; this.hidden = true; G.onEnteredHouse(); }
    }
  }
}

// ======================================================================================
class Fireball {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.w = 14; this.h = 14;
    this.vx = dir * 430; this.vy = 120; this.life = 2.5; this.remove = false;
  }
  update(dt) {
    this.life -= dt;
    this.vy = Math.min(this.vy + 1600 * dt, 700);
    if (moveX(this, this.vx * dt)) { this.poof(); return; }
    const hy = moveY(this, this.vy * dt);
    if (hy === 1) this.vy = -360;
    else if (hy === -1) this.vy = 50;
    if (this.life <= 0 || this.y > G.lvl.h * T || this.x < G.cam.x - 64 || this.x > G.cam.x + G.cam.w + 64) this.remove = true;
    if (touchesTile(this, TL.LAVA)) this.poof();
    if (Math.random() < 0.6) G.particle({ x: this.x + 7, y: this.y + 7, vx: 0, vy: -20, life: 0.25, size: 3, color: '#ffb02e', grav: 0 });
  }
  poof() {
    this.remove = true;
    for (let i = 0; i < 6; i++) G.particle({ x: this.x + 7, y: this.y + 7, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, life: 0.3, size: 3, color: '#ff8a2a', grav: 0 });
  }
}

// ======================================================================================
class Enemy {
  constructor(type, x, y, w, h) {
    this.type = type;
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.dir = -1;
    this.alive = true; this.remove = false; this.flipped = false; this.squashed = false;
    this.deadT = 0; this.spin = Math.PI; this.hitFlash = 0;
    this.stompable = true; this.spiky = false; this.rollKill = true; this.fireKill = true;
    this.starKill = true; this.shellKill = true; this.ghost = false;
    this.score = 100; this.onGround = false;
  }
  setH(h) { const b = this.y + this.h; this.h = h; this.y = b - h; }
  physics(dt, ledgeTurn) {
    this.vy = Math.min(this.vy + 2000 * dt, 900);
    const hx = moveX(this, this.vx * dt);
    if (hx) { this.vx = -this.vx; this.dir = -hx; if (this.onWall) this.onWall(hx); }
    this.onGround = false;
    const hy = moveY(this, this.vy * dt);
    if (hy === 1) { this.vy = 0; this.onGround = true; }
    else if (hy === -1) this.vy = 0;
    if (ledgeTurn && this.onGround && this.vx !== 0) {
      const fx = this.vx > 0 ? this.x + this.w + 1 : this.x - 1;
      if (!floorAt(Math.floor(fx / T), Math.floor((this.y + this.h + 2) / T))) { this.vx = -this.vx; }
    }
    if (this.vx) this.dir = sign(this.vx);
    if (touchesTile(this, TL.LAVA, 4)) { this.kill('flip'); }
    if (this.y > G.lvl.h * T + 80) this.remove = true;
  }
  update(dt) {}
  deadUpdate(dt) {
    if (this.flipped) {
      this.vy = Math.min(this.vy + 2000 * dt, 900);
      this.y += this.vy * dt; this.x += this.vx * dt;
      if (this.y > G.cam.y + G.cam.h + 120) this.remove = true;
    } else {
      this.deadT -= dt;
      if (this.deadT <= 0) this.remove = true;
    }
  }
  kill(how, dir = 0) {
    if (!this.alive) return;
    this.alive = false;
    if (how === 'squash') { this.squashed = true; this.deadT = 0.45; }
    else { this.flipped = true; this.vy = -430; this.vx = dir * 100; }
  }
  stomp() { this.kill('squash'); return 'stomp'; }
  onTouch(p) { p.hurt(); }
  onRoll(p) { if (!this.rollKill) return false; this.kill('flip', sign(p.vx) || p.face); return 'kill'; }
}

class Slime extends Enemy {
  constructor(x, y) { super('slime', x, y, 28, 24); this.vx = -55; }
  update(dt) { this.physics(dt, true); }
}

class Beetle extends Enemy {
  constructor(x, y) { super('beetle', x, y, 28, 28); this.vx = -50; this.shell = false; this.wake = 0; this.kickGrace = 0; this.score = 200; }
  update(dt) {
    this.kickGrace -= dt;
    if (this.shell) {
      if (this.vx === 0) {
        this.wake -= dt;
        if (this.wake <= 0) { this.shell = false; this.setH(28); this.vx = 50 * this.dir; }
      }
      this.physics(dt, false);
      if (this.vx !== 0) {
        for (const o of G.enemies) {
          if (o === this || !o.alive || !o.shellKill || !overlap(this, o)) continue;
          if (o.type === 'boss') { o.hurtBy(); this.kill('flip', -sign(this.vx)); break; }
          o.kill('flip', sign(this.vx));
          G.chainScore(this, o);
          Sound.play('kick');
          if (o.type === 'beetle' && o.shell) { this.kill('flip', -sign(this.vx)); break; }
        }
      }
    } else {
      this.physics(dt, true);
    }
  }
  onWall(hx) { if (this.shell) { Sound.play('shell'); G.hitBlockSide(this, hx); } }
  stomp(p) {
    if (!this.shell) { this.shell = true; this.setH(22); this.vx = 0; this.wake = 7; this.chain = 0; return 'stomp'; }
    if (this.vx !== 0) { this.vx = 0; this.wake = 7; return 'stomp'; }
    this.kick(p);
    return 'kick';
  }
  kick(p) {
    const d = p.cx < this.x + this.w / 2 ? 1 : -1;
    this.vx = d * 470; this.dir = d; this.kickGrace = 0.25; this.chain = 0;
    Sound.play('kick');
    G.popup(this.x + this.w / 2, this.y - 6, '400');
    G.addScore(400);
  }
  onTouch(p) {
    if (this.shell && this.vx === 0) { this.kick(p); return; }
    if (this.shell && this.kickGrace > 0) return;
    p.hurt();
  }
  onRoll(p) {
    if (this.shell && this.vx === 0) { this.kick(p); return 'kick'; }
    if (this.shell && this.kickGrace > 0) return 'kick';
    this.kill('flip', sign(p.vx) || p.face);
    return 'kill';
  }
}

class Hedgehog extends Enemy {
  constructor(x, y) {
    super('hedgehog', x, y, 30, 26);
    this.vx = -40; this.spiky = true; this.stompable = false; this.rollKill = false; this.score = 200;
  }
  update(dt) { this.physics(dt, true); }
}

class Bat extends Enemy {
  constructor(x, y, opts) {
    super('bat', x, y, 30, 22);
    this.x0 = x; this.y0 = y; this.range = (opts.range || 3) * T;
    this.t = Math.random() * 6; this.dive = 0; this.score = 200;
  }
  update(dt) {
    this.t += dt;
    const p = G.player;
    const near = !p.dead && Math.abs(p.cx - (this.x + this.w / 2)) < 160 && p.y > this.y0;
    this.dive = approach(this.dive, near ? clamp(p.y - this.y0, 0, 120) : 0, (near ? 110 : 60) * dt);
    const nx = this.x0 + Math.sin(this.t * 0.9) * this.range;
    this.dir = sign(nx - this.x) || this.dir;
    this.x = nx;
    this.y = this.y0 + this.dive + Math.sin(this.t * 3) * 12;
  }
  kill(how, dir) { super.kill('flip', dir); }
}

class Frog extends Enemy {
  constructor(x, y) { super('frog', x, y, 28, 26); this.wait = 0.8 + Math.random(); this.crouch = 0; this.score = 200; }
  update(dt) {
    if (this.onGround) {
      this.vx = approach(this.vx, 0, 2400 * dt);
      const p = G.player;
      this.dir = sign(p.cx - (this.x + this.w / 2)) || this.dir;
      this.wait -= dt;
      this.crouch = this.wait < 0.25 ? 1 : 0;
      if (this.wait <= 0) {
        const landX = this.x + this.w / 2 + this.dir * 80;
        const safe = floorAt(Math.floor(landX / T), Math.floor((this.y + this.h + 2) / T)) ||
                     floorAt(Math.floor(landX / T), Math.floor((this.y + this.h + 2) / T) + 1);
        if (Math.abs(p.cx - this.x) < 520 && safe) {
          this.vy = -560; this.vx = this.dir * 140; this.onGround = false;
          this.wait = 1.1 + Math.random() * 0.8;
        } else this.wait = 0.6;
      }
    }
    this.physics(dt, false);
  }
}

class Cannonball extends Enemy {
  constructor(x, y, d) {
    super('ball', x, y, 26, 26);
    this.vx = d * 190; this.dir = d; this.life = 7; this.score = 200;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.life -= dt;
    if (this.life <= 0) this.remove = true;
    if (Math.random() < 0.3) G.particle({ x: this.x + this.w / 2 - this.dir * 12, y: this.y + this.h / 2, vx: -this.dir * 30, vy: -10, life: 0.5, size: 5, color: 'rgba(200,200,210,0.6)', grav: -40 });
  }
}

class Lavaball extends Enemy {
  constructor(x, y, opts) {
    super('lavaball', x, y, 24, 28);
    this.baseY = y; this.height = (opts.height || 5) * T;
    this.timer = opts.delay || 0.3; this.inAir = false;
    this.stompable = false; this.spiky = true; this.rollKill = false; this.fireKill = false; this.shellKill = false;
    this.ghost = true; this.score = 200;
  }
  update(dt) {
    if (!this.inAir) {
      this.timer -= dt;
      this.y = this.baseY; this.ghost = true;
      if (this.timer <= 0) { this.inAir = true; this.vy = -Math.sqrt(2 * 1500 * this.height); G.splash(this.x + this.w / 2, this.baseY); }
      return;
    }
    this.ghost = false;
    this.vy += 1500 * dt;
    this.y += this.vy * dt;
    if (Math.random() < 0.5) G.particle({ x: this.x + this.w / 2 + (Math.random() - 0.5) * 10, y: this.y + this.h / 2, vx: 0, vy: 0, life: 0.35, size: 3, color: '#ff8a2a', grav: -60 });
    if (this.vy > 0 && this.y >= this.baseY) {
      this.y = this.baseY; this.vy = 0; this.inAir = false; this.timer = 1.4;
      G.splash(this.x + this.w / 2, this.baseY);
    }
  }
}

class Stomper extends Enemy {
  constructor(x, y) {
    super('stomper', x, y, 60, 56);
    this.y0 = y; this.state = 'idle'; this.t = 0;
    this.stompable = false; this.rollKill = false; this.fireKill = false; this.starKill = false; this.shellKill = false;
    this.solid = true; this.dx = 0; this.dy = 0; this.prevY = y;
    this.isPlatform = true;
  }
  update(dt) {
    const oy = this.y;
    this.prevY = oy;
    const p = G.player;
    switch (this.state) {
      case 'idle':
        if (!p.dead && p.x + p.w > this.x - 22 && p.x < this.x + this.w + 22 && p.y > this.y + this.h - 4 && Math.abs(p.cx - this.x) < 400) {
          this.state = 'shake'; this.t = 0.28;
        }
        break;
      case 'shake':
        this.t -= dt;
        if (this.t <= 0) { this.state = 'fall'; this.vy = 0; }
        break;
      case 'fall':
        this.vy = Math.min(this.vy + 2600 * dt, 1000);
        if (moveY(this, this.vy * dt, false) === 1) {
          this.state = 'wait'; this.t = 0.9;
          G.shake(6); Sound.play('thud');
          G.dust(this.x + 6, this.y + this.h, 4, -1); G.dust(this.x + this.w - 6, this.y + this.h, 4, 1);
        }
        break;
      case 'wait':
        this.t -= dt;
        if (this.t <= 0) this.state = 'rise';
        break;
      case 'rise':
        this.y = Math.max(this.y0, this.y - 110 * dt);
        if (this.y <= this.y0) this.state = 'idle';
        break;
    }
    this.shake = this.state === 'shake';
    this.dy = this.y - oy;
  }
  onTouch(p) {
    if (p.riding === this) return;
    if (overlap(inset(p, 3), { x: this.x + 2, y: this.y + 6, w: this.w - 4, h: this.h - 6 })) p.hurt();
  }
}

class Boss extends Enemy {
  constructor(x, y, opts) {
    super('boss', x, y, 96, 84);
    const a = opts.arena || [0, G.lvl.w - 1];
    this.arena = [a[0] * T, (a[1] + 1) * T];
    this.hp = 3; this.maxHp = 3; this.state = 'wait'; this.t = 1.2; this.awake = false;
    this.rollKill = false; this.fireKill = false; this.starKill = false; this.shellKill = true;
    this.fireHits = 0; this.jumps = 0; this.look = 0; this.squash = 0; this.score = 5000;
  }
  update(dt) {
    const p = G.player;
    if (!this.awake) {
      if (p.x > this.arena[0] + 3 * T) { this.awake = true; G.bossStart(this); }
      else { this.physics(dt, false); return; }
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.look = clamp((p.cx - this.x - this.w / 2) / 160, -1, 1);
    this.squash = approach(this.squash, 0, dt * 2.5);
    if (this.onGround) {
      this.vx = approach(this.vx, 0, 1800 * dt);
      this.t -= dt;
      if (this.t < 0.3) this.squash = Math.max(this.squash, 0.3);
      if (this.t <= 0 && !p.dead) {
        const dx = p.cx - (this.x + this.w / 2);
        this.vx = clamp(dx * 1.15, -320, 320);
        this.vy = -(680 + (this.maxHp - this.hp) * 70);
        this.onGround = false; this.state = 'jump'; this.squash = -0.35;
        Sound.play('jump');
      }
    }
    this.vy = Math.min(this.vy + 2100 * dt, 1000);
    moveX(this, this.vx * dt);
    if (this.x < this.arena[0]) { this.x = this.arena[0]; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x + this.w > this.arena[1]) { this.x = this.arena[1] - this.w; this.vx = -Math.abs(this.vx) * 0.3; }
    const wasAir = !this.onGround;
    this.onGround = false;
    if (moveY(this, this.vy * dt) === 1) {
      this.vy = 0; this.onGround = true;
      if (wasAir) this.land();
    }
  }
  land() {
    this.state = 'wait';
    this.t = 0.35 + this.hp * 0.28;
    this.squash = 0.55;
    this.jumps++;
    G.shake(8); Sound.play('thud');
    G.dust(this.x + 10, this.y + this.h, 6, -1); G.dust(this.x + this.w - 10, this.y + this.h, 6, 1);
    const slimes = G.enemies.filter((e) => e.type === 'slime' && e.alive).length;
    if (this.jumps % 2 === 0 && slimes < 3) {
      const d = G.player.cx < this.x + this.w / 2 ? -1 : 1;
      const s = new Slime(this.x + this.w / 2 - 14 + d * 30, this.y + this.h - 50);
      s.vx = d * 70; s.vy = -420;
      G.enemies.push(s);
    }
  }
  hurtBy() {
    if (this.hitFlash > 0 || !this.alive) return false;
    this.hp--;
    this.hitFlash = 1.3;
    this.fireHits = 0;
    Sound.play('bossHit');
    G.shake(7);
    if (this.hp <= 0) {
      this.kill('flip', 0);
      G.bossDefeated(this);
    } else {
      this.t = Math.min(this.t, 0.7);
    }
    return true;
  }
  stomp() {
    this.hurtBy();
    return 'boss';
  }
  fireHit() {
    if (this.hitFlash > 0) return;
    this.fireHits++;
    this.hitFlash = 0.08;
    if (this.fireHits >= 6) { this.hitFlash = 0; this.hurtBy(); }
  }
  onTouch(p) { if (this.hitFlash > 0.9) return; p.hurt(); }
  onRoll() { return false; }
}

// ======================================================================================
class Cannon {
  constructor(tx, ty) { this.tx = tx; this.ty = ty; this.timer = 1 + Math.random(); }
  update(dt) {
    const p = G.player;
    if (p.dead) return;
    const cx = this.tx * T + T / 2, cy = this.ty * T + T / 2;
    if (cx < G.cam.x - 64 || cx > G.cam.x + G.cam.w + 64) return;
    const dx = p.cx - cx;
    if (Math.abs(dx) < 80) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 2.8;
      const d = sign(dx);
      if (solidAt(this.tx + d, this.ty)) return;
      G.enemies.push(new Cannonball(cx + d * (T / 2 + 2) - 13 + d * 4, cy - 13, d));
      Sound.play('cannon');
      for (let i = 0; i < 8; i++) G.particle({ x: cx + d * 18, y: cy, vx: d * Math.random() * 120, vy: (Math.random() - 0.5) * 80, life: 0.5, size: 6, color: 'rgba(220,220,230,0.7)', grav: -60 });
    }
  }
}

// ======================================================================================
class Item {
  constructor(type, x, y, emerge) {
    this.type = type;
    this.x = x; this.y = y; this.w = 28; this.h = 28;
    this.vx = 0; this.vy = 0; this.dir = 1;
    this.emerge = emerge ? 0.55 : 0;
    this.remove = false; this.onGround = false;
  }
  get moving() { return this.type === 'mushroom' || this.type === 'heart' || this.type === 'boots' || this.type === 'star'; }
  update(dt) {
    if (this.emerge > 0) { this.emerge -= dt; this.y -= (T / 0.55) * dt; return; }
    if (!this.moving) return;
    const sp = this.type === 'star' ? 150 : 110;
    this.vx = this.dir * sp;
    this.vy = Math.min(this.vy + (this.type === 'star' ? 1500 : 2000) * dt, 800);
    if (moveX(this, this.vx * dt)) this.dir = -this.dir;
    const hy = moveY(this, this.vy * dt);
    if (hy === 1) this.vy = this.type === 'star' ? -540 : 0;
    else if (hy === -1) this.vy = 0;
    if (this.y > G.lvl.h * T + 40 || touchesTile(this, TL.LAVA)) this.remove = true;
  }
}

// ======================================================================================
class MovingPlatform {
  constructor(tx, ty, wTiles, opts) {
    this.kind = 'mplat';
    this.x0 = tx * T; this.y0 = ty * T;
    this.x = this.x0; this.y = this.y0; this.prevY = this.y0;
    this.w = wTiles * T; this.h = 16;
    this.ex = (opts.dx || 0) * T; this.ey = (opts.dy || 0) * T;
    const dist = Math.hypot(this.ex, this.ey) || 1;
    this.period = (2 * dist) / (opts.speed || 70);
    this.t = (opts.phase || 0) * this.period;
    this.dx = 0; this.dy = 0; this.solid = true;
  }
  update(dt) {
    this.t += dt;
    const u = (1 - Math.cos((this.t / this.period) * Math.PI * 2)) / 2;
    const nx = this.x0 + this.ex * u, ny = this.y0 + this.ey * u;
    this.dx = nx - this.x; this.dy = ny - this.y;
    this.prevY = this.y;
    this.x = nx; this.y = ny;
  }
}

class FallingPlatform {
  constructor(tx, ty, wTiles) {
    this.kind = 'fplat';
    this.x = tx * T; this.y0 = ty * T; this.y = this.y0; this.prevY = this.y0;
    this.w = wTiles * T; this.h = 16;
    this.state = 'idle'; this.t = 0; this.vy = 0;
    this.dx = 0; this.dy = 0; this.solid = true; this.alpha = 1;
  }
  onStand() { if (this.state === 'idle') { this.state = 'shake'; this.t = 0.45; } }
  update(dt) {
    const oy = this.y;
    this.prevY = oy;
    if (this.alpha < 1) this.alpha = Math.min(1, this.alpha + dt * 3);
    switch (this.state) {
      case 'shake':
        this.t -= dt;
        if (this.t <= 0) { this.state = 'fall'; this.vy = 0; }
        break;
      case 'fall':
        this.vy = Math.min(this.vy + 1800 * dt, 700);
        this.y += this.vy * dt;
        if (this.y > G.lvl.h * T + 40) { this.state = 'gone'; this.t = 2.5; this.solid = false; }
        break;
      case 'gone':
        this.t -= dt;
        if (this.t <= 0) { this.state = 'idle'; this.y = this.y0; this.solid = true; this.alpha = 0; }
        break;
    }
    this.dy = this.y - oy;
  }
}

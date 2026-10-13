'use strict';
// Spieler, Gegner, Gegenstände, Plattformen und Effekte.

const PHYS = {
  GRAV: 2100, GRAV_HOLD: 1150, HOLD_TIME: 0.34, MAX_FALL: 900,
  WALK: 200, RUN: 330, ROLL: 420, ROLL_TIME: 0.5, ROLL_CD: 0.22,
  ACC: 1700, ACC_AIR: 1100, DEC: 1900, ICE_ACC: 480, ICE_DEC: 150,
  JUMP: 550, JUMP_RUN_BONUS: 0.12, DJUMP: 500, SPRING: 950, STOMP: 430, STOMP_HOLD: 580,
  JUMP_BUF: 0.12, COYOTE: 0.1, AIR_ROLL_TIME: 0.42, AIR_ROLL_HOP: 180,
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
    this.rolling = 0; this.rollCD = 0; this.rollAngle = 0; this.airRolls = 1;
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

  startRoll(dir, air = false) {
    if (dir) this.face = dir;
    const oldH = this.h;
    this.setBox(22, 24);
    const sp = PHYS.ROLL * (this.boots > 0 ? 1.2 : 1);
    if (air) {
      // Luftrolle: Kugel bleibt auf Körpermitte, kurzer Schub nach vorn und ein kleiner Hüpfer
      this.airRolls--;
      this.rolling = PHYS.AIR_ROLL_TIME;
      const up = (oldH - this.h) / 2;
      if (boxFree(this.x, this.y - up, this.w, this.h)) this.y -= up;
      this.vx = this.face * Math.max(Math.abs(this.vx), sp * 0.95);
      this.vy = Math.min(this.vy, -PHYS.AIR_ROLL_HOP);
      this.jumpHold = 0;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        G.particle({ x: this.cx, y: this.y + this.h / 2, vx: Math.cos(a) * 120 - this.face * 60, vy: Math.sin(a) * 120, life: 0.3, size: 3, color: '#ffffff', grav: 0, shape: 'star' });
      }
    } else {
      this.rolling = PHYS.ROLL_TIME;
      this.vx = this.face * Math.max(Math.abs(this.vx), sp);
      G.dust(this.cx, this.y + this.h, 6, -this.face);
    }
    Sound.play('roll');
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
    this.onGround = false; this.riding = null; this.canDouble = true; this.airRolls = 1;
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
      if (this.rolling <= 0 && this.rollCD <= 0) {
        if (this.onGround) { this.rollBuf = 0; this.startRoll(dir); }
        else if (this.airRolls > 0) { this.rollBuf = 0; this.startRoll(dir, true); }
      }
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
    if (this.onGround) { this.coyote = PHYS.COYOTE; this.canDouble = true; this.airRolls = 1; }
    else this.coyote -= dt;
    if (this.jumpBuf > 0) {
      const fresh = this.jumpBuf > PHYS.JUMP_BUF - 0.02;
      this.jumpBuf -= dt;
      if (this.onGround || this.coyote > 0) this.jump();
      else if (fresh && this.feather > 0 && this.canDouble && (this.rolling <= 0 || this.canStand())) {
        if (this.rolling > 0) this.endRoll();
        this.doubleJump();
      }
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

// ---- Geschosse der Bosse ------------------------------------------------------------
const SHOT_SIZE = { stinger: [16, 16], snowball: [22, 22], icicle: [18, 30], flame: [34, 20] };

class Shot extends Enemy {
  // x, y = Mittelpunkt
  constructor(kind, x, y, vx, vy, opts = {}) {
    const [w, h] = SHOT_SIZE[kind] || [16, 16];
    super('shot', x - w / 2, y - h / 2, w, h);
    this.kind = kind; this.vx = vx; this.vy = vy;
    this.grav = opts.grav || 0; this.warn = opts.warn || 0; this.life = 6;
    this.stompable = false; this.spiky = true; this.rollKill = false; this.shellKill = false;
    this.fireKill = kind === 'snowball' || kind === 'stinger';
    this.dir = sign(vx) || 1;
    this.ghost = this.warn > 0;
  }
  update(dt) {
    if (this.warn > 0) {
      this.warn -= dt;
      this.ghost = this.warn > 0;
      return;
    }
    this.vy += this.grav * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.vx) this.dir = sign(this.vx);
    this.life -= dt;
    if (this.life <= 0 || this.y > G.lvl.h * T + 40) { this.remove = true; return; }
    const cx = this.x + this.w / 2;
    const probeY = this.kind === 'icicle' ? this.y + this.h - 2 : this.y + this.h / 2;
    if (solidAt(Math.floor(cx / T), Math.floor(probeY / T))) { this.kill(); return; }
    if (this.kind === 'flame' && Math.random() < 0.6) {
      G.particle({ x: cx - this.dir * 14, y: this.y + this.h / 2 + (Math.random() - 0.5) * 8, vx: -this.dir * 40, vy: -30, life: 0.3, size: 3, color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f', grav: -40 });
    }
  }
  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.remove = true;
    const col = { stinger: '#7ed957', snowball: '#ffffff', icicle: '#bfe8ff', flame: '#ff8a2a' }[this.kind];
    for (let i = 0; i < 8; i++) {
      G.particle({ x: this.x + this.w / 2, y: this.y + this.h / 2, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 220, life: 0.5, size: 3 + Math.random() * 2, color: col, grav: 900, shape: this.kind === 'icicle' ? 'sq' : 'c' });
    }
  }
}

// ---- Bosse ------------------------------------------------------------------------
// Jeder Boss wohnt in einer Arena (arena = [linker Rand, rechter Rand] in Pixeln), wacht auf, sobald der Spieler
// hineinläuft, und braucht drei Treffer (draufspringen, Panzer oder sechs Feuerbälle).
class BossBase extends Enemy {
  constructor(kind, cx, bottom, w, h, opts, name) {
    super('boss', cx - w / 2, bottom - h, w, h);
    this.kind = kind; this.name = name;
    const a = opts.arena || [0, G.lvl.w - 1];
    this.arena = [a[0] * T, (a[1] + 1) * T];
    this.hp = 3; this.maxHp = 3;
    this.awake = false; this.state = 'sleep'; this.t = 0;
    this.rollKill = false; this.fireKill = false; this.starKill = false; this.shellKill = true; this.rollHit = false;
    this.fireHits = 0; this.look = 0; this.squash = 0; this.score = 5000; this.dir = -1; this.hitWall = 0;
    this.groundY = G.lvl.gy * T;
  }
  get cx() { return this.x + this.w / 2; }
  get rage() { return this.maxHp - this.hp; } // 0, 1, 2 – wird mit jedem Treffer wilder
  get mid() { return (this.arena[0] + this.arena[1]) / 2; }

  update(dt) {
    const p = G.player;
    if (!this.awake) {
      if (!p.dead && p.x > this.arena[0] + 3 * T) { this.awake = true; G.bossStart(this); this.start(p); }
      else { this.sleep(dt); return; }
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.look = clamp((p.cx - this.cx) / 160, -1, 1);
    this.squash = approach(this.squash, 0, dt * 2.5);
    this.t -= dt;
    this.think(dt, p);
  }
  sleep(dt) { this.fall(dt); }
  start() {}
  think() {}

  // Schwerkraft und Bewegung in der Arena; gibt true zurück, wenn der Boss gerade gelandet ist
  fall(dt, g = 2100) {
    this.vy = Math.min(this.vy + g * dt, 1000);
    moveX(this, this.vx * dt);
    this.hitWall = 0;
    if (this.x <= this.arena[0]) { this.x = this.arena[0]; this.hitWall = -1; }
    if (this.x + this.w >= this.arena[1]) { this.x = this.arena[1] - this.w; this.hitWall = 1; }
    const was = this.onGround;
    this.onGround = false;
    if (moveY(this, this.vy * dt) === 1) { this.vy = 0; this.onGround = true; return !was; }
    return false;
  }
  landFx(m = 8) {
    G.shake(m);
    Sound.play('thud');
    G.dust(this.x + 10, this.y + this.h, 6, -1);
    G.dust(this.x + this.w - 10, this.y + this.h, 6, 1);
  }

  hurtBy() {
    if (this.hitFlash > 0 || !this.alive || this.ghost) return false;
    this.hp--;
    this.hitFlash = 1.3;
    this.fireHits = 0;
    Sound.play('bossHit');
    G.shake(7);
    if (this.hp <= 0) { this.kill('flip', 0); G.bossDefeated(this); }
    else this.onHurt();
    return true;
  }
  onHurt() {}
  stomp() { this.hurtBy(); return 'boss'; }
  fireHit() {
    if (this.hitFlash > 0) return;
    this.fireHits++;
    this.hitFlash = 0.08;
    if (this.fireHits >= 6) { this.hitFlash = 0; this.hurtBy(); }
  }
  onTouch(p) { if (this.hitFlash > 0.9) return; p.hurt(); }
  onRoll() { return this.rollHit && this.hurtBy() ? 'boss' : false; }
}

// Welt 6: König Matsch – springt dem Spieler hinterher und ruft kleine Schleimis
class SlimeBoss extends BossBase {
  constructor(cx, bottom, opts) { super('slime', cx, bottom, 96, 84, opts, 'König Matsch'); this.jumps = 0; }
  start() { this.state = 'wait'; this.t = 1.0; }
  think(dt, p) {
    if (this.onGround) {
      this.vx = approach(this.vx, 0, 1800 * dt);
      if (this.t < 0.3) this.squash = Math.max(this.squash, 0.3);
      if (this.t <= 0 && !p.dead) {
        this.vx = clamp((p.cx - this.cx) * 1.15, -320, 320);
        this.vy = -(680 + this.rage * 70);
        this.onGround = false; this.state = 'jump'; this.squash = -0.35;
        Sound.play('jump');
      }
    }
    if (this.fall(dt)) this.land();
  }
  land() {
    this.state = 'wait';
    this.t = 0.35 + this.hp * 0.28;
    this.squash = 0.55;
    this.jumps++;
    this.landFx(8);
    const slimes = G.enemies.filter((e) => e.type === 'slime' && e.alive).length;
    if (this.jumps % 2 === 0 && slimes < 3) {
      const d = G.player.cx < this.cx ? -1 : 1;
      const s = new Slime(this.cx - 14 + d * 30, this.y + this.h - 50);
      s.vx = d * 70; s.vy = -420;
      G.enemies.push(s);
    }
  }
  onHurt() { this.t = Math.min(this.t, 0.7); }
}

// Welt 1: Maulwurf Buddel – gräbt sich ein, wühlt sich zum Spieler und springt heraus
class MoleBoss extends BossBase {
  constructor(cx, bottom, opts) { super('mole', cx, bottom, 72, 60, opts, 'Maulwurf Buddel'); this.hide = 0; }
  start() { this.state = 'stand'; this.t = 1.2; }
  think(dt, p) {
    switch (this.state) {
      case 'stand':
        this.vx = 0; this.ghost = false;
        if (this.t <= 0) { this.state = 'dig'; this.t = 0.55; Sound.play('roll'); }
        break;
      case 'dig':
        this.hide = Math.min(1, this.hide + dt * 2);
        this.ghost = this.hide > 0.5;
        if (Math.random() < 0.5) this.dirt(2);
        if (this.t <= 0) { this.state = 'under'; this.hide = 1; this.ghost = true; this.t = 0.9 + this.hp * 0.35; }
        break;
      case 'under': {
        const sp = (150 + this.rage * 70) * dt;
        this.x = clamp(this.x + clamp(p.cx - this.cx, -sp, sp), this.arena[0], this.arena[1] - this.w);
        if (Math.random() < 0.3) this.dirt(1);
        if (this.t <= 0) { this.state = 'warn'; this.t = 0.5; }
        break;
      }
      case 'warn':
        if (Math.random() < 0.6) this.dirt(1);
        if (this.t <= 0) {
          this.state = 'pop'; this.hide = 0; this.ghost = false;
          this.vy = -640; this.onGround = false; this.squash = -0.3;
          this.dirt(14); Sound.play('brick'); G.shake(4);
        }
        break;
    }
    this.dir = sign(p.cx - this.cx) || this.dir;
    if (this.state !== 'under' && this.state !== 'warn') {
      if (this.fall(dt) && this.state === 'pop') {
        this.state = 'stand'; this.t = 1.5 - this.rage * 0.25; this.squash = 0.4; this.landFx(4);
      }
    }
  }
  dirt(n) {
    for (let i = 0; i < n; i++) {
      G.particle({ x: this.cx + (Math.random() - 0.5) * this.w, y: this.groundY - 2, vx: (Math.random() - 0.5) * 160, vy: -100 - Math.random() * 220, life: 0.6, size: 3 + Math.random() * 3, color: Math.random() < 0.5 ? '#7e5130' : '#a8703f', grav: 900, shape: 'sq' });
    }
  }
  onHurt() { this.state = 'dig'; this.t = 0.7; }
}

// Welt 2: Gräfin Flatter – kreist oben, stürzt sich im Bogen herab und ruht danach kurz in Sprunghöhe
class BatBoss extends BossBase {
  constructor(cx, bottom, opts) {
    super('bat', cx, bottom, 84, 54, opts, 'Gräfin Flatter');
    this.rollHit = true; // die Luftrolle trifft sie
    this.homeY = this.groundY - 8 * T;
    this.y = this.homeY;
  }
  get restY() { return this.groundY - 3.5 * T - this.h; }
  sleep() { this.y = this.homeY + Math.sin(G.time * 2) * 10; }
  start() { this.state = 'hover'; this.t = 1.0; }
  think(dt, p) {
    switch (this.state) {
      case 'hover': {
        const tx = clamp(p.cx - this.w / 2 + Math.sin(G.time * 1.3) * 140, this.arena[0], this.arena[1] - this.w);
        this.x = approach(this.x, tx, (170 + this.rage * 40) * dt);
        this.y = approach(this.y, this.homeY + Math.sin(G.time * 3) * 14, 160 * dt);
        if (this.t <= 0) { this.state = 'aim'; this.t = 0.5; this.tx = p.cx; Sound.play('screech'); }
        break;
      }
      case 'aim':
        if (this.t <= 0) {
          this.state = 'swoop'; this.u = 0; this.dur = 1.25 - this.rage * 0.15;
          this.sx = this.x; this.sy = this.y;
          this.ex = clamp(this.x + (this.tx - this.cx) * 2, this.arena[0], this.arena[1] - this.w);
        }
        break;
      case 'swoop': {
        this.u = Math.min(1, this.u + dt / this.dur);
        const ox = this.x;
        const low = this.groundY - this.h - 6;
        const base = lerp(this.sy, this.restY, this.u);
        this.x = lerp(this.sx, this.ex, this.u);
        this.y = base + (low - lerp(this.sy, this.restY, 0.5)) * Math.sin(Math.PI * this.u);
        this.dir = sign(this.x - ox) || this.dir;
        if (this.u >= 1) { this.state = 'rest'; this.t = 1.2 - this.rage * 0.2; }
        break;
      }
      case 'rest':
        this.y = this.restY + Math.sin(G.time * 5) * 4;
        if (this.t <= 0) { this.state = 'hover'; this.t = 1.8 - this.rage * 0.3; this.spawnMinion(); }
        break;
    }
    if (this.state !== 'swoop') this.dir = sign(p.cx - this.cx) || this.dir;
  }
  spawnMinion() {
    if (this.rage < 1) return;
    if (G.enemies.filter((e) => e.type === 'bat' && e.alive).length >= 2) return;
    G.enemies.push(new Bat(this.cx - 15, this.homeY + 2 * T, { range: 4 }));
  }
  onHurt() { this.state = 'hover'; this.t = 1.6; }
}

// Welt 3: Skorpion Skorpi – läuft, schießt Stacheln im Bogen und rammt gegen die Wand
class ScorpionBoss extends BossBase {
  constructor(cx, bottom, opts) { super('scorpion', cx, bottom, 104, 54, opts, 'Skorpion Skorpi'); this.cycle = 0; this.tail = 0; }
  start() { this.state = 'walk'; this.t = 1.4; }
  think(dt, p) {
    const toward = sign(p.cx - this.cx) || this.dir;
    this.tail = approach(this.tail, this.state === 'aim' ? 1 : 0, dt * 4);
    this.shake = false;
    switch (this.state) {
      case 'walk':
        this.dir = toward;
        this.vx = approach(this.vx, this.dir * (90 + this.rage * 35), 700 * dt);
        if (this.t <= 0) {
          this.cycle++;
          if (this.cycle % 3 === 0) { this.state = 'wind'; this.t = 0.6; } else { this.state = 'aim'; this.t = 0.55; }
        }
        break;
      case 'aim':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.dir = toward;
        if (this.t <= 0) { this.shoot(); this.state = 'walk'; this.t = 1.7 - this.rage * 0.25; }
        break;
      case 'wind':
        this.vx = 0; this.dir = toward; this.shake = true;
        if (this.t <= 0) { this.state = 'charge'; this.vx = this.dir * (400 + this.rage * 60); Sound.play('kick'); }
        break;
      case 'charge':
        if (Math.random() < 0.5) G.dust(this.cx - this.dir * 40, this.y + this.h, 1, -this.dir);
        if (this.hitWall === this.dir) { this.state = 'dazed'; this.t = 1.4; this.vx = -this.dir * 120; this.vy = -250; this.landFx(7); }
        break;
      case 'dazed':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.t <= 0) { this.state = 'walk'; this.t = 1.4; }
        break;
    }
    this.fall(dt);
  }
  shoot() {
    const n = 3 + this.rage;
    const tipX = this.cx + this.dir * 10, tipY = this.y - 26;
    for (let i = 0; i < n; i++) {
      G.enemies.push(new Shot('stinger', tipX, tipY, this.dir * (140 + i * 85), -560 + i * 30, { grav: 1100 }));
    }
    Sound.play('fire');
  }
  onHurt() { if (this.state === 'charge') { this.state = 'dazed'; this.t = 1; this.vx = 0; } }
}

// Welt 4: Yeti Frosti – wirft Schneebälle; nach jedem großen Sprung fallen Eiszapfen von oben
class YetiBoss extends BossBase {
  constructor(cx, bottom, opts) { super('yeti', cx, bottom, 84, 90, opts, 'Yeti Frosti'); this.cycle = 0; this.arm = 0; this.throws = 0; }
  start() { this.state = 'walk'; this.t = 1.2; }
  think(dt, p) {
    const toward = sign(p.cx - this.cx) || this.dir;
    this.arm = approach(this.arm, this.state === 'throw' ? 1 : 0, dt * 5);
    switch (this.state) {
      case 'walk':
        this.dir = toward;
        this.vx = approach(this.vx, this.dir * (70 + this.rage * 25), 500 * dt);
        if (this.t <= 0) {
          this.cycle++;
          if (this.cycle % 2) { this.state = 'throw'; this.t = 0.55; this.throws = 1 + this.rage; }
          else { this.state = 'crouch'; this.t = 0.4; }
        }
        break;
      case 'throw':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.dir = toward;
        if (this.t <= 0) {
          this.throwBall(p);
          this.throws--;
          if (this.throws > 0) this.t = 0.45; else { this.state = 'walk'; this.t = 1.6 - this.rage * 0.2; }
        }
        break;
      case 'crouch':
        this.vx = 0;
        this.squash = Math.max(this.squash, 0.3);
        if (this.t <= 0) {
          this.state = 'air'; this.vy = -820; this.onGround = false; this.squash = -0.3;
          this.vx = clamp((p.cx - this.cx) * 1.1, -340, 340);
          Sound.play('jump');
        }
        break;
    }
    if (this.fall(dt) && this.state === 'air') {
      this.state = 'walk'; this.t = 1.7; this.squash = 0.5;
      this.landFx(10);
      this.icicles(p);
    }
  }
  throwBall(p) {
    const sx = this.cx + this.dir * 30, sy = this.y + 10;
    const tt = 0.85, g = 1100;
    const vx = clamp((p.cx - sx) / tt, -460, 460);
    const vy = (p.y + p.h / 2 - sy - 0.5 * g * tt * tt) / tt;
    G.enemies.push(new Shot('snowball', sx, sy, vx, vy, { grav: g }));
    Sound.play('kick');
  }
  icicles(p) {
    const n = 3 + this.rage;
    const top = Math.max(0, G.cam.y) + 20;
    const used = [];
    for (let i = 0; i < n; i++) {
      let x = clamp(p.cx + (Math.random() - 0.5) * 60, this.arena[0] + 20, this.arena[1] - 20); // der erste zielt auf den Spieler
      if (i > 0) {
        for (let k = 0; k < 12; k++) {
          x = this.arena[0] + 24 + Math.random() * (this.arena[1] - this.arena[0] - 48);
          if (used.every((u) => Math.abs(u - x) > 80)) break;
        }
      }
      used.push(x);
      G.enemies.push(new Shot('icicle', x, top, 0, 0, { grav: 1300, warn: 0.75 + i * 0.15 }));
    }
  }
}

// Welt 5: Drache Glutzahn – speit hohes und tiefes Feuer und springt dann auf die andere Seite
class DragonBoss extends BossBase {
  constructor(cx, bottom, opts) { super('dragon', cx, bottom, 112, 92, opts, 'Drache Glutzahn'); this.mouth = 0; this.headDip = 0; this.high = true; this.shots = 0; }
  start() { this.state = 'idle'; this.t = 1.0; }
  think(dt, p) {
    this.mouth = approach(this.mouth, 0, dt * 4);
    if (this.state !== 'air') this.dir = sign(p.cx - this.cx) || this.dir;
    if (Math.random() < 0.05) G.particle({ x: this.cx + this.dir * 70, y: this.y + 18 + this.headDip * 34, vx: this.dir * 20, vy: -40, life: 0.8, size: 4, color: 'rgba(120,110,110,0.5)', grav: -20 });
    switch (this.state) {
      case 'idle':
        this.vx = approach(this.vx, 0, 1500 * dt);
        this.headDip = approach(this.headDip, 0, dt * 5);
        if (this.t <= 0) { this.state = 'breathe'; this.shots = 3 + this.rage; this.t = 0.5; this.high = Math.random() < 0.5; }
        break;
      case 'breathe':
        this.vx = 0;
        this.headDip = approach(this.headDip, this.high ? 0 : 1, dt * 5);
        if (this.t <= 0) {
          // hoher Feuerstoß trifft Stehende, aber nicht Rollende; tiefer trifft beide
          const y = this.high ? this.groundY - 38 : this.groundY - 12;
          G.enemies.push(new Shot('flame', this.cx + this.dir * 62, y, this.dir * (270 + this.rage * 40), 0));
          this.mouth = 1;
          Sound.play('fire');
          this.shots--;
          this.high = Math.random() < 0.5;
          this.t = 0.75 - this.rage * 0.12;
          if (this.shots <= 0) { this.state = 'wind'; this.t = 0.6; }
        }
        break;
      case 'wind':
        this.headDip = approach(this.headDip, 0, dt * 5);
        this.squash = Math.max(this.squash, 0.25);
        if (this.t <= 0) this.hop();
        break;
    }
    if (this.fall(dt) && this.state === 'air') {
      this.state = 'idle'; this.t = 1.1 - this.rage * 0.2; this.squash = 0.5;
      this.landFx(10);
    }
  }
  hop() {
    const target = this.cx > this.mid ? this.arena[0] + T : this.arena[1] - T - this.w;
    const tt = 1.0;
    this.vx = (target - this.x) / tt;
    this.vy = -0.5 * 2100 * tt;
    this.onGround = false; this.state = 'air'; this.squash = -0.3;
    this.dir = sign(this.vx) || this.dir;
    Sound.play('jump');
  }
  onHurt() { if (this.state !== 'air') { this.state = 'wind'; this.t = 0.3; } }
}

const BOSS_TYPES = { slime: SlimeBoss, mole: MoleBoss, bat: BatBoss, scorpion: ScorpionBoss, yeti: YetiBoss, dragon: DragonBoss };

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

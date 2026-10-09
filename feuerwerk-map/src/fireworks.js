// Feuerwerks-Logik: Mörser/Raketen, Aufbruch-Muster, Bodenfeuerwerk, Böller und die große Show.
import * as THREE from 'three';
import { KIND, FLAG } from './particles.js';
import { boxLabel } from './textures.js';

const G = 9.81;
const rnd = Math.random;
const rr = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[(rnd() * arr.length) | 0];

// Farben (linear, HDR-tauglich)
export const PAL = {
  red: [1.0, 0.09, 0.05],
  orange: [1.0, 0.4, 0.05],
  gold: [1.0, 0.66, 0.16],
  yellow: [1.0, 0.88, 0.18],
  lime: [0.55, 1.0, 0.14],
  green: [0.1, 1.0, 0.22],
  cyan: [0.08, 0.82, 1.0],
  blue: [0.1, 0.28, 1.0],
  violet: [0.6, 0.18, 1.0],
  pink: [1.0, 0.18, 0.55],
  white: [1.0, 0.94, 0.86],
  silver: [0.82, 0.9, 1.0],
};
const SETS = [
  ['red', 'gold'], ['green', 'white'], ['blue', 'cyan'], ['violet', 'pink'], ['orange', 'yellow'],
  ['red', 'white', 'blue'], ['pink', 'lime'], ['gold', 'white'], ['cyan', 'violet'], ['green', 'yellow'],
];
const pickColors = () => pick(SETS);

// Entfernung, die ein Stern mit Luftwiderstand bis zum Verglühen zurücklegt, ergibt die Startgeschwindigkeit
const speedFor = (R, drag, life) => (R * drag) / (1 - Math.exp(-drag * life));

function fibSphere(n) {
  const out = [];
  const off = rnd() * 6.283;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n + (rnd() - 0.5) * 0.05;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * 2.399963 + off + (rnd() - 0.5) * 0.08;
    out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return out;
}

export const ITEMS = {
  rocket: { label: 'Rakete', icon: '🚀' },
  battery: { label: 'Batterie', icon: '🎆' },
  fountain: { label: 'Fontäne', icon: '⛲' },
  volcano: { label: 'Vulkan', icon: '🌋' },
  candle: { label: 'Römische Kerze', icon: '🕯️' },
  banger: { label: 'Böller', icon: '💥' },
  chain: { label: 'Böllerkette', icon: '🧨' },
  bomb: { label: 'Kugelbombe', icon: '💣' },
  sparkler: { label: 'Wunderkerze', icon: '✨' },
};

// Aufbruch-Muster. R = Radius der Kugel bei scale 1 (≈ 6"-Schale)
const TYPES = {
  peony: {
    label: 'Päonie', R: 44,
    fn(P) {
      const life = 2.5, drag = 1.5, sp = speedFor(P.R, drag, life);
      const n = this.cnt(150, P);
      for (const d of fibSphere(n)) {
        this.star(P, d, sp * rr(0.96, 1.04), P.c1, { drag, grav: 0.32, bright: 2.1, fadeStart: 0.6, flags: FLAG.EMBER }, life * rr(0.9, 1.1));
      }
      if (P.cols.length > 1) {
        const sp2 = speedFor(P.R * 0.5, drag, life);
        for (const d of fibSphere(this.cnt(70, P))) {
          this.star(P, d, sp2, P.c2, { drag, grav: 0.32, bright: 2.1, fadeStart: 0.6 }, life);
        }
      }
    },
  },
  chrys: {
    label: 'Chrysantheme', R: 50,
    fn(P) {
      const life = 3.0, drag = 1.3, sp = speedFor(P.R, drag, life);
      for (const d of fibSphere(this.cnt(130, P))) {
        this.star(P, d, sp * rr(0.97, 1.03), P.c1,
          { drag, grav: 0.34, bright: 1.9, fadeStart: 0.55, flags: FLAG.EMBER, trailRate: 26 * this.density, trailLife: 0.95 }, life * rr(0.92, 1.08));
      }
    },
  },
  willow: {
    label: 'Trauerweide', R: 36,
    fn(P) {
      const life = 5.4, drag = 1.9, sp = speedFor(P.R, drag, life);
      const gold = PAL.gold;
      for (const d of fibSphere(this.cnt(115, P))) {
        this.star(P, d, sp * rr(0.95, 1.05), P.cols[0] === 'silver' ? PAL.silver : gold,
          { drag, grav: 0.52, bright: 1.5, fadeStart: 0.55, flags: FLAG.EMBER, trailRate: 36 * this.density, trailLife: 1.9, trailSize: 0.9 }, life * rr(0.9, 1.1));
      }
    },
  },
  palm: {
    label: 'Palme', R: 55,
    fn(P) {
      const arms = 9 + ((rnd() * 3) | 0);
      const life = 3.3, drag = 1.0, sp = speedFor(P.R, drag, life);
      const off = rnd() * 6.283;
      for (let i = 0; i < arms; i++) {
        const az = off + (i / arms) * 6.283 + rr(-0.12, 0.12);
        const el = rr(0.2, 0.62);
        const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
        this.star(P, d, sp * rr(0.92, 1.05), PAL.gold,
          { drag, grav: 0.55, bright: 2.4, fadeStart: 0.6, flags: FLAG.EMBER, trailRate: 70 * this.density, trailLife: 1.15, trailSize: 1.5 }, life, 1.7);
      }
      // Funkenkranz in der Mitte
      const sp2 = speedFor(P.R * 0.35, 1.6, 2.0);
      for (const d of fibSphere(this.cnt(40, P))) {
        this.star(P, d, sp2, P.c1, { drag: 1.6, grav: 0.3, bright: 2.0, fadeStart: 0.55, flags: FLAG.TWINKLE }, 2.0);
      }
    },
  },
  ring: {
    label: 'Ring', R: 40,
    fn(P) {
      const life = 2.5, drag = 1.5, sp = speedFor(P.R, drag, life);
      const n = this.cnt(70, P);
      const { u, v } = this.facingBasis(P, rr(0, 0.9));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283;
        const d = [u.x * Math.cos(a) + v.x * Math.sin(a), u.y * Math.cos(a) + v.y * Math.sin(a), u.z * Math.cos(a) + v.z * Math.sin(a)];
        this.star(P, d, sp, P.c1, { drag, grav: 0.3, bright: 2.2, fadeStart: 0.6, flags: FLAG.EMBER }, life);
      }
      const sp2 = speedFor(P.R * 0.28, drag, life);
      for (const d of fibSphere(this.cnt(26, P))) this.star(P, d, sp2, P.c2, { drag, grav: 0.3, bright: 2.0, fadeStart: 0.6 }, life);
    },
  },
  saturn: {
    label: 'Saturn', R: 42,
    fn(P) {
      const life = 2.6, drag = 1.5, sp = speedFor(P.R * 0.6, drag, life);
      for (const d of fibSphere(this.cnt(80, P))) this.star(P, d, sp, P.c1, { drag, grav: 0.3, bright: 2.1, fadeStart: 0.6 }, life);
      const { u, v } = this.facingBasis(P, rr(0.2, 0.5));
      const sp2 = speedFor(P.R * 1.15, drag, life);
      const n = this.cnt(70, P);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283;
        const d = [u.x * Math.cos(a) + v.x * Math.sin(a), u.y * Math.cos(a) + v.y * Math.sin(a), u.z * Math.cos(a) + v.z * Math.sin(a)];
        this.star(P, d, sp2, P.c2, { drag, grav: 0.3, bright: 2.2, fadeStart: 0.6 }, life);
      }
    },
  },
  heart: {
    label: 'Herz', R: 40,
    fn(P) {
      const life = 2.6, drag = 1.5, sp = speedFor(P.R, drag, life) / 17;
      const n = this.cnt(90, P);
      const right = this.camRight();
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 6.283;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 1.5;
        const d = [right.x * x, y, right.z * x];
        this.starRaw(P, d[0] * sp, d[1] * sp, d[2] * sp, PAL.red, { drag, grav: 0.3, bright: 2.4, fadeStart: 0.62, flags: FLAG.EMBER }, life);
      }
      for (let i = 0; i < this.cnt(30, P); i++) {
        const t = rnd() * 6.283, k = Math.sqrt(rnd()) * 0.75;
        const x = 16 * Math.pow(Math.sin(t), 3) * k;
        const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 1.5) * k;
        this.starRaw(P, right.x * x * sp, y * sp, right.z * x * sp, PAL.pink, { drag, grav: 0.3, bright: 2.0, fadeStart: 0.6 }, life);
      }
    },
  },
  crossette: {
    label: 'Kreuzer', R: 36,
    fn(P) {
      const life = 1.15, drag = 1.2, sp = speedFor(P.R * 0.85, drag, life);
      for (const d of fibSphere(this.cnt(30, P))) {
        this.star(P, d, sp, P.c1, { drag, grav: 0.3, bright: 2.2, fadeStart: 0.85, flags: FLAG.SPLIT, trailRate: 30, trailLife: 0.5 }, life);
      }
    },
  },
  crackle: {
    label: 'Brokat-Crackle', R: 46,
    fn(P) {
      const life = 2.3, drag = 1.4, sp = speedFor(P.R, drag, life);
      for (const d of fibSphere(this.cnt(95, P))) {
        this.star(P, d, sp * rr(0.95, 1.05), PAL.gold,
          { drag, grav: 0.4, bright: 1.9, fadeStart: 0.6, flags: FLAG.CRACKLE | FLAG.EMBER, trailRate: 18 * this.density, trailLife: 0.8 }, life * rr(0.85, 1.15));
      }
    },
  },
  strobe: {
    label: 'Blinker', R: 40,
    fn(P) {
      const life = 3.4, drag = 1.3, sp = speedFor(P.R, drag, life);
      for (const d of fibSphere(this.cnt(90, P))) {
        this.star(P, d, sp * rr(0.95, 1.05), rnd() < 0.5 ? PAL.white : PAL.silver,
          { drag, grav: 0.3, bright: 2.2, fadeStart: 0.8, flags: FLAG.STROBE, strobeRate: rr(6, 11) }, life * rr(0.85, 1.1), 1.1);
      }
    },
  },
  pop: {
    label: 'Kugel', R: 4,
    fn(P) {
      const life = 0.9, drag = 1.8, sp = speedFor(P.R, drag, life);
      for (const d of fibSphere(this.cnt(22, P))) this.star(P, d, sp, P.c1, { drag, grav: 0.4, bright: 2.2, fadeStart: 0.5 }, life, 0.5);
    },
  },
};
export const SHELL_TYPES = Object.keys(TYPES).filter((k) => k !== 'pop');

export class Fireworks {
  constructor({ scene, camera, glow, smoke, sound }) {
    this.scene = scene;
    this.camera = camera;
    this.glow = glow;
    this.smoke = smoke;
    this.sound = sound;
    this.time = 0;
    this.queue = [];
    this.shells = [];
    this.flashes = [];
    this.items = [];
    this.wind = new THREE.Vector3(1.2, 0, 0.3);
    this.density = 1;
    this.smokeScale = 1;
    this.mortars = [{ x: 0, y: 1.5, z: -210 }];
    this.bargeSpan = 28;
    this.show = null;
    this.crackleTimer = 0;
    this.lights = [];
    this.lp = [];
    this.lc = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 0, 2);
      scene.add(l);
      this.lights.push(l);
      this.lp.push(new THREE.Vector4(0, -999, 0, 1));
      this.lc.push(new THREE.Vector3());
    }
    this.itemGroup = new THREE.Group();
    scene.add(this.itemGroup);
    this._tmp = new THREE.Vector3();
  }

  // ---------- Hilfen ----------
  later(sec, fn) {
    this.queue.push({ t: this.time + sec, fn });
  }

  cnt(n, P) {
    return Math.max(12, Math.round(n * (0.4 + 0.6 * Math.min(1, P.scale)) * this.density));
  }

  distTo(x, y, z) {
    return this.camera.position.distanceTo(this._tmp.set(x, y, z));
  }

  panTo(x, y, z) {
    const r = this.camRight();
    const dx = x - this.camera.position.x, dz = z - this.camera.position.z;
    const l = Math.hypot(dx, dz) || 1;
    return Math.max(-1, Math.min(1, ((dx * r.x + dz * r.z) / l) * 0.9));
  }

  camRight() {
    const e = this.camera.matrixWorld.elements;
    const l = Math.hypot(e[0], e[2]) || 1;
    return { x: e[0] / l, z: e[2] / l };
  }

  // Zwei Achsen senkrecht zur Blickrichtung (Ringe/Saturn stehen mehr oder weniger zum Betrachter)
  facingBasis(P, tilt) {
    const cam = this.camera.position;
    const n = new THREE.Vector3(cam.x - P.x, 0, cam.z - P.z).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(up, n).normalize();
    // Kippen um die u-Achse
    const nT = n.clone().applyAxisAngle(u, tilt * (rnd() < 0.5 ? 1 : -1)).normalize();
    const v = new THREE.Vector3().crossVectors(nT, u).normalize();
    const ang = rnd() * 0.5 - 0.25;
    u.applyAxisAngle(nT, ang);
    v.applyAxisAngle(nT, ang);
    return { u, v };
  }

  star(P, d, speed, color, o, life, sizeMul = 1) {
    this.starRaw(P, d[0] * speed, d[1] * speed, d[2] * speed, color, o, life, sizeMul);
  }

  starRaw(P, vx, vy, vz, color, o, life, sizeMul = 1) {
    if (o.flags & FLAG.CHANGE) {
      o.r2 = P.c2[0]; o.g2 = P.c2[1]; o.b2 = P.c2[2];
    }
    this.glow.spawn(KIND.STAR, P.x, P.y, P.z, vx + P.vel.x * 0.3, vy + P.vel.y * 0.1, vz + P.vel.z * 0.3,
      color[0], color[1], color[2], life, P.starSize * sizeMul, o);
  }

  // ls = Lichtstärke-Faktor für die echte PointLight (nahe Quellen brauchen sehr wenig, sonst überbelichtet 1/d²)
  addFlash(x, y, z, col, e0, rad, tau1 = 0.25, tau2 = 1.3, sus = 0.25, ls = 1) {
    if (this.flashes.length > 40) this.flashes.shift();
    this.flashes.push({ x, y, z, r: col[0], g: col[1], b: col[2], e: e0, e0, rad, tau1, tau2, sus, age: 0, ls });
  }

  // ---------- Schalen ----------
  muzzle(x, y, z, s) {
    const g = this.glow;
    g.spawn(KIND.FLASH, x, y + 0.3, z, 0, 0, 0, 1, 0.72, 0.4, 0.17, 3 + 9 * s, { bright: 3 });
    const n = Math.round((10 + 36 * s) * this.density);
    for (let i = 0; i < n; i++) {
      const sp = rr(5, 16) * (0.6 + 0.6 * s);
      const a = rnd() * 6.283, el = rr(1.0, 1.5);
      g.spawn(KIND.SPARK, x, y + 0.3, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
        1, 0.75, 0.35, rr(0.4, 0.9), 0.14, { drag: 1.2, grav: 0.8, bright: 1.8 });
    }
    for (let i = 0; i < 2; i++) this.smoke.spawn(x + rr(-0.5, 0.5), y + 0.6, z + rr(-0.5, 0.5), (2.5 + 5 * s) * this.smokeScale, rr(7, 14), rr(-0.4, 0.4), rr(0.5, 1.6), rr(-0.4, 0.4), 0.26, 1.4);
    this.addFlash(x, y + 1, z, [1, 0.62, 0.28], 0.45 * s + 0.1, 16 + 16 * s, 0.12, 0.5, 0.1, 0.04);
    this.sound.launch(this.distTo(x, y, z), s, this.panTo(x, y, z));
  }

  // o: {x,y,z,type,scale,H,cols,lean,rocket,whistle,ball,color,muzzle}
  fireShell(o) {
    const H = o.H ?? 80;
    const vy = Math.sqrt(2 * G * H);
    const T = vy / G;
    const ang = rnd() * 6.283;
    const L = (o.lean ?? 0.06) * H * rnd();
    const s = o.scale ?? 1;
    const shell = {
      x: o.x, y: o.y ?? 1.5, z: o.z, vx: (Math.cos(ang) * L) / T + (o.vx ?? 0), vy, vz: (Math.sin(ang) * L) / T + (o.vz ?? 0),
      age: 0, T, type: o.type, scale: s, cols: o.cols || pickColors(), acc: 0,
      rate: o.ball ? 110 : o.rocket ? 120 : 90 + 60 * Math.min(1, s),
      ball: o.ball, color: o.color || PAL.gold, silver: o.silver, rocket: o.rocket,
    };
    this.shells.push(shell);
    this.muzzle(shell.x, shell.y, shell.z, o.muzzle ?? Math.min(1, s * 0.8 + 0.1));
    if (o.whistle) this.sound.whistle(this.distTo(shell.x, shell.y, shell.z), T - 0.3, this.panTo(shell.x, shell.y, shell.z));
  }

  updateShells(dt) {
    const g = this.glow;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.age += dt;
      s.vy -= G * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.rocket) { s.vx += rr(-1, 1) * 3 * dt; s.vz += rr(-1, 1) * 3 * dt; }
      // Schweif aus Funken
      s.acc += s.rate * dt * this.density;
      const col = s.ball ? s.color : s.silver ? PAL.silver : [1, 0.7, 0.3];
      const sz = s.ball ? 0.2 : 0.18 + 0.22 * Math.min(1, s.scale);
      while (s.acc >= 1) {
        s.acc -= 1;
        const jit = rnd() * dt;
        g.spawn(KIND.SPARK, s.x - s.vx * jit, s.y - s.vy * jit, s.z - s.vz * jit,
          -s.vx * 0.06 + rr(-1.2, 1.2), -s.vy * 0.06 + rr(-1.2, 1.2), -s.vz * 0.06 + rr(-1.2, 1.2),
          col[0], col[1], col[2], rr(0.55, 1.15), sz, { drag: 1.4, grav: 0.55, bright: s.ball ? 2.4 : 1.8 });
      }
      // Kopf der Schale
      g.spawn(KIND.STAR, s.x, s.y, s.z, 0, 0, 0, col[0], col[1], col[2], 0.06, s.ball ? 0.8 : 1.1, { bright: 2.6, fadeStart: 1 });
      if (s.age >= s.T) {
        this.shells.splice(i, 1);
        this.burst(s.ball ? 'pop' : s.type, s.x, s.y, s.z, s.ball ? 0.6 : s.scale, s.ball ? [this.nameOf(s.color)] : s.cols, { x: s.vx, y: s.vy, z: s.vz });
      }
    }
  }

  nameOf(c) {
    for (const k in PAL) if (PAL[k] === c) return k;
    return 'gold';
  }

  burst(type, x, y, z, scale, cols, vel = { x: 0, y: 0, z: 0 }) {
    const def = TYPES[type] || TYPES.peony;
    const R = def.R * scale;
    const P = {
      x, y, z, scale, R, cols, vel,
      c1: PAL[cols[0]] || PAL.gold,
      c2: PAL[cols[1] || cols[0]] || PAL.white,
      starSize: 1.5 * Math.sqrt(Math.min(1.4, scale)) + 0.45,
    };
    def.fn.call(this, P);

    // Blitz
    const mix = [(P.c1[0] + 1) / 2, (P.c1[1] + 1) / 2, (P.c1[2] + 1) / 2];
    this.glow.spawn(KIND.FLASH, x, y, z, 0, 0, 0, mix[0], mix[1], mix[2], 0.3, Math.max(9, R * 1.05), { bright: 1.0 });
    this.glow.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 1, 0.95, 0.85, 0.12, Math.max(5, R * 0.35), { bright: 3 });
    this.addFlash(x, y, z, mix, Math.min(1.2, 0.35 + scale * 0.7), R * 1.7, 0.22, 1.6, type === 'willow' || type === 'chrys' ? 0.45 : 0.2);

    // Rauch
    const puffs = Math.max(2, Math.min(9, Math.round(R / 6))) * this.smokeScale;
    for (let i = 0; i < puffs; i++) {
      const a = rnd() * 6.283, el = rr(-0.6, 1);
      const rad = R * rr(0.1, 0.55);
      this.smoke.spawn(x + Math.cos(a) * rad, y + el * rad, z + Math.sin(a) * rad, R * rr(0.55, 0.95), rr(28, 50),
        Math.cos(a) * rr(0.5, 2), rr(-0.5, 0.8), Math.sin(a) * rr(0.5, 2), 0.13, 1.1);
    }

    // Knall (Schall braucht dist / 343 s)
    const d = this.distTo(x, y, z);
    this.sound.bang(d, Math.min(1.3, 0.08 + R / 55), this.panTo(x, y, z));
  }

  // ---------- Bodenfeuerwerk & Böller ----------
  makeItemMesh(type) {
    const g = new THREE.Group();
    const mat = (c, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
    let tip = new THREE.Vector3(0, 0.3, 0);
    if (type === 'rocket') {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 12),
        new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.1, transparent: true, opacity: 0.75 }));
      bottle.position.y = 0.14;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.85, 6), mat(0xb08a50));
      stick.position.y = 0.4;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.17, 12), mat(0xc22b2b));
      body.position.y = 0.4 + 0.12;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 12), mat(0xe8e1d0));
      cone.position.y = 0.4 + 0.12 + 0.115;
      g.add(bottle, stick, body, cone);
      tip.set(0, 0.28, 0);
      g.userData.parts = { body, cone, stick };
    } else if (type === 'battery') {
      const [c1, c2] = pick([['#d12a2a', '#ff9f1a'], ['#1a47c9', '#14d0d0'], ['#7a1ad1', '#ff2a8a'], ['#17a34a', '#e6e61a']]);
      const label = boxLabel(pick(['MEGA FINALE', 'NIGHT SKY', 'THUNDER', 'GALAXY', 'CRYSTAL']), c1, c2, (rnd() * 1000) | 0);
      const side = new THREE.MeshStandardMaterial({ map: label, roughness: 0.7 });
      const dark = mat(0x262626);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.26), [side, side, dark, dark, side, side]);
      box.position.y = 0.17;
      g.add(box);
      const tg = new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8);
      const tm = mat(0x111111);
      for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
        const t = new THREE.Mesh(tg, tm);
        t.position.set(-0.17 + a * 0.085, 0.36, -0.09 + b * 0.045);
        g.add(t);
      }
      tip.set(0, 0.4, 0);
    } else if (type === 'fountain') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.22, 14), mat(pick([0xd9c36a, 0xcc4a2a, 0x3c6bbf])));
      m.position.y = 0.11;
      g.add(m);
      tip.set(0, 0.23, 0);
    } else if (type === 'volcano') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 0.22, 16), mat(0x7b2d1f));
      m.position.y = 0.11;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), mat(0x201410));
      top.position.y = 0.23;
      g.add(m, top);
      tip.set(0, 0.25, 0);
    } else if (type === 'candle') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 12), mat(0xa22222));
      m.position.y = 0.31;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0295, 0.0295, 0.08, 12), mat(0xe6c431));
      band.position.y = 0.4;
      g.add(m, band);
      tip.set(0, 0.64, 0);
    } else if (type === 'banger') {
      const geo = new THREE.CylinderGeometry(0.013, 0.013, 0.075, 10);
      const m1 = mat(0xb81d1d);
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(geo, m1);
        c.rotation.z = Math.PI / 2;
        c.position.set(rr(-0.08, 0.08), 0.013, rr(-0.08, 0.08));
        c.rotation.y = rnd() * 3;
        g.add(c);
      }
      tip.set(0, 0.04, 0);
    } else if (type === 'chain') {
      const geo = new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8);
      const m1 = mat(0xc42222);
      for (let i = 0; i < 18; i++) {
        const c = new THREE.Mesh(geo, m1);
        c.rotation.z = Math.PI / 2;
        c.position.set(-0.25 + i * 0.03, 0.01, Math.sin(i * 0.6) * 0.03);
        g.add(c);
      }
      tip.set(-0.25, 0.03, 0);
    } else if (type === 'bomb') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), mat(0x1c1c20, 0.4));
      b.position.y = 0.075;
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), mat(0xd9c9a0));
      f.position.y = 0.17;
      g.add(b, f);
      tip.set(0, 0.2, 0);
    } else if (type === 'sparkler') {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.36, 6), mat(0x8a8a8a, 0.4));
      w.position.y = 0.18;
      g.add(w);
      tip.set(0, 0.36, 0);
    }
    g.userData.tip = tip;
    return g;
  }

  place(type, x, z) {
    const mesh = this.makeItemMesh(type);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rnd() * 6.283;
    if (type === 'candle' || type === 'sparkler') mesh.rotation.z = rr(-0.08, 0.08);
    this.itemGroup.add(mesh);
    const item = { type, mesh, x, z, state: 'fuse', t: 0, fuse: type === 'banger' || type === 'chain' || type === 'bomb' ? 2.4 : 1.6, done: false, life: 0, fx: null };
    mesh.updateMatrixWorld();
    item.tip = mesh.userData.tip.clone().applyMatrix4(mesh.matrixWorld);
    this.items.push(item);
    if (this.items.length > 60) this.removeItem(this.items[0]);
    return item;
  }

  removeItem(item) {
    this.itemGroup.remove(item.mesh);
    item.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  updateItems(dt) {
    const g = this.glow;
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k];
      it.t += dt;
      const tip = it.tip;
      if (it.state === 'fuse') {
        // Zündschnur sprüht
        if (rnd() < 0.9) {
          const sp = rr(0.8, 2.5);
          const a = rnd() * 6.283;
          g.spawn(KIND.SPARK, tip.x, tip.y, tip.z, Math.cos(a) * sp, rr(0.5, 3), Math.sin(a) * sp, 1, 0.85, 0.5, rr(0.12, 0.3), 0.07, { drag: 2, grav: 0.8, bright: 2.2 });
        }
        if (it.t >= it.fuse) {
          it.state = 'run';
          it.t = 0;
          this.ignite(it);
        }
      } else if (it.state === 'run') {
        if (it.run && it.run(dt, it) === false) {
          it.state = 'done';
          it.t = 0;
          this.charr(it);
        }
      } else if (it.state === 'done') {
        if (it.t > 50) this.removeItem(it);
      }
    }
  }

  charr(item) {
    item.mesh.traverse((o) => {
      if (o.material && o.material.color && !o.material.map) o.material = o.material.clone(), o.material.color.multiplyScalar(0.35);
    });
    if (item.mesh.userData.parts) for (const p of Object.values(item.mesh.userData.parts)) p.visible = false;
  }

  ignite(it) {
    const { x, z } = it;
    const tip = it.tip;
    const dist = () => this.distTo(tip.x, tip.y, tip.z);
    const g = this.glow;
    const pan = this.panTo(x, 0, z);

    if (it.type === 'rocket') {
      const cols = pickColors();
      this.fireShell({
        x: tip.x, y: tip.y, z: tip.z, rocket: true, whistle: true, lean: 0.12,
        type: pick(['peony', 'peony', 'chrys', 'crackle', 'ring', 'palm', 'crossette', 'strobe']),
        scale: rr(0.24, 0.34), H: rr(42, 68), cols, muzzle: 0.35,
      });
      it.run = () => false;
    } else if (it.type === 'battery') {
      const cols = pickColors();
      const total = 25;
      let fired = 0, next = 0, tt = 0;
      const types = ['peony', 'chrys', 'crackle', 'peony', 'ring'];
      it.run = (dt) => {
        tt += dt;
        while (fired < total && tt >= next) {
          const fin = fired >= total - 6;
          const col = cols[fired % cols.length];
          const col2 = cols[(fired + 1) % cols.length];
          const ix = fired % 5, iz = (fired / 5) | 0;
          const spread = (ix - 2) * 0.35 + (rnd() - 0.5) * 0.2;
          this.fireShell({
            x: tip.x + (ix - 2) * 0.085, y: tip.y, z: tip.z + (iz - 2) * 0.045, vx: spread * 9, vz: rr(-1, 1),
            type: fin ? pick(['peony', 'chrys']) : types[((fired / 2) | 0) % types.length],
            scale: fin ? rr(0.3, 0.36) : rr(0.2, 0.28), H: fin ? rr(34, 44) : rr(24, 38), cols: [col, col2], lean: 0.05, muzzle: 0.3,
          });
          fired++;
          next = tt + (fin ? rr(0.12, 0.22) : rr(0.35, 0.65));
        }
        return fired < total;
      };
    } else if (it.type === 'candle') {
      const cols = pick(SETS);
      let fired = 0, tt = 0, next = 0;
      it.run = (dt) => {
        tt += dt;
        if (fired < 9 && tt >= next) {
          const c = PAL[cols[fired % cols.length]];
          this.fireShell({
            x: tip.x, y: tip.y, z: tip.z, vx: rr(-2.5, 2.5), vz: rr(-2.5, 2.5), ball: true, color: c, type: 'pop',
            scale: 0.6, H: rr(24, 34), lean: 0.01, muzzle: 0.15,
          });
          fired++;
          next = tt + (fired > 6 ? 0.4 : 0.85);
        }
        return fired < 9;
      };
    } else if (it.type === 'fountain' || it.type === 'volcano') {
      const vol = it.type === 'volcano';
      const dur = vol ? 30 : 24;
      const hiss = this.sound.hiss(dist(), dur, vol ? 1.2 : 1, pan);
      const colorsV = [PAL.gold, PAL.orange, PAL.green, PAL.violet, PAL.white, PAL.pink];
      const base = vol ? null : pick([PAL.gold, PAL.silver, PAL.gold, PAL.cyan, PAL.pink]);
      let acc = 0, tt = 0, lightT = 0, smokeT = 0, hissT = 0;
      it.run = (dt) => {
        tt += dt;
        if (tt > dur) {
          if (vol) {
            // Finale: ein paar Kugeln
            for (let i = 0; i < 4; i++) this.later(i * 0.25, () => this.fireShell({
              x: tip.x, y: tip.y, z: tip.z, type: 'pop', ball: true, color: pick(colorsV), scale: 0.7, H: rr(16, 24), lean: 0.1, muzzle: 0.2,
            }));
          }
          return false;
        }
        const ramp = Math.min(1, tt / 1.2) * (tt > dur - 2 ? (dur - tt) / 2 : 1);
        const cone = vol ? 0.42 : 0.17;
        acc += (vol ? 520 : 420) * ramp * dt * this.density;
        const col = vol ? colorsV[((tt / 4.5) | 0) % colorsV.length] : base;
        while (acc >= 1) {
          acc -= 1;
          const a = rnd() * 6.283, c = Math.sqrt(rnd()) * cone;
          const sp = (vol ? rr(9, 17) : rr(7, 13)) * (0.45 + 0.55 * ramp);
          const white = rnd() < 0.08;
          g.spawn(KIND.SPARK, tip.x, tip.y, tip.z,
            Math.sin(c) * Math.cos(a) * sp, Math.cos(c) * sp, Math.sin(c) * Math.sin(a) * sp,
            white ? 1 : col[0], white ? 1 : col[1], white ? 0.9 : col[2], rr(0.8, 1.7), white ? 0.09 : 0.055,
            { drag: 0.5, grav: 0.95, bright: white ? 3 : 1.9, windK: 0.5, trailRate: 38 * this.density, trailLife: 0.3, trailSize: 0.04 });
        }
        lightT -= dt;
        if (lightT <= 0) {
          lightT = 0.1;
          this.addFlash(tip.x, tip.y + 2, tip.z, col, 0.2 * ramp, vol ? 22 : 16, 0.12, 0.4, 0, 0.03);
        }
        smokeT -= dt;
        if (smokeT <= 0) {
          smokeT = 0.5;
          this.smoke.spawn(tip.x, tip.y + 1.2, tip.z, 2.2 * this.smokeScale, rr(6, 10), rr(-0.3, 0.3), rr(0.8, 1.8), rr(-0.3, 0.3), 0.14, 1.5);
        }
        hissT -= dt;
        if (hissT <= 0 && hiss) {
          hissT = 0.5;
          hiss.setDist(dist());
        }
        return true;
      };
    } else if (it.type === 'banger') {
      // Mehrere Böller hintereinander, jeder mit eigener kurzer Zündschnur
      for (let i = 0; i < 4; i++) {
        const dx = rr(-0.1, 0.1), dz = rr(-0.1, 0.1);
        const t0 = i * rr(0.35, 0.9) + rr(0, 0.4);
        this.later(t0, () => this.bang(tip.x + dx, 0.05, tip.z + dz));
      }
      let tt = 0;
      it.run = (dt) => ((tt += dt) < 3.2);
    } else if (it.type === 'chain') {
      for (let i = 0; i < 24; i++) {
        const t0 = i * rr(0.08, 0.16) + rr(0, 0.05);
        const sx = tip.x + i * 0.02, sz = tip.z + rr(-0.25, 0.25);
        this.later(t0, () => this.bang(sx, 0.05, sz, 0.55));
      }
      let tt = 0;
      it.run = (dt) => ((tt += dt) < 4.5);
    } else if (it.type === 'bomb') {
      this.later(0.05, () => this.bang(tip.x, 0.15, tip.z, 2.6));
      let tt = 0;
      it.run = (dt) => ((tt += dt) < 1.5);
    } else if (it.type === 'sparkler') {
      const dur = 28;
      let tt = 0, acc = 0, lt = 0;
      const burnTip = new THREE.Vector3();
      const hiss = this.sound.hiss(dist(), dur, 0.35, pan);
      it.run = (dt) => {
        tt += dt;
        if (tt > dur) return false;
        // Funkenkegel wandert langsam nach unten
        burnTip.set(tip.x, tip.y - 0.3 * (tt / dur), tip.z);
        acc += 190 * dt * this.density;
        while (acc >= 1) {
          acc -= 1;
          const sp = rr(0.8, 3.8);
          const th = rnd() * 6.283, ph = Math.acos(rr(-1, 1));
          g.spawn(KIND.SPARK, burnTip.x, burnTip.y, burnTip.z,
            Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 0.5, Math.sin(ph) * Math.sin(th) * sp,
            1, rr(0.8, 0.95), rr(0.5, 0.75), rr(0.18, 0.55), 0.035, { drag: 2.6, grav: 0.5, bright: 2.8 });
        }
        lt -= dt;
        if (lt <= 0) {
          lt = 0.12;
          this.addFlash(burnTip.x, burnTip.y + 0.2, burnTip.z, [1, 0.8, 0.5], 0.05, 5, 0.1, 0.3, 0, 0.02);
        }
        if (hiss && ((tt * 2) | 0) !== (((tt - dt) * 2) | 0)) hiss.setDist(dist());
        return true;
      };
    }
  }

  // Einzelner Böller
  bang(x, y, z, sc = 1) {
    const g = this.glow;
    g.spawn(KIND.FLASH, x, y, z, 0, 0, 0, 1, 0.9, 0.7, 0.12, 5 * sc, { bright: 4.5 });
    const n = Math.round(70 * sc * this.density);
    for (let i = 0; i < n; i++) {
      const sp = rr(8, 38) * (0.7 + 0.3 * sc);
      const th = rnd() * 6.283, ph = Math.acos(rr(-0.4, 1));
      g.spawn(KIND.SPARK, x, y, z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp * 0.9, Math.sin(ph) * Math.sin(th) * sp,
        1, 0.8, 0.45, rr(0.15, 0.45), 0.06, { drag: 4.2, grav: 1.1, bright: 2.6 });
    }
    this.smoke.spawn(x, y + 0.3, z, 2.6 * sc * this.smokeScale, rr(6, 10), 0, 1.0, 0, 0.3, 1.8);
    this.addFlash(x, y + 0.3, z, [1, 0.85, 0.6], 0.55, 18, 0.07, 0.3, 0, 0.03 * sc);
    this.sound.banger(this.distTo(x, y, z), this.panTo(x, y, z), sc);
  }

  // ---------- Große Show vom Lastkahn ----------
  muzzleAt(u) {
    const m = this.mortars[0];
    return { x: m.x + (u - 0.5) * 2 * this.bargeSpan + rr(-0.6, 0.6), y: m.y, z: m.z + rr(-3, 3) };
  }

  mortar(u, type, o = {}) {
    const p = this.muzzleAt(u);
    const cols = o.cols || pickColors();
    this.fireShell({
      ...p, type, cols, scale: o.scale ?? rr(1.0, 1.25), H: o.H ?? rr(95, 140), lean: o.lean ?? 0.05, muzzle: o.muzzle ?? 1, silver: o.silver,
    });
  }

  startShow() {
    if (this.show) return false;
    const T = [];
    const add = (t, u, type, o) => T.push([t, u, type, o]);
    const rndType = () => pick(['peony', 'chrys', 'ring', 'saturn', 'crossette', 'crackle', 'palm']);

    // 1) Ouvertüre: einzelne Päonien
    for (let i = 0; i < 5; i++) add(1 + i * 2.2, 0.5 + (i % 2 ? 0.1 : -0.1), 'peony', { cols: pickColors(), H: 100 + i * 6 });
    // 2) Paare
    for (let i = 0; i < 4; i++) { add(14 + i * 2.6, 0.2, 'chrys', { cols: ['red', 'gold'] }); add(14 + i * 2.6 + 0.3, 0.8, 'chrys', { cols: ['blue', 'cyan'] }); }
    // 3) Weiden
    for (let i = 0; i < 3; i++) add(26 + i * 3, 0.3 + i * 0.2, 'willow', { H: 115, scale: 1.25 });
    // 4) Herzen & Ringe
    add(36, 0.5, 'heart', { H: 90, scale: 1.1 });
    add(40, 0.35, 'ring', { cols: ['green', 'white'], H: 105 });
    add(40.6, 0.65, 'saturn', { cols: ['violet', 'gold'], H: 115 });
    add(45, 0.5, 'heart', { H: 95, scale: 1.1 });
    // 5) Fächer
    for (let i = 0; i < 12; i++) add(49 + i * 0.5, i / 11, i % 3 === 0 ? 'peony' : 'chrys', { cols: pick(SETS), H: 85 + (i % 4) * 10, scale: 0.9 });
    // 6) Brokat + Palmen + Blinker
    add(58, 0.3, 'palm', { H: 110 }); add(58.5, 0.7, 'palm', { H: 112 });
    add(62, 0.5, 'crackle', { H: 100 }); add(64, 0.25, 'crackle', { H: 95 }); add(64.5, 0.75, 'crackle', { H: 95 });
    for (let i = 0; i < 4; i++) add(67 + i * 1.1, 0.2 + i * 0.2, 'strobe', { H: 100, scale: 1.1 });
    // 7) Steigerung
    for (let i = 0; i < 28; i++) add(72 + i * 0.55 * (1 - i / 80), rnd(), rndType(), { cols: pickColors(), H: rr(90, 135) });
    // 8) Finale
    for (let i = 0; i < 46; i++) add(88 + i * 0.22, rnd(), rndType(), { cols: pickColors(), H: rr(95, 150), scale: rr(1, 1.35) });
    for (let i = 0; i < 14; i++) add(99.5 + rnd() * 0.5, i / 13, 'willow', { H: 125 + (i % 3) * 10, scale: 1.4 });
    add(100.5, 0.5, 'strobe', { H: 140, scale: 1.5 });

    const last = Math.max(...T.map((x) => x[0]));
    this.show = { t0: this.time, end: this.time + last + 9, dur: last + 9 };
    for (const [t, u, type, o] of T) this.later(t, () => this.mortar(u, type, o || {}));
    this.later(last + 4, () => this.sound.cheer(1));
    this.later(last + 9, () => { this.show = null; });
    return true;
  }

  reset() {
    this.queue.length = 0;
    this.shells.length = 0;
    this.flashes.length = 0;
    this.show = null;
    for (const it of [...this.items]) this.removeItem(it);
    this.glow.clear();
    this.smoke.clear();
  }

  // ---------- Frame ----------
  update(dt) {
    this.time += dt;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].t <= this.time) {
        const q = this.queue.splice(i, 1)[0];
        q.fn();
      }
    }
    this.updateShells(dt);
    this.updateItems(dt);

    // Blitze zerfallen lassen
    const cam = this.camera.position;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      f.e = f.e0 * ((1 - f.sus) * Math.exp(-f.age / f.tau1) + f.sus * Math.exp(-f.age / f.tau2));
      if (f.e < 0.004) this.flashes.splice(i, 1);
      else {
        const dx = f.x - cam.x, dy = f.y - cam.y, dz = f.z - cam.z;
        f.score = (f.e * f.rad * f.rad) / (400 + dx * dx + dy * dy + dz * dz);
      }
    }
    const top = [...this.flashes].sort((a, b) => b.score - a.score).slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const f = top[i], l = this.lights[i];
      if (f) {
        l.position.set(f.x, f.y, f.z);
        l.color.setRGB(f.r, f.g, f.b);
        l.intensity = f.e * f.rad * f.rad * 10 * f.ls;
        this.lp[i].set(f.x, f.y, f.z, f.rad);
        this.lc[i].set(f.r * f.e, f.g * f.e, f.b * f.e);
      } else {
        l.intensity = 0;
        this.lc[i].set(0, 0, 0);
      }
    }

    this.glow.update(dt, this.wind, this.time);
    this.smoke.update(dt, this.wind, this.flashes);

    // Knistern / Kreuzer-Teilung hörbar machen (gedrosselt)
    this.crackleTimer -= dt;
    const ev = this.glow.events;
    if (ev.length) {
      if (this.crackleTimer <= 0) {
        this.crackleTimer = 0.08;
        const e = ev[(Math.random() * ev.length) | 0];
        const d = this.distTo(e.x, e.y, e.z);
        if (e.type === 'crackle') this.sound.crackle(d, 3, 0.12, this.panTo(e.x, e.y, e.z));
        else this.sound.pop(d, this.panTo(e.x, e.y, e.z));
      }
      ev.length = 0;
    }
  }
}

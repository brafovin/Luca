import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { addCar } from './cars.js';
import { mulberry32, clamp } from './util.js';

/**
 * Car damage: cracked glass, dents, soot, smoke and fire; destroyed cars burn and stay as wrecks.
 * Targets: driving cars (Traffic objects), wrecks (converted parked cars) and parked cars (baked into chunks –
 * on the first hit the car is cut out of the chunk and replaced by a live mesh).
 */
export class CarDamage {
  constructor(scene, M, smoke, glowTex, world, traffic) {
    this.scene = scene; this.M = M; this.smoke = smoke; this.glow = glowTex; this.world = world; this.traffic = traffic;
    this.wrecks = [];
    this.time = 0;
    this.onDestroyed = null; this.onHit = null;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1.6; x.lineCap = 'round';
    const cx = 54, cy = 62, r = mulberry32(7);
    for (let i = 0; i < 14; i++) { // radial cracks
      const a = (i / 14) * Math.PI * 2 + r() * 0.3; let px = cx, py = cy;
      for (let k = 0; k < 4; k++) { const l = 14 + r() * 18; const na = a + (r() - 0.5) * 0.5; x.beginPath(); x.moveTo(px, py); px += Math.cos(na) * l; py += Math.sin(na) * l; x.lineTo(px, py); x.stroke(); }
    }
    x.lineWidth = 1; for (let k = 1; k < 4; k++) { x.beginPath(); for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2, rr = k * 14 + r() * 5; const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); }
    this.crackTex = new THREE.CanvasTexture(c);
    this.crackMat = new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.dentMat = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.55, metalness: 0.6 });
    this.fireTex = glowTex;
  }

  /* ---------------- pose / geometry helpers ---------------- */
  pose(t) {
    if (t.kind === 'parked') return { x: t.rec.x, z: t.rec.z, yaw: t.rec.yaw, L: t.rec.L, W: t.rec.W, H: t.rec.H };
    const g = t.car.group;
    return { x: g.position.x, z: g.position.z, yaw: g.rotation.y, L: t.car.L, W: t.car.W, H: t.car.H };
  }
  /** distance from a point to the car's footprint (0 = inside) */
  dist(t, px, pz) {
    const p = this.pose(t), dx = px - p.x, dz = pz - p.z, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.hypot(Math.max(Math.abs(lx) - p.W / 2, 0), Math.max(Math.abs(lz) - p.L / 2, 0));
  }
  /** all damageable cars near a point */
  near(px, pz, r) {
    const out = [];
    for (const c of this.traffic.cars) {
      if (!c.active || c.kind === 'scooter') continue;
      const t = { kind: 'traffic', car: c };
      if (Math.abs(c.group.position.x - px) > 8 + r || Math.abs(c.group.position.z - pz) > 8 + r) continue;
      if (this.dist(t, px, pz) <= r) out.push(t);
    }
    for (const w of this.wrecks) { const t = { kind: 'wreck', car: w }; if (this.dist(t, px, pz) <= r) out.push(t); }
    for (const rec of this.world.parkedCarsNear(px, pz, r)) { const t = { kind: 'parked', rec }; if (this.dist(t, px, pz) <= r) out.push(t); }
    return out;
  }
  nearest(px, pz, r) {
    let best = null, bd = 1e9;
    for (const t of this.near(px, pz, r)) { const d = this.dist(t, px, pz); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  /** bullet ray against car boxes: returns { t, target, px, pz } */
  ray(ox, oz, fx, fz, range) {
    const seen = new Set(), cand = [];
    for (let d = 0; d <= range + 10; d += 18) for (const t of this.near(ox + fx * Math.min(d, range), oz + fz * Math.min(d, range), 14)) {
      const key = t.kind === 'parked' ? t.rec.ci + ',' + t.rec.cj + ',' + t.rec.idx : t.car;
      if (!seen.has(key)) { seen.add(key); cand.push(t); }
    }
    let best = null, bt = range;
    for (const t of cand) {
      const p = this.pose(t), s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      const dx = ox - p.x, dz = oz - p.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c, ldx = fx * c - fz * s, ldz = fx * s + fz * c;
      let t0 = 0, t1 = bt;
      for (const [o, d, h] of [[lx, ldx, p.W / 2], [lz, ldz, p.L / 2]]) {
        if (Math.abs(d) < 1e-6) { if (Math.abs(o) > h) { t1 = -1; break; } continue; }
        let a = (-h - o) / d, b = (h - o) / d; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) { t1 = -1; break; }
      }
      if (t1 >= t0 && t1 >= 0 && t0 < bt) { bt = t0; best = t; }
    }
    return best ? { t: bt, target: best } : null;
  }

  /* ---------------- live meshes ---------------- */
  buildLive(rec) {
    const S = new BatchSet(), rnd = mulberry32((rec.idx * 7919 + rec.ci * 31 + rec.cj * 17) | 0);
    addCar(S, rnd, { type: rec.type, color: rec.col });
    const g = new THREE.Group();
    const map = { paint: 'paint', glass: 'glass', cglass: 'carGlass', generic: 'generic', lampW: 'lampW' };
    for (const [k, b] of Object.entries(S.b)) {
      if (b.empty) continue;
      const m = new THREE.Mesh(b.build(), this.M[map[k]]);
      m.castShadow = k !== 'glass' && k !== 'cglass' && k !== 'lampW'; m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }
  /** parked car -> wreck object (cut out of the chunk, drawn live, own collider) */
  convert(rec) {
    this.world.destroyParked(rec);
    const group = this.buildLive(rec);
    group.position.set(rec.x, 0, rec.z); group.rotation.y = rec.yaw;
    this.scene.add(group);
    const w = { group, L: rec.L, W: rec.W, H: rec.H, cab: null, hp: 100, dead: false, fx: null, born: this.time, parked: true };
    const s = Math.abs(Math.sin(rec.yaw)) > 0.7;
    const hx = (s ? rec.L : rec.W) / 2, hz = (s ? rec.W : rec.L) / 2;
    w.col = { t: 0, x0: rec.x - hx, x1: rec.x + hx, z0: rec.z - hz, z1: rec.z + hz };
    this.world.colliders.add(w.col);
    this.wrecks.push(w);
    return { kind: 'wreck', car: w };
  }

  /* ---------------- damage ---------------- */
  fxFor(car) {
    if (car.fx) return car.fx;
    const g = new THREE.Group();
    const L = car.L, W = car.W, H = car.H;
    const fx = { group: g, soot: null, cracks: [], dents: [], level: 0, fire: [], flameT: 0 };
    // soot / burn overlay over the whole body
    const sootMat = new THREE.MeshBasicMaterial({ color: 0x0b0a0a, transparent: true, opacity: 0, depthWrite: false });
    const soot = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, H - 0.36, L + 0.06), sootMat);
    soot.position.set(0, 0.36 + (H - 0.36) / 2, 0); soot.renderOrder = 4; g.add(soot); fx.soot = soot;
    // cracked windows: windscreen + side windows
    const cab = car.cab;
    if (cab) {
      const { prof, yb, yt, cw } = cab;
      const mk = (pts, uv) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex([0, 1, 2, 0, 2, 3]); const m = new THREE.Mesh(geo, this.crackMat); m.visible = false; m.renderOrder = 5; g.add(m); fx.cracks.push(m); return m; };
      const A = prof[3], B = prof[2], w = cw - 0.14;
      // windscreen (between front pillar base and roof front), pushed slightly outward
      const n = new THREE.Vector2(-(B[1] - A[1]), B[0] - A[0]).normalize(); if (n.x * (A[0] - cab.cen[0]) + n.y * (A[1] - cab.cen[1]) < 0) n.negate();
      const o = 0.025;
      mk([[-w, A[1] + n.y * o, A[0] + n.x * o], [w, A[1] + n.y * o, A[0] + n.x * o], [w, B[1] + n.y * o, B[0] + n.x * o], [-w, B[1] + n.y * o, B[0] + n.x * o]], [0, 0, 1, 0, 1, 1, 0, 1]);
      for (const sx of [-1, 1]) {
        const x = sx * (cw + 0.03), z0 = prof[1][0] + 0.25, z1 = prof[2][0] - 0.1;
        mk([[x, yb + 0.08, z0], [x, yb + 0.08, z1], [x, yt - 0.12, z1], [x, yt - 0.12, z0]], [0, 0, 1, 0, 1, 1, 0, 1]);
      }
    }
    // dents
    const rnd = mulberry32((L * 1000) | 0);
    for (let i = 0; i < 9; i++) {
      const sx = rnd() < 0.5 ? -1 : 1, top = i > 6;
      const d = new THREE.Mesh(new THREE.BoxGeometry(top ? 0.5 : 0.04, top ? 0.04 : 0.3 + rnd() * 0.18, 0.4 + rnd() * 0.5), this.dentMat);
      if (top) d.position.set((rnd() - 0.5) * W * 0.6, 0.96 + rnd() * 0.05, L * (0.2 + rnd() * 0.18)); else d.position.set(sx * (W / 2 + 0.006), 0.5 + rnd() * 0.3, (rnd() - 0.5) * L * 0.8);
      d.rotation.set((rnd() - 0.5) * 0.35, 0, (rnd() - 0.5) * 0.3); d.visible = false; d.castShadow = false; g.add(d); fx.dents.push(d);
    }
    // fire sprites (only shown once destroyed)
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireTex, color: i === 0 ? 0xffb030 : 0xff6a1a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      sp.position.set((i - 1) * W * 0.22, H * 0.85 + i * 0.1, L * (0.28 - i * 0.22)); sp.scale.set(1.4, 1.8, 1); sp.renderOrder = 7; g.add(sp); fx.fire.push(sp);
    }
    car.group.add(g);
    car.fx = fx;
    return fx;
  }
  applyLevel(car) {
    const fx = this.fxFor(car), hp = car.hp;
    fx.soot.material.opacity = hp <= 0 ? 0.88 : clamp((100 - hp) / 100 * 0.55, 0, 0.5);
    const nCr = hp < 85 ? (hp < 55 ? fx.cracks.length : 1) : 0;
    fx.cracks.forEach((c, i) => (c.visible = i < nCr));
    const nD = Math.round(clamp((100 - hp) / 100, 0, 1) * fx.dents.length);
    fx.dents.forEach((d, i) => (d.visible = i < nD));
  }
  /** returns true if the car was destroyed by this hit */
  hit(t, amount, srcX, srcZ) {
    let tgt = t;
    if (t.kind === 'parked') tgt = this.convert(t.rec);
    const car = tgt.car;
    if (car.dead) { car.hp = 0; return false; }
    car.hp = (car.hp ?? 100) - amount;
    car.hitT = this.time;
    if (this.onHit) this.onHit(car, amount);
    if (car.hp <= 0) { car.hp = 0; this.destroy(tgt); return true; }
    this.applyLevel(car);
    if (tgt.kind === 'traffic') car.cruise *= 0.7;
    return false;
  }
  destroy(t) {
    const car = t.car;
    car.dead = true; car.deadT = 0;
    this.applyLevel(car);
    const fx = this.fxFor(car);
    fx.cracks.forEach((c) => (c.visible = true));
    fx.dents.forEach((d) => (d.visible = true));
    const g = car.group;
    if (t.kind === 'traffic') { car.v = 0; car.cruise = 0; car.down = 1e9; }
    g.position.y = -0.07; g.rotation.z = (Math.random() - 0.5) * 0.08;
    // blast of black smoke
    const _p = new THREE.Vector3(0, car.H * 0.6, car.L * 0.2); g.localToWorld(_p);
    for (let i = 0; i < 16; i++) this.smoke.emit(_p.x + (Math.random() - 0.5) * 1.2, _p.y, _p.z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 2, 'black');
    if (this.onDestroyed) this.onDestroyed(car, t);
  }
  /** a rider rammed into the car(s) at (x,z) with the given impact */
  rammed(x, z, impact) {
    const t = this.nearest(x, z, 1.6);
    if (!t) return null;
    return { t, destroyed: this.hit(t, clamp(impact * 7, 0, 100), x, z) };
  }
  dispose(car) {
    if (!car.fx) return;
    car.group.remove(car.fx.group);
    car.fx.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== this.crackMat && o.material !== this.dentMat) o.material.dispose(); });
    car.fx = null; car.dead = false; car.hp = 100;
    car.group.position.y = 0; car.group.rotation.z = 0;
  }

  /* ---------------- per-frame ---------------- */
  update(dt, px, pz) {
    this.time += dt;
    const emit = (car, rate, kind, amount) => {
      car.smkAcc = (car.smkAcc || 0) + rate * dt;
      while (car.smkAcc >= 1) {
        car.smkAcc--;
        _p.set((Math.random() - 0.5) * 0.5, car.H * (kind === 'black' ? 0.8 : 0.62), car.L * 0.3 + (Math.random() - 0.5) * 0.4); car.group.localToWorld(_p);
        this.smoke.emit(_p.x, _p.y, _p.z, (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, kind, amount);
      }
    };
    const tick = (car) => {
      if (!car.fx || !car.group.visible) return;
      const d2 = (car.group.position.x - px) ** 2 + (car.group.position.z - pz) ** 2;
      if (d2 > 160 * 160) return;
      if (car.dead) {
        car.deadT += dt;
        const burn = car.deadT < 40 ? 1 : Math.max(0, 1 - (car.deadT - 40) / 25);
        car.fx.fire.forEach((sp, i) => {
          const f = 0.75 + 0.25 * Math.sin(this.time * (11 + i * 3) + i * 2);
          sp.material.opacity = burn * (0.65 + 0.35 * f); sp.scale.set((1.2 + 0.5 * f) * (0.7 + burn * 0.3), (1.6 + 0.9 * f) * (0.4 + burn * 0.6), 1);
        });
        emit(car, 9 * (0.3 + burn * 0.7), 'black', 1);
      } else if (car.hp < 50) emit(car, 4 + (50 - car.hp) * 0.12, car.hp < 28 ? 'black' : 'exhaust', 0.8);
    };
    for (const c of this.traffic.cars) if (c.fx) tick(c);
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      tick(w);
      if (Math.hypot(w.group.position.x - px, w.group.position.z - pz) > 260 || this.time - w.born > 900) { // tow it away
        this.world.colliders.remove(w.col); this.scene.remove(w.group); this.dispose(w);
        w.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.wrecks.splice(i, 1);
      }
    }
  }
}
const _p = new THREE.Vector3();

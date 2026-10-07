import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { addCar } from './cars.js';
import { P } from './world.js';
import { mulberry32, clamp } from './util.js';

const STOP = 11.2; // stop line distance from intersection centre
const LANE = 1.75;

function buildVehicleMeshes(M, rnd, bus) {
  const S = new BatchSet();
  const dim = addCar(S, rnd, { type: bus ? 'bus' : undefined, lights: 'lampW' });
  const g = new THREE.Group();
  const map = { paint: 'paint', glass: 'glass', generic: 'generic', lampW: 'lampW' };
  for (const [k, b] of Object.entries(S.b)) {
    if (b.empty) continue;
    const m = new THREE.Mesh(b.build(), M[map[k]]);
    m.castShadow = k !== 'glass' && k !== 'lampW';
    m.receiveShadow = true;
    g.add(m);
  }
  return { group: g, ...dim };
}

export class Traffic {
  constructor(scene, M, count = 12) {
    this.scene = scene;
    this.M = M;
    this.rnd = mulberry32(99);
    this.cars = [];
    this.count = count;
    this.dyn = [];
    for (let i = 0; i < count; i++) {
      const bus = i % 6 === 5;
      const c = buildVehicleMeshes(M, this.rnd, bus);
      c.group.visible = false;
      scene.add(c.group);
      this.cars.push({ ...c, active: false, bus, s: 0, v: 0, axis: 'x', dir: 1, lane: 0, cruise: 10, wait: 0 });
    }
  }

  spawn(c, px, pz, R) {
    const rnd = Math.random;
    for (let tries = 0; tries < 12; tries++) {
      const axis = rnd() < 0.5 ? 'x' : 'z';
      const dir = rnd() < 0.5 ? 1 : -1;
      const line = Math.round((axis === 'x' ? pz : px) / P) + Math.floor(rnd() * 5) - 2;
      const along = (axis === 'x' ? px : pz) + (rnd() * 2 - 1) * R;
      let s = along;
      // avoid spawning inside an intersection
      const r = ((s % P) + P) % P;
      if (r < 14 || r > P - 14) continue;
      if (Math.hypot(axis === 'x' ? s - px : line * P - pz, axis === 'x' ? line * P - pz : s - px) < 45 && false) continue;
      const lane = axis === 'x' ? line * P + dir * LANE : line * P - dir * LANE;
      // keep spacing in lane
      let ok = true;
      for (const o of this.cars) {
        if (!o.active || o === c || o.axis !== axis || o.dir !== dir || Math.abs(o.lane - lane) > 0.5) continue;
        if (Math.abs(o.s - s) < 22) { ok = false; break; }
      }
      // not too close to the player
      const wx = axis === 'x' ? s : lane, wz = axis === 'x' ? lane : s;
      if (Math.hypot(wx - px, wz - pz) < 50) ok = false;
      if (!ok) continue;
      Object.assign(c, { active: true, axis, dir, lane, s, v: 0, cruise: 8.5 + rnd() * 3.5, wait: 0 });
      c.v = c.cruise * 0.8;
      c.group.visible = true;
      return true;
    }
    return false;
  }

  update(dt, player, sig, R = 180) {
    const px = player.x, pz = player.z;
    this.dyn.length = 0;
    for (const c of this.cars) {
      if (!c.active) { this.spawn(c, px, pz, R); continue; }
      const wx = c.axis === 'x' ? c.s : c.lane, wz = c.axis === 'x' ? c.lane : c.s;
      if (Math.hypot(wx - px, wz - pz) > R * 1.5) { c.active = false; c.group.visible = false; continue; }
      // --- target speed
      let vt = c.cruise;
      const green = c.axis === 'x' ? sig.aG : sig.bG;
      const front = c.s + c.dir * c.L / 2;
      let d;
      if (c.dir > 0) { const k = Math.ceil((front + STOP) / P); d = k * P - STOP - front; }
      else { const k = Math.floor((front - STOP) / P); d = front - (k * P + STOP); }
      if (d < -0.5) d = 1e9; // already past the line
      if (!green && d < 60) {
        const brakeDist = (c.v * c.v) / (2 * 3.5);
        if (d > brakeDist * 0.7 - 0.5 || c.v < 1) vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * 2.6 * (d - 0.8))));
      }
      // obstacles ahead: other cars, player, pedestrians
      const look = 14 + c.v * 1.2;
      const consider = (ox, oz, ov, hw) => {
        const along = c.axis === 'x' ? (ox - c.s) * c.dir : (oz - c.s) * c.dir;
        const lat = c.axis === 'x' ? Math.abs(oz - c.lane) : Math.abs(ox - c.lane);
        if (along <= 0 || along > look || lat > hw + 1.15) return;
        const gap = along - c.L / 2 - 1.2;
        vt = Math.min(vt, Math.max(0, ov + (gap - 4) * 0.7), Math.sqrt(Math.max(0, 2 * 3 * (gap - 1.5))));
      };
      for (const o of this.cars) {
        if (o === c || !o.active) continue;
        const ox = o.axis === 'x' ? o.s : o.lane, oz = o.axis === 'x' ? o.lane : o.s;
        const ov = o.axis === c.axis && o.dir === c.dir ? o.v : 0;
        consider(ox, oz, ov, o.axis === c.axis ? 0.9 : 0.9);
      }
      consider(px, pz, Math.max(0, player.v * 0.2), 0.3);
      if (this.peds) for (const p of this.peds.list) if (p.active) consider(p.x, p.z, 0, 0.2);
      // --- integrate
      const a = clamp((vt - c.v) * 1.4, -6, 2.0);
      c.v = Math.max(0, c.v + a * dt);
      c.s += c.dir * c.v * dt;
      // --- transform
      const x = c.axis === 'x' ? c.s : c.lane, z = c.axis === 'x' ? c.lane : c.s;
      c.group.position.set(x, 0, z);
      c.group.rotation.y = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      // collision circles
      const vx = c.axis === 'x' ? c.dir * c.v : 0, vz = c.axis === 'z' ? c.dir * c.v : 0;
      const n = Math.max(3, Math.round(c.L / 1.8));
      const r = c.W / 2 + 0.05;
      for (let i = 0; i < n; i++) {
        const t = (-0.5 + (i + 0.5) / n) * (c.L - r);
        this.dyn.push({ x: c.axis === 'x' ? x + t : x, z: c.axis === 'x' ? z : z + t, r, vx, vz });
      }
    }
    return this.dyn;
  }
}

/* ------------------------------------------------------------------ pedestrians */
const SKIN = ['#e8bd9a', '#c98d62', '#8d5a3b', '#f1cfb2', '#6b4630'];
const CLOTH = ['#2f4a7a', '#8a2f2f', '#2f6a4a', '#d6b24a', '#4a4a4f', '#c9c9c9', '#6a3f7a', '#e07a2e', '#244e5f', '#7a6a58'];
const PANTS = ['#2a3142', '#3b3b3f', '#5a4a3a', '#1f2430', '#4a5568'];

export class Pedestrians {
  constructor(scene, M, count = 16) {
    this.list = [];
    this.count = count;
    const mk = (geo, shade) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    };
    const box = (w, h, d, pivotTop) => { const g = new THREE.BoxGeometry(w, h, d); if (pivotTop) g.translate(0, -h / 2, 0); return g; };
    this.parts = {
      torso: mk(box(0.36, 0.56, 0.2)),
      head: mk(new THREE.SphereGeometry(0.11, 10, 8)),
      legL: mk(box(0.15, 0.82, 0.17, true)), legR: mk(box(0.15, 0.82, 0.17, true)),
      armL: mk(box(0.1, 0.58, 0.12, true)), armR: mk(box(0.1, 0.58, 0.12, true)),
    };
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = { active: false, x: 0, z: 0, axis: 'x', dir: 1, side: 1, speed: 1.4, phase: Math.random() * 6, yaw: 0, wait: 0, down: 0, cloth: Math.random(), skin: Math.random(), pants: Math.random() };
      this.list.push(p);
      this.parts.torso.setColorAt(i, c.set(CLOTH[i % CLOTH.length]));
      this.parts.head.setColorAt(i, c.set(SKIN[i % SKIN.length]));
      for (const k of ['legL', 'legR']) this.parts[k].setColorAt(i, c.set(PANTS[i % PANTS.length]));
      for (const k of ['armL', 'armR']) this.parts[k].setColorAt(i, c.set(CLOTH[i % CLOTH.length]));
      this.parts.torso.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    for (const k of Object.values(this.parts)) if (k.instanceColor) k.instanceColor.needsUpdate = true;
    this.dyn = [];
    this._m = new THREE.Matrix4(); this._b = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._r = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._one = new THREE.Vector3(1, 1, 1);
  }

  spawn(p, px, pz, R) {
    for (let tries = 0; tries < 10; tries++) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const line = Math.round((axis === 'x' ? pz : px) / P) + Math.floor(Math.random() * 3) - 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      const along = (axis === 'x' ? px : pz) + (Math.random() * 2 - 1) * R;
      const r = ((along % P) + P) % P;
      if (r < 12 || r > P - 12) continue;
      p.axis = axis; p.side = side; p.dir = Math.random() < 0.5 ? 1 : -1;
      p.lane = line * P + side * 8.4;
      p.s = along;
      const x = axis === 'x' ? p.s : p.lane, z = axis === 'x' ? p.lane : p.s;
      if (Math.hypot(x - px, z - pz) < 25) continue;
      p.active = true; p.speed = 1.1 + Math.random() * 0.6; p.wait = 0; p.down = 0;
      return;
    }
  }

  update(dt, player, sig, t, R = 160) {
    const px = player.x, pz = player.z;
    const { torso, head, legL, legR, armL, armR } = this.parts;
    this.dyn.length = 0;
    const m = this._m, b = this._b, l = this._l;
    for (let i = 0; i < this.count; i++) {
      const p = this.list[i];
      if (!p.active) { this.spawn(p, px, pz, R); }
      if (!p.active) { torso.setMatrixAt(i, m.makeScale(0, 0, 0)); for (const k of [head, legL, legR, armL, armR]) k.setMatrixAt(i, m); continue; }
      let x = p.axis === 'x' ? p.s : p.lane, z = p.axis === 'x' ? p.lane : p.s;
      if (Math.hypot(x - px, z - pz) > R * 1.4) { p.active = false; continue; }
      // may we cross the street ahead? wait at the kerb while the cross traffic could still be moving
      let moving = true;
      const r = ((p.s % P) + P) % P;
      const inWait = p.dir > 0 ? r >= P - 7.1 && r < P - 5.9 : r > 5.9 && r <= 7.1;
      if (inWait) {
        const unsafe = p.axis === 'x' ? sig.bG || sig.bY || sig.bSoon : sig.aG || sig.aY || sig.aSoon;
        if (unsafe) moving = false;
      }
      if (p.down > 0) { p.down -= dt; moving = false; }
      if (moving) { p.s += p.dir * p.speed * dt; p.phase += dt * p.speed * 5.2; }
      x = p.axis === 'x' ? p.s : p.lane; z = p.axis === 'x' ? p.lane : p.s;
      p.x = x; p.z = z;
      const yaw = p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
      const sw = moving ? Math.sin(p.phase) * 0.55 : 0;
      b.makeRotationY(yaw).setPosition(x, 0.12, z);
      const ps = this._v;
      const set = (mesh, ox, oy, oz, rotX) => {
        l.makeRotationX(rotX).setPosition(ox, oy, oz);
        m.multiplyMatrices(b, l);
        mesh.setMatrixAt(i, m);
      };
      const lie = p.down > 0 ? Math.min(1, (p.down) * 3) : 0;
      if (lie > 0) { b.makeRotationY(yaw); b.multiply(l.makeRotationX(-Math.PI / 2 * lie)); b.setPosition(x, 0.12 + 0.2 * lie, z); }
      set(torso, 0, 1.12, 0, 0);
      set(head, 0, 1.55, 0.02, 0);
      set(legL, 0.09, 0.84, 0, sw);
      set(legR, -0.09, 0.84, 0, -sw);
      set(armL, 0.24, 1.38, 0, -sw);
      set(armR, -0.24, 1.38, 0, sw);
      this.dyn.push({ x, z, r: 0.32, vx: 0, vz: 0, ped: p });
    }
    for (const mesh of Object.values(this.parts)) { mesh.instanceMatrix.needsUpdate = true; }
    return this.dyn;
  }
}

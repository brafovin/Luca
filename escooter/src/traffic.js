import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { addCar } from './cars.js';
import { P } from './world.js';
import { mulberry32, clamp, damp } from './util.js';
import { ik2 } from './scooter.js';

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


/* ------------------------------------------------------------------ AI e-scooter riders */
const unitCyl = new THREE.CylinderGeometry(1, 0.88, 1, 8);
unitCyl.translate(0, 0.5, 0);
const _qa = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dv = new THREE.Vector3(), _sv = new THREE.Vector3(), _pv = new THREE.Vector3(), _m = new THREE.Matrix4();
function limbTo(B, a, b, r, col) {
  _dv.subVectors(b, a);
  const l = _dv.length() || 1e-3;
  _qa.setFromUnitVectors(_up, _dv.multiplyScalar(1 / l));
  _m.compose(a, _qa, _sv.set(r, l, r));
  B.geo(unitCyl, _m, col);
}
function partAt(B, geo, x, y, z, col, sx = 1, sy = 1, sz = 1, rx = 0) {
  _qa.setFromAxisAngle(_up.set(1, 0, 0), rx); _up.set(0, 1, 0);
  _m.compose(_pv.set(x, y, z), _qa, _sv.set(sx, sy, sz));
  B.geo(geo, _m, col);
}
let aiWheelGeo = null;
function wheelGeometry() {
  if (aiWheelGeo) return aiWheelGeo;
  const set = new BatchSet(); const B = set.get('a');
  const torus = new THREE.TorusGeometry(0.094, 0.047, 10, 24); torus.rotateY(Math.PI / 2);
  B.geo(torus, new THREE.Matrix4(), [0.05, 0.05, 0.055]);
  const rim = new THREE.CylinderGeometry(0.066, 0.066, 0.075, 12); rim.rotateZ(Math.PI / 2);
  B.geo(rim, new THREE.Matrix4(), [0.55, 0.57, 0.6]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; partAt(B, new THREE.BoxGeometry(0.08, 0.012, 0.11), 0, 0, 0, [0.12, 0.12, 0.13], 1, 1, 1, a); }
  aiWheelGeo = B.build();
  return aiWheelGeo;
}
const BODY_COL = ['#16171a', '#e9e9e6', '#c42a2a', '#2a5fb4', '#2f8a4a', '#e6a21e', '#7a7f86'];
const JACKET = ['#c9482b', '#2f6aa6', '#e2c13a', '#3a8a55', '#8a3a8a', '#3c4048', '#d6d6d2', '#e0702a'];
const SKINS = ['#e8bd9a', '#c98d62', '#8d5a3b', '#f1cfb2'];

function buildAiScooter(M, rnd) {
  const set = new BatchSet(); const B = set.get('body'), LT = set.get('light');
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const body = pick(BODY_COL), jacket = pick(JACKET), pants = pick(['#1c1f26', '#2b3550', '#3a3a3e', '#4a3f35']);
  const dark = '#17181b';
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // deck + frame
  B.box(0, 0.18, -0.04, 0.2, 0.07, 0.72, dark);
  B.box(0, 0.218, -0.06, 0.18, 0.012, 0.6, '#2b2c30');
  B.box(0, 0.145, -0.04, 0.17, 0.04, 0.6, body);
  // stem + bars + display
  limbTo(B, V(0, 0.14, 0.58), V(0, 1.1, 0.31), 0.026, dark);
  limbTo(B, V(0.065, 0.14, 0.58), V(0.065, 0.36, 0.545), 0.016, '#9a9ea3');
  limbTo(B, V(-0.065, 0.14, 0.58), V(-0.065, 0.36, 0.545), 0.016, '#9a9ea3');
  B.box(0, 1.12, 0.3, 0.62, 0.022, 0.022, dark);
  for (const sx of [-1, 1]) { B.box(sx * 0.27, 1.12, 0.3, 0.12, 0.034, 0.034, '#101012'); B.box(sx * 0.2, 1.1, 0.34, 0.012, 0.012, 0.12, '#aaaeb2'); }
  B.box(0, 1.16, 0.29, 0.1, 0.06, 0.02, '#111'); B.box(0, 1.165, 0.278, 0.08, 0.04, 0.004, '#2f9fcf');
  B.box(0, 0.5, 0.42, 0.075, 0.07, 0.07, body);
  LT.box(0, 0.73, 0.45, 0.09, 0.04, 0.03, '#ffffff');
  // fenders + tail light + rear shock
  partAt(B, new THREE.BoxGeometry(0.1, 0.012, 0.3), 0, 0.31, 0.58, dark, 1, 1, 1, 0);
  partAt(B, new THREE.BoxGeometry(0.1, 0.012, 0.34), 0, 0.3, -0.62, dark, 1, 1, 1, 0.1);
  B.box(0, 0.27, -0.8, 0.1, 0.03, 0.02, '#c01818');
  limbTo(B, V(0, 0.24, -0.4), V(0, 0.2, -0.55), 0.016, body);
  // rider
  const hip = [V(0.09, 0.84, -0.2), V(-0.09, 0.84, -0.2)], foot = [V(0.05, 0.28, 0.06), V(-0.05, 0.28, -0.28)];
  const knee = V(0, 0, 0);
  for (let i = 0; i < 2; i++) {
    ik2(hip[i], foot[i].clone().add(V(0, 0.05, -0.04)), 0.42, 0.42, V(i ? -0.15 : 0.15, 0.1, 1), knee);
    limbTo(B, hip[i], knee, 0.07, pants);
    limbTo(B, knee, foot[i].clone().add(V(0, 0.05, -0.04)), 0.052, pants);
    B.box(foot[i].x, foot[i].y - 0.01, foot[i].z + 0.06, 0.095, 0.06, 0.25, i ? '#2e2e33' : '#e6e6e6');
  }
  const tq = 0.45;
  const torso = new THREE.CapsuleGeometry(0.125, 0.25, 4, 12);
  partAt(B, torso, 0, 1.08, -0.1, jacket, 1.2, 1, 0.78, tq);
  if (rnd() < 0.55) B.box(0, 1.16, -0.25, 0.32, 0.4, 0.19, pick(['#ff7a1a', '#1d1d20', '#d8d8d4']));
  const shoulder = [V(0.2, 1.33, -0.03), V(-0.2, 1.33, -0.03)], grip = [V(0.265, 1.11, 0.29), V(-0.265, 1.11, 0.29)];
  for (let i = 0; i < 2; i++) {
    ik2(shoulder[i], grip[i], 0.3, 0.3, V(i ? -0.45 : 0.45, -0.55, -0.45), knee);
    limbTo(B, shoulder[i], knee, 0.052, jacket);
    limbTo(B, knee, grip[i], 0.042, jacket);
    partAt(B, new THREE.SphereGeometry(0.04, 8, 6), grip[i].x, grip[i].y, grip[i].z, '#141517');
  }
  // head: helmet / balaclava / bare
  const skin = pick(SKINS);
  const headY = 1.53, headZ = 0.05;
  const style = rnd();
  partAt(B, new THREE.SphereGeometry(0.1, 12, 10), 0, headY, headZ, style < 0.35 ? '#0d0d0f' : skin, 1, 1.1, 1.06);
  partAt(B, new THREE.CylinderGeometry(0.06, 0.075, 0.14, 8), 0, headY - 0.11, headZ - 0.02, style < 0.35 ? '#0d0d0f' : skin);
  if (style < 0.35) B.box(0, headY + 0.012, headZ + 0.09, 0.12, 0.035, 0.02, skin);
  if (style < 0.85) partAt(B, new THREE.SphereGeometry(0.125, 12, 8, 0, 6.283, 0, 1.8), 0, headY + 0.014, headZ, pick(['#f2f2f0', '#c42a2a', '#16171a', '#2a5fb4', '#e6a21e']), 1, 1.04, 1.1);
  else B.box(0, headY + 0.04, headZ - 0.005, 0.2, 0.09, 0.2, pick(['#2a2f3a', '#6a4a30']));
  const g = new THREE.Group();
  const tilt = new THREE.Group();
  g.add(tilt);
  const bm = new THREE.Mesh(B.build(), M.generic); bm.castShadow = true; bm.receiveShadow = true;
  tilt.add(bm);
  const lm = new THREE.Mesh(LT.build(), M.lampW); tilt.add(lm);
  const wg = wheelGeometry();
  const wf = new THREE.Mesh(wg, M.generic), wr = new THREE.Mesh(wg, M.generic);
  wf.position.set(0, 0.138, 0.58); wr.position.set(0, 0.138, -0.58);
  wf.castShadow = wr.castShadow = true;
  tilt.add(wf, wr);
  return { group: g, tilt, wf, wr, L: 1.7, W: 0.6 };
}

export class Traffic {
  constructor(scene, M, count = 12, riders = 8) {
    this.scene = scene;
    this.M = M;
    this.rnd = mulberry32(99);
    this.cars = [];
    this.count = count;
    this.dyn = [];
    this.time = 0;
    for (let i = 0; i < count + riders; i++) {
      const isRider = i >= count;
      const bus = !isRider && i % 6 === 5;
      const c = isRider ? buildAiScooter(M, this.rnd) : buildVehicleMeshes(M, this.rnd, bus);
      c.group.visible = false;
      scene.add(c.group);
      this.cars.push({ ...c, active: false, bus, kind: isRider ? 'scooter' : 'car', laneOff: isRider ? 3.1 : LANE, s: 0, v: 0, axis: 'x', dir: 1, lane: 0, cruise: 10, wait: 0, down: 0, phase: Math.random() * 6, fall: 0 });
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
      const lane = axis === 'x' ? line * P + dir * c.laneOff : line * P - dir * c.laneOff;
      // keep spacing in lane
      let ok = true;
      for (const o of this.cars) {
        if (!o.active || o === c || o.axis !== axis || o.dir !== dir || Math.abs(o.lane - lane) > 0.5) continue;
        if (Math.abs(o.s - s) < (c.kind === 'scooter' ? 12 : 22)) { ok = false; break; }
      }
      // not too close to the player
      const wx = axis === 'x' ? s : lane, wz = axis === 'x' ? lane : s;
      if (Math.hypot(wx - px, wz - pz) < 50) ok = false;
      if (!ok) continue;
      Object.assign(c, { active: true, axis, dir, lane, s, v: 0, cruise: c.kind === 'scooter' ? 4.5 + rnd() * 7 : 8.5 + rnd() * 3.5, wait: 0, down: 0, fall: 0 });
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
      const isS = c.kind === 'scooter';
      const consider = (ox, oz, ov, thr) => {
        const along = c.axis === 'x' ? (ox - c.s) * c.dir : (oz - c.s) * c.dir;
        const lat = c.axis === 'x' ? Math.abs(oz - c.lane) : Math.abs(ox - c.lane);
        if (along <= 0 || along > look || lat > thr) return;
        const gap = along - c.L / 2 - 1.2;
        vt = Math.min(vt, Math.max(0, ov + (gap - 4) * 0.7), Math.sqrt(Math.max(0, 2 * 3 * (gap - 1.5))));
      };
      for (const o of this.cars) {
        if (o === c || !o.active) continue;
        const ox = o.axis === 'x' ? o.s : o.lane, oz = o.axis === 'x' ? o.lane : o.s;
        const ov = o.axis === c.axis && o.dir === c.dir ? o.v : 0;
        const thr = isS ? 0.9 : o.kind === 'scooter' ? (o.down > 0 ? 1.7 : 1.0) : 1.9;
        consider(ox, oz, ov, thr);
      }
      consider(px, pz, Math.max(0, player.v * 0.2), isS ? 0.9 : 1.45);
      if (this.peds) for (const p of this.peds.list) if (p.active) consider(p.x, p.z, 0, isS ? 0.9 : 1.35);
      if (c.down > 0) { c.down -= dt; vt = 0; }
      // --- integrate
      const a = clamp((vt - c.v) * 1.4, -6, c.kind === 'scooter' ? 1.6 : 2.0);
      c.v = Math.max(0, c.v + a * dt);
      c.s += c.dir * c.v * dt;
      // --- transform
      const x = c.axis === 'x' ? c.s : c.lane, z = c.axis === 'x' ? c.lane : c.s;
      c.group.position.set(x, 0, z);
      c.group.rotation.y = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      if (c.kind === 'scooter') {
        c.phase += dt;
        c.fall = damp(c.fall, c.down > 0 ? 1 : 0, 6, dt);
        c.tilt.rotation.z = Math.sin(c.phase * 1.3) * 0.03 * Math.min(1, c.v / 4) + c.fall * 1.45;
        c.tilt.position.y = c.fall * 0.2;
        const ang = (c.v * dt) / 0.138;
        c.wf.rotation.x += ang; c.wr.rotation.x += ang;
      }
      // collision circles
      const vx = c.axis === 'x' ? c.dir * c.v : 0, vz = c.axis === 'z' ? c.dir * c.v : 0;
      const n = Math.max(3, Math.round(c.L / 1.8));
      const r = c.W / 2 + 0.05;
      for (let i = 0; i < n; i++) {
        const t = (-0.5 + (i + 0.5) / n) * (c.L - r);
        this.dyn.push({ x: c.axis === 'x' ? x + t : x, z: c.axis === 'x' ? z : z + t, r, vx, vz, ped: c.kind === 'scooter' ? c : undefined });
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

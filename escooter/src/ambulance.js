import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { addCar } from './cars.js';
import { P } from './world.js';
import { Walker } from './walker.js';
import { mulberry32, clamp } from './util.js';

const LANE = 1.75, KERB = 4.6;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function buildAmbulance(M, glowTex) {
  const S = new BatchSet();
  const rnd = mulberry32(5);
  const { L, W, H } = addCar(S, rnd, { type: 0.9, color: '#f6f6f3', lights: 'lampW', people: true });
  const PA = S.get('paint'), G = S.get('generic');
  const g = new THREE.Group();
  for (const sx of [-1, 1]) { // reflective high-vis stripes + red cross
    PA.box(sx * (W / 2 + 0.004), 0.62, 0, 0.012, 0.16, L * 0.96, '#e8c020');
    PA.box(sx * (W / 2 + 0.004), 0.48, 0, 0.012, 0.06, L * 0.96, '#2a9a3a');
    PA.box(sx * (W / 2 + 0.01), 1.2, -L * 0.18, 0.012, 0.44, 0.12, '#d42020'); PA.box(sx * (W / 2 + 0.01), 1.2, -L * 0.18, 0.012, 0.12, 0.44, '#d42020');
  }
  PA.box(0, H - 0.01, -L * 0.1, W * 0.7, 0.04, L * 0.5, '#f6f6f3');
  const yr = H + 0.02, mats = [new THREE.MeshBasicMaterial({ color: 0x1a4cff, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x1a4cff, toneMapped: false })];
  G.box(0, yr + 0.04, L * 0.18, W * 0.8, 0.08, 0.3, '#1a1b1e');
  for (const [k, b] of Object.entries(S.b)) {
    if (b.empty) continue;
    const m = new THREE.Mesh(b.build(), M[{ paint: 'paint', glass: 'glass', cglass: 'carGlass', generic: 'generic', lampW: 'lampW' }[k]]);
    m.castShadow = k !== 'glass' && k !== 'cglass' && k !== 'lampW'; m.receiveShadow = true; g.add(m);
  }
  const lens = [];
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(W * 0.36, 0.08, 0.26), mats[sx > 0 ? 0 : 1]); l.position.set(sx * W * 0.2, yr + 0.08, L * 0.18); g.add(l); lens.push(l); }
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), mats[sx > 0 ? 0 : 1]); f.position.set(sx * 0.45, 0.66, L / 2 + 0.012); g.add(f); const r = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), mats[sx > 0 ? 1 : 0]); r.position.set(sx * 0.5, 1.45, -L / 2 - 0.012); g.add(r); }
  const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '900 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#c01818'; x.fillText('KRANKENWAGEN', 128, 34); return c; })());
  tex.colorSpace = THREE.SRGBColorSpace;
  const dm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), dm); d.position.set(sx * (W / 2 + 0.02), 0.95, L * 0.12); d.rotation.y = sx * Math.PI / 2; g.add(d); }
  const glows = [];
  for (const sx of [-1, 1]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3a6bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); sp.scale.set(4, 4, 1); sp.position.set(sx * W * 0.2, yr + 0.4, L * 0.18); g.add(sp); glows.push(sp); }
  return { group: g, L, W, H, mats, glows };
}

function stretcher() {
  const g = new THREE.Group();
  const std = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const mk = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  mk(new THREE.BoxGeometry(0.62, 0.05, 1.9), std(0x2b2e34), 0, 0, 0);
  mk(new THREE.BoxGeometry(0.58, 0.07, 1.8), std(0xe9eef2), 0, 0.06, 0);
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.7, 0.7]) mk(new THREE.BoxGeometry(0.04, 0.45, 0.04), std(0x9aa0a6, 0.3), sx, -0.22, sz);
  // the injured person lying under a blanket
  mk(new THREE.BoxGeometry(0.46, 0.14, 1.1), std(0xd8d8d0), 0, 0.15, -0.28);
  mk(new THREE.SphereGeometry(0.11, 8, 6), std(0xc89878), 0, 0.17, 0.4);
  mk(new THREE.BoxGeometry(0.44, 0.01, 0.4), std(0xb02020), 0, 0.225, -0.35);
  return g;
}

/** Ambulance service: drives to a victim, medics load them on a stretcher, drives away. */
export class Emergency {
  constructor(scene, M, glowTex) {
    this.scene = scene;
    this.amb = buildAmbulance(M, glowTex);
    this.amb.group.visible = false; scene.add(this.amb.group);
    this.medics = [0, 1].map(() => new Walker(scene, { jacket: 0xe8d020, pants: 0x20252e, helmet: 0xffffff, pack: null }));
    this.carry = stretcher(); this.carry.visible = false; scene.add(this.carry);
    this.jobs = []; this.job = null; this.state = 'idle'; this.t = 0; this.time = 0; this.v = 0; this.s = 0; this.dyn = [];
    this.onTaken = null;
  }
  call(ped) { if (!this.jobs.includes(ped) && (!this.job || this.job.ped !== ped)) this.jobs.push(ped); }
  get active() { return this.state !== 'idle'; }
  get position() { return this.state === 'idle' ? null : this.amb.group.position; }
  _start(ped) {
    const axis = ped.axis, side = Math.sign(ped.lane - Math.round(ped.lane / P) * P) || 1, line = Math.round(ped.lane / P) * P;
    const dir = axis === 'x' ? side : -side;
    this.job = { ped, vx: ped.x, vz: ped.z, axis, side, line, dir, stop: (axis === 'x' ? ped.x : ped.z) - dir * 2.4 };
    this.s = this.job.stop - dir * 190; this.v = 0; this.state = 'drive'; this.t = 0;
    this.amb.group.visible = true;
    this._place(false);
  }
  _lat(k) { const j = this.job; return j.line + j.side * (LANE + (KERB - LANE) * k); }
  _place(par) {
    const j = this.job, g = this.amb.group;
    const k = par ? 1 : smooth(1 - Math.abs(j.stop - this.s) / 32);
    const lat = this.state === 'leave' ? this._lat(smooth(1 - this.t / 3)) : this._lat(k);
    const x = j.axis === 'x' ? this.s : lat, z = j.axis === 'x' ? lat : this.s;
    g.position.set(x, 0, z);
    g.rotation.y = j.axis === 'x' ? (j.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (j.dir > 0 ? 0 : Math.PI);
    this.x = x; this.z = z;
  }
  _rear() { const j = this.job, back = this.amb.L / 2 + 0.9; const lat = this._lat(1); return j.axis === 'x' ? [this.s - j.dir * back, lat + j.side * 0.0] : [lat, this.s - j.dir * back]; }
  update(dt, traffic) {
    this.time += dt;
    const A = this.amb, flash = Math.floor(this.time * 6) % 2 === 0;
    this.dyn.length = 0;
    if (this.state === 'idle') {
      if (this.jobs.length) this._start(this.jobs.shift());
      A.glows.forEach((g) => (g.material.opacity = 0));
      return;
    }
    A.mats[0].color.setHex(flash ? 0x4d7bff : 0x0a1a66); A.mats[1].color.setHex(flash ? 0x0a1a66 : 0x4d7bff);
    A.glows[0].material.opacity = flash ? 0.9 : 0; A.glows[1].material.opacity = flash ? 0 : 0.9;
    const j = this.job; this.t += dt;
    const cruise = 16;
    const carAhead = (lim) => { // slow down behind traffic
      if (!traffic) return Infinity;
      let v = Infinity;
      for (const c of traffic.cars) {
        if (!c.active || c.kind === 'police' || c.axis !== j.axis || c.dir !== j.dir || Math.abs(c.lane - this.lat0) > 2.6) continue;
        const gap = (c.s - this.s) * j.dir - c.L / 2 - A.L / 2 - 1; if (gap > -2 && gap < lim) v = Math.min(v, gap < 3 ? 0 : c.v + (gap - 3) * 0.5);
      }
      return v;
    };
    if (this.state === 'drive') {
      this.lat0 = j.line + j.side * LANE;
      const dist = (j.stop - this.s) * j.dir;
      const vt = Math.min(cruise, Math.sqrt(Math.max(0, 2 * 3.2 * Math.max(0, dist))) + 0.3, carAhead(18));
      this.v += clamp(vt - this.v, -7 * dt, 4 * dt);
      this.s += j.dir * this.v * dt;
      if (dist < 0.8 && this.v < 1.2) { this.state = 'medics'; this.t = 0; this.phase = 0; this.v = 0; this._startMedics(); }
      this._place(false);
    } else if (this.state === 'medics') {
      this._place(true);
      this._medics(dt);
    } else if (this.state === 'leave') {
      this.lat0 = j.line + j.side * LANE;
      const vt = Math.min(cruise, 2 + this.t * 3.5, carAhead(18));
      this.v += clamp(vt - this.v, -7 * dt, 4 * dt);
      this.s += j.dir * this.v * dt;
      this._place(false);
      if ((this.s - j.stop) * j.dir > 200) { A.group.visible = false; this.state = 'idle'; this.job = null; }
    }
    // collision body for the player's scooter + a hint for traffic
    if (this.state !== 'idle') {
      const g = A.group, fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y);
      for (const o of [-1.8, -0.6, 0.6, 1.8]) this.dyn.push({ x: g.position.x + fx * o, z: g.position.z + fz * o, r: 0.95, vx: fx * this.v, vz: fz * this.v });
    }
  }
  _startMedics() {
    const [rx, rz] = this._rear();
    this.phase = 'out';
    this.mpos = [[rx - 0.4, rz], [rx + 0.4, rz]];
    this.medics.forEach((m) => m.setVisible(true));
  }
  _medics(dt) {
    const j = this.job, ped = j.ped, [rx, rz] = this._rear();
    const tx = j.vx, tz = j.vz;
    const speed = 2.7;
    const mv = (i, gx, gz) => { const m = this.mpos[i]; const dx = gx - m[0], dz = gz - m[1], d = Math.hypot(dx, dz); if (d < 0.05) return true; const st = Math.min(d, speed * dt); m[0] += (dx / d) * st; m[1] += (dz / d) * st; this.medics[i].yaw = Math.atan2(dx, dz); this.medics[i].phase += dt * 9; return d - st < 0.08; };
    const show = (i, anim, lean = 0) => { const w = this.medics[i]; w.x = this.mpos[i][0]; w.z = this.mpos[i][1]; w.speed = anim; w.running = false; w.y = 0; w.pos0 = lean; w.apply(); if (lean) { w.model.torso.rotation.x = lean; w.model.arms[0].rotation.x = -1.3; w.model.arms[1].rotation.x = -1.3; } };
    if (this.phase === 'out') {
      const a = mv(0, tx - 0.8, tz - 0.3), b = mv(1, tx + 0.8, tz + 0.3);
      show(0, 1.6); show(1, 1.6);
      if (a && b) { this.phase = 'treat'; this.t = 0; }
    } else if (this.phase === 'treat') {
      this.medics.forEach((m, i) => { m.yaw = Math.atan2(tx - this.mpos[i][0], tz - this.mpos[i][1]); show(i, 0, 0.9); });
      if (this.t > 2.4) { this.phase = 'load'; this.t = 0; ped.taken = true; ped.active = false; ped.down = 0; ped.ko = false; this.carry.visible = true; }
    } else if (this.phase === 'load') {
      // carry the stretcher back: medics at both ends
      const dx = rx - this.carryX, dz = rz - this.carryZ;
      if (this.carryX === undefined) { this.carryX = tx; this.carryZ = tz; }
      const ddx = rx - this.carryX, ddz = rz - this.carryZ, d = Math.hypot(ddx, ddz);
      const st = Math.min(d, 1.9 * dt);
      if (d > 0.05) { this.carryX += (ddx / d) * st; this.carryZ += (ddz / d) * st; }
      const yaw = Math.atan2(ddx, ddz), fx = Math.sin(yaw), fz = Math.cos(yaw);
      this.carry.position.set(this.carryX, 0.82, this.carryZ); this.carry.rotation.y = yaw;
      for (let i = 0; i < 2; i++) { const sg = i ? -1 : 1; this.mpos[i][0] = this.carryX + fx * 1.05 * sg; this.mpos[i][1] = this.carryZ + fz * 1.05 * sg; const w = this.medics[i]; w.yaw = yaw; w.phase += dt * 6; w.x = this.mpos[i][0]; w.z = this.mpos[i][1]; w.speed = 1.2; w.running = false; w.apply(); w.model.arms[0].rotation.x = -0.9; w.model.arms[1].rotation.x = -0.9; }
      if (d < 0.1) { this.phase = 'in'; this.t = 0; this.carry.visible = false; this.carryX = undefined; this.medics.forEach((m) => m.setVisible(false)); }
    } else if (this.phase === 'in') {
      if (this.t > 1.2) { this.state = 'leave'; this.t = 0; if (this.onTaken) this.onTaken(ped); }
    }
  }
}

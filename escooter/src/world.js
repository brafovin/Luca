import * as THREE from 'three';
import { BatchSet, shade, geometryFromArrays } from './batch.js';
import { mulberry32, hash2, clamp } from './util.js';
import { addCar } from './cars.js';

export const P = 100; // grid pitch (m)
export const RH = 5.9; // half width of asphalt (roadway + parking strips)
export const LOT0 = 9.1; // first lot coordinate (after 3.2 m sidewalk)
export const LOT1 = P - LOT0;
export const CURB = 0.12;
export const RC = 4; // corner radius of the raised block
export const FLOOR = 3.2;

/* ------------------------------------------------------------------ terrain */
function sdRounded(lx, lz) {
  const hb = P / 2 - RH; // half size
  const qx = Math.abs(lx - P / 2) - (hb - RC), qz = Math.abs(lz - P / 2) - (hb - RC);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - RC;
}
export function bumpFlag(ci, cj, axis) {
  return hash2(ci, cj, axis === 'x' ? 11 : 12) < 0.22;
}
function bumpProfile(t) {
  const a = Math.abs(t);
  return a < 1 ? 0.07 : a < 1.6 ? 0.07 * (1.6 - a) / 0.6 : 0;
}
export function groundHeight(x, z) {
  const ci = Math.floor((x + RH) / P), cj = Math.floor((z + RH) / P);
  const lx = x - ci * P, lz = z - cj * P;
  if (lx > RH - 0.2 && lz > RH - 0.2) {
    const d = sdRounded(lx, lz);
    return CURB * clamp((0.1 - d) / 0.1, 0, 1);
  }
  let h = 0;
  if (Math.abs(lz) < 3.5 && lx > 20 && lx < 80 && bumpFlag(ci, cj, 'x')) h = bumpProfile(lx - 50);
  else if (Math.abs(lx) < 3.5 && lz > 20 && lz < 80 && bumpFlag(ci, cj, 'z')) h = bumpProfile(lz - 50);
  return h;
}

export function blockType(i, j) {
  if (i === 0 && j === 0) return 'perimeter';
  if (i === 0 && j === -1) return 'houses';
  const h = hash2(i, j, 7);
  if (h < 0.44) return 'perimeter';
  if (h < 0.64) return 'houses';
  if (h < 0.76) return 'park';
  if (h < 0.88) return 'modern';
  return 'shop';
}
export function hasStation(i, j) {
  return hash2(i, j, 21) < 0.22 || (i === 1 && j === 0);
}

/* ---------------------------------------------------------------- colliders */
export class Colliders {
  constructor() { this.cell = 16; this.map = new Map(); }
  _key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }
  add(c) {
    const bx0 = c.t === 0 ? c.x0 : c.x - c.r, bx1 = c.t === 0 ? c.x1 : c.x + c.r;
    const bz0 = c.t === 0 ? c.z0 : c.z - c.r, bz1 = c.t === 0 ? c.z1 : c.z + c.r;
    c.keys = [];
    for (let ix = Math.floor(bx0 / this.cell); ix <= Math.floor(bx1 / this.cell); ix++)
      for (let iz = Math.floor(bz0 / this.cell); iz <= Math.floor(bz1 / this.cell); iz++) {
        const k = this._key(ix, iz);
        let a = this.map.get(k);
        if (!a) this.map.set(k, (a = []));
        a.push(c);
        c.keys.push(k);
      }
  }
  remove(c) {
    for (const k of c.keys) {
      const a = this.map.get(k);
      if (!a) continue;
      const i = a.indexOf(c);
      if (i >= 0) a.splice(i, 1);
      if (!a.length) this.map.delete(k);
    }
  }
  /** Calls fn(c) for every collider whose bucket overlaps the circle. */
  near(x, z, r, fn) {
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let ix = Math.floor((x - r) / this.cell); ix <= Math.floor((x + r) / this.cell); ix++)
      for (let iz = Math.floor((z - r) / this.cell); iz <= Math.floor((z + r) / this.cell); iz++) {
        const a = this.map.get(this._key(ix, iz));
        if (!a) continue;
        for (const c of a) if (!seen.has(c)) { seen.add(c); fn(c); }
      }
  }
}

/* ---------------------------------------------------------------- geometry helpers */
const roundedRectPts = (x0, z0, x1, z1, r, seg = 6) => {
  const pts = [];
  const corners = [[x1 - r, z0 + r, -Math.PI / 2], [x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI]];
  for (const [cx, cz, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  return pts;
};

const blobGeos = [];
(function initBlobs() {
  for (let s = 0; s < 3; s++) {
    const g = new THREE.SphereGeometry(1, 8, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.16 * Math.sin(x * 3.1 + s * 1.7) * Math.cos(z * 2.7 + s) + 0.1 * Math.sin(y * 4.3 + s * 2.3 + x * 2);
      p.setXYZ(i, x * n, y * n * 0.92, z * n);
    }
    g.computeVertexNormals();
    blobGeos.push(g);
  }
})();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
function blob(B, x, y, z, rx, ry, rz, col, rnd) {
  _q.setFromEuler(_e.set(0, rnd() * 6.28, 0));
  _m4.compose(_p.set(x, y, z), _q, _s.set(rx, ry, rz));
  B.geo(blobGeos[Math.floor(rnd() * 3)], _m4, col, 0.55);
}

const PLASTER = ['#f1e9d6', '#e9d8a6', '#e0bd9a', '#c9d6c0', '#c4d4e6', '#f0f0ee', '#e4bfb2', '#e2c9a8', '#bcae9f', '#d7dfe6'];
const BRICKT = ['#ffffff', '#e8d8d0', '#f4dccc'];
const ROOFCOL = ['#a8442b', '#9c3b25', '#b45a35', '#5b5e63', '#4a4d52', '#7a3a2a'];
const GREEN = ['#4f7a34', '#5d8a3a', '#48702f', '#6b8f3c', '#557f3a'];
const AUTUMN = ['#b8a030', '#c9892b', '#a8602a', '#8e9a34', '#d2a62e'];
const DOORS = ['#3b2f2a', '#2d3f4f', '#5a2a24', '#2b2d30', '#3d5a3d', '#7a5a34'];

/* ---------------------------------------------------------------- chunk builder */
class ChunkBuilder {
  constructor(ci, cj) {
    this.ci = ci; this.cj = cj;
    this.rnd = mulberry32((ci * 73856093) ^ (cj * 19349663) ^ 0x5eed);
    this.S = new BatchSet();
    this.S.ox = ci * P; this.S.oz = cj * P;
    this.colliders = [];
    this.lamps = [];
    this.glowPts = [];
    this.glowG = [];
    this.stations = [];
    this.rot = 0; // 1 = road frame rotated for the z-road
    this.rotM = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
    this.tlampBatch = null;
  }
  b(n) { return this.S.get(n); }
  // frame transform (local x-road frame -> chunk)
  tp(x, z) { return this.rot ? [-z, x] : [x, z]; }
  frame(rot) { this.rot = rot; this.S.setTransform(rot ? this.rotM : null); }
  box2(x0, z0, x1, z1) {
    if (this.rot) { const a = this.tp(x0, z0), b = this.tp(x1, z1); this.colliders.push({ t: 0, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }); }
    else this.colliders.push({ t: 0, x0, x1, z0, z1 });
  }
  circ(x, z, r) { const p = this.tp(x, z); this.colliders.push({ t: 1, x: p[0], z: p[1], r }); }
  lamp(x, y, z) { const p = this.tp(x, z); this.lamps.push(new THREE.Vector3(p[0], y, p[1])); this.glowPts.push(p[0], y, p[1]); }

  /* ---------- ground, roads ---------- */
  ground() {
    const { S, rnd } = this;
    const A = this.b('asphalt');
    const n = 5, x0 = -RH, step = P / n;
    for (let ix = 0; ix < n; ix++) for (let iz = 0; iz < n; iz++) {
      const f = 0.9 + rnd() * 0.14;
      A.plane(x0 + ix * step, x0 + iz * step, x0 + (ix + 1) * step, x0 + (iz + 1) * step, 0, [f, f, f], 5);
    }
    // raised block with rounded corners + chamfered curbs
    const ring = roundedRectPts(RH, RH, P - RH, P - RH, RC, 6);
    this.b('paver').fan(ring, CURB, [0.96, 0.96, 0.95], 2);
    const G = this.b('generic');
    const ctr = [P / 2, CURB / 2, P / 2];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], bb = ring[(k + 1) % ring.length];
      const dx = bb[0] - a[0], dz = bb[1] - a[1], l = Math.hypot(dx, dz) || 1;
      let nx = dz / l, nz = -dx / l;
      if (nx * ((a[0] + bb[0]) / 2 - P / 2) + nz * ((a[1] + bb[1]) / 2 - P / 2) < 0) { nx = -nx; nz = -nz; }
      const o = 0.1;
      G.quad([a[0] + nx * o, 0, a[1] + nz * o], [bb[0] + nx * o, 0, bb[1] + nz * o], [bb[0], CURB, bb[1]], [a[0], CURB, a[1]], '#a8a8a2', null, ctr);
    }
    // lawn / garden overlay
    const t = blockType(this.ci, this.cj);
    this.b('grass').plane(LOT0, LOT0, LOT1, LOT1, CURB + 0.004, t === 'modern' || t === 'shop' ? [0.8, 0.85, 0.78] : [1, 1, 1], 4);
  }

  markings() {
    const { rnd } = this;
    const M = this.b('mark');
    const W = '#e9e9e4', Y = '#d8c36a';
    for (let rot = 0; rot < 2; rot++) {
      this.frame(rot);
      const y = 0.013;
      // dashed centre line
      for (let x = 14; x < 86; x += 9) M.plane(x, -0.07, x + 3.2, 0.07, y, W);
      // parking lane edges
      M.plane(12, 3.44, 88, 3.54, y, '#cfcfca');
      M.plane(12, -3.54, 88, -3.44, y, '#cfcfca');
      // zebra + stop lines at both ends
      for (const end of [0, 1]) {
        const s = end === 0 ? 1 : -1, base = end === 0 ? 0 : P;
        const xa = base + s * 7.2, xb = base + s * 10.2;
        for (let z = -3.2; z < 3.3; z += 1.0) M.plane(Math.min(xa, xb), z, Math.max(xa, xb), z + 0.5, y, W);
        const sx = base + s * 11.2;
        // stop line on the approaching lane: traffic towards the intersection keeps right
        const zl = end === 0 ? [-3.4, -0.15] : [0.15, 3.4];
        M.plane(sx - 0.2, zl[0], sx + 0.2, zl[1], y, W);
      }
    }
    this.frame(0);
    // speed bumps (visual)
    for (const axis of ['x', 'z']) {
      if (!bumpFlag(this.ci, this.cj, axis)) continue;
      this.frame(axis === 'x' ? 0 : 1);
      const G = this.b('generic');
      for (const [z0, z1] of [[-3.4, -0.2], [0.2, 3.4]]) {
        const h = 0.07;
        const ref = [50, 0, (z0 + z1) / 2];
        G.quad([48.4, 0, z0], [48.4, 0, z1], [49, h, z1], [49, h, z0], '#6f5149', null, ref);
        G.quad([49, h, z0], [49, h, z1], [51, h, z1], [51, h, z0], '#7d5c52', null, ref);
        G.quad([51, h, z0], [51, h, z1], [51.6, 0, z1], [51.6, 0, z0], '#6f5149', null, ref);
        G.quad([48.4, 0, z0], [49, h, z0], [51, h, z0], [51.6, 0, z0], '#6f5149', null, ref);
        G.quad([48.4, 0, z1], [51.6, 0, z1], [51, h, z1], [49, h, z1], '#6f5149', null, ref);
        for (let x = 49.2; x < 51; x += 0.5) M.quad([x, h + 0.004, z0], [x, h + 0.004, z1], [x + 0.25, h + 0.004, z1], [x + 0.25, h + 0.004, z0], '#e8e4d8');
      }
    }
    this.frame(0);
    // manholes
    const G = this.b('generic');
    for (let k = 0; k < 3; k++) {
      const x = 20 + rnd() * 60, z = (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 2), rot = rnd() < 0.5 ? 0 : 1;
      this.frame(rot);
      G.cyl(x, 0.0, z, 0.32, 0.014, '#2d2e30', 10);
    }
    this.frame(0);
  }

  /* ---------- street furniture ---------- */
  streetItems() {
    const { rnd } = this;
    for (let rot = 0; rot < 2; rot++) {
      this.frame(rot);
      const G = this.b('generic'), L = this.b('lampW'), Pool = this.b('pool');
      // lamps (both sides, 30 m apart)
      for (const side of [1, -1]) {
        for (const s of [20, 50, 80]) {
          const px = s, pz = side * 6.5;
          G.cyl(px, CURB, pz, 0.12, 0.35, '#2a2d31', 8, true, 0.12);
          G.cyl(px, CURB, pz, 0.07, 7.4, '#33363b', 8, true, 0.055);
          // arm towards road
          G.box(px, 7.35, pz - side * 0.9, 0.09, 0.09, 1.9, '#33363b');
          L.box(px, 7.28, pz - side * 1.8, 0.32, 0.12, 1.0, '#ffffff');
          Pool.plane(px - 8, pz - side * 1.8 - 8, px + 8, pz - side * 1.8 + 8, 0.126, '#ffffff');
          this.lamp(px, 7.2, pz - side * 1.8);
          this.circ(px, pz, 0.18);
        }
      }
      // trees
      for (const side of [1, -1]) for (const s of [34, 66]) {
        if (rnd() < 0.15) continue;
        const [px, pz] = [s + (rnd() - 0.5) * 3, side * 7.4];
        this.tree(px, pz, CURB);
      }
      // bus stop
      if (hash2(this.ci, this.cj, 31 + rot) < 0.3) this.busStop(rot);
      // parked cars
      for (const side of [1, -1]) {
        for (let k = 0; k < 13; k++) {
          const s = 15 + k * 5.7 + (rnd() - 0.5) * 0.5;
          if (rnd() < 0.42) continue;
          if (hash2(this.ci, this.cj, 31 + rot) < 0.3 && side === 1 && s > 53 && s < 63) continue;
          this.car(s, side * 4.7, side === 1 ? 1 : -1, rot);
        }
      }
      // bins
      for (let k = 0; k < 2; k++) {
        const s = 25 + rnd() * 50, side = rnd() < 0.5 ? 1 : -1, z = side * 8.7;
        G.cyl(s, CURB, z, 0.25, 0.9, '#2f4a3a', 8);
        G.box(s, CURB + 0.95, z, 0.56, 0.08, 0.56, '#3a3d40');
        this.circ(s, z, 0.28);
      }
    }
    this.frame(0);
  }

  busStop(rot) {
    const G = this.b('generic'), GL = this.b('glass');
    const cx = 58, cz = 8.0;
    G.box(cx, CURB + 2.55, cz, 3.8, 0.1, 1.5, '#2a2e33');
    for (const dx of [-1.8, 1.8]) G.box(cx + dx, CURB + 1.25, cz - 0.6, 0.08, 2.5, 0.08, '#2a2e33');
    GL.box(cx, CURB + 1.3, cz + 0.68, 3.6, 2.2, 0.04, '#ffffff');
    G.box(cx, CURB + 0.5, cz + 0.4, 2.4, 0.07, 0.4, '#6a4a2c');
    G.box(cx + 2.6, CURB + 1.4, cz - 0.4, 0.07, 2.8, 0.07, '#444');
    G.cyl(cx + 2.6, CURB + 2.5, cz - 0.4, 0.28, 0.04, '#2b9a4b', 12);
    this.box2(cx - 1.9, cz + 0.55, cx + 1.9, cz + 0.8);
    this.box2(cx + 2.5, cz - 0.5, cx + 2.7, cz - 0.3);
  }

  tree(px, pz, y0) {
    const { rnd } = this;
    const G = this.b('generic'), F = this.b('foliage');
    const kind = rnd();
    const [wx, wz] = this.tp(px, pz);
    const autumn = hash2(Math.floor(wx / 30) + this.ci * 7, Math.floor(wz / 30) + this.cj * 5, 3) < 0.4;
    const col = (autumn ? AUTUMN : GREEN)[Math.floor(rnd() * 5)];
    if (kind < 0.12) { // conifer
      G.cyl(px, y0, pz, 0.14, 1.2, '#4a3828', 6);
      let y = y0 + 1.0, r = 1.9;
      for (let i = 0; i < 5; i++) { F.cyl(px, y, pz, r, 1.9, '#2f5a36', 9, false, 0.05); y += 1.25; r *= 0.78; }
    } else {
      const h = 2.6 + rnd() * 1.2;
      G.cyl(px, y0, pz, 0.2, h + 0.5, '#4d3b2b', 7, true, 0.11);
      const n = 4 + Math.floor(rnd() * 3);
      const R = 1.5 + rnd() * 0.7;
      blob(F, px, y0 + h + R * 0.9, pz, R * 1.15, R * 0.95, R * 1.15, col, rnd);
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, d = R * (0.5 + rnd() * 0.6);
        blob(F, px + Math.cos(a) * d, y0 + h + R * (0.2 + rnd() * 0.9), pz + Math.sin(a) * d, R * 0.7, R * 0.6, R * 0.7, col, rnd);
      }
    }
    this.circ(px, pz, 0.28);
  }

  bush(px, pz, y0, r = 0.8) {
    const { rnd } = this;
    blob(this.b('foliage'), px, y0 + r * 0.55, pz, r, r * 0.7, r, GREEN[Math.floor(rnd() * 5)], rnd);
  }

  car(s, z, dir, rot) {
    // parked car in the x-road frame; dir = +1 faces +x, -1 faces -x
    const S = this.S;
    const base = new THREE.Matrix4().makeRotationY(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    base.setPosition(s, 0, z);
    S.setTransform(this.rot ? new THREE.Matrix4().multiplyMatrices(this.rotM, base) : base);
    const { L, W } = addCar(S, this.rnd);
    S.setTransform(this.rot ? this.rotM : null);
    this.box2(s - L / 2, z - W / 2, s + L / 2, z + W / 2);
  }

  /* ---------- intersection ---------- */
  intersection() {
    const { ci, cj } = this;
    const T = this.b('tlight');
    if (!T.extra) T.extra = [];
    const G = this.b('generic');
    const corners = [
      // [px,pz, faceDirX, faceDirZ, group]
      [8, -8, 1, 0, 0],
      [-8, 8, -1, 0, 0],
      [8, 8, 0, 1, 1],
      [-8, -8, 0, -1, 1],
    ];
    const colors = [[1, 0.12, 0.06], [1, 0.72, 0.05], [0.12, 1, 0.35]];
    for (const [px, pz, fx, fz, grp] of corners) {
      G.cyl(px, CURB, pz, 0.08, 3.6, '#3a3d42', 8, true, 0.07);
      this.circ(px, pz, 0.14);
      // head box
      const hy = CURB + 3.4;
      const hw = fx !== 0 ? [0.28, 1.0, 0.36] : [0.36, 1.0, 0.28];
      G.box(px + fx * 0.05, hy, pz + fz * 0.05, hw[0], hw[1], hw[2], '#26282b');
      G.box(px + fx * 0.2, hy + 0.55, pz + fz * 0.2, fx !== 0 ? 0.08 : 0.5, 0.05, fz !== 0 ? 0.08 : 0.5, '#26282b'); // sun visor
      for (let i = 0; i < 3; i++) {
        const y = hy + 0.3 - i * 0.3;
        T.extraVal = grp * 3 + i;
        const o = 0.19;
        const cx = px + fx * (0.05 + hw[0] / 2 * (fx !== 0 ? 1 : 0) + 0.01), cz = pz + fz * (0.05 + hw[2] / 2 * (fz !== 0 ? 1 : 0) + 0.01);
        const d = 0.11;
        const ref = [px, y, pz];
        if (fx !== 0) T.quad([cx, y - d, cz - d], [cx, y + d, cz - d], [cx, y + d, cz + d], [cx, y - d, cz + d], colors[i], null, ref);
        else T.quad([cx - d, y - d, cz], [cx - d, y + d, cz], [cx + d, y + d, cz], [cx + d, y - d, cz], colors[i], null, ref);
      }
    }
    // charging station
    if (hasStation(ci, cj)) {
      const x = 8.4, z = 15;
      const L = this.b('lampG');
      G.box(x, CURB + 0.9, z, 0.55, 1.8, 0.35, '#2a3036');
      L.box(x, CURB + 1.35, z - 0.18, 0.4, 0.5, 0.02, '#ffffff');
      G.box(x, CURB + 0.05, z, 1.2, 0.1, 1.0, '#555a5e');
      this.box2(x - 0.3, z - 0.2, x + 0.3, z + 0.2);
      this.stations.push({ x: ci * P + x, z: cj * P + z });
      this.glowG.push(x, CURB + 1.4, z - 0.4);
    }
  }

  /* ---------- buildings ---------- */
  building(b) {
    const { rnd } = this;
    const F = this.b('f_' + b.kind), PL = this.b('plain'), G = this.b('generic'), R = this.b('roof');
    const { x0, x1, z0, z1 } = b;
    const H = b.floors * FLOOR, y0 = CURB;
    const tint = b.tint;
    const gcol = b.kind === 'brick' ? '#9c5a44' : b.kind === 'panel' ? '#c9c6bf' : b.kind === 'glass' ? '#4a5560' : shade(tint, 0.9);
    const cols = (len) => Math.max(1, Math.round(len / FLOOR));
    const yb = y0, yt = y0 + H;
    // walls: S(+z), E(+x), N(-z), W(-x)   [outward normals]
    const wallDefs = [
      { id: '+z', a: [x0, z1], c: [x1, z1], len: x1 - x0, skip: false },
      { id: '+x', a: [x1, z1], c: [x1, z0], len: z1 - z0, skip: false },
      { id: '-z', a: [x1, z0], c: [x0, z0], len: x1 - x0, skip: false },
      { id: '-x', a: [x0, z0], c: [x0, z1], len: z1 - z0, skip: false },
    ];
    // adjacency skips: along street axis A (low coord) & B (high coord)
    const alongX = b.front === '+z' || b.front === '-z';
    if (alongX) { if (b.skipA) wallDefs[3].skip = true; if (b.skipB) wallDefs[1].skip = true; }
    else { if (b.skipA) wallDefs[2].skip = true; if (b.skipB) wallDefs[0].skip = true; }
    for (const w of wallDefs) {
      if (w.skip) continue;
      F.wall(w.a[0], w.a[1], w.c[0], w.c[1], yb, yt, tint, cols(w.len), b.floors);
    }
    // plinth + cornice
    const wdt = x1 - x0, dpt = z1 - z0;
    G.box((x0 + x1) / 2, yb + 0.4, (z0 + z1) / 2, wdt + 0.12, 0.8, dpt + 0.12, b.kind === 'brick' ? '#5a4a42' : '#8c8a84');
    G.box((x0 + x1) / 2, yt - 0.12, (z0 + z1) / 2, wdt + 0.4, 0.24, dpt + 0.4, '#dedbd2');
    // roof
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (b.roof === 'gable') {
      const ov = 0.35;
      const ridgeAlongX = alongX;
      const rcol = b.roofCol;
      if (ridgeAlongX) {
        const half = dpt / 2, rise = half * 0.72;
        const ya = yt - 0.2, yr = yt + rise;
        const ref = [cx, yt - 2, cz];
        const A0 = x0 - ov, A1 = x1 + ov;
        const len = Math.hypot(half + ov, rise + 0.2);
        // south slope (+z) and north slope (-z)
        R.quad([A0, ya, z1 + ov], [A1, ya, z1 + ov], [A1, yr, cz], [A0, yr, cz], rcol, [A0 / 2, 0, A1 / 2, 0, A1 / 2, len / 2, A0 / 2, len / 2], ref);
        R.quad([A1, ya, z0 - ov], [A0, ya, z0 - ov], [A0, yr, cz], [A1, yr, cz], rcol, [A1 / 2, 0, A0 / 2, 0, A0 / 2, len / 2, A1 / 2, len / 2], ref);
        G.box(cx, yr + 0.04, cz, A1 - A0, 0.1, 0.22, shade(rcol, 0.8));
        PL.tri([x0, yt, z0], [x0, yt, z1], [x0, yr, cz], gcol, null, ref);
        PL.tri([x1, yt, z0], [x1, yt, z1], [x1, yr, cz], gcol, null, ref);
        if (rnd() < 0.55) { // chimney
          const chx = x0 + (0.2 + rnd() * 0.6) * wdt;
          G.box(chx, yr + 0.4, cz + (rnd() - 0.5) * half * 0.6, 0.7, 2.0, 0.7, '#8a5a48');
          G.box(chx, yr + 1.45, cz, 0.85, 0.12, 0.85, '#55575b');
        }
        if (rnd() < 0.3) { // solar panels
          const sx0 = x0 + wdt * 0.2, sx1 = x1 - wdt * 0.2;
          const lift = 0.06;
          const side = b.front === '+z' ? 1 : -1;
          const zA = cz + side * (half * 0.2), zB = cz + side * (half * 0.85);
          const yA2 = yr - Math.abs(zA - cz) * (rise / half), yB2 = yr - Math.abs(zB - cz) * (rise / half);
          this.b('paint').quad([sx0, yA2 + lift, zA], [sx1, yA2 + lift, zA], [sx1, yB2 + lift, zB], [sx0, yB2 + lift, zB], '#1d2b45', null, [cx, yt - 2, cz]);
        }
      } else {
        const half = wdt / 2, rise = half * 0.72;
        const ya = yt - 0.2, yr = yt + rise;
        const ref = [cx, yt - 2, cz];
        const A0 = z0 - ov, A1 = z1 + ov;
        const len = Math.hypot(half + ov, rise + 0.2);
        R.quad([x1 + ov, ya, A0], [x1 + ov, ya, A1], [cx, yr, A1], [cx, yr, A0], rcol, [A0 / 2, 0, A1 / 2, 0, A1 / 2, len / 2, A0 / 2, len / 2], ref);
        R.quad([x0 - ov, ya, A1], [x0 - ov, ya, A0], [cx, yr, A0], [cx, yr, A1], rcol, [A1 / 2, 0, A0 / 2, 0, A0 / 2, len / 2, A1 / 2, len / 2], ref);
        G.box(cx, yr + 0.04, cz, 0.22, 0.1, A1 - A0, shade(rcol, 0.8));
        PL.tri([x0, yt, z0], [x1, yt, z0], [cx, yr, z0], gcol, null, ref);
        PL.tri([x0, yt, z1], [x1, yt, z1], [cx, yr, z1], gcol, null, ref);
        if (rnd() < 0.55) {
          const chz = z0 + (0.2 + rnd() * 0.6) * dpt;
          G.box(cx + (rnd() - 0.5) * half * 0.6, yr + 0.4, chz, 0.7, 2.0, 0.7, '#8a5a48');
        }
      }
    } else { // flat roof with parapet
      G.box(cx, yt + 0.3, cz, wdt + 0.1, 0.5, dpt + 0.1, '#cfcdc6');
      PL.plane(x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, yt + 0.56, '#4d4f52');
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        G.box(x0 + 2 + rnd() * (wdt - 4), yt + 1.1, z0 + 2 + rnd() * (dpt - 4), 1.5 + rnd() * 1.5, 1, 1.2 + rnd(), '#9da0a3');
      }
    }
    // entrance door + balcony details on street side
    this.facadeDetails(b, cols);
    this.colliders.push({ t: 0, x0, x1, z0, z1 });
  }

  facadeDetails(b, cols) {
    const { rnd } = this;
    const G = this.b('generic'), GL = this.b('glass');
    const alongX = b.front === '+z' || b.front === '-z';
    const sgn = b.front[0] === '+' ? 1 : -1;
    const lo = alongX ? b.x0 : b.z0, hi = alongX ? b.x1 : b.z1;
    const len = hi - lo, nc = cols(len);
    const face = alongX ? (sgn > 0 ? b.z1 : b.z0) : (sgn > 0 ? b.x1 : b.x0);
    const at = (a, d, y, w, h, dp, col, B = G) => {
      // a: coordinate along street, d: outward distance
      if (alongX) B.box(a, y, face + sgn * d, w, h, dp, col);
      else B.box(face + sgn * d, y, a, dp, h, w, col);
    };
    if (b.kind === 'glass') {
      // lobby glass + canopy
      const a = lo + len / 2;
      at(a, 0.04, CURB + 1.5, Math.min(len - 2, 8), 3, 0.08, '#ffffff', GL);
      at(a, 1.3, CURB + 3.3, Math.min(len - 2, 9), 0.18, 2.6, '#2b2e32');
      return;
    }
    if (b.shop && nc >= 3) {
      const SG = this.b('shopGlow');
      const a = lo + len / 2, w = len - 2.8;
      const pal = ['#1f5f9a', '#9a1f2a', '#2a7a3a', '#c9a21c', '#3a3d42', '#7a3a8a'];
      const sc = pal[Math.floor(rnd() * pal.length)];
      at(a, 0.04, CURB + 1.45, w, 2.3, 0.04, ['#d9c7a3', '#cfd8dc', '#e6d2b0'][Math.floor(rnd() * 3)], SG);
      at(a, 0.07, CURB + 0.14, w + 0.2, 0.28, 0.12, '#2b2e32');
      at(a, 0.07, CURB + 2.7, w + 0.2, 0.14, 0.12, '#2b2e32');
      const n = Math.max(2, Math.round(w / 2.2));
      for (let i = 0; i <= n; i++) at(lo + len / 2 - w / 2 + (w * i) / n, 0.07, CURB + 1.45, 0.08, 2.4, 0.12, '#2b2e32');
      at(a, 0.2, CURB + 3.25, w + 0.5, 0.8, 0.28, sc);
      at(a, 0.35, CURB + 3.25, Math.min(w * 0.5, 4), 0.28, 0.02, '#f5f1e6');
      if (nc >= 2) { const c = 1; const dx = lo + (c * len) / nc; at(dx, 0.07, CURB + 1.15, 1.4, 2.3, 0.14, DOORS[Math.floor(rnd() * DOORS.length)]); }
      return;
    }
    // door on a cell boundary
    if (nc >= 2) {
      const c = 1 + Math.floor(rnd() * (nc - 1));
      const a = lo + (c * len) / nc;
      at(a, 0.07, CURB + 1.15, 1.4, 2.3, 0.14, DOORS[Math.floor(rnd() * DOORS.length)]);
      at(a, 0.55, CURB + 2.55, 2.0, 0.1, 1.2, '#4a4d52');
      at(a, 0.35, CURB + 0.08, 1.8, 0.16, 0.8, '#9a9890');
    }
    if (b.balcony && b.floors >= 3) {
      for (let c = 0; c < nc; c++) {
        if (c % 2) continue;
        const a = lo + ((c + 0.5) * len) / nc;
        for (let f = 1; f < b.floors; f++) {
          if (f === 1 && b.floors > 3) continue;
          const y = CURB + f * FLOOR;
          at(a, 0.55, y + 0.04, 2.0, 0.14, 1.1, '#d6d3ca');
          at(a, 1.07, y + 0.62, 2.0, 0.9, 0.04, '#2b2e32');
          at(a - 1.0, 0.55, y + 0.62, 0.04, 0.9, 1.1, '#2b2e32');
          at(a + 1.0, 0.55, y + 0.62, 0.04, 0.9, 1.1, '#2b2e32');
        }
      }
    }
    // awning (shop) on some
    if (b.awning) {
      const c = Math.floor(rnd() * nc);
      const a = lo + ((c + 0.5) * len) / nc;
      const ac = ['#b32d2d', '#2d5ab3', '#2d8a4f', '#c78a1c'][Math.floor(rnd() * 4)];
      at(a, 0.8, CURB + 2.7, 2.6, 0.08, 1.7, ac);
    }
  }

  newBuilding(side, a0, a1, d0, d1, o) {
    const { rnd } = this;
    let r;
    switch (side) {
      case 'S': r = { x0: a0, x1: a1, z0: LOT0 + d0, z1: LOT0 + d1, front: '-z' }; break;
      case 'N': r = { x0: a0, x1: a1, z0: LOT1 - d1, z1: LOT1 - d0, front: '+z' }; break;
      case 'W': r = { x0: LOT0 + d0, x1: LOT0 + d1, z0: a0, z1: a1, front: '-x' }; break;
      default: r = { x0: LOT1 - d1, x1: LOT1 - d0, z0: a0, z1: a1, front: '+x' }; break;
    }
    const kindRoll = rnd();
    const kind = o.kind || (kindRoll < 0.66 ? 'plaster' : kindRoll < 0.88 ? 'brick' : 'panel');
    const tint = kind === 'plaster' ? PLASTER[Math.floor(rnd() * PLASTER.length)] : kind === 'brick' ? BRICKT[Math.floor(rnd() * 3)] : kind === 'glass' ? ['#e8f0f6', '#cfdde8', '#dfe6ea'][Math.floor(rnd() * 3)] : '#ffffff';
    this.building({
      ...r, ...o, kind, tint,
      roof: o.roof || (kind === 'panel' || kind === 'glass' ? 'flat' : rnd() < 0.72 ? 'gable' : 'flat'),
      roofCol: shade(ROOFCOL[Math.floor(rnd() * ROOFCOL.length)], 1),
      balcony: o.balcony ?? rnd() < 0.5, awning: o.awning ?? rnd() < 0.2, shop: o.shop && kind !== 'glass',
    });
  }

  splitRow(a0, a1, gapProb) {
    const { rnd } = this;
    const out = [];
    let pos = a0;
    while (a1 - pos > 1) {
      let w = (4 + Math.floor(rnd() * 5)) * FLOOR;
      let end = pos + w;
      if (a1 - end < 11) end = a1;
      out.push([pos, end]);
      pos = end;
      if (pos < a1 - 14 && rnd() < gapProb) pos += 4.8;
    }
    return out;
  }

  perimeter() {
    const { rnd } = this;
    const dS = 11 + rnd() * 3, dN = 11 + rnd() * 3, dW = 11 + rnd() * 3, dE = 11 + rnd() * 3;
    const base = 3 + Math.floor(rnd() * 3);
    const sides = [
      ['S', LOT0, LOT1], ['N', LOT0, LOT1], ['W', LOT0 + dS, LOT1 - dN], ['E', LOT0 + dS, LOT1 - dN],
    ];
    const depth = { S: dS, N: dN, W: dW, E: dE };
    for (const [side, a0, a1] of sides) {
      const row = this.splitRow(a0, a1, 0.1);
      row.forEach(([s, e], i) => {
        const floors = clamp(base + (rnd() < 0.35 ? (rnd() < 0.5 ? -1 : 1) : 0), 2, 6);
        this.newBuilding(side, s, e, 0, depth[side], { floors, shop: rnd() < 0.3 && e - s > 11, skipA: i > 0 && s - row[i - 1][1] < 0.1, skipB: i < row.length - 1 && row[i + 1][0] - e < 0.1 });
      });
    }
    // courtyard
    const x0 = LOT0 + dW + 1.5, x1 = LOT1 - dE - 1.5, z0 = LOT0 + dS + 1.5, z1 = LOT1 - dN - 1.5;
    if (x1 > x0 && z1 > z0) {
      const n = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) this.tree(x0 + 2 + rnd() * (x1 - x0 - 4), z0 + 2 + rnd() * (z1 - z0 - 4), CURB);
      for (let i = 0; i < 4; i++) this.bush(x0 + 1 + rnd() * (x1 - x0 - 2), z0 + 1 + rnd() * (z1 - z0 - 2), CURB, 0.7 + rnd() * 0.5);
      // bike shed / play corner
      const G = this.b('generic');
      const sx = x0 + 1, sz = z0 + 1;
      G.box(sx + 2, CURB + 1.1, sz + 1.2, 4, 2.2, 2.4, '#6b7075');
      G.box(sx + 2, CURB + 2.3, sz + 1.2, 4.4, 0.18, 2.8, '#44474b');
      this.colliders.push({ t: 0, x0: sx, x1: sx + 4, z0: sz, z1: sz + 2.4 });
    }
  }

  fenceRun(x0, z0, x1, z1, y0 = CURB, hedge = false) {
    const G = this.b('generic'), F = this.b('foliage');
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (hedge) {
      F.box(cx, y0 + 0.55, cz, alongX ? len : 0.8, 1.1, alongX ? 0.8 : len, '#4c7a36', { tile: 1 });
    } else {
      const col = '#cfd2d4';
      if (alongX) { G.box(cx, y0 + 0.85, cz, len, 0.06, 0.05, col); G.box(cx, y0 + 0.4, cz, len, 0.06, 0.05, col); }
      else { G.box(cx, y0 + 0.85, cz, 0.05, 0.06, len, col); G.box(cx, y0 + 0.4, cz, 0.05, 0.06, len, col); }
      const n = Math.max(2, Math.round(len / 1.6));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = alongX ? x0 + (x1 - x0) * t : cx, pz = alongX ? cz : z0 + (z1 - z0) * t;
        G.box(px, y0 + 0.5, pz, 0.07, 1.0, 0.07, '#4a4d52');
      }
    }
    this.colliders.push({ t: 0, x0: Math.min(x0, x1) - (alongX ? 0 : 0.15), x1: Math.max(x0, x1) + (alongX ? 0 : 0.15), z0: Math.min(z0, z1) - (alongX ? 0.15 : 0), z1: Math.max(z0, z1) + (alongX ? 0.15 : 0) });
  }

  houses() {
    const { rnd } = this;
    const SETBACK = 5, DEP = 10;
    const reserve = SETBACK + 12 + 1;
    const sides = [['S', LOT0, LOT1], ['N', LOT0, LOT1], ['W', LOT0 + reserve, LOT1 - reserve], ['E', LOT0 + reserve, LOT1 - reserve]];
    const pav = this.b('paver2');
    for (const [side, a0, a1] of sides) {
      let pos = a0;
      while (a1 - pos > 10) {
        let lot = 15 + Math.floor(rnd() * 8);
        if (a1 - pos - lot < 14) lot = a1 - pos;
        const hw = [9.6, 12.8, 12.8][Math.floor(rnd() * 3)];
        const w = Math.min(hw, lot - 3);
        const off = pos + (lot - w) / 2 + (rnd() - 0.5) * 1.5;
        const dep = 9 + rnd() * 3;
        this.newBuilding(side, off, off + w, SETBACK, SETBACK + dep, { floors: 2 + (rnd() < 0.3 ? 1 : 0), roof: rnd() < 0.85 ? 'gable' : 'flat', balcony: false, awning: false, kind: rnd() < 0.75 ? 'plaster' : 'brick' });
        // front fence / hedge along the sidewalk edge with a gate
        const hedge = rnd() < 0.5;
        const gate = off + w / 2;
        const mk = (s0, s1) => {
          const [fx0, fz0, fx1, fz1] = this.lineFor(side, s0, s1, 0.35);
          this.fenceRun(fx0, fz0, fx1, fz1, CURB, hedge);
        };
        if (gate - 0.8 > pos + 0.5) mk(pos + 0.2, gate - 0.8);
        if (pos + lot - 0.2 > gate + 1.1) mk(gate + 0.8, pos + lot - 0.2);
        // path to door + driveway
        const [px0, pz0, px1, pz1] = this.rectLine(side, gate - 0.7, gate + 0.7, 0.4, SETBACK);
        pav.plane(px0, pz0, px1, pz1, CURB + 0.012, '#d7c9ae', 2);
        // garden shrubs
        for (let k = 0; k < 3; k++) {
          const sx = pos + 1 + rnd() * (lot - 2);
          if (Math.abs(sx - gate) < 2.5) continue;
          const [bx, bz] = this.lineFor(side, sx, sx, 1.6).slice(0, 2);
          this.bush(bx, bz, CURB, 0.6 + rnd() * 0.5);
        }
        // side fence between lots
        const [sx0, sz0, sx1, sz1] = this.lineAcross(side, pos + lot, 0.4, SETBACK + dep + 3);
        if (pos + lot < a1 - 1) this.fenceRun(sx0, sz0, sx1, sz1, CURB, false);
        pos += lot;
      }
    }
    // back gardens: trees
    for (let i = 0; i < 6; i++) {
      const x = LOT0 + 22 + rnd() * (LOT1 - LOT0 - 44), z = LOT0 + 22 + rnd() * (LOT1 - LOT0 - 44);
      this.tree(x, z, CURB);
    }
  }
  // helpers mapping side-relative coordinates (s along the street, d depth from lot edge)
  lineFor(side, s0, s1, d) {
    switch (side) {
      case 'S': return [s0, LOT0 + d, s1, LOT0 + d];
      case 'N': return [s0, LOT1 - d, s1, LOT1 - d];
      case 'W': return [LOT0 + d, s0, LOT0 + d, s1];
      default: return [LOT1 - d, s0, LOT1 - d, s1];
    }
  }
  lineAcross(side, s, d0, d1) {
    switch (side) {
      case 'S': return [s, LOT0 + d0, s, LOT0 + d1];
      case 'N': return [s, LOT1 - d1, s, LOT1 - d0];
      case 'W': return [LOT0 + d0, s, LOT0 + d1, s];
      default: return [LOT1 - d1, s, LOT1 - d0, s];
    }
  }
  rectLine(side, s0, s1, d0, d1) {
    switch (side) {
      case 'S': return [s0, LOT0 + d0, s1, LOT0 + d1];
      case 'N': return [s0, LOT1 - d1, s1, LOT1 - d0];
      case 'W': return [LOT0 + d0, s0, LOT0 + d1, s1];
      default: return [LOT1 - d1, s0, LOT1 - d0, s1];
    }
  }

  park() {
    const { rnd } = this;
    const pav = this.b('paver2'), G = this.b('generic');
    const c = P / 2;
    const pc = '#d9cfb8';
    pav.plane(c - 1.8, LOT0, c + 1.8, LOT1, CURB + 0.012, pc, 2);
    pav.plane(LOT0, c - 1.8, LOT1, c + 1.8, CURB + 0.012, pc, 2);
    // plaza + fountain
    const ring = [];
    for (let i = 0; i < 20; i++) { const a = (i / 20) * 6.283; ring.push([c + Math.cos(a) * 9, c + Math.sin(a) * 9]); }
    pav.fan(ring, CURB + 0.014, '#e2dac6', 2);
    const wr = [];
    for (let i = 0; i < 20; i++) { const a = (i / 20) * 6.283; wr.push([c + Math.cos(a) * 3.2, c + Math.sin(a) * 3.2]); }
    G.cyl(c, CURB, c, 3.7, 0.55, '#bdb8ac', 20, false);
    this.b('water').fan(wr, CURB + 0.46, '#ffffff', 4);
    G.cyl(c, CURB + 0.4, c, 0.35, 1.6, '#c9c4b8', 10);
    this.circ(c, c, 3.8);
    // trees
    const placed = [];
    for (let t = 0; t < 120 && placed.length < 34; t++) {
      const x = LOT0 + 2 + rnd() * (LOT1 - LOT0 - 4), z = LOT0 + 2 + rnd() * (LOT1 - LOT0 - 4);
      if (Math.abs(x - c) < 3.8 || Math.abs(z - c) < 3.8 || Math.hypot(x - c, z - c) < 12) continue;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 6)) continue;
      placed.push([x, z]);
      this.tree(x, z, CURB);
    }
    for (let i = 0; i < 10; i++) {
      const x = LOT0 + 2 + rnd() * (LOT1 - LOT0 - 4), z = LOT0 + 2 + rnd() * (LOT1 - LOT0 - 4);
      if (Math.abs(x - c) < 4 || Math.abs(z - c) < 4) continue;
      this.bush(x, z, CURB, 0.8);
    }
    // lamps + benches along the paths
    const lampB = this.b('lampW'), pool = this.b('pool');
    for (const d of [-1, 1]) for (const horiz of [0, 1]) {
      for (const t of [20, 80]) {
        const x = horiz ? t : c + d * 2.6, z = horiz ? c + d * 2.6 : t;
        G.cyl(x, CURB, z, 0.06, 4.2, '#33363b', 6);
        lampB.box(x, CURB + 4.2, z, 0.5, 0.1, 0.5, '#ffffff');
        pool.plane(x - 7, z - 7, x + 7, z + 7, CURB + 0.03, '#ffffff');
        this.lamps.push(new THREE.Vector3(x, CURB + 4.1, z)); this.glowPts.push(x, CURB + 4.1, z);
        this.circ(x, z, 0.15);
      }
      for (const t of [36, 64]) {
        const x = horiz ? t : c + d * 2.7, z = horiz ? c + d * 2.7 : t;
        if (horiz) { G.box(x, CURB + 0.45, z, 1.6, 0.08, 0.45, '#6a4a2c'); G.box(x, CURB + 0.8, z + d * 0.22, 1.6, 0.4, 0.06, '#6a4a2c'); this.colliders.push({ t: 0, x0: x - 0.8, x1: x + 0.8, z0: z - 0.25, z1: z + 0.25 }); }
        else { G.box(x, CURB + 0.45, z, 0.45, 0.08, 1.6, '#6a4a2c'); G.box(x + d * 0.22, CURB + 0.8, z, 0.06, 0.4, 1.6, '#6a4a2c'); this.colliders.push({ t: 0, x0: x - 0.25, x1: x + 0.25, z0: z - 0.8, z1: z + 0.8 }); }
      }
    }
  }

  modern() {
    const { rnd } = this;
    const pav = this.b('paver2'), G = this.b('generic');
    pav.plane(LOT0 + 0.3, LOT0 + 0.3, LOT1 - 0.3, LOT1 - 0.3, CURB + 0.01, '#b8b8b8', 2);
    const n = 2 + (rnd() < 0.4 ? 1 : 0);
    const slots = [[LOT0 + 8, LOT0 + 8], [LOT1 - 8, LOT0 + 8], [LOT0 + 8, LOT1 - 8], [LOT1 - 8, LOT1 - 8]];
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    for (let i = 0; i < n; i++) {
      const [sx, sz] = slots[i];
      const w = (6 + Math.floor(rnd() * 3)) * FLOOR, d = (5 + Math.floor(rnd() * 3)) * FLOOR;
      const x0 = sx < P / 2 ? sx : sx - w, z0 = sz < P / 2 ? sz : sz - d;
      const front = sz < P / 2 ? '-z' : '+z';
      this.building({ x0, x1: x0 + w, z0, z1: z0 + d, floors: 5 + Math.floor(rnd() * 7), kind: 'glass', tint: ['#e8f0f6', '#cfdde8', '#dfe6ea'][Math.floor(rnd() * 3)], roof: 'flat', front, balcony: false, awning: false });
    }
    for (let i = 0; i < 8; i++) {
      const x = LOT0 + 3 + rnd() * (LOT1 - LOT0 - 6), z = LOT0 + 3 + rnd() * (LOT1 - LOT0 - 6);
      if (this.colliders.some((c) => c.t === 0 && x > c.x0 - 3 && x < c.x1 + 3 && z > c.z0 - 3 && z < c.z1 + 3)) continue;
      G.box(x, CURB + 0.25, z, 2.2, 0.5, 2.2, '#8c8c88');
      this.tree(x, z, CURB + 0.5);
      this.colliders.pop(); this.colliders.push({ t: 0, x0: x - 1.1, x1: x + 1.1, z0: z - 1.1, z1: z + 1.1 });
    }
  }

  shop() {
    const { rnd } = this;
    const G = this.b('generic'), PL = this.b('plain'), GL = this.b('glass'), L = this.b('lotAsphalt'), M = this.b('mark');
    const bx0 = LOT0 + 4, bx1 = LOT1 - 4, bz0 = LOT1 - 30, bz1 = LOT1 - 6;
    PL.box((bx0 + bx1) / 2, CURB + 3.2, (bz0 + bz1) / 2, bx1 - bx0, 6.4, bz1 - bz0, '#e8e6e0');
    G.box((bx0 + bx1) / 2, CURB + 6.5, (bz0 + bz1) / 2, bx1 - bx0 + 0.4, 0.4, bz1 - bz0 + 0.4, '#b9b7b0');
    G.box((bx0 + bx1) / 2, CURB + 4.9, bz0 - 0.15, bx1 - bx0 - 0.4, 1.6, 0.3, '#c3141b');
    G.box((bx0 + bx1) / 2, CURB + 4.9, bz0 - 0.3, (bx1 - bx0) * 0.45, 1.0, 0.1, '#f5d90a');
    GL.box((bx0 + bx1) / 2, CURB + 1.6, bz0 - 0.05, (bx1 - bx0) * 0.7, 3.2, 0.1, '#ffffff');
    this.colliders.push({ t: 0, x0: bx0, x1: bx1, z0: bz0, z1: bz1 });
    // parking lot
    const lz0 = LOT0 + 1, lz1 = bz0 - 4;
    L.plane(LOT0 + 0.5, LOT0 + 0.5, LOT1 - 0.5, bz0 - 1.5, CURB + 0.02, '#ffffff', 5);
    for (const rowZ of [lz0 + 2.5, lz1 - 5.5]) {
      for (let x = bx0 + 1; x < bx1 - 1; x += 2.6) {
        M.plane(x, rowZ - 0.04 + 0, x + 0.1, rowZ + 5, CURB + 0.03, '#e9e9e4');
        if (rnd() < 0.55 && x < bx1 - 3.6) {
          const dirSign = rowZ < (lz0 + lz1) / 2 ? 1 : -1;
          // park perpendicular: car faces +z / -z
          this.carLot(x + 1.3, rowZ + 2.5, rnd() < 0.5 ? 1 : -1);
        }
      }
    }
    for (let i = 0; i < 6; i++) this.tree(bx0 + rnd() * (bx1 - bx0), LOT0 + 1.2 + (rnd() < 0.5 ? 0 : 0), CURB);
    // lamps
    const lampB = this.b('lampW'), pool = this.b('pool');
    for (const x of [bx0 + 14, (bx0 + bx1) / 2 + 6, bx1 - 14]) {
      const z = (lz0 + lz1) / 2;
      G.cyl(x, CURB, z, 0.09, 7, '#33363b', 8);
      lampB.box(x, CURB + 7, z, 0.5, 0.12, 1.2, '#ffffff');
      pool.plane(x - 10, z - 10, x + 10, z + 10, CURB + 0.045, '#ffffff');
      this.lamps.push(new THREE.Vector3(x, CURB + 6.9, z)); this.glowPts.push(x, CURB + 6.9, z);
      this.circ(x, z, 0.2);
    }
  }
  carLot(x, z, dir) {
    // perpendicular parked car in chunk frame
    const saveRot = this.rot; this.rot = 0;
    const tmp = this.car.bind(this);
    // build car facing +x then rotate: use car() with swapped frame trick
    this.rot = 1; // x-road frame rotated => local +x -> world +z
    // local (s,z) -> world (-z, s); want world (x,z) = (-lz, s) => lz=-x, s=z
    this.car(z, -x, dir, 1);
    this.rot = saveRot;
    this.S.setTransform(null);
  }

  /* ---------- assemble ---------- */
  build() {
    this.ground();
    this.markings();
    this.streetItems();
    this.intersection();
    const t = blockType(this.ci, this.cj);
    if (t === 'perimeter') this.perimeter();
    else if (t === 'houses') this.houses();
    else if (t === 'park') this.park();
    else if (t === 'modern') this.modern();
    else this.shop();
    return this;
  }
}

/* ---------------------------------------------------------------- world manager */
const MESHDEF = {
  asphalt: ['asphalt', 0, 1], paver: ['paver', 0, 1], paver2: ['paver2', 0, 1], grass: ['grass', 0, 1], mark: ['mark', 0, 1], lotAsphalt: ['lotAsphalt', 0, 1],
  generic: ['generic', 1, 1], plain: ['plain', 1, 1], roof: ['roof', 1, 1], foliage: ['foliage', 1, 1], paint: ['paint', 1, 1],
  glass: ['glass', 0, 1], water: ['water', 0, 1], lampW: ['lampW', 0, 0], shopGlow: ['shopGlow', 0, 0], lampG: ['lampG', 0, 0],
  f_plaster: ['f_plaster', 1, 1], f_brick: ['f_brick', 1, 1], f_panel: ['f_panel', 1, 1], f_glass: ['f_glass', 1, 1],
  tlight: ['tlight', 0, 0], pool: ['pool', 0, 0],
};

/** Pure data generation (runs in a worker or on the main thread). */
export function generateChunk(ci, cj) {
  const cb = new ChunkBuilder(ci, cj).build();
  const batches = {};
  const transfer = [];
  for (const [name, b] of Object.entries(cb.S.b)) {
    if (b.empty) continue;
    const arr = b.toArrays();
    batches[name] = arr;
    for (const k of Object.keys(arr)) transfer.push(arr[k].buffer);
  }
  const lamps = [];
  for (const v of cb.lamps) lamps.push(v.x, v.y, v.z);
  const glowPts = new Float32Array(cb.glowPts), glowG = new Float32Array(cb.glowG);
  transfer.push(glowPts.buffer, glowG.buffer);
  return { data: { ci, cj, batches, cols: cb.colliders, lamps, glowPts, glowG, stations: cb.stations }, transfer };
}

export class World {
  constructor(scene, M) {
    this.scene = scene;
    this.M = M;
    this.chunks = new Map();
    this.pending = new Set();
    this.colliders = new Colliders();
    this.radius = 2;
    this.stations = new Map();
    this.workers = [];
    this.nextWorker = 0;
    this.onChunk = null;
    const src = typeof __WORKER_SRC__ !== 'undefined' ? __WORKER_SRC__ : null;
    if (src && typeof Worker !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
        for (let i = 0; i < n; i++) {
          const w = new Worker(url);
          w.onmessage = (e) => this.receive(e.data);
          w.onerror = () => { this.workers = []; };
          this.workers.push(w);
        }
      } catch (err) {
        this.workers = [];
      }
    }
  }
  key(i, j) { return i + ',' + j; }
  chunkAt(x, z) { return [Math.floor((x + RH) / P), Math.floor((z + RH) / P)]; }

  /** Turn generated data into meshes + colliders. */
  instantiate(d) {
    const { ci, cj } = d;
    const k = this.key(ci, cj);
    if (this.chunks.has(k)) return;
    const group = new THREE.Group();
    group.position.set(ci * P, 0, cj * P);
    group.matrixAutoUpdate = false;
    group.updateMatrix();
    const meshes = [];
    for (const [name, arr] of Object.entries(d.batches)) {
      const def = MESHDEF[name];
      const mesh = new THREE.Mesh(geometryFromArrays(arr), this.M[def[0]]);
      mesh.castShadow = !!def[1];
      mesh.receiveShadow = !!def[2];
      mesh.matrixAutoUpdate = false;
      if (name === 'pool') mesh.renderOrder = 2;
      group.add(mesh);
      meshes.push(mesh);
    }
    const addPts = (arr, mat) => {
      if (!arr.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      g.computeBoundingSphere();
      const pts = new THREE.Points(g, mat);
      pts.renderOrder = 3;
      group.add(pts);
      meshes.push(pts);
    };
    addPts(d.glowPts, this.M.glowW);
    addPts(d.glowG, this.M.glowG);
    const ox = ci * P, oz = cj * P;
    const cols = d.cols.map((c) => (c.t === 0 ? { t: 0, x0: c.x0 + ox, x1: c.x1 + ox, z0: c.z0 + oz, z1: c.z1 + oz } : { t: 1, x: c.x + ox, z: c.z + oz, r: c.r }));
    for (const c of cols) this.colliders.add(c);
    const lamps = [];
    for (let i = 0; i < d.lamps.length; i += 3) lamps.push(new THREE.Vector3(d.lamps[i] + ox, d.lamps[i + 1], d.lamps[i + 2] + oz));
    this.scene.add(group);
    const chunk = { ci, cj, group, meshes, cols, lamps };
    for (const s of d.stations) this.stations.set(k, s);
    this.chunks.set(k, chunk);
    return chunk;
  }
  receive(d) {
    this.pending.delete(this.key(d.ci, d.cj));
    if (this._focus) {
      const [fi, fj] = this._focus;
      if (Math.abs(d.ci - fi) > this.radius + 1 || Math.abs(d.cj - fj) > this.radius + 1) return; // no longer needed
    }
    this.instantiate(d);
    if (this.onChunk) this.onChunk();
  }
  buildChunkSync(ci, cj) {
    const { data } = generateChunk(ci, cj);
    return this.instantiate(data);
  }
  removeChunk(k) {
    const ch = this.chunks.get(k);
    if (!ch) return;
    for (const c of ch.cols) this.colliders.remove(c);
    this.scene.remove(ch.group);
    for (const m of ch.meshes) m.geometry.dispose();
    this.stations.delete(k);
    this.chunks.delete(k);
  }
  /** Ensure chunks around (x,z). `max` = chunks that may be built synchronously per call (fallback mode). Returns number still missing. */
  update(x, z, max = 1) {
    const [ci, cj] = this.chunkAt(x, z);
    this._focus = [ci, cj];
    const need = [];
    const R = this.radius;
    for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) if (!this.chunks.has(this.key(i, j))) need.push([i, j, Math.hypot(i - ci, j - cj)]);
    need.sort((a, b) => a[2] - b[2]);
    if (this.workers.length) {
      const cap = this.workers.length * 2;
      for (const [i, j] of need) {
        if (this.pending.size >= cap) break;
        const k = this.key(i, j);
        if (this.pending.has(k)) continue;
        this.pending.add(k);
        this.workers[this.nextWorker++ % this.workers.length].postMessage({ ci: i, cj: j });
      }
    } else {
      let built = 0;
      for (const [i, j] of need) { if (built >= max) break; this.buildChunkSync(i, j); built++; }
    }
    for (const [k, ch] of this.chunks) if (Math.abs(ch.ci - ci) > R + 1 || Math.abs(ch.cj - cj) > R + 1) this.removeChunk(k);
    return need.filter(([i, j]) => !this.chunks.has(this.key(i, j))).length;
  }
  nearestLamps(x, z, n, out) {
    out.length = 0;
    const [ci, cj] = this.chunkAt(x, z);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const ch = this.chunks.get(this.key(i, j));
      if (!ch) continue;
      for (const l of ch.lamps) {
        const d = (l.x - x) ** 2 + (l.z - z) ** 2;
        if (d > 900) continue;
        out.push([d, l]);
      }
    }
    out.sort((a, b) => a[0] - b[0]);
    out.length = Math.min(out.length, n);
    return out;
  }
  nearestStation(x, z) {
    let best = null, bd = 1e9;
    for (const s of this.stations.values()) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    return best ? { s: best, d: bd } : null;
  }
}

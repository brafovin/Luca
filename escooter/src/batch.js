import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const colorCache = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  if (typeof c === 'object') return [c.r, c.g, c.b];
  let r = colorCache.get(c);
  if (!r) {
    _c.set(c);
    r = [_c.r, _c.g, _c.b];
    colorCache.set(c, r);
  }
  return r;
}
export const shade = (c, f) => {
  const k = rgb(c);
  return [k[0] * f, k[1] * f, k[2] * f];
};

/** A collection of named geometry accumulators sharing one optional transform. */
export class BatchSet {
  constructor() {
    this.b = {};
    this.m = null;
    this.ox = 0;
    this.oz = 0;
  }
  get(name) {
    return this.b[name] || (this.b[name] = new Batch(this));
  }
  setTransform(m) {
    this.m = m || null;
  }
}

export class Batch {
  constructor(set) {
    this.set = set;
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.extra = null; // optional per-vertex scalar attribute ("lamp")
    this.extraVal = 0;
  }
  get empty() {
    return this.pos.length === 0;
  }

  _vert(x, y, z, nx, ny, nz, u, v, c) {
    const m = this.set.m;
    if (m) {
      _v.set(x, y, z).applyMatrix4(m);
      x = _v.x; y = _v.y; z = _v.z;
      _n.set(nx, ny, nz).transformDirection(m);
      nx = _n.x; ny = _n.y; nz = _n.z;
    }
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    if (this.extra) this.extra.push(this.extraVal);
  }

  /** Triangle; if ref is given, winding is flipped so the normal points away from ref. */
  tri(a, b, c, col, uv, ref) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return;
    nx /= len; ny /= len; nz /= len;
    if (ref) {
      const cx = (a[0] + b[0] + c[0]) / 3 - ref[0];
      const cy = (a[1] + b[1] + c[1]) / 3 - ref[1];
      const cz = (a[2] + b[2] + c[2]) / 3 - ref[2];
      if (nx * cx + ny * cy + nz * cz < 0) {
        const t = b; b = c; c = t;
        nx = -nx; ny = -ny; nz = -nz;
        if (uv) uv = [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]];
      }
    }
    const k = rgb(col);
    const t = uv || [0, 0, 0, 0, 0, 0];
    this._vert(a[0], a[1], a[2], nx, ny, nz, t[0], t[1], k);
    this._vert(b[0], b[1], b[2], nx, ny, nz, t[2], t[3], k);
    this._vert(c[0], c[1], c[2], nx, ny, nz, t[4], t[5], k);
  }

  quad(a, b, c, d, col, uv, ref) {
    this.tri(a, b, c, col, uv && [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]], ref);
    this.tri(a, c, d, col, uv && [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]], ref);
  }

  /** Axis aligned box. opts: bottom (bool), tile (uv metres per tile) */
  box(cx, cy, cz, sx, sy, sz, col, opts = {}) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const t = opts.tile ? 1 / opts.tile : 0;
    const U = (a, b, c, d) => (t ? [a * t, b * t, c * t, b * t, c * t, d * t, a * t, d * t] : null);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, U(z1, y0, z0, y1)); // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, U(z0, y0, z1, y1)); // -x
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col, U(x0, z1, x1, z0)); // +y
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, U(x0, z0, x1, z1));
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, U(x0, y0, x1, y1)); // +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, U(x1, y0, x0, y1)); // -z
  }

  /** Horizontal up-facing rectangle, world-anchored uv. */
  plane(x0, z0, x1, z1, y, col, tile = 0) {
    const ox = tile ? (this.set.ox % tile) : 0;
    const oz = tile ? (this.set.oz % tile) : 0;
    const t = tile ? 1 / tile : 0;
    const uv = tile ? [(x0 + ox) * t, (z0 + oz) * t, (x0 + ox) * t, (z1 + oz) * t, (x1 + ox) * t, (z1 + oz) * t, (x1 + ox) * t, (z0 + oz) * t] : null;
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], col, uv);
  }

  /** Convex polygon (x,z) as an up-facing fan with world-anchored uv. */
  fan(pts, y, col, tile) {
    const ox = this.set.ox % tile, oz = this.set.oz % tile;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cz += p[1]; }
    cx /= pts.length; cz /= pts.length;
    const uvOf = (x, z) => [(x + ox) / tile, (z + oz) / tile];
    const c = uvOf(cx, cz);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ua = uvOf(a[0], a[1]), ub = uvOf(b[0], b[1]);
      this.tri([cx, y, cz], [b[0], y, b[1]], [a[0], y, a[1]], col, [c[0], c[1], ub[0], ub[1], ua[0], ua[1]]);
    }
  }

  /** Vertical wall quad with facade uv: cols x rows window cells. Outward normal = (-dz,0,dx). */
  wall(xa, za, xb, zb, y0, y1, col, cols, rows) {
    const uMax = cols / 4, vMax = rows / 4;
    this.quad([xa, y0, za], [xb, y0, zb], [xb, y1, zb], [xa, y1, za], col, [0, 0, uMax, 0, uMax, vMax, 0, vMax]);
  }

  /** Upright cylinder (optionally closed top). */
  cyl(cx, y0, cz, r, h, col, seg = 8, top = true, r2 = r) {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push([Math.cos(a), Math.sin(a)]);
    }
    for (let i = 0; i < seg; i++) {
      const p = pts[i], q = pts[(i + 1) % seg];
      this.quad(
        [cx + p[0] * r, y0, cz + p[1] * r],
        [cx + q[0] * r, y0, cz + q[1] * r],
        [cx + q[0] * r2, y0 + h, cz + q[1] * r2],
        [cx + p[0] * r2, y0 + h, cz + p[1] * r2],
        col, null, [cx, y0 + h / 2, cz]
      );
      if (top) this.tri([cx, y0 + h, cz], [cx + q[0] * r2, y0 + h, cz + q[1] * r2], [cx + p[0] * r2, y0 + h, cz + p[1] * r2], col, null, [cx, y0, cz]);
    }
  }

  /** Extrude a convex 2D profile. map(p,q,t) -> [x,y,z]. */
  extrude(profile, map, t0, t1, col) {
    const n = profile.length;
    let mx = 0, my = 0;
    for (const p of profile) { mx += p[0]; my += p[1]; }
    mx /= n; my /= n;
    const ref = map(mx, my, (t0 + t1) / 2);
    for (let i = 0; i < n; i++) {
      const a = profile[i], b = profile[(i + 1) % n];
      this.quad(map(a[0], a[1], t0), map(b[0], b[1], t0), map(b[0], b[1], t1), map(a[0], a[1], t1), col, null, ref);
    }
    for (let i = 1; i < n - 1; i++) {
      this.tri(map(profile[0][0], profile[0][1], t0), map(profile[i][0], profile[i][1], t0), map(profile[i + 1][0], profile[i + 1][1], t0), col, null, ref);
      this.tri(map(profile[0][0], profile[0][1], t1), map(profile[i][0], profile[i][1], t1), map(profile[i + 1][0], profile[i + 1][1], t1), col, null, ref);
    }
  }

  /** Add an existing BufferGeometry, transformed by matrix, flat tinted by col. grad: top-light factor. */
  geo(g, matrix, col, grad = 0) {
    const k = rgb(col);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const idx = g.index;
    const cnt = idx ? idx.count : p.count;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const _p = new THREE.Vector3(), _q = new THREE.Vector3();
    for (let i = 0; i < cnt; i++) {
      const j = idx ? idx.getX(i) : i;
      _p.fromBufferAttribute(p, j).applyMatrix4(matrix);
      _q.fromBufferAttribute(n, j).applyMatrix3(nm).normalize();
      const f = grad ? 1 + grad * (_q.y - 0.3) : 1;
      this._vert(_p.x, _p.y, _p.z, _q.x, _q.y, _q.z, uv ? uv.getX(j) : 0, uv ? uv.getY(j) : 0, [k[0] * f, k[1] * f, k[2] * f]);
    }
  }

  /** Plain typed arrays (transferable between worker and main thread). */
  toArrays() {
    const o = { pos: new Float32Array(this.pos), nor: new Float32Array(this.nor), uv: new Float32Array(this.uv), col: new Float32Array(this.col) };
    if (this.extra) o.lamp = new Float32Array(this.extra);
    return o;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.extra) g.setAttribute('lamp', new THREE.Float32BufferAttribute(this.extra, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export function geometryFromArrays(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
  if (a.lamp) g.setAttribute('lamp', new THREE.BufferAttribute(a.lamp, 1));
  g.computeBoundingSphere();
  return g;
}

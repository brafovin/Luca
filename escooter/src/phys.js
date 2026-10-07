import { clamp } from './util.js';

const out = { x: 0, z: 0, hit: 0, nx: 0, nz: 0 };
/** Push a circle (x,z,r) out of static colliders and dynamic circles. Returns shared result object. */
export function pushOut(x, z, r, col, dyn, skip) {
  out.hit = 0; out.nx = 0; out.nz = 0;
  for (let it = 0; it < 2; it++) {
    let bx = 0, bz = 0, best = 0, nx = 0, nz = 0;
    col.near(x, z, r + 0.5, (c) => {
      let dx, dz, pen;
      if (c.t === 0) {
        const qx = clamp(x, c.x0, c.x1), qz = clamp(z, c.z0, c.z1);
        dx = x - qx; dz = z - qz;
        const d = Math.hypot(dx, dz);
        if (d >= r) return;
        if (d < 1e-6) {
          const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z;
          const m = Math.min(l, rr, t, b);
          if (m === l) { dx = -1; dz = 0; pen = l + r; } else if (m === rr) { dx = 1; dz = 0; pen = rr + r; } else if (m === t) { dx = 0; dz = -1; pen = t + r; } else { dx = 0; dz = 1; pen = b + r; }
        } else { pen = r - d; dx /= d; dz /= d; }
      } else {
        dx = x - c.x; dz = z - c.z;
        const d = Math.hypot(dx, dz), rr = r + c.r;
        if (d >= rr) return;
        pen = rr - d;
        if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      }
      if (pen > best) { best = pen; bx = dx * pen; bz = dz * pen; nx = dx; nz = dz; }
    });
    if (best > 0) { x += bx; z += bz; out.hit = 1; out.nx = nx; out.nz = nz; }
    if (dyn) {
      for (const d of dyn) {
        if (d === skip || d.ped === skip) continue;
        const dx = x - d.x, dz = z - d.z;
        if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue;
        const dist = Math.hypot(dx, dz), rr = r + d.r;
        if (dist >= rr) continue;
        const nx2 = dist < 1e-6 ? 1 : dx / dist, nz2 = dist < 1e-6 ? 0 : dz / dist;
        x += nx2 * (rr - dist) * 0.8; z += nz2 * (rr - dist) * 0.8; out.hit = 2;
      }
    }
    if (!best && !out.hit) break;
  }
  out.x = x; out.z = z;
  return out;
}

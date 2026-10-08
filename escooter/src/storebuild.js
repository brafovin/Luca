import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { addCar } from './cars.js';
import { LAYOUT, LEVEL_Y } from './stores.js';

const CURB = 0.12, LOT0 = 9.1, LOT1 = 90.9;

/** generic parked car at an arbitrary place/yaw (not destructible) */
export function parkCar(cb, x, z, yaw, o = {}) {
  const S = cb.S;
  const base = new THREE.Matrix4().makeRotationY(yaw); base.setPosition(x, o.y ?? CURB, z);
  S.setTransform(base);
  const dim = addCar(S, cb.rnd, { type: o.type, color: o.color, sport: o.sport });
  S.setTransform(null);
  if (!o.noCol) {
    const s = Math.abs(Math.sin(yaw)) > 0.7;
    const hx = (s ? dim.L : dim.W) / 2, hz = (s ? dim.W : dim.L) / 2;
    cb.colliders.push({ t: 0, x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz });
  }
  return dim;
}

function cart(cb, x, z, yaw) {
  const G = cb.b('generic'), S = cb.S;
  const m = new THREE.Matrix4().makeRotationY(yaw); m.setPosition(x, CURB, z); S.setTransform(m);
  G.box(0, 0.22, 0, 0.5, 0.04, 0.9, '#9aa0a6');
  for (const sx of [-1, 1]) { G.box(sx * 0.25, 0.62, 0, 0.02, 0.5, 0.9, '#c9ccd0'); G.box(sx * 0.1, 0.1, 0.38, 0.05, 0.16, 0.05, '#1a1a1a'); G.box(sx * 0.1, 0.1, -0.38, 0.05, 0.16, 0.05, '#1a1a1a'); }
  G.box(0, 0.62, 0.45, 0.5, 0.5, 0.02, '#c9ccd0'); G.box(0, 0.62, -0.45, 0.5, 0.5, 0.02, '#c9ccd0');
  G.box(0, 1.0, -0.5, 0.5, 0.04, 0.04, '#d42020');
  S.setTransform(null);
}

function shelfFrame(cb, sh, accent) {
  const G = cb.b('generic'), GL = cb.b('cglass'), LW = cb.b('lampW');
  const h = sh.chill ? 2.0 : 2.1, y0 = CURB;
  const bx = (px, pz, along, across, y, hgt, col, B = G) => (sh.alongX ? B.box(px, y, pz, along, hgt, across, col) : B.box(px, y, pz, across, hgt, along, col));
  bx(sh.x, sh.z, sh.len, sh.depth, y0 + 0.12, 0.24, '#2b2e34');                                   // plinth
  bx(sh.x, sh.z, sh.len, 0.06, y0 + h / 2, h, sh.chill ? '#e9edf0' : '#3a3d44');                   // back panel
  const lv = sh.chill ? [0.4, 0.95, 1.5] : LEVEL_Y;
  for (const f of sh.faces) {
    const fo = f * (sh.depth / 4 + 0.02);
    const bpx = sh.alongX ? sh.x : sh.x + fo, bpz = sh.alongX ? sh.z + fo : sh.z;
    for (const l of lv) bx(bpx, bpz, sh.len - 0.04, sh.depth / 2 - 0.04, y0 + l - 0.03, 0.04, '#c9ccd0');
    if (sh.chill) { // glass doors in front, interior light strip
      const gz = sh.depth / 2 * f;
      bx(sh.alongX ? sh.x : sh.x + gz, sh.alongX ? sh.z + gz : sh.z, sh.len, 0.04, y0 + 1.1, 1.9, '#ffffff', GL);
      for (let k = 0; k <= Math.floor(sh.len / 1.2); k++) { const u = -sh.len / 2 + k * 1.2; bx((sh.alongX ? sh.x + u : sh.x + gz), (sh.alongX ? sh.z + gz : sh.z + u), 0.05, 0.06, y0 + 1.1, 1.95, '#2b2e34'); }
      bx(sh.alongX ? sh.x : sh.x + f * 0.3, sh.alongX ? sh.z + f * 0.3 : sh.z, sh.len - 0.3, 0.06, y0 + h - 0.1, 0.05, '#ffffff', LW);
    }
  }
  for (const e of [-1, 1]) bx(sh.alongX ? sh.x + e * sh.len / 2 : sh.x, sh.alongX ? sh.z : sh.z + e * sh.len / 2, 0.06, sh.depth, y0 + h / 2, h, '#2b2e34'); // end caps
  if (!sh.chill) bx(sh.x, sh.z, sh.len, sh.depth, y0 + h + 0.08, 0.16, accent);                    // header band
  const hx = sh.alongX ? sh.len / 2 : sh.depth / 2, hz = sh.alongX ? sh.depth / 2 : sh.len / 2;
  cb.colliders.push({ t: 0, x0: sh.x - hx, x1: sh.x + hx, z0: sh.z - hz, z1: sh.z + hz });
}

function tillBlock(cb, t, L, alongX) {
  const G = cb.b('generic'), LW = cb.b('lampW'), SG = cb.b('shopGlow'), y0 = CURB;
  if (alongX) {
    G.box(t.x, y0 + 0.5, t.z, 3.6, 1.0, 1.0, '#e8e6e0'); G.box(t.x, y0 + 1.03, t.z, 3.8, 0.06, 1.15, '#2b2e34');
    G.box(t.x - 0.6, y0 + 1.25, t.z - 0.2, 0.45, 0.35, 0.4, '#1a1b1e'); G.box(t.x - 0.6, y0 + 1.3, t.z + 0.0, 0.34, 0.2, 0.02, '#35e6ff');
    for (let k = 0; k < 5; k++) G.box(t.x + 0.3 + k * 0.25, y0 + 1.2, t.z + 0.1, 0.12, 0.28, 0.1, ['#d42020', '#2f8a3a', '#e8c020', '#2a62c4', '#ff7a1a'][k]);
    cb.colliders.push({ t: 0, x0: t.x - 1.9, x1: t.x + 1.9, z0: t.z - 0.58, z1: t.z + 0.58 });
  } else {
    G.box(t.x, y0 + 0.45, t.z, 1.1, 0.9, 3.0, '#e8e6e0'); G.box(t.x, y0 + 0.93, t.z + 0.15, 0.8, 0.05, 2.6, '#1a1b1e');
    G.box(t.x + 0.3, y0 + 1.1, t.z - 1.2, 0.4, 0.3, 0.35, '#2b2e34'); G.box(t.x + 0.3, y0 + 1.2, t.z - 1.0, 0.3, 0.16, 0.02, '#35e6ff');
    G.box(t.x, y0 + 2.5, t.z - 1.45, 0.08, 2.5, 0.08, '#17181b');
    SG.box(t.x, y0 + 3.45, t.z - 1.45, 0.9, 0.34, 0.1, '#2fcf5a');
    cb.colliders.push({ t: 0, x0: t.x - 0.58, x1: t.x + 0.58, z0: t.z - 1.55, z1: t.z + 1.55 });
  }
}

/** shell + interior of a walk-in store with glass front and sliding doors (door panels are dynamic, see shops.js) */
function storeShell(cb, L, opts = {}) {
  const G = cb.b('generic'), PL = cb.b('plain'), GL = cb.b('cglass'), LW = cb.b('lampW'), SG = cb.b('shopGlow'), SS = cb.b(L.sign), MK = cb.b('mark');
  const { x0, x1, z0, z1, H, cx, DW } = L, T = 0.4, y0 = CURB, W = x1 - x0, D = z1 - z0;
  const wall = opts.wall || '#e9e7e1', trim = opts.trim || '#2b2e34', A = L.accent;
  const doorH = 3.0, glassTop = 3.3;
  // floor, ceiling
  const BR = cb.b('bright');
  BR.plane(x0 + T, z0 + T, x1 - T, z1 - T, y0 + 0.04, opts.floor || '#d3d1cb');
  MK.plane(x0 + T, z0 + T, x1 - T, z0 + T + 0.12, y0 + 0.045, '#a9a69f');
  PL.box(cx, y0 + H - 0.15, (z0 + z1) / 2, W, 0.3, D, '#ecebe6');
  BR.quad([x0 + T, y0 + H - 0.3, z0 + T], [x1 - T, y0 + H - 0.3, z0 + T], [x1 - T, y0 + H - 0.3, z1 - T], [x0 + T, y0 + H - 0.3, z1 - T], '#f2f0ea', null, [cx, y0 + H + 4, (z0 + z1) / 2]);
  G.box(cx, y0 + H + 0.15, (z0 + z1) / 2, W + 0.5, 0.3, D + 0.5, '#2b2e34');
  // walls
  PL.box(cx, y0 + H / 2, z1 - T / 2, W, H, T, wall);
  PL.box(x0 + T / 2, y0 + H / 2, (z0 + z1) / 2, T, H, D, wall);
  PL.box(x1 - T / 2, y0 + H / 2, (z0 + z1) / 2, T, H, D, wall);
  // inner liner so the interior is light
  BR.box(cx, y0 + H / 2, z1 - T - 0.02, W - 2 * T, H - 0.3, 0.04, '#f4f2ec');
  BR.box(x0 + T + 0.02, y0 + H / 2, (z0 + z1) / 2, 0.04, H - 0.3, D - 2 * T, '#f0eee8'); BR.box(x1 - T - 0.02, y0 + H / 2, (z0 + z1) / 2, 0.04, H - 0.3, D - 2 * T, '#f0eee8');
  // front: low sill, glass, header with sign band, pillars
  const gl0 = x0 + T, gl1 = cx - DW, gr0 = cx + DW, gr1 = x1 - T;
  for (const [a, b] of [[gl0, gl1], [gr0, gr1]]) {
    PL.box((a + b) / 2, y0 + 0.25, z0 + T / 2, b - a, 0.5, T, wall);
    GL.box((a + b) / 2, y0 + 0.5 + (glassTop - 0.5) / 2, z0 + T / 2, b - a, glassTop - 0.5, 0.05, '#ffffff');
    const n = Math.max(1, Math.round((b - a) / 3));
    for (let i = 0; i <= n; i++) G.box(a + ((b - a) * i) / n, y0 + glassTop / 2 + 0.25, z0 + T / 2, 0.1, glassTop - 0.2, 0.14, trim);
    G.box((a + b) / 2, y0 + glassTop, z0 + T / 2, b - a, 0.1, 0.14, trim);
    G.box((a + b) / 2, y0 + 0.5, z0 + T / 2, b - a, 0.08, 0.14, trim);
  }
  PL.box(cx, y0 + (glassTop + H) / 2, z0 + T / 2, W, H - glassTop, T, wall);
  // accent band + door frame + rail housing
  G.box(cx, y0 + glassTop + 0.35, z0 - 0.04, W - 0.2, 0.5, 0.1, A);
  for (const sd of [-1, 1]) G.box(cx + sd * (DW + 0.08), y0 + doorH / 2, z0 + T / 2, 0.16, doorH, 0.2, trim);
  G.box(cx, y0 + doorH + 0.15, z0 + T / 2, DW * 2 + 0.3, 0.3, 0.3, trim);
  // entrance mat
  MK.plane(cx - DW, z0 - 0.9, cx + DW, z0 + 1.6, y0 + 0.05, '#25282d');
  // big sign on the roof
  const sw = Math.min(14, W * 0.5), sh = sw / 4, sy = y0 + H + 0.3 + sh / 2 + 0.2;
  G.box(cx, sy, z0 + 0.4, sw + 0.4, sh + 0.4, 0.3, '#101114');
  SS.quad([cx - sw / 2, sy - sh / 2, z0 + 0.24], [cx + sw / 2, sy - sh / 2, z0 + 0.24], [cx + sw / 2, sy + sh / 2, z0 + 0.24], [cx - sw / 2, sy + sh / 2, z0 + 0.24], '#ffffff', [1, 0, 0, 0, 0, 1, 1, 1], [cx, sy, z0 + 6]);
  for (const sx of [-1, 1]) G.box(cx + sx * (sw / 2 - 0.5), y0 + H + 0.3, z0 + 0.4, 0.3, 0.6, 0.3, '#101114');
  // ceiling lights (emissive strips) + a few glow points for the night
  const nxl = Math.floor(W / 5), nzl = Math.max(1, Math.floor(D / 6));
  for (let i = 0; i < nxl; i++) for (let j = 0; j < nzl; j++) {
    const lx = x0 + T + ((i + 0.5) * (W - 2 * T)) / nxl, lz = z0 + T + ((j + 0.5) * (D - 2 * T)) / nzl;
    LW.box(lx, y0 + H - 0.34, lz, 0.5, 0.05, 3.2, '#ffffff'); G.box(lx, y0 + H - 0.31, lz, 0.7, 0.04, 3.4, '#17181b');
  }
  cb.glowPts.push(cx, y0 + H - 0.6, (z0 + z1) / 2);
  // bright floor glow so the interior reads as lit in daytime too
  // collision: walls (front wall open at the door, glass blocks like a wall)
  const col = (a, b, c, d) => cb.colliders.push({ t: 0, x0: a, x1: b, z0: c, z1: d });
  col(x0, x1, z1 - T, z1); col(x0, x0 + T, z0, z1); col(x1 - T, x1, z0, z1);
  col(x0, cx - DW, z0, z0 + T); col(cx + DW, x1, z0, z0 + T);
  // shelves, tills, carts
  for (const sh2 of [...L.gondolas, ...L.sides, ...L.chillers]) shelfFrame(cb, sh2, A);
  for (const t of L.tills) tillBlock(cb, t, L, !!t.alongX);
  if (L.cartPark) for (let i = 0; i < 6; i++) cart(cb, L.cartPark.x - 2.2 + i * 0.55, L.cartPark.z, Math.PI / 2 * 0 + 0.0);
  // plants + benches
  G.cyl(x0 + 1.4, y0, z0 + 1.6, 0.3, 0.5, '#7a5a3a', 10); G.cyl(x0 + 1.4, y0 + 0.5, z0 + 1.6, 0.42, 1.0, '#2f7a3a', 8, true, 0.05); cb.circ(x0 + 1.4, z0 + 1.6, 0.4);
}

function lotAndTrees(cb, rects, x0, x1) {
  const rnd = cb.rnd, L = cb.b('lotAsphalt'), M = cb.b('mark');
  for (const [a, b, c, d] of rects) L.plane(a, b, c, d, CURB + 0.02, '#ffffff', 5);
}

function lampPole(cb, x, z, hgt = 7) {
  const G = cb.b('generic'), lampB = cb.b('lampW'), pool = cb.b('pool');
  G.cyl(x, CURB, z, 0.09, hgt, '#33363b', 8);
  lampB.box(x, CURB + hgt, z, 0.5, 0.12, 1.2, '#ffffff');
  pool.plane(x - 10, z - 10, x + 10, z + 10, CURB + 0.045, '#ffffff');
  cb.lamps.push(new THREE.Vector3(x, CURB + hgt - 0.1, z)); cb.glowPts.push(x, CURB + hgt - 0.1, z);
  cb.circ(x, z, 0.2);
}

/* ---------------------------------------------------------------- supermarket */
export function supermarket(cb) {
  const L = LAYOUT.supermarket, rnd = cb.rnd;
  const PAV = cb.b('paver2');
  PAV.plane(LOT0 + 0.3, LOT0 + 0.3, LOT1 - 0.3, LOT1 - 0.3, CURB + 0.01, '#b9b5ac', 2);
  storeShell(cb, L, { wall: '#f1efe8', trim: '#23262b' });
  // parking: side + back
  lotAndTrees(cb, [[L.x1 + 1, LOT0 + 0.5, LOT1 - 0.5, LOT1 - 0.5], [LOT0 + 0.5, L.z1 + 1, L.x1 + 1, LOT1 - 0.5]]);
  const M = cb.b('mark');
  for (let z = LOT0 + 5; z < LOT1 - 6; z += 2.7) {
    for (const xr of [L.x1 + 5, L.x1 + 18]) {
      M.plane(xr - 2.5, z, xr + 2.5, z + 0.1, CURB + 0.03, '#e9e9e4');
      if (rnd() < 0.5) parkCar(cb, xr, z + 1.35, rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  for (let x = LOT0 + 4; x < L.x1 + 2; x += 2.7) {
    M.plane(x, L.z1 + 3, x + 0.1, L.z1 + 8.6, CURB + 0.03, '#e9e9e4'); M.plane(x, L.z1 + 12.4, x + 0.1, L.z1 + 18, CURB + 0.03, '#e9e9e4');
    if (rnd() < 0.5) cb.carLot(x + 1.35, L.z1 + 5.8, rnd() < 0.5 ? 1 : -1);
    if (rnd() < 0.5) cb.carLot(x + 1.35, L.z1 + 15.2, rnd() < 0.5 ? 1 : -1);
  }
  for (const [x, z] of [[L.x1 + 12, LOT0 + 3], [L.x1 + 12, 50], [LOT0 + 20, L.z1 + 10], [L.x0 + 20, L.z1 + 10]]) lampPole(cb, x, z, 8);
  for (let i = 0; i < 6; i++) cb.tree(LOT0 + 2 + rnd() * 4, L.z1 + 2 + rnd() * 50, CURB);
  // a few flags and the cart return
  const G = cb.b('generic');
  for (const fx of [L.x0 - 1.2, L.x1 + 1.2]) { G.cyl(fx, CURB, L.z0 - 2.4, 0.07, 8, '#cfd2d6', 6); G.box(fx + 0.8, CURB + 7.2, L.z0 - 2.4, 1.5, 1.0, 0.03, L.accent); cb.circ(fx, L.z0 - 2.4, 0.12); }
}

/* ---------------------------------------------------------------- filling station */
export function gasStation(cb) {
  const L = LAYOUT.gas, rnd = cb.rnd;
  const G = cb.b('generic'), PL = cb.b('plain'), LW = cb.b('lampW'), M = cb.b('mark'), PAV = cb.b('paver2'), FP = cb.b('fuelpylon');
  PAV.plane(LOT0 + 0.3, LOT0 + 0.3, LOT1 - 0.3, LOT1 - 0.3, CURB + 0.01, '#a9a8a2', 2);
  lotAndTrees(cb, [[LOT0 + 0.5, LOT0 + 0.5, LOT1 - 0.5, L.z0 - 3]]);
  storeShell(cb, L, { wall: '#f2efe8', trim: '#8a1a1a', floor: '#d9d6cf' });
  // canopy over the pump islands
  const cx0 = LOT0 + 6, cx1 = LOT0 + 62, cz0 = 17, cz1 = 33, cy = CURB + 5.4;
  PL.box((cx0 + cx1) / 2, cy, (cz0 + cz1) / 2, cx1 - cx0, 0.5, cz1 - cz0, '#eceae4', { bottom: true });
  G.box((cx0 + cx1) / 2, cy + 0.05, cz0, cx1 - cx0 + 0.2, 0.9, 0.2, '#d42020'); G.box((cx0 + cx1) / 2, cy + 0.05, cz1, cx1 - cx0 + 0.2, 0.9, 0.2, '#d42020');
  G.box((cx0 + cx1) / 2, cy + 0.05, cz0 - 0.12, (cx1 - cx0) * 0.5, 0.35, 0.05, '#ffd23a');
  for (const px of [cx0 + 4, (cx0 + cx1) / 2, cx1 - 4]) for (const pz of [cz0 + 2.5, cz1 - 2.5]) { G.cyl(px, CURB, pz, 0.28, 5.2, '#f2f2f0', 12); G.cyl(px, CURB, pz, 0.36, 0.5, '#d42020', 12); cb.circ(px, pz, 0.36); }
  const xs = [24, 33, 42, 51, 60];
  for (const lx of xs) for (const lz of [22, 28]) { LW.box(lx, cy - 0.3, lz, 1.4, 0.05, 1.4, '#ffffff'); }
  for (const lx of [30, 46, 58]) { cb.lamps.push(new THREE.Vector3(lx, cy - 0.5, 25)); cb.glowPts.push(lx, cy - 0.5, 25); cb.b('pool').plane(lx - 9, 25 - 9, lx + 9, 25 + 9, CURB + 0.045, '#ffffff'); }
  // pump islands with two pumps each
  const ex = [-1, 1].map((s) => s * 0.0);
  void ex;
  for (const ix of [28, 38, 48, 58]) {
    G.box(ix, CURB + 0.1, 25, 1.3, 0.2, 5.4, '#9a9890');
    for (const pz of [23.7, 26.3]) {
      G.box(ix, CURB + 1.0, pz, 0.62, 1.6, 0.5, '#e8e6e0'); G.box(ix, CURB + 1.5, pz, 0.64, 0.4, 0.52, '#d42020');
      for (const sd of [-1, 1]) {
        G.box(ix + sd * 0.325, CURB + 1.28, pz, 0.02, 0.4, 0.34, '#101114'); cb.b('shopGlow').box(ix + sd * 0.338, CURB + 1.32, pz, 0.01, 0.2, 0.26, '#6fe0ff');
        G.box(ix + sd * 0.34, CURB + 0.85, pz, 0.12, 0.2, 0.12, '#1a1b1e'); G.cyl(ix + sd * 0.4, CURB + 0.3, pz + 0.18, 0.025, 0.7, '#101114', 6);
      }
      cb.colliders.push({ t: 0, x0: ix - 0.4, x1: ix + 0.4, z0: pz - 0.35, z1: pz + 0.35 });
    }
    // markings: bay lines
    for (const sd of [-1, 1]) M.plane(ix + sd * 2.1, 21.5, ix + sd * 2.1 + 0.1, 28.5, CURB + 0.03, '#e9e9e4');
  }
  // cars at two of the pumps
  parkCar(cb, 28 - 2.8, 25, Math.PI / 2 * 0 + 0, { type: undefined });
  parkCar(cb, 48 + 2.8, 25, Math.PI, {});
  // price pylon facing both directions
  const px = LOT0 + 1.5, pz = LOT0 + 3.2;
  G.box(px, CURB + 4.5, pz, 0.5, 9, 0.5, '#2b2e34'); cb.colliders.push({ t: 0, x0: px - 0.3, x1: px + 0.3, z0: pz - 0.3, z1: pz + 0.3 });
  G.box(px, CURB + 8.6, pz, 2.5, 4.4, 0.4, '#101114');
  FP.quad([px + 1.1, CURB + 6.5, pz - 0.22], [px - 1.1, CURB + 6.5, pz - 0.22], [px - 1.1, CURB + 10.7, pz - 0.22], [px + 1.1, CURB + 10.7, pz - 0.22], '#ffffff', [0, 0, 1, 0, 1, 1, 0, 1], [px, CURB + 8.6, pz + 6]);
  FP.quad([px - 1.1, CURB + 6.5, pz + 0.22], [px + 1.1, CURB + 6.5, pz + 0.22], [px + 1.1, CURB + 10.7, pz + 0.22], [px - 1.1, CURB + 10.7, pz + 0.22], '#ffffff', [0, 0, 1, 0, 1, 1, 0, 1], [px, CURB + 8.6, pz - 6]);
  cb.glowPts.push(px, CURB + 8.6, pz);
  // air pump, bins, vacuum
  G.box(LOT0 + 12, CURB + 0.6, L.z0 - 5, 0.5, 1.2, 0.4, '#2a62c4'); cb.colliders.push({ t: 0, x0: LOT0 + 11.7, x1: LOT0 + 12.3, z0: L.z0 - 5.2, z1: L.z0 - 4.8 });
  for (let i = 0; i < 3; i++) cb.tree(LOT1 - 4 - rnd() * 6, 12 + rnd() * 65, CURB);
  for (const [x, z] of [[LOT1 - 10, 20], [LOT1 - 10, 60], [LOT0 + 8, L.z1 + 6]]) lampPole(cb, x, z, 7);
  // parking behind the shop
  for (let x = LOT0 + 4; x < LOT1 - 6; x += 2.7) { M.plane(x, L.z1 + 2, x + 0.1, L.z1 + 7.6, CURB + 0.03, '#e9e9e4'); if (rnd() < 0.4) cb.carLot(x + 1.35, L.z1 + 4.8, rnd() < 0.5 ? 1 : -1); }
}

/* ---------------------------------------------------------------- car dealership */
export function dealer(cb) {
  const L = LAYOUT.dealer, rnd = cb.rnd;
  const G = cb.b('generic'), PL = cb.b('plain'), LW = cb.b('lampW'), M = cb.b('mark'), PAV = cb.b('paver2');
  PAV.plane(LOT0 + 0.3, LOT0 + 0.3, LOT1 - 0.3, LOT1 - 0.3, CURB + 0.01, '#bdbab2', 2);
  lotAndTrees(cb, [[LOT0 + 0.5, L.z1 + 1, LOT1 - 0.5, LOT1 - 0.5]]);
  storeShell(cb, L, { wall: '#e3e6e9', trim: '#14161a', floor: '#2b2d31' });
  // showroom: dark glossy floor, podiums + cars
  for (const c of L.cars) {
    G.cyl(c.x, CURB + 0.04, c.z, 3.3, 0.22, '#ececec', 28); G.cyl(c.x, CURB + 0.26, c.z, 3.0, 0.03, '#35e6ff', 28, false);
    const sport = c.id === 'car_sport';
    const spec = { car_mini: { type: 0.12, col: '#e8c020' }, car_sedan: { type: 0.45, col: '#1f3a63' }, car_suv: { type: 0.7, col: '#2e4a3a' }, car_sport: { type: 0.45, col: '#c8141c' } }[c.id];
    const m = new THREE.Matrix4().makeRotationY(c.yaw); m.setPosition(c.x, CURB + 0.28, c.z); cb.S.setTransform(m);
    addCar(cb.S, rnd, { type: spec.type, color: spec.col, sport, lights: 'lampW' });
    cb.S.setTransform(null);
    cb.colliders.push({ t: 1, x: c.x, z: c.z, r: 2.1 });
    // price stand
    G.box(c.x + 2.9, CURB + 0.6, c.z - 2.0, 0.08, 1.2, 0.08, '#17181b');
  }
  // reception desk + salesman spot
  G.box(L.desk.x, CURB + 0.55, L.desk.z, 4.0, 1.1, 1.1, '#e8e6e0'); G.box(L.desk.x, CURB + 1.13, L.desk.z, 4.2, 0.06, 1.25, '#14161a');
  G.box(L.desk.x - 0.8, CURB + 1.4, L.desk.z + 0.1, 0.5, 0.35, 0.05, '#1a1b1e'); cb.b('shopGlow').box(L.desk.x - 0.8, CURB + 1.42, L.desk.z + 0.07, 0.4, 0.22, 0.01, '#35e6ff');
  cb.colliders.push({ t: 0, x0: L.desk.x - 2.1, x1: L.desk.x + 2.1, z0: L.desk.z - 0.62, z1: L.desk.z + 0.62 });
  // key board on the back wall
  G.box(L.cx, CURB + 2.6, L.z1 - 0.5, 8, 1.6, 0.06, '#14161a');
  for (let i = 0; i < 4; i++) G.box(L.cx - 3 + i * 2, CURB + 2.6, L.z1 - 0.54, 1.2, 0.9, 0.02, ['#e8c020', '#1f3a63', '#2e4a3a', '#c8141c'][i]);
  // outdoor lot: ~10 cars for show, bunting, banner
  const types = [0.1, 0.3, 0.5, 0.65, 0.75, 0.9, 0.2, 0.55];
  const cols = ['#c9ccd1', '#1b1d20', '#ececec', '#8a1c1c', '#1f3a63', '#5a5f66', '#d8d2c4', '#2e4a3a'];
  for (let k = 0; k < 10; k++) {
    const col = k % 5, row = Math.floor(k / 5);
    parkCar(cb, LOT0 + 14 + col * 14, L.z1 + 10 + row * 12, rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2 + 0.0, { type: types[k % types.length], color: cols[(k * 3) % cols.length] });
  }
  for (let x = LOT0 + 5; x < LOT1 - 4; x += 1) { /* bunting */ }
  for (let i = 0; i < 16; i++) { const bx = LOT0 + 6 + i * 4.8; G.box(bx, CURB + 6.2 + Math.sin(i * 1.3) * 0.2, L.z1 + 4, 0.5, 0.35, 0.02, ['#c8141c', '#ffffff', '#35e6ff'][i % 3]); }
  G.box((LOT0 + 6 + LOT0 + 6 + 15 * 4.8) / 2, CURB + 6.4, L.z1 + 4, 15 * 4.8, 0.02, 0.02, '#17181b');
  for (const x of [LOT0 + 4, LOT0 + 6 + 15 * 4.8 + 1]) { G.cyl(x, CURB, L.z1 + 4, 0.08, 6.4, '#33363b', 8); cb.circ(x, L.z1 + 4, 0.1); }
  for (const [x, z] of [[LOT0 + 12, L.z1 + 5], [LOT0 + 55, L.z1 + 5], [LOT1 - 8, LOT1 - 8], [LOT0 + 36, LOT1 - 6]]) lampPole(cb, x, z, 7);
  for (let i = 0; i < 5; i++) cb.tree(LOT1 - 3 - rnd() * 3, L.z0 + rnd() * 60, CURB);
  // flags at the front
  for (const fx of [L.x0 - 1.4, L.x1 + 1.4]) { G.cyl(fx, CURB, L.z0 - 2.4, 0.07, 8, '#cfd2d6', 6); G.box(fx + 0.8, CURB + 7.2, L.z0 - 2.4, 1.5, 1.0, 0.03, L.accent); cb.circ(fx, L.z0 - 2.4, 0.12); }
  // pavement plaza in front of the glass front (where bought cars are delivered): marking
  M.plane(L.out.x - 2.6, L.out.z - 1.2, L.out.x + 2.6, L.out.z + 1.2, CURB + 0.03, '#35e6ff');
  M.plane(L.out.x - 2.5, L.out.z - 1.1, L.out.x + 2.5, L.out.z + 1.1, CURB + 0.035, '#1c1e22');
}

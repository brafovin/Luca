import * as THREE from 'three';
import { BatchSet } from './batch.js';

/* Race track: a ~29 km closed circuit far north of the city. Wide asphalt, kerbs, run-off areas –
   completely free of traffic, pedestrians and buildings. Everything is derived from one polyline. */
const P = 100, RH = 5.9; // same grid as the city chunks
export const TRACK_W = 32;
const HW = TRACK_W / 2;
const ORG = { x: 0, z: 12000 };
const ZONE = { x0: -8400, x1: 8400, z0: 10300, z1: 15900 };

export function inTrackZone(x, z) { return x > ZONE.x0 && x < ZONE.x1 && z > ZONE.z0 && z < ZONE.z1; }
export function isTrackChunk(ci, cj) { return inTrackZone(ci * P + 44, cj * P + 44); }

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/* ---------------------------------------------------------------- path */
const TX = [], TZ = [], NX = [], NZ = [], PS = [], SL = [];
export const TRACK = { len: 0, N: 0, W: TRACK_W, start: { x: ORG.x, z: ORG.z, h: Math.PI / 2 } };
(function buildPath() {
  const L = 6000, R = 800, STEP = 10, A = 420, LAM = 3200, TAPER = 900;
  const pts = [];
  for (let x = 0; x < L; x += STEP) pts.push([x, 0]); // main straight (east), s = 0 at the start/finish line
  for (let a = -Math.PI / 2; a < Math.PI / 2 - 1e-6; a += STEP / R) pts.push([L + R * Math.cos(a), R + R * Math.sin(a)]); // east bend
  for (let x = L; x > -L; x -= STEP) { // back straight (west) with S-bends
    const d = L - x, env = smooth(d / TAPER) * smooth((2 * L - d) / TAPER);
    pts.push([x, 2 * R + A * Math.sin((2 * Math.PI * d) / LAM) * env]);
  }
  for (let a = Math.PI / 2; a < (3 * Math.PI) / 2 - 1e-6; a += STEP / R) pts.push([-L + R * Math.cos(a), R + R * Math.sin(a)]); // west bend
  for (let x = -L; x < 0; x += STEP) pts.push([x, 0]); // end of the west bend leads back into the main straight
  const n = pts.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    TX.push(ORG.x + pts[i][0]); TZ.push(ORG.z + pts[i][1]);
  }
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const tx = TX[b] - TX[a], tz = TZ[b] - TZ[a], l = Math.hypot(tx, tz) || 1;
    NX.push(-tz / l); NZ.push(tx / l); // left-hand normal
    PS.push(s);
    const sl = Math.hypot(TX[b] - TX[i], TZ[b] - TZ[i]);
    SL.push(sl); s += sl;
  }
  TRACK.len = s;
})();
const N = TX.length;
TRACK.N = N;

/** nearest point on the centre line; hint = previous index for a fast local search */
export function trackProject(x, z, hint = -1) {
  let best = -1, bd = 1e18;
  const test = (i) => { const d = (TX[i] - x) ** 2 + (TZ[i] - z) ** 2; if (d < bd) { bd = d; best = i; } };
  if (hint < 0) for (let i = 0; i < N; i++) test(i);
  else for (let k = -60; k <= 120; k++) test((hint + k + N * 4) % N);
  // refine on the segment
  const i = best, j = (i + 1) % N, h = (i + N - 1) % N;
  let a = i, b = j;
  const dj = (TX[j] - x) ** 2 + (TZ[j] - z) ** 2, dh = (TX[h] - x) ** 2 + (TZ[h] - z) ** 2;
  if (dh < dj) { a = h; b = i; }
  const sx = TX[b] - TX[a], sz = TZ[b] - TZ[a], sl = SL[a] || 1;
  const t = Math.max(0, Math.min(1, ((x - TX[a]) * sx + (z - TZ[a]) * sz) / (sl * sl)));
  const cx = TX[a] + sx * t, cz = TZ[a] + sz * t;
  const lat = (x - cx) * NX[a] + (z - cz) * NZ[a];
  return { idx: best, s: PS[a] + sl * t, lat, d: Math.abs(lat) };
}
/** position + heading on the centre line at distance s */
export function trackAt(s) {
  s = ((s % TRACK.len) + TRACK.len) % TRACK.len;
  let lo = 0, hi = N - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (PS[m] <= s) lo = m; else hi = m - 1; }
  const i = lo, j = (i + 1) % N, t = (s - PS[i]) / (SL[i] || 1);
  const x = TX[i] + (TX[j] - TX[i]) * t, z = TZ[i] + (TZ[j] - TZ[i]) * t;
  return { x, z, h: Math.atan2(TX[j] - TX[i], TZ[j] - TZ[i]), idx: i };
}
/** points of the polyline near (x, z) for the minimap */
export function trackNear(x, z, r, out) {
  out.length = 0;
  const hint = trackProject(x, z).idx;
  for (let k = -50; k <= 50; k++) { const i = (hint + k * 3 + N * 4) % N; if ((TX[i] - x) ** 2 + (TZ[i] - z) ** 2 < r * r * 4) out.push(i); }
  return out;
}
export const trackXZ = (i) => [TX[i], TZ[i]];

/* ---------------------------------------------------------------- spatial index */
let IDX = null;
function index() {
  if (IDX) return IDX;
  IDX = new Map();
  const M = HW + 34;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const x0 = Math.min(TX[i], TX[j]) - M, x1 = Math.max(TX[i], TX[j]) + M, z0 = Math.min(TZ[i], TZ[j]) - M, z1 = Math.max(TZ[i], TZ[j]) + M;
    for (let ci = Math.floor((x0 + RH) / P); ci <= Math.floor((x1 + RH) / P); ci++) for (let cj = Math.floor((z0 + RH) / P); cj <= Math.floor((z1 + RH) / P); cj++) {
      const k = ci + ',' + cj;
      let a = IDX.get(k); if (!a) IDX.set(k, (a = []));
      a.push(i);
    }
  }
  return IDX;
}

/* ---------------------------------------------------------------- chunk geometry */
export function buildTrackChunk(ci, cj) {
  const S = new BatchSet();
  const ox = ci * P, oz = cj * P;
  S.ox = ox; S.oz = oz;
  const out = { S, colliders: [], lamps: [], glowPts: [], glowG: [], stations: [] };
  const A = S.get('trackAsphalt'), G = S.get('trackGround'), GR = S.get('grassT'), MK = S.get('mark'), GE = S.get('generic');
  const inChunk = (wx, wz) => wx >= ox - RH && wx < ox + P - RH && wz >= oz - RH && wz < oz + P - RH;
  const below = (c) => [c[0], -10, c[2]];

  // lawn under everything
  GR.plane(-RH, -RH, P - RH, P - RH, -0.03, [0.82, 0.86, 0.8], 6);

  const segs = index().get(ci + ',' + cj) || [];
  const pt = (i, off, y) => [TX[i] + NX[i] * off - ox, y, TZ[i] + NZ[i] * off - oz];
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t];
  const strip = (B, i, o0, o1, y, col, uvTile = 0) => {
    const j = (i + 1) % N;
    const a = pt(i, o0, y), b = pt(i, o1, y), c = pt(j, o1, y), d = pt(j, o0, y);
    const ref = below(a);
    if (uvTile) {
      const s0 = PS[i] / uvTile, s1 = (PS[i] + SL[i]) / uvTile;
      B.quad(a, b, c, d, col, [s0, o0 / uvTile, s0, o1 / uvTile, s1, o1 / uvTile, s1, o0 / uvTile], ref);
    } else B.quad(a, b, c, d, col, null, ref);
  };
  const stripSub = (B, i, o0, o1, y, colA, colB, n) => { // striped kerb
    const j = (i + 1) % N;
    const a = pt(i, o0, y), b = pt(i, o1, y), c = pt(j, o1, y), d = pt(j, o0, y);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      B.quad(lerp3(a, d, t0), lerp3(b, c, t0), lerp3(b, c, t1), lerp3(a, d, t1), (i * n + k) % 2 ? colA : colB, null, below(a));
    }
  };
  for (const i of segs) {
    strip(A, i, -HW, HW, 0, [0.8, 0.8, 0.83], 5);
    for (const sd of [-1, 1]) {
      strip(G, i, sd * HW, sd * (HW + 16), -0.012, [0.69, 0.64, 0.52]);
      if (sd > 0) stripSub(MK, i, HW - 1.3, HW, 0.012, '#d9d9d6', '#cc2a24', 5);
      else stripSub(MK, i, -HW, -HW + 1.3, 0.012, '#d9d9d6', '#cc2a24', 5);
      strip(MK, i, sd * (HW - 1.9), sd * (HW - 1.55), 0.013, '#f2f2ee');
    }
    if (i % 2 === 0) strip(MK, i, -0.17, 0.17, 0.013, '#f2f2ee');
    if (i % 100 === 0) for (const sd of [-1, 1]) { // grip marks: dark racing line
      strip(MK, i, sd * 3.2 - 1.2, sd * 3.2 + 1.2, 0.0105, '#4c4d52');
    }
  }

  // posts with glow every 50 m along both edges
  for (const i of segs) {
    if (i % 5 !== 0) continue;
    for (const sd of [-1, 1]) {
      const p = pt(i, sd * (HW + 2.2), 0);
      if (!inChunk(p[0] + ox, p[2] + oz)) continue;
      GE.box(p[0], 0.5, p[2], 0.14, 1.0, 0.14, i % 100 === 0 ? '#e8c020' : '#d8d8d4');
      out.glowPts.push(p[0], 1.05, p[2]);
    }
  }
  // km boards
  for (let k = 1; k * 1000 < TRACK.len; k++) {
    const c = trackAt(k * 1000), nx = -Math.cos(c.h), nz = Math.sin(c.h); // left normal
    const wx = c.x - nx * (HW + 4), wz = c.z - nz * (HW + 4);
    if (!inChunk(wx, wz)) continue;
    const col = new THREE.Color().setHSL((k * 0.083) % 1, 0.75, 0.5);
    GE.box(wx - ox, 2, wz - oz, 0.4, 4, 3.2, col);
    GE.box(wx - ox, 0.9, wz - oz, 0.2, 1.8, 0.2, '#555');
  }

  // start / finish: checker line, gantry, grandstand
  const gx = ORG.x, gz = ORG.z;
  for (let c = 0; c < 16; c++) for (let r = 0; r < 2; r++) {
    const wx = gx - 2 + r * 2 + 1, wz = gz - HW + c * 2 + 1;
    if (inChunk(wx, wz)) MK.plane(wx - ox - 1, wz - oz - 1, wx - ox + 1, wz - oz + 1, 0.015, (c + r) % 2 ? '#101012' : '#f4f4f0');
  }
  for (let sd = -1; sd <= 1; sd += 2) {
    const wz = gz + sd * (HW + 3);
    if (inChunk(gx, wz)) {
      GE.box(gx - ox, 4.2, wz - oz, 1.3, 8.4, 1.3, '#1d1f24');
      GE.box(gx - ox, 4.2, wz - oz, 1.34, 0.5, 1.34, '#cc2a24');
      out.colliders.push({ t: 1, x: gx - ox, z: wz - oz, r: 0.85 });
    }
  }
  for (let k = -9; k < 9; k++) {
    const wz = gz + k * 4 + 2;
    if (!inChunk(gx, wz)) continue;
    for (let q = 0; q < 2; q++) GE.box(gx - ox, 8.1 + q * 0.7, wz - oz, 1.5, 0.7, 4, (k + q) % 2 ? '#111' : '#f2f2ee');
  }
  for (let k = -14; k < 14; k++) { // main grandstand beside the start straight
    const wx = gx + k * 10 + 5, wz = gz - HW - 26;
    if (!inChunk(wx, wz)) continue;
    for (let t = 0; t < 4; t++) {
      GE.box(wx - ox, 1.2 + t * 1.1, wz - oz - t * 2.2, 9.6, 2.4 + t * 2.2, 2.2, ['#2b4a7a', '#7a2b2b', '#2b7a4a', '#7a6a2b'][(k + 28 + t) % 4]);
    }
    GE.box(wx - ox, 8.2, wz - oz - 4, 9.8, 0.25, 8.6, '#d8d8d4'); // roof
    for (const sx of [-4.5, 4.5]) GE.box(wx - ox + sx, 4.1, wz - oz + 1.2, 0.2, 8, 0.2, '#555');
  }
  return out;
}

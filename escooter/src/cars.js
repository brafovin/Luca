import * as THREE from 'three';

export const CARCOL = ['#c9ccd1', '#c9ccd1', '#1b1d20', '#1b1d20', '#ececec', '#ececec', '#5a5f66', '#1f3a63', '#8a1c1c', '#2e4a3a', '#d8d2c4', '#6e1f2a', '#33507a'];
let wheelGeo = null;

/**
 * Adds a car (facing +z, origin on ground at the centre) to the batch set.
 * opts: type (0..1 roll or 'bus'), color, lights ('generic' or 'lampW')
 */
export function addCar(S, rnd, opts = {}) {
  const type = opts.type ?? rnd();
  const lightB = opts.lights || 'generic';
  const PA = S.get('paint'), GL = S.get('glass'), G = S.get('generic');
  if (!wheelGeo) { wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8); wheelGeo.rotateZ(Math.PI / 2); }
  const wmat = new THREE.Matrix4();

  if (type === 'bus') {
    const L = 11.6, W = 2.5, H = 3.1;
    const col = opts.color || '#d3202a';
    const hw = W / 2;
    for (const sx of [-1, 1]) for (const z of [-L * 0.33, L * 0.3]) {
      G.geo(wheelGeo, wmat.makeScale(1.35, 1.35, 1.35).setPosition(sx * (hw - 0.15), 0.44, z), '#161718');
      G.box(sx * (hw - 0.02), 0.44, z, 0.02, 0.5, 0.5, '#9a9da1');
    }
    PA.box(0, 0.4 + (H - 0.4) / 2, 0, W, H - 0.4, L, col);
    PA.box(0, 1.0, 0, W + 0.02, 0.2, L + 0.02, '#f2f2f0'); // white stripe
    G.box(0, H + 0.1, 0, W - 0.2, 0.18, L - 0.5, '#d8d8d6'); // roof
    for (const sx of [-1, 1]) {
      const wx = sx * (hw + 0.008);
      for (let i = 0; i < 5; i++) GL.box(wx, 1.85, -L / 2 + 1.4 + i * 2.15, 0.02, 0.95, 1.9, '#ffffff');
    }
    GL.box(0, 1.9, L / 2 + 0.008, W - 0.3, 1.2, 0.02, '#ffffff');
    G.box(0, 2.85, L / 2 + 0.01, 1.6, 0.3, 0.03, '#101010'); // destination sign
    for (const sx of [-1, 1]) {
      S.get(lightB).box(sx * (hw - 0.25), 0.75, L / 2 + 0.01, 0.4, 0.2, 0.04, '#f6f4ea');
      PA.box(sx * (hw - 0.25), 0.9, -L / 2 - 0.01, 0.4, 0.22, 0.04, '#a31616');
    }
    return { L, W, H };
  }

  let L, W, H;
  if (type < 0.35) { L = 3.95; W = 1.74; H = 1.46; }
  else if (type < 0.6) { L = 4.6; W = 1.82; H = 1.44; }
  else if (type < 0.82) { L = 4.55; W = 1.9; H = 1.68; }
  else if (type < 0.92) { L = 5.1; W = 1.96; H = 2.0; }
  else { L = 3.6; W = 1.66; H = 1.5; }
  const col = opts.color || CARCOL[Math.floor(rnd() * CARCOL.length)];
  const hw = W / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wz = sz * L * 0.31, wx = sx * (hw - 0.13);
    G.geo(wheelGeo, wmat.makeTranslation(wx, 0.33, wz), '#1a1b1d');
    G.box(wx + sx * 0.115, 0.33, wz, 0.02, 0.36, 0.36, '#9a9da1');
  }
  const lowH = 0.62;
  PA.box(0, 0.3 + lowH / 2 + 0.06, 0, W, lowH, L, col);
  G.box(0, 0.38, L / 2 - 0.12, W - 0.1, 0.22, 0.28, '#222427');
  G.box(0, 0.38, -L / 2 + 0.12, W - 0.1, 0.22, 0.28, '#222427');
  const yb = 0.3 + lowH + 0.06, yt = H - 0.04;
  const rear0 = -L / 2 + 0.15, front0 = L / 2 - 0.2;
  let prof;
  if (type >= 0.82) prof = [[rear0, yb], [rear0 + 0.1, yt], [front0 - 0.5, yt], [front0, yb]]; // van
  else if (type >= 0.6) prof = [[rear0, yb], [rear0 + 0.15, yt], [front0 - 0.65, yt], [front0 - 0.2, yb]]; // SUV
  else prof = [[-L * 0.34 + (type < 0.35 ? -0.1 : 0), yb], [-L * 0.2 + (type < 0.35 ? -0.18 : 0.05), yt], [L * 0.04 + 0.2, yt], [L * 0.2 + 0.25, yb]];
  const cw = hw - 0.1;
  const mapX = (p, q, t) => [t, q, p];
  PA.extrude(prof, mapX, -cw, cw, col);
  const cen = [(prof[0][0] + prof[1][0] + prof[2][0] + prof[3][0]) / 4, (yb + yt) / 2];
  const inset = prof.map(([pz, py]) => [cen[0] + (pz - cen[0]) * 0.86, cen[1] + (py - cen[1]) * 0.74 + 0.01]);
  GL.extrude(inset, mapX, cw, cw + 0.014, '#ffffff');
  GL.extrude(inset, mapX, -cw - 0.014, -cw, '#ffffff');
  const zMid = (inset[1][0] + inset[2][0]) / 2;
  for (const sx of [-1, 1]) PA.box(sx * (cw + 0.006), (yb + yt) / 2, zMid, 0.03, yt - yb - 0.14, 0.07, col);
  const win = (A, B, t0, t1) => {
    const a = [A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0], b2 = [A[0] + (B[0] - A[0]) * t1, A[1] + (B[1] - A[1]) * t1];
    let nz = -(B[1] - A[1]), ny = B[0] - A[0];
    const l = Math.hypot(nz, ny) || 1; nz /= l; ny /= l;
    if (nz * (A[0] - cen[0]) + ny * (A[1] - cen[1]) < 0) { nz = -nz; ny = -ny; }
    const o = 0.012, w = cw - 0.12;
    GL.quad([-w, a[1] + ny * o, a[0] + nz * o], [w, a[1] + ny * o, a[0] + nz * o], [w, b2[1] + ny * o, b2[0] + nz * o], [-w, b2[1] + ny * o, b2[0] + nz * o], '#ffffff', null, [0, cen[1], cen[0]]);
  };
  win(prof[3], prof[2], 0.1, 0.86);
  win(prof[0], prof[1], 0.12, 0.84);
  for (const sx of [-1, 1]) PA.box(sx * (hw + 0.07), yb + 0.18, L * 0.19, 0.12, 0.1, 0.2, col);
  G.box(0, 0.62, L / 2 + 0.005, 0.7, 0.2, 0.03, '#1a1b1d');
  const LB = S.get(lightB);
  for (const sx of [-1, 1]) {
    LB.box(sx * (hw - 0.3), 0.74, L / 2 - 0.02, 0.38, 0.12, 0.06, '#f6f4ea');
    PA.box(sx * (hw - 0.26), 0.78, -L / 2 + 0.02, 0.42, 0.14, 0.06, '#a31616');
  }
  G.box(0, 0.48, L / 2 + 0.03, 0.5, 0.12, 0.02, '#e8e8e0');
  G.box(0, 0.58, -L / 2 - 0.03, 0.5, 0.12, 0.02, '#e8e8e0');
  return { L, W, H };
}

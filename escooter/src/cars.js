import * as THREE from 'three';
import { limb, addSeated, SKINS } from './people.js';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const CARCOL = ['#c9ccd1', '#c9ccd1', '#1b1d20', '#1b1d20', '#ececec', '#ececec', '#5a5f66', '#1f3a63', '#8a1c1c', '#2e4a3a', '#d8d2c4', '#6e1f2a', '#33507a'];
let wheelGeo = null, rimGeo = null, spokeGeo = null, hubGeo = null, discGeo = null;
function makeWheelParts() {
  wheelGeo = new THREE.CylinderGeometry(0.335, 0.335, 0.22, 18); wheelGeo.rotateZ(Math.PI / 2);                // tyre
  rimGeo = new THREE.CylinderGeometry(0.215, 0.215, 0.232, 16); rimGeo.rotateZ(Math.PI / 2);                  // rim barrel
  spokeGeo = new THREE.BoxGeometry(0.236, 0.05, 0.19); spokeGeo.translate(0, 0.1, 0);                          // one spoke (radial, along y)
  hubGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.245, 8); hubGeo.rotateZ(Math.PI / 2);
  discGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14); discGeo.rotateZ(Math.PI / 2);                   // brake disc behind the spokes
}
function addWheel(G, wx, wy, wz, sx) {
  const m = new THREE.Matrix4();
  G.geo(wheelGeo, m.makeTranslation(wx, wy, wz), '#111213');
  G.geo(rimGeo, m.makeTranslation(wx + sx * 0.004, wy, wz), '#aeb2b8');
  G.geo(discGeo, m.makeTranslation(wx - sx * 0.03, wy, wz), '#5a5d62');
  for (let i = 0; i < 5; i++) { const r = new THREE.Matrix4().makeRotationX((i / 5) * Math.PI * 2); r.setPosition(wx + sx * 0.006, wy, wz); G.geo(spokeGeo, r, '#2c2d31'); }
  G.geo(hubGeo, m.makeTranslation(wx + sx * 0.006, wy, wz), '#c9ccd1');
  G.box(wx + sx * 0.12, wy + 0.19, wz + 0.1, 0.02, 0.04, 0.012, '#d8d8d8'); // tyre lettering/valve
}
const sxOff = (v, W) => v * (W > 1.9 ? 1 : 0.9), yMir = (t) => (t >= 0.82 ? 1.14 : 1.02);
const wheelTorus = new THREE.TorusGeometry(0.2, 0.025, 6, 14);

/**
 * Adds a car (facing +z, origin on ground at the centre) to the batch set.
 * opts: type (0..1 roll or 'bus'), color, lights ('generic' or 'lampW')
 */
export function addCar(S, rnd, opts = {}) {
  const type = opts.type ?? rnd();
  const lightB = opts.lights || 'generic';
  const PA = S.get('paint'), GL = S.get('cglass'), G = S.get('generic');
  const people = !!opts.people;
  if (!wheelGeo) makeWheelParts();
  const wmat = new THREE.Matrix4();

  if (type === 'bus') {
    const L = 11.6, W = 2.5, H = 3.1;
    const col = opts.color || '#d3202a';
    const hw = W / 2;
    for (const sx of [-1, 1]) for (const z of [-L * 0.33, L * 0.3]) {
      G.geo(wheelGeo, wmat.makeScale(1.35, 1.35, 1.35).setPosition(sx * (hw - 0.15), 0.44, z), '#161718');
      G.box(sx * (hw - 0.02), 0.44, z, 0.02, 0.5, 0.5, '#9a9da1');
    }
    // hollow shell: solid lower body, roof band, window pillars and rear wall – so the interior can be seen
    PA.box(0, 0.4 + 0.475, 0, W, 0.95, L, col);
    G.box(0, 1.352, 0, W - 0.16, 0.02, L - 0.3, '#3b3b40');
    PA.box(0, (2.35 + H) / 2, 0, W, H - 2.35, L, col);
    G.box(0, 2.34, 0, W - 0.16, 0.02, L - 0.4, '#d0d0cc', { bottom: true });
    PA.box(0, 1.85, -L / 2 + 0.1, W, 1.0, 0.2, col);
    for (const sx of [-1, 1]) for (let i = 0; i <= 5; i++) PA.box(sx * (hw - 0.06), 1.85, -L / 2 + 0.45 + i * 2.15 - (i === 5 ? 0.05 : 0), 0.12, 1.0, 0.3, col);
    PA.box(0, 1.0, 0, W + 0.02, 0.2, L + 0.02, '#f2f2f0'); // white stripe
    // interior: driver cab, seat rows, grab poles
    const seatC = '#2c3e5a';
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
      const zc = -L / 2 + 1.4 + i * 2.15;
      for (const dz of [-0.5, 0.5]) { G.box(sx * 0.85, 1.52, zc + dz, 0.5, 0.14, 0.5, seatC); G.box(sx * 0.85, 1.82, zc + dz - 0.25, 0.5, 0.52, 0.1, seatC); }
    }
    for (const x of [-0.3, 0.3]) for (let i = 0; i < 4; i++) G.cyl(x, 1.36, -L / 2 + 2.4 + i * 2.15, 0.025, 1.0, '#e8c020', 6);
    G.box(0.62, 1.62, L / 2 - 1.3, 0.5, 0.14, 0.5, '#1f2024'); G.box(0.62, 1.95, L / 2 - 1.55, 0.5, 0.5, 0.1, '#1f2024'); // driver seat
    G.box(0.2, 1.55, L / 2 - 0.45, 0.9, 0.6, 0.5, '#1c1d20'); // cockpit desk
    G.geo(wheelTorus, new THREE.Matrix4().makeRotationX(0.9).setPosition(0.62, 1.85, L / 2 - 0.62), '#17181a');
    if (people) {
      addSeated(G, 0.62, 1.3, L / 2 - 1.3, { wheel: { x: 0.62, y: 1.85, z: L / 2 - 0.62 }, shirt: '#2a3a5a', female: false }, rnd);
      for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) for (const dz of [-0.5, 0.5]) if (rnd() < 0.3) addSeated(G, sx * 0.85, 1.28, -L / 2 + 1.4 + i * 2.15 + dz, {}, rnd);
    }
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
    return { L, W, H, type: 'bus', col };
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
    addWheel(G, wx, 0.335, wz, sx);
  }
  const lowH = 0.62;
  const hoodY = type >= 0.82 ? 0.9 : 0.97, noseY = type >= 0.82 ? 0.78 : 0.84;
  const body = type >= 0.82
    ? [[-L / 2, 0.36], [-L / 2, 0.9], [-L * 0.3, 0.97], [L * 0.3, 0.97], [L / 2 - 0.1, 0.8], [L / 2, 0.62], [L / 2, 0.42], [L / 2 - 0.2, 0.34]]
    : [[-L / 2, 0.36], [-L / 2, 0.86], [-L * 0.36, 0.97], [L * 0.26, 0.99], [L / 2 - 0.08, 0.82], [L / 2, 0.6], [L / 2, 0.42], [L / 2 - 0.2, 0.34]];
  PA.extrude(body, (p, q, t) => [t, q, p], -hw, hw, col);
  for (const sx of [-1, 1]) { // shoulder crease / sill trim
    G.box(sx * (hw + 0.004), 0.72, 0, 0.012, 0.025, L * 0.8, '#00000040'.slice(0, 7));
    PA.box(sx * (hw - 0.02), 0.74, 0, 0.05, 0.05, L * 0.74, col);
  }
  G.box(0, 0.35, 0, W + 0.02, 0.1, L * 0.62, '#16171a'); // plastic sill
  // front: grille, bumper, headlights, fog lamps; rear: bumper, exhaust
  G.box(0, 0.7, L / 2 + 0.002, 0.74, 0.17, 0.03, '#0d0e10');
  for (let i = 0; i < 4; i++) G.box(0, 0.65 + i * 0.04, L / 2 + 0.018, 0.7, 0.012, 0.012, '#6a6d72');
  G.box(0, 0.48, L / 2 + 0.01, W - 0.04, 0.2, 0.2, '#1c1d20'); // front bumper
  G.box(0, 0.36, L / 2 + 0.05, 0.8, 0.07, 0.06, '#111214'); // splitter
  for (const sx of [-1, 1]) G.box(sx * (hw - 0.3), 0.46, L / 2 + 0.115, 0.16, 0.06, 0.02, '#e8e4d0'); // fog lamps
  G.box(0, 0.52, -L / 2 - 0.01, W - 0.04, 0.22, 0.2, '#1c1d20'); // rear bumper
  G.cyl(sxOff(0.52, W), 0.37, -L / 2 - 0.08, 0.035, 0.09, '#b9bcc0', 8, false);
  for (const sx of [-1, 1]) { // wing mirrors
    G.box(sx * (hw + 0.1), yMir(type), L * 0.16, 0.14, 0.09, 0.09, '#101113');
    PA.box(sx * (hw + 0.03), yMir(type) - 0.02, L * 0.16, 0.1, 0.03, 0.07, col);
    G.box(sx * (hw + 0.17), yMir(type), L * 0.16 + 0.002, 0.008, 0.07, 0.07, '#8fa4b4');
  }
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
  // hollow cabin: roof slab + pillars + sills (the sides are glass, so the interior is visible)
  PA.quad(mapX(prof[1][0], prof[1][1], -cw), mapX(prof[2][0], prof[2][1], -cw), mapX(prof[2][0], prof[2][1], cw), mapX(prof[1][0], prof[1][1], cw), col, null, [0, -10, 0]);
  G.quad(mapX(prof[1][0], prof[1][1] - 0.02, -cw), mapX(prof[2][0], prof[2][1] - 0.02, -cw), mapX(prof[2][0], prof[2][1] - 0.02, cw), mapX(prof[1][0], prof[1][1] - 0.02, cw), '#8c8a84', null, [0, 10, 0]); // headliner
  for (const sx of [-1, 1]) {
    const px = sx * cw;
    limb(PA, V3(px, prof[3][1], prof[3][0]), V3(px, prof[2][1], prof[2][0]), 0.04, col);   // A pillar
    limb(PA, V3(px, prof[0][1], prof[0][0]), V3(px, prof[1][1], prof[1][0]), 0.045, col);   // C pillar
    limb(PA, V3(px, prof[1][1], prof[1][0]), V3(px, prof[2][1], prof[2][0]), 0.03, col);    // roof rail
    PA.box(px, yb + 0.01, (prof[0][0] + prof[3][0]) / 2, 0.07, 0.07, prof[3][0] - prof[0][0], col); // sill
  }
  limb(PA, V3(-cw, prof[3][1], prof[3][0]), V3(cw, prof[3][1], prof[3][0]), 0.04, col);      // cowl
  limb(PA, V3(-cw, prof[0][1], prof[0][0]), V3(cw, prof[0][1], prof[0][0]), 0.04, col);      // rear deck edge
  limb(PA, V3(-cw, prof[1][1], prof[1][0]), V3(cw, prof[1][1], prof[1][0]), 0.035, col);
  limb(PA, V3(-cw, prof[2][1], prof[2][0]), V3(cw, prof[2][1], prof[2][0]), 0.035, col);
  const cen = [(prof[0][0] + prof[1][0] + prof[2][0] + prof[3][0]) / 4, (yb + yt) / 2];
  const inset = prof.map(([pz, py]) => [cen[0] + (pz - cen[0]) * 0.86, cen[1] + (py - cen[1]) * 0.74 + 0.01]);
  GL.extrude(inset, mapX, cw, cw + 0.014, '#ffffff');
  GL.extrude(inset, mapX, -cw - 0.014, -cw, '#ffffff');
  const zMid = (inset[1][0] + inset[2][0]) / 2;
  for (const sx of [-1, 1]) PA.box(sx * (cw + 0.006), (yb + yt) / 2, zMid, 0.03, yt - yb - 0.14, 0.07, col);
  // ---- interior: dashboard, seats, steering wheel, rear bench, mirror (and people if this car is driving)
  {
    const seatCols = ['#24262a', '#3a342e', '#2b3038', '#4a4338'];
    const sc = seatCols[Math.floor(rnd() * seatCols.length)];
    const zD = prof[2][0] - 0.3, hipY = 0.56, zW = prof[3][0];
    G.box(0, 0.5, (prof[0][0] + prof[3][0]) / 2, 2 * cw - 0.1, 0.05, prof[3][0] - prof[0][0] - 0.2, '#25262a');                 // floor
    G.box(0, 0.9, zW - 0.28, 2 * cw - 0.12, 0.14, 0.5, '#1d1e21');                                                          // dashboard
    G.box(0, 0.98, zW - 0.5, 2 * cw - 0.3, 0.07, 0.3, '#17181a');                                                          // instrument hood
    for (const sx of [-1, 1]) {
      G.box(sx * 0.4, 0.52, zD, 0.46, 0.12, 0.5, sc);                                                                         // seat cushion
      G.box(sx * 0.4, 0.86, zD - 0.27, 0.46, 0.56, 0.11, sc);                                                                 // backrest
      G.box(sx * 0.4, 1.2, zD - 0.28, 0.22, 0.17, 0.08, sc);                                                                  // headrest
    }
    G.box(0, 0.56, zD + 0.15, 0.2, 0.22, 0.75, '#1a1b1e');                                                                    // centre console
    const zr = zD - 0.82;
    if (prof[2][0] - prof[1][0] > 1.5 || type >= 0.6) {
      G.box(0, 0.52, zr, 2 * cw - 0.3, 0.12, 0.5, sc); G.box(0, 0.84, zr - 0.27, 2 * cw - 0.3, 0.52, 0.1, sc);               // rear bench
    }
    const wz = zD + 0.62, wy = 0.96;
    G.geo(wheelTorus, new THREE.Matrix4().makeRotationX(-1.0).setPosition(0.4, wy, wz).multiply(new THREE.Matrix4().makeScale(0.82, 0.82, 0.82)), '#141517');
    limb(G, V3(0.4, wy - 0.02, wz - 0.02), V3(0.4, wy - 0.18, wz + 0.2), 0.02, '#111');
    G.box(0, prof[2][1] - 0.1, prof[2][0] + 0.12, 0.2, 0.07, 0.04, '#17181a');                                                // rear-view mirror
    if (people) {
      addSeated(G, 0.4, hipY, zD - 0.1, { wheel: { x: 0.4, y: wy, z: wz }, female: rnd() < 0.35 }, rnd);
      if (rnd() < 0.5) addSeated(G, -0.4, hipY, zD - 0.1, { female: rnd() < 0.5 }, rnd);
    }
  }
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
  // wheel arches, door seams, handles, skirts, roof details
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) G.box(sx * (hw + 0.004), 0.52, sz * L * 0.31, 0.02, 0.5, 0.74, '#0e0f10');
    for (const z of [L * 0.18, -L * 0.04, -L * 0.24]) G.box(sx * (hw + 0.003), 0.62, z, 0.012, 0.5, 0.014, '#0a0a0b');
    for (const z of [L * 0.1, -L * 0.1]) G.box(sx * (hw + 0.012), yb - 0.06, z, 0.02, 0.03, 0.13, '#cfd2d6');
    G.box(sx * (hw - 0.01), 0.34, 0, 0.03, 0.08, L * 0.5, '#151617');
    if (type >= 0.6 && type < 0.82) G.box(sx * 0.7, yt + 0.05, (prof[1][0] + prof[2][0]) / 2, 0.03, 0.04, prof[2][0] - prof[1][0] - 0.3, '#18191b'); // roof rails
  }
  if (type < 0.35 && rnd() < 0.5) G.box(0, yt - 0.02, prof[1][0] - 0.05, W * 0.8, 0.04, 0.2, '#16171a'); // spoiler
  if (rnd() < 0.5) G.cyl(0.0, yt + 0.02, prof[1][0] + 0.2, 0.008, 0.28, '#111', 4, false); // antenna
  return { L, W, H, type, col, cab: { prof, yb, yt, cw, cen } };
}

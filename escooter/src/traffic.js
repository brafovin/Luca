import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { addCar } from './cars.js';
import { P } from './world.js';
import { mulberry32, clamp, damp } from './util.js';
import { ik2 } from './scooter.js';
import { addFace, addSeated, limb as pLimb, ball as pBall } from './people.js';

const STOP = 11.2; // stop line distance from intersection centre
const LANE = 1.75;

function buildVehicleMeshes(M, rnd, bus) {
  const S = new BatchSet();
  const dim = addCar(S, rnd, { type: bus ? 'bus' : undefined, lights: 'lampW', people: true });
  const g = new THREE.Group();
  const map = { paint: 'paint', glass: 'glass', cglass: 'carGlass', generic: 'generic', lampW: 'lampW' };
  for (const [k, b] of Object.entries(S.b)) {
    if (b.empty) continue;
    const m = new THREE.Mesh(b.build(), M[map[k]]);
    m.castShadow = k !== 'glass' && k !== 'cglass' && k !== 'lampW';
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

export function buildAiScooter(M, rnd, o = {}) {
  const set = new BatchSet(); const B = set.get('body'), LT = set.get('light');
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const body = o.body || pick(BODY_COL), jacket = o.jacket || pick(JACKET), pants = o.pants || pick(['#1c1f26', '#2b3550', '#3a3a3e', '#4a3f35']);
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
  if (o.pack !== undefined ? o.pack : rnd() < 0.55) B.box(0, 1.16, -0.25, 0.32, 0.4, 0.19, o.pack || pick(['#ff7a1a', '#1d1d20', '#d8d8d4']));
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
  const style = o.style ?? rnd();
  partAt(B, new THREE.SphereGeometry(0.1, 12, 10), 0, headY, headZ, style < 0.35 ? '#0d0d0f' : skin, 1, 1.1, 1.06);
  partAt(B, new THREE.CylinderGeometry(0.06, 0.075, 0.14, 8), 0, headY - 0.11, headZ - 0.02, style < 0.35 ? '#0d0d0f' : skin);
  if (style < 0.35) B.box(0, headY + 0.012, headZ + 0.09, 0.12, 0.035, 0.02, skin);
  if (style < 0.35) for (const sx of [-1, 1]) { B.box(sx * 0.037, headY + 0.016, headZ + 0.1, 0.034, 0.02, 0.012, '#f4f4f2'); B.box(sx * 0.039, headY + 0.016, headZ + 0.106, 0.016, 0.016, 0.008, '#2a4a7a'); } // balaclava: just the eyes
  else addFace(B, 0, headY + 0.012, headZ, { skin, hair: null, brow: '#2a1d14', glasses: rnd() < 0.12 }, rnd); // eyes, nose, mouth, ears
  if (style < 0.85) partAt(B, new THREE.SphereGeometry(0.125, 12, 8, 0, 6.283, 0, 1.8), 0, headY + 0.014, headZ, o.helmet || pick(['#f2f2f0', '#c42a2a', '#16171a', '#2a5fb4', '#e6a21e']), 1, 1.04, 1.1);
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

/** friendly teenager on a Simson (AI rider) */
export function buildAiMoped(M, rnd) {
  const set = new BatchSet(); const B = set.get('body'); const LT = set.get('light');
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const col = pick(['#2a62c4', '#2f8a56', '#e8c020', '#c42a2a', '#e8541a']);
  const dark = '#17181b', chrome = '#cfd2d6';
  B.box(0, 0.35, 0.0, 0.3, 0.3, 0.34, '#9da1a6');                    // engine
  B.box(0, 0.5, -0.45, 0.2, 0.06, 0.6, dark);                         // frame
  B.box(0, 0.7, 0.13, 0.24, 0.17, 0.5, col);                          // tank
  B.box(0, 0.78, -0.33, 0.26, 0.09, 0.78, '#141416');                 // seat
  B.box(0.2, 0.27, -0.4, 0.1, 0.1, 0.66, chrome);                     // exhaust
  B.box(0.2, 0.27, -0.74, 0.07, 0.07, 0.1, dark);
  pLimb(B, new THREE.Vector3(0, 0.3, 0.6), new THREE.Vector3(0, 0.95, 0.5), 0.022, dark);
  B.box(0, 0.97, 0.5, 0.76, 0.025, 0.025, chrome);
  pBall(B, 0, 0.9, 0.58, 0.09, 0.09, 0.06, chrome);
  LT.box(0, 0.9, 0.64, 0.1, 0.07, 0.02, '#ffffff');
  B.box(0, 0.62, -0.84, 0.1, 0.05, 0.03, '#c01818');
  B.box(0.12, 0.28, 0.02, 0.2, 0.02, 0.06, dark); B.box(-0.12, 0.28, 0.02, 0.2, 0.02, 0.06, dark); // footrests
  // seated rider: friendly face, hoodie, helmet pushed back, one arm on the bars (the other one waves)
  const shirt = pick(['#2f4a7a', '#8a2f2f', '#2f6a4a', '#d6b24a', '#6a3f7a', '#e07a2e']);
  const hip = new THREE.Vector3(0, 0.84, -0.3);
  addSeated(B, hip.x, hip.y, hip.z, { moped: true, lean: -0.16, handDX: 0.0, wheel: { x: 0.0, y: 0.97, z: 0.5 }, shirt, female: rnd() < 0.3, hair: undefined }, rnd);
  // helmet resting on the head (open-face)
  const hy = hip.y + 0.69 + 0.012, hz = hip.z + 0.16 * 0.2 + 0.02 + 0.02;
  const helm = new THREE.SphereGeometry(0.125, 12, 8, 0, 6.283, 0, 1.45);
  const hm = new THREE.Matrix4().compose(new THREE.Vector3(0, hy + 0.012, hz - 0.01), new THREE.Quaternion(), new THREE.Vector3(1, 1.02, 1.12));
  B.geo(helm, hm, pick(['#f2f2f0', '#c42a2a', '#16171a', '#2a5fb4', '#e6a21e']));
  B.box(0, hy - 0.01, hz - 0.17, 0.2, 0.05, 0.02, '#16171a');
  const g = new THREE.Group(), tilt = new THREE.Group();
  g.add(tilt);
  const bm = new THREE.Mesh(B.build(), M.generic); bm.castShadow = true; bm.receiveShadow = true; tilt.add(bm);
  tilt.add(new THREE.Mesh(LT.build(), M.lampW));
  // waving arm (separate): shown when the player is close
  const skinArm = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.62, 8), new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8 }));
  arm.position.y = 0.31; skinArm.add(arm);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), new THREE.MeshStandardMaterial({ color: '#e8bd9a', roughness: 0.8 })); hand.position.y = 0.66; skinArm.add(hand);
  skinArm.position.set(-0.24, 1.3, -0.3); skinArm.rotation.set(0.2, 0, 0.55); skinArm.visible = false;
  tilt.add(skinArm);
  // wheels
  const tg = new THREE.TorusGeometry(0.25, 0.045, 8, 22); tg.rotateY(Math.PI / 2);
  const wmat = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9 });
  const hubG = new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14); hubG.rotateZ(Math.PI / 2);
  const mk = () => { const w = new THREE.Group(); const t = new THREE.Mesh(tg, wmat); t.castShadow = true; const h = new THREE.Mesh(hubG, new THREE.MeshStandardMaterial({ color: 0xaeb2b8, metalness: 0.8, roughness: 0.4 })); const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), new THREE.MeshStandardMaterial({ color: 0x777b80 })); w.add(t, h, sp); return w; };
  const wf = mk(), wr = mk();
  wf.position.set(0, 0.29, 0.6); wr.position.set(0, 0.29, -0.6);
  tilt.add(wf, wr);
  return { group: g, tilt, wf, wr, L: 2.0, W: 0.7, moped: true, wheelR: 0.29, waveArm: skinArm };
}

function buildPoliceCar(M, rnd, glowTex) {
  const S = new BatchSet();
  const dim = addCar(S, rnd, { type: 0.45, color: '#eceff1', lights: 'lampW', people: true });
  const { L, W, H } = dim;
  const PA = S.get('paint'), G = S.get('generic');
  const g = new THREE.Group();
  // blue livery
  for (const sx of [-1, 1]) {
    PA.box(sx * (W / 2 + 0.004), 0.66, -L * 0.02, 0.01, 0.2, L * 0.62, '#1f4fb4');
    PA.box(sx * (W / 2 + 0.004), 0.5, -L * 0.02, 0.01, 0.05, L * 0.62, '#f2c200');
  }
  PA.box(0, 0.91, L * 0.33, W - 0.3, 0.012, L * 0.2, '#1f4fb4'); // bonnet stripe
  // roof light bar (dark housing, lenses are separate emissive meshes)
  const yr = H - 0.02;
  G.box(0, yr + 0.05, -L * 0.04, W * 0.62, 0.1, 0.28, '#1a1b1e');
  const mats = [new THREE.MeshBasicMaterial({ color: 0x1a4cff, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x1a4cff, toneMapped: false })];
  const lensL = new THREE.Mesh(new THREE.BoxGeometry(W * 0.27, 0.075, 0.25), mats[0]); lensL.position.set(W * 0.16, yr + 0.07, -L * 0.04);
  const lensR = new THREE.Mesh(new THREE.BoxGeometry(W * 0.27, 0.075, 0.25), mats[1]); lensR.position.set(-W * 0.16, yr + 0.07, -L * 0.04);
  // grille / rear flashers
  const fl = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), mats[sx > 0 ? 0 : 1]); f.position.set(sx * 0.4, 0.64, L / 2 + 0.01); fl.push(f);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.02), mats[sx > 0 ? 1 : 0]); r.position.set(sx * 0.42, 1.02, -L / 2 + 0.28); r.rotation.x = 0.4; fl.push(r);
  }
  for (const [k, b] of Object.entries(S.b)) {
    if (b.empty) continue;
    const m = new THREE.Mesh(b.build(), M[{ paint: 'paint', glass: 'glass', cglass: 'carGlass', generic: 'generic', lampW: 'lampW' }[k]]);
    m.castShadow = k !== 'glass' && k !== 'cglass' && k !== 'lampW'; m.receiveShadow = true; g.add(m);
  }
  g.add(lensL, lensR, ...fl);
  // "POLIZEI" lettering on both doors
  const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '900 46px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#12308a'; x.fillText('POLIZEI', 128, 34); return c; })());
  tex.colorSpace = THREE.SRGBColorSpace;
  const dm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.27), dm); d.position.set(sx * (W / 2 + 0.014), 0.74, -L * 0.02); d.rotation.y = sx * Math.PI / 2; g.add(d); }
  // light glows (visible during pursuit only)
  const glows = [];
  for (const [lx, m] of [[W * 0.16, mats[0]], [-W * 0.16, mats[1]]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3a6bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    sp.scale.set(3.2, 3.2, 1); sp.position.set(lx, yr + 0.3, -L * 0.04); g.add(sp); glows.push(sp);
  }
  return { group: g, L, W, H, sirenMats: mats, glows };
}

export class Traffic {
  constructor(scene, M, count = 12, riders = 8, opts = {}) {
    this.onGreet = null;
    this.hlMat = new THREE.SpriteMaterial({ map: opts.glow, color: 0xfff0c8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false });
    this.tlMat = new THREE.SpriteMaterial({ map: opts.glow, color: 0xff2a1a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false });
    this.poolMat = new THREE.MeshBasicMaterial({ map: opts.pool, color: 0xffeebb, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    this.scene = scene;
    this.M = M;
    this.rnd = mulberry32(99);
    this.cars = [];
    this.count = count;
    this.dyn = [];
    this.time = 0;
    this.policeOn = opts.police !== false;
    this.pursuit = { active: false, x: 0, z: 0 };
    this.policeCount = opts.policeCount ?? 3;
    for (let i = 0; i < count + riders; i++) {
      const isRider = i >= count;
      const bus = !isRider && i % 6 === 5;
      const moped = isRider && i >= count + riders - (opts.mopeds ?? 3);
      const c = moped ? buildAiMoped(M, this.rnd) : isRider ? buildAiScooter(M, this.rnd) : buildVehicleMeshes(M, this.rnd, bus);
      c.group.visible = false;
      if (!isRider && opts.glow) { // night: head/tail light glow + light pool on the road
        for (const sx of [-1, 1]) {
          const h = new THREE.Sprite(this.hlMat); h.scale.set(1.5, 1.5, 1); h.position.set(sx * c.W * 0.32, 0.72, c.L / 2 + 0.25); c.group.add(h);
          const t = new THREE.Sprite(this.tlMat); t.scale.set(0.9, 0.9, 1); t.position.set(sx * c.W * 0.32, 0.8, -c.L / 2 - 0.15); c.group.add(t);
        }
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(c.W * 1.7, 9), this.poolMat); pl.rotation.x = -Math.PI / 2; pl.position.set(0, 0.07, c.L / 2 + 4.6); pl.renderOrder = 2; c.group.add(pl);
      }
      scene.add(c.group);
      this.cars.push({ ...c, active: false, bus, kind: isRider ? 'scooter' : 'car', laneOff: isRider ? 3.1 : LANE, s: 0, v: 0, axis: 'x', dir: 1, lane: 0, cruise: 10, wait: 0, down: 0, phase: Math.random() * 6, fall: 0, turn: null, plan: 0, planKey: '' });
    }
    for (let i = 0; i < this.policeCount; i++) {
      const c = buildPoliceCar(M, this.rnd, opts.glow);
      c.group.visible = false; scene.add(c.group);
      this.cars.push({ ...c, active: false, bus: false, kind: 'police', laneOff: LANE, s: 0, v: 0, axis: 'x', dir: 1, lane: 0, cruise: 12, patrolCruise: 11 + this.rnd() * 3, wait: 0, down: 0, phase: 0, fall: 0, turn: null, plan: 0, planKey: '', chase: false });
    }
  }

  setNight(n) { this.hlMat.opacity = Math.min(0.85, n * 1.2); this.tlMat.opacity = Math.min(0.7, n * 1.0); this.poolMat.opacity = Math.min(0.5, n * 0.7); }
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
      if (c.fx && this.onRecycle) this.onRecycle(c);
      Object.assign(c, { dead: false, hp: 100, active: true, axis, dir, lane, s, v: 0, cruise: c.moped ? 10 + rnd() * 4 : c.kind === 'scooter' ? 4.5 + rnd() * 7 : c.kind === 'police' ? c.patrolCruise : 8.5 + rnd() * 3.5, wait: 0, down: 0, fall: 0, turn: null, plan: 0, planKey: '', chase: false });
      c.v = c.cruise * 0.8;
      c.group.visible = true;
      return true;
    }
    return false;
  }

  update(dt, player, sig, R = 180) {
    const px = player.x, pz = player.z;
    this.dyn.length = 0;
    this.time += dt;
    for (const c of this.cars) {
      if (c.kind === 'police' && !this.policeOn) { if (c.active) { c.active = false; c.group.visible = false; } continue; }
      if (!c.active) { this.spawn(c, px, pz, R); continue; }
      let wx = c.axis === 'x' ? c.s : c.lane, wz = c.axis === 'x' ? c.lane : c.s;
      if (c.turn) { wx = c.turn.x; wz = c.turn.z; }
      if (Math.hypot(wx - px, wz - pz) > R * (c.chase ? 2.4 : 1.5)) { c.active = false; c.group.visible = false; c.turn = null; continue; }
      if (c.dead) { // wrecked: stays where it is (burning)
        c.v = 0;
        const wx2 = c.axis === 'x' ? c.s : c.lane, wz2 = c.axis === 'x' ? c.lane : c.s;
        if (!c.turn) c.group.position.x = wx2, c.group.position.z = wz2;
        const fx2 = Math.sin(c.group.rotation.y), fz2 = Math.cos(c.group.rotation.y);
        for (const o of [-1.4, 0, 1.4]) this.dyn.push({ x: c.group.position.x + fx2 * o, z: c.group.position.z + fz2 * o, r: c.W / 2 + 0.05, vx: 0, vz: 0 });
        continue;
      }
      if (c.kind === 'police') {
        const pu = this.pursuit;
        const chase = !!(pu.active && Math.hypot(wx - pu.x, wz - pu.z) < 340);
        c.chase = chase;
        c.cruise = chase ? 27.7 : c.patrolCruise;
        const on = chase ? (Math.floor(this.time * 7) % 2 === 0) : false;
        c.sirenMats[0].color.setHex(chase ? (on ? 0x4d7bff : 0x0a1a66) : 0x16205a);
        c.sirenMats[1].color.setHex(chase ? (on ? 0x0a1a66 : 0xff2a2a) : 0x16205a);
        c.glows[0].material.opacity = chase && on ? 0.95 : 0; c.glows[1].material.opacity = chase && !on ? 0.95 : 0;
        c.glows[1].material.color.setHex(0xff3a2a);
      }
      if (c.turn) { this.stepTurn(c, dt); continue; }
      // --- target speed
      let vt = c.cruise;
      const green = c.axis === 'x' ? sig.aG : sig.bG;
      const front = c.s + c.dir * c.L / 2;
      let d;
      if (c.dir > 0) { const k = Math.ceil((front + STOP) / P); d = k * P - STOP - front; }
      else { const k = Math.floor((front - STOP) / P); d = front - (k * P + STOP); }
      if (d < -0.5) d = 1e9; // already past the line
      if (!green && d < 60 && !c.chase) {
        const brakeDist = (c.v * c.v) / (2 * 3.5);
        if (d > brakeDist * 0.7 - 0.5 || c.v < 1) vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * 2.6 * (d - 0.8))));
      }
      // intersection manoeuvre (straight / right / left)
      if (c.kind !== 'scooter' && !c.bus) {
        const j = Math.round(c.lane / P);
        const k = c.dir > 0 ? Math.ceil((c.s + 0.001) / P) : Math.floor((c.s - 0.001) / P);
        const dC = (k * P - c.s) * c.dir;
        const key = c.axis + k + ':' + j;
        if (dC <= 26 && c.planKey !== key) { c.planKey = key; c.plan = this.chooseManoeuvre(c, k, j, px, pz); }
        if (c.plan > 0 && c.planKey === key) {
          const e = c.plan === 1 ? 6 : 7.25;
          if (dC <= e + 0.05) { this.startTurn(c, k, j, Math.max(0, e - dC)); this.stepTurn(c, 0); continue; }
          const rem = Math.max(0, dC - e), vT = c.chase ? 9 : 6.5;
          vt = Math.min(vt, Math.sqrt(vT * vT + 2 * 3.5 * rem));
        }
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
      if (this.extra) for (const e of this.extra) consider(e.x, e.z, 0, isS ? 0.9 : 1.45);
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
        const ang = (c.v * dt) / (c.wheelR || 0.138);
        if (c.moped) {
          const dpl = Math.hypot(x - px, z - pz);
          const wave = dpl < 14 && c.v > 1 && c.down <= 0;
          if (c.waveArm) { c.waveArm.visible = wave; if (wave) c.waveArm.rotation.z = 0.55 + Math.sin(this.time * 9 + c.phase) * 0.28; }
          if (wave && !c.greeted) { c.greeted = true; if (this.onGreet) this.onGreet(c); } else if (dpl > 40) c.greeted = false;
        }
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

  /* ---- turning ---- */
  chooseManoeuvre(c, k, j, px, pz) {
    const f = c.axis === 'x' ? [c.dir, 0] : [0, c.dir];
    const Rv = [-f[1], f[0]];
    const C = c.axis === 'x' ? [k * P, j * P] : [j * P, k * P];
    if (c.chase) {
      const tx = px - C[0], tz = pz - C[1], tl = Math.hypot(tx, tz) || 1;
      if (tl < 28) return 0;
      const sc = [(f[0] * tx + f[1] * tz) / tl + 0.2, (Rv[0] * tx + Rv[1] * tz) / tl, (-Rv[0] * tx - Rv[1] * tz) / tl];
      return sc[1] > sc[0] && sc[1] >= sc[2] ? 1 : sc[2] > sc[0] ? 2 : 0;
    }
    const r = Math.random();
    return r < 0.74 ? 0 : r < 0.87 ? 1 : 2;
  }
  startTurn(c, k, j, skip) {
    const f = c.axis === 'x' ? [c.dir, 0] : [0, c.dir];
    const Rv = [-f[1], f[0]];
    const C = c.axis === 'x' ? [k * P, j * P] : [j * P, k * P];
    let center, r, sv, sign, ef;
    if (c.plan === 1) { center = [C[0] - 6 * f[0] + 6 * Rv[0], C[1] - 6 * f[1] + 6 * Rv[1]]; r = 4.25; sv = [-Rv[0], -Rv[1]]; sign = 1; ef = Rv; }
    else { center = [C[0] - 7.25 * f[0] - 7.25 * Rv[0], C[1] - 7.25 * f[1] - 7.25 * Rv[1]]; r = 9; sv = Rv; sign = -1; ef = [-Rv[0], -Rv[1]]; }
    c.turn = { cx: center[0], cz: center[1], r, a0: Math.atan2(sv[1], sv[0]), sign, len: (r * Math.PI) / 2, d: skip, ef, f, x: 0, z: 0 };
    c.plan = 0;
  }
  stepTurn(c, dt) {
    const t = c.turn;
    const vTurn = c.chase ? 10 : c.plan === 2 ? 8 : 7;
    const a = clamp((Math.min(c.cruise, vTurn) - c.v) * 1.4, -6, 2.0);
    c.v = Math.max(0, c.v + a * dt);
    t.d += c.v * dt;
    if (t.d >= t.len) { // finish: continue straight on the new road
      const ang = t.a0 + t.sign * (Math.PI / 2);
      const ex = t.cx + t.r * Math.cos(ang), ez = t.cz + t.r * Math.sin(ang);
      const ef = t.ef;
      c.axis = Math.abs(ef[0]) > 0.5 ? 'x' : 'z';
      c.dir = c.axis === 'x' ? Math.sign(ef[0]) : Math.sign(ef[1]);
      c.lane = c.axis === 'x' ? ez : ex; c.s = c.axis === 'x' ? ex : ez;
      c.turn = null;
      const x = ex, z = ez;
      c.group.position.set(x, 0, z);
      c.group.rotation.y = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      this.pushDyn(c, x, z, Math.sin(c.group.rotation.y), Math.cos(c.group.rotation.y));
      return;
    }
    const ang = t.a0 + t.sign * (t.d / t.r);
    const x = t.cx + t.r * Math.cos(ang), z = t.cz + t.r * Math.sin(ang);
    const tx = t.sign * -Math.sin(ang), tz = t.sign * Math.cos(ang);
    t.x = x; t.z = z;
    c.group.position.set(x, 0, z);
    c.group.rotation.y = Math.atan2(tx, tz);
    this.pushDyn(c, x, z, tx, tz);
  }
  pushDyn(c, x, z, fx, fz) {
    const n = Math.max(3, Math.round(c.L / 1.8)), r = c.W / 2 + 0.05;
    for (let i = 0; i < n; i++) {
      const tt = (-0.5 + (i + 0.5) / n) * (c.L - r);
      this.dyn.push({ x: x + fx * tt, z: z + fz * tt, r, vx: fx * c.v, vz: fz * c.v });
    }
  }
  /** nearest pursuing police car */
  nearestChaser(px, pz) {
    let best = null;
    for (const c of this.cars) {
      if (c.kind !== 'police' || !c.active || !c.chase) continue;
      const x = c.turn ? c.turn.x : c.axis === 'x' ? c.s : c.lane, z = c.turn ? c.turn.z : c.axis === 'x' ? c.lane : c.s;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, v: c.v, x, z };
    }
    return best;
  }
  policeList() {
    const o = [];
    for (const c of this.cars) {
      if (c.kind !== 'police' || !c.active) continue;
      o.push({ x: c.turn ? c.turn.x : c.axis === 'x' ? c.s : c.lane, z: c.turn ? c.turn.z : c.axis === 'x' ? c.lane : c.s, chase: c.chase });
    }
    return o;
  }
}

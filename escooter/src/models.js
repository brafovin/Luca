import * as THREE from 'three';
import { BatchSet } from './batch.js';

/* Shared helpers ------------------------------------------------------------ */
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylX = (r, l, seg = 16) => { const g = new THREE.CylinderGeometry(r, r, l, seg); g.rotateZ(Math.PI / 2); return g; };
const std = (o) => new THREE.MeshStandardMaterial(o);

class Helix extends THREE.Curve {
  constructor(r, len, turns) { super(); this.r = r; this.len = len; this.turns = turns; }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.r, t * this.len, Math.sin(a) * this.r);
  }
}
const helixCache = new Map();
function helixGeo(r, len, turns, tube) {
  const k = [r, len, turns, tube].join('|');
  if (!helixCache.has(k)) helixCache.set(k, new THREE.TubeGeometry(new Helix(r, len, turns), Math.ceil(turns * 16), tube, 6, false));
  return helixCache.get(k);
}
function mergedGeometry(fn) {
  const set = new BatchSet();
  const b = set.get('a');
  b.ao = false;
  fn(b);
  return b.build();
}
const tireCache = new Map();
function tireGeometry(major, tube, tread) {
  const key = [major, tube].join('|');
  if (tireCache.has(key)) return tireCache.get(key);
  const outer = major + tube;
  const g = mergedGeometry((b) => {
    const torus = new THREE.TorusGeometry(major, tube, 14, 40);
    torus.rotateY(Math.PI / 2);
    b.geo(torus, new THREE.Matrix4(), [0.04, 0.04, 0.043]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0);
    const n = 44;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const side of [-1, 1]) {
        const aa = a + (side > 0 ? Math.PI / n : 0);
        q.setFromAxisAngle(ax, aa);
        const pos = new THREE.Vector3(side * tube * 0.46, outer - 0.002, 0).applyAxisAngle(ax, aa);
        m4.compose(pos, q, new THREE.Vector3(1, 1, 1));
        b.geo(new THREE.BoxGeometry(tube * 0.76, 0.015, tread), m4, [0.055, 0.055, 0.06]);
      }
    }
    // centre rib
    const rib = new THREE.TorusGeometry(outer, 0.004, 6, 48); rib.rotateY(Math.PI / 2);
    b.geo(rib, new THREE.Matrix4(), [0.07, 0.07, 0.075]);
  });
  tireCache.set(key, g);
  return g;
}

/** Returns small toolbox bound to a parent mesh helper. */
function tools(shadow = true) {
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const tube = (parent, pts, r, mat) => {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 6, false);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m); return m;
  };
  const spring = (parent, mat, x, y, z, r, len, turns, tubeR) => {
    const m = new THREE.Mesh(helixGeo(r, len, turns, tubeR), mat);
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  return { add, tube, spring };
}

function textCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plateMesh() {
  const tex = textCanvas(128, 80, (x) => {
    x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 128, 80);
    x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(3, 3, 122, 74);
    x.fillStyle = '#16a05a'; x.fillRect(6, 6, 116, 14);
    x.fillStyle = '#111'; x.font = '700 40px Arial'; x.textAlign = 'center'; x.fillText('123', 64, 52); x.font = '700 24px Arial'; x.fillText('HQM', 64, 72);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0625), std({ map: tex, roughness: 0.5 }));
}

/* ============================================================================
   KuKirin G4 – full black
   ============================================================================ */
const G4_SPEC = { vN: 18, vT: 28.6, vVN: 25, vVT: 42.4, aN: 2.6, aT: 5.2, aVN: 3.4, aVT: 7.8, kN: 6, kT: 11, kVN: 8, kVT: 17, drag2: 0.0009, brake: 4.6, space: 6.8, cap: 7.6, aLat: 8.5, mass: 106, wheelie: 0.8 };
export function buildG4(ctx, o = {}) {
  const { T, mats, dispTex } = ctx;
  const { add, tube, spring } = tools();
  const group = new THREE.Group();
  const mGloss = std({ color: o.body ?? 0x08090b, roughness: o.body ? 0.3 : 0.24, metalness: 0.72, envMapIntensity: 1.3 });
  const mMatte = std({ color: o.matte ?? 0x0f1012, roughness: 0.72, metalness: 0.25 });
  const mTrim = std({ color: o.accent ?? 0x1c1d21, roughness: 0.45, metalness: 0.6 });
  const mDark = std({ color: 0x15161a, roughness: 0.3, metalness: 0.88 }); // black anodised aluminium
  const mRubber = std({ color: 0x0b0b0c, roughness: 0.95, metalness: 0, vertexColors: true });
  const mSpring = std({ color: o.accent ?? 0x0c0d0f, roughness: 0.35, metalness: 0.8 });
  const mCable = std({ color: 0x050506, roughness: 0.55 });
  const mFender = std({ color: 0x0a0b0d, roughness: 0.32, metalness: 0.65, side: THREE.DoubleSide });
  const gripTex = T.grip.clone(); gripTex.needsUpdate = true; gripTex.repeat.set(1.5, 6);
  const mDeck = std({ map: gripTex, roughness: 0.92, metalness: 0.1 });
  const R = 0.138, HALF = 0.58;

  const makeWheel = () => {
    const w = new THREE.Group();
    add(w, tireGeometry(0.094, 0.047, 0.03), mRubber);
    add(w, cylX(0.068, 0.078, 24), mGloss);
    for (let i = 0; i < 5; i++) { // twin-spoke rim
      for (const o of [-0.012, 0.012]) { const s = add(w, box(0.05, 0.011, 0.12), mDark, 0, 0, 0); s.rotation.x = (i / 5) * Math.PI * 2 + o * 3; }
    }
    add(w, cylX(0.028, 0.095, 14), mTrim);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; const bolt = add(w, cylX(0.005, 0.098, 6), mDark, 0, Math.cos(a) * 0.04, Math.sin(a) * 0.04); bolt.castShadow = false; }
    add(w, cylX(0.07, 0.004, 32), mDark, 0.043, 0, 0); // brake disc
    add(w, cylX(0.052, 0.0045, 24), mMatte, 0.0425, 0, 0);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; const h = add(w, cylX(0.0085, 0.006, 8), mMatte, 0.043, Math.cos(a) * 0.06, Math.sin(a) * 0.06); h.castShadow = false; }
    add(w, cylX(0.006, 0.02, 6), mMatte, 0.05, 0.115, 0.03); // valve
    return w;
  };
  const rearWheel = makeWheel(); rearWheel.position.set(0, R, -HALF); group.add(rearWheel);

  /* ---- deck / frame */
  add(group, box(0.205, 0.075, 0.74), mGloss, 0, 0.185, -0.04);
  add(group, box(0.19, 0.05, 0.66), mMatte, 0, 0.13, -0.04);
  add(group, box(0.206, 0.012, 0.74), mDark, 0, 0.143, -0.04).scale.set(0.96, 1, 1);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.62), mDeck);
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.2255, -0.06); pad.receiveShadow = true; group.add(pad);
  for (const sx of [-1, 1]) { // side rails, battery side covers with ribs, LED strips
    add(group, box(0.012, 0.03, 0.7), mTrim, sx * 0.1, 0.205, -0.04);
    add(group, box(0.014, 0.05, 0.54), mMatte, sx * 0.101, 0.16, -0.06);
    for (let i = 0; i < 6; i++) add(group, box(0.016, 0.044, 0.01), mTrim, sx * 0.103, 0.16, -0.28 + i * 0.1);
    add(group, box(0.012, 0.014, 0.6), mats.led, sx * 0.108, 0.178, -0.05);
    for (const z of [-0.34, -0.12, 0.1, 0.28]) add(group, new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 8), mTrim, sx * 0.088, 0.2275, z);
    const refl = std({ color: 0x8a1c0a, emissive: 0x401000, emissiveIntensity: 0.2, roughness: 0.4 });
    add(group, box(0.006, 0.02, 0.05), refl, sx * 0.1055, 0.19, 0.3);
    add(group, box(0.006, 0.02, 0.05), refl, sx * 0.1055, 0.19, -0.36);
  }
  const neck = add(group, box(0.12, 0.1, 0.16), mGloss, 0, 0.21, 0.36); neck.rotation.x = -0.15;
  add(group, box(0.16, 0.03, 0.12), mTrim, 0, 0.255, 0.32);
  const stand = add(group, box(0.012, 0.012, 0.16), mDark, -0.12, 0.13, -0.28); stand.rotation.z = 0.5;
  add(group, box(0.02, 0.012, 0.03), mDark, -0.118, 0.12, -0.2);
  // plate + rear brake hose
  const plate = plateMesh(); plate.position.set(0, 0.215, -0.745); plate.rotation.set(0.12, Math.PI, 0); group.add(plate);
  tube(group, [[0.03, 0.46, 0.34], [0.04, 0.3, 0.26], [0.04, 0.215, 0.1], [0.045, 0.2, -0.3], [0.05, 0.2, -0.46], [0.05, 0.19, -0.52]], 0.0042, mCable);

  /* ---- rear swingarm, coil-over shock, fender, tail */
  for (const sx of [-1, 1]) {
    const arm = add(group, box(0.024, 0.05, 0.3), mGloss, sx * 0.075, 0.18, -0.5); arm.rotation.x = 0.28;
    const stay = add(group, box(0.008, 0.14, 0.008), mDark, sx * 0.065, 0.2, -0.64); stay.rotation.x = -0.5;
  }
  const shockPivot = new THREE.Group(); shockPivot.position.set(0, 0.2, -0.36); shockPivot.rotation.x = -0.75; group.add(shockPivot);
  add(shockPivot, new THREE.CylinderGeometry(0.012, 0.012, 0.28, 10), mDark, 0, 0.14, 0);
  add(shockPivot, new THREE.CylinderGeometry(0.02, 0.02, 0.1, 12), mTrim, 0, 0.05, 0);
  spring(shockPivot, mSpring, 0, 0.05, 0, 0.027, 0.2, 7, 0.0042);
  add(shockPivot, new THREE.CylinderGeometry(0.016, 0.016, 0.05, 10), mTrim, 0, 0.29, 0);
  add(group, new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10), mDark, 0.05, 0.26, -0.37).rotation.z = Math.PI / 2; // reservoir
  const fenderGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.105, 28, 1, true, Math.PI * 0.3, Math.PI * 0.95); fenderGeo.rotateZ(Math.PI / 2);
  add(group, fenderGeo, mFender, 0, R, -HALF);
  const tailArm = add(group, box(0.09, 0.02, 0.2), mFender, 0, 0.275, -0.69); tailArm.rotation.x = 0.12;
  const tail = add(group, box(0.13, 0.03, 0.02), mats.tail, 0, 0.27, -0.79); tail.castShadow = false;
  add(group, box(0.15, 0.014, 0.03), mGloss, 0, 0.29, -0.78);
  add(group, box(0.05, 0.02, 0.01), std({ color: 0x600808, roughness: 0.3 }), 0, 0.245, -0.795);
  // rear caliper
  add(group, box(0.02, 0.05, 0.04), mMatte, 0.05, 0.19, -0.5);
  add(group, new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), mDark, 0.062, 0.2, -0.5).rotation.z = Math.PI / 2;

  /* ---- steering assembly */
  const pivot = new THREE.Group(); pivot.position.set(0, R, HALF); pivot.rotation.x = -0.28; group.add(pivot);
  const steer = new THREE.Group(); pivot.add(steer);
  const frontWheel = makeWheel(); steer.add(frontWheel);
  for (const sx of [-1, 1]) {
    add(steer, new THREE.CylinderGeometry(0.017, 0.017, 0.34, 12), mDark, sx * 0.068, 0.2, 0);          // stanchion
    add(steer, new THREE.CylinderGeometry(0.03, 0.03, 0.09, 14), mGloss, sx * 0.068, 0.045, 0);          // slider
    add(steer, new THREE.CylinderGeometry(0.024, 0.024, 0.09, 12), mMatte, sx * 0.068, 0.15, 0);          // dust boot
    spring(steer, mSpring, sx * 0.068, 0.2, 0, 0.026, 0.17, 6, 0.0038);                                   // coil spring
    add(steer, new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), mTrim, sx * 0.068, 0.385, 0);            // top cap
    add(steer, box(0.012, 0.012, 0.03), mDark, sx * 0.068, 0.385, 0.03);
  }
  const calipFront = add(steer, box(0.024, 0.06, 0.045), mMatte, 0.052, 0.05, 0.065);
  add(steer, new THREE.CylinderGeometry(0.008, 0.008, 0.035, 8), mDark, 0.066, 0.06, 0.065).rotation.z = Math.PI / 2;
  add(steer, box(0.2, 0.05, 0.075), mGloss, 0, 0.405, 0);                                               // crown
  add(steer, box(0.1, 0.03, 0.06), mTrim, 0, 0.44, 0);
  const ffGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.105, 28, 1, true, -Math.PI * 0.25, Math.PI * 0.95); ffGeo.rotateZ(Math.PI / 2);
  add(steer, ffGeo, mFender, 0, 0, 0);
  add(steer, box(0.012, 0.012, 0.1), mDark, 0.07, 0.17, 0.095).rotation.x = -0.5;
  add(steer, box(0.012, 0.012, 0.1), mDark, -0.07, 0.17, 0.095).rotation.x = -0.5;
  // stem with folding hinge + latch
  const stem = add(steer, new THREE.CylinderGeometry(0.026, 0.033, 0.7, 16), mGloss, 0, 0.74, 0); stem.scale.set(1.15, 1, 0.9);
  add(steer, box(0.095, 0.1, 0.08), mMatte, 0, 0.49, 0);
  add(steer, box(0.11, 0.02, 0.09), mTrim, 0, 0.545, 0);
  add(steer, box(0.11, 0.02, 0.09), mTrim, 0, 0.435, 0);
  const latch = add(steer, box(0.016, 0.1, 0.034), mDark, 0.058, 0.49, 0.02); latch.rotation.z = -0.12;
  add(steer, new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10), mDark, 0.062, 0.545, 0.02).rotation.z = Math.PI / 2;
  add(steer, box(0.1, 0.03, 0.06), mDark, 0, 0.44, 0);
  for (const y of [0.4, 0.97]) { const c = add(steer, new THREE.CylinderGeometry(0.037, 0.037, 0.022, 16), mTrim, 0, y, 0); c.scale.set(1.12, 1, 0.9); }
  // stem decal (dark grey, subtle)
  const decalTex = textCanvas(256, 64, (x) => { x.font = '700 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = o.decalA || '#7a7d84'; x.fillText(o.brand || 'KuKirin', 100, 34); x.fillStyle = o.decalB || '#b8bcc4'; x.fillText(o.model || 'G4', 218, 34); });
  const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, toneMapped: false });
  for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), decalMat); d.position.set(sx * 0.0345, 0.76, 0); d.rotation.y = sx * Math.PI / 2; d.rotation.z = Math.PI / 2; steer.add(d); }
  // handlebar cluster
  add(steer, cylX(0.012, 0.64, 12), mGloss, 0, 1.06, -0.02);
  add(steer, box(0.1, 0.07, 0.08), mGloss, 0, 1.05, 0);
  add(steer, box(0.06, 0.02, 0.08), mTrim, 0, 1.09, 0);
  for (const sx of [-1, 1]) {
    add(steer, cylX(0.0178, 0.13, 14), mRubber, sx * 0.265, 1.06, -0.02);
    for (const o of [-0.05, -0.02, 0.01, 0.04]) add(steer, cylX(0.0188, 0.006, 12), mMatte, sx * (0.265 + o), 1.06, -0.02);
    add(steer, cylX(0.021, 0.02, 12), mTrim, sx * 0.19, 1.06, -0.02);
    const lever = add(steer, box(0.012, 0.012, 0.13), mGloss, sx * 0.22, 1.035, 0.07); lever.rotation.y = sx * 0.12;
    add(steer, box(0.03, 0.03, 0.04), mMatte, sx * 0.2, 1.055, 0.0);
    add(steer, new THREE.CylinderGeometry(0.0055, 0.0055, 0.036, 8), mDark, sx * 0.2, 1.045, 0.015).rotation.z = Math.PI / 2;
    const be = add(steer, new THREE.CylinderGeometry(0.013, 0.013, 0.018, 10), mats.head, sx * 0.335, 1.06, -0.02); be.rotation.z = Math.PI / 2; be.castShadow = false;
    tube(steer, [[sx * 0.2, 1.04, 0.07], [sx * 0.12, 1.0, 0.06], [sx * 0.045, 0.9, 0.04], [sx * 0.04, 0.6, 0.035], [sx * 0.05, 0.3, 0.05], [sx * 0.05, 0.08, 0.07]], 0.0042, mCable);
  }
  add(steer, box(0.04, 0.02, 0.05), mMatte, -0.19, 1.08, -0.02);
  add(steer, new THREE.CylinderGeometry(0.018, 0.022, 0.02, 12), mDark, 0.15, 1.085, -0.02);
  tube(steer, [[0.0, 0.6, -0.034], [0.01, 0.45, -0.036], [0.02, 0.36, -0.03]], 0.0035, mCable);
  // display (live screen)
  const disp = new THREE.Group(); disp.position.set(0, 1.105, 0); disp.rotation.x = 0.55; steer.add(disp);
  add(disp, box(0.12, 0.08, 0.02), mGloss, 0, 0, 0);
  add(disp, box(0.126, 0.004, 0.022), mTrim, 0, 0.042, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.102, 0.064), new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false }));
  screen.rotation.y = Math.PI; screen.position.z = -0.0105; disp.add(screen);
  for (const sx of [-1, 1]) add(disp, new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8), mDark, sx * 0.052, -0.045, -0.006).rotation.x = Math.PI / 2;
  // head lamp in a black bezel
  add(steer, box(0.125, 0.065, 0.045), mGloss, 0, 0.62, 0.04);
  const hl = add(steer, box(0.1, 0.045, 0.012), mats.head, 0, 0.62, 0.064); hl.castShadow = false;
  add(steer, box(0.13, 0.012, 0.05), mTrim, 0, 0.66, 0.04);
  const drl = add(steer, box(0.11, 0.008, 0.01), mats.head, 0, 0.675, 0.05); drl.castShadow = false;
  add(steer, box(0.03, 0.02, 0.008), std({ color: 0x601800, roughness: 0.4 }), 0.06, 0.55, 0.043);

  /* ---- VESC upgrade parts */
  const vescParts = [];
  const mBlue = std({ color: 0x1668ff, roughness: 0.3, metalness: 0.8 });
  const mCyan = new THREE.MeshBasicMaterial({ color: 0x35e6ff, toneMapped: false });
  const ctl = add(group, box(0.13, 0.075, 0.2), mBlue, 0, 0.275, 0.33); ctl.rotation.x = -0.12;
  const fin = add(group, box(0.11, 0.012, 0.16), mDark, 0, 0.318, 0.33);
  const vlabel = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.03), new THREE.MeshBasicMaterial({ map: textCanvas(128, 40, (x) => { x.fillStyle = '#05080c'; x.fillRect(0, 0, 128, 40); x.fillStyle = '#35e6ff'; x.font = '900 30px Arial'; x.textAlign = 'center'; x.fillText('VESC', 64, 31); }), toneMapped: false }));
  vlabel.position.set(0, 0.2755, 0.43); vlabel.rotation.x = -0.17; group.add(vlabel);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.7), new THREE.MeshBasicMaterial({ map: T.pool, color: 0x35e6ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.04, 0);
  vescParts.push(ctl, fin, vlabel);
  for (const w of [rearWheel, frontWheel]) for (const sx of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.0065, 6, 28), mCyan); ring.rotation.y = Math.PI / 2; ring.position.x = sx * 0.04; w.add(ring); vescParts.push(ring); }

  return {
    id: o.id || 'g4', name: o.name || 'KuKirin G4', group, steer, frontWheel, rearWheel, vescParts, glow, glowSize: [0.62, 1.7],
    paint: { body: [mGloss], accent: [mTrim, mSpring] },
    gripLocal: [new THREE.Vector3(0.265, 1.06, -0.02), new THREE.Vector3(-0.265, 1.06, -0.02)],
    foot: [new THREE.Vector3(0.05, 0.265, 0.06), new THREE.Vector3(-0.05, 0.265, -0.28)],
    half: HALF, wheelbase: 1.16, wheelR: R, spotPos: [0, 0.78, 0.46], dispMode: o.disp || 'D3', stemDecal: 'G4',
    spec: o.spec || G4_SPEC,
  };
}

/* ============================================================================
   Dualtron Thunder 3 – black with red hydraulic springs, dual motors
   ============================================================================ */
export function buildDT3(ctx) {
  const { T, mats, dispTex } = ctx;
  const { add, tube, spring } = tools();
  const group = new THREE.Group();
  const mGloss = std({ color: 0x07080a, roughness: 0.22, metalness: 0.75, envMapIntensity: 1.35 });
  const mMatte = std({ color: 0x101113, roughness: 0.7, metalness: 0.3 });
  const mDark = std({ color: 0x17181c, roughness: 0.3, metalness: 0.88 });
  const mTrim = std({ color: 0x23252a, roughness: 0.4, metalness: 0.7 });
  const mRed = std({ color: 0xd42020, roughness: 0.35, metalness: 0.55 });
  const mSpring = std({ color: 0xcf1c1c, roughness: 0.3, metalness: 0.7 });
  const mRubber = std({ color: 0x0b0b0c, roughness: 0.95, vertexColors: true });
  const mCable = std({ color: 0x050506, roughness: 0.55 });
  const mFender = std({ color: 0x08090b, roughness: 0.3, metalness: 0.7, side: THREE.DoubleSide });
  const mMotor = std({ color: 0x2a2c31, roughness: 0.35, metalness: 0.9 });
  const mAmber = new THREE.MeshBasicMaterial({ color: 0xffa21a, toneMapped: false });
  const gripTex = T.grip.clone(); gripTex.needsUpdate = true; gripTex.repeat.set(2, 7);
  const mDeck = std({ map: gripTex, roughness: 0.92 });
  const R = 0.152, HALF = 0.66, rake = 0.25;

  const makeWheel = () => {
    const w = new THREE.Group();
    add(w, tireGeometry(0.1, 0.052, 0.034), mRubber);
    add(w, cylX(0.076, 0.1, 28), mMotor);                       // hub motor
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283; const fin = add(w, box(0.1, 0.006, 0.05), mDark, 0, Math.cos(a) * 0.055, Math.sin(a) * 0.055); fin.rotation.x = a; fin.castShadow = false; }
    add(w, cylX(0.082, 0.012, 28), mGloss, 0.05, 0, 0);
    add(w, cylX(0.082, 0.012, 28), mGloss, -0.05, 0, 0);
    for (let i = 0; i < 6; i++) { const s = add(w, box(0.016, 0.014, 0.12), mGloss, 0.057, 0, 0); s.rotation.x = (i / 6) * 3.14159; }
    add(w, cylX(0.03, 0.115, 14), mTrim);
    add(w, cylX(0.082, 0.0045, 36), mDark, 0.07, 0, 0);          // big disc
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; const h = add(w, cylX(0.009, 0.006, 8), mMatte, 0.0705, Math.cos(a) * 0.066, Math.sin(a) * 0.066); h.castShadow = false; }
    add(w, cylX(0.006, 0.02, 6), mRed, 0.06, 0.13, 0.03);
    return w;
  };
  const rearWheel = makeWheel(); rearWheel.position.set(0, R, -HALF); group.add(rearWheel);

  /* ---- wide deck with battery humps */
  add(group, box(0.3, 0.085, 0.98), mGloss, 0, 0.2, -0.02);
  add(group, box(0.28, 0.06, 0.88), mMatte, 0, 0.135, -0.02);
  add(group, box(0.31, 0.012, 0.98), mDark, 0, 0.15, -0.02).scale.set(0.97, 1, 1);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.265, 0.82), mDeck);
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.2445, -0.06); pad.receiveShadow = true; group.add(pad);
  for (const sx of [-1, 1]) {
    add(group, box(0.02, 0.04, 0.96), mTrim, sx * 0.15, 0.215, -0.02);
    add(group, box(0.012, 0.012, 0.9), mRed, sx * 0.1605, 0.2, -0.02);                    // red accent line
    add(group, box(0.016, 0.07, 0.7), mMatte, sx * 0.155, 0.155, -0.04);
    for (let i = 0; i < 9; i++) add(group, box(0.02, 0.06, 0.012), mTrim, sx * 0.158, 0.155, -0.36 + i * 0.09);
    add(group, box(0.012, 0.016, 0.8), mats.led, sx * 0.163, 0.18, -0.02);
    for (const z of [-0.4, -0.18, 0.04, 0.26]) add(group, new THREE.CylinderGeometry(0.0075, 0.0075, 0.004, 8), mTrim, sx * 0.125, 0.2475, z);
    add(group, box(0.006, 0.022, 0.06), new THREE.MeshBasicMaterial({ color: 0xff7a00, toneMapped: false }), sx * 0.1655, 0.2, 0.42);
    add(group, box(0.006, 0.022, 0.06), new THREE.MeshBasicMaterial({ color: 0xff7a00, toneMapped: false }), sx * 0.1655, 0.2, -0.44);
  }
  const neck = add(group, box(0.18, 0.12, 0.2), mGloss, 0, 0.23, 0.46); neck.rotation.x = -0.15;
  add(group, box(0.22, 0.03, 0.16), mTrim, 0, 0.29, 0.4);
  const stand = add(group, box(0.014, 0.014, 0.2), mDark, -0.17, 0.14, -0.3); stand.rotation.z = 0.55;
  const plate = plateMesh(); plate.position.set(0, 0.255, -0.935); plate.rotation.set(0.12, Math.PI, 0); plate.scale.setScalar(1.15); group.add(plate);

  /* ---- rear: dual swingarm + two red coil-over shocks, big fender, tail bar */
  for (const sx of [-1, 1]) {
    const arm = add(group, box(0.03, 0.065, 0.4), mGloss, sx * 0.1, 0.2, -0.6); arm.rotation.x = 0.25;
    const sp = new THREE.Group(); sp.position.set(sx * 0.12, 0.22, -0.4); sp.rotation.x = -0.6; group.add(sp);
    add(sp, new THREE.CylinderGeometry(0.016, 0.016, 0.34, 12), mDark, 0, 0.17, 0);
    add(sp, new THREE.CylinderGeometry(0.028, 0.028, 0.12, 14), mTrim, 0, 0.06, 0);
    spring(sp, mSpring, 0, 0.06, 0, 0.038, 0.24, 8, 0.0055);
    add(sp, new THREE.CylinderGeometry(0.022, 0.022, 0.06, 12), mRed, 0, 0.35, 0);
    add(group, new THREE.CylinderGeometry(0.014, 0.014, 0.12, 10), mDark, sx * 0.17, 0.3, -0.38).rotation.z = Math.PI / 2;
    const stay = add(group, box(0.01, 0.16, 0.01), mDark, sx * 0.085, 0.24, -0.78); stay.rotation.x = -0.5;
  }
  const fenderGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.14, 30, 1, true, Math.PI * 0.28, Math.PI * 1.0); fenderGeo.rotateZ(Math.PI / 2);
  add(group, fenderGeo, mFender, 0, R, -HALF);
  const tailArm = add(group, box(0.16, 0.025, 0.26), mFender, 0, 0.31, -0.86); tailArm.rotation.x = 0.15;
  const tail = add(group, box(0.22, 0.035, 0.02), mats.tail, 0, 0.3, -0.99); tail.castShadow = false;
  for (const sx of [-1, 1]) add(group, box(0.03, 0.03, 0.02), mAmber, sx * 0.13, 0.3, -0.99).castShadow = false;
  add(group, box(0.24, 0.016, 0.03), mGloss, 0, 0.325, -0.98);
  // dual caliper rear
  add(group, box(0.03, 0.07, 0.05), mRed, 0.06, 0.2, -0.6);
  add(group, box(0.012, 0.01, 0.04), mDark, 0.07, 0.24, -0.6);

  /* ---- steering assembly, dual hydraulic fork */
  const pivot = new THREE.Group(); pivot.position.set(0, R, HALF); pivot.rotation.x = -rake; group.add(pivot);
  const steer = new THREE.Group(); pivot.add(steer);
  const frontWheel = makeWheel(); steer.add(frontWheel);
  for (const sx of [-1, 1]) {
    add(steer, new THREE.CylinderGeometry(0.0225, 0.0225, 0.4, 14), mDark, sx * 0.105, 0.22, 0);
    add(steer, new THREE.CylinderGeometry(0.036, 0.036, 0.1, 16), mGloss, sx * 0.105, 0.05, 0);
    add(steer, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 14), mMatte, sx * 0.105, 0.17, 0);
    spring(steer, mSpring, sx * 0.105, 0.22, 0, 0.034, 0.2, 7, 0.005);
    add(steer, new THREE.CylinderGeometry(0.026, 0.026, 0.04, 14), mRed, sx * 0.105, 0.435, 0);
    add(steer, box(0.014, 0.014, 0.03), mDark, sx * 0.105, 0.45, 0.03);
    add(steer, box(0.036, 0.07, 0.055), mRed, sx > 0 ? 0.088 : 0, 0.05, 0.075).visible = sx > 0; // 4-piston caliper
    add(steer, new THREE.CylinderGeometry(0.01, 0.01, 0.04, 8), mDark, 0.1, 0.075, 0.075).rotation.z = Math.PI / 2;
    // fork arm link
    const link = add(steer, box(0.014, 0.012, 0.16), mDark, sx * 0.105, 0.26, 0.1); link.rotation.x = 0.55;
  }
  add(steer, box(0.3, 0.06, 0.1), mGloss, 0, 0.48, 0);
  add(steer, box(0.2, 0.025, 0.08), mTrim, 0, 0.52, 0);
  const ffGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.14, 30, 1, true, -Math.PI * 0.2, Math.PI * 0.9); ffGeo.rotateZ(Math.PI / 2);
  add(steer, ffGeo, mFender, 0, 0, 0);
  const stem = add(steer, new THREE.CylinderGeometry(0.03, 0.04, 0.66, 18), mGloss, 0, 0.78, 0); stem.scale.set(1.2, 1, 0.9); // ends at the bar clamp, below the display
  add(steer, box(0.12, 0.12, 0.1), mMatte, 0, 0.62, 0);
  add(steer, box(0.14, 0.022, 0.11), mTrim, 0, 0.685, 0);
  add(steer, box(0.14, 0.022, 0.11), mTrim, 0, 0.555, 0);
  add(steer, box(0.02, 0.12, 0.04), mRed, 0.07, 0.62, 0.02).rotation.z = -0.1;
  for (const y of [0.5, 1.06]) { const c = add(steer, new THREE.CylinderGeometry(0.046, 0.046, 0.026, 18), mRed, 0, y, 0); c.scale.set(1.15, 1, 0.9); }
  const decalTex = textCanvas(384, 64, (x) => { x.font = '800 36px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#d42020'; x.fillText('DUALTRON', 130, 34); x.fillStyle = '#e8e8ea'; x.fillText('THUNDER 3', 310, 34); });
  const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, toneMapped: false });
  for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.06), decalMat); d.position.set(sx * 0.0495, 0.88, 0); d.rotation.y = sx * Math.PI / 2; d.rotation.z = Math.PI / 2; steer.add(d); }
  // bars: wide, tall, cable cluster
  const BY = 1.14;
  add(steer, cylX(0.0135, 0.78, 14), mGloss, 0, BY, -0.02);
  add(steer, box(0.14, 0.08, 0.1), mGloss, 0, BY - 0.01, 0);
  add(steer, box(0.08, 0.025, 0.1), mTrim, 0, BY + 0.035, 0);
  add(steer, box(0.05, 0.05, 0.04), mGloss, 0, BY + 0.07, 0.0).rotation.x = 0.5; // display mount post, above the stem
  for (const sx of [-1, 1]) {
    add(steer, cylX(0.019, 0.14, 14), mRubber, sx * 0.34, BY, -0.02);
    for (const o of [-0.055, -0.02, 0.015, 0.05]) add(steer, cylX(0.0205, 0.006, 12), mMatte, sx * (0.34 + o), BY, -0.02);
    add(steer, cylX(0.024, 0.022, 14), mRed, sx * 0.255, BY, -0.02);
    const lever = add(steer, box(0.014, 0.014, 0.15), mGloss, sx * 0.285, BY - 0.028, 0.08); lever.rotation.y = sx * 0.14;
    add(steer, box(0.04, 0.036, 0.05), mMatte, sx * 0.265, BY - 0.002, 0.0);          // hydraulic master cylinder
    add(steer, new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), mDark, sx * 0.265, BY + 0.03, 0.0);
    add(steer, box(0.05, 0.03, 0.05), mMatte, sx * 0.19, BY + 0.02, -0.03);           // switch pod
    add(steer, new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), mAmber, sx * 0.19, BY + 0.037, -0.03).castShadow = false;
    const be = add(steer, new THREE.CylinderGeometry(0.014, 0.014, 0.022, 10), mAmber, sx * 0.405, BY, -0.02); be.rotation.z = Math.PI / 2; be.castShadow = false;
    tube(steer, [[sx * 0.285, BY - 0.03, 0.08], [sx * 0.18, BY - 0.06, 0.06], [sx * 0.07, 0.95, 0.045], [sx * 0.055, 0.6, 0.04], [sx * 0.07, 0.3, 0.055], [sx * 0.098, 0.08, 0.08]], 0.0052, mCable);
  }
  add(steer, box(0.05, 0.022, 0.06), mMatte, -0.22, BY + 0.035, -0.02);
  // big display housing
  const disp = new THREE.Group(); disp.position.set(0, BY + 0.085, 0.0); disp.rotation.x = 0.5; steer.add(disp);
  add(disp, box(0.17, 0.105, 0.026), mGloss, 0, 0, 0);
  add(disp, box(0.176, 0.006, 0.028), mRed, 0, 0.055, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.09), new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false }));
  screen.rotation.y = Math.PI; screen.position.z = -0.0135; disp.add(screen);
  // twin LED headlamps + DRL bar
  for (const sx of [-1, 1]) {
    add(steer, box(0.07, 0.06, 0.05), mGloss, sx * 0.055, 0.77, 0.05);
    const l = add(steer, box(0.055, 0.04, 0.012), mats.head, sx * 0.055, 0.77, 0.077); l.castShadow = false;
  }
  add(steer, box(0.2, 0.012, 0.014), mats.head, 0, 0.82, 0.07).castShadow = false;
  add(steer, box(0.06, 0.03, 0.01), mRed, 0, 0.74, 0.07);

  /* ---- extra detail (Thunder 3) */
  const mRedLed = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  const mWhite = new THREE.MeshBasicMaterial({ color: 0xf6f4ea, toneMapped: false });
  // deck: cooling vents on the battery covers, anti-slip ribs, nose lights, heel kick
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 9; i++) add(group, box(0.004, 0.034, 0.05), mDark, sx * 0.1655, 0.155, -0.4 + i * 0.09).castShadow = false;
    add(group, box(0.01, 0.025, 0.1), mAmber, sx * 0.155, 0.255, 0.57).castShadow = false;           // nose marker
    for (const z of [-0.24, 0.2]) add(group, new THREE.CylinderGeometry(0.011, 0.011, 0.006, 8), mTrim, sx * 0.152, 0.236, z);
  }
  for (let i = 0; i < 16; i++) add(group, box(0.255, 0.0035, 0.011), mMatte, 0, 0.2465, -0.4 + i * 0.05).castShadow = false;
  add(group, box(0.26, 0.03, 0.03), mTrim, 0, 0.255, -0.5);                                          // heel kick
  add(group, box(0.1, 0.01, 0.1), mats.led, 0, 0.125, 0.35).castShadow = false;                      // under-neck LED
  // front fork: brace arch, hydraulic reservoirs, damper
  add(steer, box(0.23, 0.022, 0.05), mGloss, 0, 0.36, 0.03);
  for (const sx of [-1, 1]) {
    add(steer, new THREE.CylinderGeometry(0.014, 0.014, 0.07, 10), mDark, sx * 0.17, 0.5, 0.01);
    add(steer, new THREE.CylinderGeometry(0.016, 0.016, 0.014, 10), mRed, sx * 0.17, 0.543, 0.01);
    add(steer, box(0.02, 0.03, 0.03), mRed, sx * 0.17, 0.455, 0.01);
    const f = add(steer, box(0.008, 0.2, 0.035), mFender, sx * 0.06, 0.12, 0.17); f.rotation.x = -0.35;      // fender stays
    add(steer, new THREE.CylinderGeometry(0.0055, 0.0055, 0.06, 8), mRed, sx * 0.07, 0.08, 0.1).rotation.z = Math.PI / 2; // banjo
  }
  const damper = add(steer, new THREE.CylinderGeometry(0.014, 0.014, 0.16, 10), mDark, 0, 0.56, 0.07); damper.rotation.z = Math.PI / 2;
  add(steer, new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), mRed, 0.09, 0.56, 0.07).rotation.z = Math.PI / 2;
  // stem: LED strip, indicator pods, bolts
  add(steer, box(0.012, 0.44, 0.006), mRedLed, 0, 0.84, 0.052).castShadow = false;
  for (const sx of [-1, 1]) {
    add(steer, box(0.03, 0.06, 0.05), mGloss, sx * 0.05, 0.98, 0.03);
    add(steer, box(0.018, 0.04, 0.012), mAmber, sx * 0.05, 0.98, 0.056).castShadow = false;
    for (const dz of [-0.03, 0.03]) add(steer, new THREE.CylinderGeometry(0.005, 0.005, 0.006, 8), mDark, sx * 0.0615, 0.62, dz).rotation.z = Math.PI / 2;
  }
  // bars: clamps, horn, throttle, brake lock
  for (const sx of [-1, 1]) {
    for (const dz of [-0.03, 0.03]) add(steer, new THREE.CylinderGeometry(0.005, 0.005, 0.01, 8), mDark, sx * 0.05, BY + 0.045, dz);
    add(steer, box(0.026, 0.014, 0.03), mRed, sx * 0.3, BY + 0.022, -0.05);
  }
  add(steer, box(0.04, 0.026, 0.05), mRed, -0.205, BY + 0.01, -0.03);                      // throttle pod
  add(steer, new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), mWhite, 0.205, BY + 0.03, -0.03).castShadow = false; // horn
  for (let i = 0; i < 3; i++) add(disp, new THREE.CylinderGeometry(0.007, 0.007, 0.006, 8), mDark, -0.05 + i * 0.05, -0.062, -0.008).rotation.x = Math.PI / 2;
  // rear: dual lamps, brake bar, reflectors, plate light, flap
  for (const sx of [-1, 1]) {
    add(group, box(0.05, 0.034, 0.018), mats.tail, sx * 0.1, 0.33, -0.985).castShadow = false;
    add(group, box(0.04, 0.012, 0.01), mRedLed, sx * 0.17, 0.27, -0.97).castShadow = false;
    add(group, box(0.006, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0xaa1a1a, emissive: 0x500000, emissiveIntensity: 0.3, roughness: 0.3 }), sx * 0.098, 0.37, -0.64);
    const f = add(group, box(0.01, 0.1, 0.2), mFender, sx * 0.082, 0.19, -0.9); f.rotation.x = 0.4;
  }
  add(group, box(0.11, 0.008, 0.012), mWhite, 0, 0.285, -0.96).castShadow = false;
  const flap = add(group, box(0.22, 0.14, 0.008), mMatte, 0, 0.17, -0.99); flap.rotation.x = 0.1;
  // hub motors: cable ports and axle nuts
  for (const w of [rearWheel, frontWheel]) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; add(w, cylX(0.006, 0.01, 6), mDark, -0.062, Math.cos(a) * 0.045, Math.sin(a) * 0.045).castShadow = false; }
    add(w, cylX(0.014, 0.02, 6), mTrim, -0.07, 0, 0);
    add(w, cylX(0.009, 0.05, 8), mCable, -0.075, 0.07, 0);
  }

  /* ---- VESC upgrade parts */
  const vescParts = [];
  const mBlue = std({ color: 0x1668ff, roughness: 0.3, metalness: 0.8 });
  const mCyan = new THREE.MeshBasicMaterial({ color: 0x35e6ff, toneMapped: false });
  const ctl = add(group, box(0.17, 0.085, 0.26), mBlue, 0, 0.31, 0.44); ctl.rotation.x = -0.12;
  const fin = add(group, box(0.15, 0.012, 0.2), mDark, 0, 0.358, 0.44);
  const vlabel = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.036), new THREE.MeshBasicMaterial({ map: textCanvas(128, 40, (x) => { x.fillStyle = '#05080c'; x.fillRect(0, 0, 128, 40); x.fillStyle = '#35e6ff'; x.font = '900 30px Arial'; x.textAlign = 'center'; x.fillText('VESC', 64, 31); }), toneMapped: false }));
  vlabel.position.set(0, 0.312, 0.575); vlabel.rotation.x = -0.17; group.add(vlabel);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.1), new THREE.MeshBasicMaterial({ map: T.pool, color: 0x35e6ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.04, 0);
  vescParts.push(ctl, fin, vlabel);
  for (const w of [rearWheel, frontWheel]) for (const sx of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.0075, 6, 32), mCyan); ring.rotation.y = Math.PI / 2; ring.position.x = sx * 0.062; w.add(ring); vescParts.push(ring); }

  return {
    id: 'dt3', name: 'Dualtron Thunder 3', group, steer, frontWheel, rearWheel, vescParts, glow, glowSize: [0.85, 2.1],
    paint: { body: [mGloss], accent: [mRed, mSpring] }, fp: { y: 1.6, pitch: 0.3 },
    gripLocal: [new THREE.Vector3(0.34, BY, -0.02), new THREE.Vector3(-0.34, BY, -0.02)],
    foot: [new THREE.Vector3(0.085, 0.285, 0.12), new THREE.Vector3(-0.085, 0.285, -0.34)],
    half: HALF, wheelbase: 1.32, wheelR: R, spotPos: [0, 0.85, 0.62], dispMode: 'DUAL', stemDecal: 'DT3',
    spec: { vN: 30.6, vT: 47.2, vVN: 41.7, vVT: 65.3, aN: 4.4, aT: 8.5, aVN: 6.0, aVT: 11.5, kN: 10, kT: 18, kVN: 14, kVT: 28, drag2: 0.00045, brake: 6.2, space: 8.6, cap: 10, aLat: 11, mass: 128, wheelie: 0.72 },
  };
}

/* ============================================================================
   Weped Sonic – hyper scooter: matte black, lime hydraulics, big 11" wheels,
   rear wing + turbine nozzle (500 km/h with VESC)
   ============================================================================ */
export function buildSonic(ctx) {
  const { T, mats, dispTex } = ctx;
  const { add, tube, spring } = tools();
  const group = new THREE.Group();
  const mGloss = std({ color: 0x08090b, roughness: 0.2, metalness: 0.8, envMapIntensity: 1.4 });
  const mMatte = std({ color: 0x121316, roughness: 0.72, metalness: 0.3 });
  const mDark = std({ color: 0x1a1b1f, roughness: 0.3, metalness: 0.9 });
  const mTrim = std({ color: 0x2a2c32, roughness: 0.4, metalness: 0.7 });
  const mLime = std({ color: 0x9dff1a, roughness: 0.35, metalness: 0.5, emissive: 0x244a00, emissiveIntensity: 0.4 });
  const mLimeLed = new THREE.MeshBasicMaterial({ color: 0xb6ff3a, toneMapped: false });
  const mSpring = std({ color: 0x8ae600, roughness: 0.3, metalness: 0.7 });
  const mRubber = std({ color: 0x0b0b0c, roughness: 0.95, vertexColors: true });
  const mCable = std({ color: 0x050506, roughness: 0.55 });
  const mFender = std({ color: 0x0a0b0d, roughness: 0.3, metalness: 0.7, side: THREE.DoubleSide });
  const mMotor = std({ color: 0x2c2e34, roughness: 0.35, metalness: 0.9 });
  const mAmber = new THREE.MeshBasicMaterial({ color: 0xffa21a, toneMapped: false });
  const mCarbon = std({ color: 0x0c0d0f, roughness: 0.28, metalness: 0.55 });
  const gripTex = T.grip.clone(); gripTex.needsUpdate = true; gripTex.repeat.set(2, 8);
  const mDeck = std({ map: gripTex, roughness: 0.92 });
  const R = 0.2, HALF = 0.72, rake = 0.28, BY = 1.2;

  const makeWheel = () => {
    const w = new THREE.Group();
    add(w, tireGeometry(0.14, 0.06, 0.04), mRubber);
    add(w, cylX(0.104, 0.12, 30), mMotor);                       // hub motor
    for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283; const fin = add(w, box(0.12, 0.006, 0.06), mDark, 0, Math.cos(a) * 0.075, Math.sin(a) * 0.075); fin.rotation.x = a; fin.castShadow = false; }
    add(w, cylX(0.112, 0.012, 30), mGloss, 0.06, 0, 0);
    add(w, cylX(0.112, 0.012, 30), mGloss, -0.06, 0, 0);
    for (let i = 0; i < 5; i++) { const sp = add(w, box(0.016, 0.018, 0.2), mLime, 0.068, 0, 0); sp.rotation.x = (i / 5) * 3.14159; }
    add(w, cylX(0.03, 0.13, 14), mTrim);
    add(w, cylX(0.11, 0.0045, 36), mDark, 0.082, 0, 0);          // big disc
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283; const h = add(w, cylX(0.01, 0.006, 8), mMatte, 0.0825, Math.cos(a) * 0.09, Math.sin(a) * 0.09); h.castShadow = false; }
    add(w, cylX(0.007, 0.02, 6), mLime, 0.07, 0.17, 0.03);
    return w;
  };
  const rearWheel = makeWheel(); rearWheel.position.set(0, R, -HALF); group.add(rearWheel);

  /* ---- wide deck with big battery pods */
  add(group, box(0.34, 0.09, 1.1), mGloss, 0, 0.24, -0.02);
  add(group, box(0.31, 0.07, 1.0), mMatte, 0, 0.17, -0.02);
  add(group, box(0.35, 0.012, 1.1), mDark, 0, 0.19, -0.02).scale.set(0.97, 1, 1);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.92), mDeck);
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.2855, -0.06); pad.receiveShadow = true; group.add(pad);
  for (const sx of [-1, 1]) {
    add(group, box(0.025, 0.045, 1.08), mTrim, sx * 0.17, 0.255, -0.02);
    add(group, box(0.012, 0.014, 1.0), mLimeLed, sx * 0.1835, 0.24, -0.02).castShadow = false;       // lime edge light
    add(group, box(0.05, 0.1, 0.78), mCarbon, sx * 0.19, 0.18, -0.06);                                    // battery pod
    for (let i = 0; i < 10; i++) add(group, box(0.056, 0.085, 0.012), mTrim, sx * 0.19, 0.18, -0.4 + i * 0.087);
    add(group, box(0.03, 0.012, 0.5), mLime, sx * 0.21, 0.225, -0.06);
    for (const z of [-0.44, -0.2, 0.04, 0.28]) add(group, new THREE.CylinderGeometry(0.008, 0.008, 0.004, 8), mTrim, sx * 0.135, 0.2905, z);
    add(group, box(0.006, 0.026, 0.07), mAmber, sx * 0.1865, 0.24, 0.48).castShadow = false;
    add(group, box(0.006, 0.026, 0.07), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }), sx * 0.1865, 0.24, -0.52).castShadow = false;
  }
  const neck = add(group, box(0.2, 0.14, 0.24), mGloss, 0, 0.28, 0.5); neck.rotation.x = -0.15;
  add(group, box(0.25, 0.035, 0.18), mTrim, 0, 0.345, 0.44);
  const plate = plateMesh(); plate.position.set(0, 0.3, -1.03); plate.rotation.set(0.1, Math.PI, 0); plate.scale.setScalar(1.15); group.add(plate);

  /* ---- rear: swingarm, twin lime coil-overs, wing, turbine nozzle */
  for (const sx of [-1, 1]) {
    const arm = add(group, box(0.034, 0.075, 0.46), mGloss, sx * 0.11, 0.25, -0.62); arm.rotation.x = 0.28;
    const sp = new THREE.Group(); sp.position.set(sx * 0.135, 0.27, -0.42); sp.rotation.x = -0.65; group.add(sp);
    add(sp, new THREE.CylinderGeometry(0.018, 0.018, 0.4, 12), mDark, 0, 0.2, 0);
    add(sp, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 14), mTrim, 0, 0.07, 0);
    spring(sp, mSpring, 0, 0.07, 0, 0.04, 0.28, 9, 0.006);
    add(sp, new THREE.CylinderGeometry(0.024, 0.024, 0.07, 12), mLime, 0, 0.41, 0);
    add(group, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12), mDark, sx * 0.2, 0.36, -0.52).rotation.x = Math.PI / 2; // remote reservoir
    add(group, new THREE.CylinderGeometry(0.032, 0.032, 0.02, 12), mLime, sx * 0.2, 0.36, -0.42).rotation.x = Math.PI / 2;
    const stay = add(group, box(0.012, 0.2, 0.012), mDark, sx * 0.09, 0.3, -0.9); stay.rotation.x = -0.5;
  }
  const fenderGeo = new THREE.CylinderGeometry(0.235, 0.235, 0.15, 32, 1, true, Math.PI * 0.28, Math.PI * 1.0); fenderGeo.rotateZ(Math.PI / 2);
  add(group, fenderGeo, mFender, 0, R, -HALF);
  const tailArm = add(group, box(0.2, 0.03, 0.3), mFender, 0, 0.38, -0.95); tailArm.rotation.x = 0.18;
  const tail = add(group, box(0.26, 0.04, 0.02), mats.tail, 0, 0.36, -1.1); tail.castShadow = false;
  add(group, box(0.26, 0.012, 0.012), mLimeLed, 0, 0.395, -1.1).castShadow = false;
  // rear wing
  for (const sx of [-1, 1]) add(group, box(0.014, 0.14, 0.04), mCarbon, sx * 0.14, 0.45, -1.02);
  const wing = add(group, box(0.44, 0.012, 0.13), mCarbon, 0, 0.52, -1.04); wing.rotation.x = -0.12;
  add(group, box(0.012, 0.045, 0.14), mLime, 0.225, 0.515, -1.04);
  add(group, box(0.012, 0.045, 0.14), mLime, -0.225, 0.515, -1.04);
  // turbine nozzle (decoration)
  const nozz = add(group, new THREE.CylinderGeometry(0.05, 0.065, 0.16, 20), mDark, 0, 0.3, -1.08); nozz.rotation.x = Math.PI / 2;
  const nz = add(group, new THREE.CylinderGeometry(0.036, 0.036, 0.01, 18), new THREE.MeshBasicMaterial({ color: 0x3a1500, toneMapped: false }), 0, 0.3, -1.165); nz.rotation.x = Math.PI / 2; nz.castShadow = false;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; const bl = add(group, box(0.05, 0.004, 0.006), mTrim, Math.cos(a) * 0.017, 0.3 + Math.sin(a) * 0.017, -1.17); bl.rotation.z = a; bl.castShadow = false; }
  // calipers
  add(group, box(0.034, 0.09, 0.06), mLime, 0.075, 0.25, -0.62);
  add(group, box(0.012, 0.01, 0.05), mDark, 0.085, 0.3, -0.62);
  // diffuser fins under tail
  for (let i = -2; i <= 2; i++) add(group, box(0.008, 0.04, 0.2), mCarbon, i * 0.05, 0.27, -0.96);

  /* ---- steering assembly: dual hydraulic fork */
  const pivot = new THREE.Group(); pivot.position.set(0, R, HALF); pivot.rotation.x = -rake; group.add(pivot);
  const steer = new THREE.Group(); pivot.add(steer);
  const frontWheel = makeWheel(); steer.add(frontWheel);
  for (const sx of [-1, 1]) {
    add(steer, new THREE.CylinderGeometry(0.026, 0.026, 0.52, 14), mDark, sx * 0.125, 0.28, 0);
    add(steer, new THREE.CylinderGeometry(0.042, 0.042, 0.12, 16), mGloss, sx * 0.125, 0.06, 0);
    add(steer, new THREE.CylinderGeometry(0.034, 0.034, 0.12, 14), mMatte, sx * 0.125, 0.22, 0);
    spring(steer, mSpring, sx * 0.125, 0.28, 0, 0.04, 0.26, 8, 0.0058);
    add(steer, new THREE.CylinderGeometry(0.03, 0.03, 0.05, 14), mLime, sx * 0.125, 0.54, 0);
    add(steer, box(0.04, 0.08, 0.06), mLime, sx > 0 ? 0.105 : 0, 0.06, 0.09).visible = sx > 0; // caliper
    add(steer, new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8), mDark, 0.12, 0.09, 0.09).rotation.z = Math.PI / 2;
    const link = add(steer, box(0.016, 0.014, 0.2), mDark, sx * 0.125, 0.32, 0.12); link.rotation.x = 0.55;
    add(steer, new THREE.CylinderGeometry(0.02, 0.02, 0.18, 10), mDark, sx * 0.17, 0.48, -0.02).rotation.z = Math.PI / 2; // remote reservoir
  }
  add(steer, box(0.34, 0.07, 0.12), mGloss, 0, 0.58, 0);
  add(steer, box(0.24, 0.03, 0.1), mTrim, 0, 0.625, 0);
  const ffGeo = new THREE.CylinderGeometry(0.235, 0.235, 0.15, 32, 1, true, -Math.PI * 0.2, Math.PI * 0.9); ffGeo.rotateZ(Math.PI / 2);
  add(steer, ffGeo, mFender, 0, 0, 0);
  // fork brace arch
  add(steer, box(0.26, 0.02, 0.03), mDark, 0, 0.38, 0.065);
  // stem: tall, ends below the handlebar clamp
  const stem = add(steer, new THREE.CylinderGeometry(0.034, 0.046, 0.62, 18), mGloss, 0, 0.9, 0); stem.scale.set(1.25, 1, 0.9);
  add(steer, box(0.14, 0.15, 0.12), mMatte, 0, 0.72, 0);
  add(steer, box(0.16, 0.024, 0.13), mTrim, 0, 0.805, 0);
  add(steer, box(0.16, 0.024, 0.13), mTrim, 0, 0.645, 0);
  add(steer, box(0.022, 0.15, 0.045), mLime, 0.08, 0.72, 0.02).rotation.z = -0.1;
  for (const y of [0.64, 1.14]) { const c = add(steer, new THREE.CylinderGeometry(0.052, 0.052, 0.028, 18), mLime, 0, y, 0); c.scale.set(1.2, 1, 0.9); }
  add(steer, box(0.014, 0.4, 0.006), mLimeLed, 0, 0.93, 0.056).castShadow = false;
  const decalTex = textCanvas(384, 64, (x) => { x.font = '900 38px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#9dff1a'; x.fillText('WEPED', 110, 34); x.fillStyle = '#e8e8ea'; x.fillText('SONIC', 300, 34); });
  const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, toneMapped: false });
  for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.056), decalMat); d.position.set(sx * 0.058, 0.95, 0); d.rotation.y = sx * Math.PI / 2; d.rotation.z = Math.PI / 2; steer.add(d); }
  // bars: wide with big grips
  add(steer, cylX(0.0145, 0.84, 14), mGloss, 0, BY, -0.02);
  add(steer, box(0.15, 0.085, 0.11), mGloss, 0, BY - 0.012, 0);
  add(steer, box(0.09, 0.025, 0.11), mTrim, 0, BY + 0.035, 0);
  for (const sx of [-1, 1]) {
    add(steer, cylX(0.02, 0.15, 14), mRubber, sx * 0.37, BY, -0.02);
    for (const o of [-0.06, -0.02, 0.02, 0.06]) add(steer, cylX(0.0215, 0.006, 12), mMatte, sx * (0.37 + o), BY, -0.02);
    add(steer, cylX(0.025, 0.024, 14), mLime, sx * 0.275, BY, -0.02);
    const lever = add(steer, box(0.015, 0.015, 0.16), mGloss, sx * 0.31, BY - 0.03, 0.085); lever.rotation.y = sx * 0.14;
    add(steer, box(0.044, 0.04, 0.055), mMatte, sx * 0.285, BY - 0.002, 0.0);
    add(steer, new THREE.CylinderGeometry(0.015, 0.015, 0.032, 10), mDark, sx * 0.285, BY + 0.032, 0.0);
    add(steer, box(0.055, 0.032, 0.055), mMatte, sx * 0.205, BY + 0.02, -0.03);
    add(steer, new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), mLimeLed, sx * 0.205, BY + 0.038, -0.03).castShadow = false;
    const be = add(steer, new THREE.CylinderGeometry(0.015, 0.015, 0.024, 10), mLimeLed, sx * 0.445, BY, -0.02); be.rotation.z = Math.PI / 2; be.castShadow = false;
    for (const dz of [-0.03, 0.03]) add(steer, new THREE.CylinderGeometry(0.005, 0.005, 0.01, 8), mDark, sx * 0.055, BY + 0.045, dz);
    tube(steer, [[sx * 0.31, BY - 0.03, 0.085], [sx * 0.2, BY - 0.06, 0.065], [sx * 0.075, 1.0, 0.05], [sx * 0.06, 0.7, 0.045], [sx * 0.075, 0.35, 0.06], [sx * 0.11, 0.08, 0.09]], 0.0055, mCable);
    // twin LED headlamps
    add(steer, box(0.075, 0.065, 0.055), mGloss, sx * 0.06, 0.86, 0.055);
    const l = add(steer, box(0.06, 0.042, 0.012), mats.head, sx * 0.06, 0.86, 0.085); l.castShadow = false;
  }
  add(steer, box(0.22, 0.012, 0.014), mats.head, 0, 0.91, 0.075).castShadow = false;
  // display on a post above the clamp (stem ends below)
  add(steer, box(0.055, 0.06, 0.045), mGloss, 0, BY + 0.075, 0.0).rotation.x = 0.5;
  const disp = new THREE.Group(); disp.position.set(0, BY + 0.14, 0.0); disp.rotation.x = 0.5; steer.add(disp);
  add(disp, box(0.19, 0.115, 0.028), mGloss, 0, 0, 0);
  add(disp, box(0.196, 0.006, 0.03), mLime, 0, 0.06, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.168, 0.1), new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false }));
  screen.rotation.y = Math.PI; screen.position.z = -0.0145; disp.add(screen);

  /* ---- VESC upgrade parts */
  const vescParts = [];
  const mBlue = std({ color: 0x1668ff, roughness: 0.3, metalness: 0.8 });
  const mCyan = new THREE.MeshBasicMaterial({ color: 0x35e6ff, toneMapped: false });
  const ctl = add(group, box(0.19, 0.09, 0.3), mBlue, 0, 0.36, 0.46); ctl.rotation.x = -0.12;
  const fin = add(group, box(0.17, 0.012, 0.23), mDark, 0, 0.412, 0.46);
  const vlabel = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04), new THREE.MeshBasicMaterial({ map: textCanvas(128, 40, (x) => { x.fillStyle = '#05080c'; x.fillRect(0, 0, 128, 40); x.fillStyle = '#35e6ff'; x.font = '900 30px Arial'; x.textAlign = 'center'; x.fillText('VESC', 64, 31); }), toneMapped: false }));
  vlabel.position.set(0, 0.362, 0.612); vlabel.rotation.x = -0.17; group.add(vlabel);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.4), new THREE.MeshBasicMaterial({ map: T.pool, color: 0x35e6ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.04, 0);
  vescParts.push(ctl, fin, vlabel);
  for (const w of [rearWheel, frontWheel]) for (const sx of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.009, 6, 36), mCyan); ring.rotation.y = Math.PI / 2; ring.position.x = sx * 0.07; w.add(ring); vescParts.push(ring); }

  return {
    id: 'sonic', name: 'Weped Sonic', group, steer, frontWheel, rearWheel, vescParts, glow, glowSize: [0.95, 2.4],
    paint: { body: [mGloss], accent: [mLime, mSpring, mLimeLed] }, fp: { y: 1.74, pitch: 0.1 }, // camera sits above the tall display
    gripLocal: [new THREE.Vector3(0.37, BY, -0.02), new THREE.Vector3(-0.37, BY, -0.02)],
    foot: [new THREE.Vector3(0.09, 0.32, 0.14), new THREE.Vector3(-0.09, 0.32, -0.36)],
    half: HALF, wheelbase: 1.44, wheelR: R, spotPos: [0, 0.9, 0.68], dispMode: 'DUAL', stemDecal: 'SONIC',
    // 200 / 300 km/h stock, 350 / 500 km/h with VESC
    spec: { vN: 55.6, vT: 83.3, vVN: 97.2, vVT: 138.9, aN: 6.5, aT: 10, aVN: 9, aVT: 20, kN: 16, kT: 24, kVN: 24, kVT: 50, drag2: 0.00012, brake: 7.5, space: 10, cap: 11.5, aLat: 14, mass: 150, wheelie: 0.7 },
  };
}

/* ============================================================================
   Budget scooters: Kukirin G2 (55 km/h, 70 with VESC) and ZT3 Pro (40 km/h, 70 with VESC)
   ============================================================================ */
export function buildG2(ctx) {
  return buildG4(ctx, {
    id: 'g2', name: 'Kukirin G2', body: 0x101216, accent: 0xff7a1a, brand: 'KuKirin', model: 'G2', decalA: '#c9ccd2', decalB: '#ff7a1a', disp: 'G2',
    spec: { vN: 15.6, vT: 15.6, vVN: 19.7, vVT: 19.7, aN: 2.3, aT: 2.6, aVN: 3.2, aVT: 3.6, kN: 6, kT: 7, kVN: 8, kVT: 9, drag2: 0.0003, brake: 4.4, space: 6.4, cap: 7.2, aLat: 8, mass: 100, wheelie: 0.7 },
  });
}
export function buildZT3(ctx) {
  return buildG4(ctx, {
    id: 'zt3', name: 'ZT3 Pro', body: 0xe4e6ea, matte: 0x3a3d44, accent: 0x1f7aff, brand: 'ZT3', model: 'PRO', decalA: '#1f4aa0', decalB: '#1f7aff', disp: 'ZT3',
    spec: { vN: 11.45, vT: 11.45, vVN: 19.7, vVT: 19.7, aN: 1.7, aT: 1.9, aVN: 2.8, aVT: 3.2, kN: 5, kT: 6, kVN: 7, kVT: 8, drag2: 0.0003, brake: 4.0, space: 6.0, cap: 6.6, aLat: 7.5, mass: 96, wheelie: 0.6 },
  });
}

/* ============================================================================
   Accessories for every scooter: wheelie bar (touches down at ~31 degrees) + bar-end mirrors
   ============================================================================ */
export function decorate(m) {
  const { add, tube } = tools();
  const chrome = std({ color: 0xc9ccd1, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.4 });
  const dark = std({ color: 0x15161a, roughness: 0.4, metalness: 0.8 });
  const rubber = std({ color: 0x0b0b0c, roughness: 0.9 });
  const mirror = std({ color: 0xaecde0, roughness: 0.04, metalness: 1, envMapIntensity: 1.8 });
  // wheelie bar
  const bar = new THREE.Group();
  const zr = -m.half - 0.32, yw = 0.2;
  for (const sx of [-1, 1]) {
    tube(bar, [[sx * 0.055, 0.29, -m.half - 0.02], [sx * 0.06, 0.26, -m.half - 0.2], [sx * 0.06, yw + 0.01, zr + 0.02]], 0.0085, chrome);
    add(bar, new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8), dark, sx * 0.055, 0.29, -m.half - 0.02).rotation.z = Math.PI / 2;
  }
  add(bar, new THREE.CylinderGeometry(0.009, 0.009, 0.14, 8), chrome, 0, yw, zr).rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) { const w = add(bar, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), rubber, sx * 0.04, yw, zr); w.rotation.z = Math.PI / 2; }
  m.group.add(bar);
  m.wheelieBar = bar;
  // mirrors
  const gx = m.gripLocal[0].x, gy = m.gripLocal[0].y;
  for (const sx of [-1, 1]) {
    const x = sx * (gx - 0.05), y = gy + 0.02;
    add(m.steer, new THREE.CylinderGeometry(0.004, 0.004, 0.11, 6), dark, x, y + 0.055, -0.03);
    const mr = add(m.steer, new THREE.BoxGeometry(0.06, 0.04, 0.008), dark, x + sx * 0.012, y + 0.12, -0.03); mr.rotation.set(-0.25, sx * 0.3, 0);
    const gl = add(m.steer, new THREE.BoxGeometry(0.05, 0.03, 0.002), mirror, x + sx * 0.012, y + 0.12, -0.037); gl.rotation.set(-0.25, sx * 0.3 + Math.PI, 0); gl.castShadow = false;
  }
  // bell on the left of the bar, phone holder with a glowing navigation screen on the right
  const brass = std({ color: 0xd8d9dc, roughness: 0.2, metalness: 1, envMapIntensity: 1.6 });
  add(m.steer, new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), dark, gx * 0.55, gy + 0.018, -0.02);
  const bell = add(m.steer, new THREE.SphereGeometry(0.03, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), brass, gx * 0.55, gy + 0.034, -0.02);
  add(m.steer, new THREE.BoxGeometry(0.03, 0.006, 0.012), dark, gx * 0.55 + 0.015, gy + 0.037, 0.03).rotation.z = 0.2;
  const navTex = textCanvas(64, 112, (x, w, h) => {
    x.fillStyle = '#0d1b2a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#2d5a8a'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 80); x.lineTo(30, 56); x.lineTo(40, 20); x.lineTo(64, 0); x.stroke();
    x.strokeStyle = '#22405f'; x.lineWidth = 2; x.beginPath(); x.moveTo(10, 112); x.lineTo(34, 70); x.lineTo(64, 60); x.stroke();
    x.strokeStyle = '#35e6ff'; x.lineWidth = 4; x.beginPath(); x.moveTo(14, 112); x.lineTo(32, 66); x.lineTo(42, 24); x.stroke();
    x.fillStyle = '#ff7a1a'; x.beginPath(); x.arc(32, 66, 5, 0, 6.3); x.fill();
  });
  const ph = new THREE.Group(); ph.position.set(-gx * 0.5, gy + 0.045, -0.02); ph.rotation.x = 0.55; m.steer.add(ph);
  add(ph, new THREE.BoxGeometry(0.075, 0.14, 0.012), dark, 0, 0.05, 0);
  const scr = add(ph, new THREE.PlaneGeometry(0.064, 0.122), new THREE.MeshBasicMaterial({ map: navTex, toneMapped: false }), 0, 0.05, -0.0065); scr.rotation.y = Math.PI; scr.castShadow = false;
  for (const dy of [-0.012, 0.112]) add(ph, new THREE.BoxGeometry(0.082, 0.012, 0.022), dark, 0, dy, 0);
  add(m.steer, new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6), dark, -gx * 0.5, gy + 0.015, -0.02);
  // mud flap with reflector at the rear, orange spoke reflectors on both wheels
  const flap = add(m.group, new THREE.BoxGeometry(0.1, 0.1, 0.006), rubber, 0, m.wheelR + 0.01, -m.half - m.wheelR - 0.015); flap.rotation.x = -0.12;
  add(m.group, new THREE.BoxGeometry(0.05, 0.03, 0.004), std({ color: 0xff2a1a, emissive: 0x801000, emissiveIntensity: 0.6, roughness: 0.3 }), 0, m.wheelR + 0.015, -m.half - m.wheelR - 0.02);
  const refl = std({ color: 0xff9a1a, emissive: 0x7a3800, emissiveIntensity: 0.5, roughness: 0.3 });
  for (const w of [m.rearWheel, m.frontWheel]) for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, rr = m.wheelR * 0.5;
    const r = add(w, new THREE.BoxGeometry(0.004, 0.026, 0.012), refl, 0.02, Math.cos(a) * rr, Math.sin(a) * rr); r.rotation.x = a; r.castShadow = false;
  }
}

/** Repaint a model: hex strings, or null to restore the factory colour. */
export function paintModel(m, body, accent) {
  const apply = (mats, hex) => {
    for (const mt of mats) {
      if (mt.userData.orig === undefined) mt.userData.orig = mt.color.getHex();
      mt.color.setHex(hex === null || hex === undefined ? mt.userData.orig : hex);
      if (mt.emissive && mt.userData.origEm === undefined) mt.userData.origEm = mt.emissive.getHex();
      if (mt.emissive) mt.emissive.setHex(hex === null || hex === undefined ? mt.userData.origEm : (hex & 0xfefefe) >> 2);
    }
  };
  apply(m.paint.body, body);
  apply(m.paint.accent, accent);
}

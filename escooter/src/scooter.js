import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { clamp, damp, lerp, wrapAngle } from './util.js';
import { groundHeight } from './world.js';
import { buildG4, buildDT3, buildSonic, buildG2, buildZT3, buildSimson, decorate, paintModel } from './models.js';

const WHEELBASE = 1.16;
const G = 9.81;
const NO_INPUT = {};
const M_TOTAL = 106; // rider + scooter (kg)
const BATT_WH = 936; // 52 V * 18 Ah

function mergedGeometry(fn) {
  const set = new BatchSet();
  const b = set.get('a');
  fn(b, set);
  return b.build();
}

function limbMesh(r, mat, bulge = 0.36) {
  const prof = [[0.82, 0], [0.93, 0.1], [1.04, bulge * 0.7], [1.06, bulge], [0.98, bulge + 0.25], [0.84, 0.82], [0.76, 1]].map(([k, y]) => new THREE.Vector2(r * k, y));
  const g = new THREE.LatheGeometry(prof, 14);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}
const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
function setSegment(m, a, b) {
  _d.subVectors(b, a);
  const l = _d.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / (l || 1)));
  m.scale.set(1, l, 1);
}
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();
export function ik2(A, C, l1, l2, pole, out) {
  _t1.subVectors(C, A);
  const dist = Math.min(_t1.length(), l1 + l2 - 1e-3);
  _t1.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  _t2.copy(pole).addScaledVector(_t1, -pole.dot(_t1)).normalize();
  out.copy(A).addScaledVector(_t1, a).addScaledVector(_t2, h);
  return out;
}

const K = 1.17; // rider size factor
const ZERO3 = new THREE.Vector3();
const HYPER_V = 1388.9, HYPER_A = 230; // 5000 km/h
const smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
export class Scooter {
  constructor(tex) {
    this.tex = tex;
    this.vesc = false;
    this.wheelie = 0; this.wheelieV = 0; this.wheelieT = 0; this.inWheelie = false; this.wheelieEvent = null;
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    this.buildModel();
    this.reset(0, 0, 0);
    this.hud = { dispT: 0 };
  }

  /* ------------------------------------------------------------ model */
  buildModel() {
    this.mHead = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xfff2d8, emissiveIntensity: 0.3, roughness: 0.2 });
    this.mTail = new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff1010, emissiveIntensity: 0.5, roughness: 0.3 });
    this.mLed = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff9a2a, emissiveIntensity: 0, roughness: 0.4 });
    const dcv = document.createElement('canvas');
    dcv.width = 256; dcv.height = 160;
    this.dispCtx = dcv.getContext('2d');
    this.dispTex = new THREE.CanvasTexture(dcv);
    this.dispTex.colorSpace = THREE.SRGBColorSpace;
    const ctx = { T: this.tex, mats: { head: this.mHead, tail: this.mTail, led: this.mLed }, dispTex: this.dispTex };
    this.models = { g4: buildG4(ctx), dt3: buildDT3(ctx), sonic: buildSonic(ctx), g2: buildG2(ctx), zt3: buildZT3(ctx), simson: buildSimson(ctx) };
    this.wbar = true; this.oneHand = false; this.handMix = 0; this.wheelieOne = false;
    for (const m of Object.values(this.models)) {
      if (!m.noDecor) decorate(m);
      this.tilt.add(m.group);
      this.root.add(m.glow);
      m.glow.visible = false;
      for (const p of m.vescParts) p.visible = false;
    }
    this.spot = new THREE.SpotLight(0xfff0d8, 0, 38, 0.5, 0.6, 1.6);
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, 0, 13);
    this.tilt.add(this.spot, this.spotTarget);
    this.spot.target = this.spotTarget;
    this.buildRider();
    this.setModel('g4');
  }

  setModel(id) {
    const m = this.models[id];
    if (!m) return;
    this.modelId = id; this.model = m;
    for (const k in this.models) this.models[k].group.visible = k === id;
    this.steer = m.steer; this.frontWheel = m.frontWheel; this.rearWheel = m.rearWheel;
    this.foot = m.foot; this.spec = m.spec; this.wb = m.wheelbase; this.half = m.half;
    this.vescGlow = m.glow;
    this.rider.position.y = m.riderDY || 0;
    this.spot.position.set(...m.spotPos);
    this.setVesc(this.vesc);
  }

  setPaint(id, body, accent) { const m = this.models[id]; if (m) paintModel(m, body, accent); }
  setWbar(on) { this.wbar = on; for (const m of Object.values(this.models)) m.wheelieBar.visible = on && !m.noDecor; }
  /** Simson upgrades: MTX10 engine + PZ-Tuning handlebars */
  setSimsonUpgrades(mtx, pz) {
    const m = this.models.simson;
    if (!m.spec0) m.spec0 = { ...m.spec };
    this.simsonUp = { mtx, pz };
    m.mtx.visible = mtx; m.exStock.visible = !mtx;
    m.barPZ.visible = pz; m.barStock.visible = !pz;
    m.spec = { ...(mtx ? m.specMtx : m.spec0), aLat: pz ? 10.8 : m.spec0.aLat };
    m.gripLocalNow = pz ? m.gripLocalPZ : m.gripLocal;
    if (this.modelId === 'simson') this.spec = m.spec;
  }
  get hyperOn() { return !!this.hyper && this.modelId === 'sonic'; }
  get topKmh() { if (this.hyperOn) return HYPER_V * 3.6; const S = this.spec; return (this.vesc ? S.vVT : S.vT) * 3.6; }
  get vTurbo() { const S = this.spec; return this.vesc ? S.vVT : S.vT; }

  buildRider() {
    const tilt = this.tilt;
    const rider = new THREE.Group();
    tilt.add(rider);
    this.rider = rider;
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const mJacket = std({ color: 0x4a5560, roughness: 0.8 });
    const mJacketDark = std({ color: 0x2c3138, roughness: 0.85 });
    const mReflect = std({ color: 0xdfe5e8, roughness: 0.35, metalness: 0.3, emissive: 0x303638, emissiveIntensity: 0.4 });
    const mPants = std({ color: 0x191b21, roughness: 0.85 });
    const mShoe = std({ color: 0xe9e9e9, roughness: 0.6 });
    const mSole = std({ color: 0x2a2a2d, roughness: 0.9 });
    const mGlove = std({ color: 0x141517, roughness: 0.7 });
    const mHelmet = std({ color: 0xf2f2f0, roughness: 0.22, metalness: 0.25 });
    const mBal = std({ color: 0x0c0c0e, roughness: 0.97 });
    const mSkin = std({ color: 0xc89878, roughness: 0.8 });
    const mLens = std({ color: 0xff8a2a, roughness: 0.06, metalness: 0.95, envMapIntensity: 1.6 });
    const mAccent = std({ color: 0xff7a1a, roughness: 0.6 });
    const mk = (geo, mat, parent = rider) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    this.rParts = {};

    // ---- torso (jacket) with collar, reflective stripes, courier backpack
    const torso = mk(new THREE.CapsuleGeometry(0.125, 0.25, 6, 16), mJacket);
    torso.scale.set(1.2 * K, K, 0.78 * K);
    this.rParts.torso = torso;
    const torsoExtra = [];
    const collar = mk(new THREE.TorusGeometry(0.075, 0.03, 8, 16), mJacketDark);
    collar.rotation.x = Math.PI / 2; torsoExtra.push(collar);
    for (const y of [-0.05, 0.04]) {
      const st = mk(new THREE.BoxGeometry(0.31, 0.02, 0.2), mReflect);
      st.position.y = y - 0.06; torsoExtra.push(st);
    }
    const belt = mk(new THREE.BoxGeometry(0.3, 0.035, 0.2), mJacketDark); belt.position.y = -0.2; torsoExtra.push(belt);
    const pocket = mk(new THREE.BoxGeometry(0.07, 0.07, 0.015), mJacketDark); pocket.position.set(0.07, 0.02, 0.098); torsoExtra.push(pocket);
    this.torsoExtra = torsoExtra;
    for (const m of torsoExtra) { m.position.multiplyScalar(K); m.scale.multiplyScalar(K); }
    const stripe = new THREE.Group(); // (no backpack any more – kept as an empty anchor)
    rider.add(stripe);
    this.rParts.stripe = stripe;
    this.rParts.straps = [];

    // ---- head: balaclava (Sturmhaube) + ski goggles + helmet
    const head = [];
    const bal = mk(new THREE.SphereGeometry(0.1, 20, 16), mBal); bal.scale.set(1, 1.1, 1.06); head.push(bal);
    const neck = mk(new THREE.CylinderGeometry(0.05, 0.068, 0.13, 14), mBal); head.push(neck);
    const cheeks = mk(new THREE.SphereGeometry(0.09, 14, 10), mBal); cheeks.scale.set(1, 0.8, 0.95); head.push(cheeks);
    const slit = mk(new THREE.BoxGeometry(0.118, 0.034, 0.03), mSkin); head.push(slit);
    const brow = mk(new THREE.BoxGeometry(0.12, 0.016, 0.034), mBal); head.push(brow);
    const gogg = mk(new THREE.BoxGeometry(0.16, 0.06, 0.044), mLens); head.push(gogg);
    const goggFrame = mk(new THREE.BoxGeometry(0.172, 0.07, 0.036), mJacketDark); head.push(goggFrame);
    const strap = mk(new THREE.TorusGeometry(0.108, 0.013, 8, 24), mJacketDark); strap.rotation.x = Math.PI / 2; head.push(strap);
    const helmet = mk(new THREE.SphereGeometry(0.128, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.43), mHelmet); helmet.scale.set(1, 1.04, 1.12); head.push(helmet);
    const peak = mk(new THREE.BoxGeometry(0.16, 0.012, 0.07), mHelmet); head.push(peak);
    const hstripe = mk(new THREE.BoxGeometry(0.026, 0.012, 0.26), mAccent); head.push(hstripe);
    const vents = [];
    for (const sx of [-1, 1]) { const v = mk(new THREE.BoxGeometry(0.02, 0.006, 0.12), mJacketDark); v.userData.sx = sx; vents.push(v); head.push(v); }
    for (const sx of [-1, 1]) { // ears under the balaclava + helmet pads/chin strap
      const ear = mk(new THREE.SphereGeometry(0.026, 8, 6), mBal); ear.userData.pos = [sx * 0.098, 0.0, -0.005]; ear.scale.set(0.5, 1, 0.8); head.push(ear);
      const pad = mk(new THREE.BoxGeometry(0.012, 0.05, 0.07), mJacketDark); pad.userData.pos = [sx * 0.112, 0.045, 0.0]; head.push(pad);
      const chin = mk(new THREE.BoxGeometry(0.01, 0.1, 0.014), mJacketDark); chin.userData.pos = [sx * 0.085, -0.045, 0.045]; chin.rotation.z = sx * 0.2; head.push(chin);
    }
    const mEyeW = std({ color: 0xf4f4f2, roughness: 0.3 }), mIris = std({ color: 0x3a6a8a, roughness: 0.2 }), mPupil = std({ color: 0x050505, roughness: 0.2 }), mBrowC = std({ color: 0x2a1d14, roughness: 0.9 });
    for (const sx of [-1, 1]) { // eyes look out of the balaclava, the goggles sit on the helmet
      const ew = mk(new THREE.BoxGeometry(0.036, 0.022, 0.01), mEyeW); ew.userData.pos = [sx * 0.037, 0.004, 0.1015]; head.push(ew);
      const ir = mk(new THREE.BoxGeometry(0.017, 0.018, 0.008), mIris); ir.userData.pos = [sx * 0.039, 0.004, 0.1065]; head.push(ir);
      const pu = mk(new THREE.BoxGeometry(0.008, 0.01, 0.004), mPupil); pu.userData.pos = [sx * 0.039, 0.004, 0.1108]; head.push(pu);
      const lid = mk(new THREE.BoxGeometry(0.042, 0.007, 0.012), mBal); lid.userData.pos = [sx * 0.037, 0.0185, 0.1018]; head.push(lid);
      const bw = mk(new THREE.BoxGeometry(0.05, 0.009, 0.012), mBrowC); bw.userData.pos = [sx * 0.038, 0.029, 0.1], bw.rotation.z = sx * -0.12; head.push(bw);
    }
    const nose = mk(new THREE.SphereGeometry(0.02, 8, 6), mBal); nose.userData.pos = [0, -0.012, 0.1]; nose.scale.set(0.8, 1.1, 1); head.push(nose);
    const chinPad = mk(new THREE.BoxGeometry(0.07, 0.012, 0.02), mJacketDark); chinPad.userData.pos = [0, -0.08, 0.08]; head.push(chinPad);
    const headG = new THREE.Group(); rider.add(headG); this.headG = headG;
    { // cigarette (shown while smoking)
      const cg = new THREE.Group(); cg.position.set(0.028, -0.047, 0.108); cg.visible = false; headG.add(cg);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.075), std({ color: 0xf2f0e8, roughness: 0.9 })); body.position.z = 0.04; cg.add(body);
      const filt = new THREE.Mesh(new THREE.BoxGeometry(0.0125, 0.0125, 0.024), std({ color: 0xd8a860, roughness: 0.9 })); filt.position.z = 0.0; cg.add(filt);
      const ember = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.011, 0.008), new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false })); ember.position.z = 0.081; cg.add(ember);
      const tip = new THREE.Object3D(); tip.position.z = 0.085; cg.add(tip);
      this.cig = cg; this.cigTip = tip;
    }
    for (const m of head) headG.add(m);
    headG.scale.setScalar(K);
    this.rParts.head = head;
    this.headMeshes = { bal, neck, cheeks, slit, brow, gogg, goggFrame, strap, helmet, peak, hstripe, vents, extra: head.filter((m) => m.userData.pos) };

    // ---- limbs
    this.legs = [];
    this.arms = [];
    const mGlove2 = std({ color: 0x2b2d33, roughness: 0.55, metalness: 0.2 });
    const mPalm = std({ color: 0x3a2f28, roughness: 0.85 });            // leather palm
    const mKnuckle = std({ color: 0xff7a1a, roughness: 0.5 });
    const mTPU = std({ color: 0x1b1c20, roughness: 0.3, metalness: 0.35 });
    const capsule = (w, l, mat, parent) => { // finger segment along +z, origin at its start
      const g = new THREE.CapsuleGeometry(w / 2, Math.max(l - w, 0.001), 3, 8); g.rotateX(Math.PI / 2); g.translate(0, 0, l / 2);
      return mk(g, mat, parent);
    };
    const glove = (sx) => { // origin = centre of the grip; fingers wrap around the bar (axis x)
      const g = new THREE.Group();
      const palm = mk(new THREE.BoxGeometry(0.088, 0.03, 0.076), mPalm, g); palm.position.set(0, 0.03, -0.05);
      const back = mk(new THREE.BoxGeometry(0.086, 0.016, 0.062), mGlove2, g); back.position.set(0, 0.05, -0.044);
      back.geometry.translate(0, 0, 0);
      for (let i = 0; i < 4; i++) { // TPU knuckle guards with orange stripe
        const kg = mk(new THREE.BoxGeometry(0.019, 0.013, 0.022), mTPU, g); kg.position.set((i - 1.5) * 0.0215, 0.06, -0.018);
        const ks = mk(new THREE.BoxGeometry(0.019, 0.004, 0.006), mKnuckle, g); ks.position.set((i - 1.5) * 0.0215, 0.0675, -0.016);
      }
      for (const dx of [-0.02, 0, 0.02]) { const sm = mk(new THREE.BoxGeometry(0.002, 0.003, 0.05), mTPU, g); sm.position.set(dx, 0.0585, -0.062); } // seams
      const heel = mk(new THREE.SphereGeometry(0.036, 10, 8), mPalm, g); heel.position.set(0, 0.028, -0.09); heel.scale.set(1.1, 0.8, 1);
      const thenar = mk(new THREE.SphereGeometry(0.024, 8, 6), mPalm, g); thenar.position.set(-sx * 0.04, 0.02, -0.06); thenar.scale.set(1, 0.9, 1.2);
      const cuff = mk(new THREE.CylinderGeometry(0.043, 0.051, 0.07, 14), mJacketDark, g); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 0.03, -0.145);
      const strap = mk(new THREE.BoxGeometry(0.092, 0.014, 0.026), mGlove2, g); strap.position.set(0, 0.03, -0.118); strap.scale.set(1, 1.5, 1);
      const vel = mk(new THREE.BoxGeometry(0.04, 0.016, 0.02), mReflect, g); vel.position.set(-sx * 0.012, 0.0645, -0.118);
      const finger = (x, y, z, lens, w) => {
        const root = new THREE.Group(); root.position.set(x, y, z); g.add(root);
        const js = []; let parent = root;
        lens.forEach((l, k) => {
          const j = new THREE.Group(); if (k) j.position.z = lens[k - 1] - 0.002; parent.add(j); js.push(j);
          capsule(w * (1 - k * 0.07), l, k === 0 ? mGlove : mGlove, j);
          if (k < lens.length - 1) { const kn = mk(new THREE.SphereGeometry(w * 0.5, 8, 6), mGlove, j); kn.position.z = l; kn.scale.set(1, 0.95, 0.7); }
          parent = j;
        });
        return { root, js };
      };
      const fl = [1, 1.1, 1.06, 0.86];
      g.userData.fingers = [0, 1, 2, 3].map((i) => finger((i - 1.5) * 0.0215, 0.034, -0.012, [0.036, 0.03, 0.026].map((l) => l * fl[i]), 0.0195));
      g.userData.index = sx > 0 ? 0 : 3; // index finger sits on the thumb side
      const th = finger(-sx * 0.048, 0.02, -0.06, [0.03, 0.028, 0.022], 0.0225);
      g.userData.thumb = th; g.userData.sx = sx;
      g.scale.setScalar(K * 0.98);
      rider.add(g);
      return g;
    };
    const mLace = std({ color: 0xcfd2d6, roughness: 0.6 });
    const mShoeAcc = std({ color: 0xff7a1a, roughness: 0.6 });
    const shoe = () => {
      const g = new THREE.Group(); g.scale.setScalar(K);
      const upper = mk(new THREE.BoxGeometry(0.092, 0.058, 0.2), mShoe, g); upper.position.set(0, 0.005, -0.02);
      const toe = mk(new THREE.SphereGeometry(0.05, 12, 9), mShoe, g); toe.position.set(0, -0.006, 0.085); toe.scale.set(0.95, 0.72, 1.25);
      const cap = mk(new THREE.SphereGeometry(0.048, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mSole, g); cap.position.set(0, -0.022, 0.095); cap.scale.set(1.0, 0.5, 1.25);
      const heel = mk(new THREE.BoxGeometry(0.088, 0.075, 0.07), mShoe, g); heel.position.set(0, 0.012, -0.095);
      const collar = mk(new THREE.TorusGeometry(0.036, 0.011, 6, 14), mJacketDark, g); collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.048, -0.06); collar.scale.set(1.2, 1, 1);
      const tongue = mk(new THREE.BoxGeometry(0.05, 0.012, 0.075), mJacketDark, g); tongue.position.set(0, 0.038, 0.012); tongue.rotation.x = -0.35;
      for (let k = 0; k < 4; k++) { const l = mk(new THREE.BoxGeometry(0.058, 0.004, 0.006), mLace, g); l.position.set(0, 0.042 - k * 0.002, 0.045 - k * 0.022); l.rotation.x = -0.3; }
      const so = mk(new THREE.BoxGeometry(0.1, 0.022, 0.255), mSole, g); so.position.set(0, -0.034, 0.005);
      for (let k = 0; k < 5; k++) { const lug = mk(new THREE.BoxGeometry(0.102, 0.008, 0.012), mSole, g); lug.position.set(0, -0.049, -0.095 + k * 0.045); }
      const stripe = mk(new THREE.BoxGeometry(0.094, 0.012, 0.09), mShoeAcc, g); stripe.position.set(0, -0.012, -0.03);
      for (const sxx of [-1, 1]) { const sw = mk(new THREE.BoxGeometry(0.004, 0.02, 0.07), mShoeAcc, g); sw.position.set(sxx * 0.047, 0.012, 0.0); }
      rider.add(g);
      return g;
    };
    for (let i = 0; i < 2; i++) {
      const lo = limbMesh(0.052 * K, mPants);
      const knee = mk(new THREE.SphereGeometry(0.066 * K, 12, 10), mPants);
      this.legs.push({ up: limbMesh(0.074 * K, mPants), lo, knee, foot: shoe() });
      const band = mk(new THREE.CylinderGeometry(0.052 * K * 1.12, 0.052 * K * 1.12, 0.1, 10), mReflect, lo);
      band.position.y = 0.5; band.scale.y = 0.4;
      const loA = limbMesh(0.043 * K, mJacket);
      const bandA = mk(new THREE.CylinderGeometry(0.043 * K * 1.14, 0.043 * K * 1.14, 0.1, 10), mReflect, loA);
      bandA.position.y = 0.55; bandA.scale.y = 0.4;
      this.arms.push({ up: limbMesh(0.054 * K, mJacket), lo: loA, elbow: mk(new THREE.SphereGeometry(0.052 * K, 12, 10), mJacket), hand: glove(i === 0 ? 1 : -1), shoulder: mk(new THREE.SphereGeometry(0.068 * K, 12, 10), mJacket) });
      for (const k of ['up', 'lo']) { rider.add(this.legs[i][k]); rider.add(this.arms[i][k]); }
    }
    // joint positions (tilt space)
    this.hip = [new THREE.Vector3(0.105, 0.99, -0.22), new THREE.Vector3(-0.105, 0.99, -0.22)];
    this.foot = [new THREE.Vector3(0.05, 0.265, 0.06), new THREE.Vector3(-0.05, 0.265, -0.28)];
    this.shoulder = [new THREE.Vector3(0.235, 1.57, -0.05), new THREE.Vector3(-0.235, 1.57, -0.05)];
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.torsoBase = new THREE.Vector3(0, 1.27, -0.12);
    this.headBase = new THREE.Vector3(0, 1.8, 0.07);
    torso.position.copy(this.torsoBase);
    torso.rotation.x = 0.45;
    // torso accessories follow the torso frame
    const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45);
    for (const m of torsoExtra) {
      const off = m.position.clone().applyQuaternion(tq).add(this.torsoBase);
      m.userData.base = off; m.position.copy(off); m.quaternion.multiplyQuaternions(tq, m.quaternion);
    }
    collar.position.copy(this.torsoBase).add(new THREE.Vector3(0, 0.2 * K, 0.06 * K).applyQuaternion(tq));
    collar.rotation.set(Math.PI / 2 + 0.45, 0, 0);
    stripe.position.set(0, 1.37, -0.3); stripe.rotation.x = 0.45; stripe.scale.setScalar(K);
    this.rParts.straps.forEach((m) => {
      m.position.copy(this.torsoBase).add(new THREE.Vector3(m.userData.sx * 0.085 * K, 0.07 * K, 0.1 * K).applyQuaternion(tq));
      m.rotation.x = 0.45;
    });
    this.rParts.torsoExtra = torsoExtra;
    // --- extra anatomy & clothing detail (follows torso / hips every frame)
    const mZip = std({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.9 });
    const detail = [];
    const bodyPart = (geo, mat, off, scale) => { const m = mk(geo, mat); m.userData.off = new THREE.Vector3(...off).multiplyScalar(K); if (scale) m.scale.set(...scale); m.scale.multiplyScalar(K); detail.push(m); return m; };
    bodyPart(new THREE.BoxGeometry(0.012, 0.42, 0.008), mJacketDark, [0, 0.0, 0.103]);                // zipper tape
    bodyPart(new THREE.BoxGeometry(0.01, 0.025, 0.012), mZip, [0, 0.16, 0.108]);                    // zip pull
    for (const sx of [-1, 1]) {
      bodyPart(new THREE.BoxGeometry(0.075, 0.075, 0.016), mJacketDark, [sx * 0.1, 0.08, 0.098]);  // chest pocket
      bodyPart(new THREE.BoxGeometry(0.08, 0.02, 0.02), mJacket, [sx * 0.1, 0.12, 0.1]);           // flap
      bodyPart(new THREE.BoxGeometry(0.05, 0.034, 0.004), mReflect, [sx * 0.1, 0.01, 0.108]);      // reflective tab
      bodyPart(new THREE.SphereGeometry(0.075, 10, 8), mJacket, [sx * 0.15, 0.2, -0.01], [1, 0.8, 0.95]); // shoulder pad
      bodyPart(new THREE.BoxGeometry(0.07, 0.07, 0.014), mJacketDark, [sx * 0.12, -0.14, 0.09]);   // hip pocket
    }
    bodyPart(new THREE.TorusGeometry(0.1, 0.034, 8, 18), mJacketDark, [0, 0.215, -0.03], [1.1, 1, 0.9]).rotation.x = Math.PI / 2; // hood/collar roll
    bodyPart(new THREE.BoxGeometry(0.09, 0.05, 0.05), mJacket, [0, 0.215, -0.1]);                   // folded hood
    bodyPart(new THREE.BoxGeometry(0.02, 0.026, 0.012), mZip, [0, -0.2, 0.105]);                    // belt buckle
    this.torsoDetail = detail;
    this.pelvis = mk(new THREE.SphereGeometry(0.135, 14, 10), mPants); this.pelvis.scale.set(1.15 * K, 0.85 * K, 0.95 * K);
    this.kneePads = [0, 1].map(() => { const g = new THREE.Group(); const m = mk(new THREE.BoxGeometry(0.1, 0.11, 0.05), mJacketDark, g); const t = mk(new THREE.BoxGeometry(0.07, 0.014, 0.012), mReflect, g); t.position.set(0, 0.0, 0.028); g.scale.setScalar(K); rider.add(g); return g; });
    this.thighPockets = [0, 1].map(() => { const g = new THREE.Group(); const m = mk(new THREE.BoxGeometry(0.014, 0.12, 0.09), mPants, g); const fl = mk(new THREE.BoxGeometry(0.016, 0.03, 0.094), mJacketDark, g); fl.position.y = 0.05; g.scale.setScalar(K); rider.add(g); return g; });
    this.rParts.detail = detail; this.rParts.extra2 = [this.pelvis];
    for (const m of detail) { const off = m.userData.off.clone().applyQuaternion(tq).add(this.torsoBase); m.position.copy(off); m.quaternion.multiplyQuaternions(tq, m.quaternion); }
    // everything on the upper body hangs on one pivot at the hips so it can breathe, twist and roll
    const P = this.pivotP = new THREE.Vector3(0, 0.99, -0.22);
    const torsoG = this.torsoG = new THREE.Group(); torsoG.position.copy(P); rider.add(torsoG);
    const upper = [torso, stripe, collar, ...torsoExtra, ...this.rParts.straps, ...detail];
    for (const m of upper) { m.position.sub(P); torsoG.add(m); }
    rider.remove(this.headG); torsoG.add(this.headG);
    this.upperBody = upper;
    this.shoulder0 = this.shoulder.map((v) => v.clone());
    this.placeHead(0);
  }

  placeHead(sway) {
    const H = this.headMeshes, y = sway, b = { x: 0, z: 0 };
    this.headG.position.copy(this.headBase).sub(this.pivotP || ZERO3);
    H.bal.position.set(b.x, y, b.z);
    H.cheeks.position.set(b.x, y - 0.045, b.z + 0.005);
    H.neck.position.set(b.x, y - 0.1, b.z - 0.015);
    H.slit.position.set(b.x, y + 0.012, b.z + 0.085);
    H.brow.position.set(b.x, y + 0.04, b.z + 0.083);
    H.gogg.position.set(b.x, y + 0.104, b.z + 0.112); H.gogg.rotation.x = -0.75;
    H.goggFrame.position.set(b.x, y + 0.102, b.z + 0.104); H.goggFrame.rotation.x = -0.75;
    H.strap.position.set(b.x, y + 0.012, b.z);
    H.helmet.position.set(b.x, y + 0.012, b.z - 0.012);
    H.peak.position.set(b.x, y + 0.078, b.z + 0.125);
    H.peak.rotation.x = -0.18;
    H.hstripe.position.set(b.x, y + 0.141, b.z);
    H.vents.forEach((v) => v.position.set(b.x + v.userData.sx * 0.05, y + 0.132, b.z + 0.02));
    for (const m of this.headMeshes.extra) m.position.set(m.userData.pos[0], y + m.userData.pos[1] + 0.012, m.userData.pos[2]);
  }

  poseHand(hand, open, t, brake = 0) {
    const fs = hand.userData.fingers, sx = hand.userData.sx, ix = hand.userData.index;
    const closed = [0.55, 1.35, 1.2], opened = [0.12, 0.14, 0.1], lever = [0.35 + brake * 0.2, 0.45 + brake * 0.45, 0.4 + brake * 0.4];
    fs.forEach((f, i) => {
      const base = i === ix ? lever : closed; // index finger rests on the brake lever
      f.js.forEach((j, k) => { j.rotation.x = base[k] + (opened[k] + (open > 0.5 ? Math.sin(t * 9 + i) * 0.04 : 0) - base[k]) * open; });
      f.root.rotation.y = (i - 1.5) * 0.11 * open + (i === ix ? -sx * 0.06 : 0) * (1 - open);
      f.root.rotation.z = 0;
    });
    const th = hand.userData.thumb;
    th.js[0].rotation.x = 0.7 - 0.5 * open; th.js[1].rotation.x = 0.8 - 0.65 * open; th.js[2].rotation.x = 0.6 - 0.5 * open;
    th.root.rotation.y = -sx * (0.3 + 0.9 * open);
  }

  updateRider(dt, speed) {
    const tilt = this.tilt, steer = this.steer;
    tilt.updateMatrixWorld(true);
    const sway = Math.sin(this.odo * 0.8) * 0.004 * Math.min(1, speed / 4);
    this.placeHead(sway);
    const T = this._tmp || (this._tmp = {
      g: new THREE.Vector3(), pole: [new THREE.Vector3(0.45, -0.55, -0.45), new THREE.Vector3(-0.45, -0.55, -0.45)],
      poleUp: new THREE.Vector3(0.7, -0.15, -0.55),
      legPole: [new THREE.Vector3(0.15, 0.1, 1), new THREE.Vector3(-0.15, 0.1, 1)], ankle: new THREE.Vector3(), up: new THREE.Vector3(), pad: new THREE.Vector3(),
    });
    this.handMix = damp(this.handMix, this.oneHand && !this.parked ? 1 : 0, 9, dt);
    const hm = this.handMix, time = performance.now() * 0.001;
    // living body: breathing, twisting with the bars, leaning with accelerations, looking into turns
    const br = Math.sin(time * 1.9) * 0.012 + Math.sin(time * 3.7) * 0.004;
    this.bodyYaw = damp(this.bodyYaw || 0, this.steerIn * 0.2, 7, dt);
    this.bodyPitch = damp(this.bodyPitch || 0, clamp(-this.aLong * 0.012, -0.12, 0.1) - this.wheelie * 0.25, 5, dt);
    this.bodyRoll = damp(this.bodyRoll || 0, -this.lean * 0.18, 5, dt);
    this.torsoG.rotation.set(br + this.bodyPitch, this.bodyYaw, this.bodyRoll, 'YXZ');
    this.headYaw = damp(this.headYaw || 0, clamp(this.steerIn * 0.45 + this.lean * 0.5, -0.6, 0.6), 6, dt);
    this.headG.rotation.set(-this.bodyPitch * 0.6 - br * 0.5, this.headYaw - this.bodyYaw, -this.bodyRoll * 0.6, 'YXZ');
    this.torsoG.updateMatrix();
    for (let i = 0; i < 2; i++) this.shoulder[i].copy(this.shoulder0[i]).sub(this.pivotP).applyMatrix4(this.torsoG.matrix);
    this.pelvis.position.set(0, this.hip[0].y - 0.02, this.hip[0].z);
    for (let i = 0; i < 2; i++) {
      const g = T.g.copy((this.model.gripLocalNow || this.model.gripLocal)[i]);
      steer.localToWorld(g);
      tilt.worldToLocal(g);
      g.y -= this.model.riderDY || 0;
      const lift = i === 0 ? hm : 0; // the left hand comes off the bar, the right one stays on the throttle
      const hand = this.arms[i].hand;
      if (lift > 0.001) {
        T.up.set(this.shoulder[i].x + 0.14, this.shoulder[i].y + 0.3 + Math.sin(time * 5) * 0.015, this.shoulder[i].z + 0.3);
        T.up.x += Math.sin(time * 5.5) * 0.03 * lift;
        g.lerp(T.up, lift);
      }
      hand.position.set(g.x, g.y + 0.012 * (1 - lift), g.z - 0.02 * (1 - lift));
      hand.rotation.set(0.05 - 1.5 * lift, 0, lift * (0.18 + Math.sin(time * 5.5) * 0.12));
      this.poseHand(hand, lift, time, this.brk || 0);
      this.arms[i].shoulder.position.copy(this.shoulder[i]);
      const pole = lift > 0.5 ? T.poleUp : T.pole[i];
      ik2(this.shoulder[i], g, 0.35, 0.35, pole, this._v[0]);
      setSegment(this.arms[i].up, this.shoulder[i], this._v[0]);
      setSegment(this.arms[i].lo, this._v[0], g);
      this.arms[i].elbow.position.copy(this._v[0]);
      const ft = this.foot[i];
      T.ankle.set(ft.x, ft.y + 0.05 - (this.model.riderDY || 0), ft.z - 0.04);
      ik2(this.hip[i], T.ankle, 0.5, 0.5, T.legPole[i], this._v[1]);
      setSegment(this.legs[i].up, this.hip[i], this._v[1]);
      setSegment(this.legs[i].lo, this._v[1], T.ankle);
      this.legs[i].knee.position.copy(this._v[1]);
      this.legs[i].foot.position.set(ft.x, ft.y - (this.model.riderDY || 0), ft.z + 0.06);
      const kp = this.kneePads[i];
      kp.position.copy(this._v[1]).add(T.pad.set(0, 0, 0.055 * K)); kp.quaternion.copy(this.legs[i].lo.quaternion);
      const tp = this.thighPockets[i];
      tp.position.copy(this.hip[i]).lerp(this._v[1], 0.42).add(T.pad.set((i === 0 ? 1 : -1) * 0.075 * K, 0.0, 0.02)); tp.quaternion.copy(this.legs[i].up.quaternion);
    }
  }

  setSmoking(on) { this.smoking = on; this.cig.visible = on && !this.firstPerson; }
  setVesc(on) {
    this.vesc = on;
    for (const [k, m] of Object.entries(this.models)) {
      const show = on && k === this.modelId;
      for (const p of m.vescParts) p.visible = show;
      m.glow.visible = show;
    }
    this.mLed.emissive.set(on ? 0x35e6ff : 0xff9a2a);
  }

  setView(first) {
    this.firstPerson = first; if (this.cig) this.cig.visible = !!this.smoking && !first;
    const show = !first;
    this.rParts.torso.visible = show; this.rParts.stripe.visible = show;
    this.rParts.head.forEach((p) => (p.visible = show));
    this.rParts.torsoExtra.forEach((p) => (p.visible = show));
    this.rParts.straps.forEach((p) => (p.visible = show));
    this.rParts.detail.forEach((p) => (p.visible = show));
    this.pelvis.visible = show; this.kneePads.forEach((p) => (p.visible = show)); this.thighPockets.forEach((p) => (p.visible = show));
    for (const l of this.legs) for (const k in l) l[k].visible = show;
    for (const a of this.arms) { a.up.visible = show; a.elbow.visible = show; a.lo.visible = show; a.shoulder.visible = show; }
  }

  /* ------------------------------------------------------------ state */
  reset(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.v = 0; this.thr = 0; this.brk = 0;
    this.steerIn = 0; this.delta = 0;
    this.lean = 0; this.leanV = 0; this.hyper = false;
    this.pitch = 0; this.pitchV = 0;
    this.bob = 0; this.bobV = 0;
    const hg = groundHeight(x, z);
    this.hF = this.hR = this.wAvg = hg; this.wVel = 0;
    this.yOff = hg;
    this.aLong = 0;
    this.odo = this.odo || 0;
    this.trip = this.trip || 0;
    this.batt = this.batt ?? BATT_WH;
    this.boosting = false; this.braking = false;
    this.impact = 0;
    this.stuckT = 0;
    this.fallT = 0;
    this.wheelie = 0; this.wheelieV = 0; this.wheelieT = 0; this.inWheelie = false;
    this.wheelAng = 0;
    this.whPerM = 0.02;
    this.shake = 0;
    this.applyTransform();
  }

  get kmh() { return Math.abs(this.v) * 3.6; }
  get battPct() { return clamp((this.batt / BATT_WH) * 100, 0, 100); }

  update(dt, inp, world, drainScale, dyn) {
    if (this.fallT > 0) { this.fallT -= dt; inp = NO_INPUT; }
    const empty = this.batt <= 0.2;
    const boost = !!inp.boost && !!inp.fwd && !empty && this.v > 1;
    this.boosting = boost;
    // KuKirin G4: 65 km/h normal, 100 km/h with turbo
    const V = this.vesc, S = this.spec;
    const H = this.hyperOn; // Weped Sonic on the race track: 5000 km/h, absurd acceleration
    const HB = H && boost;
    const vmax = empty ? 3.2 : HB ? HYPER_V : boost ? (V ? S.vVT : S.vT) : (V ? S.vVN : S.vN);
    const aMax = empty ? 0.7 : HB ? HYPER_A : boost ? (V ? S.aVT : S.aT) : (V ? S.aVN : S.aN);
    const vKnee = HB ? HYPER_V : boost ? (V ? S.kVT : S.kT) : (V ? S.kVN : S.kN);

    // throttle / brake smoothing
    const thrT = inp.fwd ? 1 : 0;
    this.thr = damp(this.thr, thrT, thrT > this.thr ? 5 : 12, dt);
    const brkT = (inp.back && this.v > 0.25 ? 1 : 0);
    this.brk = damp(this.brk, brkT, brkT > this.brk ? 14 : 20, dt);
    const spaceT = inp.space ? 1 : 0;
    this.space = damp(this.space || 0, spaceT, 18, dt);

    let a = 0;
    const v = this.v;
    // motor
    let motorA = 0;
    if (this.thr > 0.01 && v > -0.5) {
      const base = aMax * Math.min(1, vKnee / Math.max(v, vKnee));
      const lim = clamp((vmax - v) / 1.6, 0, 1);
      motorA = this.thr * base * lim;
      if (v < 0) motorA += 3; // regen against reverse
      a += motorA;
    } else if (this.thr > 0.01 && v <= -0.5) {
      a += 4; // brake reverse roll
    }
    // reverse (S when stopped)
    if (inp.back && v <= 0.25 && !inp.fwd) {
      const target = -1.6;
      a += (v > target ? -1.6 : 0);
    }
    // coast / drag
    const sgn = Math.sign(v);
    const drag = (0.12 + (H ? 0.00001 : S.drag2) * v * v) * sgn;
    a -= drag;
    if (this.thr < 0.05 && Math.abs(v) > 0.3 && !this.brk) a -= 0.35 * sgn; // motor regen
    // brakes
    const hb = H ? 1 + 39 * smooth01((Math.abs(v) - 100) / 150) : 1; // hyper brakes: up to 40x
    const brakeA = Math.min(S.cap * hb, (this.brk * S.brake + this.space * S.space) * hb) * Math.min(1, Math.abs(v) / 0.6);
    a -= brakeA * sgn;
    if (this.fallT > 0) a -= 6 * sgn;
    // stopped by brakes
    const prevV = v;
    let nv = v + a * dt;
    if ((inp.back || inp.space) && !inp.fwd && Math.sign(nv) !== Math.sign(prevV) && prevV > 0) nv = 0;
    if (!inp.fwd && !inp.back && Math.abs(nv) < 0.04) nv = 0;
    if (inp.space && Math.abs(nv) < 0.15) nv = 0;
    this.aLong = (nv - v) / Math.max(dt, 1e-4);
    this.v = nv;
    this.braking = this.brk > 0.3 || this.space > 0.3 || (inp.back && v > 0.25);

    // steering
    // wheelie (hold E): front wheel up, rear wheel balances
    const wantW = !!inp.wheelie && !this.parked && !(inp.back || inp.space) && (this.inWheelie ? this.v > 1.0 : this.v > 2.0);
    const wMax = this.wbar ? 0.56 : 0.95;
    const wT = wantW ? Math.min(S.wheelie, wMax - 0.02) : 0;
    this.wheelieV += (38 * (wT - this.wheelie) - 7.5 * this.wheelieV) * dt;
    this.wheelie = clamp(this.wheelie + this.wheelieV * dt, 0, wMax);
    if (this.wheelie > 0.35) { if (!this.inWheelie) this.wheelieOne = this.oneHand; else if (!this.oneHand) this.wheelieOne = false; this.wheelieT += dt; this.inWheelie = true; }
    else if (this.inWheelie && this.wheelie < 0.2) {
      this.inWheelie = false;
      if (this.wheelieT >= 1.5 && !this.wheelieAbort) this.wheelieEvent = { dur: this.wheelieT, one: this.wheelieOne };
      this.wheelieT = 0; this.wheelieAbort = false;
      this.bobV -= 0.5; this.shake = Math.min(1, this.shake + 0.25); // landing jolt
    }
    const analog = inp.steer !== undefined && inp.steer !== null;
    const target = analog ? inp.steer : (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    const rate = analog ? 11 : target === 0 ? 8 : 5.5;
    this.steerIn = damp(this.steerIn, target, rate, dt);
    const av = Math.abs(this.v);
    const dMax = (0.14 + 0.46 / (1 + (av / 3.5) ** 2)) * (1 - 0.55 * Math.min(1, this.wheelie / 0.5));
    this.delta = this.steerIn * dMax;
    let omega = (this.v * Math.tan(this.delta)) / this.wb;
    const aLatMax = S.aLat;
    if (av > 0.5 && Math.abs(omega) * av > aLatMax) omega = (Math.sign(omega) * aLatMax) / av;
    if (H && av > 60) { // arcade grip: turn rate falls slowly with speed so 5000 km/h stays steerable
      const wH = smooth01((av - 60) / 60), cap = 0.55 * Math.pow(150 / av, 0.55);
      omega = omega * (1 - wH) + this.steerIn * cap * Math.sign(this.v) * wH;
    }
    this.heading = wrapAngle(this.heading + omega * dt);
    const aLat = this.v * omega;

    // translate
    const sx = Math.sin(this.heading), cz = Math.cos(this.heading);
    this.x += sx * this.v * dt;
    this.z += cz * this.v * dt;

    // collisions
    this.impact = 0;
    if (world) this.collide(world.colliders, dyn);
    if (this.impact > 11 && !(this.fallT > 0)) { // heavy crash: rider goes down
      this.fallT = 1.7; this.fallDir = Math.random() < 0.5 ? 1 : -1; this.fellEvent = true;
      this.v *= 0.2;
    }

    // odometry & battery
    const ds = Math.abs(this.v) * dt;
    this.odo += ds; this.trip += ds;
    const pElec = (Math.max(0, motorA) * M_TOTAL * av + M_TOTAL * (0.12 + S.drag2 * av * av) * av * (this.thr > 0.05 ? 1 : 0.0)) / 0.85 + 22;
    const used = ((pElec * dt) / 3600) * drainScale;
    this.batt = drainScale === 0 ? BATT_WH : Math.max(0, this.batt - used);
    if (ds > 0.001) this.whPerM = lerp(this.whPerM, used / ds, clamp(ds / 150, 0, 1));

    // lean (physical: tan(phi)=a_lat/g) with critically damped-ish spring
    let leanT = clamp(Math.atan2(aLat, G) * 0.8 + 0.1 * this.steerIn * Math.min(1, av / 2), -0.55, 0.55);
    if (this.fallT > 0) leanT = this.fallDir * 1.3;
    else if (this.parked && Math.abs(this.v) < 0.2) leanT = 0.14; // side stand
    const w0 = 11, zeta = 0.8;
    this.leanV += (w0 * w0 * (leanT - this.lean) - 2 * zeta * w0 * this.leanV) * dt;
    this.lean += this.leanV * dt;

    // terrain + suspension
    const hf = this.half;
    const fx = this.x + sx * hf, fz = this.z + cz * hf, rx = this.x - sx * hf, rz = this.z - cz * hf;
    const k = 1 - Math.exp(-dt / 0.035);
    this.hF += (groundHeight(fx, fz) - this.hF) * k;
    this.hR += (groundHeight(rx, rz) - this.hR) * k;
    const wAvg = (this.hF + this.hR) / 2;
    const wVel = (wAvg - this.wAvg) / Math.max(dt, 1e-4);
    const wAcc = clamp((wVel - this.wVel) / Math.max(dt, 1e-4), -150, 150);
    this.wAvg = wAvg; this.wVel = wVel;
    const kS = 190, cS = 9.5;
    this.bobV += (-kS * this.bob - cS * this.bobV - wAcc) * dt;
    this.bob += this.bobV * dt;
    if (this.bob > 0.045) { this.bob = 0.045; this.bobV = Math.min(this.bobV, 0) * -0.2; }
    if (this.bob < -0.06) { this.bob = -0.06; this.bobV = Math.max(this.bobV, 0) * -0.2; }
    // road texture vibration
    const vib = Math.sin(this.odo * 38) * Math.sin(this.odo * 11.3 + 1) * 0.0016 * Math.min(1, av / 8) * (wAvg > 0.01 ? 1.5 : 1);
    // pitch: terrain + weight transfer
    const pitchT = -Math.atan2(this.hF - this.hR, this.wb) - this.aLong * 0.0075;
    this.pitchV += (150 * (pitchT - this.pitch) - 2 * 0.55 * 12.2 * this.pitchV) * dt;
    this.pitch += this.pitchV * dt;
    this.pitch = clamp(this.pitch, -0.3, 0.3);
    this.yOff = wAvg + this.bob + vib;

    this.wheelAng += (this.v * dt) / this.model.wheelR;
    this.shake = damp(this.shake, 0, 6, dt);
    if (this.impact > 2) this.shake = Math.min(1, this.shake + this.impact * 0.06);
    this.applyTransform();
  }

  collide(col, dyn) {
    const sx = Math.sin(this.heading), cz = Math.cos(this.heading);
    const offs = [0.62, 0, -0.62];
    const r = 0.3;
    let worst = 0;
    const respond = (nx, nz, ovx, ovz) => {
      const Vx = sx * this.v - ovx, Vz = cz * this.v - ovz;
      const vn = Vx * nx + Vz * nz;
      if (vn >= 0) return;
      worst = Math.max(worst, -vn);
      const e = 0.12;
      const nVx = Vx - (1 + e) * vn * nx + ovx, nVz = Vz - (1 + e) * vn * nz + ovz;
      const sp = Math.hypot(nVx, nVz);
      if (this.v >= 0) {
        this.v = sp * 0.92 * (nVx * sx + nVz * cz >= 0 ? 1 : -1);
        if (sp > 0.8) {
          const hd = Math.atan2(nVx, nVz);
          this.heading = wrapAngle(this.heading + wrapAngle(hd - this.heading) * 0.4);
        }
      } else this.v *= 0.3;
    };
    for (let it = 0; it < 2; it++) {
      for (const o of offs) {
        const cx = this.x + sx * o, cy = this.z + cz * o;
        let px = 0, pz = 0, nx = 0, nz = 0, best = 0;
        col.near(cx, cy, r + 0.5, (c) => {
          let dx, dz, pen;
          if (c.t === 0) {
            const qx = clamp(cx, c.x0, c.x1), qz = clamp(cy, c.z0, c.z1);
            dx = cx - qx; dz = cy - qz;
            const d = Math.hypot(dx, dz);
            if (d >= r) return;
            if (d < 1e-6) { // centre inside box: push through nearest face
              const l = cx - c.x0, rr = c.x1 - cx, t = cy - c.z0, b = c.z1 - cy;
              const m = Math.min(l, rr, t, b);
              if (m === l) { dx = -1; dz = 0; pen = l + r; }
              else if (m === rr) { dx = 1; dz = 0; pen = rr + r; }
              else if (m === t) { dx = 0; dz = -1; pen = t + r; }
              else { dx = 0; dz = 1; pen = b + r; }
            } else { pen = r - d; dx /= d; dz /= d; }
          } else {
            dx = cx - c.x; dz = cy - c.z;
            const d = Math.hypot(dx, dz);
            const rr = r + c.r;
            if (d >= rr) return;
            pen = rr - d;
            if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
          }
          if (pen > best) { best = pen; px = dx * pen; pz = dz * pen; nx = dx; nz = dz; }
        });
        if (best > 0) { this.x += px; this.z += pz; respond(nx, nz, 0, 0); }
        // moving obstacles (traffic, pedestrians)
        if (dyn) {
          for (const d of dyn) {
            const dx = cx - d.x, dz = cy - d.z;
            if (dx > 4 || dx < -4 || dz > 4 || dz < -4) continue;
            const dist = Math.hypot(dx, dz), rr = r + d.r;
            if (dist >= rr) continue;
            const nx2 = dist < 1e-6 ? 1 : dx / dist, nz2 = dist < 1e-6 ? 0 : dz / dist;
            this.x += nx2 * (rr - dist) * (d.ped ? 0.5 : 1); this.z += nz2 * (rr - dist) * (d.ped ? 0.5 : 1);
            const before = worst;
            respond(nx2, nz2, d.vx, d.vz);
            if (d.ped && worst > before + 0.01 || d.ped && worst > 0.8) this.pedHit = d.ped;
          }
        }
      }
    }
    this.impact = worst;
    if (worst > 2.5 && this.inWheelie) this.wheelieAbort = true;
  }

  applyTransform() {
    const r = this.root;
    r.position.set(this.x, (this.yOff ?? 0), this.z);
    r.rotation.set(0, this.heading, 0);
    const a = this.pitch - this.wheelie; // wheelie rotates the whole bike around the rear tyre contact point
    this.tilt.rotation.set(a, 0, -this.lean);
    const hh = this.half;
    this.tilt.position.set(0, -hh * Math.sin(a), -hh + hh * Math.cos(a));
    this.steer.rotation.y = this.delta * 1.25;
    this.frontWheel.rotation.x = this.wheelAng;
    this.rearWheel.rotation.x = this.wheelAng;
  }

  /* ------------------------------------------------------------ lights + display */
  updateLights(night, headOn, dt, hours) {
    const on = headOn ? 1 : 0;
    this.spot.intensity = on * (night > 0.05 ? 520 : 60) * Math.min(1, night * 1.5 + 0.12);
    this.mHead.emissiveIntensity = on ? 1.6 + night * 3 : 0.15;
    const brake = this.braking ? 1 : 0;
    this.mTail.emissiveIntensity = (on ? 1.2 : 0.4) + brake * 3;
    this.mLed.emissiveIntensity = this.vesc ? 1.6 + night * 2.5 : night * 2.4;
    if (this.vescGlow) this.vescGlow.material.opacity = this.vesc ? 0.35 + night * 0.65 : 0;
    this.hud.dispT += dt;
    if (this.hud.dispT > 0.1) { this.hud.dispT = 0; this.drawDisplay(); }
  }

  drawDisplay() {
    const c = this.dispCtx, W = 256, H = 160;
    c.fillStyle = '#04070b'; c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,200,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const kmh = Math.round(this.kmh);
    c.textAlign = 'center';
    c.fillStyle = this.boosting ? '#ff7a2a' : '#35e6ff';
    c.font = '700 82px "Arial Narrow", Arial, sans-serif';
    c.fillText(String(kmh), 128, 92);
    c.font = '600 20px Arial, sans-serif';
    c.fillStyle = '#9db7c4';
    c.fillText('km/h', 128, 116);
    // battery segments
    const pct = this.battPct;
    for (let i = 0; i < 5; i++) {
      c.fillStyle = pct > i * 20 + 5 ? (pct < 20 ? '#ff4040' : '#42ff8a') : '#1b2a2f';
      c.fillRect(14 + i * 15, 14, 12, 20);
    }
    c.textAlign = 'left'; c.fillStyle = '#c8e4ee'; c.font = '600 20px Arial, sans-serif';
    c.fillText(Math.round(pct) + '%', 94, 31);
    c.textAlign = 'right';
    c.fillStyle = this.boosting ? '#ff7a2a' : '#8fe4ff';
    c.fillText(this.boosting ? 'TURBO' : this.model.dispMode, 244, 31);
    c.fillStyle = '#9db7c4'; c.font = '600 18px Arial, sans-serif'; c.textAlign = 'left';
    c.fillText('TRIP ' + (this.trip / 1000).toFixed(2) + ' km', 14, 148);
    c.textAlign = 'right'; c.fillText(this.modelId === 'g4' ? '52V' : this.modelId === 'dt3' ? '72V' : '84V', 244, 148);
    this.dispTex.needsUpdate = true;
  }
}

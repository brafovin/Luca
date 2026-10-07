import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { clamp, damp, lerp, wrapAngle } from './util.js';
import { groundHeight } from './world.js';

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

function limbMesh(r, mat) {
  const g = new THREE.CylinderGeometry(r, r * 0.88, 1, 10);
  g.translate(0, 0.5, 0);
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

export class Scooter {
  constructor(tex) {
    this.tex = tex;
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    this.buildModel();
    this.reset(0, 0, 0);
    this.hud = { dispT: 0 };
  }

  /* ------------------------------------------------------------ model */
  buildModel() {
    const T = this.tex;
    const mBlack = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.32, metalness: 0.65, envMapIntensity: 1.2 });
    const mMatte = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.7, metalness: 0.25 });
    const mRubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.95, metalness: 0, vertexColors: true });
    const mAlu = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.28, metalness: 0.92 });
    const mRed = new THREE.MeshStandardMaterial({ color: 0xe1352b, roughness: 0.4, metalness: 0.5 });
    const mGripTex = T.grip.clone(); mGripTex.needsUpdate = true; mGripTex.repeat.set(1.5, 6);
    const mDeck = new THREE.MeshStandardMaterial({ map: mGripTex, roughness: 0.9, metalness: 0.1 });
    this.mHead = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xfff2d8, emissiveIntensity: 0.3, roughness: 0.2 });
    this.mTail = new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff1010, emissiveIntensity: 0.5, roughness: 0.3 });
    this.mLed = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff9a2a, emissiveIntensity: 0, roughness: 0.4 });
    const tilt = this.tilt;
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cylX = (r, l, seg = 16) => { const g = new THREE.CylinderGeometry(r, r, l, seg); g.rotateZ(Math.PI / 2); return g; };

    // ---- wheels
    const tireGeo = mergedGeometry((b) => {
      const torus = new THREE.TorusGeometry(0.094, 0.047, 14, 36);
      torus.rotateY(Math.PI / 2);
      b.geo(torus, new THREE.Matrix4(), [0.045, 0.045, 0.048]);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        for (const side of [-1, 1]) {
          const aa = a + (side > 0 ? Math.PI / 40 : 0);
          q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), aa);
          const pos = new THREE.Vector3(side * 0.022, 0.1385, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), aa);
          m4.compose(pos, q, new THREE.Vector3(1, 1, 1));
          const blk = new THREE.BoxGeometry(0.036, 0.014, 0.03);
          b.geo(blk, m4, [0.06, 0.06, 0.065]);
        }
      }
    });
    const makeWheel = () => {
      const w = new THREE.Group();
      add(w, tireGeo, mRubber);
      add(w, cylX(0.066, 0.075), mBlack);
      for (let i = 0; i < 5; i++) {
        const s = add(w, box(0.045, 0.012, 0.125), mBlack);
        s.rotation.x = (i / 5) * Math.PI * 2;
        s.rotation.order = 'XYZ';
      }
      add(w, cylX(0.026, 0.09), mAlu);
      const disc = add(w, cylX(0.07, 0.004, 28), mAlu, 0.042, 0, 0);
      // slotted disc holes
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const h = add(w, cylX(0.011, 0.006, 8), mBlack, 0.042, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
        h.castShadow = false;
      }
      return w;
    };
    const R = 0.138;
    this.rearWheel = makeWheel();
    this.rearWheel.position.set(0, R, -0.58);
    tilt.add(this.rearWheel);

    // ---- deck + battery pod
    const deck = add(tilt, box(0.205, 0.075, 0.74), mBlack, 0, 0.185, -0.04);
    add(tilt, box(0.19, 0.05, 0.66), mMatte, 0, 0.13, -0.04);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.62), mDeck);
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.2255, -0.06); pad.receiveShadow = true;
    tilt.add(pad);
    // side LED strips
    for (const sx of [-1, 1]) add(tilt, box(0.012, 0.014, 0.62), this.mLed, sx * 0.108, 0.178, -0.05);
    // deck nose / neck
    const neck = add(tilt, box(0.12, 0.1, 0.16), mBlack, 0, 0.21, 0.36);
    neck.rotation.x = -0.15;
    // rear swingarm + shock
    for (const sx of [-1, 1]) {
      const arm = add(tilt, box(0.022, 0.05, 0.3), mBlack, sx * 0.075, 0.18, -0.5);
      arm.rotation.x = 0.28;
    }
    const shock = add(tilt, new THREE.CylinderGeometry(0.02, 0.02, 0.2, 10), mRed, 0, 0.27, -0.42);
    shock.rotation.x = 0.85;
    add(tilt, new THREE.CylinderGeometry(0.011, 0.011, 0.22, 8), mAlu, 0, 0.27, -0.42).rotation.x = 0.85;
    // rear fender + tail light
    const mFender = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
    const fenderGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.105, 28, 1, true, Math.PI * 0.3, Math.PI * 0.95);
    fenderGeo.rotateZ(Math.PI / 2);
    add(tilt, fenderGeo, mFender, 0, R, -0.58);
    const tailArm = add(tilt, box(0.09, 0.02, 0.2), mFender, 0, 0.275, -0.69);
    tailArm.rotation.x = 0.12;
    const tail = add(tilt, box(0.11, 0.032, 0.02), this.mTail, 0, 0.27, -0.79);
    tail.castShadow = false;
    add(tilt, box(0.05, 0.026, 0.01), mRed, 0, 0.245, -0.795);
    // rear disc caliper
    add(tilt, box(0.02, 0.05, 0.035), mRed, 0.05, 0.19, -0.5);
    // kickstand
    const stand = add(tilt, box(0.012, 0.012, 0.16), mAlu, -0.12, 0.13, -0.28);
    stand.rotation.z = 0.5;

    // ---- steering assembly
    const pivot = new THREE.Group();
    pivot.position.set(0, R, 0.58);
    pivot.rotation.x = -0.28; // rake (top leans back)
    tilt.add(pivot);
    const steer = new THREE.Group();
    pivot.add(steer);
    this.steer = steer;
    this.frontWheel = makeWheel();
    steer.add(this.frontWheel);
    // fork legs with springs
    for (const sx of [-1, 1]) {
      add(steer, new THREE.CylinderGeometry(0.017, 0.017, 0.33, 10), mAlu, sx * 0.068, 0.2, 0);
      add(steer, new THREE.CylinderGeometry(0.026, 0.026, 0.13, 12), mRed, sx * 0.068, 0.3, 0);
      add(steer, new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), mBlack, sx * 0.068, 0.04, 0);
      const cal = add(steer, box(0.022, 0.055, 0.04), mRed, sx > 0 ? 0.052 : 0, 0.05, 0.06);
      cal.visible = sx > 0;
    }
    add(steer, box(0.2, 0.05, 0.07), mBlack, 0, 0.38, 0); // crown
    // front fender
    const ffGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.105, 28, 1, true, -Math.PI * 0.25, Math.PI * 0.95);
    ffGeo.rotateZ(Math.PI / 2);
    add(steer, ffGeo, mFender, 0, 0, 0);
    // stem
    const stem = add(steer, new THREE.CylinderGeometry(0.026, 0.032, 0.7, 14), mBlack, 0, 0.7, 0);
    stem.scale.set(1.15, 1, 0.9);
    const hinge = add(steer, box(0.09, 0.085, 0.075), mMatte, 0, 0.5, 0);
    add(steer, box(0.014, 0.1, 0.03), mRed, 0.054, 0.5, 0.02);
    add(steer, box(0.1, 0.03, 0.06), mAlu, 0, 0.43, 0);
    // decal on stem sides
    const decalCv = document.createElement('canvas');
    decalCv.width = 256; decalCv.height = 64;
    const dx = decalCv.getContext('2d');
    dx.clearRect(0, 0, 256, 64);
    dx.font = '700 40px Arial, sans-serif'; dx.textAlign = 'center'; dx.textBaseline = 'middle';
    dx.fillStyle = '#ffffff'; dx.fillText('KuKirin', 100, 34);
    dx.fillStyle = '#e1352b'; dx.fillText('G4', 218, 34);
    const decalTex = new THREE.CanvasTexture(decalCv);
    decalTex.colorSpace = THREE.SRGBColorSpace;
    const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, toneMapped: false });
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), decalMat);
      d.position.set(sx * 0.0345, 0.72, 0);
      d.rotation.y = sx * Math.PI / 2;
      d.rotation.z = Math.PI / 2;
      steer.add(d);
    }
    // handlebar
    const bars = add(steer, cylX(0.012, 0.64, 10), mBlack, 0, 1.06, -0.02);
    this.bar = bars;
    add(steer, box(0.1, 0.07, 0.08), mBlack, 0, 1.05, 0); // clamp
    for (const sx of [-1, 1]) {
      add(steer, cylX(0.0175, 0.13, 12), mRubber, sx * 0.265, 1.06, -0.02);
      add(steer, cylX(0.021, 0.02, 12), mRed, sx * 0.19, 1.06, -0.02);
      const lever = add(steer, box(0.012, 0.012, 0.13), mAlu, sx * 0.22, 1.035, 0.07);
      lever.rotation.y = sx * 0.12;
      add(steer, box(0.03, 0.03, 0.04), mMatte, sx * 0.2, 1.055, 0.0);
    }
    add(steer, box(0.04, 0.02, 0.05), mMatte, -0.19, 1.08, -0.02); // thumb throttle
    const bell = add(steer, new THREE.CylinderGeometry(0.018, 0.022, 0.02, 12), mAlu, 0.15, 1.085, -0.02);
    // display
    const disp = new THREE.Group();
    disp.position.set(0, 1.105, 0.0);
    disp.rotation.x = 0.55;
    steer.add(disp);
    add(disp, box(0.115, 0.075, 0.02), mMatte, 0, 0, 0);
    const dcv = document.createElement('canvas');
    dcv.width = 256; dcv.height = 160;
    this.dispCtx = dcv.getContext('2d');
    this.dispTex = new THREE.CanvasTexture(dcv);
    this.dispTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.102, 0.064), new THREE.MeshBasicMaterial({ map: this.dispTex, toneMapped: false }));
    screen.rotation.y = Math.PI;
    screen.position.z = -0.0105;
    disp.add(screen);
    // head light
    const hl = add(steer, box(0.1, 0.05, 0.035), this.mHead, 0, 0.62, 0.043);
    hl.castShadow = false;
    add(steer, box(0.12, 0.012, 0.04), mBlack, 0, 0.652, 0.04);
    this.spot = new THREE.SpotLight(0xfff0d8, 0, 38, 0.5, 0.6, 1.6);
    this.spot.position.set(0, 0.78, 0.46);
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, 0, 13);
    tilt.add(this.spot, this.spotTarget);
    this.spot.target = this.spotTarget;
    // reflector
    add(steer, box(0.03, 0.02, 0.008), mRed, 0.06, 0.55, 0.043);

    // ---- extra detail: cables, collars, deck screws, reflectors, plate
    const mCable = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.6 });
    const tube = (pts, r, parent, mat = mCable) => {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 6, false);
      const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m); return m;
    };
    for (const sx of [-1, 1]) {
      // brake hoses from the levers along the stem to the discs
      tube([[sx * 0.2, 1.04, 0.07], [sx * 0.12, 1.0, 0.06], [sx * 0.045, 0.9, 0.04], [sx * 0.04, 0.6, 0.035], [sx * 0.05, 0.3, 0.05], [sx * 0.05, 0.08, 0.07]], 0.0042, steer);
    }
    tube([[0.0, 0.6, -0.034], [0.01, 0.45, -0.036], [0.02, 0.36, -0.03]], 0.0035, steer);
    // rear brake hose (in body space)
    tube([[0.03, 0.46, 0.34], [0.04, 0.3, 0.26], [0.04, 0.215, 0.1], [0.045, 0.2, -0.3], [0.05, 0.2, -0.46], [0.05, 0.19, -0.52]], 0.0042, tilt);
    // collars on the stem
    for (const y of [0.4, 0.97]) {
      const c = add(steer, new THREE.CylinderGeometry(0.037, 0.037, 0.022, 16), mRed, 0, y, 0); c.scale.set(1.12, 1, 0.9);
    }
    // deck screws + side reflectors + rubber edge
    for (const sx of [-1, 1]) {
      for (const z of [-0.34, -0.12, 0.1, 0.28]) add(tilt, new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 8), mAlu, sx * 0.088, 0.2275, z);
      add(tilt, box(0.006, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff5a00, emissiveIntensity: 0.15, roughness: 0.4 }), sx * 0.1055, 0.19, 0.3);
      add(tilt, box(0.006, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff5a00, emissiveIntensity: 0.15, roughness: 0.4 }), sx * 0.1055, 0.19, -0.36);
      // fender stays
      const stay = add(tilt, box(0.008, 0.14, 0.008), mAlu, sx * 0.065, 0.2, -0.64); stay.rotation.x = -0.5;
    }
    add(tilt, box(0.206, 0.012, 0.74), mAlu, 0, 0.143, -0.04).scale.set(0.96, 1, 1); // aluminium deck base
    // German insurance plate on the rear mudguard
    const plateCv = document.createElement('canvas'); plateCv.width = 128; plateCv.height = 80;
    const px = plateCv.getContext('2d');
    px.fillStyle = '#f4f4f0'; px.fillRect(0, 0, 128, 80);
    px.strokeStyle = '#111'; px.lineWidth = 4; px.strokeRect(3, 3, 122, 74);
    px.fillStyle = '#16a05a'; px.fillRect(6, 6, 116, 14);
    px.fillStyle = '#111'; px.font = '700 40px Arial'; px.textAlign = 'center'; px.fillText('123', 64, 52); px.font = '700 24px Arial'; px.fillText('HQM', 64, 72);
    const plateTex = new THREE.CanvasTexture(plateCv); plateTex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0625), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 }));
    plate.position.set(0, 0.215, -0.745); plate.rotation.set(0.12, Math.PI, 0); tilt.add(plate);
    // front fork lowers: dust boots
    for (const sx of [-1, 1]) add(steer, new THREE.CylinderGeometry(0.024, 0.03, 0.09, 12), mMatte, sx * 0.068, 0.15, 0);
    // bar-end lights + DRL strip on the headlamp
    for (const sx of [-1, 1]) {
      const be = add(steer, new THREE.CylinderGeometry(0.013, 0.013, 0.018, 10), this.mHead, sx * 0.335, 1.06, -0.02); be.rotation.z = Math.PI / 2; be.castShadow = false;
    }
    const drl = add(steer, box(0.11, 0.008, 0.01), this.mHead, 0, 0.665, 0.05); drl.castShadow = false;
    // tyre valve + stem logo plate
    add(this.rearWheel, cylX(0.006, 0.02, 6), mRed, 0.05, 0.115, 0.03);
    add(this.frontWheel, cylX(0.006, 0.02, 6), mRed, 0.05, 0.115, 0.03);

    // ---- rider
    this.buildRider();
  }

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
    torso.scale.set(1.2, 1, 0.78);
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
    const stripe = mk(new THREE.BoxGeometry(0.34, 0.44, 0.2), std({ color: 0xff7a1a, roughness: 0.6 })); // courier backpack
    this.rParts.stripe = stripe;
    const bpLogo = mk(new THREE.BoxGeometry(0.2, 0.05, 0.012), std({ color: 0xffffff, roughness: 0.5 }), stripe);
    bpLogo.position.set(0, 0.08, -0.106);
    const bpRefl = mk(new THREE.BoxGeometry(0.3, 0.025, 0.012), mReflect, stripe);
    bpRefl.position.set(0, -0.12, -0.106);
    const bpFlap = mk(new THREE.BoxGeometry(0.34, 0.1, 0.215), std({ color: 0xd9600f, roughness: 0.65 }), stripe);
    bpFlap.position.set(0, 0.17, 0);
    this.rParts.straps = [];
    for (const sx of [-1, 1]) {
      const strap = mk(new THREE.BoxGeometry(0.035, 0.3, 0.012), mJacketDark);
      this.rParts.straps.push(strap);
      strap.userData.sx = sx;
    }

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
    this.rParts.head = head;
    this.headMeshes = { bal, neck, cheeks, slit, brow, gogg, goggFrame, strap, helmet, peak, hstripe, vents };

    // ---- limbs
    this.legs = [];
    this.arms = [];
    const glove = () => {
      const g = new THREE.Group();
      mk(new THREE.BoxGeometry(0.075, 0.042, 0.09), mGlove, g);
      const f = mk(new THREE.BoxGeometry(0.075, 0.032, 0.05), mGlove, g); f.position.set(0, -0.012, 0.062); f.rotation.x = 0.5;
      const th = mk(new THREE.BoxGeometry(0.025, 0.028, 0.05), mGlove, g); th.position.set(0, 0.026, 0.03);
      const cuff = mk(new THREE.CylinderGeometry(0.046, 0.046, 0.05, 10), mJacketDark, g); cuff.rotation.x = Math.PI / 2; cuff.position.z = -0.06;
      rider.add(g);
      return g;
    };
    const shoe = () => {
      const g = new THREE.Group();
      mk(new THREE.BoxGeometry(0.095, 0.06, 0.26), mShoe, g);
      const so = mk(new THREE.BoxGeometry(0.1, 0.02, 0.27), mSole, g); so.position.y = -0.035;
      const toe = mk(new THREE.SphereGeometry(0.05, 10, 8), mShoe, g); toe.position.set(0, -0.005, 0.12); toe.scale.set(1, 0.8, 1);
      rider.add(g);
      return g;
    };
    for (let i = 0; i < 2; i++) {
      const lo = limbMesh(0.052, mPants);
      const knee = mk(new THREE.SphereGeometry(0.066, 12, 10), mPants);
      this.legs.push({ up: limbMesh(0.074, mPants), lo, knee, foot: shoe() });
      const band = mk(new THREE.CylinderGeometry(0.052 * 1.12, 0.052 * 1.12, 0.1, 10), mReflect, lo);
      band.position.y = 0.5; band.scale.y = 0.4;
      const loA = limbMesh(0.043, mJacket);
      const bandA = mk(new THREE.CylinderGeometry(0.043 * 1.14, 0.043 * 1.14, 0.1, 10), mReflect, loA);
      bandA.position.y = 0.55; bandA.scale.y = 0.4;
      this.arms.push({ up: limbMesh(0.054, mJacket), lo: loA, elbow: mk(new THREE.SphereGeometry(0.052, 12, 10), mJacket), hand: glove(), shoulder: mk(new THREE.SphereGeometry(0.068, 12, 10), mJacket) });
      for (const k of ['up', 'lo']) { rider.add(this.legs[i][k]); rider.add(this.arms[i][k]); }
    }
    // joint positions (tilt space)
    this.hip = [new THREE.Vector3(0.09, 0.84, -0.2), new THREE.Vector3(-0.09, 0.84, -0.2)];
    this.foot = [new THREE.Vector3(0.05, 0.265, 0.06), new THREE.Vector3(-0.05, 0.265, -0.28)];
    this.shoulder = [new THREE.Vector3(0.2, 1.33, -0.03), new THREE.Vector3(-0.2, 1.33, -0.03)];
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.torsoBase = new THREE.Vector3(0, 1.08, -0.1);
    this.headBase = new THREE.Vector3(0, 1.53, 0.05);
    torso.position.copy(this.torsoBase);
    torso.rotation.x = 0.45;
    // torso accessories follow the torso frame
    const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45);
    for (const m of torsoExtra) {
      const off = m.position.clone().applyQuaternion(tq).add(this.torsoBase);
      m.userData.base = off; m.position.copy(off); m.quaternion.multiplyQuaternions(tq, m.quaternion);
    }
    collar.position.copy(this.torsoBase).add(new THREE.Vector3(0, 0.2, 0.06).applyQuaternion(tq));
    collar.rotation.set(Math.PI / 2 + 0.45, 0, 0);
    stripe.position.set(0, 1.16, -0.25); stripe.rotation.x = 0.45;
    this.rParts.straps.forEach((m) => {
      m.position.copy(this.torsoBase).add(new THREE.Vector3(m.userData.sx * 0.085, 0.07, 0.1).applyQuaternion(tq));
      m.rotation.x = 0.45;
    });
    this.rParts.torsoExtra = torsoExtra;
    this.placeHead(0);
  }

  placeHead(sway) {
    const H = this.headMeshes, b = this.headBase, y = b.y + sway;
    H.bal.position.set(b.x, y, b.z);
    H.cheeks.position.set(b.x, y - 0.045, b.z + 0.005);
    H.neck.position.set(b.x, y - 0.1, b.z - 0.015);
    H.slit.position.set(b.x, y + 0.012, b.z + 0.085);
    H.brow.position.set(b.x, y + 0.04, b.z + 0.083);
    H.gogg.position.set(b.x, y + 0.012, b.z + 0.098);
    H.goggFrame.position.set(b.x, y + 0.012, b.z + 0.09);
    H.strap.position.set(b.x, y + 0.012, b.z);
    H.helmet.position.set(b.x, y + 0.012, b.z - 0.012);
    H.peak.position.set(b.x, y + 0.078, b.z + 0.125);
    H.peak.rotation.x = -0.18;
    H.hstripe.position.set(b.x, y + 0.141, b.z);
    H.vents.forEach((v) => v.position.set(b.x + v.userData.sx * 0.05, y + 0.132, b.z + 0.02));
  }

  updateRider(dt, speed) {
    const tilt = this.tilt, steer = this.steer;
    tilt.updateMatrixWorld(true);
    const sway = Math.sin(this.odo * 0.8) * 0.004 * Math.min(1, speed / 4);
    this.placeHead(sway);
    const T = this._tmp || (this._tmp = {
      grips: [new THREE.Vector3(0.265, 1.06, -0.02), new THREE.Vector3(-0.265, 1.06, -0.02)],
      g: new THREE.Vector3(), pole: [new THREE.Vector3(0.45, -0.55, -0.45), new THREE.Vector3(-0.45, -0.55, -0.45)],
      legPole: [new THREE.Vector3(0.15, 0.1, 1), new THREE.Vector3(-0.15, 0.1, 1)], ankle: new THREE.Vector3(),
    });
    for (let i = 0; i < 2; i++) {
      const g = T.g.copy(T.grips[i]);
      steer.localToWorld(g);
      tilt.worldToLocal(g);
      this.arms[i].hand.position.set(g.x, g.y + 0.012, g.z - 0.02);
      this.arms[i].hand.rotation.set(0.05, 0, 0);
      this.arms[i].shoulder.position.copy(this.shoulder[i]);
      ik2(this.shoulder[i], g, 0.3, 0.3, T.pole[i], this._v[0]);
      setSegment(this.arms[i].up, this.shoulder[i], this._v[0]);
      setSegment(this.arms[i].lo, this._v[0], g);
      this.arms[i].elbow.position.copy(this._v[0]);
      const ft = this.foot[i];
      T.ankle.set(ft.x, ft.y + 0.05, ft.z - 0.04);
      ik2(this.hip[i], T.ankle, 0.42, 0.42, T.legPole[i], this._v[1]);
      setSegment(this.legs[i].up, this.hip[i], this._v[1]);
      setSegment(this.legs[i].lo, this._v[1], T.ankle);
      this.legs[i].knee.position.copy(this._v[1]);
      this.legs[i].foot.position.set(ft.x, ft.y, ft.z + 0.06);
    }
  }

  setView(first) {
    this.firstPerson = first;
    const show = !first;
    this.rParts.torso.visible = show; this.rParts.stripe.visible = show;
    this.rParts.head.forEach((p) => (p.visible = show));
    this.rParts.torsoExtra.forEach((p) => (p.visible = show));
    this.rParts.straps.forEach((p) => (p.visible = show));
    for (const l of this.legs) for (const k in l) l[k].visible = show;
    for (const a of this.arms) { a.up.visible = show; a.elbow.visible = show; a.lo.visible = show; a.shoulder.visible = show; }
  }

  /* ------------------------------------------------------------ state */
  reset(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.v = 0; this.thr = 0; this.brk = 0;
    this.steerIn = 0; this.delta = 0;
    this.lean = 0; this.leanV = 0;
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
    const vmax = empty ? 3.2 : boost ? 28.6 : 18.0;
    const aMax = empty ? 0.7 : boost ? 5.2 : 2.6;
    const vKnee = boost ? 11 : 6.0;

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
    const drag = (0.12 + 0.0009 * v * v) * sgn;
    a -= drag;
    if (this.thr < 0.05 && Math.abs(v) > 0.3 && !this.brk) a -= 0.35 * sgn; // motor regen
    // brakes
    const brakeA = Math.min(7.6, this.brk * 4.6 + this.space * 6.8) * Math.min(1, Math.abs(v) / 0.6);
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
    const analog = inp.steer !== undefined && inp.steer !== null;
    const target = analog ? inp.steer : (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    const rate = analog ? 11 : target === 0 ? 8 : 5.5;
    this.steerIn = damp(this.steerIn, target, rate, dt);
    const av = Math.abs(this.v);
    const dMax = 0.14 + 0.46 / (1 + (av / 3.5) ** 2);
    this.delta = this.steerIn * dMax;
    let omega = (this.v * Math.tan(this.delta)) / WHEELBASE;
    const aLatMax = 8.5;
    if (av > 0.5 && Math.abs(omega) * av > aLatMax) omega = (Math.sign(omega) * aLatMax) / av;
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
    const pElec = (Math.max(0, motorA) * M_TOTAL * av + M_TOTAL * (0.12 + 0.0009 * av * av) * av * (this.thr > 0.05 ? 1 : 0.0)) / 0.85 + 22;
    const used = ((pElec * dt) / 3600) * drainScale;
    this.batt = Math.max(0, this.batt - used);
    if (ds > 0.001) this.whPerM = lerp(this.whPerM, used / ds, clamp(ds / 150, 0, 1));

    // lean (physical: tan(phi)=a_lat/g) with critically damped-ish spring
    let leanT = clamp(Math.atan2(aLat, G) * 0.8 + 0.1 * this.steerIn * Math.min(1, av / 2), -0.55, 0.55);
    if (this.fallT > 0) leanT = this.fallDir * 1.3;
    const w0 = 11, zeta = 0.8;
    this.leanV += (w0 * w0 * (leanT - this.lean) - 2 * zeta * w0 * this.leanV) * dt;
    this.lean += this.leanV * dt;

    // terrain + suspension
    const fx = this.x + sx * 0.58, fz = this.z + cz * 0.58, rx = this.x - sx * 0.58, rz = this.z - cz * 0.58;
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
    const pitchT = -Math.atan2(this.hF - this.hR, WHEELBASE) - this.aLong * 0.0075;
    this.pitchV += (150 * (pitchT - this.pitch) - 2 * 0.55 * 12.2 * this.pitchV) * dt;
    this.pitch += this.pitchV * dt;
    this.pitch = clamp(this.pitch, -0.3, 0.3);
    this.yOff = wAvg + this.bob + vib;

    this.wheelAng += (this.v * dt) / 0.138;
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
  }

  applyTransform() {
    const r = this.root;
    r.position.set(this.x, (this.yOff ?? 0), this.z);
    r.rotation.set(0, this.heading, 0);
    this.tilt.rotation.set(this.pitch, 0, -this.lean);
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
    this.mLed.emissiveIntensity = night * 2.4;
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
    c.fillText(this.boosting ? 'TURBO' : 'D3', 244, 31);
    c.fillStyle = '#9db7c4'; c.font = '600 18px Arial, sans-serif'; c.textAlign = 'left';
    c.fillText('TRIP ' + (this.trip / 1000).toFixed(2) + ' km', 14, 148);
    c.textAlign = 'right'; c.fillText('52V', 244, 148);
    this.dispTex.needsUpdate = true;
  }
}

import * as THREE from 'three';
import { groundHeight } from './world.js';
import { pushOut } from './phys.js';
import { clamp, damp, wrapAngle } from './util.js';

const matCache = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }); matCache.set(k, m); }
  return m;
}

/** Articulated pedestrian figure (balaclava + goggles + helmet + courier backpack). */
export class WalkerModel {
  constructor(o = {}) {
    const jacket = o.jacket || 0x56606b, pants = o.pants || 0x191b21, helmetCol = o.helmet || 0xf2f2f0, pack = o.pack === undefined ? null : o.pack;
    this.group = new THREE.Group();
    const g = this.group;
    g.scale.setScalar(1.15); // a bit bigger than before
    const mk = (geo, m, parent = g) => { const me = new THREE.Mesh(geo, m); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
    this.parts = [];
    // legs (pivot at hip)
    this.legs = [];
    for (const sx of [1, -1]) {
      const piv = new THREE.Group(); piv.position.set(sx * 0.09, 0.9, 0); g.add(piv);
      const leg = mk(new THREE.CapsuleGeometry(0.088, 0.64, 4, 10), mat(pants), piv); leg.position.y = -0.42;
      const knee = mk(new THREE.SphereGeometry(0.08, 8, 6), mat(0x2a2a30), piv); knee.position.set(0, -0.4, 0.04); knee.scale.set(1, 0.7, 0.5);
      const shoe = mk(new THREE.BoxGeometry(0.1, 0.07, 0.26), mat(0xe9e9e9), piv); shoe.position.set(0, -0.86, 0.06);
      const sole = mk(new THREE.BoxGeometry(0.105, 0.025, 0.27), mat(0x2a2a2d), piv); sole.position.set(0, -0.9, 0.06);
      this.legs.push(piv);
    }
    // torso
    this.torso = new THREE.Group(); this.torso.position.set(0, 0.9, 0); g.add(this.torso);
    const body = mk(new THREE.CapsuleGeometry(0.135, 0.3, 4, 12), mat(jacket), this.torso); body.position.y = 0.27; body.scale.set(1.25, 1, 0.82);
    const stripe = mk(new THREE.BoxGeometry(0.33, 0.022, 0.22), mat(0xdfe5e8, { metalness: 0.3, roughness: 0.4 }), this.torso); stripe.position.y = 0.22;
    const belt = mk(new THREE.BoxGeometry(0.32, 0.04, 0.22), mat(0x2c3138), this.torso); belt.position.y = 0.05;
    if (pack !== null) {
      const bp = mk(new THREE.BoxGeometry(0.34, 0.44, 0.2), mat(pack, { roughness: 0.6 }), this.torso); bp.position.set(0, 0.3, -0.19);
      const bpl = mk(new THREE.BoxGeometry(0.2, 0.05, 0.012), mat(0xffffff), this.torso); bpl.position.set(0, 0.38, -0.296);
      const bpr = mk(new THREE.BoxGeometry(0.3, 0.025, 0.012), mat(0xdfe5e8), this.torso); bpr.position.set(0, 0.18, -0.296);
    }
    // head
    this.head = new THREE.Group(); this.head.position.set(0, 0.64, 0.02); this.torso.add(this.head);
    const bal = mat(0x0c0c0e, { roughness: 0.97 });
    const bh = mk(new THREE.SphereGeometry(0.1, 16, 12), bal, this.head); bh.position.y = 0.17; bh.scale.set(1, 1.1, 1.06);
    const neck = mk(new THREE.CylinderGeometry(0.05, 0.068, 0.13, 10), bal, this.head); neck.position.y = 0.04;
    const cheeks = mk(new THREE.SphereGeometry(0.09, 10, 8), bal, this.head); cheeks.position.set(0, 0.12, 0.005); cheeks.scale.set(1, 0.8, 0.95);
    const slit = mk(new THREE.BoxGeometry(0.118, 0.034, 0.03), mat(0xc89878), this.head); slit.position.set(0, 0.185, 0.085);
    const lens = mk(new THREE.BoxGeometry(0.16, 0.06, 0.044), mat(o.lens || 0xff8a2a, { roughness: 0.06, metalness: 0.95 }), this.head); lens.position.set(0, 0.275, 0.112); lens.rotation.x = -0.75;
    const frame = mk(new THREE.BoxGeometry(0.172, 0.07, 0.036), mat(0x2c3138), this.head); frame.position.set(0, 0.273, 0.104); frame.rotation.x = -0.75;
    for (const sx of [-1, 1]) { // eyes + brows + nose
      mk(new THREE.BoxGeometry(0.036, 0.022, 0.01), mat(0xf4f4f2), this.head).position.set(sx * 0.037, 0.19, 0.1015);
      mk(new THREE.BoxGeometry(0.017, 0.018, 0.008), mat(0x3a6a8a), this.head).position.set(sx * 0.039, 0.19, 0.1065);
      mk(new THREE.BoxGeometry(0.008, 0.01, 0.004), mat(0x050505), this.head).position.set(sx * 0.039, 0.19, 0.1108);
      const br = mk(new THREE.BoxGeometry(0.05, 0.009, 0.012), mat(0x2a1d14), this.head); br.position.set(sx * 0.038, 0.215, 0.1); br.rotation.z = sx * -0.12;
    }
    mk(new THREE.SphereGeometry(0.02, 8, 6), bal, this.head).position.set(0, 0.16, 0.1);
    const helmet = mk(new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.43), mat(helmetCol, { roughness: 0.22, metalness: 0.25 }), this.head); helmet.position.set(0, 0.19, -0.01); helmet.scale.set(1, 1.04, 1.12);
    const peak = mk(new THREE.BoxGeometry(0.16, 0.012, 0.07), mat(helmetCol, { roughness: 0.22 }), this.head); peak.position.set(0, 0.255, 0.125); peak.rotation.x = -0.18;
    // arms (pivot at shoulder)
    this.arms = [];
    for (const sx of [1, -1]) {
      const piv = new THREE.Group(); piv.position.set(sx * 0.21, 0.5, 0); this.torso.add(piv);
      mk(new THREE.SphereGeometry(0.066, 8, 6), mat(jacket), piv);
      const arm = mk(new THREE.CapsuleGeometry(0.05, 0.46, 4, 8), mat(jacket), piv); arm.position.y = -0.3;
      const band = mk(new THREE.CylinderGeometry(0.057, 0.057, 0.04, 10), mat(0xdfe5e8, { metalness: 0.3 }), piv); band.position.y = -0.34;
      const gl = mat(0x141517), gk = mat(0xff7a1a);
      const hg = new THREE.Group(); hg.position.set(0, -0.6, 0.01); piv.add(hg);
      const palm = mk(new THREE.BoxGeometry(0.08, 0.075, 0.034), mat(0x3a2f28), hg); palm.position.y = -0.03;
      const back = mk(new THREE.BoxGeometry(0.082, 0.07, 0.016), mat(0x2b2d33), hg); back.position.set(0, -0.03, -0.022);
      const kn = mk(new THREE.BoxGeometry(0.075, 0.012, 0.014), mat(0x1b1c20), hg); kn.position.set(0, -0.062, -0.025);
      const ks = mk(new THREE.BoxGeometry(0.075, 0.004, 0.006), gk, hg); ks.position.set(0, -0.062, -0.034);
      for (let f = 0; f < 4; f++) {
        const fl = [1, 1.1, 1.06, 0.88][f];
        const fg = new THREE.Group(); fg.position.set((f - 1.5) * 0.02, -0.07, 0); fg.rotation.x = -0.25; hg.add(fg);
        const s1 = mk(new THREE.CapsuleGeometry(0.0095, 0.03 * fl, 3, 6), gl, fg); s1.position.y = -0.026 * fl;
        const fg2 = new THREE.Group(); fg2.position.y = -0.05 * fl; fg2.rotation.x = -0.5; fg.add(fg2);
        const s2 = mk(new THREE.CapsuleGeometry(0.009, 0.022 * fl, 3, 6), gl, fg2); s2.position.y = -0.02 * fl;
      }
      const tg = new THREE.Group(); tg.position.set(-sx * 0.045, -0.035, 0.012); tg.rotation.set(0.3, 0, sx * 0.55); hg.add(tg);
      const t1 = mk(new THREE.CapsuleGeometry(0.0105, 0.03, 3, 6), gl, tg); t1.position.y = -0.02;
      this.arms.push(piv);
    }
    this.phase = 0;
  }
  /** pose: phase (rad), amp 0..1, run (bool) */
  pose(phase, amp, run, lean = 0, wave = 0, box = null) {
    const sw = Math.sin(phase) * (run ? 0.95 : 0.6) * amp;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw * (run ? 1.1 : 0.8); this.arms[1].rotation.x = sw * (run ? 1.1 : 0.8);
    if (run) { this.arms[0].rotation.z = -0.1; this.arms[1].rotation.z = 0.1; } else { this.arms[0].rotation.z = -0.05; this.arms[1].rotation.z = 0.05; }
    this.torso.rotation.x = (run ? 0.22 : 0.05) * amp + lean;
    this.torso.position.y = 0.9 + Math.abs(Math.cos(phase)) * 0.025 * amp;
    this.head.rotation.x = -0.05;
    if (wave > 0) { this.arms[1].rotation.x = -2.6 + Math.sin(phase * 3) * 0.3 * wave; }
    if (box) { // boxing stance: guard up, bobbing, twist into the punch
      const g = box.guard, bob = Math.sin(box.t * 7) * 0.025 * g;
      for (const [i, sx] of [[0, 1], [1, -1]]) {
        const p = box.side === i ? box.p : 0; // 0..1..0 extension of the punching arm
        this.arms[i].rotation.x = -1.2 * g - 0.35 * (1 - g) * 0 - 1.1 * p + (1 - g) * this.arms[i].rotation.x;
        this.arms[i].rotation.z = sx * (0.35 * g * (1 - p));
        this.arms[i].rotation.y = -sx * 0.5 * g * (1 - p) + sx * 0.15 * p;
      }
      this.torso.rotation.x = 0.18 * g + lean + (this.torso.rotation.x) * (1 - g);
      this.torso.rotation.y = (box.side === 0 ? -1 : 1) * 0.5 * box.p * g;
      this.torso.position.y = 0.9 - 0.03 * g + bob;
      this.legs[0].rotation.x = 0.35 * g + (1 - g) * this.legs[0].rotation.x; this.legs[1].rotation.x = -0.3 * g + (1 - g) * this.legs[1].rotation.x;
      this.head.rotation.x = -0.18 * g;
    } else this.torso.rotation.y = 0;
  }
}

/** Local on-foot controller. */
export class Walker {
  constructor(scene, opts) {
    this.model = new WalkerModel(opts);
    this.model.group.visible = false;
    scene.add(this.model.group);
    this.x = 0; this.z = 0; this.yaw = 0; this.speed = 0; this.vx = 0; this.vz = 0; this.y = 0; this.phase = 0; this.stun = 0; this.running = false;
    this.punchT = 1; this.punchSide = 0; this.punchCool = 0; this.guardT = 0; this.punchEvent = null; this.punched = true; this.boxT = 0;
  }
  place(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; this.speed = 0; this.vx = this.vz = 0; this.y = groundHeight(x, z); this.stun = 0; }
  update(dt, inp, col, dyn) {
    if (this.stun > 0) { this.stun -= dt; inp = {}; }
    // ---- boxing
    this.boxT += dt;
    if (this.punchCool > 0) this.punchCool -= dt;
    if (inp.punch && this.punchCool <= 0 && this.punchT >= 1) { this.punchT = 0; this.punchSide ^= 1; this.punchCool = 0.36; this.punched = false; this.guardT = 1.6; }
    if (this.punchT < 1) {
      this.punchT = Math.min(1, this.punchT + dt / 0.3);
      if (!this.punched && this.punchT >= 0.4) { this.punched = true; this.punchEvent = { x: this.x, z: this.z, yaw: this.yaw, side: this.punchSide }; }
    }
    if (this.guardT > 0) this.guardT -= dt;
    // turning (arrow keys / mouse handled outside via yaw)
    this.yaw = wrapAngle(this.yaw + ((inp.turnL ? 1 : 0) - (inp.turnR ? 1 : 0)) * 2.1 * dt + (inp.yawDelta || 0));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    let mx = 0, mz = 0;
    if (inp.fwd) { mx += fx; mz += fz; }
    if (inp.back) { mx -= fx * 0.6; mz -= fz * 0.6; }
    if (inp.strafeR) { mx += rx; mz += rz; }
    if (inp.strafeL) { mx -= rx; mz -= rz; }
    const l = Math.hypot(mx, mz);
    const run = !!inp.sprint && l > 0;
    const target = l > 0 ? (run ? 5.4 : 1.9) : 0;
    this.running = run;
    const k = l > 0 ? 7 : 10;
    this.vx = damp(this.vx, l > 0 ? (mx / l) * target * Math.min(1, l) : 0, k, dt);
    this.vz = damp(this.vz, l > 0 ? (mz / l) * target * Math.min(1, l) : 0, k, dt);
    this.speed = Math.hypot(this.vx, this.vz);
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (col) { const r = pushOut(nx, nz, 0.3, col, dyn); nx = r.x; nz = r.z; }
    this.x = nx; this.z = nz;
    const gy = groundHeight(this.x, this.z);
    this.y += (gy - this.y) * Math.min(1, dt * 14);
    if (this.speed > 0.15) this.phase += dt * this.speed * (run ? 2.0 : 3.6);
    this.apply();
  }
  apply() {
    const g = this.model.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.y = this.yaw;
    const amp = clamp(this.speed / 1.6, 0, 1);
    const gd = Math.min(1, this.guardT * 3);
    const ext = this.punchT < 1 ? Math.sin(Math.PI * Math.min(1, this.punchT * 1.1)) : 0;
    this.punchExt = ext; this.guardAmt = gd;
    this.model.pose(this.phase, amp, this.running, this.stun > 0 ? 0.5 : 0, 0, gd > 0.01 ? { guard: gd, p: ext, side: this.punchSide, t: this.boxT } : null);
  }
  setVisible(v) { this.model.group.visible = v; }
}

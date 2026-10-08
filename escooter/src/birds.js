import * as THREE from 'three';

/** A few flocks of birds circling over the city (instanced bodies + flapping wings). */
export class Birds {
  constructor(scene, n = 16) {
    this.n = n;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.9, side: THREE.DoubleSide });
    const body = new THREE.SphereGeometry(0.16, 8, 6); body.scale(0.8, 0.75, 1.9);
    const head = new THREE.SphereGeometry(0.09, 6, 5); head.translate(0, 0.03, 0.3);
    const tail = new THREE.BoxGeometry(0.14, 0.015, 0.26); tail.translate(0, 0, -0.38);
    const bodyGeo = mergeSimple([body, head, tail]);
    const wing = new THREE.PlaneGeometry(0.62, 0.3, 1, 1); wing.rotateX(-Math.PI / 2); wing.translate(0.31, 0, 0); // right wing, hinge at x=0
    this.body = new THREE.InstancedMesh(bodyGeo, mat, n);
    this.wingR = new THREE.InstancedMesh(wing, mat, n);
    this.wingL = new THREE.InstancedMesh(wing, mat, n);
    for (const m of [this.body, this.wingR, this.wingL]) { m.frustumCulled = false; m.castShadow = false; scene.add(m); }
    this.b = [];
    for (let i = 0; i < n; i++) {
      const flock = i % 3;
      this.b.push({ flock, ph: Math.random() * 6.28, r: 40 + Math.random() * 70 + flock * 25, h: 26 + Math.random() * 28 + flock * 6, sp: (0.07 + Math.random() * 0.05) * (flock % 2 ? -1 : 1), a: Math.random() * 6.28, flap: 7 + Math.random() * 3, off: Math.random() * 6.28 });
    }
    this.cx = 0; this.cz = 0; this.t = 0; this.visible = true;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1.9, 1.9, 1.9); this._e = new THREE.Euler();
  }
  update(dt, px, pz, hide) {
    const show = !hide;
    if (show !== this.visible) { this.visible = show; for (const m of [this.body, this.wingR, this.wingL]) m.visible = show; }
    if (!show) return;
    this.t += dt;
    const k = 1 - Math.exp(-dt * 0.3);
    this.cx += (px - this.cx) * k; this.cz += (pz - this.cz) * k;
    const { _m, _q, _p, _s, _e } = this;
    for (let i = 0; i < this.n; i++) {
      const b = this.b[i];
      b.a += b.sp * dt;
      const a = b.a, r = b.r + Math.sin(this.t * 0.2 + b.off) * 8;
      const x = this.cx + Math.cos(a) * r, z = this.cz + Math.sin(a) * r;
      const y = b.h + Math.sin(this.t * 0.5 + b.off) * 2.5;
      const dir = b.sp > 0 ? 1 : -1;
      const bank = -0.35 * dir;
      _e.set(0, headingOf(a, dir), bank * 0.5, 'YXZ'); _q.setFromEuler(_e);
      _p.set(x, y, z);
      _m.compose(_p, _q, _s); this.body.setMatrixAt(i, _m);
      const flapA = Math.sin(this.t * b.flap + b.ph) * 0.7 + (Math.sin(this.t * 0.4 + b.off) > 0.6 ? 0.5 : 0); // occasional glide
      for (const [mesh, sgn] of [[this.wingR, 1], [this.wingL, -1]]) {
        const qw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sgn * flapA);
        const q2 = _q.clone().multiply(qw);
        const sc = new THREE.Vector3(sgn * 1.9, 1.9, 1.9);
        _m.compose(_p, q2, sc); mesh.setMatrixAt(i, _m);
      }
    }
    this.body.instanceMatrix.needsUpdate = true; this.wingR.instanceMatrix.needsUpdate = true; this.wingL.instanceMatrix.needsUpdate = true;
  }
}
function headingOf(a, dir) { // yaw so that local +z points along the orbit tangent
  const tx = -Math.sin(a) * dir, tz = Math.cos(a) * dir;
  return Math.atan2(tx, tz);
}
function mergeSimple(geos) {
  const pos = [], nor = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  m.setIndex(idx);
  return m;
}

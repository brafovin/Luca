import * as THREE from 'three';

/** Stylised blood: spray particles + flat pools on the ground (can be switched off in the menu). */
export class Blood {
  constructor(scene, nParticles = 220, nPools = 40) {
    this.enabled = true;
    this.pm = new THREE.MeshBasicMaterial({ color: 0xa30d12, toneMapped: false });
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), this.pm, nParticles);
    this.parts.frustumCulled = false; scene.add(this.parts);
    this.P = Array.from({ length: nParticles }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
    const g = new THREE.CircleGeometry(1, 14); g.rotateX(-Math.PI / 2);
    this.dm = new THREE.MeshStandardMaterial({ color: 0x5c0608, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, transparent: true, opacity: 0.92, depthWrite: false });
    this.decals = new THREE.InstancedMesh(g, this.dm, nPools);
    this.decals.frustumCulled = false; scene.add(this.decals);
    this.D = Array.from({ length: nPools }, () => ({ on: false, x: 0, z: 0, r: 0, rt: 0, grow: 0, age: 0, sx: 1, sz: 1, rot: 0 }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < nParticles; i++) this.parts.setMatrixAt(i, this._z);
    for (let i = 0; i < nPools; i++) this.decals.setMatrixAt(i, this._z);
    this.next = 0; this.nextD = 0;
  }
  setEnabled(on) { this.enabled = on; this.parts.visible = on; this.decals.visible = on; }
  splash(x, y, z, dx, dz, n = 14) {
    if (!this.enabled) return;
    for (let k = 0; k < n; k++) {
      const p = this.P[this.next++ % this.P.length];
      const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.6, sp = 1.5 + Math.random() * 3.2;
      p.life = 0.9 + Math.random() * 0.6; p.x = x; p.y = y + (Math.random() - 0.5) * 0.2; p.z = z;
      p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; p.vy = 1.2 + Math.random() * 2.2; p.s = 0.6 + Math.random() * 1.1;
    }
    this.drop(x + dx * 0.4, z + dz * 0.4, 0.14 + Math.random() * 0.1);
  }
  /** a persistent puddle; returns its id so it can keep growing */
  pool(x, z, radius) {
    if (!this.enabled) return -1;
    const id = this.nextD++ % this.D.length, d = this.D[id];
    Object.assign(d, { on: true, x, z, r: 0.1, rt: radius, grow: 0.35, age: 0, sx: 1 + Math.random() * 0.3, sz: 0.8 + Math.random() * 0.3, rot: Math.random() * 6.28 });
    return id;
  }
  drop(x, z, r) { const id = this.pool(x, z, r); if (id >= 0) { this.D[id].r = r; this.D[id].rt = r; } }
  update(dt, groundY = 0.03) {
    if (!this.enabled) return;
    const { _m, _q, _s, _p } = this;
    for (let i = 0; i < this.P.length; i++) {
      const p = this.P[i];
      if (p.life <= 0) continue;
      p.life -= dt; p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < groundY) { p.y = groundY; p.vx = p.vz = p.vy = 0; if (p.life > 0.15) { p.life = 0.15; this.drop(p.x, p.z, 0.05 + Math.random() * 0.05); } }
      if (p.life <= 0) this.parts.setMatrixAt(i, this._z);
      else { _p.set(p.x, p.y, p.z); _s.setScalar(p.s * Math.min(1, p.life * 3)); _m.compose(_p, _q.identity(), _s); this.parts.setMatrixAt(i, _m); }
    }
    this.parts.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.D.length; i++) {
      const d = this.D[i];
      if (!d.on) continue;
      d.age += dt;
      if (d.r < d.rt) d.r = Math.min(d.rt, d.r + d.grow * dt);
      if (d.age > 90) { d.on = false; this.decals.setMatrixAt(i, this._z); continue; }
      _p.set(d.x, groundY + 0.004 * (i % 5), d.z); _q.setFromAxisAngle(_s.set(0, 1, 0), d.rot); _s.set(d.r * d.sx, 1, d.r * d.sz);
      _m.compose(_p, _q, _s); this.decals.setMatrixAt(i, _m);
    }
    this.decals.instanceMatrix.needsUpdate = true;
  }
}

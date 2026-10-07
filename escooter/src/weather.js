import * as THREE from 'three';

/** Streak-based rain that follows the camera. */
export class Rain {
  constructor(scene, count = 3200) {
    this.count = count;
    this.box = new THREE.Vector3(70, 36, 70);
    this.p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.p[i * 3] = (Math.random() - 0.5) * this.box.x;
      this.p[i * 3 + 1] = Math.random() * this.box.y;
      this.p[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
    }
    this.pos = new Float32Array(count * 6);
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.LineBasicMaterial({ color: 0xc6d9f2, transparent: true, opacity: 0.38, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  update(dt, camera, amount, vx = 0, vz = 0) {
    this.mesh.visible = amount > 0.02;
    if (!this.mesh.visible) return;
    const n = Math.floor(this.count * amount);
    this.mesh.geometry.setDrawRange(0, n * 2);
    const { p, pos, box } = this;
    const cx = camera.position.x, cy = camera.position.y - 14, cz = camera.position.z;
    const fall = 22 * dt;
    for (let i = 0; i < n; i++) {
      let x = p[i * 3], y = p[i * 3 + 1] - fall, z = p[i * 3 + 2];
      x -= vx * dt * 0.3; z -= vz * dt * 0.3;
      if (y < 0) { y += box.y; x = (Math.random() - 0.5) * box.x; z = (Math.random() - 0.5) * box.z; }
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      pos[i * 6] = cx + x; pos[i * 6 + 1] = cy + y; pos[i * 6 + 2] = cz + z;
      pos[i * 6 + 3] = cx + x + 0.04; pos[i * 6 + 4] = cy + y + 0.75; pos[i * 6 + 5] = cz + z + 0.02;
    }
    this.attr.needsUpdate = true;
    this.mat.opacity = 0.18 + 0.22 * amount;
  }
}

import * as THREE from 'three';

/** Drifting life around the player: falling leaves + pollen by day, fireflies at night. */
export class Ambient {
  constructor(scene) {
    const N = 220;
    this.N = N;
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(16, 2); x.quadraticCurveTo(30, 12, 16, 30); x.quadraticCurveTo(2, 12, 16, 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(16, 4); x.lineTo(16, 28); x.stroke();
    const leafTex = new THREE.CanvasTexture(cv);
    const cg = document.createElement('canvas'); cg.width = cg.height = 32;
    const g = cg.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const glowTex = new THREE.CanvasTexture(cg);
    this.mk = (tex, size, additive) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const m = new THREE.PointsMaterial({ map: tex, size, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, alphaTest: additive ? 0 : 0.25, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const p = new THREE.Points(geo, m); p.frustumCulled = false; p.renderOrder = 4; scene.add(p);
      return p;
    };
    this.leaves = this.mk(leafTex, 0.17, false);
    this.motes = this.mk(glowTex, 0.2, true);
    this.items = [];
    for (let i = 0; i < N; i++) this.items.push({ x: 0, y: 0, z: 0, vx: 0, vz: 0, ph: Math.random() * 6, life: 0, init: false });
    this.t = 0;
  }
  update(dt, cam, night, wind, rain) {
    this.t += dt;
    const R = 26, lp = this.leaves.geometry.attributes, mp = this.motes.geometry.attributes;
    const day = 1 - night, c = new THREE.Color();
    const leafCols = ['#c9892b', '#b8a030', '#a8602a', '#7a9a34', '#d2a62e', '#8e5a2a'];
    for (let i = 0; i < this.N; i++) {
      const it = this.items[i];
      const far = Math.abs(it.x - cam.x) > R || Math.abs(it.z - cam.z) > R || it.y < 0.05 || it.y > 14;
      if (!it.init || far) {
        it.init = true; it.x = cam.x + (Math.random() * 2 - 1) * R; it.z = cam.z + (Math.random() * 2 - 1) * R;
        it.y = i % 3 === 0 ? 4 + Math.random() * 7 : 0.3 + Math.random() * 5; it.ph = Math.random() * 6; it.col = leafCols[Math.floor(Math.random() * leafCols.length)];
      }
      const kind = i % 4 === 0 ? 0 : 1; // 0 leaf, 1 mote/firefly
      if (kind === 0) {
        it.y -= (0.35 + 0.15 * Math.sin(it.ph)) * dt;
        it.x += (wind * 0.8 + Math.sin(this.t * 1.3 + it.ph) * 0.5) * dt; it.z += (Math.cos(this.t * 1.1 + it.ph) * 0.45 + wind * 0.3) * dt;
        lp.position.setXYZ(i, it.x, it.y, it.z); c.set(it.col); const vis = day * (rain ? 0 : 1);
        lp.color.setXYZ(i, c.r * vis, c.g * vis, c.b * vis); mp.position.setXYZ(i, 0, -999, 0);
      } else {
        it.x += (Math.sin(this.t * 0.6 + it.ph) * 0.25 + wind * 0.3) * dt; it.z += Math.cos(this.t * 0.5 + it.ph * 1.3) * 0.25 * dt; it.y += Math.sin(this.t * 0.8 + it.ph) * 0.12 * dt;
        mp.position.setXYZ(i, it.x, it.y, it.z);
        if (night > 0.5) { const b = Math.max(0, Math.sin(this.t * 2.2 + it.ph * 3)) * (night - 0.4); mp.color.setXYZ(i, 0.7 * b, 1.0 * b, 0.25 * b); }
        else { const b = 0.22 * day * (rain ? 0 : 1); mp.color.setXYZ(i, b, b * 0.97, b * 0.8); }
        lp.position.setXYZ(i, 0, -999, 0);
      }
    }
    lp.position.needsUpdate = lp.color.needsUpdate = mp.position.needsUpdate = mp.color.needsUpdate = true;
  }
}

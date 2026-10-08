import * as THREE from 'three';

/** Soft smoke puffs (exhaust, cigarette) as a pool of billboard sprites. */
export class Smoke {
  constructor(scene, n = 90) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.P = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: 0xb4b8bc, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const s = new THREE.Sprite(m); s.visible = false; scene.add(s);
      this.P.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, r0: 0.1, r1: 0.5, a: 0.5 });
    }
    this.i = 0;
  }
  /** kind: 'exhaust' (blue-grey, thick) | 'cig' (thin, light) */
  emit(x, y, z, vx, vy, vz, kind = 'exhaust', amount = 1) {
    const p = this.P[this.i++ % this.P.length];
    const cig = kind === 'cig';
    p.life = p.max = cig ? 1.8 + Math.random() * 1.4 : 0.9 + Math.random() * 0.8 + amount * 0.4;
    p.vx = vx + (Math.random() - 0.5) * (cig ? 0.15 : 0.5); p.vy = vy + (cig ? 0.25 : 0.2) * Math.random(); p.vz = vz + (Math.random() - 0.5) * (cig ? 0.15 : 0.5);
    p.r0 = cig ? 0.035 : 0.12; p.r1 = cig ? (0.25 + Math.random() * 0.15) * (amount > 1 ? 2.4 : 1) : 0.5 + amount * 0.5 + Math.random() * 0.25;
    p.a = cig ? (amount > 1 ? 0.38 : 0.5) : 0.42 + amount * 0.4;
    p.s.material.color.setHex(cig ? 0xe4e6e8 : amount > 0.55 ? 0x8f949a : 0xaeb6bd);
    p.s.position.set(x, y, z); p.s.visible = true;
  }
  update(dt) {
    for (const p of this.P) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.vx *= 1 - dt * 1.3; p.vz *= 1 - dt * 1.3; p.vy += dt * 0.05;
      const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(k);
      p.s.scale.set(r, r, 1);
      p.s.material.opacity = p.a * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88);
    }
  }
}

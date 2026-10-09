// Partikelsysteme: additives Glühen (Sterne, Funken, Schweife) + Rauch.
// Alles läuft in großen Ring-Puffern (struct-of-arrays), gerendert als THREE.Points.
import * as THREE from 'three';
import { smokeTexture } from './textures.js';

export const KIND = { STAR: 0, TRAIL: 1, SPARK: 2, FLASH: 3 };
export const FLAG = { STROBE: 1, EMBER: 2, CRACKLE: 4, SPLIT: 8, TWINKLE: 16, CHANGE: 32 };

const G = 9.81;

const GLOW_VERT = /* glsl */ `
  attribute vec4 aCol;
  attribute float aSize;
  uniform float uScale;
  uniform float uMaxPx;
  uniform float uStarPx;
  uniform float uMirror;
  uniform float uTime;
  varying vec4 vCol;
  void main() {
    if (aSize <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
    vec3 p = position;
    if (uMirror > 0.5) {
      // Wasseroberfläche kräuselt die Spiegelung
      p.x += sin(p.z * 0.11 + uTime * 1.7 + p.y * 0.07) * 1.1;
      p.z += cos(p.x * 0.09 + uTime * 1.3) * 0.8;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float px = aSize * uScale / max(-mv.z, 0.1);
    float a = aCol.a;
    if (px < 2.2) { a *= px / 2.2; px = 2.2; }
    // Sterne bleiben punktförmig, große Blitze (>8 m) dürfen größer werden
    float cap = aSize > 8.0 ? uMaxPx : uStarPx;
    if (px > cap) { if (aSize > 8.0) a *= cap / px; px = cap; }
    gl_PointSize = px;
    gl_Position = projectionMatrix * mv;
    vCol = vec4(aCol.rgb, a);
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec4 vCol;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float core = exp(-d * 10.0);
    float halo = exp(-d * 2.6) * 0.32;
    gl_FragColor = vec4(vCol.rgb, (core + halo) * vCol.a * uOpacity);
  }
`;

const SMOKE_VERT = /* glsl */ `
  attribute vec4 aCol;
  attribute float aSize;
  attribute float aRot;
  uniform float uScale;
  uniform float uMaxPx;
  varying vec4 vCol;
  varying float vRot;
  void main() {
    if (aSize <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); vRot = 0.0; return; }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float px = aSize * uScale / max(-mv.z, 0.1);
    float a = aCol.a;
    if (px > uMaxPx) { a *= uMaxPx / px; px = uMaxPx; }
    gl_PointSize = px;
    gl_Position = projectionMatrix * mv;
    vCol = vec4(aCol.rgb, a);
    vRot = aRot;
  }
`;

const SMOKE_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  varying vec4 vCol;
  varying float vRot;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float cs = cos(vRot), sn = sin(vRot);
    vec2 uv = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
    vec4 t = texture2D(uTex, uv);
    gl_FragColor = vec4(vCol.rgb, t.a * vCol.a * 2.4);
  }
`;

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Glow {
  constructor(N = 90000) {
    this.N = N;
    const f = () => new Float32Array(N);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.r = f(); this.g = f(); this.b = f();
    this.r2 = f(); this.g2 = f(); this.b2 = f();
    this.age = new Float32Array(N).fill(1);
    this.max = f();
    this.size = f();
    this.drag = f(); this.grav = f(); this.bright = f();
    this.fadeStart = f();
    this.trailRate = f(); this.trailLife = f(); this.trailAcc = f(); this.trailSize = f();
    this.phase = f();
    this.strobeRate = f();
    this.windK = f();
    this.kind = new Uint8Array(N);
    this.flags = new Uint8Array(N);
    this.cursor = 0;
    this.active = 0;
    this.events = []; // {type, x, y, z}

    this.posAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(N), 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aCol', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    this.geometry = geo;

    this.uniforms = {
      uScale: { value: 900 },
      uMaxPx: { value: 256 },
      uStarPx: { value: 30 },
      uMirror: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    };
    const mk = (mirror, opacity) =>
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: {
          uScale: this.uniforms.uScale,
          uMaxPx: this.uniforms.uMaxPx,
          uStarPx: this.uniforms.uStarPx,
          uTime: this.uniforms.uTime,
          uMirror: { value: mirror },
          uOpacity: { value: opacity },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    this.mesh = new THREE.Points(geo, mk(0, 1));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    // Spiegelung im See: gleiche Geometrie, an der Wasserfläche gespiegelt
    this.mirror = new THREE.Points(geo, mk(1, 0.42));
    this.mirror.frustumCulled = false;
    this.mirror.renderOrder = 9;
  }

  setWaterLevel(y) {
    this.mirror.position.y = 2 * y;
    this.mirror.scale.y = -1;
  }

  setView(renderer, camera) {
    const h = renderer.domElement.height;
    this.uniforms.uScale.value = (h * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    const gl = renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    this.uniforms.uMaxPx.value = Math.min(range[1], 420 * (h / 1080));
    this.uniforms.uStarPx.value = Math.min(range[1], Math.max(12, 22 * (h / 1080)));
  }

  clear() {
    this.age.fill(1);
    this.max.fill(0);
    this.sizeAttr.array.fill(0);
    this.sizeAttr.needsUpdate = true;
  }

  // o: {drag, grav, bright, fadeStart, flags, r2,g2,b2, trailRate, trailLife, trailSize, strobeRate, windK}
  spawn(kind, x, y, z, vx, vy, vz, r, g, b, life, size, o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.N;
    this.kind[i] = kind;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.r[i] = r; this.g[i] = g; this.b[i] = b;
    this.age[i] = 0;
    this.max[i] = life;
    this.size[i] = size;
    if (o) {
      this.drag[i] = o.drag ?? 1.2;
      this.grav[i] = (o.grav ?? 0.5) * G;
      this.bright[i] = o.bright ?? 1.6;
      this.fadeStart[i] = o.fadeStart ?? 0.55;
      this.flags[i] = o.flags ?? 0;
      this.r2[i] = o.r2 ?? r; this.g2[i] = o.g2 ?? g; this.b2[i] = o.b2 ?? b;
      this.trailRate[i] = o.trailRate ?? 0;
      this.trailLife[i] = o.trailLife ?? 0.6;
      this.trailSize[i] = o.trailSize ?? size * 0.55;
      this.strobeRate[i] = o.strobeRate ?? 9;
      this.windK[i] = o.windK ?? 0.6;
    } else {
      this.drag[i] = 1.2; this.grav[i] = 0.5 * G; this.bright[i] = 1.6; this.fadeStart[i] = 0.55;
      this.flags[i] = 0; this.r2[i] = r; this.g2[i] = g; this.b2[i] = b;
      this.trailRate[i] = 0; this.trailLife[i] = 0.6; this.trailSize[i] = size * 0.55;
      this.strobeRate[i] = 9; this.windK[i] = 0.6;
    }
    this.trailAcc[i] = 0;
    this.phase[i] = Math.random();
    return i;
  }

  update(dt, wind, time) {
    this.uniforms.uTime.value = time;
    const N = this.N;
    const pos = this.posAttr.array, col = this.colAttr.array, sz = this.sizeAttr.array;
    const { px, py, pz, vx, vy, vz, r, g, b, r2, g2, b2, age, max, size, drag, grav, bright, fadeStart } = this;
    const wx = wind.x, wz = wind.z;
    const crowded = this.active > N * 0.82;
    let active = 0;

    for (let i = 0; i < N; i++) {
      const m = max[i];
      if (age[i] >= m) continue;
      const a = (age[i] += dt);
      if (a >= m) {
        this._death(i);
        sz[i] = 0;
        col[i * 4 + 3] = 0;
        continue;
      }
      active++;
      const t = a / m;
      const kind = this.kind[i];

      if (kind !== KIND.FLASH) {
        const k = Math.exp(-drag[i] * dt);
        vx[i] *= k; vy[i] *= k; vz[i] *= k;
        vy[i] -= grav[i] * dt;
        px[i] += (vx[i] + wx * this.windK[i]) * dt;
        py[i] += vy[i] * dt;
        pz[i] += (vz[i] + wz * this.windK[i]) * dt;
      }

      let cr = r[i], cg = g[i], cb = b[i], br, s = size[i];
      const fl = this.flags[i];

      if (kind === KIND.STAR) {
        if (fl & FLAG.CHANGE) {
          const c = smooth(0.38, 0.52, t);
          cr = cr + (r2[i] - cr) * c;
          cg = cg + (g2[i] - cg) * c;
          cb = cb + (b2[i] - cb) * c;
        }
        const heat = (1 - smooth(0, 0.16, t)) * 0.75;
        cr += (1 - cr) * heat; cg += (1 - cg) * heat; cb += (1 - cb) * heat;
        if (fl & FLAG.EMBER) {
          const e = smooth(0.62, 1, t) * 0.75;
          cr += (1.0 - cr) * e; cg += (0.32 - cg) * e; cb += (0.05 - cb) * e;
        }
        const fs = fadeStart[i];
        let f = t < fs ? 1 : 1 - (t - fs) / (1 - fs);
        f *= f;
        br = bright[i] * f;
        s *= 0.75 + 0.25 * f;
        if (fl & FLAG.STROBE) {
          const ph = (a * this.strobeRate[i] + this.phase[i]) % 1;
          br *= ph < 0.3 ? 2.2 : 0.0;
        }
        if (fl & FLAG.TWINKLE) br *= 0.6 + 0.4 * Math.sin(a * 41 + this.phase[i] * 6.283);

        // Schweif
        const tr = this.trailRate[i];
        if (tr > 0 && !crowded) {
          let acc = (this.trailAcc[i] += dt);
          const iv = 1 / tr;
          let n = 0;
          while (acc >= iv && n < 4) {
            acc -= iv;
            n++;
            const jit = Math.random() * dt;
            this.spawn(
              KIND.TRAIL,
              px[i] - vx[i] * jit, py[i] - vy[i] * jit, pz[i] - vz[i] * jit,
              vx[i] * 0.04 + (Math.random() - 0.5) * 0.7,
              vy[i] * 0.04 + (Math.random() - 0.5) * 0.7 - 0.3,
              vz[i] * 0.04 + (Math.random() - 0.5) * 0.7,
              cr, cg, cb,
              this.trailLife[i] * (0.7 + Math.random() * 0.6),
              this.trailSize[i],
              { drag: 2.2, grav: 0.12, bright: br * 0.7, windK: 0.9 }
            );
          }
          this.trailAcc[i] = acc;
        }
      } else if (kind === KIND.TRAIL) {
        const f = Math.pow(1 - t, 1.7);
        br = bright[i] * f;
        const hs = t * 0.55;
        cr += (1.0 - cr) * hs; cg += (0.38 - cg) * hs; cb += (0.08 - cb) * hs;
        s *= 1 - 0.35 * t;
      } else if (kind === KIND.SPARK) {
        const f = 1 - t;
        br = bright[i] * f * f;
        const hs = t * 0.8;
        cr += (1.0 - cr) * hs * 0.2; cg += (0.28 - cg) * hs; cb += (0.04 - cb) * hs;
        const tr = this.trailRate[i];
        if (tr > 0 && !crowded) {
          const acc = (this.trailAcc[i] += dt);
          if (acc > 1 / tr) {
            this.trailAcc[i] = 0;
            this.spawn(KIND.TRAIL, px[i], py[i], pz[i], 0, 0, 0, cr, cg, cb, this.trailLife[i], this.trailSize[i],
              { drag: 3, grav: 0.1, bright: br * 0.5 });
          }
        }
      } else {
        // FLASH
        const f = 1 - t;
        br = bright[i] * f * f;
        s *= 0.55 + 0.9 * Math.sqrt(t);
      }

      const i3 = i * 3, i4 = i * 4;
      pos[i3] = px[i]; pos[i3 + 1] = py[i]; pos[i3 + 2] = pz[i];
      col[i4] = cr * br; col[i4 + 1] = cg * br; col[i4 + 2] = cb * br;
      col[i4 + 3] = br > 0.002 ? 1 : 0;
      sz[i] = s;
    }
    this.active = active;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  _death(i) {
    const fl = this.flags[i];
    if (!fl || this.kind[i] !== KIND.STAR) return;
    const x = this.px[i], y = this.py[i], z = this.pz[i];
    if (fl & FLAG.CRACKLE) {
      const n = 3 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) {
        this.spawn(KIND.STAR, x, y, z,
          (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10,
          1, 0.92, 0.75, 0.12 + Math.random() * 0.2, 0.55,
          { drag: 3, grav: 0.2, bright: 3.2, fadeStart: 0.4 });
      }
      if (this.events.length < 80) this.events.push({ type: 'crackle', x, y, z });
    }
    if (fl & FLAG.SPLIT) {
      const s = 14 + Math.random() * 6;
      const rot = Math.random() * Math.PI * 2;
      const vx = this.vx[i] * 0.25, vy = this.vy[i] * 0.25, vz = this.vz[i] * 0.25;
      for (let k = 0; k < 4; k++) {
        const a = rot + (k * Math.PI) / 2;
        this.spawn(KIND.STAR, x, y, z, vx + Math.cos(a) * s, vy + Math.sin(a * 2) * 2, vz + Math.sin(a) * s,
          this.r[i], this.g[i], this.b[i], 1.1 + Math.random() * 0.3, this.size[i] * 0.9,
          { drag: 1.6, grav: 0.4, bright: this.bright[i], fadeStart: 0.5, trailRate: 35, trailLife: 0.5 });
      }
      if (this.events.length < 80) this.events.push({ type: 'split', x, y, z });
    }
  }
}

export class Smoke {
  constructor(N = 6000) {
    this.N = N;
    const f = () => new Float32Array(N);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = new Float32Array(N).fill(1);
    this.max = f();
    this.size0 = f();
    this.grow = f();
    this.alpha0 = f();
    this.rot = f();
    this.rotV = f();
    this.cursor = 0;

    this.posAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(N), 1);
    this.rotAttr = new THREE.BufferAttribute(new Float32Array(N), 1);
    for (const a of [this.posAttr, this.colAttr, this.sizeAttr, this.rotAttr]) a.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aCol', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setAttribute('aRot', this.rotAttr);

    this.uniforms = { uScale: { value: 900 }, uMaxPx: { value: 700 }, uTex: { value: smokeTexture() } };
    this.mesh = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: SMOKE_VERT,
        fragmentShader: SMOKE_FRAG,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  setView(renderer, camera) {
    const h = renderer.domElement.height;
    this.uniforms.uScale.value = (h * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    const gl = renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    this.uniforms.uMaxPx.value = Math.min(range[1], 900 * (h / 1080));
  }

  clear() {
    this.age.fill(1);
    this.max.fill(0);
    this.sizeAttr.array.fill(0);
    this.sizeAttr.needsUpdate = true;
  }

  spawn(x, y, z, size, life, vx = 0, vy = 0, vz = 0, alpha = 0.22, grow = 1.6) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.N;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0;
    this.max[i] = life;
    this.size0[i] = size;
    this.grow[i] = grow;
    this.alpha0[i] = alpha;
    this.rot[i] = Math.random() * 6.283;
    this.rotV[i] = (Math.random() - 0.5) * 0.15;
  }

  // flashes: [{x,y,z,r,g,b,e,rad}] – hellt den Rauch bunt an
  update(dt, wind, flashes) {
    const N = this.N;
    const pos = this.posAttr.array, col = this.colAttr.array, sz = this.sizeAttr.array, rot = this.rotAttr.array;
    for (let i = 0; i < N; i++) {
      const m = this.max[i];
      if (this.age[i] >= m) continue;
      const a = (this.age[i] += dt);
      if (a >= m) {
        sz[i] = 0;
        col[i * 4 + 3] = 0;
        continue;
      }
      const t = a / m;
      // Rauch verlangsamt und treibt mit dem Wind
      const k = Math.exp(-0.9 * dt);
      this.vx[i] *= k; this.vy[i] *= k; this.vz[i] *= k;
      this.px[i] += (this.vx[i] + wind.x) * dt;
      this.py[i] += (this.vy[i] + 0.25) * dt;
      this.pz[i] += (this.vz[i] + wind.z) * dt;
      this.rot[i] += this.rotV[i] * dt;

      const size = this.size0[i] * (1 + this.grow[i] * Math.sqrt(t));
      let al = this.alpha0[i] * smooth(0, 0.06, t) * (1 - smooth(0.35, 1, t));

      // Grundhelligkeit (Mondlicht + Stadtschein) und Blitz-Beleuchtung
      let cr = 0.028, cg = 0.032, cb = 0.048;
      const x = this.px[i], y = this.py[i], z = this.pz[i];
      for (let f = 0; f < flashes.length; f++) {
        const fl = flashes[f];
        const dx = x - fl.x, dy = y - fl.y, dz = z - fl.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const rr = fl.rad * fl.rad;
        const w = (fl.e * rr) / (rr + d2);
        cr += fl.r * w * 0.22; cg += fl.g * w * 0.22; cb += fl.b * w * 0.22;
      }
      const i3 = i * 3, i4 = i * 4;
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
      col[i4] = cr; col[i4 + 1] = cg; col[i4 + 2] = cb; col[i4 + 3] = al;
      sz[i] = size;
      rot[i] = this.rot[i];
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.rotAttr.needsUpdate = true;
  }
}

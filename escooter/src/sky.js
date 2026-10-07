import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './util.js';

const SKY_KEYS = [
  { e: -0.28, z: '#04070f', h: '#0c1426' },
  { e: -0.10, z: '#0d1838', h: '#2c2a50' },
  { e: -0.02, z: '#1f3768', h: '#c96d55' },
  { e: 0.07, z: '#35629f', h: '#f7a875' },
  { e: 0.22, z: '#3b73c4', h: '#c9d9ec' },
  { e: 0.5, z: '#2f68c8', h: '#b4d2f2' },
];
const KEYS = SKY_KEYS.map((k) => ({ e: k.e, z: new THREE.Color(k.z), h: new THREE.Color(k.h) }));

const skyVert = `
  varying vec3 vDir;
  void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = `
  varying vec3 vDir;
  uniform vec3 zenith, horizon, sunDir, moonDir, sunCol;
  uniform float night, time, cover;
  float h31(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(7.1,3.3); a*=0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float hgt = d.y;
    float t = pow(clamp(hgt, 0.0, 1.0), 0.45);
    vec3 col = mix(horizon, zenith, t);
    // below horizon: fade to fog colour
    col = mix(col, horizon * 0.85, smoothstep(0.0, -0.25, hgt));
    float cs = max(dot(d, sunDir), 0.0);
    float sunUp = smoothstep(-0.12, 0.02, sunDir.y);
    col += sunCol * (pow(cs, 600.0) * 3.0 + pow(cs, 12.0) * 0.35 + pow(cs, 3.0) * 0.12) * sunUp;
    // stars + moon
    if (night > 0.01 && hgt > -0.05) {
      vec3 sp = d * 220.0; vec3 id = floor(sp); vec3 f = fract(sp) - 0.5;
      float r = h31(id);
      float star = step(0.9965, r) * smoothstep(0.35, 0.0, length(f)) * (0.6 + 0.4 * sin(time * 2.0 + r * 60.0));
      col += vec3(0.85, 0.9, 1.0) * star * night * smoothstep(0.0, 0.25, hgt);
      float md = dot(d, moonDir);
      float disc = smoothstep(0.99935, 0.9996, md);
      float crater = 0.8 + 0.2 * vn(d.xz * 90.0 + d.y * 40.0);
      col += vec3(0.9, 0.93, 1.0) * disc * crater * night * 1.5;
      col += vec3(0.35, 0.42, 0.6) * pow(max(md, 0.0), 60.0) * night * 0.35;
    }
    // clouds
    if (hgt > 0.0) {
      vec2 uv = d.xz / (hgt + 0.18) * 0.9 + vec2(time * 0.006, time * 0.003);
      float n = fbm(uv * 1.3);
      float c = smoothstep(0.52 - cover * 0.18, 0.82, n) * smoothstep(0.0, 0.12, hgt);
      float dayAmt = smoothstep(-0.15, 0.2, sunDir.y);
      vec3 cc = mix(vec3(0.07,0.08,0.13), mix(vec3(1.0,0.62,0.45), vec3(0.97,0.98,1.0), smoothstep(0.05, 0.4, sunDir.y)), dayAmt);
      cc *= 0.82 + 0.18 * n;
      col = mix(col, cc, c * 0.85);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Sky {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.hours = 10;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.night = 0;
    this.sunElev = 1;
    this.lampsOn = 0;

    this.uniforms = {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: this.sunDir }, moonDir: { value: this.moonDir }, sunCol: { value: new THREE.Color(1, 0.8, 0.5) },
      night: { value: 0 }, time: { value: 0 }, cover: { value: 0.45 },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // environment capture scene
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), this.mat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.envTimer = 99;

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -55; this.sun.shadow.camera.right = 55;
    this.sun.shadow.camera.top = 55; this.sun.shadow.camera.bottom = -55;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.mapSize.set(2048, 2048);
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9ab6e0, 0x3a352e, 0.2);
    scene.add(this.hemi);

    this.fog = new THREE.Fog(0xaaccee, 30, 190);
    scene.fog = this.fog;
    this._tmpC = new THREE.Color();
    this._shadowRight = new THREE.Vector3();
    this._shadowUp = new THREE.Vector3();
  }

  setShadowSize(px, enabled) {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.mapSize.x !== px) {
      this.sun.shadow.mapSize.set(px, px);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  setTime(h) {
    this.hours = ((h % 24) + 24) % 24;
  }

  update(dt, focus, forceEnv = false) {
    const a = ((this.hours - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a) * 0.87, 0.5).normalize();
    this.moonDir.copy(this.sunDir).negate();
    const e = this.sunDir.y;
    this.sunElev = e;
    this.night = 1 - smoothstep(-0.14, 0.08, e);
    this.lampsOn = 1 - smoothstep(-0.02, 0.14, e);
    this.uniforms.night.value = this.night;
    this.uniforms.time.value += dt;

    // sky colours
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1];
    const t = clamp((e - k0.e) / (k1.e - k0.e), 0, 1);
    this.uniforms.zenith.value.copy(k0.z).lerp(k1.z, t);
    this.uniforms.horizon.value.copy(k0.h).lerp(k1.h, t);
    const warm = 1 - smoothstep(0.02, 0.35, e);
    this.uniforms.sunCol.value.setRGB(1.0, lerp(0.95, 0.5, warm), lerp(0.85, 0.28, warm));

    // fog follows horizon colour
    this.fog.color.copy(this.uniforms.horizon.value).multiplyScalar(0.92);
    this.scene.background = null;

    // key light: sun by day, moon by night
    const sunI = 3.4 * smoothstep(-0.03, 0.3, e);
    const moonI = 0.42 * smoothstep(0.0, -0.22, e);
    const useSun = sunI >= moonI;
    const dir = useSun ? this.sunDir : this.moonDir;
    this.sun.intensity = useSun ? sunI : moonI;
    if (useSun) this.sun.color.setRGB(1, lerp(0.97, 0.72, warm), lerp(0.92, 0.5, warm));
    else this.sun.color.setRGB(0.55, 0.65, 1.0);

    // shadow camera snapped to texel grid in light space
    const size = this.sun.shadow.camera.right * 2;
    const texel = size / this.sun.shadow.mapSize.x;
    const r = this._shadowRight.crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const u = this._shadowUp.crossVectors(dir, r).normalize();
    const f = focus;
    const pr = Math.round(f.dot(r) / texel) * texel, pu = Math.round(f.dot(u) / texel) * texel, pd = f.dot(dir);
    const tgt = this.sun.target.position;
    tgt.set(0, 0, 0).addScaledVector(r, pr).addScaledVector(u, pu).addScaledVector(dir, pd);
    this.sun.position.copy(tgt).addScaledVector(dir, 110);

    this.hemi.intensity = lerp(0.12, 0.38, 1 - this.night);
    this.hemi.color.copy(this.uniforms.zenith.value).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.renderer.toneMappingExposure = lerp(1.35, 0.95, 1 - this.night);
    this.scene.environmentIntensity = lerp(0.85, 0.9, 1 - this.night);

    this.dome.position.copy(this.camera.position);

    // env map refresh
    this.envTimer += dt;
    if (forceEnv || this.envTimer > 4) {
      this.envTimer = 0;
      this.envScene.children[0].position.set(0, 0, 0);
      const rt = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = rt;
      this.scene.environment = rt.texture;
    }
  }
}

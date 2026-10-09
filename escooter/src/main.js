import { CARS, CAR_IDS } from './pcar.js';
import { Shops } from './shops.js';
import { Horizon } from './horizon.js';
import { buildVape } from './vape.js';
import { Ambient } from './ambient.js';
import { LAYOUT } from './stores.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { makeTextures } from './textures.js';
import { createMaterials } from './materials.js';
import { Sky } from './sky.js';
import { World, P, blockType, groundHeight, hasStation, SHOP, SHOP_TABLES, SHOP_IN, inShop, PLAY, SHOP2, SHOP2_IN, SHOP2_TABLES, inShop2 } from './world.js';
import { Walker } from './walker.js';
import { Net } from './net.js';
import { Scooter } from './scooter.js';
import { GameAudio } from './audio.js';
import { Traffic } from './traffic.js';
import { TRACK, trackProject, trackAt, trackNear, trackXZ, TRACK_W } from './track.js';
import { Pedestrians } from './peds.js';
import { Rain } from './weather.js';
import { Birds } from './birds.js';
import { Blood } from './blood.js';
import { Emergency } from './ambulance.js';
import { Smoke } from './smoke.js';
import { CarDamage } from './damage.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { clamp, damp, lerp, smoothstep, wrapAngle } from './util.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
if (!window.WebGL2RenderingContext || !document.createElement('canvas').getContext('webgl2')) {
  $('loadtxt').textContent = 'Dein Browser unterstützt WebGL 2 nicht (oder es ist deaktiviert). Bitte aktuellen Chrome, Edge, Firefox oder Safari verwenden.';
  $('loadbar').style.width = '0';
  throw new Error('WebGL2 not available');
}

/* ------------------------------------------------------------------ renderer */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 1800);
camera.position.set(0, 3, -6);

const tex = makeTextures(renderer);
const M = createMaterials(tex);
const sky = new Sky(scene, renderer, camera);
const world = new World(scene, M);
const horizon = new Horizon(scene);
const ambient = new Ambient(scene);
const scooter = new Scooter(tex, M);
scene.add(scooter.root);
const audio = new GameAudio();
const walker = new Walker(scene);
const net = new Net(scene, M);
// the on-foot position of the player, or the scooter when riding
const me = {
  get x() { return st.mode === 'walk' ? walker.x : scooter.x; },
  get z() { return st.mode === 'walk' ? walker.z : scooter.z; },
  get v() { return st.mode === 'walk' ? walker.speed : scooter.v; },
  get speed() { return st.mode === 'walk' ? walker.speed : Math.abs(scooter.v); },
  get heading() { return st.mode === 'walk' ? walker.yaw : scooter.heading; },
  get armed() { return st.mode === 'walk' && !!st.gun; },
  get moped() { return st.mode === 'ride' && !!scooter.model.moped; },
};
const store0 = (k, d) => { try { const v = localStorage.getItem('g4_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const parkDyn = [];
const traffic = new Traffic(scene, M, 12, 9, { police: store0('police', true), glow: tex.glow, pool: tex.pool });
const peds = new Pedestrians(scene, M, 30, 10, 6);
const shops = new Shops(scene, M, peds, audio);
traffic.peds = peds;
const rain = new Rain(scene);
const birds = new Birds(scene, 18);
const blood = new Blood(scene);
const smoke = new Smoke(scene);
const ems = new Emergency(scene, M, tex.glow);
ems.onTaken = () => toast('🚑 Krankenwagen', 'hat die verletzte Person mitgenommen', 2600);
const dynAll = [];
const walkDyn = [];
const PARK = { space: true };
const sig = { aG: false, aY: false, bG: false, bY: false, aSoon: false, bSoon: false };

// pooled street lights that follow the player
const lampLights = [];
for (let i = 0; i < 4; i++) {
  const l = new THREE.PointLight(0xffb870, 0, 30, 2);
  scene.add(l);
  lampLights.push(l);
}

// beacons (checkpoint = cyan, VESC shop = orange)
function makeBeacon(colA, colB, colRing) {
  const g = new THREE.Group();
  const bm = new THREE.MeshBasicMaterial({ map: tex.beam, color: colA, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 90, 32, 1, true), bm);
  c1.position.y = 45;
  const bm2 = new THREE.MeshBasicMaterial({ map: tex.beam, color: colB, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 120, 12, 1, true), bm2);
  c2.position.y = 60;
  const rm = new THREE.MeshBasicMaterial({ color: colRing, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.6, 64), rm);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2;
  g.add(c1, c2, ring);
  g.userData = { ring, c1 };
  g.visible = false;
  scene.add(g);
  return g;
}
const beacon = makeBeacon(0x2fd8ff, 0xdffaff, 0x35e6ff);
const shopBeacon = makeBeacon(0xff8a1a, 0xffe2b0, 0xff7a1a);
shopBeacon.scale.set(0.55, 1, 0.55);
const shopBeacon2 = makeBeacon(0x2a8ad8, 0xd8ecff, 0x2a8ad8);
shopBeacon2.scale.set(0.55, 1, 0.55);

/* ------------------------------------------------------------------ settings & state */
const store = {
  get(k, d) { try { const v = localStorage.getItem('g4_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('g4_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  },
};
const cfg = {
  quality: store.get('quality', 'high'),
  mode: store.get('mode', 'mission'),
  battMode: store.get('battMode2', 'off'),
  wet: false,
  flow: true,
  hours: 10,
  volume: store.get('volume', 0.7),
  mouse: store.get('mouse', true),
  weather: 'clear',
  wbar: store.get('wbar', true),
  blood: store.get('blood', true),
  police: store.get('police', true),
};
const VESC_PRICE = 500, DT3_PRICE = 1000, SONIC_PRICE = 1500;
// shop scooters: price, key and display name (G4 is the starter scooter)
const SHOP_MODELS = {
  zt3: { price: 150, key: 'I', name: 'ZT3 Pro', sound: [392, 523, 659] },
  g2: { price: 300, key: 'O', name: 'Kukirin G2', sound: [392, 523, 659, 784] },
  dt3: { price: DT3_PRICE, key: 'Q', name: 'Dualtron Thunder 3', sound: [392, 523, 659, 784, 1046, 1568] },
  sonic: { price: SONIC_PRICE, key: 'U', name: 'Weped Sonic', sound: [330, 392, 523, 659, 784, 1046, 1568, 2093] },
  simson: { price: 800, key: '', name: 'Simson S51', sound: [196, 247, 294, 392], shop: 2 },
  sr50: { price: 950, key: '', name: 'Simson SR50', sound: [220, 262, 330, 392], shop: 2 },
  schwalbe: { price: 1100, key: '', name: 'Simson Schwalbe KR51', sound: [196, 262, 330, 440], shop: 2 },
};
for (const c of Object.values(CARS)) SHOP_MODELS[c.id] = { price: c.price, key: '', name: c.name, sound: [262, 330, 392, 523, 659], shop: 3, car: true };
const VAPE_PRICE = 20;
const MTX_PRICE = 600, PZ_PRICE = 250, CIG_PRICE = 8;
const st = {
  running: false, paused: true, fp: false, userHead: null, resScale: 1,
  score: 0, scoreAcc: 0, odoTotal: store.get('odo', 0), best: store.get('best', 0),
  trafficT: 0, crashT: 0, stuckT: 0, lastOdo: 0, fpsAvg: 60, fpsT: 0, showFps: false, charging: false,
  mission: { tour: 0, n: 0, cp: null, time: 0, active: false, total: 5, last: null },
  landDip: 0, hitT: 0, wanted: 0, copCool: 0, bustT: 0, fines: 0, track: false,
  mode: 'ride', money: store.get('money', 1000000), vesc: store.get('vesc', false), dt3: store.get('dt3', false), sonic: store.get('sonic', false), g2: store.get('g2', false), zt3: store.get('zt3', false), simson: store.get('simson', false), sr50: store.get('sr50', false), schwalbe: store.get('schwalbe', false), car_mini: store.get('car_mini', false), car_sedan: store.get('car_sedan', false), car_suv: store.get('car_suv', false), car_sport: store.get('car_sport', false), mtx: store.get('mtx', false), pz: store.get('pz', false), cigs: store.get('cigs', 3), smokeT: 0, model: store.get('model', 'g4'),
};

// everybody starts rich: one-time top-up of existing saves to 1.000.000 €
if (!store.get('bonus1m', false)) { st.money = Math.max(st.money, 1000000); store.set('money', Math.floor(st.money)); store.set('bonus1m', true); }
/* ------------------------------------------------------------------ quality */
const QUALITY = {
  low: { pr: 1, shadow: 0, bloom: false, ao: false, radius: 2, fogFar: 185 },
  med: { pr: 1.5, shadow: 1024, bloom: false, ao: false, post: true, radius: 2, fogFar: 190 },
  high: { pr: 2, shadow: 2048, bloom: true, ao: true, post: true, radius: 3, fogFar: 285 },
};
let composer = null, bloomPass = null, gtaoPass = null, gradePass = null;
/* cinematic final pass: radial speed blur, chromatic aberration, sharpen, soft S-curve grade, vignette, damage tint, film grain */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, speed: { value: 0 }, hurt: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, grain: { value: 0.03 }, warm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, speed, hurt, grain, warm; uniform vec2 res; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.0) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      float blur = speed * 0.07 * smoothstep(0.02, 0.2, r2);
      float ca = (0.0008 + speed * 0.006 + hurt * 0.008) * (r2 * 4.0 + 0.2);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        float k = float(i) / 5.0; vec2 uv = vUv - c * blur * k;
        col.r += texture2D(tDiffuse, uv - c * ca).r; col.g += texture2D(tDiffuse, uv).g; col.b += texture2D(tDiffuse, uv + c * ca).b;
      }
      col /= 6.0;
      vec2 px = 1.0 / res;
      vec3 n = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
      col += (col - n * 0.25) * 0.45 * (1.0 - speed);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.1);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.38);
      col *= mix(vec3(1.0), vec3(1.035, 1.0, 0.95), warm);
      col += vec3(-0.004, 0.0, 0.01) * (1.0 - l);
      col *= 1.0 - smoothstep(0.18, 0.62, r2) * 0.4;
      col = mix(col, col * vec3(1.0, 0.3, 0.3), hurt * smoothstep(0.04, 0.4, r2));
      col += (hash(vUv * res) - 0.5) * grain * (1.2 - l);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
function applyQuality(name) {
  const q = QUALITY[name] || QUALITY.med;
  cfg.quality = name;
  const wasShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = q.shadow > 0;
  sky.setShadowSize(q.shadow || 1024, q.shadow > 0);
  if (wasShadow !== renderer.shadowMap.enabled) {
    for (const m of Object.values(M)) m.needsUpdate = true;
    scooter.root.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
  }
  world.radius = q.radius;
  sky.fog.far = q.fogFar; sky.fog.near = q.fogFar * 0.12;
  st.maxPR = q.pr;
  st.bloom = q.bloom; st.post = !!q.post;
  document.getElementById('vignette').style.display = q.post ? 'none' : '';
  st.fogFar = q.fogFar;
  st.ao = q.ao;
  resize();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, st.maxPR || 1.5) * st.resScale;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (st.post) {
    if (!composer) {
      const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      gtaoPass = new GTAOPass(scene, camera, w, h);
      gtaoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 10, distanceFallOff: 1, screenSpaceRadius: false });
      gtaoPass.blendIntensity = 0.85;
      composer.addPass(gtaoPass);
      bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 1.05);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      gradePass = new ShaderPass(GradeShader);
      composer.addPass(gradePass);
    }
    if (bloomPass) bloomPass.enabled = !!st.bloom;
    gradePass.uniforms.res.value.set(w * pr, h * pr);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    if (gtaoPass) gtaoPass.enabled = !!st.ao;
  }
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ input */
const keys = new Set();
const KEYMAP = { fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], boost: ['ShiftLeft', 'ShiftRight'], space: ['Space'] };
const mouse = { mmb: false, steer: 0, lock: false, lmb: false, rmb: false, lookY: 0, yawAcc: 0 };
function readInput() {
  const o = {};
  for (const k in KEYMAP) o[k] = KEYMAP[k].some((c) => keys.has(c));
  if (st.mode === 'walk') {
    o.strafeL = keys.has('KeyA'); o.strafeR = keys.has('KeyD');
    o.turnL = keys.has('ArrowLeft'); o.turnR = keys.has('ArrowRight');
    o.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    o.punch = keys.has('KeyE') || keys.has('KeyJ') || (navigator.getGamepads && [...navigator.getGamepads()].some((g) => g && g.buttons[2]?.pressed));
    o.yawDelta = mouse.yawAcc; mouse.yawAcc = 0;
    if (mouse.lock && mouse.lmb) { if (st.gun || st.knife) o.punch = true; else o.fwd = true; } // left mouse = fire / stab when armed, otherwise walk
    if (mouse.lock && mouse.rmb) o.back = true;
    return o;
  }
  o.wheelie = keys.has('KeyE') || mouse.mmb;
  if (mouse.lock) {
    if (!o.left && !o.right) o.steer = mouse.steer;
    if (mouse.lmb) o.fwd = true;
    if (mouse.rmb) o.back = true;
  }
  // gamepad
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (gp) {
    const ax = gp.axes[0] || 0;
    if (ax < -0.25) o.left = true;
    if (ax > 0.25) o.right = true;
    if (gp.buttons[7]?.value > 0.15 || gp.buttons[0]?.pressed) o.fwd = true;
    if (gp.buttons[6]?.value > 0.15) o.back = true;
    if (gp.buttons[1]?.pressed) o.space = true;
    if (gp.buttons[5]?.pressed) o.boost = true;
    if (gp.buttons[2]?.pressed) o.wheelie = true;
  }
  return o;
}
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !(e.target instanceof HTMLSelectElement)) e.preventDefault();
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (!st.running) return;
  if (st.shopOpen) { if (e.code === 'Escape' || e.code === 'KeyF') { closeShop(); e.preventDefault(); } return; }
  if (st.paused && !['KeyP', 'Escape', 'Enter', 'KeyM'].includes(e.code)) return;
  switch (e.code) {
    case 'KeyC': toggleCam(); break;
    case 'Backspace': resetOnRoad(); e.preventDefault(); break;
    case 'KeyH': callCrew(); break;
    case 'KeyU': setWbar(!cfg.wbar); break;
    case 'KeyN': toggleKnife(); break;
    case 'KeyQ': toggleGun(); break;
    case 'KeyR': if (st.mode === 'walk' && st.gun) { walker.reload(); } else toggleOneHand(); break;
    case 'KeyZ': smokeKey(); break;
    case 'KeyY': putOut(); break;
    case 'KeyP': case 'Escape': if (st.started) setPaused(!st.paused); break;
    case 'Enter': if (st.paused) $('btnStart').click(); else { openChat(); e.preventDefault(); } break;
    case 'KeyL': st.userHead = !(st.userHead ?? sky.lampsOn > 0.4); toast(st.userHead ? 'Licht an' : 'Licht aus', '', 900); break;
    case 'KeyB': { const hk = hornKind(); if (hk && !e.repeat) { audio.hornStart(hk); peds.bell(me.x, me.z); } break; }
    case 'KeyG': vapeKey(); break;
    case 'KeyX': switchModel(); break;
    case 'KeyK': setPolice(!cfg.police); break;
    case 'KeyV': toggleTrack(); break;
    case 'KeyF': interactF(); break;
    case 'KeyM': audio.setMuted(!audio.muted); toast(audio.muted ? 'Ton aus' : 'Ton an', '', 900); break;
    case 'KeyT': cfg.hours = (cfg.hours + 3) % 24; $('optTime').value = cfg.hours; break;
    case 'KeyI': dropBasket(); break;
    case 'KeyO': st.showFps = !st.showFps; $('fps').classList.toggle('hidden', !st.showFps); break;
  }
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyB') audio.hornStop(); });
window.addEventListener('blur', () => audio.hornStop());
function hornKind() { return st.mode !== 'ride' ? null : scooter.model.car ? 'car' : scooter.model.moped ? 'moped' : 'scooter'; }

// mouse steering: click into the game to capture the cursor; moving the mouse left/right steers
function lockMouse() {
  if (cfg.mouse && canvas.requestPointerLock && document.pointerLockElement !== canvas) {
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ }
  }
}
document.addEventListener('pointerlockchange', () => {
  const was = mouse.lock;
  mouse.lock = document.pointerLockElement === canvas;
  if (!mouse.lock) { mouse.steer = 0; mouse.lmb = mouse.rmb = false; if (was && st.running && !st.paused && !st.chatOpen) setPaused(true); }
  else toast('Maus-Lenkung aktiv', 'Maus links/rechts = lenken · linke Taste = Gas · rechte Taste = Bremse · Esc = Pause', 3200);
});
document.addEventListener('mousemove', (e) => {
  if (!mouse.lock) return;
  if (st.mode === 'walk') mouse.yawAcc -= e.movementX * 0.0026;
  else mouse.steer = clamp(mouse.steer - e.movementX * 0.0042, -1, 1);
  mouse.lookY = clamp(mouse.lookY + e.movementY * 0.0016, -0.35, 0.35);
});
canvas.addEventListener('mousedown', (e) => {
  if (!st.running || st.paused) return;
  if (!mouse.lock) { lockMouse(); return; }
  if (e.button === 0) mouse.lmb = true;
  if (e.button === 2) mouse.rmb = true;
  if (e.button === 1) { mouse.mmb = true; e.preventDefault(); }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.lmb = false; if (e.button === 2) mouse.rmb = false; if (e.button === 1) mouse.mmb = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { st.zoom = clamp((st.zoom || 1) * (e.deltaY > 0 ? 1.08 : 0.93), 0.6, 2.2); e.preventDefault(); }, { passive: false });
window.addEventListener('blur', () => { keys.clear(); if (st.running && !st.paused) setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && st.running && !st.paused) setPaused(true); });

// on-screen controls for touch devices
$('tpause').addEventListener('click', () => setPaused(true));
document.querySelectorAll('#touch button[data-k]').forEach((b) => {
  const k = b.dataset.k;
  const down = (e) => { e.preventDefault(); keys.add(k); b.classList.add('on'); };
  const up = (e) => { e.preventDefault(); keys.delete(k); b.classList.remove('on'); };
  b.addEventListener('pointerdown', down);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, up));
});

/* ------------------------------------------------------------------ UI helpers */
let toastTimer = 0;
function toast(text, sub = '', ms = 1800) {
  if (st.shopOpen) shopFlash(text + (sub ? ' – ' + sub : ''));
  const t = $('toast');
  t.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function setPaused(p) {
  st.paused = p;
  $('menu').classList.toggle('hidden', !p || !!st.shopOpen);
  $('btnStart').textContent = st.started ? 'Weiter fahren' : 'Fahrt starten';
  $('menusub').textContent = st.started ? 'Pausiert – passe Einstellungen an oder fahre weiter.' : 'Fahre mit dem E-Scooter frei durch eine endlose deutsche Stadt – oder sammle Checkpoints.';
  $('best').textContent = st.best ? `Bestwert: ${Math.round(st.best).toLocaleString('de-DE')} Punkte` : '';
  if (p) { keys.clear(); if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }
  else { if (document.activeElement && document.activeElement !== canvas) document.activeElement.blur(); canvas.focus(); }
  $('hud').classList.toggle('hidden', !st.started);
}
function toggleCam(force) {
  st.fp = typeof force === 'boolean' ? force : !st.fp;
  $('optCam').value = st.fp ? 'fp' : 'tp';
  scooter.setView(st.fp);
  
  toast(st.fp ? 'Ego-Kamera' : 'Verfolger-Kamera', '', 900);
}
function fmtTime(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/* ------------------------------------------------------------------ settings UI */
$('optMode').value = cfg.mode;
$('optQ').value = cfg.quality;
$('optBatt').value = cfg.battMode;
$('optVol').value = cfg.volume;
$('optMode').onchange = (e) => { cfg.mode = e.target.value; store.set('mode', cfg.mode); startMission(true); };
$('optQ').onchange = (e) => { applyQuality(e.target.value); store.set('quality', cfg.quality); };
$('optWx').onchange = (e) => { cfg.weather = e.target.value; };
$('optBatt').onchange = (e) => { cfg.battMode = e.target.value; store.set('battMode2', cfg.battMode); };
$('optTime').oninput = (e) => { cfg.hours = parseFloat(e.target.value); };
$('optFlow').onchange = (e) => { cfg.flow = e.target.checked; };
$('optWet').onchange = (e) => { cfg.wet = e.target.checked; st.wetNow = null; };
$('optCam').onchange = (e) => toggleCam(e.target.value === 'fp');
$('camBtn').onclick = () => toggleCam();
$('optMouse').checked = cfg.mouse;
$('optMouse').onchange = (e) => { cfg.mouse = e.target.checked; store.set('mouse', cfg.mouse); if (!cfg.mouse && document.exitPointerLock) document.exitPointerLock(); };
$('optVol').oninput = (e) => { cfg.volume = parseFloat(e.target.value); audio.setVolume(cfg.volume); store.set('volume', cfg.volume); };
$('btnStart').onclick = () => { lockMouse(); audio.start(); audio.setVolume(cfg.volume); st.started = true; setPaused(false); };
$('btnReset').onclick = () => { teleportStart(); lockMouse(); audio.start(); st.started = true; setPaused(false); };
canvas.addEventListener('mousedown', () => canvas.focus());

function applyWet(force) {
  const w = force ?? cfg.wet;
  M.asphalt.roughness = M.lotAsphalt.roughness = w ? 0.16 : 0.9;
  M.asphalt.bumpScale = M.lotAsphalt.bumpScale = w ? 0.4 : 1.2;
  M.asphalt.envMapIntensity = M.lotAsphalt.envMapIntensity = w ? 1.8 : 1;
  M.paver.roughness = w ? 0.38 : 0.88;
  M.asphalt.color.setScalar(w ? 0.62 : 1); M.lotAsphalt.color.setScalar(w ? 0.62 : 1);
}

/* ------------------------------------------------------------------ gameplay: reset, missions */
function teleportStart() {
  if (st.track) { leaveTrack(); return; }
  scooter.reset(30, 1.75, Math.PI / 2);
  camYaw = scooter.heading;
  startMission(true);
}
function resetOnRoad() {
  const s = scooter;
  if (st.track) {
    const pr = trackProject(s.x, s.z, trk.idx), c = trackAt(pr.s);
    s.reset(c.x, c.z, c.h); camYaw = c.h;
    toast('Zurückgesetzt', 'auf die Strecke gestellt', 1100);
    return;
  }
  const rz = Math.round(s.z / P) * P, rx = Math.round(s.x / P) * P;
  const dz = Math.abs(s.z - rz), dx = Math.abs(s.x - rx);
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  if (dz <= dx) {
    const east = fx >= 0;
    const nx = clamp(s.x, rx + 14 * 0, s.x);
    s.reset(s.x, rz + (east ? 1.75 : -1.75), east ? Math.PI / 2 : -Math.PI / 2);
  } else {
    const north = fz >= 0;
    s.reset(rx + (north ? -1.75 : 1.75), s.z, north ? 0 : Math.PI);
  }
  camYaw = s.heading;
  toast('Zurückgesetzt', 'auf die Straße gestellt', 1100);
}

const mis = st.mission;
function nearestGrid() { return [Math.round(scooter.x / P), Math.round(scooter.z / P)]; }
function pickCheckpoint() {
  const [gi, gj] = mis.last || nearestGrid();
  for (let tries = 0; tries < 50; tries++) {
    const dx = Math.floor(Math.random() * 9) - 4, dj = Math.floor(Math.random() * 9) - 4;
    const man = Math.abs(dx) + Math.abs(dj);
    if (man < 3 || man > 6) continue;
    const c = { gi: gi + dx, gj: gj + dj };
    c.x = c.gi * P; c.z = c.gj * P; c.man = man * P;
    return c;
  }
  return { gi: gi + 3, gj: gj, x: (gi + 3) * P, z: gj * P, man: 3 * P };
}
function startMission(fresh) {
  if (st.track) { mis.active = false; beacon.visible = false; $('arrowwrap').style.opacity = 0; return; }
  if (cfg.mode !== 'mission') {
    mis.active = false; beacon.visible = false;
    $('mission').innerHTML = '<b>Freie Fahrt</b> · erkunde die Stadt';
    $('arrowwrap').style.opacity = 0;
    return;
  }
  mis.active = true;
  if (fresh) { mis.n = 0; mis.tour = (mis.tour || 0) + 1; mis.last = null; mis.time = 80; }
  mis.cp = pickCheckpoint();
  beacon.visible = true;
  beacon.position.set(mis.cp.x, groundHeight(mis.cp.x, mis.cp.z), mis.cp.z);
  $('arrowwrap').style.opacity = 1;
  if (fresh) toast('Kurierfahrt', 'Fahre die Checkpoints ab – das Leuchtfeuer zeigt den Weg', 3200);
}
function reachCheckpoint() {
  mis.n++;
  const bonus = 200 + Math.floor(mis.time) * 2;
  st.score += bonus;
  const eur = 50 + Math.floor(mis.time / 5);
  earn(eur);
  audio.chime();
  const add = Math.max(22, mis.cp.man / 5.4 + 10);
  mis.time += add;
  mis.last = [mis.cp.gi, mis.cp.gj];
  if (mis.n >= mis.total) {
    st.score += 500;
    audio.chime([523, 659, 784, 1046]);
    earn(300);
    toast(`Tour ${mis.tour} geschafft! +500 Punkte`, `+${eur + 300} € Prämie`, 3200);
    mis.n = 0; mis.tour++;
    mis.time += 30;
  } else {
    toast(`Checkpoint ${mis.n}/${mis.total}`, `+${bonus} Punkte · +${eur} € · +${Math.round(add)} s`, 1800);
  }
  mis.cp = pickCheckpoint();
  beacon.position.set(mis.cp.x, groundHeight(mis.cp.x, mis.cp.z), mis.cp.z);
}
function missionUpdate(dt) {
  if (!mis.active || !mis.cp) return;
  mis.time -= dt;
  const dx = mis.cp.x - me.x, dz = mis.cp.z - me.z;
  const d = Math.hypot(dx, dz);
  if (d < 8) reachCheckpoint();
  if (mis.time <= 0) {
    audio.beep();
    toast('Zeit abgelaufen!', 'Neue Tour startet', 2600);
    startMission(true);
    return;
  }
  // beacon pulse
  const p = 1 + 0.06 * Math.sin(performance.now() * 0.006);
  beacon.userData.ring.scale.setScalar(p);
  beacon.userData.c1.rotation.y += dt * 0.5;
}

/* ------------------------------------------------------------------ race track */
const trk = { idx: -1, s: 0, lastS: 0, running: false, t: 0, lap: 0, bits: 0, best: store.get('bestLap', 0), last: 0, sector: 0 };
const fmtLap = (t) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`; };
function enterTrack() {
  if (st.mode === 'walk') { st.mode = 'ride'; scooter.parked = false; scooter.rider.visible = true; walker.setVisible(false); }
  st.track = true; st.wanted = 0; st.bustT = 0; traffic.pursuit.active = false; audio.siren(0);
  for (const c of traffic.cars) { c.active = false; c.group.visible = false; c.turn = null; }
  mis.active = false; beacon.visible = false; $('arrowwrap').style.opacity = 0;
  const c = trackAt(TRACK.len - 60);
  scooter.reset(c.x, c.z, c.h); scooter.v = 0; camYaw = c.h;
  world.radius = QUALITY[cfg.quality].radius;
  world.update(c.x, c.z, 0); world.preload(c.x, c.z);
  Object.assign(trk, { idx: -1, running: false, t: 0, lap: 0, bits: 0, sector: 0 });
  trackUpdate(0);
  $('btnTrack').textContent = '🏙️ Zurück in die Stadt teleportieren'; $('trackBtn').textContent = '🏙️ Zurück in die Stadt';
  scooter.hyper = true;
  toast('🏁 Rennstrecke', st.model === 'sonic' ? 'Weped Sonic: HYPER-MODUS – Shift = bis 5000 km/h!' : `${(TRACK.len / 1000).toFixed(1)} km · frei von Verkehr · fahre über die Ziellinie, um die Zeit zu starten${st.sonic ? ' · Tipp: Weped Sonic = bis 5000 km/h (X)' : ''}`, 4200);
}
function leaveTrack() {
  st.track = false; scooter.hyper = false;
  scooter.reset(30, 1.75, Math.PI / 2); scooter.v = 0; camYaw = scooter.heading;
  world.update(30, 1.75, 0); world.preload(30, 1.75);
  startMission(true);
  $('btnTrack').textContent = '🏁 Zur Rennstrecke teleportieren'; $('trackBtn').textContent = '🏁 Zur Rennstrecke';
  toast('Zurück in der Stadt', '', 1600);
}
function toggleTrack() { if (st.track) leaveTrack(); else enterTrack(); }
$('btnTrack').onclick = () => { toggleTrack(); if (st.started && st.paused) $('btnStart').click(); else if (!st.started) $('btnStart').click(); };
$('trackBtn').onclick = (e) => { toggleTrack(); e.currentTarget.blur(); };
function trackUpdate(dt) {
  const pr = trackProject(me.x, me.z, trk.idx);
  trk.idx = pr.idx; trk.lat = pr.lat; trk.d = pr.d;
  const prev = trk.s; trk.s = pr.s;
  if (dt <= 0) return;
  const L = TRACK.len;
  if (trk.running) trk.t += dt;
  const sec = Math.floor((pr.s / L) * 10);
  if (trk.running) trk.bits |= 1 << Math.min(9, sec);
  // finish line crossed forward (wrap-around of s)
  if (prev > L * 0.8 && pr.s < L * 0.2 && trk.d < TRACK_W) {
    if (!trk.running) { trk.running = true; trk.t = 0; trk.bits = 0; trk.lap = 1; toast('🏁 Los!', 'Runde 1', 1400); audio.chime([523, 784]); }
    else if (trk.bits === 1023) {
      const t = trk.t; trk.last = t;
      const rec = !trk.best || t < trk.best;
      if (rec) { trk.best = t; store.set('bestLap', t); }
      earn(rec ? 600 : 300); st.score += 1000;
      audio.chime([523, 659, 784, 1046]);
      toast(rec ? `🏆 Rekord! ${fmtLap(t)}` : `Runde ${trk.lap}: ${fmtLap(t)}`, rec ? '+600 € · neue Bestzeit' : '+300 €', 3200);
      trk.lap++; trk.t = 0; trk.bits = 0;
    } else { toast('Runde ungültig', 'du hast die Strecke abgekürzt', 2200); trk.t = 0; trk.bits = 0; }
  }
}
function trackHud() {
  const html = trk.running
    ? `<b>🏁 Runde ${trk.lap}</b> · <span class="t">${fmtLap(trk.t)}</span><br>Bestzeit ${trk.best ? fmtLap(trk.best) : '–'}${trk.last ? ' · zuletzt ' + fmtLap(trk.last) : ''}<br>${(trk.s / 1000).toFixed(1)} / ${(TRACK.len / 1000).toFixed(1)} km · <kbd>V</kbd> Stadt`
    : `<b>🏁 Rennstrecke</b> · ${(TRACK.len / 1000).toFixed(1)} km<br>Zeit startet an der Ziellinie<br>Bestzeit ${trk.best ? fmtLap(trk.best) : '–'} · <kbd>V</kbd> Stadt`;
  if (cache.mission !== html) { cache.mission = html; $('mission').innerHTML = html; }
}

/* ------------------------------------------------------------------ on foot, shop, money */
/* ------------------------------------------------------------------ boxing */
let koCount = 0;
function toggleKnife() {
  if (st.mode !== 'walk') return;
  if (st.gun) { st.gun = false; walker.setGun(false); }
  st.knife = !st.knife; walker.setKnife(st.knife);
  fists.children.forEach((f) => f.userData.blade && (f.userData.blade.visible = st.knife));
  toast(st.knife ? '🔪 Messer gezogen' : 'Messer weggesteckt', st.knife ? 'Linke Maus / E / J = zustechen · Kinder und Eltern sind tabu · N = wegstecken' : '', 1600);
}
/* ---- pistol: one shot = dead */
const gunFP = new THREE.Group();
const gunFlashFP = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0xffc040, toneMapped: false, fog: false }));
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x16171a, metalness: 0.8, roughness: 0.3 }), grip = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.6 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.28), dark); slide.position.set(0, 0, -0.1);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, 8), dark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, -0.004, -0.27);
  const gr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), grip); gr.position.set(0, -0.085, 0.01); gr.rotation.x = 0.2;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff })); sight.position.set(0, 0.03, -0.2);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.11), new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.7 })); hand.position.set(0.0, -0.1, 0.03);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.8 })); arm.position.set(0.03, -0.12, 0.3);
  gunFlashFP.rotation.x = -Math.PI / 2; gunFlashFP.position.set(0, 0, -0.42); gunFlashFP.visible = false;
  gunFP.add(slide, barrel, gr, sight, hand, arm, gunFlashFP);
  gunFP.visible = false; camera.add(gunFP);
}
const tracers = [];
function addTracer(x0, y0, z0, x1, y1, z1) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 1;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, len), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.lookAt(x1, y1, z1); scene.add(m);
  tracers.push({ m, t: 0.09 });
}
function toggleGun() {
  if (st.mode !== 'walk') { toast('Pistole nur zu Fuß', 'erst absteigen (F)', 1400); return; }
  st.gun = !st.gun;
  if (st.gun) { st.knife = false; walker.setKnife(false); fists.children.forEach((f) => f.userData.blade && (f.userData.blade.visible = false)); }
  walker.setGun(st.gun); audio.click(1);
  toast(st.gun ? '🔫 Pistole gezogen' : 'Pistole weggesteckt', st.gun ? 'Linke Maus / E / J = schießen (1 Schuss = tot) · Kinder und Eltern sind tabu · Q = wegstecken' : '', 2200);
}
function hitMark(kill) { st.hitT = kill ? 0.5 : 0.22; $('hitmark').classList.toggle('kill', !!kill); audio.click(2); }
const casings = [];
function ejectCasing(x, z, yaw) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.019, 6), new THREE.MeshStandardMaterial({ color: 0xd8a830, metalness: 0.9, roughness: 0.3 }));
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  m.position.set(x + Math.sin(yaw) * 0.4 + rx * 0.2, 1.3, z + Math.cos(yaw) * 0.4 + rz * 0.2);
  scene.add(m);
  casings.push({ m, vx: rx * (1.4 + Math.random()), vy: 1.6 + Math.random(), vz: rz * (1.4 + Math.random()), t: 6, rv: (Math.random() - 0.5) * 20 });
}
function updateCasings(dt) {
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i]; c.t -= dt; c.vy -= 9.8 * dt;
    c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt; c.m.rotation.x += c.rv * dt; c.m.rotation.z += c.rv * dt * 0.7;
    if (c.m.position.y < 0.04) { c.m.position.y = 0.04; c.vy *= -0.35; c.vx *= 0.5; c.vz *= 0.5; c.rv *= 0.4; if (Math.abs(c.vy) < 0.4) { c.vy = 0; c.rv = 0; } }
    if (c.t <= 0) { scene.remove(c.m); c.m.geometry.dispose(); c.m.material.dispose(); casings.splice(i, 1); }
  }
}
const muzzleLight = new THREE.PointLight(0xffb060, 0, 14, 2);
scene.add(muzzleLight);
function resolveShot(ev) {
  audio.shot();
  ejectCasing(ev.x, ev.z, ev.yaw);
  muzzleLight.position.set(ev.x + Math.sin(ev.yaw) * 0.8, 1.35, ev.z + Math.cos(ev.yaw) * 0.8); muzzleLight.intensity = 90; st.muzzleT = 0.06;
  st.xSpread = 1;
  const eyeY = 1.36, fx = Math.sin(ev.yaw), fz = Math.cos(ev.yaw);
  const ox = ev.x + fx * 0.55, oz = ev.z + fz * 0.55;
  // how far does the bullet fly before it hits a wall
  let range = 60;
  const wallAt = (x, z) => { let hit = false; world.colliders.near(x, z, 1, (c) => { if (hit || c.t !== 0) return; if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && Math.max(c.x1 - c.x0, c.z1 - c.z0) > 3) hit = true; }); return hit; };
  for (let d = 0.8; d < 60; d += 0.5) { if (wallAt(ox + fx * d, oz + fz * d)) { range = d; break; } }
  let best = null, bt = 1e9;
  for (const p of peds.list) {
    if (!p.active || p.down > 0 || p.protect) continue;
    const dx = p.x - ox, dz = p.z - oz, t = dx * fx + dz * fz;
    if (t < 0.3 || t > range) continue;
    const lat = Math.abs(dx * fz - dz * fx);
    if (lat < 0.38 + t * 0.015 && t < bt) { bt = t; best = p; }
  }
  const cr = carDmg.ray(ox, oz, fx, fz, Math.min(range, best ? bt : range));
  if (cr && (!best || cr.t < bt)) {
    addTracer(ox, eyeY - 0.1, oz, ox + fx * cr.t, eyeY - 0.15, oz + fz * cr.t);
    smoke.emit(ox + fx * cr.t, 0.9, oz + fz * cr.t, 0, 0.6, 0, 'cig');
    audio.thud(3); carDmg.hit(cr.target, 34, ox, oz); hitMark(false);
    for (let k = 0; k < 4; k++) smoke.spark(ox + fx * cr.t, 0.8 + Math.random() * 0.5, oz + fz * cr.t, -fx * 2 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, -fz * 2 + (Math.random() - 0.5) * 3);
    return;
  }
  const hitD = best ? bt : range;
  addTracer(ox, eyeY - 0.1, oz, ox + fx * hitD, eyeY - 0.1 - (best ? 0.0 : 0), oz + fz * hitD);
  smoke.emit(ox + fx * 0.3, eyeY - 0.1, oz + fz * 0.3, fx * 0.3, 0.1, fz * 0.3, 'cig');
  st.crashT = 0.08; $('crash').style.opacity = 0.12;
  if (!best) { // bullet hit a wall / the ground: dust + sparks at the impact
    const ix = ox + fx * hitD, iz = oz + fz * hitD;
    if (hitD < 59) { for (let k = 0; k < 5; k++) smoke.spark(ix, 1.0 + Math.random() * 0.4, iz, -fx * 2 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, -fz * 2 + (Math.random() - 0.5) * 3); smoke.emit(ix, 1.1, iz, -fx * 0.3, 0.2, -fz * 0.3, 'cig'); }
    return;
  }
  const dx = best.x - ox, dz = best.z - oz, l = Math.hypot(dx, dz) || 1;
  hitMark(true);
  const wasTeen = best.kind === 'teen';
  peds.hit(best, dx, dz, 300, { long: true, gun: true });
  blood.splash(best.x - dx / l * 0.1, 1.15, best.z - dz / l * 0.1, dx / l, dz / l, 24);
  best.bloodPool = blood.pool(best.x, best.z, 1.1);
  st.score = Math.max(0, st.score - 300);
  ems.call(best);
  audio.thud(7);
  toast(wasTeen ? 'Getroffen – tot' : 'Niedergeschossen', wasTeen ? 'die anderen rennen um ihr Leben · Krankenwagen unterwegs · −300 Punkte' : 'Krankenwagen unterwegs · −300 Punkte', 3200);
  if (wasTeen) peds.scareTeens(best);
}
function resolvePunch(ev) {
  const fx = Math.sin(ev.yaw), fz = Math.cos(ev.yaw);
  const knife = st.knife;
  let best = null, bd = 1e9;
  for (const p of peds.list) {
    if (!p.active || p.down > 0 || p.protect) continue; // children and their parents are never targets
    const dx = p.x - ev.x, dz = p.z - ev.z, d = Math.hypot(dx, dz);
    if (d > (knife ? 1.55 : 1.45) || d < 0.05) continue;
    if ((dx * fx + dz * fz) / d < 0.5) continue; // roughly in front
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) {
    const ct = carDmg.nearest(ev.x + fx * 1.0, ev.z + fz * 1.0, 0.7);
    if (ct) { audio.thud(5); st.crashT = 0.1; $('crash').style.opacity = 0.2; carDmg.hit(ct, knife ? 14 : 9, ev.x, ev.z); return; }
    audio.whoosh && audio.whoosh(); return;
  }
  const dx = best.x - ev.x, dz = best.z - ev.z;
  const r = peds.hit(best, dx, dz, knife ? 52 : 12 + Math.random() * 6, { long: knife });
  audio.thud(r === 'ko' ? 9 : 4);
  st.crashT = 0.12; $('crash').style.opacity = 0.25;
  if (knife) {
    const l = Math.hypot(dx, dz) || 1;
    blood.splash(best.x - dx / l * 0.1, 1.15, best.z - dz / l * 0.1, dx / l, dz / l, r === 'ko' ? 26 : 16);
    if (r === 'ko') {
      st.score = Math.max(0, st.score - 250);
      best.bloodPool = blood.pool(best.x, best.z, 1.1);
      ems.call(best);
      toast(best.elder ? (best.kind === 'oma' ? 'Oma niedergestochen' : 'Opa niedergestochen') : 'Niedergestochen', 'liegt blutend am Boden – der Krankenwagen ist unterwegs · −250 Punkte', 3200);
    }
    return;
  }
  if (r === 'ko') {
    koCount++;
    st.score = Math.max(0, st.score - 120);
    toast(best.elder ? (best.kind === 'oma' ? 'Oma K.O.!' : 'Opa K.O.!') : 'K.O.! 🥊', 'liegt am Boden – nicht schön … −120 Punkte', 2600);
  }
}
function setPolice(on) {
  cfg.police = !!on; store.set('police', cfg.police);
  traffic.policeOn = cfg.police;
  $('optPolice').checked = cfg.police;
  const b = $('policeBtn');
  b.textContent = cfg.police ? '🚓 Polizei: an' : '🚓 Polizei: aus';
  b.classList.toggle('off', !cfg.police);
  if (!cfg.police) { st.wanted = 0; st.bustT = 0; traffic.pursuit.active = false; audio.siren(0); }
  if (st.running) toast(cfg.police ? 'Polizei aktiv' : 'Polizei deaktiviert', cfg.police ? 'Sie verfolgt dich nur, wenn du einen Wheelie machst' : '', 1600);
}
$('optPolice').onchange = (e) => setPolice(e.target.checked);
$('policeBtn').onclick = (e) => { setPolice(!cfg.police); e.currentTarget.blur(); };
const WANTED_TIME = 25;
/** police only chase the player after a wheelie; their top speed is 100 km/h */
function updatePolice(dt) {
  const pu = traffic.pursuit;
  if (!cfg.police || st.track) { pu.active = false; st.wanted = 0; audio.siren(0); return; }
  st.copCool = Math.max(0, st.copCool - dt);
  const riding = st.mode === 'ride';
  if (riding && scooter.wheelie > 0.3 && st.copCool <= 0) {
    if (st.wanted <= 0) { toast('🚨 Polizei hat dich gesehen!', 'Sie verfolgt dich mit max. 100 km/h – hänge sie ab!', 2600); audio.beep(); }
    st.wanted = WANTED_TIME;
  }
  if (st.wanted > 0) {
    const ch = traffic.nearestChaser(me.x, me.z);
    // wanted level cools down; much faster once the police are far behind
    const far = !ch || ch.d > 220;
    if (!(riding && scooter.wheelie > 0.3)) st.wanted -= dt * (far ? 2.5 : 1);
    if (ch && ch.d < 7 && me.speed < 3.5) st.bustT += dt; else st.bustT = Math.max(0, st.bustT - dt * 2);
    if (st.bustT > 1.4) {
      const fine = Math.min(Math.floor(st.money), 250);
      earn(-fine);
      st.wanted = 0; st.bustT = 0; st.copCool = 25; st.fines = (st.fines || 0) + 1;
      toast('🚔 Erwischt!', `Strafe: −${fine} € – die Polizei lässt dich 25 s in Ruhe`, 3400);
      audio.thud(8);
    } else if (st.wanted <= 0) {
      st.wanted = 0; st.copCool = 10; st.score += 300;
      toast('Polizei abgehängt!', '+300 Punkte', 2200); audio.chime([523, 659, 784]);
    }
  } else st.bustT = 0;
  pu.active = st.wanted > 0;
  pu.x = me.x; pu.z = me.z;
  const ch = pu.active ? traffic.nearestChaser(me.x, me.z) : null;
  audio.siren(ch ? clamp(1 - ch.d / 260, 0, 1) : 0);
}
// wheelie payout grows with time on the rear wheel (and a bit faster the longer you hold it)
function wheelieEur(dur, one) { return Math.round(dur * (one ? 100 : 40) * (1 + Math.min(dur, 30) / 15)); }
function earn(eur, why) {
  st.money = Math.max(0, st.money + eur);
  store.set('money', Math.floor(st.money));
}
function dismount() {
  if (Math.abs(scooter.v) > 4.5) { toast('Zu schnell zum Absteigen', 'erst unter 15 km/h abbremsen', 1500); return; }
  const h = scooter.heading;
  st.mode = 'walk';
  scooter.parked = true; scooter.v = 0;
  scooter.rider.visible = false;
  const dOff = scooter.model.dismountOff || 0.95;
  walker.place(scooter.x + Math.sin(h) * 0.1 - Math.cos(h) * dOff, scooter.z + Math.cos(h) * 0.1 + Math.sin(h) * dOff, h);
  walker.setVisible(!st.fp);
  camYaw = h;
  applySmoke();
  toast('Abgestiegen', 'WASD laufen · Shift rennen · F wieder aufsteigen', 2600);
}
function mount() {
  const d = Math.hypot(scooter.x - walker.x, scooter.z - walker.z);
  if (d > (scooter.model.mountR || 3.4)) { toast('Zu weit weg', 'geh näher an dein Fahrzeug (F)', 1500); return; }
  st.mode = 'ride'; if (st.knife) { st.knife = false; walker.setKnife(false); } if (st.gun) { st.gun = false; walker.setGun(false); }
  scooter.parked = false; scooter.rider.visible = true; scooter.v = 0;
  walker.setVisible(false);
  camYaw = scooter.heading;
  applySmoke();
  toast('Aufgestiegen', '', 800);
}
function toggleMount() { if (st.mode === 'ride') dismount(); else mount(); }
function setVesc(on) {
  st.vesc = on;
  scooter.setVesc(on);
  shopBeacon.visible = !(on && allOwned());
  $('vescBadge').classList.toggle('hidden', !(on && !scooter.model.noVesc));
}
const OWNED = { g4: () => true, dt3: () => st.dt3, sonic: () => st.sonic, g2: () => st.g2, zt3: () => st.zt3, simson: () => st.simson, sr50: () => st.sr50, schwalbe: () => st.schwalbe, car_mini: () => st.car_mini, car_sedan: () => st.car_sedan, car_suv: () => st.car_suv, car_sport: () => st.car_sport };
const MODEL_ORDER = ['g4', 'g2', 'zt3', 'simson', 'sr50', 'schwalbe', 'dt3', 'sonic', ...CAR_IDS];
const allOwned = () => false; // paint jobs are always for sale, so the shop never runs out
const atShop = () => Math.hypot(me.x - SHOP.x, me.z - SHOP.z) < 9;
function syncModelSelect() {
  const sel = $('optModel');
  for (const id of CAR_IDS) if (![...sel.options].some((o) => o.value === id)) { const o = document.createElement('option'); o.value = id; sel.appendChild(o); }
  for (const o of sel.options) {
    const sm = SHOP_MODELS[o.value];
    if (!sm) continue;
    const own = OWNED[o.value]();
    o.disabled = !own;
    o.textContent = own ? sm.name : `${sm.name} (im Shop kaufen, ${sm.price} €)`;
  }
  sel.value = st.model;
}
$('optModel').onchange = (e) => { const id = e.target.value; if (id === st.model) return; setModel(id); };
function setModel(id, silent) {
  if (!OWNED[id] || !OWNED[id]()) return;
  st.model = id; store.set('model', id);
  scooter.setModel(id);
  $('modelName').textContent = scooter.model.name;
  $('vescBadge').classList.toggle('hidden', !(st.vesc && !scooter.model.noVesc));
  syncModelSelect();
  scooter.hyper = st.track;
  if (!silent) toast(scooter.model.name, scooter.hyperOn ? 'HYPER-MODUS: Shift = bis 5000 km/h · Beschleunigung ohne Ende' : `bis ${Math.round(scooter.topKmh)} km/h${scooter.spec.vT > scooter.spec.vN ? ' Turbo' : ''}`, scooter.hyperOn ? 3600 : 1800);
}
function switchModel() {
  const own = MODEL_ORDER.filter((k) => OWNED[k]());
  if (own.length < 2) { toast('Nur ein Roller', 'Im VESC-Shop gibt es ZT3 Pro, Kukirin G2, Dualtron und Weped Sonic', 2400); return; }
  if (st.mode === 'ride' && Math.abs(scooter.v) > 3) { toast('Erst anhalten', 'zum Roller wechseln unter 10 km/h bremsen', 1500); return; }
  setModel(own[(own.indexOf(st.model) + 1) % own.length]);
}
function buyModel(id) {
  const sm = SHOP_MODELS[id];
  if (st[id]) { toast('Schon gekauft', 'Mit X wechselst du zwischen deinen Rollern', 2200); return; }
  if (st.money < sm.price) { toast('Zu wenig Geld', `Du hast ${Math.floor(st.money)} € – ${sm.name} kostet ${sm.price} €`, 3000); audio.beep(); return; }
  if (st.mode === 'ride' && Math.abs(scooter.v) > 3) { toast('Erst anhalten', 'zum Kaufen kurz abbremsen', 1500); return; }
  earn(-sm.price);
  st[id] = true; store.set(id, true);
  setModel(id, true);
  audio.chime(sm.sound);
  toast(sm.name + '!', `bis ${Math.round(scooter.topKmh)} km/h${scooter.spec.vT > scooter.spec.vN ? ' Turbo' : ''}${id === 'sonic' && !st.vesc ? ' · mit VESC 500 km/h' : ''} · X wechselt den Roller`, 4500);
  if (sm.car && st.mode === 'walk') deliverCar();
  net.sendEvent && net.sendEvent(id);
}
function deliverCar() {
  const o = LAYOUT.dealer.out;
  scooter.reset(DOX + o.x, DOZ + o.z, o.yaw); scooter.parked = true; scooter.v = 0; scooter.rider.visible = false;
  toast('🚗 Dein Auto steht vor dem Autohaus', 'Geh zum Auto und drücke F zum Einsteigen', 4200);
}
const buyDT3 = () => buyModel('dt3'), buySonic = () => buyModel('sonic');
function toggleOneHand() {
  if (st.mode !== 'ride') return;
  scooter.oneHand = !scooter.oneHand;
  toast(scooter.oneHand ? '🖐️ Eine Hand' : '🤲 Beide Hände', scooter.oneHand ? 'Einhand-Wheelie (E) gibt +250 € · nochmal R = beide Hände' : '', 1400);
}
function setWbar(on) {
  cfg.wbar = !!on; store.set('wbar', cfg.wbar);
  scooter.setWbar(cfg.wbar);
  $('optWbar').checked = cfg.wbar;
  if (st.running) toast(cfg.wbar ? 'Wheelie-Bar an' : 'Wheelie-Bar ab', cfg.wbar ? 'begrenzt den Wheelie auf ~32° – sicherer' : 'Wheelie bis fast zum Überschlag', 1700);
}
$('optWbar').onchange = (e) => setWbar(e.target.checked);
$('optBlood').checked = cfg.blood;
blood.setEnabled(cfg.blood);
$('optBlood').onchange = (e) => { cfg.blood = e.target.checked; store.set('blood', cfg.blood); blood.setEnabled(cfg.blood); };
function buyVesc() {
  if (st.vesc) { toast('VESC ist schon verbaut', 'viel Spaß!', 1800); return; }
  if (st.money < VESC_PRICE) { toast('Zu wenig Geld', `Du hast ${Math.floor(st.money)} € – der VESC kostet ${VESC_PRICE} €. Fahre Checkpoints!`, 3000); audio.beep(); return; }
  earn(-VESC_PRICE);
  store.set('vesc', true);
  setVesc(true);
  audio.chime([523, 659, 784, 1046, 1318]);
  toast('VESC eingebaut!', `Turbo bis ${Math.round(scooter.topKmh)} km/h`, 4200);
  net.sendEvent && net.sendEvent('vesc');
}
const shopActors = [];
const interact = buyVesc; // (debug hook name)

/* ------------------------------------------------------------------ stores: take products, basket, pay */
st.basket = []; st.pickT = null; st.tillT = null; st.inSite = null; st.energyT = 0;
const fmtEur = (v) => v.toFixed(2).replace('.', ',') + ' €';
const basketTotal = () => st.basket.reduce((a, b) => a + b.price, 0);
function interactF() {
  const tb = nearestTable();
  if (tb) { openShop(tb); return; }
  if (st.mode === 'walk' && !st.track) {
    if (st.pickT) {
      const pr = shops.take(st.pickT); st.pickT = null;
      st.basket.push({ id: pr.id, name: pr.name, price: pr.price, fx: pr.fx });
      audio.click(1); st.pickFlash = 0.35;
      toast('🧺 ' + pr.name, `${fmtEur(pr.price)} · im Korb: ${st.basket.length} · Summe ${fmtEur(basketTotal())}`, 1100);
      return;
    }
    if (st.tillT && st.basket.length) { payBasket(); return; }
  }
  toggleMount();
}
function payBasket() {
  const total = basketTotal();
  if (st.money < total) { toast('Zu wenig Geld', `Der Einkauf kostet ${fmtEur(total)} – du hast ${Math.floor(st.money)} €. Leere den Korb (I) oder verdiene Geld.`, 3200); audio.beep(); return; }
  earn(-total);
  const n = st.basket.length;
  for (let k = 0; k < Math.min(n, 6); k++) setTimeout(() => audio.scan(), k * 140);
  let extra = '';
  for (const it of st.basket) {
    if (it.fx === 'energy') { st.energyT = 90; extra = ' · ⚡ schneller laufen (90 s)'; }
    if (it.fx === 'vape' && !st.vape) { st.vape = true; store.set('vape', true); extra += ' · 💨 Vape: G = ziehen'; }
    st.score += it.fx === 'misc' ? 10 : 25;
  }
  audio.chime([660, 880]);
  toast('✅ Bezahlt: ' + fmtEur(total), `${n} Artikel${extra}`, 2600);
  st.basket.length = 0; st.paidT = 1;
}
function dropBasket() {
  if (!st.basket.length) return;
  toast('Korb geleert', 'Waren zurückgelegt', 1200); st.basket.length = 0;
}
function updateStore(dt) {
  if (st.energyT > 0) { st.energyT -= dt; if (st.energyT <= 0) toast('Energie weg', '', 900); }
  walker.speedMul = st.energyT > 0 ? 1.35 : 1;
  const site = shops.insideStore(me.x, me.z);
  const key = site ? site.key : null;
  if (st.inSite && !key && st.basket.length) { // left the store with unpaid goods
    const fine = Math.min(Math.floor(st.money), 50 + st.basket.length * 10);
    earn(-fine); const n = st.basket.length; st.basket.length = 0;
    toast('🚨 Ladendiebstahl!', `Der Sicherheitsdienst nimmt dir ${n} Artikel ab und kassiert ${fine} € Strafe`, 3600);
    audio.beep(); audio.thud(6);
  }
  st.inSite = key;
  st.pickT = null; st.tillT = null;
  if (st.mode === 'walk' && site && !st.shopOpen) {
    const yaw = walker.yaw, pitch = -mouse.lookY, cp = Math.cos(pitch);
    st.pickT = shops.pickTarget(walker.x, walker.y + walker.jy + 1.55, walker.z, Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    if (!st.pickT) st.tillT = shops.nearTill(walker.x, walker.z);
  }
  const bk = $('basket'), n = st.basket.length;
  const html = n ? `🧺 <b>${n}</b> Artikel · ${fmtEur(basketTotal())}<small>${st.basket.slice(-4).map((b) => b.name).join(', ')}${n > 4 ? ' …' : ''}</small>` : '';
  if (cache.basket !== html) { cache.basket = html; bk.innerHTML = html; bk.classList.toggle('hidden', !n); }
}

/* ------------------------------------------------------------------ walk-in shop: counters, buying, paint */
const PAINTS = [
  { id: 'orig', name: 'Original', hex: null },
  { id: 'black', name: 'Schwarz', hex: '#14151a' }, { id: 'white', name: 'Weiß', hex: '#f2f2f0' }, { id: 'silver', name: 'Silber', hex: '#c9ccd1' },
  { id: 'red', name: 'Rot', hex: '#d42020' }, { id: 'orange', name: 'Orange', hex: '#ff7a1a' }, { id: 'yellow', name: 'Gelb', hex: '#f0c820' },
  { id: 'lime', name: 'Lime', hex: '#9dff1a' }, { id: 'green', name: 'Grün', hex: '#1fa04a' }, { id: 'cyan', name: 'Cyan', hex: '#17d6ff' },
  { id: 'blue', name: 'Blau', hex: '#1f5cff' }, { id: 'purple', name: 'Violett', hex: '#9a4dff' }, { id: 'pink', name: 'Pink', hex: '#ff4fa3' },
];
const PAINT_PRICE = 100;
st.paint = store.get('paint', {});
st.paintSel = 'g4';
function applyPaint(id) {
  const p = st.paint[id] || {};
  const hx = (v) => { const c = PAINTS.find((q) => q.id === v); return c && c.hex ? parseInt(c.hex.slice(1), 16) : null; };
  scooter.setPaint(id, hx(p.body), hx(p.accent));
}
function buyPaint(id, part, colorId) {
  if (!OWNED[id] || !OWNED[id]()) return;
  const cur = (st.paint[id] || {})[part] || 'orig';
  if (cur === colorId) { toast('Schon lackiert', '', 900); return; }
  const price = colorId === 'orig' ? 0 : PAINT_PRICE;
  if (st.money < price) { toast('Zu wenig Geld', `Lackierung kostet ${PAINT_PRICE} €`, 1800); audio.beep(); return; }
  if (price) earn(-price);
  st.paint[id] = { ...(st.paint[id] || {}), [part]: colorId };
  store.set('paint', st.paint);
  applyPaint(id);
  audio.chime([660, 880]);
  toast(`🎨 ${PAINTS.find((q) => q.id === colorId).name}`, price ? `−${price} €` : 'Werkslackierung', 1200);
  renderShop();
}
const DL = LAYOUT.dealer, DOX = P * 1, DOZ = P * 1; // the dealership is block (1,1)
const DEALER_TABLES = [{ id: 'cars', shop: 3, name: 'Autohaus – Fahrzeuge', x: DOX + DL.desk.x, z: DOZ + DL.desk.z, hx: 2.4, hz: 1.2 }, ...DL.cars.map((c) => ({ id: 'cars', shop: 3, name: 'Autohaus – ' + CARS[c.id].name, x: DOX + c.x, z: DOZ + c.z, hx: 2.5, hz: 2.5 }))];
const ALL_TABLES = [...SHOP_TABLES, ...SHOP2_TABLES, ...DEALER_TABLES];
function nearestTable() {
  if (st.track || st.shopOpen) return null;
  for (const t of ALL_TABLES) {
    const dx = Math.max(Math.abs(me.x - t.x) - (t.hx || 1.75), 0), dz = Math.max(Math.abs(me.z - t.z) - (t.hz || 0.68), 0);
    if (Math.hypot(dx, dz) < 1.6) return t;
  }
  return null;
}
function openShop(t) {
  st.shopOpen = true; st.shopTab = t.id; st.paintSel = st.model;
  renderShop();
  $('shop').classList.remove('hidden');
  setPaused(true);
}
function closeShop() {
  st.shopOpen = false;
  $('shop').classList.add('hidden');
  setPaused(false);
  lockMouse();
}
function renderShop() {
  const t = ALL_TABLES.find((q) => q.id === st.shopTab) || SHOP_TABLES[0];
  const el = $('shopBody');
  const money = Math.floor(st.money).toLocaleString('de-DE');
  let h = `<div class="shead"><h2>🛒 ${t.name}</h2><div class="smoney">${money} €</div><button id="shopClose" class="ghost">Schließen (Esc)</button></div>`;
  const tabs = ALL_TABLES.filter((q) => (q.shop || 1) === (t.shop || 1)).map((q) => `<button class="stab ${q.id === t.id ? 'on' : ''}" data-tab="${q.id}">${q.name}</button>`).join('');
  h += `<div class="stabs">${tabs}</div>`;
  if (t.id === 'parts') {
    h += `<div class="srow"><div class="sinfo"><b>VESC-Controller Umbau</b><small>Turbo schneller: G4 150 km/h · Dualtron 235 km/h · Sonic 500 km/h · ZT3 Pro & G2 70 km/h. Gilt für alle Roller.</small></div>`
      + (st.vesc ? `<span class="sown">✓ eingebaut</span>` : `<button class="buy" data-act="vesc" ${st.money < VESC_PRICE ? 'data-poor="1"' : ''}>Kaufen · ${VESC_PRICE} €</button>`) + `</div>`;
    h += `<div class="srow"><div class="sinfo"><b>Wheelie-Bar</b><small>Stützrad hinten (an/aus mit H) – gratis dabei.</small></div><span class="sown">✓ dabei</span></div>`;
  } else if (t.id === 'moped') {
    const mopeds = [['simson', 'Simson S51 Enduro', 'Der Klassiker: 50-cm³-Zweitakter, <b>60 km/h</b>.'], ['sr50', 'Simson SR50', 'Sportliches Roller-Moped in Orange, <b>63 km/h</b>.'], ['schwalbe', 'Simson Schwalbe KR51', 'Der Kultroller mit Verkleidung und Beinschild, <b>61 km/h</b>.']];
    for (const [id, name, info] of mopeds) {
      const price = SHOP_MODELS[id].price;
      h += `<div class="srow"><div class="sinfo"><b>${name}</b><small>${info} Auspuff qualmt · <b>kein VESC</b> (Moped!) · mit MTX10 <b>150 km/h</b>.</small></div>`
        + (st.model === id ? `<span class="sown">● aktiv</span>` : st[id] ? `<button class="buy" data-act="use" data-id="${id}">Fahren</button>` : `<button class="buy" data-act="buy" data-id="${id}" ${st.money < price ? 'data-poor="1"' : ''}>Kaufen · ${price} €</button>`) + `</div>`;
    }
    h += `<div class="srow"><div class="sinfo"><b>Helm & Handschuhe</b><small>Gratis dabei – du trägst beides schon.</small></div><span class="sown">✓ dabei</span></div>`;
  } else if (t.id === 'tuning') {
    h += `<div class="srow"><div class="sinfo"><b>MTX10 Motor-Tuning</b><small>Großer Zylinder, Vergaser, roter Resonanzauspuff: <b>85 km/h</b> statt 60, kräftigere Beschleunigung, mehr Qualm. Für die Simson S51.</small></div>`
      + (st.mtx ? `<span class="sown">✓ eingebaut</span>` : `<button class="buy" data-act="up" data-id="mtx" ${st.money < MTX_PRICE ? 'data-poor="1"' : ''}>Kaufen · ${MTX_PRICE} €</button>`) + `</div>`;
    h += `<div class="srow"><div class="sinfo"><b>PZ-Tuning Lenker</b><small>Breiter, flacher Rennlenker mit Querstrebe und goldenen Klemmen – lenkt direkter (mehr Kurvengrip).</small></div>`
      + (st.pz ? `<span class="sown">✓ montiert</span>` : `<button class="buy" data-act="up" data-id="pz" ${st.money < PZ_PRICE ? 'data-poor="1"' : ''}>Kaufen · ${PZ_PRICE} €</button>`) + `</div>`;
    h += (st.simson || st.sr50 || st.schwalbe) ? '' : `<div class="srow"><div class="sinfo"><small>Du besitzt noch keine Simson – die Teile werden eingebaut, sobald du sie hast.</small></div></div>`;
  } else if (t.id === 'cars') {
    h += `<div class="srow"><div class="sinfo"><small>Alle Autos fahren mit <b>WASD</b>, Shift = Sport. Gekaufte Autos stehen vor dem Autohaus. <b>C</b> = Ich-Perspektive.</small></div></div>`;
    for (const id of CAR_IDS) {
      const c = CARS[id];
      h += `<div class="srow"><div class="sinfo"><b>${c.name}</b><small>${c.info}</small></div>`
        + (st.model === id ? `<span class="sown">● aktiv</span>` : st[id] ? `<button class="buy" data-act="use" data-id="${id}">Fahren</button>` : `<button class="buy" data-act="buy" data-id="${id}" ${st.money < c.price ? 'data-poor="1"' : ''}>Kaufen · ${c.price.toLocaleString('de-DE')} €</button>`) + `</div>`;
    }
  } else if (t.id === 'kiosk') {
    h += `<div class="srow"><div class="sinfo"><b>Zigaretten (20 Stück)</b><small>Du hast <b>${st.cigs}</b>. Mit <b>Z</b> zündest du dir eine an (brennt ~45 s, Rauch steigt auf). Rauchen schadet der Gesundheit.</small></div><button class="buy" data-act="cig" ${st.money < CIG_PRICE ? 'data-poor="1"' : ''}>Kaufen · ${CIG_PRICE} €</button></div>`;
    h += `<div class="srow"><div class="sinfo"><b>Vape</b><small>Mit <b>G</b> ziehst du – dicke weiße Wolke, leuchtende LED, unbegrenzt nutzbar.</small></div>` + (st.vape ? `<span class="sown">✓ gekauft</span>` : `<button class="buy" data-act="vape" ${st.money < VAPE_PRICE ? 'data-poor="1"' : ''}>Kaufen · ${VAPE_PRICE} €</button>`) + `</div>`;
  } else if (t.id === 'scooters') {
    const rows = [['g4', 'KuKirin G4', 0, 'Starter · 65 km/h (Turbo 100) · VESC 150'], ['zt3', 'ZT3 Pro', SHOP_MODELS.zt3.price, '40 km/h · VESC 70'], ['g2', 'Kukirin G2', SHOP_MODELS.g2.price, '55 km/h · VESC 70'], ['dt3', 'Dualtron Thunder 3', SHOP_MODELS.dt3.price, '110 km/h (Turbo 170) · VESC 235'], ['sonic', 'Weped Sonic', SHOP_MODELS.sonic.price, '200 km/h (Turbo 300) · VESC 500 · Rennstrecke: bis 5000 km/h']];
    for (const [id, name, price, info] of rows) {
      const own = OWNED[id]();
      const btn = st.model === id ? `<span class="sown">● aktiv</span>` : own ? `<button class="buy" data-act="use" data-id="${id}">Fahren</button>` : `<button class="buy" data-act="buy" data-id="${id}" ${st.money < price ? 'data-poor="1"' : ''}>Kaufen · ${price} €</button>`;
      h += `<div class="srow"><div class="sinfo"><b>${name}</b><small>${info}</small></div>${btn}</div>`;
    }
  } else {
    const own = MODEL_ORDER.filter((k) => OWNED[k]() && !(scooter.models[k] && scooter.models[k].noPaint));
    if (!own.includes(st.paintSel)) st.paintSel = st.model;
    h += `<div class="srow"><div class="sinfo"><b>Roller wählen</b><small>Farbe ändern kostet ${PAINT_PRICE} € pro Teil (Werkslackierung gratis).</small></div><select id="paintSel">${own.map((k) => `<option value="${k}" ${k === st.paintSel ? 'selected' : ''}>${SHOP_MODELS[k] ? SHOP_MODELS[k].name : 'KuKirin G4'}</option>`).join('')}</select></div>`;
    const cur = st.paint[st.paintSel] || {};
    for (const [part, label] of [['body', 'Rahmen & Karosserie'], ['accent', 'Akzente (Federn, Zierteile)']]) {
      h += `<div class="sinfo" style="margin:10px 4px 4px"><b>${label}</b></div><div class="swatches">`;
      for (const c of PAINTS) h += `<button class="sw ${(cur[part] || 'orig') === c.id ? 'on' : ''}" data-act="paint" data-part="${part}" data-color="${c.id}" title="${c.name}${c.hex ? ' · ' + PAINT_PRICE + ' €' : ''}" style="background:${c.hex || 'conic-gradient(#14151a,#ff7a1a,#f2f2f0,#14151a)'}"></button>`;
      h += `</div>`;
    }
  }
  if (st.shopMsg) h = h.replace('</div><div class="stabs">', `</div><div class="smsg">${st.shopMsg}</div><div class="stabs">`);
  el.innerHTML = h;
  el.querySelectorAll('[data-poor]').forEach((b) => b.classList.add('poor'));
  el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { st.shopTab = b.dataset.tab; renderShop(); }));
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'vesc') { buyVesc(); renderShop(); }
    else if (a === 'buy') { buyModelUI(b.dataset.id); }
    else if (a === 'use') { setModel(b.dataset.id); if (SHOP_MODELS[b.dataset.id].car && st.mode === 'walk') deliverCar(); renderShop(); }
    else if (a === 'up') buyUpgrade(b.dataset.id);
    else if (a === 'cig') { if (st.money >= CIG_PRICE) { earn(-CIG_PRICE); st.cigs += 20; store.set('cigs', st.cigs); audio.chime([523, 659]); renderShop(); } }
    else if (a === 'vape') { if (st.money >= VAPE_PRICE) { earn(-VAPE_PRICE); st.vape = true; store.set('vape', true); audio.chime([523, 659, 880]); toast('💨 Vape gekauft', 'G = ziehen', 2400); renderShop(); } }
    else if (a === 'paint') buyPaint(st.paintSel, b.dataset.part, b.dataset.color);
  }));
  const sel = $('paintSel'); if (sel) sel.onchange = () => { st.paintSel = sel.value; renderShop(); };
  $('shopClose').onclick = closeShop;
}
function buyUpgrade(id) {
  const price = id === 'mtx' ? MTX_PRICE : PZ_PRICE;
  if (st[id]) return;
  if (st.money < price) { toast('Zu wenig Geld', `${id === 'mtx' ? 'MTX10' : 'PZ-Lenker'} kostet ${price} €`, 2000); audio.beep(); return; }
  earn(-price); st[id] = true; store.set(id, true);
  scooter.setSimsonUpgrades(st.mtx, st.pz);
  audio.chime([392, 523, 784]);
  toast(id === 'mtx' ? '🔧 MTX10 eingebaut' : '🔧 PZ-Lenker montiert', id === 'mtx' ? 'Mopeds jetzt bis 150 km/h' : 'mehr Grip in Kurven', 2600);
  renderShop();
}
/* ---- cigarette: Z = light it / take a drag, Y = put it out */
const cigFP = new THREE.Group(); // visible in first person (child of the camera)
const cigFPEmber = new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false });
const cigFPTip = new THREE.Object3D();
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.9 })); body.position.z = -0.08;
  const filt = new THREE.Mesh(new THREE.CylinderGeometry(0.0086, 0.0086, 0.05, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8a860, roughness: 0.9 })); filt.position.z = 0.0;
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.00775, 0.00775, 0.012, 12).rotateX(Math.PI / 2), cigFPEmber); ember.position.z = -0.166;
  cigFPTip.position.z = -0.175;
  cigFP.add(body, filt, ember, cigFPTip);
  cigFP.visible = false; camera.add(cigFP);
  for (const m of cigFP.children) m.renderOrder = 5;
}
function smokeKey() {
  if (st.smokeT > 0) {
    if (st.dragT >= 0) return; // already drawing
    st.dragT = 0; st.dragPuff = 0;
    return;
  }
  if (st.cigs <= 0) { toast('Keine Zigaretten mehr', 'Am Kiosk im Simson-Laden gibt es Nachschub (8 €)', 2200); return; }
  st.cigs--; store.set('cigs', st.cigs); st.smokeT = 60; st.puffT = 3; st.dragT = -1;
  applySmoke(); toast('🚬 Zigarette an', `noch ${st.cigs} · Z = ziehen · Y = ausdrücken`, 2200);
}
const toggleSmoke = smokeKey;
/* ---- vape: G = take a drag (big white cloud) */
st.vape = store.get('vape', false); st.vapeT = -1;
const vapeFP = buildVape(-1, 1.15);
vapeFP.group.visible = false; camera.add(vapeFP.group); for (const m of vapeFP.group.children) m.renderOrder = 5;
function vapeKey() {
  if (st.track || st.shopOpen || st.paused) return;
  if (!st.vape) { toast('Du hast keine Vape', 'Gibt es im Kiosk (Simson-Laden) und im Supermarkt / an der Tankstelle', 2600); return; }
  if (st.vapeT >= 0) return;
  st.vapeT = 0; audio.vape();
}
function updateVape(dt) {
  const fp = st.fp && !st.dbgCam, walking = st.mode === 'walk';
  if (st.vapeT < 0) { if (scooter.vape.visible) scooter.vape.visible = false; if (walker.model.vape.visible) walker.model.vape.visible = false; if (vapeFP.group.visible) vapeFP.group.visible = false; return; }
  st.vapeT += dt;
  const t = st.vapeT;
  const amt = t < 0.7 ? t / 0.7 : t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 0.5);
  const glow = t < 1.5 ? Math.min(1, t / 0.5) : Math.max(0, 1 - (t - 1.5) / 0.7);
  const show = t < 2.3;
  walker.model.vape.visible = show && walking; scooter.vape.visible = show && !walking && !fp; vapeFP.group.visible = show && fp;
  _vc.setRGB(0.25 + 0.6 * glow, 0.1 + 0.2 * glow, 0.5 + 0.5 * glow);
  scooter.vapeLed.color.copy(_vc); walker.model.vapeLed.color.copy(_vc); vapeFP.led.color.copy(_vc);
  scooter.dragAmt = Math.max(scooter.dragAmt || 0, amt); walker.model.dragAmt = Math.max(walker.model.dragAmt || 0, amt);
  if (fp) { vapeFP.group.position.set(0.045 - 0.04 * amt, -0.085 + 0.03 * amt, -0.2); vapeFP.group.rotation.set(0.0 + 0.1 * amt, 0.12 - 0.1 * amt, -0.05); }
  if (t > 1.5 && t < 3.9) { // exhale a big cloud
    st.vapAcc = (st.vapAcc || 0) + 55 * dt;
    while (st.vapAcc >= 1) {
      st.vapAcc--;
      let dx, dy, dz;
      if (fp) { camera.getWorldDirection(_fw); _sp.copy(camera.position).addScaledVector(_fw, 0.4); _sp.y -= 0.08; dx = _fw.x * 1.1; dy = 0.08; dz = _fw.z * 1.1; }
      else { const yw = walking ? walker.yaw : scooter.heading; (walking ? walker.model.vapeTip : scooter.vapeTip).getWorldPosition(_sp); _sp.x += Math.sin(yw) * 0.12; _sp.z += Math.cos(yw) * 0.12; dx = Math.sin(yw) * 1.1; dy = 0.2; dz = Math.cos(yw) * 1.1; }
      smoke.emit(_sp.x, _sp.y, _sp.z, dx + (Math.random() - 0.5) * 0.4, dy, dz + (Math.random() - 0.5) * 0.4, 'vape', 1);
    }
  }
  if (t > 4.2) { st.vapeT = -1; if (st.smokeT <= 0) { scooter.dragAmt = 0; walker.model.dragAmt = 0; } }
}
const _vc = new THREE.Color();
function putOut() {
  if (st.smokeT <= 0) return;
  st.smokeT = 0; st.dragT = -1; applySmoke(); toast('Zigarette ausgedrückt', '', 1100);
}
function applySmoke() {
  const on = st.smokeT > 0;
  scooter.setSmoking(on);
  walker.model.cig.visible = on && st.mode === 'walk';
  if (!on) { scooter.dragAmt = 0; walker.model.dragAmt = 0; cigFP.visible = false; }
}
const _fw = new THREE.Vector3();
function updateSmoke(dt) {
  const active = st.running && !st.paused;
  if (active && scooter.model.car && st.mode === 'ride') {
    const m = scooter.model, thr = scooter.thr || 0, sp = Math.abs(scooter.v);
    st.exAcc = (st.exAcc || 0) + (3 + thr * 26 + Math.min(sp, 40) * 0.25) * dt * (m.dims.sport ? 1.4 : 1);
    while (st.exAcc >= 1) {
      st.exAcc--;
      const pipe = m.exhaust.pipes[Math.floor(Math.random() * m.exhaust.pipes.length)];
      _sp.copy(pipe); m.group.localToWorld(_sp);
      const sh = Math.sin(scooter.heading), ch = Math.cos(scooter.heading);
      smoke.emit(_sp.x, _sp.y, _sp.z, -sh * (0.7 + thr * 1.6) + sh * scooter.v * 0.35, 0.3 + thr * 0.4, -ch * (0.7 + thr * 1.6) + ch * scooter.v * 0.35, 'exhaust', Math.min(1, 0.25 + thr * 0.9));
    }
  }
  if (active && scooter.model.moped && st.mode === 'ride') {
    const m = scooter.model, up = st.mtx, thr = scooter.thr || 0;
    st.exAcc = (st.exAcc || 0) + (4 + thr * 24 + (up ? 6 : 0) + Math.min(Math.abs(scooter.v), 15) * 0.4) * dt;
    while (st.exAcc >= 1) {
      st.exAcc--;
      _sp.copy(up ? m.exhaust.mtx : m.exhaust.stock); m.group.localToWorld(_sp);
      const sh = Math.sin(scooter.heading), ch = Math.cos(scooter.heading);
      smoke.emit(_sp.x, _sp.y, _sp.z, -sh * (0.5 + thr * 1.1) + sh * scooter.v * 0.4, 0.28 + thr * 0.3, -ch * (0.5 + thr * 1.1) + ch * scooter.v * 0.4, 'exhaust', Math.min(1, 0.2 + thr * 0.8 + (up ? 0.2 : 0)));
    }
  }
  if (st.smokeT > 0 && active) {
    const walking = st.mode === 'walk', fp = st.fp && !st.dbgCam;
    st.smokeT -= dt;
    // --- drag animation: inhale (0..0.8 s, ember glows) -> hold (..1.3) -> exhale (..3.2)
    let amt = 0, glow = 0;
    if (st.dragT >= 0) {
      st.dragT += dt;
      const t = st.dragT;
      amt = t < 0.8 ? t / 0.8 : t < 1.3 ? 1 : Math.max(0, 1 - (t - 1.3) / 0.5);
      glow = t < 1.3 ? Math.min(1, t / 0.6) : Math.max(0, 1 - (t - 1.3) / 1.2);
      if (t > 1.3) { // exhale a long cloud
        st.exhAcc = (st.exhAcc || 0) + 26 * dt;
        while (st.exhAcc >= 1) {
          st.exhAcc--;
          let dx, dy, dz;
          if (fp) { camera.getWorldDirection(_fw); _sp.copy(camera.position).addScaledVector(_fw, 0.38); _sp.y -= 0.09; dx = _fw.x * 0.9; dy = 0.05; dz = _fw.z * 0.9; }
          else { (walking ? walker.model.cigTip : scooter.cigTip).getWorldPosition(_sp); const yw = walking ? walker.yaw : scooter.heading; dx = Math.sin(yw) * 0.9; dy = 0.18; dz = Math.cos(yw) * 0.9; }
          smoke.emit(_sp.x, _sp.y, _sp.z, dx, dy, dz, 'cig', 2);
        }
      }
      if (t > 3.2) { st.dragT = -1; st.smokeT = Math.max(0, st.smokeT - 4); } // every drag burns the cigarette down a bit
    }
    scooter.dragAmt = amt; walker.model.dragAmt = amt;
    const ec = _ec.setRGB(1, 0.42 + 0.5 * glow, 0.1 + 0.55 * glow);
    scooter.cigEmber.color.copy(ec); walker.model.cigEmber.color.copy(ec); cigFPEmber.color.copy(ec);
    scooter.cigEmberMesh.scale.setScalar(1 + glow * 0.5);
    // --- first-person cigarette in the lower right of the view, lifts toward the face while drawing
    cigFP.visible = fp;
    if (fp) {
      cigFP.position.set(0.05 - 0.04 * amt, -0.092 + 0.025 * amt, -0.21);
      cigFP.rotation.set(0.0 + 0.08 * amt, 0.16 - 0.08 * amt, -0.04);
      cigFP.getWorldPosition(_sp); cigFPTip.getWorldPosition(_sp);
    } else (walking ? walker.model.cigTip : scooter.cigTip).getWorldPosition(_sp);
    // idle wisp from the ember
    st.cigAcc = (st.cigAcc || 0) + (4 + glow * 14) * dt;
    while (st.cigAcc >= 1) { st.cigAcc--; smoke.emit(_sp.x, _sp.y, _sp.z, 0, 0.12 + glow * 0.1, 0, 'cig'); }
    // casual puff now and then
    st.puffT -= dt;
    if (st.puffT <= 0 && st.dragT < 0) { st.puffT = 9 + Math.random() * 5; st.dragT = 0; }
    if (st.smokeT <= 0) { st.dragT = -1; applySmoke(); toast('Zigarette aufgeraucht', '', 1200); }
  } else if (st.smokeT <= 0 && cigFP.visible) cigFP.visible = false;
  updateVape(dt);
  smoke.update(dt);
}
const _ec = new THREE.Color();
const _sp = new THREE.Vector3();
function shopFlash(msg) { st.shopMsg = msg; renderShop(); clearTimeout(st.shopMsgT); st.shopMsgT = setTimeout(() => { st.shopMsg = ''; if (st.shopOpen) renderShop(); }, 2200); }
function buyModelUI(id) { const v = scooter.v; scooter.v = 0; buyModel(id); scooter.v = v; renderShop(); }
// interior light so the shop is not dark in daylight
const shopLight = new THREE.PointLight(0xfff1d8, 0, 34, 1.6);
shopLight.position.set((SHOP_IN.x0 + SHOP_IN.x1) / 2, 4.0, (SHOP_IN.z0 + SHOP_IN.z1) / 2);
scene.add(shopLight);
const shopLight2 = new THREE.PointLight(0xfff1d8, 0, 34, 1.6);
shopLight2.position.set((SHOP2_IN.x0 + SHOP2_IN.x1) / 2, 4.0, (SHOP2_IN.z0 + SHOP2_IN.z1) / 2);
scene.add(shopLight2);

/* ------------------------------------------------------------------ camera */
let camYaw = 0, camDist = 3.2, shakeT = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const fpAnchor = new THREE.Object3D();
scooter.root.add(fpAnchor);
fpAnchor.position.set(0, 1.55, -0.12);
const FP_DEF = { y: 1.55, pitch: 0.36 };
// first-person fists (only while on foot)
const fists = new THREE.Group();
{
  const gl = new THREE.MeshStandardMaterial({ color: 0xcc1c1c, roughness: 0.5 }), cf = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.8 });
  for (const sx of [-1, 1]) {
    const f = new THREE.Group();
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.17), gl); fist.position.z = 0.0;
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.1), gl); thumb.position.set(-sx * 0.05, 0.06, -0.02);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), cf); arm.position.z = 0.37;
    const blade = new THREE.Group(); blade.visible = false; f.userData.blade = blade;
    { const bm = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.95, roughness: 0.15 }); const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.4), bm); b1.position.set(0, 0.0, -0.3); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), cf); hd.position.set(0, 0, -0.1); blade.add(b1, hd); }
    f.add(fist, thumb, arm); if (sx < 0) f.add(blade); f.userData.sx = sx; fists.add(f);
  }
  fists.visible = false; scene.add(camera); camera.add(fists);
}
function updateFists() {
  for (let i = tracers.length - 1; i >= 0; i--) { const tr = tracers[i]; tr.t -= 0.016; tr.m.material.opacity = Math.max(0, tr.t / 0.09); if (tr.t <= 0) { scene.remove(tr.m); tr.m.geometry.dispose(); tr.m.material.dispose(); tracers.splice(i, 1); } }
  const showGun = st.mode === 'walk' && st.fp && st.gun && !st.dbgCam;
  gunFP.visible = showGun;
  if (showGun) {
    const r = walker.recoil || 0;
    const rel = walker.reloadT > 0 ? Math.sin(Math.min(1, (1.5 - walker.reloadT) / 1.5) * Math.PI) : 0;
    const mv = Math.min(1, walker.speed / 1.8) * (walker.running ? 1.6 : 1);
    const dyaw = wrapAngle(walker.yaw - (st.lastYaw ?? walker.yaw)); st.lastYaw = walker.yaw;
    st.swayY = damp(st.swayY || 0, clamp(-dyaw * 3.2, -0.12, 0.12), 8, 0.016);
    gunFP.position.set(0.1 + Math.cos(walker.phase) * 0.012 * mv + st.swayY * 0.5, -0.15 + r * 0.02 - rel * 0.17 + Math.abs(Math.sin(walker.phase)) * 0.014 * mv, -0.34 + r * 0.1);
    gunFP.rotation.set(0.04 + r * 0.32 + rel * 0.55, 0.03 - st.swayY, rel * 0.35);
    gunFlashFP.visible = walker.flashT > 0;
  }
  const on = st.mode === 'walk' && st.fp && walker.guardAmt > 0.02 && !st.dbgCam;
  fists.visible = on;
  if (!on) return;
  fists.children.forEach((f, i) => {
    const sx = f.userData.sx, side = sx > 0 ? 0 : 1; // arm index
    const e = walker.punchSide === i ? walker.punchExt : 0;
    const g = walker.guardAmt;
    f.position.set(sx * (0.2 - 0.12 * e), -0.2 + 0.05 * e + (1 - g) * -0.3, -(0.45 + 0.55 * e));
    f.rotation.set(0.25 * (1 - e), sx * -0.35 * (1 - e), 0);
  });
}
const fpLook = new THREE.Object3D();
fpLook.rotation.y = Math.PI; // camera looks down -z, scooter forward is +z
fpAnchor.add(fpLook);
const _tmpA = new THREE.Vector3(), _tmpQ = new THREE.Quaternion(), _e2 = new THREE.Euler();

function insideCollider(x, z, pad) {
  let hit = false;
  world.colliders.near(x, z, 1, (c) => {
    if (hit) return;
    if (c.t === 0) { if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) hit = true; }
  });
  return hit;
}
function updateCamera(dt, first) {
  const s = scooter;
  updateFists();
  if (!st.started && !st.dbgCam) {
    const a = performance.now() * 0.00012 + 0.6;
    const dist = 5.2;
    camera.position.set(s.x + Math.sin(a) * dist, 1.5 + Math.sin(a * 0.7) * 0.25, s.z + Math.cos(a) * dist);
    camera.lookAt(s.x, 0.85, s.z);
    camera.fov = 48;
    camera.updateProjectionMatrix();
    return;
  }
  if (st.dbgCam) {
    camera.position.set(...st.dbgCam.pos);
    camera.lookAt(...st.dbgCam.look);
    camera.fov = st.dbgCam.fov || 50;
    camera.updateProjectionMatrix();
    return;
  }
  const zoom = st.zoom || 1;
  if (st.mode === 'walk') { // on foot
    camYaw = walker.yaw;
    mouse.lookY = clamp(mouse.lookY, -0.5, 0.5);
    if (st.fp) {
      walker.setVisible(false);
      const bobA = Math.min(1, walker.speed / 1.6) * (walker.running ? 1.7 : 1);
      const sideB = Math.cos(walker.phase) * 0.014 * bobA;
      camera.position.set(walker.x + Math.sin(camYaw) * 0.12 + Math.cos(camYaw) * sideB, walker.y + walker.jy + 1.64 + Math.sin(walker.phase * 2) * 0.016 * bobA - st.landDip, walker.z + Math.cos(camYaw) * 0.12 - Math.sin(camYaw) * sideB);
      camera.rotation.set(-mouse.lookY - walker.recoil * 0.035, camYaw + Math.PI, Math.sin(walker.phase) * 0.006 * bobA, 'YXZ');
    } else {
      walker.setVisible(true);
      const dist = 3.4 * zoom;
      const sinY = Math.sin(camYaw), cosY = Math.cos(camYaw);
      let f = 1, px, pz;
      for (let i = 0; i < 6; i++) { px = walker.x - sinY * dist * f; pz = walker.z - cosY * dist * f; if (!insideCollider(px, pz, 0.3)) break; f -= 0.17; }
      f = Math.max(f, 0.2);
      px = walker.x - sinY * dist * f; pz = walker.z - cosY * dist * f;
      const py = Math.max(walker.y + walker.jy + 1.5 + dist * f * 0.18 + mouse.lookY * 2, groundHeight(px, pz) + 0.4);
      camera.position.set(px, py, pz);
      camera.lookAt(walker.x + sinY * 0.6, walker.y + 1.35, walker.z + cosY * 0.6);
    }
    camera.fov = lerp(camera.fov, walker.running ? 72 : 66, 0.1);
    camera.updateProjectionMatrix();
    return;
  }
  const k = first ? 1 : 1 - Math.exp(-dt * 4.2);
  camYaw = wrapAngle(camYaw + wrapAngle(s.heading - camYaw) * k);
  const spd = Math.abs(s.v);
  const baseFov = 62 + (s.kmh / s.topKmh) * 26 + (s.boosting ? 4 : 0);
  if (st.fp) {
    mouse.lookY = damp(mouse.lookY, 0, 1.5, dt);
    const fpp = s.model.fp || FP_DEF;
    fpAnchor.position.set(fpp.x || 0, fpp.y, fpp.z !== undefined ? fpp.z : -0.12);
    fpAnchor.rotation.set(s.pitch * 0.4 + fpp.pitch + mouse.lookY - s.wheelie * 0.3, 0, -s.lean * 0.5, 'YXZ');
    scooter.root.updateMatrixWorld(true);
    fpLook.getWorldPosition(camera.position);
    fpLook.getWorldQuaternion(camera.quaternion);
    const sh = s.shake * 0.04 + Math.min(spd, 140) * 0.0007;
    camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh;
    camera.fov = lerp(camera.fov, baseFov + 6 + (s.model.fovAdd || 0), 0.1);
  } else {
    const cmul = s.model.camMul || 1;
    const dist = (3.5 + Math.min(spd / s.vTurbo, 1) * 1.8) * zoom * cmul;
    camDist = damp(camDist, dist, 3, dt);
    const h = (1.95 + Math.min(spd / s.vTurbo, 1) * 0.4) * (0.7 + 0.3 * zoom) * (cmul > 1 ? 1 + (cmul - 1) * 0.55 : 1);
    const sinY = Math.sin(camYaw), cosY = Math.cos(camYaw);
    const tx = s.x + sinY * 3.4, tz = s.z + cosY * 3.4, ty = (s.yOff || 0) - 0.3;
    let f = 1;
    let px, pz;
    for (let i = 0; i < 6; i++) {
      px = s.x - sinY * camDist * f; pz = s.z - cosY * camDist * f;
      if (!insideCollider(px, pz, 0.35)) break;
      f -= 0.17;
    }
    f = Math.max(f, 0.15);
    px = s.x - sinY * camDist * f; pz = s.z - cosY * camDist * f;
    const py = Math.max((s.yOff || 0) + h * (0.55 + 0.45 * f), groundHeight(px, pz) + 0.35);
    camera.position.set(px, py, pz);
    const sh = s.shake * 0.12 + Math.min(spd, 140) * 0.0009;
    camera.position.x += (Math.random() - 0.5) * sh;
    camera.position.y += (Math.random() - 0.5) * sh;
    camera.lookAt(tx, ty, tz);
    camera.rotateZ(-s.lean * 0.12);
    camera.fov = lerp(camera.fov, baseFov + (s.model.car ? 12 : 0), 0.1);
  }
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ HUD */
const cache = {};
function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
const arcLen = 90 * Math.PI * 1.5; // 270° arc
const mapCtx = $('map').getContext('2d');
let mapT = 0;
const trkTmp = [];
const BLOCK_COL = { supermarket: '#2f8a4a', gasstation: '#a83030', dealer: '#2a8fb0', mopedshop: '#2a6aa8', perimeter: '#4a5463', houses: '#6b6454', park: '#3d6a3e', modern: '#46647a', shop: '#7d6f56', vescshop: '#b3601c' };
function drawMap() {
  const c = mapCtx, W = 356, s = 0.9; // px per metre (retina 2x of 178)
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = st.track ? '#2e4a30' : '#262c36'; c.fillRect(0, 0, W, W);
  const sx = me.x, sz = me.z, psi = me.heading;
  const co = Math.cos(psi), si = Math.sin(psi);
  // world -> map: dx,dz relative to the player
  const A = -co * s, B = -si * s, C = si * s, D = -co * s;
  c.setTransform(A, B, C, D, W / 2, W / 2 + 40);
  const R = 220;
  if (st.track) {
    const idxs = trackNear(sx, sz, R, trkTmp);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [w, col] of [[TRACK_W + 10, '#c9b98c'], [TRACK_W, '#4a4d55']]) {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath();
      idxs.forEach((i, k) => { const [x, z] = trackXZ(i); if (k === 0 || Math.abs(i - idxs[k - 1]) > 40) c.moveTo(x - sx, z - sz); else c.lineTo(x - sx, z - sz); });
      c.stroke();
    }
    const sl = TRACK.start; c.fillStyle = '#fff'; c.fillRect(sl.x - sx - 3, sl.z - sz - TRACK_W / 2, 6, TRACK_W);
  }
  const [ci0, cj0] = [Math.floor((sx - R) / P) - 1, Math.floor((sz - R) / P) - 1];
  const [ci1, cj1] = [Math.ceil((sx + R) / P) + 1, Math.ceil((sz + R) / P) + 1];
  if (!st.track) for (let i = ci0; i <= ci1; i++) for (let j = cj0; j <= cj1; j++) {
    c.fillStyle = BLOCK_COL[blockType(i, j)];
    c.fillRect(i * P + 5.9 - sx, j * P + 5.9 - sz, P - 11.8, P - 11.8);
    if (hasStation(i, j)) { c.fillStyle = '#42ff8a'; c.beginPath(); c.arc(i * P + 8.4 - sx, j * P + 15 - sz, 6, 0, 6.3); c.fill(); }
  }
  if (!st.track) { // Simson shop marker
    let dx = SHOP2.x - sx, dz = SHOP2.z - sz; const d = Math.hypot(dx, dz); if (d > 150) { dx *= 150 / d; dz *= 150 / d; }
    c.fillStyle = '#2a8ad8'; c.strokeStyle = '#fff'; c.lineWidth = 2 / s; c.beginPath(); c.rect(dx - 10, dz - 10, 20, 20); c.fill(); c.stroke();
  }
  // VESC shop marker
  if (!st.track && !allOwned()) {
    let dx = SHOP.x - sx, dz = SHOP.z - sz;
    const d = Math.hypot(dx, dz);
    if (d > 150) { dx *= 150 / d; dz *= 150 / d; }
    c.fillStyle = '#ff7a1a'; c.strokeStyle = '#fff'; c.lineWidth = 2 / s;
    c.beginPath(); c.rect(dx - 10, dz - 10, 20, 20); c.fill(); c.stroke();
  }
  // other players
  for (const rp of net.remoteList ? net.remoteList() : []) {
    c.fillStyle = '#7dff8a'; c.beginPath(); c.arc(rp.x - sx, rp.z - sz, 7, 0, 6.3); c.fill();
  }
  // police
  if (cfg.police) {
    const blink = Math.floor(performance.now() / 220) % 2;
    for (const pc of traffic.policeList()) {
      const dx = pc.x - sx, dz = pc.z - sz;
      if (dx * dx + dz * dz > 230 * 230) continue;
      c.fillStyle = pc.chase ? (blink ? '#ff3b3b' : '#4d7bff') : '#9db4ff';
      c.strokeStyle = '#fff'; c.lineWidth = 1.5 / s;
      c.beginPath(); c.arc(dx, dz, pc.chase ? 8 : 6, 0, 6.3); c.fill(); c.stroke();
    }
  }
  // checkpoint
  if (mis.active && mis.cp) {
    let dx = mis.cp.x - sx, dz = mis.cp.z - sz;
    const d = Math.hypot(dx, dz);
    const lim = 150;
    if (d > lim) { dx *= lim / d; dz *= lim / d; }
    c.fillStyle = '#35e6ff'; c.strokeStyle = '#fff'; c.lineWidth = 2 / s;
    c.beginPath(); c.arc(dx, dz, 11, 0, 6.3); c.fill(); c.stroke();
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  // player
  c.save(); c.translate(W / 2, W / 2 + 40);
  c.fillStyle = '#ff7a1a'; c.strokeStyle = '#fff'; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(0, -17); c.lineTo(11, 12); c.lineTo(0, 6); c.lineTo(-11, 12); c.closePath(); c.fill(); c.stroke();
  c.restore();
}
let lastScoreStr = '';
function updateHUD(dt) {
  const s = scooter;
  const walking = st.mode === 'walk';
  const kmh = walking ? walker.speed * 3.6 : s.kmh;
  setText('speedNum', String(Math.round(kmh)));
  const frac = clamp(kmh / (scooter.topKmh * 1.1), 0, 1);
  const arc = $('arcFg');
  arc.setAttribute('stroke-dasharray', `${(frac * arcLen).toFixed(1)} 1000`);
  arc.setAttribute('stroke', walking ? '#9fe9a8' : s.boosting ? '#ff7a1a' : kmh > 70 ? '#ffc23d' : '#35e6ff');
  setText('boostTxt', scooter.hyperOn ? 'HYPER' : 'TURBO');
  $('boostTxt').style.opacity = s.boosting && !walking ? 1 : 0;
  $('speedfx').style.opacity = clamp((kmh - 40) / 50, 0, 1).toFixed(2);
  setText('moneyVal', Math.floor(st.money).toLocaleString('de-DE') + ' €');
  const wEl = $('wheelie');
  if (scooter.wheelie > 0.3 && st.mode === 'ride') { wEl.classList.remove('hidden'); const ok = scooter.wheelieT >= 1.5; wEl.innerHTML = `WHEELIE <b>${scooter.wheelieT.toFixed(1)} s</b> ${ok ? `· <span style="color:#8dffb0">+${wheelieEur(scooter.wheelieT, scooter.wheelieOne)} € beim Absetzen</span>` : '· halte durch (1,5 s)'}`; }
  else wEl.classList.add('hidden');
  const wd = $('wanted');
  if (st.wanted > 0) {
    const ch = traffic.nearestChaser(me.x, me.z);
    const t = `🚨 POLIZEI VERFOLGT DICH · ${Math.ceil(st.wanted)} s${ch ? ' · ' + Math.round(ch.d) + ' m' : ''}${st.bustT > 0.1 ? ' · STEHEN BLEIBEN = FESTNAHME' : ''}`;
    if (cache.wanted !== t) { cache.wanted = t; wd.textContent = t; }
    wd.classList.remove('hidden');
  } else wd.classList.add('hidden');
  // shop / interaction prompt
  const ds = Math.hypot(me.x - SHOP.x, me.z - SHOP.z);
  let prompt = '';
  const tbl = nearestTable();
  if (tbl) prompt = `<kbd>F</kbd> ${tbl.name} – ansehen & kaufen`;
  else if (st.pickT) prompt = `<kbd>F</kbd> ${st.pickT.pr.name} nehmen · ${fmtEur(st.pickT.pr.price)}`;
  else if (st.tillT && st.basket.length) prompt = `<kbd>F</kbd> Bezahlen · ${fmtEur(basketTotal())}`;
  else if (st.tillT) prompt = 'Kasse – nimm erst Waren aus den Regalen (F)';
  else if (ds < 16 && !inShop(me.x, me.z)) prompt = '🛒 Geh in den Laden – an den Tischen kaufst du VESC, Roller & Farben';
  else if (Math.hypot(me.x - SHOP2.x, me.z - SHOP2.z) < 16 && !inShop2(me.x, me.z)) prompt = '🛵 Simson-Laden – hinein: Simson, MTX10, PZ-Lenker, Zigaretten';
  else if (walking && Math.hypot(scooter.x - walker.x, scooter.z - walker.z) < (scooter.model.mountR || 3.4)) prompt = scooter.model.car ? '<kbd>F</kbd> Einsteigen' : '<kbd>F</kbd> Aufsteigen';
  if (cache.prompt !== prompt) { cache.prompt = prompt; $('prompt').innerHTML = prompt; $('prompt').classList.toggle('hidden', !prompt); }
  const ds2 = Math.hypot(me.x - SHOP2.x, me.z - SHOP2.z), fmtD = (d) => (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m');
  const shopLine = st.track ? '' : `<br>🛒 VESC-Shop: ${fmtD(ds)} · 🛵 Simson: ${fmtD(ds2)}`;
  if (cache.shopLine !== shopLine) { cache.shopLine = shopLine; $('shopline').innerHTML = shopLine; }
  const pct = s.battPct;
  setText('battPct', Math.round(pct) + '%');
  const bar = $('battBar');
  bar.style.width = pct.toFixed(1) + '%';
  bar.style.background = pct < 15 ? 'linear-gradient(90deg,#ff3b3b,#ff7a3b)' : pct < 35 ? 'linear-gradient(90deg,#ffb12b,#ffd75a)' : '';
  const range = cfg.battMode === 'off' ? Infinity : s.batt / Math.max(s.whPerM, 0.0008) / 1000;
  setText('rangeTxt', range === Infinity ? '∞ km' : '~ ' + (range > 99 ? '99+' : range.toFixed(1)) + ' km');
  setText('tripTxt', (s.trip / 1000).toFixed(2));
  setText('odoTxt', (st.odoTotal / 1000).toFixed(1));
  setText('chargeTxt', st.charging ? '⚡ lädt …' : '');
  $('lowbatt').classList.toggle('hidden', !(pct < 12 && cfg.battMode !== 'off'));
  const sc = Math.floor(st.score).toLocaleString('de-DE');
  if (sc !== lastScoreStr) { lastScoreStr = sc; $('scoreVal').textContent = sc; }
  if (document.activeElement !== $('optTime')) $('optTime').value = cfg.hours;
  setText('clock', (sky.night > 0.5 ? '☾ ' : '☀ ') + fmtTime(sky.hours));
  $('timeLbl').textContent = fmtTime(sky.hours);
  // mission
  if (st.track) trackHud();
  else if (mis.active && mis.cp) {
    const dx = mis.cp.x - me.x, dz = mis.cp.z - me.z;
    const d = Math.hypot(dx, dz);
    const m = Math.floor(mis.time / 60), ss = Math.floor(mis.time % 60);
    const html = `<b>Tour ${mis.tour}</b> · Checkpoint ${mis.n + 1}/${mis.total}<br>Zeit <span class="t" style="color:${mis.time < 15 ? '#ff6a6a' : 'inherit'}">${m}:${String(ss).padStart(2, '0')}</span>`;
    if (cache.mission !== html) { cache.mission = html; $('mission').innerHTML = html; }
    setText('dist', d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m');
    const ang = Math.atan2(dx, dz); // world bearing
    const rel = wrapAngle(ang - camYaw);
    $('arrow').firstElementChild.style.transform = `rotate(${(rel * 180) / Math.PI}deg)`;
  }
  mapT += dt;
  if (mapT > 0.08) { mapT = 0; drawMap(); }
}

/* ------------------------------------------------------------------ multiplayer + chat */
const chatLog = $('chatlog'), chatIn = $('chatin');
function addChat(name, text, system, mine) {
  $('chat').classList.remove('hidden');
  const d = document.createElement('div');
  if (system) d.innerHTML = `<em>${text.replace(/</g, '&lt;')}</em>`;
  else d.innerHTML = `<b>${(mine ? 'Du' : name).replace(/</g, '&lt;')}:</b> ${text.replace(/</g, '&lt;')}`;
  chatLog.appendChild(d);
  while (chatLog.children.length > 7) chatLog.removeChild(chatLog.firstChild);
  setTimeout(() => d.classList.add('old'), 9000);
  setTimeout(() => d.remove(), 11000);
}
function openChat() {
  if (!net.connected) { toast('Chat nur im Multiplayer', 'Server verbinden (Menü → Multiplayer)', 1800); return; }
  st.chatOpen = true;
  $('chat').classList.remove('hidden');
  chatIn.classList.remove('hidden'); chatIn.value = '';
  keys.clear();
  if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => chatIn.focus(), 0);
}
function closeChat() { st.chatOpen = false; chatIn.classList.add('hidden'); chatIn.blur(); canvas.focus(); lockMouse(); }
chatIn.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t) net.sendChat(t); closeChat(); }
  else if (e.key === 'Escape') closeChat();
});
net.onChat = addChat;
net.onStatus = (text, kind) => { const el = $('mpstat'); el.textContent = text; el.className = kind; };
net.onPlayers = (names) => {
  const el = $('players');
  if (!names.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `👥 ${names.length} Spieler: ${names.map((n) => n.replace(/</g, '&lt;')).join(', ')}`;
};
net.onEvent = (r, k) => { if (k === 'vesc') addChat(null, `${r.name} hat sich einen VESC eingebaut ⚡`, true); else if (k === 'dt3') addChat(null, `${r.name} fährt jetzt einen Dualtron Thunder 3 🔥`, true); else if (k === 'sonic') addChat(null, `${r.name} fährt jetzt einen Weped Sonic 🚀`, true); else if (k === 'g2') addChat(null, `${r.name} fährt jetzt einen Kukirin G2`, true); else if (k === 'zt3') addChat(null, `${r.name} fährt jetzt einen ZT3 Pro`, true); };
const mpName = $('mpName'), mpRoom = $('mpRoom'), mpUrl = $('mpUrl'), mpLook = $('mpLook'), mpAuto = $('mpAuto');
mpName.value = store.get('mpName', 'Fahrer' + Math.floor(100 + Math.random() * 900));
mpRoom.value = store.get('mpRoom', 'stadt');
mpLook.value = store.get('mpLook', 'orange');
mpUrl.value = store.get('mpUrl', '') || Net.defaultUrl();
mpAuto.checked = store.get('mpAuto', true);
const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
function mpConnect() {
  store.set('mpName', mpName.value); store.set('mpRoom', mpRoom.value); store.set('mpLook', mpLook.value); store.set('mpUrl', mpUrl.value); store.set('mpAuto', mpAuto.checked);
  net.connect(mpUrl.value.trim(), mpName.value.trim() || 'Fahrer', mpRoom.value.trim() || 'stadt', mpLook.value);
}
$('mpConnect').onclick = () => { mpConnect(); };
if (!isHttp) $('mpstat').textContent = 'Solo-Modus (für Multiplayer: Spiel über den Server öffnen – npm start)';
if (isHttp && mpAuto.checked) setTimeout(mpConnect, 300);

/* ------------------------------------------------------------------ elderly NPC speech bubbles */
const bubbleEls = [];
for (let i = 0; i < 4; i++) { const el = document.createElement('div'); el.className = 'bubble hidden'; $('bubbles').appendChild(el); bubbleEls.push(el); }
const _bv = new THREE.Vector3();
function updateBubbles() {
  const list = peds.list.filter((p) => p.active && ((p.elder && (p.anger > 14 || p.sayT > 0)) || (p.kind === 'teen' && p.sayT > 0) || (p.kind === 'crew' && p.sayT > 0))).map((p) => ({ p, d: Math.hypot(p.x - me.x, p.z - me.z) })).sort((a, b) => a.d - b.d).slice(0, 4);
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = 0; i < 4; i++) {
    const el = bubbleEls[i], it = list[i];
    if (!it || it.d > 45) { el.classList.add('hidden'); continue; }
    const p = it.p;
    _bv.set(p.x, (p.down > 0 ? 0.6 : p.kind === 'teen' ? (p.ts === 'sit' ? 1.85 : 2.0) : 2.15), p.z).project(camera);
    if (_bv.z > 1 || _bv.z < -1 || Math.abs(_bv.x) > 1.2) { el.classList.add('hidden'); continue; }
    el.classList.remove('hidden');
    el.style.transform = `translate(${((_bv.x * 0.5 + 0.5) * W).toFixed(0)}px, ${((-_bv.y * 0.5 + 0.5) * H).toFixed(0)}px) translate(-50%,-100%)`;
    const crew = p.kind === 'crew', ally = p.kind === 'teen' && p.gang !== undefined && peds.gangs[p.gang].ally, teen = p.kind === 'teen';
    const face = crew || ally ? '💚' : teen ? (p.rowdy ? '😈' : '😎') : p.chase > 0 ? '🤬' : p.mood >= 2 ? '😡' : p.mood === 1 ? '😠' : p.kind === 'bum' ? '🍺' : '🙂';
    const who = crew ? 'Deine Gang' : ally ? 'Grüne Gang (Freund)' : teen ? (p.rowdy ? 'Halbstarker' : 'Netter Typ') : p.kind === 'bum' ? 'Obdachloser' : p.kind === 'oma' ? 'Oma' : 'Opa';
    const html = `<b>${face} ${who}</b>${p.sayT > 0 ? '<span>' + p.say + '</span>' : ''}${teen ? '' : `<i><u style="width:${p.anger.toFixed(0)}%;background:${p.anger > 80 ? '#ff3b3b' : p.anger > 50 ? '#ff9a2a' : '#ffd23a'}"></u></i>`}`;
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
  }
}
const carDmg = new CarDamage(scene, M, smoke, tex.glow, world, traffic);
traffic.onRecycle = (c) => carDmg.dispose(c);
carDmg.onDestroyed = () => { st.score = Math.max(0, st.score - 200); audio.thud(15); toast('💥 Auto zerstört', 'es brennt – −200 Punkte', 2600); };
let carHitToast = 0;
carDmg.onHit = () => { if (performance.now() - carHitToast > 6000) { carHitToast = performance.now(); toast('Auto beschädigt', 'mehrmals treffen (Schuss, Schlag, Rammen) zerstört es', 1800); } };
peds.colliders = world.colliders;
peds.smoke = smoke;
peds.onShove = (p) => {
  earn(-30);
  toast('Jugendlicher schubst dich!', 'Rempler & Taschengeld weg · −30 € – hau ab oder schlag zurück (E)', 2600);
  audio.thud(5);
  st.crashT = 0.4; $('crash').style.opacity = 0.6;
  if (st.mode === 'walk') walker.stun = 0.9; else scooter.v *= 0.3;
};
function callCrew() {
  if (st.track || st.paused || st.shopOpen) return;
  const hd = me.heading;
  const n = peds.spawnCrew(me.x, me.z, hd);
  const all = peds.crewCount();
  if (n > 0) { audio.chime([392, 523, 659]); toast('💚 Deine Gang ist da!', `${all} Grüne mit Waffen kämpfen für dich · nochmal H = ruft alle zu dir`, 3000); }
  else toast('💚 Deine Gang', `alle ${all} sind bei dir – sie schießen auf Feinde, die dich bedrohen`, 2200);
}
peds.onCrewShot = (p, tx, tz, hit) => {
  addTracer(p.x + Math.sin(p.yawT) * 0.5, 1.25, p.z + Math.cos(p.yawT) * 0.5, tx, 1.15, tz);
  const d = Math.hypot(p.x - me.x, p.z - me.z);
  if (d < 70) audio.shot(clamp(1 - d / 80, 0.15, 0.55));
  if (hit && cfg.blood) blood.splash(tx, 1.15, tz, tx - p.x, tz - p.z, 18);
  if (hit && d < 60) audio.thud(3);
};
peds.onBrawlHit = (x, z, bleed) => {
  const d = Math.hypot(x - me.x, z - me.z);
  if (d < 45) audio.thud(clamp(6 - d / 9, 1, 6));
  if (bleed && cfg.blood && d < 40) blood.splash(x, 1.3, z, Math.random() - 0.5, Math.random() - 0.5, 6);
  if (d < 28 && !st.warnedBrawl) { st.warnedBrawl = true; toast('👊 Gangs prügeln sich!', 'Zwei Jugend-Gangs haben sich getroffen – misch dich lieber nicht ein', 3200); }
};
peds.onTeenAngry = () => { if (!st.warnedTeen) { st.warnedTeen = true; toast('Halbstarke sind sauer', 'Sie kommen dir nach – fahr weg (sie sind nur zu Fuß unterwegs) oder box sie nieder', 3200); } };
traffic.onGreet = () => { if (!st.warnedGreet || performance.now() - st.warnedGreet > 25000) { st.warnedGreet = performance.now(); toast('👋 Jugendlicher auf Simson winkt dir zu', '', 1600); } };
peds.onSmack = (p) => {
  const bum = p.kind === 'bum';
  const who = bum ? 'Obdachloser' : p.kind === 'oma' ? 'Oma' : 'Opa';
  const how = bum ? 'mit der Bierflasche' : p.kind === 'oma' ? 'mit der Handtasche' : 'mit dem Gehstock';
  earn(-25);
  toast(`${who} erwischt dich!`, `Ein Schlag ${how} · −25 €`, 2400);
  audio.thud(6);
  st.crashT = 0.5; $('crash').style.opacity = 0.7;
  if (st.mode === 'walk') walker.stun = 1.1; else scooter.v *= 0.2;
};
peds.onMood = (p, mood) => {
  const bum = p.kind === 'bum';
  const who = bum ? 'Der Obdachlose' : p.kind === 'oma' ? 'Oma' : 'Opa';
  if (mood === 3) toast(`${who} ist stinksauer!`, `${bum ? 'Er' : 'Sie'} rennt dir mit 10 km/h hinterher – fahr weg!`, 3000);
  else if (mood === 1 && !st.warnedAnnoy) { st.warnedAnnoy = true; toast(`${who} wird sauer`, 'Fahr nicht dauernd neben ihr her …', 2400); }
};

/* ------------------------------------------------------------------ main loop */
const lampTmp = [];
const _focus = new THREE.Vector3(), _focus2 = new THREE.Vector3();
let lampTimer = 0;
let last = performance.now();
let simAcc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!st.ready) return;
  tick(dt, now, !st.skipRender);
}

function tick(dt, now, render = true) {

  // fps / adaptive resolution
  st.fpsT += dt;
  st.fpsAvg = lerp(st.fpsAvg, 1 / Math.max(dt, 1e-3), 0.05);
  if (st.fpsT > 2.5 && !st.paused) {
    st.fpsT = 0;
    if (st.fpsAvg < 38 && st.resScale > 0.55) { st.resScale = Math.max(0.55, st.resScale - 0.1); resize(); }
    else if (st.fpsAvg > 57 && st.resScale < 1) { st.resScale = Math.min(1, st.resScale + 0.05); resize(); }
  }
  if (st.showFps) setText('fps', `${Math.round(st.fpsAvg)} fps · ${st.resScale.toFixed(2)}x`);

  const active = st.running && !st.paused;
  if (mouse.lock) mouse.steer = damp(mouse.steer, 0, 1.4, dt);
  const inp = st.inputOverride || readInput();
  {
    const tt = st.trafficT % 26;
    sig.aG = tt < 9; sig.aY = tt >= 9 && tt < 11; sig.bG = tt >= 13 && tt < 22; sig.bY = tt >= 22 && tt < 24;
    sig.aSoon = 26 - tt < 9; sig.bSoon = (tt < 13 ? 13 - tt : 39 - tt) < 9;
  }
  if (active) {
    const dt2 = Math.min(dt, 0.05);
    const walking = st.mode === 'walk';
    traffic.extra = walking ? [{ x: scooter.x, z: scooter.z }] : [];
    if (ems.active) traffic.extra.push({ x: ems.x, z: ems.z });
    const cars = st.track ? [] : traffic.update(dt2, me, sig);
    const pl = st.track ? [] : peds.update(dt2, me, sig, now);
    if (!st.track) { shopActors.length = 0; shopActors.push(me); for (const d of pl) shopActors.push(d); shops.update(dt2, me.x, me.z, shopActors); updateStore(dt2); }
    dynAll.length = 0;
    for (const c of cars) dynAll.push(c);
    ems.update(dt2, traffic);
    for (const c of ems.dyn) dynAll.push(c);
    for (const c of pl) dynAll.push(c);
    for (const c of net.dynList ? net.dynList() : []) dynAll.push(c);

    // physics in small steps (the parked scooter keeps simulating)
    simAcc += dt;
    let steps = 0;
    const odo0 = scooter.odo;
    const rideInp = walking ? PARK : inp;
    scooter.hyper = st.track;
    while (simAcc > 0 && steps < 14) {
      const h = Math.min(simAcc, Math.abs(scooter.v) > 300 ? 1 / 600 : Math.abs(scooter.v) > 80 ? 1 / 320 : Math.abs(scooter.v) > 35 ? 1 / 150 : 1 / 90);
      scooter.update(h, rideInp, world, cfg.battMode === 'off' ? 0 : cfg.battMode === 'real' ? 1 : 3, dynAll);
      simAcc -= h; steps++;
      if (!walking && scooter.impact > 1.8) { onCrash(scooter.impact); if (scooter.impact > 3 && !(st.ramCool > 0)) { st.ramCool = 0.5; carDmg.rammed(scooter.x + Math.sin(scooter.heading) * 1.0, scooter.z + Math.cos(scooter.heading) * 1.0, scooter.impact); } }
    }
    if (walking) {
      parkDyn.length = 0;
      const sx = Math.sin(scooter.heading), cz = Math.cos(scooter.heading);
      for (const o of [-0.55, 0, 0.55]) parkDyn.push({ x: scooter.x + sx * o, z: scooter.z + cz * o, r: 0.3, vx: 0, vz: 0 });
      walkDyn.length = 0;
      for (const c of dynAll) walkDyn.push(c);
      for (const c of parkDyn) walkDyn.push(c);
      walker.update(dt2, inp, world.colliders, walkDyn);
      if (walker.punchEvent) { const ev = walker.punchEvent; walker.punchEvent = null; resolvePunch(ev); }
      if (walker.shootEvent) { const ev = walker.shootEvent; walker.shootEvent = null; resolveShot(ev); }
      if (walker.stepEvent) { walker.stepEvent = false; audio.step(walker.running); }
      if (walker.landEvent) { walker.landEvent = false; audio.step(true); audio.thud(2); st.landDip = 0.09; }
      if (walker.clickEvent) { walker.clickEvent = false; audio.click(0); }
      if (walker.reloadEvent) { walker.reloadEvent = false; audio.click(1); setTimeout(() => audio.click(0), 650); setTimeout(() => audio.click(1), 1250); }
    }
    if (scooter.fellEvent) { scooter.fellEvent = false; st.score = Math.max(0, st.score - 150); toast('Sturz!', '−150 Punkte – zu schnell gegen ein Hindernis', 2200); audio.thud(14); st.crashT = 1; $('crash').style.opacity = 0.9; }
    if (scooter.wheelieEvent) {
      const ev = scooter.wheelieEvent; scooter.wheelieEvent = null;
      st.wheelies = (st.wheelies || 0) + 1;
      const eur = wheelieEur(ev.dur, ev.one);
      earn(eur); st.score += (ev.one ? 400 : 150) + ev.dur * 40;
      audio.chime([660, 880, 1100, 1480]);
      toast(ev.one ? `🖐️ EINHAND-WHEELIE! +${eur} €` : `WHEELIE! +${eur} €`, `${ev.dur.toFixed(1)} s auf dem Hinterrad · ${st.wheelies}. Wheelie`, 2200);
    }
    updatePolice(dt2);
    if (st.track) trackUpdate(dt2);
    if (scooter.pedHit) {
      const p = scooter.pedHit; scooter.pedHit = null;
      if (!p.down || p.down <= 0) { p.down = 3.2; st.score = Math.max(0, st.score - 100); toast(p.kind === 'scooter' ? 'Pass auf, Roller-Fahrer!' : p.elder ? (p.kind === 'oma' ? 'Oma umgefahren!' : 'Opa umgefahren!') : 'Vorsicht, Fußgänger!', '−100 Punkte', 1500); audio.honk(hornKind() || 'scooter', 0.18); if (p.elder) p.anger = Math.min(100, p.anger + 40); }
    }
    simAcc = 0;
    const dOdo = scooter.odo - odo0;
    st.odoTotal += dOdo;
    st.score += dOdo * 0.2 * (1 + Math.min(scooter.kmh, 300) / 45);
    earn(dOdo * 0.004);
    if (cfg.flow) cfg.hours = (cfg.hours + dt / 90) % 24;
    st.trafficT += dt;
    missionUpdate(dt);
    // stuck hint
    if (st.mode === 'ride' && inp.fwd && Math.abs(scooter.v) < 0.25) { st.stuckT += dt; if (st.stuckT > 3) { toast('Steckst du fest?', 'Drücke Backspace (⌫), um dich auf die Straße zu setzen', 2500); st.stuckT = -6; } } else if (st.stuckT > 0) st.stuckT = 0;
    // charging
    const stn = world.nearestStation(scooter.x, scooter.z);
    st.charging = false;
    if (stn && stn.d < 4.5 && Math.abs(scooter.v) < 2.5 && scooter.batt < 936) {
      scooter.batt = Math.min(936, scooter.batt + 110 * dt);
      st.charging = true;
    }
    if (st.score > st.best) { st.best = st.score; }
    if ((st.saveT = (st.saveT || 0) + dt) > 5) { st.saveT = 0; store.set('best', Math.floor(st.best)); store.set('odo', Math.floor(st.odoTotal)); }
    if (scooter.battPct < 12 && cfg.battMode !== 'off') { st.lowT = (st.lowT || 0) + dt; if (st.lowT > 6) { st.lowT = 0; audio.beep(); } }
  } else if (!st.running) {
    // attract-mode: slow orbit of the city around the idle scooter
  }
  // multiplayer: publish own state, animate other players
  if (net.connected) {
    net.sendT += dt;
    if (net.sendT > 1 / 15) {
      net.sendT = 0;
      const walking = st.mode === 'walk';
      net.sendState({ x: me.x, z: me.z, h: me.heading, v: walking ? walker.speed : scooter.v, l: scooter.lean, m: walking ? 1 : 0, vs: st.vesc ? 1 : 0, md: { g4: 0, dt3: 1, sonic: 2, g2: 3, zt3: 4, simson: 5, sr50: 5, schwalbe: 5 }[st.model] || 0, sx: scooter.x, sz: scooter.z, sh: scooter.heading, w: scooter.wheelie });
    }
  }
  net.update(dt, performance.now());
  // world streaming
  const fastV = st.mode === 'ride' ? Math.abs(scooter.v) : 0;
  world.radius = QUALITY[cfg.quality].radius + (fastV > 70 ? 1 : 0);
  const missing = world.update(me.x, me.z, active ? 1 : 2, fastV > 40 ? Math.sin(scooter.heading) * scooter.v : 0, fastV > 40 ? Math.cos(scooter.heading) * scooter.v : 0);

  // weather
  {
    const target = cfg.weather === 'rain' ? 1 : cfg.weather === 'cloudy' ? 0.55 : 0;
    st.over = damp(st.over || 0, target, 0.5, dt);
    sky.overcast = st.over;
    const rainAmt = clamp((st.over - 0.55) / 0.45, 0, 1);
    st.rainAmt = rainAmt;
    sky.fog.far = (st.fogFar || 190) * (1 - 0.4 * st.over);
    sky.fog.near = sky.fog.far * (0.12 - 0.08 * st.over);
    rain.update(dt, camera, rainAmt, Math.sin(scooter.heading) * scooter.v, Math.cos(scooter.heading) * scooter.v);
    const wet = cfg.wet || rainAmt > 0.3;
    if (wet !== st.wetNow) { st.wetNow = wet; applyWet(wet); }
  }
  // day / night
  sky.setTime(cfg.hours);
  updateCasings(dt); st.landDip = damp(st.landDip, 0, 9, dt); if (st.muzzleT > 0) { st.muzzleT -= dt; if (st.muzzleT <= 0) muzzleLight.intensity = 0; }
  if (st.hitT > 0) st.hitT -= dt; st.xSpread = damp(st.xSpread || 0, 0, 7, dt);
  { const xh = $('xhair'), armed = st.mode === 'walk' && (st.gun || st.knife) && st.started && !st.paused; xh.classList.toggle('hidden', !armed); if (armed) xh.style.setProperty('--sp', (6 + st.xSpread * 12 + Math.min(1, walker.speed / 1.8) * 6 + walker.reloadT * 3).toFixed(1) + 'px');
    const hm = $('hitmark'); hm.style.opacity = st.hitT > 0 ? Math.min(1, st.hitT * 5) : 0;
    const am = $('ammo'), showA = st.mode === 'walk' && st.gun && st.started; am.classList.toggle('hidden', !showA);
    if (showA) { const t2 = walker.reloadT > 0 ? '⟳ lädt nach …' : `${walker.ammo} <small>/ 15</small>`; if (am._t !== t2) { am._t = t2; am.innerHTML = '🔫 ' + t2; } am.classList.toggle('low', walker.ammo <= 3 && walker.reloadT <= 0); } }
  traffic.setNight(sky.night); blood.update(dt); updateSmoke(dt); carDmg.update(dt, me.x, me.z); if (st.ramCool > 0) st.ramCool -= dt;
  { const d = ems.active ? Math.hypot(ems.x - me.x, ems.z - me.z) : 1e9; audio.sirenEms(ems.active ? clamp(1 - d / 200, 0, 1) * (ems.state === 'medics' ? 0.4 : 1) : 0); }
  birds.update(dt, me.x, me.z, sky.night > 0.55 || cfg.weather === 'rain' || st.paused);
  sky.update(dt, _focus.copy(camera.position).lerp(_focus2.set(me.x, 0, me.z), 0.5).setY(0));
  const night = sky.night, lamps = sky.lampsOn;
  const win = lamps * 1.6;
  for (const k of ['plaster', 'brick', 'panel', 'glass']) M['f_' + k].emissiveIntensity = win;
  M.lampW.emissiveIntensity = lamps * 3.4;
  M.foliage.userData.wind.value = performance.now() * 0.001 * (1 + (cfg.weather === 'rain' ? 1.2 : 0));
  horizon.update(camera, sky.fog.color, sky.night, sky.sunDir, sky.uniforms.sunCol.value);
  if (!st.paused) ambient.update(Math.min(dt, 0.05), camera.position, sky.night, 0.5 + (cfg.weather === 'rain' ? 1 : 0), cfg.weather === 'rain');
  for (const k of ['shopSign', 'shopSign2', 'shopSign3', 'shopSign4', 'shopSign5', 'fuelPylon']) M[k].emissiveIntensity = 0.12 + lamps * 0.8;
  M.bright.emissiveIntensity = 0.3 + lamps * 0.12;
  M.shopGlow.emissiveIntensity = lamps * 0.9;
  M.pool.opacity = lamps * 0.5;
  M.glowW.opacity = lamps * 0.85;
  M.glowG.opacity = 0.55 + 0.35 * Math.sin(now * 0.004);
  // traffic lights (shared phase)
  const t = st.trafficT % 26;
  const aG = t < 9, aY = t >= 9 && t < 11, bG = t >= 13 && t < 22, bY = t >= 22 && t < 24;
  const u = M.tlight.uniforms.uOn.value;
  u[0] = !aG && !aY ? 1 : 0; u[1] = aY ? 1 : 0; u[2] = aG ? 1 : 0;
  u[3] = !bG && !bY ? 1 : 0; u[4] = bY ? 1 : 0; u[5] = bG ? 1 : 0;

  // dynamic lamp lights
  lampTimer += dt;
  if (lampTimer > 0.2) {
    lampTimer = 0;
    world.nearestLamps(me.x, me.z, 4, lampTmp);
    for (let i = 0; i < 4; i++) {
      const L = lampLights[i];
      if (lampTmp[i]) L.position.copy(lampTmp[i][1]);
    }
  }
  for (const L of lampLights) L.intensity = lamps * 260;
  { const dS = Math.hypot(me.x - (SHOP_IN.x0 + SHOP_IN.x1) / 2, me.z - (SHOP_IN.z0 + SHOP_IN.z1) / 2); shopLight.intensity = dS < 40 ? 330 * (1 - Math.max(0, dS - 22) / 18) : 0; const d2 = Math.hypot(me.x - (SHOP2_IN.x0 + SHOP2_IN.x1) / 2, me.z - (SHOP2_IN.z0 + SHOP2_IN.z1) / 2); shopLight2.intensity = d2 < 40 ? 330 * (1 - Math.max(0, d2 - 22) / 18) : 0; }
  const head = st.userHead ?? lamps > 0.4;
  scooter.updateLights(night, head, dt, sky.hours);
  scooter.updateRider(dt, Math.abs(scooter.v));

  if (active || !st.started) updateCamera(dt, false);
  else updateCamera(dt, false);

  audio.update({ moped: !!(scooter.model.moped || scooter.model.car) && st.mode === 'ride', v: st.mode === 'walk' ? 0 : scooter.v, thr: scooter.thr, rain: st.rainAmt || 0, braking: scooter.braking, brakeAmt: Math.max(scooter.brk, scooter.space || 0), paused: !active, battEmpty: scooter.batt <= 0.2 });

  if (st.crashT > 0) { st.crashT -= dt; if (st.crashT <= 0) $('crash').style.opacity = 0; }
  if (active) { updateHUD(dt); updateBubbles(); }
  { const sp = 1 + 0.06 * Math.sin(now * 0.005); shopBeacon.userData.ring.scale.setScalar(sp); shopBeacon.userData.c1.rotation.y += dt * 0.4; const dsb = Math.hypot(me.x - SHOP.x, me.z - SHOP.z); shopBeacon.visible = !allOwned() && dsb > 14; shopBeacon2.userData.ring.scale.setScalar(sp); shopBeacon2.userData.c1.rotation.y += dt * 0.4; shopBeacon2.visible = !st.track && Math.hypot(me.x - SHOP2.x, me.z - SHOP2.z) > 14; shopBeacon.visible = shopBeacon.visible && !st.track; }

  if (!render) return;
  if (composer && st.post) {
    const u = gradePass.uniforms;
    u.time.value = (performance.now() % 100000) / 1000;
    const sp = st.mode === 'walk' ? walker.speed * 3.6 : scooter.kmh;
    u.speed.value = damp(u.speed.value, clamp((sp - 55) / 160, 0, 1) * 0.85, 4, 0.016);
    u.hurt.value = clamp(st.crashT * 1.2, 0, 1);
    u.warm.value = clamp(1 - sky.night, 0, 1) * 0.6;
    composer.render();
  }
  else renderer.render(scene, camera);
}

function onCrash(power) {
  if (!st.crashCool || performance.now() - st.crashCool > 350) {
    st.crashCool = performance.now();
    audio.thud(power);
    $('crash').style.opacity = clamp(power / 8, 0.25, 0.9);
    st.crashT = 0.35;
    if (power > 5) toast('Kollision!', '', 700);
  }
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  const bar = $('loadbar'), txt = $('loadtxt');
  applyQuality(cfg.quality);
  applyWet(false);
  scooter.reset(30, 1.75, Math.PI / 2);
  camYaw = scooter.heading;
  scooter.setView(false);
  setVesc(st.vesc);
  setModel(OWNED[st.model] && OWNED[st.model]() ? st.model : 'g4', true);
  setPolice(cfg.police);
  setWbar(cfg.wbar);
  scooter.setSimsonUpgrades(st.mtx, st.pz);
  for (const id of Object.keys(st.paint)) applyPaint(id);
  shopBeacon.position.set(SHOP.x, groundHeight(SHOP.x, SHOP.z), SHOP.z);
  shopBeacon2.position.set(SHOP2.x, groundHeight(SHOP2.x, SHOP2.z), SHOP2.z);
  sky.setTime(cfg.hours);
  sky.update(0.01, new THREE.Vector3(30, 0, 0), true);
  const total = (2 * world.radius + 1) ** 2;
  let left = 1;
  while (left > 0) {
    left = world.update(scooter.x, scooter.z, 1);
    const done = total - left;
    bar.style.width = ((done / total) * 100).toFixed(0) + '%';
    txt.textContent = `Stadt wird gebaut … ${done}/${total}`;
    await new Promise((r) => setTimeout(r, 0));
  }
  txt.textContent = 'Shader werden vorbereitet …';
  await new Promise((r) => setTimeout(r, 30));
  startMission(true);
  scooter.updateLights(0, false, 1, 10);
  try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
  updateCamera(0.016, true);
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');
  st.ready = true;
  st.running = true;
  setPaused(true);
  requestAnimationFrame(frame);
}
boot();

// debugging / testing hook
window.__game = { shops, payBasket, interactF, deliverCar, LAYOUT, carDmg, toggleGun, resolveShot, tracers, blockType, PLAY, blood, ems, smoke, toggleSmoke, buyUpgrade, toggleKnife, resolvePunch, setModel, enterTrack, leaveTrack, trk, trackAt, trackProject, setPolice, updatePolice, net, walker, me, dismount, mount, interact, buyDT3, buySonic, buyModel, buyPaint, openShop, closeShop, nearestTable, SHOP_TABLES, inShop, inShop2, SHOP2, SHOP2_TABLES, toggleOneHand, setWbar, switchModel, mouse, traffic, peds, tick, scene, camera, renderer, scooter, world, sky, cfg, st, M, setHours: (h) => { cfg.hours = h; cfg.flow = false; }, teleport: (x, z, h) => { scooter.reset(x, z, h); camYaw = h; }, start: () => { st.started = true; setPaused(false); }, toggleCam, setPaused, applyQuality, keys };

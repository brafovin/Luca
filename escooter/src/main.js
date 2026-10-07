import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeTextures } from './textures.js';
import { createMaterials } from './materials.js';
import { Sky } from './sky.js';
import { World, P, blockType, groundHeight, hasStation, SHOP } from './world.js';
import { Walker } from './walker.js';
import { Net } from './net.js';
import { Scooter } from './scooter.js';
import { GameAudio } from './audio.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './peds.js';
import { Rain } from './weather.js';
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
const scooter = new Scooter(tex);
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
};
const parkDyn = [];
const traffic = new Traffic(scene, M, 12, 9);
const peds = new Pedestrians(scene, M, 16, 6);
traffic.peds = peds;
const rain = new Rain(scene);
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

/* ------------------------------------------------------------------ settings & state */
const store = {
  get(k, d) { try { const v = localStorage.getItem('g4_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('g4_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  },
};
const cfg = {
  quality: store.get('quality', 'med'),
  mode: store.get('mode', 'mission'),
  battMode: store.get('battMode2', 'off'),
  wet: false,
  flow: true,
  hours: 10,
  volume: store.get('volume', 0.7),
  mouse: store.get('mouse', true),
  weather: 'clear',
};
const VESC_PRICE = 500;
const st = {
  running: false, paused: true, fp: false, userHead: null, resScale: 1,
  score: 0, scoreAcc: 0, odoTotal: store.get('odo', 0), best: store.get('best', 0),
  trafficT: 0, crashT: 0, stuckT: 0, lastOdo: 0, fpsAvg: 60, fpsT: 0, showFps: false, charging: false,
  mission: { tour: 0, n: 0, cp: null, time: 0, active: false, total: 5, last: null },
  mode: 'ride', money: store.get('money', 200), vesc: store.get('vesc', false),
};

/* ------------------------------------------------------------------ quality */
const QUALITY = {
  low: { pr: 1, shadow: 0, bloom: false, ao: false, radius: 2, fogFar: 185 },
  med: { pr: 1.5, shadow: 1024, bloom: false, ao: false, radius: 2, fogFar: 190 },
  high: { pr: 2, shadow: 2048, bloom: true, ao: true, radius: 3, fogFar: 285 },
};
let composer = null, bloomPass = null, gtaoPass = null;
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
  st.bloom = q.bloom;
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
  if (st.bloom) {
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
    }
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
    o.yawDelta = mouse.yawAcc; mouse.yawAcc = 0;
    if (mouse.lock && mouse.lmb) o.fwd = true;
    if (mouse.lock && mouse.rmb) o.back = true;
    return o;
  }
  o.wheelie = (keys.has('KeyE') || mouse.mmb) && !(!st.vesc && Math.hypot(scooter.x - SHOP.x, scooter.z - SHOP.z) < 9);
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
  if (st.paused && !['KeyP', 'Escape', 'Enter', 'KeyM'].includes(e.code)) return;
  switch (e.code) {
    case 'KeyC': toggleCam(); break;
    case 'KeyR': resetOnRoad(); break;
    case 'KeyP': case 'Escape': if (st.started) setPaused(!st.paused); break;
    case 'Enter': if (st.paused) $('btnStart').click(); else { openChat(); e.preventDefault(); } break;
    case 'KeyL': st.userHead = !(st.userHead ?? sky.lampsOn > 0.4); toast(st.userHead ? 'Licht an' : 'Licht aus', '', 900); break;
    case 'KeyB': audio.bell(); peds.bell(me.x, me.z); break;
    case 'KeyE': if (Math.hypot(me.x - SHOP.x, me.z - SHOP.z) < 9 && !st.vesc) interact(); break;
    case 'KeyF': toggleMount(); break;
    case 'KeyM': audio.setMuted(!audio.muted); toast(audio.muted ? 'Ton aus' : 'Ton an', '', 900); break;
    case 'KeyT': cfg.hours = (cfg.hours + 3) % 24; $('optTime').value = cfg.hours; break;
    case 'KeyG': st.showFps = !st.showFps; $('fps').classList.toggle('hidden', !st.showFps); break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

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
  const t = $('toast');
  t.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function setPaused(p) {
  st.paused = p;
  $('menu').classList.toggle('hidden', !p);
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
  scooter.reset(30, 1.75, Math.PI / 2);
  camYaw = scooter.heading;
  startMission(true);
}
function resetOnRoad() {
  const s = scooter;
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

/* ------------------------------------------------------------------ on foot, shop, money */
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
  walker.place(scooter.x + Math.sin(h) * 0.1 - Math.cos(h) * 0.95, scooter.z + Math.cos(h) * 0.1 + Math.sin(h) * 0.95, h);
  walker.setVisible(!st.fp);
  camYaw = h;
  toast('Abgestiegen', 'WASD laufen · Shift rennen · F wieder aufsteigen', 2600);
}
function mount() {
  const d = Math.hypot(scooter.x - walker.x, scooter.z - walker.z);
  if (d > 3.4) { toast('Zu weit weg', 'geh näher an deinen Roller (F)', 1500); return; }
  st.mode = 'ride';
  scooter.parked = false; scooter.rider.visible = true; scooter.v = 0;
  walker.setVisible(false);
  camYaw = scooter.heading;
  toast('Aufgestiegen', '', 800);
}
function toggleMount() { if (st.mode === 'ride') dismount(); else mount(); }
function setVesc(on) {
  st.vesc = on;
  scooter.setVesc(on);
  shopBeacon.visible = !on;
  $('vescBadge').classList.toggle('hidden', !on);
}
function interact() {
  const d = Math.hypot(me.x - SHOP.x, me.z - SHOP.z);
  if (d < 9) {
    if (st.vesc) { toast('VESC ist schon verbaut', 'viel Spaß mit 150 km/h!', 1800); return; }
    if (st.money < VESC_PRICE) { toast('Zu wenig Geld', `Du hast ${Math.floor(st.money)} € – der VESC kostet ${VESC_PRICE} €. Fahre Checkpoints!`, 3000); audio.beep(); return; }
    earn(-VESC_PRICE);
    store.set('vesc', true);
    setVesc(true);
    audio.chime([523, 659, 784, 1046, 1318]);
    toast('VESC eingebaut!', 'Turbo bis 150 km/h · normal bis 90 km/h', 4200);
    net.sendEvent && net.sendEvent('vesc');
    return;
  }
  const stn = world.nearestStation(me.x, me.z);
}

/* ------------------------------------------------------------------ camera */
let camYaw = 0, camDist = 3.2, shakeT = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const fpAnchor = new THREE.Object3D();
scooter.root.add(fpAnchor);
fpAnchor.position.set(0, 1.4, -0.13);
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
      camera.position.set(walker.x + Math.sin(camYaw) * 0.12, walker.y + 1.64 + Math.sin(walker.phase * 2) * 0.012 * Math.min(1, walker.speed), walker.z + Math.cos(camYaw) * 0.12);
      camera.rotation.set(-mouse.lookY, camYaw + Math.PI, 0, 'YXZ');
    } else {
      walker.setVisible(true);
      const dist = 3.4 * zoom;
      const sinY = Math.sin(camYaw), cosY = Math.cos(camYaw);
      let f = 1, px, pz;
      for (let i = 0; i < 6; i++) { px = walker.x - sinY * dist * f; pz = walker.z - cosY * dist * f; if (!insideCollider(px, pz, 0.3)) break; f -= 0.17; }
      f = Math.max(f, 0.2);
      px = walker.x - sinY * dist * f; pz = walker.z - cosY * dist * f;
      const py = Math.max(walker.y + 1.5 + dist * f * 0.18 + mouse.lookY * 2, groundHeight(px, pz) + 0.4);
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
  const baseFov = 62 + (s.kmh / (st.vesc ? 150 : 100)) * (st.vesc ? 28 : 22) + (s.boosting ? 4 : 0);
  if (st.fp) {
    mouse.lookY = damp(mouse.lookY, 0, 1.5, dt);
    fpAnchor.rotation.set(s.pitch * 0.4 + 0.2 + mouse.lookY - s.wheelie * 0.3, 0, -s.lean * 0.5, 'YXZ');
    scooter.root.updateMatrixWorld(true);
    fpLook.getWorldPosition(camera.position);
    fpLook.getWorldQuaternion(camera.quaternion);
    const sh = s.shake * 0.04 + spd * 0.0007;
    camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh;
    camera.fov = lerp(camera.fov, baseFov + 6, 0.1);
  } else {
    const dist = (3.5 + Math.min(spd / (st.vesc ? 42 : 28), 1) * 1.6) * zoom;
    camDist = damp(camDist, dist, 3, dt);
    const h = (1.95 + Math.min(spd / (st.vesc ? 42 : 28), 1) * 0.35) * (0.7 + 0.3 * zoom);
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
    const sh = s.shake * 0.12 + spd * 0.0009;
    camera.position.x += (Math.random() - 0.5) * sh;
    camera.position.y += (Math.random() - 0.5) * sh;
    camera.lookAt(tx, ty, tz);
    camera.rotateZ(-s.lean * 0.12);
    camera.fov = lerp(camera.fov, baseFov, 0.1);
  }
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ HUD */
const cache = {};
function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
const arcLen = 90 * Math.PI * 1.5; // 270° arc
const mapCtx = $('map').getContext('2d');
let mapT = 0;
const BLOCK_COL = { perimeter: '#4a5463', houses: '#6b6454', park: '#3d6a3e', modern: '#46647a', shop: '#7d6f56', vescshop: '#b3601c' };
function drawMap() {
  const c = mapCtx, W = 356, s = 0.9; // px per metre (retina 2x of 178)
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#262c36'; c.fillRect(0, 0, W, W);
  const sx = me.x, sz = me.z, psi = me.heading;
  const co = Math.cos(psi), si = Math.sin(psi);
  // world -> map: dx,dz relative to the player
  const A = -co * s, B = -si * s, C = si * s, D = -co * s;
  c.setTransform(A, B, C, D, W / 2, W / 2 + 40);
  const R = 220;
  const [ci0, cj0] = [Math.floor((sx - R) / P) - 1, Math.floor((sz - R) / P) - 1];
  const [ci1, cj1] = [Math.ceil((sx + R) / P) + 1, Math.ceil((sz + R) / P) + 1];
  for (let i = ci0; i <= ci1; i++) for (let j = cj0; j <= cj1; j++) {
    c.fillStyle = BLOCK_COL[blockType(i, j)];
    c.fillRect(i * P + 5.9 - sx, j * P + 5.9 - sz, P - 11.8, P - 11.8);
    if (hasStation(i, j)) { c.fillStyle = '#42ff8a'; c.beginPath(); c.arc(i * P + 8.4 - sx, j * P + 15 - sz, 6, 0, 6.3); c.fill(); }
  }
  // VESC shop marker
  if (!st.vesc) {
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
  const frac = clamp(kmh / (st.vesc ? 170 : 110), 0, 1);
  const arc = $('arcFg');
  arc.setAttribute('stroke-dasharray', `${(frac * arcLen).toFixed(1)} 1000`);
  arc.setAttribute('stroke', walking ? '#9fe9a8' : s.boosting ? '#ff7a1a' : kmh > 70 ? '#ffc23d' : '#35e6ff');
  $('boostTxt').style.opacity = s.boosting && !walking ? 1 : 0;
  $('speedfx').style.opacity = clamp((kmh - 40) / 50, 0, 1).toFixed(2);
  setText('moneyVal', Math.floor(st.money).toLocaleString('de-DE') + ' €');
  const wEl = $('wheelie');
  if (scooter.wheelie > 0.3 && st.mode === 'ride') { wEl.classList.remove('hidden'); const ok = scooter.wheelieT >= 1.5; wEl.innerHTML = `WHEELIE <b>${scooter.wheelieT.toFixed(1)} s</b> ${ok ? '· <span style="color:#8dffb0">+100 € beim Absetzen</span>' : '· halte durch (1,5 s)'}`; }
  else wEl.classList.add('hidden');
  // shop / interaction prompt
  const ds = Math.hypot(me.x - SHOP.x, me.z - SHOP.z);
  let prompt = '';
  if (!st.vesc && ds < 9) prompt = st.money >= VESC_PRICE ? `<kbd>E</kbd> VESC-Umbau kaufen – ${VESC_PRICE} €  (150 km/h)` : `VESC-Shop: ${VESC_PRICE} € nötig – du hast ${Math.floor(st.money)} €`;
  else if (walking && Math.hypot(scooter.x - walker.x, scooter.z - walker.z) < 3.4) prompt = '<kbd>F</kbd> Aufsteigen';
  if (cache.prompt !== prompt) { cache.prompt = prompt; $('prompt').innerHTML = prompt; $('prompt').classList.toggle('hidden', !prompt); }
  const shopLine = st.vesc ? '' : `<br>🛒 VESC-Shop: ${ds >= 1000 ? (ds / 1000).toFixed(1) + ' km' : Math.round(ds) + ' m'}`;
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
  if (mis.active && mis.cp) {
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
net.onEvent = (r, k) => { if (k === 'vesc') addChat(null, `${r.name} hat sich einen VESC eingebaut ⚡`, true); };
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
  const list = peds.elders.filter((p) => p.anger > 14 || p.sayT > 0).map((p) => ({ p, d: Math.hypot(p.x - me.x, p.z - me.z) })).sort((a, b) => a.d - b.d).slice(0, 4);
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = 0; i < 4; i++) {
    const el = bubbleEls[i], it = list[i];
    if (!it || it.d > 45) { el.classList.add('hidden'); continue; }
    const p = it.p;
    _bv.set(p.x, (p.down > 0 ? 0.6 : 2.15), p.z).project(camera);
    if (_bv.z > 1 || _bv.z < -1 || Math.abs(_bv.x) > 1.2) { el.classList.add('hidden'); continue; }
    el.classList.remove('hidden');
    el.style.transform = `translate(${((_bv.x * 0.5 + 0.5) * W).toFixed(0)}px, ${((-_bv.y * 0.5 + 0.5) * H).toFixed(0)}px) translate(-50%,-100%)`;
    const face = p.chase > 0 ? '🤬' : p.mood >= 2 ? '😡' : p.mood === 1 ? '😠' : '🙂';
    const who = p.kind === 'oma' ? 'Oma' : 'Opa';
    const html = `<b>${face} ${who}</b>${p.sayT > 0 ? '<span>' + p.say + '</span>' : ''}<i><u style="width:${p.anger.toFixed(0)}%;background:${p.anger > 80 ? '#ff3b3b' : p.anger > 50 ? '#ff9a2a' : '#ffd23a'}"></u></i>`;
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
  }
}
peds.colliders = world.colliders;
peds.onSmack = (p) => {
  const who = p.kind === 'oma' ? 'Oma' : 'Opa';
  const how = p.kind === 'oma' ? 'mit der Handtasche' : 'mit dem Gehstock';
  earn(-25);
  toast(`${who} erwischt dich!`, `Ein Schlag ${how} · −25 €`, 2400);
  audio.thud(6); audio.bell();
  st.crashT = 0.5; $('crash').style.opacity = 0.7;
  if (st.mode === 'walk') walker.stun = 1.1; else scooter.v *= 0.2;
};
peds.onMood = (p, mood) => {
  const who = p.kind === 'oma' ? 'Oma' : 'Opa';
  if (mood === 3) toast(`${who} ist stinksauer!`, 'Sie rennt dir mit 10 km/h hinterher – fahr weg!', 3000);
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
    const cars = traffic.update(dt2, me, sig);
    const pl = peds.update(dt2, me, sig, now);
    dynAll.length = 0;
    for (const c of cars) dynAll.push(c);
    for (const c of pl) dynAll.push(c);
    for (const c of net.dynList ? net.dynList() : []) dynAll.push(c);

    // physics in small steps (the parked scooter keeps simulating)
    simAcc += dt;
    let steps = 0;
    const odo0 = scooter.odo;
    const rideInp = walking ? PARK : inp;
    while (simAcc > 0 && steps < 6) {
      const h = Math.min(simAcc, 1 / 90);
      scooter.update(h, rideInp, world, cfg.battMode === 'off' ? 0 : cfg.battMode === 'real' ? 1 : 3, dynAll);
      simAcc -= h; steps++;
      if (!walking && scooter.impact > 1.8) onCrash(scooter.impact);
    }
    if (walking) {
      parkDyn.length = 0;
      const sx = Math.sin(scooter.heading), cz = Math.cos(scooter.heading);
      for (const o of [-0.55, 0, 0.55]) parkDyn.push({ x: scooter.x + sx * o, z: scooter.z + cz * o, r: 0.3, vx: 0, vz: 0 });
      walkDyn.length = 0;
      for (const c of dynAll) walkDyn.push(c);
      for (const c of parkDyn) walkDyn.push(c);
      walker.update(dt2, inp, world.colliders, walkDyn);
    }
    if (scooter.fellEvent) { scooter.fellEvent = false; st.score = Math.max(0, st.score - 150); toast('Sturz!', '−150 Punkte – zu schnell gegen ein Hindernis', 2200); audio.thud(14); st.crashT = 1; $('crash').style.opacity = 0.9; }
    if (scooter.wheelieEvent) {
      const ev = scooter.wheelieEvent; scooter.wheelieEvent = null;
      st.wheelies = (st.wheelies || 0) + 1;
      earn(100); st.score += 150 + ev.dur * 40;
      audio.chime([660, 880, 1100, 1480]);
      toast('WHEELIE! +100 €', `${ev.dur.toFixed(1)} s auf dem Hinterrad · ${st.wheelies}. Wheelie`, 2200);
    }
    if (scooter.pedHit) {
      const p = scooter.pedHit; scooter.pedHit = null;
      if (!p.down || p.down <= 0) { p.down = 3.2; st.score = Math.max(0, st.score - 100); toast(p.kind === 'scooter' ? 'Pass auf, Roller-Fahrer!' : p.elder ? (p.kind === 'oma' ? 'Oma umgefahren!' : 'Opa umgefahren!') : 'Vorsicht, Fußgänger!', '−100 Punkte', 1500); audio.bell(); if (p.elder) p.anger = Math.min(100, p.anger + 40); }
    }
    simAcc = 0;
    const dOdo = scooter.odo - odo0;
    st.odoTotal += dOdo;
    st.score += dOdo * 0.2 * (1 + scooter.kmh / 45);
    earn(dOdo * 0.004);
    if (cfg.flow) cfg.hours = (cfg.hours + dt / 90) % 24;
    st.trafficT += dt;
    missionUpdate(dt);
    // stuck hint
    if (st.mode === 'ride' && inp.fwd && Math.abs(scooter.v) < 0.25) { st.stuckT += dt; if (st.stuckT > 3) { toast('Steckst du fest?', 'Drücke R, um dich auf die Straße zu setzen', 2500); st.stuckT = -6; } } else if (st.stuckT > 0) st.stuckT = 0;
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
      net.sendState({ x: me.x, z: me.z, h: me.heading, v: walking ? walker.speed : scooter.v, l: scooter.lean, m: walking ? 1 : 0, vs: st.vesc ? 1 : 0, sx: scooter.x, sz: scooter.z, sh: scooter.heading, w: scooter.wheelie });
    }
  }
  net.update(dt, performance.now());
  // world streaming
  const missing = world.update(me.x, me.z, active ? 1 : 2);

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
  sky.update(dt, _focus.copy(camera.position).lerp(_focus2.set(me.x, 0, me.z), 0.5).setY(0));
  const night = sky.night, lamps = sky.lampsOn;
  const win = lamps * 1.6;
  for (const k of ['plaster', 'brick', 'panel', 'glass']) M['f_' + k].emissiveIntensity = win;
  M.lampW.emissiveIntensity = lamps * 3.4;
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
  const head = st.userHead ?? lamps > 0.4;
  scooter.updateLights(night, head, dt, sky.hours);
  scooter.updateRider(dt, Math.abs(scooter.v));

  if (active || !st.started) updateCamera(dt, false);
  else updateCamera(dt, false);

  audio.update({ v: st.mode === 'walk' ? 0 : scooter.v, thr: scooter.thr, rain: st.rainAmt || 0, braking: scooter.braking, brakeAmt: Math.max(scooter.brk, scooter.space || 0), paused: !active, battEmpty: scooter.batt <= 0.2 });

  if (st.crashT > 0) { st.crashT -= dt; if (st.crashT <= 0) $('crash').style.opacity = 0; }
  if (active) { updateHUD(dt); updateBubbles(); }
  { const sp = 1 + 0.06 * Math.sin(now * 0.005); shopBeacon.userData.ring.scale.setScalar(sp); shopBeacon.userData.c1.rotation.y += dt * 0.4; const dsb = Math.hypot(me.x - SHOP.x, me.z - SHOP.z); shopBeacon.visible = !st.vesc && dsb > 14; }

  if (!render) return;
  if (composer && st.bloom) composer.render();
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
  shopBeacon.position.set(SHOP.x, groundHeight(SHOP.x, SHOP.z), SHOP.z);
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
window.__game = { net, walker, me, dismount, mount, interact, mouse, traffic, peds, tick, scene, camera, renderer, scooter, world, sky, cfg, st, M, setHours: (h) => { cfg.hours = h; cfg.flow = false; }, teleport: (x, z, h) => { scooter.reset(x, z, h); camYaw = h; }, start: () => { st.started = true; setPaused(false); }, toggleCam, setPaused, applyQuality, keys };

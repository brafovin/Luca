import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Glow, Smoke } from './particles.js';
import { Fireworks, ITEMS } from './fireworks.js';
import { Sound } from './audio.js';
import { buildWorld, PIER } from './world.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#view');

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x03060d);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 7000);

const sound = new Sound();
const glow = new Glow(120000);
const smoke = new Smoke(7000);
const fw = new Fireworks({ scene, camera, glow, smoke, sound });
scene.add(glow.mesh, glow.mirror, smoke.mesh);
const world = buildWorld(scene, fw, glow);

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 })
);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.6, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- Qualität ----------
const QUALITIES = [
  { name: 'Hoch', pr: Math.min(window.devicePixelRatio || 1, 2), bloom: true, density: 1, smoke: 1, mirror: true },
  { name: 'Mittel', pr: 1, bloom: true, density: 0.62, smoke: 0.6, mirror: true },
  { name: 'Niedrig', pr: 0.75, bloom: false, density: 0.35, smoke: 0.35, mirror: false },
];
let qIndex = 0;

function applyQuality(i) {
  qIndex = i;
  const q = QUALITIES[i];
  renderer.setPixelRatio(q.pr);
  fw.density = q.density;
  fw.smokeScale = q.smoke;
  glow.mirror.visible = q.mirror;
  bloom.enabled = q.bloom;
  $('#quality').textContent = 'Qualität: ' + q.name;
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  // Hochkant (Handy): größeres vertikales Sichtfeld
  camera.fov = w / h < 0.8 ? 78 : 62;
  camera.updateProjectionMatrix();
  glow.setView(renderer, camera);
  smoke.setView(renderer, camera);
}
window.addEventListener('resize', resize);

// ---------- Kamera ----------
const VIEWS = {
  platz: { name: 'Marktplatz', x: 0, y: 1.7, z: 36, yaw: 0, pitch: 0.3 },
  wiese: { name: 'Feuerwerkswiese', x: 26, y: 1.7, z: -30, yaw: 0.12, pitch: 0.12 },
  ufer: { name: 'Seeufer', x: 0, y: 1.7, z: -143, yaw: 0, pitch: 0.55 },
  steg: { name: 'Steg im See', x: -68, y: 1.7, z: -292, yaw: -2.5, pitch: 0.25 },
  luft: { name: 'Von oben', x: 0, y: 70, z: 60, yaw: 0, pitch: -0.05 },
};
const cam = { ...VIEWS.platz };
let tween = null;

function goTo(key) {
  const v = VIEWS[key];
  $('#viewName').textContent = v.name;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === key));
  tween = { from: { ...cam }, to: v, t: 0 };
}

const keys = new Set();
const BOUNDS = { x: 90, zMin: -146, zMax: 124, yMin: 1.7, yMax: 130 };

function updateCamera(dt) {
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.6);
    const k = tween.t * tween.t * (3 - 2 * tween.t);
    for (const p of ['x', 'y', 'z', 'yaw', 'pitch']) cam[p] = tween.from[p] + (tween.to[p] - tween.from[p]) * k;
    if (tween.t >= 1) tween = null;
  } else {
    const run = keys.has('shift') ? 3.5 : 1;
    const speed = (cam.y > 8 ? 22 : 5) * run;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = 0, mz = 0, my = 0;
    if (keys.has('w') || keys.has('arrowup')) { mx += fx; mz += fz; }
    if (keys.has('s') || keys.has('arrowdown')) { mx -= fx; mz -= fz; }
    if (keys.has('d') || keys.has('arrowright')) { mx += rx; mz += rz; }
    if (keys.has('a') || keys.has('arrowleft')) { mx -= rx; mz -= rz; }
    if (keys.has('e')) my += 1;
    if (keys.has('q')) my -= 1;
    const l = Math.hypot(mx, mz);
    if (l > 0) { cam.x += (mx / l) * speed * dt; cam.z += (mz / l) * speed * dt; }
    cam.y += my * (cam.y > 8 ? 30 : 8) * dt;
    if (pinchMove) { cam.x += fx * pinchMove; cam.z += fz * pinchMove; pinchMove = 0; }
  }
  const onPierX = cam.x > PIER.x0 - 1.5 && cam.x < PIER.x1 + 1.5;
  if (cam.z < BOUNDS.zMin && onPierX) {
    cam.x = Math.max(PIER.x0 + 0.7, Math.min(PIER.x1 - 0.7, cam.x));
    cam.z = Math.max(PIER.z1 + 1, cam.z);
  } else {
    cam.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, cam.x));
    cam.z = Math.max(BOUNDS.zMin, Math.min(BOUNDS.zMax, cam.z));
  }
  cam.y = Math.max(BOUNDS.yMin, Math.min(BOUNDS.yMax, cam.y));
  cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch));
  camera.position.set(cam.x, cam.y, cam.z);
  camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  world.sky.position.copy(camera.position);
}

// ---------- Eingabe ----------
let selected = 'rocket';
let pinchMove = 0;
const pointers = new Map();
let drag = null;

canvas.addEventListener('pointerdown', (e) => {
  if (!inv.classList.contains('hidden')) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
  tween = null;
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (pointers.size === 2) {
    // Pinch: vor/zurück laufen
    const [a, b] = [...pointers.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    p.x = e.clientX; p.y = e.clientY;
    const after = Math.hypot(a.x - b.x, a.y - b.y);
    pinchMove += (after - before) * 0.15;
    if (drag) drag.moved = 999;
    return;
  }
  p.x = e.clientX; p.y = e.clientY;
  if (drag && drag.id === e.pointerId) {
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 6) {
      const s = 0.0042 * (62 / camera.fov);
      cam.yaw -= dx * s;
      cam.pitch -= dy * s;
    }
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (drag && drag.id === e.pointerId) {
    const click = drag.moved <= 6 && performance.now() - drag.t < 450 && e.type === 'pointerup';
    drag = null;
    if (click) placeAt(e.clientX, e.clientY);
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  cam.x -= fx * e.deltaY * 0.02; cam.z -= fz * e.deltaY * 0.02;
  tween = null;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'b') { toggleInv(); return; }
  if (k === 'escape') { toggleInv(false); return; }
  if (!inv.classList.contains('hidden')) return;
  if (k === ' ') { e.preventDefault(); startShow(); return; }
  if (k >= '1' && k <= '9' && Object.keys(ITEMS)[+k - 1]) { select(Object.keys(ITEMS)[+k - 1]); return; }
  keys.add(k);
  tween = null;
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

const ray = new THREE.Raycaster();
function placeAt(cx, cy) {
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  if (d.y >= -0.01) return;
  const t = -o.y / d.y;
  const x = o.x + d.x * t, z = o.z + d.z * t;
  if (Math.abs(x) > 240 || z < -146 || z > 130 || t > 400) return;
  sound.resume();
  fw.place(selected, x, z);
}

// ---------- UI ----------
const HINTS = {
  rocket: 'Rakete in der Flasche – steigt bis ~60 m, pfeift und zerplatzt',
  battery: 'Verbundbatterie mit 25 Schuss – Fächer aus kleinen Kugeln',
  fountain: 'Fontäne – sprüht ~24 s Funken, bis ca. 5 m hoch',
  volcano: 'Vulkan – wechselt die Farben, knistert, Finale mit Kugeln',
  candle: 'Römische Kerze – 9 farbige Leuchtkugeln nacheinander',
  banger: 'Böller – vier Knaller, laut und kurz (Gehörschutz!)',
  chain: 'Böllerkette – 24 Knaller in schneller Folge',
  bomb: 'Kugelbombe – ein einziger, sehr lauter Riesenknall',
  sparkler: 'Wunderkerze – glüht ca. 28 s',
};
const inv = $('#inv');
Object.entries(ITEMS).forEach(([key, it], i) => {
  const b = document.createElement('button');
  b.className = 'item';
  b.dataset.item = key;
  b.innerHTML = `<span class="ic">${it.icon}</span><b>${it.label}</b><small>${HINTS[key]}</small><kbd>${i + 1}</kbd>`;
  b.addEventListener('click', () => { select(key); toggleInv(false); });
  $('#invgrid').appendChild(b);
});
function toggleInv(open) {
  const show = open ?? inv.classList.contains('hidden');
  if (overlayOpen && show) return;
  inv.classList.toggle('hidden', !show);
  if (show) keys.clear();
}
inv.addEventListener('pointerdown', (e) => { if (e.target === inv) toggleInv(false); });
$('#invBtn').addEventListener('click', () => toggleInv());
function select(key) {
  selected = key;
  document.querySelectorAll('.item').forEach((b) => b.classList.toggle('sel', b.dataset.item === key));
  $('#hint').innerHTML = `${ITEMS[key].icon} <b>${ITEMS[key].label}</b> – klicke auf den Boden · <b>B</b> Inventar`;
}

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.view)));
$('#wind').addEventListener('input', (e) => {
  const w = +e.target.value;
  fw.wind.set(w, 0, w * 0.25);
});
$('#quality').addEventListener('click', () => applyQuality((qIndex + 1) % QUALITIES.length));
$('#mute').addEventListener('click', () => {
  sound.init();
  sound.setMuted(!sound.muted);
  $('#mute').textContent = sound.muted ? '🔇' : '🔊';
});
$('#clear').addEventListener('click', () => {
  fw.reset();
  $('#showBtn').disabled = false;
});
function startShow() {
  if (overlayOpen) return;
  sound.resume();
  fw.startShow();
}
$('#showBtn').addEventListener('click', startShow);

let overlayOpen = true;
function begin(withSound) {
  overlayOpen = false;
  $('#overlay').style.display = 'none';
  sound.muted = !withSound;
  if (withSound) sound.init();
  $('#mute').textContent = withSound ? '🔊' : '🔇';
  if (!withSound) sound.setMuted(true);
  sound.resume();
}
$('#startSound').addEventListener('click', () => begin(true));
$('#startMute').addEventListener('click', () => begin(false));

// ---------- Loop ----------
let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsShow = 0;
let slowTime = 0, autoTuned = false;

function step(dt) {
  updateCamera(dt);
  fw.update(dt);
  world.update(dt, fw.time);
}

function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0.0005, raw));
  step(dt);
  composer.render();

  fpsAcc += raw; fpsN++;
  if (fpsAcc > 0.5) {
    fpsShow = fpsN / fpsAcc;
    $('#fps').textContent = fpsShow.toFixed(0);
    fpsAcc = 0; fpsN = 0;
  }
  // Auto-Qualität: wenn lange zu langsam, eine Stufe runter
  if (!overlayOpen && !autoTuned) {
    slowTime = fpsShow && fpsShow < 24 ? slowTime + raw : 0;
    if (slowTime > 4 && qIndex < QUALITIES.length - 1) { applyQuality(qIndex + 1); slowTime = 0; }
  }
  // Show-Anzeige
  const show = fw.show;
  const btn = $('#showBtn'), bar = $('#showBar');
  if (show) {
    const p = Math.min(1, (fw.time - show.t0) / show.dur);
    btn.disabled = true;
    btn.textContent = '🎇 Show läuft …';
    bar.style.display = 'block';
    bar.firstElementChild.style.width = p * 100 + '%';
  } else if (btn.disabled) {
    btn.disabled = false;
    btn.textContent = '🎇 Große Show starten';
    bar.style.display = 'none';
  }
  requestAnimationFrame(frame);
}

// Teststeuerung (auch für Screenshots): Simulation ohne Echtzeit vorspulen
window.fireworkMap = {
  fw, camera, cam, glow, smoke, world, renderer, composer, bloom,
  advance(seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) step(dt);
  },
  render() { composer.render(); },
  view(key) { Object.assign(cam, VIEWS[key]); tween = null; },
  begin,
  quality: applyQuality,
  lockQuality() { autoTuned = true; },
};

applyQuality(0);
select('rocket');
goTo('platz');
tween = null;
Object.assign(cam, VIEWS.platz);
$('#loadmsg').textContent = '';
requestAnimationFrame(frame);

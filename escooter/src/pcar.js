import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { addCar, addWheel, ensureWheelParts } from './cars.js';
import { addSeated } from './people.js';
import { mulberry32 } from './util.js';

/** Cars sold by the dealership. Drivable through the same physics as the scooters (spec table). */
export const CARS = {
  car_mini: { id: 'car_mini', name: 'Stadtflitzer', type: 0.12, color: '#e8c020', price: 2500, kmh: 135, a: 4.6, knee: 12, aLat: 8.4, drag2: 0.00055, brake: 8.5, info: 'Kleiner Flitzer · 135 km/h' },
  car_sedan: { id: 'car_sedan', name: 'Limousine', type: 0.45, color: '#1f3a63', price: 5000, kmh: 190, a: 6.2, knee: 17, aLat: 9.4, drag2: 0.00042, brake: 9.5, info: 'Bequeme Reiselimousine · 190 km/h' },
  car_suv: { id: 'car_suv', name: 'Geländewagen', type: 0.7, color: '#2e4a3a', price: 7500, kmh: 165, a: 5.6, knee: 14, aLat: 7.6, drag2: 0.0005, brake: 9.0, info: 'Hoher SUV, solide · 165 km/h' },
  car_sport: { id: 'car_sport', name: 'Supersportwagen', type: 0.45, sport: true, color: '#c8141c', price: 12000, kmh: 250, a: 11, knee: 26, aLat: 12, drag2: 0.00032, brake: 13, info: 'Tiefer Renner mit Heckflügel · 250 km/h · qualmender Vierfach-Auspuff' },
};
export const CAR_IDS = Object.keys(CARS);

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Builds a playable car model compatible with the Scooter model contract. ctx.M = world materials */
export function buildCarModel(ctx, c) {
  const M = ctx.M;
  const rnd = mulberry32(c.id.length * 977 + Math.round(c.price));
  const S = new BatchSet();
  const dim = addCar(S, rnd, { type: c.type, sport: !!c.sport, color: c.color, lights: 'lampW', people: false, noWheels: true });
  const group = new THREE.Group();
  const map = { paint: 'paint', glass: 'glass', cglass: 'carGlass', generic: 'generic', lampW: 'lampW' };
  for (const [k, b] of Object.entries(S.b)) {
    if (b.empty) continue;
    const m = new THREE.Mesh(b.build(), M[map[k]]);
    m.castShadow = k !== 'glass' && k !== 'cglass' && k !== 'lampW';
    m.receiveShadow = true;
    group.add(m);
  }
  const sport = !!c.sport;
  const Lw = sport ? dim.L / 1.06 : dim.L, Ww = sport ? dim.W / 1.05 : dim.W;
  // wheels: front pairs steer, all spin
  ensureWheelParts();
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const WB = new BatchSet(); addWheel(WB.get('generic'), 0, 0, 0, sx);
    const wx = sx * (Ww / 2 - 0.13) * (sport ? 1.03 : 1), wz = sz * Lw * 0.31;
    const pivot = new THREE.Group(); pivot.position.set(wx, 0.335, wz);
    const spin = new THREE.Group(); pivot.add(spin);
    const mesh = new THREE.Mesh(WB.get('generic').build(), M.generic); mesh.castShadow = true; spin.add(mesh);
    group.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0 });
  }
  // the driver (left-hand drive), only visible while the player sits in the car
  const cab = dim.cab, prof = cab.prof;
  const zD = prof[2][0] - 0.3 * (sport ? 1.06 : 1), wz2 = zD + 0.62 * (sport ? 1.06 : 1);
  const DB = new BatchSet(); const sc = sport ? 0.8 : 1;
  addSeated(DB.get('generic'), 0.4 * (sport ? 1.05 : 1), 0.56 * sc, zD - 0.1, { wheel: { x: 0.4 * (sport ? 1.05 : 1), y: 0.96 * sc, z: wz2 }, female: false, shirt: '#2f3b4a' }, rnd);
  const driver = new THREE.Group();
  for (const [k, b] of Object.entries(DB.b)) { if (b.empty) continue; const m = new THREE.Mesh(b.build(), M.generic); m.castShadow = true; driver.add(m); }
  driver.visible = false;
  group.add(driver);
  const dummyGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  const v = c.kmh / 3.6;
  const wb = Lw * 0.62;
  const exX = sport ? 0.32 : 0.52 * (Ww > 1.9 ? 1 : 0.9);
  const spec = { vN: v, vT: v, vVN: v, vVT: v, aN: c.a, aT: c.a, aVN: c.a, aVT: c.a, kN: c.knee, kT: c.knee, kVN: c.knee, kVT: c.knee, drag2: c.drag2, brake: c.brake, space: c.brake + 2, cap: c.brake + 3, aLat: c.aLat, mass: 1400, wheelie: 0 };
  const hip = (sport ? 0.8 : 1);
  return {
    id: c.id, name: c.name, group, steer: new THREE.Group(), frontWheel: new THREE.Group(), rearWheel: new THREE.Group(), vescParts: [], glow: dummyGlow, glowSize: [0.1, 0.1],
    paint: { body: [], accent: [] }, noVesc: true, noDecor: true, noPaint: true, car: true, riderDY: 0, wheelieBar: new THREE.Group(), driver,
    exhaust: { stock: V3(sport ? 0.32 : exX, 0.37 * sc, -dim.L / 2 - 0.12), pipes: sport ? [V3(0.42, 0.34, -dim.L / 2 - 0.12), V3(0.22, 0.34, -dim.L / 2 - 0.12), V3(-0.22, 0.34, -dim.L / 2 - 0.12), V3(-0.42, 0.34, -dim.L / 2 - 0.12)] : [V3(exX, 0.37, -dim.L / 2 - 0.12)] },
    gripLocal: [V3(0.3, 1, 0), V3(-0.3, 1, 0)], foot: [V3(0.2, 0.2, 0), V3(-0.2, 0.2, 0)],
    half: wb / 2, wheelbase: wb, wheelR: 0.335, spotPos: [0, 0.7, dim.L / 2], dispMode: 'AUTO',
    fp: { y: 1.22 * (sport ? 0.8 : 1), x: 0.4 * (sport ? 1.05 : 1) * 1, z: zD - 0.05, pitch: 0.0 },
    colR: Ww * 0.5 + 0.04, colOffs: [dim.L * 0.3, 0, -dim.L * 0.3], camMul: 1.9 + (dim.H > 1.6 ? 0.3 : 0), dismountOff: Ww / 2 + 0.9, mountR: 4.6,
    dims: { L: dim.L, W: dim.W, H: dim.H, type: c.type, sport },
    spec, update(sc2) { for (const w of wheels) { w.spin.rotation.x = sc2.wheelAng; if (w.front) w.pivot.rotation.y = sc2.delta * 0.9; } },
  };
}

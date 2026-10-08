import * as THREE from 'three';

/** Small helpers to put people (with faces) into merged batches: car drivers, passengers, scooter riders. */
const unitCyl = new THREE.CylinderGeometry(1, 0.9, 1, 8); unitCyl.translate(0, 0.5, 0);
const sph = new THREE.SphereGeometry(1, 10, 8);
const _q = new THREE.Quaternion(), _u = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const SKINS = ['#e8bd9a', '#c98d62', '#8d5a3b', '#f1cfb2', '#6b4630', '#f4d6bf'];
export const HAIRS = ['#2a1d14', '#5a3a22', '#d9b36a', '#1a1a1a', '#8a8a8a', '#9a4a22', '#e8e0d8'];
export const SHIRTS = ['#2f4a7a', '#8a2f2f', '#2f6a4a', '#d6b24a', '#e9e9e6', '#4a4a4f', '#6a3f7a', '#e07a2e', '#244e5f', '#c9c9c9'];

export function limb(B, a, b, r, col) {
  _d.subVectors(b, a);
  const l = _d.length() || 1e-3;
  _q.setFromUnitVectors(_u, _d.multiplyScalar(1 / l));
  _m.compose(a, _q, _s.set(r, l, r));
  B.geo(unitCyl, _m, col);
}
export function ball(B, x, y, z, rx, ry, rz, col, rotX = 0) {
  _q.setFromEuler(_e.set(rotX, 0, 0));
  _m.compose(_p.set(x, y, z), _q, _s.set(rx, ry, rz));
  B.geo(sph, _m, col);
}

/**
 * A face on a head centred at (x, y, z) looking along +z (head radius ~0.1):
 * eyes with whites + irises, brows, nose, mouth, ears, optional hair / glasses / stubble.
 */
export function addFace(B, x, y, z, o = {}, rnd = Math.random) {
  const skin = o.skin || SKINS[Math.floor(rnd() * SKINS.length)];
  const hair = o.hair === null ? null : (o.hair || HAIRS[Math.floor(rnd() * HAIRS.length)]);
  const iris = o.iris || ['#3a2a1a', '#2a4a7a', '#3a6a4a', '#5a3a1a'][Math.floor(rnd() * 4)];
  const R = o.r || 0.1;
  const k = R / 0.1;
  const f = (v) => v * k;
  for (const sx of [-1, 1]) {
    B.box(x + sx * f(0.038), y + f(0.016), z + f(0.093), f(0.032), f(0.02), f(0.012), '#f4f4f2');               // eye white
    B.box(x + sx * f(0.04), y + f(0.016), z + f(0.1), f(0.016), f(0.016), f(0.008), iris);                    // iris
    B.box(x + sx * f(0.04), y + f(0.016), z + f(0.1045), f(0.007), f(0.008), f(0.004), '#08080a');            // pupil
    B.box(x + sx * f(0.038), y + f(0.042), z + f(0.093), f(0.044), f(0.009), f(0.014), o.brow || hair || '#2a1d14'); // brow
    B.box(x + sx * f(0.104), y - f(0.004), z + f(0.0), f(0.014), f(0.04), f(0.026), skin);                    // ear
  }
  B.box(x, y - f(0.012), z + f(0.103), f(0.026), f(0.05), f(0.034), skin);                                    // nose
  B.box(x, y - f(0.034), z + f(0.108), f(0.03), f(0.012), f(0.014), skin);                                    // nose tip
  B.box(x, y - f(0.06), z + f(0.098), f(0.05), f(0.011), f(0.012), o.mouth || '#9a4a4a');                       // mouth
  B.box(x, y - f(0.073), z + f(0.093), f(0.04), f(0.008), f(0.012), skin);                                    // chin shadow lip
  if (o.stubble) B.box(x, y - f(0.068), z + f(0.088), f(0.1), f(0.05), f(0.018), '#4a3a32');
  if (o.glasses) {
    for (const sx of [-1, 1]) B.box(x + sx * f(0.04), y + f(0.016), z + f(0.108), f(0.05), f(0.036), f(0.006), '#101114');
    B.box(x, y + f(0.022), z + f(0.108), f(0.03), f(0.006), f(0.006), '#101114');
  }
  if (hair) { // short hair cap + sideburns, or long hair behind the head
    _q.identity(); _m.compose(_p.set(x, y + f(0.012), z - f(0.006)), _q, _s.set(R * 1.08, R * 1.1, R * 1.08));
    B.geo(hairCap, _m, hair);
    if (o.long) { B.box(x, y - f(0.06), z - f(0.1), f(0.2), f(0.2), f(0.05), hair); }
    else B.box(x, y + f(0.075), z + f(0.058), f(0.19), f(0.03), f(0.04), hair); // fringe
    for (const sx of [-1, 1]) B.box(x + sx * f(0.098), y + f(0.02), z + f(0.03), f(0.02), f(0.05), f(0.05), hair);
  }
}
const hairCap = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);

/** Head sphere + face on top of a neck. */
export function addHead(B, x, y, z, o = {}, rnd = Math.random) {
  const skin = o.skin || SKINS[Math.floor(rnd() * SKINS.length)];
  o = { ...o, skin };
  ball(B, x, y, z, 0.1, 0.112, 0.106, skin);
  limb(B, V(x, y - 0.2, z - 0.03), V(x, y - 0.06, z - 0.01), 0.045, skin); // neck
  addFace(B, x, y, z, o, rnd);
}

/**
 * A seated person (driver/passenger): hips at (x, hipY, z), looking along +z.
 * wheel: optional steering-wheel centre (both hands on it)
 */
export function addSeated(B, x, hipY, z, o = {}, rnd = Math.random) {
  const skin = o.skin || SKINS[Math.floor(rnd() * SKINS.length)];
  const shirt = o.shirt || SHIRTS[Math.floor(rnd() * SHIRTS.length)];
  const pants = o.pants || ['#2a3142', '#3b3b3f', '#5a4a3a', '#1f2430'][Math.floor(rnd() * 4)];
  const female = o.female ?? rnd() < 0.4;
  const lean = o.lean ?? 0.1;
  // legs
  for (const sx of [-1, 1]) {
    const hip = V(x + sx * 0.1, hipY, z);
    const knee = o.moped ? V(x + sx * 0.14, hipY - 0.03, z + 0.4) : V(x + sx * 0.11, hipY + 0.07, z + 0.38);
    const foot = o.moped ? V(x + sx * 0.16, 0.34, z + 0.3) : V(x + sx * 0.11, hipY - 0.2, z + 0.5);
    limb(B, hip, knee, 0.075, pants); limb(B, knee, foot, 0.058, pants);
    B.box(foot.x, foot.y - 0.02, foot.z + 0.05, 0.1, 0.06, 0.24, '#222226');
  }
  // torso with shoulders
  const sh = V(x, hipY + 0.5, z - lean * 0.5);
  limb(B, V(x, hipY, z - 0.02), sh, female ? 0.15 : 0.17, shirt);
  ball(B, x, hipY + 0.47, z - lean * 0.45, female ? 0.2 : 0.23, 0.1, 0.12, shirt);            // shoulder line
  if (o.belt !== false) limb(B, V(x, hipY + 0.28, z - 0.04), V(x, hipY + 0.5, z - lean * 0.3), 0.003, shirt);
  // arms
  for (const sx of [-1, 1]) {
    const s = V(x + sx * 0.22, hipY + 0.46, z - lean * 0.45);
    let hand;
    if (o.wheel) hand = V(o.wheel.x + sx * (o.handDX ?? 0.1), o.wheel.y + 0.02, o.wheel.z);
    else hand = V(x + sx * 0.14, hipY + 0.14, z + 0.28);
    const elbow = V((s.x + hand.x) / 2 + sx * 0.04, Math.min(s.y, hand.y) - 0.04, (s.z + hand.z) / 2 - 0.05);
    limb(B, s, elbow, 0.052, shirt); limb(B, elbow, hand, 0.044, shirt);
    ball(B, hand.x, hand.y, hand.z, 0.045, 0.04, 0.05, skin);
  }
  addHead(B, x, hipY + 0.69, z - lean * 0.2 + 0.02, { skin, hair: o.hair, long: female && rnd() < 0.7, glasses: rnd() < 0.15, stubble: !female && rnd() < 0.2, iris: o.iris }, rnd);
}

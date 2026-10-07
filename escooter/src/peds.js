import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { P } from './world.js';
import { pushOut } from './phys.js';
import { clamp, damp } from './util.js';

const SKIN = ['#e8bd9a', '#c98d62', '#8d5a3b', '#f1cfb2', '#6b4630'];
const CLOTH = ['#2f4a7a', '#8a2f2f', '#2f6a4a', '#d6b24a', '#4a4a4f', '#c9c9c9', '#6a3f7a', '#e07a2e', '#244e5f', '#7a6a58'];
const PANTS = ['#2a3142', '#3b3b3f', '#5a4a3a', '#1f2430', '#4a5568'];
const HAIR = ['#2a1d14', '#5a3a22', '#d9b36a', '#1a1a1a', '#8a8a8a'];
const OMA_COAT = ['#9a7ab8', '#5a9aa0', '#c98a9a', '#a8b878', '#d8c8a0'];
const OMA_HAIR = ['#f2f2f2', '#d8d8e8', '#c9a8e0', '#e8e0d8'];
const OPA_COAT = ['#8a7a5a', '#5a6a4a', '#6a6a72', '#7a5a3a'];

const SAY = {
  oma: {
    1: ['Hallo?! Geht\'s noch?', 'Junge, fahr woanders!', 'Das ist ein Gehweg-Rollator-Bereich!', 'Ach du meine Güte!'],
    2: ['Das melde ich dem Ordnungsamt!', 'Früher gab\'s sowas nicht!', 'Ich rufe meinen Enkel an!', 'So eine Frechheit!'],
    3: ['BLEIB STEHEN, DU RÜPEL!', 'Na warte, ich krieg dich!', 'Ich hab\'s im Rücken, aber dich kriege ich!'],
  },
  opa: {
    1: ['Pass doch auf, Bürschchen!', 'Hmpf. Immer diese Elektrodinger.', 'Fahr gefälligst langsamer!', 'Zu meiner Zeit...'],
    2: ['Ich hol gleich meinen Stock!', 'Das ist doch unerhört!', 'Wo ist denn deine Mutter?!', 'Ich kenne den Bürgermeister!'],
    3: ['KOMM SOFORT HER!', 'Dir zeig ich\'s! Warte nur!', 'Bleib stehen, du Lümmel!'],
  },
};

function mergedGeo(fn) { const s = new BatchSet(); const b = s.get('a'); b.ao = false; fn(b); return b.build(); }

export class Pedestrians {
  constructor(scene, M, count = 16, elders = 6) {
    this.list = [];
    this.young = count;
    this.count = count + elders;
    const total = this.count;
    this.dyn = [];
    this.colliders = null;
    this.onSmack = null; this.onMood = null;
    const mk = (geo, vc = false) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: vc }), total);
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    };
    const box = (w, h, d, pivotTop) => { const g = new THREE.BoxGeometry(w, h, d); if (pivotTop) g.translate(0, -h / 2, 0); return g; };
    const rollGeo = mergedGeo((B) => {
      const c = '#8a2a3a';
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.box(sx * 0.27, 0.45, sz * 0.2, 0.025, 0.9, 0.025, '#b9bdc2'); B.box(sx * 0.27, 0.04, sz * 0.2, 0.05, 0.08, 0.07, '#222'); }
      B.box(0, 0.88, 0.2, 0.58, 0.03, 0.03, '#b9bdc2'); B.box(0, 0.62, 0, 0.5, 0.03, 0.45, c); B.box(0, 0.88, -0.2, 0.58, 0.03, 0.03, '#b9bdc2');
      B.box(0, 0.35, -0.2, 0.5, 0.02, 0.02, '#b9bdc2'); B.box(0, 0.5, 0.2, 0.5, 0.02, 0.02, '#b9bdc2');
      B.box(0, 0.76, 0.2, 0.34, 0.2, 0.01, '#222');
    });
    const caneGeo = mergedGeo((B) => { B.box(0, 0.42, 0, 0.03, 0.84, 0.03, '#6a4a2c'); B.box(0, 0.86, 0.035, 0.03, 0.03, 0.09, '#6a4a2c'); B.box(0, 0.02, 0, 0.045, 0.04, 0.045, '#222'); });
    const bagGeo = mergedGeo((B) => { B.box(0, 0, 0, 0.28, 0.2, 0.1, '#6a3a2a'); B.box(0, 0.14, 0, 0.14, 0.02, 0.02, '#3a2a1a'); });
    this.parts = {
      torso: mk(box(0.36, 0.56, 0.2)),
      head: mk(new THREE.SphereGeometry(0.11, 10, 8)),
      legL: mk(box(0.15, 0.82, 0.17, true)), legR: mk(box(0.15, 0.82, 0.17, true)),
      armL: mk(box(0.1, 0.58, 0.12, true)), armR: mk(box(0.1, 0.58, 0.12, true)),
      hair: mk(new THREE.SphereGeometry(0.122, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)),
      cap: mk(new THREE.CylinderGeometry(0.125, 0.135, 0.05, 12)),
      cane: mk(caneGeo, true), bag: mk(bagGeo, true), roll: mk(rollGeo, true),
    };
    const c = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < total; i++) {
      const elder = i >= count;
      const kind = !elder ? 'young' : (i - count) % 2 === 0 ? 'oma' : 'opa';
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const p = { active: false, kind, elder, x: 0, z: 0, axis: 'x', dir: 1, side: 1, speed: elder ? 0.7 + Math.random() * 0.3 : 1.4, phase: Math.random() * 6, yaw: 0, wait: 0, down: 0, anger: 0, mood: 0, chase: 0, say: '', sayT: 0, cool: 0, lane: 0, s: 0 };
      p.has = { hair: kind !== 'opa' || Math.random() < 0.3, cap: kind === 'opa' && Math.random() < 0.75, cane: kind === 'opa' || (kind === 'oma' && Math.random() < 0.3), bag: kind === 'oma', roll: kind === 'oma' && Math.random() < 0.55 };
      if (kind === 'young') { p.has.hair = Math.random() < 0.85; p.has.cane = false; p.has.bag = Math.random() < 0.3; }
      if (p.has.roll) p.has.cane = false;
      if (p.has.cane && kind === 'oma') p.has.bag = false;
      this.list.push(p);
      const coat = kind === 'oma' ? pick(OMA_COAT) : kind === 'opa' ? pick(OPA_COAT) : CLOTH[i % CLOTH.length];
      this.parts.torso.setColorAt(i, c.set(coat));
      this.parts.head.setColorAt(i, c.set(pick(SKIN)));
      for (const k of ['legL', 'legR']) this.parts[k].setColorAt(i, c.set(kind === 'oma' ? pick(['#3a3a48', '#5a4a58', '#2a3a4a']) : PANTS[i % PANTS.length]));
      for (const k of ['armL', 'armR']) this.parts[k].setColorAt(i, c.set(coat));
      this.parts.hair.setColorAt(i, c.set(kind === 'oma' ? pick(OMA_HAIR) : kind === 'opa' ? '#d8d8d8' : pick(HAIR)));
      this.parts.cap.setColorAt(i, c.set(pick(['#6a6a60', '#4a4a50', '#7a6a50'])));
      for (const k of ['cane', 'bag', 'roll']) this.parts[k].setColorAt(i, c.set('#ffffff'));
      for (const k of Object.keys(this.parts)) this.parts[k].setMatrixAt(i, zero);
    }
    for (const k of Object.values(this.parts)) if (k.instanceColor) k.instanceColor.needsUpdate = true;
    this._m = new THREE.Matrix4(); this._b = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._t = new THREE.Matrix4(); this._zero = zero;
  }

  get elders() { return this.list.filter((p) => p.elder && p.active); }

  spawn(p, px, pz, R) {
    for (let tries = 0; tries < 10; tries++) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const line = Math.round((axis === 'x' ? pz : px) / P) + Math.floor(Math.random() * 3) - 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      const along = (axis === 'x' ? px : pz) + (Math.random() * 2 - 1) * R;
      const r = ((along % P) + P) % P;
      if (r < 12 || r > P - 12) continue;
      p.axis = axis; p.side = side; p.dir = Math.random() < 0.5 ? 1 : -1;
      p.lane = line * P + side * 8.4;
      p.s = along;
      const x = axis === 'x' ? p.s : p.lane, z = axis === 'x' ? p.lane : p.s;
      if (Math.hypot(x - px, z - pz) < 25) continue;
      p.active = true; p.speed = p.elder ? 0.65 + Math.random() * 0.35 : 1.1 + Math.random() * 0.6; p.wait = 0; p.down = 0;
      p.anger = 0; p.mood = 0; p.chase = 0; p.cool = 0; p.say = ''; p.sayT = 0; p.x = x; p.z = z;
      return;
    }
  }

  /** Bell / horn: startles elders nearby. */
  bell(px, pz) {
    for (const p of this.list) if (p.elder && p.active && p.chase <= 0 && Math.hypot(p.x - px, p.z - pz) < 10) p.anger = Math.min(100, p.anger + 28);
  }

  say(p, text, t = 3) { p.say = text; p.sayT = t; }

  update(dt, player, sig, now, R = 160) {
    const px = player.x, pz = player.z, pspeed = player.speed || 0;
    const t = now * 0.001;
    this.dyn.length = 0;
    const m = this._m, b = this._b, l = this._l, tt = this._t;
    const P_ = this.parts;
    for (let i = 0; i < this.count; i++) {
      const p = this.list[i];
      if (!p.active) this.spawn(p, px, pz, R);
      if (!p.active) { for (const k of Object.keys(P_)) P_[k].setMatrixAt(i, this._zero); continue; }
      let x = p.x, z = p.z;
      if (Math.hypot(x - px, z - pz) > R * 1.4) { p.active = false; continue; }
      let moving = true, yaw = p.yaw, running = false;
      // ---- anger of old people
      if (p.elder) {
        const d = Math.hypot(px - x, pz - z);
        if (p.chase <= 0) {
          if (p.cool > 0) p.cool -= dt;
          if (d < 4.8 && p.cool <= 0 && p.down <= 0) p.anger = Math.min(100, p.anger + (1 - d / 4.8) * (7 + 1.15 * Math.min(pspeed, 14)) * dt);
          else if (d > 7) p.anger = Math.max(0, p.anger - 3.5 * dt);
          const mood = p.anger >= 100 ? 3 : p.anger >= 60 ? 2 : p.anger >= 28 ? 1 : 0;
          if (mood !== p.mood && mood > p.mood) {
            p.mood = mood;
            const arr = SAY[p.kind][mood];
            this.say(p, arr[Math.floor(Math.random() * arr.length)], 3.6);
            if (this.onMood) this.onMood(p, mood);
          } else if (mood < p.mood && p.anger < 20) p.mood = mood;
          if (p.anger >= 100 && p.down <= 0) { p.chase = 28; p.mood = 3; }
          if (p.mood >= 1 && p.sayT <= 0 && Math.random() < dt * 0.35) { const arr = SAY[p.kind][p.mood]; this.say(p, arr[Math.floor(Math.random() * arr.length)], 3); }
        } else {
          p.chase -= dt; running = true;
          if (p.sayT <= 0 && Math.random() < dt * 0.4) { const arr = SAY[p.kind][3]; this.say(p, arr[Math.floor(Math.random() * arr.length)], 2.6); }
          if (p.down > 0) running = false;
          if (p.chase <= 0 || d > 90) { p.chase = 0; p.anger = 38; p.mood = 1; p.active = false; continue; }
        }
        if (p.sayT > 0) p.sayT -= dt;
      }
      if (p.down > 0) { p.down -= dt; moving = false; }
      if (running && moving) {
        // 10 km/h sprint straight at the player
        const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz) || 1;
        if (d > 1.15) {
          const sp = 2.78;
          let nx = x + (dx / d) * sp * dt, nz = z + (dz / d) * sp * dt;
          if (this.colliders) { const r = pushOut(nx, nz, 0.3, this.colliders, null, p); nx = r.x; nz = r.z; }
          p.x = x = nx; p.z = z = nz;
          p.phase += dt * 11;
        } else {
          p.phase += dt * 4;
          if (!p.smackCool || p.smackCool <= 0) {
            p.smackCool = 4;
            if (this.onSmack) this.onSmack(p);
            p.chase = 0; p.anger = 45; p.mood = 1; p.cool = 5; p.speed = 0.5;
          }
        }
        yaw = Math.atan2(dx, dz);
        p.yaw = yaw;
        p.s = p.axis === 'x' ? x : z; p.lane = p.axis === 'x' ? z : x;
      } else {
        // normal sidewalk walking
        if (p.smackCool > 0) p.smackCool -= dt;
        const r = ((p.s % P) + P) % P;
        const inWait = p.dir > 0 ? r >= P - 7.1 && r < P - 5.9 : r > 5.9 && r <= 7.1;
        if (inWait) {
          const unsafe = p.axis === 'x' ? sig.bG || sig.bY || sig.bSoon : sig.aG || sig.aY || sig.aSoon;
          if (unsafe) moving = false;
        }
        if (p.mood >= 2 && p.cool <= 0) moving = false; // stands and scolds
        if (p.cool > 0 && p.chase <= 0 && p.mood === 1 && p.cool > 0) moving = moving && p.cool < 2.5;
        if (moving) { p.s += p.dir * p.speed * dt; p.phase += dt * p.speed * (p.elder ? 4.4 : 5.2); }
        x = p.axis === 'x' ? p.s : p.lane; z = p.axis === 'x' ? p.lane : p.s;
        p.x = x; p.z = z;
        const ty = p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
        if (p.mood >= 2 && p.cool <= 0) { // turn towards the player to scold
          const target = Math.atan2(px - x, pz - z);
          let dd = target - yaw; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI;
          yaw += dd * Math.min(1, dt * 6);
        } else yaw = ty;
        p.yaw = yaw;
      }
      // ---- pose
      const sc = p.elder ? 0.93 : 1;
      const sw = (moving || running) ? Math.sin(p.phase) * (running ? 0.95 : p.elder ? 0.32 : 0.55) : 0;
      const hunch = p.elder ? (running ? 0.18 : 0.3) : 0;
      const lie = p.down > 0 ? Math.min(1, p.down * 3) : 0;
      b.makeRotationY(yaw);
      if (lie > 0) { tt.makeRotationX(-Math.PI / 2 * lie); b.multiply(tt); }
      b.setPosition(x, 0.12 + 0.2 * lie, z);
      tt.makeScale(sc, sc, sc); b.multiply(tt);
      const place = (mesh, rot0, ox, oy, oz, rot1 = 0) => {
        m.copy(b);
        tt.makeTranslation(0, 0.84, 0); m.multiply(tt);
        if (rot0) { tt.makeRotationX(rot0); m.multiply(tt); }
        tt.makeTranslation(ox, oy, oz); m.multiply(tt);
        if (rot1) { tt.makeRotationX(rot1); m.multiply(tt); }
        mesh.setMatrixAt(i, m);
      };
      const ground = (mesh, ox, oz, rotX = 0) => { m.copy(b); tt.makeTranslation(ox, 0, oz); m.multiply(tt); if (rotX) { tt.makeRotationX(rotX); m.multiply(tt); } mesh.setMatrixAt(i, m); };
      const angry = p.elder && !running && p.mood >= 2 && p.cool <= 0;
      let aL = -sw, aR = sw;
      if (p.has.roll && !running) aL = aR = -0.8;
      else if (p.has.cane && !running) aR = -0.55 + sw * 0.1;
      if (angry) aR = -2.5 + Math.sin(t * 15 + i) * 0.35;
      if (running) { aR = -2.4 + Math.sin(p.phase) * 0.45; aL = -Math.sin(p.phase) * 1.1; }
      place(P_.torso, hunch, 0, 0.28, 0);
      place(P_.head, hunch, 0, 0.71, p.elder ? 0.05 : 0.02);
      place(P_.legL, 0, 0.09, 0, 0, sw);
      place(P_.legR, 0, -0.09, 0, 0, -sw);
      place(P_.armL, hunch, 0.24, 0.54, 0, aL);
      place(P_.armR, hunch, -0.24, 0.54, 0, aR);
      if (p.has.hair) place(P_.hair, hunch, 0, 0.73, p.elder ? 0.05 : 0.02);
      if (p.has.cap) place(P_.cap, hunch, 0, 0.82, p.elder ? 0.06 : 0.03);
      if (p.has.cane && !running) ground(P_.cane, -0.3, 0.2, 0.05);
      if (p.has.bag) place(P_.bag, 0, 0.33, -0.12, 0.02);
      if (p.has.roll && !running) ground(P_.roll, 0, 0.5);
      this.dyn.push({ x, z, r: 0.32, vx: 0, vz: 0, ped: p });
    }
    for (const mesh of Object.values(P_)) mesh.instanceMatrix.needsUpdate = true;
    return this.dyn;
  }
}

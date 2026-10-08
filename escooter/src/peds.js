import * as THREE from 'three';
import { BatchSet } from './batch.js';
import { P, blockType, PLAY } from './world.js';
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
  constructor(scene, M, count = 16, elders = 6, kids = 4, playKids = 10, playPars = 4, teens = 10) {
    this.list = [];
    this.young = count;
    this.nElders = elders; this.nKids = kids; this.nPlayKids = playKids; this.nPlayPars = playPars;
    this.count = count + elders + kids + playKids + playPars + teens;
    this.nTeens = teens;
    const total = this.count;
    this.sites = [];
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
    const faceGeo = (angry) => mergedGeo((B) => {
      for (const sx of [-1, 1]) {
        B.box(sx * 0.04, 0.02, 0.099, 0.036, angry ? 0.014 : 0.024, 0.012, '#f4f4f2');
        B.box(sx * 0.04, 0.02, 0.106, 0.017, angry ? 0.012 : 0.017, 0.008, '#2a2018');
        B.box(sx * 0.04, 0.02, 0.1105, 0.008, 0.01, 0.004, '#050505');
        if (angry) { const g = new THREE.BoxGeometry(0.052, 0.012, 0.014); g.rotateZ(sx * -0.45); B.geo(g, new THREE.Matrix4().makeTranslation(sx * 0.04, 0.05, 0.103), '#3a3a3a'); }
        else B.box(sx * 0.04, 0.052, 0.101, 0.05, 0.01, 0.014, '#3a2a20');
      }
      if (angry) { B.box(0, -0.055, 0.1, 0.06, 0.03, 0.012, '#2a0a0c'); B.box(0, -0.043, 0.107, 0.05, 0.008, 0.006, '#f2f2f0'); }
      else B.box(0, -0.052, 0.102, 0.05, 0.01, 0.012, '#9a4a4a');
    });
    const noseGeo = mergedGeo((B) => { B.box(0, -0.012, 0.108, 0.028, 0.045, 0.036, '#ffffff'); B.box(0, -0.034, 0.112, 0.032, 0.012, 0.016, '#ffffff'); for (const sx of [-1, 1]) B.box(sx * 0.109, 0, 0, 0.012, 0.042, 0.028, '#ffffff'); });
    const glassGeo = mergedGeo((B) => { for (const sx of [-1, 1]) { B.box(sx * 0.04, 0.02, 0.114, 0.056, 0.004, 0.006, '#151515'); B.box(sx * 0.04, 0.0, 0.114, 0.056, 0.004, 0.006, '#151515'); B.box(sx * 0.068, 0.01, 0.114, 0.004, 0.026, 0.006, '#151515'); B.box(sx * 0.012, 0.01, 0.114, 0.004, 0.026, 0.006, '#151515'); B.box(sx * 0.109, 0.02, 0.05, 0.004, 0.004, 0.1, '#151515'); } B.box(0, 0.02, 0.114, 0.02, 0.004, 0.006, '#151515'); });
    this.parts = {
      face: mk(faceGeo(false), true), faceA: mk(faceGeo(true), true), nose: mk(noseGeo), glasses: mk(glassGeo, true),
      faceR: mk(mergedGeo((B) => { // menacing: scowl, hooded eyes, dark rings, scar, stubble
        for (const sx of [-1, 1]) {
          B.box(sx * 0.04, 0.018, 0.099, 0.036, 0.013, 0.012, '#f0eee8');
          B.box(sx * 0.04, 0.018, 0.106, 0.017, 0.012, 0.008, '#1a0c08'); B.box(sx * 0.04, 0.018, 0.1105, 0.008, 0.01, 0.004, '#000000');
          const g = new THREE.BoxGeometry(0.06, 0.016, 0.016); g.rotateZ(sx * 0.5); B.geo(g, new THREE.Matrix4().makeTranslation(sx * 0.04, 0.043, 0.104), '#1c1410');   // slanted brow
          B.box(sx * 0.04, 0.0, 0.1, 0.04, 0.008, 0.01, '#6a5048');                                                                                               // eye bags
        }
        B.box(0, -0.056, 0.1, 0.055, 0.02, 0.012, '#220a0c'); B.box(0, -0.047, 0.107, 0.045, 0.007, 0.006, '#e8e6e0');                                          // snarl with teeth
        B.box(0, -0.065, 0.092, 0.1, 0.045, 0.016, '#3a2e28');                                                                                                  // stubble
        const sc = new THREE.BoxGeometry(0.006, 0.07, 0.006); sc.rotateZ(0.5); B.geo(sc, new THREE.Matrix4().makeTranslation(0.062, 0.03, 0.098), '#b86a60');      // scar
      }), true),
      hood: mk(new THREE.SphereGeometry(0.148, 14, 10, Math.PI * 0.82, Math.PI * 1.36, 0, Math.PI * 0.7)),
      torso: mk(box(0.36, 0.56, 0.2)),
      head: mk(new THREE.SphereGeometry(0.11, 10, 8)),
      legL: mk(box(0.15, 0.82, 0.17, true)), legR: mk(box(0.15, 0.82, 0.17, true)),
      armL: mk(box(0.1, 0.58, 0.12, true)), armR: mk(box(0.1, 0.58, 0.12, true)),
      hair: mk(new THREE.SphereGeometry(0.122, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.4)),
      cap: mk(new THREE.CylinderGeometry(0.125, 0.135, 0.05, 12)),
      cane: mk(caneGeo, true), bag: mk(bagGeo, true), roll: mk(rollGeo, true),
      cigT: mk(mergedGeo((B) => { B.box(0.022, -0.052, 0.14, 0.016, 0.016, 0.09, '#f2f0e8'); B.box(0.022, -0.052, 0.19, 0.0145, 0.0145, 0.012, '#ff6a1a'); B.box(0.022, -0.052, 0.098, 0.0165, 0.0165, 0.03, '#d8a860'); }), true),
      swing: mk(mergedGeo((B) => { for (const sx of [-0.14, 0.14]) B.box(sx, -0.8, 0, 0.012, 1.6, 0.012, '#8a8d92'); B.box(0, -1.6, 0, 0.4, 0.04, 0.2, '#d42020'); }), true),
    };
    const c = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < total; i++) {
      const elder = i >= count && i < count + elders;
      const nk = i - count - elders;
      const kind = i < count ? 'young' : elder ? ((i - count) % 2 === 0 ? 'oma' : 'opa') : nk < kids ? 'kid' : nk < kids + playKids ? 'pkid' : nk < kids + playKids + playPars ? 'ppar' : 'teen';
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const p = { active: false, kind, elder, x: 0, z: 0, axis: 'x', dir: 1, side: 1, speed: elder ? 0.7 + Math.random() * 0.3 : 1.4, phase: Math.random() * 6, yaw: 0, wait: 0, down: 0, anger: 0, mood: 0, chase: 0, say: '', sayT: 0, cool: 0, lane: 0, s: 0 };
      p.has = { hair: kind !== 'opa' || Math.random() < 0.3, cap: kind === 'opa' && Math.random() < 0.75, cane: kind === 'opa' || (kind === 'oma' && Math.random() < 0.3), bag: kind === 'oma', roll: kind === 'oma' && Math.random() < 0.55 };
      if (kind === 'kid' || kind === 'pkid') { p.child = true; p.protect = true; p.has.hair = true; p.has.cane = p.has.bag = p.has.roll = p.has.cap = false; p.slot = kind === 'kid' ? nk : nk - kids; if (kind === 'kid') { p.parent = nk; this.list[nk].protect = true; this.list[nk].hasKid = i; } }
      if (kind === 'teen') {
        p.slot = nk - kids - playKids - playPars; p.rowdy = (p.slot % 5) < 3; p.has.hair = Math.random() < 0.7; p.has.cap = Math.random() < 0.55; p.has.cane = p.has.bag = p.has.roll = false;
        p.smoker = p.rowdy ? (p.slot % 5) !== 1 : false; p.ts = 'sit'; p.aggro = 0;
      }
      if (kind === 'ppar') { p.protect = true; p.slot = nk - kids - playKids; p.has.hair = true; p.has.cane = p.has.bag = p.has.roll = p.has.cap = false; }
      if (kind === 'young') { p.has.hair = Math.random() < 0.85; p.has.cane = false; p.has.bag = Math.random() < 0.3; }
      if (p.has.roll) p.has.cane = false;
      if (p.has.cane && kind === 'oma') p.has.bag = false;
      this.list.push(p);
      const coat = kind === 'oma' ? pick(OMA_COAT) : kind === 'opa' ? pick(OPA_COAT) : kind === 'kid' || kind === 'pkid' ? pick(['#ff4f4f', '#ffb020', '#2fb0ff', '#7ad04a', '#c85bff', '#ff7ab8', '#ffe14a']) : kind === 'teen' ? pick(p.rowdy ? ['#17181b', '#2b2d33', '#5a1a1a', '#1a2a4a', '#3a3a3f'] : ['#e8d020', '#2fb0ff', '#ff7ab8', '#7ad04a', '#e07a2e', '#c9c9c9']) : CLOTH[i % CLOTH.length];
      this.parts.torso.setColorAt(i, c.set(coat));
      const skin = pick(SKIN);
      this.parts.head.setColorAt(i, c.set(skin)); this.parts.nose.setColorAt(i, c.set(skin));
      p.has.glasses = elder ? Math.random() < 0.5 : Math.random() < 0.12;
      for (const k of ['legL', 'legR']) this.parts[k].setColorAt(i, c.set(kind === 'oma' ? pick(['#3a3a48', '#5a4a58', '#2a3a4a']) : kind === 'kid' || kind === 'pkid' ? pick(['#2a4a8a', '#3a3a3f', '#6a3f7a', '#2f6a4a']) : PANTS[i % PANTS.length]));
      for (const k of ['armL', 'armR']) this.parts[k].setColorAt(i, c.set(coat));
      this.parts.hood.setColorAt(i, c.set(kind === 'teen' ? pick(['#101114', '#1d1d22', '#2a1414', '#14202c']) : '#000000'));
      this.parts.hair.setColorAt(i, c.set(kind === 'oma' ? pick(OMA_HAIR) : kind === 'opa' ? '#d8d8d8' : pick(HAIR)));
      this.parts.cap.setColorAt(i, c.set(pick(['#6a6a60', '#4a4a50', '#7a6a50'])));
      for (const k of ['cane', 'bag', 'roll', 'face', 'faceA', 'faceR', 'glasses', 'swing', 'cigT']) this.parts[k].setColorAt(i, c.set('#ffffff'));
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
      p.anger = 0; p.mood = 0; p.chase = 0; p.cool = 0; p.say = ''; p.sayT = 0; p.x = x; p.z = z; p.hp = 100; p.ko = false; p.stabbed = false; p.taken = false; p.flinch = 0; p.hitStreak = 0; p.hitT = 0;
      return;
    }
  }

  /** nearest park blocks that hold a playground */
  refreshSites(px, pz) {
    this._siteT = (this._siteT || 0) - 1;
    if (this._siteT > 0) return;
    this._siteT = 30;
    const ci = Math.round(px / P), cj = Math.round(pz / P), out = [];
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      if (blockType(i, j) !== 'park') continue;
      const ox = i * P, oz = j * P, d = Math.hypot(ox + PLAY.cx - px, oz + PLAY.cz - pz);
      if (d < 120) out.push({ ox, oz, d });
    }
    out.sort((a, b) => a.d - b.d);
    this.sites = out;
  }

  /** draw one figure (child / play parent); o: x,y,z,yaw,sc,sw,hunch,legL,legR,aL,aR,head */
  drawFigure(i, p, o) {
    const P_ = this.parts, m = this._m, b = this._b, tt = this._t;
    b.makeRotationY(o.yaw);
    if (o.lie) { tt.makeRotationX(-Math.PI / 2 * o.lie); b.multiply(tt); }
    b.setPosition(o.x, o.lie ? 0.32 : o.y, o.z);
    tt.makeScale(o.sc, o.sc, o.sc); b.multiply(tt);
    const hs = o.head || 1;
    const place = (mesh, rot0, ox, oy, oz, rot1 = 0, sc2 = 1, rz = 0) => {
      m.copy(b);
      tt.makeTranslation(0, 0.84, 0); m.multiply(tt);
      if (rot0) { tt.makeRotationX(rot0); m.multiply(tt); }
      tt.makeTranslation(ox, oy, oz); m.multiply(tt);
      if (rot1) { tt.makeRotationX(rot1); m.multiply(tt); }
      if (rz) { tt.makeRotationZ(rz); m.multiply(tt); }
      if (sc2 !== 1) { tt.makeScale(sc2, sc2, sc2); m.multiply(tt); }
      mesh.setMatrixAt(i, m);
    };
    const h = o.hunch || 0;
    place(P_.torso, h, 0, 0.28, 0);
    place(P_.head, h, 0, 0.71, 0.02, 0, hs); place(P_.nose, h, 0, 0.71, 0.02, 0, hs);
    if (o.faceR) { place(P_.faceR, h, 0, 0.71, 0.02, 0, hs); P_.face.setMatrixAt(i, this._zero); } else { place(P_.face, h, 0, 0.71, 0.02, 0, hs); P_.faceR.setMatrixAt(i, this._zero); }
    P_.faceA.setMatrixAt(i, this._zero);
    if (o.hood) place(P_.hood, h, 0, 0.73, 0.0, 0, hs); else P_.hood.setMatrixAt(i, this._zero);
    if (p.has.glasses) place(P_.glasses, h, 0, 0.71, 0.02, 0, hs); else P_.glasses.setMatrixAt(i, this._zero);
    place(P_.legL, 0, 0.09, 0, 0, o.legL || 0); place(P_.legR, 0, -0.09, 0, 0, o.legR || 0);
    place(P_.armL, h, 0.24, 0.54, 0, o.aL || 0, 1, o.azL || 0); place(P_.armR, h, -0.24, 0.54, 0, o.aR || 0, 1, o.azR || 0);
    if (p.has.hair && !o.hood) place(P_.hair, h, 0, 0.735, 0.008, 0, hs); else P_.hair.setMatrixAt(i, this._zero);
    if (o.cap && p.has.cap && !o.hood) place(P_.cap, h, 0, 0.82, 0.03, 0, hs); else P_.cap.setMatrixAt(i, this._zero);
    if (o.cig) place(P_.cigT, h, 0, 0.71, 0.02, 0, hs); else P_.cigT.setMatrixAt(i, this._zero);
    for (const k of ['cane', 'bag', 'roll']) P_[k].setMatrixAt(i, this._zero);
    if (o.swing) { // swing seat + chains, hinged at the beam
      m.makeRotationY(o.swing.yaw); m.setPosition(o.swing.x, o.swing.y, o.swing.z);
      tt.makeRotationX(-o.swing.th); m.multiply(tt);
      P_.swing.setMatrixAt(i, m);
    } else P_.swing.setMatrixAt(i, this._zero);
  }
  /** a real shot killed a teen: everybody else in the gang (and the nice ones) runs for it */
  scareTeens(victim) {
    for (const q of this.list) {
      if (q.kind !== 'teen' || q === victim || q.down > 0 || !q.active) continue;
      q.ts = 'flee'; q.fleeT = 0; q.aggro = 0; q.px = q.x; q.pz = q.z;
      this.say(q, q.rowdy ? ['ECHT?! Der hat geballert!', 'Scheiße, die ist echt!!', 'Weg hier, weg hier!'][Math.floor(Math.random() * 3)] : ['Hilfe!!', 'Um Gottes willen!', 'Nichts wie weg!'][Math.floor(Math.random() * 3)], 3.5);
    }
  }

  /** teenagers hanging out on park benches: rowdy ones smoke and provoke, nice ones chat and wave */
  updateTeen(i, p, dt, t, player) {
    const site = this.sites[Math.floor(p.slot / 5)];
    if (!site) { p.active = false; this.hideFigure(i); p.ts = 'sit'; p.aggro = 0; p.px = undefined; return; }
    const c = P / 2, local = p.slot % 5;
    const bench = local < 3 ? { x: 36, z: c + 2.7, yaw: Math.PI } : { x: 64, z: c - 2.7, yaw: 0 };
    const seatX = bench.x + (local === 0 ? -0.5 : local === 1 ? 0.5 : local === 2 ? 1.5 : local === 3 ? -0.45 : 0.45);
    const homeX = site.ox + seatX, homeZ = site.oz + bench.z + (bench.yaw === Math.PI ? 0.05 : -0.05);
    if (p.px === undefined) { p.active = true; p.px = homeX; p.pz = homeZ; p.yawT = bench.yaw; p.phase0 = Math.random() * 6; p.down = 0; p.hp = 100; p.ko = false; p.stabbed = false; p.say = ''; p.sayT = 0; p.ts = 'sit'; p.cool = 0; }
    p.active = true;
    const T = t + p.phase0;
    const pl = player || { x: 1e9, z: 1e9 };
    const dxp = pl.x - p.px, dzp = pl.z - p.pz, dp = Math.hypot(dxp, dzp);
    if (p.sayT > 0) p.sayT -= dt;
    if (p.flinch > 0) p.flinch -= dt;
    if (p.cool > 0) p.cool -= dt;
    if (p.down > 0) { // knocked out
      p.down -= dt; if (p.stabbed) p.down = 9999;
      if (p.down <= 0 && p.ko) { p.ko = false; p.hp = 60; p.aggro = 8; p.ts = p.rowdy ? 'stress' : 'sit'; }
      const lie = Math.min(1, (p.down > 11.7 ? 0.2 : 1));
      this.drawFigure(i, p, { x: p.px, y: 0.3, z: p.pz, yaw: p.yawT, sc: 0.95, lie: 1 });
      return;
    }
    // ---- behaviour
    if (p.ts === 'flee') { // run away from the shooter
      p.fleeT += dt;
      const sp = 5.2;
      const ax = -dxp / (dp || 1), az = -dzp / (dp || 1);
      let nx = p.px + ax * sp * dt, nz = p.pz + az * sp * dt;
      if (this.colliders && Math.hypot(nx - homeX, nz - homeZ) > 1.2) { const r = pushOut(nx, nz, 0.3, this.colliders, null, p); nx = r.x; nz = r.z; }
      p.px = nx; p.pz = nz; p.walkPh = (p.walkPh || 0) + dt * 13; p.yawT = Math.atan2(ax, az);
      if (dp > 42 || p.fleeT > 24) { p.ts = 'back'; p.aggro = 0; }
    } else if (p.rowdy) {
      if (pl.armed && dp < 18) { // thinks the gun is a toy
        if (!p.fakeSaid) { p.fakeSaid = true; const L = ['Haha, die Waffe ist doch fake!', 'Spielzeug, Alter! Lächerlich!', 'Die traut sich eh nicht!', 'Ey, Plastikknarre!']; this.say(p, L[Math.floor(Math.random() * L.length)], 3.2); }
      } else p.fakeSaid = false;
      if (p.ts === 'sit') {
        if (dp < 12 && p.sayT <= 0 && Math.random() < dt * 0.3) { const L = ['Was glotzt du so?!', 'Ey, Alter, verpiss dich!', 'Hast du Feuer, Opfer?', 'Fahr weiter, Kasper!', 'Gib mal Kohle rüber!', 'Cooler Roller … NICHT!']; this.say(p, L[Math.floor(Math.random() * L.length)], 3); }
        if (dp < (pl.armed ? 9 : 6.5)) p.aggro += dt * (1 + (pl.speed || 0) * 0.1) * (pl.armed ? 2.4 : 1); else p.aggro = Math.max(0, p.aggro - dt * 0.8);
        if (p.aggro > 4.5) { p.ts = 'stress'; p.aggro = 10; this.say(p, 'Komm her, du Pappnase!', 3); if (this.onTeenAngry) this.onTeenAngry(p); }
      } else if (p.ts === 'stress') {
        if (dp > 28) { p.ts = 'back'; p.aggro = 0; }
        else {
          const sp = 2.1; // jog after the player
          if (dp > 1.1) { let nx = p.px + (dxp / dp) * sp * dt, nz = p.pz + (dzp / dp) * sp * dt; if (this.colliders && Math.hypot(nx - homeX, nz - homeZ) > 1.9) { const r = pushOut(nx, nz, 0.3, this.colliders, null, p); nx = r.x; nz = r.z; } p.px = nx; p.pz = nz; p.walkPh = (p.walkPh || 0) + dt * 10; p.yawT = Math.atan2(dxp, dzp); }
          else if (p.cool <= 0 && (this.shoveCool || 0) <= 0) { p.cool = 4; this.shoveCool = 4.5; if (this.onShove) this.onShove(p); const L = ['Zieh Leine!', 'Na, was jetzt?!', 'Lutscher!']; this.say(p, L[Math.floor(Math.random() * L.length)], 2); }
          else p.yawT = Math.atan2(dxp, dzp);
        }
      } else if (p.ts === 'back') {
        const dx = homeX - p.px, dz = homeZ - p.pz, d = Math.hypot(dx, dz);
        if (d < 0.15) { p.ts = 'sit'; p.px = homeX; p.pz = homeZ; p.yawT = bench.yaw; }
        else { const sp = 1.4; p.px += (dx / d) * sp * dt; p.pz += (dz / d) * sp * dt; p.walkPh = (p.walkPh || 0) + dt * 7; p.yawT = Math.atan2(dx, dz); }
      }
    } else { // nice teens
      if (p.ts === 'back') { const dx = homeX - p.px, dz = homeZ - p.pz, d = Math.hypot(dx, dz); if (d < 0.15) { p.ts = 'sit'; p.px = homeX; p.pz = homeZ; p.yawT = bench.yaw; } else { p.px += (dx / d) * 1.5 * dt; p.pz += (dz / d) * 1.5 * dt; p.walkPh = (p.walkPh || 0) + dt * 7; p.yawT = Math.atan2(dx, dz); } }
      if (dp < 13 && p.sayT <= 0 && p.cool <= 0) {
        const mop = pl.moped;
        const L = mop ? ['Geile Simme!', 'Schwalbe/S51? Respekt!', 'Moin! Schönes Moped!'] : ['Moin!', 'Na, alles fit?', 'Schönen Tag noch!', 'Cooler Roller!'];
        this.say(p, L[Math.floor(Math.random() * L.length)], 2.6); p.cool = 9 + Math.random() * 6; p.waveT = 2;
      }
      if (p.waveT > 0) p.waveT -= dt;
    }
    // ---- pose
    const sitting = p.ts === 'sit' || p.ko;
    const menace = p.rowdy;
    const smoker = p.smoker && p.ts === 'sit';
    let o;
    if (sitting) {
      const nod = Math.sin(T * 1.3) * 0.04, drag = smoker ? ((T % 9) < 2.2 ? 1 : 0) : 0;
      let aR = -0.9 + Math.sin(T * 0.7) * 0.05, aL = -0.9, hunch = 0.06 + nod;
      if (drag) aR = -2.3; else if (smoker) aR = -0.5;
      if (!p.rowdy && p.waveT > 0) aR = -2.6 + Math.sin(T * 7) * 0.35;
      if (!p.rowdy && p.waveT <= 0 && local === 3) { aL = -1.0 + Math.sin(T * 1.9) * 0.35; hunch = 0.1 + Math.sin(T * 1.9) * 0.05; } // talking
      p.legSw = (p.legSw || 0) + 0;
      if (menace) { hunch += 0.14; if (!drag) { aR = aR > -1 ? -1.25 : aR; aL = -1.3; } }
      o = { x: p.px, y: 0.55 - 0.84 * 0.95 + 0.12, z: p.pz, yaw: p.yawT, sc: 0.95, hunch, legL: -0.95, legR: -0.85 + Math.sin(T * 0.9) * 0.08, aL, aR, azL: menace && !drag ? -0.75 : 0, azR: menace && !drag ? 0.75 : 0, head: 1.0, cap: true, cig: smoker, faceR: menace, hood: menace };
      if (p.flinch > 0) o.hunch -= 0.35;
      // cigarette smoke
      if (smoker && this.smoke) {
        p.smk = (p.smk || 0) + dt * (drag ? 8 : 2.2);
        while (p.smk >= 1) { p.smk--; const hx = p.px + Math.sin(p.yawT) * 0.12, hz = p.pz + Math.cos(p.yawT) * 0.12; this.smoke.emit(hx, 1.43, hz, Math.sin(p.yawT) * 0.25, 0.2, Math.cos(p.yawT) * 0.25, 'cig', drag ? 2 : 1); }
      }
      this.dyn.push({ x: p.px, z: p.pz, r: 0.36, vx: 0, vz: 0, ped: p });
    } else {
      const sw = Math.sin(p.walkPh || 0) * 0.8;
      const fl = p.ts === 'flee';
      o = { x: p.px, y: 0.12, z: p.pz, yaw: p.yawT, sc: 0.95, hunch: fl ? 0.3 : 0.12 + (menace ? 0.08 : 0), legL: fl ? sw * 1.5 : sw, legR: fl ? -sw * 1.5 : -sw, aL: fl ? -2.6 + Math.sin(T * 14) * 0.3 : -sw, aR: fl ? -2.4 - Math.sin(T * 14) * 0.3 : p.ts === 'stress' ? -2.0 + Math.sin(T * 10) * 0.3 : sw, head: 1.0, cap: true, cig: false, faceR: menace, hood: menace };
      this.dyn.push({ x: p.px, z: p.pz, r: 0.3, vx: 0, vz: 0, ped: p });
    }
    p.x = p.px; p.z = p.pz;
    { // nearest road (for the ambulance)
      const rx = Math.round(p.px / P) * P, rz = Math.round(p.pz / P) * P;
      if (Math.abs(p.px - rx) < Math.abs(p.pz - rz)) { p.axis = 'z'; p.lane = p.px; } else { p.axis = 'x'; p.lane = p.pz; }
    }
    this.drawFigure(i, p, o);
  }

  hideFigure(i) { for (const k of Object.keys(this.parts)) this.parts[k].setMatrixAt(i, this._zero); }

  updateSpecial(i, p, dt, t, px, pz, R) {
    const sc = p.child ? 0.64 : 1;
    let o;
    if (p.kind === 'kid') {
      const par = this.list[p.parent];
      if (!par || !par.active || par.down > 0) { p.active = false; this.hideFigure(i); return; }
      p.active = true;
      const yaw = par.yawNow ?? par.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
      p.x = par.x + Math.cos(yaw) * 0.52 - fx * 0.05; p.z = par.z - Math.sin(yaw) * 0.52 - fz * 0.05; p.yaw = yaw;
      const mv = par.moving !== false;
      if (mv) p.phase = par.phase * 1.35;
      const sw = mv ? Math.sin(p.phase) * 0.6 : 0;
      o = { x: p.x, y: 0.12, z: p.z, yaw, sc, sw, legL: sw, legR: -sw, aL: -2.3, azL: 0.0, aR: sw * 0.8, head: 1.28 };
      this.dyn.push({ x: p.x, z: p.z, r: 0.2, vx: 0, vz: 0 });
    } else {
      const slot = p.kind === 'pkid' ? Math.floor(p.slot / 5) : Math.floor(p.slot / 2);
      const site = this.sites[slot];
      if (!site) { p.active = false; this.hideFigure(i); return; }
      p.active = true;
      if (p.phase0 === undefined) p.phase0 = p.phase;
      const T = t + p.phase0 * 3;
      if (p.kind === 'ppar') {
        const [bx, bz] = PLAY.parents[p.slot % 2];
        const wave = Math.sin(T * 0.35) > 0.75;
        p.x = site.ox + bx; p.z = site.oz + bz + 0.2;
        const yaw = Math.PI + Math.sin(T * 0.3) * 0.4;
        o = { x: p.x, y: 0.12, z: p.z, yaw, sc: 1, hunch: 0.02 + Math.sin(T) * 0.01, aL: wave ? -2.5 + Math.sin(T * 6) * 0.3 : -0.1, aR: -0.05, legL: 0, legR: 0 };
        this.dyn.push({ x: p.x, z: p.z, r: 0.3, vx: 0, vz: 0 });
      } else {
        const role = p.slot % 5, ox = site.ox, oz = site.oz;
        const sw_ = PLAY.swing, sl = PLAY.slide, sb = PLAY.sand, rn = PLAY.run;
        if (role < 2) { // swing
          const th = 0.6 * Math.sin(T * 1.7 + role * 1.6), L = sw_.len;
          const sx = ox + sw_.x + sw_.xs[role], sy = sw_.beam - L * Math.cos(th), sz = oz + sw_.z + L * Math.sin(th);
          const pump = Math.sin(T * 1.7 + role * 1.6 + 1.4);
          p.x = sx; p.z = sz;
          o = { x: sx, y: sy + 0.04 - 0.84 * sc, z: sz, yaw: 0, sc, hunch: -0.15 - th * 0.35, legL: -1.35 + pump * 0.5, legR: -1.35 + pump * 0.5, aL: -1.0, aR: -1.0, head: 1.28,
            swing: { x: ox + sw_.x + sw_.xs[role], y: sw_.beam, z: oz + sw_.z, th, yaw: 0 } };
        } else if (role === 2) { // slide
          const u = (T % 6.4), top = sl.top, rz0 = sl.z + 0.7, rz1 = sl.z + 4.0, ry0 = top, ry1 = 0.28;
          let x, y, z, yaw, legL = 0, legR = 0, aL = 0, aR = 0, hunch = 0;
          if (u < 1.8) { const k = u / 1.8; x = sl.x - 1.12; z = sl.z - 0.15; y = 0.12 + k * top; yaw = Math.PI / 2; legL = Math.sin(u * 9) * 0.7; legR = -legL; aL = aR = -2.4; }
          else if (u < 2.4) { const k = (u - 1.8) / 0.6; x = sl.x - 1.12 + 1.12 * k; z = sl.z - 0.15 + 0.15 * k; y = 0.12 + top; yaw = Math.PI / 2 * (1 - k); legL = Math.sin(u * 9) * 0.4; legR = -legL; }
          else if (u < 3.2) { x = sl.x; z = sl.z; y = 0.12 + top; yaw = 0; }
          else if (u < 4.5) { const k = (u - 3.2) / 1.3, e = k * k * 0.6 + k * 0.4; x = sl.x; z = rz0 + (rz1 - rz0) * e; y = ry0 + (ry1 - ry0) * e + 0.1 - 0.84 * sc + 0.84 * sc; y = ry0 + (ry1 - ry0) * e + 0.14 - 0.84 * sc + 0.0; yaw = 0; legL = legR = -1.45; aL = aR = -2.7; hunch = -0.1; }
          else { const k = (u - 4.5) / 1.9; const ax = sl.x, az = rz1 + 0.2, bx2 = sl.x - 1.6, bz2 = sl.z - 0.2; x = ax + (bx2 - ax) * k; z = az + (bz2 - az) * k; y = 0.12; yaw = Math.atan2(bx2 - ax, bz2 - az); legL = Math.sin(u * 10) * 0.8; legR = -legL; aL = -legL * 0.8; aR = legL * 0.8; }
          if (u >= 3.2 && u < 4.5) y += 0; else y = (u >= 3.2 && u < 4.5) ? y : y - 0.12 + 0.12;
          p.x = ox + x; p.z = oz + z;
          o = { x: ox + x, y: (u >= 3.2 && u < 4.5) ? y : y, z: oz + z, yaw, sc, legL, legR, aL, aR, hunch, head: 1.28 };
        } else if (role === 3) { // sandbox: crouching and digging
          const dx = Math.sin(p.phase0 * 7) * 1.2, dz = Math.cos(p.phase0 * 5) * 0.8;
          p.x = ox + sb.x + dx; p.z = oz + sb.z + dz;
          const dig = Math.sin(T * 5);
          o = { x: p.x, y: 0.22 - 0.2, z: p.z, yaw: Math.atan2(dx * -0.3, 1) + Math.sin(T * 0.4) * 0.5, sc, hunch: 0.7, legL: -1.35, legR: -1.15, aL: -1.2 + dig * 0.5, aR: -1.2 - dig * 0.5, head: 1.28 };
        } else { // running around
          const cx = ox + (rn.x0 + rn.x1) / 2, cz = oz + (rn.z0 + rn.z1) / 2, ax = (rn.x1 - rn.x0) / 2, az = (rn.z1 - rn.z0) / 2;
          const w = 0.55 + p.phase0 * 0.03, a = T * w;
          const x = cx + Math.sin(a) * ax, z = cz + Math.sin(a * 1.7 + 1) * az;
          const vx = Math.cos(a) * ax * w, vz = Math.cos(a * 1.7 + 1) * az * w * 1.7;
          p.x = x; p.z = z;
          const ph = T * 12, sw = Math.sin(ph) * 0.95;
          o = { x, y: 0.12 + Math.abs(Math.cos(ph)) * 0.05, z, yaw: Math.atan2(vx, vz), sc, hunch: 0.18, legL: sw, legR: -sw, aL: -sw * 1.1, aR: sw * 1.1, head: 1.28 };
        }
        this.dyn.push({ x: p.x, z: p.z, r: 0.2, vx: 0, vz: 0 });
      }
    }
    this.drawFigure(i, p, o);
  }

  /** Bell / horn: startles elders nearby. */
  bell(px, pz) {
    for (const p of this.list) if (p.elder && p.active && p.chase <= 0 && Math.hypot(p.x - px, p.z - pz) < 10) p.anger = Math.min(100, p.anger + 28);
  }

  say(p, text, t = 3) { p.say = text; p.sayT = t; }

  /** Player punches ped p (from direction dx,dz). Returns 'hit' | 'ko' | null */
  hit(p, dx, dz, dmg = 14, opts = {}) {
    if (!p.active || p.down > 0) return null;
    p.hp = (p.hp ?? 100) - dmg; p.flinch = 0.3; p.hitT = 6;
    p.hitStreak = (p.hitStreak || 0) + 1;
    const l = Math.hypot(dx, dz) || 1;
    // staggers back along their own walking line
    if (p.axis === 'x') p.s += (dx / l) * 0.18; else p.s += (dz / l) * 0.18;
    if (p.kind === 'teen' && opts.gun) { p.px = p.x; p.pz = p.z; }
    else if (p.kind === 'teen') {
      p.px = p.x; p.pz = p.z;
      if (p.rowdy) { for (const q of this.list) if (q.kind === 'teen' && q.rowdy && Math.floor(q.slot / 5) === Math.floor(p.slot / 5) && q.ts === 'sit') { q.ts = 'stress'; q.aggro = 10; } p.ts = 'stress'; this.say(p, 'Du bist tot, Alter!', 2.4); }
      else this.say(p, 'Hey, spinnst du?!', 2);
    }
    if (p.elder) { p.anger = Math.min(100, p.anger + 30); }
    else { const say = ['Aua!', 'Hey, spinnst du?!', 'Lass das!', 'Hilfe!']; this.say(p, say[Math.floor(Math.random() * say.length)], 1.6); }
    if (p.hp <= 0) { p.down = opts.long ? 9999 : 12; p.ko = true; p.chase = 0; p.say = ''; if (opts.long) p.stabbed = true; return 'ko'; }
    return 'hit';
  }

  update(dt, player, sig, now, R = 160) {
    const px = player.x, pz = player.z, pspeed = player.speed || 0;
    const t = now * 0.001;
    this.dyn.length = 0;
    if (this.shoveCool > 0) this.shoveCool -= dt;
    this.refreshSites(px, pz);
    const m = this._m, b = this._b, l = this._l, tt = this._t;
    const P_ = this.parts;
    for (let i = 0; i < this.count; i++) {
      const p = this.list[i];
      if (p.kind === 'kid' || p.kind === 'pkid' || p.kind === 'ppar') { this.updateSpecial(i, p, dt, t, px, pz, R); continue; }
      if (p.kind === 'teen') { this.updateTeen(i, p, dt, t, player); continue; }
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
      if (p.down > 0) { p.down -= dt; moving = false; if (p.stabbed) p.down = 9999; if (p.down <= 0 && p.ko) { p.ko = false; p.hp = 55; p.anger = p.elder ? 70 : p.anger; p.cool = 4; } }
      if (p.flinch > 0) p.flinch -= dt;
      if (p.hitT > 0) { p.hitT -= dt; if (p.hitT <= 0) p.hitStreak = 0; }
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
      p.moving = moving; p.yawNow = yaw;
      // ---- pose
      const sc = p.elder ? 0.93 : 1;
      const sw = (moving || running) ? Math.sin(p.phase) * (running ? 0.95 : p.elder ? 0.32 : 0.55) : 0;
      const hunch = (p.elder ? (running ? 0.18 : 0.3) : 0) - (p.flinch > 0 ? 0.5 * Math.sin(Math.min(1, p.flinch / 0.3) * Math.PI) : 0);
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
      const hz = p.elder ? 0.05 : 0.02, scold = p.elder && (running || (p.mood >= 2 && p.cool <= 0));
      place(P_.head, hunch, 0, 0.71, hz);
      place(P_.nose, hunch, 0, 0.71, hz);
      if (scold) { place(P_.faceA, hunch, 0, 0.71, hz); P_.face.setMatrixAt(i, this._zero); } else { place(P_.face, hunch, 0, 0.71, hz); P_.faceA.setMatrixAt(i, this._zero); }
      if (p.has.glasses) place(P_.glasses, hunch, 0, 0.71, hz); else P_.glasses.setMatrixAt(i, this._zero);
      place(P_.legL, 0, 0.09, 0, 0, sw);
      place(P_.legR, 0, -0.09, 0, 0, -sw);
      place(P_.armL, hunch, 0.24, 0.54, 0, aL);
      place(P_.armR, hunch, -0.24, 0.54, 0, aR);
      if (p.has.hair) place(P_.hair, hunch, 0, 0.735, (p.elder ? 0.05 : 0.02) - 0.012);
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

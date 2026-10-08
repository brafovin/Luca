import * as THREE from 'three';
import { P, blockType, CURB } from './world.js';
import { LAYOUT, PRODUCTS, storeSlots } from './stores.js';
import { mulberry32, hash2 } from './util.js';

const KIND = { supermarket: 'supermarket', gasstation: 'gas', dealer: 'dealer' };
const BLOCK = 3000, BLOCKS = 4; // item capacity per store block / number of simultaneously active stores
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const STAFF = {
  supermarket: { color: '#2fb04a', lines: ['Guten Tag!', 'Willkommen im Supermarkt!', 'Bitte alles auf das Band legen.', 'Zahlen Sie bar?'] },
  gas: { color: '#c82020', lines: ['Willkommen an der Tankstelle!', 'Welche Säule war es?', 'Noch etwas dazu?'] },
  dealer: { color: '#1a2230', lines: ['Willkommen im Autohaus!', 'Interesse an einem Sportwagen?', 'Probefahrt? Kaufen und losfahren!', 'Der rote schafft 250 km/h!'] },
};

/** runtime side of the walk-in stores: glass sliding doors, products on the shelves, tills, shop staff */
export class Shops {
  constructor(scene, M, peds, audio) {
    this.scene = scene; this.M = M; this.peds = peds; this.audio = audio;
    this.sites = new Map();
    this.active = [];
    const mk = (geo, n) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05, emissive: 0x2a2a2a }), n);
      m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const z = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < n; i++) { m.setMatrixAt(i, z); m.setColorAt(i, _c.set('#ffffff')); }
      scene.add(m);
      return m;
    };
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    this.boxMesh = mk(box, BLOCK * BLOCKS); this.cylMesh = mk(cyl, BLOCK * BLOCKS);
    this.freeBlocks = [0, 1, 2, 3];
    // door parts
    this.glassMat = M.carGlass;
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5, metalness: 0.5 });
    this.hover = null;
    this.restockT = 0;
    peds.onPick = (site, pick) => this.npcPick(site, pick);
  }

  siteKey(i, j) { return i + ',' + j; }

  makeDoor(site) {
    const L = site.L, g = new THREE.Group();
    const mkPanel = () => {
      const w = L.DW - 0.06, pg = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, 2.95, 0.035), this.glassMat); glass.position.y = 1.5; pg.add(glass);
      for (const [x, y, sx, sy] of [[0, 0.07, w, 0.14], [0, 2.95, w, 0.1], [-w / 2, 1.5, 0.08, 2.95], [w / 2, 1.5, 0.08, 2.95]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.06), this.frameMat); f.position.set(x, y, 0); pg.add(f); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.05), this.frameMat); bar.position.set(0.0, 1.1, 0.04); pg.add(bar);
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.001), new THREE.MeshBasicMaterial({ color: 0xff6a1a })); dot.position.set(0, 1.4, 0.02); pg.add(dot); // safety sticker
      return pg;
    };
    const a = mkPanel(), b = mkPanel();
    g.add(a, b);
    g.position.set(site.ox, CURB, site.oz + L.z0 + 0.34);
    this.scene.add(g);
    site.door = { group: g, a, b, open: 0, target: 0 };
    this.setDoor(site, 0);
  }
  setDoor(site, open) {
    const L = site.L, d = site.door, slide = (L.DW - 0.12) * open;
    d.a.position.x = L.cx - L.DW / 2 - slide; d.b.position.x = L.cx + L.DW / 2 + slide;
    d.open = open;
  }

  createSite(i, j, kind) {
    const L = LAYOUT[KIND[kind]];
    const site = { key: this.siteKey(i, j), i, j, kind: KIND[kind], L, ox: i * P, oz: j * P, items: [], nShop: 0, removedCount: 0, block: -1 };
    const rnd = mulberry32(((i * 73856093) ^ (j * 19349663)) >>> 0);
    const slots = storeSlots(L, rnd);
    site.slots = slots;
    if (slots.length) {
      if (!this.freeBlocks.length) site.noItems = true;
      else {
        const bi = this.freeBlocks.pop(); site.block = bi;
        let nb = 0, nc = 0;
        for (const it of slots) {
          const pr = PRODUCTS[it.type];
          const o = { ...it, pr, removed: false, t: 0, mesh: pr.shape === 'cyl' ? this.cylMesh : this.boxMesh };
          if (pr.shape === 'cyl') { if (nc >= BLOCK) continue; o.inst = bi * BLOCK + nc++; } else { if (nb >= BLOCK) continue; o.inst = bi * BLOCK + nb++; }
          site.items.push(o);
          this.placeItem(site, o, true);
        }
        this.boxMesh.instanceMatrix.needsUpdate = true; this.cylMesh.instanceMatrix.needsUpdate = true;
        this.boxMesh.instanceColor.needsUpdate = true; this.cylMesh.instanceColor.needsUpdate = true;
      }
    }
    this.makeDoor(site);
    this.sites.set(site.key, site);
    return site;
  }
  destroySite(site) {
    const z = _m.makeScale(0, 0, 0);
    for (const o of site.items) o.mesh.setMatrixAt(o.inst, z);
    this.boxMesh.instanceMatrix.needsUpdate = true; this.cylMesh.instanceMatrix.needsUpdate = true;
    if (site.block >= 0) this.freeBlocks.push(site.block);
    this.scene.remove(site.door.group);
    this.sites.delete(site.key);
  }

  placeItem(site, o, on) {
    const pr = o.pr;
    if (!on) { _m.makeScale(0, 0, 0); o.mesh.setMatrixAt(o.inst, _m); return; }
    _q.setFromAxisAngle(UP, o.face);
    _p.set(site.ox + o.x, CURB + o.y + pr.h / 2, site.oz + o.z);
    if (pr.shape === 'cyl') _s.set(pr.r * 2, pr.h, pr.r * 2); else _s.set(pr.w, pr.h, pr.d);
    _m.compose(_p, _q, _s);
    o.mesh.setMatrixAt(o.inst, _m);
    o.mesh.setColorAt(o.inst, _c.set(o.col)); o.mesh.instanceColor.needsUpdate = true;
  }
  removeItem(site, o, restock) {
    if (o.removed) return;
    o.removed = true; o.t = restock; this.placeItem(site, o, false);
    o.mesh.instanceMatrix.needsUpdate = true;
  }
  npcPick(site, pick) {
    if (!pick) return;
    const px = pick.x - site.ox, pz = pick.z - site.oz;
    let best = null, bd = 1e9;
    for (const o of site.items) { if (o.removed || Math.abs(o.y - pick.y) > 0.3) continue; const d = Math.hypot(o.x - px, o.z - pz); if (d < bd) { bd = d; best = o; } }
    if (best && bd < 1.0) this.removeItem(site, best, 70);
  }

  /** which store the point is inside (interior rectangle) */
  insideStore(x, z, margin = 0) {
    for (const s of this.sites.values()) {
      const L = s.L;
      if (x > s.ox + L.x0 + margin && x < s.ox + L.x1 - margin && z > s.oz + L.z0 + margin && z < s.oz + L.z1 - margin) return s;
    }
    return null;
  }
  /** the product the player is looking at (eye position + view direction) or null */
  pickTarget(ex, ey, ez, dx, dy, dz) {
    const site = this.insideStore(ex, ez, -1.2);
    if (!site || !site.items.length) return null;
    let best = null, bs = 1e9;
    for (const o of site.items) {
      if (o.removed) continue;
      const wx = site.ox + o.x, wz = site.oz + o.z, wy = CURB + o.y + o.pr.h / 2;
      const vx = wx - ex, vy = wy - ey, vz = wz - ez, d = Math.hypot(vx, vy, vz);
      if (d > 3.1 || d < 0.2) continue;
      if (o.fx * (ex - wx) + o.fz * (ez - wz) < 0) continue; // only from the open side of the shelf
      const cos = (vx * dx + vy * dy + vz * dz) / d;
      if (cos < 0.93) continue;
      const sc = d * (2.2 - cos);
      if (sc < bs) { bs = sc; best = o; }
    }
    return best ? { site, item: best, pr: best.pr } : null;
  }
  take(target) { this.removeItem(target.site, target.item, 150); return target.pr; }
  /** is p close to a checkout of the store (any till)? */
  nearTill(x, z, r = 2.6) {
    const site = this.insideStore(x, z, 0);
    if (!site) return null;
    for (const t of site.L.tills) if (Math.hypot(x - (site.ox + t.pay.x), z - (site.oz + t.pay.z)) < r) return { site, till: t };
    return null;
  }

  /** every frame. actors: [{x,z}] that open the doors (player + peds) */
  update(dt, px, pz, actors, me) {
    const ci = Math.round(px / P), cj = Math.round(pz / P);
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      const t = blockType(i, j);
      if (!KIND[t]) continue;
      const k = this.siteKey(i, j);
      const d = Math.hypot(i * P + 50 - px, j * P + 50 - pz);
      if (!this.sites.has(k) && d < 150) this.createSite(i, j, t);
    }
    this.active.length = 0;
    for (const s of [...this.sites.values()]) {
      const d = Math.hypot(s.ox + 50 - px, s.oz + 50 - pz);
      if (d > 215) { this.destroySite(s); continue; }
      this.active.push(s);
      // doors
      const L = s.L, dcx = s.ox + L.cx, dz0 = s.oz + L.z0;
      let want = 0;
      for (const a of actors) { if (Math.abs(a.x - dcx) < L.DW + 1.6 && a.z > dz0 - 3.4 && a.z < dz0 + 2.6) { want = 1; break; } }
      const dd = s.door;
      if (want !== dd.target) {
        dd.target = want;
        if (d < 24 && this.audio) this.audio.door();
      }
      const nOpen = dd.open + Math.sign(dd.target - dd.open) * Math.min(Math.abs(dd.target - dd.open), dt * 1.9);
      if (nOpen !== dd.open) this.setDoor(s, nOpen);
      // restock
      for (const o of s.items) if (o.removed) { o.t -= dt; if (o.t <= 0) { o.removed = false; this.placeItem(s, o, true); o.mesh.instanceMatrix.needsUpdate = true; } }
    }
    // peds integration: stores with shoppers, staff spots near the player
    const stores = this.active.filter((s) => s.kind !== 'dealer' && Math.hypot(s.ox + 50 - px, s.oz + 50 - pz) < 110);
    this.peds.stores = stores;
    const spots = [];
    for (const s of [...this.active].sort((a, b) => Math.hypot(a.ox - px, a.oz - pz) - Math.hypot(b.ox - px, b.oz - pz))) {
      if (Math.hypot(s.ox + 50 - px, s.oz + 50 - pz) > 110) continue;
      const L = s.L, def = STAFF[s.kind];
      if (s.kind === 'dealer') spots.push({ key: s.key + 'd', x: s.ox + L.salesman.x, z: s.oz + L.salesman.z, yaw: L.salesman.yaw, color: def.color, lines: def.lines });
      else L.tills.slice(0, s.kind === 'supermarket' ? 2 : 1).forEach((t, k) => spots.push({ key: s.key + 't' + k, x: s.ox + t.cashier.x, z: s.oz + t.cashier.z, yaw: t.cashier.yaw, color: def.color, lines: def.lines }));
    }
    this.peds.staffSpots = spots;
  }
}

import * as THREE from 'three';
import { WalkerModel } from './walker.js';
import { buildAiScooter } from './traffic.js';
import { mulberry32, lerp, wrapAngle } from './util.js';

const LOOKS = {
  orange: { jacket: '#e0702a', body: '#16171a', helmet: '#f2f2f0' },
  blue: { jacket: '#2f6aa6', body: '#2a5fb4', helmet: '#16171a' },
  green: { jacket: '#3a8a55', body: '#2f8a4a', helmet: '#f2f2f0' },
  red: { jacket: '#c42a2a', body: '#c42a2a', helmet: '#16171a' },
  purple: { jacket: '#8a3a8a', body: '#e9e9e6', helmet: '#f2f2f0' },
  yellow: { jacket: '#e2c13a', body: '#16171a', helmet: '#c42a2a' },
};
export const LOOK_NAMES = Object.keys(LOOKS);

function nameTexture(name, vesc) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 80;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,12,18,0.72)'; x.beginPath(); x.roundRect(4, 8, 312, 64, 18); x.fill();
  x.strokeStyle = vesc ? '#35e6ff' : 'rgba(255,255,255,0.35)'; x.lineWidth = 3; x.stroke();
  x.fillStyle = '#fff'; x.font = '700 34px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name + (vesc ? ' ⚡' : ''), 160, 42, 290);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Remote {
  constructor(net, info) {
    this.net = net;
    this.id = info.id; this.name = info.name || 'Spieler'; this.look = LOOKS[info.look] || LOOKS.orange; this.vesc = !!info.vesc;
    this.snaps = [];
    const M = net.M, rnd = mulberry32(this.id * 7919 + 13);
    this.scooter = buildAiScooter(M, rnd, { body: this.look.body, jacket: this.look.jacket, helmet: this.look.helmet, style: 0.1, pack: '#ff7a1a', pants: '#191b21' });
    this.walker = new WalkerModel({ jacket: new THREE.Color(this.look.jacket).getHex(), helmet: new THREE.Color(this.look.helmet).getHex(), pack: 0xff7a1a });
    net.scene.add(this.scooter.group, this.walker.group);
    this.tagMat = new THREE.SpriteMaterial({ map: nameTexture(this.name, this.vesc), depthTest: true, transparent: true });
    this.tag = new THREE.Sprite(this.tagMat);
    this.tag.scale.set(1.7, 0.425, 1);
    net.scene.add(this.tag);
    this.x = 0; this.z = 0; this.sx = 0; this.sz = 0; this.sh = 0; this.h = 0; this.mode = 0; this.phase = 0; this.v = 0; this.ready = false; this.wheel = 0;
  }
  setVesc(v) {
    if (v === this.vesc) return;
    this.vesc = v; this.tagMat.map.dispose(); this.tagMat.map = nameTexture(this.name, v); this.tagMat.needsUpdate = true;
  }
  push(s, t) { this.snaps.push({ t, s }); if (this.snaps.length > 12) this.snaps.shift(); }
  update(dt, now) {
    const sn = this.snaps;
    if (!sn.length) return;
    const rt = now - 130;
    let a = sn[0], b = sn[0];
    for (let i = 0; i < sn.length; i++) { if (sn[i].t <= rt) a = sn[i]; if (sn[i].t > rt) { b = sn[i]; break; } b = sn[i]; }
    const k = a === b ? 1 : Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t)));
    const A = a.s, B = b.s;
    this.x = lerp(A.x, B.x, k); this.z = lerp(A.z, B.z, k);
    this.h = A.h + wrapAngle(B.h - A.h) * k;
    this.v = lerp(A.v, B.v, k);
    const lean = lerp(A.l, B.l, k);
    this.mode = B.m; this.sx = lerp(A.sx, B.sx, k); this.sz = lerp(A.sz, B.sz, k); this.sh = A.sh + wrapAngle(B.sh - A.sh) * k;
    this.setVesc(!!B.vs);
    const ride = this.mode === 0;
    const sc = this.scooter;
    sc.group.visible = true;
    sc.group.position.set(ride ? this.x : this.sx, 0.12, ride ? this.z : this.sz);
    sc.group.rotation.y = ride ? this.h : this.sh;
    sc.tilt.rotation.z = ride ? -lean : -0.14;
    this.wheel += (ride ? this.v : 0) * dt / 0.138;
    sc.wf.rotation.x = sc.wr.rotation.x = this.wheel;
    this.walker.group.visible = !ride;
    if (!ride) {
      this.phase += dt * Math.abs(this.v) * (Math.abs(this.v) > 3.6 ? 2.0 : 3.6);
      this.walker.group.position.set(this.x, 0.12, this.z);
      this.walker.group.rotation.y = this.h;
      this.walker.pose(this.phase, Math.min(1, Math.abs(this.v) / 1.6), Math.abs(this.v) > 3.6);
    }
    this.tag.position.set(this.x, 2.45 + (ride ? 0.15 : 0), this.z);
    this.ready = true;
  }
  dispose() {
    this.net.scene.remove(this.scooter.group, this.walker.group, this.tag);
    this.tagMat.map.dispose(); this.tagMat.dispose();
    this.scooter.group.traverse((o) => { if (o.geometry && o.geometry !== this.scooter.wf.geometry) o.geometry.dispose(); });
    this.walker.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

export class Net {
  constructor(scene, M) {
    this.scene = scene; this.M = M;
    this.ws = null; this.connected = false; this.id = 0; this.name = '';
    this.remotes = new Map();
    this.sendT = 0;
    this.onStatus = () => {}; this.onChat = () => {}; this.onPlayers = () => {}; this.onEvent = () => {};
    this._dyn = [];
  }
  static defaultUrl() {
    if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    return 'ws://localhost:8080/ws';
  }
  connect(url, name, room, lookName) {
    this.disconnect();
    this.name = name;
    this.onStatus('verbinde …', 'wait');
    let ws;
    try { ws = new WebSocket(url); } catch (e) { this.onStatus('Ungültige Server-Adresse', 'err'); return; }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, room, look: lookName }));
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.handle(m); };
    ws.onerror = () => {};
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false; this.clear();
      this.onStatus(was ? 'Verbindung getrennt – Solo-Modus' : 'Kein Server gefunden – Solo-Modus', was ? 'err' : 'off');
      this.onPlayers([]);
    };
  }
  disconnect() { if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } this.ws = null; } this.connected = false; this.clear(); }
  clear() { for (const r of this.remotes.values()) r.dispose(); this.remotes.clear(); }
  handle(m) {
    switch (m.t) {
      case 'welcome':
        this.connected = true; this.id = m.id;
        this.onStatus(`Verbunden · Raum „${m.room}“`, 'ok');
        for (const p of m.players) if (p.id !== this.id) this.remotes.set(p.id, new Remote(this, p));
        this.emitPlayers();
        break;
      case 'join': if (m.p.id !== this.id && !this.remotes.has(m.p.id)) { this.remotes.set(m.p.id, new Remote(this, m.p)); this.emitPlayers(); this.onChat(null, `${m.p.name} ist beigetreten`, true); } break;
      case 'leave': { const r = this.remotes.get(m.id); if (r) { this.onChat(null, `${r.name} hat das Spiel verlassen`, true); r.dispose(); this.remotes.delete(m.id); this.emitPlayers(); } break; }
      case 'snap': {
        const t = performance.now();
        for (const a of m.s) {
          const r = this.remotes.get(a[0]);
          if (r) r.push({ x: a[1], z: a[2], h: a[3], v: a[4], l: a[5], m: a[6], vs: a[7], sx: a[8], sz: a[9], sh: a[10] }, t);
        }
        break;
      }
      case 'chat': this.onChat(m.name, m.text, false, m.id === this.id); break;
      case 'ev': { const r = this.remotes.get(m.id); if (r) { this.onEvent(r, m.k); } break; }
    }
  }
  emitPlayers() { this.onPlayers([this.name + ' (du)', ...[...this.remotes.values()].map((r) => r.name)]); }
  sendState(s) {
    if (!this.connected) return;
    const f = (n) => Math.round(n * 100) / 100;
    this.ws.send(JSON.stringify({ t: 's', x: f(s.x), z: f(s.z), h: f(s.h), v: f(s.v), l: f(s.l), m: s.m, vs: s.vs, sx: f(s.sx), sz: f(s.sz), sh: f(s.sh) }));
  }
  sendChat(text) { if (this.connected) this.ws.send(JSON.stringify({ t: 'chat', text })); }
  sendEvent(k) { if (this.connected) this.ws.send(JSON.stringify({ t: 'ev', k })); }
  update(dt, now) { for (const r of this.remotes.values()) r.update(dt, now); }
  remoteList() { const o = []; for (const r of this.remotes.values()) if (r.ready) o.push({ x: r.x, z: r.z }); return o; }
  /** collision circles of other players */
  dynList() {
    const d = this._dyn; d.length = 0;
    for (const r of this.remotes.values()) {
      if (!r.ready) continue;
      if (r.mode === 0) {
        const sx = Math.sin(r.h), cz = Math.cos(r.h);
        for (const o of [-0.55, 0, 0.55]) d.push({ x: r.x + sx * o, z: r.z + cz * o, r: 0.3, vx: sx * r.v, vz: cz * r.v });
      } else {
        d.push({ x: r.x, z: r.z, r: 0.32, vx: 0, vz: 0 });
        const sx = Math.sin(r.sh), cz = Math.cos(r.sh);
        for (const o of [-0.55, 0, 0.55]) d.push({ x: r.sx + sx * o, z: r.sz + cz * o, r: 0.3, vx: 0, vz: 0 });
      }
    }
    return d;
  }
}

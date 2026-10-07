// KuKirin G4 City Ride – Multiplayer-Server (Static files + WebSocket relay)
// Start:  npm install && npm start      →  http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '8080', 10);
const FILES = { '/': 'index.html', '/index.html': 'index.html', '/game.js': 'game.js' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  const f = FILES[url];
  if (!f) { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(path.join(root, f), (err, data) => {
    if (err) { res.writeHead(500); res.end('error'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const rooms = new Map(); // room -> Map(id -> player)
let nextId = 1;
const MAX_PER_ROOM = 24;
const LOOKS = new Set(['orange', 'blue', 'green', 'red', 'purple', 'yellow']);
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lim = 1e7) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);

function broadcast(room, msg, except) {
  const data = JSON.stringify(msg);
  for (const p of room.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(data);
}

wss.on('connection', (ws) => {
  let me = null, room = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!me) {
      if (m.t !== 'join') return;
      const rname = clean(m.room, 16).replace(/[^\w\-äöüÄÖÜß]/g, '') || 'stadt';
      room = rooms.get(rname) || new Map();
      if (room.size >= MAX_PER_ROOM) { ws.close(1013, 'room full'); return; }
      rooms.set(rname, room);
      me = { id: nextId++, ws, name: clean(m.name, 18) || 'Fahrer' + Math.floor(Math.random() * 900 + 100), look: LOOKS.has(m.look) ? m.look : 'orange', vesc: 0, state: null, lastChat: 0, rname };
      room.set(me.id, me);
      ws.send(JSON.stringify({ t: 'welcome', id: me.id, room: rname, players: [...room.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, vesc: p.vesc })) }));
      broadcast(room, { t: 'join', p: { id: me.id, name: me.name, look: me.look, vesc: 0 } }, me);
      return;
    }
    if (m.t === 's') {
      me.vesc = m.vs ? 1 : 0;
      me.state = [me.id, num(m.x), num(m.z), num(m.h, 7), num(m.v, 100), num(m.l, 2), m.m ? 1 : 0, me.vesc, num(m.sx), num(m.sz), num(m.sh, 7), num(m.w, 1.2)];
    } else if (m.t === 'chat') {
      const now = Date.now();
      if (now - me.lastChat < 600) return;
      me.lastChat = now;
      const text = clean(m.text, 140);
      if (text) broadcast(room, { t: 'chat', id: me.id, name: me.name, text });
    } else if (m.t === 'ev') {
      broadcast(room, { t: 'ev', id: me.id, k: clean(m.k, 12) }, me);
    }
  });
  ws.on('close', () => {
    if (me && room) { room.delete(me.id); broadcast(room, { t: 'leave', id: me.id }); if (!room.size) rooms.delete(me.rname); }
  });
});

// 15 Hz snapshots (each client gets everybody except itself)
setInterval(() => {
  for (const room of rooms.values()) {
    const all = [];
    for (const p of room.values()) if (p.state) all.push(p.state);
    if (all.length < 2) continue;
    for (const p of room.values()) {
      if (p.ws.readyState !== 1) continue;
      p.ws.send(JSON.stringify({ t: 'snap', s: all.filter((s) => s[0] !== p.id) }));
    }
  }
}, 1000 / 15);
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 15000);

server.listen(PORT, '0.0.0.0', () => console.log(`KuKirin G4 City Ride läuft auf http://localhost:${PORT}  (WebSocket: /ws)`));

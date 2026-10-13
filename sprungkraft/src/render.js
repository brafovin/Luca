'use strict';
// Grafik: Welt-Themen, Kacheln (mit Zwischenspeicher), Parallax-Hintergründe, Deko und alle Figuren.
// Alles wird mit Canvas-Pfaden gezeichnet; Weltkoordinaten in Pixeln, 1 Kachel = 32.

const THEMES = {
  meadow: {
    sky: ['#4cb6ff', '#c4ebff'], bg: 'hills',
    g: { dirt: '#a8703f', dark: '#7e5130', light: '#c58b56', top: '#5fcb3d', topDark: '#3c962a', topLight: '#94e66b', speck: '#6b4426' },
    stone: { base: '#a2abb5', dark: '#6f7883', light: '#d2d8de' },
    brick: { base: '#cf6a30', dark: '#93421b', mortar: '#f0bf96' },
    plank: { base: '#b77a43', dark: '#7e4f27', light: '#d9a06a' },
    oneway: 'wood', decor: ['bush', 'flower', 'flower', 'tree', 'grass', 'bush', 'grass'],
  },
  forest: {
    sky: ['#17312f', '#5b8b74'], bg: 'forest',
    g: { dirt: '#5d3f2b', dark: '#3e2a1d', light: '#77533b', top: '#3f924b', topDark: '#296035', topLight: '#66b56d', speck: '#2e1f15' },
    stone: { base: '#7d8a80', dark: '#525d55', light: '#a9b8aa' },
    brick: { base: '#8f5a3c', dark: '#5f3824', mortar: '#c99b78' },
    plank: { base: '#7a5234', dark: '#4e321e', light: '#9c6f4b' },
    oneway: 'branch', decor: ['glowshroom', 'fern', 'stump', 'fern', 'pine', 'glowshroom'],
  },
  desert: {
    sky: ['#f4964f', '#ffe6a8'], bg: 'desert',
    g: { dirt: '#e1b366', dark: '#b8873f', light: '#f2cf8b', top: '#f6d993', topDark: '#d9ad62', topLight: '#fff2c4', speck: '#c08f48' },
    stone: { base: '#d39a5c', dark: '#9b6633', light: '#f0c48d' },
    brick: { base: '#c4733a', dark: '#8a4b1f', mortar: '#f3cf9d' },
    plank: { base: '#b98450', dark: '#7f552c', light: '#dcaa73' },
    oneway: 'wood', decor: ['cactus', 'rock', 'skull', 'cactus', 'tumble'],
  },
  ice: {
    sky: ['#86c3ec', '#effaff'], bg: 'mountains',
    g: { dirt: '#6b8ab0', dark: '#4c6789', light: '#8eadd0', top: '#ffffff', topDark: '#cfe2f4', topLight: '#ffffff', speck: '#58749a' },
    stone: { base: '#9fb6cf', dark: '#6a84a3', light: '#d9e8f6' },
    brick: { base: '#7aa4cf', dark: '#4f769f', mortar: '#d6e9fb' },
    plank: { base: '#9a7652', dark: '#664a30', light: '#c09a72' },
    oneway: 'iceshelf', decor: ['snowman', 'snowpine', 'crystal', 'snowrock', 'snowpine'],
  },
  castle: {
    sky: ['#140709', '#4a171b'], bg: 'castle',
    g: { dirt: '#4c4652', dark: '#2e2a34', light: '#68616f', top: '#5f5868', topDark: '#3c3743', topLight: '#7f7889', speck: '#25212a' },
    stone: { base: '#6a6372', dark: '#423d49', light: '#8f879a' },
    brick: { base: '#7c3a34', dark: '#4f201d', mortar: '#a77066' },
    plank: { base: '#5d4b3b', dark: '#3a2d22', light: '#7b6550' },
    oneway: 'chain', decor: ['torch', 'bones', 'torch', 'banner'],
  },
  sky: {
    sky: ['#76aef8', '#ffd4ec'], bg: 'clouds',
    g: { dirt: '#eef1fd', dark: '#d6ddf5', light: '#ffffff', top: '#ffffff', topDark: '#dde3f8', topLight: '#ffffff', speck: '#cdd5f2' },
    stone: { base: '#f2d27a', dark: '#c79a37', light: '#fff1b8' },
    brick: { base: '#e7b84f', dark: '#b07f22', mortar: '#fff0bd' },
    plank: { base: '#f0d48a', dark: '#c49a3c', light: '#fff2c4' },
    oneway: 'cloud', decor: ['goldflower', 'puff', 'pillar', 'goldflower'],
  },
};

const Render = (() => {
  let cacheScale = 2;
  let cache = {};

  function setScale(s) {
    const ns = clamp(Math.ceil(s * 2) / 2, 1, 4);
    if (ns !== cacheScale) { cacheScale = ns; cache = {}; }
  }
  function resetCache() { cache = {}; }

  function sprite(key, draw) {
    let c = cache[key];
    if (c) return c;
    c = document.createElement('canvas');
    const px = Math.round(T * cacheScale);
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.scale(px / T, px / T);
    draw(g);
    cache[key] = c;
    return c;
  }

  // ---- kleine Zeichenhelfer ----
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
  function ellipse(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); }

  // ---- Kacheln ----------------------------------------------------------------
  function drawGroundTile(g, th, top, left, right, bottom, v, tx, ty) {
    const c = th.g;
    const kind = th.bg;
    if (kind === 'castle') {
      g.fillStyle = c.dark; g.fillRect(0, 0, T, T);
      for (let row = 0; row < 2; row++) {
        const off = (row + ty) % 2 ? 8 : 0;
        for (let i = -1; i < 2; i++) {
          const x = i * 16 + off;
          g.fillStyle = hash2(tx * 3 + i, ty * 2 + row) > 0.5 ? c.dirt : c.light;
          g.fillRect(x + 1, row * 16 + 1, 14, 14);
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(x + 1, row * 16 + 1, 14, 3);
        }
      }
      if (top) { g.fillStyle = c.topLight; g.fillRect(0, 0, T, 3); }
    } else if (kind === 'clouds') {
      g.fillStyle = c.dirt; g.fillRect(0, 0, T, T);
      g.fillStyle = c.light;
      circle(g, 8 + v * 6, 10, 7); g.fill();
      circle(g, 22, 20 - v * 4, 8); g.fill();
      g.fillStyle = c.dark;
      circle(g, 26 - v * 8, 28, 5); g.fill();
      if (top) {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 4, T, 8);
        for (let i = 0; i < 4; i++) { circle(g, 4 + i * 8, 5, 5.5); g.fill(); }
        g.fillStyle = 'rgba(160,170,230,0.35)';
        g.fillRect(0, 11, T, 2);
      }
    } else {
      g.fillStyle = c.dirt; g.fillRect(0, 0, T, T);
      // Körnung / Steinchen
      const r = mulberry32((tx * 92821) ^ (ty * 68917) ^ 0x2f);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = r() > 0.5 ? c.dark : c.light;
        const x = r() * 28 + 2, y = r() * 26 + (top ? 10 : 3);
        if (kind === 'desert') { g.fillRect(x, y, 5, 1.5); }
        else { ellipse(g, x, y, 2.4, 1.6); g.fill(); }
      }
      if (kind === 'desert' && !top) {
        g.strokeStyle = 'rgba(160,110,50,0.25)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(0, 12 + v * 6); g.quadraticCurveTo(16, 8 + v * 6, 32, 12 + v * 6); g.stroke();
      }
      if (top) {
        if (kind === 'mountains') {
          g.fillStyle = c.topDark; g.fillRect(0, 0, T, 12);
          g.fillStyle = c.top; g.fillRect(0, 0, T, 9);
          for (let i = 0; i < 4; i++) { circle(g, 4 + i * 8, 9 + (i % 2), 4.2); g.fill(); }
          g.fillStyle = 'rgba(150,190,230,0.5)'; g.fillRect(0, 0, T, 1.5);
        } else if (kind === 'desert') {
          g.fillStyle = c.top; g.fillRect(0, 0, T, 7);
          g.fillStyle = c.topLight; g.fillRect(0, 0, T, 2.5);
          g.strokeStyle = c.topDark; g.lineWidth = 1.4;
          g.beginPath(); g.moveTo(0, 7); g.quadraticCurveTo(8, 9, 16, 7); g.quadraticCurveTo(24, 5, 32, 7); g.stroke();
        } else {
          g.fillStyle = c.topDark; g.fillRect(0, 0, T, 11);
          g.fillStyle = c.top; g.fillRect(0, 0, T, 8);
          // Grashalme
          g.fillStyle = c.top;
          for (let i = 0; i < 8; i++) {
            const x = i * 4 + 2;
            g.beginPath(); g.moveTo(x - 2.2, 8); g.lineTo(x, 12 + ((i + tx) % 3)); g.lineTo(x + 2.2, 8); g.fill();
          }
          g.fillStyle = c.topLight; g.fillRect(0, 0, T, 2.5);
          for (let i = 0; i < 3; i++) { g.fillRect(4 + i * 11 + v * 3, 2.5, 2, 2); }
        }
      }
    }
    // Kanten
    g.fillStyle = 'rgba(0,0,0,0.18)';
    if (left) g.fillRect(0, top ? 6 : 0, 2.5, T);
    if (right) g.fillRect(T - 2.5, top ? 6 : 0, 2.5, T);
    if (bottom) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, T - 3, T, 3); }
  }

  function bevelBlock(g, base, dark, light, r = 3) {
    g.fillStyle = dark; rr(g, 0.5, 0.5, T - 1, T - 1, r); g.fill();
    g.fillStyle = base; rr(g, 1.5, 1.5, T - 3, T - 5, r); g.fill();
    g.fillStyle = light; g.fillRect(3, 2.5, T - 6, 2.5); g.fillRect(2.5, 3, 2.5, T - 10);
  }

  function drawStoneTile(g, th) {
    const s = th.stone;
    g.fillStyle = s.dark; g.fillRect(0, 0, T, T);
    bevelBlock(g, s.base, s.dark, s.light, 3);
    g.strokeStyle = s.dark; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(9, 11); g.lineTo(14, 15); g.lineTo(12, 20); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(4, T - 8, T - 8, 2.5);
  }

  function drawBrickTile(g, th) {
    const b = th.brick;
    g.fillStyle = b.mortar; g.fillRect(0, 0, T, T);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? -8 : 0;
      for (let i = 0; i < 3; i++) {
        const x = off + i * 16;
        g.fillStyle = b.base; g.fillRect(x + 1, row * 8 + 1, 14, 6);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 1, row * 8 + 1, 14, 1.5);
        g.fillStyle = b.dark; g.fillRect(x + 1, row * 8 + 6, 14, 1);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, T - 2, T, 2);
  }

  function drawQTile(g, frame) {
    const shine = [0, 0.15, 0.3, 0.15][frame];
    g.fillStyle = '#8a4a0c'; rr(g, 0.5, 0.5, T - 1, T - 1, 4); g.fill();
    const grd = g.createLinearGradient(0, 0, 0, T);
    grd.addColorStop(0, '#ffe066'); grd.addColorStop(1, '#f2a516');
    g.fillStyle = grd; rr(g, 1.8, 1.8, T - 3.6, T - 5, 3.5); g.fill();
    g.fillStyle = `rgba(255,255,255,${0.25 + shine})`; g.fillRect(4, 3, T - 8, 2.5);
    g.fillStyle = '#9b5a10';
    for (const [x, y] of [[5, 6], [T - 5, 6], [5, T - 8], [T - 5, T - 8]]) { circle(g, x, y, 1.6); g.fill(); }
    g.font = '900 20px "Lilita One", Arial Black, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#9b5a10'; g.fillText('?', T / 2 + 1, T / 2 + 1);
    g.fillStyle = '#fff8dc'; g.fillText('?', T / 2, T / 2 - 0.5);
  }

  function drawUsedTile(g) {
    g.fillStyle = '#5e3a1c'; rr(g, 0.5, 0.5, T - 1, T - 1, 4); g.fill();
    g.fillStyle = '#9a6a3c'; rr(g, 1.8, 1.8, T - 3.6, T - 5, 3.5); g.fill();
    g.fillStyle = '#6c4523';
    for (const [x, y] of [[5, 6], [T - 5, 6], [5, T - 8], [T - 5, T - 8]]) { circle(g, x, y, 1.6); g.fill(); }
  }

  function drawIceTile(g) {
    const grd = g.createLinearGradient(0, 0, T, T);
    grd.addColorStop(0, '#d9f4ff'); grd.addColorStop(1, '#7cc4ef');
    g.fillStyle = '#4e9fd6'; rr(g, 0, 0, T, T, 3); g.fill();
    g.fillStyle = grd; rr(g, 1.2, 1.2, T - 2.4, T - 3.5, 3); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(6, 22); g.lineTo(14, 8); g.moveTo(14, 26); g.lineTo(20, 15); g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(2, 1.5, T - 4, 3);
  }

  function drawSpikeTile(g) {
    g.fillStyle = '#5b6470'; g.fillRect(1, T - 6, T - 2, 6);
    for (let i = 0; i < 3; i++) {
      const x = 2 + i * 9.5;
      g.fillStyle = '#c9d2dc';
      g.beginPath(); g.moveTo(x, T - 5); g.lineTo(x + 4.75, 12); g.lineTo(x + 9.5, T - 5); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(x + 1.6, T - 5); g.lineTo(x + 4.75, 13); g.lineTo(x + 4.75, T - 5); g.fill();
      g.fillStyle = '#7d8793';
      g.beginPath(); g.moveTo(x + 4.75, 12); g.lineTo(x + 9.5, T - 5); g.lineTo(x + 6.5, T - 5); g.fill();
    }
  }

  function drawCannonTile(g) {
    g.fillStyle = '#20232b'; rr(g, 0.5, 0.5, T - 1, T - 1, 4); g.fill();
    g.fillStyle = '#3a3f4b'; rr(g, 2, 2, T - 4, T - 6, 3); g.fill();
    g.fillStyle = '#11131a'; circle(g, T / 2, T / 2 - 1, 8.5); g.fill();
    g.strokeStyle = '#6a7282'; g.lineWidth = 2; circle(g, T / 2, T / 2 - 1, 9.5); g.stroke();
    g.fillStyle = '#e8edf5';
    // kleiner Totenkopf
    circle(g, T / 2, T / 2 - 2, 3.5); g.fill();
    g.fillStyle = '#11131a'; g.fillRect(T / 2 - 2, T / 2 - 3, 1.4, 1.4); g.fillRect(T / 2 + 0.6, T / 2 - 3, 1.4, 1.4);
  }

  function drawOnewayTile(g, th, left, right) {
    const style = th.oneway;
    if (style === 'cloud') {
      g.fillStyle = 'rgba(150,160,220,0.45)'; g.fillRect(0, 10, T, 4);
      g.fillStyle = '#ffffff';
      g.fillRect(left ? 6 : 0, 2, T - (left ? 6 : 0) - (right ? 6 : 0), 9);
      circle(g, 9, 5, left ? 5 : 6); g.fill();
      circle(g, 22, 4.5, 6.5); g.fill();
      if (left) { circle(g, 6, 8, 5); g.fill(); }
      if (right) { circle(g, T - 6, 8, 5); g.fill(); }
      return;
    }
    if (style === 'iceshelf') {
      g.fillStyle = '#7cc4ef'; g.fillRect(0, 0, T, 9);
      g.fillStyle = '#e9f8ff'; g.fillRect(0, 0, T, 4);
      g.fillStyle = '#9fd6f5';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(4 + i * 10, 9); g.lineTo(7 + i * 10, 17 - i); g.lineTo(10 + i * 10, 9); g.fill(); }
      return;
    }
    if (style === 'branch') {
      const p = th.plank;
      g.fillStyle = p.dark; rr(g, 0, 1, T, 10, 4); g.fill();
      g.fillStyle = p.base; rr(g, 0, 1, T, 7, 3.5); g.fill();
      g.fillStyle = '#4f9a54'; ellipse(g, 10, 1, 5, 2.5, -0.3); g.fill(); ellipse(g, 25, 2, 4, 2, 0.4); g.fill();
      return;
    }
    if (style === 'chain') {
      g.strokeStyle = '#8b8f99'; g.lineWidth = 2;
      if (left) { g.beginPath(); g.moveTo(4, 0); g.lineTo(4, -64); g.stroke(); }
      if (right) { g.beginPath(); g.moveTo(T - 4, 0); g.lineTo(T - 4, -64); g.stroke(); }
    }
    const p = th.plank;
    g.fillStyle = p.dark; g.fillRect(0, 0, T, 11);
    g.fillStyle = p.base; g.fillRect(0, 0, T, 8);
    g.fillStyle = p.light; g.fillRect(0, 0, T, 2);
    g.fillStyle = p.dark; g.fillRect(15, 0, 1.5, 9);
    g.fillStyle = '#d9d9d9'; circle(g, 5, 5, 1.2); g.fill(); circle(g, 27, 5, 1.2); g.fill();
  }

  function isGroundLike(t) { return t === TL.GROUND; }

  function drawTiles(ctx, lvl, cam, k, ox, oy, time) {
    const th = THEMES[lvl.theme];
    const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(lvl.w - 1, Math.floor((cam.x + cam.w) / T));
    const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.floor((cam.y + cam.h) / T);
    const qFrame = Math.floor(time * 5) % 4;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const sx = (wx) => Math.round((wx - cam.x) * k + ox);
    const sy = (wy) => Math.round((wy - cam.y) * k + oy);
    const lavaTiles = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        let t;
        if (ty < lvl.h) t = lvl.tiles[ty * lvl.w + tx];
        else { // unterhalb des Levels: unterste Reihe fortsetzen (nur Optik)
          const b = lvl.tiles[(lvl.h - 1) * lvl.w + tx];
          t = b === TL.GROUND || b === TL.STONE || b === TL.LAVA ? b : TL.EMPTY;
        }
        if (t === TL.EMPTY) continue;
        if (t === TL.LAVA) { lavaTiles.push(tx, ty); continue; }
        let key, draw;
        if (t === TL.GROUND) {
          const ry = Math.min(ty, lvl.h - 1);
          const above = ty > 0 ? lvl.tiles[(Math.min(ty, lvl.h) - 1) * lvl.w + tx] : TL.EMPTY;
          const below = ty < lvl.h - 1 ? lvl.tiles[(ty + 1) * lvl.w + tx] : TL.GROUND;
          const lt = tx > 0 ? lvl.tiles[ry * lvl.w + tx - 1] : TL.GROUND;
          const rt = tx < lvl.w - 1 ? lvl.tiles[ry * lvl.w + tx + 1] : TL.GROUND;
          const top = !isGroundLike(above) && above !== TL.ICE;
          const left = !SOLID[lt], right = !SOLID[rt], bottom = !SOLID[below];
          const v = Math.floor(hash2(tx, ty) * 3);
          const vx = th.bg === 'castle' ? (tx % 2) + (ty % 2) * 2 : v;
          key = `g${lvl.theme}${+top}${+left}${+right}${+bottom}${vx}`;
          draw = (g) => drawGroundTile(g, th, top, left, right, bottom, v / 2, th.bg === 'castle' ? tx % 2 : v, th.bg === 'castle' ? ty % 2 : v * 7);
        } else if (t === TL.STONE) { key = `s${lvl.theme}`; draw = (g) => drawStoneTile(g, th); }
        else if (t === TL.BRICK) { key = `b${lvl.theme}`; draw = (g) => drawBrickTile(g, th); }
        else if (t === TL.QBLOCK) { key = `q${qFrame}`; draw = (g) => drawQTile(g, qFrame); }
        else if (t === TL.USED) { key = 'u'; draw = drawUsedTile; }
        else if (t === TL.ICE) { key = 'ice'; draw = drawIceTile; }
        else if (t === TL.SPIKES) { key = 'spk'; draw = drawSpikeTile; }
        else if (t === TL.CANNON) { key = 'can'; draw = drawCannonTile; }
        else if (t === TL.ONEWAY) {
          const l = tx === 0 || lvl.tiles[ty * lvl.w + tx - 1] !== TL.ONEWAY;
          const r = tx === lvl.w - 1 || lvl.tiles[ty * lvl.w + tx + 1] !== TL.ONEWAY;
          key = `o${lvl.theme}${+l}${+r}`;
          if (th.oneway === 'chain' && (l || r)) {
            // Ketten ragen über die Kachel hinaus – direkt zeichnen
            ctx.save(); ctx.setTransform(k, 0, 0, k, (tx * T - cam.x) * k + ox, (ty * T - cam.y) * k + oy);
            ctx.strokeStyle = '#8b8f99'; ctx.lineWidth = 2;
            if (l) { ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(4, -ty * T); ctx.stroke(); }
            if (r) { ctx.beginPath(); ctx.moveTo(T - 4, 0); ctx.lineTo(T - 4, -ty * T); ctx.stroke(); }
            ctx.restore();
          }
          draw = (g) => drawOnewayTile(g, { ...th, oneway: th.oneway === 'chain' ? 'wood' : th.oneway }, l, r);
        } else continue;
        const spr = sprite(key, draw);
        const bump = ty < lvl.h ? lvl.bumps[ty * lvl.w + tx] : 0;
        const by = bump ? -Math.sin(Math.min(1, bump / 0.18) * Math.PI) * 7 : 0;
        const px = sx(tx * T), py = sy(ty * T + by);
        ctx.drawImage(spr, px, py, sx((tx + 1) * T) - px, sy((ty + 1) * T + by) - py);
      }
    }
    ctx.restore();
    if (lavaTiles.length) drawLava(ctx, lvl, lavaTiles, time);
  }

  function drawLava(ctx, lvl, list, time) {
    for (let i = 0; i < list.length; i += 2) {
      const tx = list[i], ty = list[i + 1];
      const x = tx * T, y = ty * T;
      const surface = ty === 0 || (ty <= lvl.h && lvl.tiles[(ty - 1) * lvl.w + tx] !== TL.LAVA);
      const grd = ctx.createLinearGradient(0, y, 0, y + T);
      grd.addColorStop(0, surface ? '#ffb02e' : '#e8501d');
      grd.addColorStop(1, '#b8260f');
      ctx.fillStyle = grd;
      if (surface) {
        ctx.beginPath();
        ctx.moveTo(x, y + T);
        for (let s = 0; s <= 8; s++) {
          const wx = x + s * 4;
          ctx.lineTo(wx, y + 5 + Math.sin(wx * 0.15 + time * 3) * 2.5);
        }
        ctx.lineTo(x + T, y + T);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffe27a';
        for (let s = 0; s < 2; s++) {
          const bx = x + ((hash2(tx, s) * 32 + time * 9 * (s + 1)) % 32);
          const ph = (time * 0.8 + hash2(s, tx)) % 1;
          circle(ctx, bx, y + 10 + ph * 10, 1.5 + (1 - ph) * 1.5); ctx.fill();
        }
      } else {
        ctx.fillRect(x, y, T + 0.5, T + 0.5);
      }
    }
  }

  // ---- Hintergründe -----------------------------------------------------------
  const ridge = (x, seed, a1, f1, a2, f2) =>
    Math.sin(x * f1 + seed) * a1 + Math.sin(x * f2 + seed * 2.3) * a2 + Math.sin(x * f1 * 2.7 + seed * 0.7) * a1 * 0.25;

  function silhouette(ctx, cam, par, base, color, fn, step = 8) {
    const off = cam.x * par;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, cam.h + 2);
    for (let sx = -step; sx <= cam.w + step; sx += step) ctx.lineTo(sx, base + fn(sx + off));
    ctx.lineTo(cam.w + step, cam.h + 2);
    ctx.closePath();
    ctx.fill();
  }

  function cloudShape(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x + 22 * s, y - 14 * s, 20 * s, Math.PI, Math.PI * 1.85);
    ctx.arc(x + 50 * s, y - 8 * s, 18 * s, Math.PI * 1.2, Math.PI * 1.95);
    ctx.arc(x + 66 * s, y, 18 * s, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function repeatX(cam, par, spacing, fn) {
    const off = cam.x * par;
    const first = Math.floor((off - spacing) / spacing);
    for (let i = first; i * spacing - off < cam.w + spacing; i++) fn(i * spacing - off, i);
  }

  function drawBackground(ctx, lvl, cam, time) {
    const th = THEMES[lvl.theme];
    const W = cam.w, H = cam.h;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, th.sky[0]); grd.addColorStop(1, th.sky[1]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    const yoff = -cam.y * 0.3;
    ctx.save();
    ctx.translate(0, yoff);
    switch (th.bg) {
      case 'hills': {
        ctx.fillStyle = 'rgba(255,248,200,0.5)'; circle(ctx, W * 0.82, 90, 62); ctx.fill();
        ctx.fillStyle = '#fff6b8'; circle(ctx, W * 0.82, 90, 44); ctx.fill();
        repeatX(cam, 0.08, 380, (x, i) => cloudShape(ctx, x + hash2(i, 1) * 120, 70 + hash2(i, 2) * 90, 0.8 + hash2(i, 3) * 0.6, 'rgba(255,255,255,0.9)'));
        silhouette(ctx, cam, 0.15, H * 0.66, '#a6dcb0', (x) => ridge(x, 1, 30, 0.006, 18, 0.013));
        silhouette(ctx, cam, 0.3, H * 0.76, '#79c77f', (x) => ridge(x, 4, 26, 0.009, 12, 0.021));
        repeatX(cam, 0.3, 230, (x, i) => {
          if (hash2(i, 9) < 0.5) return;
          const by = H * 0.76 + ridge(x + cam.x * 0.3, 4, 26, 0.009, 12, 0.021);
          ctx.fillStyle = '#5aa865'; circle(ctx, x, by - 14, 16); ctx.fill(); circle(ctx, x + 14, by - 8, 12); ctx.fill();
          ctx.fillStyle = '#6e4a2c'; ctx.fillRect(x - 2, by - 6, 4, 10);
        });
        break;
      }
      case 'forest': {
        ctx.fillStyle = 'rgba(255,255,220,0.12)';
        for (let i = 0; i < 4; i++) {
          const x = ((i * 300 - cam.x * 0.05) % (W + 300) + W + 300) % (W + 300) - 150;
          ctx.beginPath(); ctx.moveTo(x, -40); ctx.lineTo(x + 70, -40); ctx.lineTo(x + 230, H); ctx.lineTo(x + 120, H); ctx.fill();
        }
        const pines = (par, base, color, size, spacing, seed) => repeatX(cam, par, spacing, (x, i) => {
          const s = size * (0.75 + hash2(i, seed) * 0.5);
          const bx = x + hash2(i, seed + 1) * spacing * 0.5;
          ctx.fillStyle = color;
          for (let l = 0; l < 3; l++) {
            const w = s * (0.55 - l * 0.12), y = base - l * s * 0.32;
            ctx.beginPath(); ctx.moveTo(bx - w, y); ctx.lineTo(bx, y - s * 0.55); ctx.lineTo(bx + w, y); ctx.fill();
          }
          ctx.fillRect(bx - s * 0.04, base, s * 0.08, H);
        });
        pines(0.12, H * 0.62, '#2e5a52', 150, 70, 3);
        ctx.fillStyle = '#2e5a52'; ctx.fillRect(0, H * 0.62, W, H);
        pines(0.28, H * 0.74, '#1f403b', 190, 95, 7);
        ctx.fillStyle = '#1f403b'; ctx.fillRect(0, H * 0.74, W, H);
        // Glühwürmchen
        for (let i = 0; i < 18; i++) {
          const px = ((hash2(i, 1) * W * 1.5 - cam.x * 0.4 + Math.sin(time * 0.7 + i) * 30) % W + W) % W;
          const py = H * 0.35 + hash2(i, 2) * H * 0.5 + Math.sin(time * 1.3 + i * 2) * 14;
          const a = 0.4 + 0.6 * Math.max(0, Math.sin(time * 2 + i * 1.7));
          ctx.fillStyle = `rgba(220,255,140,${a * 0.3})`; circle(ctx, px, py, 6); ctx.fill();
          ctx.fillStyle = `rgba(240,255,170,${a})`; circle(ctx, px, py, 2); ctx.fill();
        }
        break;
      }
      case 'desert': {
        ctx.fillStyle = 'rgba(255,240,180,0.45)'; circle(ctx, W * 0.7, H * 0.42, 110); ctx.fill();
        ctx.fillStyle = '#fff3c4'; circle(ctx, W * 0.7, H * 0.42, 72); ctx.fill();
        silhouette(ctx, cam, 0.1, H * 0.66, '#f3c587', (x) => ridge(x, 2, 22, 0.004, 10, 0.011));
        repeatX(cam, 0.16, 900, (x, i) => {
          const b = H * 0.66 + 6, s = 110 + hash2(i, 4) * 60;
          ctx.fillStyle = '#e2a865'; ctx.beginPath(); ctx.moveTo(x, b); ctx.lineTo(x + s * 0.6, b - s * 0.75); ctx.lineTo(x + s * 1.2, b); ctx.fill();
          ctx.fillStyle = '#d0904f'; ctx.beginPath(); ctx.moveTo(x + s * 0.6, b - s * 0.75); ctx.lineTo(x + s * 1.2, b); ctx.lineTo(x + s * 0.8, b); ctx.fill();
          const s2 = s * 0.6;
          ctx.fillStyle = '#e2a865'; ctx.beginPath(); ctx.moveTo(x + s, b); ctx.lineTo(x + s + s2 * 0.6, b - s2 * 0.75); ctx.lineTo(x + s + s2 * 1.2, b); ctx.fill();
        });
        silhouette(ctx, cam, 0.32, H * 0.78, '#e5a85e', (x) => ridge(x, 6, 24, 0.007, 10, 0.017));
        repeatX(cam, 0.32, 310, (x, i) => {
          if (hash2(i, 5) < 0.45) return;
          const by = H * 0.78 + ridge(x + cam.x * 0.32, 6, 24, 0.007, 10, 0.017) + 4;
          ctx.fillStyle = '#c08447';
          rr(ctx, x - 5, by - 42, 10, 44, 5); ctx.fill();
          rr(ctx, x - 17, by - 30, 8, 18, 4); ctx.fill(); ctx.fillRect(x - 13, by - 16, 10, 5);
          rr(ctx, x + 9, by - 36, 8, 16, 4); ctx.fill(); ctx.fillRect(x + 3, by - 24, 10, 5);
        });
        break;
      }
      case 'mountains': {
        const mount = (par, base, color, snow, size, spacing, seed) => repeatX(cam, par, spacing, (x, i) => {
          const s = size * (0.7 + hash2(i, seed) * 0.6), bx = x + hash2(i, seed + 2) * spacing * 0.4;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.moveTo(bx - s, base); ctx.lineTo(bx, base - s * 0.9); ctx.lineTo(bx + s, base); ctx.fill();
          ctx.fillStyle = snow;
          ctx.beginPath(); ctx.moveTo(bx - s * 0.3, base - s * 0.63); ctx.lineTo(bx, base - s * 0.9); ctx.lineTo(bx + s * 0.3, base - s * 0.63);
          ctx.lineTo(bx + s * 0.12, base - s * 0.57); ctx.lineTo(bx, base - s * 0.66); ctx.lineTo(bx - s * 0.14, base - s * 0.56); ctx.fill();
        });
        mount(0.08, H * 0.7, '#a9c9e6', '#f5fbff', 260, 330, 1);
        ctx.fillStyle = '#a9c9e6'; ctx.fillRect(0, H * 0.7, W, H);
        mount(0.2, H * 0.8, '#7fa6cc', '#eef7ff', 200, 260, 5);
        ctx.fillStyle = '#7fa6cc'; ctx.fillRect(0, H * 0.8, W, H);
        repeatX(cam, 0.36, 60, (x, i) => {
          if (hash2(i, 8) < 0.4) return;
          const s = 40 + hash2(i, 9) * 34, b = H * 0.86;
          ctx.fillStyle = '#4f7598';
          ctx.beginPath(); ctx.moveTo(x - s * 0.35, b); ctx.lineTo(x, b - s); ctx.lineTo(x + s * 0.35, b); ctx.fill();
          ctx.fillStyle = '#eef7ff';
          ctx.beginPath(); ctx.moveTo(x - s * 0.14, b - s * 0.6); ctx.lineTo(x, b - s); ctx.lineTo(x + s * 0.14, b - s * 0.6); ctx.fill();
        });
        ctx.fillStyle = '#4f7598'; ctx.fillRect(0, H * 0.86, W, H);
        break;
      }
      case 'castle': {
        ctx.fillStyle = '#2a1416';
        repeatX(cam, 0.3, 64, (x, i) => {
          for (let r = 0; r < Math.ceil(H / 32) + 2; r++) {
            const off = r % 2 ? 32 : 0;
            ctx.fillStyle = hash2(i, r) > 0.5 ? '#2c1517' : '#331a1c';
            ctx.fillRect(x + off - 64 + 1, r * 32 + 1, 62, 30);
          }
        });
        repeatX(cam, 0.3, 320, (x, i) => {
          const wy = H * 0.3;
          const glow = 0.6 + 0.4 * Math.sin(time * 2 + i);
          ctx.fillStyle = `rgba(255,110,40,${0.25 * glow})`; circle(ctx, x + 40, wy + 40, 70); ctx.fill();
          ctx.fillStyle = '#120708';
          rr(ctx, x + 14, wy, 52, 90, 26); ctx.fill();
          const g2 = ctx.createLinearGradient(0, wy, 0, wy + 90);
          g2.addColorStop(0, '#ff9b3d'); g2.addColorStop(1, '#a3260f');
          ctx.fillStyle = g2; rr(ctx, x + 20, wy + 6, 40, 80, 20); ctx.fill();
          ctx.fillStyle = '#120708'; ctx.fillRect(x + 38, wy + 6, 4, 80); ctx.fillRect(x + 20, wy + 40, 40, 4);
          // Säule
          ctx.fillStyle = '#3d2224'; ctx.fillRect(x + 150, 0, 34, H);
          ctx.fillStyle = '#4b2b2d'; ctx.fillRect(x + 150, 0, 8, H);
          // Banner
          ctx.fillStyle = '#7c1d24';
          ctx.beginPath(); ctx.moveTo(x + 230, 40); ctx.lineTo(x + 270, 40); ctx.lineTo(x + 270, 150); ctx.lineTo(x + 250, 135); ctx.lineTo(x + 230, 150); ctx.fill();
          ctx.fillStyle = '#d9a23a'; circle(ctx, x + 250, 80, 8); ctx.fill();
        });
        const lg = ctx.createLinearGradient(0, H * 0.6, 0, H);
        lg.addColorStop(0, 'rgba(255,80,20,0)'); lg.addColorStop(1, 'rgba(255,80,20,0.35)');
        ctx.fillStyle = lg; ctx.fillRect(0, H * 0.6, W, H * 0.4);
        break;
      }
      case 'clouds': {
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle(ctx, W * 0.25, 110, 80); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; circle(ctx, W * 0.25, 110, 46); ctx.fill();
        repeatX(cam, 0.05, 520, (x, i) => cloudShape(ctx, x + hash2(i, 1) * 200, 80 + hash2(i, 2) * 120, 1.2 + hash2(i, 3), 'rgba(255,255,255,0.55)'));
        repeatX(cam, 0.14, 700, (x, i) => {
          const y = H * 0.45 + hash2(i, 4) * 60, s = 0.8 + hash2(i, 5) * 0.5;
          ctx.fillStyle = '#b9a6d9';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 140 * s, y); ctx.lineTo(x + 100 * s, y + 50 * s); ctx.lineTo(x + 50 * s, y + 60 * s); ctx.fill();
          ctx.fillStyle = '#d7f0c8'; rr(ctx, x - 4, y - 8, 148 * s, 14, 7); ctx.fill();
          ctx.fillStyle = '#efe3ff'; ctx.fillRect(x + 40 * s, y - 40 * s, 14 * s, 34 * s); ctx.fillRect(x + 80 * s, y - 30 * s, 12 * s, 24 * s);
          ctx.beginPath(); ctx.moveTo(x + 36 * s, y - 40 * s); ctx.lineTo(x + 47 * s, y - 56 * s); ctx.lineTo(x + 58 * s, y - 40 * s); ctx.fill();
        });
        silhouette(ctx, cam, 0.25, H * 0.8, 'rgba(255,255,255,0.75)', (x) => ridge(x, 3, 18, 0.012, 10, 0.03) - Math.abs(Math.sin(x * 0.02)) * 22);
        silhouette(ctx, cam, 0.45, H * 0.9, '#ffffff', (x) => ridge(x, 8, 14, 0.015, 8, 0.04) - Math.abs(Math.sin(x * 0.025)) * 20);
        break;
      }
    }
    ctx.restore();
  }

  // Vordergrund-Effekte (Schnee, Glut)
  function drawWeather(ctx, lvl, cam, time) {
    const bg = THEMES[lvl.theme].bg;
    if (bg === 'mountains') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 60; i++) {
        const sp = 30 + hash2(i, 3) * 40;
        const x = ((hash2(i, 1) * cam.w * 1.3 + Math.sin(time + i) * 20 - cam.x * 0.6) % cam.w + cam.w) % cam.w;
        const y = ((hash2(i, 2) * cam.h + time * sp) % cam.h);
        circle(ctx, x, y, 1 + hash2(i, 4) * 2); ctx.fill();
      }
    } else if (bg === 'castle') {
      for (let i = 0; i < 30; i++) {
        const sp = 25 + hash2(i, 3) * 40;
        const x = ((hash2(i, 1) * cam.w * 1.3 + Math.sin(time * 1.5 + i) * 25 - cam.x * 0.5) % cam.w + cam.w) % cam.w;
        const y = cam.h - ((hash2(i, 2) * cam.h + time * sp) % cam.h);
        ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},40,${0.4 + 0.5 * hash2(i, 5)})`;
        circle(ctx, x, y, 1 + hash2(i, 4) * 1.6); ctx.fill();
      }
    }
  }

  // ---- Deko -------------------------------------------------------------------
  function drawDecor(ctx, d, theme, time) {
    const x = d.x * T + T / 2, y = d.y * T + T;
    const v = d.v || 0;
    ctx.save();
    ctx.translate(x, y);
    switch (d.type) {
      case 'bush':
        ctx.fillStyle = '#3e9a3a'; circle(ctx, -10, -9, 10); ctx.fill(); circle(ctx, 10, -9, 10); ctx.fill(); circle(ctx, 0, -15, 12); ctx.fill();
        ctx.fillStyle = '#5ec653'; circle(ctx, -3, -18, 5); ctx.fill(); circle(ctx, 9, -13, 4); ctx.fill();
        break;
      case 'grass':
        ctx.fillStyle = '#4fb63b';
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 4 - 2, 0); ctx.lineTo(i * 5 + Math.sin(time * 2 + i + d.x) * 1.5, -9 - Math.abs(i) * -1 - (i % 2 ? 3 : 0)); ctx.lineTo(i * 4 + 2, 0); ctx.fill(); }
        break;
      case 'flower': {
        const cols = ['#ff6b9a', '#ffd23f', '#ffffff', '#b583ff'];
        const c = cols[Math.floor(v * 4)];
        const sw = Math.sin(time * 2 + d.x) * 1.5;
        ctx.strokeStyle = '#3c962a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2, -8, sw, -16); ctx.stroke();
        ctx.fillStyle = '#3c962a'; ellipse(ctx, 4, -6, 4, 2, -0.5); ctx.fill();
        ctx.fillStyle = c;
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; circle(ctx, sw + Math.cos(a) * 4.5, -17 + Math.sin(a) * 4.5, 3.5); ctx.fill(); }
        ctx.fillStyle = '#ffb400'; circle(ctx, sw, -17, 2.8); ctx.fill();
        break;
      }
      case 'tree':
        ctx.fillStyle = '#7a4f2a'; rr(ctx, -5, -40, 10, 40, 3); ctx.fill();
        ctx.fillStyle = '#2f8a33'; circle(ctx, 0, -52, 22); ctx.fill(); circle(ctx, -16, -40, 14); ctx.fill(); circle(ctx, 16, -40, 14); ctx.fill();
        ctx.fillStyle = '#4cb14a'; circle(ctx, -6, -60, 9); ctx.fill(); circle(ctx, 9, -50, 6); ctx.fill();
        ctx.fillStyle = '#e8402a'; circle(ctx, -10, -44, 2.5); ctx.fill(); circle(ctx, 8, -38, 2.5); ctx.fill(); circle(ctx, 2, -58, 2.5); ctx.fill();
        break;
      case 'glowshroom': {
        const a = 0.5 + 0.5 * Math.sin(time * 2 + d.x);
        ctx.fillStyle = `rgba(110,240,230,${0.18 + a * 0.15})`; circle(ctx, 0, -10, 16); ctx.fill();
        ctx.fillStyle = '#d8e9e1'; rr(ctx, -2.5, -10, 5, 10, 2); ctx.fill();
        ctx.fillStyle = '#3fd1c4'; ctx.beginPath(); ctx.ellipse(0, -10, 9, 7, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#b7fff8'; circle(ctx, -3, -13, 1.6); ctx.fill(); circle(ctx, 3, -14, 1.2); ctx.fill();
        ctx.fillStyle = '#d8e9e1'; rr(ctx, 8, -6, 3, 6, 1.5); ctx.fill();
        ctx.fillStyle = '#3fd1c4'; ctx.beginPath(); ctx.ellipse(9.5, -6, 5, 4, 0, Math.PI, 0); ctx.fill();
        break;
      }
      case 'fern':
        ctx.strokeStyle = '#3f8f4a'; ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(i * 5, -14, i * 10 + Math.sin(time + i) * 1.2, -12 + Math.abs(i) * 3); ctx.stroke();
        }
        break;
      case 'stump':
        ctx.fillStyle = '#6b4a30'; rr(ctx, -10, -14, 20, 14, 3); ctx.fill();
        ctx.fillStyle = '#b08a5e'; ellipse(ctx, 0, -14, 10, 3.5); ctx.fill();
        ctx.strokeStyle = '#7b5a3a'; ctx.lineWidth = 1; ellipse(ctx, 0, -14, 5, 1.6); ctx.stroke();
        break;
      case 'pine':
        ctx.fillStyle = '#4b2f1e'; ctx.fillRect(-3, -14, 6, 14);
        ctx.fillStyle = '#245a3a';
        for (let l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(-16 + l * 3, -10 - l * 14); ctx.lineTo(0, -34 - l * 14); ctx.lineTo(16 - l * 3, -10 - l * 14); ctx.fill(); }
        break;
      case 'cactus':
        ctx.fillStyle = '#4c9b46';
        rr(ctx, -6, -42, 12, 42, 6); ctx.fill();
        rr(ctx, -17, -30, 8, 16, 4); ctx.fill(); ctx.fillRect(-12, -18, 8, 5);
        rr(ctx, 9, -36, 8, 14, 4); ctx.fill(); ctx.fillRect(4, -26, 8, 5);
        ctx.strokeStyle = '#3a7f36'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(0, -2); ctx.stroke();
        ctx.fillStyle = '#ff7aa8'; circle(ctx, 0, -43, 3); ctx.fill();
        break;
      case 'rock':
        ctx.fillStyle = '#b5824e'; ellipse(ctx, 0, -6, 13, 8); ctx.fill();
        ctx.fillStyle = '#d4a46a'; ellipse(ctx, -3, -9, 6, 3); ctx.fill();
        break;
      case 'skull':
        ctx.fillStyle = '#f3ead8'; circle(ctx, 0, -8, 7); ctx.fill(); ctx.fillRect(-4, -4, 8, 4);
        ctx.fillStyle = '#5a4630'; circle(ctx, -2.6, -8, 1.8); ctx.fill(); circle(ctx, 2.6, -8, 1.8); ctx.fill();
        ctx.strokeStyle = '#f3ead8'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-14, -1); ctx.lineTo(-6, -4); ctx.moveTo(14, -1); ctx.lineTo(7, -3); ctx.stroke();
        break;
      case 'tumble':
        ctx.strokeStyle = '#a5763f'; ctx.lineWidth = 1.4;
        ctx.save(); ctx.translate(0, -9); ctx.rotate(time * 0.5 + d.x);
        for (let i = 0; i < 5; i++) { ellipse(ctx, 0, 0, 9, 4, i * 0.6); ctx.stroke(); }
        ctx.restore();
        break;
      case 'snowman':
        ctx.fillStyle = '#ffffff'; circle(ctx, 0, -10, 10); ctx.fill(); circle(ctx, 0, -26, 7.5); ctx.fill();
        ctx.fillStyle = '#d4e6f7'; circle(ctx, 3, -7, 6); ctx.fill();
        ctx.fillStyle = '#ffffff'; circle(ctx, -1, -11, 7); ctx.fill();
        ctx.fillStyle = '#222'; circle(ctx, -2.5, -28, 1.2); ctx.fill(); circle(ctx, 2.5, -28, 1.2); ctx.fill();
        ctx.fillStyle = '#ff8a1e'; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(8, -25); ctx.lineTo(0, -24); ctx.fill();
        ctx.fillStyle = '#d83b3b'; ctx.fillRect(-7, -21, 14, 3); ctx.fillRect(3, -21, 3, 8);
        ctx.fillStyle = '#2b2b33'; ctx.fillRect(-6, -36, 12, 3); ctx.fillRect(-4, -43, 8, 8);
        break;
      case 'snowpine':
        ctx.fillStyle = '#4b2f1e'; ctx.fillRect(-3, -12, 6, 12);
        for (let l = 0; l < 3; l++) {
          ctx.fillStyle = '#2f6b5a'; ctx.beginPath(); ctx.moveTo(-17 + l * 3, -8 - l * 13); ctx.lineTo(0, -32 - l * 13); ctx.lineTo(17 - l * 3, -8 - l * 13); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-7 + l * 1.5, -22 - l * 13); ctx.lineTo(0, -32 - l * 13); ctx.lineTo(7 - l * 1.5, -22 - l * 13); ctx.fill();
        }
        break;
      case 'crystal': {
        const a = 0.6 + 0.4 * Math.sin(time * 3 + d.x);
        ctx.fillStyle = `rgba(160,230,255,${0.25 * a})`; circle(ctx, 0, -12, 15); ctx.fill();
        ctx.fillStyle = '#9fe3ff';
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-6, -16); ctx.lineTo(-1, -26); ctx.lineTo(3, -16); ctx.lineTo(2, 0); ctx.fill();
        ctx.fillStyle = '#d8f6ff'; ctx.beginPath(); ctx.moveTo(-1, -26); ctx.lineTo(3, -16); ctx.lineTo(0, -14); ctx.fill();
        ctx.fillStyle = '#6fc8f0'; ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(8, -12); ctx.lineTo(11, -4); ctx.lineTo(9, 0); ctx.fill();
        break;
      }
      case 'snowrock':
        ctx.fillStyle = '#7d93ad'; ellipse(ctx, 0, -6, 13, 8); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, -9, 12, 5, 0, Math.PI, 0); ctx.fill();
        break;
      case 'torch': {
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-2.5, -26, 5, 26);
        ctx.fillStyle = '#7a6a5a'; ctx.fillRect(-5, -30, 10, 5);
        const f = Math.sin(time * 14 + d.x) * 1.5;
        ctx.fillStyle = 'rgba(255,140,40,0.22)'; circle(ctx, 0, -36, 22 + f); ctx.fill();
        ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-6, -30); ctx.quadraticCurveTo(-5, -42, f, -48); ctx.quadraticCurveTo(5, -42, 6, -30); ctx.fill();
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(-3, -30); ctx.quadraticCurveTo(-2, -38, f * 0.5, -42); ctx.quadraticCurveTo(2, -38, 3, -30); ctx.fill();
        break;
      }
      case 'bones':
        ctx.strokeStyle = '#e9e0cc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(6, -6); ctx.moveTo(-4, -8); ctx.lineTo(10, -1); ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      case 'banner':
        ctx.fillStyle = '#3a2d22'; ctx.fillRect(-2, -56, 4, 56);
        ctx.fillStyle = '#8f1f2a';
        ctx.beginPath(); ctx.moveTo(2, -54); ctx.lineTo(20 + Math.sin(time * 3 + d.x) * 2, -50); ctx.lineTo(2, -36); ctx.fill();
        break;
      case 'goldflower': {
        const sw = Math.sin(time * 2 + d.x) * 1.5;
        ctx.strokeStyle = '#7bc86c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sw, -14); ctx.stroke();
        ctx.fillStyle = '#ffd34d';
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + time; circle(ctx, sw + Math.cos(a) * 4, -15 + Math.sin(a) * 4, 3); ctx.fill(); }
        ctx.fillStyle = '#ff9bd2'; circle(ctx, sw, -15, 2.6); ctx.fill();
        break;
      }
      case 'puff':
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; circle(ctx, -8, -6, 8); ctx.fill(); circle(ctx, 6, -8, 10); ctx.fill(); circle(ctx, 14, -4, 6); ctx.fill();
        break;
      case 'pillar':
        ctx.fillStyle = '#f4ecff'; ctx.fillRect(-8, -40, 16, 40);
        ctx.fillStyle = '#dcd0f0'; ctx.fillRect(-8, -40, 4, 40); ctx.fillRect(2, -40, 2, 40);
        ctx.fillStyle = '#fff'; ctx.fillRect(-11, -44, 22, 5);
        ctx.fillStyle = '#efe6ff'; ctx.beginPath(); ctx.moveTo(-11, -44); ctx.lineTo(-4, -52); ctx.lineTo(3, -46); ctx.lineTo(11, -50); ctx.lineTo(11, -44); ctx.fill();
        break;
      case 'house':
        drawHouse(ctx, theme, time);
        break;
    }
    ctx.restore();
  }

  function drawHouse(ctx, theme, time) {
    const bg = THEMES[theme].bg;
    if (bg === 'mountains') {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 64, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#cfe2f4'; ctx.lineWidth = 2;
      for (let r = 1; r < 4; r++) { ctx.beginPath(); ctx.arc(0, 0, 64 - r * 0.1, Math.PI + r * 0.5, Math.PI + r * 0.5 + 0.01); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-64, -20); ctx.lineTo(64, -20); ctx.moveTo(-56, -40); ctx.lineTo(56, -40); ctx.stroke();
      ctx.fillStyle = '#3a4b66'; ctx.beginPath(); ctx.arc(0, 0, 22, Math.PI, 0); ctx.fill();
      return;
    }
    const wall = { hills: '#fff1d6', forest: '#c9a77d', desert: '#f2cf96', castle: '#5a5462', clouds: '#fff4fb' }[bg] || '#fff1d6';
    const roof = { hills: '#d9472b', forest: '#6b3f2a', desert: '#c4733a', castle: '#2c2833', clouds: '#f2c94c' }[bg] || '#d9472b';
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-58, -4, 116, 4);
    ctx.fillStyle = wall; ctx.fillRect(-52, -86, 104, 86);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(-52, -86, 104, 10);
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(-66, -82); ctx.lineTo(0, -138); ctx.lineTo(66, -82); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.moveTo(-66, -82); ctx.lineTo(0, -138); ctx.lineTo(-6, -126); ctx.lineTo(-52, -86); ctx.fill();
    // Tür
    ctx.fillStyle = '#5b3a1f'; rr(ctx, -16, -52, 32, 52, 14); ctx.fill();
    ctx.fillStyle = '#7a5130'; rr(ctx, -12, -48, 24, 48, 11); ctx.fill();
    ctx.fillStyle = '#ffd34d'; circle(ctx, 7, -24, 2.5); ctx.fill();
    // Fenster
    for (const wx of [-38, 38]) {
      ctx.fillStyle = '#5b3a1f'; ctx.fillRect(wx - 10, -66, 20, 20);
      const glow = 0.7 + 0.3 * Math.sin(time * 2 + wx);
      ctx.fillStyle = `rgba(255,214,110,${glow})`; ctx.fillRect(wx - 8, -64, 16, 16);
      ctx.fillStyle = '#5b3a1f'; ctx.fillRect(wx - 1, -64, 2, 16); ctx.fillRect(wx - 8, -57, 16, 2);
    }
    // Wimpel
    ctx.fillStyle = '#5b3a1f'; ctx.fillRect(-1.5, -170, 3, 34);
    ctx.fillStyle = '#4cd964';
    ctx.beginPath(); ctx.moveTo(1.5, -170); ctx.lineTo(22 + Math.sin(time * 4) * 2, -163); ctx.lineTo(1.5, -156); ctx.fill();
  }

  function drawHint(ctx, h, near) {
    const x = h.x * T + T / 2, y = h.y * T + T;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#7a4f2a'; ctx.fillRect(-2, -24, 4, 24);
    ctx.fillStyle = '#c58b56'; rr(ctx, -12, -34, 24, 16, 3); ctx.fill();
    ctx.fillStyle = '#7a4f2a'; ctx.font = '900 13px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, -26);
    if (near > 0.01) {
      ctx.globalAlpha = near;
      ctx.font = '800 15px Nunito, sans-serif';
      const tw = ctx.measureText(h.text).width;
      const bw = tw + 26, bh = 34, by = -82 - (1 - near) * 8;
      ctx.fillStyle = 'rgba(20,24,40,0.88)'; rr(ctx, -bw / 2, by, bw, bh, 12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, by + bh); ctx.lineTo(0, by + bh + 9); ctx.lineTo(8, by + bh); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillText(h.text, 0, by + bh / 2 + 1);
    }
    ctx.restore();
  }

  // ---- Spielfigur: kleiner Fuchs ------------------------------------------------
  const FUR = {
    0: { fur: '#f28a26', dark: '#c4621a', belly: '#fff5e6', sock: '#4a2a18', accent: null },
    1: { fur: '#f28a26', dark: '#c4621a', belly: '#fff5e6', sock: '#4a2a18', accent: null },
    2: { fur: '#fbf6ee', dark: '#d8cbbb', belly: '#ffffff', sock: '#d23a2a', accent: '#e8402a' },
  };

  function drawPlayer(ctx, p, time) {
    if (p.hidden) return;
    let pal = FUR[p.power];
    if (p.star > 0) {
      const hue = (time * 720) % 360;
      pal = { fur: `hsl(${hue},95%,60%)`, dark: `hsl(${hue},90%,42%)`, belly: '#fffbe6', sock: `hsl(${(hue + 180) % 360},80%,40%)`, accent: '#ffffff' };
    }
    if (p.inv > 0 && p.star <= 0 && Math.floor(time * 20) % 2 === 0) return;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h);
    if (p.dead) {
      ctx.translate(0, -p.h / 2); ctx.rotate(p.deadSpin); ctx.translate(0, p.h / 2);
    }
    if (p.face < 0) ctx.scale(-1, 1);

    if (p.rolling > 0 && !p.dead) {
      const r = p.h / 2;
      ctx.translate(0, -r);
      ctx.rotate(p.rollAngle);
      ctx.fillStyle = pal.fur; circle(ctx, 0, 0, r); ctx.fill();
      ctx.fillStyle = pal.dark; ctx.beginPath(); ctx.arc(0, 0, r, 0.2, 1.6); ctx.lineTo(0, 0); ctx.fill();
      ctx.strokeStyle = pal.belly; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 2.2, 4.4); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = pal.belly; circle(ctx, -r * 0.55, r * 0.5, 3.4); ctx.fill();
      ctx.fillStyle = pal.fur;
      ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.85); ctx.lineTo(r * 0.6, -r * 1.35); ctx.lineTo(r * 0.85, -r * 0.5); ctx.fill();
      ctx.fillStyle = '#2a1a10'; circle(ctx, r * 0.45, -r * 0.1, 1.8); ctx.fill();
      if (pal.accent) { ctx.strokeStyle = pal.accent; ctx.lineWidth = 2; circle(ctx, 0, 0, r - 1); ctx.stroke(); }
      ctx.restore();
      return;
    }

    const s = p.h / 40;
    ctx.scale(s, s);
    const moving = Math.abs(p.vx) > 15;
    const ph = p.walkPhase;
    let legF = 0, legB = 0, bob = 0, lean = 0, earBack = 0;
    if (p.flagHold) {
      legF = -0.6; legB = 0.5;
    } else if (!p.onGround && !p.dead) {
      if (p.vy < 0) { legF = -0.9; legB = 0.8; earBack = 0.25; } else { legF = 0.35; legB = -0.3; earBack = -0.1; }
    } else if (moving) {
      const amp = Math.min(1, Math.abs(p.vx) / 200) * 0.9;
      legF = Math.sin(ph) * amp; legB = -Math.sin(ph) * amp;
      bob = Math.abs(Math.cos(ph)) * 1.6;
      lean = clamp(Math.abs(p.vx) / 1400, 0, 0.22);
      earBack = Math.abs(p.vx) > 260 ? 0.3 : 0.1;
    } else {
      bob = Math.sin(time * 3) * 0.5;
    }
    const sq = p.squash || 0;
    ctx.scale(1 + sq * 0.25, 1 - sq * 0.25);
    ctx.translate(0, -bob);
    ctx.rotate(lean);

    // Schwanz
    const tw = Math.sin(time * 4 + ph * 0.5) * 0.15 + (moving ? 0.25 : 0);
    ctx.save();
    ctx.translate(-7, -13);
    ctx.rotate(-tw);
    ctx.fillStyle = pal.fur;
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.bezierCurveTo(-14, 6, -22, -6, -16, -18);
    ctx.bezierCurveTo(-12, -10, -6, -6, 0, -4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.belly;
    ctx.beginPath();
    ctx.moveTo(-16, -18); ctx.bezierCurveTo(-20, -11, -19, -8, -16, -6); ctx.bezierCurveTo(-14, -11, -14, -14, -16, -18); ctx.fill();
    ctx.restore();

    // Beine
    const leg = (x, a, front) => {
      ctx.save(); ctx.translate(x, -9); ctx.rotate(a);
      ctx.fillStyle = front ? pal.fur : pal.dark; rr(ctx, -2.4, 0, 4.8, 9.5, 2.4); ctx.fill();
      ctx.fillStyle = pal.sock; rr(ctx, -2.6, 5.5, 5.4, 4.2, 2); ctx.fill();
      ctx.restore();
    };
    leg(-4, legB, false);
    leg(4, legF * 0.9 + 0.1, false);
    // Körper
    ctx.fillStyle = pal.fur; ellipse(ctx, 0, -15, 9.5, 8.5); ctx.fill();
    ctx.fillStyle = pal.belly; ellipse(ctx, 3.5, -13, 5, 6); ctx.fill();
    leg(-2, -legB * 0.8, true);
    leg(5, legF, true);
    if (pal.accent && p.star <= 0) { // Schal der Feuerform
      ctx.fillStyle = pal.accent; rr(ctx, -6, -24, 15, 4.5, 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-5, -22); ctx.lineTo(-12 - Math.sin(time * 10) * 2, -18); ctx.lineTo(-6, -18); ctx.fill();
    }
    // Kopf
    ctx.save();
    ctx.translate(3, -28);
    ctx.fillStyle = pal.fur;
    ctx.save(); ctx.rotate(-earBack);
    ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-7, -16); ctx.lineTo(0, -7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, -7); ctx.lineTo(5, -17); ctx.lineTo(9, -4); ctx.fill();
    ctx.fillStyle = pal.sock;
    ctx.beginPath(); ctx.moveTo(-7.4, -11); ctx.lineTo(-7, -16); ctx.lineTo(-4, -12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, -13); ctx.lineTo(5, -17); ctx.lineTo(6.6, -12.5); ctx.fill();
    ctx.restore();
    ctx.fillStyle = pal.fur; circle(ctx, 0, 0, 9); ctx.fill();
    ctx.fillStyle = pal.belly; ellipse(ctx, 5, 3.5, 7, 4.6); ctx.fill();
    ctx.fillStyle = pal.belly; ellipse(ctx, 9, 1.5, 4.5, 3.2); ctx.fill();
    ctx.fillStyle = '#2a1a10'; circle(ctx, 13, 0.6, 2); ctx.fill();
    if (p.dead) {
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(6, -1); ctx.moveTo(6, -5); ctx.lineTo(2, -1); ctx.stroke();
    } else if ((time + p.blinkSeed) % 3.4 < 0.12) {
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(2.2, -2.5); ctx.lineTo(6.2, -2.5); ctx.stroke();
    } else {
      ctx.fillStyle = '#2a1a10'; ellipse(ctx, 4.5, -2.6, 1.9, 2.6); ctx.fill();
      ctx.fillStyle = '#ffffff'; circle(ctx, 5.2, -3.6, 0.8); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,120,120,0.35)'; ellipse(ctx, 2, 3, 2.4, 1.4); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---- Gegner -----------------------------------------------------------------
  function eyes(ctx, x, y, r, look, gap = 7, angry = false) {
    for (const ex of [x - gap / 2, x + gap / 2]) {
      ctx.fillStyle = '#ffffff'; ellipse(ctx, ex, y, r, r * 1.2); ctx.fill();
      ctx.fillStyle = '#1b1b24'; ellipse(ctx, ex + look * r * 0.4, y + r * 0.15, r * 0.5, r * 0.65); ctx.fill();
    }
    if (angry) {
      ctx.strokeStyle = '#1b1b24'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - gap / 2 - r, y - r * 1.4); ctx.lineTo(x - 1, y - r * 0.8);
      ctx.moveTo(x + gap / 2 + r, y - r * 1.4); ctx.lineTo(x + 1, y - r * 0.8); ctx.stroke();
    }
  }

  // ---- Bosse (Ursprung: Mitte unten, schon verschoben) ----
  function drawBoss(ctx, e, time) {
    const d = e.dir || 1, lk = e.look || 0;
    const flash = e.hitFlash > 0 && e.hitFlash < 1.3;
    switch (e.kind) {
      case 'mole': {
        if (e.state === 'under' || e.state === 'warn') {
          const sh = e.state === 'warn' ? Math.sin(time * 60) * 2 : 0;
          ctx.translate(sh, 0);
          ctx.fillStyle = '#6b4426'; ctx.beginPath(); ctx.ellipse(0, 0, 36, 17, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#a8703f'; ctx.beginPath(); ctx.ellipse(-4, -2, 27, 12, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#5b3a24';
          for (const [x, y] of [[-14, -6], [8, -9], [18, -4], [-2, -12]]) { circle(ctx, x, y, 2.4); ctx.fill(); }
          if (e.state === 'warn') {
            ctx.strokeStyle = '#3e2a1d'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-20, -7); ctx.lineTo(-8, -1); ctx.moveTo(34, 0); ctx.lineTo(18, -8); ctx.lineTo(6, -2); ctx.stroke();
          }
          break;
        }
        ctx.save();
        ctx.beginPath(); ctx.rect(-90, -160, 180, 160); ctx.clip(); // nicht unter den Boden zeichnen
        ctx.translate(0, (e.hide || 0) * 66);
        const sq = e.squash || 0;
        ctx.scale(1 + sq * 0.2, 1 - sq * 0.2);
        ctx.fillStyle = '#4a3226'; ellipse(ctx, 0, -30, 36, 31); ctx.fill();
        ctx.fillStyle = flash ? '#c98a7a' : '#7a5440'; ellipse(ctx, -3, -33, 31, 26); ctx.fill();
        ctx.fillStyle = '#c99a78'; ellipse(ctx, lk * 6, -21, 20, 16); ctx.fill();
        ctx.fillStyle = '#f2b3a6'; ellipse(ctx, -16, -3, 11, 5); ctx.fill(); ellipse(ctx, 16, -3, 11, 5); ctx.fill();
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(s * 31, -26); ctx.rotate(s * (0.35 + Math.sin(time * 8) * 0.1));
          ctx.fillStyle = '#f2b3a6'; ellipse(ctx, 0, 0, 11, 9); ctx.fill();
          ctx.fillStyle = '#fff6ea';
          for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(s * 6, i * 5 - 2); ctx.lineTo(s * 17, i * 6); ctx.lineTo(s * 6, i * 5 + 2); ctx.fill(); }
          ctx.restore();
        }
        ctx.fillStyle = '#ff9aa8'; ellipse(ctx, lk * 14, -37, 12, 8); ctx.fill();
        ctx.fillStyle = '#d4566a'; ellipse(ctx, lk * 20, -39, 5, 3.6); ctx.fill();
        ctx.strokeStyle = '#2f1f14'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { ctx.moveTo(lk * 14 + s * 8, -36 + k * 3); ctx.lineTo(lk * 14 + s * 22, -37 + k * 6); }
        ctx.stroke();
        ctx.fillStyle = '#1b1b24'; circle(ctx, lk * 10 - 9, -47, 2.8); ctx.fill(); circle(ctx, lk * 10 + 9, -47, 2.8); ctx.fill();
        ctx.fillStyle = '#ffffff'; circle(ctx, lk * 10 - 8.2, -48, 0.9); ctx.fill(); circle(ctx, lk * 10 + 9.8, -48, 0.9); ctx.fill();
        ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.ellipse(0, -54, 23, 14, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#e0a400'; rr(ctx, -27, -56, 54, 5, 2); ctx.fill();
        ctx.fillStyle = '#d9dde4'; circle(ctx, lk * 6, -62, 6); ctx.fill();
        ctx.fillStyle = '#fff6c4'; circle(ctx, lk * 6, -62, 4); ctx.fill();
        ctx.restore();
        if ((e.hide || 0) > 0) { ctx.fillStyle = '#6b4426'; ctx.beginPath(); ctx.ellipse(0, 0, 44, 10, 0, Math.PI, 0); ctx.fill(); }
        break;
      }
      case 'bat': {
        ctx.translate(0, -e.h / 2);
        const f = Math.sin(time * (e.state === 'swoop' ? 9 : 14));
        if (e.state === 'aim') { ctx.fillStyle = 'rgba(255,60,90,0.25)'; circle(ctx, 0, 0, 54 + Math.sin(time * 30) * 4); ctx.fill(); }
        for (const s of [-1, 1]) {
          ctx.save(); ctx.scale(s, 1); ctx.rotate(f * 0.45 - 0.1);
          ctx.fillStyle = '#2e1745';
          ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(40, -28); ctx.lineTo(64, -14);
          ctx.quadraticCurveTo(54, -4, 58, 6); ctx.quadraticCurveTo(46, 2, 42, 12); ctx.quadraticCurveTo(32, 6, 24, 14);
          ctx.quadraticCurveTo(18, 6, 8, 8); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#6a3d97'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(14, -4); ctx.lineTo(40, -26); ctx.moveTo(18, 0); ctx.lineTo(58, -10); ctx.moveTo(18, 4); ctx.lineTo(42, 10); ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = flash ? '#c48ae8' : '#6a3d97'; ellipse(ctx, 0, 2, 22, 22); ctx.fill();
        ctx.fillStyle = '#8f5cc4'; ellipse(ctx, 0, 9, 13, 12); ctx.fill();
        ctx.fillStyle = '#6a3d97';
        ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(-19, -34); ctx.lineTo(-4, -18); ctx.fill();
        ctx.beginPath(); ctx.moveTo(15, -12); ctx.lineTo(19, -34); ctx.lineTo(4, -18); ctx.fill();
        ctx.fillStyle = '#ffcf33';
        ctx.beginPath(); ctx.moveTo(-11, -17); ctx.lineTo(-10, -27); ctx.lineTo(-5, -21); ctx.lineTo(0, -30); ctx.lineTo(5, -21); ctx.lineTo(10, -27); ctx.lineTo(11, -17); ctx.fill();
        ctx.fillStyle = '#ff5fa2'; circle(ctx, 0, -21, 2.4); ctx.fill();
        for (const s of [-1, 1]) {
          ctx.fillStyle = '#ff3b5c'; ellipse(ctx, lk * 4 + s * 8, -2, 4.4, 5); ctx.fill();
          ctx.fillStyle = '#1b1b24'; ellipse(ctx, lk * 5 + s * 8, -2, 1.4, 3.6); ctx.fill();
        }
        ctx.strokeStyle = '#1b1b24'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lk * 4 - 14, -10); ctx.lineTo(lk * 4 - 3, -6); ctx.moveTo(lk * 4 + 14, -10); ctx.lineTo(lk * 4 + 3, -6); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(-6, 9); ctx.lineTo(-4, 15); ctx.lineTo(-2, 9); ctx.moveTo(2, 9); ctx.lineTo(4, 15); ctx.lineTo(6, 9); ctx.fill();
        break;
      }
      case 'scorpion': {
        ctx.scale(d, 1);
        if (e.shake) ctx.translate(Math.sin(time * 70) * 1.5, 0);
        const walk = Math.abs(e.vx) > 10 ? Math.sin(time * 16) : 0;
        ctx.strokeStyle = '#3d1512'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const x = -30 + i * 16, ph = (i % 2 ? 1 : -1) * walk * 4;
          ctx.beginPath(); ctx.moveTo(x, -16); ctx.lineTo(x - 6 + ph, -7); ctx.lineTo(x - 2 + ph, 0); ctx.stroke();
        }
        const up = e.tail || 0;
        const P0 = [-40, -26], C = [-72, -80 - up * 10], P1 = [-8 + up * 10, -84 - up * 6];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const x = (1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * C[0] + t * t * P1[0];
          const y = (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * C[1] + t * t * P1[1];
          ctx.fillStyle = i % 2 ? '#7a2a22' : '#a8402f'; circle(ctx, x, y, 10 - i * 0.6); ctx.fill();
        }
        ctx.fillStyle = '#3b2a1a';
        ctx.beginPath(); ctx.moveTo(P1[0] + 4, P1[1] - 5); ctx.quadraticCurveTo(P1[0] + 20, P1[1] + 2, P1[0] + 11, P1[1] + 15); ctx.lineTo(P1[0] + 2, P1[1] + 4); ctx.fill();
        if (up > 0.4) { ctx.fillStyle = `rgba(126,217,87,${up})`; circle(ctx, P1[0] + 11, P1[1] + 15, 4); ctx.fill(); }
        ctx.fillStyle = '#5e1b18'; ellipse(ctx, -6, -22, 43, 18); ctx.fill();
        ctx.fillStyle = flash ? '#ff9a8a' : '#a8402f'; ellipse(ctx, -6, -25, 39, 13); ctx.fill();
        ctx.strokeStyle = '#5e1b18'; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-30 + i * 14, -36); ctx.lineTo(-32 + i * 14, -14); ctx.stroke(); }
        ctx.fillStyle = '#7a2a22'; ellipse(ctx, 32, -22, 16, 13); ctx.fill();
        for (const s of [-1, 1]) {
          const open = 0.3 + Math.sin(time * 6 + s) * 0.15;
          ctx.save(); ctx.translate(44, -24 + s * 9);
          ctx.fillStyle = '#a8402f'; ellipse(ctx, 6, 0, 9, 6); ctx.fill();
          ctx.fillStyle = '#7a2a22';
          ctx.save(); ctx.translate(12, 0); ctx.rotate(-open); ellipse(ctx, 8, -2, 10, 4.5); ctx.fill(); ctx.restore();
          ctx.save(); ctx.translate(12, 0); ctx.rotate(open); ellipse(ctx, 8, 2, 10, 4); ctx.fill(); ctx.restore();
          ctx.restore();
        }
        ctx.strokeStyle = '#3d1512'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(30, -32); ctx.lineTo(28, -42); ctx.moveTo(38, -32); ctx.lineTo(40, -42); ctx.stroke();
        for (const ex of [28, 40]) {
          ctx.fillStyle = '#ffffff'; circle(ctx, ex, -45, 4.2); ctx.fill();
          ctx.fillStyle = '#1b1b24'; circle(ctx, ex + 1.2, -45, 2); ctx.fill();
        }
        if (e.state === 'dazed') {
          ctx.fillStyle = '#ffe27a';
          for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.09; ctx.fillRect(34 + Math.cos(a) * 16 - 2.5, -60 + Math.sin(a) * 4 - 2.5, 5, 5); }
        }
        ctx.lineCap = 'butt';
        break;
      }
      case 'yeti': {
        ctx.scale(d, 1);
        const sq = e.squash || 0;
        ctx.scale(1 + sq * 0.15, 1 - sq * 0.15);
        const step = Math.abs(e.vx) > 10 ? Math.sin(time * 10) * 3 : 0;
        ctx.fillStyle = '#7d93ad'; ellipse(ctx, -16 + step, -5, 14, 6); ctx.fill(); ellipse(ctx, 16 - step, -5, 14, 6); ctx.fill();
        ctx.fillStyle = '#e8f0f8'; rr(ctx, -46, -62, 17, 42, 8); ctx.fill();
        ctx.fillStyle = '#cfdcea'; ellipse(ctx, 0, -42, 41, 41); ctx.fill();
        ctx.fillStyle = flash ? '#ffd6e0' : '#ffffff'; ellipse(ctx, -3, -46, 37, 37); ctx.fill();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; circle(ctx, -3 + Math.cos(a) * 35, -46 + Math.sin(a) * 35, 7); ctx.fill(); }
        ctx.fillStyle = '#c9b48a';
        ctx.beginPath(); ctx.moveTo(-6, -80); ctx.quadraticCurveTo(-14, -96, -4, -98); ctx.quadraticCurveTo(-8, -90, 0, -82); ctx.fill();
        ctx.beginPath(); ctx.moveTo(22, -80); ctx.quadraticCurveTo(32, -96, 22, -98); ctx.quadraticCurveTo(26, -90, 16, -82); ctx.fill();
        ctx.fillStyle = '#8fa8c4'; ellipse(ctx, 12, -62, 19, 16); ctx.fill();
        for (const ex of [5, 19]) {
          ctx.fillStyle = '#ffffff'; circle(ctx, ex, -66, 4.5); ctx.fill();
          ctx.fillStyle = '#1b1b24'; circle(ctx, ex + 1.5, -65.5, 2.2); ctx.fill();
        }
        ctx.strokeStyle = '#2b3a55'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-1, -74); ctx.lineTo(10, -70); ctx.moveTo(25, -74); ctx.lineTo(14, -70); ctx.stroke();
        ctx.fillStyle = '#2b3a55'; ctx.beginPath(); ctx.ellipse(13, -54, 9, 5, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(6, -54); ctx.lineTo(8, -50); ctx.lineTo(10, -54); ctx.moveTo(16, -54); ctx.lineTo(18, -50); ctx.lineTo(20, -54); ctx.fill();
        const a = e.arm || 0;
        ctx.save(); ctx.translate(30, -56); ctx.rotate(0.3 - a * 2.4);
        ctx.fillStyle = '#ffffff'; rr(ctx, -9, 0, 18, 40, 9); ctx.fill();
        ctx.strokeStyle = '#cfdcea'; ctx.lineWidth = 2; rr(ctx, -9, 0, 18, 40, 9); ctx.stroke();
        if (a > 0.3) { ctx.fillStyle = '#eef6ff'; circle(ctx, 0, 42, 11); ctx.fill(); ctx.strokeStyle = '#c4d8ec'; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'dragon': {
        ctx.scale(d, 1);
        const sq = e.squash || 0;
        ctx.scale(1 + sq * 0.15, 1 - sq * 0.15);
        const dip = e.headDip || 0, mouth = e.mouth || 0;
        const body = flash ? '#ff8a7a' : '#c8322a';
        ctx.fillStyle = '#a3241e';
        ctx.beginPath(); ctx.moveTo(-40, -30); ctx.quadraticCurveTo(-80, -22 + Math.sin(time * 3) * 6, -72, -54); ctx.lineTo(-62, -42); ctx.quadraticCurveTo(-60, -28, -36, -18); ctx.fill();
        ctx.fillStyle = '#f3ead8'; ctx.beginPath(); ctx.moveTo(-76, -50); ctx.lineTo(-72, -66); ctx.lineTo(-64, -50); ctx.fill();
        ctx.save(); ctx.translate(-14, -66); ctx.rotate(-0.3 + Math.sin(time * 4) * 0.15);
        ctx.fillStyle = '#7a1a16';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-34, -40); ctx.lineTo(-12, -32); ctx.lineTo(2, -48); ctx.lineTo(14, -26); ctx.lineTo(20, 0); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#8a1d18'; rr(ctx, -32, -26, 19, 26, 7); ctx.fill(); rr(ctx, 12, -26, 19, 26, 7); ctx.fill();
        ctx.fillStyle = '#f3ead8';
        for (const lx of [-28, 16]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(lx + i * 5, -2); ctx.lineTo(lx + 2 + i * 5, 2); ctx.lineTo(lx + 4 + i * 5, -2); ctx.fill(); }
        ctx.fillStyle = '#8a1d18'; ellipse(ctx, -6, -42, 45, 31); ctx.fill();
        ctx.fillStyle = body; ellipse(ctx, -8, -46, 41, 27); ctx.fill();
        ctx.fillStyle = '#f2c14e'; ellipse(ctx, 10, -36, 21, 22); ctx.fill();
        ctx.strokeStyle = '#d19a2a'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-6, -52 + i * 9); ctx.quadraticCurveTo(10, -48 + i * 9, 27, -52 + i * 9); ctx.stroke(); }
        ctx.fillStyle = '#f3ead8';
        for (let i = 0; i < 4; i++) {
          const x = -40 + i * 14, o = Math.abs(i - 1.5) * 3;
          ctx.beginPath(); ctx.moveTo(x, -68 + o); ctx.lineTo(x + 6, -82 + o); ctx.lineTo(x + 12, -68 + o); ctx.fill();
        }
        const hx = 40, hy = -76 + dip * 34;
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.moveTo(14, -62); ctx.quadraticCurveTo(30, hy - 4, hx, hy); ctx.lineTo(hx + 4, hy + 18); ctx.quadraticCurveTo(28, -36, 18, -34); ctx.fill();
        ctx.save(); ctx.translate(hx, hy);
        ctx.fillStyle = '#f3ead8';
        ctx.beginPath(); ctx.moveTo(-6, -6); ctx.quadraticCurveTo(-16, -24, -24, -22); ctx.quadraticCurveTo(-12, -14, 0, -2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(2, -10); ctx.quadraticCurveTo(-2, -28, -10, -30); ctx.quadraticCurveTo(-2, -20, 8, -6); ctx.fill();
        ctx.fillStyle = body; ellipse(ctx, 6, 4, 20, 15); ctx.fill();
        ctx.fillStyle = '#b02a22'; rr(ctx, 6, 0, 30, 13, 6); ctx.fill();
        ctx.save(); ctx.translate(8, 11); ctx.rotate(mouth * 0.5);
        ctx.fillStyle = '#9c231c'; rr(ctx, 0, 0, 26, 7, 3); ctx.fill();
        ctx.restore();
        if (mouth > 0.1) { ctx.fillStyle = `rgba(255,170,40,${mouth})`; circle(ctx, 34, 13, 8); ctx.fill(); }
        ctx.fillStyle = '#ffe27a'; ellipse(ctx, 8, -2, 5.5, 4.5); ctx.fill();
        ctx.fillStyle = '#1b1b24'; ellipse(ctx, 9, -2, 1.5, 3.6); ctx.fill();
        ctx.strokeStyle = '#5a120e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(15, -5); ctx.stroke();
        ctx.fillStyle = '#5a120e'; circle(ctx, 32, 4, 1.8); ctx.fill();
        ctx.restore();
        break;
      }
    }
  }

  function drawShot(ctx, e, time) {
    switch (e.kind) {
      case 'stinger': {
        ctx.translate(0, -e.h / 2); ctx.rotate(Math.atan2(e.vy, e.vx));
        ctx.fillStyle = '#4f9a33';
        ctx.beginPath(); ctx.moveTo(11, 0); ctx.quadraticCurveTo(0, -8, -9, 0); ctx.quadraticCurveTo(0, 8, 11, 0); ctx.fill();
        ctx.fillStyle = '#9ff07a'; ellipse(ctx, -1, -2, 4, 2); ctx.fill();
        break;
      }
      case 'snowball': {
        ctx.translate(0, -e.h / 2);
        ctx.fillStyle = '#ffffff'; circle(ctx, 0, 0, 11); ctx.fill();
        ctx.fillStyle = '#d4e6f7'; ctx.beginPath(); ctx.arc(0, 0, 11, 0.2, 2.6); ctx.arc(-2, -2, 8, 2.6, 0.2, true); ctx.fill();
        break;
      }
      case 'icicle': {
        if (e.warn > 0) {
          ctx.save();
          ctx.translate(0, G.lvl.gy * T - (e.y + e.h));
          ctx.fillStyle = `rgba(40,70,120,${0.25 + 0.2 * Math.sin(time * 20)})`; ellipse(ctx, 0, 0, 15, 4); ctx.fill();
          ctx.restore();
          ctx.translate(Math.sin(time * 50) * 1.5, 0);
        }
        ctx.fillStyle = '#9fd6f5';
        ctx.beginPath(); ctx.moveTo(-9, -e.h); ctx.lineTo(9, -e.h); ctx.lineTo(0, 0); ctx.fill();
        ctx.fillStyle = '#e9f8ff';
        ctx.beginPath(); ctx.moveTo(-6, -e.h); ctx.lineTo(-1, -e.h); ctx.lineTo(-1, -6); ctx.fill();
        break;
      }
      case 'rock': {
        ctx.translate(0, -e.h / 2); ctx.rotate(e.rot);
        ctx.fillStyle = '#5b3a24';
        ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-3, -8); ctx.lineTo(6, -7); ctx.lineTo(8, 2); ctx.lineTo(2, 8); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8a5a3b'; circle(ctx, -1, -2, 3.5); ctx.fill();
        break;
      }
      case 'wave': {
        const k = 0.85 + Math.sin(time * 30) * 0.15;
        ctx.fillStyle = '#7e5130';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 17 * k, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#c58b56';
        ctx.beginPath(); ctx.ellipse(-(e.dir || 1) * 3, 0, 9, 11 * k, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(232,220,192,0.8)';
        for (let i = 0; i < 3; i++) { circle(ctx, -(e.dir || 1) * (10 + i * 7), -3 - (i % 2) * 4, 3 - i * 0.6); ctx.fill(); }
        break;
      }
      case 'sonic': {
        ctx.translate(0, -e.h / 2);
        const pulse = 1 + Math.sin(time * 25) * 0.12;
        ctx.strokeStyle = 'rgba(255,95,162,0.9)'; ctx.lineWidth = 3.5;
        circle(ctx, 0, 0, 11 * pulse); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,240,0.8)'; ctx.lineWidth = 2;
        circle(ctx, 0, 0, 6 * pulse); ctx.stroke();
        break;
      }
      case 'puddle': {
        const a = Math.min(1, e.life / 0.5);
        ctx.globalAlpha *= a;
        ctx.fillStyle = '#4f9a33'; ellipse(ctx, 0, -3, 21, 5); ctx.fill();
        ctx.fillStyle = '#7ed957'; ellipse(ctx, -2, -4, 15, 3); ctx.fill();
        ctx.fillStyle = '#c8ffb0';
        for (let i = 0; i < 2; i++) { const ph = (time * 1.5 + i * 0.5) % 1; circle(ctx, -8 + i * 14, -5 - ph * 8, 2 * (1 - ph) + 0.5); ctx.fill(); }
        break;
      }
      case 'bigsnow': {
        ctx.translate(0, -e.h / 2);
        ctx.fillStyle = '#ffffff'; circle(ctx, 0, 0, 24); ctx.fill();
        ctx.fillStyle = '#d4e6f7'; ctx.beginPath(); ctx.arc(0, 0, 24, 0.3, 2.5); ctx.arc(-4, -4, 18, 2.5, 0.3, true); ctx.fill();
        ctx.save(); ctx.rotate(e.rot);
        ctx.strokeStyle = '#c4d8ec'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0.4, 1.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 9, 3.4, 4.6); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'ember': {
        ctx.translate(0, -e.h / 2);
        ctx.fillStyle = 'rgba(255,120,30,0.3)'; circle(ctx, 0, 0, 11); ctx.fill();
        ctx.fillStyle = '#e8401c';
        ctx.beginPath(); ctx.moveTo(0, 9); ctx.quadraticCurveTo(-8, 0, -4, -8); ctx.quadraticCurveTo(0, -3, 4, -8); ctx.quadraticCurveTo(8, 0, 0, 9); ctx.fill();
        ctx.fillStyle = '#ffe27a'; circle(ctx, 0, 3, 3); ctx.fill();
        break;
      }
      case 'geyser': {
        if (e.warn > 0) {
          const a = 0.4 + 0.4 * Math.sin(time * 25);
          ctx.fillStyle = `rgba(255,120,30,${a})`; ellipse(ctx, 0, -2, 16, 5); ctx.fill();
          ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-12, -1); ctx.lineTo(-4, -4); ctx.lineTo(3, 0); ctx.lineTo(11, -3); ctx.stroke();
          break;
        }
        const grow = Math.min(1, (0.7 - e.life) / 0.1);
        const hgt = e.h * grow;
        const fl = Math.sin(time * 40) * 3;
        ctx.fillStyle = 'rgba(255,120,30,0.3)'; rr(ctx, -20, -hgt - 6, 40, hgt + 6, 16); ctx.fill();
        ctx.fillStyle = '#e8401c';
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-16 + fl, -hgt * 0.6, -4, -hgt); ctx.quadraticCurveTo(0, -hgt - 10, 4, -hgt); ctx.quadraticCurveTo(16 - fl, -hgt * 0.6, 14, 0); ctx.fill();
        ctx.fillStyle = '#ffb02e'; rr(ctx, -7, -hgt * 0.85, 14, hgt * 0.85, 7); ctx.fill();
        ctx.fillStyle = '#ffe27a'; rr(ctx, -3, -hgt * 0.6, 6, hgt * 0.6, 3); ctx.fill();
        break;
      }
      case 'goo': {
        ctx.translate(0, -e.h / 2);
        ctx.fillStyle = '#5a2a8a'; circle(ctx, 0, 0, 9); ctx.fill();
        ctx.fillStyle = '#9b5ae0'; circle(ctx, -1, -1, 7.5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ellipse(ctx, -3, -4, 3, 2, -0.5); ctx.fill();
        break;
      }
      case 'flame': {
        ctx.translate(0, -e.h / 2); ctx.scale(e.dir || 1, 1);
        const fl = Math.sin(time * 30) * 2;
        ctx.fillStyle = 'rgba(255,120,30,0.3)'; ellipse(ctx, 0, 0, 22, 14); ctx.fill();
        ctx.fillStyle = '#e8401c';
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.quadraticCurveTo(10, -11, -6, -9 - fl); ctx.quadraticCurveTo(-20, -4, -22, 0); ctx.quadraticCurveTo(-20, 4, -6, 9 + fl); ctx.quadraticCurveTo(10, 11, 18, 0); ctx.fill();
        ctx.fillStyle = '#ffb02e'; ellipse(ctx, 4, 0, 11, 6); ctx.fill();
        ctx.fillStyle = '#ffe27a'; ellipse(ctx, 8, 0, 5, 3); ctx.fill();
        break;
      }
    }
  }

  function drawEnemy(ctx, e, time) {
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h);
    if (e.flipped) { ctx.translate(0, -e.h / 2); ctx.rotate(e.spin || Math.PI); ctx.translate(0, e.h / 2); }
    if (e.hitFlash > 0 && Math.floor(time * 24) % 2 === 0) ctx.globalAlpha = 0.45;
    const look = e.dir || 1;
    switch (e.type) {
      case 'slime': {
        const sq = e.squashed ? 0.3 : 1 + Math.sin(time * 9 + e.x * 0.1) * 0.07;
        ctx.scale(1 / Math.sqrt(sq), sq);
        ctx.fillStyle = '#2e8a32';
        ctx.beginPath(); ctx.moveTo(-15, 0); ctx.bezierCurveTo(-16, -30, 16, -30, 15, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5fd35a';
        ctx.beginPath(); ctx.moveTo(-13, -1.5); ctx.bezierCurveTo(-14, -27, 14, -27, 13, -1.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ellipse(ctx, -5, -15, 3.5, 2.2, -0.5); ctx.fill();
        if (!e.squashed) eyes(ctx, look * 3, -11, 3.2, look, 9);
        break;
      }
      case 'beetle': {
        if (e.shell) {
          const spin = e.vx !== 0 ? time * 30 : 0;
          ctx.fillStyle = '#4a2a8a';
          ctx.beginPath(); ctx.ellipse(0, -2, 15, 14, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#8a5ae0';
          ctx.beginPath(); ctx.ellipse(0, -3, 13.5, 12.5, 0, Math.PI, 0); ctx.fill();
          ctx.strokeStyle = '#4a2a8a'; ctx.lineWidth = 1.6;
          for (let i = 0; i < 3; i++) { const a = Math.PI + ((spin + i * 1.05) % Math.PI); ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(Math.cos(a) * 13, -3 + Math.sin(a) * 12); ctx.stroke(); }
          ctx.fillStyle = '#e8dfff'; ctx.fillRect(-15, -4, 30, 4);
          if (e.vx === 0 && e.wake < 2) { ctx.translate(Math.sin(time * 40) * 1, 0); eyes(ctx, 0, -6, 2.4, 0, 8); }
          break;
        }
        const st = Math.sin(time * 12) * 2;
        ctx.strokeStyle = '#2b1a4a'; ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 7, -4); ctx.lineTo(i * 7 + (i % 2 ? st : -st), 0); ctx.stroke(); }
        ctx.fillStyle = '#4a2a8a';
        ctx.beginPath(); ctx.ellipse(-2 * look, -10, 14, 12, 0, Math.PI, 0); ctx.lineTo(12 - 2 * look, -3); ctx.lineTo(-16 - 2 * look, -3); ctx.fill();
        ctx.fillStyle = '#8a5ae0';
        ctx.beginPath(); ctx.ellipse(-2 * look, -10, 12.5, 10.5, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#b48cff'; ellipse(ctx, -6 * look, -16, 4, 2.4, -0.4 * look); ctx.fill();
        ctx.fillStyle = '#2b1a4a'; circle(ctx, 11 * look, -10, 7); ctx.fill();
        ctx.strokeStyle = '#2b1a4a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(13 * look, -15); ctx.quadraticCurveTo(16 * look, -24, 20 * look, -22); ctx.stroke();
        ctx.fillStyle = '#ffffff'; circle(ctx, 13 * look, -11, 2.4); ctx.fill();
        ctx.fillStyle = '#000'; circle(ctx, 14 * look, -11, 1.2); ctx.fill();
        break;
      }
      case 'hedgehog': {
        const st = Math.sin(time * 10) * 1.5;
        ctx.fillStyle = '#5b3a24'; rr(ctx, -10 + st, -5, 6, 5, 2); ctx.fill(); rr(ctx, 4 - st, -5, 6, 5, 2); ctx.fill();
        ctx.fillStyle = '#4a4f5c';
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + 0.15 + (i / 8) * (Math.PI - 0.6);
          const a2 = a - look * 0.25;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.22) * 12 - look * 2, -10 + Math.sin(a - 0.22) * 11);
          ctx.lineTo(Math.cos(a2) * 22 - look * 2, -10 + Math.sin(a2) * 19);
          ctx.lineTo(Math.cos(a + 0.22) * 12 - look * 2, -10 + Math.sin(a + 0.22) * 11);
          ctx.fill();
        }
        ctx.fillStyle = '#8a5a3b'; ellipse(ctx, 0, -10, 14, 10); ctx.fill();
        ctx.fillStyle = '#e8c39a'; ellipse(ctx, 9 * look, -8, 7, 6); ctx.fill();
        ctx.fillStyle = '#1b1b24'; circle(ctx, 15 * look, -9, 2.2); ctx.fill();
        ctx.fillStyle = '#1b1b24'; circle(ctx, 8 * look, -12, 1.8); ctx.fill();
        ctx.fillStyle = '#ff9aa8'; ellipse(ctx, 6 * look, -7, 2, 1.2); ctx.fill();
        break;
      }
      case 'bat': {
        const f = Math.sin(time * 18 + e.x) * 0.8;
        ctx.translate(0, -e.h / 2);
        ctx.fillStyle = '#4b2a6e';
        for (const s of [-1, 1]) {
          ctx.save(); ctx.scale(s, 1); ctx.rotate(f * 0.6);
          ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(20, -10); ctx.lineTo(18, -2); ctx.lineTo(22, 2); ctx.lineTo(14, 2); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#6a3d97'; circle(ctx, 0, 0, 8.5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-5, -13); ctx.lineTo(-1, -7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(6, -5); ctx.lineTo(5, -13); ctx.lineTo(1, -7); ctx.fill();
        ctx.fillStyle = '#ffd34d'; circle(ctx, -3, -1, 2.2); ctx.fill(); circle(ctx, 3, -1, 2.2); ctx.fill();
        ctx.fillStyle = '#1b1b24'; circle(ctx, -3 + look * 0.6, -1, 1); ctx.fill(); circle(ctx, 3 + look * 0.6, -1, 1); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-2.5, 4); ctx.lineTo(-1.5, 7); ctx.lineTo(-0.5, 4); ctx.moveTo(0.5, 4); ctx.lineTo(1.5, 7); ctx.lineTo(2.5, 4); ctx.fill();
        break;
      }
      case 'frog': {
        const air = !e.onGround;
        const sq = e.crouch > 0 ? 0.8 : 1;
        ctx.scale(1 / Math.sqrt(sq), sq);
        ctx.fillStyle = '#1f7a5e';
        if (air) { rr(ctx, -16 * look, -8, 10, 5, 2.5); ctx.fill(); }
        else { ellipse(ctx, -9, -3, 7, 4); ctx.fill(); ellipse(ctx, 9, -3, 7, 4); ctx.fill(); }
        ctx.fillStyle = '#2fb38a'; ellipse(ctx, 0, -11, 14, 10); ctx.fill();
        ctx.fillStyle = '#bff2d9'; ellipse(ctx, 2 * look, -7, 8, 5); ctx.fill();
        ctx.fillStyle = '#2fb38a'; circle(ctx, -6, -20, 5.5); ctx.fill(); circle(ctx, 6, -20, 5.5); ctx.fill();
        eyes(ctx, 0, -20.5, 3.4, look, 12);
        ctx.strokeStyle = '#145c45'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-5, -11); ctx.quadraticCurveTo(0 + look * 2, -8, 7, -11); ctx.stroke();
        ctx.fillStyle = 'rgba(255,140,170,0.6)'; circle(ctx, -9, -12, 2); ctx.fill(); circle(ctx, 9, -12, 2); ctx.fill();
        break;
      }
      case 'ball': {
        ctx.translate(0, -e.h / 2);
        ctx.fillStyle = '#1d1f27'; circle(ctx, 0, 0, 13); ctx.fill();
        ctx.fillStyle = '#4a4f5e'; ellipse(ctx, -4, -6, 5, 3, -0.6); ctx.fill();
        ctx.fillStyle = '#ffffff'; ellipse(ctx, 4 * look, -2, 3.2, 4); ctx.fill(); ellipse(ctx, 10 * look, -2, 2.6, 3.6); ctx.fill();
        ctx.fillStyle = '#1d1f27'; circle(ctx, 5 * look, -1, 1.6); ctx.fill(); circle(ctx, 10.5 * look, -1, 1.4); ctx.fill();
        ctx.strokeStyle = '#1d1f27'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(1 * look, -8); ctx.lineTo(8 * look, -5); ctx.lineTo(13 * look, -7); ctx.stroke();
        break;
      }
      case 'lavaball': {
        if (e.y + e.h > e.baseY + 20 && e.vy > 0) break;
        ctx.translate(0, -e.h / 2);
        if (e.vy > 0) ctx.rotate(Math.PI);
        ctx.fillStyle = 'rgba(255,120,30,0.3)'; circle(ctx, 0, 2, 17); ctx.fill();
        const fl = Math.sin(time * 20) * 2;
        ctx.fillStyle = '#e8401c';
        ctx.beginPath(); ctx.moveTo(-11, 2); ctx.quadraticCurveTo(-12, 18 + fl, 0, 22); ctx.quadraticCurveTo(12, 18 - fl, 11, 2); ctx.arc(0, 2, 11, 0, Math.PI, true); ctx.fill();
        ctx.fillStyle = '#ff9a2a'; circle(ctx, 0, 1, 9); ctx.fill();
        ctx.fillStyle = '#ffe27a'; circle(ctx, -2, -2, 4.5); ctx.fill();
        ctx.fillStyle = '#5a1206'; circle(ctx, -3.5, 0, 1.6); ctx.fill(); circle(ctx, 3.5, 0, 1.6); ctx.fill();
        break;
      }
      case 'stomper': {
        const w = e.w, h = e.h;
        ctx.translate(e.shake ? Math.sin(time * 80) * 1.5 : 0, 0);
        ctx.fillStyle = '#4a5260'; rr(ctx, -w / 2, -h, w, h - 6, 6); ctx.fill();
        ctx.fillStyle = '#7a8496'; rr(ctx, -w / 2 + 3, -h + 3, w - 6, h - 14, 5); ctx.fill();
        ctx.fillStyle = '#9aa4b6'; ctx.fillRect(-w / 2 + 6, -h + 5, w - 12, 3);
        ctx.fillStyle = '#4a5260';
        for (let i = 0; i < 5; i++) { const x = -w / 2 + 4 + i * ((w - 8) / 4); ctx.beginPath(); ctx.moveTo(x - 5, -6); ctx.lineTo(x, 0); ctx.lineTo(x + 5, -6); ctx.fill(); }
        for (const [x, y] of [[-w / 2 + 7, -h + 12], [w / 2 - 7, -h + 12], [-w / 2 + 7, -14], [w / 2 - 7, -14]]) { ctx.fillStyle = '#525b6b'; circle(ctx, x, y, 2); ctx.fill(); }
        const ly = e.state === 'idle' ? 0 : 2;
        ctx.fillStyle = '#ffffff'; rr(ctx, -15, -h / 2 - 8, 11, 10, 3); ctx.fill(); rr(ctx, 4, -h / 2 - 8, 11, 10, 3); ctx.fill();
        ctx.fillStyle = '#1b1b24'; circle(ctx, -9.5, -h / 2 - 3 + ly, 2.6); ctx.fill(); circle(ctx, 9.5, -h / 2 - 3 + ly, 2.6); ctx.fill();
        ctx.strokeStyle = '#1b1b24'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-17, -h / 2 - 13); ctx.lineTo(-4, -h / 2 - 9); ctx.moveTo(17, -h / 2 - 13); ctx.lineTo(4, -h / 2 - 9); ctx.stroke();
        ctx.fillStyle = '#1b1b24'; rr(ctx, -10, -h / 2 + 6, 20, 5, 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) ctx.fillRect(-9 + i * 5, -h / 2 + 6, 3, 2);
        break;
      }
      case 'shot': drawShot(ctx, e, time); break;
      case 'boss': {
        if (e.kind && e.kind !== 'slime') { drawBoss(ctx, e, time); break; }
        if (e.state === 'hang' || e.state === 'slam') {
          // Schatten des Mega-Sprungs am Boden
          ctx.save();
          ctx.translate(0, e.groundY - (e.y + e.h));
          const k = e.state === 'slam' ? 1 : 0.6 + 0.2 * Math.sin(time * 12);
          ctx.fillStyle = 'rgba(40,20,70,0.35)'; ellipse(ctx, 0, -3, 50 * k, 9 * k); ctx.fill();
          ctx.restore();
        }
        const sq = e.squash || 0;
        ctx.scale(1 + sq * 0.2, 1 - sq * 0.2);
        const hw = e.w / 2 + 4, hh = e.h;
        ctx.fillStyle = '#5a2a8a';
        ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.bezierCurveTo(-hw - 4, -hh * 1.25, hw + 4, -hh * 1.25, hw, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = e.hitFlash > 0 ? '#ff8ab0' : '#9b5ae0';
        ctx.beginPath(); ctx.moveTo(-hw + 4, -3); ctx.bezierCurveTo(-hw, -hh * 1.17, hw, -hh * 1.17, hw - 4, -3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ellipse(ctx, -hw * 0.45, -hh * 0.62, 10, 6, -0.6); ctx.fill();
        // Krone
        ctx.save(); ctx.translate(0, -hh * 0.9);
        ctx.fillStyle = '#ffcf33';
        ctx.beginPath(); ctx.moveTo(-22, 4); ctx.lineTo(-24, -14); ctx.lineTo(-12, -4); ctx.lineTo(0, -20); ctx.lineTo(12, -4); ctx.lineTo(24, -14); ctx.lineTo(22, 4); ctx.fill();
        ctx.fillStyle = '#e8402a'; circle(ctx, 0, -4, 3.5); ctx.fill();
        ctx.fillStyle = '#4cc3ff'; circle(ctx, -14, -1, 2.5); ctx.fill(); circle(ctx, 14, -1, 2.5); ctx.fill();
        ctx.restore();
        const lk = e.look || 0;
        eyes(ctx, lk * 6, -hh * 0.55, 8, lk, 28, true);
        ctx.fillStyle = '#3a1660';
        ctx.beginPath(); ctx.ellipse(lk * 6, -hh * 0.27, 18, e.state === 'jump' ? 10 : 6, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(lk * 6 - 14 + i * 8, -hh * 0.27); ctx.lineTo(lk * 6 - 10 + i * 8, -hh * 0.27 + 5); ctx.lineTo(lk * 6 - 6 + i * 8, -hh * 0.27); ctx.fill(); }
        break;
      }
    }
    ctx.restore();
  }

  // ---- Gegenstände --------------------------------------------------------------
  function drawCoinShape(ctx, x, y, time, scale = 1) {
    const sx = Math.abs(Math.cos(time * 4 + x * 0.05));
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.15, sx) * scale, scale);
    ctx.fillStyle = '#b97a06'; ellipse(ctx, 0, 0, 10, 12); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ellipse(ctx, 0, 0, 8.5, 10.5); ctx.fill();
    ctx.fillStyle = '#ffe98a'; ellipse(ctx, -2, -2, 3.5, 6); ctx.fill();
    ctx.fillStyle = '#d99a10'; ctx.fillRect(-1.2, -5.5, 2.4, 11);
    ctx.restore();
  }

  const GEM_COLORS = [['#ff4f7b', '#ffc2d3', '#b0103d'], ['#3fb6ff', '#c8ecff', '#0f5f9e'], ['#3ee07a', '#c8ffd9', '#11853c']];
  function drawGemShape(ctx, x, y, id, time, ghost = false) {
    const c = GEM_COLORS[id % 3];
    ctx.save(); ctx.translate(x, y + Math.sin(time * 3 + id) * 2.5);
    if (ghost) ctx.globalAlpha = 0.3;
    if (!ghost) { ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.15 * Math.sin(time * 5)})`; circle(ctx, 0, 0, 18); ctx.fill(); }
    ctx.fillStyle = c[2];
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-6, -12); ctx.lineTo(6, -12); ctx.lineTo(12, -4); ctx.lineTo(0, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c[0];
    ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-5, -10); ctx.lineTo(5, -10); ctx.lineTo(10, -4); ctx.lineTo(0, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c[1];
    ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(0, -4); ctx.lineTo(-10, -4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(10, -4); ctx.lineTo(0, 10); ctx.fill();
    ctx.globalAlpha = ghost ? 0.3 : 0.9; ctx.fillStyle = '#fff';
    const tw = (time * 1.5 + id) % 2;
    if (tw < 0.4 && !ghost) { const s = Math.sin(tw / 0.4 * Math.PI) * 5; ctx.fillRect(6 - s / 2, -11, s, 1.2); ctx.fillRect(5.4, -11 - s / 2 + 0.6, 1.2, s); }
    ctx.restore();
  }

  function drawItem(ctx, it, time) {
    const x = it.x + it.w / 2, y = it.y + it.h;
    ctx.save(); ctx.translate(x, y);
    switch (it.type) {
      case 'mushroom':
        ctx.fillStyle = '#f3e3c4'; rr(ctx, -8, -14, 16, 14, 5); ctx.fill();
        ctx.fillStyle = '#1b1b24'; ellipse(ctx, -3, -8, 1.4, 2.6); ctx.fill(); ellipse(ctx, 3, -8, 1.4, 2.6); ctx.fill();
        ctx.fillStyle = '#e8402a'; ctx.beginPath(); ctx.ellipse(0, -13, 14, 13, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#ffffff'; circle(ctx, 0, -20, 4); ctx.fill(); circle(ctx, -9, -15, 3); ctx.fill(); circle(ctx, 9, -15, 3); ctx.fill();
        break;
      case 'flower': {
        ctx.fillStyle = '#3c962a'; ctx.fillRect(-1.5, -14, 3, 14);
        ctx.fillStyle = '#4fb63b'; ellipse(ctx, -6, -6, 6, 3, 0.4); ctx.fill(); ellipse(ctx, 6, -6, 6, 3, -0.4); ctx.fill();
        const pulse = 1 + Math.sin(time * 8) * 0.06;
        ctx.save(); ctx.translate(0, -19); ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ff5a1f'; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + time; circle(ctx, Math.cos(a) * 7, Math.sin(a) * 7, 5); ctx.fill(); }
        ctx.fillStyle = '#ffd23f'; circle(ctx, 0, 0, 6); ctx.fill();
        ctx.fillStyle = '#1b1b24'; ellipse(ctx, -2, -0.5, 1.1, 2); ctx.fill(); ellipse(ctx, 2, -0.5, 1.1, 2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'star': {
        ctx.translate(0, -14); ctx.rotate(Math.sin(time * 6) * 0.15);
        ctx.fillStyle = 'rgba(255,240,140,0.35)'; circle(ctx, 0, 0, 18); ctx.fill();
        ctx.fillStyle = '#ffcf1f';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1b1b24'; ellipse(ctx, -3, -1, 1.3, 2.4); ctx.fill(); ellipse(ctx, 3, -1, 1.3, 2.4); ctx.fill();
        break;
      }
      case 'feather': {
        ctx.translate(0, -15 + Math.sin(time * 3) * 2); ctx.rotate(-0.6 + Math.sin(time * 2) * 0.15);
        ctx.fillStyle = 'rgba(180,230,255,0.4)'; circle(ctx, 0, 0, 17); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.quadraticCurveTo(10, -6, 2, 12); ctx.quadraticCurveTo(-9, -2, 0, -15); ctx.fill();
        ctx.fillStyle = '#7fd0ff';
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.quadraticCurveTo(-8, -3, 1, 9); ctx.quadraticCurveTo(-3, -4, 0, -15); ctx.fill();
        ctx.strokeStyle = '#5a7fa0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(1, 0, 3, 15); ctx.stroke();
        break;
      }
      case 'magnet': {
        ctx.translate(0, -14);
        ctx.fillStyle = 'rgba(255,90,90,0.25)'; circle(ctx, 0, 0, 17 + Math.sin(time * 6) * 2); ctx.fill();
        ctx.lineWidth = 7; ctx.strokeStyle = '#e8402a';
        ctx.beginPath(); ctx.arc(0, 0, 8, Math.PI, 0, true); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-8, -6); ctx.moveTo(8, 0); ctx.lineTo(8, -6); ctx.stroke();
        ctx.fillStyle = '#dfe6ee'; ctx.fillRect(-11.5, -12, 7, 6); ctx.fillRect(4.5, -12, 7, 6);
        break;
      }
      case 'boots': {
        ctx.translate(0, -2);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(-6, -16); ctx.quadraticCurveTo(-18, -22, -16, -10); ctx.quadraticCurveTo(-12, -12, -6, -10); ctx.fill();
        ctx.fillStyle = '#2f7ff0'; rr(ctx, -7, -20, 10, 16, 3); ctx.fill();
        rr(ctx, -7, -9, 20, 8, 4); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-8, -3, 22, 3);
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-1, -17); ctx.lineTo(3, -12); ctx.lineTo(0, -12); ctx.lineTo(3, -7); ctx.lineTo(-3, -13); ctx.lineTo(0, -13); ctx.fill();
        break;
      }
      case 'heart': {
        ctx.translate(0, -14);
        const b = 1 + Math.sin(time * 7) * 0.08;
        ctx.scale(b, b);
        ctx.fillStyle = '#e8203a';
        ctx.beginPath(); ctx.moveTo(0, 11); ctx.bezierCurveTo(-18, -2, -9, -16, 0, -6); ctx.bezierCurveTo(9, -16, 18, -2, 0, 11); ctx.fill();
        ctx.fillStyle = '#ff8a9c'; ellipse(ctx, -6, -5, 3, 2, -0.6); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = '900 8px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('1UP', 0, 3);
        break;
      }
    }
    ctx.restore();
  }

  function drawFireball(ctx, f, time) {
    ctx.save(); ctx.translate(f.x + f.w / 2, f.y + f.h / 2); ctx.rotate(time * 20 * (f.vx > 0 ? 1 : -1));
    ctx.fillStyle = 'rgba(255,140,40,0.35)'; circle(ctx, 0, 0, 11); ctx.fill();
    ctx.fillStyle = '#ff5a1f'; circle(ctx, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; circle(ctx, 2, -1, 4); ctx.fill();
    ctx.fillStyle = '#fff6c4'; circle(ctx, 2.5, -1.5, 1.8); ctx.fill();
    ctx.restore();
  }

  // ---- Objekte ------------------------------------------------------------------
  function drawSpring(ctx, s) {
    const comp = s.comp; // 0..1
    const x = s.x + s.w / 2, base = s.y + s.h;
    const top = base - 22 + comp * 12;
    ctx.save(); ctx.translate(x, 0);
    ctx.fillStyle = '#3a3f4b'; rr(ctx, -14, base - 6, 28, 6, 2); ctx.fill();
    ctx.strokeStyle = '#d8dee8'; ctx.lineWidth = 3;
    ctx.beginPath();
    const n = 4, hgt = base - 6 - (top + 5);
    ctx.moveTo(-9, base - 6);
    for (let i = 1; i <= n; i++) ctx.lineTo(i % 2 ? 9 : -9, base - 6 - (hgt * i) / n);
    ctx.stroke();
    ctx.fillStyle = '#e8402a'; rr(ctx, -15, top - 1, 30, 7, 3); ctx.fill();
    ctx.fillStyle = '#ff8a6a'; ctx.fillRect(-12, top, 24, 2);
    ctx.restore();
  }

  function drawPlatform(ctx, p, theme, time) {
    const th = THEMES[theme];
    let x = p.x, y = p.y;
    if (p.kind === 'fplat' && p.state === 'shake') x += Math.sin(time * 70) * 1.5;
    ctx.save();
    if (p.alpha != null) ctx.globalAlpha = p.alpha;
    if (p.kind === 'fplat') {
      const c = th.bg === 'mountains' ? ['#9fd6f5', '#d9f4ff', '#5fa7d6'] : th.bg === 'castle' ? ['#6a6372', '#8f879a', '#3a3541'] : ['#b98a5a', '#dcb07e', '#7a5530'];
      ctx.fillStyle = c[2]; rr(ctx, x, y, p.w, p.h, 4); ctx.fill();
      ctx.fillStyle = c[0]; rr(ctx, x, y, p.w, p.h - 4, 4); ctx.fill();
      ctx.fillStyle = c[1]; ctx.fillRect(x + 3, y + 2, p.w - 6, 2.5);
      ctx.strokeStyle = c[2]; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 1; i < p.w / T; i++) { const cx = x + i * T; ctx.moveTo(cx, y); ctx.lineTo(cx - 4, y + 6); ctx.lineTo(cx + 2, y + p.h - 4); }
      ctx.stroke();
    } else {
      if (th.oneway === 'cloud') {
        ctx.fillStyle = '#f2c94c'; rr(ctx, x, y + 4, p.w, p.h - 4, 6); ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i <= p.w / 12; i++) { circle(ctx, x + 6 + i * 12, y + 4, 6.5); ctx.fill(); }
      } else {
        ctx.fillStyle = '#3d4350'; rr(ctx, x, y, p.w, p.h, 4); ctx.fill();
        ctx.fillStyle = '#8b95a7'; rr(ctx, x + 1, y + 1, p.w - 2, p.h - 5, 3); ctx.fill();
        ctx.fillStyle = '#c3cad6'; ctx.fillRect(x + 4, y + 2, p.w - 8, 2);
        ctx.fillStyle = '#ffcf33';
        for (let i = 0; i < p.w - 12; i += 16) { ctx.beginPath(); ctx.moveTo(x + 8 + i, y + p.h - 4); ctx.lineTo(x + 14 + i, y + 5); ctx.lineTo(x + 18 + i, y + 5); ctx.lineTo(x + 12 + i, y + p.h - 4); ctx.fill(); }
        ctx.fillStyle = '#3d4350'; circle(ctx, x + 5, y + 7, 1.6); ctx.fill(); circle(ctx, x + p.w - 5, y + 7, 1.6); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawCheckpoint(ctx, c, time) {
    const x = c.x, base = c.y;
    ctx.save(); ctx.translate(x, base);
    ctx.fillStyle = '#5b6470'; rr(ctx, -6, -6, 12, 6, 2); ctx.fill();
    ctx.fillStyle = '#c9d2dc'; ctx.fillRect(-1.5, -52, 3, 46);
    ctx.fillStyle = '#ffd23f'; circle(ctx, 0, -54, 3.5); ctx.fill();
    const wave = Math.sin(time * 6) * 2;
    ctx.fillStyle = c.active ? '#3ee07a' : '#9aa3ad';
    ctx.beginPath(); ctx.moveTo(1.5, -50); ctx.quadraticCurveTo(12, -48 + wave, 22, -44 + wave); ctx.lineTo(1.5, -36); ctx.fill();
    if (c.active) { ctx.fillStyle = '#ffffff'; circle(ctx, 9, -44, 2.2); ctx.fill(); }
    ctx.restore();
  }

  function drawFlag(ctx, f, time) {
    if (f.hidden) return;
    ctx.save();
    if (f.appear < 1) ctx.globalAlpha = f.appear;
    const x = f.x, top = f.top, base = f.bottom;
    ctx.fillStyle = '#4a5260'; rr(ctx, x - 10, base - 10, 20, 10, 3); ctx.fill();
    ctx.fillStyle = '#e9edf2'; ctx.fillRect(x - 2.5, top, 5, base - top - 10);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2.5, top, 1.5, base - top - 10);
    ctx.fillStyle = '#ffcf33'; circle(ctx, x, top - 4, 6.5); ctx.fill();
    ctx.fillStyle = '#fff2b0'; circle(ctx, x - 2, top - 6, 2); ctx.fill();
    const fy = f.clothY;
    const w1 = Math.sin(time * 6) * 3, w2 = Math.sin(time * 6 + 1.5) * 3;
    ctx.fillStyle = '#2fbf5f';
    ctx.beginPath(); ctx.moveTo(x - 2.5, fy); ctx.quadraticCurveTo(x - 22, fy + 6 + w1, x - 44, fy + 14 + w2); ctx.lineTo(x - 2.5, fy + 30); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const cx = x - 16, cy = fy + 14;
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.5 : 6, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.fill();
    ctx.restore();
  }

  return {
    setScale, resetCache, drawTiles, drawBackground, drawWeather, drawDecor, drawHint,
    drawPlayer, drawEnemy, drawItem, drawCoinShape, drawGemShape, drawFireball,
    drawSpring, drawPlatform, drawCheckpoint, drawFlag, rr, circle, ellipse,
  };
})();

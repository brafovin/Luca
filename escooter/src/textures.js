import * as THREE from 'three';
import { mulberry32 } from './util.js';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function mk(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

/** Tileable value noise table for blotchy variation. */
function blotch(size, cells, rnd) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(y0 % cells) * cells + (x0 % cells)], b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
    const c = g[((y0 + 1) % cells) * cells + (x0 % cells)], d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function noiseFill(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const c = fn(x, y);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function asphalt(rnd) {
  const S = 512;
  const c = cv(S, S), x = c.getContext('2d');
  const b1 = blotch(S, 8, rnd), b2 = blotch(S, 32, rnd);
  noiseFill(x, S, S, (px, py) => {
    let v = 66 + (b1(px, py) - 0.5) * 16 + (b2(px, py) - 0.5) * 10 + (rnd() - 0.5) * 34;
    if (rnd() > 0.985) v += 38 + rnd() * 40; // light aggregate
    if (rnd() < 0.01) v -= 22;
    return [v, v + 1, v + 3];
  });
  // hairline cracks
  x.strokeStyle = 'rgba(20,20,22,0.55)';
  x.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    let px = rnd() * S, py = rnd() * S;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 14; k++) { px += (rnd() - 0.5) * 26; py += (rnd() - 0.2) * 22; x.lineTo(px, py); }
    x.stroke();
  }
  return c;
}

function pavers(rnd) {
  const S = 512, N = 4, cell = S / N;
  const c = cv(S, S), x = c.getContext('2d');
  const b = blotch(S, 16, rnd);
  noiseFill(x, S, S, (px, py) => {
    const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    const lx = px % cell, ly = py % cell;
    const joint = lx < 2.5 || ly < 2.5;
    // per-paver tone derived from cell index
    const k = Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453; const tone = (k - Math.floor(k)) * 26 - 13;
    let v = (joint ? 108 : 176 + tone) + (rnd() - 0.5) * 16 + (b(px, py) - 0.5) * 12;
    return [v, v - 2, v - 6];
  });
  return c;
}

function grass(rnd) {
  const S = 512;
  const c = cv(S, S), x = c.getContext('2d');
  const b = blotch(S, 6, rnd), b2 = blotch(S, 32, rnd);
  noiseFill(x, S, S, (px, py) => {
    const k = b(px, py), j = (rnd() - 0.5) * 30 + (b2(px, py) - 0.5) * 22;
    return [58 + k * 30 + j * 0.6, 98 + k * 34 + j, 40 + k * 14 + j * 0.4];
  });
  x.lineWidth = 1;
  for (let i = 0; i < 1600; i++) {
    const px = rnd() * S, py = rnd() * S, l = 3 + rnd() * 5;
    x.strokeStyle = rnd() > 0.5 ? 'rgba(120,170,70,0.45)' : 'rgba(30,70,25,0.45)';
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 3, py - l); x.stroke();
  }
  return c;
}

function roofTiles(rnd) {
  const S = 512, rows = 8, cols = 8, th = S / rows, tw = S / cols;
  const c = cv(S, S), x = c.getContext('2d');
  x.fillStyle = hex(150, 150, 150); x.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols + 1; k++) {
      const ox = k * tw - (r % 2 ? tw / 2 : 0);
      const tone = 190 + rnd() * 55;
      x.fillStyle = hex(tone, tone, tone);
      x.fillRect(ox + 1.5, r * th, tw - 3, th);
      const g = x.createLinearGradient(0, r * th, 0, (r + 1) * th);
      g.addColorStop(0, 'rgba(255,255,255,0.0)');
      g.addColorStop(0.75, 'rgba(0,0,0,0.0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      x.fillStyle = g; x.fillRect(ox + 1.5, r * th, tw - 3, th);
      // center rib
      x.fillStyle = 'rgba(255,255,255,0.10)';
      x.fillRect(ox + tw / 2 - 3, r * th, 6, th);
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(ox + 1.5, r * th, 2, th);
    }
  }
  return c;
}

function leaves(rnd) {
  const S = 256;
  const c = cv(S, S), x = c.getContext('2d');
  x.fillStyle = hex(190, 190, 190); x.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) {
    const px = rnd() * S, py = rnd() * S, r = 2 + rnd() * 4;
    const t = 120 + rnd() * 135;
    x.fillStyle = hex(t, t, t);
    x.save(); x.translate(px, py); x.rotate(rnd() * 6.28);
    x.beginPath(); x.ellipse(0, 0, r, r * 0.55, 0, 0, 6.28); x.fill();
    x.restore();
    // wrap
    if (px < 8) { x.fillRect(px + S, py, 3, 3); }
  }
  return c;
}

function gripTex() {
  const S = 128;
  const c = cv(S, S), x = c.getContext('2d');
  x.fillStyle = '#1b1c1e'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#2f3134'; x.lineWidth = 5;
  for (let i = -S; i < S * 2; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); }
  x.strokeStyle = '#0c0c0d'; x.lineWidth = 2;
  for (let i = -S; i < S * 2; i += 16) { x.beginPath(); x.moveTo(i + 8, 0); x.lineTo(i + S + 8, S); x.stroke(); }
  return c;
}

function glow() {
  const S = 128;
  const c = cv(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return c;
}
function pool() {
  const S = 128;
  const c = cv(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return c;
}
function beam() {
  const c = cv(4, 256), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  return c;
}

/* ---------- facades ----------
   Texture = 4x4 window cells of 192px (3.2 m). Three layers: albedo, ORM (G=roughness, B=metal), emissive */
const CELL = 192;
function facade(kind, rnd) {
  const W = CELL * 4;
  const m = cv(W, W), o = cv(W, W), e = cv(W, W), bm = cv(W, W);
  const mx = m.getContext('2d'), ox = o.getContext('2d'), ex = e.getContext('2d'), bx = bm.getContext('2d');
  bx.fillStyle = 'rgb(140,140,140)'; bx.fillRect(0, 0, W, W);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, W);
  const orm = (g, b) => `rgb(255,${g},${b})`;

  // base wall
  if (kind === 'plaster') {
    mx.fillStyle = hex(240, 238, 232);
    mx.fillRect(0, 0, W, W);
    const b = blotch(W, 24, rnd);
    noiseFill(mx, W, W, (px, py) => { const v = 232 + (rnd() - 0.5) * 12 + (b(px, py) - 0.5) * 14; return [v, v - 1, v - 4]; });
  } else if (kind === 'brick') {
    mx.fillStyle = '#b9b3a8'; mx.fillRect(0, 0, W, W);
    bx.fillStyle = 'rgb(70,70,70)'; bx.fillRect(0, 0, W, W);
    const bh = 8, bw = 17;
    for (let r = 0; r < W / bh; r++) {
      for (let k = -1; k < W / bw + 1; k++) {
        const x0 = k * bw + (r % 2 ? bw / 2 : 0);
        const t = rnd();
        mx.fillStyle = hex(150 + t * 40, 68 + t * 22, 52 + t * 14);
        mx.fillRect(x0 + 1, r * bh + 1, bw - 2, bh - 2);
        bx.fillStyle = 'rgb(165,165,165)'; bx.fillRect(x0 + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
  } else if (kind === 'panel') {
    mx.fillStyle = hex(206, 203, 196); mx.fillRect(0, 0, W, W);
    const b = blotch(W, 12, rnd);
    noiseFill(mx, W, W, (px, py) => { const v = 202 + (b(px, py) - 0.5) * 22 + (rnd() - 0.5) * 8; return [v, v - 2, v - 6]; });
  } else { // glass tower
    mx.fillStyle = '#31373c'; mx.fillRect(0, 0, W, W);
  }
  ox.fillStyle = orm(kind === 'glass' ? 90 : 225, 0); ox.fillRect(0, 0, W, W);

  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      const X = cx * CELL, Y = cy * CELL;
      const lit = rnd() < 0.4;
      const warm = rnd();
      const emiCol = warm < 0.7 ? hex(255, 214 + rnd() * 30, 150 + rnd() * 50) : warm < 0.85 ? hex(255, 240, 215) : hex(170, 205, 255);
      if (kind === 'glass') {
        // spandrel + pane
        mx.fillStyle = '#262c31'; mx.fillRect(X, Y + CELL * 0.74, CELL, CELL * 0.26);
        ox.fillStyle = orm(110, 120); ox.fillRect(X, Y + CELL * 0.74, CELL, CELL * 0.26);
        const g = mx.createLinearGradient(0, Y, 0, Y + CELL * 0.74);
        g.addColorStop(0, '#7f9fb6'); g.addColorStop(0.5, '#3d5870'); g.addColorStop(1, '#22384b');
        mx.fillStyle = g; mx.fillRect(X + 4, Y + 4, CELL - 8, CELL * 0.74 - 4);
        ox.fillStyle = orm(25, 215); ox.fillRect(X + 4, Y + 4, CELL - 8, CELL * 0.74 - 4);
        // mullions
        mx.fillStyle = '#9aa2a8'; mx.fillRect(X, Y, 4, CELL); mx.fillRect(X + CELL - 4, Y, 4, CELL); mx.fillRect(X, Y, CELL, 4);
        mx.fillRect(X + CELL / 2 - 2, Y, 4, CELL * 0.74);
        ox.fillStyle = orm(70, 200); ox.fillRect(X, Y, 4, CELL); ox.fillRect(X + CELL - 4, Y, 4, CELL); ox.fillRect(X, Y, CELL, 4); ox.fillRect(X + CELL / 2 - 2, Y, 4, CELL * 0.74);
        if (lit) { ex.fillStyle = hex(205, 225, 245); ex.fillRect(X + 6, Y + 6, CELL / 2 - 8, CELL * 0.74 - 8); if (rnd() > 0.4) ex.fillRect(X + CELL / 2 + 4, Y + 6, CELL / 2 - 10, CELL * 0.74 - 8); }
        continue;
      }
      // window geometry in cell
      const wx = X + 55, wy = Y + 34, ww = 82, wh = 104;
      const frame = kind === 'panel' ? '#5a4a3c' : '#f5f4f0';
      // sill
      mx.fillStyle = kind === 'brick' ? '#d8d2c6' : '#c9c6bf';
      mx.fillRect(wx - 7, wy + wh, ww + 14, 9);
      ox.fillStyle = orm(190, 0); ox.fillRect(wx - 7, wy + wh, ww + 14, 9);
      mx.fillStyle = 'rgba(0,0,0,0.18)'; mx.fillRect(wx - 5, wy + wh + 9, ww + 10, 5);
      // lintel for brick
      if (kind === 'brick') { mx.fillStyle = '#d8d2c6'; mx.fillRect(wx - 6, wy - 9, ww + 12, 8); }
      // drip stain
      mx.fillStyle = 'rgba(70,60,50,0.07)'; mx.fillRect(wx + 8, wy + wh + 14, ww - 16, 40);
      // frame
      bx.fillStyle = 'rgb(205,205,205)'; bx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      bx.fillStyle = 'rgb(225,225,225)'; bx.fillRect(wx - 7, wy + wh, ww + 14, 9);
      mx.fillStyle = frame; mx.fillRect(wx, wy, ww, wh);
      ox.fillStyle = orm(120, 20); ox.fillRect(wx, wy, ww, wh);
      // glass (two sashes + transom)
      const gx = wx + 5, gy = wy + 5, gw = ww - 10, gh = wh - 10;
      const g = mx.createLinearGradient(0, gy, 0, gy + gh);
      g.addColorStop(0, '#8fb0c8'); g.addColorStop(0.55, '#3a5368'); g.addColorStop(1, '#1d2d3b');
      bx.fillStyle = 'rgb(70,70,70)'; bx.fillRect(gx, gy, gw, gh);
      bx.fillStyle = 'rgb(205,205,205)'; bx.fillRect(gx + gw / 2 - 2, gy, 4, gh); bx.fillRect(gx, gy + gh * 0.28, gw, 4);
      mx.fillStyle = g; mx.fillRect(gx, gy, gw, gh);
      ox.fillStyle = orm(26, 170); ox.fillRect(gx, gy, gw, gh);
      mx.fillStyle = frame; mx.fillRect(gx + gw / 2 - 2, gy, 4, gh); mx.fillRect(gx, gy + gh * 0.28, gw, 4);
      ox.fillStyle = orm(120, 20); ox.fillRect(gx + gw / 2 - 2, gy, 4, gh); ox.fillRect(gx, gy + gh * 0.28, gw, 4);
      // some blinds / curtains
      if (rnd() < 0.3) { mx.fillStyle = 'rgba(235,228,210,0.85)'; mx.fillRect(gx, gy, gw, gh * (0.2 + rnd() * 0.5)); }
      if (kind === 'panel' && rnd() < 0.5) { // coloured balcony spandrel
        const cols = ['#c8603c', '#4a8c9c', '#d2b04c', '#7c9c5c'];
        mx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        mx.fillRect(X + 30, Y + CELL - 38, CELL - 60, 30);
      }
      if (lit) {
        ex.fillStyle = emiCol;
        const frac = rnd() < 0.25 ? 0.45 : 1;
        ex.fillRect(gx, gy + gh * (1 - frac), gw / 2 - 2, gh * frac);
        if (rnd() > 0.35) ex.fillRect(gx + gw / 2 + 2, gy + gh * (1 - frac), gw / 2 - 2, gh * frac);
      }
    }
  }
  if (kind === 'panel') { // panel joints
    mx.fillStyle = 'rgba(60,58,54,0.55)';
    for (let i = 0; i <= 4; i++) { mx.fillRect(0, i * CELL - 1, W, 2); mx.fillRect(i * CELL - 1, 0, 2, W); }
  }
  return { m, o, e, b: bm };
}


function signAtlas() {
  const C = 128;
  const c = cv(C * 4, C * 2), x = c.getContext('2d');
  x.clearRect(0, 0, C * 4, C * 2);
  const circ = (i, j, fill, ring, ringW) => {
    x.beginPath(); x.arc(i * C + C / 2, j * C + C / 2, C / 2 - 3, 0, 6.283);
    x.fillStyle = fill; x.fill();
    if (ring) { x.lineWidth = ringW; x.strokeStyle = ring; x.stroke(); }
  };
  const txt = (t, i, j, size, col, dy = 0) => { x.fillStyle = col; x.font = `800 ${size}px Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, i * C + C / 2, j * C + C / 2 + dy); };
  // 30 km/h
  circ(0, 0, '#fff', '#d3121c', 14); txt('30', 0, 0, 54, '#111', 3);
  // parking
  x.fillStyle = '#1e5aa8'; x.fillRect(C + 4, 4, C - 8, C - 8); x.strokeStyle = '#fff'; x.lineWidth = 4; x.strokeRect(C + 8, 8, C - 16, C - 16); txt('P', 1, 0, 84, '#fff', 4);
  // pedestrian crossing
  x.fillStyle = '#1e5aa8'; x.fillRect(2 * C + 4, 4, C - 8, C - 8);
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(2 * C + 64, 14); x.lineTo(2 * C + 112, 108); x.lineTo(2 * C + 16, 108); x.closePath(); x.fill();
  x.fillStyle = '#111'; x.beginPath(); x.arc(2 * C + 64, 48, 8, 0, 6.283); x.fill(); x.fillRect(2 * C + 58, 56, 12, 28); x.fillRect(2 * C + 50, 84, 10, 16); x.fillRect(2 * C + 68, 84, 10, 16);
  // give way
  x.fillStyle = '#d3121c'; x.beginPath(); x.moveTo(3 * C + 8, 14); x.lineTo(3 * C + 120, 14); x.lineTo(3 * C + 64, 116); x.closePath(); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(3 * C + 24, 28); x.lineTo(3 * C + 104, 28); x.lineTo(3 * C + 64, 98); x.closePath(); x.fill();
  // bus stop
  circ(0, 1, '#f2c200', '#2b7a3a', 8); txt('H', 0, 1, 72, '#2b7a3a', 4);
  // one way
  x.fillStyle = '#1e5aa8'; x.fillRect(C + 4, C + 24, C - 8, C - 48);
  x.fillStyle = '#fff'; x.fillRect(C + 22, C + 58, 56, 14); x.beginPath(); x.moveTo(C + 76, C + 40); x.lineTo(C + 108, C + 65); x.lineTo(C + 76, C + 90); x.closePath(); x.fill();
  // priority road
  x.save(); x.translate(2 * C + C / 2, C + C / 2); x.rotate(Math.PI / 4);
  x.fillStyle = '#fff'; x.fillRect(-42, -42, 84, 84); x.fillStyle = '#f2c200'; x.fillRect(-34, -34, 68, 68); x.restore();
  // no stopping
  circ(3, 1, '#1e5aa8', '#d3121c', 10); x.strokeStyle = '#d3121c'; x.lineWidth = 10; x.beginPath(); x.moveTo(3 * C + 28, C + 28); x.lineTo(3 * C + 100, C + 100); x.moveTo(3 * C + 100, C + 28); x.lineTo(3 * C + 28, C + 100); x.stroke();
  return c;
}
function posterAtlas(rnd) {
  const W = 256, H = 512;
  const c = cv(W * 4, H), x = c.getContext('2d');
  const titles = [['ZIRKUS', 'ROLLI'], ['KINO', 'NACHT'], ['KONZERT', 'LIVE'], ['SALE', '-50%'], ['THEATER', 'PREMIERE'], ['FESTIVAL', 'JULI']];
  const pal = [['#c42a2a', '#f4d24a'], ['#1f3a63', '#f2f2f2'], ['#2f8a4a', '#fbe9a0'], ['#f0a020', '#1b1b1b'], ['#6a2a8a', '#f4f4f4'], ['#e8e8e4', '#c42a2a']];
  for (let i = 0; i < 4; i++) {
    const t = titles[(i + Math.floor(rnd() * 3)) % titles.length], p = pal[(i * 2 + Math.floor(rnd() * 2)) % pal.length];
    x.fillStyle = p[0]; x.fillRect(i * W, 0, W, H);
    x.fillStyle = p[1]; x.fillRect(i * W + 14, 14, W - 28, 6);
    x.beginPath(); x.arc(i * W + W / 2, 150, 70, 0, 6.283); x.fill();
    x.fillStyle = p[0]; x.beginPath(); x.arc(i * W + W / 2 + 18, 140, 56, 0, 6.283); x.fill();
    x.fillStyle = p[1]; x.font = '800 44px Arial, sans-serif'; x.textAlign = 'center';
    x.fillText(t[0], i * W + W / 2, 300); x.font = '700 30px Arial, sans-serif'; x.fillText(t[1], i * W + W / 2, 350);
    x.fillRect(i * W + 30, 390, W - 60, 4); x.font = '600 18px Arial'; x.fillText('Karten an der Abendkasse', i * W + W / 2, 430);
    x.fillRect(i * W + 30, 450, W - 60, 40);
  }
  return c;
}


function shopSignTex() {
  const c = cv(1024, 256), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#1a1c22'); g.addColorStop(1, '#0d0e11');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = '#ff7a1a'; x.lineWidth = 10; x.strokeRect(12, 12, 1000, 232);
  x.fillStyle = '#ff7a1a';
  x.beginPath(); x.moveTo(90, 40); x.lineTo(30 + 90, 40); x.lineTo(70 + 30, 130); x.lineTo(130, 130); x.lineTo(70, 220); x.lineTo(80, 150); x.lineTo(40, 150); x.closePath(); x.fill();
  x.font = '900 128px Arial Black, Arial, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#ffffff'; x.fillText('VESC', 190, 150);
  x.fillStyle = '#ff7a1a'; x.fillText('SHOP', 560, 150);
  x.font = '600 40px Arial, sans-serif'; x.fillStyle = '#9fe9ff';
  x.fillText('Controller · Tuning · 150 km/h', 200, 215);
  return c;
}

export function makeTextures(renderer) {
  const rnd = mulberry32(1337);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const T = {};
  const asp = asphalt(rnd);
  T.asphalt = mk(asp, { aniso });
  T.asphaltBump = mk(asp, { aniso, srgb: false });
  T.paver = mk(pavers(rnd), { aniso });
  T.grass = mk(grass(rnd), { aniso });
  T.roof = mk(roofTiles(rnd), { aniso });
  T.leaf = mk(leaves(rnd), { aniso: 4 });
  T.grip = mk(gripTex(), { aniso });
  T.glow = mk(glow(), { repeat: false });
  T.pool = mk(pool(), { repeat: false });
  T.beam = mk(beam(), { repeat: false });
  T.beam.wrapT = THREE.ClampToEdgeWrapping;
  T.shopSign = mk(shopSignTex(), { aniso, repeat: false });
  T.signs = mk(signAtlas(), { aniso, repeat: false });
  T.poster = mk(posterAtlas(rnd), { aniso });
  T.facade = {};
  for (const k of ['plaster', 'brick', 'panel', 'glass']) {
    const f = facade(k, rnd);
    T.facade[k] = {
      map: mk(f.m, { aniso }),
      orm: mk(f.o, { aniso, srgb: false }),
      emi: mk(f.e, { aniso }),
      bump: mk(f.b, { aniso, srgb: false }),
    };
  }
  return T;
}

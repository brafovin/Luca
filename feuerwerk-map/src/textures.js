// Prozedurale Texturen (alles per Canvas erzeugt, keine externen Assets)
import * as THREE from 'three';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.repeat.set(repeat[0], repeat[1]);
  return t;
}

function speckle(ctx, w, h, count, colors, minR, maxR, rand) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    const r = minR + rand() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function grassTexture(repeat) {
  const rand = rng(11);
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#26361f';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, 2600, ['#2d4223', '#1f2d19', '#34502a', '#2a3a1e', '#3a4a26'], 2, 9, rand);
  ctx.lineWidth = 1;
  for (let i = 0; i < 5000; i++) {
    const x = rand() * 512, y = rand() * 512;
    ctx.strokeStyle = `rgba(${40 + rand() * 40},${70 + rand() * 50},${30 + rand() * 20},0.45)`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 6, y - 3 - rand() * 7);
    ctx.stroke();
  }
  return toTexture(c, { repeat });
}

export function cobbleTexture(repeat) {
  const rand = rng(23);
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#16171a';
  ctx.fillRect(0, 0, 512, 512);
  const rows = 16, cols = 16;
  const sw = 512 / cols, sh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const off = r % 2 ? sw / 2 : 0;
      const x = q * sw + off, y = r * sh;
      const g = 78 + rand() * 60;
      ctx.fillStyle = `rgb(${g + rand() * 12},${g + rand() * 6},${g - rand() * 8})`;
      const m = 1.6;
      for (const dx of [0, -512]) {
        ctx.beginPath();
        ctx.roundRect(x + m + dx, y + m, sw - m * 2, sh - m * 2, 5);
        ctx.fill();
      }
    }
  }
  speckle(ctx, 512, 512, 800, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.05)'], 1, 4, rand);
  return toTexture(c, { repeat });
}

export function asphaltTexture(repeat) {
  const rand = rng(37);
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 2500, ['#34363b', '#222428', '#3b3d42', '#1d1f23'], 0.6, 2, rand);
  return toTexture(c, { repeat });
}

export function paveTexture(repeat) {
  const rand = rng(41);
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#25272b';
  ctx.fillRect(0, 0, 256, 256);
  const n = 8;
  const s = 256 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const g = 92 + rand() * 24;
      ctx.fillStyle = `rgb(${g},${g},${g + 4})`;
      ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  }
  return toTexture(c, { repeat });
}

export function roofTexture() {
  const rand = rng(53);
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#3a2420';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = 50 + rand() * 30;
      ctx.fillStyle = `rgb(${v + 22},${v * 0.55},${v * 0.45})`;
      ctx.fillRect(x * 8 + (y % 2 ? 4 : 0), y * 8, 7, 7);
    }
  }
  const t = toTexture(c, { repeat: [6, 3] });
  return t;
}

// Weicher Glow-Punkt
export function glowTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { wrap: false });
}

// Weiche Rauchwolke (Wolkenrauschen in einer Kreisscheibe)
export function smokeTexture() {
  const rand = rng(77);
  const [c, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 140; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * 34;
    const x = 64 + Math.cos(a) * rr, y = 64 + Math.sin(a) * rr;
    const r = 10 + rand() * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Rand ausblenden
  const m = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  m.addColorStop(0, 'rgba(0,0,0,0)');
  m.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = m;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(c, { wrap: false });
}

// Fassaden-Kachel: 3 Fensterachsen (12 m) x n Stockwerke. Liefert Albedo + Emissive.
const WALLS = ['#b9a98c', '#a9a493', '#c2b08a', '#8f7d6d', '#9aa0a0', '#b59a86', '#a6836b'];
const WARM = ['#ffd592', '#ffe3b0', '#ffc774', '#fff0c8', '#ffcf9a'];
const COOL = ['#9fc4ff', '#b8d6ff', '#8ab0ff'];

export function facadeTile(seed, floors, wallIdx) {
  const rand = rng(seed);
  const PPM = 24;
  const W = 12 * PPM;
  const FH = Math.round(3.3 * PPM);
  const H = floors * FH;
  const [c, ctx] = makeCanvas(W, H);
  const [ce, ectx] = makeCanvas(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);

  const wall = WALLS[wallIdx % WALLS.length];
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);
  // Putz-Rauschen
  speckle(ctx, W, H, 900, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.04)'], 1, 5, rand);

  for (let f = 0; f < floors; f++) {
    const y0 = f * FH;
    const ground = f === floors - 1;
    // Gesims
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, y0, W, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, y0 + 3, W, 2);

    for (let b = 0; b < 3; b++) {
      const bx = b * 4 * PPM;
      if (ground) {
        // Schaufenster / Tür
        const isDoor = b === (seed % 3);
        const ww = isDoor ? 1.5 * PPM : 3 * PPM;
        const wh = isDoor ? 2.4 * PPM : 2.1 * PPM;
        const wx = bx + (4 * PPM - ww) / 2;
        const wy = y0 + FH - wh - 0.15 * PPM;
        const lit = isDoor ? rand() < 0.5 : rand() < 0.65;
        drawWindow(ctx, ectx, wx, wy, ww, wh, lit, rand, true);
      } else {
        const ww = 1.3 * PPM, wh = 1.9 * PPM;
        const wx = bx + (4 * PPM - ww) / 2;
        const wy = y0 + 0.7 * PPM;
        const lit = rand() < 0.38;
        drawWindow(ctx, ectx, wx, wy, ww, wh, lit, rand, false);
        // Fensterbank
        ctx.fillStyle = 'rgba(230,225,215,0.55)';
        ctx.fillRect(wx - 3, wy + wh, ww + 6, 4);
        // Fensterläden manchmal
        if (rand() < 0.25) {
          ctx.fillStyle = ['#3d5a45', '#4a3a2c', '#5a2f2a'][(rand() * 3) | 0];
          ctx.fillRect(wx - 9, wy, 8, wh);
          ctx.fillRect(wx + ww + 1, wy, 8, wh);
        }
      }
    }
  }

  const map = toTexture(c, { repeat: [1, 1] });
  const emissive = toTexture(ce, { repeat: [1, 1] });
  return { map, emissive, height: floors * 3.3 };
}

function drawWindow(ctx, ectx, x, y, w, h, lit, rand, shop) {
  // Rahmen
  ctx.fillStyle = shop ? '#2a2623' : '#e9e4d8';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  if (lit) {
    const tv = rand() < 0.14;
    const col = tv ? COOL[(rand() * COOL.length) | 0] : WARM[(rand() * WARM.length) | 0];
    const k = 0.55 + rand() * 0.45;
    const gcol = ectx.createLinearGradient(x, y, x, y + h);
    gcol.addColorStop(0, shade(col, k));
    gcol.addColorStop(1, shade(col, k * 0.65));
    ectx.fillStyle = gcol;
    ectx.fillRect(x, y, w, h);
    ctx.fillStyle = shade(col, k * 0.55);
    ctx.fillRect(x, y, w, h);
    // Vorhang
    if (!shop && rand() < 0.5) {
      ectx.fillStyle = 'rgba(0,0,0,0.35)';
      ectx.fillRect(x, y, w * 0.28, h);
      ectx.fillRect(x + w * 0.72, y, w * 0.28, h);
    }
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#16223a');
    g.addColorStop(1, '#0a1220');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  // Sprossen
  ctx.fillStyle = shop ? '#2a2623' : '#e9e4d8';
  ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
  if (!shop) ctx.fillRect(x, y + h * 0.4, w, 3);
  if (lit) {
    ectx.fillStyle = '#000';
    ectx.fillRect(x + w / 2 - 1.5, y, 3, h);
    if (!shop) ectx.fillRect(x, y + h * 0.4, w, 3);
  }
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * k) | 0;
  const b = Math.min(255, (n & 255) * k) | 0;
  return `rgb(${r},${g},${b})`;
}

// Etikett für Feuerwerksbatterien (Verpackung)
export function boxLabel(name, c1, c2, seed = 1) {
  const rand = rng(seed);
  const [c, ctx] = makeCanvas(256, 128);
  const g = ctx.createLinearGradient(0, 0, 256, 128);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + rand() * 0.25})`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    const x = rand() * 256, y = rand() * 128;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 80, y + (rand() - 0.5) * 80);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 5;
  ctx.font = 'bold 34px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeText(name, 128, 60);
  ctx.fillText(name, 128, 60);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#ffeb3b';
  ctx.fillText('KAT. F2 · ab 18 Jahre', 128, 100);
  return toTexture(c, { wrap: false });
}

export function woodTexture(repeat = [1, 1]) {
  const rand = rng(91);
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const v = 58 + rand() * 30;
    ctx.fillStyle = `rgb(${v + 14},${v * 0.78},${v * 0.55})`;
    ctx.fillRect(1, i * 32 + 1, 254, 29);
    for (let k = 0; k < 40; k++) {
      ctx.strokeStyle = `rgba(0,0,0,${rand() * 0.18})`;
      ctx.beginPath();
      const y = i * 32 + 2 + rand() * 27;
      ctx.moveTo(rand() * 256, y);
      ctx.lineTo(rand() * 256, y + (rand() - 0.5) * 2);
      ctx.stroke();
    }
  }
  return toTexture(c, { repeat });
}

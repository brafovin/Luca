'use strict';
// Grundlagen: Kachelgröße, Kacheltypen, Mathe-Helfer und Kollision mit der Kachelkarte.

const T = 32; // Kachelgröße in Weltpixeln
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const TL = {
  EMPTY: 0,
  GROUND: 1,  // Erde/Sand/Schnee je nach Welt (Oberfläche wird automatisch gezeichnet)
  BRICK: 2,   // zerbrechlicher Ziegel
  QBLOCK: 3,  // Fragezeichen-Block
  USED: 4,    // leerer Block nach dem Anstoßen
  STONE: 5,   // fester Stein (Treppen, Mauern)
  ONEWAY: 6,  // Plattform, durch die man von unten springen kann
  SPIKES: 7,  // Stacheln
  LAVA: 8,
  ICE: 9,     // rutschiger Boden
  CANNON: 10, // Kanone (fest)
};
const SOLID = [0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, target, d) => (v < target ? Math.min(v + d, target) : Math.max(v - d, target));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Box mit Innenabstand – fairere Treffer für den Spieler
function inset(e, d) {
  return { x: e.x + d, y: e.y + d, w: e.w - 2 * d, h: e.h - 2 * d };
}

// ---- Kachelkarte ----------------------------------------------------------

function tileAt(tx, ty) {
  const L = G.lvl;
  if (tx < 0 || tx >= L.w) return TL.STONE; // unsichtbare Wände links/rechts
  if (ty < 0 || ty >= L.h) return TL.EMPTY;
  return L.tiles[ty * L.w + tx];
}

function setTile(tx, ty, t) {
  const L = G.lvl;
  if (tx < 0 || tx >= L.w || ty < 0 || ty >= L.h) return;
  L.tiles[ty * L.w + tx] = t;
}

function solidAt(tx, ty) {
  return SOLID[tileAt(tx, ty)] === 1;
}

function floorAt(tx, ty) {
  const t = tileAt(tx, ty);
  return SOLID[t] === 1 || t === TL.ONEWAY;
}

// Bewegt e horizontal und stoppt an festen Kacheln. Rückgabe: -1/1 bei Wandkontakt, sonst 0.
function moveX(e, dx) {
  if (dx === 0) return 0;
  e.x += dx;
  const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
  if (dx > 0) {
    const tx = Math.floor((e.x + e.w - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) { e.x = tx * T - e.w; return 1; }
  } else {
    const tx = Math.floor(e.x / T);
    for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) { e.x = (tx + 1) * T; return -1; }
  }
  return 0;
}

// Bewegt e vertikal. Rückgabe: 1 = gelandet, -1 = Kopf gestoßen, 0 = frei.
// Bei -1 steht in e.ceilTy die getroffene Kachelzeile.
function moveY(e, dy, oneway = true) {
  if (dy === 0) return 0;
  const prevBottom = e.y + e.h;
  e.y += dy;
  const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
  if (dy > 0) {
    const ty = Math.floor((e.y + e.h - 0.01) / T);
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(tx, ty);
      if (SOLID[t] === 1 || (oneway && t === TL.ONEWAY && prevBottom <= ty * T + 0.5)) {
        e.y = ty * T - e.h;
        return 1;
      }
    }
  } else {
    const ty = Math.floor(e.y / T);
    for (let tx = x0; tx <= x1; tx++) {
      if (solidAt(tx, ty)) { e.y = (ty + 1) * T; e.ceilTy = ty; return -1; }
    }
  }
  return 0;
}

// Ist der Bereich (x, y, w, h) frei von festen Kacheln?
function boxFree(x, y, w, h) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.01) / T);
  const y0 = Math.floor(y / T), y1 = Math.floor((y + h - 0.01) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, ty)) return false;
  return true;
}

// Berührt die Box eine Kachel eines bestimmten Typs? Gibt die Kachel zurück (für Stacheln/Lava).
function touchesTile(e, type, pad = 0) {
  const x0 = Math.floor((e.x + pad) / T), x1 = Math.floor((e.x + e.w - pad - 0.01) / T);
  const y0 = Math.floor((e.y + pad) / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tileAt(tx, ty) === type) return { tx, ty };
  return null;
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privater Modus o. ä. */ }
  },
};

// ---- Schwierigkeitsgrade ----------------------------------------------------------
// speed: Tempo von Gegnern und Geschossen, bossSpeed: Tempo der Bosse, inv: Schonzeit nach einem Treffer (s),
// rescue: Abgrund/Lava setzt dich an den letzten sicheren Platz zurück, oneHit: jeder Treffer ist sofort vorbei
const DIFFICULTIES = [
  { id: 'easy', name: 'Einfach', color: '#3ee07a', lives: 5, startPower: 1, speed: 0.75, bossSpeed: 0.8, bossHp: 2, inv: 3,
    checkpoints: true, rescue: true, oneHit: false, score: 0.5,
    desc: '5 Leben, du startest groß, Gegner sind langsamer. Fällst du in einen Abgrund, landest du wieder am Rand.' },
  { id: 'normal', name: 'Normal', color: '#ffd23f', lives: 3, startPower: 0, speed: 1, bossSpeed: 1, bossHp: 3, inv: 2,
    checkpoints: true, rescue: false, oneHit: false, score: 1,
    desc: '3 Leben, Bosse brauchen 3 Treffer. So ist das Spiel gedacht.' },
  { id: 'hard', name: 'Schwer', color: '#ff9f43', lives: 3, startPower: 0, speed: 1.25, bossSpeed: 1.2, bossHp: 4, inv: 1.2,
    checkpoints: true, rescue: false, oneHit: false, score: 1.5,
    desc: 'Gegner sind schneller, Bosse brauchen 4 Treffer, kürzere Schonzeit nach Treffern. 1,5-fache Punkte.' },
  { id: 'impossible', name: 'Unmöglich', color: '#ff6b7a', lives: 1, startPower: 0, speed: 1.5, bossSpeed: 1.4, bossHp: 5, inv: 1,
    checkpoints: false, rescue: false, oneHit: true, score: 3,
    desc: '1 Leben, jeder Treffer ist sofort vorbei, keine Kontrollpunkte, Bosse brauchen 5 Treffer. 3-fache Punkte.' },
];
let DIFF = DIFFICULTIES[1];
{
  const i = Number(store.get('sk_diff', 1));
  if (Number.isInteger(i) && i >= 0 && i < DIFFICULTIES.length) DIFF = DIFFICULTIES[i];
}
function setDifficulty(i) {
  DIFF = DIFFICULTIES[clamp(i, 0, DIFFICULTIES.length - 1)];
  store.set('sk_diff', DIFFICULTIES.indexOf(DIFF));
}

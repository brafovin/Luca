'use strict';
// Level-Baukasten und die sechs Welten. Koordinaten sind Kacheln (x = Spalte, y = Zeile, 0 = oben).
// Jedes Level ist 18 Zeilen hoch, die Bodenoberkante liegt in Zeile 15 (gy).
//
// Sprungweiten (für das Leveldesign): Gehen ≈ 3,9 Kacheln hoch / 4 Lücke, Rennen ≈ 4,4 hoch / 7 Lücke,
// Feder ohne Halten ≈ 6,7 hoch, mit Halten ≈ 10 hoch, Doppelsprung ≈ 7 hoch.

class LevelBuilder {
  constructor(def) {
    this.def = def;
    this.w = def.w;
    this.h = def.h || 18;
    this.gy = this.h - 3;
    this.tiles = new Uint8Array(this.w * this.h);
    this.contents = {};
    this.spawns = [];
    this.decor = [];
    this.hints = [];
    this.reserved = new Set(); // Spalten ohne automatische Deko
    this.startPos = { x: 2, y: this.gy - 1 };
    this.gates = [];
  }

  inb(x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h; }
  get(x, y) { return this.inb(x, y) ? this.tiles[y * this.w + x] : TL.EMPTY; }
  set(x, y, t) { if (this.inb(x, y)) this.tiles[y * this.w + x] = t; }

  fill(x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
    return this;
  }
  clear(x0, y0, x1, y1) { return this.fill(x0, y0, x1, y1, TL.EMPTY); }
  ground(x0, x1, top = this.gy) { return this.fill(x0, top, x1, this.h - 1, TL.GROUND); }
  stone(x0, y0, x1, y1) { return this.fill(x0, y0, x1, y1, TL.STONE); }
  oneway(x0, x1, y) { return this.fill(x0, y, x1, y, TL.ONEWAY); }
  spikes(x0, x1, y = this.gy - 1) { return this.fill(x0, y, x1, y, TL.SPIKES); }
  lava(x0, x1, top = this.gy + 1) { this.clear(x0, this.gy, x1, this.h - 1); return this.fill(x0, top, x1, this.h - 1, TL.LAVA); }

  // Oberste Bodenreihe in einem Bereich zu Eis machen
  iceTop(x0, x1) {
    for (let x = x0; x <= x1; x++) {
      const s = this.surface(x);
      if (s != null && this.get(x, s + 1) === TL.GROUND) this.set(x, s + 1, TL.ICE);
    }
    return this;
  }

  // Treppe: dir = 1 steigt nach rechts, dir = -1 fällt nach rechts
  stairs(x, n, dir = 1, base = this.gy) {
    for (let i = 0; i < n; i++) {
      const hgt = dir > 0 ? i + 1 : n - i;
      this.fill(x + i, base - hgt, x + i, base - 1, TL.STONE);
    }
    return this;
  }

  q(x, y, content = 'coin') { this.set(x, y, TL.QBLOCK); this.contents[y * this.w + x] = content; return this; }
  brick(x, y, content) {
    this.set(x, y, TL.BRICK);
    if (content) this.contents[y * this.w + x] = content;
    return this;
  }
  bricks(x0, x1, y) { for (let x = x0; x <= x1; x++) this.brick(x, y); return this; }

  // Erste freie Zeile über Boden in Spalte x (von oben gesucht, ab Zeile `from`)
  surface(x, from = 2) {
    for (let y = from; y < this.h - 1; y++) {
      const t = this.get(x, y), b = this.get(x, y + 1);
      if (!SOLID[t] && t !== TL.ONEWAY && (SOLID[b] || b === TL.ONEWAY)) return y;
    }
    return null;
  }
  standRow(x, y) {
    if (y != null) return y;
    const s = this.surface(x);
    return s == null ? this.gy - 1 : s;
  }

  start(x, y) { this.startPos = { x, y: this.standRow(x, y) }; this.reserve(x, 1); return this; }
  coins(x0, x1, y) { for (let x = x0; x <= x1; x++) this.spawns.push({ kind: 'coin', x, y }); return this; }
  coinArc(x0, x1, y, lift = 2) {
    const n = x1 - x0;
    for (let x = x0; x <= x1; x++) {
      const t = n === 0 ? 0.5 : (x - x0) / n;
      this.spawns.push({ kind: 'coin', x, y: y - Math.round(Math.sin(t * Math.PI) * lift) });
    }
    return this;
  }
  gem(x, y) { this.spawns.push({ kind: 'gem', x, y, id: this.spawns.filter((s) => s.kind === 'gem').length }); return this; }
  enemy(type, x, y, opts = {}) {
    this.spawns.push({ kind: 'enemy', type, x, y: y == null ? null : y, opts });
    return this;
  }
  spring(x, y) { this.spawns.push({ kind: 'spring', x, y: this.standRow(x, y) }); this.reserve(x, 1); return this; }
  mplat(x, y, w, opts = {}) { this.spawns.push({ kind: 'mplat', x, y, w, opts }); return this; }
  fplat(x, y, w) { this.spawns.push({ kind: 'fplat', x, y, w }); return this; }
  checkpoint(x, y) { this.spawns.push({ kind: 'checkpoint', x, y: this.standRow(x, y) }); this.reserve(x, 1); return this; }
  cannon(x, y) { this.set(x, y, TL.CANNON); this.spawns.push({ kind: 'cannon', x, y }); this.reserve(x, 1); return this; }
  stomper(x, y = 6) { this.spawns.push({ kind: 'enemy', type: 'stomper', x, y, opts: {} }); return this; }
  // Boss-Arena von x0 bis x1: links ein Tor, das sich beim Kampf schließt, rechts eines, das sich nach dem Sieg öffnet
  bossArena(x0, x1, kind, tip) {
    this.ground(x0 - 1, x1 + 1);
    this.gate(x0 - 1, 2, this.gy - 1, true);
    this.gate(x1 + 1, 2, this.gy - 1);
    this.spawns.push({ kind: 'enemy', type: 'boss', x: x1 - 6, y: null, opts: { boss: kind, arena: [x0, x1] } });
    this.hint(x0 - 3, tip);
    this.checkpoint(x0 - 6);
    this.reserve(x0, x1 - x0 + 1);
    return this;
  }
  flag(x, opts = {}) { this.flagSpawn = { x, y: this.standRow(x), hidden: !!opts.hidden }; this.reserve(x - 1, 3); return this; }
  house(x) { this.decor.push({ type: 'house', x, y: this.standRow(x) }); this.reserve(x - 1, 5); return this; }
  hint(x, text, touch) { this.hints.push({ x, y: this.standRow(x), text, touch }); this.reserve(x, 1); return this; }
  deco(type, x, y) { this.decor.push({ type, x, y: this.standRow(x, y) }); this.reserve(x, 1); return this; }
  gate(x, y0, y1, closing = false) {
    if (closing) this.clear(x, y0, x, y1); else this.stone(x, y0, x, y1);
    this.gates.push({ x, y0, y1, closing });
    this.reserve(x, 1);
    return this;
  }
  reserve(x, n) { for (let i = 0; i < n; i++) this.reserved.add(x + i); }

  autoDecor(seed) {
    const rnd = mulberry32(seed);
    const kinds = THEMES[this.def.theme].decor;
    for (let x = 1; x < this.w - 1; x++) {
      if (this.reserved.has(x)) continue;
      const r = rnd();
      if (r > 0.22) continue;
      const y = this.surface(x);
      if (y == null) continue;
      const below = this.get(x, y + 1);
      if (below !== TL.GROUND && below !== TL.ICE) continue;
      if (this.get(x, y - 1) !== TL.EMPTY || this.get(x, y - 2) !== TL.EMPTY) continue;
      if (this.spawns.some((s) => s.kind === 'cannon' && s.x === x)) continue;
      const type = kinds[Math.floor(rnd() * kinds.length)];
      this.decor.push({ type, x, y, v: rnd() });
      x += 1;
    }
  }

  build() {
    this.autoDecor(this.def.id * 977 + 13);
    return {
      id: this.def.id, name: this.def.name, theme: this.def.theme, music: this.def.music || this.def.theme,
      w: this.w, h: this.h, gy: this.gy,
      tiles: this.tiles, contents: this.contents,
      spawns: this.spawns, decor: this.decor, hints: this.hints, gates: this.gates,
      start: this.startPos, flag: this.flagSpawn,
    };
  }
}

const LEVELS = [
  // ---------------------------------------------------------------------------------------------
  {
    id: 1, name: 'Sonnige Wiese', theme: 'meadow', w: 236,
    build(B) {
      B.ground(0, 38);
      B.start(3);
      B.hint(6, '← →  /  A D : Laufen', '◀ ▶ : Laufen');
      B.hint(10, 'Leertaste / W : Springen – halten springt höher', 'Springen – länger drücken springt höher');
      B.coins(13, 16, 12);
      B.q(18, 11, 'coin');
      B.brick(21, 11); B.q(22, 11, 'power'); B.brick(23, 11); B.q(24, 11, 'coin'); B.brick(25, 11);
      B.q(23, 7, 'coins');
      B.gem(25, 8);
      B.enemy('slime', 28);
      B.stone(31, 13, 32, 14);
      B.enemy('slime', 35);
      B.coinArc(38, 42, 12, 2);
      // Lücke 39–41
      B.ground(42, 77);
      B.hint(44, 'Shift / X halten : Rennen', 'Rennen-Knopf schaltet Rennen an und aus');
      B.enemy('slime', 48); B.enemy('slime', 50);
      B.stone(53, 12, 54, 14);
      B.hint(57, '↓ / S : Rollen – gedrückt halten = weiterrollen', 'Rollen – gedrückt halten = weiterrollen');
      B.ground(60, 70, 7); B.clear(60, 14, 70, 14);
      B.coins(61, 69, 14);
      B.hint(72, '↓ in der Luft : Luftrolle mit Schub nach vorn', 'Rollen in der Luft : Luftrolle mit Schub nach vorn');
      B.q(74, 11, 'power');
      B.enemy('slime', 76);
      // Lücke 78–81
      B.coinArc(78, 81, 12, 1);
      B.ground(82, 119);
      B.checkpoint(84);
      B.bricks(88, 92, 11); B.q(90, 11, 'coins');
      B.enemy('beetle', 95);
      B.hint(99, 'Sprungfeder: Springen gedrückt halten!');
      B.spring(102);
      B.oneway(101, 105, 7); B.coins(101, 104, 6); B.gem(105, 6);
      B.enemy('slime', 108); B.enemy('slime', 111);
      B.stairs(114, 4); B.stone(118, 11, 119, 14);
      // Lücke 120–122
      B.ground(123, 160);
      B.stone(123, 11, 124, 14); B.stairs(125, 4, -1);
      B.q(132, 11, 'coin'); B.brick(133, 11); B.q(134, 11, 'star'); B.brick(135, 11); B.q(136, 11, 'coin');
      B.enemy('slime', 138); B.enemy('slime', 140); B.enemy('slime', 142);
      B.ground(145, 152, 13);
      B.enemy('beetle', 149);
      B.coins(146, 151, 10);
      B.enemy('slime', 156);
      // Lücke 161–164 mit Edelstein darüber
      B.gem(162, 10);
      B.ground(165, 235);
      B.enemy('slime', 168);
      B.bossArena(178, 203, 'mole', 'Maulwurf Buddel! Spring auf ihn, wenn er auftaucht.');
      B.stairs(208, 8); B.stone(216, 7, 216, 14);
      B.flag(224);
      B.house(228);
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 2, name: 'Finsterwald', theme: 'forest', w: 252,
    build(B) {
      B.ground(0, 34);
      B.start(3);
      B.q(9, 11, 'power'); B.brick(10, 11); B.q(11, 11, 'coin'); B.brick(12, 11);
      B.enemy('slime', 15);
      B.oneway(18, 21, 12); B.coins(18, 21, 11);
      B.oneway(23, 26, 9); B.coins(23, 26, 8);
      B.enemy('frog', 29);
      // Lücke 35–38
      B.coinArc(35, 38, 12, 1);
      B.ground(39, 66);
      B.enemy('bat', 44, 10, { range: 3 });
      B.stone(47, 13, 48, 14);
      B.enemy('beetle', 52);
      B.q(54, 11, 'feather');
      B.enemy('beetle', 56);
      B.hint(58, 'Mit der Feder in der Luft nochmal springen!');
      B.gem(63, 8);
      // Fallende Plattformen über dem Abgrund 67–82
      B.fplat(70, 13, 3); B.coins(70, 72, 12);
      B.fplat(76, 12, 3); B.coins(76, 78, 11);
      B.ground(83, 130);
      B.checkpoint(86);
      B.enemy('frog', 92);
      B.bricks(94, 98, 11); B.q(96, 11, 'power');
      B.enemy('frog', 99);
      B.ground(102, 110, 8); B.clear(102, 14, 110, 14);
      B.coins(103, 104, 14); B.coins(108, 109, 14);
      B.enemy('slime', 106, 14);
      B.oneway(114, 117, 12); B.oneway(119, 122, 9); B.oneway(124, 127, 6);
      B.coins(119, 122, 8);
      B.gem(126, 5);
      B.enemy('bat', 120, 7, { range: 4 });
      B.enemy('beetle', 118); B.enemy('beetle', 125);
      B.ground(131, 160);
      B.spring(133);
      B.stone(136, 9, 138, 14); B.coins(136, 138, 8);
      B.enemy('frog', 143); B.enemy('slime', 146); B.enemy('slime', 148);
      B.q(150, 11, 'coins');
      B.oneway(153, 156, 12); B.coins(153, 156, 11);
      B.enemy('bat', 157, 9, { range: 3 });
      // Lücke 161–164
      B.ground(165, 251);
      B.enemy('bat', 169, 10, { range: 3 });
      B.enemy('beetle', 173);
      B.q(176, 11, 'heart');
      B.bossArena(188, 213, 'bat', 'Gräfin Flatter! Spring drauf oder triff sie mit der Luftrolle.');
      B.stairs(218, 8); B.stone(226, 7, 226, 14);
      B.flag(234);
      B.house(238);
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 3, name: 'Glutwüste', theme: 'desert', w: 262,
    build(B) {
      B.ground(0, 40);
      B.start(3);
      B.q(8, 11, 'power'); B.q(9, 11, 'coin');
      B.hint(12, 'Igel sind stachelig – nicht draufspringen!');
      B.enemy('hedgehog', 15);
      B.spikes(19, 21);
      B.enemy('slime', 25);
      B.stone(30, 14, 30, 14); B.cannon(30, 13);
      B.q(34, 11, 'power');
      B.enemy('hedgehog', 37);
      // Abgrund 41–50 mit beweglicher Plattform
      B.mplat(43, 12, 3, { dx: 4, speed: 70 });
      B.ground(51, 103);
      B.enemy('hedgehog', 56);
      B.bricks(57, 61, 11); B.brick(59, 11, 'coins');
      B.enemy('hedgehog', 61, 14);
      B.stone(65, 12, 65, 14); B.cannon(65, 11);
      B.spikes(68, 72);
      B.oneway(69, 71, 12);
      B.enemy('slime', 75);
      B.ground(78, 85, 12);
      B.enemy('hedgehog', 81);
      B.gem(82, 7);
      B.checkpoint(88);
      B.stairs(92, 4); B.stone(96, 11, 98, 14); B.stairs(99, 4, -1);
      B.coins(96, 98, 10);
      // Abgrund 104–119
      B.mplat(106, 12, 2, { dy: -3, speed: 55 });
      B.gem(107, 6);
      B.mplat(111, 10, 3, { dx: 4, speed: 80 });
      B.ground(120, 160);
      B.enemy('hedgehog', 124);
      B.cannon(128, 14);
      B.enemy('slime', 132); B.enemy('beetle', 135);
      B.spikes(138, 140);
      B.q(143, 11, 'power'); B.q(144, 11, 'coins');
      B.enemy('frog', 148);
      B.ground(152, 160, 13);
      B.enemy('hedgehog', 155);
      // Abgrund 161–166
      B.mplat(162, 12, 2, { dx: 2, speed: 50 });
      B.ground(167, 261);
      B.enemy('hedgehog', 172); B.enemy('hedgehog', 176);
      B.stone(180, 14, 180, 14); B.cannon(180, 13);
      B.spikes(184, 186);
      B.gem(185, 10);
      B.enemy('frog', 190);
      B.bossArena(200, 225, 'scorpion', 'Skorpion Skorpi! Weich den Stacheln aus und spring drauf.');
      B.stairs(230, 8); B.stone(238, 7, 238, 14);
      B.flag(246);
      B.house(250);
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 4, name: 'Frostgipfel', theme: 'ice', w: 254,
    build(B) {
      B.ground(0, 30);
      B.start(3);
      B.iceTop(10, 27);
      B.hint(8, 'Vorsicht, Eis – hier rutschst du!');
      B.brick(13, 11); B.q(14, 11, 'power'); B.brick(15, 11);
      B.enemy('slime', 19); B.enemy('slime', 22);
      B.enemy('bat', 26, 10, { range: 3 });
      // Lücke 31–34
      B.ground(35, 70);
      B.iceTop(35, 50);
      B.enemy('hedgehog', 40); B.enemy('frog', 46);
      B.stone(52, 12, 53, 14);
      B.q(57, 11, 'star');
      B.enemy('slime', 60); B.enemy('slime', 62); B.enemy('beetle', 64); B.enemy('hedgehog', 67);
      // Abgrund 71–86 mit Aufzügen
      B.mplat(73, 13, 2, { dy: -4, speed: 60 });
      B.mplat(78, 9, 2, { dy: 4, speed: 60 });
      B.gem(79, 5);
      B.mplat(83, 12, 2, { dy: -3, speed: 70 });
      B.ground(87, 130);
      B.checkpoint(89);
      B.iceTop(92, 108);
      B.enemy('frog', 95);
      B.bricks(97, 101, 11); B.q(99, 11, 'power');
      B.enemy('frog', 100, 14);
      B.enemy('bat', 104, 9, { range: 4 });
      B.spring(109);
      B.ground(112, 122, 6); B.clear(112, 14, 122, 14);
      B.coins(113, 115, 14); B.coins(119, 121, 14);
      B.enemy('slime', 117, 14);
      B.gem(117, 5); B.coins(114, 120, 4);
      B.enemy('slime', 126);
      // Lücke 131–133
      B.ground(134, 175);
      B.stone(138, 14, 138, 14); B.cannon(138, 13);
      B.enemy('hedgehog', 142); B.enemy('beetle', 146);
      B.oneway(149, 152, 12); B.oneway(154, 157, 9);
      B.coins(154, 157, 8);
      B.gem(159, 5);
      B.enemy('bat', 161, 10, { range: 3 });
      B.iceTop(162, 173);
      B.enemy('slime', 165); B.enemy('slime', 168);
      B.q(170, 11, 'coins');
      // Abgrund 176–180 mit Bröckelplattform
      B.fplat(177, 13, 3);
      B.ground(181, 253);
      B.enemy('frog', 186);
      B.bossArena(194, 219, 'yeti', 'Yeti Frosti! Achtung vor Schneebällen und Eiszapfen.');
      B.stairs(224, 8); B.stone(232, 7, 232, 14);
      B.flag(240);
      B.house(244);
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 5, name: 'Lavaburg', theme: 'castle', w: 260,
    build(B) {
      B.stone(0, 0, B.w - 1, 1); // Decke
      B.ground(0, 24);
      B.start(3);
      B.q(8, 11, 'power'); B.q(10, 11, 'magnet');
      B.enemy('slime', 14);
      B.hint(18, 'Lava ist heiß – nicht hineinfallen!');
      B.lava(25, 30);
      B.stone(27, 13, 28, 17);
      B.enemy('lavaball', 26, null, { height: 5 });
      B.enemy('lavaball', 30, null, { height: 4, delay: 1 });
      B.ground(31, 60);
      B.hint(33, 'Stampfer fallen herunter – schnell drunter durch!');
      B.stomper(37);
      B.enemy('slime', 42);
      B.stone(45, 14, 45, 14); B.cannon(45, 13);
      B.stomper(49);
      B.q(53, 11, 'boots');
      B.enemy('beetle', 57);
      // Lavasee 61–80 mit Bröckelplattformen
      B.lava(61, 80);
      B.fplat(64, 13, 2); B.fplat(69, 12, 2); B.fplat(75, 13, 2);
      B.enemy('lavaball', 67, null, { height: 6 });
      B.enemy('lavaball', 73, null, { height: 6, delay: 0.7 });
      B.enemy('lavaball', 78, null, { height: 6, delay: 1.4 });
      B.ground(81, 110);
      B.checkpoint(83);
      B.stomper(88); B.stomper(92); B.stomper(96);
      B.coins(87, 98, 14);
      B.gem(92, 3);
      B.enemy('hedgehog', 100);
      B.bricks(102, 106, 11); B.q(104, 11, 'power');
      B.stone(108, 14, 108, 14); B.cannon(108, 13);
      // Lava 111–124 mit beweglicher Plattform
      B.lava(111, 124);
      B.mplat(113, 12, 3, { dx: 7, speed: 90 });
      B.enemy('lavaball', 117, null, { height: 7 });
      B.enemy('lavaball', 121, null, { height: 7, delay: 1 });
      B.gem(118, 7);
      B.ground(125, 160);
      B.enemy('slime', 128); B.enemy('slime', 130); B.enemy('beetle', 133);
      B.stone(137, 2, 147, 13); // Tunnel in Zeile 14
      B.coins(138, 146, 14);
      B.q(150, 11, 'coins');
      B.stomper(153);
      B.enemy('frog', 157);
      // Lava 161–168 mit Säule
      B.lava(161, 168);
      B.stone(164, 12, 165, 17);
      B.enemy('lavaball', 162, null, { height: 5 });
      B.enemy('lavaball', 167, null, { height: 5, delay: 0.8 });
      B.gem(165, 8);
      B.ground(169, 259);
      B.enemy('hedgehog', 173);
      B.stone(177, 14, 177, 14); B.cannon(177, 13);
      B.enemy('frog', 181);
      B.stomper(185);
      B.q(189, 11, 'heart');
      B.bossArena(198, 223, 'dragon', 'Drache Glutzahn! Hohes Feuer: drunter durchrollen, tiefes: drüberspringen.');
      B.stairs(228, 8); B.stone(236, 7, 236, 14);
      B.flag(244);
      B.house(248);
    },
  },
  // ---------------------------------------------------------------------------------------------
  {
    id: 6, name: 'Wolkenschloss', theme: 'sky', music: 'sky', w: 214,
    build(B) {
      B.ground(0, 20);
      B.start(3);
      B.q(8, 11, 'power'); B.q(10, 11, 'feather');
      B.enemy('slime', 15);
      B.oneway(22, 23, 12);
      B.ground(25, 40);
      B.enemy('beetle', 30); B.enemy('frog', 35);
      // Wolkenhüpfen 41–69
      B.oneway(43, 46, 13); B.oneway(49, 52, 11); B.oneway(55, 58, 12);
      B.coins(49, 52, 10);
      B.gem(50, 7);
      B.enemy('bat', 47, 9, { range: 3 });
      B.enemy('bat', 57, 8, { range: 3 });
      B.mplat(61, 12, 3, { dx: 4, speed: 75 });
      B.ground(70, 95);
      B.checkpoint(72);
      B.stone(78, 14, 78, 14); B.cannon(78, 13);
      B.enemy('hedgehog', 82);
      B.bricks(84, 88, 11); B.q(86, 11, 'star');
      B.enemy('slime', 85, 14); B.enemy('slime', 87, 14);
      B.spring(92);
      B.oneway(91, 95, 5); B.coins(91, 93, 4);
      B.gem(94, 4);
      // Lücke 96–99
      B.ground(100, 130);
      B.enemy('frog', 104); B.enemy('beetle', 108);
      B.enemy('bat', 112, 10, { range: 3 });
      B.stone(116, 14, 116, 14); B.cannon(116, 13);
      B.stone(120, 12, 121, 14); B.stone(124, 10, 125, 14);
      // Abgrund 131–137 mit Aufzug
      B.mplat(133, 13, 2, { dy: -3, speed: 60 });
      B.gem(134, 6);
      B.ground(138, 160);
      B.q(141, 11, 'power'); B.q(143, 11, 'heart');
      B.enemy('hedgehog', 147); B.enemy('frog', 151); B.enemy('beetle', 155);
      B.checkpoint(158);
      // Lücke 161–164, dann die Arena von König Matsch
      B.ground(165, 213);
      B.bossArena(176, 201, 'slime', 'König Matsch! Dreimal auf den Kopf springen.');
      B.flag(205);
      B.house(209);
    },
  },
];

function buildLevel(index) {
  const def = LEVELS[index];
  const B = new LevelBuilder(def);
  def.build(B);
  return B.build();
}

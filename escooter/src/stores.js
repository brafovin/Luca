/* Shared layout data of the walk-in stores (supermarket, filling-station shop, car dealership).
   Local coordinates = inside a city block (0..100). world = local + block origin. Used by the chunk builder (static geometry)
   and by shops.js (doors, products, shoppers, tills). */
const P = 100, LOT0 = 9.1;

export const PRODUCTS = [
  { id: 0, name: 'Cola-Dose', price: 1.19, shape: 'cyl', r: 0.045, h: 0.15, cols: ['#d42020', '#d42020', '#e8e8e8'], fx: 'drink' },
  { id: 1, name: 'Energy Drink', price: 1.49, shape: 'cyl', r: 0.04, h: 0.19, cols: ['#1fd0ff', '#9dff1a', '#ff7a1a'], fx: 'energy' },
  { id: 2, name: 'Bier', price: 0.89, shape: 'cyl', r: 0.04, h: 0.26, cols: ['#2f6a2a', '#7a4a1a'], fx: 'beer' },
  { id: 3, name: 'Mineralwasser', price: 0.59, shape: 'cyl', r: 0.05, h: 0.3, cols: ['#bfe6ff', '#d8f0ff'], fx: 'drink' },
  { id: 4, name: 'Chips', price: 1.99, shape: 'box', w: 0.24, h: 0.32, d: 0.07, cols: ['#f2c61a', '#d4301e', '#e8821a', '#2f8a3a'], fx: 'snack' },
  { id: 5, name: 'Schokolade', price: 1.29, shape: 'box', w: 0.17, h: 0.2, d: 0.03, cols: ['#6a3a1c', '#8a1a5a', '#2a3a8a', '#d8a020'], fx: 'snack' },
  { id: 6, name: 'Nudeln', price: 1.49, shape: 'box', w: 0.12, h: 0.24, d: 0.07, cols: ['#e8a020', '#d44a1e', '#e8c860'], fx: 'food' },
  { id: 7, name: 'Cornflakes', price: 2.99, shape: 'box', w: 0.2, h: 0.32, d: 0.08, cols: ['#e8c020', '#d4302a', '#2a7ac4'], fx: 'food' },
  { id: 8, name: 'Milch', price: 0.99, shape: 'box', w: 0.1, h: 0.22, d: 0.07, cols: ['#f2f2f2', '#9fd0ff'], fx: 'drink' },
  { id: 9, name: 'Brot', price: 1.79, shape: 'box', w: 0.34, h: 0.13, d: 0.12, cols: ['#a8703a', '#c89050'], fx: 'food' },
  { id: 10, name: 'Waschmittel', price: 6.99, shape: 'box', w: 0.3, h: 0.36, d: 0.16, cols: ['#2a7ac4', '#e8e8e8', '#2fb04a'], fx: 'misc' },
  { id: 11, name: 'Zahnpasta', price: 1.95, shape: 'box', w: 0.16, h: 0.05, d: 0.04, cols: ['#e8e8e8', '#2fb0d4'], fx: 'misc' },
];

const LEVELS = [0.42, 0.95, 1.48]; // y of the item rows on a gondola (shelf boards sit just below)
export const LEVEL_Y = LEVELS;

function marketLayout() {
  const x0 = LOT0 + 8, w = 44, z0 = LOT0 + 1, d = 30, x1 = x0 + w, z1 = z0 + d, cx = (x0 + x1) / 2;
  const gz = [z0 + 11.5, z0 + 16, z0 + 20.5, z0 + 25];
  const cats = [[0, 1, 3], [4, 5, 11], [6, 7, 10], [8, 2, 9]];
  const gondolas = gz.map((z, k) => ({ x: cx, z, len: 26, depth: 1.2, alongX: true, cats: cats[k], faces: [1, -1] }));
  const sides = [
    { x: x0 + 0.95, z: (z0 + 9 + z1 - 3) / 2, len: z1 - 3 - z0 - 9, depth: 0.8, alongX: false, cats: [3, 2, 0], faces: [1] },
    { x: x1 - 0.95, z: (z0 + 9 + z1 - 3) / 2, len: z1 - 3 - z0 - 9, depth: 0.8, alongX: false, cats: [9, 6, 7], faces: [-1] },
  ];
  const chillers = [{ x: cx, z: z1 - 0.95, len: w - 8, depth: 1.0, alongX: true, cats: [8, 0, 1, 3], faces: [-1], chill: true }];
  const tills = [0, 1, 2].map((i) => ({ x: cx + 6 + 4.5 * i, z: z0 + 5.7, cashier: { x: cx + 6 + 4.5 * i, z: z0 + 3.0, yaw: 0 }, pay: { x: cx + 6 + 4.5 * i, z: z0 + 8.2 }, queue: { x: cx + 6 + 4.5 * i, z: z0 + 8.4 }, gap: cx + 6 + 4.5 * i - 2.25 }));
  const lanes = [z0 + 8.8, (gz[0] + gz[1]) / 2, (gz[1] + gz[2]) / 2, (gz[2] + gz[3]) / 2, gz[3] + 2.6];
  return { kind: 'supermarket', x0, x1, z0, z1, H: 5.2, cx, DW: 2.2, doorW: 4.4, gondolas, sides, chillers, tills, lanes, corrL: x0 + 5.2, corrR: x1 - 5.2, shoppers: 4, sign: 'shopsign3', accent: '#2fcf5a', cartPark: { x: cx - 8, z: z0 + 2.6 } };
}

function gasLayout() {
  const x0 = LOT0 + 14, w = 28, z0 = LOT0 + 38, d = 14, x1 = x0 + w, z1 = z0 + d, cx = (x0 + x1) / 2;
  const gondolas = [z0 + 6.4, z0 + 9.8].map((z, k) => ({ x: cx - 4, z, len: 14, depth: 1.0, alongX: true, cats: k ? [4, 5, 6] : [0, 1, 3], faces: [1, -1] }));
  const chillers = [{ x: cx, z: z1 - 0.95, len: w - 6, depth: 1.0, alongX: true, cats: [8, 0, 1, 2], faces: [-1], chill: true }];
  const tills = [{ x: cx + 7.5, z: z0 + 3.4, alongX: true, cashier: { x: cx + 7.5, z: z0 + 2.4, yaw: 0 }, pay: { x: cx + 7.5, z: z0 + 5.0 }, queue: { x: cx + 7.5, z: z0 + 5.2 }, gap: cx + 4.5 }];
  const lanes = [z0 + 4.6, (gondolas[0].z + gondolas[1].z) / 2, z0 + 11.9];
  return { kind: 'gas', x0, x1, z0, z1, H: 4.4, cx, DW: 1.8, doorW: 3.6, gondolas, sides: [], chillers, tills, lanes, corrL: x0 + 2.2, corrR: x1 - 2.2, shoppers: 2, sign: 'shopsign4', accent: '#ffd23a', cartPark: null };
}

function dealerLayout() {
  const x0 = LOT0 + 6, w = 50, z0 = LOT0 + 8, d = 18, x1 = x0 + w, z1 = z0 + d, cx = (x0 + x1) / 2;
  const cars = ['car_mini', 'car_sedan', 'car_suv', 'car_sport'].map((id, i) => ({ id, x: cx - 17 + i * 11.5, z: z0 + 10.6, yaw: [0.5, -0.4, 0.35, -0.5][i] + (i % 2 ? Math.PI : 0) * 0 }));
  return { kind: 'dealer', x0, x1, z0, z1, H: 5.6, cx, DW: 2.4, doorW: 4.8, cars, desk: { x: cx, z: z0 + 4.6 }, salesman: { x: cx, z: z0 + 5.9, yaw: Math.PI }, out: { x: cx + 18, z: LOT0 + 3.9, yaw: Math.PI / 2 }, sign: 'shopsign5', accent: '#35e6ff', gondolas: [], sides: [], chillers: [], tills: [], lanes: [], shoppers: 0 };
}

export const LAYOUT = { supermarket: marketLayout(), gas: gasLayout(), dealer: dealerLayout() };

/** deterministic product slots of a store (local coords) */
export function storeSlots(L, rnd) {
  const out = [];
  const addRow = (sh, face, fixed) => {
    const lv = sh.chill ? [0.4, 0.95, 1.5] : LEVELS;
    for (let li = 0; li < lv.length; li++) {
      const cat = sh.cats[(((li + (sh.cats.length > 3 ? (face > 0 ? 1 : 0) : 0)) % sh.cats.length) + sh.cats.length) % sh.cats.length];
      const pr = PRODUCTS[cat];
      const step = Math.max(0.2, (pr.shape === 'cyl' ? pr.r * 2 : pr.w) + 0.07);
      const n = Math.floor((sh.len - 0.5) / step);
      for (let k = 0; k < n; k++) {
        if (rnd() < 0.08) continue; // gaps
        const u = -sh.len / 2 + 0.3 + k * step;
        const off = (sh.depth / 2 - 0.3) * face;
        const col = pr.cols[Math.floor(rnd() * pr.cols.length)];
        if (sh.alongX) out.push({ x: sh.x + u, y: lv[li], z: sh.z + off, type: cat, col, face: face > 0 ? 0 : Math.PI, fx: 0, fz: face });
        else out.push({ x: sh.x + off, y: lv[li], z: sh.z + u, type: cat, col, face: face > 0 ? Math.PI / 2 : -Math.PI / 2, fx: face, fz: 0 });
      }
    }
  };
  for (const sh of [...L.gondolas, ...L.sides, ...L.chillers]) for (const f of sh.faces) addRow(sh, f);
  return out;
}

/** shopper route through the aisles: list of {x,z,pick?:{fx,fz,x,z}} in local coords */
export function shopperRoute(L, rnd, slots) {
  const r = [];
  const side = rnd() < 0.5 ? 'L' : 'R';
  let cxk = side === 'L' ? L.corrL : L.corrR;
  r.push({ x: L.cx, z: L.z0 - 4 }, { x: L.cx, z: L.z0 + 2.4 });
  const nl = L.lanes.length;
  let lane = Math.floor(rnd() * (nl - 1));
  const lanesToDo = 2 + Math.floor(rnd() * 2);
  r.push({ x: cxk, z: L.lanes[0] });
  for (let t = 0; t < lanesToDo && lane < nl; t++, lane++) {
    r.push({ x: cxk, z: L.lanes[lane] });
    const other = cxk === L.corrL ? L.corrR : L.corrL;
    const g0 = L.gondolas.length ? L.gondolas[0] : null;
    const half = g0 ? g0.len / 2 : 6;
    const picks = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < picks; k++) {
      const px = L.cx + (rnd() * 2 - 1) * (half - 1);
      // pick from the nearest slot facing this lane
      let best = null, bd = 1e9;
      for (const s of slots) { if (Math.abs(s.z - L.lanes[lane]) > 2.4 || s.y < 0.9 || Math.abs(s.x - px) > 2) continue; const d = Math.hypot(s.z - L.lanes[lane], s.x - px); if (d < bd) { bd = d; best = s; } }
      r.push({ x: px, z: L.lanes[lane], pick: best ? { x: best.x, z: best.z, y: best.y } : null });
    }
    r.push({ x: other, z: L.lanes[lane] });
    cxk = other;
    if (lane + 1 < nl) r.push({ x: cxk, z: L.lanes[lane + 1] });
  }
  return r;
}

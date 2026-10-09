// Die Map: Seestadt bei Nacht – Marktplatz, Häuserzeilen, Kirche, Feuerwerkswiese, See mit Lastkahn.
// Maßstab: 1 Einheit = 1 Meter. Blickrichtung zum See = -Z.
import * as THREE from 'three';
import {
  rng, grassTexture, cobbleTexture, asphaltTexture, paveTexture, roofTexture, glowTexture, facadeTile, woodTexture,
} from './textures.js';

export const WATER_Y = -1.2;
export const MOON_DIR = new THREE.Vector3(-0.35, 0.42, -0.84).normalize();
export const LAKE = { x0: -420, x1: 420, z0: -440, z1: -150 };
export const BARGE = { x: 0, z: -205, span: 28 };
export const PIER = { x0: -71, x1: -65, z0: -148, z1: -298 };

const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+17.; a*=.5; } return s; }
`;

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uMoon: { value: MOON_DIR } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform float uTime; uniform vec3 uMoon;
      ${NOISE_GLSL}
      float hash3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 zen = vec3(0.003,0.007,0.022);
        vec3 hor = vec3(0.022,0.034,0.07);
        vec3 col = mix(hor, zen, pow(clamp(h,0.,1.),0.45));
        // Lichtglocke der Stadt hinter dem Betrachter (+Z) und schwacher Schein überm See
        float town = pow(max(dot(normalize(d.xz+1e-4), vec2(0.,1.)),0.),2.5) * exp(-max(h,0.)*7.);
        col += vec3(0.11,0.065,0.03) * town * 0.9;
        col += vec3(0.01,0.018,0.04) * exp(-abs(h)*14.);
        // Sterne
        if (h > 0.0) {
          vec3 sp = d*260.; vec3 id = floor(sp); vec3 f = fract(sp)-.5;
          float r = hash3(id);
          vec3 off = vec3(hash3(id+1.7),hash3(id+3.1),hash3(id+5.9))-.5;
          float st = step(0.965, r) * smoothstep(0.32, 0.0, length(f-off*.55));
          float tw = 0.65 + 0.35*sin(uTime*(1.5+r*4.)+r*60.);
          col += vec3(0.8,0.88,1.0) * st * (r-0.96)*30. * tw * smoothstep(0.0,0.25,h);
        }
        // Mond (Sichel) + Halo
        float md = dot(d, uMoon);
        float disc = smoothstep(0.999950, 0.999957, md);
        vec3 m2 = normalize(uMoon + vec3(0.0055,0.0025,0.0));
        float cut = smoothstep(0.999950, 0.999957, dot(d, m2));
        col += vec3(1.0,0.97,0.88) * 1.5 * max(disc - cut, 0.0);
        col += vec3(0.5,0.62,0.9) * (pow(max(md,0.),2500.)*0.35 + pow(max(md,0.),60.)*0.04);
        // Wolken (fbm), vom Mond hinterleuchtet
        if (h > 0.01) {
          vec2 uv = d.xz/(h+0.22)*1.25 + vec2(uTime*0.004, uTime*0.0015);
          float c = smoothstep(0.52, 0.85, fbm(uv));
          float lit = pow(max(md,0.), 6.);
          vec3 cc = vec3(0.012,0.017,0.03) + vec3(0.06,0.075,0.11)*lit;
          cc += vec3(0.05,0.03,0.015)*town*0.6;
          col = mix(col, cc, c*0.8*smoothstep(0.01,0.12,h));
        }
        gl_FragColor = vec4(col,1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  mesh.renderOrder = -10;
  return mesh;
}

function makeWater(fw) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uMoon: { value: MOON_DIR },
      uFogColor: { value: new THREE.Color(0x070b16) },
      uFogDensity: { value: 0.0011 },
      uLP: { value: fw.lp },
      uLC: { value: fw.lc },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW; uniform float uTime; uniform vec3 uMoon; uniform vec3 uFogColor; uniform float uFogDensity;
      uniform vec4 uLP[4]; uniform vec3 uLC[4];
      ${NOISE_GLSL}
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        // Wellenneigung aus Rauschen
        vec2 p = vW.xz*0.35;
        float e = 0.08;
        float t = uTime*0.35;
        float n0 = fbm(p+vec2(t,t*0.6)), nx = fbm(p+vec2(e,0.)+vec2(t,t*0.6)), nz = fbm(p+vec2(0.,e)+vec2(t,t*0.6));
        vec3 N = normalize(vec3(-(nx-n0)/e*0.12, 1.0, -(nz-n0)/e*0.12));
        float fres = pow(1.0 - max(dot(N,V),0.0), 4.0);
        vec3 deep = vec3(0.006,0.013,0.022);
        vec3 skyc = vec3(0.025,0.04,0.075);
        vec3 col = mix(deep, skyc, fres*0.9 + 0.08);
        // Mondglitzern
        vec3 R = reflect(-V, N);
        float mg = pow(max(dot(R, uMoon),0.), 520.);
        float mg2 = pow(max(dot(R, uMoon),0.), 40.)*0.06;
        col += vec3(0.9,0.95,1.0)*(mg*1.6 + mg2*0.6);
        // Farbige Aufhellung durch Feuerwerks-Blitze
        for (int i=0;i<4;i++){
          vec3 dl = uLP[i].xyz - vW; float d2 = dot(dl,dl); float rr = uLP[i].w*uLP[i].w;
          float w = rr/(rr+d2);
          vec3 L = normalize(dl);
          float spec = pow(max(dot(reflect(-L,N),V),0.), 24.);
          col += uLC[i] * w * (0.05 + spec*0.35);
        }
        float d = length(cameraPosition - vW);
        float f = 1.0 - exp(-uFogDensity*uFogDensity*d*d);
        col = mix(col, uFogColor, f);
        gl_FragColor = vec4(col, 0.93);
      }`,
  });
  return mat;
}

function gableRoof(w, d, h, over = 0.5) {
  // Satteldach, First entlang X
  const hw = w / 2 + over, hd = d / 2 + over;
  const p = [
    // Vorderseite (+z)
    [-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, 0, hd], [hw, h, 0], [-hw, h, 0],
    // Rückseite (-z)
    [hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, 0, -hd], [-hw, h, 0], [hw, h, 0],
    // Giebel
    [-hw + over, 0, hd - over], [-hw + over, h, 0], [-hw + over, 0, -hd + over],
    [hw - over, 0, -hd + over], [hw - over, h, 0], [hw - over, 0, hd - over],
  ];
  const pos = new Float32Array(p.length * 3);
  const uv = new Float32Array(p.length * 2);
  p.forEach((v, i) => {
    pos.set(v, i * 3);
    uv[i * 2] = v[0] / 4;
    uv[i * 2 + 1] = v[1] / 4 + v[2] / 6;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function buildWorld(scene, fw, glow) {
  const world = { update() {}, lakeY: WATER_Y, water: null, sky: null };
  const rand = rng(2024);

  scene.background = new THREE.Color(0x03060d);
  scene.fog = new THREE.FogExp2(0x070b16, 0.0011);

  // ---- Licht ----
  scene.add(new THREE.HemisphereLight(0x2b3f6b, 0x0d0f14, 0.9));
  const moon = new THREE.DirectionalLight(0x8fa9e0, 0.9);
  moon.position.copy(MOON_DIR).multiplyScalar(300);
  scene.add(moon);

  // ---- Himmel ----
  world.sky = makeSky();
  scene.add(world.sky);

  // ---- Boden ----
  const grass = grassTexture([1, 1]);
  const ground = (x0, x1, z0, z1, tex, y = 0, tile = 10) => {
    const w = x1 - x0, d = z1 - z0;
    const t = tex.clone();
    t.repeat.set(w / tile, d / tile);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: 0x9aa89a }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    scene.add(m);
    return m;
  };
  const L = LAKE;
  ground(-1800, 1800, L.z1, 1800, grass); // vorderes Land (Wiese, Platz, Stadt)
  ground(-1800, L.x0, L.z0, L.z1, grass); // links vom See
  ground(L.x1, 1800, L.z0, L.z1, grass); // rechts vom See

  // Kaimauer und Uferwände (verdecken die Kante, wo das Land endet)
  const stone = new THREE.MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.9 });
  const wallBox = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 3.5, z1 - z0), stone);
    m.position.set((x0 + x1) / 2, -1.75, (z0 + z1) / 2);
    scene.add(m);
  };
  wallBox(L.x0, L.x1, L.z1 - 0.6, L.z1 + 0.2);
  wallBox(L.x0 - 0.8, L.x0 + 0.2, L.z0, L.z1);
  wallBox(L.x1 - 0.2, L.x1 + 0.8, L.z0, L.z1);
  wallBox(L.x0, L.x1, L.z0 - 0.4, L.z0 + 0.6);

  // Seeboden weit unten, damit die Spiegelung der Funken durch das Wasser sichtbar bleibt
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(L.x1 - L.x0 + 2, L.z1 - L.z0 + 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, -420, (L.z0 + L.z1) / 2);
  scene.add(bed);

  // Wasser
  const waterMat = makeWater(fw);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(L.x1 - L.x0, L.z1 - L.z0), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_Y, (L.z0 + L.z1) / 2);
  water.renderOrder = 1;
  scene.add(water);
  world.water = waterMat;

  // Gegenüberliegendes Ufer: Hügel
  {
    const seg = 90;
    const geo = new THREE.PlaneGeometry(2400, 1100, seg, 40);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const zz = p.getZ(i); // -550..550
      const zw = 550 - zz; // 0..1100 weg vom See (Welt-Z = z0 + 2 - zw)
      const n = Math.sin(x * 0.0061) * 0.5 + Math.sin(x * 0.0173 + 1.3) * 0.28 + Math.sin(x * 0.041 + zw * 0.02) * 0.12 + 0.6;
      let h = Math.max(0, zw - 8) * (0.06 + 0.16 * n) * (1 - Math.exp(-zw / 140));
      h = Math.min(h, 260 * (0.5 + n * 0.6));
      p.setY(i, zw < 8 ? -0.2 : h);
      const k = 0.5 + 0.5 * Math.sin(x * 0.05 + zw * 0.03);
      colors[i * 3] = 0.018 + 0.01 * k;
      colors[i * 3 + 1] = 0.03 + 0.02 * k;
      colors[i * 3 + 2] = 0.028 + 0.01 * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const hills = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    hills.position.set(0, 0, L.z0 - 550 + 2);
    scene.add(hills);
  }

  // ---- Plätze, Straßen ----
  const cobble = cobbleTexture([1, 1]);
  const asphalt = asphaltTexture([1, 1]);
  const pave = paveTexture([1, 1]);
  const decal = (x0, x1, z0, z1, tex, y, tile) => ground(x0, x1, z0, z1, tex, y, tile);
  decal(-92, 92, 8, 128, cobble, 0.03, 5); // Marktplatz
  decal(-92, 92, -149.5, -138, pave, 0.03, 3); // Uferpromenade
  decal(-30, 30, -140, 8, pave, 0.03, 3); // Weg zwischen Platz und Promenade
  decal(34, 94, -105, -12, asphalt, 0.03, 6); // Parkplatz
  decal(-98, 98, 128, 150, asphalt, 0.03, 6); // Straße hinter den Häusern

  // Fahrbahnmarkierungen auf dem Parkplatz
  {
    const lines = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 5), new THREE.MeshBasicMaterial({ color: 0x8a8a84 }), 24);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const row = i < 12 ? 0 : 1;
      m4.makeRotationX(-Math.PI / 2);
      m4.setPosition(38 + (i % 12) * 4.6, 0.04, row ? -68 : -48);
      lines.setMatrixAt(i, m4);
    }
    scene.add(lines);
  }

  // ---- Steg in den See (hier sieht man die Spiegelung der Bursts am besten) ----
  {
    const len = PIER.z0 - PIER.z1, w = PIER.x1 - PIER.x0, cx = (PIER.x0 + PIER.x1) / 2, cz = (PIER.z0 + PIER.z1) / 2;
    const wood = woodTexture([w / 3, len / 3]);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, len), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.95 }));
    deck.position.set(cx, -0.1, cz);
    scene.add(deck);
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x1d1610, roughness: 1 });
    const piles = [];
    for (let z = PIER.z0 - 2; z >= PIER.z1; z -= 6) piles.push([PIER.x0 + 0.3, z], [PIER.x1 - 0.3, z]);
    const pileMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.22, 4, 8), darkWood, piles.length);
    const m4 = new THREE.Matrix4();
    piles.forEach(([x, z], i) => { m4.makeTranslation(x, -1.6, z); pileMesh.setMatrixAt(i, m4); });
    scene.add(pileMesh);
    // Geländer
    const posts = [];
    for (let z = PIER.z0 - 1; z >= PIER.z1; z -= 3) posts.push([PIER.x0 + 0.1, z], [PIER.x1 - 0.1, z]);
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), darkWood, posts.length);
    posts.forEach(([x, z], i) => { m4.makeTranslation(x, 0.5, z); postMesh.setMatrixAt(i, m4); });
    scene.add(postMesh);
    for (const x of [PIER.x0 + 0.1, PIER.x1 - 0.1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, len), darkWood);
      rail.position.set(x, 1.0, cz);
      scene.add(rail);
    }
  }

  // ---- Gebäude ----
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.9 });
  const tiles = [];
  for (let floors = 3; floors <= 5; floors++) {
    for (let v = 0; v < 3; v++) tiles.push(facadeTile(floors * 31 + v * 7, floors, (floors + v * 2) | 0));
  }
  const bTiles = (floors) => tiles.filter((t) => Math.abs(t.height / 3.3 - floors) < 0.1);
  const wallMats = new Map();
  const wallMat = (tile, repeatX) => {
    const key = tile.map.uuid + repeatX.toFixed(2);
    if (!wallMats.has(key)) {
      const m = tile.map.clone();
      m.repeat.set(repeatX, 1);
      m.needsUpdate = true;
      const e = tile.emissive.clone();
      e.repeat.set(repeatX, 1);
      e.needsUpdate = true;
      wallMats.set(key, new THREE.MeshStandardMaterial({ map: m, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.92 }));
    }
    return wallMats.get(key);
  };
  const plain = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 1 });
  const chimMat = new THREE.MeshStandardMaterial({ color: 0x3b2c28, roughness: 1 });
  const lampPositions = [];

  function building(cx, cz, w, d, floors, rotY) {
    const set = bTiles(floors);
    const tile = set[(rand() * set.length) | 0];
    const h = tile.height;
    const g = new THREE.Group();
    const front = wallMat(tile, w / 12), side = wallMat(tile, d / 12);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, plain, plain, front, front]);
    box.position.y = h / 2;
    g.add(box);
    const rh = rr(2.8, 4.6);
    const roof = new THREE.Mesh(gableRoof(w, d, rh), roofMat);
    roof.position.y = h;
    g.add(roof);
    if (rand() < 0.7) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), chimMat);
      c.position.set(rr(-w / 3, w / 3), h + rh * 0.6, rr(-d / 6, d / 6));
      g.add(c);
    }
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    scene.add(g);
  }
  function rr(a, b) {
    return a + rand() * (b - a);
  }
  const floorsFor = () => 3 + ((rand() * 3) | 0);

  // Hintere Reihe (Front schaut Richtung -Z / See). Lücke für die Kirche.
  for (let x = -96; x < 96; ) {
    const w = rr(9, 15);
    if (x + w / 2 > -78 && x + w / 2 < -46) { x += 1; continue; }
    building(x + w / 2, 128 + 6.5, w, 13, floorsFor(), Math.PI);
    x += w;
  }
  // Linke Reihe (Front schaut +X)
  for (let z = 14; z < 126; ) {
    const w = rr(9, 15);
    building(-96 - 6.5, z + w / 2, w, 13, floorsFor(), Math.PI / 2);
    z += w;
  }
  // Rechte Reihe (Front schaut -X)
  for (let z = 14; z < 126; ) {
    const w = rr(9, 15);
    building(96 + 6.5, z + w / 2, w, 13, floorsFor(), -Math.PI / 2);
    z += w;
  }

  // Kirche
  {
    const cx = -62, cz = 128 + 20;
    const wall = new THREE.MeshStandardMaterial({ color: 0x9c978c, roughness: 0.95, emissive: 0x2a2012, emissiveIntensity: 0.6 });
    const g = new THREE.Group();
    const nave = new THREE.Mesh(new THREE.BoxGeometry(15, 15, 24), wall);
    nave.position.set(0, 7.5, 0);
    const naveRoof = new THREE.Mesh(gableRoof(24, 15, 7, 0.4), new THREE.MeshStandardMaterial({ color: 0x252a2e, roughness: 0.9 }));
    naveRoof.rotation.y = Math.PI / 2;
    naveRoof.position.set(0, 15, 0);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 38, 8), wall);
    tower.position.set(0, 19, 16);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(6, 18, 4), new THREE.MeshStandardMaterial({ color: 0x2c3a3a, roughness: 0.8 }));
    spire.rotation.y = Math.PI / 4;
    spire.position.set(0, 47, 16);
    g.add(nave, naveRoof, tower, spire);
    // Uhr + Fenster (leuchten)
    const clockMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    const clock = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), clockMat);
    clock.position.set(0, 31, 16 + 4.02);
    const hands = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.8), new THREE.MeshBasicMaterial({ color: 0x2a1f14 }));
    hands.position.set(-0.3, 31.5, 16 + 4.05);
    hands.rotation.z = -0.6;
    g.add(clock, hands);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffb860 });
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5), winMat);
      w.position.set(-7.52, 8, -8 + i * 5.5);
      w.rotation.y = -Math.PI / 2;
      const w2 = w.clone();
      w2.position.x = 7.52;
      w2.rotation.y = Math.PI / 2;
      g.add(w, w2);
    }
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6), new THREE.MeshBasicMaterial({ color: 0xffa24a }));
    portal.position.set(0, 3, 16 + 4.02);
    g.add(portal);
    g.position.set(cx, 0, cz);
    g.rotation.y = Math.PI;
    scene.add(g);
  }

  // ---- Brunnen / Denkmal auf dem Platz ----
  {
    const g = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.4, 0.9, 40), stone);
    basin.position.y = 0.45;
    const waterDisc = new THREE.Mesh(new THREE.CircleGeometry(4.7, 40), new THREE.MeshStandardMaterial({ color: 0x0a1a2a, roughness: 0.05, metalness: 0.3 }));
    waterDisc.rotation.x = -Math.PI / 2;
    waterDisc.position.y = 0.78;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 4.5, 16), stone);
    col.position.y = 2.6;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), stone);
    top.position.y = 5.2;
    g.add(basin, waterDisc, col, top);
    g.position.set(0, 0, 62);
    scene.add(g);
  }

  // ---- Laternen ----
  const lampSpots = [];
  for (let x = -80; x <= 80; x += 20) { lampSpots.push([x, 14], [x, 122]); }
  for (let z = 30; z <= 110; z += 20) { lampSpots.push([-86, z], [86, z]); }
  for (let x = -80; x <= 80; x += 20) lampSpots.push([x, -142]);
  for (let z = -120; z <= -30; z += 30) lampSpots.push([-24, z], [24, z]);
  for (let z = -175; z >= -295; z -= 30) lampSpots.push([PIER.x0 + 0.25, z], [PIER.x1 - 0.25, z]);
  {
    const n = lampSpots.length;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.5 }), n);
    const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), n);
    const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xffb561, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending,
    }), n);
    const m4 = new THREE.Matrix4();
    const glowPts = [];
    lampSpots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 2.6, z); pole.setMatrixAt(i, m4);
      m4.makeTranslation(x, 5.3, z); bulb.setMatrixAt(i, m4);
      m4.makeRotationX(-Math.PI / 2); m4.setPosition(x, 0.06, z); pool.setMatrixAt(i, m4);
      glowPts.push(x, 5.3, z);
    });
    scene.add(pole, bulb, pool);
    // Glühen der Laternen als Punktesprites (auch im See gespiegelt)
    lampPositions.push(...glowPts);
  }

  // ---- Bäume (instanziert) ----
  {
    const spots = [];
    for (let x = -84; x <= 84; x += 12) spots.push([x + rr(-1, 1), 118 + rr(-1, 1)]);
    for (let z = 20; z <= 110; z += 14) spots.push([-89 + rr(-1, 1), z], [89 + rr(-1, 1), z]);
    for (let z = -130; z <= -20; z += 14) spots.push([-60 + rr(-4, 4), z], [100 + rr(-4, 4), z]);
    for (let i = 0; i < 70; i++) spots.push([rr(-300, 300), rr(-140, -20)].map((v, k) => (k === 0 && Math.abs(v) < 45 ? v + 80 : v)));
    for (let i = spots.length - 1; i >= 0; i--) {
      const [x, z] = spots[i];
      if (x > 28 && x < 100 && z > -112 && z < -6) spots.splice(i, 1);
    }
    const n = spots.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 4, 7), new THREE.MeshStandardMaterial({ color: 0x2e2218, roughness: 1 }), n);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.2, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), n * 2);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 2, z);
      trunk.setMatrixAt(i, m4);
      const sc = rr(0.9, 1.5);
      for (let k = 0; k < 2; k++) {
        s.set(sc * rr(0.9, 1.2), sc * rr(0.9, 1.3), sc * rr(0.9, 1.2));
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
        m4.compose(new THREE.Vector3(x + rr(-0.5, 0.5), 5.5 + k * 2.2 * sc, z + rr(-0.5, 0.5)), q, s);
        crown.setMatrixAt(i * 2 + k, m4);
        const tint = rand();
        col.setRGB(0.06 + tint * 0.08, 0.12 + tint * 0.1, 0.05 + tint * 0.03);
        if (rand() < 0.18) col.setRGB(0.28 + rand() * 0.1, 0.12, 0.03); // Herbstlaub
        crown.setColorAt(i * 2 + k, col);
      }
    });
    scene.add(trunk, crown);
  }

  // ---- Parkende Autos ----
  {
    const spots = [];
    for (let i = 0; i < 12; i++) { if (rand() < 0.75) spots.push([40.5 + i * 4.6 + 2.3, -58, 0]); }
    for (let i = 0; i < 12; i++) { if (rand() < 0.75) spots.push([40.5 + i * 4.6 + 2.3, -38, Math.PI]); }
    for (let z = 36; z < 116; z += 7.5) { if (rand() < 0.55) spots.push([-87.5, z, Math.PI / 2]); if (rand() < 0.5) spots.push([87.5, z, -Math.PI / 2]); }
    const n = spots.length;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6 }), n);
    const cab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.1, metalness: 0.8 }), n);
    const wheel = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }), n * 4);
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2020 }), n * 2);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const cols = [0x8c1f1f, 0x1f3a8c, 0x2a2d30, 0xb8b8b8, 0xe6e6e6, 0x16573a, 0x6b4a1e, 0x0c0c0e, 0x7d8a96];
    spots.forEach(([x, z, ry], i) => {
      const rot = new THREE.Matrix4().makeRotationY(ry);
      const place = (lx, ly, lz, target, idx, extra) => {
        const m = new THREE.Matrix4().makeTranslation(lx, ly, lz);
        if (extra) m.multiply(extra);
        m4.copy(new THREE.Matrix4().makeTranslation(x, 0, z)).multiply(rot).multiply(m);
        target.setMatrixAt(idx, m4);
      };
      place(0, 0.62, 0, body, i);
      place(0, 1.2, -0.2, cab, i);
      let k = 0;
      for (const sx of [-0.88, 0.88]) for (const sz of [-1.3, 1.35]) place(sx, 0.34, sz, wheel, i * 4 + k++, new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      place(-0.6, 0.78, -2.1, lights, i * 2); place(0.6, 0.78, -2.1, lights, i * 2 + 1);
      col.setHex(cols[(rand() * cols.length) | 0]);
      body.setColorAt(i, col);
    });
    scene.add(body, cab, wheel, lights);
  }

  // ---- Absperrung der Feuerwerkswiese (Flatterband) ----
  {
    const posts = [];
    for (let x = -60; x <= 60; x += 5) posts.push(x);
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0xcfcfcf }), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach((x, i) => { m4.makeTranslation(x, 0.55, 4); post.setMatrixAt(i, m4); });
    const tapeTex = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 8;
      const g = c.getContext('2d');
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff' : '#d11a1a'; g.fillRect(i * 8, 0, 8, 8); }
      const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(30, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(120, 0.09), new THREE.MeshBasicMaterial({ map: tapeTex, side: THREE.DoubleSide }));
    tape.position.set(0, 1.0, 4);
    const tape2 = tape.clone();
    tape2.position.y = 0.65;
    scene.add(post, tape, tape2);
  }

  // ---- Publikum (Silhouetten) ----
  {
    const n = 90;
    const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.24, 0.85, 4, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), n);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.9 }), n);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = rr(-55, 55), z = rr(8, 21) + (i % 7 === 0 ? rr(-2, 40) : 0);
      const kid = rand() < 0.2 ? 0.7 : 1;
      m4.compose(new THREE.Vector3(x, 0.85 * kid, z), new THREE.Quaternion(), new THREE.Vector3(kid, kid, kid));
      body.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, 1.62 * kid, z), new THREE.Quaternion(), new THREE.Vector3(kid, kid, kid));
      head.setMatrixAt(i, m4);
      col.setHSL(rand(), 0.25, 0.1 + rand() * 0.12);
      body.setColorAt(i, col);
    }
    scene.add(body, head);
  }

  // ---- Lastkahn mit Mörserbatterien ----
  {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(BARGE.span * 2 + 8, 1.8, 14), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 }));
    hull.position.y = 0;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(BARGE.span * 2 + 7, 0.1, 13), new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 1 }));
    deck.position.y = 0.95;
    g.add(hull, deck);
    const tubeGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8);
    const tubes = new THREE.InstancedMesh(tubeGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.5 }), 6 * 20);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < 6; r++) for (let i = 0; i < 20; i++) {
      m4.makeTranslation(-BARGE.span + (i / 19) * BARGE.span * 2, 1.7, -4.5 + r * 1.8);
      tubes.setMatrixAt(k++, m4);
    }
    g.add(tubes);
    // Positionslichter
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-BARGE.span - 3, 3.2, 0);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20ff40 }));
    green.position.set(BARGE.span + 3, 3.2, 0);
    g.add(red, green);
    g.position.set(BARGE.x, WATER_Y + 0.5, BARGE.z);
    scene.add(g);
    fw.mortars[0] = { x: BARGE.x, y: WATER_Y + 2.4, z: BARGE.z };
    fw.bargeSpan = BARGE.span;
  }

  // ---- Lichter am Gegenufer + Laternenglühen (Sprites, gespiegelt im See) ----
  {
    const pts = [];
    const cols = [];
    const sizes = [];
    // Dörfer am Hang
    for (let i = 0; i < 520; i++) {
      const cluster = Math.floor(rand() * 7);
      const cxx = -380 + cluster * 125 + rr(-30, 30);
      const x = cxx + rr(-48, 48);
      const zz = LAKE.z0 - rr(12, 150);
      const y = Math.max(0.5, (LAKE.z0 - zz) * 0.12 * (0.6 + 0.3 * Math.sin(x * 0.03))) + rr(0, 4);
      pts.push(x, y, zz);
      const warm = rand() < 0.82;
      const k = 0.5 + rand() * 0.7;
      cols.push(warm ? 1.0 * k : 0.55 * k, warm ? 0.72 * k : 0.75 * k, warm ? 0.38 * k : 1.0 * k, 1);
      sizes.push(rr(1.4, 3));
    }
    // Uferbeleuchtung
    for (let x = -400; x < 400; x += 18) {
      pts.push(x + rr(-2, 2), 1.0, LAKE.z0 - 2);
      cols.push(1.0, 0.8, 0.5, 1);
      sizes.push(2.6);
    }
    // Laternen
    for (let i = 0; i < lampPositions.length; i += 3) {
      pts.push(lampPositions[i], lampPositions[i + 1], lampPositions[i + 2]);
      cols.push(1.2, 0.8, 0.45, 1);
      sizes.push(1.7);
    }
    // Schiffspositionslichter
    pts.push(-BARGE.span - 3, WATER_Y + 4, BARGE.z, BARGE.span + 3, WATER_Y + 4, BARGE.z);
    cols.push(2, 0.15, 0.1, 1, 0.1, 2, 0.3, 1);
    sizes.push(1.4, 1.4);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('aCol', new THREE.Float32BufferAttribute(cols, 4));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    // Material des Glow-Systems wiederverwenden (gleiche Shader)
    const lights = new THREE.Points(geo, glow.mesh.material);
    lights.frustumCulled = false;
    lights.renderOrder = 8;
    scene.add(lights);
    const mir = new THREE.Points(geo, glow.mirror.material);
    mir.frustumCulled = false;
    mir.position.y = 2 * WATER_Y;
    mir.scale.y = -1;
    mir.renderOrder = 8;
    scene.add(mir);
    world.lightSprites = [lights, mir];
  }

  glow.setWaterLevel(WATER_Y);

  world.update = (dt, t) => {
    world.sky.material.uniforms.uTime.value = t;
    waterMat.uniforms.uTime.value = t;
  };
  return world;
}

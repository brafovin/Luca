import * as THREE from 'three';

/** Interior mapping: the glass of every facade window shows a room behind it (floor, ceiling, walls, furniture) that parallaxes with the view */
function interiorMapping(mat, tower) {
  const gMin = tower ? 'vec2(0.0208, 0.26)' : 'vec2(0.3125, 0.3073)', gMax = tower ? 'vec2(0.9792, 0.979)' : 'vec2(0.6875, 0.797)';
  const bars = tower ? 'step(abs(cuv.x - 0.5), 0.0104)' : 'step(abs(cuv.x - 0.5), 0.0104) + step(abs(cuv.y - 0.6616), 0.0104)';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN;
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 pastel(float h){ return h < 0.2 ? vec3(0.95,0.78,0.42) : h < 0.4 ? vec3(0.55,0.78,0.58) : h < 0.6 ? vec3(0.62,0.58,0.88) : h < 0.8 ? vec3(0.92,0.52,0.42) : vec3(0.9,0.9,0.82); }
`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec2 cuv = fract(vMapUv * 4.0);
  float gI = step(${gMin}.x, cuv.x) * step(cuv.x, ${gMax}.x) * step(${gMin}.y, cuv.y) * step(cuv.y, ${gMax}.y);
  gI *= 1.0 - clamp(${bars}, 0.0, 1.0);
  gI *= 1.0 - step(0.55, diffuseColor.r);   // curtains / blinds stay painted
  if (gI > 0.5) diffuseColor.rgb = vec3(0.025, 0.03, 0.035);
`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  if (gI > 0.5) metalnessFactor *= 0.15;
`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (gI > 0.5) {
    vec3 N_ = normalize(vWN); vec3 T_ = vec3(N_.z, 0.0, -N_.x);
    vec3 rd = normalize(vWPos - cameraPosition);
    float oT = dot(vWPos, T_) - cuv.x * 3.2, oN = dot(vWPos, N_);
    float hr = h13(vec3(floor(oT * 4.0 + 0.5), floor(vMapUv.y * 4.0), floor(oN * 4.0 + 0.5)));
    float hr2 = fract(hr * 17.31), hr3 = fract(hr * 91.7);
    float Dz = 2.6 + hr2 * 1.6;
    vec3 org = vec3(cuv.x * 3.2, cuv.y * 3.2, 0.0);
    vec3 dir = vec3(dot(rd, T_), rd.y, -dot(rd, N_));
    dir.z = max(dir.z, 0.02);
    float tx = dir.x > 0.0 ? (3.2 - org.x) / dir.x : (0.0 - org.x) / dir.x;
    float ty = dir.y > 0.0 ? (3.2 - org.y) / dir.y : (0.0 - org.y) / dir.y;
    float tz = Dz / dir.z;
    float t = min(tz, min(tx, ty));
    vec3 hp = org + dir * t;
    vec3 wallC = pastel(hr), floorC = hr2 < 0.5 ? vec3(0.55, 0.40, 0.26) : vec3(0.62, 0.60, 0.56), ceilC = vec3(0.92);
    vec3 col; float sh = 1.0;
    if (t == tz) { // back wall with furniture
      col = wallC; vec2 q = vec2(hp.x / 3.2, hp.y / 3.2);
      if (hr3 < 0.34) { if (q.x > 0.08 && q.x < 0.42 && q.y < 0.82) { col = vec3(0.42, 0.28, 0.17); if (fract(q.y * 6.0) < 0.12) col *= 0.55; } if (q.x > 0.55 && q.x < 0.9 && q.y > 0.45 && q.y < 0.78) col = vec3(0.28, 0.42, 0.58); }
      else if (hr3 < 0.68) { if (q.x > 0.15 && q.x < 0.85 && q.y < 0.32) col = hr2 < 0.5 ? vec3(0.62, 0.28, 0.26) : vec3(0.3, 0.4, 0.56); if (q.x > 0.15 && q.x < 0.85 && q.y > 0.32 && q.y < 0.5) col = vec3(0.9, 0.88, 0.8); if (q.x > 0.3 && q.x < 0.7 && q.y > 0.62 && q.y < 0.86) col = vec3(0.8, 0.62, 0.3); }
      else { if (q.x > 0.1 && q.x < 0.55 && q.y < 0.3) col = vec3(0.45, 0.3, 0.2); if (q.x > 0.6 && q.x < 0.7 && q.y < 0.7) col = vec3(0.2, 0.2, 0.22); if (q.x > 0.56 && q.x < 0.74 && q.y > 0.7 && q.y < 0.82) col = vec3(1.0, 0.92, 0.7); }
      sh = 0.82;
    } else if (t == ty) { col = dir.y > 0.0 ? ceilC : floorC; if (dir.y > 0.0 && abs(hp.x - 1.6) < 0.4 && abs(hp.z - Dz * 0.5) < 0.4) col = vec3(2.0, 1.9, 1.6); if (dir.y < 0.0 && hr3 > 0.5 && abs(hp.x - 1.6) < 1.0 && abs(hp.z - Dz * 0.6) < 0.8) col = vec3(0.62, 0.3, 0.3); sh = 0.9; }
    else { col = wallC * (tx < 0.0 || dir.x < 0.0 ? 0.95 : 0.62); sh = 0.75; if (hr3 > 0.3 && hr3 < 0.6 && hp.z > 0.5 && hp.z < Dz * 0.55 && hp.y > 1.0 && hp.y < 2.2) col = vec3(0.35, 0.5, 0.65); }
    float lit = step(0.42, hr3 + hr2 * 0.3) < 0.5 ? 1.0 : 0.0;
    float n = clamp(emissive.r / 1.6, 0.0, 1.0);
    float bright = mix(0.55 + lit * 0.14, lit * 1.3 + 0.02, n);
    vec3 tint = mix(vec3(1.0), vec3(1.0, 0.84, 0.6), lit * n);
    totalEmissiveRadiance = col * sh * bright * tint * (1.0 - 0.45 * t / (Dz + 2.0));
  }
`);
  };
  mat.customProgramCacheKey = () => 'interior' + (tower ? 'T' : 'W');
}

export function createMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {};
  M.asphalt = std({ map: T.asphalt, bumpMap: T.asphaltBump, bumpScale: 1.2, roughness: 0.9, metalness: 0, vertexColors: true });
  M.lotAsphalt = M.asphalt.clone();
  M.lotAsphalt.polygonOffset = true; M.lotAsphalt.polygonOffsetFactor = -2; M.lotAsphalt.polygonOffsetUnits = -2;
  M.paver = std({ map: T.paver, roughness: 0.88, vertexColors: true });
  M.paver2 = M.paver.clone();
  M.paver2.polygonOffset = true; M.paver2.polygonOffsetFactor = -3; M.paver2.polygonOffsetUnits = -3;
  M.grass = std({ map: T.grass, roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.grassT = std({ map: T.grass, roughness: 1, vertexColors: true });
  M.runoff = std({ roughness: 0.96, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  M.mark = std({ color: 0xffffff, vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.generic = std({ vertexColors: true, roughness: 0.78, metalness: 0.05 });
  M.plain = std({ vertexColors: true, roughness: 0.92, metalness: 0 });
  M.roof = std({ map: T.roof, vertexColors: true, roughness: 0.82, metalness: 0.02 });
  M.foliage = std({ map: T.leaf, vertexColors: true, roughness: 0.92, metalness: 0 });
  { // trees sway in the wind (vertex shader), strongest in the canopy
    const wind = { value: 0 };
    M.foliage.userData.wind = wind;
    M.foliage.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz; float f = smoothstep(1.6, 6.5, transformed.y);
          transformed.x += (sin(uWind * 1.6 + wp.x * 0.31 + wp.z * 0.17) * 0.07 + sin(uWind * 3.3 + wp.z * 0.9 + wp.y) * 0.025) * f;
          transformed.z += (cos(uWind * 1.3 + wp.z * 0.27 + wp.x * 0.11) * 0.06 + sin(uWind * 2.9 + wp.x * 0.8) * 0.02) * f; }`);
    };
    M.foliage.customProgramCacheKey = () => 'foliageWind';
  }
  M.paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.5, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.07 }); // glossy clear-coated car paint
  M.carGlass = std({ color: 0x9db8cc, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, envMapIntensity: 1.6 });
  M.glass = std({ color: 0x6f869a, roughness: 0.07, metalness: 0.9, envMapIntensity: 1.25 });
  M.metal = std({ vertexColors: true, roughness: 0.35, metalness: 0.85 });
  M.water = std({ color: 0x2b5a72, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.4 });
  for (const k of ['plaster', 'brick', 'panel', 'glass']) {
    const f = T.facade[k];
    M['f_' + k] = std({
      map: f.map, roughnessMap: f.orm, metalnessMap: f.orm, roughness: 1, metalness: 1,
      bumpMap: f.bump, bumpScale: k === 'glass' ? 0.6 : 2.2,
      emissiveMap: f.emi, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true,
      envMapIntensity: k === 'glass' ? 1.4 : 1,
    });
  }
  for (const k of ['plaster', 'brick', 'panel']) interiorMapping(M['f_' + k], false);
  interiorMapping(M.f_glass, true);
  // lamp heads: warm emissive that is switched by night factor
  M.lampW = std({ color: 0xffffff, vertexColors: true, emissive: 0xffc67a, emissiveIntensity: 0, roughness: 0.4 });
  M.shopGlow = std({ color: 0xffffff, vertexColors: true, emissive: 0xffd49a, emissiveIntensity: 0, roughness: 0.6 });
  M.sign = std({ map: T.signs, transparent: false, alphaTest: 0.5, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide, vertexColors: true });
  M.poster = std({ map: T.poster, roughness: 0.6, vertexColors: true });
  M.shopSign = std({ map: T.shopSign, emissiveMap: T.shopSign, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.5 });
  M.shopSign2 = std({ map: T.shopSign2, emissiveMap: T.shopSign2, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.5 });
  for (const [k, t] of [['shopSign3', T.shopSign3], ['shopSign4', T.shopSign4], ['shopSign5', T.shopSign5], ['fuelPylon', T.fuelPylon]]) M[k] = std({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.5 });
  M.bright = std({ vertexColors: true, roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0.3 });
  M.lampG = std({ color: 0xffffff, vertexColors: true, emissive: 0x3dff9a, emissiveIntensity: 0.4, roughness: 0.4 });
  M.pool = new THREE.MeshBasicMaterial({ map: T.pool, color: 0xffb35c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  M.glowW = new THREE.PointsMaterial({ map: T.glow, color: 0xffc67a, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  M.glowG = new THREE.PointsMaterial({ map: T.glow, color: 0x3dff9a, size: 4, sizeAttenuation: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

  // traffic-light lamp discs: 6 lamps, uniform array of intensities (shared by all intersections)
  M.tlight = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uOn: { value: [0, 0, 0, 0, 0, 0] } }]),
    fog: true,
    vertexShader: `
      attribute vec3 color; attribute float lamp;
      varying vec3 vCol; varying float vLamp;
      #include <fog_pars_vertex>
      void main(){ vCol = color; vLamp = lamp;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uOn[6];
      varying vec3 vCol; varying float vLamp;
      #include <fog_pars_fragment>
      void main(){
        int i = int(vLamp + 0.5);
        float on = 0.0;
        for (int k = 0; k < 6; k++) if (k == i) on = uOn[k];
        vec3 c = vCol * (0.07 + on * 2.2);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  return M;
}

import * as THREE from 'three';

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
  M.mark = std({ color: 0xffffff, vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.generic = std({ vertexColors: true, roughness: 0.78, metalness: 0.05 });
  M.plain = std({ vertexColors: true, roughness: 0.92, metalness: 0 });
  M.roof = std({ map: T.roof, vertexColors: true, roughness: 0.82, metalness: 0.02 });
  M.foliage = std({ map: T.leaf, vertexColors: true, roughness: 0.92, metalness: 0 });
  M.paint = std({ vertexColors: true, roughness: 0.26, metalness: 0.55, envMapIntensity: 1.3 });
  M.glass = std({ color: 0x6f869a, roughness: 0.07, metalness: 0.9, envMapIntensity: 1.25 });
  M.metal = std({ vertexColors: true, roughness: 0.35, metalness: 0.85 });
  M.water = std({ color: 0x2b5a72, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.4 });
  for (const k of ['plaster', 'brick', 'panel', 'glass']) {
    const f = T.facade[k];
    M['f_' + k] = std({
      map: f.map, roughnessMap: f.orm, metalnessMap: f.orm, roughness: 1, metalness: 1,
      emissiveMap: f.emi, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true,
      envMapIntensity: k === 'glass' ? 1.4 : 1,
    });
  }
  // lamp heads: warm emissive that is switched by night factor
  M.lampW = std({ color: 0xffffff, vertexColors: true, emissive: 0xffc67a, emissiveIntensity: 0, roughness: 0.4 });
  M.shopGlow = std({ color: 0xffffff, vertexColors: true, emissive: 0xffd49a, emissiveIntensity: 0, roughness: 0.6 });
  M.sign = std({ map: T.signs, transparent: false, alphaTest: 0.5, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide, vertexColors: true });
  M.poster = std({ map: T.poster, roughness: 0.6, vertexColors: true });
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

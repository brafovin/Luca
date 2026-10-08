import * as THREE from 'three';

/** Distant backdrop that follows the camera: layered blue hills, a hazy skyline of towers (windows glow at night). Fades into the fog colour. */
export class Horizon {
  constructor(scene) {
    this.u = { uFog: { value: new THREE.Color(0xaaccee) }, uNight: { value: 0 }, uSun: { value: new THREE.Color(1, 0.95, 0.85) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uFog, uSun, uSunDir; uniform float uNight;
        varying vec3 vDir;
        float h11(float x){ return fract(sin(x * 127.1) * 43758.5453); }
        float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
        float fbm(float x){ return n1(x) * 0.55 + n1(x * 2.13 + 7.0) * 0.3 + n1(x * 4.7 + 3.0) * 0.15; }
        void main(){
          vec3 d = normalize(vDir);
          float a = atan(d.x, d.z), e = d.y;
          if (e < -0.002) discard;
          vec3 base = uFog;
          float day = 1.0 - uNight;
          vec3 col = base; float alpha = 0.0;
          // far mountain ridge, mid hills (hazy blue-green), low tree line
          float t0 = 0.020 + 0.085 * pow(fbm(a * 2.6 + 1.0), 1.4);
          float t1 = 0.010 + 0.050 * fbm(a * 4.2 + 9.0);
          float t2 = 0.004 + 0.016 * fbm(a * 14.0 + 21.0);
          vec3 c0 = mix(base, vec3(0.46, 0.57, 0.74) * (0.35 + 0.65 * day), 0.62);
          vec3 c1 = mix(base, vec3(0.34, 0.48, 0.46) * (0.3 + 0.7 * day), 0.7);
          vec3 c2 = mix(base, vec3(0.22, 0.34, 0.24) * (0.25 + 0.75 * day), 0.7);
          // snow / light on the far ridge towards the sun
          float sunSide = max(dot(normalize(vec2(d.x, d.z)), normalize(vec2(uSunDir.x, uSunDir.z) + 1e-4)), 0.0);
          c0 += uSun * 0.10 * sunSide * day * smoothstep(t0 - 0.03, t0, e);
          float a0 = smoothstep(t0, t0 - 0.0035, e);
          if (a0 > 0.0) { col = c0; alpha = a0; }
          float a1 = smoothstep(t1, t1 - 0.003, e);
          if (a1 > 0.0) { col = mix(col, c1, a1); alpha = max(alpha, a1); }
          // skyline of towers (a ring of thin boxes), hazy
          float cell = floor(a * 130.0);
          float hh = h11(cell + 3.0);
          float bw = fract(a * 130.0);
          float th = 0.004 + (hh > 0.74 ? 0.028 * h11(cell * 1.7) + 0.012 : 0.006 * hh);
          if (bw > 0.12 && bw < 0.88 && e < th && hh > 0.35) {
            vec3 cb = mix(base, vec3(0.42, 0.47, 0.54) * (0.3 + 0.7 * day), 0.55);
            // lit windows at night
            float wy = floor(e * 900.0), wx = floor(bw * 6.0);
            float lit = step(0.55, h11(cell * 13.0 + wy * 3.7 + wx * 5.1)) * uNight;
            cb += vec3(1.0, 0.8, 0.45) * lit * 0.55 * step(0.2, fract(e * 900.0)) * step(0.15, fract(bw * 6.0));
            col = mix(col, cb, 0.95); alpha = 1.0;
          }
          float a2 = smoothstep(t2, t2 - 0.0025, e);
          if (a2 > 0.0) { col = mix(col, c2, a2); alpha = max(alpha, a2); }
          // fade towards the horizon haze so it melts into the fog
          alpha *= smoothstep(0.0, 0.0035, e + 0.0015) ;
          col = mix(col, base, 0.22 * (1.0 - smoothstep(0.0, 0.05, e)));
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1100, 1100, 700, 48, 1, true), mat);
    this.mesh.position.y = 150;
    this.mesh.renderOrder = -990; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(camera, fogColor, night, sunDir, sunCol) {
    this.mesh.position.x = camera.position.x; this.mesh.position.z = camera.position.z;
    this.u.uFog.value.copy(fogColor); this.u.uNight.value = night;
    if (sunDir) this.u.uSunDir.value.copy(sunDir);
    if (sunCol) this.u.uSun.value.copy(sunCol);
  }
}

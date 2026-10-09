import * as THREE from 'three';

/** A pen-style vape: capsule body, mouthpiece, glowing LED ring. dir +1: mouthpiece at z=0 and the body extends towards +z (head-mounted); -1: extends towards -z (camera space). */
export function buildVape(dir = 1, scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x1a1b22, roughness: 0.3, metalness: 0.6 });
  const led = new THREE.MeshBasicMaterial({ color: 0x3a1a66, toneMapped: false });
  const cyl = (r, l, z, m) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 14).rotateX(Math.PI / 2), m); me.position.z = dir * z * scale; me.scale.set(scale, 1, scale); me.scale.z = 1; g.add(me); return me; };
  cyl(0.0075 * scale, 0.02 * scale, 0.01 * scale, new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.5 }));   // mouthpiece
  cyl(0.0125 * scale, 0.1 * scale, 0.07 * scale, body);                                                                  // body
  cyl(0.0132 * scale, 0.012 * scale, 0.13 * scale, led);                                                                 // LED ring at the end
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0125 * scale, 12, 8), body); cap.position.z = dir * 0.12 * scale; g.add(cap);
  const tip = new THREE.Object3D(); tip.position.z = dir * 0.0 * scale; g.add(tip);
  g.visible = false;
  return { group: g, led, tip };
}

// 机场场景：混凝土停机坪与直升机起降点、机库、塔台、跑道与助航灯、风向袋；与灾区同一时刻的黄昏光线。
import * as THREE from 'three';
import { M, triplanar, grime } from '../materials.js';
import { concrete, helipad, labelTexture } from '../textures.js';
import { makeNoise2D, mulberry32 } from '../util.js';
import { SUN_DIR, createSkyDome } from '../fx/atmosphere.js';
import { createHelicopter } from './helicopter.js';
import { createHuman } from './human.js';

export async function buildAirport(engine) {
  const scene = new THREE.Scene(); const rnd = mulberry32(99); const N = makeNoise2D(12);
  const dome = createSkyDome({ smoke: 0.35 }); scene.add(dome);
  scene.background = new THREE.Color(0x30343a);
  scene.fog = new THREE.FogExp2(0x7a828e, 0.0022);
  scene.add(new THREE.HemisphereLight(0x9aaccc, 0x4a3a2c, 1.15));
  const sun = new THREE.DirectionalLight(0xffc08a, 3.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  scene.add(sun); scene.add(sun.target);
  const focus = (x, y, z, size) => { sun.target.position.set(x, y, z); sun.position.set(x + SUN_DIR.x * 500, y + SUN_DIR.y * 500, z + SUN_DIR.z * 500); Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 50, far: 1200 }); sun.shadow.camera.updateProjectionMatrix(); };
  focus(0, 0, 0, 40);
  // 地面：草地/泥土起伏
  const gg = new THREE.PlaneGeometry(4000, 4000, 200, 200); gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position; for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), z = gp.getZ(i), d = Math.hypot(x, z); gp.setY(i, d < 260 ? -0.05 : (N.fbm(x * 0.003, z * 0.003, 4) * 0.5 + 0.5) * 40 * Math.min(1, (d - 260) / 400)); }
  gg.computeVertexNormals();
  const gt = concrete(61, 512, [92, 96, 70], 0.8, 0); gt.map.repeat.set(300, 300);
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: gt.map, roughness: 1 })); ground.receiveShadow = true; scene.add(ground);
  // 停机坪：带接缝的混凝土
  const apronTex = (() => { const c = concrete(62, 512, [128, 126, 120], 0.6, 2, 0.3); const cv = c.map.image; const x = cv.getContext('2d'); x.strokeStyle = 'rgba(40,38,36,0.6)'; x.lineWidth = 3; for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * 128, 0); x.lineTo(k * 128, 512); x.stroke(); x.beginPath(); x.moveTo(0, k * 128); x.lineTo(512, k * 128); x.stroke(); } c.map.needsUpdate = true; return c; })();
  apronTex.map.repeat.set(16, 12);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(200, 150).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: apronTex.map, normalMap: apronTex.normalMap, roughness: 0.85 }));
  apron.position.y = 0.01; apron.receiveShadow = true; scene.add(apron);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(13, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: helipad(), roughness: 0.8 })); pad.position.y = 0.02; pad.receiveShadow = true; scene.add(pad);
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd9a826, roughness: 0.7 });
  for (let k = 0; k < 40; k++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 3).rotateX(-Math.PI / 2), yellow); l.position.set(-14 - k * 4.2, 0.022, 0); l.rotation.y = Math.PI / 2; scene.add(l); }
  // 机库：箱体＋拱顶，波纹金属
  const corr = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); for (let i = 0; i < 256; i++) { const v = 150 + 40 * Math.sin(i / 256 * Math.PI * 32); x.fillStyle = `rgb(${v},${v + 2},${v + 6})`; x.fillRect(i, 0, 1, 64); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(6, 1); return t; })();
  const metal = grime(new THREE.MeshStandardMaterial({ map: corr, roughness: 0.45, metalness: 0.6 }));
  const hangar = new THREE.Group(); hangar.position.set(-62, 0, -48); scene.add(hangar);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(46, 12, 32), metal); hb.position.y = 6; hangar.add(hb);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(23.5, 23.5, 32, 32, 1, false, -Math.PI / 2, Math.PI), metal); roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI / 2; roof.scale.set(1, 1, 0.35); roof.position.y = 12; hangar.add(roof);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(36, 10), new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.6, emissive: 0xffd9a0, emissiveIntensity: 0.15 })); door.position.set(0, 5, 16.02); hangar.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: labelTexture('应急救援航空基地', { w: 1024, h: 160, font: 'bold 110px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif', color: '#f2f2ee' }), transparent: true }));
  sign.position.set(0, 13.5, 16.1); hangar.add(sign);
  // 塔台
  const tower = new THREE.Group(); tower.position.set(70, 0, -70); scene.add(tower);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 24, 20), grime(new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.8 }))); shaft.position.y = 12; tower.add(shaft);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 4.2, 4, 12), M.glass); cab.position.y = 26; tower.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.6, 12), M.darkMetal); cabRoof.position.y = 28.3; tower.add(cabRoof);
  // 跑道与灯
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(2400, 45).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.9 })); rw.position.set(0, 0.015, -190); rw.receiveShadow = true; scene.add(rw);
  const white = new THREE.MeshStandardMaterial({ color: 0xe0ddd5, roughness: 0.8 });
  for (let k = -40; k < 40; k++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.9).rotateX(-Math.PI / 2), white); l.position.set(k * 30, 0.02, -190); scene.add(l); }
  const lightGeo = new THREE.SphereGeometry(0.22, 8, 6); const blue = M.ledBlue.clone(); blue.emissiveIntensity = 10; const amber = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffc070, emissiveIntensity: 12 });
  const lights = new THREE.InstancedMesh(lightGeo, amber, 160); let li = 0; const m4 = new THREE.Matrix4();
  for (let k = -40; k < 40; k++) for (const s of [-1, 1]) { m4.makeTranslation(k * 30, 0.3, -190 + s * 23); lights.setMatrixAt(li++, m4); }
  scene.add(lights);
  const elights = new THREE.InstancedMesh(lightGeo, blue, 60); li = 0;
  for (let k = 0; k < 15; k++) for (const [x, z] of [[-100 + k * 14.3, 75], [-100 + k * 14.3, -75]]) { m4.makeTranslation(x, 0.25, z); elights.setMatrixAt(li++, m4); }
  for (let k = 0; k < 15; k++) for (const [x, z] of [[-100, -75 + k * 10.7], [100, -75 + k * 10.7]]) { if (li < 60) { m4.makeTranslation(x, 0.25, z); elights.setMatrixAt(li++, m4); } }
  scene.add(elights);
  // 风向袋
  const ws = new THREE.Group(); ws.position.set(40, 0, 30); scene.add(ws);
  const wpole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), M.metal); wpole.position.y = 3; ws.add(wpole);
  const sockTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 16; const x = c.getContext('2d'); for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#f4f4f0' : '#ff5a0a'; x.fillRect(i * 25.6, 0, 25.6, 16); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.45, 2.4, 16, 1, true), new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide, roughness: 0.8 }));
  sock.rotation.z = Math.PI / 2 - 0.25; sock.position.set(1.2, 5.6, 0); ws.add(sock);
  // 远处的树
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4f5a3c, roughness: 1, flatShading: true }), trunk = new THREE.MeshStandardMaterial({ color: 0x4b3f33, roughness: 1 });
  for (let k = 0; k < 90; k++) { const a = rnd() * Math.PI * 2, r = 150 + rnd() * 120; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z < -150 && z > -230) continue; const s = 0.8 + rnd(); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 3 * s, 6), trunk); tr.position.set(x, 1.5 * s, z); scene.add(tr); const c = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 * s, 1), leaf); c.position.set(x, 4.5 * s, z); scene.add(c); }
  scene.traverse((o) => { if (o.isMesh && o !== ground && o !== apron && o !== pad && o !== rw) { o.castShadow = true; o.receiveShadow = true; } });
  const heli = createHelicopter(); scene.add(heli.root);
  const crew = [0, 1, 2].map(() => { const h = createHuman(); scene.add(h.root); return h; });
  return { scene, dome, heli, crew, focus, update(t, cam) { dome.userData.follow(cam, t); } };
}

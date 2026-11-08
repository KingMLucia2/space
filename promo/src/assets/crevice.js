// 瓦砾缝隙特写：两块斜靠的楼板之间的黑暗缝隙，一束夕阳斜照进来，灰尘在光里飘落；缝底一部手机亮着来电界面。
import * as THREE from 'three';
import { M, triplanar, srgb } from '../materials.js';
import { concrete, softSprite } from '../textures.js';
import { mulberry32 } from '../util.js';
import { createParticles } from '../fx/particles.js';

export async function buildCrevice(engine) {
  const scene = new THREE.Scene(); const rnd = mulberry32(5);
  scene.background = new THREE.Color(0x050403);
  scene.fog = new THREE.FogExp2(0x0a0806, 0.25);
  scene.add(new THREE.HemisphereLight(0x3a4250, 0x0a0806, 0.25));
  const cTex = concrete(44, 512, [150, 145, 136], 0.8, 6, 0.5);
  const slab = triplanar(new THREE.MeshStandardMaterial({ map: cTex.map, roughness: 0.95 }), 1.6);
  const add = (geo, mat, p, r) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  add(new THREE.BoxGeometry(4, 0.2, 4), slab, [0, -0.1, 0], [0, 0, 0]);
  add(new THREE.BoxGeometry(2.6, 0.22, 1.8), slab, [-0.62, 0.55, 0.1], [0.05, 0.1, 1.05]);
  add(new THREE.BoxGeometry(2.4, 0.22, 1.9), slab, [0.66, 0.6, -0.05], [-0.04, -0.12, -1.0]);
  add(new THREE.BoxGeometry(1.6, 0.18, 1.2), slab, [0.1, 1.25, -0.7], [0.5, 0.3, 0.12]);
  // 碎块
  const rock = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2).toNonIndexed(); { const p = rock.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const d = 0.12 * Math.sin(7 * x + 3) * Math.sin(5 * y + 1) * Math.sin(6 * z + 2); p.setXYZ(i, x * (1 + d), y * (1 + d), z * (1 + d)); } rock.computeVertexNormals(); }
  const im = new THREE.InstancedMesh(rock, triplanar(new THREE.MeshStandardMaterial({ map: cTex.map, roughness: 0.95, flatShading: true }), 3), 260);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 260; i++) {
    const s = 0.02 + Math.pow(rnd(), 2) * 0.16; const x = (rnd() - 0.5) * 1.6, z = (rnd() - 0.5) * 1.4;
    if (Math.abs(x) < 0.12 && Math.abs(z) < 0.18) continue;
    q.setFromEuler(e.set(rnd() * 6, rnd() * 6, rnd() * 6)); m4.compose(new THREE.Vector3(x, s * 0.3, z), q, new THREE.Vector3(s, s * 0.7, s)); im.setMatrixAt(i, m4);
    const g = 0.3 + rnd() * 0.25; im.setColorAt(i, srgb(g, g * 0.96, g * 0.9));
  }
  im.castShadow = im.receiveShadow = true; scene.add(im);
  const rebar = add(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6), M.rebar, [-0.25, 0.45, -0.3], [0.4, 0, 0.9]);
  // 手机与来电界面
  const ui = document.createElement('canvas'); ui.width = 256; ui.height = 512; ui.getContext('2d', { willReadFrequently: true }); const uiTex = new THREE.CanvasTexture(ui); uiTex.colorSpace = THREE.SRGBColorSpace;
  const drawUI = (t) => {
    const x = ui.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#1d3a52'); g.addColorStop(1, '#0a1622'); x.fillStyle = g; x.fillRect(0, 0, 256, 512);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(128, 170, 60 + 18 * ((t * 1.2) % 1), 0, 7); x.fill();
    x.fillStyle = '#d9e6f0'; x.beginPath(); x.arc(128, 170, 52, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.font = 'bold 54px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif'; x.fillText('妈妈', 128, 300);
    x.font = '26px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif'; x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillText('来电…', 128, 345);
    x.fillStyle = '#e8eef4'; x.beginPath(); x.arc(70, 440, 30, 0, 7); x.fill(); x.beginPath(); x.arc(186, 440, 30, 0, 7); x.fill();
    uiTex.needsUpdate = true;
  };
  const phone = new THREE.Group(); phone.position.set(0.02, 0.012, 0.02); phone.rotation.set(0, 0.5, 0); scene.add(phone);
  const pb = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.009, 0.155), M.darkMetal); phone.add(pb);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveMap: uiTex, emissiveIntensity: 1.4 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.145), screenMat); scr.rotation.x = -Math.PI / 2; scr.position.y = 0.0047; phone.add(scr);
  const dustOn = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.15), new THREE.MeshBasicMaterial({ color: 0x9a948a, transparent: true, opacity: 0.25, depthWrite: false })); dustOn.rotation.x = -Math.PI / 2; dustOn.position.y = 0.0052; phone.add(dustOn);
  const glow = new THREE.PointLight(0x7fb0ff, 0.25, 0.6, 2); glow.position.set(0.02, 0.06, 0.02); scene.add(glow);
  // 夕阳从缝隙斜照进来：聚光 + 体积光锥
  const spot = new THREE.SpotLight(0xffb070, 30, 6, 0.22, 0.6, 1.5); spot.position.set(-0.6, 2.4, 0.9); spot.target.position.set(0.05, 0, -0.05); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); scene.add(spot); scene.add(spot.target);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.6, 24, 1, true), beamMat);
  beam.position.copy(spot.position).lerp(spot.target.position, 0.5); beam.lookAt(spot.target.position); beam.rotateX(Math.PI / 2); scene.add(beam);
  const dust = createParticles({ count: 260, seed: 3, map: softSprite(64), color: 0xffd0a0, opacity: 0.7, size: [0.004, 0.012], life: [4, 7], grow: 0.1, additive: true,
    spawn: (r) => { const k = r(); return [-0.6 + 0.65 * k + (r() - 0.5) * 0.25 * k, 2.4 - 2.4 * k, 0.9 - 0.95 * k + (r() - 0.5) * 0.25 * k]; }, vel: (r) => [(r() - 0.5) * 0.02, -0.04 - r() * 0.04, (r() - 0.5) * 0.02] });
  scene.add(dust);
  return { scene, phone, update(t, cam) { drawUI(t); dust.userData.update(t, scene, cam, 1080); } };
}

// 指挥中心：昏暗的房间，正面一块大屏显示灾区态势图（俯拍画面风格化 + 被困者红点/绿点 + 界面文字），
// 前排操作台和屏前人员背影。屏幕用着色器绘制圆点，镜头推到极近时边缘仍然清晰。
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { M } from '../materials.js';
import { MAP_GLSL } from '../fx/grade.js';
import { createHuman } from './human.js';
import { concrete, panelNormal } from '../textures.js';

export const SCREEN = { w: 8.0, h: 4.5, y: 2.75, z: -6 };

export async function buildCommand(engine, mapTexture, dotUVs) {
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020304);
  scene.fog = new THREE.FogExp2(0x0b1018, 0.035);
  scene.add(new THREE.HemisphereLight(0x25344a, 0x050505, 0.35));
  // 房间
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.7, metalness: 0.2, normalMap: panelNormal(512, [[0, 0.33, 1, 0.33], [0, 0.66, 1, 0.66], [0.25, 0, 0.25, 1], [0.5, 0, 0.5, 1], [0.75, 0, 0.75, 1]], [], 3) });
  wallMat.normalMap.wrapS = wallMat.normalMap.wrapT = THREE.RepeatWrapping; wallMat.normalMap.repeat.set(4, 2);
  const floorTex = concrete(71, 512, [40, 42, 46], 0.4, 0); floorTex.map.repeat.set(6, 6);
  const floorMat = new THREE.MeshPhysicalMaterial({ map: floorTex.map, roughness: 0.35, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; };
  box(16, 0.1, 18, 0, -0.05, 2, floorMat);
  box(16, 6.5, 0.2, 0, 3.25, SCREEN.z - 0.3, wallMat);
  box(0.2, 6.5, 18, -8, 3.25, 2, wallMat); box(0.2, 6.5, 18, 8, 3.25, 2, wallMat);
  box(16, 0.2, 18, 0, 6.5, 2, wallMat);
  const strip = M.ledBlue.clone(); strip.emissiveIntensity = 2.5;
  for (const s of [-1, 1]) box(0.05, 0.04, 16, s * 7.8, 6.3, 2, strip);
  // 大屏与边框
  const ui = document.createElement('canvas'); ui.width = 2048; ui.height = 1152; ui.getContext('2d', { willReadFrequently: true }); const uiTex = new THREE.CanvasTexture(ui); uiTex.colorSpace = THREE.NoColorSpace;
  const N = dotUVs.length;
  const screenMat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: mapTexture }, tUI: { value: uiTex }, uTime: { value: 0 }, uDots: { value: dotUVs.map((p) => new THREE.Vector2(p[0], p[1])) }, uState: { value: new Array(N).fill(0) }, uBright: { value: 2.2 }, uRadius: { value: 0.0085 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tMap, tUI; uniform float uTime, uBright, uRadius; uniform vec2 uDots[${N}]; uniform float uState[${N}]; varying vec2 vUv;
      ${MAP_GLSL}
      void main() {
        vec3 col = mapStyle(tMap, vUv, vec2(1.5 / 1920.0, 1.5 / 1080.0), uTime) * 1.1;
        for (int i = 0; i < ${N}; i++) {
          float st = uState[i]; if (st <= 0.0) continue;
          float appear = clamp(st, 0.0, 1.0); float g = clamp(st - 1.0, 0.0, 1.0);
          vec3 dc = mix(vec3(1.0, 0.1, 0.06), vec3(0.15, 1.0, 0.4), g);
          float d = length((vUv - uDots[i]) * vec2(16.0 / 9.0, 1.0));
          float R = uRadius * (0.6 + 0.4 * appear);
          float core = 1.0 - smoothstep(R * 0.92, R, d);
          float ph = fract(uTime * 0.8 + float(i) * 0.37);
          float ring = (1.0 - smoothstep(0.0, R * 0.25, abs(d - R * (1.2 + 2.6 * ph)))) * (1.0 - ph) * (1.0 - g * 0.7);
          col = mix(col, dc * 1.6, core * appear);
          col += dc * ring * 1.2 * appear;
        }
        vec4 u = texture2D(tUI, vUv); col = mix(col, u.rgb * 1.3, u.a);
        gl_FragColor = vec4(col * uBright, 1.0);
      }`,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat); screen.position.set(0, SCREEN.y, SCREEN.z); scene.add(screen);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.w + 0.3, SCREEN.h + 0.3, 0.12), M.darkMetal); bezel.position.set(0, SCREEN.y, SCREEN.z - 0.08); scene.add(bezel);
  const area = new THREE.RectAreaLight(0x8cc4ff, 3.2, SCREEN.w, SCREEN.h); area.position.set(0, SCREEN.y, SCREEN.z + 0.05); area.lookAt(0, SCREEN.y, 5); scene.add(area);
  // 操作台与小屏
  const deskMat = new THREE.MeshPhysicalMaterial({ color: 0x23272d, roughness: 0.4, metalness: 0.4, clearcoat: 0.5 });
  const monTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#04101c'; x.fillRect(0, 0, 256, 160); x.strokeStyle = '#2ea8ff'; x.lineWidth = 2; for (let k = 0; k < 6; k++) { x.globalAlpha = 0.4 + 0.1 * k; x.strokeRect(12 + k * 4, 14 + k * 20, 120 - k * 8, 12); } x.globalAlpha = 1; x.beginPath(); for (let i = 0; i < 100; i++) x.lineTo(140 + i, 110 - 30 * Math.abs(Math.sin(i * 0.2)) * Math.exp(-(((i % 25) - 5) ** 2) / 8)); x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const monMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveMap: monTex, emissiveIntensity: 1.6 });
  for (const row of [0, 1]) {
    const z = -1.2 + row * 3.0, y = row * 0.35;
    if (row) box(14, 0.35, 3, 0, 0.175, z + 0.3, deskMat);
    box(12, 0.08, 1.0, 0, 0.78 + y, z, deskMat); box(12, 0.75, 0.08, 0, 0.4 + y, z + 0.45, deskMat);
    for (let k = -4; k <= 4; k++) { const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.45), monMat); mon.position.set(k * 1.3, 1.1 + y, z - 0.15); mon.rotation.x = -0.15; scene.add(mon); const back = box(0.78, 0.48, 0.04, k * 1.3, 1.1 + y, z - 0.13, M.darkMetal); back.rotation.x = -0.15; }
  }
  // 人员背影
  const people = [[-1.6, 0.0, -0.2], [1.1, 0.0, -0.35], [3.4, 0.35, 2.2]].map(([x, y, z], i) => {
    const h = createHuman({ suit: i === 1 ? 0x1f2a3a : 0x23272e, pants: 0x15181c, helmet: 0x111214, skin: 0x8a6c58 });
    h.root.position.set(x, y, z); h.root.rotation.y = Math.PI + (i - 1) * 0.15; h.pose(0, 0); scene.add(h.root); return h;
  });
  scene.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; } });
  return { scene, screen, screenMat, ui, uiTex, people, area };
}

// 屏幕 UI 文字（标题、计数）
export function drawScreenUI(cmd, { title = '灾区生命探测态势', count = '', sub = '', t = 0 } = {}) {
  const c = cmd.ui, x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(4,14,26,0.75)'; x.fillRect(0, 0, c.width, 96);
  x.font = 'bold 54px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif'; x.fillStyle = '#bfe6ff'; x.textBaseline = 'middle';
  x.fillText(title, 48, 50);
  x.font = '36px "Noto Sans SC","WenQuanYi Zen Hei",monospace'; x.fillStyle = '#6fb8e8';
  x.fillText(sub, 900, 52);
  if (count) { x.fillStyle = 'rgba(4,14,26,0.78)'; x.fillRect(c.width - 620, c.height - 150, 572, 104); x.strokeStyle = '#3aa8ff'; x.lineWidth = 3; x.strokeRect(c.width - 620, c.height - 150, 572, 104); x.font = 'bold 58px "Noto Sans SC","WenQuanYi Zen Hei",sans-serif'; x.fillStyle = '#e8f6ff'; x.fillText(count, c.width - 590, c.height - 96); }
  x.strokeStyle = 'rgba(80,170,255,0.6)'; x.lineWidth = 4; const L = 60;
  for (const [cx, cy, sx, sy] of [[24, 120, 1, 1], [c.width - 24, 120, -1, 1], [24, c.height - 24, 1, -1], [c.width - 24, c.height - 24, -1, -1]]) { x.beginPath(); x.moveTo(cx, cy + sy * L); x.lineTo(cx, cy); x.lineTo(cx + sx * L, cy); x.stroke(); }
  cmd.uiTex.needsUpdate = true;
}

// 第四版渲染引擎：three.js 场景图 + 物理材质（PBR）。
// 画风参考“产品拆解仿真器”：暖白底、柔和棚拍光与软阴影、白色亮面外壳＋黑色机械件＋橙色点缀，远景用同色雾气淡出（白模沙盘）。
// 模型在首次使用时构建一次，之后每帧只更新变换和可见性（不再像第二、三版那样每帧重画图元）。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

export { THREE };
export const W = 1920, H = 1080;
export const COL = { bg: '#f2efea', bg2: '#e7e2da', ink: '#1d1e21', ink2: '#5b5d63', line: '#c9c4bb', orange: '#ec4e26', red: '#e5322d', green: '#1fa968', amber: '#f59a23', white: '#f6f4f0' };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const mkCanvas = mk;

// —— 渲染器 ——
export const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
export const glCanvas = renderer.domElement;

export const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
export const ENV = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
scene.environment = ENV; scene.environmentIntensity = 0.9;
// 背景：暖白径向渐变（中心略亮）
const bgC = mk(512, 288); { const g = bgC.getContext('2d'); const gr = g.createRadialGradient(256, 130, 20, 256, 144, 330); gr.addColorStop(0, '#f7f5f1'); gr.addColorStop(1, '#e9e5de'); g.fillStyle = gr; g.fillRect(0, 0, 512, 288); }
export const BG_TEX = new THREE.CanvasTexture(bgC); BG_TEX.colorSpace = THREE.SRGBColorSpace;
scene.background = BG_TEX;
export const FOG = new THREE.Fog(new THREE.Color(COL.bg), 60, 900); scene.fog = FOG;

// —— 灯光：天光＋主光（投影）＋补光 ——
export const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d2c6, 0.55); scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfffaf2, 2.0); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
export const fill = new THREE.DirectionalLight(0xe8f0ff, 0.45); fill.position.set(-4, 2, -3); scene.add(fill);
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.32).normalize();
// 阴影范围：以 center 为中心、size 米见方
export function setShadow(center, size = 8, dir = SUN_DIR) {
  const c = new THREE.Vector3(...center); const d = size * 1.5;
  sun.position.copy(c).addScaledVector(dir, d * 2); sun.target.position.copy(c); sun.target.updateMatrixWorld();
  const s = sun.shadow.camera; s.left = -size / 2; s.right = size / 2; s.top = size / 2; s.bottom = -size / 2; s.near = 0.1; s.far = d * 4; s.updateProjectionMatrix();
  sun.shadow.normalBias = 0.004 * size;
}

// —— 相机（接口与第三版一致，方便沿用镜头路径） ——
export const cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 6000);
export function setCam(pos, target, fov = 40, up = [0, 1, 0]) { cam.position.set(...pos); cam.up.set(...up); cam.lookAt(...target); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); }
export function setCamYPR(pos, yaw, pitch, roll = 0, fov = 40) { cam.position.set(...pos); cam.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); }
const _v = new THREE.Vector3();
export function project(p) { _v.set(p[0], p[1], p[2]).applyMatrix4(cam.matrixWorldInverse); if (_v.z > -cam.near) return null; const d = -_v.z; _v.set(p[0], p[1], p[2]).project(cam); return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, d }; }
export const pxPerMeter = (d) => (H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / d;

// —— 后期：多重采样渲染目标 → 输出（色彩空间转换） ——
const MSAA = +(new URLSearchParams(location.search).get('msaa') ?? 4);
const RT_TYPE = new URLSearchParams(location.search).get('hf') === '1' ? THREE.HalfFloatType : THREE.UnsignedByteType;
const rt = new THREE.WebGLRenderTarget(W, H, { samples: MSAA, type: RT_TYPE });
export const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, cam));
export const AO = new GTAOPass(scene, cam, W, H); AO.enabled = new URLSearchParams(location.search).get('ao') === '1'; AO.updateGtaoMaterial({ radius: 0.25, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 12 }); AO.blendIntensity = 0.85; composer.addPass(AO);
// 移轴（沙盘微缩感）：画面上下带状模糊，焦点带位置 r（0 底 ~ 1 顶），强度 k
export const TILT = { on: false, r: 0.5, k: 1 };
const tiltH = new ShaderPass(HorizontalTiltShiftShader), tiltV = new ShaderPass(VerticalTiltShiftShader); composer.addPass(tiltH); composer.addPass(tiltV);
composer.addPass(new OutputPass());

// —— 接触阴影（棚拍）：从地面下方正交相机渲染深度，模糊后贴在地面上，得到很柔的落地阴影 ——
export const CS = { on: false, size: 6, y: 0, opacity: 0.55, darkness: 1.4, blur: 2.2, height: 2.4, center: [0, 0] };
const csRT = new THREE.WebGLRenderTarget(512, 512), csRT2 = new THREE.WebGLRenderTarget(512, 512); csRT.texture.generateMipmaps = csRT2.texture.generateMipmaps = false;
const csPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: csRT.texture, transparent: true, depthWrite: false, fog: false }));
csPlane.material.map.flipY = false; scene.add(csPlane); csPlane.renderOrder = -1;
const csCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1); csCam.rotation.x = Math.PI / 2; scene.add(csCam);
const csDepth = new THREE.MeshDepthMaterial(); csDepth.userData.dark = { value: 1 };
csDepth.onBeforeCompile = (sh) => { sh.uniforms.darkness = csDepth.userData.dark; sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );'); };
csDepth.depthTest = false; csDepth.depthWrite = false;
const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader), vBlur = new THREE.ShaderMaterial(VerticalBlurShader); hBlur.depthTest = vBlur.depthTest = false;
const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); const blurScene = new THREE.Scene(); blurScene.add(blurQuad); const orthoQ = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function contactShadows() {
  csPlane.visible = CS.on; if (!CS.on) return;
  const s = CS.size; csPlane.scale.set(s, 1, s); csPlane.position.set(CS.center[0], CS.y + 0.001, CS.center[1]); csPlane.material.opacity = CS.opacity;
  csCam.left = -s / 2; csCam.right = s / 2; csCam.top = s / 2; csCam.bottom = -s / 2; csCam.near = 0; csCam.far = CS.height; csCam.position.set(CS.center[0], CS.y, CS.center[1]); csCam.updateProjectionMatrix(); csCam.updateMatrixWorld();
  const bg = scene.background, fog = scene.fog; scene.background = null; scene.fog = null; scene.overrideMaterial = csDepth; csDepth.userData.dark.value = CS.darkness; csPlane.visible = false;
  const hidden = []; scene.traverse((o) => { if (o.visible && (o.isSprite || o.isPoints || (o.isMesh && o.material && o.material.transparent))) { hidden.push(o); o.visible = false; } });
  renderer.setRenderTarget(csRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, csCam);
  for (const o of hidden) o.visible = true; scene.overrideMaterial = null; scene.background = bg; scene.fog = fog; csPlane.visible = true;
  for (let i = 0; i < 2; i++) { blurQuad.material = hBlur; hBlur.uniforms.tDiffuse.value = csRT.texture; hBlur.uniforms.h.value = CS.blur / 256 * (i + 1); renderer.setRenderTarget(csRT2); renderer.render(blurScene, orthoQ);
    blurQuad.material = vBlur; vBlur.uniforms.tDiffuse.value = csRT2.texture; vBlur.uniforms.v.value = CS.blur / 256 * (i + 1); renderer.setRenderTarget(csRT); renderer.render(blurScene, orthoQ); }
  renderer.setRenderTarget(null);
}
export function setLook(kind) { // 'studio'：棚拍（接触阴影、主光不投影）；'table'：沙盘（太阳投影、移轴）
  if (kind === 'studio') { CS.on = true; sun.castShadow = false; TILT.on = false; sun.intensity = 2.0; hemi.intensity = 0.55; scene.environmentIntensity = 0.9; }
  else { CS.on = false; sun.castShadow = true; TILT.on = kind === 'table'; sun.intensity = 2.1; hemi.intensity = 0.32; scene.environmentIntensity = 0.42; }
}

// —— 每帧状态：注册的动态对象在帧开始时隐藏，镜头里用到的再显示 ——
const DYN = new Set();
export function dyn(obj) { DYN.add(obj); obj.visible = false; scene.add(obj); return obj; }
const POOLS = [];
// 对象池：同一帧里需要多个同类模型时用（例如几个人物、几架无人机）
export function pool(factory) { const p = { items: [], used: 0, get() { let o = this.items[this.used]; if (!o) { o = factory(); this.items.push(o); } this.used++; return o; } }; POOLS.push(p); return p; }
export const FRAME = { t: 0 };
export function beginFrame() {
  for (const o of DYN) o.visible = false; for (const p of POOLS) p.used = 0;
  FOG.near = 60; FOG.far = 900; scene.background = BG_TEX; scene.environmentIntensity = 0.9; hemi.intensity = 0.55; sun.intensity = 2.0; fill.intensity = 0.45;
  cam.near = 0.05; cam.clearViewOffset(); cam.updateProjectionMatrix(); setLook('studio'); CS.size = 6; CS.center = [0, 0]; CS.y = 0; CS.opacity = 0.55; TILT.r = 0.5; TILT.k = 1;
}
export function renderGL() {
  contactShadows();
  tiltH.enabled = tiltV.enabled = TILT.on; if (TILT.on) { tiltH.uniforms.h.value = 1.6 * TILT.k / W; tiltV.uniforms.v.value = 1.6 * TILT.k / H; tiltH.uniforms.r.value = tiltV.uniforms.r.value = TILT.r; }
  composer.render();
}

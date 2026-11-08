// 渲染主程序：渲染器、后期通道、HUD 画布、场景集与镜头调度。对外暴露 window.prepare / window.frame 供逐帧渲染脚本调用。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { installFog, LensPass, SUN_DIR } from './fx/atmosphere.js';
import { initMaterials } from './materials.js';
import { GradeShader } from './fx/grade.js';
import { SHOTS } from './shots.js';

installFog();
const params = new URLSearchParams(location.search);
export const W = +params.get('w') || 1920, H = +params.get('h') || 1080;
export const FPS = 24;

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.shadowMap.enabled = !params.has('noshadow'); renderer.shadowMap.type = params.has('pcfsoft') ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
initMaterials();

const samples = params.has('msaa') ? +params.get('msaa') : 0;
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples }));
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.45, 0.5, 1.1);
const grade = new ShaderPass(GradeShader);
// 环境光遮蔽（按镜头开关）与景深（近景用）
const gtao = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), W / 2, H / 2); // 半分辨率计算，省一半以上开销
gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 1.0;
const bokeh = new BokehPass(new THREE.Scene(), new THREE.PerspectiveCamera(), { focus: 5, aperture: 0.002, maxblur: 0.008 });
const lens = new LensPass(W, H);
const fxaa = new ShaderPass(FXAAShader); fxaa.uniforms.resolution.value.set(1 / W, 1 / H);
composer.addPass(renderPass); composer.addPass(gtao); composer.addPass(bokeh); composer.addPass(bloom); composer.addPass(lens); composer.addPass(new OutputPass()); composer.addPass(fxaa); composer.addPass(grade);

const hudCanvas = document.createElement('canvas'); hudCanvas.width = W; hudCanvas.height = H;
const hud = hudCanvas.getContext('2d', { willReadFrequently: true });
const hudTex = new THREE.CanvasTexture(hudCanvas); hudTex.colorSpace = THREE.NoColorSpace;
grade.uniforms.tHud.value = hudTex; grade.uniforms.uRes.value = [W, H];

const GRADE_DEFAULT = { uSat: 0.92, uContrast: 1.1, uVignette: 0.5, uGrain: 0.045, uCA: 0.0022, uLift: [0.0, 0.018, 0.035], uGain: [1.06, 1.0, 0.92], uBars: 0.105, uFade: 0, uFadeColor: [0, 0, 0], uFlash: 0, uHud: 1, uThermal: 0, uMap: 0, uZoomBlur: 0, uZoomCenter: [0.5, 0.5], uScan: 0 };

const sets = {};
export const engine = {
  THREE, renderer, composer, bloom, grade, hud, hudCanvas, W, H, FPS,
  camera: new THREE.PerspectiveCamera(35, W / H, 0.05, 6000),
  // 场景集按需构建并缓存
  async getSet(name, builder) {
    if (!sets[name]) sets[name] = await builder(engine);
    return sets[name];
  },
};

let current = null;
// 预加载中文字体（canvas 文字需要字体先加载好）
const FONT_TEXT = '灾区生命探测态势侦测完成已救出人空中侦察测绘热成像生命探测雷达红外发现生命体征埋深置信度呼吸次分心率六合空地协同搜救系统上天入地不放弃每一个应急救援航空基地基站妈妈来电RESCUE0123456789·/:';
const fontsReady = Promise.all(['400', '500', '700'].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, FONT_TEXT))).catch(() => null);
window.prepare = async (shotId) => {
  await fontsReady;
  const shot = SHOTS.find((s) => s.id === shotId);
  if (!shot) throw new Error('unknown shot ' + shotId);
  if (shot.prepare) await shot.prepare(engine);
  current = shot;
  return { frames: Math.round(shot.dur * FPS), dur: shot.dur };
};

window.frame = (shotId, f) => {
  const shot = current && current.id === shotId ? current : SHOTS.find((s) => s.id === shotId);
  const t = f / FPS;
  Object.entries(GRADE_DEFAULT).forEach(([k, v]) => { grade.uniforms[k].value = Array.isArray(v) ? [...v] : v; });
  grade.uniforms.uTime.value = t;
  bloom.strength = 0.45; bloom.radius = 0.5; bloom.threshold = 1.1;
  renderer.toneMappingExposure = 1.0;
  hud.setTransform(1, 0, 0, 1, 0, 0); hud.clearRect(0, 0, W, H); hud.setTransform(W / 1920, 0, 0, H / 1080, 0, 0); // 界面层统一按 1920×1080 设计坐标绘制
  const cam = engine.camera; cam.fov = 35; cam.near = 0.05; cam.far = 6000; cam.up.set(0, 1, 0);
  const g = new Proxy(grade.uniforms, { get: (o, k) => o[k].value, set: (o, k, v) => { o[k].value = v; return true; } });
  const ctx = { engine, cam, hud, grade: g, f, shot, ao: null, dof: null, rays: 0.9, streaks: 0.35 };
  const scene = shot.update(t, ctx);
  cam.aspect = W / H; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  // 太阳的屏幕位置：在画面附近时打开体积光
  const sp = cam.position.clone().addScaledVector(SUN_DIR, 1000).project(cam);
  const facing = cam.getWorldDirection(new THREE.Vector3()).dot(SUN_DIR);
  lens.sunUv.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
  const inFrame = Math.abs(sp.x) < 1 && Math.abs(sp.y) < 1;
  lens.rays = facing > 0.1 && Math.abs(sp.x) < 2.2 && Math.abs(sp.y) < 2.2 ? ctx.rays * Math.min(1, (facing - 0.1) * 3) * (inFrame ? 0.45 : 1) : 0;
  lens.streaks = ctx.streaks; lens.enabled = !params.has('nolens');
  if (params.has('nopost')) { bloom.enabled = false; lens.enabled = false; fxaa.enabled = false; }
  if (params.has('noenv')) scene.environment = null;
  if (params.has('noao')) ctx.ao = null; if (params.has('nodof')) ctx.dof = null;
  gtao.enabled = !!ctx.ao; bokeh.enabled = !!ctx.dof;
  if (ctx.ao) {
    gtao.scene = scene; gtao.camera = cam;
    gtao.updateGtaoMaterial({ radius: ctx.ao.radius ?? 0.5, distanceExponent: 1, thickness: ctx.ao.thickness ?? 1, scale: 1, samples: 12, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    gtao.blendIntensity = ctx.ao.intensity ?? 1;
  }
  if (ctx.dof) {
    bokeh.scene = scene; bokeh.camera = cam;
    bokeh.uniforms.focus.value = ctx.dof.focus; bokeh.uniforms.aperture.value = ctx.dof.aperture ?? 0.002; bokeh.uniforms.maxblur.value = ctx.dof.maxblur ?? 0.008;
    bokeh.uniforms.nearClip.value = cam.near; bokeh.uniforms.farClip.value = cam.far; bokeh.uniforms.aspect.value = cam.aspect;
  }
  hudTex.needsUpdate = true;
  if (params.has('hudlog')) { const d = hud.getImageData(0, 0, W, H).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i] > 0) n++; console.warn('hud nonzero samples', shotId, n); }
  renderPass.scene = scene; renderPass.camera = cam;
  composer.render();
  return true;
};

window.shotList = () => SHOTS.map((s) => ({ id: s.id, dur: s.dur }));
// 性能分析：返回渲染一帧的耗时（用 1 像素回读强制等待 GPU 完成）与绘制统计
window.profile = (shotId, f, n = 3) => {
  const gl = renderer.getContext(); const px = new Uint8Array(4);
  window.frame(shotId, f); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { window.frame(shotId, f + i); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const info = renderer.info.render;
  return { ms: Math.round((performance.now() - t0) / n), calls: info.calls, tris: info.triangles, points: info.points };
};
window.ready = true;

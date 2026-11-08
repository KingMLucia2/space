// 大气与光线：替换 three.js 的雾函数为“高度雾 + 太阳散射”，程序化黄昏天空穹顶，以及体积光（god rays）/横向光斑镜头通道。
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// 全片统一的太阳方向（指向太阳）：西南方低空，仰角约 11°
export const SUN_DIR = new THREE.Vector3(-0.74, 0.36, 0.56).normalize();
export const SUN_COLOR = new THREE.Color(1.0, 0.62, 0.34);
const v3 = (v) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

// 必须在任何材质编译之前调用
export function installFog() {
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
    varying float vFogDepth; varying vec3 vFogWorld;
  #endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vec4 fogW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      fogW = instanceMatrix * fogW;
    #endif
    vFogWorld = (modelMatrix * fogW).xyz;
  #endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear; uniform float fogFar;
    #endif
  #endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
    vec3 fogRay = vFogWorld - cameraPosition; float fogDist = length(fogRay); vec3 fogDir = fogRay / max(fogDist, 1e-3);
    #ifdef FOG_EXP2
      const float FH = 38.0;
      float h0 = max(cameraPosition.y, 0.0), h1 = max(vFogWorld.y, 0.0), dh = h1 - h0;
      float hf = abs(dh) < 0.05 ? exp(-h0 / FH) : FH * (exp(-h0 / FH) - exp(-h1 / FH)) / dh;
      float fogFactor = 1.0 - exp(-fogDensity * fogDist * (0.35 + 0.65 * hf));
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    float sunAmt = max(dot(fogDir, ${v3(SUN_DIR)}), 0.0);
    vec3 fogCol = fogColor + vec3(1.25, 0.78, 0.42) * (pow(sunAmt, 6.0) * 0.35 + pow(sunAmt, 48.0) * 0.6);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogFactor, 0.0, 1.0));
  #endif`;
}

const NOISE = /* glsl */`
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s / 0.9375; }
`;

// 黄昏天空穹顶：地平线暖、天顶冷、太阳光晕和日轮、被夕阳勾边的烟云
export function createSkyDome({ zenith = [0.2, 0.27, 0.38], horizon = [0.58, 0.56, 0.54], glow = [1.3, 0.75, 0.4], smoke = 0.7 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR.clone() }, uZenith: { value: new THREE.Vector3(...zenith) }, uHorizon: { value: new THREE.Vector3(...horizon) }, uGlow: { value: new THREE.Vector3(...glow) }, uSmoke: { value: smoke }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun, uZenith, uHorizon, uGlow; uniform float uSmoke, uTime; varying vec3 vDir; ${NOISE}
      void main() {
        vec3 d = normalize(vDir); float h = d.y; float sd = max(dot(d, uSun), 0.0);
        vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.55, h));
        col += uGlow * (pow(sd, 4.0) * 0.35 + pow(sd, 24.0) * 0.5 + pow(sd, 300.0) * 1.2);
        col += vec3(4.0, 3.1, 2.1) * smoothstep(0.99955, 0.9998, sd);
        vec2 q = d.xz / max(h + 0.18, 0.06);
        float n = fbm(vec3(q * 1.3, uTime * 0.01)); float n2 = vnoise(vec3(q * 4.0 + 7.0, uTime * 0.02)) * 0.6 + vnoise(vec3(q * 9.0, 1.0)) * 0.4;
        float cl = smoothstep(0.42, 0.78, n * 0.75 + n2 * 0.35) * smoothstep(-0.02, 0.2, h) * uSmoke;
        vec3 cloudCol = mix(vec3(0.07, 0.07, 0.08), uGlow * 0.9, pow(sd, 3.0) * smoothstep(0.55, 0.9, n2));
        col = mix(col, cloudCol, cl * 0.8);
        col = mix(col, uHorizon * 0.7, smoothstep(0.0, -0.12, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 64, 32), mat);
  dome.frustumCulled = false; dome.renderOrder = 1e6;
  dome.userData.follow = (cam, t) => { dome.position.copy(cam.position); mat.uniforms.uTime.value = t; };
  return dome;
}

// 镜头通道：
//  体积光：1/8 分辨率亮部（小光源被平均掉，只剩大片天空）→ 64 步抖动径向模糊 → 双线性放大叠加
//  横向光斑：1/2 分辨率高阈值亮部（只取 LED、日轮等极亮点）→ 两级横向模糊
export class LensPass extends Pass {
  constructor(w, h) {
    super();
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.ray0 = new THREE.WebGLRenderTarget(w / 8, h / 8, opt); this.ray1 = new THREE.WebGLRenderTarget(w / 8, h / 8, opt);
    this.st0 = new THREE.WebGLRenderTarget(w / 2, h / 2, opt); this.st1 = new THREE.WebGLRenderTarget(w / 2, h / 2, opt); this.st2 = new THREE.WebGLRenderTarget(w / 2, h / 2, opt);
    const vs = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    this.bright = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uThresh: { value: 1.0 }, uPx: { value: new THREE.Vector2(1 / w, 1 / h) }, uTaps: { value: 4 }, uClamp: { value: 1e4 } }, vertexShader: vs,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uThresh, uTaps, uClamp; uniform vec2 uPx; varying vec2 vUv;
        void main() { vec3 acc = vec3(0.0); float n = 0.0;
          for (float y = -1.5; y <= 1.5; y += 1.0) for (float x = -1.5; x <= 1.5; x += 1.0) { vec3 c = min(texture2D(tDiffuse, vUv + vec2(x, y) * uPx * uTaps).rgb, vec3(uClamp)); float l = max(c.r, max(c.g, c.b)); acc += c * smoothstep(uThresh, uThresh * 1.8, l); n += 1.0; }
          gl_FragColor = vec4(acc / n, 1.0); }` });
    this.radial = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uDecay: { value: 0.975 }, uLen: { value: 0.9 } }, vertexShader: vs,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uSun; uniform float uDecay, uLen; varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() { vec2 d = (uSun - vUv) * uLen / 64.0; vec2 p = vUv + d * h(vUv * 911.0); float w = 1.0; vec3 acc = vec3(0.0);
          for (int i = 0; i < 64; i++) { acc += texture2D(tSrc, p).rgb * w; w *= uDecay; p += d; }
          gl_FragColor = vec4(acc / 64.0, 1.0); }` });
    this.hblur = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uStep: { value: 1 / w } }, vertexShader: vs,
      fragmentShader: `uniform sampler2D tSrc; uniform float uStep; varying vec2 vUv;
        void main() { vec3 acc = vec3(0.0); float tw = 0.0; for (int i = -12; i <= 12; i++) { float w = exp(-abs(float(i)) / 5.0); acc += texture2D(tSrc, vUv + vec2(float(i) * uStep, 0.0)).rgb * w; tw += w; } gl_FragColor = vec4(acc / tw, 1.0); }` });
    this.comp = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tRays: { value: null }, tStreak: { value: null }, uRays: { value: 0 }, uStreak: { value: 0 }, uRayColor: { value: new THREE.Color(1.0, 0.78, 0.55) } }, vertexShader: vs,
      fragmentShader: `uniform sampler2D tDiffuse, tRays, tStreak; uniform float uRays, uStreak; uniform vec3 uRayColor; varying vec2 vUv;
        void main() { vec3 c = texture2D(tDiffuse, vUv).rgb; c += texture2D(tRays, vUv).rgb * uRayColor * uRays; c += texture2D(tStreak, vUv).rgb * vec3(0.55, 0.75, 1.0) * uStreak; gl_FragColor = vec4(c, 1.0); }` });
    this.quad = new FullScreenQuad(); this.w = w; this.h = h;
    this.rays = 0; this.streaks = 0.35; this.sunUv = new THREE.Vector2(0.5, 0.5);
  }
  pass(mat, target) { this.quad.material = mat; this.quad.render.call(this.quad, this._r = this._r, target); }
  render(renderer, writeBuffer, readBuffer) {
    const q = this.quad, run = (mat, target) => { q.material = mat; renderer.setRenderTarget(target); q.render(renderer); };
    const B = this.bright.uniforms; B.tDiffuse.value = readBuffer.texture;
    if (this.rays > 0.001) {
      B.uThresh.value = 1.0; B.uTaps.value = 2.0; B.uClamp.value = 1.6; run(this.bright, this.ray0);
      this.radial.uniforms.tSrc.value = this.ray0.texture; this.radial.uniforms.uSun.value.copy(this.sunUv); run(this.radial, this.ray1);
    }
    if (this.streaks > 0.001) {
      B.uThresh.value = 3.0; B.uTaps.value = 0.5; B.uClamp.value = 1e4; run(this.bright, this.st0);
      this.hblur.uniforms.tSrc.value = this.st0.texture; this.hblur.uniforms.uStep.value = 2 / this.w; run(this.hblur, this.st1);
      this.hblur.uniforms.tSrc.value = this.st1.texture; this.hblur.uniforms.uStep.value = 14 / this.w; run(this.hblur, this.st2);
    }
    const C = this.comp.uniforms; C.tDiffuse.value = readBuffer.texture; C.tRays.value = this.ray1.texture; C.tStreak.value = this.st2.texture;
    C.uRays.value = this.rays; C.uStreak.value = this.streaks;
    run(this.comp, this.renderToScreen ? null : writeBuffer);
  }
}

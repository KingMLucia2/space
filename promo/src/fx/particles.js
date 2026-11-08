// GPU 粒子：位置 = 起点 + 速度 × 年龄，年龄由全局时间取模得到，完全确定性。用于扬尘、烟柱、空气中的浮尘。
import * as THREE from 'three';
import { mulberry32 } from '../util.js';

export function createParticles({ count = 500, seed = 1, map, color = 0xbfb8ae, opacity = 0.5, size = [0.5, 2], life = [4, 8],
  spawn = () => [0, 0, 0], vel = () => [0, 0.5, 0], grow = 1.5, additive = false, fadeIn = 0.15, fadeOut = 0.4 } = {}) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3), v = new Float32Array(count * 3), data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const p = spawn(rnd), u = vel(rnd);
    pos.set(p, i * 3); v.set(u, i * 3);
    data.set([size[0] + rnd() * (size[1] - size[0]), life[0] + rnd() * (life[1] - life[0]), rnd(), rnd()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(v, 3));
  g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: map }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uScale: { value: 1080 * 0.5 }, uGrow: { value: grow },
      uFadeIn: { value: fadeIn }, uFadeOut: { value: fadeOut }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float uTime, uScale, uGrow; attribute vec3 aVel; attribute vec4 aData; varying float vA; varying float vRot; varying float vFog;
      uniform float uFadeIn, uFadeOut;
      void main() {
        float life = aData.y; float age = mod(uTime + aData.z * life, life); float k = age / life;
        vec3 p = position + aVel * age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = aData.x * (1.0 + uGrow * k);
        gl_PointSize = min(s * uScale / max(0.1, -mv.z), 900.0);
        vA = smoothstep(0.0, uFadeIn, k) * (1.0 - smoothstep(1.0 - uFadeOut, 1.0, k));
        vRot = aData.w * 6.283 + age * 0.15;
        vFog = -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; uniform vec3 fogColor; uniform float fogDensity;
      varying float vA; varying float vRot; varying float vFog;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot); c = mat2(cs, -sn, sn, cs) * c;
        vec4 tx = texture2D(uMap, c + 0.5);
        float a = tx.a * vA * uOpacity; if (a < 0.003) discard;
        float f = 1.0 - exp(-fogDensity * vFog * 0.6);
        gl_FragColor = vec4(mix(uColor * tx.rgb, fogColor, f), a);
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(g, mat); points.frustumCulled = false;
  points.userData.update = (t, scene, cam, H = 1080) => {
    mat.uniforms.uTime.value = t; mat.uniforms.uScale.value = H * 0.5 / Math.tan(THREE.MathUtils.degToRad((cam ? cam.fov : 35) / 2));
    if (scene.fog) { mat.uniforms.fogColor.value.copy(scene.fog.color); mat.uniforms.fogDensity.value = scene.fog.density || 0; }
  };
  return points;
}

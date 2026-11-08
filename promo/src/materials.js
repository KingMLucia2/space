// 共享材质：清漆涂装（白/橙）、碳纤维、阳极氧化铝、机加工金属、橡胶、发光灯；以及三平面贴图、楼面污渍补丁。
import * as THREE from 'three';
import { carbonWeave } from './textures.js';

export const M = {};
export function initMaterials() {
  const carbon = carbonWeave(); carbon.repeat.set(1, 6);
  M.white = new THREE.MeshPhysicalMaterial({ color: 0xeceef0, roughness: 0.32, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  M.offwhite = new THREE.MeshPhysicalMaterial({ color: 0xc9cdd2, roughness: 0.45, metalness: 0.05, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  M.orange = new THREE.MeshPhysicalMaterial({ color: 0xff5a0a, roughness: 0.36, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  M.carbon = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbon, roughness: 0.32, metalness: 0.25, clearcoat: 1.0, clearcoatRoughness: 0.08 });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.32, metalness: 0.85 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0xb4bac2, roughness: 0.22, metalness: 1.0 });
  M.gunmetal = new THREE.MeshPhysicalMaterial({ color: 0x30343a, roughness: 0.36, metalness: 0.7, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  M.graphite = new THREE.MeshPhysicalMaterial({ color: 0x41464d, roughness: 0.42, metalness: 0.55, clearcoat: 0.25 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.92, metalness: 0 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0f14, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
  M.lens = new THREE.MeshPhysicalMaterial({ color: 0x07090c, roughness: 0.02, metalness: 0.6, clearcoat: 1, iridescence: 0.6 });
  M.ledBlue = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3aa0ff, emissiveIntensity: 7 });
  M.ledWhite = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 6 });
  M.ledCyan = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x40e0ff, emissiveIntensity: 6 });
  M.rebar = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.75, metalness: 0.5 });
  return M;
}

// 三平面贴图：按世界坐标取样，避免实例缩放造成的纹理拉伸（用于碎石、楼板、瓦砾堆）
export function triplanar(mat, scale = 0.5) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTpScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos; varying vec3 vTpNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 tpW = vec4(transformed, 1.0); vec3 tpN = objectNormal;
        #ifdef USE_INSTANCING
          tpW = instanceMatrix * tpW; tpN = mat3(instanceMatrix) * tpN;
        #endif
        vTpPos = (modelMatrix * tpW).xyz; vTpNrm = normalize(mat3(modelMatrix) * tpN);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos; varying vec3 vTpNrm; uniform float uTpScale;')
      .replace('#include <map_fragment>', `
        vec3 tpB = pow(abs(normalize(vTpNrm)), vec3(4.0)); tpB /= (tpB.x + tpB.y + tpB.z);
        vec4 tpC = texture2D(map, vTpPos.zy * uTpScale) * tpB.x + texture2D(map, vTpPos.xz * uTpScale) * tpB.y + texture2D(map, vTpPos.xy * uTpScale) * tpB.z;
        diffuseColor *= tpC;
        diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(-0.2, 1.6, vTpPos.y));`);
  };
  mat.customProgramCacheKey = () => 'tp' + scale;
  return mat;
}

// 楼面污渍：贴近地面的一段变暗变脏，叠加竖向雨渍
export function grime(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 grW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          grW = instanceMatrix * grW;
        #endif
        vGrW = (modelMatrix * grW).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrW;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float grN = fract(sin(dot(floor(vGrW.xz * 0.7), vec2(12.9898, 78.233))) * 43758.5453);
        float grBase = smoothstep(0.0, 6.0, vGrW.y + grN * 1.5);
        diffuseColor.rgb *= mix(vec3(0.42, 0.39, 0.35), vec3(1.0), grBase);
        diffuseColor.rgb *= 0.9 + 0.1 * sin(vGrW.y * 0.4 + grN * 6.0);`);
  };
  mat.customProgramCacheKey = () => 'grime';
  return mat;
}

// sRGB 颜色（实例颜色等需要按显示色值给出）
export function srgb(r, g, b) { const c = new THREE.Color(); c.setRGB(r, g, b, THREE.SRGBColorSpace); return c; }

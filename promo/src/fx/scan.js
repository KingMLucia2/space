// 生命探测扫描效果：贴地扩散的蓝色波纹环 + 从雷达面板射出的半透明扫描扇面
import * as THREE from 'three';

export function createScanFX() {
  const group = new THREE.Group();
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0x3aa8ff) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uT, uAlpha; uniform vec3 uColor; varying vec2 vUv;
      void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = 0.0;
        for (int i = 0; i < 3; i++) { float ph = fract(uT * 0.55 + float(i) / 3.0); float d = abs(r - ph); a += smoothstep(0.035, 0.0, d) * (1.0 - ph); }
        a += smoothstep(0.02, 0.0, abs(fract(atan(c.y, c.x) * 3.0 / 3.14159) - 0.5) - 0.48) * 0.0;
        a *= smoothstep(1.0, 0.85, r) * uAlpha; if (a < 0.002) discard; gl_FragColor = vec4(uColor * 3.0 * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat); ring.rotation.x = -Math.PI / 2; group.add(ring);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0x45b4ff) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uT, uAlpha; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float sweep = 0.5 + 0.5 * sin(uT * 2.2); float d = abs(vUv.x - sweep);
        float a = (smoothstep(0.25, 0.0, d) * 0.6 + 0.08) * (1.0 - vUv.y) * uAlpha; gl_FragColor = vec4(uColor * 2.0 * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(1, 1, 24, 1, true); beamGeo.translate(0, -0.5, 0); beamGeo.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, beamMat); group.add(beam);
  return {
    group, ring, beam,
    set(t, { alpha = 1, radius = 4, beamAlpha = 0, beamLen = 3, beamWidth = 1.2, origin, dir } = {}) {
      ringMat.uniforms.uT.value = t; ringMat.uniforms.uAlpha.value = alpha; ring.scale.set(radius * 2, radius * 2, 1);
      beamMat.uniforms.uT.value = t; beamMat.uniforms.uAlpha.value = beamAlpha;
      beam.scale.set(beamWidth, beamWidth * 0.4, beamLen);
      if (origin) beam.position.copy(origin);
      if (dir) beam.lookAt(origin.clone().add(dir));
    },
  };
}

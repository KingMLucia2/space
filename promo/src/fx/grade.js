// 最终调色通道（显示空间）：色差、缩放模糊、热成像、地图化、调色、暗角、颗粒、HUD 叠加、闪白、淡入淡出。
export const MAP_GLSL = /* glsl */`
vec3 mapStyle(sampler2D tex, vec2 uv, vec2 px, float t) {
  float l  = dot(texture2D(tex, uv).rgb, vec3(0.3, 0.59, 0.11));
  float lx = dot(texture2D(tex, uv + vec2(px.x, 0.0)).rgb, vec3(0.3, 0.59, 0.11)) - dot(texture2D(tex, uv - vec2(px.x, 0.0)).rgb, vec3(0.3, 0.59, 0.11));
  float ly = dot(texture2D(tex, uv + vec2(0.0, px.y)).rgb, vec3(0.3, 0.59, 0.11)) - dot(texture2D(tex, uv - vec2(0.0, px.y)).rgb, vec3(0.3, 0.59, 0.11));
  float edge = smoothstep(0.04, 0.22, length(vec2(lx, ly)));
  vec3 base = mix(vec3(0.015, 0.035, 0.07), vec3(0.08, 0.2, 0.32), smoothstep(0.1, 0.8, l));
  vec3 col = base + vec3(0.25, 0.75, 1.0) * edge * 0.75;
  vec2 g = abs(fract(uv * vec2(24.0, 13.5)) - 0.5);
  float grid = 1.0 - smoothstep(0.0, 0.02, min(g.x, g.y));
  col += vec3(0.1, 0.35, 0.5) * grid * 0.35;
  return col;
}
`;

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, tHud: { value: null }, uRes: { value: [1920, 1080] },
    uTime: { value: 0 }, uSat: { value: 0.85 }, uContrast: { value: 1.06 }, uVignette: { value: 0.35 }, uGrain: { value: 0.035 }, uCA: { value: 0.0015 },
    uLift: { value: [0.0, 0.0, 0.0] }, uGain: { value: [1.0, 1.0, 1.0] },
    uFade: { value: 0 }, uFadeColor: { value: [0, 0, 0] }, uFlash: { value: 0 }, uHud: { value: 1 },
    uThermal: { value: 0 }, uMap: { value: 0 }, uBars: { value: 0 }, uZoomBlur: { value: 0 }, uZoomCenter: { value: [0.5, 0.5] }, uScan: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tHud; uniform vec2 uRes, uZoomCenter;
    uniform float uTime, uSat, uContrast, uVignette, uGrain, uCA, uFade, uFlash, uHud, uThermal, uMap, uZoomBlur, uScan, uBars;
    uniform vec3 uLift, uGain, uFadeColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 thermal(float x) {
      x = clamp(x, 0.0, 1.0);
      vec3 c = mix(vec3(0.02, 0.0, 0.12), vec3(0.35, 0.0, 0.55), smoothstep(0.0, 0.3, x));
      c = mix(c, vec3(0.9, 0.15, 0.1), smoothstep(0.3, 0.55, x));
      c = mix(c, vec3(1.0, 0.75, 0.1), smoothstep(0.55, 0.8, x));
      return mix(c, vec3(1.0, 1.0, 0.85), smoothstep(0.8, 1.0, x));
    }
    ${MAP_GLSL}
    void main() {
      vec2 uv = vUv; vec3 col;
      float caK = smoothstep(0.2, 0.9, length(uv - 0.5));
      if (uZoomBlur > 0.001) {
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 16; i++) { float k = float(i) / 15.0; acc += texture2D(tDiffuse, mix(uv, uZoomCenter, k * uZoomBlur * 0.3)).rgb; }
        col = acc / 16.0;
      } else {
        vec2 d = (uv - 0.5) * uCA * (0.3 + caK);
        col = vec3(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b);
      }
      if (uThermal > 0.001) { float l = dot(col, vec3(0.3, 0.59, 0.11)); col = mix(col, thermal(pow(l, 0.9) * 1.1), uThermal); }
      if (uMap > 0.001) col = mix(col, mapStyle(tDiffuse, uv, 1.5 / uRes, uTime), uMap);
      col = col * uGain + uLift * (1.0 - col);
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.25);
      vec2 q = uv - 0.5; q.x *= uRes.x / uRes.y;
      col *= 1.0 - uVignette * smoothstep(0.35, 1.15, length(q));
      if (uScan > 0.001) col *= 1.0 - uScan * 0.35 * step(0.5, fract(uv.y * uRes.y / 3.0));
      col += (hash(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5) * uGrain;
      vec4 h = texture2D(tHud, uv); col = mix(col, h.rgb, h.a * uHud);
      col = mix(col, vec3(1.0), uFlash);
      col = mix(col, uFadeColor, uFade);
      if (uBars > 0.0 && (uv.y < uBars || uv.y > 1.0 - uBars)) col = vec3(0.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

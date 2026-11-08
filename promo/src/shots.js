// 镜头表：按分镜脚本的 26 个镜头，共 120 秒。每个镜头的 update(t) 只依赖本镜头内的时间 t，逐帧确定性渲染。
import * as THREE from 'three';
import { getWorld, placeDrone, attachHex, detachHex, applyEnv, CITY, rotorSpin, gaitFeet, footOnGround, HEX, HANG_Y } from './world.js';
import { buildCrevice } from './assets/crevice.js';
import { buildAirport } from './assets/airport.js';
import { buildCommand, drawScreenUI, SCREEN } from './assets/command.js';
import { reconHUD, detectHUD, titleCard, posterCard } from './fx/hud.js';
import { clamp, lerp, range, smooth, smoother, easeIn, easeOut, shake, pathPoint } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const vlerp = (a, b, k) => a.clone().lerp(b, k);
const GREEN = [0.16, 0.74, 0.42]; // 片尾绿（显示色）
const D = () => CITY.dock;
const DOCK_F = V(Math.sin(-0.9), 0, Math.cos(-0.9)); // 基站正面朝向（世界）
const DOCK_S = V(Math.cos(-0.9), 0, -Math.sin(-0.9)); // 基站右侧
const FOG = 0.0026;

let W, CREV, AIR, CMD;
const EMPTY = new THREE.Scene();
const prepWorld = async (e) => { W = await getWorld(e); };

// —— 通用摆放 ——
function reset(w, scene = w.scene) {
  w.drone.root.visible = false; w.hex.root.visible = false; w.heli.root.visible = false; w.victim.root.visible = false;
  w.scan.set(0, { alpha: 0, beamAlpha: 0 });
  w.city.downwash.material.uniforms.uOpacity.value = 0;
  w.city.setSirens(0, 0);
  w.city.dock.set(0, 0, 0, 0);
  scene.fog.density = FOG;
}
function combined(w, P, heading, pitch, roll, rot, t) {
  w.drone.root.visible = w.hex.root.visible = true;
  placeDrone(w, P.toArray(), heading, pitch, roll, rot); attachHex(w); w.drone.setRing(5); w.drone.setStrobe(t);
}
function droneAlone(w, P, heading, pitch, roll, rot, t) {
  w.drone.root.visible = true; placeDrone(w, P.toArray(), heading, pitch, roll, rot); w.drone.setRing(4); w.drone.setStrobe(t);
}
function hexAt(w, body, height, { fold = 0, pitch = 0, roll = 0, feet = null } = {}) {
  w.hex.root.visible = true; detachHex(w);
  const f = feet || [0, 1, 2, 3, 4, 5].map((i) => footOnGround(body, w.hex.nominalFoot(i), () => 0));
  w.hex.setPose({ x: body.x, y: height, z: body.z, heading: body.heading, pitch, roll }, f, fold);
}
function downwash(w, x, y, z, k) { const d = w.city.downwash; d.position.set(x, y, z); d.material.uniforms.uOpacity.value = 0.2 * clamp(k); }
function look(cam, pos, target, fov = 35) { cam.position.copy(pos); cam.lookAt(target); cam.fov = fov; }
// 俯拍“上帝视角”相机（与指挥大屏上的态势图同一取景）
export const GOD = { h: 300, fov: 40 };
function godCam(cam, h = GOD.h, cx = 0, cz = 0) { cam.up.set(0, 0, -1); cam.position.set(cx, h, cz); cam.lookAt(cx, 0, cz); cam.fov = GOD.fov; }

async function prepCommand(e) {
  await prepWorld(e);
  CMD = await e.getSet('command', async (eng) => {
    const w = W; reset(w);
    const cam = new THREE.PerspectiveCamera(GOD.fov, 16 / 9, 1, 6000); godCam(cam); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const rt = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType });
    w.scene.fog.density = 0.0012; w.city.update(40, cam, 1080);
    eng.renderer.setRenderTarget(rt); eng.renderer.render(w.scene, cam); eng.renderer.setRenderTarget(null);
    w.scene.fog.density = FOG;
    const dots = CITY.survivors.map(([x, z]) => { const p = V(x, 0, z).project(cam); return [p.x * 0.5 + 0.5, p.y * 0.5 + 0.5]; });
    const c = await buildCommand(eng, rt.texture, dots); c.dots = dots; return c;
  });
}
// 屏幕上某个点的世界坐标
const dotWorld = (i) => { const [u, v] = CMD.dots[i]; return V((u - 0.5) * SCREEN.w, SCREEN.y + (v - 0.5) * SCREEN.h, SCREEN.z); };
const FILL_D = (SCREEN.w / 2) / (Math.tan(THREE.MathUtils.degToRad(35 / 2)) * 16 / 9); // 大屏恰好占满画面宽度时的距离

export const SHOTS = [
  // ———————— 一、灾区与出发 ————————
  { id: 's01', dur: 5, prepare: prepWorld, update(t, ctx) { // 航拍大远景，缓慢前推，黑场淡入
    const { cam, grade, engine } = ctx; const w = W; reset(w);
    const k = smoother(t / 5);
    look(cam, vlerp(V(236, 98, 176), V(206, 86, 150), k), vlerp(V(-30, 0, -40), V(-22, 4, -34), k), 40);
    w.city.shadowFocus(-10, 0, -10, 230);
    grade.uFade = 1 - smooth(t / 1.8); grade.uSat = 0.78;
    w.city.update(t + 10, cam, engine.H); return w.scene;
  } },
  { id: 's02', dur: 4, prepare: prepWorld, update(t, ctx) { // 被截断的公路、警灯闪烁
    const { cam, engine, grade } = ctx; const w = W; reset(w); w.city.setSirens(t, 1);
    const sh = shake(t, 0.015, 1, 4);
    look(cam, V(372 - t * 0.4 + sh.x, 2.0 + sh.y, 7.6), V(300, 3.2, -1.5), 32);
    w.city.shadowFocus(332, 0, 0, 45); grade.uSat = 0.8; ctx.streaks = 0.6;
    w.city.update(t + 20, cam, engine.H); return w.scene;
  } },
  { id: 's03', dur: 4, async prepare(e) { CREV = await e.getSet('crevice', buildCrevice); }, update(t, ctx) { // 瓦砾缝隙里亮着的手机
    const { cam, grade } = ctx; const k = smoother(t / 4); const sh = shake(t, 0.004, 1.5, 7);
    const pos = vlerp(V(0.34, 0.27, 0.44), V(0.2, 0.19, 0.29), k).add(V(sh.x, sh.y, sh.z));
    look(cam, pos, V(0.02, 0.01, 0.02), 38); cam.near = 0.01;
    ctx.dof = { focus: pos.distanceTo(V(0.02, 0.01, 0.02)), aperture: 0.012, maxblur: 0.012 };
    grade.uSat = 0.85; ctx.rays = 0;
    CREV.update(t, cam); return CREV.scene;
  } },
  { id: 's04', dur: 4, prepare: prepWorld, update(t, ctx) { // 从灾区望向远处高地：基站亮灯、开舱
    const { cam, engine, grade } = ctx; const w = W; reset(w);
    const d = w.city.dock; d.set(smooth(range(t, 1.0, 3.6)), smooth(range(t, 3.0, 4.0)) * 0.3, t, smooth(range(t, 0.4, 0.9)));
    const tgt = V(D().x, D().y + 1.4, D().z); const sh = shake(t, 0.01, 0.8, 9);
    look(cam, V(300 + sh.x, 24 + sh.y, -70), tgt, 5.5);
    w.scene.fog.density = 0.0011; w.city.shadowFocus(D().x, D().y, D().z, 14); ctx.streaks = 0.6;
    w.city.update(t + 25, cam, engine.H); return w.scene;
  } },
  { id: 's05', dur: 4, prepare: prepWorld, update(t, ctx) { // 平台升起，旋翼启动，结合体起飞
    const { cam, engine } = ctx; const w = W; reset(w);
    const d = w.city.dock; d.set(1, smooth(t / 1.5), t, 1);
    const top = d.root.localToWorld(V(0, d.topY(), 0));
    const rise = easeIn(range(t, 2.2, 4.0)) * 9;
    combined(w, V(top.x, top.y + 0.64 + rise, top.z), -0.9 + rise * 0.02, rise * 0.01, 0, rotorSpin(t, { t0: 0.3, spinUp: 1.8 }), t);
    downwash(w, top.x, top.y, top.z, range(t, 1.5, 2.4) * (1 - range(rise, 3, 8)));
    const base = V(D().x, D().y, D().z);
    look(cam, base.clone().addScaledVector(DOCK_F, 7.2).addScaledVector(DOCK_S, -3.0).add(V(0, 0.6, 0)), base.clone().add(V(0, 1.9 + rise * 0.6, 0)), 44);
    w.city.shadowFocus(D().x, D().y, D().z, 12); ctx.ao = { radius: 0.5 }; engine.renderer.toneMappingExposure = 0.85;
    w.city.update(t + 25, cam, engine.H); return w.scene;
  } },
  { id: 's06', dur: 5, prepare: prepWorld, update(t, ctx) { // 低空飞越塌方路段和救援车队，飞入烟尘
    const { cam, engine, grade } = ctx; const w = W; reset(w); w.city.setSirens(t, 1);
    const P = V(378 - t * 13, 26 - t * 0.6, -7 + t * 0.6);
    combined(w, P, -Math.PI / 2, 0.2, 0.03 * Math.sin(t), rotorSpin(t + 20, { t0: 0 }), t);
    const sh = shake(t, 0.06, 1.1, 3);
    look(cam, P.clone().add(V(9.5 + sh.x, 4.0 + sh.y, 8.5)), P.clone().add(V(-18, -14, -4)), 48);
    w.city.shadowFocus(P.x - 20, 0, P.z, 60);
    grade.uFadeColor = [0.62, 0.54, 0.44]; grade.uFade = smooth(range(t, 4.2, 5.0)) * 0.9;
    w.city.update(t + 30, cam, engine.H); return w.scene;
  } },
  // ———————— 二、抵达与搜寻 ————————
  { id: 's07', dur: 4, prepare: prepWorld, update(t, ctx) { // 结合体从烟尘中飞出，降落在广场
    const { cam, engine, grade } = ctx; const w = W; reset(w);
    const L = CITY.landing; const a = smoother(range(t, 0, 2.6)), b = smoother(range(t, 2.6, 4.0));
    const P = vlerp(V(9, 10, 23), V(L.x, 2.4, L.z), a); P.y = lerp(P.y, 0.62, b);
    combined(w, P, Math.PI + (1 - a) * 0.4, (1 - a) * 0.22 - b * 0.05, 0, rotorSpin(t + 20, { t0: 0 }), t);
    downwash(w, P.x, 0, P.z, range(4.5 - P.y, 0, 3));
    const sh = shake(t, 0.03, 1.2, 5);
    look(cam, V(6.2 + sh.x, 0.85 + sh.y, 13.5), vlerp(V(4, 6, 14), V(0, 1.4, 6.5), smooth(t / 3)), 42);
    w.city.shadowFocus(0, 0, 6, 18);
    grade.uFadeColor = [0.62, 0.54, 0.44]; grade.uFade = (1 - smooth(t / 0.9)) * 0.9;
    w.city.update(t + 40, cam, engine.H); return w.scene;
  } },
  { id: 's08', dur: 4, prepare: prepWorld, update(t, ctx) { // 落地，六足机器人展开六腿站起，锁扣松开
    const { cam, engine } = ctx; const w = W; reset(w);
    const L = CITY.landing; const P = V(L.x, 0.62, L.z);
    const rot = rotorSpin(t + 30, { t0: 0, t1: 30.2, spinDown: 3 });
    droneAlone(w, P, Math.PI, 0, 0, { angle: rot.angle, speed: Math.max(0.35, rot.speed) }, t);
    const unfold = smooth(range(t, 0.2, 1.7)), latch = smooth(range(t, 1.7, 2.3));
    const body = { x: L.x, z: L.z, heading: Math.PI };
    const feet = [0, 1, 2, 3, 4, 5].map((i) => footOnGround(body, w.hex.nominalFoot(i), () => 0));
    w.hex.root.visible = true;
    if (t < 2.3) { attachHex(w); w.hex.setPose({ x: 0, y: HANG_Y, z: 0, heading: 0 }, feet, 1 - unfold); w.drone.setLatch(latch); }
    else { w.drone.setLatch(1); const h = lerp(0.62 + HANG_Y, HEX.standH, smooth(range(t, 2.4, 3.6))); hexAt(w, body, h, { feet }); }
    w.drone.setRing(4 + latch * 10 * (1 - range(t, 2.3, 2.8)));
    w.hex.ledMat.emissiveIntensity = 2 + 6 * unfold;
    look(cam, V(0.75, 0.27, 4.75), V(0.0, 0.32, 6.5), 40);
    ctx.dof = { focus: 1.85, aperture: 0.004, maxblur: 0.01 }; ctx.ao = { radius: 0.35 };
    w.city.shadowFocus(0, 0, 6.5, 6);
    w.city.update(t + 44, cam, engine.H); return w.scene;
  } },
  { id: 's09', dur: 4, prepare: prepWorld, update(t, ctx) { // 无人机升空，六足机器人抬头目送
    const { cam, engine } = ctx; const w = W; reset(w);
    const L = CITY.landing; const rise = easeIn(range(t, 0.3, 4.0)) * 12;
    droneAlone(w, V(L.x, 0.62 + rise, L.z), Math.PI, 0, 0, rotorSpin(t + 40, { t0: 0 }), t); w.drone.setLatch(1 - range(t, 0.5, 1.5));
    const look01 = smooth(range(t, 0.6, 2.5));
    hexAt(w, { x: L.x, z: L.z, heading: Math.PI }, HEX.standH, { pitch: -0.22 * look01 });
    w.hex.setScanner(0, 0);
    downwash(w, L.x, 0, L.z, 1 - range(rise, 1, 6));
    const tgt = vlerp(V(0, 0.4, 6.3), V(0, 0.62 + rise * 0.8, 6.5), smooth(range(t, 0.2, 3)));
    look(cam, V(1.5, 0.2, 9.4), tgt, 54);
    w.city.shadowFocus(0, 0, 6.5, 10);
    w.city.update(t + 48, cam, engine.H); return w.scene;
  } },
  { id: 's10', dur: 4, prepare: prepWorld, update(t, ctx) { // 无人机视角俯拍：测绘网格 + 热成像
    const { cam, engine, grade, hud } = ctx; const w = W; reset(w);
    const k = t / 4; const P = vlerp(V(-8, 34, 14), V(7, 37, -6), k);
    cam.up.set(0, 0, -1); look(cam, P, V(P.x + 0.5, 0, P.z - 4), 55);
    hexAt(w, { x: 0, z: 6.2, heading: Math.PI }, HEX.standH);
    grade.uThermal = 0.7; grade.uSat = 1.0; grade.uVignette = 0.6;
    reconHUD(hud, t, { heading: 330 + t * 6, alt: P.y, spd: 5.4 });
    w.city.shadowFocus(0, 0, 4, 40);
    w.city.update(t + 52, cam, engine.H); return w.scene;
  } },
  { id: 's11', dur: 5, prepare: prepWorld, update(t, ctx) { // 六足机器人在碎石间稳步前行（贴地跟拍）
    const { cam, engine } = ctx; const w = W; reset(w);
    const bodyAt = (tt) => ({ x: 0.06 * tt, z: 6.25 - 0.8 * tt, heading: Math.PI });
    const feet = gaitFeet(w.hex, t, bodyAt, { freq: 2.0, lift: 0.07 });
    const b = bodyAt(t);
    hexAt(w, b, HEX.standH + 0.008 * Math.sin(t * 4 * Math.PI * 2), { feet, roll: 0.02 * Math.sin(t * 2 * Math.PI * 2) });
    const sh = shake(t, 0.01, 2, 11);
    look(cam, V(b.x + 1.15 + sh.x, 0.2 + sh.y, b.z - 0.45), V(b.x, 0.16, b.z - 0.35), 42);
    ctx.dof = { focus: 1.2, aperture: 0.004, maxblur: 0.01 }; ctx.ao = { radius: 0.3 };
    w.city.shadowFocus(b.x, 0, b.z, 6);
    w.city.update(t + 56, cam, engine.H); return w.scene;
  } },
  { id: 's12', dur: 4, prepare: prepWorld, update(t, ctx) { // 停下，展开生命探测模块，蓝色扫描波纹扩散
    const { cam, engine } = ctx; const w = W; reset(w);
    const walk = range(t, 0, 0.8);
    const bodyAt = (tt) => ({ x: 0.3, z: 2.25 - 0.5 * smooth(Math.min(tt, 0.8) / 0.8), heading: Math.PI });
    const feet = t < 1.2 ? gaitFeet(w.hex, t, bodyAt, { freq: 2.0 }) : null;
    const b = bodyAt(t);
    hexAt(w, b, HEX.standH, { feet });
    const dep = smooth(range(t, 0.8, 2.0)); w.hex.setScanner(dep, dep);
    const head = new THREE.Vector3(); w.hex.head.getWorldPosition(head);
    w.scan.ring.position.set(b.x, 0.05, b.z - 0.5);
    w.scan.set(t - 1.6, { alpha: smooth(range(t, 1.6, 2.4)) * 0.85, radius: 3.4, beamAlpha: smooth(range(t, 1.8, 2.6)) * 0.6, beamLen: 2.6, beamWidth: 0.9, origin: head.clone().add(V(0, 0.06, 0)), dir: V(0.05, -0.35, -1).normalize() });
    const a = lerp(1.05, 0.25, smoother(t / 4));
    const C = V(b.x, 0.26, b.z);
    look(cam, C.clone().add(V(Math.sin(a) * 1.55, 0.2, -Math.cos(a) * 1.55 + 0.3)), C.clone().add(V(0, 0.05, -0.3)), 40);
    ctx.dof = { focus: 1.55, aperture: 0.0035, maxblur: 0.01 }; ctx.ao = { radius: 0.35 };
    w.city.shadowFocus(b.x, 0, b.z, 6);
    w.city.update(t + 61, cam, engine.H); return w.scene;
  } },
  { id: 's13', dur: 3, prepare: prepWorld, update(t, ctx) { // 探测画面：瓦砾下显出人形热源、心跳波形、红点
    const { cam, engine, grade, hud } = ctx; const w = W; reset(w);
    hexAt(w, { x: 0.3, z: 1.75, heading: Math.PI }, HEX.standH); w.hex.setScanner(1, 1); w.hex.root.visible = false;
    const sh = shake(t, 0.004, 1.2, 13);
    look(cam, V(0.32 + sh.x, 0.42 + sh.y, 1.35), V(0.45, 0.15, -1.0), 50);
    const found = smooth(range(t, 0.5, 1.3));
    w.victim.root.visible = true; w.victimMat.opacity = found * (0.75 + 0.25 * Math.sin(t * 7));
    grade.uThermal = 1.0; grade.uSat = 1.05; grade.uVignette = 0.7; grade.uScan = 0.35;
    cam.updateMatrixWorld(); cam.aspect = 16 / 9; cam.updateProjectionMatrix();
    const vp = w.victim.root.position.clone().project(cam);
    const cx = (vp.x * 0.5 + 0.5) * 1920, cy = (1 - (vp.y * 0.5 + 0.5)) * 1080;
    detectHUD(hud, t, { box: [cx - 200, cy - 110, 400, 220], found });
    w.city.update(t + 65, cam, engine.H); return w.scene;
  } },
  // ———————— 三、指挥屏幕与结合返航 ————————
  { id: 's14', dur: 6, prepare: prepCommand, update(t, ctx) { // 镜头升起转为上帝视角并不断抬高，最后风格化成态势图
    const { cam, engine, grade } = ctx; const w = W; reset(w);
    hexAt(w, { x: 0.3, z: 1.75, heading: Math.PI }, HEX.standH); w.hex.setScanner(1, 1);
    const k = smoother(t / 6), up = Math.pow(k, 1.6);
    const h = lerp(0.7, GOD.h, up);
    const x = lerp(1.6, 0, smooth(k * 1.4)), z = lerp(3.0, 0, smooth(k * 1.4));
    const tgtK = smooth(range(t, 0, 2.5));
    if (t > 4.2) godCam(cam, h, x, z);
    else { cam.up.set(0, 1, 0); const tgt = vlerp(V(0.3, 0.25, 1.6), V(x, 0, z - 0.001 - (1 - tgtK) * 3), tgtK); look(cam, V(x, h, z), tgt, lerp(42, GOD.fov, k)); if (tgtK > 0.98) { cam.up.set(0, 0, -1); cam.lookAt(x, 0, z); } }
    w.scene.fog.density = lerp(FOG, 0.0012, up);
    w.city.shadowFocus(0, 0, 0, lerp(8, 260, up));
    grade.uMap = smooth(range(t, 4.6, 6.0)); grade.uSat = lerp(0.92, 1, grade.uMap);
    w.city.update(t + 70, cam, engine.H); return w.scene;
  } },
  { id: 's15', dur: 5, prepare: prepCommand, update(t, ctx) { // 指挥中心：从大屏后拉，8 个红点依次亮起
    const { cam, grade } = ctx; const c = CMD;
    const k = smoother(range(t, 0.3, 5));
    look(cam, V(0, lerp(SCREEN.y, 2.35, k), SCREEN.z + lerp(FILL_D, 13.5, k)), V(0, lerp(SCREEN.y, 2.55, k), SCREEN.z), 35);
    c.screenMat.uniforms.uTime.value = t;
    c.screenMat.uniforms.uState.value = c.dots.map((_, i) => clamp((t - 0.4 - i * 0.28) / 0.22));
    const all = t > 0.4 + 7 * 0.28 + 0.3;
    drawScreenUI(c, { title: '灾区生命探测态势', sub: '空地协同 · 实时回传', count: all ? '侦测完成：8 人' : `侦测中：${Math.max(0, Math.min(8, Math.floor((t - 0.4) / 0.28) + 1))} 人`, t });
    grade.uSat = 1.0; ctx.rays = 0; ctx.streaks = 0.25;
    return c.scene;
  } },
  { id: 's16', dur: 3, prepare: prepCommand, update(t, ctx) { // 推进穿过大屏，回到真实的上帝视角
    const { cam, grade, engine } = ctx;
    if (t < 1.5) {
      const c = CMD; const k = easeIn(t / 1.5);
      look(cam, V(0, lerp(2.35, SCREEN.y, k), SCREEN.z + lerp(13.5, FILL_D * 0.92, k)), V(0, lerp(2.55, SCREEN.y, k), SCREEN.z), 35);
      c.screenMat.uniforms.uTime.value = t + 5; c.screenMat.uniforms.uState.value = c.dots.map(() => 1);
      drawScreenUI(c, { title: '灾区生命探测态势', sub: '空地协同 · 实时回传', count: '侦测完成：8 人', t: t + 5 });
      grade.uZoomBlur = k * 0.6; grade.uScan = k * 0.6; ctx.rays = 0;
      return c.scene;
    }
    const w = W; reset(w); hexAt(w, { x: 0.3, z: 1.75, heading: Math.PI }, HEX.standH); w.hex.setScanner(1, 1);
    const k = (t - 1.5) / 1.5;
    godCam(cam, GOD.h - 20 * smooth(k)); w.scene.fog.density = 0.0012;
    grade.uMap = 1 - smooth(range(k, 0, 0.6)); grade.uScan = 0.6 * (1 - smooth(k)); grade.uZoomBlur = 0.4 * (1 - smooth(range(k, 0, 0.4)));
    w.city.shadowFocus(0, 0, 0, 260);
    w.city.update(t + 80, cam, engine.H); return w.scene;
  } },
  { id: 's17', dur: 4, prepare: prepWorld, update(t, ctx) { // GTA 切换角色式：分三段急速下降，落到两台设备身边
    const { cam, engine, grade } = ctx; const w = W; reset(w);
    const drop = (a, b, t0, t1) => lerp(a, b, smoother(range(t, t0, t1)));
    let h = GOD.h - 20; h = drop(h, 120, 0.45, 0.95); h = t > 0.95 ? drop(120, 45, 1.25, 1.75) : h; if (t > 1.75) h = drop(45, 5, 2.05, 2.85);
    const blur = Math.max(...[[0.45, 0.95], [1.25, 1.75], [2.05, 2.85]].map(([a, b]) => Math.sin(Math.PI * range(t, a, b))));
    const tilt = smooth(range(t, 2.2, 3.0));
    const hexP = V(0.3, 0.25, 1.75);
    hexAt(w, { x: 0.3, z: 1.75, heading: Math.PI }, HEX.standH); w.hex.setScanner(1 - smooth(range(t, 3.0, 4.0)), 1);
    if (tilt <= 0) godCam(cam, h, 0.3 * range(t, 1.2, 2.2), 1.75 * range(t, 1.2, 2.2));
    else { cam.up.copy(vlerp(V(0, 0, -1), V(0, 1, 0), tilt).normalize()); const pos = vlerp(V(0.3, h, 1.76), V(2.9, 1.9 - 0.3 * range(t, 3, 4), 4.8), tilt); look(cam, pos, vlerp(V(0.3, 0, 1.75), hexP.clone().add(V(0, 0.5 + 0.9 * smooth(range(t, 2.9, 4.0)), 0)), tilt), lerp(GOD.fov, 44, tilt)); }
    // 无人机从空中飞回，悬停在六足机器人上方
    const dk = smoother(range(t, 2.4, 4.0));
    droneAlone(w, vlerp(V(-7, 10, 4), V(0.3, 2.8, 1.75), dk), Math.PI, 0.15 * (1 - dk), 0, rotorSpin(t + 60, { t0: 0 }), t);
    w.scene.fog.density = lerp(0.0012, FOG, smooth(range(h, 120, 10)));
    grade.uZoomBlur = blur * 0.7; grade.uSat = lerp(0.35, 0.92, smooth(range(t, 2.7, 3.3))); grade.uContrast = lerp(1.15, 1.1, tilt);
    w.city.shadowFocus(0.3, 0, 1.75, Math.max(8, h * 0.9));
    w.city.update(t + 84, cam, engine.H); return w.scene;
  } },
  { id: 's18', dur: 4, prepare: prepWorld, update(t, ctx) { // 无人机落到六足机器人上方，锁扣扣合，收腿
    const { cam, engine } = ctx; const w = W; reset(w);
    const body = { x: 0.3, z: 1.75, heading: Math.PI };
    const feet = [0, 1, 2, 3, 4, 5].map((i) => footOnGround(body, w.hex.nominalFoot(i), () => 0));
    const tall = 0.40, dockY = tall - HANG_Y;
    const dropK = smoother(range(t, 0, 2.0)); const lift = smooth(range(t, 3.3, 4.0)) * 0.35;
    const P = V(0.3, lerp(2.8, dockY, dropK) + lift, 1.75);
    droneAlone(w, P, Math.PI, 0, 0, rotorSpin(t + 70, { t0: 0 }), t);
    const latch = 1 - smooth(range(t, 1.9, 2.3)); w.drone.setLatch(latch);
    w.drone.setRing(4 + 10 * Math.sin(Math.PI * range(t, 2.0, 2.6)));
    if (t < 2.0) { w.hex.setScanner(0, 0); hexAt(w, body, lerp(HEX.standH, tall, smooth(range(t, 0.5, 1.8))), { feet }); }
    else { w.hex.root.visible = true; attachHex(w); w.hex.setPose({ x: 0, y: HANG_Y, z: 0, heading: 0 }, feet, smooth(range(t, 2.4, 3.5))); }
    downwash(w, 0.3, 0, 1.75, 0.7);
    look(cam, V(2.55, 0.85, 2.55), V(0.3, 0.7, 1.75), 38);
    ctx.dof = { focus: 2.4, aperture: 0.003, maxblur: 0.008 }; ctx.ao = { radius: 0.4 };
    w.city.shadowFocus(0.3, 0, 1.75, 6);
    w.city.update(t + 88, cam, engine.H); return w.scene;
  } },
  { id: 's19', dur: 4, prepare: prepWorld, update(t, ctx) { // 结合体升空离开废墟
    const { cam, engine } = ctx; const w = W; reset(w);
    const up = easeIn(range(t, 0, 2.2)) * 6, away = easeIn(range(t, 1.6, 4.0));
    const P = V(0.3 + away * 26, 0.75 + up + away * 22, 1.75 - away * 10);
    combined(w, P, Math.PI + away * 1.6, away * 0.25, -away * 0.15, rotorSpin(t + 80, { t0: 0 }), t);
    downwash(w, 0.3, 0, 1.75, 1 - range(up, 1, 5));
    look(cam, V(-1.9, 0.35, 4.6), vlerp(V(0.3, 1.2, 1.75), P, 0.85), 50);
    w.city.shadowFocus(2, 0, 2, 14);
    w.city.update(t + 92, cam, engine.H); return w.scene;
  } },
  // ———————— 四、救援出发与返回基站 ————————
  { id: 's20', dur: 4, async prepare(e) { AIR = await e.getSet('airport', buildAirport); applyEnv(AIR.heli.root, e.envMap, 0.8); }, update(t, ctx) { // 机场：救援队员登机，直升机起飞
    const { cam } = ctx; const A = AIR;
    const lift = easeIn(range(t, 1.9, 4.0)), fwd = easeIn(range(t, 3.0, 4.0));
    A.heli.root.position.set(fwd * 6, 1.5 + lift * 7, 0); A.heli.root.rotation.set(0, Math.PI / 2, 0); A.heli.body.rotation.set(0.1 * fwd, 0, 0);
    A.heli.set(t * 30, 1, t);
    A.crew.forEach((h, i) => { const k = clamp((t - i * 0.15) / 1.6); h.root.visible = k < 1; h.root.position.set(lerp(-11 - i * 1.4, -1.0, k), 0, lerp(7 + i * 0.8, 1.4, k)); h.root.rotation.y = Math.atan2(10, -6); h.pose(1, t * 9 + i); });
    look(cam, V(-17, 1.7, 14), V(0, 3 + lift * 3, 0), 40);
    A.focus(0, 0, 0, 22);
    A.update(t, cam); return A.scene;
  } },
  { id: 's21', dur: 5, prepare: prepWorld, update(t, ctx) { // 空中：直升机与结合体擦肩而过，交汇处放慢
    const { cam, engine } = ctx; const w = W; reset(w);
    // 时间扭曲：交汇（2.5s）附近放慢到 0.35 倍
    const tauAt = (tt) => { let a = 0; const n = Math.round(tt * 96); for (let i = 0; i < n; i++) a += (1 - 0.65 * Math.exp(-((((i + 0.5) / 96 - 2.5) / 0.75) ** 2))) / 96; return a; };
    const tau = tauAt(t), tc = tauAt(2.5); // tc：交汇时刻对应的扭曲时间
    const H = V(640, 96, 120 + (tau - tc) * 26);
    w.heli.root.visible = true; w.heli.root.position.copy(H); w.heli.root.rotation.set(0, 0, 0); w.heli.body.rotation.set(0.12, 0, 0); w.heli.set(tau * 30, 1, tau);
    const P = V(662, 99, 120 - (tau - tc) * 15);
    combined(w, P, Math.PI, 0.18, 0, rotorSpin(tau + 100, { t0: 0 }), tau);
    look(cam, V(690, 100, 121), V(651, 97.5, 120), 30);
    w.city.shadowFocus(650, 90, 120, 40);
    w.city.update(t + 100, cam, engine.H); return w.scene;
  } },
  { id: 's22', dur: 4, prepare: prepWorld, update(t, ctx) { // 结合体降落在基站平台上，平台开始下降
    const { cam, engine } = ctx; const w = W; reset(w);
    const d = w.city.dock; const lower = smooth(range(t, 3.0, 4.0)) * 0.4; d.set(1, 1 - lower, t, 1);
    const top = d.root.localToWorld(V(0, d.topY(), 0));
    const k = smoother(range(t, 0, 2.8));
    const P = vlerp(top.clone().add(V(-4, 7, 3)), top.clone().add(V(0, 0.64, 0)), k);
    const rot = rotorSpin(t + 110, { t0: 0, t1: 112.9, spinDown: 1.5 });
    combined(w, P, -0.9 + (1 - k) * 0.5, (1 - k) * 0.15, 0, rot, t);
    downwash(w, top.x, top.y, top.z, range(5 - (P.y - top.y), 0, 3) * (1 - range(t, 2.9, 3.4)));
    const base = V(D().x, D().y, D().z);
    look(cam, base.clone().addScaledVector(DOCK_F, 6.5).addScaledVector(DOCK_S, 3.2).add(V(0, 2.2, 0)), base.clone().add(V(0, 1.6 + (1 - k) * 2, 0)), 40);
    w.city.shadowFocus(D().x, D().y, D().z, 10); ctx.ao = { radius: 0.5 };
    w.city.update(t + 110, cam, engine.H); return w.scene;
  } },
  { id: 's23', dur: 5, prepare: prepWorld, update(t, ctx) { // 舱盖合拢，充电指示灯亮起
    const { cam, engine, grade } = ctx; const w = W; reset(w);
    const d = w.city.dock; d.set(1 - smooth(range(t, 1.4, 4.0)), 0.6 * (1 - smooth(range(t, 0, 1.8))), t, 1);
    d.lightMat.emissiveIntensity = 2 + 6 * (0.5 + 0.5 * Math.sin(t * 2.5)) * smooth(range(t, 3.6, 4.4));
    const top = d.root.localToWorld(V(0, d.topY(), 0));
    combined(w, top.clone().add(V(0, 0.64, 0)), -0.9, 0, 0, { angle: 0, speed: 0 }, t);
    const base = V(D().x, D().y, D().z); const k = smoother(t / 5);
    look(cam, base.clone().addScaledVector(DOCK_F, lerp(6.0, 4.8, k)).addScaledVector(DOCK_S, lerp(-2.6, -1.8, k)).add(V(0, 1.3, 0)), base.clone().add(V(0, 1.1, 0)), 40);
    w.city.shadowFocus(D().x, D().y, D().z, 8); ctx.ao = { radius: 0.5 }; grade.uFade = smooth(range(t, 4.6, 5.0)) * 0.3;
    w.city.update(t + 116, cam, engine.H); return w.scene;
  } },
  // ———————— 五、红点变绿与片尾 ————————
  { id: 's24', dur: 8, prepare: prepCommand, update(t, ctx) { // 红点逐个变绿，镜头缓慢推向最后一个红点
    const { cam, grade } = ctx; const c = CMD; const last = 7;
    const tgt = dotWorld(last); const k = smoother(t / 8) * 0.55;
    const start = V(0, 2.5, SCREEN.z + 11.5); const end = tgt.clone().add(V(0, 0, 0.9));
    look(cam, vlerp(start, end, k), vlerp(V(0, 2.6, SCREEN.z), tgt, smooth(t / 3)), 35);
    c.screenMat.uniforms.uTime.value = t + 10;
    const greenAt = (i) => 0.7 + i * 1.0;
    c.screenMat.uniforms.uState.value = c.dots.map((_, i) => (i === last ? 1 : 1 + clamp((t - greenAt(i)) / 0.3)));
    const saved = c.dots.filter((_, i) => i !== last && t > greenAt(i) + 0.15).length;
    drawScreenUI(c, { title: '灾区生命探测态势', sub: '救援进行中', count: `已救出：${saved}/8`, t });
    grade.uSat = 1.0; ctx.rays = 0; ctx.streaks = 0.25;
    return c.scene;
  } },
  { id: 's25', dur: 5, prepare: prepCommand, update(t, ctx) { // 推到最后一个红点铺满画面，变绿，转为纯绿
    const { cam, grade } = ctx; const c = CMD; const last = 7;
    const tgt = dotWorld(last);
    const s24end = vlerp(V(0, 2.5, SCREEN.z + 11.5), tgt.clone().add(V(0, 0, 0.9)), 0.55);
    const k = easeIn(range(t, 0, 3.4));
    const pos = vlerp(s24end, tgt.clone().add(V(0, 0, 0.03)), 1 - Math.pow(1 - k, 2.2));
    look(cam, pos, tgt, 35); cam.near = 0.004;
    c.screenMat.uniforms.uTime.value = t + 18;
    const turn = clamp((t - 4.1) / 0.18);
    c.screenMat.uniforms.uState.value = c.dots.map((_, i) => (i === last ? 1 + turn : 2));
    drawScreenUI(c, { title: '灾区生命探测态势', sub: '救援进行中', count: turn > 0.5 ? '已救出：8/8' : '已救出：7/8', t });
    grade.uFlash = 0.18 * Math.sin(Math.PI * clamp((t - 4.1) / 0.3));
    grade.uFadeColor = GREEN; grade.uFade = smooth(range(t, 4.35, 4.9)); grade.uBars = 0.105 * (1 - smooth(range(t, 4.3, 5.0)));
    ctx.rays = 0; ctx.streaks = 0;
    return c.scene;
  } },
  { id: 's26', dur: 9, prepare: prepCommand, update(t, ctx) { // 绿底片尾：项目名称、口号
    const { cam, grade, hud } = ctx; const c = CMD;
    look(cam, dotWorld(7).add(V(0, 0, 0.03)), dotWorld(7), 35); cam.near = 0.004;
    grade.uFadeColor = GREEN; grade.uFade = 1; grade.uBars = 0; grade.uVignette = 0.25; grade.uGrain = 0.02;
    titleCard(hud, t, { team: '' });
    ctx.rays = 0; ctx.streaks = 0;
    return EMPTY;
  } },
  // ———————— 封面图（不在正片里，用 --still 渲染） ————————
  { id: 'poster', dur: 1, prepare: prepWorld, update(t, ctx) {
    const { cam, engine, grade, hud } = ctx; const w = W; reset(w);
    const dir = V(-0.8, 0, 0.6).normalize(), heading = Math.atan2(dir.x, dir.z) + Math.PI;
    const P = V(60, 52, -40);
    combined(w, P, heading, -0.12, 0.08, rotorSpin(20, { t0: 0 }), 0.5);
    look(cam, P.clone().add(V(-7.4, 1.0, 5.6)), P.clone().add(V(-1.7, -1.2, -1.2)), 36);
    w.city.shadowFocus(P.x, 0, P.z, 120);
    ctx.dof = { focus: P.distanceTo(cam.position), aperture: 0.0012, maxblur: 0.006 };
    grade.uBars = 0; grade.uVignette = 0.65; ctx.rays = 1.1;
    posterCard(hud, {});
    w.city.update(30, cam, engine.H); return w.scene;
  } },
];

// 灾区世界：城区场景 + 无人机、六足机器人、扫描特效。提供结合/分离摆放的辅助函数。
import * as THREE from 'three';
import { buildCity, CITY } from './assets/city.js';
import { createDrone, rotorSpin, DRONE } from './assets/drone.js';
import { createHexapod, gaitFeet, footOnGround, HEX } from './assets/hexapod.js';
import { createScanFX } from './fx/scan.js';
import { createHelicopter } from './assets/helicopter.js';
import { createHuman } from './assets/human.js';

export const HANG_Y = DRONE.latchY - HEX.topY - 0.015; // 结合时六足机器人中心相对无人机机身的高度

// 只给设备类材质挂环境反射
export function applyEnv(root, env, intensity = 0.9) {
  root.traverse((o) => { if (o.isMesh && o.material && (o.material.isMeshStandardMaterial) && !o.material.emissiveMap) { o.material.envMap = env; o.material.envMapIntensity = intensity; o.material.needsUpdate = true; } });
}

export async function getWorld(engine) {
  return engine.getSet('world', async (e) => {
    const city = await buildCity(e);
    const drone = createDrone(); city.scene.add(drone.root);
    const hex = createHexapod(); city.scene.add(hex.root);
    applyEnv(drone.root, e.envMap); applyEnv(hex.root, e.envMap); applyEnv(city.dock.root, e.envMap, 0.6);
    const scan = createScanFX(); city.scene.add(scan.group);
    const heli = createHelicopter(); heli.root.visible = false; city.scene.add(heli.root); applyEnv(heli.root, e.envMap, 0.8);
    // 被困者的“热源”：探测画面里透过瓦砾显示的人形
    const victim = createHuman({ suit: 0xffffff, helmet: 0xffffff, skin: 0xffffff });
    const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.4).multiplyScalar(0.75), transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    victim.root.traverse((o) => { if (o.isMesh) { o.material = hot; o.castShadow = false; o.renderOrder = 10; } });
    victim.pose(0, 0); victim.root.rotation.set(-Math.PI / 2, 0, 0.4); victim.root.position.set(CITY.survivors[0][0] - 0.2, 0.25, CITY.survivors[0][1] + 0.7); victim.root.visible = false; city.scene.add(victim.root);
    return { city, scene: city.scene, drone, hex, scan, heli, victim, victimMat: hot };
  });
}

// 无人机位姿：pos [x,y,z]（机身中心），heading（绕 y），pitch（机头向下为正），roll
export function placeDrone(w, pos, heading = 0, pitch = 0, roll = 0, rot = { angle: 0, speed: 0 }) {
  w.drone.root.position.set(pos[0], pos[1], pos[2]);
  w.drone.root.rotation.set(0, heading, 0);
  w.drone.body.rotation.set(pitch, 0, roll);
  w.drone.setRotors(rot.angle, rot.speed);
  w.drone.root.updateMatrixWorld(true);
}

// 结合状态：六足机器人挂在机腹下、腿收起
export function attachHex(w) {
  if (w.hex.root.parent !== w.drone.body) w.drone.body.add(w.hex.root);
  w.hex.setPose({ x: 0, y: HANG_Y, z: 0, heading: 0 }, null, 1);
  w.drone.setLatch(0);
}
export function detachHex(w) {
  if (w.hex.root.parent !== w.scene) w.scene.add(w.hex.root);
}

export { CITY, rotorSpin, gaitFeet, footOnGround, HEX, DRONE };

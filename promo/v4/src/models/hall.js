// 指挥中心大厅（暖白棚拍风格）：正面视频墙（主屏显示上帝视角＋完整监控界面，两侧四块深色副屏）、两排操作台（每席两台显示器）、座椅、
// 操作员与指挥员、天花灯带、侧墙标识与采光窗、绿植。大厅放在远离城区的 HALL.O 处；主屏中心在局部 (0, SY, SZ)，
// 镜头正对主屏、距离 FILL_D 时主屏恰好铺满画面——这时大厅画面与直接渲染的上帝视角逐像素一致，可以无缝进出。
import { THREE, dyn, pool, mkCanvas, COL } from '../engine.js';
import { M, mesh, rbox, cyl } from '../mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawHuman } from './props.js';
import { FONT, MONO } from '../ui.js';
import { clamp, mulberry32 } from '../util.js';

export const HALL = { O: [-2600, 0, 0], SW: 8, SH: 4.5, SY: 3.3, SZ: -9, FOV: 35 };
HALL.FILL_D = HALL.SH / (2 * Math.tan(THREE.MathUtils.degToRad(HALL.FOV / 2)));
export const hallPt = (p) => [HALL.O[0] + p[0], HALL.O[1] + p[1], HALL.O[2] + p[2]];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function merged(list) { return mergeGeometries(list.map(([g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]]) => { const c = g.index ? g.toNonIndexed() : g.clone(); c.applyMatrix4(new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r, 'YXZ')), V(...s))); for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k); return c; }), false); }
const std = (o) => new THREE.MeshStandardMaterial(o);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const canvasTex = (w, h) => { const c = mkCanvas(w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { c, g: c.getContext('2d'), t }; };
const OPS = [[-5.4, -3.95], [-3.25, -3.95], [-1.1, -3.95], [1.1, -3.95], [3.25, -3.95], [5.4, -3.95], [-4.3, -0.5], [-1.45, -0.5], [1.45, -0.5], [4.3, -0.5]]; // 操作员（x, z）；后排在 0.3 米高台上

export class Hall {
  constructor() {
    const g = this.g = new THREE.Group(); g.position.set(...HALL.O); const { SW, SH, SY, SZ } = HALL;
    const floorTex = (() => { const T = canvasTex(512, 512); const c = T.g; const R0 = mulberry32(7); for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const v = 196 + Math.floor(R0() * 10); c.fillStyle = `rgb(${v},${v - 5},${v - 11})`; c.fillRect(i * 256, j * 256, 256, 256); for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(255,255,255,${0.02 + R0() * 0.03})`; c.fillRect(i * 256 + R0() * 256, j * 256 + R0() * 256, 30 + R0() * 80, 2); } }
      c.fillStyle = 'rgba(70,64,56,0.55)'; for (const q of [0, 256]) { c.fillRect(q, 0, 2, 512); c.fillRect(0, q, 512, 2); } T.t.wrapS = T.t.wrapT = THREE.RepeatWrapping; T.t.repeat.set(10, 10.8); return T.t; })();
    const carpetTex = (() => { const T = canvasTex(256, 256); const c = T.g; c.fillStyle = '#7b828b'; c.fillRect(0, 0, 256, 256); const R0 = mulberry32(9); for (let k = 0; k < 900; k++) { c.fillStyle = R0() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; c.fillRect(R0() * 256, R0() * 256, 2, 2); } c.fillStyle = 'rgba(0,0,0,0.08)'; for (let q = 0; q < 256; q += 64) { c.fillRect(q, 0, 1, 256); c.fillRect(0, q, 256, 1); } T.t.wrapS = T.t.wrapT = THREE.RepeatWrapping; T.t.repeat.set(17 / 1.6, 9.5 / 1.6); return T.t; })();
    const wall = std({ color: '#eeebe5', roughness: 0.92 }), floor = std({ color: '#ffffff', map: floorTex, roughness: 0.3 }), dark = std({ color: '#23262b', roughness: 0.5, metalness: 0.2 }), desk = std({ color: '#f5f3ef', roughness: 0.4 }), carpet = std({ color: '#ffffff', map: carpetTex, roughness: 0.95 }); /* 打磨：地面抛光石材、操作区深色地毯，白色桌面不再和地面糊在一起 */
    // 房间：地面、地毯、侧墙（竖向分缝＋橙色腰线）、后墙、天花与灯带
    g.add(mesh(merged([[box(24, 0.2, 26), [0, -0.1, 1.5]]]), floor)); g.add(mesh(merged([[box(17, 0.02, 9.5), [0, 0.01, -2.4]]]), carpet));
    g.add(mesh(merged([[box(0.3, 7.8, 26), [-11.15, 3.9, 1.5]], [box(0.3, 7.8, 26), [11.15, 3.9, 1.5]], [box(24, 7.8, 0.3), [0, 3.9, 14.6]], [box(24, 0.3, 26), [0, 7.75, 1.5]]]), wall));
    g.add(mesh(merged([...[-9, -6, -3, 0, 3, 6, 9, 12].flatMap((z) => [[box(0.03, 7.6, 0.03), [-10.99, 3.8, z]], [box(0.03, 7.6, 0.03), [10.99, 3.8, z]]]), [box(0.02, 0.08, 26), [-10.99, 1.05, 1.5]], [box(0.02, 0.08, 26), [10.99, 1.05, 1.5]]]), std({ color: '#cfcac2', roughness: 0.9 })));
    g.add(mesh(merged([[box(0.025, 0.06, 26), [-10.98, 1.15, 1.5]], [box(0.025, 0.06, 26), [10.98, 1.15, 1.5]]]), M.orange));
    const lightM = new THREE.MeshBasicMaterial({ color: '#fffdf8' }); g.add(mesh(merged([-6, -2, 2, 6].map((x) => [box(0.32, 0.04, 21), [x, 7.58, 1.5]])), lightM, false));
    // 右侧采光窗（亮面）、左侧标识墙
    g.add(mesh(merged([-5, 0, 5, 10].map((z) => [box(0.04, 3.4, 3.6), [10.97, 3.6, z]])), new THREE.MeshBasicMaterial({ color: '#fbfaf6' }), false));
    g.add(mesh(merged([-5, 0, 5, 10].flatMap((z) => [[box(0.06, 3.5, 0.08), [10.95, 3.6, z - 1.8]], [box(0.06, 0.08, 3.6), [10.95, 1.88, z]]])), dark));
    { const T = canvasTex(1024, 256); const c = T.g; c.fillStyle = '#f2efe9'; c.fillRect(0, 0, 1024, 256); c.fillStyle = COL.orange; c.fillRect(40, 60, 8, 136); c.fillStyle = '#1d1e21'; c.font = `900 92px ${FONT}`; c.fillText('六合 指挥中心', 76, 150); c.fillStyle = '#5b5d63'; c.font = `500 30px ${MONO}`; c.letterSpacing = '8px'; c.fillText('LH-6 COMMAND CENTER', 82, 206);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.8), new THREE.MeshBasicMaterial({ map: T.t })); pl.position.set(-10.97, 4.6, 3.5); pl.rotation.y = Math.PI / 2; g.add(pl); }
    // 视频墙：深色背框、主屏（外部传入的画面贴图）、边框、四块副屏、底部橙色灯条
    g.add(mesh(merged([[box(19.6, 6.4, 0.4), [0, 3.45, SZ - 0.42]]]), dark));
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); this.screen.position.set(0, SY, SZ); g.add(this.screen);
    const bz = SZ - 0.06, b = 0.14; g.add(mesh(merged([[box(SW + 2 * b, b, 0.12), [0, SY + SH / 2 + b / 2, bz]], [box(SW + 2 * b, b, 0.12), [0, SY - SH / 2 - b / 2, bz]], [box(b, SH, 0.12), [-SW / 2 - b / 2, SY, bz]], [box(b, SH, 0.12), [SW / 2 + b / 2, SY, bz]]]), std({ color: '#141518', roughness: 0.35, metalness: 0.4 })));
    this.side = []; for (const [x, y] of [[-6.45, 4.45], [-6.45, 2.4], [6.45, 4.45], [6.45, 2.4]]) { const T = canvasTex(512, 288); const m = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.75), new THREE.MeshBasicMaterial({ map: T.t, toneMapped: false })); m.position.set(x, y, SZ - 0.01); g.add(m);
      g.add(mesh(merged([[box(3.22, 1.87, 0.08), [x, y, SZ - 0.07]]]), std({ color: '#141518', roughness: 0.35, metalness: 0.4 }))); this.side.push(T); }
    g.add(mesh(merged([[box(19.4, 0.05, 0.06), [0, 0.36, SZ - 0.2]]]), new THREE.MeshBasicMaterial({ color: COL.orange }), false));
    { const T = canvasTex(256, 256); const c = T.g; const gr = c.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(170,215,255,0.9)'); gr.addColorStop(0.35, 'rgba(150,200,245,0.35)'); gr.addColorStop(1, 'rgba(150,200,245,0)'); c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
      const fade = c.createLinearGradient(0, 0, 256, 0); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.2, 'rgba(0,0,0,0)'); fade.addColorStop(0.8, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)'); c.globalCompositeOperation = 'destination-out'; c.fillStyle = fade; c.fillRect(0, 0, 256, 256);
      const spill = new THREE.Mesh(new THREE.PlaneGeometry(19, 6.5), new THREE.MeshBasicMaterial({ map: T.t, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); spill.rotation.x = -Math.PI / 2; spill.position.set(0, 0.03, SZ + 3.4); spill.renderOrder = 2; g.add(spill); } // 大屏照在地面上的冷光
    // 视频墙上方：深色吊顶灯槽（下沿冷色灯带）、大屏标题条与 LIVE 标识
    g.add(mesh(merged([[box(24, 1.0, 1.4), [0, 7.1, SZ + 0.45]]]), dark)); g.add(mesh(merged([[box(22, 0.03, 0.05), [0, 6.58, SZ + 1.12]]]), new THREE.MeshBasicMaterial({ color: '#bfe6ff' }), false));
    g.add(mesh(merged([-6, -1, 4, 9].map((z) => [box(24, 0.32, 0.22), [0, 7.44, z]])), std({ color: '#e3dfd8', roughness: 0.9 })));
    { const T = canvasTex(1024, 96); const c = T.g; c.fillStyle = '#23262b'; c.fillRect(0, 0, 1024, 96); c.fillStyle = COL.orange; c.fillRect(0, 30, 6, 36); c.fillStyle = '#f2efe9'; c.font = `700 40px ${FONT}`; c.fillText('灾区实时态势', 22, 62); c.fillStyle = '#8b939b'; c.font = `500 20px ${MONO}`; c.letterSpacing = '6px'; c.fillText('ZONE A · LIVE SITUATION · LH-6 OPS', 300, 60);
      const ttl = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.525), new THREE.MeshBasicMaterial({ map: T.t, toneMapped: false })); ttl.position.set(-SW / 2 + 2.8, SY + SH / 2 + 0.5, SZ + 0.005); g.add(ttl); }
    { const T = canvasTex(256, 64); this.live = T; const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), new THREE.MeshBasicMaterial({ map: T.t, toneMapped: false })); m.position.set(SW / 2 - 0.5, SY + SH / 2 + 0.5, SZ + 0.005); g.add(m); }
    // 两排操作台（后排在高台上）：桌面、前挡板、桌腿、每席两台显示器（共用一张会动的界面贴图）、键盘
    this.mon = canvasTex(384, 240); const monM = new THREE.MeshBasicMaterial({ map: this.mon.t, toneMapped: false });
    { const pt = carpetTex.clone(); pt.needsUpdate = true; pt.repeat.set(17 / 1.6, 3.4 / 1.6); g.add(mesh(merged([[box(17, 0.3, 3.4), [0, 0.15, -0.7]]]), std({ color: '#ffffff', map: pt, roughness: 0.95 }))); } // 后排高台也铺深色地毯
    g.add(mesh(merged([[box(17, 0.04, 0.06), [0, 0.32, -2.38]]]), std({ color: '#e4e0d9', roughness: 0.6 }))); g.add(mesh(merged([[box(17, 0.025, 0.03), [0, 0.285, 1.0]]]), new THREE.MeshBasicMaterial({ color: '#bfe6ff' }), false)); // 高台前沿踏步灯
    const deskL = [], monL = [], scrL = [], chairL = [];
    for (const [zr, y0, xs] of [[-4.9, 0, [-5.4, -3.25, -1.1, 1.1, 3.25, 5.4]], [-1.45, 0.3, [-4.3, -1.45, 1.45, 4.3]]]) { const L = xs.length > 4 ? 13.6 : 11.4;
      deskL.push([rbox(L, 0.06, 0.95, 0.02), [0, y0 + 0.76, zr]], [box(L, 0.7, 0.04), [0, y0 + 0.4, zr - 0.44]]); for (const x of [-L / 2 + 0.2, 0, L / 2 - 0.2]) deskL.push([box(0.06, 0.74, 0.8), [x, y0 + 0.37, zr]]);
      for (const x of xs) for (const sd of [-1, 1]) { const mx = x + sd * 0.36, ry = -sd * 0.18; monL.push([box(0.66, 0.42, 0.04), [mx, y0 + 1.12, zr - 0.18], [0, ry, 0]], [box(0.06, 0.3, 0.06), [mx, y0 + 0.92, zr - 0.22]], [box(0.26, 0.02, 0.18), [mx, y0 + 0.79, zr - 0.22]]);
        scrL.push([new THREE.PlaneGeometry(0.6, 0.36), [mx + Math.sin(ry) * 0.022, y0 + 1.12, zr - 0.18 + Math.cos(ry) * 0.022], [0, ry, 0]]); }
      for (const x of xs) { deskL.push([box(0.5, 0.02, 0.16), [x, y0 + 0.8, zr + 0.3]]); chairL.push([cyl(0.04, 0.04, 0.4, 8), [x, y0 + 0.24, zr + 0.95]], [rbox(0.52, 0.09, 0.5, 0.03), [x, y0 + 0.47, zr + 0.95]], [rbox(0.5, 0.62, 0.07, 0.03), [x, y0 + 0.84, zr + 1.2], [-0.12, 0, 0]], [cyl(0.3, 0.3, 0.04, 10), [x, y0 + 0.04, zr + 0.95]]); } }
    g.add(mesh(merged(deskL), desk)); g.add(mesh(merged(monL), dark)); g.add(mesh(merged(scrL), monM, false)); g.add(mesh(merged(chairL), dark));
    // 操作员耳麦：头带、耳罩、话筒（按坐姿头部位置摆好，一次合并）
    { const L = []; for (const [x, z] of OPS) { const y = (z > -1 ? 0.3 : 0) + 1.19, hz = z - 0.06; const band = new THREE.TorusGeometry(0.118, 0.011, 6, 20, Math.PI); L.push([band, [x, y + 0.005, hz]]); for (const sd of [-1, 1]) { const cup = cyl(0.045, 0.045, 0.03, 14); cup.rotateZ(Math.PI / 2); L.push([cup, [x + sd * 0.115, y - 0.005, hz]]); }
        const boom = cyl(0.006, 0.006, 0.14, 6); boom.rotateX(Math.PI / 2); boom.rotateY(-0.35); L.push([boom, [x - 0.095, y - 0.045, hz - 0.08]]); L.push([new THREE.SphereGeometry(0.014, 8, 6), [x - 0.07, y - 0.055, hz - 0.145]]); }
      g.add(mesh(merged(L), std({ color: '#1d1f23', roughness: 0.45 }))); }
    // 绿植与盆
    const R = mulberry32(12); const pots = [], leaves = [];
    for (const [x, z] of [[-10.2, -8.2], [10.2, -8.2], [-10.2, 13.4], [10.2, 13.4], [-10.3, 6.5]]) { pots.push([cyl(0.36, 0.28, 0.6, 14), [x, 0.3, z]]); for (let k = 0; k < 3; k++) leaves.push([new THREE.IcosahedronGeometry(0.55 - k * 0.1, 0), [x + (R() - 0.5) * 0.3, 1.0 + k * 0.5, z + (R() - 0.5) * 0.3], [R() * 3, R() * 3, 0]]); }
    g.add(mesh(merged(pots), std({ color: '#d8d3ca', roughness: 0.8 }))); g.add(mesh(merged(leaves), std({ color: '#c3cdb6', roughness: 0.85, flatShading: true })));
    // 后墙：玻璃隔断与门
    g.add(mesh(merged([[box(9, 3.2, 0.06), [-4, 1.6, 14.4]], [box(3.2, 3.2, 0.06), [7, 1.6, 14.4]]]), std({ color: '#c9d2d8', roughness: 0.1, metalness: 0.3 })));
    dyn(g);
  }
  setScreen(tex) { if (this.screen.material.map !== tex) { this.screen.material.map = tex; this.screen.material.needsUpdate = true; } }
  // 每帧：t 全片时间；src 大屏画面画布（副屏“无人机图传”从里面截取局部）；o.saved 已救出人数
  update(t, src, o = {}) {
    this.g.visible = true;
    // 桌面显示器：深色界面（地图网格＋数据条），整排共用
    { const c = this.mon.g; c.fillStyle = '#11161c'; c.fillRect(0, 0, 384, 240); c.strokeStyle = 'rgba(95,212,255,0.18)'; c.lineWidth = 1; for (let x = 0; x < 230; x += 23) { c.beginPath(); c.moveTo(x + 12, 30); c.lineTo(x + 12, 226); c.stroke(); } for (let y = 30; y < 230; y += 23) { c.beginPath(); c.moveTo(12, y); c.lineTo(242, y); c.stroke(); }
      c.fillStyle = COL.orange; c.fillRect(12, 10, 120, 8); for (let i = 0; i < 8; i++) { const w = 40 + 60 * Math.abs(Math.sin(i * 1.7 + t * 0.9)); c.fillStyle = i % 3 ? '#5fd4ff' : '#f4f2ee'; c.fillRect(262, 34 + i * 23, w, 9); }
      c.fillStyle = '#e5322d'; for (let i = 0; i < 8; i++) { const a = i * 2.1 + 0.4; c.beginPath(); c.arc(127 + Math.cos(a) * (40 + i * 9), 128 + Math.sin(a) * (30 + i * 7), 4, 0, 7); c.fill(); } this.mon.t.needsUpdate = true; }
    // 副屏：无人机图传（取大屏画面局部＋准星）、六足机器人状态、生命体征波形、通讯链路
    const sideBg = (c, title, en) => { c.fillStyle = '#12161b'; c.fillRect(0, 0, 512, 288); c.fillStyle = COL.orange; c.fillRect(16, 16, 4, 20); c.fillStyle = '#f4f2ee'; c.font = `700 20px ${FONT}`; c.fillText(title, 28, 33); c.fillStyle = '#7f8a94'; c.font = `500 13px ${MONO}`; c.fillText(en, 28 + c.measureText(title).width * 1.6, 33); };
    { const c = this.side[0].g; sideBg(c, '无人机图传', 'DRONE FEED · CAM 01'); if (src) c.drawImage(src, 760, 300, 520, 290, 16, 48, 480, 224); c.strokeStyle = '#5fd4ff'; c.lineWidth = 2; c.strokeRect(16, 48, 480, 224); c.beginPath(); c.moveTo(256, 130); c.lineTo(256, 190); c.moveTo(226, 160); c.lineTo(286, 160); c.stroke(); c.fillStyle = '#ff3b30'; if ((t * 2) % 1 < 0.6) { c.beginPath(); c.arc(470, 64, 6, 0, 7); c.fill(); } c.fillStyle = '#f4f2ee'; c.font = `500 13px ${MONO}`; c.fillText('ALT 25.0 M  ·  REC', 26, 264); this.side[0].t.needsUpdate = true; }
    { const c = this.side[1].g; sideBg(c, '六足机器人', 'HEXAPOD 01 · LEGS'); ['L1', 'L2', 'L3', 'R1', 'R2', 'R3'].forEach((l, i) => { const v = 0.45 + 0.35 * Math.abs(Math.sin(t * 1.3 + i * 1.1)); c.fillStyle = '#7f8a94'; c.font = `600 14px ${MONO}`; c.fillText(l, 26, 80 + i * 32); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(64, 68 + i * 32, 330, 12); c.fillStyle = i === 1 ? COL.orange : '#f4f2ee'; c.fillRect(64, 68 + i * 32, 330 * v, 12); c.fillStyle = '#f4f2ee'; c.fillText(`${Math.round(v * 100)}%`, 410, 80 + i * 32); }); this.side[1].t.needsUpdate = true; }
    { const c = this.side[2].g; sideBg(c, '生命体征', 'VITALS · 01'); c.strokeStyle = '#2ee68f'; c.lineWidth = 2.5; c.beginPath(); for (let x = 0; x <= 480; x += 2) { const ph = ((x / 480) * 3 + t * 1.5) % 1; const y = 150 - (ph > 0.42 && ph < 0.47 ? 70 * Math.sin((ph - 0.42) / 0.05 * Math.PI) : ph > 0.47 && ph < 0.5 ? -25 : 4 * Math.sin(ph * 20)); x ? c.lineTo(16 + x, y) : c.moveTo(16, y); } c.stroke();
      c.fillStyle = '#f4f2ee'; c.font = `800 44px ${FONT}`; c.fillText('92', 30, 252); c.font = `500 14px ${MONO}`; c.fillStyle = '#7f8a94'; c.fillText('HR BPM', 96, 252); c.fillStyle = '#f4f2ee'; c.font = `800 44px ${FONT}`; c.fillText('16', 230, 252); c.font = `500 14px ${MONO}`; c.fillStyle = '#7f8a94'; c.fillText('RESP /MIN', 296, 252); this.side[2].t.needsUpdate = true; }
    { const c = this.side[3].g; sideBg(c, '通讯链路', 'MESH · 5.8 GHZ'); const N = [[90, 210, '基站'], [256, 90, '无人机'], [420, 200, '六足']]; c.strokeStyle = 'rgba(95,212,255,0.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(...N[0].slice(0, 2)); c.lineTo(...N[1].slice(0, 2)); c.lineTo(...N[2].slice(0, 2)); c.stroke();
      for (let k = 0; k < 6; k++) { const u = (t * 0.6 + k / 6) % 1; const [a, b2] = u < 0.5 ? [N[2], N[1]] : [N[1], N[0]]; const v = (u % 0.5) * 2; c.fillStyle = COL.orange; c.beginPath(); c.arc(a[0] + (b2[0] - a[0]) * v, a[1] + (b2[1] - a[1]) * v, 4, 0, 7); c.fill(); }
      for (const [x, y, n] of N) { c.fillStyle = '#12161b'; c.strokeStyle = '#5fd4ff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 18, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#f4f2ee'; c.font = `600 15px ${FONT}`; c.textAlign = 'center'; c.fillText(n, x, y + 42); c.textAlign = 'left'; } this.side[3].t.needsUpdate = true; }
    { const c = this.live.g; c.clearRect(0, 0, 256, 64); c.fillStyle = '#c8302a'; c.beginPath(); c.roundRect(0, 4, 256, 56, 10); c.fill(); c.fillStyle = (t * 1.6) % 1 < 0.6 ? '#ffffff' : 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(34, 32, 11, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = `700 30px ${MONO}`; c.letterSpacing = '4px'; c.fillText('LIVE', 60, 43); c.letterSpacing = '0px'; c.font = `700 26px ${FONT}`; c.fillText('直播中', 160, 42); this.live.t.needsUpdate = true; }
    // 操作员（坐姿、敲键盘）与站立的指挥员；o.cheer 时后排几个人举手
    OPS.forEach(([x, z], i) => drawHuman({ pos: hallPt([x, z > -1 ? 0.3 : 0, z]), heading: Math.PI, sit: true, typing: true, phase: t * 6 + i * 1.7 }));
    drawHuman({ pos: hallPt([5.6, 0, -6.9]), heading: Math.PI + 0.45, phase: 0, run: 0, armsUp: !!o.point, noHelm: true });
    drawHuman({ pos: hallPt([-7.6, 0, -7.2]), heading: Math.PI - 0.6, phase: 0, run: 0, noHelm: true });
    return this.g;
  }
}
export const HALLS = pool(() => new Hall());

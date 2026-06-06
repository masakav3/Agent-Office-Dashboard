// Claude Office · 3D 微缩原型（vanilla three.js, ESM）
// 渲染层独立：读后端 /cc/rooms + /cc/weather，与 2D 版 office.js 共用同一数据层。
// AIGC CLAUDE-OPUS-4-8 2026-06-06
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// ── 状态语义色（与 2D office.js 的 STATES 对齐）──────────────────────────
const STATE = {
  thinking:    { zh: "思考",   c: 0x7b6cf0 },
  researching: { zh: "查阅",   c: 0x3aa6e6 },
  writing:     { zh: "写文件", c: 0x3fb968 },
  executing:   { zh: "执行",   c: 0xe6a52e },
  delegating:  { zh: "派活",   c: 0xa05be0 },
  waiting:     { zh: "等授权", c: 0xef8a3a },
  error:       { zh: "出错",   c: 0xe0503a },
  idle:        { zh: "待命",   c: 0x9aa3b2 },
  working:     { zh: "工作",   c: 0xe6a52e },
};
const stOf = (s) => STATE[s] || STATE.idle;

// 房间部门配色池（楼层地板/墙裙的暖色低饱调）
const ACCENTS = [0xe8a36b, 0x6fa8c7, 0x8bbf8f, 0xc78fb0, 0xd9b15e, 0x8e88c4, 0xcf8d72];
const ROOM = 4.4;          // 每间办公室占地（世界单位）
const GAP = 0.5;           // 房间间隔
const WALL_H = 1.05;       // 矮墙（开放式娃娃屋视角）
const POLL_MS = 2500;

// ── three 基础 ────────────────────────────────────────────────────────
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;     // 电影级色调映射，配合暖调
renderer.toneMappingExposure = 1.04;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// 正交相机 = 保留 iso 微缩视角（远近不变形，像看模型）
let viewSize = 13;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
function isoPlace() {
  const d = 60;
  camera.position.set(d, d * 0.82, d);   // ~35° 仰角 iso
  camera.lookAt(0, 0, 0);
}
isoPlace();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;   // 不许钻到地板下
controls.minZoom = 0.45;
controls.maxZoom = 2.6;
controls.target.set(0, 0.4, 0);

// ── 灯光（软阴影 = 微缩模型质感的灵魂）────────────────────────────────
const hemi = new THREE.HemisphereLight(0xfff4e2, 0x6b5a44, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);   // 暖阳
sun.position.set(18, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 7;                    // 柔和阴影边缘
sun.shadow.bias = -0.0004;
const sc = sun.shadow.camera;
sc.near = 1; sc.far = 120; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbcd0ff, 0.35);  // 冷补光（天光）
fill.position.set(-16, 14, -10);
scene.add(fill);

// ── 天气驱动光照 + 天空 + 雨雪粒子（呼应 2D 版"窗外天气"彩蛋）────────────
// 配色复用 2D office.js 的 SKY_GRAD，让 3D 与 2D 视觉一致。
// 每种 sky × 昼夜：bg=天空渐变, sun=[色,强度,[x,y,z]], hemi=[天色,地色,强度],
//                  exp=曝光, shadow=阴影柔度, fog=雾密度, fx=粒子, flash=雷暴闪
const SKY = {
  clear:  { day:{ bg:["#bfe3f5","#eef5ec"], sun:[0xfff1da,2.3,[20,36,12]], hemi:[0xcfeaff,0x6b5a44,0.5],  exp:1.07, shadow:4.5, fog:0 },
            night:{ bg:["#0e1220","#232b3e"], sun:[0xaab8ff,0.5,[-14,30,-8]], hemi:[0x29344f,0x12100d,0.22], exp:0.9,  shadow:8,  fog:0 } },
  partly: { day:{ bg:["#bcd8e8","#e7efe9"], sun:[0xfff0d8,1.9,[18,34,12]], hemi:[0xc8e0ee,0x6b5a44,0.6],  exp:1.05, shadow:5.5, fog:0 },
            night:{ bg:["#121829","#2c3550"], sun:[0x9fb0ff,0.45,[-12,28,-6]], hemi:[0x2a3550,0x14110e,0.25], exp:0.9,  shadow:8,  fog:0 } },
  cloudy: { day:{ bg:["#9aaab8","#d2dae0"], sun:[0xf2f3f5,1.05,[10,38,8]], hemi:[0xccd5dc,0x70655a,0.95], exp:1.0,  shadow:13, fog:0.012 },
            night:{ bg:["#1b2236","#3a4254"], sun:[0x9aa6c4,0.3,[-8,30,-4]],  hemi:[0x36405a,0x16140f,0.32], exp:0.88, shadow:14, fog:0.014 } },
  fog:    { day:{ bg:["#c4c9cd","#e6e9ea"], sun:[0xeceef0,0.7,[8,40,6]],   hemi:[0xd6dadd,0x8a8378,1.05], exp:0.98, shadow:18, fog:0.05 },
            night:{ bg:["#23262e","#444a54"], sun:[0x9aa0ac,0.22,[-6,32,-2]], hemi:[0x3a3f49,0x18160f,0.34], exp:0.86, shadow:18, fog:0.06 } },
  rain:   { day:{ bg:["#6f7a86","#aab4be"], sun:[0xc9d2da,0.7,[8,34,8]],   hemi:[0xaab6c0,0x5a5448,0.9],  exp:0.96, shadow:16, fog:0.02,  fx:"rain" },
            night:{ bg:["#1a2230","#39424f"], sun:[0x8a96b0,0.26,[-6,28,-4]], hemi:[0x303a4a,0x14120e,0.32], exp:0.85, shadow:16, fog:0.024, fx:"rain" } },
  storm:  { day:{ bg:["#565d68","#8a929c"], sun:[0xb9c2cc,0.55,[6,32,6]],  hemi:[0x9aa4ae,0x4e4840,0.85], exp:0.93, shadow:17, fog:0.028, fx:"rain", flash:true },
            night:{ bg:["#13171f","#2c333f"], sun:[0x7d88a0,0.22,[-5,26,-3]], hemi:[0x2a323e,0x12100d,0.3],  exp:0.82, shadow:17, fog:0.03,  fx:"rain", flash:true } },
  snow:   { day:{ bg:["#aebcca","#e8eef4"], sun:[0xeaf0f6,1.0,[12,36,10]], hemi:[0xd2dde8,0x7a756a,0.95], exp:1.02, shadow:13, fog:0.018, fx:"snow" },
            night:{ bg:["#222a3c","#444c60"], sun:[0x9fb0ff,0.34,[-8,30,-5]], hemi:[0x36405a,0x16140f,0.34], exp:0.9,  shadow:14, fog:0.02,  fx:"snow" } },
};

// 雨雪粒子（THREE.Points，世界空间罩住整栋楼）
let weatherFx = null;
function disposeFx() {
  if (!weatherFx) return;
  scene.remove(weatherFx.pts); weatherFx.pts.geometry.dispose(); weatherFx.pts.material.dispose();
  weatherFx = null;
}
function makeFx(kind) {
  const n = (NUM > 0 ? NUM : (kind === "rain" ? 2200 : 1100)), R = 28, H = 24;
  const pos = new Float32Array(n * 3), spd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * R;
    pos[i * 3 + 1] = Math.random() * H;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * R;
    spd[i] = kind === "rain" ? 22 + Math.random() * 14 : 2.0 + Math.random() * 1.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: kind === "rain" ? 0xb4ccdb : 0xffffff,
    size: PSIZE > 0 ? PSIZE : (kind === "rain" ? 2.6 : 5.0),
    sizeAttenuation: false,                 // 正交相机下用屏幕像素尺寸，否则点被缩成亚像素看不见
    transparent: true, opacity: kind === "rain" ? 0.6 : 0.92, depthWrite: false });
  const pts = new THREE.Points(geo, m); pts.renderOrder = 3; scene.add(pts);
  weatherFx = { kind, pts, spd, R, H, n };
}
function stepWeather(dt, t) {
  if (!weatherFx) return;
  const { kind, pts, spd, R, H, n } = weatherFx;
  const p = pts.geometry.attributes.position.array;
  for (let i = 0; i < n; i++) {
    p[i * 3 + 1] -= spd[i] * dt;
    p[i * 3] += kind === "snow" ? Math.sin(t * 1.4 + i) * dt * 0.5 : dt * 3.4;   // 雪飘 / 雨斜
    if (p[i * 3 + 1] < 0.1) {
      p[i * 3 + 1] = H; p[i * 3] = (Math.random() * 2 - 1) * R; p[i * 3 + 2] = (Math.random() * 2 - 1) * R;
    }
  }
  pts.geometry.attributes.position.needsUpdate = true;
}

// 雷暴闪电（全屏白光脉冲）+ 天气徽标
const flashEl = document.createElement("div");
flashEl.style.cssText = "position:fixed;inset:0;background:#eaf2ff;opacity:0;pointer-events:none;z-index:7;transition:opacity .12s";
document.body.appendChild(flashEl);
let stormFlash = false, flashCd = 3, flashDecay = 0;
const skyBadge = document.createElement("div");
skyBadge.className = "ui";
skyBadge.style.cssText = "top:64px;left:26px;font-size:13px;font-weight:600;opacity:.82";
document.body.appendChild(skyBadge);

let curSky = "", curTod = "";
function applyWeather(sky, isDay, city, temp) {
  const key = SKY[sky] ? sky : "clear";
  const tod = isDay === false ? "night" : "day";
  const c = SKY[key][tod];
  document.body.style.background = `radial-gradient(120% 120% at 50% 16%, ${c.bg[0]} 0%, ${c.bg[1]} 100%)`;
  document.body.dataset.tod = tod;
  sun.color.setHex(c.sun[0]); sun.intensity = c.sun[1] * SUNK;
  sun.position.set(c.sun[2][0], c.sun[2][1], c.sun[2][2]);
  sun.shadow.radius = c.shadow;
  hemi.color.setHex(c.hemi[0]); hemi.groundColor.setHex(c.hemi[1]); hemi.intensity = c.hemi[2];
  renderer.toneMappingExposure = EXP > 0 ? EXP : c.exp;
  fill.intensity = tod === "night" ? 0.18 : 0.34;
  studio.material.opacity = (key === "clear" || key === "partly") ? (tod === "night" ? 0.12 : 0.2) : 0.07;
  // 线性雾按相机距离取 near/far，避免正交远距相机被指数雾整片抹白（永不吞没场景）
  const fogD = c.fog * FOGK;
  if (fogD > 0) {
    const cd = camera.position.distanceTo(controls.target);
    const t = Math.min(1, Math.max(0, (fogD - 0.012) / 0.048));   // 0=轻雾 1=浓雾
    scene.fog = new THREE.Fog(new THREE.Color(c.bg[1]).getHex(), cd * (0.9 - 0.4 * t), cd * (2.3 - 0.8 * t));
  } else {
    scene.fog = null;
  }
  if (curSky !== key || curTod !== tod) { disposeFx(); if (c.fx) makeFx(c.fx); }
  curSky = key; curTod = tod;
  stormFlash = !!c.flash; if (!stormFlash) flashEl.style.opacity = "0";
  const ic = { clear: "☀️", partly: "⛅", cloudy: "☁️", fog: "🌫️", rain: "🌧️", storm: "⛈️", snow: "❄️" }[key] || "☀️";
  skyBadge.textContent = `${ic} ${city || ""}${temp != null ? " " + Math.round(temp) + "°" : ""} · ${tod === "night" ? "夜" : "日"}`;
}

// 调试参数（URL query，便于实时拨参对比）：
//   sky=clear|partly|cloudy|fog|rain|storm|snow   tod=day|night
//   n=粒子数   psize=粒子像素大小   fog=雾强度倍数(0=关)   sun=主光强度倍数   exp=曝光覆盖
const _wq = new URLSearchParams(location.search);
const SKY_OVERRIDE = _wq.get("sky");
const TOD_OVERRIDE = _wq.get("tod");                              // day / night
const NUM = parseInt(_wq.get("n"), 10) || 0;                      // 粒子数量(0=用默认)
const PSIZE = parseFloat(_wq.get("psize")) || 0;                  // 粒子像素大小(0=用默认)
const FOGK = _wq.get("fog") != null ? parseFloat(_wq.get("fog")) : 1;   // 雾强度倍数(0=关)
const SUNK = _wq.get("sun") != null ? parseFloat(_wq.get("sun")) : 1;   // 主光强度倍数
const EXP = parseFloat(_wq.get("exp")) || 0;                      // 曝光覆盖(0=用默认)

// ── 材质/几何工具 ─────────────────────────────────────────────────────
const matCache = new Map();
function mat(color, { rough = 0.85, metal = 0.0, emissive = 0x000000, ei = 0 } = {}) {
  const key = `${color}-${rough}-${metal}-${emissive}-${ei}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal,
    emissive, emissiveIntensity: ei });
  matCache.set(key, m);
  return m;
}
const geoCache = new Map();
function rbox(w, h, d, r = 0.08) {
  const key = `${w}-${h}-${d}-${r}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new RoundedBoxGeometry(w, h, d, 3, r);
  geoCache.set(key, g);
  return g;
}
function meshRB(w, h, d, r, material, cast = true, recv = true) {
  const m = new THREE.Mesh(rbox(w, h, d, r), material);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}

// ── 地基：漂浮的圆角台座 + 工作室地面（接住投影 = "桌上模型"感）────────
const studio = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
  new THREE.ShadowMaterial({ opacity: 0.18 }));
studio.rotation.x = -Math.PI / 2;
studio.position.y = -0.6;
studio.receiveShadow = true;
scene.add(studio);

let baseSlab = null;
function buildBase(cols, rows) {
  if (baseSlab) { scene.remove(baseSlab); baseSlab.geometry.dispose(); }
  const w = cols * (ROOM + GAP) + 2.2, d = rows * (ROOM + GAP) + 2.2;
  baseSlab = meshRB(w, 1.0, d, 0.18, mat(0xf3ead9, { rough: 0.95 }), false, true);
  baseSlab.position.y = -0.5;
  scene.add(baseSlab);
  // 草坪边沿
  const lawn = meshRB(w + 1.4, 0.55, d + 1.4, 0.2, mat(0x9cc08a, { rough: 1 }), false, true);
  lawn.position.y = -0.78;
  baseSlab.add(lawn);
}

// ── 角色：chibi 小人（圆角身体 + 头 + 脚下状态光盘）───────────────────
function makeFigure(boss) {
  const g = new THREE.Group();
  const scale = boss ? 1.18 : 0.92;
  const suit = boss ? 0x4a4f6a : 0x5d6580;
  const body = meshRB(0.5, 0.66, 0.42, 0.16, mat(suit, { rough: 0.7 }));
  body.position.y = 0.5; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), mat(0xf2c79c, { rough: 0.6 }));
  head.position.y = 1.0; head.castShadow = true; g.add(head);
  if (boss) { // 头儿小皇冠
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 6),
      mat(0xe8b54b, { rough: 0.4, metal: 0.6, emissive: 0xe8b54b, ei: 0.15 }));
    crown.position.y = 1.26; crown.castShadow = true; g.add(crown);
  }
  // 脚下状态光盘（从 iso 一眼读状态）
  const disc = new THREE.Mesh(new THREE.CircleGeometry(boss ? 0.62 : 0.5, 32),
    new THREE.MeshBasicMaterial({ color: 0x9aa3b2, transparent: true, opacity: 0.6 }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; g.add(disc);
  g.scale.setScalar(scale);
  g.userData = { disc, body, head, boss, phase: Math.random() * 6.28, state: "idle",
    tcol: new THREE.Color(0x9aa3b2) };
  return g;
}
function makeMonster() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0),
    mat(0xe0503a, { rough: 0.5, emissive: 0x5a1208, ei: 0.5 }));
  body.castShadow = true; body.position.y = 0.7; g.add(body);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat(0xfff2cc, { emissive: 0xffcc55, ei: 0.6 }));
  eye.position.set(0, 0.78, 0.5); g.add(eye);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32),
    new THREE.MeshBasicMaterial({ color: 0xe0503a, transparent: true, opacity: 0.7 }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; g.add(disc);
  g.userData = { body, phase: 0, monster: true };
  return g;
}

// ── 一间办公室：地板 + 两面矮墙 + 桌屏 ───────────────────────────────
function buildRoom(accent) {
  const g = new THREE.Group();
  const floor = meshRB(ROOM, 0.16, ROOM, 0.06, mat(accent, { rough: 0.9 }), false, true);
  floor.position.y = 0.08; g.add(floor);
  // 矮墙在 -x / -z 两侧（默认相机看得进的背左角）
  const wallMat = mat(0xfbf7ef, { rough: 0.95 });
  const wz = meshRB(ROOM, WALL_H, 0.12, 0.04, wallMat);
  wz.position.set(0, WALL_H / 2 + 0.16, -ROOM / 2 + 0.06); g.add(wz);
  const wx = meshRB(0.12, WALL_H, ROOM, 0.04, wallMat);
  wx.position.set(-ROOM / 2 + 0.06, WALL_H / 2 + 0.16, 0); g.add(wx);
  // 墙裙（accent 色腰线）
  const skirt = meshRB(ROOM, 0.1, 0.14, 0.02, mat(accent, { rough: 0.6 }));
  skirt.position.set(0, 0.5, -ROOM / 2 + 0.07); g.add(skirt);
  // 沿墙摆几张桌子 + 发光屏
  const deskMat = mat(0xc99a6b, { rough: 0.65 });
  const screenMat = mat(0x16324a, { emissive: 0x2f9bd6, ei: 0.9 });
  const seats = [];
  const spots = [[-ROOM / 2 + 0.9, -0.5], [-ROOM / 2 + 0.9, 0.7], [0.4, -ROOM / 2 + 0.9], [1.4, -ROOM / 2 + 0.9]];
  spots.forEach(([x, z], i) => {
    const desk = meshRB(0.95, 0.5, 0.6, 0.06, deskMat);
    desk.position.set(x, 0.41, z);
    const along = i < 2;   // 前两张贴左墙、后两张贴后墙朝向不同
    desk.rotation.y = along ? Math.PI / 2 : 0;
    g.add(desk);
    const scr = meshRB(0.6, 0.42, 0.05, 0.02, screenMat);
    scr.position.set(x + (along ? 0.18 : 0), 0.82, z + (along ? 0 : 0.18));
    scr.rotation.y = desk.rotation.y;
    g.add(scr);
    seats.push({ x: x + (along ? 0.5 : 0), z: z + (along ? 0 : 0.5) });
  });
  g.userData = { seats };
  return g;
}

// ── 房间编排（网格）+ 角色复用 reconcile ──────────────────────────────
const rooms = new Map();    // sessionId -> { group, fig(boss), emps[], monster }
let gridCols = 1, gridRows = 1;

function layout(n) {
  gridCols = Math.max(1, Math.ceil(Math.sqrt(n)));
  gridRows = Math.max(1, Math.ceil(n / gridCols));
  buildBase(gridCols, gridRows);
}
function cellPos(i) {
  const cx = i % gridCols, cz = Math.floor(i / gridCols);
  const ox = (gridCols - 1) / 2, oz = (gridRows - 1) / 2;
  return { x: (cx - ox) * (ROOM + GAP), z: (cz - oz) * (ROOM + GAP) };
}

function setFigState(fig, state) {
  const c = stOf(state).c;
  fig.userData.state = state;
  fig.userData.tcol.setHex(c);
}

function hashStr(s) { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

function syncRooms(list) {
  // 永不空楼：零会话给个占位总部
  if (!list.length) list = [{ sessionId: "__hq__", label: "总部 · 待命中", boss: { state: "idle" }, employees: [], placeholder: true }];
  const changed = list.length !== rooms.size || [...rooms.keys()].some((k) => !list.find((r) => r.sessionId === k));
  if (changed) {
    // 房间增减 → 重排网格（原型：简单重建房间外壳，角色随后挂入）
    for (const [, r] of rooms) scene.remove(r.group);
    rooms.clear();
    layout(list.length);
    list.forEach((r, i) => {
      const accent = ACCENTS[hashStr(r.sessionId) % ACCENTS.length];
      const group = new THREE.Group();
      const shell = buildRoom(accent);
      group.add(shell);
      const p = cellPos(i);
      group.position.set(p.x, 0, p.z);
      scene.add(group);
      const fig = makeFigure(true);
      fig.position.set(0.3, 0.16, 0.3);
      group.add(fig);
      rooms.set(r.sessionId, { group, fig, emps: [], monster: null, seats: shell.userData.seats, accent });
    });
  }
  // 更新各房间状态/员工/怪兽
  list.forEach((r) => {
    const room = rooms.get(r.sessionId);
    if (!room) return;
    setFigState(room.fig, (r.boss && r.boss.state) || "idle");
    const want = Math.min((r.employees || []).length, room.seats.length);
    while (room.emps.length < want) {
      const e = makeFigure(false);
      const s = room.seats[room.emps.length];
      e.position.set(s.x, 0.16, s.z);
      room.group.add(e); room.emps.push(e);
    }
    while (room.emps.length > want) { const e = room.emps.pop(); room.group.remove(e); }
    room.emps.forEach((e) => setFigState(e, (r.boss && r.boss.state) === "delegating" ? "executing" : "working"));
    // 怪兽
    if (r.monster && !room.monster) {
      room.monster = makeMonster(); room.monster.position.set(0, 0.16, -0.4); room.group.add(room.monster);
      setFigState(room.fig, "error");
    } else if (!r.monster && room.monster) {
      room.group.remove(room.monster); room.monster = null;
    }
  });
  document.getElementById("loading").style.display = "none";
}

// ── 动画循环：状态色补间 + 体态律动 ───────────────────────────────────
const bobFreq = (s) => s === "writing" ? 9 : s === "executing" || s === "working" ? 6 :
  s === "researching" ? 3 : s === "error" ? 16 : 1.6;
const clock = new THREE.Clock();
let autoRotate = false;

function animFig(fig, t) {
  const u = fig.userData;
  // 状态光盘颜色平滑过渡 + 呼吸
  u.disc.material.color.lerp(u.tcol, 0.08);
  u.disc.material.opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3 + u.phase));
  // 头/身随状态律动
  const f = bobFreq(u.state);
  const amp = u.state === "error" ? 0.05 : 0.035;
  const bob = Math.sin(t * f + u.phase) * amp;
  fig.position.y = 0.16 + Math.max(0, bob);
  u.head.position.y = 1.0 + bob * 0.5;
  // 工作态身体轻微前倾
  const lean = (u.state === "writing" || u.state === "executing" || u.state === "working") ? 0.12 : 0;
  fig.rotation.x = lean * (0.6 + 0.4 * Math.sin(t * f + u.phase));
}

let lastT = 0;
function loop() {
  const t = clock.getElapsedTime();
  const dt = Math.min(0.05, t - lastT); lastT = t;
  for (const [, r] of rooms) {
    animFig(r.fig, t);
    r.emps.forEach((e) => animFig(e, t));
    if (r.monster) {
      r.monster.userData.body.rotation.y = t * 1.2;
      r.monster.userData.body.position.y = 0.7 + Math.abs(Math.sin(t * 5)) * 0.12;
    }
  }
  stepWeather(dt, t);                                   // 雨雪下落
  if (stormFlash) {                                     // 雷暴闪电
    flashCd -= dt;
    if (flashCd <= 0) { flashEl.style.opacity = "0.5"; flashDecay = 0.16; flashCd = 3 + Math.random() * 7; }
  }
  if (flashDecay > 0) { flashDecay -= dt; if (flashDecay <= 0) flashEl.style.opacity = "0"; }
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 0.6;
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

// ── 视口 / 正交投影 ───────────────────────────────────────────────────
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  const a = w / h;
  camera.left = -viewSize * a; camera.right = viewSize * a;
  camera.top = viewSize; camera.bottom = -viewSize;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

// ── 数据轮询 ──────────────────────────────────────────────────────────
async function pollRooms() {
  try {
    const res = await fetch("/cc/rooms", { cache: "no-store" });
    const data = await res.json();
    syncRooms(data.rooms || []);
    const n = (data.rooms || []).length;
    document.getElementById("hud").textContent =
      `${n} 间办公室 · 负载 ${Math.round(data.load || 0)}%` +
      (data.net ? ` · DGX ${data.net.ok ? "🟢" : "⛔"}` : "");
  } catch (e) { /* 后端没起就静默重试 */ }
}
async function pollWeather() {
  try {
    const w = await (await fetch("/cc/weather", { cache: "no-store" })).json();
    const sky = SKY_OVERRIDE || (w && w.sky) || "clear";
    const isDay = TOD_OVERRIDE ? TOD_OVERRIDE !== "night" : (w ? w.isDay : true);
    applyWeather(sky, isDay, w && w.city, w && w.temp);
  } catch (e) {
    if (SKY_OVERRIDE) applyWeather(SKY_OVERRIDE, TOD_OVERRIDE !== "night", "", null);  // 后端没起也能预览
  }
}
pollRooms(); pollWeather();
setInterval(pollRooms, POLL_MS);
setInterval(pollWeather, 300000);

// ── UI 浮层 ───────────────────────────────────────────────────────────
const legend = document.getElementById("legend");
["thinking", "researching", "writing", "executing", "delegating", "waiting", "error", "idle"].forEach((s) => {
  const el = document.createElement("span"); el.className = "it";
  const hex = "#" + stOf(s).c.toString(16).padStart(6, "0");
  el.innerHTML = `<span class="dot" style="background:${hex};color:${hex}"></span>${stOf(s).zh}`;
  legend.appendChild(el);
});
const btnRotate = document.getElementById("btnRotate");
btnRotate.addEventListener("click", () => {
  autoRotate = !autoRotate; btnRotate.setAttribute("aria-pressed", String(autoRotate));
});
document.getElementById("btnReset").addEventListener("click", () => {
  isoPlace(); viewSize = 13; camera.zoom = 1; controls.target.set(0, 0.4, 0);
  camera.updateProjectionMatrix(); resize();
});

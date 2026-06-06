// Claude Office · 3D 微缩原型（vanilla three.js, ESM）
// 渲染层独立：读后端 /cc/rooms + /cc/weather，与 2D 版 office.js 共用同一数据层。
// AIGC CLAUDE-OPUS-4-8 2026-06-06
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";

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
const ROOM = 8.8;          // 每间办公室占地（世界单位；土字形 5 工位宽松不挤）
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

// ── 后期 Bloom 辉光（Tokyo Night 霓虹的灵魂：发光体真的会晕开光晕）──────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.55, 0.3);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// 天空渐变背景（不透明，配合 Bloom；CSS 调色/移轴/暗角层仍叠在其上）
let _skyTex = null;
function skyTex(topHex, botHex) {
  const cv = document.createElement("canvas"); cv.width = 8; cv.height = 256;
  const g = cv.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, topHex); grd.addColorStop(1, botHex);
  g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (_skyTex) _skyTex.dispose();
  _skyTex = tex; return tex;
}

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
const amb = new THREE.AmbientLight(0xffffff, 0.18);      // 环境底光：抬暗面，杜绝夜间小人纯黑（applyWeather 按昼夜调）
scene.add(amb);

// ── 天气驱动光照 + 天空 + 雨雪粒子（呼应 2D 版"窗外天气"彩蛋）────────────
// 配色复用 2D office.js 的 SKY_GRAD，让 3D 与 2D 视觉一致。
// 每种 sky × 昼夜：bg=天空渐变, sun=[色,强度,[x,y,z]], hemi=[天色,地色,强度],
//                  exp=曝光, shadow=阴影柔度, fog=雾密度, fx=粒子, flash=雷暴闪
// 白天=徕卡复古胶片暖调（暖、通透、富层次）；夜间=Tokyo Night 霓虹赛博（深靛蓝底 #1a1b26/#24283b
// + 荧光蓝月光 #7aa2f7 / 青 #7dcfff / 紫 #bb9af7），半球天光提亮近一倍、曝光抬到 ~1.0 解决"太暗看不清"。
const SKY = {
  clear:  { day:{ bg:["#cfe6f2","#f3ecdd"], sun:[0xffe7c2,2.2,[20,36,12]],  hemi:[0xdbecff,0x7c6b50,0.55], exp:1.06, shadow:4.5, fog:0 },
            night:{ bg:["#24283b","#16161e"], sun:[0x7aa2f7,0.95,[-14,30,-8]], hemi:[0x6b74a8,0x1a1b26,0.62], exp:1.03, shadow:7,  fog:0 } },
  partly: { day:{ bg:["#c9dde7","#f0e9da"], sun:[0xffe4ba,1.9,[18,34,12]],  hemi:[0xd2e4f0,0x7c6b50,0.62], exp:1.05, shadow:5.5, fog:0 },
            night:{ bg:["#272b40","#17171f"], sun:[0x7aa2f7,0.9,[-12,28,-6]], hemi:[0x68719f,0x1a1b26,0.6],  exp:1.02, shadow:8,  fog:0 } },
  cloudy: { day:{ bg:["#aab4bd","#dcdbcf"], sun:[0xf3ede0,1.1,[10,38,8]],   hemi:[0xd2d6cf,0x83745c,0.95], exp:1.0,  shadow:13, fog:0.012 },
            night:{ bg:["#2a2e42","#1a1b26"], sun:[0x8aa0e0,0.6,[-8,30,-4]],  hemi:[0x565f89,0x16161e,0.62], exp:1.0,  shadow:14, fog:0.012 } },
  fog:    { day:{ bg:["#cbccc6","#ebe7da"], sun:[0xefe9dc,0.8,[8,40,6]],    hemi:[0xdcdcd2,0x968a73,1.05], exp:0.99, shadow:18, fog:0.05 },
            night:{ bg:["#33384d","#23263a"], sun:[0x8e9cc8,0.5,[-6,32,-2]],  hemi:[0x5a6390,0x1a1b26,0.66], exp:1.0,  shadow:18, fog:0.05 } },
  rain:   { day:{ bg:["#7a828c","#b3b6ab"], sun:[0xd0d2c4,0.85,[8,34,8]],   hemi:[0xb3b8b0,0x6a6450,0.9],  exp:0.98, shadow:16, fog:0.02,  fx:"rain" },
            night:{ bg:["#1f2335","#13131a"], sun:[0x7dcfff,0.6,[-6,28,-4]],  hemi:[0x4a5384,0x16161e,0.6],  exp:1.0,  shadow:16, fog:0.02,  fx:"rain" } },
  storm:  { day:{ bg:["#5f6671","#8e958c"], sun:[0xbfc6bc,0.7,[6,32,6]],    hemi:[0xa2aaa0,0x5a5440,0.85], exp:0.95, shadow:17, fog:0.026, fx:"rain", flash:true },
            night:{ bg:["#1a1b26","#101017"], sun:[0xbb9af7,0.55,[-5,26,-3]], hemi:[0x494f7a,0x121219,0.58], exp:0.98, shadow:17, fog:0.028, fx:"rain", flash:true } },
  snow:   { day:{ bg:["#b6c2cd","#ecefe6"], sun:[0xf3f0e6,1.05,[12,36,10]], hemi:[0xd8ddd6,0x80796a,0.95], exp:1.02, shadow:13, fog:0.016, fx:"snow" },
            night:{ bg:["#2a2e44","#1a1b2a"], sun:[0x9ec0ff,0.6,[-8,30,-5]],  hemi:[0x5a6390,0x17171f,0.66], exp:1.02, shadow:14, fog:0.018, fx:"snow" } },
};

// 雨雪粒子（THREE.Points，世界空间罩住整栋楼）
let weatherFx = null;
function disposeFx() {
  if (!weatherFx) return;
  scene.remove(weatherFx.pts); weatherFx.pts.geometry.dispose(); weatherFx.pts.material.dispose();
  weatherFx = null;
}
// ❄️ 雪花贴图：把 emoji 画到 canvas 当点精灵，雪片即花形（告别方块）
let _flakeTex = null;
function flakeTex() {
  if (_flakeTex) return _flakeTex;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  g.font = "52px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("❄️", 32, 36);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  _flakeTex = t; return t;
}
function makeFx(kind) {
  const n = (NUM > 0 ? NUM : (kind === "rain" ? 2200 : 100)), R = 28, H = 24;   // 雪默认 100 片
  const pos = new Float32Array(n * 3), spd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * R;
    pos[i * 3 + 1] = Math.random() * H;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * R;
    spd[i] = kind === "rain" ? 22 + Math.random() * 14 : 2.0 + Math.random() * 1.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    size: PSIZE > 0 ? PSIZE : (kind === "rain" ? 2.6 : 16),    // 雪 ❄️ 放大到能看清花形(可 ?psize= 调)
    sizeAttenuation: false,                 // 正交相机下用屏幕像素尺寸，否则点被缩成亚像素看不见
    transparent: true, depthWrite: false });
  if (kind === "snow") {                    // 雪：❄️ 贴图切出花形
    m.map = flakeTex(); m.alphaTest = 0.1; m.color.setHex(0xffffff); m.opacity = 0.95;
  } else {                                  // 雨：细小冷色点
    m.color.setHex(0xb4ccdb); m.opacity = 0.6;
  }
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
  scene.background = skyTex(c.bg[0], c.bg[1]);                        // 不透明渐变天空(配合 Bloom)
  sun.color.setHex(c.sun[0]); sun.intensity = c.sun[1] * SUNK;
  sun.position.set(c.sun[2][0], c.sun[2][1], c.sun[2][2]);
  sun.shadow.radius = c.shadow;
  hemi.color.setHex(c.hemi[0]); hemi.groundColor.setHex(c.hemi[1]); hemi.intensity = c.hemi[2];
  renderer.toneMappingExposure = EXP > 0 ? EXP : c.exp;
  fill.intensity = 0.34;
  fill.color.setHex(tod === "night" ? 0x7aa2f7 : 0xbcd0ff);          // 夜间补光染 Tokyo 霓虹蓝
  // 发光体：夜间霓虹冷光更亮、白天也给足亮度(此前偏暗)；Bloom 让它们真正晕开光晕
  screenMat.emissive.setHex(tod === "night" ? 0x7dcfff : 0x4fb6e8);
  screenMat.emissiveIntensity = (tod === "night" ? 2.8 : 1.6) * (GLOW > 0 ? GLOW : 1);
  if (MODELS._scr) {                                  // 显示器"屏幕本体"材质发光(开机感,合并在屏上,入 Bloom)
    MODELS._scr.emissive.setHex(tod === "night" ? 0x7dcfff : 0x53c6ff);
    MODELS._scr.emissiveIntensity = (tod === "night" ? 3.0 : 1.9) * (GLOW > 0 ? GLOW : 1);
  }
  amb.intensity = tod === "night" ? 0.5 : 0.2;        // 夜间抬环境底光，杜绝小人纯黑
  amb.color.setHex(tod === "night" ? 0x8ea0d8 : 0xffffff);
  screenGlow.color.setRGB(...(tod === "night" ? [0.5, 1.8, 2.4] : [0.95, 1.7, 2.1]));   // 屏幕开机发光(日夜都亮,HDR入Bloom)
  // 阈值调高：只让真正的发光体(屏幕/光盘 HDR>1)晕开，避免被照亮的墙地一起发光糊成一团
  bloom.strength = BLOOM > 0 ? BLOOM : (tod === "night" ? 0.35 : 0.3);   // 夜降到0.35(不过曝)/日提到0.3(LED也晕开)
  bloom.radius = tod === "night" ? 0.5 : 0.4;
  bloom.threshold = tod === "night" ? 0.72 : 0.85;
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
const BLOOM = parseFloat(_wq.get("bloom")) || 0;                 // 辉光强度覆盖(0=按昼夜默认)
const GLOW = parseFloat(_wq.get("glow")) || 0;                   // 屏幕发光强度倍数(0=默认)
const LEDB = parseFloat(_wq.get("led")) || 0;                    // LED 灯带亮度(0=默认3.4,越大越霓虹)

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

// ── Kenney CC0 资产：GLTF 模型加载 + 按状态播骨骼动画 ────────────────────
const GLTF_BASE = "/static/vendor/kenney/";
const MODELS = {}, CLIPS = {}, CHAR_KEYS = [];
const BOSS_CHAR = "character-male-d";
const CHAR_H = 1.5;
// agent 状态 → 骨骼动画（Mini Characters 自带 32 个 clip）
// 工位是坐姿办公室：全员坐(sit)；活动靠发光屏 + 红/白光盘体现(后续可补坐姿打字变体)
const STATE_CLIP = {
  idle: "sit", thinking: "sit", waiting: "sit", researching: "sit",
  writing: "sit", executing: "sit", working: "sit",
  delegating: "sit", error: "sit",
};
function prepModel(scene) {
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = new THREE.Box3().setFromObject(scene);
  const c = box.getCenter(new THREE.Vector3());
  scene.position.set(-c.x, -box.min.y, -c.z);   // 居中 xz + 底/脚贴 y=0
  const wrap = new THREE.Group(); wrap.add(scene);
  wrap.userData.size = box.getSize(new THREE.Vector3());
  return wrap;
}
async function preloadModels() {
  const loader = new GLTFLoader();
  const furn = ["desk", "chairDesk", "computerScreen",            // 工位
    "pottedPlant", "plantSmall1", "plantSmall2", "bookcaseOpen",  // 美式办公摆件
    "loungeSofa", "sideTable", "lampRoundFloor", "rugRectangle", "trashcan"];
  for (const f of furn) {
    const g = await loader.loadAsync(GLTF_BASE + f + ".glb"); MODELS[f] = prepModel(g.scene);
  }
  MODELS._fs = 1.3 / Math.max(0.001, MODELS.desk.userData.size.x);   // 家具统一缩放：desk 宽→1.3
  MODELS.computerScreen.traverse((o) => {     // 抓显示器"屏幕"材质(metalDark)以便夜间发霓虹光
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => {
      if (mm && /dark|screen/i.test(mm.name || "")) { MODELS._scr = mm; mm.toneMapped = false; }
    });
  });
  const cs = ["character-male-a", "character-male-b", "character-male-c", "character-male-d", "character-male-e", "character-male-f",
              "character-female-a", "character-female-b", "character-female-c", "character-female-d", "character-female-e", "character-female-f"];
  for (const n of cs) {
    const g = await loader.loadAsync(GLTF_BASE + n + ".glb");
    MODELS[n] = prepModel(g.scene); CLIPS[n] = g.animations; CHAR_KEYS.push(n);
  }
}
function playClip(u, name) {
  if (!u.mixer || !u.clips || u.curClip === name) return;
  const clip = THREE.AnimationClip.findByName(u.clips, name)
    || THREE.AnimationClip.findByName(u.clips, "idle") || u.clips[0];
  if (!clip) return;
  const next = u.mixer.clipAction(clip);
  next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play();
  if (u.action && u.action !== next) u.action.fadeOut(0.3);
  u.action = next; u.curClip = name;
}

// ── 角色：Kenney minifig（按状态播骨骼动画）+ 脚下身份光盘 ───────────────
function makeFigure(boss) {
  const g = new THREE.Group();
  const key = boss ? BOSS_CHAR : (CHAR_KEYS[Math.floor(Math.random() * CHAR_KEYS.length)] || BOSS_CHAR);
  let mixer = null, clips = null;
  if (MODELS[key]) {
    const m = skClone(MODELS[key]);
    m.scale.setScalar((boss ? CHAR_H * 1.12 : CHAR_H) / (MODELS[key].userData.size.y || 1));
    g.add(m);
    clips = CLIPS[key]; mixer = new THREE.AnimationMixer(m);
  } else {   // 回退：圆角胶囊小人
    const body = meshRB(0.5, 0.66, 0.42, 0.16, mat(boss ? 0x4a4f6a : 0x5d6580, { rough: 0.7 }));
    body.position.y = 0.5; g.add(body);
  }
  // 脚下身份光盘：主 Agent=荧光红 / 子代理=白（HDR + toneMapped:false → Bloom 晕成霓虹光圈）
  const discMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false });
  discMat.color.setRGB(...(boss ? [3.8, 0.22, 0.5] : [1.9, 1.9, 2.2]));   // HDR 提亮 → 白天也能 Bloom 发光
  const disc = new THREE.Mesh(new THREE.CircleGeometry(boss ? 0.66 : 0.52, 40), discMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; g.add(disc);
  g.userData = { disc, mixer, clips, boss, phase: Math.random() * 6.28, state: "idle", action: null, curClip: null };
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

// ── 一间办公室：地板 + 两面矮墙 + Kenney 工位（桌+椅+发光屏）────────────
// 窗屏材质模块级共享：applyWeather 夜间调成 Tokyo 霓虹冷光。
const screenMat = mat(0x16324a, { emissive: 0x2f9bd6, ei: 0.9 });
// 显示器"屏幕发光面"：始终亮(开机感) + HDR/toneMapped:false 入 Bloom；applyWeather 调日夜色温
const screenGlow = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
screenGlow.color.setRGB(0.55, 1.5, 2.0);
const SCREEN_GEO = new THREE.PlaneGeometry(0.34, 0.215);  // 贴显示器屏面的发光片(屏内尺寸,本地)
// L 形 LED 灯管：颜色 = 主 Agent 状态（HDR 入 Bloom）
const LED_COLOR = {
  error: 0xff2d4f,        // 红
  executing: 0x39c5bb, working: 0x39c5bb,   // 初音绿 = 进行中
  thinking: 0x4aa8ff,     // 蓝 = 思考中
  researching: 0xffffff, writing: 0xffffff,  // 白 = tool use
  waiting: 0xffa33d,      // 橙 = 待授权
  delegating: 0xbb9af7,   // 紫 = 派活(自定义)
  idle: 0x6b7280,         // 暗灰 = 待命
  automode: 0xffd23d,     // 黄 = automode 启用中
};
function setLed(m, state) {
  const c = new THREE.Color(LED_COLOR[state] || 0x9aa3b2);
  const b = LEDB > 0 ? LEDB : 4.2;                    // 霓虹辉光亮度(HDR 入 Bloom；?led= 可调)
  m.color.setRGB(c.r * b, c.g * b, c.b * b);
}
function buildRoom(accent) {
  const g = new THREE.Group();
  const floor = meshRB(ROOM, 0.16, ROOM, 0.06, mat(accent, { rough: 0.9 }), false, true);
  floor.position.y = 0.08; g.add(floor);
  const wallMat = mat(0xfbf7ef, { rough: 0.95 });
  const wz = meshRB(ROOM, WALL_H, 0.12, 0.04, wallMat);
  wz.position.set(0, WALL_H / 2 + 0.16, -ROOM / 2 + 0.06); g.add(wz);
  const wx = meshRB(0.12, WALL_H, ROOM, 0.04, wallMat);
  wx.position.set(-ROOM / 2 + 0.06, WALL_H / 2 + 0.16, 0); g.add(wx);
  const skirt = meshRB(ROOM, 0.1, 0.14, 0.02, mat(accent, { rough: 0.6 }));
  skirt.position.set(0, 0.5, -ROOM / 2 + 0.07); g.add(skirt);
  // L 形 LED 灯管：沿 -z / -x 两面墙顶内沿，等墙长；颜色=主 Agent 状态(syncRooms 改 ledMat)
  const ledMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  ledMat.color.setRGB(1.5, 1.5, 1.5);
  const ledY = WALL_H + 0.12;
  const ledZ = meshRB(ROOM - 0.2, 0.09, 0.09, 0.03, ledMat, false, false);
  ledZ.position.set(0, ledY, -ROOM / 2 + 0.16); g.add(ledZ);
  const ledX = meshRB(0.09, 0.09, ROOM - 0.2, 0.03, ledMat, false, false);
  ledX.position.set(-ROOM / 2 + 0.16, ledY, 0); g.add(ledX);
  // 工位：土字形居中（主三联屏在最前 + 后面两列 4 子单屏），全员朝 -z(背对镜头/正对显示器)，不靠墙
  const fs = MODELS._fs || 1, FY = 0.16;
  const dh = (MODELS.desk && MODELS.desk.userData.size.y || 0.38) * fs;
  const DESK_FWD = 1.1;     // 桌在人前方(-z)的距离
  const seats = [];
  const COL = 2.1, ROW0 = -0.5, ROW1 = 1.6;   // 列间距 / 前后两排 z（拉大不挤）
  // [x, z(人位), screens] —— 土字形：主在最前，后面两列各 2 子
  const stations = [
    [0, -2.5, 3],          // 主：最前，三联屏
    [-COL, ROW0, 1],       // 子：左前
    [COL, ROW0, 1],        // 子：右前
    [-COL, ROW1, 1],       // 子：左后
    [COL, ROW1, 1],        // 子：右后
  ];
  stations.forEach(([x, z, screens]) => {
    if (MODELS.desk) {
      const desk = MODELS.desk.clone(); desk.scale.setScalar(fs); desk.position.set(x, FY, z - DESK_FWD); g.add(desk);
      for (let s = 0; s < screens; s++) {              // 真显示器朝 +z(朝人) + 屏面贴合发光片(子物体,随屏走,入Bloom)
        const off = (s - (screens - 1) / 2) * 0.66;
        const mon = MODELS.computerScreen.clone(); mon.scale.setScalar(fs * 1.15);
        mon.position.set(x + off, FY + dh, z - DESK_FWD - 0.05);
        const glow = new THREE.Mesh(SCREEN_GEO, screenGlow);
        glow.position.set(0, 0.15, 0.03); glow.rotation.x = -0.12;    // 贴合屏面:Z更贴近(0.03) + 配屏幕小倾角
        mon.add(glow);
        g.add(mon);
      }
      if (MODELS.chairDesk) {
        const ch = MODELS.chairDesk.clone(); ch.scale.setScalar(fs); ch.rotation.y = Math.PI; ch.position.set(x, FY, z); g.add(ch);
      }
    } else {   // 回退：程序化桌
      const desk = meshRB(0.95, 0.5, 0.6, 0.06, mat(0xc99a6b, { rough: 0.65 }));
      desk.position.set(x, 0.41, z - DESK_FWD); g.add(desk);
    }
    seats.push({ x, z, face: Math.PI });   // 全员朝 -z
  });
  // 美式办公摆件：角落/边缘点缀，避开中央工位群
  const half = ROOM / 2;
  const prop = (key, px, pz, ry = 0, sc = 1) => {
    if (!MODELS[key]) return;
    const p = MODELS[key].clone(); p.scale.setScalar(fs * sc); p.position.set(px, FY, pz); p.rotation.y = ry; g.add(p);
  };
  if (MODELS.rugRectangle) {                         // 地毯铺中央工位群下
    const rug = MODELS.rugRectangle.clone();
    rug.scale.set(fs * 2.8, fs, fs * 3.4); rug.position.set(0, FY + 0.015, -0.4); g.add(rug);
  }
  prop("bookcaseOpen", half - 0.7, -half + 0.55, 0);          // 书架靠后墙右角
  prop("pottedPlant", -half + 0.6, half - 0.7, 0, 1.1);       // 绿植 前左角
  prop("pottedPlant", half - 0.65, half - 0.7, 0, 1.1);       // 绿植 前右角
  prop("plantSmall2", half - 0.7, -half + 1.7, 0, 1.1);       // 小绿植 右后
  prop("loungeSofa", -half + 1.1, half - 1.3, -Math.PI / 2);  // 休息沙发 前左
  prop("sideTable", -half + 1.1, half - 2.5, 0, 0.9);         // 边几
  prop("lampRoundFloor", -half + 0.6, -half + 0.7, 0);        // 落地灯 后左角
  prop("trashcan", 2.1, half - 1.1, 0, 0.85);                 // 垃圾桶
  g.userData = { seats, ledMat };
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
  fig.userData.state = state;             // 身份靠脚下光盘红/白；状态驱动骨骼动画
  playClip(fig.userData, STATE_CLIP[state] || "idle");
}

function hashStr(s) { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

// 地面入口铭牌：会话名做成朝镜头一侧的地面地垫(半透明深底+浅字)，平铺融入地景，日夜都清晰
function makeNamePlate(label) {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 144;
  const g = cv.getContext("2d");
  const r = 32, W = 512, H = 144;
  g.fillStyle = "rgba(16,18,26,0.46)";
  g.beginPath(); g.moveTo(r, 0);
  g.arcTo(W, 0, W, H, r); g.arcTo(W, H, 0, H, r); g.arcTo(0, H, 0, 0, r); g.arcTo(0, 0, W, 0, r);
  g.closePath(); g.fill();
  g.font = "bold 64px -apple-system,'PingFang SC','Helvetica Neue',sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#eef2ff"; g.fillText((label || "office").slice(0, 18), W / 2, H / 2 + 4);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.76),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  pl.rotation.x = -Math.PI / 2; pl.rotation.z = Math.PI;     // 平铺地面 + 转正朝镜头可读
  pl.position.set(0, 0.175, ROOM / 2 - 0.95);                // 朝镜头一侧的前缘
  pl.renderOrder = 2;
  return pl;
}

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
      group.add(makeNamePlate(r.label));        // 地面入口铭牌=会话名
      const p = cellPos(i);
      group.position.set(p.x, 0, p.z);
      scene.add(group);
      const fig = makeFigure(true);
      const bseat = shell.userData.seats[0] || { x: 0, z: 0, face: 0 };   // 主 Agent 坐三联屏位
      fig.position.set(bseat.x, 0.16, bseat.z);
      fig.rotation.y = bseat.face || 0;          // 朝向显示器
      group.add(fig);
      rooms.set(r.sessionId, { group, fig, emps: [], monster: null, seats: shell.userData.seats, ledMat: shell.userData.ledMat, accent });
    });
  }
  // 更新各房间状态/员工/怪兽
  list.forEach((r) => {
    const room = rooms.get(r.sessionId);
    if (!room) return;
    const bossState = (r.boss && r.boss.state) || "idle";
    setFigState(room.fig, bossState);
    if (room.ledMat) setLed(room.ledMat, r.automode ? "automode" : bossState);  // L形LED=主Agent状态(automode优先黄)
    const want = Math.min((r.employees || []).length, room.seats.length - 1);   // 主位占 seats[0]
    while (room.emps.length < want) {
      const e = makeFigure(false);
      const s = room.seats[room.emps.length + 1];
      e.position.set(s.x, 0.16, s.z);
      e.rotation.y = s.face || 0;                // 朝向显示器
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

function animFig(fig, t, dt) {
  const u = fig.userData;
  if (u.mixer) u.mixer.update(dt);                  // 骨骼动画推进（idle/打字/摇头…）
  u.disc.material.opacity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3.2 + u.phase));   // 身份光盘闪烁(日夜统一,更明显)
}

let lastT = 0;
function loop() {
  const t = clock.getElapsedTime();
  const dt = Math.min(0.05, t - lastT); lastT = t;
  for (const [, r] of rooms) {
    animFig(r.fig, t, dt);
    r.emps.forEach((e) => animFig(e, t, dt));
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
  composer.render();                                    // 经 Bloom 后期合成
}
renderer.setAnimationLoop(loop);

// ── 视口 / 正交投影 ───────────────────────────────────────────────────
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
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
pollWeather();
setInterval(pollWeather, 300000);
// 先预加载 Kenney 模型，再开始建房间（加载失败则回退程序化占位，不阻塞）
preloadModels()
  .catch((e) => { /* 模型加载失败：makeFigure/buildRoom 自动回退占位 */ })
  .finally(() => { pollRooms(); setInterval(pollRooms, POLL_MS); });

// ── UI 浮层 ───────────────────────────────────────────────────────────
const legend = document.getElementById("legend");
legend.innerHTML =
  '<span class="it"><span class="dot" style="background:#ff2d4f;color:#ff2d4f"></span>主 Agent</span>' +
  '<span class="it"><span class="dot" style="background:#ffffff;color:#ffffff"></span>子代理</span>';
const btnRotate = document.getElementById("btnRotate");
btnRotate.addEventListener("click", () => {
  autoRotate = !autoRotate; btnRotate.setAttribute("aria-pressed", String(autoRotate));
});
document.getElementById("btnReset").addEventListener("click", () => {
  isoPlace(); viewSize = 13; camera.zoom = 1; controls.target.set(0, 0.4, 0);
  camera.updateProjectionMatrix(); resize();
});

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
const PLAZA = 1.0;         // 房间之间 / 中庭与房间之间的步道留白
const STEP = ROOM + PLAZA; // 中庭环形布局：网格格距（四合院式，中心格留给中庭）
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
let viewSize = 13;          // 当前正交半高（buildBase 按底座尺寸自适应覆写）
let fitViewSize = 13;       // buildBase 算出的自适应取景值（reset 按钮恢复用）
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
skyBadge.className = "ui weather";
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
  breakNightGlow.forEach((m) => { m.emissiveIntensity = (tod === "night" ? 2.6 : 0.5) * (GLOW > 0 ? GLOW : 1); });   // 休息室暖光：夜间点亮
  amb.intensity = tod === "night" ? 0.5 : 0.2;        // 夜间抬环境底光，杜绝小人纯黑
  amb.color.setHex(tod === "night" ? 0x8ea0d8 : 0xffffff);
  applyGround(tod);                                    // 四季底座配色按昼夜切换
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
  const cond = { clear: "晴", partly: "多云", cloudy: "阴", fog: "雾", rain: "雨", storm: "雷暴", snow: "雪" }[key] || "晴";
  skyBadge.innerHTML =
    `<span class="wic">${ic}</span>` +
    `<span class="wtx"><b>${city || "Office"}${temp != null ? "　" + Math.round(temp) + "°" : ""}</b>` +
    `<span>${cond} · ${tod === "night" ? "🌙 夜间" : "☀ 白天"} · ${SEASON_ICON}</span></span>`;
}

// 调试参数（URL query，便于实时拨参对比）：
//   sky=clear|partly|cloudy|fog|rain|storm|snow   tod=day|night
//   n=粒子数   psize=粒子像素大小   fog=雾强度倍数(0=关)   sun=主光强度倍数   exp=曝光覆盖
const _wq = new URLSearchParams(location.search.replace(/\?/g, "&"));   // 容错：多余的 ? 当 & 处理(如 ?a=1?anim=walk)
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
const ANIM_OVERRIDE = _wq.get("anim");                           // 调试:强制全体角色播某动作/状态(working/walk/sprint/jump/sit/idle…)
const DBG = _wq.get("dbg") === "1";                              // 调试层:XYZ 轴 + 每间外墙顶 LED 按房间序上色(红橙黄绿青蓝紫粉),便于定位沟通
const PATHS = _wq.get("paths") === "1";                          // 只看动线:每间房 seat→exit→entry→lounge 路点+地面色带(不含坐标轴/外墙配色)
const DBG_LINE = [   // 房间序→外墙线条色(HDR 入 Bloom)：红 橙 黄 绿 青 蓝 紫 粉(对应 ring1 顺序 +Z/+X/-Z/-X/对角)
  [2.6, 0.1, 0.1], [2.6, 1.0, 0.05], [2.5, 2.2, 0.1], [0.2, 2.4, 0.5],
  [0.1, 2.2, 2.6], [0.3, 0.7, 2.8], [1.6, 0.4, 2.8], [2.6, 0.5, 1.6]];
const DBG_LINE_NAME = ["红", "橙", "黄", "绿", "青", "蓝", "紫", "粉"];
const DEMO_N = parseInt(_wq.get("rooms"), 10) || 0;              // 调试:?rooms=N 强制渲染 N 间办公室(不连后端),便于一次看全图;去掉该参数=恢复真实数据
const DEMO_CH = ["claude", "cursor", "kimi", "codex", "gemini", "openclaw", "trae", "vscode"];
const DEMO_ST = ["working", "thinking", "researching", "writing", "executing", "waiting", "delegating", "idle"];
function makeDemoRooms(n) {   // 合成 n 间办公室(channel/状态/员工数轮换),形状同后端 /cc/rooms 的 rooms[]
  const out = [];
  for (let i = 0; i < n; i++) out.push({
    sessionId: "demo-" + i, label: "办公室 " + (i + 1),
    boss: { state: DEMO_ST[i % DEMO_ST.length] },
    employees: Array.from({ length: i % 4 }, () => ({ state: "working" })),
    channel: DEMO_CH[i % DEMO_CH.length],
  });
  return out;
}

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

// ── 四季底座植被（春花夏草秋叶冬雪 + 飞舞元素）────────────────────────────
const SEASON = (() => {
  const q = new URLSearchParams(location.search.replace(/\?/g, "&")).get("season");
  if (["spring", "summer", "autumn", "winter"].includes(q)) return q;
  const m = new Date().getMonth();   // 0-11，北半球
  return (m === 11 || m <= 1) ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
})();
const SEASON_ICON = { spring: "🌸 春", summer: "🌿 夏", autumn: "🍁 秋", winter: "⛄ 冬" }[SEASON];

// 四季底座(草坪)配色 day/night —— 共享材质，applyWeather 按昼夜切换
const lawnMat = new THREE.MeshStandardMaterial({ roughness: 1 });
const GROUND = {
  spring: { day: 0x8fd16f, night: 0x33603e },   // 草绿
  summer: { day: 0x3e8e44, night: 0x1f4530 },   // 深绿
  autumn: { day: 0xc7a24e, night: 0x5c4a26 },   // 枯黄
  winter: { day: 0x9298a1, night: 0x3a3f4a },   // 深灰
};
lawnMat.color.setHex((GROUND[SEASON] || GROUND.summer).day);
function applyGround(tod) { lawnMat.color.setHex((GROUND[SEASON] || GROUND.summer)[tod]); }

function grassTuft(col) {
  const g = new THREE.Group(), m = mat(col, { rough: 1 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18 + Math.random() * 0.12, 4), m);
    b.position.set((Math.random() - .5) * 0.14, 0.1, (Math.random() - .5) * 0.14);
    b.rotation.z = (Math.random() - .5) * 0.5; g.add(b);
  }
  return g;
}
function flowerProp() {       // 🌷🌸🌼🌺🌻🌹 emoji 立牌(随机)
  const e = ["🌷", "🌸", "🌼", "🌺", "🌻", "🌹"][Math.floor(Math.random() * 6)];
  return emojiBillboard(e, 0.62 + Math.random() * 0.22);
}
function snowPatch() {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.3 + Math.random() * 0.35, 14), mat(0xeef4ff, { rough: .95 }));
  m.rotation.x = -Math.PI / 2; return m;
}
function leafOnGround() {       // 地面枫叶 🍁(告别方块)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ map: leafTex("🍁"), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; return m;
}
function snowmanProp() {
  const g = new THREE.Group(), w = mat(0xf4f8ff, { rough: .9 });
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), w); b1.position.y = 0.24; g.add(b1);
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), w); b2.position.y = 0.6; g.add(b2);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.15, 6), mat(0xff8c2b, { rough: .7 }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.62, 0.18); g.add(nose);
  [-0.06, 0.06].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), mat(0x222222)); e.position.set(x, 0.66, 0.15); g.add(e); });
  return g;
}
function decorateBaseSeason(slab, w, d) {
  const grp = new THREE.Group(); grp.position.y = -0.49;     // 草坪表面(slab 本地)
  const hw = w / 2, hd = d / 2, band = 0.55;
  const N = Math.max(22, Math.round((w + d) * 1.7));
  const SUM = [0x4f9a52, 0x3e8e44, 0x5aa84f], AUT = [0xc99a3a, 0xb5722e, 0x9a8b3a];
  const edge = () => {                                       // 草坪环带随机取点
    const t = Math.random() * 2 - 1, e = Math.floor(Math.random() * 4), o = band * (0.1 + Math.random() * 0.85);
    if (e === 0) return [t * (hw + band), hd + o];
    if (e === 1) return [t * (hw + band), -(hd + o)];
    if (e === 2) return [hw + o, t * (hd + band)];
    return [-(hw + o), t * (hd + band)];
  };
  for (let i = 0; i < N; i++) {
    const [x, z] = edge(); let obj;
    if (SEASON === "winter") { if (Math.random() < 0.6) obj = snowPatch(); else continue; }   // 冬:积雪+光秃
    else if (SEASON === "spring") obj = grassTuft(0x6fbf73);     // 花朵 emoji 立牌移除(嵌墙),留草丛
    else if (SEASON === "autumn") obj = grassTuft(AUT[i % 3]);   // 地面枫叶 emoji 移除,留枯草丛
    else obj = grassTuft(SUM[i % 3]);                                                         // 夏:草丛
    obj.position.set(x, 0, z); grp.add(obj);
  }
  // ── Kenney Platformer Kit 真 3D 树/花(CC0)：有模型才摆，缺则跳过(上方程序化草丛兜底) ──
  const corners = [[hw + 0.35, hd + 0.35], [-(hw + 0.35), -(hd + 0.35)], [hw + 0.35, -(hd + 0.35)], [-(hw + 0.35), hd + 0.35]];
  const addTree = (key, h, idx) => { const t = plantVeg(key, h); if (t) { t.position.set(corners[idx][0], 0, corners[idx][1]); grp.add(t); } };
  if (SEASON === "spring") {
    addTree("tree", 2.6, 0);                                            // 一棵绿树(后左角)
    for (let i = 0; i < 7; i++) {                                       // 沿草坪边带撒花簇(两色花按最大尺寸统一归一化，红/紫同等大小)
      const f = plantVegMax(Math.random() < 0.5 ? "flowers" : "flowers-tall", 0.8 + Math.random() * 0.2);
      if (!f) break;
      const [fx, fz] = edge(); f.position.set(fx, 0, fz); grp.add(f);
    }
  } else if (SEASON === "summer") {
    const mix = ["tree", "tree-pine", "tree-pine-small", "tree"];      // 四角更多树(阔叶/松混搭，高低错落)
    for (let i = 0; i < 4; i++) addTree(mix[i], i % 2 ? 2.4 : 2.9, i);
  } else if (SEASON === "winter") {
    addTree("tree-decorated-snow", 2.9, 0);                             // 装饰圣诞树(前右角，主角)
    addTree("tree-snow-a", 2.3, 2);                                     // 雪松(右后角)
    const giftAt = (key, dx, dz) => { const g = plantVeg(key, 0.42); if (g) { g.position.set(corners[0][0] + dx, 0, corners[0][1] + dz); grp.add(g); } };
    giftAt("present-a-cube", 0.5, 0.1); giftAt("present-b-round", 0.18, 0.45);     // 圣诞树脚下两个礼物盒(树右前，给雪人让位)
    // 雪人挪到圣诞树左侧作伴：rotate=false 自定朝向，背对中心办公室、面朝外(看向 +x+z 外侧)
    const smx = corners[0][0] - 0.85, smz = corners[0][1] + 0.05;
    const sm3d = plantVeg("snowman-hat", 1.2, false);
    if (sm3d) { sm3d.rotation.y = Math.PI * 1.75; sm3d.position.set(smx, 0, smz); grp.add(sm3d); }   // 朝 +x+z 正面朝外，背对办公室(模型默认正面 +x，故 7π/4)
    else { const sm = emojiBillboard("⛄", 1.2, 0.42); sm.position.set(smx, 0, smz); grp.add(sm); }
  } else {                                                              // autumn：Survival Kit 橙色松树 + 篝火点缀
    addTree("tree-autumn", 2.6, 0); addTree("tree-autumn-tall", 3.1, 2);
    const fire = plantVegMax("campfire-pit", 0.85);                     // 篝火(矮宽，按最大尺寸归一化)
    if (fire) {
      const cfx = corners[3][0], cfz = corners[3][1];                   // 前左角空地
      fire.position.set(cfx, 0, cfz); grp.add(fire);
      const flame = campfireFlame(); flame.position.set(cfx, 0.14, cfz); grp.add(flame);   // 发光火苗
    }
  }
  slab.add(grp);
}

// 飞舞元素：春蝴蝶 / 夏绿叶 / 秋枫叶飘落
let seasonFlyers = [];
function butterflyMesh() {     // 🦋 emoji 立牌(朝镜头)
  return emojiBillboard("🦋", 0.85, 0);
}
const _leafTex = {};
function leafTex(emoji) {     // emoji → canvas 贴图(缓存)，切出真实形状(叶/花/蝴蝶/雪人)
  if (_leafTex[emoji]) return _leafTex[emoji];
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  g.font = "104px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',serif";
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(emoji, 64, 72);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  _leafTex[emoji] = t; return t;
}
// emoji 立牌(Sprite 永远朝镜头)：花/雪人/蝴蝶等小物，比程序化造型自然
function emojiBillboard(emoji, size, yBase) {
  const g = new THREE.Group();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: leafTex(emoji), transparent: true, depthWrite: false }));
  s.scale.set(size, size, 1); s.position.y = (yBase != null ? yBase : size * 0.5);
  g.add(s); g.userData.spr = s; return g;
}
function flyLeaf(autumn) {     // 🍃绿叶 / 🍁枫叶 贴图(告别方块)
  return new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ map: leafTex(autumn ? "🍁" : "🍃"), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
}
function makeFlyers() {
  seasonFlyers.forEach((f) => scene.remove(f.mesh)); seasonFlyers = [];
  let n = 0, kind = "";
  if (SEASON === "spring") { n = 3; kind = "butterfly"; }
  else if (SEASON === "summer") { n = 7; kind = "leaf"; }
  else if (SEASON === "autumn") { n = 14; kind = "leaf"; }
  else return;   // 冬:飘雪交给天气系统
  for (let i = 0; i < n; i++) {
    const mesh = kind === "butterfly" ? butterflyMesh() : flyLeaf(SEASON === "autumn");
    mesh.position.set((Math.random() * 2 - 1) * 15, 1 + Math.random() * 4, (Math.random() * 2 - 1) * 15);
    scene.add(mesh);
    seasonFlyers.push({ mesh, kind, ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.6 });
  }
}
function stepFlyers(dt, t) {
  for (const f of seasonFlyers) {
    const p = f.mesh.position;
    if (f.kind === "butterfly") {                       // 蝴蝶:绕飞+起伏+横向缩放仿扇翅
      p.x += Math.cos(t * f.sp + f.ph) * dt * 1.4;
      p.z += Math.sin(t * f.sp * 1.3 + f.ph) * dt * 1.4;
      p.y = 1.6 + Math.sin(t * 2 + f.ph) * 0.6;
      const spr = f.mesh.userData.spr;
      if (spr) spr.scale.x = 0.85 * (0.5 + 0.5 * Math.abs(Math.sin(t * 12 + f.ph)));
    } else {                                            // 叶子:飘落+翻转,落地回到高空
      p.y -= dt * (0.5 + f.sp); p.x += Math.sin(t + f.ph) * dt * 0.7;
      f.mesh.rotation.x += dt * 2.2; f.mesh.rotation.z += dt * 1.4;
      if (p.y < 0.2) { p.y = 4 + Math.random() * 2.5; p.x = (Math.random() * 2 - 1) * 15; p.z = (Math.random() * 2 - 1) * 15; }
    }
  }
}

let baseSlab = null;
// 中庭环形布局：底座为正方形，按最外环半径自适应大小；中庭(休息室)居中，房间环绕。
function buildBase(maxRing) {
  if (baseSlab) { scene.remove(baseSlab); baseSlab.geometry.dispose(); }
  const half = maxRing * STEP + ROOM / 2 + 0.9;   // 覆盖最外环房间外缘 + 留白
  const w = half * 2, d = half * 2;
  baseSlab = meshRB(w, 1.0, d, 0.18, mat(0xf3ead9, { rough: 0.95 }), false, true);
  baseSlab.position.y = -0.5;
  scene.add(baseSlab);
  // 草坪边沿
  const lawn = meshRB(w + 1.4, 0.55, d + 1.4, 0.2, lawnMat, false, true);   // 四季配色(共享 lawnMat)
  lawn.position.y = -0.78;
  baseSlab.add(lawn);
  decorateBaseSeason(baseSlab, w, d);     // 四季底座植被
  // (移除了浅色 plaza 铺地：它比中庭地台大、不在房间网格上，导致线条错位。中庭地台=ROOM 与各房间同格对齐即可)
  // 相机自适应：环形布局把场景撑大，按底座对角动态设 viewSize，避免被裁切(reset 也用此值)
  fitViewSize = half * 1.12;
  viewSize = fitViewSize; resize();
  if (breakRoom) breakRoom.position.set(0, 0, 0);     // 休息室=中庭，居正中心
}

// ── Kenney CC0 资产：GLTF 模型加载 + 按状态播骨骼动画 ────────────────────
const GLTF_BASE = "/static/vendor/kenney/";
const PLAT_BASE = GLTF_BASE + "platformer/";          // Platformer Kit 子目录(自带 colormap，与家具图集隔离防串色)
const HOLI_BASE = GLTF_BASE + "holiday/";             // Holiday Kit 子目录(同上，各 kit colormap 隔离)
const SURV_BASE = GLTF_BASE + "survival/";            // Survival Kit 子目录(秋天橙色松树 + 篝火)
// 四季底座植被(Kenney CC0)——每项 [模型名, 来源目录]；按当前季节只加载所需，缺失则回退程序化草丛
const VEG_BY_SEASON = {
  spring: [["tree", PLAT_BASE], ["flowers", PLAT_BASE], ["flowers-tall", PLAT_BASE]],     // 绿树 + 花
  summer: [["tree", PLAT_BASE], ["tree-pine", PLAT_BASE], ["tree-pine-small", PLAT_BASE]], // 更多树(阔叶/松/小松)
  autumn: [["tree-autumn", SURV_BASE], ["tree-autumn-tall", SURV_BASE], ["campfire-pit", SURV_BASE]], // 橙色松树 + 篝火
  winter: [["tree-decorated-snow", HOLI_BASE], ["snowman-hat", HOLI_BASE],                 // 装饰圣诞树 + 真 3D 雪人
           ["tree-snow-a", HOLI_BASE], ["present-a-cube", HOLI_BASE], ["present-b-round", HOLI_BASE]], // 雪松 + 礼物盒
};
const MODELS = {}, CLIPS = {}, CHAR_KEYS = [];
const BOSS_CHAR = "character-male-d";
const CHAR_H = 1.3;          // 角色身高(缩小一些，减轻与椅子的穿模)
const SEAT_Y = 0.46;         // 角色坐在椅面的高度(chairDesk 座高≈0.34 + 地板 0.16)，避免坐在地上
const WALK_Y = 0.16;         // 站立/行走时脚踩地板面(坐姿抬到 SEAT_Y)
const WALK_SPEED = 2.2;      // 主 agent 走动速度(单位/秒)
const LOUNGE_DUR = 6;        // 在中庭休息室停留时长(秒)
const COFFEE = parseFloat(_wq.get("coffee")) || 0;   // 调试:喝咖啡间隔基准(秒)，缩短便于观察/截图；0=默认 16~50s
const randTrip = () => COFFEE > 0 ? COFFEE * (0.4 + Math.random() * 0.8) : 16 + Math.random() * 34;   // 两次去喝咖啡间隔(每位 boss 随机错峰)
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
// 实例化一株植被：克隆 + 归一化到目标高度(场景单位) + 随机朝向，让同种树不雷同
function plantVeg(key, targetH, rotate) {
  const src = MODELS[key];
  if (!src) return null;
  const m = src.clone();
  m.scale.setScalar(targetH / (src.userData.size.y || 1));
  if (rotate !== false) m.rotation.y = Math.random() * Math.PI * 2;
  return m;
}
// 矮宽模型(花/篝火)：按最大边长归一化，避免高度归一化把横向撑爆
function plantVegMax(key, targetMax, rotate) {
  const src = MODELS[key];
  if (!src) return null;
  const sz = src.userData.size, maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
  const m = src.clone();
  m.scale.setScalar(targetMax / maxDim);
  if (rotate !== false) m.rotation.y = Math.random() * Math.PI * 2;
  return m;
}
// 篝火小火苗：HDR 发光锥(toneMapped:false → 入 Bloom 晕成暖光)，点在木堆上
function campfireFlame() {
  return new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 6),
    new THREE.MeshStandardMaterial({ color: 0xff8a2b, emissive: 0xff5a00, emissiveIntensity: 2.6, toneMapped: false }));
}
async function preloadModels() {
  const loader = new GLTFLoader();
  const furn = ["desk", "chairDesk", "computerScreen",            // 工位
    "pottedPlant", "bookcaseOpen", "books", "lampRoundFloor", "rugRectangle",  // 精简摆件 + 书架的书
    "loungeSofa", "tableCoffee", "televisionModern", "cabinetTelevision",      // 休息室家具
    "kitchenCoffeeMachine", "kitchenFridgeSmall", "kitchenCabinet", "rugRound", "lampSquareFloor", "plantSmall3"];
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
  for (const [v, base] of (VEG_BY_SEASON[SEASON] || [])) {  // 四季植被(各 kit 独立子目录加载，逐个容错)
    try { const g = await loader.loadAsync(base + v + ".glb"); MODELS[v] = prepModel(g.scene); }
    catch (e) { /* 缺植被模型则该季节回退程序化草丛/emoji，不阻塞角色加载 */ }
  }
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

// 主 agent 来源工具(channel) → 背后光环颜色(HDR，入 Bloom 发光)；cursor 用黑环 + 白发光描边
function channelHalo(ch) {
  const c = (ch || "").toLowerCase();
  if (/openclaw/.test(c)) return { rgb: [3.9, 0.35, 0.3] };           // 红
  if (/hermes/.test(c))   return { rgb: [3.7, 0.6, 0.12] };           // 血橙(比 claude 深)
  if (/codex/.test(c))    return { rgb: [2.5, 1.6, 3.8] };            // 薰衣草紫
  if (/antigravity|gemini/.test(c)) return { rgb: [3.7, 3.2, 0.4] };  // 黄
  if (/kimi/.test(c))     return { rgb: [0.45, 1.3, 3.9] };           // 蓝
  if (/cursor/.test(c))   return { rgb: [0.03, 0.03, 0.05], outline: [3.4, 3.4, 3.9] };  // 黑 + 白描边发光
  if (/trae/.test(c))     return { rgb: [0.7, 4.0, 0.9] };            // 荧光绿
  if (/vs[\s_-]?code|vscode/.test(c)) return { rgb: [1.4, 2.7, 3.9] }; // 天蓝/浅蓝
  if (/cline/.test(c))    return { rgb: [0.2, 3.0, 2.8] };            // 青绿(teal)
  if (/continue/.test(c)) return { rgb: [1.6, 0.9, 3.9] };           // 靛蓝(indigo)
  if (/copilot/.test(c))  return { rgb: [1.1, 1.3, 1.7], outline: [2.8, 3.0, 3.5] }; // 钢灰+白描边(GitHub 单色风)
  if (/claude/.test(c))   return { rgb: [3.6, 1.7, 0.7] };            // claude 橙
  return { rgb: [3.7, 1.4, 2.3] };                                    // 其他未命中：粉粉
}

// ── 角色：Kenney minifig（按状态播骨骼动画）+ 背后身份光环 ────────────────
function makeFigure(boss, channel) {
  const g = new THREE.Group();
  const key = CHAR_KEYS.length ? CHAR_KEYS[Math.floor(Math.random() * CHAR_KEYS.length)] : BOSS_CHAR;   // 主/子均随机分配角色(身份靠光环+体型区分)
  let mixer = null, clips = null, armL = null, armR = null;
  if (MODELS[key]) {
    const m = skClone(MODELS[key]);
    m.scale.setScalar((boss ? CHAR_H * 1.12 : CHAR_H) / (MODELS[key].userData.size.y || 1));
    g.add(m);
    clips = CLIPS[key]; mixer = new THREE.AnimationMixer(m);
    m.traverse((o) => { if (o.name === "arm-left") armL = o; else if (o.name === "arm-right") armR = o; });   // 抓手臂骨：工作时程序化敲键盘
  } else {   // 回退：圆角胶囊小人
    const body = meshRB(0.5, 0.66, 0.42, 0.16, mat(boss ? 0x4a4f6a : 0x5d6580, { rough: 0.7 }));
    body.position.y = 0.5; g.add(body);
  }
  // 身份光环：主 Agent 按 channel(来源工具)上色 / 子代理=白；带圆孔的环，背在背后(绑定到 figure)
  const halo = boss ? channelHalo(channel) : { rgb: [1.9, 1.9, 2.2] };
  const R0 = boss ? 0.26 : 0.21, R1 = boss ? 0.46 : 0.38;
  const discMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  discMat.color.setRGB(...halo.rgb);
  const disc = new THREE.Mesh(new THREE.RingGeometry(R0, R1, 40), discMat);
  disc.position.set(0, CHAR_H * 0.46, -0.5);    // 背后(本地 -z)，中背高度，远离头部
  disc.rotation.x = -0.3;                       // 略后仰，像背着的光环
  g.add(disc);
  let flash = disc;
  if (halo.outline) {                           // cursor：黑环外加白色发光描边(否则黑环看不清)
    const olMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    olMat.color.setRGB(...halo.outline);
    const ol = new THREE.Mesh(new THREE.RingGeometry(R1, R1 + 0.07, 40), olMat);
    ol.position.copy(disc.position); ol.rotation.x = disc.rotation.x;
    g.add(ol);
    flash = ol;                                 // 闪烁打在白描边上(黑环闪不出来)
  }
  g.userData = { disc: flash, mixer, clips, boss, phase: Math.random() * 6.28, state: "idle", action: null, curClip: null, armL, armR };
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
// 仅 5 个状态(精简自原 8 个，避免眼花)，全部 HDR 荧光发光入 Bloom：
//   进行中=荧光绿 / 待授权=荧光橙 / 待命中=白 / AUTOMODE=初音绿 / 出错了=荧光红
const LED_COLOR = {
  error: 0xff2a45,        // 荧光红 = 出错了
  waiting: 0xff8c1a,      // 荧光橙 = 待授权
  idle: 0xffffff,         // 白 = 待命中(正常发光)
  automode: 0x39c5bb,     // 初音绿 = AUTOMODE
  // 进行中(荧光绿)：所有"忙"状态合并 —— 思考/查阅/写/执行/派活 一律"进行中"
  executing: 0x39ff6a, working: 0x39ff6a, thinking: 0x39ff6a,
  researching: 0x39ff6a, writing: 0x39ff6a, delegating: 0x39ff6a,
};
function setLed(m, state) {
  const c = new THREE.Color(LED_COLOR[state] || 0x39ff6a);   // 未知状态按"进行中"绿兜底
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
  prop("pottedPlant", half - 0.65, half - 0.7, 0, 1.1);       // 绿植(保留一个) 前右角
  prop("lampRoundFloor", -half + 0.6, half - 0.7, 0);         // 落地灯 前左角
  if (MODELS.bookcaseOpen) {                                  // 书架靠后墙右角 + 架上摆书
    const bc = MODELS.bookcaseOpen.clone(); bc.scale.setScalar(fs);
    bc.position.set(half - 0.7, FY, -half + 0.55);
    if (MODELS.books) {   // books 作为子物体随架走，摆 3 层书
      [[-0.09, 0.12, 0], [0.07, 0.12, Math.PI], [-0.04, 0.4, 0], [0.08, 0.66, 0]].forEach(([bx, by, br]) => {
        const bk = MODELS.books.clone(); bk.position.set(bx, by, 0.0); bk.rotation.y = br; bc.add(bk);
      });
    }
    g.add(bc);
  }
  g.userData = { seats, ledMat };
  return g;
}

// 程序化咖啡杯：杯身 + 咖啡液面 + 把手(Furniture Kit 无杯子模型)
function coffeeCup(col) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.1, 14), mat(col, { rough: 0.45 }));
  body.position.y = 0.05; body.castShadow = true; g.add(body);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14), mat(0x3a241a, { rough: 0.35 }));
  coffee.position.y = 0.1; g.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 12), mat(col, { rough: 0.45 }));
  handle.position.set(0.062, 0.05, 0); handle.rotation.y = Math.PI / 2; g.add(handle);
  return g;
}

// ── 回廊环（抄手游廊）：填满中庭四周那圈 1.0 的缝，与地台等高，连通 8 间⇄中庭、room⇄room ──
// 几何：方形环带，内沿=中庭边缘(ROOM/2)，外沿=房间内边缘(STEP-ROOM/2)；±Z 条满宽盖到四角，±X 条只走中段不重叠角。
function buildCloister() {
  const g = new THREE.Group();
  const inH = ROOM / 2, outH = STEP - ROOM / 2, bandW = outH - inH, midR = (inH + outH) / 2;
  const cmat = mat(0xd6c9b0, { rough: 0.9 });          // 走廊石色(区别于底座暖白/中庭暖黄/房间地板)
  const strip = (w, d, x, z) => { const m = meshRB(w, 0.16, d, 0.05, cmat, false, true); m.position.set(x, 0.08, z); g.add(m); };  // 顶面 y=0.16 与各地台连续可走
  strip(2 * outH, bandW, 0, midR);     // +Z 边(满宽含两角)
  strip(2 * outH, bandW, 0, -midR);    // -Z 边
  strip(bandW, 2 * inH, midR, 0);      // +X 边(只走中段,避免与角重叠)
  strip(bandW, 2 * inH, -midR, 0);     // -X 边
  return g;
}

// ── 中庭环境障碍：家具足迹(中心+半径，世界坐标=中庭本地，中庭在原点未旋转)，动线据此绕行 ──
// 中心由 buildBreakRoom 家具放置式(BR_W=6.4/BR_D=5.6)推出；半径为足迹估值。
const ATRIUM_OBS = [
  { x: 0, z: -2.15, r: 1.05 },   // 电视柜+电视(后墙中)
  { x: 0, z: 1.55, r: 1.15 },    // 沙发(前)
  { x: 0.1, z: 0.2, r: 0.7 },    // 茶几(中)
  { x: -2.58, z: 0.35, r: 0.7 }, // 茶水柜(左)
  { x: -2.63, z: -1.85, r: 0.55 }, // 冰箱(后左)
  { x: 2.65, z: -1.95, r: 0.45 },  // 落地灯(后右)
  { x: 2.65, z: 2.0, r: 0.5 },   // 绿植 plantSmall3(前右)
  { x: -2.6, z: 1.95, r: 0.5 },  // 盆栽 pottedPlant(前左)
];
const CHAR_CLEAR = 0.3;          // 角色半宽余量

// 把点推出所有障碍圈(落在家具里就沿背离方向挤出)，并夹在中庭地板内
function clearSpot(x, z, obs) {       // 只把点推出障碍圈(世界坐标，房内/中庭通用)，不做范围 clamp
  for (let it = 0; it < 8; it++) {
    let moved = false;
    for (const o of obs) {
      const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1e-6, need = o.r + CHAR_CLEAR + 0.1;
      if (d < need) { const k = (need - d) / d; x += dx * k; z += dz * k; moved = true; }
    }
    if (!moved) break;
  }
  return { x, z };
}
// 线段 a→b 是否穿过某障碍(返回最近的被撞障碍，否则 null)
function segHit(a, b, obs) {
  let best = null, bestD = Infinity;
  for (const o of obs) {
    const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz || 1e-6;
    let t = ((o.x - a.x) * abx + (o.z - a.z) * abz) / L2; t = Math.max(0, Math.min(1, t));
    const px = a.x + t * abx, pz = a.z + t * abz, d = Math.hypot(o.x - px, o.z - pz);
    if (d < o.r + CHAR_CLEAR && d < bestD) { bestD = d; best = o; }
  }
  return best;
}
// 绕行：撞到障碍就在其侧面插一个绕行点，递归把两段都走通(深度上限防爆)
function routeAvoiding(a, b, obs, depth = 0) {
  if (depth > 4) return [b];
  const o = segHit(a, b, obs);
  if (!o) return [b];
  const abx = b.x - a.x, abz = b.z - a.z, L = Math.hypot(abx, abz) || 1;
  const nx = -abz / L, nz = abx / L;                                   // 段的法向
  const side = ((o.x - a.x) * nx + (o.z - a.z) * nz) >= 0 ? -1 : 1;    // 障碍在哪侧→往另一侧绕
  const clear = o.r + CHAR_CLEAR + 0.45;
  const way = clearSpot(o.x + nx * clear * side, o.z + nz * clear * side, obs);
  return [...routeAvoiding(a, way, obs, depth + 1), ...routeAvoiding(way, b, obs, depth + 1)];
}

// ── 房内障碍：本地坐标(buildRoom 工位/摆件足迹)。椅子 & boss 自己工位不算(否则起步即被堵)。──
// 工位=桌+人(中心取桌-人中点)，摆件=盆栽/落地灯/书架。COL=2.1, ROW0=-0.5(桌-1.6), ROW1=1.6(桌0.5)。
const ROOM_OBS = [
  { x: -2.1, z: -1.05, r: 0.9 }, { x: 2.1, z: -1.05, r: 0.9 },   // 左前/右前 员工工位
  { x: -2.1, z: 1.05, r: 0.9 }, { x: 2.1, z: 1.05, r: 0.9 },     // 左后/右后 员工工位
  { x: 3.75, z: 3.7, r: 0.45 },   // pottedPlant 前右角
  { x: -3.8, z: 3.7, r: 0.45 },   // lampRoundFloor 前左角(落地灯)
  { x: 3.7, z: -3.85, r: 0.6 },   // bookcaseOpen 后右角
];
// 障碍从房间本地坐标变换到世界(随房间 ry 旋转 + 平移)
function obsToWorld(obs, p) {
  const s = Math.sin(p.ry), c = Math.cos(p.ry);
  return obs.map((o) => ({ x: p.x + o.x * c + o.z * s, z: p.z - o.x * s + o.z * c, r: o.r }));
}

// 路径简化(string-pull)：若能从 i 直达更远的 j 而不撞障碍，就跳过中间冗余绕行点，去掉 zigzag
function simplifyRoute(pts, obs) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    for (; j > i + 1; j--) if (!segHit(pts[i], pts[j], obs)) break;   // 从 i 能直达的最远 j
    out.push(pts[j]); i = j;
  }
  return out;
}

// ── 中庭休息落点(世界=中庭本地，atrium 在原点)：坐沙发 / 咖啡机 interact / 站着端杯；带占用标记 ──
// ax/az = 接近点(在空地)：先走到接近点，再"坐下/就位"一步到 spot，避免路径往沙发等家具里钻。
// face = 世界朝向(模型 ry=0 朝 +z)；clip = 到位后播的动作；y = 坐(0.52)/站(WALK_Y)。
const LOUNGE_SPOTS = [
  { x: -0.6, z: 1.5, ax: -0.6, az: 3.0, face: Math.PI, clip: "sit", y: 0.52 },              // 沙发左(坐,朝电视)
  { x: 0.6, z: 1.5, ax: 0.6, az: 3.0, face: Math.PI, clip: "sit", y: 0.52 },                // 沙发右(坐)
  { x: -1.5, z: 0.35, ax: -1.4, az: 0.95, face: -Math.PI / 2, clip: "interact-right", y: WALK_Y }, // 咖啡机前(操作)
  { x: 1.7, z: 0.9, ax: 1.7, az: 0.9, face: Math.atan2(-1.7, -0.9), clip: "holding-right", y: WALK_Y }, // 站位(端杯,朝中心)
  { x: 1.3, z: -1.1, ax: 1.3, az: -1.1, face: Math.atan2(-1.3, 1.1), clip: "holding-left", y: WALK_Y },  // 站位
  { x: -1.4, z: -1.1, ax: -1.4, az: -1.1, face: Math.atan2(1.4, 1.1), clip: "holding-right", y: WALK_Y }, // 站位
];
const empTrip = () => COFFEE > 0 ? COFFEE * (1.5 + Math.random() * 3) : 40 + Math.random() * 80;   // 员工去喝咖啡间隔(比 boss 稀疏)

// 房间本地点 → 世界
function localPtToWorld(pt, p) {
  const c = Math.cos(p.ry), s = Math.sin(p.ry);
  return { x: p.x + pt.x * c + pt.z * s, z: p.z - pt.x * s + pt.z * c };
}
// 世界 → 房间本地(group 逆变换)：fig 挂 group 下，按本地坐标驱动走动
function toLocalXZ(pt, p) {
  const c = Math.cos(p.ry), s = Math.sin(p.ry), dx = pt.x - p.x, dz = pt.z - p.z;
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}
// 某工位(本地座位)→中庭门口(entry) 的世界路径：seat→…绕开本房工位/摆件(排除自己工位)…→exit→entry
function buildRoomLeg(seatLocal, p) {
  const len = Math.hypot(p.x, p.z) || 1, ux = p.x / len, uz = p.z / len;
  const seatW = localPtToWorld(seatLocal, p);
  const exit = { x: p.x - ux * (ROOM / 2 - 0.5), z: p.z - uz * (ROOM / 2 - 0.5) };  // 房间敞开侧门口
  const entry = { x: ux * (ROOM / 2 - 0.4), z: uz * (ROOM / 2 - 0.4) };            // 进中庭口
  const obs = obsToWorld(ROOM_OBS, p).filter((o) => Math.hypot(o.x - seatW.x, o.z - seatW.z) > o.r + 0.25);  // 排除自己工位
  return [...simplifyRoute([seatW, ...routeAvoiding(seatW, exit, obs)], obs), entry];
}
// entry→某落点的中庭世界路径(绕中庭家具到 approach，再一步就位到 spot；不含 entry 本身)
function buildLoungeLeg(entry, spot) {
  const sleg = simplifyRoute([entry, ...routeAvoiding(entry, { x: spot.ax, z: spot.az }, ATRIUM_OBS)], ATRIUM_OBS);
  return [...sleg.slice(1), { x: spot.x, z: spot.z }];
}
// 给一个角色(boss/员工)装上走动状态 + 预存"工位→中庭门口"的世界路径
function initWalker(fig, seatLocal, face, p, isBoss) {
  fig.userData.roomLegW = buildRoomLeg(seatLocal, p);
  fig.userData.walk = { phase: "seated", timer: isBoss ? randTrip() : empTrip(), seg: 0, route: null, spot: null, home: { x: seatLocal.x, z: seatLocal.z, face }, isBoss };
}

// ── 中庭电视：发光像素屏(canvas 纹理) + 点击切换多个动态画面 ─────────────────
// 低分辨率 canvas + NearestFilter = 像素感；MeshBasicMaterial(toneMapped:false)+color>1 → 入 Bloom 发光。
// 点击电视屏(射线命中 tvScreenMesh)循环切换；loop 里 ~12fps 重绘 canvas 让画面动起来。
const TV_W = 168, TV_H = 105;
let tvScreenMesh = null, tvCtx = null, tvTex = null, tvScene = 0, tvAcc = 0;
let _mtx = null, _clouds = null, _br = null, _tron = null, _stars = null, _stars2 = null;
// 1) 黑客帝国：绿色字符雨在黑底上流动
function tvMatrix(c, w, h) {
  if (!_mtx) { _mtx = []; for (let i = 0; i < Math.floor(w / 6); i++) _mtx[i] = Math.random() * h; }
  c.fillStyle = "rgba(0,10,0,0.32)"; c.fillRect(0, 0, w, h);
  c.font = "8px monospace"; c.textBaseline = "top";
  for (let i = 0; i < _mtx.length; i++) {
    const x = i * 6, y = _mtx[i];
    c.fillStyle = "#d8ffd8"; c.fillText(String.fromCharCode(0x30a0 + ((Math.random() * 40) | 0)), x, y);          // 头亮
    c.fillStyle = "#22e655"; c.fillText(String.fromCharCode(0x30a0 + ((Math.random() * 40) | 0)), x, y - 8);     // 尾绿
    _mtx[i] += 8; if (_mtx[i] > h && Math.random() > 0.97) _mtx[i] = 0;
  }
}
// 黑色大龙猫(cx 中心, by 脚下, s 比例)
function tvTotoro(c, cx, by, s) {
  const bw = 28 * s, bh = 40 * s, topY = by - bh;
  c.fillStyle = "#3b3b42";                                          // 耳朵
  c.beginPath(); c.moveTo(cx - 8 * s, topY + 4); c.lineTo(cx - 12 * s, topY - 9 * s); c.lineTo(cx - 2 * s, topY + 2); c.fill();
  c.beginPath(); c.moveTo(cx + 8 * s, topY + 4); c.lineTo(cx + 12 * s, topY - 9 * s); c.lineTo(cx + 2 * s, topY + 2); c.fill();
  c.fillStyle = "#3b3b42"; c.beginPath(); c.ellipse(cx, by - bh * 0.5, bw * 0.5, bh * 0.5, 0, 0, 7); c.fill();   // 身体
  c.fillStyle = "#b8b1a2"; c.beginPath(); c.ellipse(cx, by - bh * 0.4, bw * 0.32, bh * 0.36, 0, 0, 7); c.fill(); // 肚皮
  c.strokeStyle = "#5a544a"; c.lineWidth = 1;                       // 肚皮纹
  for (let i = 0; i < 3; i++) { const yy = by - bh * 0.54 + i * 5 * s; c.beginPath(); c.moveTo(cx - 5 * s, yy); c.lineTo(cx, yy - 3 * s); c.lineTo(cx + 5 * s, yy); c.stroke(); }
  c.fillStyle = "#fff"; [-6, 6].forEach((dx) => { c.beginPath(); c.arc(cx + dx * s, topY + 11 * s, 3 * s, 0, 7); c.fill(); });   // 眼白
  c.fillStyle = "#141414"; [-6, 6].forEach((dx) => { c.beginPath(); c.arc(cx + dx * s, topY + 11 * s, 1.5 * s, 0, 7); c.fill(); }); // 瞳
  c.fillStyle = "#1a1a1a"; c.beginPath(); c.arc(cx, topY + 16 * s, 2 * s, 0, 7); c.fill();   // 鼻
  c.strokeStyle = "rgba(220,220,220,0.55)"; c.lineWidth = 1; c.beginPath();                  // 胡须
  c.moveTo(cx - 7 * s, topY + 15 * s); c.lineTo(cx - 17 * s, topY + 12 * s); c.moveTo(cx + 7 * s, topY + 15 * s); c.lineTo(cx + 17 * s, topY + 12 * s); c.stroke();
}
// 红衣小姑娘(小米, cx 中心, by 脚下)
function tvRedGirl(c, cx, by) {
  c.fillStyle = "#e8c8a0"; c.fillRect(cx - 2, by - 4, 1.6, 4); c.fillRect(cx + 0.6, by - 4, 1.6, 4);   // 腿
  c.fillStyle = "#d83a2a"; c.beginPath(); c.moveTo(cx - 4.5, by - 4); c.lineTo(cx + 4.5, by - 4); c.lineTo(cx + 2.6, by - 12); c.lineTo(cx - 2.6, by - 12); c.fill();  // 红裙
  c.fillStyle = "#e8c8a0"; c.fillRect(cx - 5.5, by - 11.5, 2, 5); c.fillRect(cx + 3.5, by - 11.5, 2, 5);   // 手臂
  c.fillStyle = "#f0d0a8"; c.beginPath(); c.arc(cx, by - 15, 3.3, 0, 7); c.fill();           // 头
  c.fillStyle = "#3a2418"; c.fillRect(cx - 3.6, by - 18.6, 7.2, 3.6); c.fillRect(cx - 3.6, by - 16, 1.4, 2.2); c.fillRect(cx + 2.2, by - 16, 1.4, 2.2);   // 短发
}
// 2) 宫崎骏：蓝天白云绿草，云朵飘动 + 大龙猫 + 红衣小姑娘
function tvMiyazaki(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h * 0.78); g.addColorStop(0, "#3f9fe6"); g.addColorStop(1, "#cdecff");
  c.fillStyle = g; c.fillRect(0, 0, w, h * 0.78);
  c.fillStyle = "#6fbf46"; c.fillRect(0, h * 0.78, w, h * 0.22);
  c.fillStyle = "#57a536"; for (let x = 0; x < w; x += 5) c.fillRect(x, h * 0.78 + (x % 10 ? 0 : 2), 3, 3);
  if (!_clouds) { _clouds = []; for (let i = 0; i < 4; i++) _clouds.push({ x: Math.random() * w, y: 8 + Math.random() * h * 0.4, s: 0.25 + Math.random() * 0.5, sc: 0.9 + Math.random() }); }
  c.fillStyle = "#ffffff";
  for (const k of _clouds) {
    k.x += k.s; if (k.x > w + 24) k.x = -24;
    const bx = Math.round(k.x), by = Math.round(k.y), s = k.sc;
    c.fillRect(bx, by, 16 * s, 6 * s); c.fillRect(bx + 5 * s, by - 4 * s, 11 * s, 6 * s); c.fillRect(bx - 4 * s, by + 1, 8 * s, 5 * s);
  }
  tvTotoro(c, w * 0.66, h * 0.82, 1.0);   // 黑色大龙猫(右)
  tvRedGirl(c, w * 0.47, h * 0.82);       // 红衣小姑娘(左, 小比例)
}
// 3) 银翼杀手：赛博霓虹天际线 + 雨 + 闪烁招牌
function tvBladeRunner(c, w, h) {
  c.fillStyle = "#0a0614"; c.fillRect(0, 0, w, h);
  if (!_br) { _br = { blink: 0, rain: [] }; for (let i = 0; i < 46; i++) _br.rain.push({ x: Math.random() * w, y: Math.random() * h }); }
  const bld = [[4, 44, 18], [26, 60, 16], [46, 32, 22], [74, 66, 14], [92, 48, 20], [116, 56, 16], [140, 40, 20]];
  for (const [bx, bh, bw] of bld) {
    c.fillStyle = "#16102c"; c.fillRect(bx, h - bh, bw, bh);
    for (let wy = h - bh + 3; wy < h - 3; wy += 6) for (let wx = bx + 2; wx < bx + bw - 2; wx += 5)
      if (Math.random() > 0.55) { c.fillStyle = Math.random() > 0.6 ? "#ff3aa6" : "#3ad6ff"; c.fillRect(wx, wy, 2, 3); }
  }
  _br.blink = (_br.blink + 1) % 18;
  if (_br.blink < 12) { c.fillStyle = "#ff2d6f"; c.fillRect(w - 44, 8, 32, 3); c.fillStyle = "#ff88b8"; c.fillRect(w - 41, 13, 26, 2); }
  c.strokeStyle = "rgba(150,190,225,0.45)"; c.lineWidth = 1; c.beginPath();
  for (const r of _br.rain) { c.moveTo(r.x, r.y); c.lineTo(r.x - 1, r.y + 5); r.y += 6; r.x -= 1; if (r.y > h) { r.y = -5; r.x = Math.random() * w; } }
  c.stroke();
}
// 4) 创/TRON：红队 vs 蓝队光轮对抗，垂直转向 + 发光拖尾墙(最爱!)
function tvTron(c, w, h) {
  const hz = h * 0.4;
  if (!_tron) {
    const mk = (x, y, dir, col) => ({ x, y, dir, col, trail: [], turn: 8 });
    _tron = { off: 0, cyc: [
      mk(16, hz + 14, 0, "#39e6ff"), mk(w - 16, h - 12, 1, "#46b4ff"),   // 蓝队
      mk(w - 20, hz + 22, 1, "#ff5630"), mk(20, h - 20, 0, "#ff8a3a"),   // 红队
    ] };
  }
  c.fillStyle = "#02060a"; c.fillRect(0, 0, w, h);
  _tron.off = (_tron.off + 1) % 14;
  c.fillStyle = "#04222b"; c.fillRect(0, 0, w, hz);                       // 网格
  c.strokeStyle = "#0a4a5c"; c.lineWidth = 1; c.beginPath();
  for (let i = 0; i < 11; i++) { const y = hz + i * i + _tron.off * (i * 0.3 + 0.5); if (y > h) break; c.moveTo(0, y); c.lineTo(w, y); }
  for (let x = -7; x <= 7; x++) { c.moveTo(w / 2 + x * 9, hz); c.lineTo(w / 2 + x * 42, h); }
  c.stroke();
  c.strokeStyle = "#2a9ab0"; c.beginPath(); c.moveTo(0, hz); c.lineTo(w, hz); c.stroke();   // 地平线
  const DIR = [[2.4, 0], [-2.4, 0], [0, 2.0], [0, -2.0]];
  for (const cy of _tron.cyc) {
    cy.turn--;
    const nx = cy.x + DIR[cy.dir][0], ny = cy.y + DIR[cy.dir][1];
    const oob = nx < 4 || nx > w - 4 || ny < hz + 5 || ny > h - 4;
    if (oob || (cy.turn <= 0 && Math.random() < 0.14)) {                 // 撞边/随机→垂直转向，留拐点
      cy.trail.push([cy.x, cy.y]); if (cy.trail.length > 9) cy.trail.shift();
      const perp = cy.dir < 2 ? [2, 3] : [0, 1]; cy.dir = perp[Math.random() < 0.5 ? 0 : 1]; cy.turn = 5 + (Math.random() * 9 | 0);
    }
    cy.x = Math.max(4, Math.min(w - 4, cy.x + DIR[cy.dir][0]));
    cy.y = Math.max(hz + 5, Math.min(h - 4, cy.y + DIR[cy.dir][1]));
    c.strokeStyle = cy.col; c.lineWidth = 2; c.beginPath();              // 发光拖尾墙
    const tr = cy.trail;
    if (tr.length) { c.moveTo(tr[0][0], tr[0][1]); for (const p of tr) c.lineTo(p[0], p[1]); c.lineTo(cy.x, cy.y); }
    else { c.moveTo(cy.x - DIR[cy.dir][0] * 4, cy.y - DIR[cy.dir][1] * 4); c.lineTo(cy.x, cy.y); }
    c.stroke();
    c.fillStyle = "#ffffff"; c.fillRect(cy.x - 1.5, cy.y - 1.5, 3, 3);   // 车头
  }
}
// 5) 2001 太空漫游：星空 + 地球弧线 + HAL 9000 红眼脉动
function tvHal(c, w, h, t) {
  if (!_stars) { _stars = []; for (let i = 0; i < 55; i++) _stars.push([Math.random() * w, Math.random() * h, Math.random() < 0.3 ? 2 : 1]); }
  c.fillStyle = "#02030a"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#cfd8ff"; for (const s of _stars) c.fillRect(s[0] | 0, s[1] | 0, s[2], s[2]);   // 星空
  const ex = w * 0.5, ey = h + 34, er = 92;                                                       // 地球弧线(底部)
  const ga = c.createRadialGradient(ex, ey, er - 6, ex, ey, er + 13); ga.addColorStop(0, "rgba(90,170,255,0)"); ga.addColorStop(0.6, "rgba(90,170,255,0.5)"); ga.addColorStop(1, "rgba(90,170,255,0)");
  c.fillStyle = ga; c.beginPath(); c.arc(ex, ey, er + 13, 0, 7); c.fill();                         // 大气辉光
  c.fillStyle = "#1d5fb0"; c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();                       // 海洋
  c.fillStyle = "#3a9a4e"; [[ex - 50, ey - 80, 16, 10], [ex - 18, ey - 72, 22, 12], [ex + 30, ey - 82, 18, 9], [ex + 58, ey - 66, 14, 11], [ex - 2, ey - 90, 12, 7]].forEach(([bx, by, bw, bh]) => c.fillRect(bx, by, bw, bh)); // 陆地
  c.fillStyle = "rgba(255,255,255,0.5)"; [[ex - 40, ey - 86], [ex + 12, ey - 92], [ex + 44, ey - 78]].forEach(([bx, by]) => c.fillRect(bx, by, 14, 4)); // 云
  c.strokeStyle = "rgba(150,205,255,0.85)"; c.lineWidth = 2; c.beginPath(); c.arc(ex, ey, er, Math.PI * 1.16, Math.PI * 1.84); c.stroke();   // 边缘高光
  const cx = w * 0.5, cy = h * 0.32, p = 0.65 + 0.35 * Math.sin(t * 2.4);                          // HAL 红眼(地球上方)
  c.fillStyle = "#0c0c0c"; c.beginPath(); c.arc(cx, cy, 15, 0, 7); c.fill();
  const g = c.createRadialGradient(cx, cy, 1, cx, cy, 12);
  g.addColorStop(0, `rgba(255,${(70 * p) | 0},25,1)`); g.addColorStop(0.5, `rgba(220,25,12,${0.9 * p})`); g.addColorStop(1, "rgba(40,0,0,0)");
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 12, 0, 7); c.fill();
  c.fillStyle = `rgba(255,225,190,${p})`; c.beginPath(); c.arc(cx, cy, 3, 0, 7); c.fill();
}
// 6) 星球大战：塔图因双日落
function tvTatooine(c, w, h, t) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#3a2a55"); g.addColorStop(0.45, "#e8843a"); g.addColorStop(0.78, "#ffce78"); g.addColorStop(1, "#bb5226");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const yb = h * 0.6, bob = Math.sin(t * 0.5) * 2;
  c.fillStyle = "#fff2c0"; c.beginPath(); c.arc(w * 0.42, yb - 16 + bob, 11, 0, 7); c.fill();
  c.fillStyle = "#ffd98a"; c.beginPath(); c.arc(w * 0.57, yb - 7 - bob, 6, 0, 7); c.fill();
  c.fillStyle = "#7a4422"; c.fillRect(0, yb, w, h - yb);
  c.fillStyle = "#5e3318"; for (let x = 0; x < w; x += 8) c.fillRect(x, yb + 4 + (x % 16 ? 0 : 3), 5, 4);
}
// 7) 流浪地球：巨大木星背景 + 冰封地球 + 行星发动机蓝色等离子束
function tvWandering(c, w, h, t) {
  if (!_stars2) { _stars2 = []; for (let i = 0; i < 42; i++) _stars2.push([Math.random() * w, Math.random() * h * 0.6, Math.random() < 0.3 ? 2 : 1]); }
  c.fillStyle = "#03040c"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#cfd8ff"; for (const s of _stars2) c.fillRect(s[0] | 0, s[1] | 0, s[2], s[2]);
  const jx = w * 0.72, jy = -18, jr = 90;                                  // 巨大木星(右上背景)
  c.save(); c.beginPath(); c.arc(jx, jy, jr, 0, 7); c.clip();
  const bands = ["#c9a06a", "#e2c490", "#b6824e", "#d8b07a", "#a8703e", "#ecd29c"];
  for (let i = 0; i < 14; i++) { c.fillStyle = bands[i % bands.length]; c.fillRect(jx - jr, jy - jr + i * (2 * jr / 14), 2 * jr, 2 * jr / 14 + 1); }
  c.fillStyle = "#b0402a"; c.beginPath(); c.ellipse(jx - 22, jy + 52, 15, 8, 0, 0, 7); c.fill();   // 大红斑
  c.restore();
  c.strokeStyle = "rgba(255,210,150,0.25)"; c.lineWidth = 1; c.beginPath(); c.arc(jx, jy, jr, 0, 7); c.stroke();   // 木星边缘
  const ex = w * 0.3, ey = h * 0.72, er = 21, fl = 0.6 + 0.4 * Math.sin(t * 9);                    // 地球 + 发动机束(闪动)
  for (let k = -2; k <= 2; k++) {
    const ang = Math.PI * 0.5 + k * 0.16;                                  // 一束束朝下(推进尾焰)
    const bx = ex + Math.cos(ang) * er, by = ey + Math.sin(ang) * er;
    const x2 = ex + Math.cos(ang) * (er + 40 * fl), y2 = ey + Math.sin(ang) * (er + 40 * fl);
    const grad = c.createLinearGradient(bx, by, x2, y2); grad.addColorStop(0, "rgba(190,245,255,0.95)"); grad.addColorStop(1, "rgba(60,160,255,0)");
    c.strokeStyle = grad; c.lineWidth = 3; c.beginPath(); c.moveTo(bx, by); c.lineTo(x2, y2); c.stroke();
  }
  c.fillStyle = "#2a6fc0"; c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();                       // 地球
  c.fillStyle = "#3a9a4e"; [[ex - 10, ey - 6, 9, 7], [ex + 4, ey + 3, 8, 6], [ex - 3, ey + 8, 6, 5]].forEach(([bx, by, bw, bh]) => c.fillRect(bx, by, bw, bh));
  c.fillStyle = "rgba(220,235,255,0.75)"; c.fillRect(ex - er * 0.5, ey - er + 1, er, 4);           // 冰封(白)
  c.fillStyle = "#aee8ff"; for (let i = 0; i < 5; i++) { const a = Math.PI * 0.5 + i * 0.16 - 0.32; c.fillRect(ex + Math.cos(a) * er - 1, ey + Math.sin(a) * er - 1, 2, 2); }   // 发动机亮点
}
const TV_SCENES = [tvMatrix, tvMiyazaki, tvBladeRunner, tvTron, tvHal, tvTatooine, tvWandering];
function makeTvScreen(pw, ph) {
  const cv = document.createElement("canvas"); cv.width = TV_W; cv.height = TV_H;
  tvCtx = cv.getContext("2d");
  tvTex = new THREE.CanvasTexture(cv); tvTex.colorSpace = THREE.SRGBColorSpace;
  tvTex.magFilter = THREE.NearestFilter; tvTex.minFilter = THREE.NearestFilter; tvTex.generateMipmaps = false;
  const mat = new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false }); mat.color.setScalar(1.5);   // HDR 提亮入 Bloom
  tvScreenMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
  TV_SCENES[0](tvCtx, TV_W, TV_H, 0); tvTex.needsUpdate = true;   // 初帧
  return tvScreenMesh;
}
function stepTv(dt, t) {
  if (!tvCtx) return;
  tvAcc += dt; if (tvAcc < 1 / 12) return; tvAcc = 0;   // ~12fps 像素感
  TV_SCENES[tvScene % TV_SCENES.length](tvCtx, TV_W, TV_H, t); tvTex.needsUpdate = true;
}

// ── 静态休息室（独立小平台：沙发/电视/茶水台/小冰箱）────────────────────
// 昼夜差别：暖光灯泡夜间增亮(breakNightGlow)；电视=可点击的发光像素屏(makeTvScreen)
let breakRoom = null;
const BR_W = 6.4, BR_D = 5.6;          // 休息室占地
const breakNightGlow = [];             // 暖光材质：applyWeather 夜间调亮
function buildBreakRoom() {
  const g = new THREE.Group();
  const fs = MODELS._fs || 1, FY = 0.16;
  // 中庭=开放休息室：去掉自有底座/两墙/skirt/墙顶 LED(被房间四面环绕，要四面通透可入)。
  // 只留暖色地板平台坐落 plaza 之上 + 四角暖光地灯标识中庭范围。
  const accent = 0xe8c98f;                                                  // 暖色休息室地板
  // 地板尺寸对齐办公室(ROOM×ROOM)，与四周房间同格大小、坐落中心格，不再小一圈显突兀
  const floor = meshRB(ROOM, 0.16, ROOM, 0.06, mat(accent, { rough: 0.9 }), false, true);
  floor.position.y = 0.08; g.add(floor);
  // 四角暖光地灯(常亮 HDR 入 Bloom，夜间随 breakNightGlow 增亮)：勾出开放中庭的边界与"可入"感
  const cornerMat = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffb24d, emissiveIntensity: 0.6, toneMapped: false });
  breakNightGlow.push(cornerMat);
  const cgx = ROOM / 2 - 0.3, cgz = ROOM / 2 - 0.3;                          // 灯柱移到地板四角(随 ROOM 尺寸)
  [[cgx, cgz], [-cgx, cgz], [cgx, -cgz], [-cgx, -cgz]].forEach(([px, pz]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 8), cornerMat);
    post.position.set(px, 0.33, pz); post.castShadow = true; g.add(post);
  });
  const place = (key, px, pz, ry = 0, sc = 1) => { if (!MODELS[key]) return null; const m = MODELS[key].clone(); m.scale.setScalar(fs * sc); m.position.set(px, FY, pz); m.rotation.y = ry; g.add(m); return m; };
  if (MODELS.rugRound) { const r = MODELS.rugRound.clone(); r.scale.set(fs * 2.4, fs, fs * 2.4); r.position.set(0.1, FY + 0.02, 0.4); g.add(r); }   // 地毯
  const tvZ = -BR_D / 2 + 0.65;                                             // 电视柜+电视靠后墙(-z)，屏朝 +z(向沙发/镜头)
  place("cabinetTelevision", 0, tvZ, 0, 1.3);
  const TVS = 1.62;                                                          // 电视放大一点(屏更大)
  const tv = place("televisionModern", 0, tvZ, 0, TVS);
  if (tv) {
    const cabH = ((MODELS.cabinetTelevision && MODELS.cabinetTelevision.userData.size.y) || 0.31) * fs * 1.3;
    tv.position.y = FY + cabH;                                              // 电视抬到柜子上
    const ts = MODELS.televisionModern.userData.size;
    const sw = ts.x * fs * TVS * 0.84, sh = sw / (TV_W / TV_H);             // 屏面尺寸(放大,按 canvas 比例不拉伸)
    const screen = makeTvScreen(sw, sh);                                      // 可点击的发光像素屏
    screen.position.set(0, tv.position.y + ts.y * fs * TVS * 0.52, tvZ + ts.z * fs * TVS * 0.5 + 0.02);   // 贴 +z 屏面
    g.add(screen);
  }
  place("loungeSofa", 0, BR_D / 2 - 1.25, Math.PI, 1.35);                   // 沙发在前(+z)朝 -z 看电视
  place("tableCoffee", 0.1, 0.2, 0, 1.15);                                  // 茶几居中
  // 茶水台：台面柜 + 柜上咖啡机 + 咖啡杯；旁边小冰箱(=饮水机)
  const cabX = -BR_W / 2 + 0.62, cabZ = 0.35;
  place("kitchenCabinet", cabX, cabZ, Math.PI / 2, 1.2);                     // 台面柜靠左墙
  const cabTop = FY + ((MODELS.kitchenCabinet && MODELS.kitchenCabinet.userData.size.y) || 0.45) * fs * 1.2;
  const cm = place("kitchenCoffeeMachine", cabX + 0.04, cabZ + 0.16, Math.PI, 1.0);   // 咖啡机摆柜面上
  if (cm) cm.position.y = cabTop;
  [[cabX - 0.03, cabZ - 0.16, 0xcf5b43], [cabX + 0.13, cabZ - 0.2, 0xece7df]].forEach(([cx, cz, col]) => {   // 两个咖啡杯
    const cup = coffeeCup(col); cup.position.set(cx, cabTop, cz); cup.rotation.y = Math.random() * Math.PI * 2; g.add(cup);
  });
  place("kitchenFridgeSmall", cabX - 0.05, -BR_D / 2 + 0.95, Math.PI / 2, 1.1);   // 小冰箱(=饮水机)同墙靠后
  const lampX = BR_W / 2 - 0.55, lampZ = -BR_D / 2 + 0.85;                  // 落地灯右后角 + 暖光泡(夜增亮)
  place("lampSquareFloor", lampX, lampZ, 0, 1.1);
  const lampH = (MODELS.lampSquareFloor ? MODELS.lampSquareFloor.userData.size.y * fs * 1.1 : 0.9);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffb24d, emissiveIntensity: 0.5, toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bulbMat); bulb.position.set(lampX, FY + lampH * 0.9, lampZ); g.add(bulb);
  breakNightGlow.push(bulbMat);
  if (document.body.dataset.tod === "night") bulbMat.emissiveIntensity = 2.6;   // 初始按当前昼夜
  place("plantSmall3", BR_W / 2 - 0.55, BR_D / 2 - 0.8, 0, 1.25);           // 绿植点缀
  place("pottedPlant", -BR_W / 2 + 0.6, BR_D / 2 - 0.85, 0, 1.0);
  g.add(buildCloister());                                                    // 回廊环动线(中庭四周一圈，连通 8 间⇄中庭)
  return g;
}

// ── 房间编排（网格）+ 角色复用 reconcile ──────────────────────────────
const rooms = new Map();    // sessionId -> { group, fig(boss), emps[], monster }
let maxRing = 1;            // 当前需要的最外环层数(Chebyshev 距离)
let dbgPathGroup = null;    // 调试:动线路点可视化层(?dbg=1)，房间重排时重置

// 中庭环形布局(四合院)：中心格(0,0)留给中庭休息室，房间从内环向外环逐层环绕。
// 第 ring 环(Chebyshev=ring)周长 8*ring 格：ring1=8, ring2=16, ring3=24…
const HALF_PI = Math.PI / 2;
const snap90 = (a) => Math.round(a / HALF_PI) * HALF_PI;   // 朝向 snap 到最近 90°
// 一个网格点离中心的"前向角"(从 +z 即镜头前方起，顺时针扫到 +x)，用于外环按角度均布
const ringAng = ([gx, gz]) => { const a = Math.atan2(gx, gz); return a < 0 ? a + Math.PI * 2 : a; };
function orderedRingCells(ring) {
  // 内环(常见 ≤8 间)固定一个均衡顺序：先四正(前/右/后/左)再四角，少量会话也左右对称
  if (ring === 1) return [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const cells = [];
  for (let gx = -ring; gx <= ring; gx++)
    for (let gz = -ring; gz <= ring; gz++)
      if (Math.max(Math.abs(gx), Math.abs(gz)) === ring) cells.push([gx, gz]);
  cells.sort((a, b) => ringAng(a) - ringAng(b));   // 外环按角度均布(从镜头前方绕一圈)
  return cells;
}
function cellGrid(i) {       // 第 i 间房(0-based)落在第几环的哪个格，向外螺旋填充
  let idx = i, ring = 1;
  for (;;) { const cells = orderedRingCells(ring); if (idx < cells.length) return cells[idx]; idx -= cells.length; ring++; }
}
function layout(n) {
  let ring = 1, cap = 8;
  while (cap < n) { ring++; cap += 8 * ring; }
  maxRing = ring;
  buildBase(maxRing);
}
function cellPos(i) {
  const [gx, gz] = cellGrid(i);
  const x = gx * STEP, z = gz * STEP;
  // 房间默认开口朝 +x+z(墙在 -x/-z)，旋转使开口对准中庭：ry=atan2(-x,-z)-π/4，snap 到 90°
  // 四角能精确对齐(对角内向)，正向边略近似(轴向内向，开口角 45° 偏置仍有一面正对中庭)
  const ry = (x === 0 && z === 0) ? 0 : snap90(Math.atan2(-x, -z) - Math.PI / 4);
  return { x, z, ry };
}

function setFigState(fig, state) {
  const s = ANIM_OVERRIDE || state;       // ?anim= 强制预览某动作/状态(打字/走路…)
  fig.userData.state = s;                 // 身份靠背后光环红/白；状态驱动骨骼动画 + 工作摆臂
  playClip(fig.userData, STATE_CLIP[s] || s || "idle");   // 未知 state 当作 clip 名直接播(walk/sprint/jump/fall/crouch…)
}

function hashStr(s) { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

// 地面入口铭牌：会话名做成朝镜头一侧的地面地垫(半透明深底+浅字)，平铺融入地景，日夜都清晰
function makeNamePlate(label, ry = 0) {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 144;
  const g = cv.getContext("2d");
  const r = 32, W = 512, H = 144;
  g.fillStyle = "rgba(16,18,26,0.46)";
  g.beginPath(); g.moveTo(r, 0);
  g.arcTo(W, 0, W, H, r); g.arcTo(W, H, 0, H, r); g.arcTo(0, H, 0, 0, r); g.arcTo(0, 0, W, 0, r);
  g.closePath(); g.fill();
  g.textAlign = "center"; g.textBaseline = "middle";
  const FONT = (s) => `bold ${s}px -apple-system,'PingFang SC','Helvetica Neue',sans-serif`;
  const full = String(label || "office");
  const maxW = W - 56;                                 // 左右留白
  let fs = 64;                                         // 自动缩字号铺满:长名缩小而非截断
  g.font = FONT(fs);
  while (fs > 24 && g.measureText(full).width > maxW) { fs -= 2; g.font = FONT(fs); }
  let txt = full;
  if (g.measureText(txt).width > maxW) {               // 缩到下限仍超长 → 末尾省略
    while (txt.length > 1 && g.measureText(txt + "…").width > maxW) txt = txt.slice(0, -1);
    txt += "…";
  }
  g.fillStyle = "#eef2ff"; g.fillText(txt, W / 2, H / 2 + 4);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.76),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  pl.rotation.x = -Math.PI / 2;                              // 平铺地面
  pl.renderOrder = 2;
  // 位置放外层 holder(本地 +z=开口侧,跟房间旋转→永远朝中庭可见,不会藏到外墙后)；
  // 内层 inner 旋转管文字朝向：0/180° 房间用 -ry 让文字正读；
  // ±90° 房间(开口边沿沿 x)若文字横排会戳出地毯，额外 +90° 让长边贴着边沿收进地毯内。
  let trot = -ry;
  const q = Math.round(ry / (Math.PI / 2)) & 3;            // 0/1/2/3 = 0/90/180/270°
  if (q === 1 || q === 3) trot += Math.PI / 2;             // 办公室 2/4/6/7(E/W/SW/NE)转 90°
  const inner = new THREE.Group(); inner.rotation.y = trot; inner.add(pl);
  const holder = new THREE.Group(); holder.position.set(0, 0.175, ROOM / 2 - 0.95); holder.add(inner);
  return holder;
}

// 调试层：文字精灵(始终朝镜头、不被遮挡)
function textSprite(txt, hex, scale = 1.7) {
  const cv = document.createElement("canvas"); cv.width = 160; cv.height = 80;
  const g = cv.getContext("2d");
  g.font = "bold 52px -apple-system,'Helvetica Neue',sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,0.65)"; g.strokeText(txt, 80, 42);
  g.fillStyle = hex; g.fillText(txt, 80, 42);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  s.scale.set(scale, scale * 0.5, 1); s.renderOrder = 999;
  return s;
}
// 调试层：XYZ 世界坐标轴(红=X/绿=Y/蓝=Z) + 端点标签，供与用户沟通定位
function buildAxes() {
  const grp = new THREE.Group();
  const L = 22, Y = 0.32, Lh = 7;
  const axMat = (rgb) => { const m = new THREE.MeshBasicMaterial({ toneMapped: false }); m.color.setRGB(...rgb); return m; };
  const xb = new THREE.Mesh(rbox(2 * L, 0.08, 0.08, 0.03), axMat([2.4, 0.1, 0.1])); xb.position.y = Y; grp.add(xb);   // X 红
  const zb = new THREE.Mesh(rbox(0.08, 0.08, 2 * L, 0.03), axMat([0.15, 0.4, 2.8])); zb.position.y = Y; grp.add(zb);   // Z 蓝
  const yb = new THREE.Mesh(rbox(0.08, Lh, 0.08, 0.03), axMat([0.1, 2.4, 0.3])); yb.position.set(0, Lh / 2, 0); grp.add(yb);   // Y 绿
  const lab = (txt, hex, x, y, z) => { const s = textSprite(txt, hex); s.position.set(x, y, z); grp.add(s); };
  lab("+X", "#ff4040", L + 1, Y + 0.4, 0); lab("−X", "#ff9090", -L - 1, Y + 0.4, 0);
  lab("+Z", "#5070ff", 0, Y + 0.4, L + 1); lab("−Z", "#a0b0ff", 0, Y + 0.4, -L - 1);
  lab("+Y", "#40d050", 0, Lh + 0.8, 0);
  lab("O", "#ffffff", -0.7, Y + 0.4, -0.7);
  return grp;
}
// 动线可视化：把一间房的有序路点链画成小球 + 地面色带(用该房间的外墙色)，便于核对
// pts[0]=seat 球更大标起点；段用扁平 box 当地面带，比 1px 线醒目。
function drawWaypoints(parent, pts, rgb) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false }); m.color.setRGB(...rgb);
  pts.forEach((pt, k) => { const d = new THREE.Mesh(new THREE.SphereGeometry(k === 0 ? 0.2 : 0.12, 10, 8), m); d.position.set(pt.x, 0.33, pt.z); d.renderOrder = 998; parent.add(d); });
  for (let k = 0; k < pts.length - 1; k++) {                       // 段：扁平地面带
    const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 0.001;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.12), m);
    seg.position.set((a.x + b.x) / 2, 0.3, (a.z + b.z) / 2);
    seg.rotation.y = -Math.atan2(dz, dx); seg.renderOrder = 998; parent.add(seg);
  }
}
// 调试：画出障碍足迹(灰色圈)，让动线"绕开障碍"看得见(中庭家具 + 各房工位/摆件通用)
function drawObstacleRings(parent, obs, opacity = 0.5) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity }); m.color.setRGB(0.5, 0.5, 0.55);
  for (const o of obs) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(o.r - 0.05, o.r, 24), m);
    ring.rotation.x = -Math.PI / 2; ring.position.set(o.x, 0.29, o.z); ring.renderOrder = 997; parent.add(ring);
  }
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
    LOUNGE_SPOTS.forEach((s) => (s.taken = false));   // 重建→释放所有休息落点占用(防泄漏)
    if (DBG || PATHS) { if (dbgPathGroup) scene.remove(dbgPathGroup); dbgPathGroup = new THREE.Group(); scene.add(dbgPathGroup); drawObstacleRings(dbgPathGroup, ATRIUM_OBS); drawLoungeSpots(dbgPathGroup); }   // 重置动线层 + 中庭障碍圈 + 休息落点
    list.forEach((r, i) => {
      const accent = ACCENTS[hashStr(r.sessionId) % ACCENTS.length];
      const group = new THREE.Group();
      const shell = buildRoom(accent);
      group.add(shell);
      const p = cellPos(i);
      group.add(makeNamePlate(r.label, p.ry));  // 地面入口铭牌=会话名(传 ry 反向抵消房间旋转,文字恒正读)
      group.position.set(p.x, 0, p.z);
      group.rotation.y = p.ry;                  // 房间整体朝中庭旋转(开口朝内、外墙朝外；figure/seat 随之自动正确)
      scene.add(group);
      const fig = makeFigure(true, r.channel);   // 主 Agent 光环按来源工具(channel)上色
      const bseat = shell.userData.seats[0] || { x: 0, z: 0, face: 0 };   // 主 Agent 坐三联屏位
      fig.position.set(bseat.x, SEAT_Y, bseat.z);
      fig.rotation.y = bseat.face || 0;          // 朝向显示器
      group.add(fig);
      initWalker(fig, bseat, bseat.face || 0, p, true);   // 主 agent 走动状态 + 房腿路径(seat→中庭口)
      rooms.set(r.sessionId, { group, fig, emps: [], monster: null, seats: shell.userData.seats, ledMat: shell.userData.ledMat, accent, idx: i, p });
      if (DBG || PATHS) {                                  // 画该房 boss 房腿 + 房内障碍圈(dbg 或 paths)
        drawWaypoints(dbgPathGroup, fig.userData.roomLegW.map((pt) => toLocalXZ(pt, p)), DBG_LINE[i % DBG_LINE.length]);
        drawObstacleRings(dbgPathGroup, obsToWorld(ROOM_OBS, p), 0.32);
      }
    });
  }
  // 更新各房间状态/员工/怪兽
  list.forEach((r) => {
    const room = rooms.get(r.sessionId);
    if (!room) return;
    const bossState = (r.boss && r.boss.state) || "idle";
    if (room.fig.userData.walk.phase === "seated") setFigState(room.fig, bossState);   // 走动/喝咖啡时不被状态轮询打断动作
    if (room.ledMat) {
      if (DBG) room.ledMat.color.setRGB(...DBG_LINE[(room.idx ?? 0) % DBG_LINE.length]);   // 调试:外墙线条按房间序固定上色(盖过状态色)
      else setLed(room.ledMat, r.automode ? "automode" : bossState);                       // L形LED=主Agent状态(automode优先黄)
    }
    const want = Math.min((r.employees || []).length, room.seats.length - 1);   // 主位占 seats[0]
    while (room.emps.length < want) {
      const e = makeFigure(false);
      const s = room.seats[room.emps.length + 1];
      e.position.set(s.x, SEAT_Y, s.z);
      e.rotation.y = s.face || 0;                // 朝向显示器
      initWalker(e, s, s.face || 0, room.p, false);   // 员工也能去喝咖啡(间隔更稀疏)
      room.group.add(e); room.emps.push(e);
    }
    while (room.emps.length > want) { const e = room.emps.pop(); if (e.userData.walk && e.userData.walk.spot) e.userData.walk.spot.taken = false; room.group.remove(e); }   // 移除时释放其占用
    room.emps.forEach((e) => { if (e.userData.walk.phase === "seated") setFigState(e, (r.boss && r.boss.state) === "delegating" ? "executing" : "working"); });   // 走动中不打断
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

// ── B 步：角色(boss/员工)走去中庭喝咖啡的移动状态机 ──────────────────────────
// 状态：seated →(计时到+有空落点)→ toLounge(沿动线走) → lounging(坐沙发/操作咖啡机/站着端杯) → toSeat(原路返回) → seated
// fig 挂 room.group 下，按本地坐标插值移动；落点世界坐标→本地经 room.p 转换；朝向用 spot.face-ry。
function stepWalker(room, fig, dt) {
  const u = fig.userData, w = u.walk;
  if (!w) return;
  if (w.phase === "seated") {
    if (room.monster) return;                        // 出错(怪兽)时不离岗
    w.timer -= dt;
    if (w.timer <= 0) {
      const spot = LOUNGE_SPOTS.find((s) => !s.taken);
      if (!spot) { w.timer = 2 + Math.random() * 3; return; }   // 没空落点，待会再试
      spot.taken = true; w.spot = spot;
      const entry = u.roomLegW[u.roomLegW.length - 1];          // 房腿末点=中庭门口
      w.route = [...u.roomLegW, ...buildLoungeLeg(entry, spot)].map((pt) => toLocalXZ(pt, room.p));   // 拼"房腿+中庭腿"→本地
      w.seg = 1; w.phase = "toLounge"; u.walking = true; fig.position.y = WALK_Y; playClip(u, "walk");
    }
    return;
  }
  if (w.phase === "lounging") {
    w.timer -= dt;
    if (w.timer <= 0) { w.route = w.route.slice().reverse(); w.seg = 1; w.phase = "toSeat"; u.walking = true; fig.position.y = WALK_Y; playClip(u, "walk"); }
    return;
  }
  // toLounge / toSeat：沿 w.route 逐段推进(seg 从 1 到末)
  const target = w.route[w.seg], dx = target.x - fig.position.x, dz = target.z - fig.position.z, dist = Math.hypot(dx, dz);
  fig.rotation.y = Math.atan2(dx, dz);               // 面朝行进方向(模型 ry=0 朝 +z)
  fig.position.y = WALK_Y;
  const step = WALK_SPEED * dt;
  if (dist <= step) {                                // 到达本段路点
    fig.position.x = target.x; fig.position.z = target.z; w.seg++;
    if (w.seg >= w.route.length) {
      if (w.phase === "toLounge") {                  // 到落点：坐沙发/操作咖啡机/站着端杯
        w.phase = "lounging"; w.timer = LOUNGE_DUR + Math.random() * 4;
        fig.position.y = w.spot.y; fig.rotation.y = w.spot.face - room.p.ry; playClip(u, w.spot.clip);
      } else {                                       // 回到工位坐下，释放落点
        w.phase = "seated"; w.timer = w.isBoss ? randTrip() : empTrip(); u.walking = false;
        if (w.spot) { w.spot.taken = false; w.spot = null; }
        fig.position.set(w.home.x, SEAT_Y, w.home.z); fig.rotation.y = w.home.face; playClip(u, STATE_CLIP[u.state] || "sit");
      }
    }
  } else {
    fig.position.x += dx / dist * step; fig.position.z += dz / dist * step;
  }
}

// (已移除对向避让 separationPass：多个 agent 互推反而抱团/卡死，宁可穿模重叠也不卡)

// 调试：画出中庭休息落点(青色球) + 接近点(小球)
function drawLoungeSpots(parent) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false }); m.color.setRGB(0.2, 2.6, 2.6);
  for (const sp of LOUNGE_SPOTS) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m); d.position.set(sp.x, 0.34, sp.z); d.renderOrder = 998; parent.add(d);
    if (sp.ax !== sp.x || sp.az !== sp.z) { const a = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), m); a.position.set(sp.ax, 0.3, sp.az); a.renderOrder = 998; parent.add(a); }
  }
}

const _typeQL = new THREE.Quaternion(), _typeQR = new THREE.Quaternion(), _typeAxis = new THREE.Vector3(0, 0, 1);   // 绕 Z 摆臂(X 是手臂长轴=拧麻花)
function animFig(fig, t, dt) {
  const u = fig.userData;
  if (u.mixer) u.mixer.update(dt);                  // 骨骼动画推进
  if (u.armL && u.armR && !u.walking && (u.state === "writing" || u.state === "executing" || u.state === "working")) {
    const w = 0.42 + Math.sin(t * 13 + u.phase) * 0.2;   // 工作态：双手前伸到键盘(基础 0.42) + 小幅交替敲击(±0.2)
    u.armL.quaternion.multiply(_typeQL.setFromAxisAngle(_typeAxis, w));    // 在 mixer 写入的 quaternion 之上叠加(避免被 euler 同步吞掉)
    u.armR.quaternion.multiply(_typeQR.setFromAxisAngle(_typeAxis, -w));
  }
  u.disc.material.opacity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3.2 + u.phase));   // 身份光盘闪烁
}

let lastT = 0;
function loop() {
  const t = clock.getElapsedTime();
  const dt = Math.min(0.05, t - lastT); lastT = t;
  for (const [, r] of rooms) {
    stepWalker(r, r.fig, dt);                           // 主 agent 走去喝咖啡
    r.emps.forEach((e) => stepWalker(r, e, dt));        // 员工也偶尔去
    animFig(r.fig, t, dt);
    r.emps.forEach((e) => animFig(e, t, dt));
    if (r.monster) {
      r.monster.userData.body.rotation.y = t * 1.2;
      r.monster.userData.body.position.y = 0.7 + Math.abs(Math.sin(t * 5)) * 0.12;
    }
  }
  stepTv(dt, t);                                        // 中庭电视像素屏动画
  stepWeather(dt, t);                                   // 雨雪下落
  stepFlyers(dt, t);                                    // 四季飞舞(蝴蝶/落叶)
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
  if (DEMO_N > 0) {                                   // 调试:?rooms=N 强制渲染 N 间(跳过后端),去掉参数即恢复真实数据
    syncRooms(makeDemoRooms(DEMO_N));
    document.getElementById("hud").textContent = `${DEMO_N} 间办公室 · 调试演示(?rooms=${DEMO_N})`;
    return;
  }
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
makeFlyers();                                  // 四季飞舞元素(春蝴蝶/夏绿叶/秋枫叶)
if (DBG) scene.add(buildAxes());               // 调试层:?dbg=1 显示 XYZ 世界坐标轴 + 端点标签
// 先预加载 Kenney 模型，再开始建房间（加载失败则回退程序化占位，不阻塞）
preloadModels()
  .catch((e) => { /* 模型加载失败：makeFigure/buildRoom 自动回退占位 */ })
  .finally(() => { breakRoom = buildBreakRoom(); scene.add(breakRoom); pollRooms(); setInterval(pollRooms, POLL_MS); });

// ── UI 浮层 ───────────────────────────────────────────────────────────
// 顶部居中横排图例：主/子身份 + 墙顶 LED 状态(颜色对齐 LED_COLOR) 拼一行
const legend = document.getElementById("legend");
const LED_LEGEND = [
  ["#39ff6a", "进行中"], ["#ff8c1a", "待授权"], ["#ffffff", "待命中"],
  ["#39c5bb", "AUTOMODE"], ["#ff2a45", "出错了"],
];
legend.innerHTML =
  '<span class="it"><span class="dot" style="background:#ff2d4f;color:#ff2d4f"></span>👑 主 Agent</span>' +
  '<span class="it"><span class="dot" style="background:#ffffff;color:#ffffff"></span>子代理</span>' +
  '<span class="sep"></span>' +
  '<span class="it" style="opacity:.6">墙顶 LED</span>' +
  LED_LEGEND.map(([c, l]) => `<span class="it"><span class="led" style="background:${c};box-shadow:0 0 8px ${c}"></span>${l}</span>`).join("");
const btnRotate = document.getElementById("btnRotate");
btnRotate.addEventListener("click", () => {
  autoRotate = !autoRotate; btnRotate.setAttribute("aria-pressed", String(autoRotate));
});
document.getElementById("btnReset").addEventListener("click", () => {
  isoPlace(); viewSize = fitViewSize; camera.zoom = 1; controls.target.set(0, 0.4, 0);   // 恢复到自适应取景值(不再写死 13)
  camera.updateProjectionMatrix(); resize();
});

// ── 点击中庭电视屏 → 循环切换画面(黑客帝国/宫崎骏/银翼杀手/TRON/HAL/塔图因) ──
const _tvRay = new THREE.Raycaster(), _tvNdc = new THREE.Vector2();
let _pdX = 0, _pdY = 0, _pdT = 0;
renderer.domElement.addEventListener("pointerdown", (e) => { _pdX = e.clientX; _pdY = e.clientY; _pdT = performance.now(); });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!tvScreenMesh) return;
  if (Math.hypot(e.clientX - _pdX, e.clientY - _pdY) > 6 || performance.now() - _pdT > 400) return;   // 拖拽/长按不算点击
  _tvNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  _tvRay.setFromCamera(_tvNdc, camera);
  if (_tvRay.intersectObject(tvScreenMesh, false).length) { tvScene = (tvScene + 1) % TV_SCENES.length; tvAcc = 1; }   // 命中→下一画面,立即重绘
});

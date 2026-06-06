/* claude-office · iso 活景看板（斜45° 微缩办公室·装修版）
   一座公司大楼：每会话=一间办公室(1 头儿位 + ≤9 工位)，全楼共享茶水间。
   行为：有活在工位；主 agent 闲(idle/sleeping)→头儿进茶水间、子代理走出消失。
   渲染：自绘 canvas iso。楼板地基 + 带窗/海报的墙 + 地毯/地垫 + 格子间隔断 +
        台灯/发光屏工位 + 文件柜/饮水机/书架 + 茶水间(咖啡吧台/冰箱/圆桌凳)。
        家具与角色统一深度排序，人坐桌后、显示器挡下半身。每间按部门配色。
   角色：有 char-frames.json 就逐帧播 sheet + 体态补间；缺帧回退单图 char-hero.png。
   AIGC CLAUDE-OPUS-4-8 2026-06-04 */
(() => {
  "use strict";

  const POLL_MS = 1500;
  const TILE_W = 64, TILE_H = 32;
  const ROOM_W = 7.6, ROOM_H = 8.6, GAP = 1.6;
  const SPEED = 0.07, MAX_SEATS = 4, REST_SECONDS = 7;   // 子代理干完先喝杯奶茶再走
  const DEPT = ["#3fb968", "#3aa6e6", "#e6a52e", "#a05be0", "#ef8a3a", "#e0503a", "#7b6cf0", "#2bb6a8"];

  const STATES = {
    thinking:   { zh: "思考", emoji: "💭", c: "#7b6cf0" },
    researching:{ zh: "查阅", emoji: "🔍", c: "#3aa6e6" },
    writing:    { zh: "写文件", emoji: "✍️", c: "#3fb968" },
    executing:  { zh: "执行", emoji: "⚙️", c: "#e6a52e" },
    delegating: { zh: "派活", emoji: "👥", c: "#a05be0" },
    waiting:    { zh: "等授权", emoji: "✋", c: "#ef8a3a" },
    error:      { zh: "出错", emoji: "⚠️", c: "#e0503a" },
    idle:       { zh: "待命", emoji: "☕", c: "#9aa3b2" },
    sleeping:   { zh: "休眠", emoji: "💤", c: "#8694b0" },
    working:    { zh: "工作", emoji: "⌨️", c: "#e6a52e" },
  };
  const sm = (s) => STATES[s] || STATES.idle;
  const isResting = (s) => s === "idle" || s === "sleeping";

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const conn = document.getElementById("conn");
  const countEl = document.getElementById("count");

  const hero = new Image();
  let heroReady = false;
  hero.onload = () => { heroReady = true; };
  hero.src = "/static/char-hero.png";

  // 角色皮肤池：boss / employee，按状态分组(default=工作态, idle=休息态)。
  // 角色按 id 哈希随机选一张，稳定不乱跳；往数组加图即多样化/轮换。
  const SKINS = { boss: {}, employee: {} };
  function loadImgList(files) {
    return (files || []).map((file) => {
      const img = new Image(); const rec = { img, ready: false };
      img.onload = () => { rec.ready = true; };
      img.src = "/static/" + file + "?t=" + Date.now();
      return rec;
    });
  }
  function loadSkins() {
    fetch("/static/char-skins.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        ["boss", "employee"].forEach((role) => {
          const g = m[role] || {};
          const groups = Array.isArray(g) ? { default: g } : g;   // 兼容旧的纯数组写法
          Object.keys(groups).forEach((mood) => { SKINS[role][mood] = loadImgList(groups[mood]); });
        });
      }).catch(() => {});
  }
  function skinFor(ch) {
    const role = ch.kind === "boss" ? "boss" : "employee";
    const mood = isResting(ch.state) ? "idle" : "default";
    const g = SKINS[role] || {};
    const pool = (g[mood] && g[mood].length) ? g[mood] : g["default"];
    if (pool && pool.length) { const rec = pool[(ch.skinHash || 0) % pool.length]; if (rec.ready) return rec.img; }
    return heroReady ? hero : null;
  }

  const FRAME_FPS = 8;
  let clock = 0;
  const frameSheets = {};
  function loadFrames() {
    fetch("/static/char-frames.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m || !m.states) return;
        const H = m.frameH || 480;
        Object.entries(m.states).forEach(([st, info]) => {
          const img = new Image();
          const rec = { img, frames: info.frames || 1, frameW: info.frameW || H, frameH: info.frameH || H, ready: false };
          img.onload = () => { rec.ready = true; };
          img.src = "/static/" + info.sheet + "?t=" + Date.now();
          frameSheets[st] = rec;
        });
      }).catch(() => {});
  }

  // 地板贴图 + 顶面锚点(T/L/R，仿射对齐用)
  const FLOOR_IMGS = {}; let FLOOR_META = {};
  ["carpet", "wood", "tile"].forEach((k) => { const img = new Image(); img.src = "/static/assets/floor-" + k + ".png"; FLOOR_IMGS[k] = img; });
  fetch("/static/assets/floor-meta.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) FLOOR_META = m; }).catch(() => {});
  const WIN_IMG = new Image(); WIN_IMG.src = "/static/assets/asset-window-strip.png";  // 长条窗素材(有则用,无则回退程序化 ribbon)
  const CAR_MX5 = new Image(); CAR_MX5.src = "/static/assets/car-mx5.png";    // 常规车(复古 MX-5)，原汁原味不改色
  const CAR_SU7U = new Image(); CAR_SU7U.src = "/static/assets/car-su7u.png";  // 时不时来一辆(SU7 Ultra)
  let LOAD = 0, TARGET_LOAD = 0;   // 全楼车流负载 = 上下文占用%(0~100)，由 /cc/rooms 的 load 平滑趋近
  // 墙面海报池(各房间随机轮换)。竖版当海报、横版当相框；缺图回退纯色海报
  const POSTER_IMGS = {};
  [["stranger", 0.76, 6, 46], ["anime", 1.65, 9, 43]].forEach(([k]) => {        // k + [gy占宽, z下, z上] 见 leftWallDecor
    const img = new Image(); img.src = "/static/assets/poster-" + k + ".png"; POSTER_IMGS[k] = img;
  });
  let NET = { ok: null, url: "" };                                               // 监控网址连通(DGX 机房红绿灯;false=不通→红)
  const DGX_IMG = { green: new Image(), red: new Image() };                      // 有图则贴集群,无图回退程序化机柜
  DGX_IMG.green.src = "/static/assets/dgx-green.png"; DGX_IMG.red.src = "/static/assets/dgx-red.png";
  const MONSTER_IMGS = [];                                                       // 怪兽随机池(monsters.json→char-monster-*),空则程序化占位
  fetch("/static/monsters.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
    .then((list) => { (Array.isArray(list) ? list : []).forEach((f) => { const i = new Image(); i.src = "/static/" + f; MONSTER_IMGS.push(i); }); }).catch(() => {});
  const FURN_IMGS = {};   // 家具素材:头儿三联屏 / 员工咖啡桌·奶茶桌 / 白板(缺图回退程序化)
  ["desk-triple", "desk-coffee", "desk-milktea", "whiteboard"].forEach((k) => { const i = new Image(); i.src = "/static/assets/asset-" + k + ".png"; FURN_IMGS[k] = i; });
  // 窗外天气联动
  let WEATHER = { sky: "clear", isDay: true };
  function loadWeather() {
    fetch("/cc/weather?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((w) => { if (w && w.sky) WEATHER = w; }).catch(() => {});
  }

  let rooms = new Map();
  let chars = new Map();
  let breakRoom = null, breakSlots = [], empRestSlots = [], restCounter = 0;
  let dgxRoom = null;   // DGX B300 机房(显示监控网址连通,红/绿)
  let furniture = [];
  let slab = null, city = null, cars = [];
  let camera = { scale: 1, ox: 0, oy: 0 };
  let buildingBounds = null;
  let displayRooms = [];
  // 永不空楼：零会话时也保底画这间办公室（无角色）
  const idleRoom = { label: "总部 · 待命中", placeholder: true, bossState: "idle", gx: 0, gy: 0, accent: "#3aa6e6", wallLeft: "poster", clock: true };

  // ---------- iso 基元 ----------
  const iso = (gx, gy) => ({ x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) });
  const pt = (gx, gy, z) => { const p = iso(gx, gy); return { x: p.x, y: p.y - (z || 0) }; };
  const depth = (gx, gy) => gx + gy;
  function quad(a, b, c, d, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
  }
  function mix(hex, f) { // 向白混合 f(0~1)
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${(r + (255 - r) * f) | 0},${(g + (255 - g) * f) | 0},${(b + (255 - b) * f) | 0})`;
  }
  function box(gx, gy, w, h, z0, zh, hex) {
    const A = pt(gx, gy, z0), B = pt(gx + w, gy, z0), C = pt(gx + w, gy + h, z0), D = pt(gx, gy + h, z0);
    const At = pt(gx, gy, z0 + zh), Bt = pt(gx + w, gy, z0 + zh), Ct = pt(gx + w, gy + h, z0 + zh), Dt = pt(gx, gy + h, z0 + zh);
    quad(B, C, Ct, Bt, shade(hex, 0.82), "rgba(0,0,0,.10)");
    quad(D, C, Ct, Dt, shade(hex, 0.66), "rgba(0,0,0,.12)");
    quad(At, Bt, Ct, Dt, shade(hex, 1.0), "rgba(0,0,0,.10)");
  }
  function shadow(gx, gy, rx, ry) {
    const p = pt(gx, gy, 0); ctx.fillStyle = "rgba(40,46,70,.13)";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function ellipseTop(gx, gy, z, rx, ry, fill) {
    const p = pt(gx, gy, z); ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- 家具 ----------
  // 落地家具：投影到「与窗户墙平行」的竖面(恒定 gy、沿 gx，站地面 z=0..zTop)，朝向同窗户、随 iso 倾斜
  function drawProp(img, gx, gy, wTiles) {
    const w = img.naturalWidth, h = img.naturalHeight, half = wTiles / 2;
    const Tl = pt(gx - half, gy, 0), Tr = pt(gx + half, gy, 0);
    const sx = Math.hypot(Tr.x - Tl.x, Tr.y - Tl.y);     // gx 方向在屏上的长度
    const zTop = sx * h / w;                             // 按图片比例求高度,不变形
    const c = pt(gx, gy, 0);
    ctx.fillStyle = "rgba(40,46,70,.15)"; ctx.beginPath(); ctx.ellipse(c.x, c.y, sx * 0.46, sx * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    drawWallImg(img, gx - half, gx + half, gy, 0, zTop);  // 复用窗户的仿射 → 与窗墙平行
  }
  function deskSet(gx, gy, big, accent) {
    // 有素材就贴图：头儿=三联屏；员工=咖啡桌/奶茶桌(按位置交替)
    const fi = big ? FURN_IMGS["desk-triple"]
                   : (((Math.round(gx) + Math.round(gy)) % 2) ? FURN_IMGS["desk-coffee"] : FURN_IMGS["desk-milktea"]);
    if (fi && fi.complete && fi.naturalWidth) { drawProp(fi, gx, gy, big ? 2.9 : 2.1); return; }
    const w = big ? 1.5 : 1.08, dep = big ? 0.78 : 0.64;
    shadow(gx, gy + dep / 2, big ? 34 : 26, big ? 15 : 12);
    box(gx - w / 2, gy - dep / 2, w, dep, 0, 13, "#eef1f6");
    box(gx - w / 2 + 0.04, gy + dep / 2 - 0.06, w - 0.08, 0.06, 0, 12, "#d3dae4");
    const mw = big ? 0.92 : 0.64;
    box(gx - mw / 2, gy - 0.05, mw, 0.07, 13, 13, "#222a39");                 // 显示器身
    const a = pt(gx - mw / 2, gy + 0.02, 25), b = pt(gx + mw / 2, gy + 0.02, 25),
          c = pt(gx + mw / 2, gy + 0.02, 15), d = pt(gx - mw / 2, gy + 0.02, 15);
    quad(a, b, c, d, mix(accent || "#3a78c8", 0.25));                          // 发光屏(部门色)
    if (big) box(gx + 0.56, gy - 0.05, 0.56, 0.07, 13, 13, "#222a39");
    box(gx - 0.34, gy + 0.16, 0.66, 0.16, 13, 2, "#c6cdd8");                   // 键盘
    // 台灯
    box(gx - w / 2 + 0.08, gy - 0.08, 0.06, 0.06, 13, 9, "#4a5160");
    ellipseTop(gx - w / 2 + 0.11, gy - 0.05, 24, 4, 2.5, "#ffd98a");
    // 咖啡杯 + 纸
    box(gx + (big ? 0.5 : 0.36), gy + 0.12, 0.12, 0.12, 13, 7, "#ffffff");
    box(gx - (big ? 0.5 : 0.34), gy + 0.13, 0.18, 0.12, 13, 1.5, "#fafafa");
  }
  function chair(gx, gy, hex) {
    shadow(gx, gy + 0.05, 12, 6);
    box(gx - 0.2, gy - 0.2, 0.4, 0.4, 0, 11, hex || "#454c5b");
    box(gx - 0.2, gy - 0.26, 0.4, 0.09, 0, 22, shade(hex || "#454c5b", 0.9));
    box(gx - 0.05, gy - 0.05, 0.1, 0.1, 0, 5, "#2c3240");
  }
  function partition(gx, gy, w, hpx, hex) { box(gx, gy, w, 0.08, 0, hpx, hex); }
  function partitionV(gx, gy, h, hpx, hex) { box(gx, gy, 0.08, h, 0, hpx, hex); }
  function cabinet(gx, gy, accent) {
    shadow(gx, gy, 16, 8); box(gx - 0.3, gy - 0.3, 0.6, 0.6, 0, 28, "#aeb6c4");
    for (let i = 0; i < 3; i++) box(gx - 0.24, gy + 0.24, 0.48, 0.04, 6 + i * 7, 4, shade(accent || "#888", 0.9));
  }
  function waterCooler(gx, gy) {
    shadow(gx, gy, 12, 6); box(gx - 0.18, gy - 0.18, 0.36, 0.36, 0, 22, "#dfe6ee");
    box(gx - 0.16, gy - 0.16, 0.32, 0.32, 22, 12, "#7fc6ef");
  }
  function bookshelf(gx, gy, w) {
    shadow(gx, gy, w * 22, 8); box(gx - w / 2, gy - 0.16, w, 0.3, 0, 30, "#9a6a3c");
    const cols = ["#e0503a", "#e6a52e", "#3fb968", "#3aa6e6", "#a05be0", "#ef8a3a"];
    for (let i = 0; i < Math.floor(w / 0.18); i++) box(gx - w / 2 + 0.06 + i * 0.18, gy - 0.12, 0.12, 0.2, 8 + (i % 2) * 9, 12, cols[i % cols.length]);
  }
  function plant(gx, gy, big) {
    const s = big ? 1.4 : 1; shadow(gx, gy, 11 * s, 5 * s);
    box(gx - 0.13 * s, gy - 0.13 * s, 0.26 * s, 0.26 * s, 0, 10 * s, "#9a6a3c");
    ellipseTop(gx, gy, 22 * s, 11 * s, 8 * s, "#3f9d54");
    ellipseTop(gx - 3, gy, 25 * s, 7 * s, 5 * s, "#4fbf68");
  }
  function rug(ox, oy, w, h, accent) {
    const A = pt(ox, oy), B = pt(ox + w, oy), C = pt(ox + w, oy + h), D = pt(ox, oy + h);
    quad(A, B, C, D, mix(accent, 0.62), mix(accent, 0.2));
  }

  function coffeeBar(gx, gy) {
    shadow(gx, gy, 44, 14); box(gx - 1.0, gy - 0.3, 2.0, 0.55, 0, 16, "#caa472");   // 吧台
    box(gx - 0.85, gy - 0.18, 0.64, 0.5, 16, 30, "#3a3f4b");                          // 咖啡机
    const r = pt(gx - 0.5, gy - 0.05, 44); ctx.fillStyle = "#e0503a"; ctx.beginPath(); ctx.arc(r.x, r.y, 3, 0, 7); ctx.fill();
    box(gx - 0.6, gy + 0.06, 0.13, 0.13, 16, 6, "#fff");
    box(gx + 0.3, gy + 0.0, 0.16, 0.16, 16, 7, "#fff");
  }
  function fridge(gx, gy) { shadow(gx, gy, 16, 8); box(gx - 0.3, gy - 0.3, 0.6, 0.6, 0, 46, "#eef2f6"); box(gx - 0.28, gy + 0.18, 0.1, 0.04, 24, 10, "#b9c2cf"); }
  function roundTable(gx, gy) { shadow(gx, gy, 22, 10); box(gx - 0.07, gy - 0.07, 0.14, 0.14, 0, 12, "#b98e5c"); ellipseTop(gx, gy, 13, 22, 12, "#d8b483"); ellipseTop(gx, gy, 13, 22, 12, "rgba(0,0,0,0)"); }
  function stool(gx, gy) { shadow(gx, gy, 8, 4); box(gx - 0.12, gy - 0.12, 0.24, 0.24, 0, 9, "#5b87b8"); }

  // ---------- 个性化装饰（每间按 sessionId 固定随机）----------
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  function standingLamp(gx, gy) { shadow(gx, gy, 9, 4); box(gx - 0.04, gy - 0.04, 0.08, 0.08, 0, 30, "#5a6170"); ellipseTop(gx, gy, 34, 9, 5, "#ffe6a3"); }
  function beanbag(gx, gy, acc) { shadow(gx, gy, 16, 8); ellipseTop(gx, gy, 12, 18, 11, mix(acc, 0.3)); ellipseTop(gx, gy - 2, 16, 13, 8, mix(acc, 0.5)); }
  function miniFridge(gx, gy) { shadow(gx, gy, 12, 6); box(gx - 0.2, gy - 0.2, 0.4, 0.4, 0, 26, "#e6eaf0"); box(gx - 0.18, gy + 0.1, 0.06, 0.04, 12, 8, "#9aa3b2"); }
  function boxes(gx, gy) { shadow(gx, gy, 16, 8); box(gx - 0.26, gy - 0.26, 0.5, 0.5, 0, 16, "#cbaa78"); box(gx - 0.16, gy - 0.34, 0.4, 0.4, 16, 14, "#d8b884"); }
  function trophyShelf(gx, gy) { shadow(gx, gy, 10, 5); box(gx - 0.18, gy - 0.12, 0.36, 0.24, 0, 18, "#8a623a"); ellipseTop(gx, gy, 20, 5, 3, "#ffd24a"); box(gx - 0.03, gy - 0.03, 0.06, 0.06, 20, 8, "#ffd24a"); }
  function fishTank(gx, gy) { shadow(gx, gy, 13, 6); box(gx - 0.24, gy - 0.16, 0.48, 0.32, 0, 14, "#9a6a3c"); box(gx - 0.22, gy - 0.14, 0.44, 0.28, 14, 16, "rgba(90,180,220,.7)"); }
  const CORNER_DECOR = [
    (g, y) => plant(g, y, true), (g, y) => bookshelf(g, y, 1.4), (g, y, a) => cabinet(g, y, a),
    (g, y) => waterCooler(g, y), (g, y) => standingLamp(g, y), (g, y, a) => beanbag(g, y, a),
    (g, y) => miniFridge(g, y), (g, y) => boxes(g, y), (g, y) => trophyShelf(g, y), (g, y) => fishTank(g, y),
  ];
  const WALL_DECOR = ["poster", "whiteboard", "clock", "framedPic", "posterStranger", "posterAnime"];
  function clockWall(gx, gy, z) {
    const p = pt(gx, gy, z); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#3a4150"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 3); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 5); ctx.stroke();
  }
  function leftWallDecor(room) {
    const ox = room.gx, oy = room.gy, acc = room.accent, wx = ox + 0.35;
    switch (room.wallLeft) {
      case "whiteboard":
        if (FURN_IMGS.whiteboard.complete && FURN_IMGS.whiteboard.naturalWidth) drawWallImgLeft(FURN_IMGS.whiteboard, wx, oy + 5.6, oy + 3.6, 12, 46);
        else posterOn(wx, oy + 3.8, wx, oy + 6.4, 18, 46, "#ffffff");
        break;
      case "clock": clockWall(wx, oy + 5.0, 34); break;
      case "framedPic": posterOn(wx, oy + 4.2, wx, oy + 6.0, 24, 44, acc); break;
      case "posterStranger": wallPoster(POSTER_IMGS.stranger, acc, wx, oy + 4.6, 0.76, 6, 46); break;  // 竖版海报
      case "posterAnime": wallPoster(POSTER_IMGS.anime, acc, wx, oy + 4.6, 1.65, 9, 43); break;        // 横版相框
      default: posterOn(wx, oy + 3.8, wx, oy + 6.4, 20, 44, acc);
    }
    if (room.clock && room.wallLeft !== "clock") clockWall(ox + 0.35, oy + 2.4, 30);
  }

  // ---------- 房间局部 ----------
  const bossLocal = () => ({ gx: 3.6, gy: 1.5 });
  const doorLocal = () => ({ gx: 3.6, gy: 8.2 });
  function seatLocal(i) { const col = i % 2, row = Math.floor(i / 2); return { gx: 2.4 + col * 2.6, gy: 3.5 + row * 2.0 }; }

  // ---------- 布局 + 静态家具 ----------
  function relayout() {
    const realEntries = [...rooms.entries()];
    const entries = realEntries.length ? realEntries : [["__idle__", idleRoom]];  // 永不空楼
    const n = entries.length, total = n + 2;   // +1 茶水间 +1 DGX 机房
    const cols = Math.max(1, Math.ceil(Math.sqrt(total))), bw = ROOM_W + GAP, bh = ROOM_H + GAP;
    entries.forEach(([id, room], i) => {
      room.gx = (i % cols) * bw; room.gy = Math.floor(i / cols) * bh; room.accent = DEPT[i % DEPT.length];
      room.floorTex = (((i % cols) + Math.floor(i / cols)) % 2) ? "wood" : "carpet";   // 棋盘格 → 相邻房间地板不同
    });
    displayRooms = entries.map((e) => e[1]);
    const bi = n, di = n + 1;
    breakRoom = { gx: (bi % cols) * bw, gy: Math.floor(bi / cols) * bh, w: ROOM_W, h: ROOM_H };
    dgxRoom = { gx: (di % cols) * bw, gy: Math.floor(di / cols) * bh, w: ROOM_W, h: ROOM_H };
    breakSlots = [];                                  // 老板休息位：绕圆桌
    for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI * 2; breakSlots.push({ gx: breakRoom.gx + 4.4 + Math.cos(ang) * 1.3, gy: breakRoom.gy + 6.2 + Math.sin(ang) * 0.9 }); }
    empRestSlots = [];                                // 子代理喝奶茶位：咖啡吧台一侧
    for (let i = 0; i < 6; i++) { empRestSlots.push({ gx: breakRoom.gx + 1.5 + (i % 3) * 1.0, gy: breakRoom.gy + 2.6 + Math.floor(i / 3) * 1.1 }); }

    furniture = [];
    const add = (gx, gy, f, deco) => furniture.push({ d: depth(gx, gy), gx, gy, f, deco: !!deco });
    entries.forEach(([id, room]) => {
      const ox = room.gx, oy = room.gy, acc = room.accent;
      const rng = mulberry32(hashStr(String(id)));
      const bl = bossLocal();
      // 桌子在工位「前侧」(角色面朝屏幕、屏幕朝观众)，椅子在「后侧」(角色坐其上,空位时露椅背)。去掉旧隔断
      add(ox + bl.gx, oy + bl.gy - 0.35, () => chair(ox + bl.gx, oy + bl.gy - 0.35, shade(acc, 0.7)));  // 头儿椅(后)
      add(ox + bl.gx, oy + bl.gy + 0.45, () => deskSet(ox + bl.gx, oy + bl.gy + 0.45, true, acc));      // 头儿桌(前,远离窗户)
      for (let i = 0; i < MAX_SEATS; i++) {                       // 4 个子代理工位（2×2）
        const s = seatLocal(i);
        add(ox + s.gx, oy + s.gy - 0.35, () => chair(ox + s.gx, oy + s.gy - 0.35));                  // 员工椅(后)
        add(ox + s.gx, oy + s.gy + 0.35, () => deskSet(ox + s.gx, oy + s.gy + 0.35, false, acc));    // 员工桌(前)
      }
      // 4 个角落各随机一件摆设（按 id 固定）
      const corners = [[1.0, 1.1], [6.6, 1.1], [1.0, 7.4], [6.6, 7.4]];
      const pool = shuffle(CORNER_DECOR.slice(), rng);
      corners.forEach((c, ci) => { const fn = pool[ci % pool.length]; add(ox + c[0], oy + c[1], () => fn(ox + c[0], oy + c[1], acc), true); });
      // 左墙挂件 + 偶尔挂钟（drawRoomFloor 里画）
      room.wallLeft = WALL_DECOR[Math.floor(rng() * WALL_DECOR.length)];
      room.clock = rng() < 0.5;
    });
    const bx = breakRoom.gx, by = breakRoom.gy;
    add(bx + 3.6, by + 1.2, () => coffeeBar(bx + 3.6, by + 1.2));
    add(bx + 6.6, by + 1.2, () => fridge(bx + 6.6, by + 1.2));
    add(bx + 4.4, by + 6.2, () => roundTable(bx + 4.4, by + 6.2));
    add(bx + 1.0, by + 1.4, () => plant(bx + 1.0, by + 1.4, true));
    add(bx + 1.2, by + 7.2, () => plant(bx + 1.2, by + 7.2, true));
    breakSlots.forEach((s) => add(s.gx, s.gy + 0.25, () => stool(s.gx, s.gy + 0.25)));
    furniture.sort((a, b) => a.d - b.d);

    const rows = Math.ceil(total / cols), allGx = cols * bw - GAP, allGy = rows * bh - GAP;
    slab = { x0: -0.6, y0: -0.6, x1: allGx + 0.6, y1: allGy + 0.6 };
    const rGy0 = allGy + 2.8, rGy1 = allGy + 5.0, gxA = -3, gxB = allGx + 3;     // 门口马路带(与大楼留草坪间隔)
    // 单向通车(左上→右下)：车道取沥青中线略偏前；cap=这条路最多容纳几辆(随规模)；车位置由 updateTraffic 维护
    city = { x0: slab.x0, y0: slab.y0, x1: slab.x1, AGy: allGy, rGy0, rGy1, gxA, gxB,
             lane: (rGy0 + rGy1) / 2 + 0.55, span: gxB - gxA,
             cap: Math.max(3, Math.min(16, Math.round((gxB - gxA) / 2.4))) };
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    [[slab.x0, slab.y0], [slab.x1, slab.y0], [gxA, rGy1], [gxB, rGy1], [gxB, rGy0], [slab.x0, rGy1]].forEach(([gx, gy]) => {
      const p = iso(gx, gy); mnX = Math.min(mnX, p.x); mxX = Math.max(mxX, p.x); mnY = Math.min(mnY, p.y); mxY = Math.max(mxY, p.y);
    });
    buildingBounds = { minX: mnX, maxX: mxX, minY: mnY, maxY: mxY };
  }

  function fitCamera() {
    if (!buildingBounds) return;
    const padTop = 92, pad = 30, vw = canvas.clientWidth, vh = canvas.clientHeight;
    const bw = (buildingBounds.maxX - buildingBounds.minX) + 150, bh = (buildingBounds.maxY - buildingBounds.minY) + 190;
    camera.scale = Math.max(0.3, Math.min((vw - pad * 2) / bw, (vh - padTop - pad) / bh, 2.4));
    const cx = (buildingBounds.minX + buildingBounds.maxX) / 2, cy = (buildingBounds.minY + buildingBounds.maxY) / 2;
    camera.ox = vw / 2 - cx * camera.scale; camera.oy = padTop + (vh - padTop) / 2 - cy * camera.scale;
  }

  // ---------- 同步 ----------
  const iso0 = (room, l) => ({ gx: (room.gx || 0) + l.gx, gy: (room.gy || 0) + l.gy });
  function newChar(kind, sessionId, local, room, seedId) { const b = iso0(room, local); return { kind, room, sessionId, gx: b.gx, gy: b.gy, tx: b.gx, ty: b.gy, state: "idle", name: "", phase: Math.PI * (kind === "boss" ? 0.5 : 0), seat: 0, leaving: false, flip: false, skinHash: hashStr(String(seedId || sessionId)) }; }
  function sync(data) {
    const seen = new Set(); let structural = false;
    (data || []).forEach((r) => {
      seen.add(r.sessionId);
      let room = rooms.get(r.sessionId);
      if (!room) { room = { label: r.label, gx: 0, gy: 0, accent: "#3aa6e6" }; rooms.set(r.sessionId, room); structural = true; }
      room.label = r.label; room.bossState = (r.boss && r.boss.state) || "idle"; room.closing = !!r.closing;
      const bid = "boss:" + r.sessionId;
      if (!chars.get(bid)) chars.set(bid, newChar("boss", r.sessionId, doorLocal(), room, bid));
      chars.get(bid).state = room.bossState;
      if (r.closing) {                                   // 关闭中：在场员工全部离场，不再新增
        chars.forEach((ch) => { if (ch.kind === "emp" && ch.room === room) ch.leaving = true; });
      } else {
        const emps = (r.employees || []).slice(0, MAX_SEATS), live = new Set();
        emps.forEach((e, i) => {
          const id = "emp:" + r.sessionId + ":" + e.empId; live.add(id);
          let ch = chars.get(id);
          if (!ch) { ch = newChar("emp", r.sessionId, doorLocal(), room, id); chars.set(id, ch); }
          ch.seat = i; ch.state = e.state || "working"; ch.name = e.name || "子代理"; ch.leaving = false;
        });
        chars.forEach((ch, id) => { if (ch.kind === "emp" && ch.room === room && !live.has(id)) ch.leaving = true; });
      }
      // 出错怪兽：r.monster 为真 → 该办公室刷一只怪兽(随机样式)；否则离场
      const mid = "monster:" + r.sessionId;
      if (r.monster && !r.closing) {
        let mon = chars.get(mid);
        if (!mon) { mon = newChar("monster", r.sessionId, doorLocal(), room, mid); mon.state = "error"; chars.set(mid, mon); }
        mon.leaving = false;
      } else { const mon = chars.get(mid); if (mon) mon.leaving = true; }
    });
    rooms.forEach((room, id) => { if (!seen.has(id)) { rooms.delete(id); structural = true; chars.forEach((c, cid) => { if (c.room === room) chars.delete(cid); }); } });
    relayout();          // 每次同步都重建（含零会话时的占位楼）
    assignTargets();
  }
  function assignTargets() {
    let bi = 0;
    rooms.forEach((room, sid) => {
      const boss = chars.get("boss:" + sid); if (!boss) return;
      if (room.closing) { const d = iso0(room, doorLocal()); boss.tx = d.gx; boss.ty = d.gy; boss._exit = true; return; }  // 下班离场
      if (isResting(room.bossState)) { const s = breakSlots[bi % breakSlots.length]; bi++; boss.tx = s.gx; boss.ty = s.gy; }
      else { const b = iso0(room, bossLocal()); boss.tx = b.gx; boss.ty = b.gy; }
    });
    chars.forEach((ch) => {
      if (ch.kind !== "emp") return;
      const mustLeave = ch.leaving || ch.room.closing || isResting(ch.room.bossState);
      if (!mustLeave) {                                  // 在岗 → 回工位
        ch.leavePhase = null;
        const s = iso0(ch.room, seatLocal(ch.seat || 0)); ch.tx = s.gx; ch.ty = s.gy; ch._exit = false;
        return;
      }
      if (ch.room.closing) ch.leavePhase = "exiting";    // 关闭：直接走，不喝奶茶
      if (ch.leavePhase === "exiting") {                 // 喝完了/要走 → 走向门口
        const d = iso0(ch.room, doorLocal()); ch.tx = d.gx; ch.ty = d.gy; ch._exit = true;
        return;
      }
      // resting → 去茶水间喝奶茶
      if (ch.leavePhase !== "resting") {
        ch.leavePhase = "resting"; ch.restUntil = clock + REST_SECONDS;
        ch.restSlot = empRestSlots.length ? empRestSlots[(restCounter++) % empRestSlots.length] : iso0(ch.room, doorLocal());
      }
      ch.state = "idle";                                  // 显示奶茶皮肤
      ch.tx = ch.restSlot.gx; ch.ty = ch.restSlot.gy; ch._exit = false;
    });
    chars.forEach((ch) => {                               // 怪兽：在办公室中央附近游荡;离场→走门口
      if (ch.kind !== "monster") return;
      if (ch.leaving || ch.room.closing) { const d = iso0(ch.room, doorLocal()); ch.tx = d.gx; ch.ty = d.gy; ch._exit = true; return; }
      const w = iso0(ch.room, { gx: 3.6 + Math.sin(clock * 0.5 + ch.skinHash) * 1.6, gy: 4.8 + Math.cos(clock * 0.4 + ch.skinHash) * 1.1 });
      ch.tx = w.gx; ch.ty = w.gy; ch._exit = false;
    });
  }
  function step(dt) {
    chars.forEach((ch, id) => {
      // 奶茶喝够了 → 转为离场
      if (ch.kind === "emp" && ch.leavePhase === "resting" && clock >= ch.restUntil) {
        ch.leavePhase = "exiting";
        const d = iso0(ch.room, doorLocal()); ch.tx = d.gx; ch.ty = d.gy; ch._exit = true;
      }
      const dx = ch.tx - ch.gx, dy = ch.ty - ch.gy, dist = Math.hypot(dx, dy);
      if (dist > 0.04) { ch.gx += (dx / dist) * SPEED; ch.gy += (dy / dist) * SPEED; ch.flip = dx < 0; ch.moving = true; }
      else { ch.gx = ch.tx; ch.gy = ch.ty; ch.moving = false; if (ch._exit) { if (ch.kind === "boss") ch._gone = true; else chars.delete(id); } }   // 到门口：员工消失/头儿隐藏(待房间移除)
      ch.phase += dt * bobFreq(ch.state);
    });
    updateTraffic(dt);
  }
  const bobFreq = (s) => s === "writing" ? 12 : (s === "executing" || s === "working") ? 7 : s === "researching" ? 4 : s === "error" ? 18 : 2.2;

  // ---------- 楼板 / 地板 / 墙 / 窗 ----------
  function gquad(gx, gy, w, h, fill, stroke) {
    quad(pt(gx, gy), pt(gx + w, gy), pt(gx + w, gy + h), pt(gx, gy + h), fill, stroke);
  }
  function wrapGx(v) { const lo = city.gxA, hi = city.gxB, s = hi - lo; return lo + (((v - lo) % s) + s) % s; }
  // 单向车流：只从最左端进、最右端出(绝不中途刷新)；车距随负载缩短；≥80% 最前车被"红灯"挡在最右端→后车排队塞死
  let carSeq = 0;
  const JAM = 80;
  function updateTraffic(dt) {
    if (!city || !city.cap) { cars = []; return; }
    LOAD += (TARGET_LOAD - LOAD) * Math.min(1, dt * 0.6);                            // 平滑趋近目标负载(渐变,不突变)
    const gxA = city.gxA, gxB = city.gxB, jammed = LOAD >= JAM;
    // 行进速度:60%以下满速,往上渐慢；塞车时仍留中速让车能开到队尾(再被前车/红灯顶停)
    const vMax = LOAD < 60 ? 2.0 : Math.max(jammed ? 2.0 : 0.45, 2.0 * (80 - LOAD) / 20);  // 塞车时仍按常速开到队尾再被顶停(快速成队)
    const STOP = 1.35, FOLLOW = 3.0;                                                 // 更紧的排队间距,塞起来更密实
    cars.sort((a, b) => a.p - b.p);                                                   // 升序:cars[k+1] 是前车
    for (let k = cars.length - 1; k >= 0; k--) {                                      // 行进 + 跟车(不超前车安全距)
      const c = cars[k], ahead = cars[k + 1];
      const aheadP = ahead ? ahead.p : (jammed ? gxB : Infinity);                     // 塞车:最前车被最右端 gxB 顶住(红灯),其余排队
      const gap = aheadP - c.p;
      const v = gap >= FOLLOW ? vMax : vMax * Math.max(0, (gap - STOP) / (FOLLOW - STOP));
      c.p += v * dt;
    }
    if (!jammed) for (let i = cars.length - 1; i >= 0; i--) if (cars[i].p > gxB + 0.5) cars.splice(i, 1);  // 非塞车:冲出右端离场
    const frac = Math.min(1, LOAD / 85), headway = 1.5 + (1 - frac) * 6.5;            // 负载越高进车间距越小(越密)
    const nearest = cars.length ? cars[0].p : Infinity;                               // cars[0]=最左那辆
    if (LOAD >= 4 && cars.length < city.cap && nearest - gxA >= headway) {            // 仅从最左端 gxA 进车;队尾顶到入口→不再涌入
      cars.push({ id: carSeq, p: gxA, type: (carSeq % 3 === 2) ? "su7u" : "mx5" }); carSeq++;  // 每3辆来一辆 SU7U(出现率提高)
    }
  }
  const CAR_H = { mx5: 38, su7u: 42 };   // 屏上车高(px)，比例偏小巧
  // 小车：贴素材(原汁原味不改色)。素材原图车头朝右下=行驶方向，单向通车故不翻转
  function drawCar(gx, gy, car) {
    const spr = car.type === "su7u" ? CAR_SU7U : CAR_MX5;
    if (spr.complete && spr.naturalWidth) {
      const p = pt(gx, gy, 0), H = CAR_H[car.type] || 38, w = H * (spr.naturalWidth / spr.naturalHeight);
      shadow(gx, gy + 0.03, w * 0.34, w * 0.13);
      ctx.drawImage(spr, p.x - w / 2, p.y + 2 - H, w, H);
      return;
    }
    shadow(gx, gy + 0.05, 12, 5);                                                    // 回退:简易灰车
    const L = 1.2, W = 0.55;
    box(gx - L / 2, gy - W / 2, L, W, 4, 6, "#cfd6df");
    box(gx - 0.22, gy - W / 2 + 0.08, 0.5, W - 0.16, 12, 3, "#bcd6ea");
  }
  function drawGround() {
    if (!slab || !city) return;
    const c = city, midGy = (c.rGy0 + c.rGy1) / 2;
    const ctr = iso((c.x0 + c.x1) / 2, (c.y0 + c.rGy1) / 2);
    ctx.fillStyle = "rgba(30,38,60,.10)";
    ctx.beginPath(); ctx.ellipse(ctr.x, ctr.y + 28, (c.x1 - c.x0) * 30, (c.rGy1 - c.y0) * 13, 0, 0, Math.PI * 2); ctx.fill();
    gquad(c.x0 - 2, c.y0 - 2, (c.x1 - c.x0) + 4, (c.rGy1 - c.y0) + 3, "#e7ebe4", null);   // 草灰大地
    gquad(c.gxA, c.rGy0 - 0.45, c.gxB - c.gxA, 0.45, "#ccd2ce");                          // 人行道(后)
    gquad(c.gxA, c.rGy1, c.gxB - c.gxA, 0.45, "#ccd2ce");                                 // 人行道(前)
    gquad(c.gxA, c.rGy0, c.gxB - c.gxA, c.rGy1 - c.rGy0, "#484d55");                       // 沥青马路
    ctx.strokeStyle = "rgba(255,214,110,.85)"; ctx.lineWidth = 2;                          // 中线虚线
    for (let g = c.gxA + 0.4; g < c.gxB; g += 1.1) { const a = pt(g, midGy), b = pt(g + 0.55, midGy); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    box(c.x0, c.y0, c.x1 - c.x0, c.AGy + 0.6 - c.y0, -12, 9, "#dfe3ea");                   // 大楼平台(矮基座,前面给马路让出余量)
    for (let i = 0; i < 4; i++) plant(c.gxA + 1 + i * (c.gxB - c.gxA - 2) / 3, c.rGy1 + 0.25, true); // 路树
  }
  function carpet(ox, oy, fill) {
    const A = pt(ox + .35, oy + .35), B = pt(ox + ROOM_W - .35, oy + .35), C = pt(ox + ROOM_W - .35, oy + ROOM_H - .35), D = pt(ox + .35, oy + ROOM_H - .35);
    quad(A, B, C, D, fill, "rgba(120,130,150,.22)");
    // 柔光池
    const g = pt(ox + ROOM_W / 2, oy + ROOM_H / 2, 0);
    const grd = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, ROOM_W * 22);
    grd.addColorStop(0, "rgba(255,255,255,.35)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.fill();
  }
  // 仿射把地板图顶面(T/L/R)精确贴到房间地面菱形；图/meta 未就绪则回退色块
  function drawFloorTexAt(ox, oy, key, fill) {
    const img = FLOOR_IMGS[key], meta = FLOOR_META[key];
    if (!img || !img.complete || !img.naturalWidth || !meta) {
      carpet(ox, oy, key === "wood" ? "#e8cfa6" : key === "tile" ? "#f6ead0" : "#dde7f1");
      return;
    }
    const T = meta.T, L = meta.L, R = meta.R;
    const Tp = iso(ox + 0.35, oy + 0.35), Lp = iso(ox + 0.35, oy + ROOM_H - 0.35), Rp = iso(ox + ROOM_W - 0.35, oy + 0.35);
    const ux = L[0] - T[0], uy = L[1] - T[1], vx = R[0] - T[0], vy = R[1] - T[1];
    const det = ux * vy - vx * uy; if (!det) { carpet(ox, oy, fill); return; }
    const i00 = vy / det, i01 = -vx / det, i10 = -uy / det, i11 = ux / det;
    const wux = Lp.x - Tp.x, wuy = Lp.y - Tp.y, wvx = Rp.x - Tp.x, wvy = Rp.y - Tp.y;
    const a = wux * i00 + wvx * i10, c = wux * i01 + wvx * i11;
    const b = wuy * i00 + wvy * i10, d = wuy * i01 + wvy * i11;
    const e = Tp.x - (a * T[0] + c * T[1]), f = Tp.y - (b * T[0] + d * T[1]);
    ctx.save(); ctx.transform(a, b, c, d, e, f); ctx.drawImage(img, 0, 0); ctx.restore();
  }
  function wall(gx1, gy1, gx2, gy2, hpx, hex) {
    const a = pt(gx1, gy1, 0), b = pt(gx2, gy2, 0), bt = pt(gx2, gy2, hpx), at = pt(gx1, gy1, hpx);
    quad(a, b, bt, at, hex, "rgba(0,0,0,.07)");
    const a2 = pt(gx1, gy1, 0), b2 = pt(gx2, gy2, 0), bt2 = pt(gx2, gy2, 4), at2 = pt(gx1, gy1, 4);
    quad(a2, b2, bt2, at2, "rgba(0,0,0,.06)");   // 踢脚线
  }
  // 窗外天空配色：[白天上,白天下] / [夜上,夜下]
  const SKY_GRAD = {
    clear:  { day: ["#4aa3e8", "#bfe6fb"], night: ["#0e1a3a", "#28386a"] },
    partly: { day: ["#7fb4dd", "#d6e6f0"], night: ["#16203f", "#34406b"] },
    cloudy: { day: ["#9aaab8", "#d2dae0"], night: ["#1b2236", "#3a4254"] },
    fog:    { day: ["#c2c8ce", "#dde1e5"], night: ["#2a2f3a", "#454b56"] },
    rain:   { day: ["#6f7a86", "#aab4be"], night: ["#1a2230", "#39424f"] },
    storm:  { day: ["#4f5862", "#7c8690"], night: ["#10141c", "#2a3038"] },
    snow:   { day: ["#aebcca", "#e8eef4"], night: ["#222a3c", "#444c60"] },
  };
  function cloud(x, y, s, fill) {
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.arc(x, y, s * 0.6, 0, 7); ctx.arc(x + s * 0.6, y + s * 0.1, s * 0.5, 0, 7);
    ctx.arc(x - s * 0.6, y + s * 0.12, s * 0.45, 0, 7); ctx.arc(x + s * 0.1, y + s * 0.25, s * 0.55, 0, 7); ctx.fill();
  }
  function drawWeatherSky(A, B, C, D) {
    const xs = [A.x, B.x, C.x, D.x], ys = [A.y, B.y, C.y, D.y];
    const minX = Math.min.apply(0, xs), maxX = Math.max.apply(0, xs);
    const minY = Math.min.apply(0, ys), maxY = Math.max.apply(0, ys);
    const w = maxX - minX, h = maxY - minY;
    const sky = WEATHER.sky || "clear", day = WEATHER.isDay !== false;
    const pal = (SKY_GRAD[sky] || SKY_GRAD.clear)[day ? "day" : "night"];
    const g = ctx.createLinearGradient(0, minY, 0, maxY); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
    ctx.fillStyle = g; ctx.fillRect(minX - 2, minY - 2, w + 4, h + 4);
    const rng = mulberry32(hashStr("sky" + Math.round(minX) + "_" + Math.round(minY)));
    if (sky === "clear" || sky === "partly") {            // 太阳 / 月亮
      const sx = minX + w * 0.22, sy = minY + h * 0.34;
      if (day) {
        ctx.fillStyle = "rgba(255,245,200,.5)"; ctx.beginPath(); ctx.arc(sx, sy, h * 0.24, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,236,140,.97)"; ctx.beginPath(); ctx.arc(sx, sy, h * 0.15, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = "rgba(245,245,225,.95)"; ctx.beginPath(); ctx.arc(sx, sy, h * 0.15, 0, 7); ctx.fill();
        ctx.fillStyle = pal[0]; ctx.beginPath(); ctx.arc(sx + h * 0.08, sy - h * 0.05, h * 0.13, 0, 7); ctx.fill();  // 月牙
      }
    }
    if (!day && (sky === "clear" || sky === "partly")) {  // 星星
      for (let i = 0; i < 14; i++) {
        const x = minX + rng() * w, y = minY + rng() * h * 0.8;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(clock * 2 + i);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const nClouds = (sky === "cloudy" || sky === "rain" || sky === "storm") ? 3 : sky === "partly" ? 2 : sky === "clear" ? 1 : 0;
    for (let i = 0; i < nClouds; i++) {                   // 云(缓慢飘)
      const x = minX + ((rng() * w + clock * 6 * (0.5 + rng())) % (w + 40)) - 20;
      cloud(x, minY + h * (0.2 + rng() * 0.4), h * (0.16 + rng() * 0.06), day ? "rgba(255,255,255,.92)" : "rgba(200,206,220,.55)");
    }
    if (sky === "rain" || sky === "storm") {              // 斜雨丝
      ctx.strokeStyle = "rgba(190,210,235,.6)"; ctx.lineWidth = 1.4;
      for (let i = 0; i < 26; i++) {
        const x = minX + rng() * w, y = minY + ((clock * 220 + rng() * h) % (h + 12)) - 10;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 8); ctx.stroke();
      }
    }
    if (sky === "snow") {                                  // 飘雪
      ctx.fillStyle = "rgba(255,255,255,.95)";
      for (let i = 0; i < 24; i++) {
        const y = minY + ((clock * 30 + rng() * h) % (h + 8)) - 6, x = minX + rng() * w + Math.sin(clock + i) * 3;
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
      }
    }
  }
  // 长条 ribbon 窗：天空随真实天气/昼夜变化 + 白框
  function windowOn(gx1, gy1, gx2, gy2, z0, z1) {
    const wp = (u, v) => pt(gx1 + (gx2 - gx1) * u, gy1 + (gy2 - gy1) * u, z0 + (z1 - z0) * v);
    const A = wp(0, 1), B = wp(1, 1), C = wp(1, 0), D = wp(0, 0);
    ctx.save();                                            // 裁到玻璃内画天气天空
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.clip();
    drawWeatherSky(A, B, C, D);
    ctx.restore();
    const vbar = (u, t) => quad(wp(u - t, 1), wp(u + t, 1), wp(u + t, 0), wp(u - t, 0), "#fbfbf8", "rgba(0,0,0,.1)");
    const hbar = (v, t) => quad(wp(0, v - t), wp(1, v - t), wp(1, v + t), wp(0, v + t), "#fbfbf8", "rgba(0,0,0,.1)");
    hbar(1, 0.05); hbar(0, 0.05); hbar(0.5, 0.03);
    vbar(0, 0.012); vbar(1, 0.012);
    vbar(0.25, 0.006); vbar(0.5, 0.006); vbar(0.75, 0.006);
  }
  function posterOn(gx1, gy1, gx2, gy2, z0, z1, color) {
    const a = pt(gx1, gy1, z0), b = pt(gx2, gy2, z0), c = pt(gx2, gy2, z1), d = pt(gx1, gy1, z1);
    quad(a, b, c, d, mix(color, 0.4), color);
  }
  // 把正视平面图(窗/海报)斜投影贴到墙面：墙沿 gx1..gx2(gy=gyWall), 高度 z0..z1
  function drawWallImg(img, gx1, gx2, gyWall, z0, z1) {
    const TL = pt(gx1, gyWall, z1), TR = pt(gx2, gyWall, z1), BL = pt(gx1, gyWall, z0);
    const w = img.naturalWidth, h = img.naturalHeight;
    ctx.save();
    ctx.transform((TR.x - TL.x) / w, (TR.y - TL.y) / w, (BL.x - TL.x) / h, (BL.y - TL.y) / h, TL.x, TL.y);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  // 左墙(gx 恒定,沿 gy)斜投影贴图；图左缘锚在 gyFront(靠前)→ 不镜像(同 drawSign 的朝向修正)
  function drawWallImgLeft(img, gx, gyFront, gyBack, z0, z1) {
    const TL = pt(gx, gyFront, z1), TR = pt(gx, gyBack, z1), BL = pt(gx, gyFront, z0);
    const w = img.naturalWidth, h = img.naturalHeight;
    ctx.save();
    ctx.transform((TR.x - TL.x) / w, (TR.y - TL.y) / w, (BL.x - TL.x) / h, (BL.y - TL.y) / h, TL.x, TL.y);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  // 左墙加框海报：先画深色相框,再贴图(图未就绪→回退纯色块,绝不开天窗)
  function wallPoster(img, fallback, gx, gyMid, gyExtent, z0, z1) {
    const gyF = gyMid + gyExtent / 2, gyB = gyMid - gyExtent / 2;
    posterOn(gx, gyB - 0.1, gx, gyF + 0.1, z0 - 2.5, z1 + 2.5, "#15181f");          // 相框边
    if (img && img.complete && img.naturalWidth) drawWallImgLeft(img, gx, gyF, gyB, z0, z1);
    else posterOn(gx, gyB, gx, gyF, z0, z1, fallback);
  }
  function drawRoomFloor(room) {
    const ox = room.gx, oy = room.gy, acc = room.accent;
    drawFloorTexAt(ox, oy, room.floorTex || "carpet", mix(acc, 0.9));        // 先铺地板贴图(相邻不同)
    wall(ox + .35, oy + .35, ox + ROOM_W - .35, oy + .35, 50, "#eef0f4");   // 右后墙(加高)
    wall(ox + .35, oy + ROOM_H - .35, ox + .35, oy + .35, 50, "#e6e9ef");   // 左后墙(加高)
    if (WIN_IMG.complete && WIN_IMG.naturalWidth) drawWallImg(WIN_IMG, ox + 1.5, ox + 6.1, oy + 0.35, 12, 44);  // 长条窗素材
    else windowOn(ox + 1.5, oy + 0.35, ox + 6.1, oy + 0.35, 12, 44);        // 程序化长条 ribbon 窗
    leftWallDecor(room);                                                     // 左墙随机挂件
    if (room.closing) {                                                      // 关闭中：关灯变暗
      const A = pt(ox + .35, oy + .35), B = pt(ox + ROOM_W - .35, oy + .35), C = pt(ox + ROOM_W - .35, oy + ROOM_H - .35), D = pt(ox + .35, oy + ROOM_H - .35);
      quad(A, B, C, D, "rgba(18,22,38,.42)", null);
    }
  }
  function drawBreakFloor() {
    if (!breakRoom) return;
    const ox = breakRoom.gx, oy = breakRoom.gy;
    drawFloorTexAt(ox, oy, "tile", "#fbf2e0");
    wall(ox + .35, oy + .35, ox + ROOM_W - .35, oy + .35, 50, "#f3e7cf");
    wall(ox + .35, oy + ROOM_H - .35, ox + .35, oy + .35, 50, "#efe0c4");
    posterOn(ox + .35, oy + 3.6, ox + .35, oy + 5.6, 16, 30, "#caa05a");
  }
  // 单个服务器机柜(程序化):黑机柜 + 三道发光灯带(绿/红)
  function serverRack(gx, gy, ok) {
    const led = ok ? "#36d178" : "#ff5347";
    box(gx - 0.45, gy - 0.45, 0.9, 0.9, 0, 36, "#262b34");
    box(gx - 0.45, gy - 0.45, 0.9, 0.9, 36, 39, ok ? "#1f6e44" : "#7a2a26");      // 顶
    ctx.save(); ctx.strokeStyle = led; ctx.lineWidth = 2.5; ctx.shadowColor = led; ctx.shadowBlur = 6;
    for (let i = 0; i < 3; i++) { const z = 9 + i * 9, a = pt(gx - 0.45, gy + 0.45, z), b = pt(gx + 0.45, gy + 0.45, z); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.restore();
    const tp = pt(gx, gy, 41); ctx.fillStyle = led; ctx.beginPath(); ctx.arc(tp.x, tp.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  function drawDgxFloor() {
    if (!dgxRoom) return;
    const ox = dgxRoom.gx, oy = dgxRoom.gy, ok = NET.ok === true, down = NET.ok === false;
    drawFloorTexAt(ox, oy, "tile", "#d7deea");                                    // 机房地板(暂用 tile)
    wall(ox + .35, oy + .35, ox + ROOM_W - .35, oy + .35, 50, "#cdd4df");
    wall(ox + .35, oy + ROOM_H - .35, ox + .35, oy + .35, 50, "#c3cbd7");
    // 地面状态光晕(红/绿)
    const g = pt(ox + 4.0, oy + 4.4, 0), grd = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, 150);
    grd.addColorStop(0, down ? "rgba(255,83,71,.22)" : ok ? "rgba(54,209,120,.20)" : "rgba(150,160,175,.14)");
    grd.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, 150, 75, 0, 0, Math.PI * 2); ctx.fill();
    const img = ok ? DGX_IMG.green : DGX_IMG.red;                                 // 有素材→贴集群图(脚底居中),否则程序化机柜
    if (down || ok ? (img.complete && img.naturalWidth) : false) {
      const c = pt(ox + 4.0, oy + 4.8, 0), H = 132, w = H * (img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, c.x - w / 2, c.y + 4 - H, w, H);
    } else {
      [[2.7, 4.2], [4.0, 4.2], [5.3, 4.2]].forEach(([rx, ry]) => serverRack(ox + rx, oy + ry, !down));
    }
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 部门牌：斜投影贴在「左墙上方」，与墙/地板素材同一个 iso 斜角（文字也随之倾斜，融进场景）
  function drawSign(ox, oy, text, sub, accent) {
    const gx = ox + 0.35;                         // 左墙所在 gx
    const gyFront = oy + 5.2, gyBack = oy + 0.7;  // 起点放前端→局部+x朝右上(不镜像)
    const zB = 52, zT = 76;                       // 墙顶(50)之上的牌带
    const TL = pt(gx, gyFront, zT), TR = pt(gx, gyBack, zT), BL = pt(gx, gyFront, zB);
    const Ux = TR.x - TL.x, Uy = TR.y - TL.y, Vx = BL.x - TL.x, Vy = BL.y - TL.y;
    const LW = Math.hypot(Ux, Uy), LH = Math.hypot(Vx, Vy);
    ctx.save();
    ctx.transform(Ux / LW, Uy / LW, Vx / LH, Vy / LH, TL.x, TL.y);   // local(0..LW,0..LH) → 左墙平面
    // 牌底板
    ctx.save(); ctx.shadowColor = "rgba(30,40,60,.18)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    rrect(0, 0, LW, LH, 5); ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fill(); ctx.restore();
    rrect(0, 0, LW, LH, 5); ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = accent || "#9aa3b2"; ctx.beginPath(); ctx.arc(11, LH / 2, 4, 0, Math.PI * 2); ctx.fill();
    // 文字(缩放适应牌宽)
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = "600 13px -apple-system,system-ui,sans-serif";
    const tw = ctx.measureText(text).width;
    const sw = sub ? ctx.measureText(sub).width + 8 : 0;
    const avail = LW - 26, need = tw + sw, sc = need > avail ? avail / need : 1;
    ctx.translate(19, LH / 2); ctx.scale(sc, sc); ctx.translate(0, 0);
    ctx.fillStyle = "#2b3344"; ctx.fillText(text, 0, 0);
    if (sub) { ctx.fillStyle = accent; ctx.font = "600 12px -apple-system,system-ui,sans-serif"; ctx.fillText(sub, ctx.measureText(text).width + 8, 0); }
    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  function charMotion(state, ph, moving) {
    const s = Math.sin(ph);
    if (moving) return { ox: 0, oy: -Math.abs(s) * 4, rot: s * 0.04, sx: 1, sy: 1 };
    switch (state) {
      case "writing": return { ox: 0, oy: -Math.abs(s) * 2, rot: s * 0.05, sx: 1 + 0.02 * s, sy: 1 - 0.02 * s };
      case "executing": case "working": return { ox: 0, oy: -Math.abs(s) * 3, rot: 0, sx: 1 + 0.05 * s, sy: 1 - 0.05 * s };
      case "researching": return { ox: s * 4, oy: 0, rot: s * 0.05, sx: 1, sy: 1 };
      case "waiting": return { ox: 0, oy: -Math.abs(s) * 6, rot: Math.sin(ph * 2) * 0.07, sx: 1, sy: 1 };
      case "error": return { ox: Math.sin(ph * 4) * 3, oy: 0, rot: Math.sin(ph * 4) * 0.05, sx: 1, sy: 1 };
      case "thinking": return { ox: 0, oy: -s * 1.5, rot: s * 0.06, sx: 1, sy: 1 };
      case "delegating": return { ox: 0, oy: -Math.abs(s) * 4, rot: 0, sx: 1, sy: 1 };
      case "sleeping": return { ox: 0, oy: s, rot: -0.13, sx: 1, sy: 1 };
      default: return { ox: 0, oy: -s * 2, rot: 0, sx: 1 + 0.03 * s, sy: 1 - 0.03 * s };
    }
  }
  // 程序化怪兽占位(独眼+角+利齿,按 hash 取色);有素材时走 drawMonster 的贴图分支
  function procMonster(hash) {
    const cols = ["#6b8e3a", "#7a4ea0", "#b5573a", "#3a7a8e"], col = cols[hash % cols.length], H = 86;
    ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 2;
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -H * 0.42, 24, H * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(col, 0.7);                                              // 双角
    ctx.beginPath(); ctx.moveTo(-14, -H * 0.78); ctx.lineTo(-21, -H * 1.0); ctx.lineTo(-5, -H * 0.82); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, -H * 0.78); ctx.lineTo(21, -H * 1.0); ctx.lineTo(5, -H * 0.82); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -H * 0.5, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();  // 大独眼
    ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(2, -H * 0.47, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 8 - 3, -H * 0.2); ctx.lineTo(i * 8, -H * 0.1); ctx.lineTo(i * 8 + 3, -H * 0.2); ctx.closePath(); ctx.fill(); }
  }
  function drawMonster(ch) {
    const p = iso(ch.gx, ch.gy), mi = MONSTER_IMGS.length ? MONSTER_IMGS[ch.skinHash % MONSTER_IMGS.length] : null;
    const m = charMotion("error", ch.phase, ch.moving);                          // 借 error 体态(抖动)
    ctx.fillStyle = "rgba(40,46,70,.18)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(p.x + m.ox, p.y + m.oy); ctx.rotate(m.rot);
    if (mi && mi.complete && mi.naturalWidth) { const H = 96, w = H * (mi.naturalWidth / mi.naturalHeight); ctx.scale(ch.flip ? -1 : 1, 1); ctx.drawImage(mi, -w / 2, -H + 6, w, H); }
    else procMonster(ch.skinHash);
    ctx.restore();
    ctx.font = "14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("💢", p.x, p.y + m.oy - 98);
  }
  function drawCharacter(ch) {
    if (ch._gone) return;
    if (ch.kind === "monster") { drawMonster(ch); return; }
    const p = iso(ch.gx, ch.gy);
    const sheet = frameSheets[ch.state];
    const img = skinFor(ch);
    const baseH = ch.kind === "boss" ? 116 : 92;
    let ar = 0.62;                                   // 按图片真实比例画(boss/员工尺寸不同)
    if (sheet && sheet.ready) ar = sheet.frameW / sheet.frameH;
    else if (img && img.naturalHeight) ar = img.naturalWidth / img.naturalHeight;
    const h = baseH, w = baseH * ar;
    ctx.fillStyle = "rgba(40,46,70,.16)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, Math.max(14, w * 0.42), Math.max(6, w * 0.18), 0, 0, Math.PI * 2); ctx.fill();
    const m = charMotion(ch.state, ch.phase, ch.moving);
    ctx.save(); ctx.translate(p.x + m.ox, p.y + m.oy); ctx.rotate(m.rot); ctx.scale((ch.flip ? -1 : 1) * m.sx, m.sy);
    if (sheet && sheet.ready) { const fi = Math.floor(clock * FRAME_FPS) % sheet.frames; ctx.drawImage(sheet.img, fi * sheet.frameW, 0, sheet.frameW, sheet.frameH, -w / 2, -h + 6, w, h); }
    else if (img) ctx.drawImage(img, -w / 2, -h + 6, w, h);
    else { ctx.fillStyle = "#6cb0e6"; ctx.beginPath(); ctx.arc(0, -h * .5, w * .4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    const topY = p.y + m.oy - h + 2;
    ctx.font = (ch.kind === "boss" ? "15px" : "12px") + " -apple-system,system-ui,sans-serif"; ctx.textAlign = "center";
    ctx.fillText(sm(ch.state).emoji, p.x, topY);
    if (ch.kind === "boss") { ctx.font = "11px sans-serif"; ctx.fillText("👑", p.x + w * .42, topY + 8); }
  }

  function render() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.save(); ctx.translate(camera.ox, camera.oy); ctx.scale(camera.scale, camera.scale);
    drawGround();
    const roomList = displayRooms.slice().sort((a, b) => depth(a.gx, a.gy) - depth(b.gx, b.gy));
    roomList.forEach(drawRoomFloor); drawBreakFloor(); drawDgxFloor();
    const items = furniture.slice();
    const live = [...chars.values()].filter((ch) => !ch._gone);
    const cpos = live.map((ch) => [ch.gx, ch.gy]);
    cars.forEach((car) => {                                                       // 单向车道,位置由 updateTraffic 维护;gy 实时取当前路面
      const gy = city.lane;
      items.push({ d: depth(car.p, gy) + 0.04, f: () => drawCar(car.p, gy, car) });
    });
    items.sort((a, b) => a.d - b.d);
    const R0 = 0.85, R1 = 1.7;            // 装饰品靠近角色就淡出，规避穿模
    items.forEach((it) => {
      if (!it.deco) { it.f(); return; }
      let dmin = Infinity;
      for (let i = 0; i < cpos.length; i++) { const dd = Math.hypot(cpos[i][0] - it.gx, cpos[i][1] - it.gy); if (dd < dmin) dmin = dd; }
      const a = dmin >= R1 ? 1 : dmin <= R0 ? 0 : (dmin - R0) / (R1 - R0);
      if (a <= 0.02) return;
      ctx.globalAlpha = a; it.f(); ctx.globalAlpha = 1;
    });
    // 角色永远画在家具/电脑桌之上(不被盖住)；角色彼此按深度排序
    live.sort((a, b) => depth(a.gx, a.gy) - depth(b.gx, b.gy)).forEach(drawCharacter);
    roomList.forEach((r) => drawSign(r.gx, r.gy, r.label || "office", sm(r.bossState).emoji + " " + sm(r.bossState).zh, sm(r.bossState).c));
    if (breakRoom) drawSign(breakRoom.gx, breakRoom.gy, "☕ 茶水间", "", "#caa05a");
    if (dgxRoom) drawSign(dgxRoom.gx, dgxRoom.gy, "🖥 DGX·B300", NET.ok === false ? "⛔ 离线" : NET.ok === true ? "🟢 在线" : "… 检测中", NET.ok === false ? "#ff5347" : "#36d178");
    ctx.restore();
  }

  let last = 0;
  function loop(t) { const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t; clock += dt; step(dt); render(); requestAnimationFrame(loop); }
  function resize() { const dpr = window.devicePixelRatio || 1; canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; fitCamera(); }
  window.addEventListener("resize", resize);

  async function tick() {
    try {
      const r = await fetch("/cc/rooms?t=" + Date.now(), { cache: "no-store" });
      const data = await r.json();
      conn.dataset.ok = "true"; conn.querySelector(".conn-text").textContent = "已连接";
      if (typeof data.load === "number") TARGET_LOAD = data.load;                  // 全楼上下文占用% → 门口车流密度
      if (data.net && typeof data.net === "object") NET = data.net;                 // 监控网址连通 → DGX 机房红绿
      sync(Array.isArray(data.rooms) ? data.rooms : []); fitCamera();
      const emps = [...chars.values()].filter((c) => c.kind === "emp" && !c.leaving).length;
      countEl.textContent = rooms.size ? `${rooms.size} 间办公室 · ${emps} 名员工在岗` : "暂无活跃会话 · 打开一个 Claude Code 会话试试";
    } catch (e) { conn.dataset.ok = "false"; conn.querySelector(".conn-text").textContent = "后端未连接"; }
  }
  (function legend() {
    const box = document.getElementById("legend"); if (!box) return;
    box.innerHTML = ["thinking", "researching", "writing", "executing", "delegating", "waiting", "idle", "error"]
      .map((s) => `<span class="item"><span class="swatch" style="background:${sm(s).c}"></span>${sm(s).zh}</span>`).join("");
  })();

  const _ld = new URLSearchParams(location.search).get("load");                   // 调试: /office?load=82 直接定车流负载(LOAD 仍从0渐变,车从左端依次进)
  if (_ld !== null && !isNaN(parseFloat(_ld))) { TARGET_LOAD = Math.max(0, Math.min(100, parseFloat(_ld))); }
  resize(); loadFrames(); loadSkins(); loadWeather(); relayout(); tick();
  setInterval(tick, POLL_MS); setInterval(loadWeather, 300000); requestAnimationFrame(loop);
})();

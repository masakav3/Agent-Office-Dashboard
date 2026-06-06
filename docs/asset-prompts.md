# claude-office · iso 办公素材生成提示词

> 目标：把 `/office` 里代码画的方块家具，换成 AI 生成的**高清等距素材**。
> 一堆素材要能拼在一起不违和，**4 条铁律**：统一 iso 角度 · 统一画风 · 透明背景 · 统一光向。
> 出好命名丢进 `frontend/assets/` 发我，我做成家具 sprite 管线替换代码方块（类似 `char-frames.json`）。

---

## 0. 一致性怎么保证（先读）

1. **统一风格锚**：先把 `frontend/char-hero.png`（你的英雄）当 **style reference** 喂给模型，让家具和角色同款"厚描边平涂"风。
2. **角度一字不差**：每条提示词都带同一句 iso 角度描述（见 §1），别让某件变成透视/正视。
3. **透明背景 + 不要自带影子**：`/office` 会自己加接触影；素材带影会重影。
4. **固定光向**：统一"光从左上来"。固定 seed 更稳。
5. **批量出**：一次让模型出多件（如 4 件一图）比单出更易保持同款；满意后再切开。
6. **统一画布**：都用 1024×1024 居中出，导入时我按网格缩放。

---

## 1. 通用风格前缀（每条都拼在最前）

```
cute isometric office asset, true 2:1 isometric view, 45-degree top-down angle, orthographic projection,
flat bright saturated colors, bold clean black outline, soft cel shading, cohesive palette,
matching a chibi sticker mascot office game, light coming from top-left,
single object centered, isolated on transparent background, no ground shadow, crisp high detail
--no perspective distortion, vanishing point, blur, text, watermark, realistic photo, harsh shadows
```

下面每件 = `通用前缀` + `下面这句主体`。

---

## 2. 背景类（地面 / 墙）—— 特殊：可平铺

> 这几样不要透明，是铺满的底；地板做成**单块菱形 tile**（可无缝平铺），墙做成**一段墙片**。

| 件 | 主体提示词 |
|---|---|
| 地板·办公地毯 | `a single seamless isometric floor tile, rhombus diamond shape, soft grey-blue office carpet with subtle weave texture, edges tileable, flat even lighting` |
| 地板·浅木地板 | `a single isometric floor tile, 2:1 rhombus diamond with thin 3D side edge, light warm wood floor of MANY THIN narrow planks (12-16 slim floorboards across), fine delicate wood grain, tight subtle seams, small-scale planking, true isometric orthographic 45°, no perspective --no wide planks, few boards`  ⚠️一块砖铺满整间房，所以木条必须**多而细**(12-16条)，否则一根木板比人还宽 |
| 地板·茶水间瓷砖 | `a single seamless isometric floor tile, rhombus diamond, warm cream checkerboard tiles, edges tileable` |
| 墙面·一段矮墙 | `a short isometric office wall segment, light warm beige flat wall with a thin white baseboard, half-height partition, clean` |
| （可选）整间空房 | `an empty isometric office room shell, soft carpet floor plus two back walls (left and right), light beige walls, cozy, nothing inside, room interior` |

---

## 3. 墙面挂件（窗 / 海报 / 白板）

> 省事做法：**正视的平面矩形**就行（别强求贴在斜墙上），我在代码里把它投影到墙面斜度。所以这几样用"front view flat panel"。

| 件 | 主体提示词 |
|---|---|
| 墙面窗户 | `front view flat panel, a large office window with white frame and cross mullions, bright blue sky with soft clouds and sunlight outside, cheerful` |
| 海报 | `front view flat panel, a colorful framed motivational office poster, simple bold abstract shapes, thin wood frame` |
| 白板 | `front view flat panel, an office whiteboard with thin aluminum frame, a few colorful marker scribbles, arrows and sticky notes` |

---

## 4. 家具 / 摆件（透明背景单件）

| 件 | 主体提示词 | 相对尺寸 |
|---|---|---|
| 电脑桌 → **平视版见 §11** | ⚠️ 桌子别再用 iso/斜 3/4（贴到俯视场景里很怪）。当 billboard 立在地面的桌子，用**平视正面**角度，见下方 §11。 | 宽 ~2 tile |
| 文件柜 | `an isometric office filing cabinet, three drawers, metal grey-blue body, simple handles` | 小，高 ~0.6 tile |
| 白板（落地支架版） | `an isometric standing whiteboard on wheels, white board with aluminum frame and a marker tray, colorful scribbles` | 中 |
| 落地灯 | `an isometric modern floor lamp, slim brushed-metal pole with a warm glowing fabric lampshade on top, round base` | 高，瘦 |
| 桌面电话 | `an isometric office desk phone, classic business telephone with handset on a cradle and a number keypad, dark grey, small` | 很小 |
| 桌搭摆件 | `an isometric cute desk decoration cluster, a coffee mug, a small stack of sticky notes, a pen holder with pens, a tiny succulent, neatly grouped` | 很小 |
| 高达模型摆件 | `an isometric cute original mecha robot model figure (gundam-style, NOT a real branded character), white blue and red armor, heroic standing pose on a small round display base, collectible toy` | 小，高 ~0.7 tile |
| 小盆栽 | `an isometric small potted succulent, cute round green plant in a little ceramic pot, desk size` | 很小 |
| 绿植（大） | `an isometric tall leafy potted plant, monstera leaves in a woven basket pot, office corner size` | 高，中宽 |

> 高达模型：**做成原创 mecha 造型**（别复刻品牌角色），规避版权。其余同理：风格照搬、造型原创。

---

## 5. 接进 `/office` 的约定（我来做）

- 透明 PNG，命名：`asset-floor-carpet.png` / `asset-wall.png` / `asset-window.png` / `asset-poster.png` /
  `asset-whiteboard.png` / `asset-desk.png` / `asset-computer-desk.png` / `asset-monitors.png` /
  `asset-cabinet.png` / `asset-lamp.png` / `asset-phone.png` / `asset-trinkets.png` /
  `asset-gundam.png` / `asset-plant-small.png` / `asset-plant-big.png`
- 丢进 `frontend/assets/`（没有就建）。出几件发几件，我逐个把代码方块替换成 `drawImage` 贴图，按 iso 脚底锚点对齐。
- 我会建一个 `assets-manifest.json`（每件记 anchor/scale），和 `char-frames.json` 一个套路。
- 墙面 3 件（窗/海报/白板）给正视平面图即可，我在代码里做墙面斜投影。

---

## 6. 建议出图顺序（出一件我接一件、立刻能看）

1. 地板·办公地毯（先把"地"换了，最显质感）
2. 办公桌 + 电脑桌 + 联排显示器（工位三件套）
3. 椅子（补一条：`an isometric ergonomic office chair, dark fabric seat and mesh back, five-star wheel base`）
4. 绿植大 + 小盆栽 + 落地灯（角落）
5. 文件柜 / 白板 / 桌面电话 / 桌搭摆件 / 高达模型（点缀）
6. 墙面窗 / 海报（墙）

---

## 7. `frontend/assets/assets-manifest.json` 格式（接入用）

素材放 `frontend/assets/`，由 `assets-manifest.json` 描述每件怎么摆。`/office` 读它来贴图；
某件 `ready:false` 或文件缺失 → 自动回退到当前代码画的方块（平滑过渡，不会开天窗）。

```json
{
  "tile": { "w": 64, "h": 32 },
  "assets": {
    "floor-carpet": { "file": "asset-floor-carpet.png", "type": "floor",     "ready": false },
    "wall":         { "file": "asset-wall.png",         "type": "wall",      "ready": false },
    "window":       { "file": "asset-window.png",       "type": "wallmount", "ready": false },
    "desk":         { "file": "asset-desk.png",         "type": "prop", "anchorX": 0.5, "anchorY": 0.88, "wTiles": 2.0, "ready": false },
    "gundam":       { "file": "asset-gundam.png",       "type": "prop", "anchorX": 0.5, "anchorY": 0.92, "wTiles": 0.6, "ready": false }
  }
}
```

字段说明：
- `tile`：iso 基准瓦片像素（与代码一致，64×32）。
- `type`：`floor`(地板平铺) / `wall`(墙片) / `wallmount`(贴墙挂件，窗/海报/白板，代码做斜投影) / `prop`(落地家具)。
- `anchorX`/`anchorY`：图中"贴地中心点"的相对位置（0~1）。`prop` 一般脚底居中 → `0.5 / 0.88`，矮物更小、高物更大。
- `wTiles`：占地宽度（tile 数），用于把图缩放到正确大小。
- `ready`：`true` 才启用该素材；缺这件就回退方块。

完整 key 列表见 §5 命名约定。出一件就把对应 `ready` 改 `true`（或直接发我，我改）。

---

## 8. 素材后处理（接入前必做）

AI 出的图常带背景 + 毛刺，且地板那种"预渲染 iso 斜面砖"需要精确对齐。处理三步（脚本用项目 venv 跑 PIL）：

### 8.1 去底
- 优先**手动抠**（macOS 一键抠图 / PS）；或脚本 `ImageDraw.floodfill` 从四角按阈值去纯色底（灰/白渐变底阈值要够大，~140，否则贴边留一圈残影，会污染尺寸计算）。

### 8.2 羽化去毛刺
一键抠图边缘有锯齿/半透明杂边。对 alpha：**硬化(>128→0/255) → `MinFilter(3)` 收边 1px → `GaussianBlur(1.3)`**，边缘即平滑。

### 8.3 地板：顶面锚点 + 仿射对齐（关键）
地板素材是带 3D 厚度的斜面砖，**包围盒 ≠ 顶面菱形**，直接缩放会和按网格摆的桌椅错位。做法：
- 脚本扫 alpha，算出**顶面三锚点**：`T`(顶/最上)、`L`(左/最左)、`R`(右/最右)，写入 `frontend/assets/floor-meta.json`：
  ```json
  { "carpet": { "w":883, "h":450, "T":[440,0], "L":[0,219], "R":[882,218] }, "wood": {…}, "tile": {…} }
  ```
- 前端 `drawFloorTexAt()` 用**仿射变换**把图片的 (T,L,R) 映射到房间地面菱形的 (后顶, 左, 右) 三角 → 顶面 = 网格地面，桌椅/角色按坐标必然贴合，3D 侧边自然落在前缘下方。
- 相邻房间地板按棋盘格 `(col+row)%2` 取 carpet/wood，茶水间用 tile（见 `office.js` relayout）。

### 8.4 命名 / 位置 / 缓存
- 地板：`frontend/assets/floor-{carpet,wood,tile}.png` + `floor-meta.json`。
- 角色皮肤：`frontend/char-*.png` + `frontend/char-skins.json`（按状态 default/idle 分组，见 RUNBOOK §十二）。
- 墙/家具：`frontend/assets/asset-*.png` + `assets-manifest.json`（§7）。
- **缓存**：静态资源是 `no-cache`（ETag 复查），换素材后**普通刷新即生效，无需强刷、无需重启后端**（仅改 `*.py` 才重启）。

---

## 9. DGX B300 服务器集群（连通状态房，红/绿两态）

> 用途：一间专门的"机房"，显示某网址（默认 `google.com`）的连通情况——**通=绿、不通=红**。
> 出**两张**：绿态、红态，**几何/角度/尺寸必须完全一致**，只换灯色，才能干净切换。
> 背景：机柜是黑色，**别用黑底**（黑底抠不出黑机柜）→ 用**透明底**最佳，或浅灰平涂底；务必带**粗描边**便于抠图。

通用前缀（接 §1 的 iso 角度那段）+ 下面主体：

**绿态（在线/连通）**
```
isometric NVIDIA DGX B300-style AI GPU server cluster: a row of 3 tall sleek black data-center server racks,
glossy dark cabinets with glass front panels, many stacked horizontal GPU server blades,
tidy rows of glowing GREEN status LEDs and green edge light-strips, neat cable bundles,
a small green "ONLINE" indicator panel on top, cool futuristic high-tech, healthy operational mood,
bold clean outline, soft cel shading, isolated on transparent background, no ground shadow
```

**红态（离线/不通）—— 与绿态同形同角同尺寸，只换灯色**
```
the SAME 3-rack DGX B300 server cluster, IDENTICAL shape / angle / size / composition as the green version,
but ALL status LEDs and edge light-strips glowing alarm RED, a red "ALERT / OFFLINE" indicator panel on top,
faint red glow, tense down/alert mood; keep rack geometry pixel-aligned to the green version for clean swapping,
bold clean outline, soft cel shading, isolated on transparent background, no ground shadow
```

- 命名：`frontend/assets/dgx-green.png` / `dgx-red.png`。出图发我，我接成机房里的集群（默认看 `google.com`，可改监控网址）。
- 没图时我先用**程序化机柜**占位（一样会红绿切换），有图直接替换。

---

## 10. 怪兽（出错时刷进对应办公室，随机样式）

> 用途：某 session 的 hook 反馈 **error/出错** 时，在它的办公室里**刷出一只怪兽**（随机一只），错误解除后离场。
> 风格：同 `char-hero` 的 **Q 版贴纸**（粗描边、平涂亮色、3/4 朝镜头、约和角色同高、可爱又有点凶）。
> 背景：**纯黑底**（好抠，同小车管线）或透明；不要自带影子。
> ⚠️ 芝顿(Zetton)/巴尔坦星人(Baltan) 是圆谷版权怪兽 —— 按**"致敬原创"**画（抓神似、别照搬），内部/展示 OK，公开/商用要纯原创。

一图一只，多出几只我做成随机池（`char-monster-*.png` + `monsters.json`）：

**① 宇宙恐龙·芝顿味（原创）**
```
original chibi kaiju, "space dinosaur" vibe: stocky bipedal beetle-dinosaur, glossy jet-black carapace
with bright orange zig-zag stripe markings, one big round glowing orange eye ringed with light on its face,
short clawed arms, sturdy legs, segmented shell, cute-but-menacing, bold outline, flat colors, on black background
```

**② 巴尔坦星人味（原创）**
```
original chibi alien kaiju: humanoid insect-alien with a huge pair of scissor / pincer claws instead of hands,
bulging round compound eyes, ridged segmented head, pale grey-green chitin body, mischievous cackling grin,
bold outline, flat colors, on black background
```

**③④ 凑随机池（再来两只原创）**
```
a cute one-eyed gooey blob monster, drippy slime body, one big single eye, tiny feet, bold outline, flat colors, on black background
```
```
a small grumpy horned reptilian kaiju, spiky back ridge, stubby arms, big jaw, bold outline, flat colors, on black background
```

- 命名：`frontend/char-monster-1.png` … 发几只我配几只；我建 `frontend/monsters.json` 做随机调用。
- 没图时先用**程序化小怪兽**（独眼色块）占位，有图替换。

---

## 11. 电脑桌（平视 / 正面角度，替代 §4 的 iso 桌）

> 桌子是当 **billboard 立在地面**的，之前用 iso 斜 3/4 贴到俯视场景里"斜视很难受"。
> 改成 **平视正面**：相机与桌面齐平、正对屏幕水平看过去 —— **不要 isometric、不要俯视、不要斜 3/4**。
> 这样桌子像一个干净的正面"立牌"，屏幕正对镜头、桌面物件露在上沿，立在地面不违和。

**通用平视前缀**（每条都拼最前）：
```
cute office desk asset, FLAT FRONT VIEW at eye level, straight-on orthographic front elevation,
camera level with the desktop looking horizontally at the monitor, screen facing the viewer, keyboard and items in front,
NOT isometric, NO top-down, NO oblique / three-quarter angle, no perspective vanishing,
flat bright colors, bold clean black outline, soft cel shading, light from top,
single desk centered, isolated on transparent background (or pure black), no ground shadow, crisp
```

| 件 | 主体（接前缀后） | 命名 |
|---|---|---|
| 头儿·三联屏桌 | `a wide white desk seen from the front, THREE widescreen monitors in a row all facing the viewer with glowing blue screens, a keyboard and mouse in front, slim legs` | `asset-desk-triple.png` |
| 员工·咖啡桌 | `a white desk seen from the front, one monitor facing the viewer (glowing blue screen), keyboard, mouse and a small coffee mug, tidy` | `asset-desk-coffee.png` |
| 员工·奶茶桌 | `a white desk seen from the front, one monitor facing the viewer (glowing blue screen), keyboard, mouse, a cup of bubble milk tea and a tiny succulent + cute cat figurine, cozy` | `asset-desk-milktea.png` |

负向：`--no isometric, top-down, three-quarter, oblique, perspective distortion, tilt, text, watermark, brand logo, harsh shadow, background`

- 出图发我，我直接替换 `frontend/assets/asset-desk-{triple,coffee,milktea}.png`（黑底走紧致黑键，透明底直接用），脚底居中贴地。
- 三张**最好同一视角/同一桌型**，只换桌面物件，三种桌子摆在一起才统一。

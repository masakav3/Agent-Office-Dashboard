# claude-office · 现代角色素材流程（Phase 3）

> 目标：把 `/office` 看板里的占位角色，换成你要的**现代、清晰、明亮、锐利**的角色序列帧，~15FPS 流畅循环。
> 你负责出图（Midjourney / SD / 你顺手的工具），本文给你**统一提示词套件 + 切片流程 + 接入方法**。
> 先打开 **http://127.0.0.1:19000/static/concepts.html** 选定角色方向，再按本文出帧。

---

## 0. 一句话原理（前端不懂也能跟）

序列帧动画 = 把"一个动作循环"画成 N 张连续小图，排成**一横排**拼成一张图（sprite sheet），
网页用 CSS 让它"每隔 1/15 秒露出下一格"，就动起来了。**风格随你画的图，和技术无关**——
画现代清晰的图，出来就是现代清晰的动画。

---

## 1. 全局约束（每一帧都必须守）

为了多状态、多角色拼在一起不违和，所有帧遵守同一套规格：

| 项 | 规格 | 原因 |
|---|---|---|
| 视角 | 正面 / 微俯，角色"坐在桌前"半身 | 和办公室工位构图一致 |
| 画布 | 正方形，建议 **512×512**（@2x 出 1024 更锐） | 统一切片尺寸 |
| 背景 | **纯透明**（PNG/WebP alpha） | 叠在看板桌面上 |
| 构图 | 角色居中，四周留 ~12% 边距，每帧角色位置/大小**不漂移** | 逐帧播放不抖 |
| 光照 | 柔和顶光，同一方向 | 多状态拼一起统一 |
| 风格 | **Q 版贴纸英雄**：厚黑描边 + 平涂亮色 + 大头萌身；明亮锐利、**非像素** | 已定方向，参考 `docs/refs/style-ref-chibi-hero.png` |
| 调色 | 固定主色板（见你选的概念） | 角色一致性 |

> 一致性关键：**先定一张"角色设定图"**（character sheet：正面+配色+服装），
> 之后每个状态都把它当参考图（reference / `--cref` / IP-Adapter），并固定随机种子(seed)，
> 这样九个状态看起来是"同一个角色在做不同动作"，而不是九个不同的角色。

---

## 2. 九个状态 · 每个画什么动作 · 建议帧数

`/office` 用到的状态（与 `office.js` 的 `STATES` 一一对应）：

| 状态 | 含义 | 动作建议 | 建议帧数(循环) |
|---|---|---|---|
| `idle` | 待命 | 靠椅子轻呼吸 / 偶尔眨眼 | 6–8 |
| `thinking` | 思考 | 手托下巴、头顶冒问号/灯泡 | 8–10 |
| `researching` | 查阅 | 翻看屏幕/资料、目光左右扫 | 8–10 |
| `writing` | 写文件 | 双手打字、身体轻晃 | 6–8 |
| `executing` | 执行 | 盯屏、齿轮转、能量脉冲 | 8 |
| `delegating` | 派活(头儿) | 抬手指挥/发号施令 | 8–10 |
| `waiting` | 等授权 | 举手、头顶感叹号、期待表情 | 6–8 |
| `error` | 出错 | 冒汗/皱眉/头顶 ⚠️ 抖动 | 6 |
| `sleeping` | 休眠 | 趴桌睡、冒 Zzz | 6–8 |
| `working`(员工) | 子代理工作 | 同 `executing` 的简版即可 | 6–8 |

**15FPS 数学**：循环时长 = 帧数 ÷ 15。例如 8 帧 → `8/15 ≈ 0.53s` 一轮。
循环动作 6–10 帧就很顺，不必追求每秒 15 张全画；不够顺再补帧。

> 偷懒但高级的做法：先只做 `idle / thinking / writing / researching / executing / waiting` 六个最常见的，
> `delegating` 可暂用 `thinking`、`sleeping` 用 `idle` 暗屏版、`error` 用静帧+抖动兜底。

---

## 3. 提示词套件（复制即用，按状态替换动作）

### 3.1 角色设定图（先出这张，当后续参考）

中文意图 → 建议用英文喂图模型（多数模型英文更稳）：

已定方向 = **Q 版贴纸英雄**（厚黑描边 + 平涂亮色 + 大头萌身）。出图时**把 `docs/refs/style-ref-chibi-hero.png` 当风格参考图喂进去**，但请设计**自己的原创英雄**（自定配色/五官/标志），不要直接复刻已有 IP 形象。

中文意图 → 建议用英文喂图模型（多数模型英文更稳）：

```
A single original chibi superhero mascot character sheet, full body, front view,
bold thick black outline (sticker style), flat bright saturated colors,
big head small body, a round glowing light on the chest, expressive cute face,
clean crisp edges, transparent background, centered, consistent design, 1:1 square
--no pixel art, blur, text, watermark, realistic, 3d
```

可微调的造型旋钮（做出你自己的辨识度）：主色（白/银/你喜欢的色）、配色点缀、
头部造型、胸口灯形状。**胸口圆灯顺便当状态指示灯**：蓝=正常、黄=等待、红闪=出错。

### 3.2 各状态动作（在设定图基础上加这句 + 用参考图保持一致）

```
<BASE 角色描述>, <ACTION>, looping animation frames, consistent character, same outfit and colors,
front view, transparent background, 1:1
```

`<ACTION>` 替换表（英文）：

| 状态 | ACTION |
|---|---|
| idle | sitting relaxed, gentle breathing, occasional blink |
| thinking | hand on chin, thinking, a question mark above head |
| researching | looking at screen, eyes scanning left and right, reading |
| writing | typing on keyboard with both hands, focused |
| executing | staring at screen, a glowing gear spinning, energy pulse |
| delegating | raising a hand pointing, giving orders, confident |
| waiting | raising one hand up, expectant look, exclamation mark above head |
| error | worried face, sweat drop, a warning sign above head |
| sleeping | sleeping on the desk, "Zzz" floating above |

> 多数工具支持"参考图 + 文生图"或"图生图序列"。优先：① 出设定图 → ② 以它为参考逐状态出**一段 GIF**或
> **若干连续帧**。固定 seed、固定参考图，能极大提升帧间一致性。

---

## 4. 出帧 → sprite sheet（用仓库现成脚本）

仓库根目录已有 `gif_to_spritesheet.py`（把 GIF 切成**单横排** sprite sheet）和 `webp_to_spritesheet.py`。

每个状态出一段循环 GIF 后：

```bash
cd ~/Documents/GitHub/claude-office
# 用法: python gif_to_spritesheet.py <gif> <输出png> <目标高度>
.venv/bin/python gif_to_spritesheet.py raw/writing.gif frontend/char-writing-sheet.png 256
```

- `目标高度` 建议 256（@2x 视网膜更锐；显示时缩放到 ~96–128px）。
- 输出是**一张横排图**，宽 = 单帧宽 × 帧数。**记下帧数和单帧宽高**（脚本会打印）。
- 命名约定：`frontend/char-<state>-sheet.png`（员工同一套或单独 `emp-<state>-sheet.png`）。
- 体积优化：切完可 `.venv/bin/python convert_to_webp.py` 转 webp（仓库已有）。

把每个状态的元信息填进一个清单文件 `frontend/char-frames.json`（合成示例）：

```json
{
  "frameH": 256,
  "states": {
    "idle":        { "sheet": "char-idle-sheet.webp",        "frames": 8,  "frameW": 256 },
    "writing":     { "sheet": "char-writing-sheet.webp",     "frames": 6,  "frameW": 240 },
    "researching": { "sheet": "char-researching-sheet.webp", "frames": 10, "frameW": 256 }
  }
}
```

---

## 5. 接入 `/office`（**播放已接好，丢帧即动**）

`/office`（iso canvas）已内置序列帧播放：启动时读 `frontend/char-frames.json`，按角色当前
`state` 取对应 sheet，逐帧 `drawImage` 切片播放（`FRAME_FPS=8`），并叠加体态补间(挤压拉伸)。
**没有某状态的帧 → 自动回退到单图 `char-hero.png` + 体态补间**，不会报错。后端/hook/行为层全不动。

### 清单格式 `frontend/char-frames.json`（已有可用示例）

```json
{
  "frameH": 480,
  "states": {
    "idle":    { "sheet": "char-idle-sheet.png",    "frames": 2, "frameW": 316 },
    "writing": { "sheet": "char-writing-sheet.png", "frames": 4, "frameW": 316 }
  }
}
```
- `sheet`：放在 `frontend/` 下的横排 sprite 文件名（自动经 `/static/` 提供）。
- `frames`：该 sheet 的帧数；`frameW`：单帧宽；`frameH`：全局单帧高（顶层一个即可，统一最稳）。
- 每帧务必**同尺寸、脚底对齐、角色不漂移**，否则播放会抖。
- 状态名取值：`idle / thinking / researching / writing / executing / delegating / waiting / error / sleeping`（员工用 `working`）。

> 当前仓库里 `char-idle-sheet.png`(2 帧) 是我用单图派生的**示范**，证明链路通；你出正式帧后替换它、并按上面把各状态填进清单即可，刷新就生效。
> 想要 60FPS 丝滑 + 极小体积时，这套播放层可整体换 Rive（路线2）：`state` → Rive 状态机输入，不再需要 sheet。

---

## 6. 你这一步要做的（清单）

- [x] 方向已定：**Q 版贴纸英雄**（参考 `docs/refs/style-ref-chibi-hero.png`，做成原创英雄）。
- [x] 设定图已有：`frontend/char-hero.png`（你给的那张）。
- [x] 播放已接好：iso canvas 读 `char-frames.json` 逐帧播 + 体态补间；缺帧自动回退单图。
- [ ] **路线1 速成**：每个状态出 **2~4 个姿势静帧**（用 §3 提示词，固定参考图 `char-hero.png` 保一致）。
      静帧比连贯 GIF 好出、好对齐。先做最常见的：`idle / thinking / researching / writing / executing / waiting`。
- [ ] 每状态把 2~4 帧**横向等宽拼成一张** `frontend/char-<state>-sheet.png`（脚底对齐、不漂移）；
      多帧也可用 `gif_to_spritesheet.py` 从 GIF 切。
- [ ] 把每状态的 `sheet/frames/frameW` 填进 `frontend/char-frames.json`（格式见 §5），刷新即动。

出好任一状态的帧（哪怕先 1 个状态）发我，或直接丢进 `frontend/` + 填清单，我来对齐调试。

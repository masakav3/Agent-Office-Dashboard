# claude-office · RUNBOOK

> Fork 自 [`ringhyacinth/Star-Office-UI`](https://github.com/ringhyacinth/Star-Office-UI)（代码 MIT）。
> 目标：把 Claude Code（及后续 pi）的 agent 实时状态，变成一个动画办公室看板。
> 完整路线见 `~/.claude/plans/claude-code-pi-agent-hooks-agent-agent-purring-ember.md`。

本项目当前处于 **Phase 1（Claude Code Hook 桥接）已完成** —— 真实的 Claude Code 活动会实时驱动看板。下面是怎么起停、数据怎么流、怎么自测。

## 一、它是怎么跑的（数据流）

```
set_state.py / (Phase1: hook 转发器)
        │  写 state.json  /  POST 状态
        ▼
Flask 后端  backend/app.py   监听 127.0.0.1:19000
        │  /status (主 agent)   /agents (所有 agent)
        ▼  前端每 2~2.5s 轮询
浏览器看板 frontend/  (Phaser 序列帧)  ← 按 state 播放角色动画
```

- 后端**纯文件存储**，无数据库。主 agent 状态在 `state.json`，所有 agent 列表在 `agents-state.json`。
- 前端是 Phaser 游戏，启动后**定时轮询** `/status` 和 `/agents`，按返回的 `state` 切换角色动画。

## 二、一次性设置（已完成，换机器才需要重做）

```bash
cd ~/Documents/GitHub/claude-office
python3 -m venv .venv
.venv/bin/python -m pip install flask==3.0.2 pillow==10.4.0
cp -n state.sample.json state.json
cp -n join-keys.sample.json join-keys.json
```

> 本地开发用默认 secret 即可。只有设了 `STAR_OFFICE_ENV=production` 才会强制校验强密钥。

## 三、启动 / 停止后端

启动（前台，Ctrl+C 退出）：
```bash
cd ~/Documents/GitHub/claude-office
.venv/bin/python backend/app.py
# 监听 http://127.0.0.1:19000   （改端口：STAR_BACKEND_PORT=3009 .venv/bin/python backend/app.py）
```

后台启动 + 看日志：
```bash
.venv/bin/python backend/app.py > /tmp/claude-office-backend.log 2>&1 &
tail -f /tmp/claude-office-backend.log
```

停止后台：
```bash
lsof -nP -iTCP:19000 -sTCP:LISTEN -t | xargs kill
```

## 四、打开看板

- **多办公室看板（Phase 2，主视图）**：**http://127.0.0.1:19000/office**
  每个 Claude Code 会话 = 一间办公室，主 agent = 👑 头儿，subagent = 员工。多会话并排成网格。
- 旧的单办公室像素页（上游原版，仅 set_state.py 手动驱动）：http://127.0.0.1:19000/

## 五、手动自测状态（验证闭环）

```bash
cd ~/Documents/GitHub/claude-office
.venv/bin/python set_state.py writing "在写日报模板…"
.venv/bin/python set_state.py researching "在查 hooks…"
.venv/bin/python set_state.py error "出问题了排查中"
.venv/bin/python set_state.py idle "待命中"
```

执行后看板里的角色会在 1~2 秒内切换动作。
`set_state.py` 接受的状态：`idle / writing / receiving / replying / researching / executing / syncing / error`。

## 六、HTTP 接口速查

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/status` | 主 agent 当前状态 `{state, detail, progress, updated_at, officeName}` |
| GET | `/agents` | 所有 agent 列表（含主 agent `isMain:true`，超时自动清离线） |
| POST | `/set_state` | 控制台设状态 `{state, detail}` |
| POST | `/join-agent` | 访客 agent 加入（需 joinKey），返回 `agentId` |
| POST | `/agent-push` | 访客 agent 推状态 `{agentId, state, detail}` |
| POST | `/leave-agent` | 访客 agent 离开 `{agentId}` |

## 七、关键文件

| 文件 | 作用 |
|---|---|
| `backend/app.py` | Flask 后端主程序（端口/路由/状态存取） |
| `frontend/game.js` | Phaser 渲染 + 轮询 + state→动画映射 |
| `frontend/index.html` | 看板页面 |
| `state.json` | 主 agent 状态（运行时生成） |
| `agents-state.json` | 所有 agent 列表（运行时生成） |
| `set_state.py` | 手动改主 agent 状态的测试脚本 |
| `gif_to_spritesheet.py` / `webp_to_spritesheet.py` | 把动画切成 sprite sheet（Phase 3 换素材用） |

## 八、Claude Code Hook 接入（Phase 1）

转发器：`hooks/cc_state_push.py`（纯标准库，零依赖，出错静默，永不阻塞工具）。
读 stdin 的 hook 事件 JSON，按 `(hook_event_name, tool_name)` 映射成状态，POST 到 `/set_state`。

事件 → 状态映射：

| 事件 / 工具 | 看板状态 | detail |
|---|---|---|
| `UserPromptSubmit` | executing | 🧠 思考中… |
| `PreToolUse` · Read/Grep/Glob/Web* | researching | 🔍 查阅 · <tool> |
| `PreToolUse` · Edit/Write | writing | ✍️ 写文件 · <tool> |
| `PreToolUse` · Bash | executing | ⚙️ 跑命令 · Bash |
| `PreToolUse` · Task/Skill | executing | 👥/✨ 派活·跑技能 |
| `PostToolUse`（报错时） | error | ⚠️ 出错了，排查中… |
| `PermissionRequest`/`Notification` | syncing | ⏳ 等你授权… |
| `Stop` | idle | ✅ 完成，待命中 |
| `SessionEnd` | idle | 💤 会话结束 |

环境变量：`CLAUDE_OFFICE_URL`（默认 `http://127.0.0.1:19000`）、`CLAUDE_OFFICE_DEBUG=1`（写 `/tmp/claude-office-hook.log`）。

已在 `~/.claude/settings.json` 的这些事件**追加**（不覆盖既有 AhaKey / token 上报 / skill-tracker）：
`UserPromptSubmit / PreToolUse / PostToolUse / Stop / SessionEnd / PermissionRequest / Notification`。
新会话自动生效（实测当前会话也能热加载）。

**一键回滚 settings.json**（移除本项目 hook，保留其余）：
```bash
python3 - <<'PY'
import json, os, tempfile
SET = os.path.expanduser("~/.claude/settings.json")
cfg = json.load(open(SET, encoding="utf-8"))
for ev, arr in cfg.get("hooks", {}).items():
    cfg["hooks"][ev] = [g for g in arr
        if not any("cc_state_push.py" in h.get("command","") for h in g.get("hooks", []))]
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(SET), suffix=".tmp")
json.dump(cfg, os.fdopen(fd, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
os.replace(tmp, SET); print("已移除本项目 hook")
PY
```
或直接用备份：`cp ~/.claude/settings.json.bak-claude-office-* ~/.claude/settings.json`

## 九、多办公室数据模型（Phase 2）

- 独立存储 `cc-rooms.json`（与上游 `state.json`/`agents-state.json` 解耦）。
- 转发器 `cc_state_push.py` 现投 `/cc/push`，按会话分房间：
  - 普通事件 → 设头儿状态（thinking/researching/writing/executing/waiting/idle/error）。
  - `PreToolUse(Task)` → `delegate`：头儿置 delegating + 房间新增员工（名牌=subagent_type）。
  - `SubagentStop` → `subagent_done`：移除一名最早在岗员工（FIFO 近似）。
  - `SessionEnd` → 关闭办公室。
- 新接口：`POST /cc/push`、`GET /cc/rooms`（TTL 过滤：员工 5min、办公室 30min 无活动即清），`GET /office`。
- TTL 可调：环境变量 `CC_EMPLOYEE_TTL` / `CC_ROOM_TTL`（秒）。
- 前端 `frontend/office.{html,css,js}`：浅色明亮、状态语义色、占位角色用 transform 微动画；
  渲染层薄接缝 `.work[data-state]` + `buildWork()`/`paint()`，Phase 3 换 sprite/Rive 不动数据层。

## 十、当前 `/office` 形态（iso 装修版）

- **斜 45° 自绘 canvas 微缩办公楼**（不用游戏引擎；移动算法借 Star Office 的 `moveStar`）。
- 一栋楼坐在**楼板地基**上；每个会话 = 一间办公室（**1 头儿位 + 4 个子代理工位**，2×2）；全楼共享**茶水间**。
- 家具：格子间隔断、台灯+发光屏工位、桌椅、文件柜/饮水机/书架，茶水间有咖啡吧台/冰箱/圆桌凳。
- **每间按 sessionId 固定随机**：4 角摆件（绿植/书架/饮水机/落地灯/懒人沙发/小冰箱/纸箱/奖杯/鱼缸…）+ 左墙挂件 + 部门配色。
  - **左墙海报池**（`WALL_DECOR`，6 选 1 随机）：纯色海报/白板/挂钟/相框 + **真实海报图** `poster-stranger.png`(竖版当海报) / `poster-anime.png`(横版当相框)。海报经 `wallPoster()` 加深色相框 + `drawWallImgLeft()` 仿射贴到左墙（图左缘锚 `gyFront` 避免镜像，朝向同门牌；按各自比例不变形）；缺图回退纯色海报。素材处理：`tools` 里直接 PIL 缩放转 PNG（海报是整块矩形，无需抠图）。**注**：这两张是第三方 IP（Netflix《怪奇物语》/某动画截帧），内部/展示用 OK，公开/商用前需换自有或授权图。
- **角色靠近装饰品 → 装饰品平滑淡出**（规避层级穿模）。
- **永不空楼**：零会话时也保底显示 1 间办公室「总部 · 待命中」+ 茶水间（占位、无角色）。
- **家具素材（落地 billboard）**：头儿桌=三联屏 `asset-desk-triple.png`；员工桌=咖啡桌/奶茶桌 `asset-desk-{coffee,milktea}.png`（按工位坐标奇偶交替）。**`drawProp()` 复用窗户的仿射 `drawWallImg`** → 桌子投影到「与窗墙平行」的竖面、站地面、随 iso 倾斜（不是正对镜头的平面立牌）；尺寸按 tile（头儿 2.9 / 员工 2.1）。缺图回退程序化桌。白板 `asset-whiteboard.png` 进左墙海报池（`drawWallImgLeft`）。黑底/透明带辉光素材走 `tools/process_desk.py`（硬化 alpha 去辉光 / 白底渐变去底），都带一点点羽化。
  - **工位摆法**：桌在工位**后侧**(贴窗墙方向 `gy-0.6`)、椅在**前侧**(`gy+0.1`,露出来)、角色坐椅上(画最上层不被盖)。已**移除旧工位隔断**(`partition`,与高清桌素材打架)。
- **DGX·B300 机房（网址连通红绿灯）**：常驻特殊房（同茶水间，`relayout` 占一格 `dgxRoom`）。后端**后台线程**每 30s 探测监控网址（默认 `https://www.google.com`，`CC_MONITOR_URL` 或 `POST /cc/monitor {url}` 改），`/cc/rooms` 带 `net:{ok,url,...}`。前端 `drawDgxFloor()`：`net.ok===true`→绿、`false`→红、`null`→检测中；有 `dgx-green/red.png` 则贴集群图，否则程序化机柜(`serverRack`)。门牌显示「🖥 DGX·B300 🟢在线/⛔离线」。
- **出错怪兽**：hook 报 error → 后端给该房 `monsterAt`，`/cc/rooms` 在 `CC_MONSTER_TTL`(25s)内置 `monster:true`。前端 `sync` 在该办公室刷一只怪兽（kind=`monster`，按 sessionId 随机样式），在室内游荡，错误解除→走门口离场。素材池 `monsters.json`→`char-monster-*.png`（缺图程序化独眼怪占位）。
- **模拟城市底座（门口大马路 + 单向车流，token 驱动）**：楼前一条**沥青马路**（中线虚线 + 两侧人行道 + 行道树），**单向通车（左上→右下）**，马路与大楼留**草坪间隔**。`relayout` 算 `city`：`lane`(单向车道 gy) / `span` / `cap`(路长决定的最大容量)；`drawGround()` 画地基/马路/树；车流由 `updateTraffic(dt)` 维护，`render()` 深度排序后画。
  - **车流密度 = 上下文占用%**：钩子按 1M 上下文算每个 session 的 `ctxPct` → 后端 `/cc/rooms` 返回全楼 `load`(=在岗房间最高 ctxPct) → 前端 `TARGET_LOAD` 平滑到 `LOAD`。**车只从最左端 `gxA` 进、最右端 `gxB` 出，绝不中途刷新**；进车间距 `headway` 随 `LOAD` 缩短(越忙越密)。**<20% 零星几辆**、**~50% 繁忙**、**≥80% 最前车被"红灯"顶在 `gxB`→后车跟车排队→整条路停死(塞车)**(`updateTraffic` 的 `jammed` 分支：禁离场 + 最前车 aheadP=gxB)。调试：`/office?load=85` 直接定负载（`LOAD` 仍从 0 渐变，塞车队列约十几秒由右向左排满）。
  - **小车素材（原汁原味不改色）**：`car-mx5.png`(复古白 MX-5) 常规车 + `car-su7u.png`(黄 SU7U) **每 3 辆来一辆**(`carSeq%3`)。素材原图**车头朝右下=行驶方向，单向通车故不翻转**；屏上车高 `CAR_H`(mx5 38 / su7u 42，偏小巧)。**无素材回退**简易灰车。原图含品牌(XIAOMI/Mazda)，内部/展示用 OK，公开/商用前需换去标版。
  - **素材处理**(`tools/process_car.py`)：黑底图用**紧致黑键**(gradient flood，delta≈8 只灌纯黑、车顶微反光>delta 即保住) → **形态学闭运算**(MaxFilter→MinFilter，封住黑顶与车身间细缝漏口) → **填洞**(border-flood，补回被车体包裹的玻璃黑斑) → **一点点羽化**(MinFilter1px + GaussianBlur1.0) → 裁包围盒。换车替换源图路径重跑 `process_close()` 即可。
- 角色：有 `char-frames.json` 就逐帧播 sheet + 体态补间；缺帧回退单图 `char-hero.png`。
- 关键文件：`frontend/office.{html,css,js}`、`frontend/char-hero.png`、`frontend/char-frames.json`。

## 十一、开发须知 / 踩坑（务必看）

1. **缓存：改前端只需普通刷新（无需强刷/重启）**。静态资源已设 `Cache-Control: no-cache`（ETag 复查）：
   浏览器每次刷新用 ETag 问"变了吗"——没变 304 秒回、变了自动拿新的。改 `office.{js,css}`/素材后 **普通刷新即生效**。
   仅改后端 `*.py` 才需重启后端。（历史坑：之前静态是 `max-age=31536000, immutable` 必须强刷——已改为 no-cache。）
2. **已改全局 `~/.claude/settings.json`**：7 个事件追加了 `cc_state_push.py`（见第八节），有备份 + 一键回滚脚本。
3. **会话生命周期 / 房间回收**（兼顾正常关闭、清除、崩溃强杀）：
   - **忙但久未更新 > `CC_IDLE_TTL`(150s) → 自动 idle**：头儿去茶水间，杜绝"僵尸卡在工作态"。
   - **久无活动 > `CC_DEAD_TTL`(30min) → 判定会话已死 → 标记 closing**：覆盖崩溃/强杀(没发 SessionEnd 的情况)。
   - **`SessionEnd`(正常关闭/clear) → 立即 closing**：头儿+员工**走向门口下班离场、房间关灯变暗**，`CC_CLOSE_GRACE`(8s) 后真正移除（不再凭空消失）。
   - 员工无更新 `CC_EMPLOYEE_TTL`(5min) 离场。
   - 全部回收后，前端仍**保底显示占位楼**（总部·待命 + 茶水间）。
   - 前端：`/cc/rooms` 返回 `closing` 标记；closing 房间里角色走门口，头儿到门口隐藏(不重建)，随房间移除清理。
4. **演示填充**：想让画面饱满，可用 hook 喂假事件造演示办公室（按 TTL 自动消失）：
   `printf '{"hook_event_name":"PreToolUse","tool_name":"Edit","session_id":"demo","cwd":"/x/我的项目"}' | python3 hooks/cc_state_push.py`
5. **状态文件**：`cc-rooms.json`（多办公室，本阶段主用）与上游 `state.json`/`agents-state.json` 解耦，可随时删（会重建）。
6. **小车"穿墙"坑（已修，真根因是"车与路面不同步"）**：现象是**时好时坏**——办公室数量一变就坏。真根因：旧实现把车道 `gy` **在播种时写死**(`gy: rGy0+0.6`)，且只在 `allGx`(列数)变时才重播种；但马路位置 `rGy0 = allGy+2.8` 还会随**行数**变（如 2→3 间：列不变、多一行），于是路面挪到新 `gy`、车还停在旧 `gy` → 车跑在"幻影旧路"上、穿过大楼。**修法（关键）：车不缓存任何布局坐标**——只存沿路位置 `p` + 车型，`gy` 每帧取 `city.lane`（当前路面）实时算，路面挪了车必跟着挪。另：马路前移到 `AGy+2.8` + 台座压矮 `(-12,9)` 留余量。（注：当前已是**单向通车**，`updateTraffic` 用 `p` 推进 + 跟车模型，详见 §十车流条目。）
   - **铁律**：任何"跟着布局走"的动态元素（车/行人/特效）**都不要把布局相关坐标缓存进对象**，要在渲染时从当前 `city`/布局实时取；缓存只留与布局无关的身份（颜色/速度/相位）。
   - **马路随规模伸缩**：`gxA=-3 / gxB=allGx+3` 已让路长 = 大楼前缘宽 + 余量；车数 `nCars=clamp(round((gxB-gxA)/4),4,10)` 随路长自动增减。

## 十二、角色动画接入（路线1·图生视频）

已定：用**图生视频**工具把 `char-hero.png` 动成每状态一小段循环 GIF/MP4，我转成 sheet。

```bash
# GIF/MP4 丢进 raw/，一条命令出 sheet + 自动写 char-frames.json
.venv/bin/python tools/clip_to_sheet.py writing raw/writing.mp4 --frames 6 --key auto
```
- `tools/clip_to_sheet.py`：抽帧 → 抠背景(可选 `--key auto/#00ff00`) → 脚底对齐拼横排 sheet → 写清单。
- 出片段三要点：角色别在画面里平移、镜头固定居中、背景用一块纯色便于抠图。
- 详见 `docs/art-pipeline.md`（§5 清单格式、§3 提示词、§6 清单）。

### 角色皮肤池 `frontend/char-skins.json`（多样化）

当前角色用**静态图皮肤池**（视频未就绪前的方案）：boss / employee 各一组，**按状态分组**
（`default`=工作态，`idle`=休息态：主 agent 进茶水间喝咖啡、subagent 喝奶茶）。每个角色按其 id
哈希随机选池中一张，**同一会话稳定不乱跳**；同组多张则在该状态下轮换。

```json
{
  "boss":     { "default": ["char-leader.png"],   "idle": ["char-leader-coffee.png"] },
  "employee": { "default": ["char-subagent.png"], "idle": ["char-subagent-milktea.png"] }
}
```
- **加形象 = 多样化**：把新 PNG（透明底、放 `frontend/`）文件名加进对应 `default`/`idle` 数组即可，自动随机出现/轮换。
- 也兼容旧写法：`"boss": ["xx.png"]`（纯数组 = 只有 default）。
- 图片自带比例（boss 通常更大更宽），代码按真实宽高比画 + 脚底对齐。
- 白底图入库前用 alpha 洪水填充去底（黑描边挡住、角色内部白保留）。
- 优先级：某状态有 `char-frames.json` 序列帧则播帧；否则用皮肤池静态图 + 体态补间；都没有才回退 `char-hero.png`。

## 十三、接下来（路线）

- **Phase 1 ✅ · Phase 2 ✅（iso 装修版 + 永不空楼）已完成**
- **Phase 3（进行中，待你出图）**：图生视频出片段 → `clip_to_sheet.py` → `/office` 自动播帧。
- **Phase 4（可选）**：渲染层换 Rive，60FPS 丝滑。

# 调试参数手册（office3d 3D 看板）

3D 微缩办公室（`frontend/office3d.js`）支持一组 **URL 查询参数**，用于在浏览器里即时调试画面，无需改代码或重启后端。后端默认跑在 `127.0.0.1:19000`。

页面地址：

```
http://127.0.0.1:19000/static/office3d.html
```

参数以 `?key=value&key2=value2` 形式拼接，可任意组合，例如：

```
http://127.0.0.1:19000/static/office3d.html?season=winter&tod=night&sky=snow
```

---

## 一、画面与环境参数

| 参数 | 取值 | 默认 | 说明 |
|------|------|------|------|
| `season` | `spring` / `summer` / `autumn` / `winter` | 按当前月份 | 四季底座植被。月份规则：11–1 月=冬，2–4 月=春，5–7 月=夏，其余=秋 |
| `tod` | `day` / `night` | 取自天气接口 / 实时 | 强制昼夜。`night` 会点亮 LED 灯带、屏幕霓虹、篝火辉光 |
| `sky` | `clear` / `partly` / `cloudy` / `fog` / `rain` / `storm` / `snow` | 取自天气接口，否则 `clear` | 天空 / 天气状态。`rain`/`storm` 下雨（storm 含闪电），`snow` 下雪 |
| `anim` | 见下方动作清单 | 无（按真实状态） | **调试用**：强制全体角色播放指定动作 / 状态，方便观察人物运动 |
| `rooms` | 整数 | `0`=连后端真实数据 | **调试用**：强制渲染 N 间办公室（不连后端），一次看全图；去掉参数 / `rooms=0` 即恢复真实数据。N 超 8 自动外扩第二环 |
| `dbg` | `1` / 无 | 无（关闭） | **调试用**：显示 XYZ 世界坐标轴 + 端点标签；把每间外墙顶 LED 按房间序固定上色（红橙黄绿青蓝紫粉）；并画出动线 + 中庭障碍圈。见下方「布局调试」 |
| `paths` | `1` / 无 | 无（关闭） | **调试用**：只看动线——每间房 `seat→exit→entry→lounge` 路点 + 地面色带 + 中庭家具障碍圈（不含坐标轴/外墙配色）。见下方「布局调试」 |
| `coffee` | 浮点（秒） | `0`=默认 16~50s | **调试用**：缩短"主 agent 去喝咖啡"的间隔基准，便于观察走动动画（如 `coffee=3`）。见下方「动线」 |
| `monster` | `1` / 无 | 无（仅真报错时冒，~25s） | **调试用**：强制**每间办公室**都冒出"出错怪兽"（红色独眼多面体 + 地面红盘），不必等真报错。平时怪兽只在 `state=error` 时出现且 ~25s 即离场，本参数便于观察其造型。`?rooms=6&monster=1` 一次看满屏怪兽 |

### 角色动作预览 `?anim=`

强制所有角色播放某个动作，用来观察运动状态（不影响真实数据，仅前端预览）：

```
?anim=working   # 坐着敲键盘（sit + 双臂上下摆动）← 看“打字”
?anim=walk      # 走路
?anim=sprint    # 跑
?anim=jump      # 跳
?anim=sit       # 静坐（不打字）
?anim=idle      # 站立待机
?anim=emote-yes # 点头
```

可用动作 clip（Mini Characters 自带 32 个）：`static / idle / walk / sprint / jump / fall / crouch / sit / drive / die / pick-up / emote-yes / emote-no / holding-right / holding-left / holding-both / interact-right / interact-left / attack-* / wheelchair-*`。

> 工作态（`working` / `writing` / `executing`）会额外触发"敲键盘"摆臂；其它纯播 clip。未来新增动作只要传 clip 名即可预览。

> `tod` / `sky` 一旦在 URL 指定，就会覆盖后端 `/cc/weather` 返回值；后端没起时也能靠这两个参数预览。

### 布局调试 `?rooms=` / `?dbg=`（中庭环形布局 + 坐标轴 + 房间配色）

办公室采用**四合院式中央中庭布局**：中庭休息室居正中心，房间从内环（8 格）向外环环绕、开口朝中庭、外墙朝外。下面两个参数用来快速通览全图与定位沟通：

```
?rooms=8            # 强制渲染 8 间(不连后端)，一次看满内环全图
?rooms=12           # 12 间会自动外扩到第二环
?rooms=8&dbg=1      # 全图 + XYZ 坐标轴 + 每间外墙按房间序上色
?rooms=8&dbg=1&tod=night   # 夜间外墙线条颜色最清晰(推荐用于定位)
```

去掉 `rooms` 参数（或 `rooms=0`）即恢复连后端真实数据。

`?dbg=1` 的坐标轴：**红=X / 绿=Y(竖直) / 蓝=Z**，端点标 `+X/−X/+Y/+Z/−Z`、原点 `O`。

`?dbg=1` 的**房间序→外墙线条色→轴向→屏幕位置**（iso 视角，相机在 +x+z 侧俯看）：

| 序 | 颜色 | 网格方位 | 轴向 | 屏幕位置 |
|----|------|----------|------|----------|
| 0 | 红 | 前 | +Z | 左下 |
| 1 | 橙 | 右 | +X | 右下 |
| 2 | 黄 | 后 | −Z | 右上 |
| 3 | 绿 | 左 | −X | 左上 |
| 4 | 青 | 前右角 | +X+Z | 正下（最近镜头） |
| 5 | 蓝 | 前左角 | −X+Z | 正左 |
| 6 | 紫 | 后右角 | +X−Z | 正右 |
| 7 | 粉 | 后左角 | −X−Z | 正上（最远） |

> 调试时可直接说「青色那间」或「+X 方向那间」精确定位。两个参数都是纯前端调试用，不改后端数据。

#### 动线 `?paths=`（房间→休息室的步行路线）

中庭四周有一圈**回廊**（抄手游廊，石色环带，填满中庭与房间之间的缝、与地台等高）——**实体回廊一直可见，无需参数**，把 8 间办公室和中庭连成连续可走面。

`?paths=1`（或 `?dbg=1`）额外画出每间房的**动线路点链**：`seat(工位,大球) → exit(敞开侧门口) → entry(进中庭口) → lounge(中庭落点)`，地面色带用该房间序色（同上表）。

动线**会绕开障碍**（房内 + 中庭两段都避障，`?paths=1` 下障碍画成灰色圈）：
- **房内障碍 `ROOM_OBS`**（本地坐标）：员工工位（桌+人）+ 盆栽 + 落地灯 + 书架。**椅子不算**（要坐上去）、**boss 自己工位也不算**（动线起点）。`seat→exit` 段绕开它们——正向房间 boss 走中央过道直出，角房间斜线会绕过员工工位。
- **中庭障碍 `ATRIUM_OBS`**（世界坐标）：电视柜/沙发/茶几/茶水柜/冰箱/落地灯/绿植。落点被家具推到空地，`entry→lounge` 段做线段-圆相交检测、撞到插绕行点。

避障靠 `clearSpot()`（把点挤出障碍圈）+ `segHit()`/`routeAvoiding()`（线段-圆检测+插绕行点）。**改了家具/工位位置，要同步更新 `office3d.js` 里的 `ROOM_OBS` / `ATRIUM_OBS`**。

```
?rooms=8&paths=1   # 只看 8 间的动线 + 障碍圈(最干净)
?rooms=8&dbg=1     # 动线 + 障碍圈 + 坐标轴 + 外墙配色(全套)
```

> 动线"房腿"（工位→中庭门口）预存在每个角色的 `fig.userData.roomLegW`（世界坐标）；中庭"腿"（门口→落点）在出发时按所选落点动态拼接、转本地后走。

#### 角色走去喝咖啡（走动动画）

**主 agent 和员工**都会定期离岗去中庭休息室（员工更稀疏）：`工位 →(沿动线绕障碍走)→ 在落点活动 →(原路返回)→ 工位坐下`。统一状态机 `stepWalker(room, fig)`：`seated → toLounge → lounging → toSeat → seated`，沿动线插值、切 `walk`/落点动作/坐姿 clip；走动中不被状态轮询打断、不摆臂；出错（怪兽）时不离岗。boss 间隔默认 16~50s、员工 40~120s 随机错峰，`?coffee=N` 缩短观察。

- **中庭落点 `LOUNGE_SPOTS`**（带占用标记，先到先得，无空位则稍后再试）：
  - **沙发**×2：走到沙发前接近点 `ax/az`，再一步坐上去，播 `sit`、朝电视。
  - **咖啡机前**：站到柜前播 `interact-right`（操作咖啡机）。
  - **站位**×3：站着播 `holding-right/left`（端咖啡），朝中庭中心。
  - 落点都有"接近点"避免路径往沙发等家具里钻；`?paths=1` 下落点画成青色球。

> 多个角色相遇时**允许穿模重叠**（已移除对向避让——它反而会让人抱团/卡死，宁可穿模）。路径经 `simplifyRoute()` string-pull 去冗余。**无头截图看不到走动**：软渲染 8 房约 1fps，模拟按真实时间龟速；真实浏览器 60fps 正常。要无头验证用 `?rooms=1`（角色少、帧率高）。

#### 中庭电视（点击切换画面）

中庭电视是**发光像素屏**，鼠标**点击电视屏**循环切换 7 个动态画面（区分点击/拖拽，不影响 orbit 旋转）：

| # | 画面 | 内容 |
|---|------|------|
| 0 | 黑客帝国 | 绿色片假名字符雨下落 + 拖尾 |
| 1 | 宫崎骏 | 蓝天白云绿草 + 黑色大龙猫 + 红衣小姑娘 |
| 2 | 银翼杀手 | 赛博霓虹天际线 + 雨 + 闪烁招牌 |
| 3 | TRON | 网格 + 红蓝队光轮对抗（各 2 辆，垂直转向留发光拖尾墙） |
| 4 | 2001 太空漫游 | 星空 + 地球弧线(大气辉光) + HAL 9000 红眼脉动 |
| 5 | 星球大战 | 塔图因双日落 |
| 6 | 流浪地球 | 巨大木星(条带+大红斑) + 冰封地球 + 蓝色行星发动机等离子束 |

> 每个画面 `~12fps` 重绘（`stepTv`），都有动画。新增画面：在 `office3d.js` 写个 `tv*(c,w,h,t)` 场景函数加进 `TV_SCENES` 数组即可。

## 二、光照与后期参数

| 参数 | 取值 | 默认 | 说明 |
|------|------|------|------|
| `sun` | 浮点倍数 | `1` | 主平行光强度倍数。调亮/调暗整体直射光 |
| `fog` | 浮点倍数 | `1`（`0`=关雾） | 雾强度倍数。每种 `sky` 有基础雾值，这里再乘一个系数 |
| `exp` | 浮点 | `0`=用各 `sky` 预设曝光 | 曝光（toneMappingExposure）覆盖值 |
| `bloom` | 浮点 | `0`=按昼夜默认 | 辉光（Bloom）强度覆盖。越大发光体晕得越开 |
| `glow` | 浮点倍数 | `0`=默认 | 显示器屏幕发光强度倍数 |
| `led` | 浮点 | `0`=默认 `3.4` | 墙顶 LED 灯带亮度，越大越霓虹 |

## 三、粒子（雨/雪）参数

| 参数 | 取值 | 默认 | 说明 |
|------|------|------|------|
| `n` | 整数 | `0`=默认（雨 2200 / 雪 100） | 粒子数量。仅 `sky=rain/storm/snow` 时生效 |
| `psize` | 浮点 | `0`=默认（雨 2.6 / 雪 16） | 粒子像素大小。雪花调大才看得清花形 |

---

## 四、常用调试组合

```text
# 冬天雪夜（圣诞树 + 雪人 + 篝火都点亮）
?season=winter&tod=night&sky=snow

# 秋天白天看橙松树 + 篝火
?season=autumn&tod=day&sky=clear

# 夏天暴雨（看闪电 + 雨粒子）
?season=summer&sky=storm

# 极致霓虹夜（调亮 LED + 辉光）
?tod=night&led=6&bloom=1.4

# 白雪大颗粒、慢调试
?sky=snow&n=300&psize=24

# 关雾、压暗主光，看纯净几何
?fog=0&sun=0.4

# 中庭满图 + 坐标轴 + 八色外墙（定位沟通用，夜间最清晰）
?rooms=8&dbg=1&tod=night
```

---

## 五、四季底座植被一览

| 季节 | 内容 | 素材包 |
|------|------|--------|
| 春 `spring` | 1 棵绿树 + 散布花簇（蓝/橙两色，同尺寸）+ 蝴蝶 | Platformer Kit |
| 夏 `summer` | 四角 4 棵树（阔叶/松混搭，高低错落） | Platformer Kit |
| 秋 `autumn` | 橙色松树 ×2 + 发光篝火 + 飘落枫叶 | **Survival Kit** |
| 冬 `winter` | 装饰圣诞树（+礼物）+ 雪松 + 3D 雪人（对角分开）+ 地面积雪 | **Holiday Kit** |

> 植被按当前 `season` **只加载所需模型**；模型缺失时自动回退程序化草丛/emoji，不阻塞。
> 素材与 colormap 隔离规则见 [art-pipeline.md](art-pipeline.md) 与 `frontend/vendor/kenney/`（每个外部引用纹理的 kit 各自独立子目录，避免串色）。

---

## 六、无头截图验证（不依赖浏览器手点）

本机已装 Playwright（模块在 `~/.npm-global/lib/node_modules/playwright`，chromium 已缓存）。临时脚本示例（ESM）：

```js
import pw from '/Users/<user>/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const s of ['spring', 'summer', 'autumn', 'winter']) {
  await page.goto(`http://127.0.0.1:19000/static/office3d.html?season=${s}&tod=day&sky=clear`,
    { waitUntil: 'networkidle' });
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3500);                                   // 留时间给 GLTF 异步加载 + 渲染
  await page.screenshot({ path: `/tmp/cc_${s}.png`, clip: { x: 300, y: 150, width: 900, height: 640 } });
}
await browser.close();
```

要点：
- 用独立无头 chromium，不会动用户正在用的 Chrome。
- 等 `#loading` 隐藏（模型预加载 + 建房间完成）再多等 ~3.5s，避免截到空场景。
- `clip` 裁到底座区域放大；看辉光/篝火用 `tod=night`。

---

## 七、主 agent 背后光环颜色（按来源工具 channel）

每间办公室的**主 agent**背后有一圈发光光环，颜色按其**来源工具**（channel）区分；子 agent 统一白色。channel 由 hook 通过环境变量 `CLAUDE_OFFICE_CHANNEL` 收集，经 `/cc/push` 透传到 `/cc/rooms`。

| channel（含子串匹配，大小写不敏感） | 光环颜色 |
|------|------|
| `claude` | claude 橙 |
| `openclaw` | 红 |
| `hermes` | 血橙（比 claude 深） |
| `codex` / `codex cli` | 薰衣草紫 |
| `antigravity` / `gemini` | 黄 |
| `kimi` / `kimi code` | 蓝 |
| `cursor` | 黑环 + 白色发光描边 |
| `trae` | 荧光绿 |
| `vscode` / `vs code` | 天蓝/浅蓝 |
| `cline` | 青绿 teal |
| `continue` | 靛蓝 indigo |
| `copilot` | 钢灰 + 白色描边（GitHub 单色风） |
| 其他未命中 | 粉粉（默认） |

**怎么设**：在 `settings.json` 各 hook 事件的命令前加环境变量（按你当前用的工具填）：

```bash
CLAUDE_OFFICE_CHANNEL=claude python3 ~/Documents/GitHub/claude-office/hooks/cc_state_push.py
```

未设 `CLAUDE_OFFICE_CHANNEL` 时主 agent 光环默认粉色。颜色映射在 `office3d.js` 的 `channelHalo()` 里，新增工具改那里即可。

---

## 八、非 Claude Code 工具接入（多 agent 收编）

好消息：AI 编码工具生态**已收敛到 Claude Code 的 hook 模型**——`hook_event_name` / `tool_name` / `session_id` / `cwd` + stdin JSON 几乎成事实标准。所以**同一个转发器 `hooks/cc_state_push.py` 一份通吃**，多数工具只需在各自配置里把它注册成 hook 命令、带上 `CLAUDE_OFFICE_*` 环境变量即可。

转发器内置**事件名/字段归一**（`canon_event` / `canon_session` / `canon_tool`）：CC 原生直接认；Gemini 的 `BeforeTool`/`AfterTool`、Cline 的 `hookName`/`taskId`、Hermes 的 `pre_tool_call`/`agent:*` 都会被映射回规范 CC 事件名。

### 分层接入

| 层 | 工具 | hook 能力 | 配置位置 | 接入方式 |
|----|------|-----------|----------|----------|
| **T1 直接复用** | **Cursor** | 同字段同事件名（官方"匹配 Claude Code 行为"） | `.cursor/hooks.json` / `~/.cursor/hooks.json` | 注册本转发器即可，零改动 |
| | **Codex CLI** | 同字段同事件名 | `~/.codex/hooks.json` 或 `config.toml` `[hooks]` | 同上 |
| | **Continue.dev**(`cn`) | 同事件名，且**直接读 `.claude/settings.json`** | `.continue/settings.json` / `.claude/settings.json` | 复用你现成的 CC 配置 |
| | **Copilot agent**(VS Code) | CC 形（驼峰/下划线双认） | `.github/hooks/*.json` / `.copilot/settings.json` | 注册本转发器 |
| **T2 已归一** | **Gemini CLI** | stdin 同形，事件名 `BeforeTool`/`AfterTool`/`BeforeAgent`/`AfterAgent` | `.gemini/settings.json` `hooks` | 转发器已映射，直接用 |
| | **Cline**(VS Code) | shell-only（不能直接 HTTP），字段 `hookName`/`taskId` | `<config>/hooks/` 脚本按事件名命名 | 脚本里调 `python3 .../cc_state_push.py`（转发器替它发 HTTP） |
| | **Hermes**(NousResearch) | shell hook，事件 `pre_tool_call`/`agent:*` | `~/.hermes/config.yaml` | 转发器已映射，直接用 |
| **T3 自有 schema** | **Antigravity** / **OpenClaw** | 有 webhook / SDK，但 schema 自定义 | `.agents/hooks.json` / OpenClaw webhooks | 走 webhook **直推 `/cc/push`**（见下方通用契约），或 SDK 装饰器里 POST |
| **T4 无 hook** | **Trae** / **Roo Code** | 无生命周期 hook | — | 轮询 trajectory/日志文件 或 用 MCP server 垫一层后再推（暂未内置） |

> 每个接入方按 RUNBOOK.md §八「多机内网接入」的 settings.json 块设 `CLAUDE_OFFICE_URL/LABEL/CHANNEL/TOKEN`，把命令换成各工具的配置格式。`CLAUDE_OFFICE_CHANNEL` 决定光环色（见 §七）。

### 通用契约（任意 webhook / 脚本直推）

凡能发 HTTP 的（Antigravity/OpenClaw webhook、CI、自写脚本），直接 `POST /cc/push`：

```bash
curl -X POST http://192.168.1.50:19000/cc/push \
  -H 'Content-Type: application/json' \
  -H 'X-Office-Token: <口令，后端设了 CC_PUSH_TOKEN 才需要>' \
  -d '{"type":"state","sessionId":"my-agent-1","room":"我的Agent","channel":"openclaw","state":"writing","detail":"✍️ 干活中"}'
```

字段：`type`(state/delegate/subagent_done/session_end)、`sessionId`(必填，定位办公室)、`room`(名牌)、`channel`(光环色)、`state`(idle/thinking/researching/writing/executing/delegating/waiting/error)、`detail`(可选文案)。`delegate` 额外带 `name`(子代理名)。

### 实测归一（本地验证过的 payload）

```bash
# Cursor(conversation_id) / Gemini(BeforeTool) / Cline(hookName+taskId) / Hermes(pre_tool_call) 均正确上板
echo '{"hookName":"PreToolUse","tool_name":"Read","taskId":"cline-x","cwd":"/x"}' \
  | CLAUDE_OFFICE_LABEL=Cline用户 CLAUDE_OFFICE_CHANNEL=cline python3 hooks/cc_state_push.py
```

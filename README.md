# Agent Office Dashboard

> 把 Claude Code（及后续各类 agent）的**实时活动**，变成一座**会动的微缩办公室**。
> 会话 = 一间办公室，主循环 = 头儿👑，子代理 = 员工🧑‍💻。
> An animated miniature office that visualizes live AI-agent activity. One session = one office, main loop = the boss, sub-agents = employees.

---

## 这是什么

每当 Claude Code 在工作——读文件、写代码、跑命令、派子代理、报错——办公室里的小人就实时切换状态：查阅 🔍 / 写文件 ✍️ / 执行 ⚙️ / 派活 👥 / 出错 ⚠️ / 待命 ☕。

它不是严肃的监控面板，而是一个**好玩的、有点技术浪漫主义的**活看板：

- 🏢 **微缩办公楼**：每个会话一间办公室，永不空楼
- 🌦 **天气彩蛋**：按你所在城市的**真实天气**驱动光照与天空（晴/多云/雨/雪/雾/雷暴 + 昼夜），下雨真的会下雨、夜里办公室亮灯
- 🚥 **墙顶状态灯**：每间办公室墙顶 LED 按主 agent 状态发光——进行中(绿) / 待授权(橙) / 待命(白) / AUTOMODE(初音绿) / 出错(红)
- 🎨 **来源工具光环**：主 agent 背后光环按来源工具上色（claude / cursor / gemini / kimi / codex …），一眼看出谁在用什么工具
- 🖥 **DGX·B300 机房**：探测一个监控网址的连通性，顶栏绿灯在线 / 红灯离线（2D版本残留但喜欢这个实现，保留）
- 👾 **出错怪兽**：agent 报错时，那间办公室会冒出一只怪兽，错误解除后离场（2D版本残留但喜欢这个实现，保留）

## 看板视图

**3D 微缩办公室**（Three.js · 正交 iso · 软阴影 · 移轴景深 · 暖色调），可 🖱 拖拽旋转、滚轮缩放，像把玩一个桌面模型。

- 地址：`/office` 或 `/static/office3d.html`
- 调试任意天气：`/static/office3d.html?sky=rain&tod=night`（sky ∈ clear/partly/cloudy/fog/rain/storm/snow）

> 早期的 2D Canvas 等距视图已退役（渲染代码移除）；仅遗留一个旧首页仍挂在 `/` 根路由，见下「素材与开源须知」。

## 架构（数据层与渲染层解耦）

```
Claude Code hook 事件
        │  hooks/cc_state_push.py（纯标准库 / 出错静默 / 永不阻塞工具）
        ▼  POST /cc/push
Flask 后端 backend/app.py  (127.0.0.1:19000)
        │  纯文件存储 cc-rooms.json，无数据库
        ▼  GET /cc/rooms · /cc/weather（前端轮询）
前端渲染层  frontend/office3d.{html,js}（Three.js 3D，本地 vendoring three r160）
```

> **关键设计**：hook + 后端是稳定的**数据层**，渲染层读同一个 `/cc/rooms`，换皮不动骨——早期有过 2D Canvas 渲染层，现已统一到 3D。

## 快速开始

```bash
# 1. 依赖
python3 -m venv .venv
.venv/bin/python -m pip install flask==3.0.2 pillow==10.4.0

# 2. 起后端（监听 127.0.0.1:19000）
.venv/bin/python backend/app.py

# 3. 打开看板（3D 微缩）
#    http://127.0.0.1:19000/office  （等价 /static/office3d.html）
```

接入 Claude Code：在 `~/.claude/settings.json` 的相关事件里追加调用 `hooks/cc_state_push.py`（详见 [RUNBOOK.md](RUNBOOK.md) 第八节，含一键回滚脚本）。

调试画面用的 URL 参数（季节 / 昼夜 / 天气 / 光照 / 辉光 / 粒子等全表）见 [docs/debug-parameters.md](docs/debug-parameters.md)，例如 `?season=winter&tod=night&sky=snow`。

想先看满屏效果？喂个假事件造演示办公室（按 TTL 自动消失）：

```bash
printf '{"hook_event_name":"PreToolUse","tool_name":"Edit","session_id":"demo","cwd":"/x/我的项目"}' \
  | python3 hooks/cc_state_push.py
```

完整的起停、数据流、踩坑记录见 **[RUNBOOK.md](RUNBOOK.md)**。

## 多 Agent 接入（内网 · 各类工具）

看板不只看自己——**全公司同一内网的 agent 都能上同一块板**。每个会话一间办公室，
来源工具决定背后光环色，状态驱动墙顶 LED（进行中绿/待授权橙/待命白/AUTOMODE 初音绿/出错红）。

**Claude Code 一键接入**（在仓库目录内）：

```bash
python3 tools/office-join/install.py \
  --label "你的名字" --channel claude \
  --url http://10.31.3.100:19000     # 本机用 127.0.0.1；内网填后端机的局域网 IP
  # 后端开了鉴权再加 --token
```

幂等可重跑、写前自动备份、`--uninstall` 一键撤销。这个 agent 也能自己读
[`tools/office-join/SKILL.md`](tools/office-join/SKILL.md) 学着接入。

**其它工具**：生态已收敛到 Claude Code 的 hook 模型，**同一个 `hooks/cc_state_push.py` 一份通吃**——
Cursor / Codex / Continue / Copilot 直接复用，Gemini / Cline / Hermes 由 hook 自动归一事件名，
Antigravity / OpenClaw 走 webhook 直推 `/cc/push`。各工具配置位置、通用 HTTP 契约、channel 配色表见
[`tools/office-join/README.md`](tools/office-join/README.md)。

接入用的环境变量（`CLAUDE_OFFICE_URL/LABEL/CHANNEL/TOKEN`）、内网放行、轻量鉴权（`CC_PUSH_TOKEN`）
详见 [RUNBOOK.md](RUNBOOK.md) 第八节与 [docs/debug-parameters.md](docs/debug-parameters.md) 第七/八节。

## 技术栈

- 后端：Python 3 + Flask（纯文件状态，零数据库）
- 前端：[Three.js](https://threejs.org/) r160（本地 vendoring，无 CDN 运行时依赖）

## ⚠️ 素材与开源须知

代码以 **MIT** 开源。资产现状：

- **3D 版（office3d，推荐）**：家具/角色/四季底座植被（树·花）均为 [Kenney](https://kenney.nl/) 的 **CC0 1.0（公共领域，可商用）** 低模资产；天空/光照/雨雪/辉光为程序生成。✅ 可随仓公开。
- **2D 版（旧，已退役）**：独立的 2D 素材文件与渲染引擎已移除，主视图 `/office` 现指向 3D。仅遗留旧首页 `frontend/index.html`（及其派生 `electron-standalone.html`，仍由 `/` 根路由服务）内嵌了个别历史图片——**对外公开 / 商用前请审查并替换其中可能的第三方 IP**；当前推荐路径（3D 看板 + [`tools/office-join/`](tools/office-join/) 接入）不依赖它们。

## 致谢

- Fork 自 [ringhyacinth/Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI)（MIT），借鉴了其角色移动算法等思路；本项目的多办公室数据模型、hook 桥接、iso/3D 渲染、天气与机房彩蛋为重写。
- 3D 资产：[Kenney](https://kenney.nl/) **Furniture Kit**（家具）+ **Mini Characters**（角色）+ **Platformer Kit**（春/夏底座的树·花）+ **Survival Kit**（秋天的橙色松树·篝火）+ **Holiday Kit**（冬天的圣诞树·雪人·礼物），均 CC0 1.0，由 Kenney 制作发布，详见 `frontend/vendor/kenney/licenses/`。
- 3D 渲染：[Three.js](https://threejs.org/)（MIT）。

## 许可

[MIT](LICENSE) © 2026 MATYPE

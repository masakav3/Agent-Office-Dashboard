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
- 🖥 **DGX·B300 机房**：探测一个监控网址的连通性，绿灯在线 / 红灯离线
- 👾 **出错怪兽**：agent 报错时，那间办公室会冒出一只怪兽，错误解除后离场
- 🚗 **门口车流**：车流密度 = 全楼上下文占用率（越忙越堵）

## 两种视图

| 视图 | 地址 | 技术 |
|---|---|---|
| **3D 微缩**（开发中，推荐）| `/static/office3d.html` | Three.js · 正交 iso · 软阴影 · 移轴景深 · 暖色调 |
| **2D 等距**（稳定）| `/office` | 自绘 Canvas 2D 斜 45° iso |

3D 版可以 🖱 拖拽旋转、滚轮缩放，像把玩一个桌面模型。
调试任意天气：`/static/office3d.html?sky=rain&tod=night`（sky ∈ clear/partly/cloudy/fog/rain/storm/snow）。

## 架构（数据层与渲染层解耦）

```
Claude Code hook 事件
        │  hooks/cc_state_push.py（纯标准库 / 出错静默 / 永不阻塞工具）
        ▼  POST /cc/push
Flask 后端 backend/app.py  (127.0.0.1:19000)
        │  纯文件存储 cc-rooms.json，无数据库
        ▼  GET /cc/rooms · /cc/weather（前端轮询）
前端渲染层  frontend/office.{html,js}（2D）  ·  frontend/office3d.{html,js}（3D）
```

> **关键设计**：hook + 后端是稳定的**数据层**；2D / 3D 只是可替换的**渲染层**，读同一个 `/cc/rooms`。换皮不动骨。

## 快速开始

```bash
# 1. 依赖
python3 -m venv .venv
.venv/bin/python -m pip install flask==3.0.2 pillow==10.4.0

# 2. 起后端（监听 127.0.0.1:19000）
.venv/bin/python backend/app.py

# 3. 打开看板
#    3D: http://127.0.0.1:19000/static/office3d.html
#    2D: http://127.0.0.1:19000/office
```

接入 Claude Code：在 `~/.claude/settings.json` 的相关事件里追加调用 `hooks/cc_state_push.py`（详见 [RUNBOOK.md](RUNBOOK.md) 第八节，含一键回滚脚本）。

想先看满屏效果？喂个假事件造演示办公室（按 TTL 自动消失）：

```bash
printf '{"hook_event_name":"PreToolUse","tool_name":"Edit","session_id":"demo","cwd":"/x/我的项目"}' \
  | python3 hooks/cc_state_push.py
```

完整的起停、数据流、踩坑记录见 **[RUNBOOK.md](RUNBOOK.md)**。

## 技术栈

- 后端：Python 3 + Flask（纯文件状态，零数据库）
- 2D：原生 Canvas 2D
- 3D：[Three.js](https://threejs.org/) r160（本地 vendoring，无 CDN 运行时依赖）

## ⚠️ 素材与开源须知

本仓**代码以 MIT 协议开源**。但当前部分**美术素材是第三方 IP**（示例海报、角色、车辆品牌标识等），仅供本地/学习演示。

**在把仓库公开或商用之前，必须把这些素材替换为 CC0 / 自有 / 已授权资源**——MIT 只覆盖代码，不覆盖这些图片的版权。路线上 3D 版将统一改用 [Kenney](https://kenney.nl/)（CC0）等可商用低模资产，届时一并清除该风险。

## 致谢

- Fork 自 [ringhyacinth/Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI)（MIT），借鉴了其角色移动算法等思路；本项目的多办公室数据模型、hook 桥接、iso/3D 渲染、天气与机房彩蛋为重写。

## 许可

[MIT](LICENSE) © 2026 MATYPE

# Contributing · 参与贡献

欢迎一起把这座"会动的 Agent 办公室"做得更好！本指南帮你快速上手。
（English speakers: this guide is bilingual-friendly; key commands are language-neutral.）

## 先跑起来 · Run it locally

```bash
git clone https://github.com/masakav3/Agent-Office-Dashboard.git
cd Agent-Office-Dashboard
python3 -m venv .venv
.venv/bin/python -m pip install flask==3.0.2 pillow==10.4.0
.venv/bin/python backend/app.py          # → http://127.0.0.1:19000/office
```

造几间演示办公室看效果：

```bash
printf '{"hook_event_name":"PreToolUse","tool_name":"Edit","session_id":"demo","cwd":"/x/demo"}' \
  | python3 hooks/cc_state_push.py
# 或强制 N 间： 打开 /static/office3d.html?rooms=6
```

让自己的 Claude Code 上板：`python3 tools/office-join/install.py --label "你的名字" --channel claude`

## 仓库结构 · Layout

| 路径 | 作用 |
|---|---|
| `hooks/cc_state_push.py` | 状态上报钩子（纯标准库，出错静默，永不阻塞工具） |
| `backend/app.py` | Flask 后端：`/cc/push` 收状态、`/cc/rooms` 出状态、`/cc/weather`、`/cc/monitor` |
| `frontend/office3d.{html,js}` | Three.js 3D 渲染层（读 `/cc/rooms`） |
| `frontend/vendor/` | three r160 + Kenney CC0 资产（本地 vendoring，勿引 CDN） |
| `tools/office-join/` | 多 agent 接入包（一键安装器 + SKILL + 各工具说明） |
| `RUNBOOK.md` · `docs/debug-parameters.md` | 起停/数据流/踩坑 · 全套调试 URL 参数 |

> **数据层 / 渲染层解耦**是本项目的核心约定：改观感只动 `frontend/office3d.*`，改状态语义动 hook + 后端。两边都读同一个 `/cc/rooms`，换皮不动骨。

## 怎么提改动 · How to contribute

1. Fork → 新建分支（`feat/xxx` 或 `fix/xxx`）
2. 改动尽量聚焦单一主题；提交信息用 `feat: / fix: / docs: / refactor:` 前缀
3. 本地自测：后端能起、`/office` 能开、相关功能在真实场景走一遍（多窗口/多状态）
4. 开 Pull Request，说明**改了什么 + 为什么 + 怎么验证**；UI 改动请附前后截图
5. 等 review，根据反馈迭代

## 约定 · Conventions

- **Python**：标准库优先、出错不阻塞工具链；hook 永远 `exit 0`、不向 stdout 写东西
- **前端**：动效只用 compositor 友好属性（transform/opacity）；新资产必须是 **CC0 或原创**（本项目要保持可公开/可商用，勿引第三方 IP）
- **不提交运行时/密钥文件**：`cc-rooms.json`、`.env`、`join-keys.json`、`state.json` 等已在 `.gitignore`，请勿强加
- **状态色/光环色**：改 `office3d.js` 的 `LED_COLOR` / `channelHalo()`，并同步 `docs/debug-parameters.md` 第七/八节
- **文档同步**：改了行为顺手更新 README / RUNBOOK，避免文档漂移

## 报 Issue · Reporting

带上：复现步骤、期望 vs 实际、截图（视觉问题）、浏览器/OS。有想法也欢迎开 Discussion 聊。

## 行为准则 · Code of conduct

对人友善、对事直接。这是个好玩的项目，保持轻松协作的氛围即可。

## License

贡献即视为以 [MIT](LICENSE) 协议授权本项目使用。

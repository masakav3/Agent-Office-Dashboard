# office-join · 接入 Agent 办公室看板

把任意一台机器上的 AI 编码 agent（Claude Code 及兼容工具）的实时状态，推到「Agent 办公室看板」。
一个会话 = 一间会动的办公室：主 agent = 头儿、子代理 = 员工，状态驱动墙顶 LED 与小人动作，
来源工具决定背后光环色。**只上报状态词 + 简短描述 + 名牌，不含代码/对话内容**；出错静默、永不阻塞工具。

数据链路：`你的工具 → hook(cc_state_push.py) → POST /cc/push → 后端 → 看板 /static/office3d.html`。

---

## 1. Claude Code（最简单，一键）

在 **claude-office 仓库目录内**：

```bash
python3 tools/office-join/install.py \
  --label "你的名字" --channel claude \
  --url http://192.168.1.50:19000        # 本机用 http://127.0.0.1:19000
  # 后端开了鉴权再加: --token 团队口令
```

- 幂等：重复运行 = 更新（不会重复挂）。写前备份 `~/.claude/settings.json.bak-office-join`。
- 预览不落盘：加 `--print`。撤销：`--uninstall`。
- 装好后命令行会给一条"自测一行"，粘贴运行即可验证。**新开会话生效。**

> 这个 agent 自己也能学着装：让它读 [SKILL.md](SKILL.md)（或把该文件放进 `~/.claude/skills/`）。

## 2. 不是 Claude Code？按层接入

生态已收敛到 Claude Code 的 hook 模型（`hook_event_name`/`tool_name`/`session_id`/`cwd` + stdin JSON），
所以**同一个 `hooks/cc_state_push.py` 一份通吃**，只是各工具注册 hook 的位置/事件名不同。

| 层 | 工具 | 接入方式 | 配置位置 |
|----|------|----------|----------|
| **直接复用** | Cursor | 注册本 hook（同字段同事件名） | `.cursor/hooks.json` / `~/.cursor/hooks.json` |
| | Codex CLI | 同上 | `~/.codex/hooks.json` 或 `config.toml [hooks]` |
| | Continue.dev(`cn`) | 直接读 `.claude/settings.json`，复用你现成的配置 | `.continue/settings.json` |
| | Copilot agent(VS Code) | 注册本 hook | `.github/hooks/*.json` |
| **已归一** | Gemini CLI | 事件名 `BeforeTool/AfterTool/...`，hook 已映射 | `.gemini/settings.json` |
| | Cline(VS Code) | shell 脚本里调 `python3 .../cc_state_push.py` | `<config>/hooks/` |
| | Hermes | 事件 `pre_tool_call/agent:*`，hook 已映射 | `~/.hermes/config.yaml` |
| **webhook 直推** | Antigravity / OpenClaw | 自有 schema，走 webhook 直接 POST `/cc/push`（见下） | `.agents/hooks.json` / OpenClaw webhooks |
| **暂需轮询** | Trae / Roo Code | 无生命周期 hook，轮询 trajectory/日志后转推 | — |

每个工具注册 hook 时，命令同样形如：
`CLAUDE_OFFICE_URL=… CLAUDE_OFFICE_LABEL=… CLAUDE_OFFICE_CHANNEL=… python3 <绝对路径>/cc_state_push.py`

## 3. 通用契约（任意 webhook / 脚本 / CI 直推）

能发 HTTP 的，直接 POST `/cc/push`：

```bash
curl -X POST http://192.168.1.50:19000/cc/push \
  -H 'Content-Type: application/json' \
  -H 'X-Office-Token: <口令，后端设了 CC_PUSH_TOKEN 才需要>' \
  -d '{"type":"state","sessionId":"my-agent-1","room":"我的Agent","channel":"openclaw","state":"writing","detail":"✍️ 干活中"}'
```

字段：`type`(state/delegate/subagent_done/session_end) · `sessionId`(必填,定位办公室) · `room`(名牌) ·
`channel`(光环色) · `state`(idle/thinking/researching/writing/executing/delegating/waiting/error) · `detail`(可选)。

## channel → 光环色

`claude`(橙) · `openclaw`(红) · `hermes`(血橙) · `codex`(薰衣草紫) · `gemini`/`antigravity`(黄) ·
`kimi`(蓝) · `cursor`(黑+白描边) · `trae`(荧光绿) · `vscode`(天蓝) · `cline`(青绿) ·
`continue`(靛蓝) · `copilot`(钢灰+白描边) · 其它(粉)

## 看板上看到的状态（5 种 LED）

进行中(荧光绿) · 待授权(荧光橙) · 待命中(白) · AUTOMODE(初音绿) · 出错了(荧光红)。

---

更细的环境变量、内网/防火墙、鉴权、TTL 等见仓库 [RUNBOOK.md](../../RUNBOOK.md) 第八节
与 [docs/debug-parameters.md](../../docs/debug-parameters.md) 第七/八节。

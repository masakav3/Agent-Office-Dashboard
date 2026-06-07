---
name: join-agent-office
description: 把当前 agent(Claude Code 或兼容工具)接入"Agent 办公室看板"——一条命令把状态上报 hook 装进 settings.json，你的会话就会变成看板里一间会动的办公室(主 agent=头儿，子代理=员工，状态驱动 LED/动作)。当用户说"加入办公室看板/接入 office dashboard/join office/上报我的状态到看板"时使用。
---

# Join Agent Office（接入办公室看板）

把这个 agent 的实时状态推到 Agent 办公室看板。一个会话 = 一间办公室；状态(进行中/待授权/待命/出错/automode)驱动墙顶 LED 颜色与小人动作；来源工具决定背后光环色。

## 前置信息（先向用户确认）

1. **看板后端地址** `--url`：起后端那台机的地址。本机就是 `http://127.0.0.1:19000`；
   内网别人的机器填其局域网 IP，如 `http://192.168.1.50:19000`。
2. **你的名牌** `--label`：显示在地面名牌上的名字（如"王五的Claude"）。可留空（看板会用
   你的会话首条提问或目录名兜底）。
3. **来源工具** `--channel`：决定光环色。Claude Code 填 `claude`；其它见下表。
4. **接入口令** `--token`：仅当后端开了鉴权(`CC_PUSH_TOKEN`)时才需要，问用户要。

> 隐私：hook 只上报状态词 + 简短中文描述 + 上下文占用% + 名牌，**不含代码/对话内容**。
> 出错静默、永不阻塞工具。随时可 `--uninstall` 移除。

## 一键接入（推荐）

在 **claude-office 仓库目录内** 运行（按用户给的值替换）：

```bash
python3 tools/office-join/install.py \
  --label "你的名字" --channel claude \
  --url http://127.0.0.1:19000        # 内网填后端机的局域网 IP
  # 后端开了鉴权再加: --token 团队口令
```

它会幂等地把 hook 接到 8 个生命周期事件（写前备份 `settings.json`）。**新开会话生效**。

先预览不落盘：加 `--print`。撤销：`python3 tools/office-join/install.py --uninstall`。

## channel → 光环色

`claude`(橙) · `openclaw`(红) · `hermes`(血橙) · `codex`(薰衣草紫) · `gemini`/`antigravity`(黄) ·
`kimi`(蓝) · `cursor`(黑+白描边) · `trae`(荧光绿) · `vscode`(天蓝) · `cline`(青绿) ·
`continue`(靛蓝) · `copilot`(钢灰+白描边) · 其它(粉)

## 验证

安装后命令行会打印一条"自测一行"，直接粘贴运行；然后打开 `<url>/static/office3d.html`
应能看到你的办公室。或在本会话里随便调个工具，看板上对应办公室 LED 应变"进行中"绿。

## 不是 Claude Code？

Cursor / Codex CLI / Continue / Copilot 与 CC 同形，**直接复用同一个 hook**，只是注册位置不同；
Gemini / Cline / Hermes 事件名不同但已被 hook 归一；Trae / Roo Code 暂无 hook 需轮询。
各工具的具体配置位置见同目录 [README.md](README.md) 与 `docs/debug-parameters.md` 第八节。

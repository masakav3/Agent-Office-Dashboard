#!/usr/bin/env python3
"""
office-join · 把"Agent 办公室看板"的状态上报 hook 一键装进 Claude Code（或兼容工具）。

让任意一台机器上的 Claude Code（及 Cursor / Codex / Continue / Copilot 等 CC-hook 兼容工具）
把自己的实时状态推到看板。它只改 settings.json 的 hooks/env，不动你的代码。

用法：
  # 安装/更新（再次运行=更新，不会重复追加）
  python3 install.py --label "王五的Claude" --channel claude \
      --url http://192.168.1.50:19000 [--token 团队口令]

  # 只看将写入什么，不落盘
  python3 install.py --label X --channel claude --print

  # 卸载（移除本看板 hook，保留其它）
  python3 install.py --uninstall

参数：
  --label    办公室名牌（你的名字）。留空则看板用"会话首条提问 / cwd 目录名"兜底。
  --channel  来源工具 → 决定主 agent 背后光环色：
             claude/openclaw/hermes/codex/gemini/kimi/cursor/trae/vscode/cline/continue/copilot
  --url      后端地址（默认 http://127.0.0.1:19000）。内网填起后端那台机的局域网 IP。
  --token    共享接入口令（仅当后端设了 CC_PUSH_TOKEN 时需要）。
  --settings 目标 settings.json（默认 ~/.claude/settings.json）。
  --hook     hook 脚本路径（默认自动定位本仓库的 hooks/cc_state_push.py）。
  --uninstall / --print

幂等 + 安全：重复运行先清掉旧的本看板 hook 再写；写前备份到 <settings>.bak-office-join。
非 Claude Code 工具（事件 schema 不同的 Cursor/Gemini/Cline/Hermes…）接入见同目录 README.md。
"""
import argparse
import json
import os
import shlex
import sys
import tempfile

# Claude Code 上报需要挂的 8 个生命周期事件
EVENTS = [
    "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop",
    "SessionEnd", "Notification", "PermissionRequest", "SessionStart",
]
MARK = "cc_state_push.py"   # 识别"本看板 hook"的标记（幂等/卸载据此匹配）


def default_hook_path() -> str:
    """tools/office-join/install.py → 仓库根 → hooks/cc_state_push.py"""
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, "..", ".."))
    return os.path.join(root, "hooks", "cc_state_push.py")


def build_command(hook: str, label: str, channel: str, url: str, token: str) -> str:
    """命令前内联 CLAUDE_OFFICE_* 环境变量（最稳妥，不依赖 settings.json 的 env 块是否透传给 hook）。"""
    env = []
    if url:
        env.append(f"CLAUDE_OFFICE_URL={shlex.quote(url)}")
    if label:
        env.append(f"CLAUDE_OFFICE_LABEL={shlex.quote(label)}")
    if channel:
        env.append(f"CLAUDE_OFFICE_CHANNEL={shlex.quote(channel)}")
    if token:
        env.append(f"CLAUDE_OFFICE_TOKEN={shlex.quote(token)}")
    prefix = (" ".join(env) + " ") if env else ""
    return f'{prefix}python3 {shlex.quote(hook)}'


def is_ours(group: dict) -> bool:
    return any(MARK in (h.get("command", "") or "") for h in group.get("hooks", []))


def main() -> None:
    ap = argparse.ArgumentParser(description="把 Agent 办公室看板状态上报 hook 装进 settings.json")
    ap.add_argument("--label", default="")
    ap.add_argument("--channel", default="")
    ap.add_argument("--url", default="http://127.0.0.1:19000")
    ap.add_argument("--token", default="")
    ap.add_argument("--settings", default=os.path.expanduser("~/.claude/settings.json"))
    ap.add_argument("--hook", default="")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--print", dest="dry", action="store_true", help="只打印将写入的配置，不落盘")
    a = ap.parse_args()

    hook = a.hook or default_hook_path()
    if not a.uninstall and not os.path.isfile(hook):
        sys.exit(f"找不到 hook 文件: {hook}\n请在 claude-office 仓库内运行，或用 --hook 指定其绝对路径。")

    SET = a.settings
    original = ""
    if os.path.isfile(SET):
        original = open(SET, encoding="utf-8").read()
        try:
            cfg = json.loads(original) if original.strip() else {}
        except Exception as e:
            sys.exit(f"settings.json 解析失败（请先修正 JSON）: {e}")
    else:
        cfg = {}
    hooks = cfg.setdefault("hooks", {})

    # 先移除所有旧的"本看板" group（幂等：重装=更新；同时实现卸载）
    removed = 0
    for ev in list(hooks.keys()):
        kept = [g for g in (hooks.get(ev) or []) if not is_ours(g)]
        removed += len(hooks.get(ev) or []) - len(kept)
        hooks[ev] = kept

    if a.uninstall:
        summary = f"卸载完成：移除了 {removed} 处本看板 hook（其它 hook 原样保留）"
    else:
        cmd = build_command(hook, a.label, a.channel, a.url, a.token)
        for ev in EVENTS:
            hooks.setdefault(ev, []).append(
                {"hooks": [{"type": "command", "command": cmd, "timeout": 5}]}
            )
        summary = f"安装/更新完成：{len(EVENTS)} 个事件已接入\n  命令: {cmd}"

    if a.dry:
        print("# DRY-RUN（未写盘）\n" + summary)
        print(json.dumps({ev: hooks.get(ev) for ev in EVENTS}, ensure_ascii=False, indent=2))
        return

    os.makedirs(os.path.dirname(SET) or ".", exist_ok=True)
    if original:
        with open(SET + ".bak-office-join", "w", encoding="utf-8") as f:
            f.write(original)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(SET) or ".", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, SET)

    print(summary)
    if original:
        print(f"已备份原文件 → {SET}.bak-office-join")
    if not a.uninstall:
        print("\n新会话自动生效（部分版本当前会话也会热加载）。自测一行：")
        verify = build_command(hook, a.label or "冒烟", a.channel or "claude", a.url, a.token)
        print(f"  echo '{{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Edit\","
              f"\"session_id\":\"smoke\",\"cwd\":\"/x\"}}' | {verify}")
        print(f"然后打开看板（{a.url}/static/office3d.html）应能看到你的办公室。")


if __name__ == "__main__":
    main()

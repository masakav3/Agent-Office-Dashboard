#!/usr/bin/env python3
"""
claude-office · Claude Code 状态转发钩子（Phase 2：多办公室）

多个 Claude Code hook 事件共用本脚本：读 stdin 的事件 JSON，按
(hook_event_name, tool_name) 映射成"办公室操作"，POST 到本地后端 /cc/push。

  会话(session_id) = 一间办公室(room)
  主循环           = 头儿(boss)         —— 大多数事件驱动它的状态
  PreToolUse(Task) = 派活，房间里冒出一个员工(employee)
  SubagentStop     = 一个员工干完离场

设计铁律（照抄 ~/.claude/hooks/report_token_usage.py 的防御式风格）：
  - 纯标准库，系统 python3 直接可跑，零依赖。
  - 出任何错都静默吞掉，永远 exit 0，绝不阻塞 Claude Code 的工具调用。
  - 永远不向 stdout 写东西（PreToolUse 等事件会解读 stdout，必须保持安静）。
  - 后端没起 / 连不上 -> 静默 no-op。

用法（settings.json 里各事件追加这一行，全事件共用）：
  python3 ~/Documents/GitHub/claude-office/hooks/cc_state_push.py

环境变量：
  CLAUDE_OFFICE_URL    后端地址，默认 http://127.0.0.1:19000
  CLAUDE_OFFICE_DEBUG  设为 1 时把每次事件追加到 /tmp/claude-office-hook.log
AIGC CLAUDE-OPUS-4-8 2026-06-04
"""

import json
import os
import sys
import urllib.request
from typing import Optional, Tuple

DEFAULT_URL = "http://127.0.0.1:19000"
PUSH_PATH = "/cc/push"
HTTP_TIMEOUT_SECONDS = 1.5

RESEARCH_TOOLS = frozenset(
    {"Read", "Grep", "Glob", "LS", "NotebookRead", "WebSearch", "WebFetch", "ToolSearch"}
)
WRITE_TOOLS = frozenset({"Edit", "Write", "MultiEdit", "NotebookEdit"})
EXEC_TOOLS = frozenset({"Bash", "BashOutput", "KillShell", "KillBash"})


# AI-BLOCK-GC-START CLAUDE-OPUS-4-8 2026-06-04
def classify_tool(tool_name: str) -> Tuple[str, str]:
    """工具名 -> (state, detail)。未知工具按"执行中"兜底。"""
    if tool_name in RESEARCH_TOOLS:
        return "researching", f"🔍 查阅 · {tool_name}"
    if tool_name in WRITE_TOOLS:
        return "writing", f"✍️ 写文件 · {tool_name}"
    if tool_name in EXEC_TOOLS:
        return "executing", f"⚙️ 跑命令 · {tool_name}"
    if tool_name == "Skill":
        return "executing", "✨ 跑技能…"
    if tool_name.startswith("mcp__"):
        return "researching", "🔌 调 MCP 工具…"
    return "executing", f"⚙️ 处理中 · {tool_name or '工具'}"


def has_tool_error(data: dict) -> bool:
    """best-effort 判断这次工具调用是否报错（schema 不保证，保守判定）。"""
    resp = data.get("tool_response")
    if isinstance(resp, dict) and resp.get("is_error") is True:
        return True
    if data.get("tool_error"):
        return True
    return False


def subagent_name(data: dict) -> str:
    """从 Task 工具输入里取子代理名/描述当员工名牌。"""
    ti = data.get("tool_input")
    if isinstance(ti, dict):
        for k in ("subagent_type", "description"):
            v = (ti.get(k) or "").strip()
            if v:
                return v
    return "子代理"


def base_label(cwd: str) -> str:
    """工作目录末级目录名当办公室名。"""
    cwd = (cwd or "").rstrip("/")
    return os.path.basename(cwd) or cwd or "office"


def build_op(data: dict) -> Optional[dict]:
    """把一次 hook 事件映射成 /cc/push 的 op；None 表示忽略。"""
    session_id = (data.get("session_id") or "").strip()
    if not session_id:
        return None  # 无法归属到办公室，跳过
    event = (data.get("hook_event_name") or "").strip()
    tool_name = (data.get("tool_name") or "").strip()
    base = {"sessionId": session_id, "room": base_label(data.get("cwd") or "")}

    if event == "UserPromptSubmit":
        return {**base, "type": "state", "state": "thinking", "detail": "🧠 思考中…"}
    if event == "PreToolUse":
        if tool_name in {"Task", "Agent"}:
            return {**base, "type": "delegate", "name": subagent_name(data)}
        state, detail = classify_tool(tool_name)
        return {**base, "type": "state", "state": state, "detail": detail}
    if event == "PostToolUse":
        if has_tool_error(data):
            return {**base, "type": "state", "state": "error", "detail": "⚠️ 出错了，排查中…"}
        return {**base, "type": "state", "state": "thinking", "detail": "🧠 思考中…"}
    if event in {"PermissionRequest", "Notification"}:
        msg = (data.get("message") or "").strip()
        return {**base, "type": "state", "state": "waiting",
                "detail": (f"⏳ {msg}" if msg else "⏳ 等你授权 / 需要你看一下…")}
    if event == "SubagentStop":
        return {**base, "type": "subagent_done"}
    if event == "Stop":
        return {**base, "type": "state", "state": "idle", "detail": "✅ 完成，待命中"}
    if event == "SessionEnd":
        return {**base, "type": "session_end"}
    return None
# AI-BLOCK-GC-END CLAUDE-OPUS-4-8 2026-06-04


CONTEXT_WINDOW = 1_000_000  # 按 1M 上下文算占用百分比（Opus 4.8 1M）


def ctx_pct_from_transcript(data: dict) -> Optional[float]:
    """读 transcript 末尾最近一条 assistant usage，算"已占上下文 / 1M"百分比。

    占用 ≈ input + cache_read + cache_creation（本轮真正喂给模型的 prompt token 量）。
    取不到/解析失败 -> None（不影响推送，后端按上次值兜底）。
    """
    path = (data.get("transcript_path") or "").strip()
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            back = min(size, 256 * 1024)          # 只读尾部 256KB，够覆盖最近若干轮
            f.seek(size - back)
            chunk = f.read().decode("utf-8", "ignore")
        for line in reversed(chunk.splitlines()):
            line = line.strip()
            if not line or '"usage"' not in line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            msg = obj.get("message")
            usage = msg.get("usage") if isinstance(msg, dict) else None
            if not isinstance(usage, dict):
                continue
            total = (int(usage.get("input_tokens", 0) or 0)
                     + int(usage.get("cache_read_input_tokens", 0) or 0)
                     + int(usage.get("cache_creation_input_tokens", 0) or 0))
            if total <= 0:
                continue
            return round(min(100.0, total / CONTEXT_WINDOW * 100.0), 1)
    except Exception:
        return None
    return None


def debug_log(line: str) -> None:
    if os.environ.get("CLAUDE_OFFICE_DEBUG", "").strip() not in {"1", "true", "yes", "on"}:
        return
    try:
        with open("/tmp/claude-office-hook.log", "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def push(op: dict) -> None:
    """POST /cc/push；超时短、出错全吞。"""
    base = os.environ.get("CLAUDE_OFFICE_URL", DEFAULT_URL).rstrip("/")
    payload = json.dumps(op).encode("utf-8")
    req = urllib.request.Request(
        f"{base}{PUSH_PATH}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS).read()


def main() -> None:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return
        data = json.loads(raw)
        if not isinstance(data, dict):
            return
        op = build_op(data)
        if op is not None:
            pct = ctx_pct_from_transcript(data)   # 把"上下文占用%"捎给后端，用于驱动门口车流密度
            if pct is not None:
                op["ctxPct"] = pct
        debug_log(f"{data.get('hook_event_name')!r} tool={data.get('tool_name')!r} -> {op}")
        if op is None:
            return
        push(op)
    except Exception as e:  # noqa: BLE001 — 钩子绝不能因任何异常而非零退出
        debug_log(f"ERROR: {e!r}")
    # 无论如何安静退出 0，且不向 stdout 输出任何内容


if __name__ == "__main__":
    main()
    sys.exit(0)

<!-- 中文版见 [README.md](README.md) · Chinese version: README.md -->

# Agent Office Dashboard

> Turn the **live activity** of Claude Code (and other AI agents) into an **animated miniature office**.
> One session = one office, the main loop = the boss 👑, sub-agents = employees 🧑‍💻.

---

## What is it

Whenever an agent works — reading files, writing code, running commands, spawning sub-agents, hitting errors — the little character in its office switches state in real time: researching 🔍 / writing ✍️ / executing ⚙️ / delegating 👥 / error ⚠️ / idle ☕.

It's not a serious monitoring panel, but a **playful, slightly tech-romantic** live board:

- 🏢 **Miniature office tower** — one office per session, never an empty building
- 🚥 **Wall status LED** — each office's ceiling LED glows by the boss agent's state: in-progress (green) / waiting-for-approval (orange) / idle (white) / AUTOMODE (Hatsune teal) / error (red)
- 🎨 **Source-tool halo** — the ring behind the boss is colored by its source tool (claude / cursor / gemini / kimi / codex …), so you can tell at a glance who's using what
- 🌦 **Weather Easter egg** — real weather of your city drives lighting & sky (clear / cloudy / rain / snow / fog / storm + day/night); rain actually falls, offices light up at night
- 🖥 **DGX·B300 server room** — probes a monitor URL; top-bar green dot online / red offline
- 👾 **Error monster** — when an agent errors, a monster pops up in that office and leaves when resolved

## The view

A **3D miniature office** (Three.js · orthographic iso · soft shadows · tilt-shift DOF · warm palette). Drag to rotate, scroll to zoom — like fiddling with a desktop model.

- URL: `/office` or `/static/office3d.html`
- Debug any weather: `/static/office3d.html?sky=rain&tod=night` (sky ∈ clear/partly/cloudy/fog/rain/storm/snow)

## Architecture (data layer & render layer decoupled)

```
Agent hook event
        │  hooks/cc_state_push.py (pure stdlib / silent on error / never blocks tools)
        ▼  POST /cc/push
Flask backend backend/app.py  (127.0.0.1:19000)
        │  plain-file store cc-rooms.json, no database
        ▼  GET /cc/rooms · /cc/weather (frontend polls)
Render layer  frontend/office3d.{html,js}  (Three.js 3D, three r160 vendored locally)
```

> **Key design**: the hook + backend are a stable **data layer**; the render layer reads the same `/cc/rooms`. Swap the skin without touching the bones.

## Quick start

```bash
# 1. deps
python3 -m venv .venv
.venv/bin/python -m pip install flask==3.0.2 pillow==10.4.0

# 2. start backend (listens on 127.0.0.1:19000)
.venv/bin/python backend/app.py

# 3. open the board (3D)
#    http://127.0.0.1:19000/office
```

Connect Claude Code — one command (inside the repo):

```bash
python3 tools/office-join/install.py --label "Your Name" --channel claude
# remote/intranet: add --url http://192.168.1.50:19000 (the backend host's LAN IP)
```

Want a full screen fast? Feed a fake event to spawn a demo office (auto-expires by TTL):

```bash
printf '{"hook_event_name":"PreToolUse","tool_name":"Edit","session_id":"demo","cwd":"/x/my-project"}' \
  | python3 hooks/cc_state_push.py
```

Full run/stop, data flow and gotchas: see **[RUNBOOK.md](RUNBOOK.md)** (Chinese).

## Multi-agent intranet access (various tools)

Everyone on the same LAN can share one board. The ecosystem has converged on Claude Code's hook model, so **a single `hooks/cc_state_push.py` works across tools** — Cursor / Codex / Continue / Copilot reuse it directly; Gemini / Cline / Hermes are normalized by the hook; Antigravity / OpenClaw can POST `/cc/push` via webhook.

Per-tool config, the generic HTTP contract and the channel→color table are in [`tools/office-join/`](tools/office-join/). Env vars (`CLAUDE_OFFICE_URL/LABEL/CHANNEL/TOKEN`), intranet firewall and the lightweight shared-token auth (`CC_PUSH_TOKEN`) are documented in RUNBOOK §8 and `docs/debug-parameters.md` §7/§8.

## Tech stack

- Backend: Python 3 + Flask (plain-file state, no database)
- Frontend: [Three.js](https://threejs.org/) r160 (vendored locally, no CDN runtime dependency)

## Assets & open-source notes

Code is **MIT**. 3D assets — furniture / characters / seasonal vegetation — are [Kenney](https://kenney.nl/) **CC0 1.0** low-poly assets; sky / lighting / rain-snow / glow are procedurally generated. ✅ Publishable. (An earlier 2D Canvas renderer has been retired; one legacy landing page `frontend/index.html` still embeds a couple of historical images — audit/replace any third-party IP before public/commercial use. The current 3D path does not depend on it.)

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgements

- Forked from [ringhyacinth/Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI) (MIT); the multi-office data model, hook bridge, iso/3D rendering, weather & server-room Easter eggs were rewritten.
- 3D assets: [Kenney](https://kenney.nl/) (CC0 1.0). Rendering: [Three.js](https://threejs.org/) (MIT).

## License

[MIT](LICENSE) © 2026 MATYPE

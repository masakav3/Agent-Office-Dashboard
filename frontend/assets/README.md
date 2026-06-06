# frontend/assets/ · iso 办公素材

这里放 AI 生成的等距办公素材（透明 PNG），由 `assets-manifest.json` 描述如何摆放。

- **怎么生成**：提示词全套见 `../../docs/asset-prompts.md`。
- **怎么命名**：见该文档 §5（如 `asset-desk.png`、`asset-monitors.png`…）。
- **manifest 字段**：见该文档 §7（也即本目录 `assets-manifest.json`）。
- **接入**：把 PNG 丢这里 → 在 `assets-manifest.json` 把对应 key 的 `ready` 改 `true`（或发我改）。
  `/office` 读 manifest 贴图；`ready:false` 或缺文件 → 自动回退到代码画的方块，不会开天窗。
- **一致性**：所有素材统一 iso 角度 + 透明背景 + 光从左上 + 用 `frontend/char-hero.png` 当 style ref。

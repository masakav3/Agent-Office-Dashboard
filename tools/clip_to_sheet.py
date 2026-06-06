#!/usr/bin/env python3
"""
clip_to_sheet · 把一段「图生视频」的 GIF / MP4 转成 /office 用的横排 sprite sheet，
并自动写回 frontend/char-frames.json。你只管出片段，拼接/对齐/抠背景/清单全交给它。

用法（用项目 venv 跑，里面有 Pillow）：
  .venv/bin/python tools/clip_to_sheet.py <state> raw/<片段.gif|mp4|mov> [选项]

state 取值: idle thinking researching writing executing delegating waiting error sleeping working

选项：
  --frames N     从片段里等距抽 N 帧（默认 6；2~6 都行，越多越顺越大）
  --height H     单帧高度像素（默认 480；全状态保持一致最稳）
  --key C        抠背景：auto=取左上角像素当背景色 / #00ff00 这类指定色 / none=不抠(默认 none)
  --fuzz F       抠背景容差（默认 60，越大抠得越狠）
  --webp         输出 .webp（更小，带透明）；默认 .png

示例：
  .venv/bin/python tools/clip_to_sheet.py writing raw/writing.mp4 --frames 6 --key auto
AIGC CLAUDE-OPUS-4-8 2026-06-04
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(ROOT, "frontend")
MANIFEST = os.path.join(FRONTEND, "char-frames.json")
VALID = {"idle", "thinking", "researching", "writing", "executing",
         "delegating", "waiting", "error", "sleeping", "working"}


def extract_frames(path: str) -> list:
    """读 GIF（PIL）或视频（ffmpeg）→ RGBA 帧列表（原始全部帧）。"""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".gif":
        im = Image.open(path)
        out = []
        try:
            while True:
                out.append(im.convert("RGBA"))
                im.seek(im.tell() + 1)
        except EOFError:
            pass
        return out
    # 视频走 ffmpeg
    tmp = tempfile.mkdtemp(prefix="clip2sheet_")
    subprocess.run(
        ["ffmpeg", "-i", path, "-vsync", "0", os.path.join(tmp, "f_%05d.png")],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    files = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
    return [Image.open(os.path.join(tmp, f)).convert("RGBA") for f in files]


def pick_even(frames: list, n: int) -> list:
    """等距抽 n 帧（避免取到与首帧重复的尾帧，利于循环）。"""
    if len(frames) <= n:
        return frames
    span = len(frames)
    idx = [round(i * (span - 1) / n) for i in range(n)]
    return [frames[i] for i in idx]


def chroma_key(img: Image.Image, key, fuzz: int) -> Image.Image:
    """把接近 key 颜色的像素设为透明。key=(r,g,b)。"""
    img = img.convert("RGBA")
    px = img.load()
    kr, kg, kb = key
    f2 = fuzz * fuzz * 3
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2
            if d <= f2:
                px[x, y] = (r, g, b, 0)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("state")
    ap.add_argument("clip")
    ap.add_argument("--frames", type=int, default=6)
    ap.add_argument("--height", type=int, default=480)
    ap.add_argument("--key", default="none")
    ap.add_argument("--fuzz", type=int, default=60)
    ap.add_argument("--webp", action="store_true")
    a = ap.parse_args()

    if a.state not in VALID:
        sys.exit(f"无效 state: {a.state}（可选: {', '.join(sorted(VALID))}）")
    if not os.path.exists(a.clip):
        sys.exit(f"找不到片段: {a.clip}")

    frames = extract_frames(a.clip)
    if not frames:
        sys.exit("没抽到帧")
    frames = pick_even(frames, a.frames)

    # 抠背景
    if a.key != "none":
        if a.key == "auto":
            key = frames[0].getpixel((0, 0))[:3]
        else:
            hx = a.key.lstrip("#")
            key = (int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16))
        frames = [chroma_key(f, key, a.fuzz) for f in frames]

    # 统一高度（按比例），脚底对齐到等宽单元
    H = a.height
    resized = []
    for f in frames:
        w, h = f.size
        nw = max(1, round(w * H / h))
        resized.append(f.resize((nw, H), Image.LANCZOS))
    cellW = max(f.width for f in resized)
    n = len(resized)
    sheet = Image.new("RGBA", (cellW * n, H), (0, 0, 0, 0))
    for i, f in enumerate(resized):
        x = i * cellW + (cellW - f.width) // 2     # 水平居中
        sheet.paste(f, (x, H - f.height), f)       # 脚底对齐

    ext = "webp" if a.webp else "png"
    sheet_name = f"char-{a.state}-sheet.{ext}"
    sheet.save(os.path.join(FRONTEND, sheet_name))

    # 更新清单
    manifest = {"frameH": H, "states": {}}
    if os.path.exists(MANIFEST):
        try:
            manifest = json.load(open(MANIFEST, encoding="utf-8"))
            manifest.setdefault("states", {})
        except Exception:
            pass
    if manifest.get("frameH") != H and manifest.get("states"):
        print(f"⚠️  注意: 已有 frameH={manifest.get('frameH')} 与本次 {H} 不一致，建议全状态统一高度")
    manifest["frameH"] = H
    manifest["states"][a.state] = {"sheet": sheet_name, "frames": n, "frameW": cellW}
    with open(MANIFEST, "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=2)

    print(f"✅ {a.state}: {sheet_name}  {n} 帧 · 单帧 {cellW}×{H}")
    print(f"   已写入 {os.path.relpath(MANIFEST, ROOT)}；刷新 /office 即生效")


if __name__ == "__main__":
    main()

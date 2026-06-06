#!/usr/bin/env python3
"""claude-office · 小车素材去底（黑底图）。

源图是"纯黑底 + 亮车"。难点：车顶/轮胎也是黑的，会和黑底连通。
做法（process_close）：
  1) 紧致黑键 gradient flood（delta≈8）：从四边按"相邻像素亮度相近"灌纯黑底，
     车的黑顶有微反光/描边(>delta) → 自然成屏障，不被吃掉。
  2) 形态学闭运算 MaxFilter→MinFilter：封住"黑顶与车身之间的细缝漏口"。
  3) 填洞 border_flood：被车体包裹的玻璃黑斑补回不透明（保留原 RGB）。
  4) 一点点羽化：MinFilter(3) 收边 1px + GaussianBlur(1.0)。
  5) 裁到包围盒。
换车：替换下方源图路径重跑即可。不改色（原汁原味）。
"""
from collections import deque
from PIL import Image, ImageFilter


def lum(p):
    return (p[0] * 299 + p[1] * 587 + p[2] * 114) // 1000


def flood_gradient(L, W, H, delta):
    """从四边按相邻亮度相近灌水：均匀黑底一路连通，遇车硬边(大跳变)即止。"""
    vis = bytearray(W * H)
    dq = deque()

    def seed(i):
        if not vis[i]:
            vis[i] = 1
            dq.append(i)

    for x in range(W):
        seed(x)
        seed((H - 1) * W + x)
    for y in range(H):
        seed(y * W)
        seed(y * W + W - 1)
    while dq:
        i = dq.popleft()
        li = L[i]
        x = i % W
        y = i // W
        for j in ((i - 1) if x > 0 else -1, (i + 1) if x < W - 1 else -1,
                  (i - W) if y > 0 else -1, (i + W) if y < H - 1 else -1):
            if j >= 0 and not vis[j] and abs(L[j] - li) <= delta:
                vis[j] = 1
                dq.append(j)
    return vis


def border_flood(ok, W, H):
    """对 ok(可通行) 从四边 BFS，返回与边界连通的集合。"""
    vis = bytearray(W * H)
    dq = deque()

    def seed(i):
        if ok[i] and not vis[i]:
            vis[i] = 1
            dq.append(i)

    for x in range(W):
        seed(x)
        seed((H - 1) * W + x)
    for y in range(H):
        seed(y * W)
        seed(y * W + W - 1)
    while dq:
        i = dq.popleft()
        x = i % W
        y = i // W
        if x > 0:
            seed(i - 1)
        if x < W - 1:
            seed(i + 1)
        if y > 0:
            seed(i - W)
        if y < H - 1:
            seed(i + W)
    return vis


def process_close(src, out, delta=8, close_k=11, feather_blur=1.0):
    im = Image.open(src).convert("RGB")
    W, H = im.size
    L = [lum(p) for p in im.getdata()]
    bg = flood_gradient(L, W, H, delta)
    a = Image.new("L", (W, H), 0)
    ap = a.load()
    for i in range(W * H):
        if not bg[i]:
            ap[i % W, i // W] = 255
    a = a.filter(ImageFilter.MaxFilter(close_k)).filter(ImageFilter.MinFilter(close_k))  # 闭运算封漏口
    op = bytearray(1 if a.getpixel((i % W, i // W)) > 128 else 0 for i in range(W * H))
    holes_ok = bytearray(1 if not op[i] else 0 for i in range(W * H))
    outside = border_flood(holes_ok, W, H)
    for i in range(W * H):
        if not op[i] and not outside[i]:
            a.putpixel((i % W, i // W), 255)          # 内部洞(玻璃)→填
    a = a.point(lambda v: 255 if v > 128 else 0)
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(feather_blur))  # 一点点羽化
    o = Image.new("RGBA", (W, H))
    o.paste(im, (0, 0))
    o.putalpha(a)
    bb = o.getbbox()
    o = o.crop(bb) if bb else o
    o.save(out)
    print(out, o.size)


if __name__ == "__main__":
    process_close("/Users/matype/Downloads/image_MAZDA_复古MX5_车头向右.png",
                  "frontend/assets/car-mx5.png", delta=8, close_k=11)
    process_close("/Users/matype/Downloads/image_SU7U_车头向右.png",
                  "frontend/assets/car-su7u.png", delta=8, close_k=11)

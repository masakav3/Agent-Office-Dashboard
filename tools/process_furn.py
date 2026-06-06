import sys
sys.path.insert(0, "tools")
from process_car import process_close, flood_gradient, border_flood, lum
from PIL import Image, ImageFilter

# 黑底家具：紧致黑键(同小车管线)
process_close("/Users/matype/Downloads/image_电脑桌_咖啡.png", "frontend/assets/asset-desk-coffee.png", delta=8, close_k=11)
process_close("/Users/matype/Downloads/image_电脑桌_奶茶.png", "frontend/assets/asset-desk-milktea.png", delta=8, close_k=11)
process_close("/Users/matype/Downloads/image_三联屏.png",      "frontend/assets/asset-desk-triple.png",  delta=8, close_k=11)

# 灰底白板：渐变去底 + 填洞 + 轻羽化
def process_grey(src, out, delta=18):
    im = Image.open(src).convert("RGB"); W, H = im.size
    L = [lum(p) for p in im.getdata()]
    bg = flood_gradient(L, W, H, delta)
    op = bytearray(1 if not bg[i] else 0 for i in range(W * H))
    holes = bytearray(1 if not op[i] else 0 for i in range(W * H))
    outside = border_flood(holes, W, H)
    for i in range(W * H):
        if not op[i] and not outside[i]: op[i] = 1
    a = Image.new("L", (W, H), 0); ap = a.load()
    for i in range(W * H):
        if op[i]: ap[i % W, i // W] = 255
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    o = Image.new("RGBA", (W, H)); o.paste(im, (0, 0)); o.putalpha(a)
    bb = o.getbbox(); o = o.crop(bb) if bb else o; o.save(out); print("grey", out, o.size)

process_grey("/Users/matype/Downloads/image_whiteboard.png", "frontend/assets/asset-whiteboard.png", delta=18)

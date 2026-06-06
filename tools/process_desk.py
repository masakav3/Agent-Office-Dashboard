import sys
sys.path.insert(0, "tools")
from process_car import flood_gradient, border_flood, lum
from PIL import Image, ImageFilter

def from_alpha(src, out, thresh=180):
    """已带 alpha(透明底+烘焙辉光):硬化 alpha 去辉光 + 轻羽化 + 裁切。"""
    im = Image.open(src).convert("RGBA")
    r, g, b, a = im.split()
    a = a.point(lambda v: 255 if v > thresh else 0)
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    im.putalpha(a)
    bb = im.getbbox(); im = im.crop(bb) if bb else im
    im.save(out); print("alpha", out, im.size)

def from_white(src, out, delta=18):
    """白底+黑描边:渐变去底(描边为屏障) + 填洞 + 轻羽化。"""
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
    bb = o.getbbox(); o = o.crop(bb) if bb else o
    o.save(out); print("white", out, o.size)

from_alpha("/Users/matype/Downloads/asset-desk-coffee.png", "frontend/assets/asset-desk-coffee.png", thresh=180)
from_alpha("/Users/matype/Downloads/asset-desk-triple.png", "frontend/assets/asset-desk-triple.png", thresh=180)
from_white("/Users/matype/Downloads/asset-desk-milktea.png", "frontend/assets/asset-desk-milktea.png", delta=18)

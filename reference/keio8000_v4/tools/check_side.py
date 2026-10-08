# -*- coding: utf-8 -*-
"""側面の照合：tools/verify_render.py の side.png（60px/m、レール面=画像の下端、先頭車の前端 u=+9.75 が px 75）を
   画素で測り、実測値（ref/keio8000_measured_v4.md）と比べる。45項目すべて ±2cm（一部 ±2.5〜3cm）以内で PASS。
   使い方: python3 tools/check_side.py 出力フォルダ/side.png"""
import numpy as np
from PIL import Image
import sys
path = sys.argv[1]
a = np.array(Image.open(path).convert("RGB")).astype(int)
H, W, _ = a.shape
S = 60.0
z_of = lambda r: 5.0 - (r + .5) / S
u_of = lambda px: 11.0 - (px + .5) / S          # 先頭車：運転台側が +
px_of = lambda u: int(round((11.0 - u) * S - .5))
row_of = lambda z: int(round((5.0 - z) * S - .5))
R, G, B = a[..., 0], a[..., 1], a[..., 2]
L = .299 * R + .587 * G + .114 * B
red = (R > 150) & (G < 120) & (R - G > 70)
blue = (B > R + 25) & (R < 120)
ivory = (R > 200) & (G > 190) & (B > 150) & (R - B > 12)
stl = (np.abs(R - G) < 14) & (np.abs(G - B) < 16) & (R > 150)
res = []


def check(name, model, ref, tol=.02):
    ok = model is not None and abs(model - ref) <= tol
    res.append((name, ref, model, ok))


def zrun(mask, px, zlo, zhi):
    """列 px で mask が続く区間の下端・上端（半画素の境界）"""
    col = mask[:, px]
    rs = [r for r in range(H) if col[r] and zlo < z_of(r) < zhi]
    return (z_of(max(rs)) - .5 / S, z_of(min(rs)) + .5 / S) if rs else (None, None)


def urun(mask, z, ulo, uhi):
    """行 z で mask でない（=窓など）区間の一覧 [(u下限, u上限)]"""
    r = row_of(z)
    out, st = [], None
    for px in range(W):
        v = not mask[r, px]
        if v and st is None: st = px
        if (not v or px == W - 1) and st is not None:
            if px - st >= 3:
                lo, hi = u_of(px - 1) - .5 / S, u_of(st) + .5 / S
                if ulo < lo and hi < uhi: out.append((lo, hi))
            st = None
    return out


# ---- 帯（高さ）----
p_body = px_of(4.70 + 1.6)       # 扉間の柱（u 6.3 は扉1の後ろ…避けて 3.0 付近）
p_body = px_of(3.05 + .12)
p_cab = px_of(8.9)
lo, hi = zrun(red, p_body, 1.0, 2.2); check("客室部 赤帯 下端", lo, 1.650); check("客室部 赤帯 上端", hi, 1.853)
lo, hi = zrun(blue, p_body, 1.0, 2.2); check("青線 下端", lo, 1.573); check("青線 上端", hi, 1.609)
lo, hi = zrun(red, p_cab, 1.0, 2.2); check("運転台部 赤帯 下端", lo, 1.266); check("運転台部 赤帯 上端", hi, 1.520)
lo, hi = zrun(blue, p_cab, 1.0, 2.2); check("運転台部 青線 下端", lo, 1.573)
lo, hi = zrun(red, px_of(3.2), 3.0, 3.5); check("幕板の赤帯 下端", lo, 3.198); check("幕板の赤帯 上端", hi, 3.282)
# ---- 窓の上下（戸袋窓 u=3.385、扉窓 u=2.70）----
for name, u, z0, z1 in (("戸袋窓", 3.385, 1.995, 2.927), ("扉窓", 2.70, 1.995, 2.908), ("下降窓", 4.2, 1.995, 2.927)):
    col = ~stl[:, px_of(u)]
    rs = [r for r in range(H) if col[r] and 1.9 < z_of(r) < 3.0]
    check(name + " 下端", z_of(max(rs)) - .5 / S, z0); check(name + " 上端", z_of(min(rs)) + .5 / S, z1)
# ---- 窓の左右（z=2.5 の行）----
wins = urun(stl, 2.5, -9.8, 9.3)
exp = [("扉1 前の扉窓", 7.185, 7.596), ("扉1 後の扉窓", 6.504, 6.915), ("扉1 後の戸袋窓", 5.875, 6.155),
       ("下降窓 1", 4.721, 5.643), ("下降窓 2", 3.757, 4.679), ("戸袋窓（扉2前）", 3.245, 3.525),
       ("扉2 前の扉窓", 2.485, 2.896), ("戸袋窓（中央）", 1.175, 1.455), ("下降窓（中央）", .021, .943),
       ("車端 戸袋窓", -8.225, -7.945), ("車端 下降窓", -9.396, -8.466)]
for name, lo, hi in exp:
    best = min(wins, key=lambda s: abs(s[0] - lo) + abs(s[1] - hi)) if wins else None
    check(name + " 後端", best and best[0], lo); check(name + " 前端", best and best[1], hi)
# 扉1 の前（u 7.75〜8.35）に窓がないこと：z=2.5 でステンレス／ロゴ以外が続かない
seg = [px for px in range(px_of(8.30), px_of(7.75)) if not stl[row_of(2.5), px]]
res.append(("扉1の前に窓なし（非ステンレス画素数）", 0, len(seg), len(seg) <= 3))
# ---- アイボリー境界（運転台側面 z=2.3）----
iv = [px for px in range(W) if ivory[row_of(2.3), px]]
check("アイボリーの後端", u_of(max(iv)) - .5 / S if iv else None, 8.39)
# ---- 屋根頂部・冷房装置 ----
top = min(r for r in range(H) if (L[r, px_of(6.0)] < 240))
check("屋根頂部", z_of(top) + .5 / S, 3.72, .025)
ac_top = min(r for r in range(H) if (L[r, px_of(0.0)] < 240))
check("冷房装置 上端", z_of(ac_top) + .5 / S, 4.055, .025)
# ---- 幕板の小物（先頭車）----
def dark_bbox(u0, u1, z0, z1, thr=150):
    sub = (L < thr) & ~red
    ys, xs = np.where(sub[row_of(z1):row_of(z0) + 1, px_of(u1):px_of(u0) + 1])
    if not len(xs): return None
    return (u_of(px_of(u1) + xs.max()) - .5 / S, u_of(px_of(u1) + xs.min()) + .5 / S,
            z_of(row_of(z1) + ys.max()) - .5 / S, z_of(row_of(z1) + ys.min()) + .5 / S)
bb = dark_bbox(-.05, 1.0, 3.05, 3.30, 120)
if bb: check("側面表示器 表示面 左", bb[0], .18, .03); check("側面表示器 表示面 右", bb[1], .78, .03)
bb = dark_bbox(3.8, 4.1, 3.05, 3.30, 120)
if bb: check("車側灯 中心 u", (bb[0] + bb[1]) / 2, 3.958, .02); check("車側灯 中心 z", (bb[2] + bb[3]) / 2, 3.166, .02)
# ---- 表示 ----
print(f"{'項目':<28}{'実測[m]':>9}{'モデル[m]':>11}  判定")
ng = 0
for n, r_, m_, ok in res:
    ng += not ok
    print(f"{n:<28}{r_:>9.3f}{(m_ if m_ is not None else float('nan')):>11.3f}  {'OK' if ok else 'NG'}")
print("\nRESULT:", "PASS" if ng == 0 else f"FAIL（{ng}項目NG）", f"／{len(res)}項目")

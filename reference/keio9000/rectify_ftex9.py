# 写真(9705・踏切から)の前面を、正面から見た平面(y=左右・z=高さ, 150px/m)へ写し直す
import sys, numpy as np
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
C, K, Y_TOP, Z_TOP = 1322.3, 56.6, 601.0, 3.62     # 扉の中心の列・目盛り(扉610mm=34.5px)・屋根の頂部の行と高さ
# 左右の対応点(実の |y| [m] ↔ 中心からの画素):扉の縁・窓の内縁・灯火の内端・外端・窓の外縁
TRUE = [0, 0.305, 0.367, 0.556, 0.97, 1.25, 1.384]
LEFT = [0, 17.3, 20.3, 34.3, 58.3, 75.0, 83.0]
RIGHT = [0, 17.2, 21.2, 28.7, 51.7, 61.0, 61.0]     # 右の窓の外縁より外は角に隠れて見えない
PXM = 150
W, H = int(2 * 1.45 * PXM), int((3.75 - 0.30) * PXM)
out = np.zeros((H, W, 3))
for j in range(H):
    z = 3.75 - (j + .5) / PXM
    yi = Y_TOP + (Z_TOP - z) * K
    for i in range(W):
        y = -1.45 + (i + .5) / PXM          # 向かって左が負
        a = abs(y)
        tab = LEFT if y < 0 else RIGHT
        if a > 1.384 or (y > 0 and a > 1.25):
            out[j, i] = (128, 128, 128); continue
        d = np.interp(a, TRUE, tab)
        xi = C - d if y < 0 else C + d
        x0, y0 = int(np.floor(xi)), int(np.floor(yi)); fx, fy = xi - x0, yi - y0
        p = (im[y0, x0] * (1 - fx) + im[y0, x0 + 1] * fx) * (1 - fy) + (im[y0 + 1, x0] * (1 - fx) + im[y0 + 1, x0 + 1] * fx) * fy
        out[j, i] = p
Image.fromarray(out.clip(0, 255).astype('uint8')).save(OUT)
print(W, H)

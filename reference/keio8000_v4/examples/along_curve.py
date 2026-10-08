# -*- coding: utf-8 -*-
"""例2：曲線（半径300m の S 字・25‰ の上り勾配）の線路に沿って、8両の各停を発車させる（1両ずつ線路に沿う）
  ・線路の中心線はベジェカーブ。path_from_curve() で「弧長 s → 位置」の関数にする
  ・place_on_path() で毎コマ1両ずつ置いてキーを打ち、set_linear() で補間を直線にする
使い方: python3 examples/along_curve.py 出力.blend   （保存した .blend を開くと動きが見られる）"""
import bpy, os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import keio8000 as k8

out = os.path.abspath(sys.argv[-1] if sys.argv[-1].endswith(".blend") else "example2.blend")
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.fps = 24; sc.frame_start, sc.frame_end = 1, 240
# 線路の中心線：直線 → 左へ曲がる（R≈300m）→ 右へ曲がる → 直線。勾配 25‰
cu = bpy.data.curves.new("track", 'CURVE'); cu.dimensions = '3D'; cu.resolution_u = 64
sp = cu.splines.new('POLY')
pts = []
x, y, a, s = 0.0, 0.0, 0.0, 0.0
for i in range(161):                                              # 2.5m ごと、400m
    if 80 <= s < 200: a += 2.5 / 300.0
    elif 200 <= s < 320: a -= 2.5 / 300.0
    pts.append((x, y, .025 * s)); x += 2.5 * math.cos(a); y += 2.5 * math.sin(a); s += 2.5
sp.points.add(len(pts) - 1)
for p, (px, py, pz) in zip(sp.points, pts): p.co = (px, py, pz, 1)
track = bpy.data.objects.new("線路の中心線", cu); sc.collection.objects.link(track)
path = k8.path_from_curve(track)
k8.init()
tr = k8.build_train("各停", "8728F", kind="各停", dest="高尾山口", bound="down", crowd="light")
# 発車：3.3km/h/s（0.917m/s²）で加速。先頭は s=170m から（編成は s の小さい側に並ぶ）
for f in range(1, 241):
    t = (f - 1) / 24.0
    k8.place_on_path(tr, 170.0 + .5 * .917 * t * t, path, frame=f)
k8.set_linear(tr)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (300, -120, 60); cam.rotation_euler = (math.radians(65), 0, math.radians(45))
bpy.ops.wm.save_as_mainfile(filepath=out)
print("saved", out, "curve length %.1fm" % path.length)

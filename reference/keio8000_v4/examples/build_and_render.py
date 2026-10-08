# -*- coding: utf-8 -*-
"""例1：10両の上り特急（新宿行き）を組み立てて、斜め前から1枚描く
使い方: python3 examples/build_and_render.py 出力.png"""
import bpy, os, sys, math
from mathutils import Vector
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import keio8000 as k8

out = os.path.abspath(sys.argv[-1] if sys.argv[-1].endswith(".png") else "example1.png")
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
k8.init()                                                         # 材質と部品メッシュ（最初に1回）
tr = k8.build_train("上り特急", "8714F", kind="特急", dest="新宿", bound="up", crowd="light")
k8.place_straight(tr, front=(0, 0, 0), heading=0.0)               # 先頭が原点、+X へ進む
# 照明（太陽＋空）とカメラ
w = bpy.data.worlds.new("sky"); sc.world = w; w.use_nodes = True
sky = w.node_tree.nodes.new("ShaderNodeTexSky"); sky.sun_disc = False; sky.sun_elevation = math.radians(35)
w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes["Background"].inputs[0])
w.node_tree.nodes["Background"].inputs[1].default_value = .25
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.6; sun.rotation_euler = (math.radians(55), 0, math.radians(-30))
me = bpy.data.meshes.new("ground"); me.from_pydata([(-260, -40, -.15), (40, -40, -.15), (40, 40, -.15), (-260, 40, -.15)], [], [(0, 1, 2, 3)])
me.materials.append(k8.mat_simple("ground", k8.srgb((.40, .40, .38)), .9))
sc.collection.objects.link(bpy.data.objects.new("地面", me))                 # 地面（レール面の 0.15m 下）
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 40; cam.location = (14, -16, 4)
cam.rotation_euler = (Vector((-12, 0, 1.8)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("saved", out, tr)

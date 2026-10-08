# -*- coding: utf-8 -*-
"""組み立て済みの編成を入れた keio8000.blend を作る（Blender の「アペンド」やアセットブラウザで使う用）
   ・8714F 下り 特急 京王八王子（10両）… y=+2.0（下り線の向きに -X へ進む姿勢ではなく、+X へ進む姿勢で置く）
   ・8728F 下り 各停 高尾山口（8両）  … y=-2.0
   どちらも先頭（連結器の先）が x=0、+X が進行方向。編成ごとのコレクションをアセットにする。
   文字はフォントのまま（フォントは .blend に埋め込む）なので、Blender 上で行先などを書き換えられる。
   使い方: python3 tools/build_library.py  → keio8000.blend と ref/preview_library.png"""
import bpy, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, ROOT)
import keio8000 as k8
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.name = "8000系"
k8.init()
trains = [("8714F_下り_特急_京王八王子", "8714F", "特急", "京王八王子", 2.0),
          ("8728F_下り_各停_高尾山口", "8728F", "各停", "高尾山口", -2.0)]
for name, form, kind, dest, y in trains:
    tr = k8.build_train(name, form, kind=kind, dest=dest, bound="down", crowd="light")
    k8.place_straight(tr, front=(0, y, 0), heading=0.0)
    c = tr.collection
    c.asset_mark()
    c.asset_data.description = f"京王8000系 {form}（{len(tr.cars)}両）{kind} {dest}。先頭＝連結器の先が親 Empty の原点、+X が進行方向"
    for t in ("京王", "8000系", form, kind):
        c.asset_data.tags.new(t)
for f in bpy.data.fonts:                                     # フォントを .blend に埋め込む
    if f.filepath and f.filepath != '<builtin>' and not f.packed_file: f.pack()
# 見本の照明・空・カメラ（開いて F12 で描ける）
w = bpy.data.worlds.new("sky"); sc.world = w; w.use_nodes = True
sky = w.node_tree.nodes.new("ShaderNodeTexSky"); sky.sky_type = 'NISHITA'; sky.sun_disc = False
sky.sun_elevation = math.radians(35); sky.sun_rotation = math.radians(200)
w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes["Background"].inputs[0])
w.node_tree.nodes["Background"].inputs[1].default_value = .25
sd = bpy.data.lights.new("sun", 'SUN'); sd.energy = 3.6; sd.angle = math.radians(.6); sd.color = (1, .96, .9)
sun = bpy.data.objects.new("sun", sd); sc.collection.objects.link(sun)
d = Vector((math.cos(math.radians(35)) * math.cos(math.radians(-110)), math.cos(math.radians(35)) * math.sin(math.radians(-110)), math.sin(math.radians(35))))
sun.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
bm_ = bpy.data.meshes.new("k8_ground"); bm_.from_pydata([(-300, -60, 0), (100, -60, 0), (100, 60, 0), (-300, 60, 0)], [], [(0, 1, 2, 3)])
gm = k8.mat_simple("ground", k8.srgb((.42, .42, .40)), .9); bm_.materials.append(gm)
g = bpy.data.objects.new("地面", bm_); sc.collection.objects.link(g); g.location.z = -.2
cd = bpy.data.cameras.new("見本カメラ"); cd.lens = 40; cd.sensor_width = 36; cd.clip_start = .3; cd.clip_end = 5000
cam = bpy.data.objects.new("見本カメラ", cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (16, -22, 5.5)
cam.rotation_euler = (Vector((-14, 0, 1.8)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
r = sc.render; r.engine = 'CYCLES'; r.resolution_x, r.resolution_y = 1280, 720
sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = .03
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 2
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
os.makedirs(os.path.join(ROOT, "ref"), exist_ok=True)
r.filepath = os.path.abspath(os.path.join(ROOT, "ref", "preview_library.png"))
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(ROOT, "keio8000.blend")), compress=True)
print("LIBRARY OK", len(bpy.data.objects), "objects")

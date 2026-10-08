# -*- coding: utf-8 -*-
"""8000系モデルの検証用レンダー（正射影・一様な白い照明）
   ・側面 side.png：先頭車＋2両目、60 px/m（写真の横の縮尺と同じ）、レール面が画像の下端
   ・前面 front.png：150 px/m
   check_side.py・check_front.py はこの2枚を測る。
   使い方: python3 tools/verify_render.py 出力フォルダ
   （元の動画のときと同じ位置 (-4.39, 2.0, 0.45) に置くので、元の vr4/ の画像とも画素で比べられる）"""
import bpy, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import keio8000 as k8

out = sys.argv[-1]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
k8.init()
tr = k8.build_train("下り特急", "8714F", kind="特急", dest="京王八王子", bound="down", crowd="rush")
fx, fy, fz = -4.3903, 2.0, 0.45                    # 先頭（連結器の先）の位置。下り＝-X へ進む向き
k8.place_straight(tr, front=(fx, fy, fz), heading=math.pi)
w = bpy.data.worlds.new("flat"); w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
sc.world = w
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = 24; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = .03
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'; sc.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 2
sc.cycles.transparent_max_bounces = 10; sc.cycles.volume_bounces = 0
sc.cycles.caustics_reflective = sc.cycles.caustics_refractive = False; sc.cycles.blur_glossy = 1.0
sc.cycles.sample_clamp_indirect = 5.0; sc.cycles.use_light_tree = True; sc.cycles.light_sampling_threshold = .02
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.film_transparent = False
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'
cd = bpy.data.cameras.new("ortho"); cd.type = 'ORTHO'; cd.clip_start = .3; cd.clip_end = 60000; cd.sensor_width = 36
cam = bpy.data.objects.new("ortho", cd); sc.collection.objects.link(cam); sc.camera = cam
# 側面：x = fx-1 〜 fx+39（2両）、z = レール面〜+5m
W, H = 2400, 300
cd.ortho_scale = W / 60.0
cam.location = (fx + 19.0, fy - 30, fz + 2.5)
cam.rotation_euler = (math.radians(90), 0, 0)
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.filepath = os.path.abspath(f"{out}/side.png")
bpy.ops.render.render(write_still=True); print("SIDE done", flush=True)
# 前面：幅3.2m×高さ4.2m を 150px/m
W, H = 480, 630
cd.ortho_scale = max(W, H) / 150.0                 # 正射影の幅は長い辺に対して効く
cam.location = (fx - 30, fy, fz + 2.1)
cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.filepath = os.path.abspath(f"{out}/front.png")
bpy.ops.render.render(write_still=True); print("FRONT done", flush=True)

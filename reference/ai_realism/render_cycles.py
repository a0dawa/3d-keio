# ビューアから書き出した GLB を Blender(bpy・ヘッドレス)の Cycles で描く(検証ではない。比較の実証)
# bpyenv/bin/python render_cycles.py <scene.glb> <meta.json> <out.png> [--quick]
import bpy, json, math, sys
from mathutils import Vector

glb, metaf, outp = sys.argv[1], sys.argv[2], sys.argv[3]
quick = '--quick' in sys.argv
meta = json.load(open(metaf))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene

# 材質:Lambert/Phong 由来(メタリック 0.5 が既定で入る)は非金属へ。粗さはそのまま
hist = {}
for m in bpy.data.materials:
    if not m.use_nodes: continue
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    mt = bsdf.inputs['Metallic'].default_value
    hist[round(mt, 2)] = hist.get(round(mt, 2), 0) + 1
    if 0.3 < mt < 0.7: bsdf.inputs['Metallic'].default_value = 0.0
    if bsdf.inputs['Roughness'].default_value < 0.05: bsdf.inputs['Roughness'].default_value = 0.08
print('metallic histogram:', hist)

# 三.js の世界 (x,y=上,z) → Blender (x,-z,y)
def toB(v): return Vector((v[0], -v[2], v[1]))
pos, look = toB(meta['view']['pos']), toB(meta['view']['look'])

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
cam.location = pos
d = (look - pos).normalized()
cam.rotation_mode = 'QUATERNION'
cam.rotation_quaternion = d.to_track_quat('-Z', 'Y')
cam.data.sensor_fit = 'VERTICAL'
cam.data.angle_y = math.radians(meta['fov'])
cam.data.clip_end = 20000
sc.camera = cam

# 太陽(ビューアの昼の向き)と Nishita の空
sdir = toB(meta['sun']).normalized()          # 原点→太陽
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sc.collection.objects.link(sun)
sun.rotation_mode = 'QUATERNION'
sun.rotation_quaternion = sdir.to_track_quat('Z', 'Y')   # ランプの -Z が光の進む向き=+Z を太陽へ
sun.data.energy = float(__import__('os').environ.get('SUN','4'))
sun.data.angle = math.radians(1.0)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
nt = w.node_tree; nt.nodes.clear()
sky = nt.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'MULTIPLE_SCATTERING' if 'MULTIPLE_SCATTERING' in sky.bl_rna.properties['sky_type'].enum_items else 'NISHITA'   # Blender 5.0 で改名
for attr, val in (('sun_disc', False), ('sun_elevation', math.asin(sdir.z)), ('sun_rotation', math.atan2(sdir.x, sdir.y))):
    try: setattr(sky, attr, val)
    except Exception as e: print('sky attr skip', attr, e)
bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = float(__import__('os').environ.get('SKY','0.35'))
out = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 24 if quick else 160
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.1 if quick else 0.03
sc.cycles.use_denoising = True
sc.cycles.sample_clamp_indirect = 10
sc.render.resolution_x = 480 if quick else 1280
sc.render.resolution_y = 270 if quick else 720
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Base Contrast'
sc.view_settings.exposure = float(__import__('os').environ.get('EXPO','0'))
sc.render.filepath = str(__import__('pathlib').Path(outp).resolve())
bpy.ops.render.render(write_still=True)
print('rendered', outp)

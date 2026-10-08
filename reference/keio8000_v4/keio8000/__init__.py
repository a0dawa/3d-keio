# -*- coding: utf-8 -*-
"""
京王8000系（大規模改修後）— Blender 4.2 用の3Dモデル（車体 v4）
=====================================================================
動画「京王線高架化」（2026年9月）のために作った車体を、ほかの作業でも使えるよう単体にしたもの。
寸法・塗り分け・窓・扉・前面の部品は写真の実測値（ref/keio8000_measured_v4.md）で、
tools/check_side.py（側面45項目）・tools/check_front.py（前面14項目）で照合できる。

使い方（最短）:
    import sys, math; sys.path.insert(0, "/path/to/keio8000_model")
    import keio8000 as k8
    k8.init()                                                  # 材質と部品メッシュを作る（最初に1回）
    tr = k8.build_train("下り特急", "8714F", kind="特急", dest="京王八王子", bound="down")
    k8.place_straight(tr, front=(0, 0, 0), heading=math.pi)    # 先頭を原点に置き、-X へ進む向き

座標（車両まわり）: 単位 m。x＝車長方向（各車の親 Empty の +x が進行方向）、y＝左右、z＝レール面からの高さ。
このファイルは make_module.py が元のコード（build_scene.py・car_block_v4.py）から組み立てたもの。
形と材質の数値は元のコードと同じ。手で直すときは CLAUDE.md の作業ルールに従うこと。
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Euler, Matrix

VERSION = "v4.0 (2026-10)"
PREFIX = "k8_"                 # 作る材質・メッシュの名前の頭（使う側のデータと見分ける）
CAR_L = 19.5                   # 車体長［m］（連結面間 20.0 − 0.5）
PITCH = 20.0                   # 車両の間隔（連結面間）［m］
DOORW, DOORX = 1.30, [-7.05, -2.35, 2.35, 7.05]    # 客用扉の幅・中心（車体中心から）［m］
RAIL_V, TR = 0.0, 4.9          # パンタグラフの舟の高さ＝トロリ線の高さ（レール面から 4.9m）。init() で変えられる
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = None                    # 文字のフォント（init() で決まる。既定は同梱の Noto Sans CJK JP Bold の部分集合）
M = {}                         # 材質（init() で作る）


# =====================================================================
# 1. 補助（bmesh の部品・材質の道具）…元の build_scene.py と同じ
# =====================================================================
def srgb(c):
    """sRGB(0-1) → リニア（Blenderの色入力はリニア）"""
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def link(obj, c):
    c.objects.link(obj)
    return obj


def new_obj(name, mesh, c, loc=(0, 0, 0), rot=(0, 0, 0), scl=(1, 1, 1)):
    o = bpy.data.objects.new(name, mesh)
    o.location, o.rotation_euler, o.scale = loc, rot, scl
    return link(o, c)


def bm_box(bm, x0, x1, y0, y1, z0, z1, mat=0):
    vs = [bm.verts.new(v) for v in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                    (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    for f in faces:
        fc = bm.faces.new([vs[i] for i in f]); fc.material_index = mat
    return vs


def bm_prism(bm, prof, x0, x1, mat=0):
    """YZ断面 prof[(y,z)...]（反時計回り）を X 方向に押し出す"""
    a = [bm.verts.new((x0, y, z)) for y, z in prof]
    b = [bm.verts.new((x1, y, z)) for y, z in prof]
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([a[i], a[j], b[j], b[i]]).material_index = mat
    bm.faces.new(list(reversed(a))).material_index = mat
    bm.faces.new(b).material_index = mat


def bm_cyl(bm, p0, p1, r, seg=10, mat=0, cap=True):
    """p0→p1 の円柱"""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    u = d.orthogonal().normalized(); v = d.cross(u)
    A, B = [], []
    for i in range(seg):
        t = 2 * math.pi * i / seg
        off = (u * math.cos(t) + v * math.sin(t)) * r
        A.append(bm.verts.new(p0 + off)); B.append(bm.verts.new(p1 + off))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new([A[i], A[j], B[j], B[i]]).material_index = mat
    if cap:
        bm.faces.new(list(reversed(A))).material_index = mat
        bm.faces.new(B).material_index = mat


def bm_sphere(bm, c, r, mat=0, sub=1):
    m = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in m['verts']: v.co += Vector(c)
    for f in {f for v in m['verts'] for f in v.link_faces}: f.material_index = mat


def to_mesh(bm, name, mats=(), smooth=False):
    me = bpy.data.meshes.new(PREFIX + name)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return me


class NB:
    """ノード組み立ての小道具"""
    def __init__(self, mat):
        self.m = mat; self.nt = mat.node_tree; self.N = self.nt.nodes; self.L = self.nt.links
    def n(self, t, **kw):
        node = self.N.new(t)
        for k, v in kw.items():
            if k.startswith("i_"):
                key = k[2:].replace("_", " ")
                node.inputs[key].default_value = v
            else:
                setattr(node, k, v)
        return node
    def l(self, a, b):
        self.L.new(a, b)
    def math(self, op, a, b=None, clamp=False):
        m = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): m.inputs[i].default_value = x
            else: self.l(x, m.inputs[i])
        return m.outputs[0]
    def mix(self, fac, a, b):
        m = self.n("ShaderNodeMix", data_type='RGBA')
        for sock, x in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
            if isinstance(x, (int, float)): sock.default_value = x
            elif isinstance(x, tuple): sock.default_value = (*x[:3], 1)
            else: self.l(x, sock)
        return m.outputs[2]
    def band(self, v, a, b):
        """a < v < b なら1"""
        return self.math('MULTIPLY', self.math('GREATER_THAN', v, a), self.math('LESS_THAN', v, b))


def new_mat(name):
    m = bpy.data.materials.new(PREFIX + name); m.use_nodes = True
    m.node_tree.nodes.clear()
    nb = NB(m)
    out = nb.n("ShaderNodeOutputMaterial")
    return m, nb, out


def mat_simple(name, col, rough=0.5, metal=0.0, emit=None, estr=0.0):
    m, nb, out = new_mat(name)
    b = nb.n("ShaderNodeBsdfPrincipled", i_Roughness=rough, i_Metallic=metal)
    b.inputs["Base Color"].default_value = (*col, 1)
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = estr
    nb.l(b.outputs[0], out.inputs[0])
    return m


def mat_noise(name, c1, c2, scale=2.0, rough=0.8, bump=0.15, detail=6, voronoi=False):
    """ワールド座標ノイズで2色を混ぜる汎用（コンクリート・バラスト・アスファルト等）"""
    m, nb, out = new_mat(name)
    geo = nb.n("ShaderNodeNewGeometry")
    if voronoi:
        t = nb.n("ShaderNodeTexVoronoi", i_Scale=scale)
        nb.l(geo.outputs["Position"], t.inputs["Vector"]); f = t.outputs["Distance"]
    else:
        t = nb.n("ShaderNodeTexNoise", i_Scale=scale, i_Detail=detail)
        nb.l(geo.outputs["Position"], t.inputs["Vector"]); f = t.outputs["Fac"]
    cr = nb.n("ShaderNodeValToRGB"); nb.l(f, cr.inputs[0])
    cr.color_ramp.elements[0].color = (*c1, 1); cr.color_ramp.elements[1].color = (*c2, 1)
    cr.color_ramp.elements[0].position = 0.3; cr.color_ramp.elements[1].position = 0.7
    b = nb.n("ShaderNodeBsdfPrincipled", i_Roughness=rough)
    nb.l(cr.outputs[0], b.inputs["Base Color"])
    bp = nb.n("ShaderNodeBump", i_Strength=bump); nb.l(f, bp.inputs["Height"])
    nb.l(bp.outputs[0], b.inputs["Normal"])
    nb.l(b.outputs[0], out.inputs[0])
    return m


def mat_person():
    """乗客・人物：頂点カラー（服の色）"""
    m, nb, out = new_mat("person")
    ca = nb.n("ShaderNodeVertexColor"); ca.layer_name = "col"
    b = nb.n("ShaderNodeBsdfPrincipled", i_Roughness=.8)
    nb.l(ca.outputs[0], b.inputs["Base Color"]); nb.l(b.outputs[0], out.inputs[0])
    return m


def mat_emit(name, col, strength, night_scale=None):
    """発光（強さ一定。本編の「夜だけ強く」の仕組みは使わない）"""
    m, nb, out = new_mat(name)
    em = nb.n("ShaderNodeEmission"); em.inputs[0].default_value = (*col, 1)
    em.inputs[1].default_value = strength
    nb.l(em.outputs[0], out.inputs[0])
    return m


# =====================================================================
# 2. 車体・部品（元の car_block_v4.py と同じ。実測値は ref/keio8000_measured_v4.md）
# =====================================================================
# =====================================================================
# 京王8000系 車体 v4（全10両・左右両面の写真で取り直した実測値）
#   出典と数値の一覧：ref/keio8000_measured_v4.md
#   ・側面：RailFile.jp 8714編成 山側（北面）・海側（南面）サイドビュー
#     横 60.0 px/m（扉間隔・車両間隔で一致）、縦 58.6 px/m（側面の縮尺）
#   ・前面：3d-keio 前面写真（上端3.70・帯の高さで較正、91.0 px/m）
#   座標：x＝車長方向（先頭車は +x が運転台）、y＝左右、z＝レール面からの高さ
# =====================================================================
from mathutils import Matrix

HWB = 1.385                     # 車体半幅（車体幅2,770）
Z_BOT, Z_FLR = 1.007, 1.147     # 車体すそ・床面（扉の下端の線）
Z_SH0, Z_CROWN = 3.387, 3.72    # 雨どい（側面の上端）・屋根頂部
WZ0, WZ1 = 1.995, 2.927         # 側窓（戸袋窓・下降窓）の下端・上端（枠の外側）
DWZ1 = 2.908                    # 扉窓の上端
DZ1 = 3.061                     # 客用扉の上端
DOOR_HW = 0.648                 # 客用扉の開口の半幅
FW = 0.017                      # 窓枠（黒いゴム）の見付け幅
RED_UP = (1.650, 1.853)         # 客室部の赤帯
BLUE = (1.573, 1.609)           # 京王ブルーの細線（全長で同じ高さ）
RED_LO = (1.266, 1.520)         # 運転台部・前面の赤帯
MAKU = (3.198, 3.282)           # 幕板の赤帯
MAKU_END, MAKU_CAB = 9.67, 8.29 # 幕板の赤帯の端（車体端の8cm手前／先頭車は運転台側 8.29 から）
IVORY_X = 8.39                  # これより前がアイボリー（先頭車）
CREW = (8.527, 9.01)            # 乗務員扉
CREW_WIN = (8.595, 8.95, 2.01, 2.927)
WRAP_X = 9.31                   # 前面ガラスの側面への回り込みの後端
# 幕板まわりの小物（写真の左を＋とする u。車体の +y 側は u=x、-y 側は u=-x。どの車も同じ）
MAKU_GAPS = [(5.26, 5.61), (3.86, 4.06), (-0.24, 0.86), (-5.61, -5.27)]
SLED = (0.143, 0.817, 3.080, 3.251)        # 側面行先表示器の枠
SLED_FACE = (0.18, 0.78, 3.108, 3.224)     # 表示面
LAMPUNIT = (-0.217, -0.083, 3.080, 3.319)  # 表示灯ユニット（縦に2灯）
SIDE_LAMP = (3.958, 3.166, 0.06)           # 車側灯（中心 u, z, 半径）
SPEAKERS = [(5.28, 5.56), (-5.56, -5.28)]  # 車外スピーカー
SPK_Z = (3.148, 3.319)
PLATE_U, PLATE_Z = (5.794, 6.227), (2.969, 3.089)   # 車番・幕板ロゴ


def prof_rows():
    """断面：すその丸み（1.007〜1.147）→ 垂直な側面 → 肩（超楕円）→ 屋根頂部。
    帯・窓・扉の境目に頂点を置く"""
    rows = []
    for k in range(0, 7):                                   # すそ：内側へ 5cm 絞れる
        t = k / 6 * math.pi / 2
        rows.append((Z_FLR - 0.14 * math.cos(t), HWB - 0.05 + 0.05 * math.sin(t)))
    keys = [RED_LO[0], RED_LO[1], BLUE[0], BLUE[1], RED_UP[0], RED_UP[1],
            WZ0, 2.46, DWZ1, WZ1, DZ1, MAKU[0], MAKU[1]]
    for z in keys:
        rows.append((z, HWB))
    rows.append((Z_SH0, HWB))
    for k in range(1, 15):                                  # 肩〜屋根頂部
        t = k / 15
        y = HWB * math.cos(t * math.pi / 2) ** .5
        z = Z_SH0 + (Z_CROWN - Z_SH0) * math.sqrt(max(0.0, 1 - (y / HWB) ** 4))
        rows.append((z, max(y, .06)))
    return rows


ROWS = prof_rows()
# 前面の中心線の輪郭（写真の実測）：下部は 11°40′ で後退、1.62〜2.52 は垂直、その上は後退、上端は肩で屋根へ
NOSE_PROFILE = [(0.95, 9.576), (1.62, 9.752), (2.52, 9.752), (3.50, 9.635), (3.55, 9.615),
                (3.60, 9.570), (3.63, 9.51), (3.66, 9.44), (3.69, 9.36), (3.73, 9.28)]
NOSE_D = 0.34                   # 前面の角の回り込み（前端から 0.46m で側面へ）


def xf(z):
    """前面の中心線の x（高さ z での最前部）"""
    P = NOSE_PROFILE
    if z <= P[0][0]: return P[0][1]
    for (z0, x0), (z1, x1) in zip(P, P[1:]):
        if z <= z1:
            return x0 + (x1 - x0) * (z - z0) / (z1 - z0)
    return P[-1][1]


def nose_x(z, s, hw):
    """前面の平面形：中央はゆるい曲面、角で側面へ回り込む"""
    y = s * hw
    return xf(z) - NOSE_D * (1 - math.sqrt(max(0.0, 1 - abs(s) ** 6))) - y * y / 16.0


def shell_mesh(name, cab):
    bm = bmesh.new()
    R = len(ROWS)
    per = [(-hw, z) for z, hw in ROWS] + [(hw, z) for z, hw in reversed(ROWS)]
    rear = [bm.verts.new((-CAR_L / 2, y, z)) for y, z in per]
    if not cab:
        front = [bm.verts.new((CAR_L / 2, y, z)) for y, z in per]
    else:
        C = 44
        grid = []
        for z, hw in ROWS:
            grid.append([bm.verts.new((nose_x(z, -1 + 2 * c / C, hw), (-1 + 2 * c / C) * hw, z)) for c in range(C + 1)])
        front = [grid[r][0] for r in range(R)] + [grid[r][C] for r in reversed(range(R))]
        for r in range(R - 1):
            for c in range(C):
                bm.faces.new([grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]])
        bm.faces.new(list(reversed(grid[0])))
        bm.faces.new(grid[R - 1])
    n = len(per)
    for i in range(n - 1):
        bm.faces.new([rear[i], front[i], front[i + 1], rear[i + 1]])
    bm.faces.new([rear[n - 1], front[n - 1], front[0], rear[0]])
    bm.faces.new(list(reversed(rear)))
    if not cab:
        bm.faces.new(front)
    me = to_mesh(bm, name, [M['car_cab_e+'] if cab else M['car_e+']], smooth=True)
    me.set_sharp_from_angle(angle=math.radians(40))
    return me


# ---- 開口部の一覧（外枠の外側の寸法）-------------------------------------------
def side_windows(cab):
    """(x0, x1, z0, z1, 上の角R, 下の角R, 種類)。cab=True なら +x 端が運転台（扉1の前に窓はない）"""
    W = []
    for g in (4.70, 0.0, -4.70):                              # 扉間：下降窓2枚（2連）
        W += [(g + .021, g + .943, WZ0, WZ1, .07, .07, 'drop'), (g - .943, g - .021, WZ0, WZ1, .07, .07, 'drop')]
    for d in DOORX:                                           # 戸袋窓：各扉の両側
        for sg in (-1, 1):
            if cab and d > 7 and sg > 0: continue              # 運転台側の扉1の前は窓なし（KEIO ロゴの板）
            a, b = sorted((d + sg * .895, d + sg * 1.175))
            W.append((a, b, WZ0, WZ1, .09, .08, 'pocket'))
    for s in ((-1,) if cab else (-1, 1)):                     # 車端の下降窓
        a, b = sorted((s * 8.466, s * 9.396)); W.append((a, b, WZ0, WZ1, .08, .08, 'drop'))
    for d in DOORX:                                           # 扉窓（左右の戸に1枚ずつ）
        W += [(d - .546, d - .135, WZ0, DWZ1, .12, .10, 'door'), (d + .135, d + .546, WZ0, DWZ1, .12, .10, 'door')]
    if cab:
        W.append((*CREW_WIN, .05, .05, 'crew'))
    return W


def rr_loop(x0, x1, z0, z1, rt, rb, seg=5):
    """角丸長方形の輪郭（上の角 rt、下の角 rb）"""
    rt = min(rt, (x1 - x0) / 2 - 1e-3, (z1 - z0) / 2 - 1e-3)
    rb = min(rb, (x1 - x0) / 2 - 1e-3, (z1 - z0) / 2 - 1e-3)
    pts = []
    for cx, cz, a0, r in ((x1 - rt, z1 - rt, 0, rt), (x0 + rt, z1 - rt, 90, rt), (x0 + rb, z0 + rb, 180, rb), (x1 - rb, z0 + rb, 270, rb)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def frame_ring(bm, x0, x1, z0, z1, rt, rb, w, off, mat, sides=(-1, 1)):
    """窓枠（角丸の帯）：外形 (x0..x1, z0..z1) の内側 w の幅"""
    outer = rr_loop(x0, x1, z0, z1, rt, rb)
    inner = rr_loop(x0 + w, x1 - w, z0 + w, z1 - w, max(rt - w, .004), max(rb - w, .004))
    n = len(inner)
    for s in sides:
        y = s * (HWB + off)
        A = [bm.verts.new((x, y, z)) for x, z in inner]
        B = [bm.verts.new((x, y, z)) for x, z in outer]
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new([A[i], A[j], B[j], B[i]] if s > 0 else [A[i], B[i], B[j], A[j]])
            f.material_index = mat


def vline(bm, x, z0, z1, w, off, mat):
    """側面の細い縦線（扉の縁・戸先の線）"""
    for s in (-1, 1):
        y0, y1 = sorted((s * (HWB + off), s * (HWB + off + .001)))
        bm_box(bm, x - w / 2, x + w / 2, y0, y1, z0, z1, mat)


def detail_mesh(name, cab):
    """窓枠・扉の輪郭と縁の線・乗務員扉・手すり・雨どい"""
    bm = bmesh.new()
    for x0, x1, z0, z1, rt, rb, kind in side_windows(cab):
        frame_ring(bm, x0, x1, z0, z1, rt, rb, FW, .004, 0)
        if kind == 'crew':                                    # 乗務員扉の窓：上部 0.10m は黒い帯
            for s in (-1, 1):
                y0, y1 = sorted((s * (HWB + .004), s * (HWB + .0045)))
                bm_box(bm, x0 + FW, x1 - FW, y0, y1, 2.823, z1 - FW, 0)
    for d in DOORX:
        # 扉の開口の縁（上の角 R0.10）と合わせ目、戸先側・戸袋側の細い線
        frame_ring(bm, d - DOOR_HW - .006, d + DOOR_HW + .006, Z_FLR, DZ1 + .006, .10, .005, .012, .003, 0)
        vline(bm, d, Z_FLR, DZ1, .011, .003, 0)
        for sg in (-1, 1):
            vline(bm, d + sg * .587, Z_FLR + .01, DZ1 - .02, .006, .0025, 3)
            vline(bm, d + sg * .709, Z_FLR, DZ1 + .03, .006, .0025, 3)
    if cab:
        frame_ring(bm, CREW[0], CREW[1], Z_FLR + .02, 3.046, .06, .005, .012, .003, 0)
        for s in (-1, 1):
            y = s * (HWB + .045)
            for xh in (9.069, 8.46):                           # 手すり（乗務員扉の前後）
                bm_cyl(bm, (xh, y, 1.152), (xh, y, 2.585), .013, 8, 1)
                for zz in (1.152, 2.585):
                    bm_cyl(bm, (xh, s * HWB, zz), (xh, y, zz), .01, 6, 1)
            y0, y1 = sorted((s * HWB, s * (HWB + .03)))       # 乗務員扉の取っ手
            bm_box(bm, 8.60, 8.70, y0, y1, 1.855, 1.895, 1)
        vline(bm, IVORY_X, Z_BOT + .05, Z_SH0 - .01, .008, .002, 3)   # アイボリーと無塗装の継ぎ目
    for s in (-1, 1):                                          # 雨どい
        y0, y1 = sorted((s * (HWB - .004), s * (HWB + .018)))
        bm_box(bm, -CAR_L / 2 + .05, CAR_L / 2 - (.46 if cab else .05), y0, y1, Z_SH0 - .018, Z_SH0 + .012, 1)
    return to_mesh(bm, name, [M['rubber_frame'], M['stl_trim'], M['lens_off'], M['groove']])


# ---- 文字：実寸に合わせて置く --------------------------------------------------
def text_curve(body, mat, shear=0.0, space=1.0):
    cu = bpy.data.curves.new("txt", 'FONT'); cu.body = body
    cu.font = bpy.data.fonts.load(FONT, check_existing=True); cu.size = 1.0
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.shear = shear; cu.space_character = space
    cu.materials.append(mat)
    return cu


def text_bbox(cu):
    """文字の外接矩形（ローカル座標）を一時オブジェクトで測る"""
    o = bpy.data.objects.new("_measure", cu); bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.update()
    xs = [v[0] for v in o.bound_box]; ys = [v[1] for v in o.bound_box]
    bpy.context.scene.collection.objects.unlink(o); bpy.data.objects.remove(o)
    if max(xs) - min(xs) < 1e-6:                  # 評価されなかった場合の予備（1文字 0.6×0.72）
        n = len(cu.body); return -.3 * n, .3 * n, -.36, .36
    return min(xs), max(xs), min(ys), max(ys)


def k_arm_pts(w, h, lean=.25):
    """KEIO ロゴの K の右上の斜め画（赤）の4点：(外から見て右向きの距離 t, 高さ)。w=ロゴ全体の幅、h=文字高さ"""
    kw = .28 * w                                  # K の字幅（ロゴ幅の約28%）
    zb, zm, zt = -h / 2, -.05 * h, h / 2          # 文字の下端・K の分かれ目・上端（ロゴ中心からの高さ）
    sh = lambda z: lean * (z - zb)                 # 斜体のずれ
    return [(.28 * kw + sh(zm), zm), (.58 * kw + sh(zm), zm), (1.02 * kw + sh(zt), zt), (.72 * kw + sh(zt), zt)]


def k_arm(bm, x_left, s, zc, w, h, off, mat):
    """側面の KEIO ロゴの K の赤い斜め画。x_left＝ロゴの外から見た左端の x"""
    r = 1 if s < 0 else -1                        # 外から見て右の向き（x）
    y = s * (HWB + off)
    v = [bm.verts.new((x_left + r * t, y, zc + dz)) for t, dz in k_arm_pts(w, h)]
    f = bm.faces.new(v if s < 0 else list(reversed(v))); f.material_index = mat


def placed_text(body, mat, center, rot, w, h, keep_aspect=False, shear=0.0, space=1.0):
    """文字の見た目の外接矩形が 幅w×高さh になり、その中心が center に来る (cu, loc, rot, scale)"""
    cu = text_curve(body, mat, shear, space)
    x0, x1, y0, y1 = text_bbox(cu)
    sx, sy = w / (x1 - x0), h / (y1 - y0)
    if keep_aspect: sx = sy = min(sx, sy)
    R = Euler(rot).to_matrix()
    off = R @ Vector(((x0 + x1) / 2 * sx, (y0 + y1) / 2 * sy, 0))
    return cu, tuple(Vector(center) - off), rot, (sx, sy, 1)


SIDE_ROT = {-1: (math.pi / 2, 0, 0), 1: (math.pi / 2, 0, math.pi)}   # -y 面／+y 面で外から読める向き


def patch(bm, z0, z1, y0, y1, off, n=10, mat=0):
    """前面の曲面に沿った四角いパッチ"""
    A, B = [], []
    for i in range(n + 1):
        y = y0 + (y1 - y0) * i / n
        A.append(bm.verts.new((nose_x(z0, y / HWB, HWB) + off, y, z0)))
        B.append(bm.verts.new((nose_x(z1, y / HWB, HWB) + off, y, z1)))
    for i in range(n):
        bm.faces.new([A[i], A[i + 1], B[i + 1], B[i]]).material_index = mat


def surf_rot(z, y):
    """前面の文字を曲面の接平面に合わせる回転（上下の傾きも）"""
    e = .01
    dx = (nose_x(z, (y + e) / HWB, HWB) - nose_x(z, (y - e) / HWB, HWB)) / (2 * e)
    dz = (xf(z + e) - xf(z - e)) / (2 * e)
    return (math.pi / 2 - math.atan(-dz), 0, math.pi / 2 - math.atan(dx))


def front_text(body, mat, yc, zc, w, h, keep_aspect=False, shear=0.0, space=1.0, lift=.006):
    rot = surf_rot(zc, yc)
    return placed_text(body, mat, (nose_x(zc, yc / HWB, HWB) + lift, yc, zc), rot, w, h, keep_aspect, shear, space)


def front_parts(dest, number, kind="特急", kind_mat=None):
    """前面の部品（位置は前面写真の実測）"""
    out = []
    # 灯火ユニット：黒いケース（帯の下端より少し下まで）／前照灯（内側）／尾灯（外側）
    for part, mat, ya, yb, z0, z1, off in (("lamp_case", M['black'], .628, 1.150, 1.217, 1.398, .004),
                                           ("hl", M['head'], .640, .935, 1.255, 1.363, .009),
                                           ("hl_off", M['lens_off'], .640, .935, 1.255, 1.363, .008),
                                           ("tl", M['tail'], .950, 1.138, 1.262, 1.358, .009),
                                           ("tl_off", M['tail_off'], .950, 1.138, 1.262, 1.358, .008)):
        bm = bmesh.new()
        for sg in (-1, 1):
            y0, y1 = sorted((sg * ya, sg * yb))
            patch(bm, z0, z1, y0, y1, off, 6)
        out.append((part, to_mesh(bm, part, [mat])))
    # 貫通扉の輪郭（ガラス下端から前面下端の線まで）・前面下端の線
    bm = bmesh.new()
    for yc in (-.385, .385):
        for za, zb in ((1.13, 1.52), (1.52, 1.87)):
            patch(bm, za, zb, yc - .006, yc + .006, .002, 1, 0)
    patch(bm, 1.13, 1.142, -.385, .385, .002, 8, 0)
    patch(bm, 1.160, 1.172, -1.30, 1.30, .002, 24, 0)       # 前面下端の線（z 1.166）
    patch(bm, 1.18, 1.24, -.03, .03, .003, 1, 0)            # 貫通扉の取っ手
    out.append(("gdoor", to_mesh(bm, "gdoor", [M['rubber_frame']])))
    # 前面ガラス域の中の枠：3枚窓（中央は貫通扉の窓）の縦の柱と上下の枠（黒）
    bm = bmesh.new()
    for yc in (-.35, .35):
        patch(bm, 2.20, 2.80, yc - .022, yc + .022, .004, 1, 0)
    for zc in (2.20, 2.80):
        patch(bm, zc - .018, zc + .018, -1.22, 1.22, .004, 24, 0)
    out.append(("fframe", to_mesh(bm, "fframe", [M['face_black']])))
    # 行先表示（左＝-y 側・広い）と種別表示（右）…ガラス上部の内側
    bm = bmesh.new()
    patch(bm, 3.107, 3.272, -1.160, -.540, .003, 10, 0)
    patch(bm, 3.107, 3.272, .555, 1.010, .003, 8, 0)
    out.append(("ledbox", to_mesh(bm, "ledbox", [M['led_panel']])))
    out.append(("ledtxt", front_text(dest, M['led_dest'], -.85, 3.19, .52, .105, keep_aspect=True, space=.92, lift=.012)))
    out.append(("ledtxt", front_text(kind, kind_mat or M['led_type'], .7825, 3.19, .30, .115, keep_aspect=True, lift=.012)))
    # KEIO ロゴ（紺、K の縦画は赤）と車番（白・赤帯の上部）
    out.append(("txt", front_text("KEIO", M['navy_txt'], .86, 1.640, .32, .044, shear=.25, space=1.08)))
    bm = bmesh.new()                                        # K の右上の斜め画（赤）：外から見て右＝+y
    v = [bm.verts.new((nose_x(1.640 + dz, (.70 + t) / HWB, HWB) + .0075, .70 + t, 1.640 + dz)) for t, dz in k_arm_pts(.32, .044)]
    bm.faces.new(v)
    out.append(("keio_red", to_mesh(bm, "keio_red", [M['keio_red']])))
    out.append(("txt", front_text(number, M['white'], -.76, 1.481, .26, .066, space=1.05)))
    # ワイパー：ガラス下端の外側に腕、刃はガラス下端に沿って寝かせる
    bm = bmesh.new()
    for sg in (-1, 1):
        p0 = Vector((nose_x(1.75, sg * .87 / HWB, HWB) + .025, sg * .87, 1.75))
        p1 = Vector((nose_x(1.94, sg * .70 / HWB, HWB) + .025, sg * .70, 1.94))
        bm_cyl(bm, p0, p1, .012, 6, 0)
        q0 = Vector((nose_x(1.93, sg * .70 / HWB, HWB) + .03, sg * .70, 1.93))
        q1 = Vector((nose_x(1.90, sg * .12 / HWB, HWB) + .03, sg * .12, 1.90))
        bm_cyl(bm, q0, q1, .008, 5, 0)
    out.append(("wiper", to_mesh(bm, "wiper", [M['black']])))
    # スカート（アイボリー）：上端1.09、下ほど前へ出る。中央に連結器の切り欠き（|y|<0.36）
    bm = bmesh.new()
    Cn = 28
    top, bot = [], []
    for c in range(Cn + 1):
        s = -1 + 2 * c / Cn
        y = s * (HWB - .12)
        xt = nose_x(1.0, y / HWB, HWB) - .02
        top.append(bm.verts.new((xt, y, 1.09)))
        bot.append(bm.verts.new((xt + .06, y * .96, .24)))
    for c in range(Cn):
        yc = abs((-1 + 2 * (c + .5) / Cn) * (HWB - .12))
        if yc < .36:                                        # 切り欠き：上 60% を抜く
            mid_a = bm.verts.new(top[c].co.lerp(bot[c].co, .60)); mid_b = bm.verts.new(top[c + 1].co.lerp(bot[c + 1].co, .60))
            bm.faces.new([mid_a, bot[c], bot[c + 1], mid_b])
        else:
            bm.faces.new([top[c], bot[c], bot[c + 1], top[c + 1]])
    for sg in (-1, 1):                                      # スカートの側板（奥行き）
        c = 0 if sg < 0 else Cn
        p = top[c].co; q = bot[c].co
        v = [bm.verts.new(p), bm.verts.new(q), bm.verts.new((WRAP_X - .1, q.y, q.z + .06)), bm.verts.new((WRAP_X - .1, p.y, p.z))]
        bm.faces.new(v if sg > 0 else list(reversed(v)))
    out.append(("skirt", to_mesh(bm, "skirt", [M['ivory']])))
    bm = bmesh.new()
    xs = nose_x(1.0, 0, HWB)
    bm_box(bm, xs - .9, xs + .20, -.13, .13, .76, .96, 0)            # 密着連結器
    bm_box(bm, xs + .10, xs + .26, -.20, .20, .72, 1.00, 0)          # 連結器の頭
    bm_box(bm, xs - .6, xs + .08, .22, .40, .78, .92, 0)             # 電気連結器
    bm_box(bm, CAR_L / 2 - 1.3, xs - .30, -1.2, 1.2, .76, Z_BOT, 0)  # 前頭部床下
    out.append(("coupler", to_mesh(bm, "coupler", [M['under']])))
    return out


def side_fittings(dest, kind="特急", kind_mat=None):
    """幕板まわりの小物：側面行先表示器・表示灯ユニット・車側灯・車外スピーカー（u の並びは全車・両面共通）"""
    bm = bmesh.new()
    for s in (-1, 1):
        X = lambda u: u if s > 0 else -u                    # +y 面は x=u、-y 面は x=-u
        def box(u0, u1, z0, z1, d, mat, off=0.0):
            a, b = sorted((X(u0), X(u1)))
            y0, y1 = sorted((s * (HWB + off), s * (HWB + off + d)))
            bm_box(bm, a, b, y0, y1, z0, z1, mat)
        box(SLED[0], SLED[1], SLED[2], SLED[3], .014, 1)             # 表示器の枠（明るい灰）
        box(SLED_FACE[0], SLED_FACE[1], SLED_FACE[2], SLED_FACE[3], .003, 0, .014)   # 表示面（黒）
        box(LAMPUNIT[0], LAMPUNIT[1], LAMPUNIT[2], LAMPUNIT[3], .018, 1)
        for zc in (3.26, 3.14):                                       # 2灯のレンズ
            uc = (LAMPUNIT[0] + LAMPUNIT[1]) / 2
            bm_cyl(bm, (X(uc), s * (HWB + .018), zc), (X(uc), s * (HWB + .024), zc), .038, 14, 2)
        uc, zc, r = SIDE_LAMP                                         # 車側灯（丸）
        bm_cyl(bm, (X(uc), s * HWB, zc), (X(uc), s * (HWB + .02), zc), r, 18, 1)
        bm_cyl(bm, (X(uc), s * (HWB + .02), zc), (X(uc), s * (HWB + .03), zc), r - .015, 18, 3)
        for u0, u1 in SPEAKERS:                                       # 車外スピーカー（縦の格子）
            box(u0, u1, SPK_Z[0], SPK_Z[1], .012, 1)
            n = 9
            for k in range(n):
                ua = u0 + (u1 - u0) * (k + .25) / n; ub = u0 + (u1 - u0) * (k + .75) / n
                box(ua, ub, SPK_Z[0] + .02, SPK_Z[1] - .02, .002, 0, .012)
    parts = [("sfit", to_mesh(bm, "sfit", [M['led_panel'], M['stl_trim'], M['lens_off'], M['tail_off']]))]
    # 表示器の文字（左に種別、右に行先。外から見て左＝ u の大きい側）
    for s in (-1, 1):
        X = lambda u: u if s > 0 else -u
        y = s * (HWB + .0185)
        parts.append(("txt", placed_text(kind, kind_mat or M['led_type'], (X(.695), y, 3.166), SIDE_ROT[s], .12, .075, keep_aspect=True)))
        parts.append(("txt", placed_text(dest, M['led_dest'], (X(.40), y, 3.166), SIDE_ROT[s], .38, .07, keep_aspect=True, space=.92)))
    return parts


def plate_parts(x_num, number, x_logo):
    """幕板の車番（白地に紺）と KEIO ロゴ（紺・K に赤）。x_num/x_logo：車番・ロゴの中心 x（両側面とも同じ端）"""
    parts = []
    bm = bmesh.new()
    pw, ph = PLATE_U[1] - PLATE_U[0], PLATE_Z[1] - PLATE_Z[0]
    zc = (PLATE_Z[0] + PLATE_Z[1]) / 2
    for s in (-1, 1):
        y0, y1 = sorted((s * HWB, s * (HWB + .003)))
        bm_box(bm, x_num - pw / 2, x_num + pw / 2, y0, y1, PLATE_Z[0], PLATE_Z[1], 0)      # 紺の縁
        y0, y1 = sorted((s * (HWB + .003), s * (HWB + .004)))
        bm_box(bm, x_num - pw / 2 + .012, x_num + pw / 2 - .012, y0, y1, PLATE_Z[0] + .012, PLATE_Z[1] - .012, 1)  # 白地
        ks = 1 if s < 0 else -1                                  # 外から見て左端（K）の x
        k_arm(bm, x_logo - ks * pw / 2, s, zc, pw, .085, .0065, 2)                          # K の右上の斜め画（赤）
        parts.append(("txt", placed_text(number, M['navy_txt'], (x_num, s * (HWB + .005), zc), SIDE_ROT[s], pw - .07, ph - .045, space=1.05)))
        parts.append(("txt", placed_text("KEIO", M['navy_txt'], (x_logo, s * (HWB + .005), zc), SIDE_ROT[s], pw, .085, shear=.25, space=1.08)))
    parts.insert(0, ("plate", to_mesh(bm, "plate", [M['navy_txt'], M['white'], M['keio_red']])))
    return parts


def cab_logo_parts():
    """運転台側面の KEIO ロゴ（u 7.81〜8.36、z 2.747〜2.884）"""
    parts = []
    bm = bmesh.new()
    for s in (-1, 1):
        ks = 1 if s < 0 else -1
        k_arm(bm, 8.085 - ks * .275, s, 2.8155, .55, .137, .0065, 0)
        parts.append(("txt", placed_text("KEIO", M['navy_txt'], (8.085, s * (HWB + .005), 2.8155), SIDE_ROT[s], .55, .137, shear=.25, space=1.08)))
    parts.insert(0, ("cablogo_red", to_mesh(bm, "cablogo_red", [M['keio_red']])))
    return parts


# ---- 車体のシェーダー ------------------------------------------------------
def rr_mask(nb, x, z, x0, x1, z0, z1, rt, rb=None):
    """角丸長方形の内側なら1（符号付き距離）。上の角 rt、下の角 rb"""
    rb = rt if rb is None else rb
    cx, cz, hx, hz = (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2
    rt = min(rt, hx - 1e-3, hz - 1e-3); rb = min(rb, hx - 1e-3, hz - 1e-3)
    upper = nb.math('GREATER_THAN', z, cz)
    r = nb.math('ADD', rb, nb.math('MULTIPLY', upper, rt - rb))
    dx = nb.math('MAXIMUM', nb.math('SUBTRACT', nb.math('ABSOLUTE', nb.math('SUBTRACT', x, cx)), nb.math('SUBTRACT', hx, r)), 0.0)
    dz = nb.math('MAXIMUM', nb.math('SUBTRACT', nb.math('ABSOLUTE', nb.math('SUBTRACT', z, cz)), nb.math('SUBTRACT', hz, r)), 0.0)
    dist = nb.math('SQRT', nb.math('ADD', nb.math('MULTIPLY', dx, dx), nb.math('MULTIPLY', dz, dz)))
    inside = nb.math('LESS_THAN', dist, r)
    box = nb.math('MULTIPLY', nb.band(x, x0, x1), nb.band(z, z0, z1))
    return nb.math('MULTIPLY', inside, box)


def lerp_clamp(nb, v, a, b, za, zb):
    """v が a→b のとき za→zb（範囲外は端の値）"""
    t = nb.math('DIVIDE', nb.math('SUBTRACT', v, a), b - a)
    t = nb.math('MINIMUM', nb.math('MAXIMUM', t, 0.0), 1.0)
    return nb.math('ADD', za, nb.math('MULTIPLY', t, zb - za))


def mat_car_body(name, cab=False):
    m, nb, out = new_mat(name)
    tc = nb.n("ShaderNodeTexCoord"); s = nb.n("ShaderNodeSeparateXYZ"); nb.l(tc.outputs["Object"], s.inputs[0])
    geo = nb.n("ShaderNodeNewGeometry")
    vt = nb.n("ShaderNodeVectorTransform", vector_type='NORMAL', convert_from='WORLD', convert_to='OBJECT')
    nb.l(geo.outputs["Normal"], vt.inputs[0])
    ns = nb.n("ShaderNodeSeparateXYZ"); nb.l(vt.outputs[0], ns.inputs[0])
    x, y, z = s.outputs[0], s.outputs[1], s.outputs[2]
    side = nb.math('GREATER_THAN', nb.math('ABSOLUTE', ns.outputs[1]), .75)
    # 幕板の小物の並びの座標 u（+y 面は u=x、-y 面は u=-x）
    sgn = nb.math('SUBTRACT', nb.math('MULTIPLY', nb.math('GREATER_THAN', y, 0.0), 2.0), 1.0)
    u = nb.math('MULTIPLY', x, sgn)
    # --- 帯 ---
    if cab:
        top = lerp_clamp(nb, x, 7.97, 8.27, RED_UP[1], RED_LO[1])      # 段差：後ろが上段（約46°）
        bot = lerp_clamp(nb, x, 7.87, 8.15, RED_UP[0], RED_LO[0])      # 下端は約55°
        red = nb.math('MULTIPLY', nb.math('GREATER_THAN', z, bot), nb.math('LESS_THAN', z, top))
    else:
        red = nb.band(z, *RED_UP)
    blue = nb.math('MULTIPLY', nb.band(z, *BLUE), nb.math('SUBTRACT', 1.0, red))
    maku = nb.math('MULTIPLY', nb.band(z, *MAKU), nb.band(x, -MAKU_END, MAKU_CAB if cab else MAKU_END))
    for a, b in MAKU_GAPS:                                             # 幕板の帯の切れ目
        maku = nb.math('MULTIPLY', maku, nb.math('SUBTRACT', 1.0, nb.band(u, a, b)))
    maku = nb.math('MULTIPLY', maku, side)
    roof = nb.math('GREATER_THAN', z, Z_SH0 + .012)
    # --- 窓（側面・透過）：外枠の内側 FW をガラスとする ---
    win = None
    for x0, x1, z0, z1, rt, rb, kind in side_windows(cab):
        w = rr_mask(nb, x, z, x0 + FW, x1 - FW, z0 + FW, z1 - FW, max(rt - FW, .004), max(rb - FW, .004))
        win = w if win is None else nb.math('ADD', win, w)
    glass_side = nb.math('MULTIPLY', nb.math('MINIMUM', win, 1.0), side)
    door = None
    for d in DOORX:
        dd = rr_mask(nb, x, z, d - DOOR_HW, d + DOOR_HW, Z_FLR, DZ1, .10, .005)
        door = dd if door is None else nb.math('ADD', door, dd)
    # --- 色 ---
    stl = srgb((.70, .71, .72))
    nz = nb.n("ShaderNodeTexNoise", i_Scale=70, i_Detail=2)          # ヘアライン仕上げ（車長方向）
    mp = nb.n("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.02, 1, 1.3)
    nb.l(tc.outputs["Object"], mp.inputs[0]); nb.l(mp.outputs[0], nz.inputs["Vector"])
    base = nb.mix(nb.math('MULTIPLY', nz.outputs[0], .16), stl, (1, 1, 1))
    base = nb.mix(nb.math('MULTIPLY', door, side), base, srgb((.75, .77, .79)))
    below = nb.math('LESS_THAN', z, Z_FLR - .004)                      # すその絞り（やや暗い）
    base = nb.mix(nb.math('MULTIPLY', below, .35), base, srgb((.36, .37, .38)))
    painted = nb.math('ADD', nb.math('ADD', red, blue), nb.math('ADD', maku, roof), clamp=True)
    ivr = None
    if cab:
        ivr = nb.math('GREATER_THAN', x, IVORY_X)
        base = nb.mix(ivr, base, srgb((.90, .88, .80)))
        painted = nb.math('ADD', painted, ivr, clamp=True)
    base = nb.mix(nb.math('MULTIPLY', roof, nb.math('SUBTRACT', 1, ivr) if cab else 1.0), base, srgb((.60, .61, .60)))
    base = nb.mix(nb.math('ADD', red, maku, clamp=True), base, srgb((.83, .02, .42)))
    base = nb.mix(blue, base, srgb((.11, .17, .42)))
    body = nb.n("ShaderNodeBsdfPrincipled")
    nb.l(base, body.inputs["Base Color"])
    nb.l(nb.math('SUBTRACT', .88, nb.math('MULTIPLY', painted, .88)), body.inputs["Metallic"])
    nb.l(nb.math('ADD', .24, nb.math('MULTIPLY', painted, .14)), body.inputs["Roughness"])
    shader = body.outputs[0]
    if cab:
        # 前面の黒い部分（ガラス域）：下端 中央1.86→端1.93、上端 中央3.464→端3.409
        yy = nb.math('DIVIDE', nb.math('MULTIPLY', y, y), 1.2 * 1.2)
        ay = nb.math('ABSOLUTE', y)
        cb = nb.math('MAXIMUM', nb.math('SUBTRACT', ay, 1.10), 0.0)       # 下の角の丸み（|y|>1.10 で上がる）
        ct = nb.math('MAXIMUM', nb.math('SUBTRACT', ay, 1.05), 0.0)       # 上の角の丸み（|y|>1.05 で下がる）
        zb_ = nb.math('ADD', nb.math('ADD', 1.86, nb.math('MULTIPLY', yy, .07)), nb.math('MULTIPLY', nb.math('MULTIPLY', cb, cb), 1.2))
        zt_ = nb.math('SUBTRACT', nb.math('SUBTRACT', 3.464, nb.math('MULTIPLY', yy, .055)), nb.math('MULTIPLY', nb.math('MULTIPLY', ct, ct), .6))
        inz = nb.math('MULTIPLY', nb.math('GREATER_THAN', z, zb_), nb.math('LESS_THAN', z, zt_))
        # 側面への回り込み（側面を向く面）：z 2.056〜3.42、後ろの角を丸める
        wrap = rr_mask(nb, x, z, WRAP_X, CAR_L / 2 + 1.0, 2.056, 3.42, .15, .25)
        # 面の向きで前面用・側面用の形を滑らかに切り替える（法線の x 成分 0.3→0.7）
        t = nb.math('MINIMUM', nb.math('MAXIMUM', nb.math('DIVIDE', nb.math('SUBTRACT', ns.outputs[0], .3), .4), 0.0), 1.0)
        nose = nb.math('GREATER_THAN', x, WRAP_X)
        fglass = nb.math('MULTIPLY', nose, nb.math('ADD', nb.math('MULTIPLY', inz, t),
                                                   nb.math('MULTIPLY', wrap, nb.math('SUBTRACT', 1.0, t))))
        fgd = nb.n("ShaderNodeBsdfDiffuse"); fgd.inputs[0].default_value = (*srgb((.01, .012, .015)), 1)
        fgg = nb.n("ShaderNodeBsdfGlossy", i_Roughness=.05)
        fg = nb.n("ShaderNodeMixShader"); fg.inputs[0].default_value = .16
        nb.l(fgd.outputs[0], fg.inputs[1]); nb.l(fgg.outputs[0], fg.inputs[2])
        mx0 = nb.n("ShaderNodeMixShader"); nb.l(fglass, mx0.inputs[0])
        nb.l(shader, mx0.inputs[1]); nb.l(fg.outputs[0], mx0.inputs[2])
        shader = mx0.outputs[0]
        glass_side = nb.math('MULTIPLY', glass_side, nb.math('SUBTRACT', 1, nose))
    tr = nb.n("ShaderNodeBsdfTransparent"); tr.inputs[0].default_value = (*srgb((.52, .60, .60)), 1)
    gl = nb.n("ShaderNodeBsdfGlossy", i_Roughness=.02)
    fr = nb.n("ShaderNodeFresnel", i_IOR=1.52)
    gm = nb.n("ShaderNodeMixShader"); nb.l(nb.math('ADD', fr.outputs[0], .14), gm.inputs[0])
    nb.l(tr.outputs[0], gm.inputs[1]); nb.l(gl.outputs[0], gm.inputs[2])
    mx = nb.n("ShaderNodeMixShader"); nb.l(glass_side, mx.inputs[0])
    nb.l(shader, mx.inputs[1]); nb.l(gm.outputs[0], mx.inputs[2])
    nb.l(mx.outputs[0], out.inputs[0])
    return m


def mat_ac():
    """冷房装置：側面に縦のルーバー"""
    m, nb, out = new_mat("ac_unit_v4")
    tc = nb.n("ShaderNodeTexCoord"); s = nb.n("ShaderNodeSeparateXYZ"); nb.l(tc.outputs["Object"], s.inputs[0])
    wave = nb.n("ShaderNodeTexWave", wave_type='BANDS', bands_direction='X', i_Scale=1.0, i_Distortion=0.0)
    mp = nb.n("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (11.0, 1, 1)
    nb.l(tc.outputs["Object"], mp.inputs[0]); nb.l(mp.outputs[0], wave.inputs["Vector"])
    louver = nb.math('MULTIPLY', nb.math('GREATER_THAN', wave.outputs["Fac"], .62), nb.band(s.outputs[2], 3.80, 3.97))
    base = nb.mix(nb.math('MULTIPLY', louver, .7), srgb((.62, .64, .65)), srgb((.30, .31, .32)))
    b = nb.n("ShaderNodeBsdfPrincipled", i_Roughness=.45, i_Metallic=.3)
    nb.l(base, b.inputs["Base Color"]); nb.l(b.outputs[0], out.inputs[0])
    return m


def interior_mesh(name, cab=False):
    """車内（床面 Z_FLR）：床・天井・ロングシート・スタンション・つり革・天井照明"""
    bm = bmesh.new()
    hw = HWB - .08
    L = CAR_L / 2 - (1.05 if cab else .3)
    F = Z_FLR
    bm_box(bm, -L, L, -hw, hw, F - .1, F, 0)
    bm_box(bm, -L, L, -hw, hw, F + 2.245, F + 2.295, 1)                 # 天井高さ 2,245mm
    xs = [-L] + [d for dx in DOORX for d in (dx - DOORW / 2, dx + DOORW / 2)] + [L]
    for i in range(0, len(xs), 2):
        a, b = xs[i] + .15, xs[i + 1] - .15
        for s_ in (-1, 1):
            y0, y1 = sorted((s_ * (hw - .55), s_ * hw))
            bm_box(bm, a, b, y0, y1, F, F + .43, 2)
            yb0, yb1 = sorted((s_ * (hw - .12), s_ * hw))
            bm_box(bm, a, b, yb0, yb1, F + .43, F + .92, 2)
            bm_cyl(bm, (a, s_ * (hw - .5), F + .43), (a, s_ * (hw - .5), F + 2.245), .018, 6, 4)
    for s_ in (-1, 1):
        bm_box(bm, -L, L, s_ * .7 - .08, s_ * .7 + .08, F + 2.215, F + 2.245, 3)
        bm_cyl(bm, (-L, s_ * .95, F + 1.87), (L, s_ * .95, F + 1.87), .015, 6, 4)
        x = -L + .3
        while x < L:
            bm_box(bm, x - .03, x + .03, s_ * .95 - .01, s_ * .95 + .01, F + 1.57, F + 1.87, 5)
            x += .45
    for dx in (-L + .05, L - .05):
        bm_box(bm, dx - .05, dx + .05, -hw, hw, F, F + 2.245, 1)
    return to_mesh(bm, name, [M['floor_car'], M['interior'], M['seat'], M['cabin_light'], M['stl_trim'], M['strap']])


def people_mesh(name, n_seat, n_stand, rng, L=CAR_L / 2 - .7, W=1.0):
    """人物（頭＋胴体）。頂点カラーで服・髪の色。床面 Z_FLR 基準"""
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("col")
    clothes = [(.05, .05, .07), (.12, .13, .2), (.25, .25, .27), (.55, .52, .48), (.75, .74, .7),
               (.35, .12, .1), (.1, .2, .35), (.6, .45, .3), (.9, .88, .85), (.2, .3, .2)]
    def person(x, y, z, seated):
        first = len(bm.faces)
        h = 1.0 if seated else rng.uniform(1.52, 1.78)
        body_h = .62 if seated else h * .58
        c = srgb(rng.choice(clothes)); skin = srgb(rng.choice([(.85, .68, .55), (.78, .6, .48), (.9, .75, .62)]))
        hair = srgb(rng.choice([(.03, .02, .02), (.1, .06, .04), (.25, .18, .12)]))
        if not seated:
            bm_box(bm, x - .1, x + .1, y - .13, y + .13, z, z + h * .45, 0)
        zb = z + (0.43 if seated else h * .45)
        bm_cyl(bm, (x, y, zb), (x, y, zb + body_h * .75), .19, 8, 0)
        bm_sphere(bm, (x, y, zb + body_h * .75 + .13), .105, 0, 2)
        faces = list(bm.faces)[first:]
        nf = len(faces)
        for i, f in enumerate(faces):
            cc = c if i < nf - 320 else (hair if f.calc_center_median().z > zb + body_h * .75 + .13 else skin)
            for lp in f.loops: lp[col_layer] = (*cc, 1)
    hw = HWB - .3
    for i in range(n_seat):
        x = rng.uniform(-L, L); s_ = rng.choice((-1, 1))
        if any(abs(x - d) < DOORW / 2 + .2 for d in DOORX): continue
        person(x, s_ * (hw - .2), Z_FLR, True)
    for i in range(n_stand):
        person(rng.uniform(-L, L), rng.uniform(-W / 2, W / 2), Z_FLR, False)
    return to_mesh(bm, name, [M['person']])


def bogie_mesh(name, wb):
    """台車（軸距 wb）：側枠は軸箱の上が高く中央が低い。軸箱・ばね・車輪 φ860・空気ばね・ブレーキ。台車中心 ±6.88"""
    bm = bmesh.new()
    for bx in (-6.88, 6.88):
        for s_ in (-1, 1):
            y = s_ * .98
            # 側枠：中央（|dx|<0.55）は低く、両端（軸箱の上）は高い。台形で段をつなぐ
            prof = [(-wb / 2 - .32, .60), (-wb / 2 - .32, .80), (-wb / 2 + .30, .80), (-.55, .66), (.55, .66),
                    (wb / 2 - .30, .80), (wb / 2 + .32, .80), (wb / 2 + .32, .60), (wb / 2 - .20, .60),
                    (.60, .50), (-.60, .50), (-wb / 2 + .20, .60)]
            A = [bm.verts.new((bx + px, y - .07, pz)) for px, pz in prof]
            B = [bm.verts.new((bx + px, y + .07, pz)) for px, pz in prof]
            n = len(prof)
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new([A[i], A[j], B[j], B[i]]).material_index = 0
            bm.faces.new(list(reversed(A))).material_index = 0
            bm.faces.new(B).material_index = 0
            for wx in (bx - wb / 2, bx + wb / 2):
                bm_box(bm, wx - .16, wx + .16, y - .11, y + .11, .33, .56, 0)             # 軸箱
                bm_cyl(bm, (wx, y, .56), (wx, y, .80), .085, 12, 0)                      # 軸ばね
                bm_cyl(bm, (wx, s_ * .74, .43), (wx, s_ * .64, .43), .43, 28, 1)         # 車輪 φ860
                bm_cyl(bm, (wx, s_ * .745, .43), (wx, s_ * .735, .43), .19, 14, 2)       # 車輪中心（明るい）
                bm_box(bm, wx - (.38 if wx > bx else -.26), wx - (.26 if wx > bx else -.38), y - .08, y + .08, .40, .62, 0)  # ブレーキ
            bm_cyl(bm, (bx, y * .9, .82), (bx, y * .9, .98), .21, 16, 3)                  # 空気ばね
        bm_box(bm, bx - .22, bx + .22, -.98, .98, .60, .74, 0)                            # 横ばり
        bm_box(bm, bx - .35, bx + .35, -.45, .45, .74, .90, 0)                            # けん引装置
    for x0, x1, dz in ((-5.2, -2.3, .30), (-1.9, 1.5, .34), (1.9, 5.1, .26)):              # 床下機器
        bm_box(bm, x0, x1, -1.18, 1.18, Z_BOT - .02 - dz * 1.6, Z_BOT - .02, 4)
    return to_mesh(bm, name, [M['bogie'], M['under'], M['roofc'], M['black'], M['under_gray']])


def ac_mesh(name):
    """集中式冷房装置（長さ4.38m、上端4.055、側面にルーバー）"""
    bm = bmesh.new()
    Lh = 4.38 / 2
    bm_box(bm, -Lh, Lh, -.95, .95, Z_CROWN - .06, 3.99, 0)
    bm_box(bm, -Lh + .12, Lh - .12, -.88, .88, 3.99, 4.02, 0)
    for cx in (-1.45, -.5, .5, 1.45):                                  # 凝縮器ファンの覆い
        bm_cyl(bm, (cx, 0, 4.00), (cx, 0, 4.055), .30, 20, 1)
    return to_mesh(bm, name, [M['ac'], M['under']])


def panto_mesh(name):
    """シングルアーム式パンタグラフ（原点＝台座中心、+x＝京王八王子方）。
    実測：下枠の付け根 +0.07（z3.92）、ひじ +0.97 側、舟は -0.26（架線 TR の高さ）"""
    bm = bmesh.new()
    zr = Z_CROWN - .03
    bm_box(bm, -.85, .85, -.55, .55, zr, zr + .10, 0)                   # 台枠
    for sx in (-.7, .7):
        for sy in (-.45, .45):
            bm_cyl(bm, (sx, sy, zr - .05), (sx, sy, zr + .02), .06, 10, 1)       # 碍子
    hinge = Vector((.07, 0, 3.92)); head = Vector((-.26, 0, RAIL_V + TR - RAIL_V - .04))
    l1, l2 = 1.076, 1.34
    d = (head - hinge).length
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(0.0, l1 * l1 - a * a))
    u_ = (head - hinge) / d; perp = Vector((u_.z, 0, -u_.x))
    knee = hinge + u_ * a + perp * h
    if knee.x < hinge.x: knee = hinge + u_ * a - perp * h           # ひじは +x（京王八王子方）
    bm_cyl(bm, (-.10, 0, zr + .14), hinge, .03, 8, 0)
    bm_cyl(bm, hinge, knee, .035, 8, 0)                                 # 下枠
    bm_cyl(bm, knee, head, .028, 8, 0)                                  # 上枠
    bm_cyl(bm, hinge + Vector((0, -.2, 0)), hinge + Vector((0, .2, 0)), .05, 8, 0)
    bm_cyl(bm, (-.2, 0, zr + .12), knee.lerp(hinge, .5) + Vector((0, 0, .05)), .015, 6, 0)   # 釣り合い棒
    bm_box(bm, head.x - .07, head.x + .07, -.62, .62, head.z, head.z + .04, 0)          # 舟体
    for s_ in (-1, 1):
        bm_cyl(bm, (head.x, s_ * .62, head.z + .02), (head.x, s_ * .82, head.z - .06), .018, 6, 0)   # ホーン
    return to_mesh(bm, name, [M['black'], M['under']])


def roof_bits(name, cab):
    """屋根上の小物：アンテナ（先頭車、u 8.743、上端4.04）など"""
    bm = bmesh.new()
    if cab:
        bm_box(bm, 8.67, 8.82, -.08, .08, Z_CROWN - .01, Z_CROWN + .03, 0)
        bm_cyl(bm, (8.743, 0, Z_CROWN + .03), (8.743, 0, 4.04), .02, 8, 0)
        bm_box(bm, 7.73, 8.2, -.25, .25, Z_CROWN - .03, 3.76, 0)
    return to_mesh(bm, name, [M['under']])


def add_parts(parts, C, parent, name):
    """(種類, データ) の一覧を子オブジェクトとして置く"""
    for kind, dat in parts:
        if kind in ("txt", "ledtxt"):
            cu, loc, rot, scl = dat
            t = new_obj(f"{name}_txt", cu, C, loc=loc, rot=rot, scl=scl); t.parent = parent
        else:
            q = new_obj(f"{name}_{kind}", dat, C); q.parent = parent


def _build_assets():
    """材質と部品メッシュを1回だけ作る（数値は元のコードのまま）"""
    global SHELL, SHELL_CAB, DETAIL, DETAIL_CAB, INTER, INTER_CAB, BOGIE_T, BOGIE_M, AC, PANTO, ROOF_CAB
    global PANTO_BITS, PEOPLE_RUSH, PEOPLE_LIGHT, GANG
    # ---- 基本の材質（build_scene.py の値） ----
    M['white'] = mat_simple("white_paint", srgb((.85, .85, .83)), .6)
    M['black'] = mat_simple("black", srgb((.03, .03, .03)), .5)
    M['led_type'] = mat_emit("led_tokkyu", srgb((1, .18, .08)), 12)       # 種別「特急」
    M['led_dest'] = mat_emit("led_dest", srgb((1, .55, .08)), 12)          # 行先（オレンジLED）
    M['head'] = mat_emit("headlight", srgb((1, .95, .85)), 40)
    M['tail'] = mat_emit("taillight", srgb((1, .05, .03)), 8)
    M['cabin_light'] = mat_emit("cabin_light", srgb((1, .98, .93)), 6)
    M['person'] = mat_person()
    M['seat'] = mat_noise("seat_moquette", srgb((.20, .16, .38)), srgb((.28, .22, .48)), 60, .95, .1)
    M['interior'] = mat_simple("interior_wall", srgb((.86, .86, .83)), .5)
    M['floor_car'] = mat_simple("car_floor", srgb((.35, .33, .30)), .7)
    M['under'] = mat_simple("underfloor", srgb((.08, .08, .09)), .6, .3)
    M['roofc'] = mat_simple("car_roof", srgb((.50, .52, .55)), .5, .6)
    M['face_black'] = mat_simple("front_black", srgb((.02, .02, .025)), .08)   # 前面の黒（ガラス）
    # ---- 車体まわりの材質と部品（car_block_v4.py の値） ----
    M['rubber_frame'] = mat_simple("rubber_frame", srgb((.05, .05, .055)), .5)
    M['groove'] = mat_simple("groove", srgb((.30, .31, .32)), .5, .6)
    M['stl_trim'] = mat_simple("stl_trim", srgb((.62, .64, .67)), .3, .9)
    M['ivory'] = mat_simple("ivory", srgb((.90, .88, .80)), .35)
    M['navy_txt'] = mat_simple("navy_txt", srgb((.11, .17, .42)), .4)
    M['keio_red'] = mat_simple("keio_red", srgb((.83, .02, .42)), .4)
    M['lens_off'] = mat_simple("lens_off", srgb((.33, .32, .30)), .08)
    M['tail_off'] = mat_simple("tail_off", srgb((.35, .05, .05)), .1)
    M['led_panel'] = mat_simple("led_panel", srgb((.012, .012, .014)), .15)
    M['car_e+'] = mat_car_body("car_body_v4")
    M['car_cab_e+'] = mat_car_body("car_body_cab_v4", cab=True)
    M['strap'] = mat_simple("strap", srgb((.92, .92, .9)), .5)
    M['under_gray'] = mat_noise("under_gray", srgb((.18, .18, .19)), srgb((.28, .28, .28)), 8, .7, .05)
    M['bogie'] = mat_noise("bogie_gray", srgb((.20, .20, .21)), srgb((.27, .27, .28)), 6, .7, .05)
    M['ac'] = mat_ac()
    SHELL = shell_mesh("shell", False); SHELL_CAB = shell_mesh("shell_cab", True)
    DETAIL = detail_mesh("detail", False); DETAIL_CAB = detail_mesh("detail_cab", True)
    INTER = interior_mesh("interior"); INTER_CAB = interior_mesh("interior_cab", True)
    BOGIE_T = bogie_mesh("bogie_t", 2.1); BOGIE_M = bogie_mesh("bogie_m", 2.2)
    AC = ac_mesh("ac"); PANTO = panto_mesh("panto"); ROOF_CAB = roof_bits("roof_cab", True)
    bm = bmesh.new()
    bm_box(bm, -.12, .12, -.10, .10, Z_CROWN - .03, 3.80, 0)          # パンタ付近の避雷器
    PANTO_BITS = to_mesh(bm, "panto_bits", [M['under']])
    rng = random.Random(8000)
    PEOPLE_RUSH = [people_mesh(f"ppl_rush{i}", 26, 34, rng, W=1.1) for i in range(3)]
    PEOPLE_LIGHT = [people_mesh(f"ppl_light{i}", 16, 4, rng) for i in range(3)]
    bm = bmesh.new()
    for k in range(7):                                                   # 幌（じゃばら）
        bm_box(bm, -.3 + k * .085, -.3 + k * .085 + .05, -.62, .62, Z_FLR + .02, 3.08, 0)
    bm_box(bm, -.3, .3, -.55, .55, Z_FLR + .05, 3.04, 0)
    GANG = to_mesh(bm, "gangway", [M['under']])


# =====================================================================
# 3. 使う側の入口（API）
# =====================================================================
# 編成：新宿方から順の車番。panto・motor は「新宿方から何両目」（1始まり）
FORMATIONS = {
    "8714F": dict(cars=["8714", "8014", "8064", "8114", "8164", "8514", "8564", "8214", "8264", "8764"],
                  panto={2, 4, 5, 8, 9}, motor={2, 3, 4, 5, 8, 9},
                  note="10両。車番・パンタグラフの位置は RailFile.jp の編成写真（山側・海側、2025年）で確認済み"),
    "8713F": dict(cars=["8713", "8013", "8063", "8113", "8163", "8513", "8563", "8213", "8263", "8763"],
                  panto={2, 4, 5, 8, 9}, motor={2, 3, 4, 5, 8, 9},
                  note="10両。車番の並びとパンタグラフの位置は 8714F にならった推定（未確認）"),
    "8728F": dict(cars=["8728", "8028", "8078", "8528", "8578", "8128", "8178", "8778"],
                  panto={2, 3, 6, 7}, motor={2, 3, 6, 7},
                  note="8両。車番は Wikipedia の編成表から。パンタグラフ（M車4両の京王八王子方）は推定（未確認）"),
}
# 種別表示の文字の色（sRGB 0〜1）。特急は v4 の値、各停（白）は推定。ほかの種別は kind_color で指定する
KIND_COLORS = {"特急": (1, .18, .08), "各停": (1, .97, .93)}
_KIND_MATS = {}


def _alive(idb):
    """Blender のデータがまだ有効か（ファイルを開き直すと古い参照は無効になる）"""
    try:
        idb.name
        return True
    except (ReferenceError, AttributeError):
        return False


def find_font(font_path=None):
    """文字のフォント：引数 → 環境変数 KEIO8000_FONT → 同梱 → OS のフォントの順に探す"""
    cands = [font_path, os.environ.get("KEIO8000_FONT"),
             os.path.join(HERE, "fonts", "NotoSansCJKjp-Bold-JIS0208.otf"),
             "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
             "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
             "C:/Windows/Fonts/YuGothB.ttc", "C:/Windows/Fonts/meiryob.ttc"]
    for p in cands:
        if p and os.path.exists(p):
            return p
    raise FileNotFoundError("日本語フォントが見つかりません。init(font_path=...) か環境変数 KEIO8000_FONT で指定してください")


def init(font_path=None, trolley_height=4.9):
    """材質と部品メッシュを作る（2回目以降は何もしない。ファイルを開き直した後は作り直す）。
    trolley_height：パンタグラフの舟を上げる高さ（トロリ線のレール面からの高さ）［m］"""
    global FONT, TR
    if M.get('car_e+') is not None and _alive(M['car_e+']) and _alive(globals().get('SHELL')):
        return
    FONT = find_font(font_path)
    TR = trolley_height
    M.clear(); _KIND_MATS.clear()
    _build_assets()


def led_kind_mat(kind, color=None):
    """種別表示の文字の材質（LED の発光）"""
    if (color is None) and kind == "特急":
        return M['led_type']                                   # v4 と同じ材質
    key = (kind, tuple(color) if color else None)
    if key not in _KIND_MATS or not _alive(_KIND_MATS[key]):
        col = color or KIND_COLORS.get(kind)
        if col is None:
            raise ValueError(f"種別「{kind}」の表示色が未登録です。kind_color=(R,G,B)（sRGB 0〜1）で指定してください")
        _KIND_MATS[key] = mat_emit(f"led_{kind}", srgb(col), 11 if kind == "各停" else 12)
    return _KIND_MATS[key]


class Train:
    """組み立てた編成。root＝編成の親 Empty（先頭の連結器の先の位置、+x が進行方向）、
    cars＝車両ごとの親 Empty（先頭車から順）、collection＝入れたコレクション"""
    def __init__(self, name, root, cars, collection, bound, formation):
        self.name, self.root, self.cars, self.collection = name, root, cars, collection
        self.bound, self.formation = bound, formation

    def __repr__(self):
        return f"<Train {self.name} {len(self.cars)}両 {self.bound}>"


def _new_collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def build_train(name="8000系", formation="8714F", kind="特急", dest="京王八王子", bound="down",
                crowd="light", collection=None, kind_color=None):
    """編成を組み立てる。
      formation : FORMATIONS のキー（"8714F" など）、または dict(cars=[新宿方からの車番…], panto={…}, motor={…})
      kind, dest: 前面・側面の表示（種別・行先）。kind_color で種別の文字色（sRGB）を指定できる
      bound     : "down"＝下り（京王八王子方の車両が先頭）、"up"＝上り（新宿方の車両が先頭）
      crowd     : "light"（空いている）／"rush"（満員）／None（乗客なし）
    戻り値 Train。直線なら train.root を動かす（place_straight）。曲線は place_on_path() で1両ずつ置く。
    灯火：先頭車は前照灯、最後尾は尾灯が点く。種別・行先の表示は先頭車だけ点く（v4 と同じ）"""
    init()
    f = FORMATIONS[formation] if isinstance(formation, str) else formation
    form, panto, motors = list(f['cars']), set(f.get('panto', ())), set(f.get('motor', ()))
    bound = {"下り": "down", "上り": "up"}.get(bound, bound)
    if bound not in ("down", "up"): raise ValueError("bound は 'down'（下り）か 'up'（上り）")
    ncar = len(form)
    direction = -1 if bound == "down" else 1                     # 元のコードの向き（-1＝下り）
    C = collection or _new_collection(name)
    kmat = led_kind_mat(kind, kind_color)
    sfit = side_fittings(dest, kind, kmat)
    cablogo = cab_logo_parts()
    root = bpy.data.objects.new(name, None); link(root, C)
    root.empty_display_type = 'SINGLE_ARROW'; root.empty_display_size = 3.0
    root["k8_formation"] = ",".join(form); root["k8_bound"] = bound
    cars = []
    for i in range(ncar):
        lead, tail = i == 0, i == ncar - 1
        cab = lead or tail
        nform = (ncar - i) if direction < 0 else (i + 1)          # 新宿方から数えた号車
        num = form[nform - 1]
        hachi = 1 if direction < 0 else -1                        # 京王八王子方（親の x の向き）
        car = bpy.data.objects.new(f"{name}_car{i}", None); link(car, C)
        car.parent = root; car.location = (-(CAR_L / 2 + .25) - i * PITCH, 0, 0)
        car.empty_display_type = 'PLAIN_AXES'; car.empty_display_size = 1.0
        car["k8_index"] = i; car["k8_number"] = num
        o = new_obj(f"{name}_sh{i}", SHELL_CAB if cab else SHELL, C, rot=(0, 0, 0 if not tail else math.pi)); o.parent = car
        e_local = -hachi if not tail else hachi                   # 車体ローカルの +x が新宿方なら +1（車番の位置）
        q = new_obj(f"{name}_det{i}", DETAIL_CAB if cab else DETAIL, C); q.parent = o
        q = new_obj(f"{name}_in{i}", INTER_CAB if cab else INTER, C, rot=(0, 0, 0 if not tail else math.pi)); q.parent = car
        q = new_obj(f"{name}_bg{i}", BOGIE_M if nform in motors else BOGIE_T, C); q.parent = car
        q = new_obj(f"{name}_ac{i}", AC, C); q.parent = car
        if nform in panto:                                        # パンタグラフは京王八王子方の台車の上
            q = new_obj(f"{name}_pan{i}", PANTO, C, loc=(hachi * 6.88, 0, 0), rot=(0, 0, 0 if hachi > 0 else math.pi)); q.parent = car
            q = new_obj(f"{name}_pb{i}", PANTO_BITS, C, loc=(hachi * 5.1, 0, 0)); q.parent = car
        if cab:
            q = new_obj(f"{name}_rb{i}", ROOF_CAB, C); q.parent = o
            add_parts(cablogo, C, o, f"{name}_cl{i}")
        if not tail:
            q = new_obj(f"{name}_gw{i}", GANG, C, loc=(-CAR_L / 2 - .25, 0, 0)); q.parent = car
        if crowd in ("light", "rush"):
            q = new_obj(f"{name}_ppl{i}", (PEOPLE_LIGHT if crowd == "light" else PEOPLE_RUSH)[i % 3], C); q.parent = car
        add_parts(sfit, C, o, f"{name}_sf{i}")
        xn = 6.0105 if cab else e_local * 6.0105                  # 車番：中間車は新宿方の端、先頭車は運転台側の端
        add_parts(plate_parts(xn, num, -xn), C, o, f"{name}_pl{i}")
        if cab:
            for kd, dat in front_parts(dest, num, kind, kmat):
                if kd == "ledtxt" and tail: continue              # 最後尾の表示器は消灯
                if kd in ("hl", "tl_off") and tail: continue      # 最後尾：尾灯が点く
                if kd in ("tl", "hl_off") and lead: continue      # 先頭：前照灯が点く
                add_parts([(kd, dat)], C, o, f"{name}_f{i}")
        cars.append(car)
    return Train(name, root, cars, C, bound, form)


def place_straight(train, front=(0, 0, 0), heading=0.0, frame=None):
    """直線：編成の先頭（先頭車の前端から 0.25m 先＝連結器の先）を front に置き、heading の向きへ進む姿勢にする。
    heading は Z 回りの角度［ラジアン］：0＝+X へ進む、math.pi＝-X へ進む。frame を渡すとその時刻にキーを打つ"""
    r = train.root
    r.location = front; r.rotation_euler = (0, 0, heading)
    if frame is not None:
        r.keyframe_insert("location", frame=frame); r.keyframe_insert("rotation_euler", frame=frame)


def place_on_path(train, s_front, path, frame=None):
    """曲線：1両ずつ線路に沿って置く。
      path(s) → (x, y, z)：線路の中心（レール面）を弧長 s［m］でたどる関数（path_from_curve で作れる）
      編成は s が増える向きへ進む（先頭が s_front、後ろの車両は s の小さい側に並ぶ）
    各車両は前後の台車の中心（車両中心から ±6.88m）を曲線の上に置き、その2点を結ぶ向き（勾配も）にそろえる。
    train.root は動かさない（原点・回転なしのまま）こと。frame を渡すとキーを打つ（毎コマ打つなら set_linear も）"""
    rinv = train.root.matrix_world.inverted()
    for car in train.cars:
        i = car["k8_index"]
        sc = s_front - (CAR_L / 2 + .25) - i * PITCH
        pa, pb = Vector(path(sc + 6.88)), Vector(path(sc - 6.88))
        c = (pa + pb) / 2; d = pa - pb
        yaw = math.atan2(d.y, d.x); pitch = math.atan2(d.z, d.xy.length)
        mw = Matrix.Translation(c) @ Euler((0, -pitch, yaw), 'XYZ').to_matrix().to_4x4()
        ml = rinv @ mw
        car.location = ml.translation
        car.rotation_euler = ml.to_euler('XYZ', car.rotation_euler)      # 直前の角度に近い表し方（±π をまたがない）
        if frame is not None:
            car.keyframe_insert("location", frame=frame); car.keyframe_insert("rotation_euler", frame=frame)


def path_from_curve(obj, resolution=None):
    """Blender のカーブ（ベジェ・ポリライン）を弧長でたどる関数にする。戻り値 f(s) → Vector（ワールド座標）、f.length＝全長。
    カーブの向き（始点→終点）が s の増える向き。resolution を渡すと分割数（resolution_u）を一時的に上げて精度を上げる"""
    if resolution:
        old = obj.data.resolution_u; obj.data.resolution_u = resolution
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [obj.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    if resolution: obj.data.resolution_u = old
    acc = [0.0]
    for a, b in zip(pts[:-1], pts[1:]): acc.append(acc[-1] + (b - a).length)
    def f(s):
        if s <= 0: return pts[0] + (pts[1] - pts[0]).normalized() * s
        if s >= acc[-1]: return pts[-1] + (pts[-1] - pts[-2]).normalized() * (s - acc[-1])
        lo, hi = 0, len(acc) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if acc[mid] <= s: lo = mid
            else: hi = mid
        t = (s - acc[lo]) / max(1e-9, acc[hi] - acc[lo])
        return pts[lo].lerp(pts[hi], t)
    f.length = acc[-1]
    return f


def set_linear(train):
    """編成のキーの補間を直線にする（毎コマキーを打って動かすとき。ベジェだとコマの間で揺れる）"""
    for ob in [train.root] + list(train.cars):
        ad = ob.animation_data
        if ad and ad.action:
            for fc in ad.action.fcurves:
                for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'


def texts_to_meshes(train_or_collection):
    """文字（フォントのオブジェクト）をメッシュに変える：フォントの無い環境に渡す・書き出すとき用"""
    C = train_or_collection.collection if isinstance(train_or_collection, Train) else train_or_collection
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for ob in [o for o in C.objects if o.type == 'FONT']:
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        me.name = PREFIX + "txt_" + ob.name
        no = bpy.data.objects.new(ob.name, me)
        for c in ob.users_collection: c.objects.link(no)
        no.parent = ob.parent; no.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
        no.matrix_basis = ob.matrix_basis.copy()
        bpy.data.objects.remove(ob); n += 1
    return n

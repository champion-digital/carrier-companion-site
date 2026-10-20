# Carrier Companion · Tower View static set + baked lighting
# Builds the depot, distribution centres, offices, parked trailers and groves,
# then bakes (1) soft sun + sky shadows onto the ground and (2) ambient occlusion
# into a lightmap atlas for the set. Layout uses three.js coordinates (x, z);
# Blender position = (x, -z, y).
# Usage: Blender -b --factory-startup -P set.py -- <out_dir> [samples]
#   e.g. -- assets/3d 256   (out_dir must already contain trucks.glb from trucks.py)
import bpy, bmesh, math, sys, os
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp'
SAMPLES = int(argv[1]) if len(argv) > 1 else 256
HERE = os.path.dirname(os.path.abspath(__file__))

# ground bake area (three.js units) — mirrored by GROUND_BAKE in tower-view.js
G_CX, G_CZ, G_W, G_D = 2.0, 0.0, 80.0, 60.0
G_RES = (2048, 1536)
AO_RES = 2048

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection

def material(name, rgb, rough=0.6):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    return m

MAT = {n: material(n, c) for n, c in {
    'Porcelain': (0.88, 0.9, 0.93), 'Shade': (0.78, 0.82, 0.86), 'Window': (0.66, 0.74, 0.82),
    'Dock': (0.74, 0.78, 0.83), 'DockGlow': (0.6, 0.85, 1.0), 'Pad': (0.83, 0.86, 0.9), 'Road': (0.78, 0.81, 0.85), 'Paint': (0.97, 0.98, 0.99)}.items()}

PARTS = []
def finish(o, mat, bevel=0.0, seg=3):
    o.data.materials.clear(); o.data.materials.append(MAT[mat])
    if bevel:
        bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = seg
        bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(35)
    PARTS.append(o); return o

def new_obj(bm, name='part'):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); return o

def box(mat, x0, x1, y0, y1, z0, z1, bevel=0.0, seg=3, parent=None):
    """Axis-aligned box in a local frame (x along, y depth, z up)."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
        v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
        v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
    o = new_obj(bm); o.parent = parent
    return finish(o, mat, bevel, seg)

def cyl(mat, r, depth, loc, seg=24, bevel=0.0, r2=None, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    o = new_obj(bm); o.location = loc; o.parent = parent
    return finish(o, mat, bevel)

def frame(x, z, rot):
    e = bpy.data.objects.new('frame', None); col.objects.link(e)
    e.location = (x, -z, 0); e.rotation_euler = (0, 0, rot); return e

# ---------- buildings ----------
def warehouse(x, z, rot, length, docks, h=1.9, depth=4.2, glow=-1):
    """Front (docks) faces local -y, which is three.js +z before rotation."""
    f = frame(x, z, rot); L, D = length / 2, depth / 2
    box('Porcelain', -L, L, -D, D, 0, h, 0.08, 3, f)
    t = 0.1                                                    # parapet
    box('Porcelain', -L, L, -D, -D + t, h, h + 0.14, 0.02, 2, f)
    box('Porcelain', -L, L, D - t, D, h, h + 0.14, 0.02, 2, f)
    box('Porcelain', -L, -L + t, -D, D, h, h + 0.14, 0.02, 2, f)
    box('Porcelain', L - t, L, -D, D, h, h + 0.14, 0.02, 2, f)
    for sy in (-0.7, 0.7):                                     # skylight strips
        box('Window', -L * 0.62, L * 0.62, sy - 0.14, sy + 0.14, h, h + 0.05, 0.015, 2, f)
    for i, ux in enumerate((-0.55, 0.1, 0.6)[: 2 if length < 11 else 3]):   # roof units
        box('Shade', ux * L - 0.32, ux * L + 0.32, 1.1 - 0.26, 1.1 + 0.26, h, h + 0.3, 0.04, 2, f)
        cyl('Shade', 0.15, 0.05, (ux * L, 1.1, h + 0.32), 20, 0.01, parent=f)
    pitch = (length - 2.8) / max(1, docks - 1)
    docks_x = [-L + 1.4 + i * pitch for i in range(docks)]
    px = -L + 0.7
    while px < L - 0.5:                                        # facade pilasters
        if all(abs(px - dx) > 0.75 for dx in docks_x):
            box('Porcelain', px - 0.05, px + 0.05, -D - 0.03, -D + 0.01, 0, h, 0.01, 1, f)
        box('Porcelain', px - 0.05, px + 0.05, D - 0.01, D + 0.03, 0, h, 0.01, 1, f)
        px += 1.4
    py = -D + 0.7
    while py < D - 0.5:
        for sx in (-1, 1):
            box('Porcelain', sx * L - 0.03 if sx < 0 else L - 0.01, -L + 0.01 if sx < 0 else L + 0.03, py - 0.05, py + 0.05, 0, h, 0.01, 1, f)
        py += 1.4
    for hx in (-0.45, 0.35):                                   # roof hatches
        box('Shade', hx * L - 0.18, hx * L + 0.18, -1.3, -0.95, h, h + 0.1, 0.02, 2, f)
    for bx in (-L - 0.15, L + 0.15):                           # bollards + lot lights
        bollard(bx, -D - 2.85, f)
    light_pole(-L - 0.55, -D - 1.6, f, 1); light_pole(L + 0.55, -D - 1.6, f, -1)
    for i in range(docks):
        dx = -L + 1.4 + i * pitch
        box('Shade', dx - 0.56, dx + 0.56, -D - 0.07, -D + 0.01, 0.38, 1.42, 0.02, 2, f)        # seal
        box('DockGlow' if i == glow else 'Dock', dx - 0.46, dx + 0.46, -D - 0.09, -D - 0.05, 0.44, 1.36, 0.01, 2, f)
        box('Shade', dx - 0.6, dx + 0.6, -D - 0.38, -D, 1.5, 1.55, 0.015, 2, f)                 # canopy
        for bx in (-0.36, 0.36):
            box('Shade', dx + bx - 0.06, dx + bx + 0.06, -D - 0.13, -D, 0.3, 0.42, 0.01, 2, f)  # bumpers
    # truck court: pad + stall lines
    box('Pad', -L - 0.3, L + 0.3, -D - 3.0, -D, 0, 0.018, 0.01, 2, f)
    for i in range(docks + 1):
        dx = -L + 1.4 + (i - 0.5) * pitch
        box('Paint', dx - 0.03, dx + 0.03, -D - 2.8, -D - 0.2, 0.018, 0.021, parent=f)
    door_x = L - 0.9                                           # personnel door
    box('Window', door_x - 0.22, door_x + 0.22, -D - 0.03, -D + 0.01, 0, 0.62, 0.01, 2, f)

def office(x, z, w, d, h, rot=0.0):
    """Glass box wrapped in porcelain floor slabs, with mullions, parapet and entrance canopy."""
    f = frame(x, z, rot); W, Dd = w / 2, d / 2
    fh = 0.7; n = max(1, int((h - 0.35) / fh)); top = 0.18 + n * fh
    box('Porcelain', -W, W, -Dd, Dd, 0, 0.2, 0.03, 2, f)                                  # plinth
    box('Window', -W + 0.09, W - 0.09, -Dd + 0.09, Dd - 0.09, 0.18, top - 0.16, 0, 0, f)   # glass volume (stops under the roof slab)
    for k in range(1, n + 1):
        zt = 0.18 + k * fh
        box('Porcelain', -W, W, -Dd, Dd, zt - 0.15, zt, 0.03, 2, f)                        # floor slabs
    for k in range(n):                                                                     # mullions
        z0, z1 = 0.2 + k * fh, 0.18 + (k + 1) * fh - 0.15
        for i in range(1, int(w / 0.42)):
            mx = -W + i * w / int(w / 0.42)
            for sy in (-1, 1):
                ya, yb = (Dd - 0.09, Dd) if sy > 0 else (-Dd, -Dd + 0.09)
                box('Porcelain', mx - 0.025, mx + 0.025, ya, yb, z0, z1, parent=f)
        for i in range(1, int(d / 0.42)):
            my = -Dd + i * d / int(d / 0.42)
            for sx in (-1, 1):
                xa, xb = (W - 0.09, W) if sx > 0 else (-W, -W + 0.09)
                box('Porcelain', xa, xb, my - 0.025, my + 0.025, z0, z1, parent=f)
    t = 0.07                                                                               # parapet
    for xa, xb, ya, yb in ((-W, W, -Dd, -Dd + t), (-W, W, Dd - t, Dd), (-W, -W + t, -Dd, Dd), (W - t, W, -Dd, Dd)):
        box('Porcelain', xa, xb, ya, yb, top, top + 0.12, 0.015, 2, f)
    box('Shade', -w * 0.22, w * 0.18, -d * 0.12, d * 0.24, top, top + 0.24, 0.04, 2, f)      # roof unit
    box('Porcelain', w * 0.22, w * 0.36, -d * 0.3, -d * 0.1, top, top + 0.34, 0.03, 2, f)   # stair core
    box('Porcelain', -0.55, 0.55, -Dd - 0.55, -Dd, 0.62, 0.68, 0.015, 2, f)                 # entrance canopy
    for cx in (-0.5, 0.5):
        cyl('Shade', 0.025, 0.62, (cx, -Dd - 0.5, 0.31), 10, parent=f)
    box('Pad', -W - 0.4, W + 0.4, -Dd - 1.0, -Dd, 0, 0.018, 0.01, 2, f)                    # walk

def bollard(x, y, f):
    cyl('Porcelain', 0.065, 0.42, (x, y, 0.21), 16, 0.012, parent=f)
    cyl('Shade', 0.07, 0.05, (x, y, 0.44), 16, 0.01, parent=f)

def light_pole(x, y, f, dirx=1):
    cyl('Shade', 0.04, 2.5, (x, y, 1.25), 12, parent=f)
    box('Shade', min(x, x + dirx * 0.45), max(x, x + dirx * 0.45), y - 0.025, y + 0.025, 2.45, 2.5, parent=f)
    box('Porcelain', x + dirx * 0.3 - 0.16, x + dirx * 0.3 + 0.16, y - 0.09, y + 0.09, 2.4, 2.47, 0.015, 2, f)

def guard_booth(x, z, rot=0.0):
    f = frame(x, z, rot)
    box('Porcelain', -0.5, 0.5, -0.5, 0.5, 0, 0.12, 0.02, 2, f)
    box('Window', -0.38, 0.38, -0.38, 0.38, 0.4, 0.82, 0, 0, f)                           # glass sits on the panel, no overlap
    for cx in (-0.4, 0.4):
        for cy in (-0.4, 0.4):
            box('Porcelain', cx - 0.05, cx + 0.05, cy - 0.05, cy + 0.05, 0.12, 0.82, 0.01, 1, f)
    box('Porcelain', -0.4, 0.4, -0.4, 0.4, 0.12, 0.4, 0.01, 1, f)                         # lower panel
    box('Porcelain', -0.62, 0.62, -0.62, 0.62, 0.82, 0.92, 0.03, 2, f)                     # roof

def fence(points, h=0.55):
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        L = math.hypot(x1 - x0, z1 - z0); n = max(1, int(L / 0.9))
        for i in range(n + 1):
            px, pz = x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n
            cyl('Shade', 0.03, h, (px, -pz, h / 2), 8)
        f = frame((x0 + x1) / 2, (z0 + z1) / 2, math.atan2(-(z1 - z0), x1 - x0))
        for zr in (0.24, 0.5):
            box('Shade', -L / 2, L / 2, -0.012, 0.012, zr - 0.012, zr + 0.012, parent=f)

# ---------- roads: rounded-rectangle loop + side exits (mirrors tower-view.js) ----------
RX0, RX1, RZ0, RZ1, RR, RW = -20.0, 20.0, -1.5, 9.5, 4.0, 2.6
EXIT_Z = (RZ0 + RZ1) / 2

def rounded_rect(x0, x1, z0, z1, r, step=0.25):
    pts = []
    def line(ax, az, bx, bz):
        n = max(1, round(math.hypot(bx - ax, bz - az) / step))
        pts.extend((ax + (bx - ax) * i / n, az + (bz - az) * i / n) for i in range(n))
    def arc(cx, cz, a0):
        n = round(r * math.pi / 2 / step)
        pts.extend((cx + r * math.cos(a0 + math.pi / 2 * i / n), cz + r * math.sin(a0 + math.pi / 2 * i / n)) for i in range(n))
    line(x0 + r, z0, x1 - r, z0); arc(x1 - r, z0 + r, -math.pi / 2)
    line(x1, z0 + r, x1, z1 - r); arc(x1 - r, z1 - r, 0)
    line(x1 - r, z1, x0 + r, z1); arc(x0 + r, z1 - r, math.pi / 2)
    line(x0, z1 - r, x0, z0 + r); arc(x0 + r, z0 + r, math.pi)
    return pts

def strip(pts, o0, o1, z0, z1, mat, closed=True):
    """Solid band between lateral offsets o0..o1 (three.js xz) along a polyline."""
    n = len(pts); bm = bmesh.new(); rings = []
    for i in range(n):
        a = pts[i - 1] if (closed or i > 0) else pts[i]
        b = pts[(i + 1) % n] if (closed or i < n - 1) else pts[i]
        tx, tz = b[0] - a[0], b[1] - a[1]; L = math.hypot(tx, tz) or 1
        nx, nz = -tz / L, tx / L
        x, z = pts[i]
        rings.append([bm.verts.new((x + nx * o, -(z + nz * o), h)) for o, h in ((o0, z0), (o1, z0), (o1, z1), (o0, z1))])
    for i in range(n if closed else n - 1):
        A, B = rings[i], rings[(i + 1) % n]
        for k in range(4): bm.faces.new((A[k], B[k], B[(k + 1) % 4], A[(k + 1) % 4]))
    if not closed: bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(new_obj(bm, 'road'), mat)

def runs(pts, keep):
    """Split a closed polyline into open runs where keep(x, z) holds."""
    out, cur = [], []
    start = next((i for i, p in enumerate(pts) if not keep(*p)), None)
    order = pts if start is None else pts[start:] + pts[:start]
    for p in order:
        if keep(*p): cur.append(p)
        elif cur: out.append(cur); cur = []
    if cur: out.append(cur)
    return out if start is not None else [pts]

def dashes(pts, o, w, z, on=0.7, off=0.6):
    acc, cur, draw = 0.0, [pts[0]], True
    for a, b in zip(pts, pts[1:] + pts[:1]):
        acc += math.hypot(b[0] - a[0], b[1] - a[1]); cur.append(b)
        if acc >= (on if draw else off):
            if draw and len(cur) > 1: strip(cur, o - w / 2, o + w / 2, z, z + 0.003, 'Paint', closed=False)
            acc, cur, draw = 0.0, [b], not draw

def roads():
    loop = rounded_rect(RX0, RX1, RZ0, RZ1, RR)
    strip(loop, -RW / 2, RW / 2, 0, 0.02, 'Road')
    def gap(x, z):                                   # openings for the exits and the dock driveway
        if abs(z - EXIT_Z) < 1.6 and abs(abs(x) - 20) < 0.5: return False
        if abs(x) < 4.2 and z < RZ0 + 0.5: return False
        return True
    for o in (-1.12, 1.12):
        for r in runs(loop, gap if o < 0 else (lambda x, z: True)):
            strip(r, o - 0.035, o + 0.035, 0.02, 0.023, 'Paint', closed=False)
    dashes(loop, 0, 0.07, 0.02)
    for sx in (-1, 1):                               # side exits running off-scene
        line = [(sx * (20 + i * 0.5), EXIT_Z) for i in range(0, 121)]
        if sx < 0: line = line[::-1]
        strip(line, -RW / 2, RW / 2, 0, 0.014, 'Road', closed=False)   # sits below the loop at the junction
        edge = [p for p in line if abs(p[0]) > 21.3]
        for o in (-1.12, 1.12):
            strip(edge, o - 0.035, o + 0.035, 0.014, 0.017, 'Paint', closed=False)
        dashes(edge, 0, 0.07, 0.014)
    # dock driveway: from the loop's outer edge to the dock apron
    box('Pad', -4.0, 4.0, -(RZ0 - RW / 2 + 0.05), -(-5.4), 0, 0.012, 0.01, 2)

ROAD_PTS = rounded_rect(RX0, RX1, RZ0, RZ1, RR, 0.5) + [(x, EXIT_Z) for x in range(-60, -19)] + [(x, EXIT_Z) for x in range(20, 61)]
def clear_of(x, z, r): return all((p[0]-x)**2 + (p[1]-z)**2 > r * r for p in ROAD_PTS)

def sphere(mat, r, loc, sz=1.0):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=16, radius=r)
    for v in bm.verts: v.co.z *= sz
    o = new_obj(bm); o.location = loc
    return finish(o, mat)

def pine(px, pz, s):
    cyl('Shade', 0.07 * s, 0.4 * s, (px, -pz, 0.2 * s), 12)
    for r, hh, z0 in ((0.66, 0.85, 0.3), (0.52, 0.72, 0.74), (0.36, 0.62, 1.12)):
        cyl('Porcelain', r * s, hh * s, (px, -pz, (z0 + hh / 2) * s), 32, 0.03, r2=0.05 * s)

def round_tree(px, pz, s):
    cyl('Shade', 0.07 * s, 0.75 * s, (px, -pz, 0.375 * s), 12)
    sphere('Porcelain', 0.56 * s, (px, -pz, 1.1 * s), 1.12)

def grove(x, z, n, seed=0):
    for i in range(n):
        a = i * 2.39996 + seed; r = 0.9 * math.sqrt(i + 0.5)
        px, pz = x + math.cos(a) * r * 1.4, z + math.sin(a) * r * 1.4
        if not clear_of(px, pz, 2.4): continue
        s = 0.8 + ((i * 37) % 10) / 24
        (pine if (i + seed) % 3 else round_tree)(px, pz, s)

# ---------- layout: one distribution centre on a short loop ----------
warehouse(0, -10.5, 0, 14, 6)                           # docks face the route (+z)
office(12.5, -10.5, 3, 3, 2.6)
office(9, 4, 3, 3, 2.6)                                 # yard office inside the loop
roads()
guard_booth(-5.6, -4.2)
fence([(-10, -6), (-10, -14), (10, -14), (10, -6)])
grove(-14, -12, 5); grove(18, -13, 4, 1); grove(-6, 4, 3, 2); grove(27, 2, 4, 3)

# trailers backed into docks 2 and 5, using the dry van from trucks.glb
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, 'trucks.glb'))   # build trucks.py into the same folder first
lib = {o.name: o for o in bpy.context.selected_objects}
van = [o for o in lib.values() if o.parent and o.parent.name.startswith('Trailer') and not o.parent.name.startswith('TrailerGlass')]
pitch = (14 - 2.8) / 5
for dock in (1, 4):
    x = -7 + 1.4 + dock * pitch
    for src in van:
        o = src.copy(); o.data = src.data.copy(); col.objects.link(o)
        o.parent = frame(x, -8.4 + 3.44 + 0.1, -math.pi / 2)
        o.matrix_parent_inverse.identity(); o.matrix_basis.identity()
        name = src.data.materials[0].name
        o.data.materials[0] = MAT['Porcelain' if name == 'Paint' else 'Shade']
        dec = o.modifiers.new('lod', 'DECIMATE'); dec.ratio = 0.5
        PARTS.append(o)
for o in list(lib.values()): bpy.data.objects.remove(o, do_unlink=True)

# ---------- merge ----------
# Flat ground surfaces (road, paint, aprons) stay out of the light bake: they neither cast nor
# catch contact shadows. tower-view.js draws them flat and lays the baked ground shadow over them.
def merge(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = j.data.name = name
    return j

FLAT_MATS = ('Pad', 'Road', 'Paint')
flat_parts = [o for o in PARTS if o.data.materials[0].name in FLAT_MATS]
set_parts = [o for o in PARTS if o.data.materials[0].name not in FLAT_MATS]   # split before joining removes objects
flat = merge(flat_parts, 'Flat')
setobj = merge(set_parts, 'Set')
for o in [o for o in col.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
flat.hide_render = True
setobj.data.calc_loop_triangles(); print('SET TRIANGLES', len(setobj.data.loop_triangles))

# lightmap UVs
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- ground + lighting ----------
bpy.ops.mesh.primitive_plane_add(size=1, location=(G_CX, -G_CZ, 0))
ground = bpy.context.active_object; ground.name = 'Ground'
ground.scale = (G_W, G_D, 1); bpy.ops.object.transform_apply(scale=True)
gm = material('GroundMat', (0.92, 0.94, 0.96), 0.9); ground.data.materials.append(gm)
big = bpy.data.objects.new('Floor', bpy.data.meshes.new('Floor')); col.objects.link(big)
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400); bm.to_mesh(big.data); bm.free()
big.location = (0, 0, -0.002); big.data.materials.append(gm)

world = bpy.data.worlds.new('Sky'); scene.world = world
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.93, 0.96, 1.0, 1); bg.inputs['Strength'].default_value = 2.4
bpy.ops.object.light_add(type='SUN')
sun = bpy.context.active_object; sun.data.energy = 3.4; sun.data.angle = math.radians(20)   # large, soft source
from mathutils import Vector
d = Vector((-30, 32, 45)).normalized()                      # three.js key light position (-30, 45, -32)
sun.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()

scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES; scene.cycles.max_bounces = 5; scene.cycles.diffuse_bounces = 4
scene.render.bake.margin = 6

def bake_target(obj, name, w, h):
    img = bpy.data.images.new(name, w, h, float_buffer=True)
    for m in obj.data.materials:
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img
        m.node_tree.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return img

def to_np(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32); img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)

def blur(a, n=2):
    for _ in range(n):
        a = (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1) + 2 * a) / 6
    return a

def save(arr, name, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((h, w, 4), np.float32); rgba[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path; img.file_format = 'JPEG'
    scene.render.image_settings.quality = 88
    img.save(quality=82); print('SAVED', path)

# 1) ground: irradiance from sun + sky, normalised to open ground = 1
img = bake_target(ground, 'ground_bake', *G_RES)
scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = True; scene.render.bake.use_pass_color = False
bpy.ops.object.bake(type='DIFFUSE')
g = to_np(img)[..., :3].mean(axis=2)
border = np.concatenate([g[:8].ravel(), g[-8:].ravel(), g[:, :8].ravel(), g[:, -8:].ravel()])
G0 = float(np.median(border))                              # open, sunlit ground
ratio = np.clip(blur(g, 3) / G0, 0.4, 1)
hh, ww = ratio.shape                                       # fade to 1 at the edges
yy, xx = np.mgrid[0:hh, 0:ww]
edge = np.minimum.reduce([xx, ww - 1 - xx, yy, hh - 1 - yy]).astype(np.float32)
ratio = 1 - (1 - ratio) * np.clip(edge / 60.0, 0, 1)
tinted = np.stack([ratio ** 1.12, ratio ** 1.04, ratio ** 0.86], axis=2)   # cool, navy-leaning shadows
save(tinted, 'ground_shadow', os.path.join(OUT, 'ground-shadow.jpg'))
print('GROUND min', float(ratio.min()), 'median', float(np.median(ratio)))

# 2) set: full lighting (sun + sky + bounce) baked into a lightmap atlas,
#    normalised so open sunlit ground = 1 and stored at 1/LM_SCALE (tower-view.js multiplies back)
LM_SCALE = 1.5
scene.cycles.samples = SAMPLES * 8
img = bake_target(setobj, 'set_light', AO_RES, AO_RES)
bpy.ops.object.bake(type='DIFFUSE')
lm = to_np(img)[..., :3] / G0
empty = lm.sum(axis=2) < 1e-6
lm[empty] = 0.85                                            # unused atlas space: light, so filtering never pulls in black
lm = blur(lm, 2)                                            # light smoothing; island margins keep it from bleeding
lm = np.maximum(lm, 0.42)                                   # sky + bounce never lets a visible face go black
save(lm / LM_SCALE, 'set_light', os.path.join(OUT, 'set-light.jpg'))
print('LIGHT p5/p50/p95', [float(np.percentile(lm[..., 1][lm[..., 1] > 0.01], q)) for q in (5, 50, 95)])

# ---------- export set ----------
for m in setobj.data.materials:                             # drop bake nodes before export
    for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE']: m.node_tree.nodes.remove(n)
flat.hide_render = False
bpy.ops.object.select_all(action='DESELECT'); setobj.select_set(True); flat.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'set.glb'), export_format='GLB', use_selection=True, export_yup=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=14)
print('EXPORTED set.glb')

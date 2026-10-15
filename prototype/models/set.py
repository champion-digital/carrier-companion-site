# Carrier Companion · Tower View static set + baked lighting
# Builds the depot, distribution centres, offices, parked trailers and groves,
# then bakes (1) soft sun + sky shadows onto the ground and (2) ambient occlusion
# into a lightmap atlas for the set. Layout uses three.js coordinates (x, z);
# Blender position = (x, -z, y).
# Usage: Blender -b --factory-startup -P set.py -- <out_dir> [samples]
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
    'Dock': (0.74, 0.78, 0.83), 'DockGlow': (0.6, 0.85, 1.0), 'Pad': (0.83, 0.86, 0.9)}.items()}

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
        box('Shade', dx - 0.03, dx + 0.03, -D - 2.8, -D - 0.2, 0.018, 0.024, parent=f)
    door_x = L - 0.9                                           # personnel door
    box('Window', door_x - 0.22, door_x + 0.22, -D - 0.03, -D + 0.01, 0, 0.62, 0.01, 2, f)

def office(x, z, w, d, h, rot=0.0):
    f = frame(x, z, rot)
    box('Porcelain', -w / 2, w / 2, -d / 2, d / 2, 0, h, 0.15, 4, f)
    floors = max(1, int((h - 0.4) / 0.72))
    for k in range(floors):
        zc = 0.55 + k * 0.72
        box('Window', -w / 2 + 0.03, w / 2 - 0.03, -d / 2 - 0.006, d / 2 + 0.006, zc - 0.12, zc + 0.12, 0.01, 2, f)
        box('Window', -w / 2 - 0.006, w / 2 + 0.006, -d / 2 + 0.03, d / 2 - 0.03, zc - 0.12, zc + 0.12, 0.01, 2, f)
    box('Shade', -w * 0.22, w * 0.22, -d * 0.18, d * 0.18, h, h + 0.22, 0.04, 2, f)          # roof unit
    box('Window', -0.26, 0.26, -d / 2 - 0.03, -d / 2 + 0.01, 0, 0.5, 0.01, 2, f)               # entrance
    box('Pad', -w / 2 - 0.4, w / 2 + 0.4, -d / 2 - 0.9, -d / 2, 0, 0.018, 0.01, 2, f)          # walk

# ---------- routes (port of three.js centripetal CatmullRomCurve3, closed) ----------
ROUTES = [
    [(-16,-1),(-6,-1.5),(6,-1.5),(16,-1),(21,3),(18,8),(6,9.5),(-6,9.5),(-18,8),(-21,3)]]

def catmull(points, t):
    l = len(points); p = l * t; ip = int(math.floor(p)); w = p - ip
    P = [points[(ip + k) % l] for k in (-1, 0, 1, 2)]
    def d(a, b): return max(((a[0]-b[0])**2 + (a[1]-b[1])**2) ** 0.25, 0.0)
    dt0, dt1, dt2 = d(P[0], P[1]), d(P[1], P[2]), d(P[2], P[3])
    if dt1 < 1e-4: dt1 = 1.0
    if dt0 < 1e-4: dt0 = dt1
    if dt2 < 1e-4: dt2 = dt1
    out = []
    for k in (0, 1):
        x0, x1, x2, x3 = (q[k] for q in P)
        t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
        t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
        c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2; c3 = 2 * x1 - 2 * x2 + t1 + t2
        out.append(x1 + t1 * w + c2 * w * w + c3 * w * w * w)
    return out

SAMPLES_XZ = [catmull(r, i / 2400) for r in ROUTES for i in range(2400)]
def clear_of(x, z, r): return all((p[0]-x)**2 + (p[1]-z)**2 > r * r for p in SAMPLES_XZ)

def grove(x, z, n, seed=0):
    for i in range(n):
        a = i * 2.39996 + seed; r = 0.9 * math.sqrt(i + 0.5)
        px, pz = x + math.cos(a) * r * 1.4, z + math.sin(a) * r * 1.4
        if not clear_of(px, pz, 2.2): continue
        s = 0.75 + ((i * 37) % 10) / 22
        cyl('Porcelain', 0.6 * s, 1.8 * s, (px, -pz, 0.9 * s), 32, 0.0, r2=0.02)

# ---------- layout: one distribution centre on a short loop ----------
warehouse(0, -10.5, 0, 14, 6)                           # docks face the route (+z)
office(12.5, -10.5, 3, 3, 2.6)
office(9, 4, 3, 3, 2.6)                                 # yard office inside the loop
grove(-14, -12, 5); grove(18, -13, 4, 1); grove(-6, 4, 3, 2); grove(27, 2, 4, 3)

# trailers backed into docks 2 and 5, using the dry van from trucks.glb
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, 'trucks.glb'))
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

# ---------- merge set into one mesh ----------
bpy.ops.object.select_all(action='DESELECT')
for o in PARTS: o.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.ops.object.convert(target='MESH')
for o in PARTS:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
setobj = bpy.context.view_layer.objects.active; setobj.name = setobj.data.name = 'Set'
for o in [o for o in col.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
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
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.93, 0.96, 1.0, 1); bg.inputs['Strength'].default_value = 1.9
bpy.ops.object.light_add(type='SUN')
sun = bpy.context.active_object; sun.data.energy = 4.6; sun.data.angle = math.radians(9)
from mathutils import Vector
d = Vector((-30, 32, 45)).normalized()                      # three.js key light position (-30, 45, -32)
sun.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()

scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES; scene.cycles.max_bounces = 3
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
    img.save(); print('SAVED', path)

# 1) ground: irradiance from sun + sky, normalised to open ground = 1
img = bake_target(ground, 'ground_bake', *G_RES)
scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = True; scene.render.bake.use_pass_color = False
bpy.ops.object.bake(type='DIFFUSE')
g = to_np(img)[..., :3].mean(axis=2)
border = np.concatenate([g[:8].ravel(), g[-8:].ravel(), g[:, :8].ravel(), g[:, -8:].ravel()])
ratio = np.clip(blur(g, 2) / np.median(border), 0.42, 1)
hh, ww = ratio.shape                                       # fade to 1 at the edges
yy, xx = np.mgrid[0:hh, 0:ww]
edge = np.minimum.reduce([xx, ww - 1 - xx, yy, hh - 1 - yy]).astype(np.float32)
ratio = 1 - (1 - ratio ** 1.8) * np.clip(edge / 60.0, 0, 1)
tinted = np.stack([ratio ** 1.18, ratio ** 1.06, ratio ** 0.82], axis=2)   # cool, navy-leaning shadows
save(tinted, 'ground_shadow', os.path.join(OUT, 'ground-shadow.jpg'))
print('GROUND min', float(ratio.min()), 'median', float(np.median(ratio)))

# 2) set: ambient occlusion atlas
world.light_settings.distance = 1.6
img = bake_target(setobj, 'set_ao', AO_RES, AO_RES)
bpy.ops.object.bake(type='AO')
ao = to_np(img)[..., :3].mean(axis=2)
ao = 0.35 + 0.65 * ao                                       # keep it soft
save(np.stack([ao] * 3, axis=2), 'set_ao', os.path.join(OUT, 'set-ao.jpg'))

# ---------- export set ----------
for m in setobj.data.materials:                             # drop bake nodes before export
    for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE']: m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='DESELECT'); setobj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'set.glb'), export_format='GLB', use_selection=True, export_yup=True)
print('EXPORTED set.glb')

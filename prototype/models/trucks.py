# Carrier Companion · Tower View truck models
# Builds a long-nose conventional tractor, a dry van and a glass trailer.
# Blender: X forward, Y across, Z up. Exported glTF is Y-up, forward +X.
# Usage: Blender -b --factory-startup -P trucks.py -- <out.glb> [preview.png]
import bpy, bmesh, math, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/trucks.glb'
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection

# ---------- materials (names drive the three.js material swap) ----------
def material(name, rgb, rough=0.5, metal=0.0, transmission=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Transmission Weight'].default_value = transmission
    b.inputs['Coat Weight'].default_value = coat
    return m

MAT = {
    'Paint':  material('Paint',  (0.012, 0.03, 0.075), 0.35, coat=0.6),
    'Trim':   material('Trim',   (0.80, 0.84, 0.88), 0.32, metal=0.5),
    'Window': material('Window', (0.03, 0.05, 0.09), 0.12),
    'Tire':   material('Tire',   (0.72, 0.76, 0.81), 0.7),
    'Glass':  material('Glass',  (0.86, 0.95, 1.0), 0.12, transmission=1.0),
    'Cargo':  material('Cargo',  (0.90, 0.92, 0.94), 0.6),
}

GROUP = None          # current model being built
PARTS = {}            # group -> [objects]

def register(o, mat, bevel=0.0, seg=3, angle=35):
    o.data.materials.clear(); o.data.materials.append(MAT[mat])
    if bevel:
        bv = o.modifiers.new('bevel', 'BEVEL')
        bv.width = bevel; bv.segments = seg; bv.limit_method = 'ANGLE'
        bv.angle_limit = math.radians(angle); bv.harden_normals = False
    PARTS.setdefault(GROUP, []).append(o)
    return o

def new_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o)
    return o

def box(mat, x0, x1, y0, y1, z0, z1, bevel=0.0, seg=3, shape=None, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
        v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
        v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
    if shape: shape(bm)
    c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    if rot:
        for v in bm.verts: v.co.x -= c[0]; v.co.y -= c[1]; v.co.z -= c[2]
    o = new_obj('box', bm)
    if rot: o.location = c; o.rotation_euler = rot
    return register(o, mat, bevel, seg)

def cyl(mat, r, depth, loc, axis='Z', seg=24, bevel=0.0, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r2 if r2 else r, depth=depth)
    rot = {'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis]
    o = new_obj('cyl', bm); o.location = loc; o.rotation_euler = rot
    return register(o, mat, bevel)

def arc(mat, cx, cz, r_in, r_out, y0, y1, a0, a1, seg=18, bevel=0.012):
    bm = bmesh.new(); rings = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg; c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((cx + r * c, y, cz + r * s)) for r, y in ((r_out, y0), (r_out, y1), (r_in, y1), (r_in, y0))])
    for i in range(seg):
        A, B = rings[i], rings[i + 1]
        for k in range(4): bm.faces.new((A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return register(new_obj('arc', bm), mat, bevel, 2)

R = 0.19  # wheel radius
def wheel(x, y, w=0.13):
    cyl('Tire', R, w, (x, y, R), 'Y', 28, bevel=0.045)
    s = 1 if y > 0 else -1
    cyl('Trim', R * 0.56, 0.012, (x, y + s * w / 2, R), 'Y', 20, bevel=0.004)
    cyl('Trim', R * 0.2, 0.03, (x, y + s * (w / 2 + 0.01), R), 'Y', 12)

def duals(x):
    for s in (1, -1):
        wheel(x, s * 0.265, 0.1); wheel(x, s * 0.375, 0.1)

def mirror_y(fn):
    for s in (1, -1): fn(s)

# =====================================================================
# TRACTOR  (origin on the road under the cab-sleeper seam)
# =====================================================================
GROUP = 'Tractor'
FRONT_AX, DRIVE_AX = 0.95, (-0.84, -1.16)
KING = -0.98

box('Trim', -1.4, 1.18, -0.2, 0.2, 0.26, 0.38, 0.02)                     # frame rails
box('Trim', 1.17, 1.3, -0.43, 0.43, 0.2, 0.38, 0.035)                      # bumper

def hood_shape(bm):
    for v in bm.verts:
        if v.co.z > 0.6:
            v.co.y *= 0.86
            if v.co.x > 0.9: v.co.z -= 0.045
box('Paint', 0.5, 1.2, -0.3, 0.3, 0.37, 0.8, 0.07, 4, hood_shape)          # hood
box('Trim', 1.16, 1.235, -0.215, 0.215, 0.39, 0.765, 0.02)                 # grille surround
for i in range(9):
    y = -0.16 + i * 0.04
    box('Trim', 1.232, 1.25, y - 0.007, y + 0.007, 0.43, 0.73)             # grille bars
box('Window', 1.225, 1.236, -0.18, 0.18, 0.42, 0.74)                       # grille recess

mirror_y(lambda s: arc('Paint', FRONT_AX, R, 0.235, 0.275, s * 0.245, s * 0.435, -0.22, math.pi + 0.05))
mirror_y(lambda s: box('Paint', 0.56, 0.7, s * 0.245, s * 0.435, 0.16, 0.2, 0.012))  # fender tail to step
mirror_y(lambda s: cyl('Trim', 0.045, 0.05, (1.12, s * 0.36, 0.43), 'X', 16, 0.01))  # headlights
mirror_y(lambda s: cyl('Trim', 0.068, 0.4, (0.58, s * 0.405, 0.66), 'Z', 20, 0.015)) # air cleaners

def cab_shape(bm):
    for v in bm.verts:
        if v.co.z > 1.0 and v.co.x > 0.3: v.co.x -= 0.12
box('Paint', 0.02, 0.54, -0.4, 0.4, 0.37, 1.2, 0.07, 4, cab_shape)         # cab
for y in (-0.17, 0.17):                                                    # windshield
    box('Window', 0.445, 0.46, y - 0.15, y + 0.15, 0.87, 1.13, 0.01, 2, rot=(0, -0.145, 0))
mirror_y(lambda s: box('Window', 0.12, 0.4, s * 0.398, s * 0.407, 0.86, 1.1, 0.008, 2))   # door glass
box('Paint', 0.36, 0.48, -0.36, 0.36, 1.17, 1.215, 0.02)                   # sun visor
for i in range(5):
    y = -0.2 + i * 0.1
    box('Trim', 0.4, 0.44, y - 0.022, y + 0.022, 1.21, 1.235, 0.008)        # cab lights
mirror_y(lambda s: cyl('Trim', 0.022, 0.2, (0.18, s * 0.12, 1.24), 'X', 12, 0.005, r2=0.034))  # horns
mirror_y(lambda s: box('Trim', 0.49, 0.51, s * 0.39, s * 0.53, 0.99, 1.01))          # mirror arms
mirror_y(lambda s: box('Trim', 0.48, 0.515, s * 0.505, s * 0.555, 0.88, 1.1, 0.01))  # mirror heads

box('Paint', -0.56, 0.04, -0.4, 0.4, 0.37, 1.3, 0.09, 4)                   # sleeper
mirror_y(lambda s: box('Window', -0.32, -0.18, s * 0.398, s * 0.407, 0.98, 1.1, 0.008, 2))

mirror_y(lambda s: cyl('Trim', 0.033, 1.28, (-0.6, s * 0.43, 0.99), 'Z', 16, 0.006))   # stacks
mirror_y(lambda s: cyl('Trim', 0.043, 0.46, (-0.6, s * 0.43, 0.98), 'Z', 16, 0.006))   # heat shields
mirror_y(lambda s: cyl('Trim', 0.12, 0.44, (0.29, s * 0.33, 0.28), 'X', 24, 0.03))     # fuel tanks
mirror_y(lambda s: box('Paint', -0.52, 0.04, s * 0.26, s * 0.42, 0.15, 0.37, 0.02))    # battery boxes
box('Trim', -1.4, -0.62, -0.32, 0.32, 0.34, 0.4, 0.015)                   # deck plate
cyl('Trim', 0.24, 0.05, (KING, 0, 0.42), 'Z', 28, 0.015)                  # fifth wheel
mirror_y(lambda s: box('Tire', -1.45, -1.435, s * 0.25, s * 0.42, 0.08, 0.36))         # mud flaps
mirror_y(lambda s: arc('Trim', DRIVE_AX[0], R, 0.225, 0.245, s * 0.215, s * 0.435, math.pi * 0.5, math.pi * 0.95, 8))
mirror_y(lambda s: arc('Trim', DRIVE_AX[1], R, 0.225, 0.245, s * 0.215, s * 0.435, math.pi * 0.05, math.pi * 0.5, 8))

mirror_y(lambda s: wheel(FRONT_AX, s * 0.34))
for x in DRIVE_AX: duals(x)

# =====================================================================
# TRAILERS  (origin on the road under the kingpin)
# =====================================================================
TX0, TX1, TW, TZ0, TZ1 = -3.44, 0.26, 0.42, 0.56, 1.52
T_AX = (-2.62, -2.97)

def chassis():
    box('Trim', -3.35, 0.25, -0.3, 0.3, 0.46, TZ0, 0.012)                  # floor rails
    mirror_y(lambda s: box('Trim', -0.6, -0.54, s * 0.27, s * 0.33, 0.07, 0.5))          # landing gear
    mirror_y(lambda s: box('Trim', -0.63, -0.51, s * 0.25, s * 0.35, 0.05, 0.075, 0.006))
    box('Trim', -0.58, -0.56, -0.3, 0.3, 0.2, 0.23)                        # gear brace
    box('Trim', -3.2, -2.4, -0.3, 0.3, 0.36, 0.48, 0.015)                  # bogie
    box('Trim', -3.4, -3.34, -0.38, 0.38, 0.25, 0.31, 0.01)                # ICC bumper
    mirror_y(lambda s: box('Trim', -3.38, -3.35, s * 0.24, s * 0.27, 0.28, 0.5))
    mirror_y(lambda s: box('Tire', -3.25, -3.235, s * 0.25, s * 0.42, 0.08, 0.36))       # mud flaps
    for x in T_AX: duals(x)

GROUP = 'Trailer'
chassis()
box('Paint', TX0, TX1, -TW, TW, TZ0, TZ1, 0.03, 3)                         # van body
x = TX0 + 0.22
while x < TX1 - 0.15:
    mirror_y(lambda s: box('Paint', x - 0.01, x + 0.01, s * TW, s * (TW + 0.004), TZ0 + 0.03, TZ1 - 0.03))
    x += 0.37
for z in (TZ0 + 0.025, TZ1 - 0.025):
    mirror_y(lambda s: box('Trim', TX0 + 0.02, TX1 - 0.02, s * TW, s * (TW + 0.012), z - 0.02, z + 0.02, 0.006))
box('Trim', TX0 - 0.006, TX0, -0.006, 0.006, TZ0 + 0.04, TZ1 - 0.04)      # door seam
for y in (-0.3, -0.12, 0.12, 0.3):
    cyl('Trim', 0.009, TZ1 - TZ0 - 0.1, (TX0 - 0.012, y, (TZ0 + TZ1) / 2), 'Z', 8)   # lock rods

GROUP = 'TrailerGlass'
chassis()
box('Trim', TX0, TX1, -TW, TW, TZ0 - 0.04, TZ0 + 0.02, 0.01)               # deck
box('Glass', TX0 + 0.01, TX1 - 0.01, -TW + 0.008, TW - 0.008, TZ0 + 0.02, TZ1 - 0.01, 0.015, 2)
E = 0.018
for y in (-TW, TW):
    for z in (TZ0 + 0.02, TZ1 - 0.01):
        box('Trim', TX0, TX1, y - E, y + E, z - E, z + E, 0.008, 2)        # long edges
for xx in (TX0 + E, TX1 - E):
    for z in (TZ0 + 0.02, TZ1 - 0.01):
        box('Trim', xx - E, xx + E, -TW, TW, z - E, z + E, 0.008, 2)       # cross edges
    for y in (-TW, TW):
        box('Trim', xx - E, xx + E, y - E, y + E, TZ0 + 0.02, TZ1 - 0.01, 0.008, 2)   # posts
for i in range(5):
    cx = 0.0 - i * 0.68
    for y in (-0.2, 0.2):
        for k, z0 in enumerate((TZ0 + 0.03, TZ0 + 0.46)):
            box('Cargo', cx - 0.3, cx + 0.3, y - 0.18, y + 0.18, z0, z0 + 0.41, 0.025, 2)
            box('Trim', cx - 0.302, cx + 0.302, y - 0.03, y + 0.03, z0 + 0.405, z0 + 0.416)  # tape

# ---------- bake: apply modifiers, smooth by angle, merge per material ----------
roots = {}
for group, objs in PARTS.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.convert(target='MESH')
    by_mat = {}
    for o in objs: by_mat.setdefault(o.data.materials[0].name, []).append(o)
    root = bpy.data.objects.new(group, None); col.objects.link(root); roots[group] = root
    for mname, mobjs in by_mat.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in mobjs: o.select_set(True)
        bpy.context.view_layer.objects.active = mobjs[0]
        if len(mobjs) > 1: bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active
        j.name = f'{group}_{mname}'; j.data.name = j.name
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
        j.parent = root

tris = 0
for o in col.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
print('TRIANGLES', tris)

bpy.ops.object.select_all(action='DESELECT')
for r in roots.values():
    r.select_set(True)
    for c in r.children: c.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=14)
print('EXPORTED', OUT)

# ---------- optional studio preview ----------
if PREVIEW:
    import mathutils
    roots['Tractor'].location = (0, 0, 0)
    roots['TrailerGlass'].location = (KING, 0, 0)
    roots['Trailer'].location = (KING, 2.4, 0)
    # porcelain twin tractor
    porcelain = material('PaintPorcelain', (0.86, 0.89, 0.92), 0.55, coat=0.3)
    win2 = material('WindowPorcelain', (0.72, 0.76, 0.81), 0.3)
    twin = bpy.data.objects.new('Twin', None); col.objects.link(twin)
    for c in roots['Tractor'].children:
        cc = c.copy(); cc.data = c.data.copy(); col.objects.link(cc); cc.parent = twin
        if cc.data.materials[0].name == 'Paint': cc.data.materials[0] = porcelain
        if cc.data.materials[0].name == 'Window': cc.data.materials[0] = win2
    twin.location = (0, 2.4, 0)
    for c in roots['Trailer'].children:
        if c.data.materials[0].name == 'Paint': c.data = c.data.copy(); c.data.materials[0] = porcelain

    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.data.materials.append(material('Ground', (0.9, 0.92, 0.95), 0.8))
    world = bpy.data.worlds.new('W'); scene.world = world
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.92, 0.94, 0.97, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    bpy.ops.object.light_add(type='AREA', location=(-4, -6, 9))
    key = bpy.context.active_object; key.data.energy = 900; key.data.size = 7
    key.rotation_euler = (math.radians(35), 0, math.radians(-30))
    bpy.ops.object.camera_add(location=(7.5, -6.5, 6.2))
    cam = bpy.context.active_object; scene.camera = cam; cam.data.lens = 50
    tgt = mathutils.Vector((-1.2, 1.2, 0.6))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.device = 'CPU'; scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', PREVIEW)

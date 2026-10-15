/* Tower View prototype · Carrier Companion
   A live model-world scene: porcelain trucks on glowing routes, click to track. Demo data only. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

const $ = (id) => document.getElementById(id);
const stage = $('tv-stage'), canvas = $('tv-canvas');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- palette ----------
const COL = {
  bg: 0xEDF1F5, porcelain: 0xF1F4F7, porcelainShade: 0xE2E8EE, tire: 0xD6DCE4, navy: 0x232C5E, navyTire: 0x1A2433,
  sky: 0x6ED6FF, glass: 0xE6F6FF, ok: '#22C55E', warn: '#F9AC24', alert: '#D22533'
};

// ---------- renderer ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('tv-fallback').hidden = false; canvas.hidden = true; throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.bg);
scene.fog = new THREE.Fog(COL.bg, 190, 420);

const camera = new THREE.PerspectiveCamera(22, 1, 1, 1000);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0xB7CDE2, 0.75);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.65);
key.position.set(-30, 45, -32);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -70, right: 70, top: 50, bottom: -50, near: 1, far: 180 });
key.shadow.radius = 9; key.shadow.blurSamples = 16; key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.DirectionalLight(0xDDEFFF, 0.5);
fill.position.set(40, 20, -30);
scene.add(fill);

// ---------- ground: unlit soft gradient + blue-tinted shadow catcher ----------
function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ map: radialTexture('#FDFEFF', '#EDF1F5'), fog: true, toneMapped: false }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ color: 0x1E4A78, opacity: 0.42 }));
shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = 0.01; shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

// ---------- materials ----------
const M = {
  porcelain: new THREE.MeshPhysicalMaterial({ color: COL.porcelain, roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.5 }),
  porcelainShade: new THREE.MeshPhysicalMaterial({ color: COL.porcelainShade, roughness: 0.66, clearcoat: 0.2, clearcoatRoughness: 0.55 }),
  tire: new THREE.MeshStandardMaterial({ color: 0xBFC8D3, roughness: 0.85 }),
  navy: new THREE.MeshPhysicalMaterial({ color: COL.navy, roughness: 0.38, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.3 }),
  navyTire: new THREE.MeshStandardMaterial({ color: COL.navyTire, roughness: 0.8 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xDDF2FF, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.25, depthWrite: false, side: THREE.DoubleSide }),
  chrome: new THREE.MeshPhysicalMaterial({ color: 0xDCE3EA, roughness: 0.28, metalness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
  navyGlass: new THREE.MeshPhysicalMaterial({ color: 0x1B2A40, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1 }),
  window: new THREE.MeshPhysicalMaterial({ color: 0xC9D2DC, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
  dock: new THREE.MeshStandardMaterial({ color: 0xDCE3EA, roughness: 0.9 }),
  dockGlow: new THREE.MeshStandardMaterial({ color: 0xBFEBFF, emissive: COL.sky, emissiveIntensity: 0.7, roughness: 0.4 }),
  routeBody: new THREE.MeshStandardMaterial({ color: 0xD8F1FF, emissive: COL.sky, emissiveIntensity: 0.22, roughness: 0.35, transparent: true, opacity: 0.78 }),
  routeCore: new THREE.MeshBasicMaterial({ color: new THREE.Color(COL.sky).multiplyScalar(1.6), transparent: true, opacity: 0.9 })
};

function shadowed(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }
const rbox = (w, h, d, r, mat) => shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat));
const cyl = (r, h, mat, seg = 20) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat));

// ---------- truck model (forward = +x, unit ≈ 1 m / 2.4) ----------
function wheel(mat, x, z) {
  const w = cyl(0.19, 0.15, mat, 22); w.rotation.x = Math.PI / 2; w.position.set(x, 0.19, z); return w;
}
function buildTractor(navy) {
  const body = navy ? M.navy : M.porcelain, tireM = navy ? M.navyTire : M.tire;
  const g = new THREE.Group();
  const frame = rbox(2.25, 0.16, 0.56, 0.04, navy ? M.navy : M.porcelainShade); frame.position.set(0, 0.36, 0); g.add(frame);
  const hood = rbox(0.86, 0.46, 0.66, 0.1, body); hood.position.set(0.72, 0.64, 0); g.add(hood);
  const grille = rbox(0.06, 0.4, 0.5, 0.02, navy ? M.navy : M.porcelainShade); grille.position.set(1.16, 0.64, 0); g.add(grille);
  const bumper = rbox(0.12, 0.12, 0.74, 0.04, body); bumper.position.set(1.19, 0.38, 0); g.add(bumper);
  const cab = rbox(0.6, 0.7, 0.76, 0.1, body); cab.position.set(0.04, 0.88, 0); g.add(cab);
  const glassFront = rbox(0.04, 0.26, 0.64, 0.02, M.porcelainShade); glassFront.position.set(0.35, 1.04, 0);
  glassFront.material = navy ? new THREE.MeshStandardMaterial({ color: 0x24364E, roughness: 0.25 }) : M.porcelainShade; g.add(glassFront);
  const sleeper = rbox(0.56, 0.78, 0.76, 0.1, body); sleeper.position.set(-0.52, 0.92, 0); g.add(sleeper);
  for (const z of [-0.34, 0.34]) {
    const s = cyl(0.035, 1.0, body, 12); s.position.set(-0.2, 1.3, z); g.add(s);
    const t = cyl(0.13, 0.42, navy ? M.navy : M.porcelainShade, 18); t.rotation.z = Math.PI / 2; t.position.set(-0.05, 0.36, z * 1.1); g.add(t);
    const m = rbox(0.06, 0.16, 0.04, 0.015, body); m.position.set(0.36, 1.06, z * 1.25); g.add(m);
  }
  g.add(wheel(tireM, 0.78, 0.32), wheel(tireM, 0.78, -0.32));
  for (const x of [-0.5, -0.86]) g.add(wheel(tireM, x, 0.32), wheel(tireM, x, -0.32));
  return g;
}
function buildTrailer(navy) {
  const g = new THREE.Group();
  const L = 3.5;
  const box = rbox(L, 0.98, 0.78, 0.06, navy ? M.glass : M.porcelain);
  box.position.set(-L / 2 + 0.25, 1.06, 0); g.add(box);
  if (navy) {
    box.castShadow = false;
    const frame = rbox(L + 0.02, 0.06, 0.8, 0.02, M.porcelainShade); frame.position.set(-L / 2 + 0.25, 0.56, 0); g.add(frame);
    for (let i = 0; i < 5; i++) for (const z of [-0.18, 0.18]) {
      const c = rbox(0.5, 0.4, 0.3, 0.05, M.porcelain); c.position.set(-0.3 - i * 0.62, 0.81, z); g.add(c);
    }
  }
  const legs = rbox(0.08, 0.4, 0.6, 0.02, M.porcelainShade); legs.position.set(-0.7, 0.36, 0); g.add(legs);
  const tireM = navy ? M.navyTire : M.tire;
  for (const x of [-L + 0.75, -L + 0.4]) g.add(wheel(tireM, x, 0.32), wheel(tireM, x, -0.32));
  return g;
}

// ---------- routes ----------
// Road: rounded rectangle, centre x ±20, z -1.5..9.5, corner radius 4, 2.6 wide.
// Trucks keep to the right-hand lane, 0.65 inside the centre line (mirrors models/set.py).
function roundedRect(x0, x1, z0, z1, r, step = 0.5) {
  const pts = [], line = (ax, az, bx, bz) => { const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step)); for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); };
  const arc = (cx, cz, a0) => { const n = Math.round(r * Math.PI / 2 / step); for (let i = 0; i < n; i++) { const a = a0 + (Math.PI / 2) * i / n; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
  line(x0 + r, z0, x1 - r, z0); arc(x1 - r, z0 + r, -Math.PI / 2);
  line(x1, z0 + r, x1, z1 - r); arc(x1 - r, z1 - r, 0);
  line(x1 - r, z1, x0 + r, z1); arc(x0 + r, z1 - r, Math.PI / 2);
  line(x0, z1 - r, x0, z0 + r); arc(x0 + r, z0 + r, Math.PI);
  return pts;
}
const LANE = 0.65;
const ROUTES = [roundedRect(-20 + LANE, 20 - LANE, -1.5 + LANE, 9.5 - LANE, 4 - LANE)]
  .map(pts => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal', 0.5));

const routeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float time; varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - 0.5) * 2.0;                       // 0 centre, 1 edge
      float line = smoothstep(1.0, 0.55, d);
      vec3 col = mix(vec3(0.43, 0.84, 1.0), vec3(0.85, 0.96, 1.0), smoothstep(0.5, 0.0, d));
      gl_FragColor = vec4(col, line * 0.9);
    }`
});
function ribbon(curve, width, y, mat) {
  const N = 500, pos = [], uv = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), L = curve.getLength();
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u % 1), t = curve.getTangentAt(u % 1);
    const n = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(width / 2);
    pos.push(p.x + n.x, y, p.z + n.z, p.x - n.x, y, p.z - n.z);
    uv.push(u * L, 0, u * L, 1);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
ROUTES.forEach((c, i) => { const r = ribbon(c, 0.16, 0.045 + i * 0.01, routeMat); r.renderOrder = 1; scene.add(r); });

// ---------- world: hub depot, parked trailers, building clusters, trees ----------
const routeSamples = ROUTES.flatMap(c => c.getSpacedPoints(300));
const clearOf = (x, z, r) => routeSamples.every(p => (p.x - x) ** 2 + (p.z - z) ** 2 > r * r);

function addDepot() {
  const g = new THREE.Group();
  const b = rbox(4.2, 2.1, 11, 0.12, M.porcelain); b.position.set(0, 1.05, 0); g.add(b);
  const roof = rbox(4.4, 0.18, 11.2, 0.06, M.porcelainShade); roof.position.set(0, 2.15, 0); g.add(roof);
  for (let i = 0; i < 6; i++) {
    const d = rbox(0.06, 1.1, 1.2, 0.02, i === 2 ? M.dockGlow : M.dock); d.position.set(2.11, 0.75, -4.2 + i * 1.7); g.add(d);
  }
  g.position.set(-30, 0, 1);
  scene.add(g);
  for (let i = 0; i < 5; i++) {
    const t = buildTrailer(false); t.rotation.y = -Math.PI / 2; t.position.set(-34.2 + i * 1.25, 0, -9.5); scene.add(t);
  }
}

function warehouse(x, z, rot, len, docks) {
  const g = new THREE.Group();
  const body = rbox(len, 1.9, 4.2, 0.14, M.porcelain); body.position.y = 0.95; g.add(body);
  const roof = rbox(len + 0.2, 0.16, 4.4, 0.06, M.porcelainShade); roof.position.y = 1.98; g.add(roof);
  for (let i = 0; i < docks; i++) {
    const d = rbox(1.1, 1.05, 0.06, 0.02, M.dock); d.position.set(-len / 2 + 1.4 + i * ((len - 2.8) / Math.max(1, docks - 1)), 0.62, 2.11); g.add(d);
  }
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
}
function office(x, z, w, d, h) { const b = rbox(w, h, d, 0.2, M.porcelain); b.position.set(x, h / 2, z); scene.add(b); }
const coneGeo = new THREE.ConeGeometry(0.6, 1.8, 28);
function grove(x, z, n, seedOffset = 0) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + seedOffset, r = 0.9 * Math.sqrt(i + 0.5);
    const px = x + Math.cos(a) * r * 1.4, pz = z + Math.sin(a) * r * 1.4;
    if (!clearOf(px, pz, 2.2)) continue;
    const s = 0.75 + ((i * 37) % 10) / 22;
    const t = shadowed(new THREE.Mesh(coneGeo, M.porcelain)); t.scale.setScalar(s); t.position.set(px, 0.9 * s, pz); scene.add(t);
  }
}
function buildProceduralSet() {
  warehouse(0, -10.5, 0, 14, 6);                         // distribution centre, docks facing the route
  office(12.5, -10.5, 3, 3, 2.6);
  office(9, 4, 3, 3, 2.6);
  grove(-14, -12, 5); grove(18, -13, 4, 1); grove(-6, 4, 3, 2); grove(27, 2, 4, 3);
}

// baked set: geometry + AO atlas + ground shadow texture, built by models/set.py
const GROUND_BAKE = { cx: 2, cz: 0, w: 80, d: 60 };
const texLoader = new THREE.TextureLoader();
function loadTex(name, flipY) {
  const t = texLoader.load(new URL('models/' + name, import.meta.url).href);
  t.flipY = flipY; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t;
}
new GLTFLoader().load(new URL('models/set.glb', import.meta.url).href, (gltf) => {
  const ao = loadTex('set-ao.jpg', false);
  const withAo = (m) => { const c = m.clone(); c.aoMap = ao; c.aoMapIntensity = 1; return c; };
  M.pad = new THREE.MeshPhysicalMaterial({ color: 0xE4E9EF, roughness: 0.9 });
  const map = { Porcelain: withAo(M.porcelain), Shade: withAo(M.porcelainShade), Window: withAo(new THREE.MeshPhysicalMaterial({ color: 0xA7B9CC, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 })), Dock: withAo(M.dock), DockGlow: M.dockGlow, Pad: withAo(M.pad),
    Road: withAo(new THREE.MeshPhysicalMaterial({ color: 0xD5DBE2, roughness: 0.92 })), Paint: withAo(new THREE.MeshPhysicalMaterial({ color: 0xFFFFFF, roughness: 0.6 })) };
  gltf.scene.traverse(m => {
    if (!m.isMesh) return;
    m.material = map[m.material.name] || map.Porcelain;
    m.castShadow = false; m.receiveShadow = true;
  });
  scene.add(gltf.scene);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_BAKE.w, GROUND_BAKE.d), new THREE.MeshBasicMaterial({
    map: loadTex('ground-shadow.jpg', true), blending: THREE.MultiplyBlending, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false
  }));
  shade.rotation.x = -Math.PI / 2; shade.position.set(GROUND_BAKE.cx, 0.004, GROUND_BAKE.cz); shade.renderOrder = -1;
  scene.add(shade);
}, undefined, () => buildProceduralSet());

// ---------- fleet ----------
const STATUS = { transit: ['In transit', COL.ok, '#E3F6EA', '#15803D'], idle: ['Idle', COL.warn, '#FEF3DC', '#B45309'], delivered: ['Delivered', '#6ED6FF', '#E1F5FF', '#0E79B2'], late: ['Running late', COL.alert, '#FBE5E7', '#B91C1C'] };
const FLEET = [
  { name: 'Asset 4', trip: 4417, driver: 'M. Bidamou', from: 'Salt Lake City, UT', to: 'North Platte, NE', route: 0, u: 0.55, navy: true },
  { name: 'Asset 3', trip: 4416, driver: 'R. Alvarez', from: 'Atlanta, GA', to: 'Memphis, TN', route: 0, u: 0.8 },
  { name: 'Asset 2', trip: 4418, driver: 'K. Nguyen', from: 'Evanston, WY', to: 'Rawlins, WY', route: 0, u: 0.05 },
  { name: 'Asset 1', trip: 4419, driver: 'D. Brooks', from: 'Dallas, TX', to: 'Tulsa, OK', route: 0, u: 0.3 }
];
// geometry constants match prototype/models/trucks.glb (built by models/trucks.py)
const KINGPIN = 0.98, TRAILER_AXLE = KINGPIN + 2.8, SPEED = 3.2; // world units / s

const STATUS_COL = { transit: '#22C55E', delivered: '#6ED6FF', idle: '#F9AC24', late: '#D22533' };
const pickables = [];

const trucks = FLEET.map((f, i) => {
  const tractor = buildTractor(!!f.navy), trailer = buildTrailer(!!f.navy);
  scene.add(tractor, trailer);
  const dot = document.createElement('button');
  dot.className = 'tv-dot'; dot.type = 'button'; dot.setAttribute('aria-label', `Track ${f.name}`);
  dot.addEventListener('click', () => select(i)); stage.appendChild(dot);
  const curve = ROUTES[f.route], len = curve.getLength();
  return { ...f, i, tractor, trailer, dot, dotStatus: '', curve, len, status: 'transit', dwell: 0, tripStart: f.u, progress: 0.35 + i * 0.08, note: '' };
});

function collectPickables() {
  pickables.length = 0;
  trucks.forEach(t => [t.tractor, t.trailer].forEach(o => o.traverse(m => { if (m.isMesh) { m.userData.truck = t.i; pickables.push(m); } })));
}
collectPickables();

// swap the placeholder trucks for the modeled ones once loaded
function skin(src, navy) {
  const g = src.clone(true);
  g.traverse(m => {
    if (!m.isMesh) return;
    const n = m.material.name;
    m.material = n === 'Paint' ? (navy ? M.navy : M.porcelain)
      : n === 'Trim' ? (navy ? M.chrome : M.porcelainShade)
      : n === 'Window' ? (navy ? M.navyGlass : M.window)
      : n === 'Tire' ? M.tire : n === 'Glass' ? M.glass : M.porcelain;
    m.castShadow = n !== 'Glass'; m.receiveShadow = true;
  });
  return g;
}
new GLTFLoader().load(new URL('models/trucks.glb', import.meta.url).href, (gltf) => {
  const lib = {}; gltf.scene.children.forEach(c => { lib[c.name] = c; });
  if (!lib.Tractor || !lib.Trailer || !lib.TrailerGlass) return;
  trucks.forEach(t => {
    t.tractor.clear(); t.tractor.add(skin(lib.Tractor, !!t.navy));
    t.trailer.clear(); t.trailer.add(skin(t.navy ? lib.TrailerGlass : lib.Trailer, !!t.navy));
  });
  collectPickables();
});

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpK = new THREE.Vector3();
function place(t) {
  const u = ((t.u % 1) + 1) % 1;
  t.curve.getPointAt(u, tmpA);
  const tan = t.curve.getTangentAt(u);
  const head = Math.atan2(-tan.z, tan.x);
  t.tractor.position.copy(tmpA); t.tractor.rotation.y = head;
  tmpK.set(-KINGPIN, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), head).add(tmpA);
  const ub = (((u - TRAILER_AXLE / t.len) % 1) + 1) % 1;
  t.curve.getPointAt(ub, tmpB);
  const th = Math.atan2(-(tmpK.z - tmpB.z), tmpK.x - tmpB.x);
  t.trailer.position.copy(tmpK); t.trailer.rotation.y = th;
}
trucks.forEach(place);

// trip events: deliveries at fixed stops, occasional idle
const STOPS = [[0.176, 0.676]];
function stepTruck(t, dt) {
  if (t.dwell > 0) {
    t.dwell -= dt;
    if (t.dwell <= 0) {
      if (t.status === 'delivered') { t.trip += 6; [t.from, t.to] = [t.to, t.from]; t.progress = 0; t.note = ''; }
      t.status = 'transit';
    }
    return;
  }
  const prev = ((t.u % 1) + 1) % 1;
  t.u += (SPEED * dt) / t.len;
  t.progress = Math.min(1, t.progress + (SPEED * dt) / (t.len * 0.5));
  const cur = ((t.u % 1) + 1) % 1;
  for (const s of STOPS[t.route]) {
    if ((prev < s && cur >= s) || (prev > cur && (s > prev || s <= cur))) {
      t.status = 'delivered'; t.dwell = 3.2; t.progress = 1; t.note = 'POD received. Invoice sent from the same record.';
      return;
    }
  }
  if (t.i !== 0 && Math.random() < dt * 0.012) { t.status = 'idle'; t.dwell = 4.5; t.note = 'Dispatcher notified.'; }
}

// ---------- post ----------
// MSAA render target: without it every thin edge (grilles, ribs, mirrors) shimmers as trucks move
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
try {
  gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.75;
  composer.addPass(gtao);
} catch (e) { gtao = null; }
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.3, 0.95);
const tiltH = new ShaderPass(HorizontalTiltShiftShader), tiltV = new ShaderPass(VerticalTiltShiftShader);
composer.addPass(new OutputPass());
const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.022 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+time)*43758.5453); } void main(){ vec4 c=texture2D(tDiffuse,vUv); c.rgb+= (h(vUv*1000.0)-0.5)*amount; gl_FragColor=c; }'
});

// ---------- camera rig ----------
// home framing; ?cam=az,pol,dist,x,z overrides it for art-direction checks
const HOME = { az: -0.45, pol: 0.72, dist: 60, x: -3, z: 4 };
const camParam = new URLSearchParams(location.search).get('cam');
if (camParam) [HOME.az, HOME.pol, HOME.dist, HOME.x, HOME.z] = camParam.split(',').map(Number);
const rig = {
  az: HOME.az, pol: HOME.pol, dist: HOME.dist, target: new THREE.Vector3(HOME.x, 0, HOME.z),
  goal: { az: HOME.az, pol: HOME.pol, dist: HOME.dist, target: new THREE.Vector3(HOME.x, 0, HOME.z) }
};
if (!reduceMotion) { rig.pol = HOME.pol + 0.22; rig.dist = HOME.dist * 0.85; rig.az = HOME.az - 0.3; }
let selected = -1, viewShift = 0;

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  if (gtao) gtao.setSize(w, h);
  tiltH.uniforms.h.value = 1.1 / w; tiltV.uniforms.v.value = 1.1 / h;
  camera.aspect = w / h;
  viewShift = w > 900 ? Math.round(w * 0.16) : 0;
  if (viewShift) camera.setViewOffset(w, h, -viewShift, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

function applyCamera() {
  const sp = new THREE.Spherical(rig.dist, rig.pol, rig.az);
  camera.position.setFromSpherical(sp).add(rig.target);
  camera.lookAt(rig.target);
}

// drag to orbit gently
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, az: rig.goal.az, pol: rig.goal.pol, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; canvas.classList.add('drag'); }
    rig.goal.az = THREE.MathUtils.clamp(drag.az - dx * 0.004, -1.25, 0.05);
    rig.goal.pol = THREE.MathUtils.clamp(drag.pol - dy * 0.003, 0.55, 1.15);
  } else hover(e);
});
canvas.addEventListener('pointerup', e => {
  canvas.classList.remove('drag');
  if (drag && !drag.moved) pick(e);
  drag = null;
});

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hit(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(pickables, false)[0];
  return h ? h.object.userData.truck : -1;
}
function hover(e) { canvas.classList.toggle('hover', hit(e) >= 0); }
function pick(e) { const i = hit(e); select(i); }

// ---------- UI ----------
const list = $('tv-asset-list'), card = $('tv-card');
list.innerHTML = trucks.map(t => `<li data-i="${t.i}"><span class="dot"></span><span class="n">${t.name}</span><span class="s"></span></li>`).join('');
list.addEventListener('click', e => { const li = e.target.closest('li'); if (li) select(+li.dataset.i); });
$('tv-close').addEventListener('click', () => select(-1));
window.addEventListener('keydown', e => { if (e.key === 'Escape') select(-1); });

function select(i) {
  selected = i;
  $('tv-hint').classList.add('gone');
  list.querySelectorAll('li').forEach(li => li.classList.toggle('sel', +li.dataset.i === i));
  if (i < 0) { card.hidden = true; rig.goal.dist = HOME.dist; rig.goal.pol = HOME.pol; rig.goal.target.set(HOME.x, 0, HOME.z); return; }
  card.hidden = false; rig.goal.dist = 24; rig.goal.pol = 0.92;
  renderCard(trucks[i], true);
}

const TRIP_MINS = [190, 95, 140, 62]; // demo trip lengths per truck
function fmtEta(t) {
  if (t.status === 'delivered') return 'Arrived';
  const mins = Math.max(4, Math.round((1 - t.progress) * TRIP_MINS[t.i]));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}
function renderCard(t) {
  const [label, , bg, fg] = STATUS[t.status];
  $('c-asset').textContent = t.name;
  const pill = $('c-pill'); pill.textContent = t.status === 'idle' ? 'Idle · 12 min' : label; pill.style.background = bg; pill.style.color = fg;
  $('c-trip').textContent = `Trip ${t.trip}`;
  $('c-from').textContent = t.from; $('c-to').textContent = t.to;
  $('c-bar').style.width = Math.round(t.progress * 100) + '%';
  $('c-eta').textContent = fmtEta(t);
  $('c-driver').textContent = t.driver;
  $('c-rem').textContent = t.status === 'delivered' ? '0 mi' : Math.round((1 - t.progress) * TRIP_MINS[t.i] * 0.93) + ' mi';
  $('c-speed').textContent = t.status === 'transit' ? (56 + (t.i * 3) % 9) + ' mph' : '0 mph';
  $('c-note').textContent = t.note;
}
function renderList() {
  $('tv-online').textContent = `${trucks.length} assets online`;
  list.querySelectorAll('li').forEach(li => {
    const t = trucks[+li.dataset.i]; const [label, col] = STATUS[t.status];
    li.querySelector('.dot').style.background = col;
    li.querySelector('.s').textContent = t.status === 'transit' ? `ETA ${fmtEta(t)}` : t.status === 'idle' ? 'Idle · 12 min' : `${label} · ${t.to.split(',')[0]}`;
  });
}

const proj = new THREE.Vector3();
let cardX = 0, cardY = 0;
function positionDots() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const t of trucks) {
    if (t.dotStatus !== t.status) { t.dot.style.setProperty('--c', STATUS_COL[t.status]); t.dotStatus = t.status; }
    t.dot.classList.toggle('sel', t.i === selected);
    proj.copy(t.tractor.position); proj.y += 2.1; proj.project(camera);
    t.dot.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h}px)`;
  }
}
function positionCard() {
  if (selected < 0) return;
  const t = trucks[selected];
  const r = canvas.getBoundingClientRect(), host = stage.parentElement.getBoundingClientRect();
  const cw = card.offsetWidth, ch = card.offsetHeight;
  if (r.width <= 900) { // phones: dock the card at the bottom of the scene
    card.style.transform = `translate(${(r.width - cw) / 2}px, ${r.top - host.top + r.height - ch - 16}px)`;
    return;
  }
  proj.copy(t.tractor.position); proj.y += 2.4; proj.project(camera);
  let x = (proj.x * 0.5 + 0.5) * r.width + 120, y = (-proj.y * 0.5 + 0.5) * r.height - 210;
  if (x + cw > r.width - 20) x -= cw + 240;
  x = THREE.MathUtils.clamp(x, 20, r.width - cw - 20); y = THREE.MathUtils.clamp(y, 20, r.height - ch - 20);
  cardX += (x - cardX) * 0.18; cardY += (y - cardY) * 0.18;
  card.style.transform = `translate(${cardX + (r.left - host.left)}px, ${cardY + (r.top - host.top)}px)`;
}

// ---------- loop ----------
const clock = new THREE.Clock();
let uiTimer = 0, visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(stage);

let simTime = 0;
function frame(dt) {
  simTime += dt;
  if (!reduceMotion) for (const t of trucks) { stepTruck(t, dt); place(t); }

  if (selected >= 0) rig.goal.target.lerp(trucks[selected].tractor.position, 0.12);
  const k = 1 - Math.pow(0.0025, dt);
  rig.az += (rig.goal.az - rig.az) * k; rig.pol += (rig.goal.pol - rig.pol) * k * 0.8;
  rig.dist += (rig.goal.dist - rig.dist) * k * 0.8; rig.target.lerp(rig.goal.target, k);
  applyCamera();

  uiTimer += dt;
  if (uiTimer > 0.25) { uiTimer = 0; renderList(); if (selected >= 0) renderCard(trucks[selected]); }
  positionCard(); positionDots();
  grain.uniforms.time.value = simTime % 100;
  routeMat.uniforms.time.value = simTime;
  let focus = 0.46;
  if (selected >= 0) { proj.copy(trucks[selected].tractor.position).project(camera); focus = THREE.MathUtils.clamp(proj.y * 0.5 + 0.5, 0.15, 0.85); }
  tiltH.uniforms.r.value += (focus - tiltH.uniforms.r.value) * 0.1; tiltV.uniforms.r.value = tiltH.uniforms.r.value;
  composer.render();
}
function tick() {
  requestAnimationFrame(tick);
  if (!visible) return;
  frame(Math.min(clock.getDelta(), 0.05));
}
renderList();
applyCamera();
const qs = new URLSearchParams(location.search);
if (qs.has('shot')) { for (let i = 0; i < 300; i++) frame(1 / 60); const sel = qs.get('shot'); if (sel !== 'default') { select(+sel); for (let i = 0; i < 200; i++) frame(1 / 60); } }
tick();
window.__tv = { rig, select, trucks, camera, bloom, gtao, M, key, hemi, scene, step: (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); } };

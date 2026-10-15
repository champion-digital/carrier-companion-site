/* Tower View prototype · Carrier Companion
   A live model-world scene: porcelain trucks on glowing routes, click to track. Demo data only. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const stage = $('tv-stage'), canvas = $('tv-canvas');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- palette ----------
const COL = {
  bg: 0xEDF1F5, porcelain: 0xF1F4F7, porcelainShade: 0xE2E8EE, tire: 0xD6DCE4, navy: 0x0A1A2F, navyTire: 0x1A2433,
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
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.bg);
scene.fog = new THREE.Fog(COL.bg, 190, 420);

const camera = new THREE.PerspectiveCamera(22, 1, 1, 1000);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0xC4D7E8, 1.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(-30, 60, 22);
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
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ color: 0x1E4A78, opacity: 0.3 }));
shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = 0.01; shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

// ---------- materials ----------
const M = {
  porcelain: new THREE.MeshStandardMaterial({ color: COL.porcelain, roughness: 0.82, metalness: 0 }),
  porcelainShade: new THREE.MeshStandardMaterial({ color: COL.porcelainShade, roughness: 0.85 }),
  tire: new THREE.MeshStandardMaterial({ color: COL.tire, roughness: 0.9 }),
  navy: new THREE.MeshStandardMaterial({ color: COL.navy, roughness: 0.42, metalness: 0.15 }),
  navyTire: new THREE.MeshStandardMaterial({ color: COL.navyTire, roughness: 0.8 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xDDF2FF, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.25, depthWrite: false, side: THREE.DoubleSide }),
  dock: new THREE.MeshStandardMaterial({ color: 0xDCE3EA, roughness: 0.9 }),
  dockGlow: new THREE.MeshStandardMaterial({ color: 0xBFEBFF, emissive: COL.sky, emissiveIntensity: 1.6, roughness: 0.4 }),
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
const ROUTES = [
  [[-23,-2],[-15,-10],[-2,-16],[12,-16],[24,-11],[32,-2],[31,9],[21,14],[8,11],[-6,6],[-17,3]],
  [[-23,4],[-16,13],[-4,19],[10,20],[20,16],[22,8],[14,2],[2,0],[-11,-1],[-19,0]]
].map(pts => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal', 0.5));

function ribbon(curve, width, y, mat) {
  const N = 400, pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u % 1), t = curve.getTangentAt(u % 1);
    const n = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(width / 2);
    pos.push(p.x + n.x, y, p.z + n.z, p.x - n.x, y, p.z - n.z);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
for (const c of ROUTES) {
  const body = ribbon(c, 1.5, 0.04, M.routeBody); body.receiveShadow = true; scene.add(body);
  scene.add(ribbon(c, 0.12, 0.07, M.routeCore));
}

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
addDepot();

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function cluster(cx, cz, n, spread) {
  for (let i = 0; i < n; i++) {
    const x = cx + (rnd() - 0.5) * spread, z = cz + (rnd() - 0.5) * spread;
    const w = 2.2 + rnd() * 3.2, d = 2.2 + rnd() * 3.2, h = 1.2 + rnd() * 3.8;
    if (!clearOf(x, z, Math.max(w, d) / 2 + 1.6)) continue;
    const b = rbox(w, h, d, 0.18, rnd() > 0.7 ? M.porcelainShade : M.porcelain); b.position.set(x, h / 2, z); scene.add(b);
  }
}
cluster(8, -23, 9, 12); cluster(38, 6, 8, 9); cluster(6, 27, 9, 12); cluster(-8, -24, 5, 8); cluster(30, -20, 6, 9); cluster(30, 22, 5, 8); cluster(4, 9, 4, 6);
const coneGeo = new THREE.ConeGeometry(0.55, 1.6, 18);
for (let i = 0; i < 70; i++) {
  const x = -50 + rnd() * 100, z = -34 + rnd() * 68;
  if (!clearOf(x, z, 2.4) || Math.abs(x + 30) < 5 && Math.abs(z) < 8) continue;
  const s = 0.7 + rnd() * 0.8; const t = shadowed(new THREE.Mesh(coneGeo, M.porcelain)); t.scale.setScalar(s); t.position.set(x, 0.8 * s, z); scene.add(t);
}

// ---------- fleet ----------
const STATUS = { transit: ['In transit', COL.ok, '#E3F6EA', '#15803D'], idle: ['Idle', COL.warn, '#FEF3DC', '#B45309'], delivered: ['Delivered', '#6ED6FF', '#E1F5FF', '#0E79B2'], late: ['Running late', COL.alert, '#FBE5E7', '#B91C1C'] };
const FLEET = [
  { name: 'Asset 5', trip: 4417, driver: 'M. Bidamou', from: 'Salt Lake City, UT', to: 'North Platte, NE', route: 0, u: 0.08, navy: true },
  { name: 'Asset 4', trip: 4416, driver: 'R. Alvarez', from: 'Atlanta, GA', to: 'Memphis, TN', route: 0, u: 0.58 },
  { name: 'Asset 3', trip: 4418, driver: 'K. Nguyen', from: 'Evanston, WY', to: 'Rawlins, WY', route: 1, u: 0.22 },
  { name: 'Asset 2', trip: 4419, driver: 'D. Brooks', from: 'Dallas, TX', to: 'Tulsa, OK', route: 1, u: 0.72 },
  { name: 'Asset 1', trip: 4420, driver: 'S. Patel', from: 'Denver, CO', to: 'Omaha, NE', route: 0, u: 0.33 },
  { name: 'Asset 6', trip: 4421, driver: 'L. Carter', from: 'Reno, NV', to: 'Boise, ID', route: 1, u: 0.47 }
];
const KINGPIN = 0.45, TRAILER_AXLE = 2.85, SPEED = 3.2; // world units / s

function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const haloTex = haloTexture();
const pinMat = {
  transit: new THREE.MeshStandardMaterial({ color: 0x22C55E, emissive: 0x22C55E, emissiveIntensity: 0.35, roughness: 0.4 }),
  delivered: new THREE.MeshStandardMaterial({ color: 0x6ED6FF, emissive: 0x6ED6FF, emissiveIntensity: 0.5, roughness: 0.4 }),
  idle: new THREE.MeshStandardMaterial({ color: 0xF9AC24, emissive: 0xF9AC24, emissiveIntensity: 0.35, roughness: 0.4 }),
  late: new THREE.MeshStandardMaterial({ color: 0xD22533, emissive: 0xD22533, emissiveIntensity: 0.3, roughness: 0.4 })
};
const hexGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 6), hexBase = new THREE.CylinderGeometry(0.58, 0.58, 0.1, 6);
const pickables = [];

const trucks = FLEET.map((f, i) => {
  const tractor = buildTractor(!!f.navy), trailer = buildTrailer(!!f.navy);
  scene.add(tractor, trailer);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), new THREE.MeshBasicMaterial({ map: haloTex, color: COL.sky, transparent: true, opacity: 0, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.09; scene.add(halo);
  const pin = new THREE.Group();
  const base = new THREE.Mesh(hexBase, M.porcelain); base.castShadow = true;
  const top = new THREE.Mesh(hexGeo, pinMat.transit); top.position.y = 0.1;
  pin.add(base, top); pin.userData.top = top; scene.add(pin);
  for (const m of [base, top]) { m.userData.truck = i; pickables.push(m); }
  for (const o of [tractor, trailer]) o.traverse(m => { if (m.isMesh) { m.userData.truck = i; pickables.push(m); } });
  const curve = ROUTES[f.route], len = curve.getLength();
  return { ...f, i, tractor, trailer, halo, pin, pinStatus: 'transit', curve, len, status: 'transit', dwell: 0, tripStart: f.u, progress: 0.35 + i * 0.08, note: '' };
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
  t.halo.position.set((tmpA.x + tmpB.x) / 2, 0.09, (tmpA.z + tmpB.z) / 2);
}
trucks.forEach(place);

// trip events: deliveries at fixed stops, occasional idle
const STOPS = [[0.36, 0.78], [0.4, 0.88]];
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
const composer = new EffectComposer(renderer);
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
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.022 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+time)*43758.5453); } void main(){ vec4 c=texture2D(tDiffuse,vUv); c.rgb+= (h(vUv*1000.0)-0.5)*amount; gl_FragColor=c; }'
});
composer.addPass(grain);

// ---------- camera rig ----------
const rig = {
  az: -0.62, pol: 1.0, dist: 84, target: new THREE.Vector3(6, 0, 2),
  goal: { az: -0.62, pol: 1.0, dist: 84, target: new THREE.Vector3(6, 0, 2) }
};
if (!reduceMotion) { rig.pol = 1.3; rig.dist = 64; rig.az = -0.95; }
let selected = -1, viewShift = 0;

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  if (gtao) gtao.setSize(w, h);
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
  if (i < 0) { card.hidden = true; rig.goal.dist = 84; rig.goal.pol = 1.0; rig.goal.target.set(6, 0, 2); return; }
  card.hidden = false; rig.goal.dist = 40; rig.goal.pol = 0.92;
  renderCard(trucks[i], true);
}

function fmtEta(t) {
  if (t.status === 'delivered') return 'Arrived';
  const mins = Math.max(4, Math.round((1 - t.progress) * 180));
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
  $('c-rem').textContent = t.status === 'delivered' ? '0 mi' : Math.round((1 - t.progress) * 420) + ' mi';
  $('c-speed').textContent = t.status === 'transit' ? (56 + (t.i * 3) % 9) + ' mph' : '0 mph';
  $('c-note').textContent = t.note;
}
function renderList() {
  list.querySelectorAll('li').forEach(li => {
    const t = trucks[+li.dataset.i]; const [label, col] = STATUS[t.status];
    li.querySelector('.dot').style.background = col;
    li.querySelector('.s').textContent = t.status === 'transit' ? `ETA ${fmtEta(t)}` : t.status === 'idle' ? 'Idle · 12 min' : `${label} · ${t.to.split(',')[0]}`;
  });
}

const proj = new THREE.Vector3();
let cardX = 0, cardY = 0;
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

  for (const t of trucks) {
    const pulse = t.i === selected ? 0.55 + Math.sin(simTime * 3) * 0.12 : 0;
    t.halo.material.opacity += (pulse - t.halo.material.opacity) * 0.1;
    if (t.pinStatus !== t.status) { t.pin.userData.top.material = pinMat[t.status]; t.pinStatus = t.status; }
    t.pin.rotation.y = simTime * 0.6 + t.i;
    t.pin.position.set(t.tractor.position.x, 2.5 + Math.sin(simTime * 2 + t.i) * 0.08, t.tractor.position.z);
  }

  if (selected >= 0) rig.goal.target.lerp(trucks[selected].tractor.position, 0.12);
  const k = 1 - Math.pow(0.0025, dt);
  rig.az += (rig.goal.az - rig.az) * k; rig.pol += (rig.goal.pol - rig.pol) * k * 0.8;
  rig.dist += (rig.goal.dist - rig.dist) * k * 0.8; rig.target.lerp(rig.goal.target, k);
  applyCamera();

  uiTimer += dt;
  if (uiTimer > 0.25) { uiTimer = 0; renderList(); if (selected >= 0) renderCard(trucks[selected]); }
  positionCard();
  grain.uniforms.time.value = simTime % 100;
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

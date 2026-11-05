// Small signs of life around the road: smoke from chimneys, spray at waterfalls, a tractor working
// a field (with a little dust behind it), sailing boats on the sea, turning windmill sails, the
// lighthouse beam at night, falling water, and a word when a landmark is coming up.
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {scene, camera, renderer} from './render.js';
import {chunks, fallMat, villageNear} from './chunks.js';
import {biomeAt, terrainParams} from './biomes.js';
import {roadX, roadYaw, sideX} from './road.js';
import {groundHeight, coastSide, SEA_LEVEL, structureAt} from './terrain.js';
import {buildTractor} from './coach.js';
import {nightAmt, dayAmt} from './lighting.js';
import {toast} from './hud.js';
import {MAT} from './materials.js';
import {ROAD} from './road.js';
import {grabThumb} from './photo.js';
import {addPostcard} from './progress.js';

/* ------------------------------------------------------------ soft puffs */
const CAP = 320, pos = new Float32Array(CAP * 3), size = new Float32Array(CAP), alpha = new Float32Array(CAP), tint = new Float32Array(CAP * 3);
const geo = new T.BufferGeometry();
geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
geo.setAttribute('aAlpha', new T.BufferAttribute(alpha, 1)); geo.setAttribute('aTint', new T.BufferAttribute(tint, 3));
const puffMat = new T.ShaderMaterial({
  uniforms: {uScale: {value: 400}, uLight: {value: new T.Color(1, 1, 1)}, uFog: {value: new T.Color()}},
  vertexShader: `attribute float aSize,aAlpha;attribute vec3 aTint;uniform float uScale;varying float vA,vD;varying vec3 vT;
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;vD=-mv.z;gl_PointSize=aSize*uScale/max(vD,1.);vA=aAlpha;vT=aTint;}`,
  fragmentShader: `uniform vec3 uLight,uFog;varying float vA,vD;varying vec3 vT;
    void main(){vec2 q=gl_PointCoord-.5;float r=dot(q,q)*4.;if(r>1.)discard;float a=vA*(1.-r)*(1.-r)*(1.-smoothstep(220.,520.,vD));
      vec3 c=mix(vT*uLight,uFog,smoothstep(60.,500.,vD)*.7);gl_FragColor=vec4(c,a);}`,
  transparent: true, depthWrite: false});
const puffs = new T.Points(geo, puffMat); puffs.frustumCulled = false; puffs.renderOrder = 2; scene.add(puffs);
let np = 0;
function puff(x, y, z, s, a, r, g, b) {
  if (np >= CAP) return;
  pos[np * 3] = x; pos[np * 3 + 1] = y; pos[np * 3 + 2] = z; size[np] = s; alpha[np] = a; tint[np * 3] = r; tint[np * 3 + 1] = g; tint[np * 3 + 2] = b; np++;
}
/** A column of puffs rising from a point: each puff's age loops, so nothing needs storing. */
function plume(x, y, z, seed, k, {n = 12, rise = 7, drift = 4, grow = 4, base = .8, a = .32, rate = .09, col = [.82, .82, .84]} = {}) {
  const t = G.elapsed * rate + seed;
  for (let i = 0; i < n; i++) {
    const age = (t + i / n) % 1, wob = Math.sin((seed + i) * 7.1 + age * 4) * .6;
    puff(x + age * drift + wob * age, y + age * rise, z + Math.cos((seed + i) * 3.3) * age * 1.2, base + age * grow, a * k * Math.sin(Math.PI * Math.min(1, age * 1.4)), col[0], col[1], col[2]);
  }
}

/* ------------------------------------------------------------ field tractor */
const tractor = buildTractor('#b4322a'); tractor.visible = false; scene.add(tractor);
tractor.traverse(o => { if (o.isMesh) o.castShadow = true; });
const trac = {on: false, s: 0, c: 0, lx: 0, dir: 1, roll: 0};

/* ------------------------------------------------------------ sailing boats */
const boats = [];
{
  const hullM = new T.MeshStandardMaterial({color: '#f2f0ea', roughness: .5}), trimM = new T.MeshStandardMaterial({color: '#2f4f6f', roughness: .6}),
    mastM = new T.MeshStandardMaterial({color: '#cfcfcf', roughness: .4, metalness: .5}), sailM = new T.MeshStandardMaterial({color: '#fbfaf6', roughness: .9, side: T.DoubleSide});
  const tri = (a, b, c) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c], 3)); g.computeVertexNormals(); return g; };
  for (let i = 0; i < 3; i++) {
    const b = new T.Group(), L = 6 + i * 1.5;
    const hull = new T.Mesh(new T.CylinderGeometry(1, .55, L, 10, 1).rotateX(Math.PI / 2).scale(1, .5, 1), hullM); hull.position.y = .25; b.add(hull);
    const band = new T.Mesh(new T.BoxGeometry(1.9, .12, L * .9), trimM); band.position.y = .55; b.add(band);
    const mast = new T.Mesh(new T.CylinderGeometry(.06, .08, L * 1.3, 6), mastM); mast.position.set(0, L * .65 + .5, -L * .08); b.add(mast);
    const main = new T.Mesh(tri([0, 1, -L * .1], [0, L * 1.25, -L * .08], [0, 1, L * .4]), sailM); b.add(main);
    const jib = new T.Mesh(tri([0, 1, -L * .14], [0, L * 1.15, -L * .1], [0, 1, -L * .5]), sailM); b.add(jib);
    b.traverse(o => { if (o.isMesh) o.castShadow = true; });
    b.visible = false; scene.add(b); boats.push({g: b, s: 0, lx: 0, on: false, head: 0, seed: i * 2.3});
  }
}

/* ------------------------------------------------------------ the vehicle's trail */
const _rear = new T.Vector3(), _back = new T.Vector3();
let trailT = 0;
function trail(dt, run) {
  const v = state.speed, P = G.player; if (!run || !P || v < 3 || state.airborne || state.ride === 'cycle' || state.cam === 1) return;
  const wet = MAT.road.userData.wet.value, b = biomeAt(state.distance), side = Math.abs(state.side ?? 0);
  const offRoad = (state.offroad || 0) > 0 || side > ROAD.half - .2, snowy = b === 'snow' || state.season === 'winter';
  let kind = null, k = 0;
  if (offRoad && !snowy && wet < .4) { kind = [.74, .64, .5]; k = Math.min(1, v / 14); }
  else if (snowy && (offRoad || v > 12)) { kind = [.95, .97, 1]; k = Math.min(1, v / 20) * (offRoad ? 1 : .55); }
  else if (wet > .3 && v > 8) { kind = [.86, .89, .92]; k = Math.min(1, (v - 8) / 20) * wet * .8; }
  else if (b === 'desert' && v > 14) { kind = [.84, .72, .55]; k = .35; }
  if (!kind || k < .05) return;
  trailT += dt * (.5 + v / 40);
  const ry = P.rotation.y, L = state.ride === 'coach' ? 5.4 : 2.1;
  _back.set(Math.sin(ry), 0, Math.cos(ry));
  for (const sx of [-.75, .75]) {
    _rear.set(sx, .25, L).applyAxisAngle(T.Object3D.DEFAULT_UP, ry).add(P.position);
    for (let i = 0; i < 12; i++) {
      const age = (trailT + i / 12 + (sx > 0 ? .04 : 0)) % 1, wob = Math.sin(i * 7.3 + sx * 3) * .5;
      const d = age * (3 + v * .38), up = age * (kind[0] > .9 ? .9 : 1.4);
      puff(_rear.x + _back.x * d + wob * age * 1.4, _rear.y + up, _rear.z + _back.z * d + wob * age, .5 + age * 2.6, .42 * k * (1 - age) * Math.min(1, age * 6), kind[0], kind[1], kind[2]);
    }
  }
}

/* ------------------------------------------------------------ people */
// People walking along the verge in villages and towns: a simple figure with swinging arms and legs.
const people = [], SKIN = ['#e8c4a4', '#c99a74', '#8d5a3b', '#f0d2b8'], TOPS = ['#c0392b', '#2f6db5', '#e6b84a', '#3e7a54', '#7d5ba6', '#ecebe6', '#2b2f33'], LEGS = ['#2c3e57', '#3b3b3b', '#6b5a45', '#1f2a36'];
function figure(i) {
  const g = new T.Group(), m = c => new T.MeshStandardMaterial({color: c, roughness: .8}), skin = m(SKIN[i % 4]), top = m(TOPS[i % 7]), leg = m(LEGS[i % 4]);
  const box = (w, h, d, mat, x, y, z) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; return b; };
  g.add(box(.42, .62, .24, top, 0, 1.18, 0));
  const head = new T.Mesh(new T.SphereGeometry(.13, 10, 8), skin); head.position.y = 1.64; head.castShadow = true; g.add(head);
  const limb = (w, h, mat, x, y) => { const p = new T.Group(); p.position.set(x, y, 0); const b = box(w, h, w, mat, 0, -h / 2, 0); p.add(b); g.add(p); return p; };
  g.userData.legs = [limb(.15, .86, leg, -.1, .88), limb(.15, .86, leg, .1, .88)];
  g.userData.arms = [limb(.11, .62, top, -.28, 1.46), limb(.11, .62, top, .28, 1.46)];
  g.visible = false; scene.add(g); return g;
}
for (let i = 0; i < 8; i++) people.push({g: figure(i), on: false, s: 0, lx: 0, dir: 1, speed: 1.2, ph: i * 1.7});
function updatePeople(dt, base, yBase) {
  const d0 = state.distance;
  for (const pp of people) {
    if (pp.on && (pp.s < d0 - 60 || pp.s > d0 + 420)) pp.on = false;
    if (!pp.on && Math.random() < dt * .6) {
      const s = d0 + 60 + Math.random() * 330, v = villageNear(s), town = biomeAt(s) === 'town';
      if ((town || (v && Math.abs(s - v.vc) < 140)) && !structureAt(s)) Object.assign(pp, {on: true, s, lx: (Math.random() < .5 ? -1 : 1) * (ROAD.half + 2.3 + Math.random() * 1.2), dir: Math.random() < .5 ? -1 : 1, speed: 1 + Math.random() * .5});
    }
    pp.g.visible = pp.on && !G.trip;
    if (!pp.g.visible) continue;
    pp.s += pp.dir * pp.speed * dt; pp.ph += dt * pp.speed * 3.4;
    const P = terrainParams(pp.s), y = groundHeight(pp.s, pp.lx, P);
    pp.g.position.set(roadX(pp.s) + sideX(pp.s, pp.lx) - base, y - yBase, d0 - pp.s); pp.g.rotation.y = roadYaw(pp.s) + (pp.dir > 0 ? 0 : Math.PI);
    const sw = Math.sin(pp.ph) * .5, [l1, l2] = pp.g.userData.legs, [a1, a2] = pp.g.userData.arms;
    l1.rotation.x = sw; l2.rotation.x = -sw; a1.rotation.x = -sw * .8; a2.rotation.x = sw * .8;
  }
}

/* ------------------------------------------------------------ each frame */
const shown = new Set(), posted = new Set(), _sv = new T.Vector2(), _c = new T.Color();
export function updateLife(dt, run, base, yBase) {
  const d0 = state.distance, t = G.elapsed;
  np = 0;
  renderer.getDrawingBufferSize(_sv); puffMat.uniforms.uScale.value = _sv.y / (2 * Math.tan(camera.fov * Math.PI / 360));
  puffMat.uniforms.uLight.value.setScalar(.25 + .75 * dayAmt); puffMat.uniforms.uFog.value.copy(scene.fog?.color || _c.set(0xffffff));
  // chimney smoke: thicker on cold mornings and evenings and in winter; spray at waterfalls
  const cold = state.season === 'winter' ? 1 : state.time < 9.5 || state.time > 18 ? .8 : state.season === 'autumn' ? .6 : .35;
  const windX = G.weatherNow === 'windy' ? 9 : 3.5;
  let srcs = 0, fall = null, bell = null;
  const P = G.player ? G.player.position : null;
  const near = (p, c) => { const dx = p[0] + c.position.x - P.x, dy = p[1] + c.position.y - P.y, dz = p[2] + c.position.z - P.z, d = Math.hypot(dx, dy, dz); return {d, pan: dx / (d + 6), key: c.userData.index}; };
  for (const c of chunks) {
    const u = c.userData, d = u.start - d0; if (d < -80 || d > 420) continue;
    const ch = u.chimneys;
    if (ch) for (let j = 0; j < ch.length && srcs < 16; j += 4) { const sd = ch[j + 3] - d0; if (sd < -40 || sd > 380) continue;
      plume(ch[j] + c.position.x, ch[j + 1] + c.position.y, ch[j + 2] + c.position.z, j * .37 + u.index, cold, {drift: windX}); srcs++; }
    if (P && u.spray) { const n = near(u.spray, c); if (!fall || n.d < fall.d) fall = n; }
    if (P && u.church) { const n = near(u.church, c); if (!bell || n.d < bell.d) bell = n; }
    if (u.spray) { const p = u.spray; plume(p[0] + c.position.x, p[1] + c.position.y, p[2] + c.position.z, 3.3, 1, {n: 16, rise: 3, drift: 2, grow: 5, base: 2, a: .22, rate: .35, col: [.95, .97, 1]}); }
    // turning sails and the lighthouse beam (which only shows at night)
    if (u.spin) for (const sp of u.spin) { if (sp.night) { sp.obj.visible = nightAmt > .45; if (!sp.obj.visible) continue; } sp.obj.rotation[sp.axis] += sp.speed * dt; }
    // say when a landmark is coming up
    // a postcard as you pass it (taken while it is just ahead, so it is in the picture)
    if (u.landmark && run && !posted.has(u.index)) { const ld = u.landmark.s - d0; if (ld > 50 && ld < 130) { posted.add(u.index); const name = u.landmark.name;
      grabThumb(img => { if (addPostcard(name, img)) toast('A postcard: ' + name.charAt(0).toLowerCase() + name.slice(1) + '. It is in your journal.'); }); } }
    if (u.landmark && run && !shown.has(u.index)) { const ld = u.landmark.s - d0; if (ld > 0 && ld < 450) { shown.add(u.index); toast('Ahead: ' + u.landmark.name.charAt(0).toLowerCase() + u.landmark.name.slice(1) + '.'); } }
  }
  fallMat().map.offset.y += dt * 1.1;
  G.sounds = {fall, bell};   // for the sound: the nearest waterfall and church

  // a tractor working a field near the road (back and forth along a row), with dust when it is dry
  const b = biomeAt(d0 + 200);
  if (trac.on && (trac.c < d0 - 120 || biomeAt(trac.c) !== 'fields')) trac.on = false;
  if (!trac.on && b === 'fields' && Math.random() < dt * .2) {
    const c = d0 + 180 + Math.random() * 200, lx = (Math.random() < .5 ? -1 : 1) * (40 + Math.random() * 45);
    if (!structureAt(c) && biomeAt(c) === 'fields') Object.assign(trac, {on: true, c, s: c, lx, dir: Math.random() < .5 ? 1 : -1});
  }
  tractor.visible = trac.on;
  if (trac.on) {
    trac.s += trac.dir * 2.6 * dt; if (Math.abs(trac.s - trac.c) > 38) { trac.dir = -Math.sign(trac.s - trac.c); trac.lx += Math.sign(trac.lx) * 4.5; }
    const s = trac.s, P = terrainParams(s), y = groundHeight(s, trac.lx, P);
    tractor.position.set(roadX(s) + sideX(s, trac.lx) - base, y - yBase, d0 - s); tractor.rotation.y = roadYaw(s) + (trac.dir < 0 ? Math.PI : 0);
    trac.roll += 2.6 * dt; for (const w of tractor.userData.wheels) w.pivot.rotation.x = -trac.roll / w.r;
    if (state.season === 'summer' || state.season === 'autumn') {
      plume(tractor.position.x, tractor.position.y + .3, tractor.position.z + trac.dir * 2.2, 9.1, G.weatherNow === 'rainy' ? 0 : .7, {n: 10, rise: 1.6, drift: 1.5, grow: 3, base: 1, a: .25, rate: .5, col: [.72, .62, .48]});
    }
  }

  // sailing boats out at sea along the coast
  for (const bt of boats) {
    if (bt.on && (bt.s < d0 - 250 || bt.s > d0 + 1400)) bt.on = false;
    if (!bt.on && biomeAt(d0 + 300) === 'coast' && Math.random() < dt * .5) {
      const s = d0 + 150 + Math.random() * 900, sd = coastSide(s), lx = sd * (230 + Math.random() * 320);
      if (biomeAt(s) === 'coast' && groundHeight(s, lx, terrainParams(s)) < SEA_LEVEL - 1) Object.assign(bt, {on: true, s, lx, head: Math.random() * 6.28});
    }
    bt.g.visible = bt.on;
    if (!bt.on) continue;
    bt.s += Math.cos(bt.head) * 1.2 * dt; bt.lx += Math.sin(bt.head) * 1.2 * dt;
    bt.g.position.set(roadX(bt.s) + sideX(bt.s, bt.lx) - base, SEA_LEVEL - yBase + Math.sin(t * .9 + bt.seed) * .18, d0 - bt.s);
    bt.g.rotation.set(Math.sin(t * .7 + bt.seed) * .04, bt.head, Math.sin(t * .6 + bt.seed) * .07 + .08);
  }

  // behind the vehicle: dust off the road in dry weather, spray on a wet road, snow kicked up in winter
  trail(dt, run);
  updatePeople(dt, base, yBase);
  geo.setDrawRange(0, np);
  geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = geo.attributes.aTint.needsUpdate = true;
}

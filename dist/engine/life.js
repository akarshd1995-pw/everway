// Small signs of life around the road: smoke from chimneys, spray at waterfalls, a tractor working
// a field (with a little dust behind it), sailing boats on the sea, turning windmill sails, the
// lighthouse beam at night, falling water, and a word when a landmark is coming up.
import {makeHuman, walkPose, idlePose, sitPose, workPose} from './human.js';
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
  // a properly built person (see human.js): jointed limbs, hands and shoes, a face and hair; some in skirts
  const g = makeHuman({seed: i * 7 + 3, skirt: i % 4 === 1, top: TOPS[i % TOPS.length], bottom: LEGS[i % LEGS.length]});
  g.visible = false; scene.add(g); return g;
}
// what people do: walk along the verge, walk the dog, wait at the bus stop, sit outside a café, work in a field
const pm = (c, r = .8) => new T.MeshStandardMaterial({color: c, roughness: r});
function makeDog(seed) {
  const g = new T.Group(), coat = pm(['#6b4a2f', '#d9c7a3', '#2a2622', '#b07a43'][seed % 4], .95), dark = pm('#1d1a18');
  const body = new T.Mesh(new T.SphereGeometry(1, 12, 8), coat); body.scale.set(.15, .15, .34); body.position.y = .45; g.add(body);
  const head = new T.Group(); head.position.set(0, .62, -.36); g.add(head);
  const skull = new T.Mesh(new T.SphereGeometry(1, 10, 8), coat); skull.scale.set(.1, .1, .12); head.add(skull);
  const snout = new T.Mesh(new T.SphereGeometry(1, 8, 6), coat); snout.scale.set(.055, .05, .09); snout.position.set(0, -.03, -.11); head.add(snout);
  const nose = new T.Mesh(new T.SphereGeometry(.022, 6, 5), dark); nose.position.set(0, -.02, -.2); head.add(nose);
  for (const sd of [-1, 1]) { const ear = new T.Mesh(new T.SphereGeometry(1, 6, 5), coat); ear.scale.set(.03, .07, .045); ear.position.set(sd * .07, .02, .02); ear.rotation.z = sd * .4; head.add(ear); }
  const tail = new T.Group(); tail.position.set(0, .52, .32); g.add(tail);
  const tm = new T.Mesh(new T.CylinderGeometry(.015, .03, .3, 6), coat); tm.position.y = .13; tail.add(tm); tail.rotation.x = .9;
  const legs = [];
  for (const [x, z] of [[-.08, -.22], [.08, -.22], [-.08, .22], [.08, .22]]) { const hp = new T.Group(); hp.position.set(x, .45, z); g.add(hp); const l = new T.Mesh(new T.CylinderGeometry(.03, .025, .42, 6), coat); l.position.y = -.21; hp.add(l); legs.push(hp); }
  g.userData = {legs, tail, head}; g.visible = false; scene.add(g); return g;
}
function makeCafe() {
  const g = new T.Group(), wood = pm('#6e5038'), metal = pm('#3a3f42', .5), cloth = pm('#e8e4da');
  const seat = new T.Mesh(new T.BoxGeometry(.42, .04, .42), wood); seat.position.y = .46; g.add(seat);
  const back = new T.Mesh(new T.BoxGeometry(.42, .45, .04), wood); back.position.set(0, .7, .2); g.add(back);
  for (const [x, z] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) { const l = new T.Mesh(new T.CylinderGeometry(.015, .015, .46, 5), metal); l.position.set(x, .23, z); g.add(l); }
  const table = new T.Mesh(new T.CylinderGeometry(.36, .36, .03, 18), cloth); table.position.set(0, .74, -.5); g.add(table);
  const post = new T.Mesh(new T.CylinderGeometry(.03, .03, .74, 6), metal); post.position.set(0, .37, -.5); g.add(post);
  const cup = new T.Mesh(new T.CylinderGeometry(.04, .035, .08, 10), pm('#f4f2ec', .4)); cup.position.set(.12, .8, -.42); g.add(cup);
  const shade = new T.Mesh(new T.ConeGeometry(1.1, .45, 10, 1, true), pm(['#b8302a', '#2f6f4f', '#e6c35a'][Math.floor(Math.random() * 3)], .9)); shade.material.side = T.DoubleSide; shade.position.set(0, 2.25, -.5); g.add(shade);
  const pole = new T.Mesh(new T.CylinderGeometry(.02, .02, 2.2, 5), metal); pole.position.set(0, 1.1, -.5); g.add(pole);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.visible = false; scene.add(g); return g;
}
const hoe = (h) => { const g = new T.Group(), st = new T.Mesh(new T.CylinderGeometry(.015, .015, 1.4, 5), pm('#7a5a3a')); st.position.y = -.35; g.add(st);
  const bl = new T.Mesh(new T.BoxGeometry(.18, .02, .1), pm('#55595b', .5)); bl.position.set(0, -1.05, -.05); g.add(bl); g.rotation.x = -.6; h.userData.j.arms[1].hand.add(g); g.visible = false; return g; };
for (let i = 0; i < 14; i++) { const g = figure(i); people.push({g, on: false, s: 0, lx: 0, dir: 1, speed: 1.2, ph: i * 1.7, act: 'walk', dog: i % 3 === 0 ? makeDog(i) : null, cafe: i % 3 === 1 ? makeCafe() : null, hoe: i % 4 === 2 ? hoe(g) : null}); }
const _hv = new T.Vector3();
function updatePeople(dt, base, yBase) {
  const d0 = state.distance, day = dayAmt > .35 && (G.rainAmt || 0) < .4;
  for (const pp of people) {
    if (pp.on && (pp.s < d0 - 60 || pp.s > d0 + 420)) pp.on = false;
    if (!pp.on && Math.random() < dt * .6) {
      const s = d0 + 60 + Math.random() * 330, v = villageNear(s), town = biomeAt(s) === 'town', side = Math.random() < .5 ? -1 : 1, r = Math.random();
      if ((town || (v && Math.abs(s - v.vc) < 140)) && !structureAt(s)) {
        let act = 'walk', ps = s, lx = side * (ROAD.half + 2.3 + Math.random() * 1.2);
        if (pp.dog && r < .7) act = 'dog';
        else if (pp.cafe && day && r < .8 && (town || Math.abs(s - v.vc) < 70)) { act = 'sit'; lx = side * (ROAD.half + 4.2 + Math.random()); }
        else if (v && r < .5 && v.stop > d0 + 40) { act = 'wait'; ps = v.stop - 2 - Math.random() * 3; lx = ROAD.half + 2.6 + Math.random() * .6; }
        Object.assign(pp, {on: true, act, s: ps, lx, dir: Math.random() < .5 ? -1 : 1, speed: act === 'dog' ? .9 : 1 + Math.random() * .5});
      } else if (pp.hoe && day && biomeAt(s) === 'fields' && !structureAt(s) && r < .25) Object.assign(pp, {on: true, act: 'field', s, lx: side * (16 + Math.random() * 22), dir: 1, yaw: Math.random() * 6.28});
    }
    const vis = pp.on && !G.trip; pp.g.visible = vis;
    if (pp.dog) pp.dog.visible = vis && pp.act === 'dog'; if (pp.cafe) pp.cafe.visible = vis && pp.act === 'sit'; if (pp.hoe) pp.hoe.visible = vis && pp.act === 'field';
    if (!vis) continue;
    const moving = pp.act === 'walk' || pp.act === 'dog';
    if (moving) { pp.s += pp.dir * pp.speed * dt; pp.ph += dt * pp.speed * 3.4; } else pp.ph += dt;
    const P = terrainParams(pp.s), y = groundHeight(pp.s, pp.lx, P), yaw = roadYaw(pp.s);
    pp.g.position.set(roadX(pp.s) + sideX(pp.s, pp.lx) - base, y - yBase, d0 - pp.s);
    if (pp.act === 'sit') {
      // facing along the road, at a table outside a café
      pp.g.rotation.y = yaw + Math.sign(pp.lx) * Math.PI / 2; sitPose(pp.g, pp.ph);
      pp.cafe.position.copy(pp.g.position); pp.cafe.rotation.y = pp.g.rotation.y;
    } else if (pp.act === 'wait') { pp.g.rotation.y = yaw - Math.PI / 2 + Math.sin(pp.ph * .1) * .4; idlePose(pp.g, pp.ph); }
    else if (pp.act === 'field') { pp.g.rotation.y = pp.yaw; workPose(pp.g, pp.ph); }
    else {
      pp.g.rotation.y = yaw + (pp.dir > 0 ? 0 : Math.PI); walkPose(pp.g, pp.ph * 1.6);
      if (pp.act === 'dog') {
        // the dog trots a little ahead on the road side, tail wagging, nose down now and then
        const ds = pp.s + pp.dir * 1.3, dl = pp.lx - Math.sign(pp.lx) * .7, du = pp.dog.userData;
        pp.dog.position.set(roadX(ds) + sideX(ds, dl) - base, groundHeight(ds, dl, P) - yBase, d0 - ds); pp.dog.rotation.y = pp.g.rotation.y;
        du.legs.forEach((l, k) => { l.rotation.x = Math.sin(pp.ph * 3.2 + (k === 0 || k === 3 ? 0 : Math.PI)) * .5; });
        du.tail.rotation.z = Math.sin(pp.ph * 9) * .5; du.head.rotation.x = Math.max(0, Math.sin(pp.ph * .5)) ** 6 * .6;
      }
    }
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

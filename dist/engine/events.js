// Small things that happen on the road now and then (every few kilometres at most): sheep crossing,
// roadworks with a temporary traffic light, a tractor turning off into a field, deer at dusk.
// Autodrive and the traffic slow down and wait for them; driving yourself, you deal with them.
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {scene} from './render.js';
import {biomeAt, terrainParams} from './biomes.js';
import {ROAD, roadX, sideX, roadYaw, roadSurface} from './road.js';
import {groundHeight, structureAt} from './terrain.js';
import {traffic} from './actors.js';
import {toast} from './hud.js';
import {impact} from './physics.js';

/* ------------------------------------------------------------ animals */
// A simple animal: a body, a head, four legs that swing as it walks. Sheep are woolly and white with a
// dark face; deer are slim and brown, the first of a group with antlers.
function animal(kind, i) {
  const g = new T.Group(), m = c => new T.MeshStandardMaterial({color: c, roughness: .9});
  const sheep = kind === 'sheep', body = m(sheep ? (i % 5 === 4 ? '#3b3632' : '#ece7dc') : '#8a5a36'), face = m(sheep ? '#2d2925' : '#7a4d2e'), leg = m(sheep ? '#2d2925' : '#5c3b24');
  const L = sheep ? .95 : 1.25, H = sheep ? .55 : .5, legH = sheep ? .42 : .78;
  const b = new T.Mesh(sheep ? new T.IcosahedronGeometry(.5, 1) : new T.BoxGeometry(.42, H, L), body);
  if (sheep) b.scale.set(.85, .72, 1.1); b.position.y = legH + H / 2; b.castShadow = true; g.add(b);
  const head = new T.Mesh(new T.BoxGeometry(sheep ? .22 : .2, sheep ? .26 : .24, sheep ? .3 : .4), face);
  head.position.set(0, legH + H + (sheep ? .02 : .32), -L / 2 - (sheep ? .1 : .12)); head.castShadow = true; g.add(head);
  if (!sheep) { const neck = new T.Mesh(new T.BoxGeometry(.16, .5, .18), body); neck.position.set(0, legH + H + .05, -L / 2 + .05); neck.rotation.x = .5; g.add(neck);
    if (i % 3 === 0) for (const x of [-1, 1]) { const a = new T.Mesh(new T.BoxGeometry(.04, .38, .04), m('#d9c7a8')); a.position.set(x * .1, legH + H + .58, -L / 2 - .08); a.rotation.z = x * .4; g.add(a); } }
  const legs = [];
  for (const [x, z] of [[-.13, -L * .35], [.13, -L * .35], [-.13, L * .35], [.13, L * .35]]) {
    const p = new T.Group(); p.position.set(x, legH, z); const l = new T.Mesh(new T.BoxGeometry(.09, legH, .09), leg); l.position.y = -legH / 2; p.add(l); g.add(p); legs.push(p);
  }
  g.userData.legs = legs; g.visible = false; scene.add(g); return g;
}
const sheepPool = Array.from({length: 9}, (_, i) => animal('sheep', i));
const deerPool = Array.from({length: 3}, (_, i) => animal('deer', i));

/* ------------------------------------------------------------ roadworks */
const works = new T.Group(); works.visible = false; scene.add(works);
const coneM = new T.MeshStandardMaterial({color: '#f06a1c', roughness: .6}), whiteM = new T.MeshStandardMaterial({color: '#f4f4f0', roughness: .6});
const cones = [];
for (let i = 0; i < 14; i++) { const c = new T.Group(); const k = new T.Mesh(new T.ConeGeometry(.2, .7, 10), coneM); k.position.y = .35; k.castShadow = true; c.add(k);
  const band = new T.Mesh(new T.CylinderGeometry(.12, .15, .1, 10), whiteM); band.position.y = .38; c.add(band); works.add(c); cones.push(c); }
const barrier = new T.Group(); works.add(barrier);
{ const stripe = new T.Mesh(new T.BoxGeometry(2.6, .3, .06), new T.MeshStandardMaterial({color: '#e23a2e'})); stripe.position.y = .9; barrier.add(stripe);
  for (const x of [-1.1, 1.1]) { const p = new T.Mesh(new T.BoxGeometry(.08, .9, .08), whiteM); p.position.set(x, .45, 0); barrier.add(p); } }
// the temporary light: a yellow box on a pole with a red and a green lamp
const light = new T.Group(); scene.add(light); light.visible = false;
const lampRed = new T.MeshBasicMaterial({color: '#3a0d0d'}), lampGreen = new T.MeshBasicMaterial({color: '#0d2a14'});
{ const pole = new T.Mesh(new T.CylinderGeometry(.06, .06, 3, 8), new T.MeshStandardMaterial({color: '#555'})); pole.position.y = 1.5; light.add(pole);
  const box = new T.Mesh(new T.BoxGeometry(.42, .9, .3), new T.MeshStandardMaterial({color: '#f2c230', roughness: .5})); box.position.y = 3.2; light.add(box);
  const r = new T.Mesh(new T.CircleGeometry(.12, 16), lampRed); r.position.set(0, 3.42, .16); light.add(r);
  const gr = new T.Mesh(new T.CircleGeometry(.12, 16), lampGreen); gr.position.set(0, 3.0, .16); light.add(gr);
  const base = new T.Mesh(new T.BoxGeometry(.6, .15, .6), new T.MeshStandardMaterial({color: '#333'})); base.position.y = .07; light.add(base); }

/* ------------------------------------------------------------ the events */
let ev = null, nextAt = 1800 + Math.random() * 1500;
const say = (t) => toast(t);
/** Where vehicles going `dir` must stop for the current event (a distance along the road), or null. */
export function stopFor(dir, s) {
  if (!ev) return null;
  if (ev.kind === 'works') {
    const ours = ev.phase === 'red';          // our light: red stops us, green stops the other way
    if (dir === 1 && ours && s < ev.s - 11) return ev.s - 11;
    if (dir === -1 && !ours && s > ev.s + 72) return ev.s + 72;
    return null;
  }
  if (ev.kind === 'sheep' || ev.kind === 'deer') { if (!ev.clear) return dir === 1 ? (s < ev.s - 9 ? ev.s - 9 : null) : (s > ev.s + 9 ? ev.s + 9 : null); }
  return null;
}
/** The lane our side's vehicles should use here (roadworks close our lane), or null. */
export function laneFor(dir, s) {
  if (ev && ev.kind === 'works' && dir === 1 && s > ev.s - 40 && s < ev.s + 75) return -ROAD.lane;
  return null;
}
function choose(s) {
  const b = biomeAt(s), t = state.time, dusk = (t > 5.6 && t < 7.6) || (t > 17.8 && t < 20.6), wild = b === 'mountain' || b === 'snow' || b === 'fields';
  const opts = [];
  if (b !== 'planet' && b !== 'town') opts.push('works');
  if ((b === 'fields' || b === 'mountain') && t > 7 && t < 19.5) opts.push('sheep', 'sheep');
  if (b === 'fields' && t > 7 && t < 19) opts.push('tractor', 'tractor');
  if (wild && dusk) opts.push('deer', 'deer', 'deer');
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
}
function start(kind, s) {
  ev = {kind, s, t: 0, side: Math.random() < .5 ? -1 : 1, clear: false, phase: 'red', said: false};
  if (kind === 'sheep' || kind === 'deer') {
    const pool = kind === 'sheep' ? sheepPool : deerPool, n = kind === 'sheep' ? 6 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 2);
    ev.herd = pool.slice(0, n).map((g, i) => ({g, ds: (Math.random() - .5) * (kind === 'sheep' ? 9 : 4), lat: -ev.side * (ROAD.half + 3 + Math.random() * 5 + (kind === 'sheep' ? i * .8 : i * 2)),
      speed: (kind === 'sheep' ? .9 + Math.random() * .4 : 4 + Math.random() * 1.5), delay: kind === 'sheep' ? i * .7 + Math.random() : i * .6, ph: Math.random() * 6}));
    ev.herd.forEach(a => a.g.visible = true);
  }
  if (kind === 'works') { works.visible = true; light.visible = true; ev.cycle = 0; }
  if (kind === 'tractor') {
    // a tractor ahead in our lane: it slows, signals and turns off into a field
    const t = traffic.find(c => c.userData.kind === 'tractor');
    if (!t) { ev = null; return; }
    const u = t.userData; u.s = s; u.direction = 1; u.lat = ROAD.lane; u.want = ROAD.lane; u.mode = 'turnoff'; u.t = 0; u.turnSide = Math.random() < .5 ? -1 : 1; u.cur = 6; t.visible = true; ev.tractor = u;
  }
}
function end() {
  if (ev?.herd) ev.herd.forEach(a => a.g.visible = false);
  works.visible = false; light.visible = false; ev = null; nextAt = state.distance + 2500 + Math.random() * 3500;
}

/** Each frame. */
export function updateEvents(dt, run, base, yBase) {
  const d0 = state.distance;
  if (!ev) {
    if (!run || G.trip || G.replay || state.biome === 'planet') return;
    if (d0 > nextAt) {
      const s = d0 + 260, kind = choose(s);
      let clear = true; for (let k = -120; k <= 140; k += 10) if (structureAt(s + k)) { clear = false; break; }
      if (kind && clear) start(kind, s); else nextAt = d0 + 700;
    }
    return;
  }
  if (run) ev.t += dt;
  const e = ev, ahead = e.s - d0;
  if (ahead < -160 || ahead > 600 || G.trip) { end(); return; }
  if (!e.said && ahead < 230) { e.said = true; say({sheep: 'Sheep on the road ahead.', deer: 'Deer! Easy now.', works: 'Roadworks ahead: wait for the green light.', tractor: 'A tractor ahead.'}[e.kind]); }

  if (e.herd) {
    // they wander across the road, one after another, and are gone on the far side
    let onRoad = false;
    for (const a of e.herd) {
      const go = run && e.t > a.delay && (e.kind === 'deer' ? ahead < 140 : true);
      if (go) a.lat += e.side * a.speed * dt * (e.kind === 'sheep' ? 1 + Math.sin(e.t * 1.3 + a.ph) * .3 : 1);
      if (Math.abs(a.lat) < ROAD.half + 1) onRoad = true;
      const s = e.s + a.ds, P = terrainParams(s), y = Math.abs(a.lat) < ROAD.half + 1.5 ? roadSurface(s, a.lat) : groundHeight(s, a.lat, P);
      a.g.position.set(roadX(s) + sideX(s, a.lat) - base, y - yBase, d0 - s);
      a.g.rotation.y = roadYaw(s) + (e.side > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (go) { a.ph += dt * a.speed * (e.kind === 'deer' ? 3 : 6); const w = Math.sin(a.ph) * .5; const [l1, l2, l3, l4] = a.g.userData.legs; l1.rotation.x = w; l4.rotation.x = w; l2.rotation.x = -w; l3.rotation.x = -w; }
      // driving into one: a soft knock, and it hurries away
      if (run && state.speed > 3 && Math.abs(s - d0) < 2.4 && Math.abs(a.lat - (state.side ?? 0)) < 1.5 && !a.hit) { a.hit = true; a.speed *= 2.5; const r = impact(state.speed * .4, 'animal'); state.speed *= .5; if (r) G.eventCrash = r; }
    }
    e.clear = e.t > 3 && !onRoad && e.herd.every(a => Math.abs(a.lat) > ROAD.half + 2);
    if (e.herd.every(a => Math.abs(a.lat) > ROAD.half + 14)) { e.herd.forEach(a => a.g.visible = false); }
  }

  if (e.kind === 'works') {
    // cones close our lane for 70 m; the light gives each direction its turn
    if (run) e.cycle += dt;
    const c = e.cycle % 26; e.phase = c < 13 ? 'red' : 'green';
    if (e.phase === 'red' && ahead > 6 && ahead < 14 && state.speed > 4 && !e.ran) { e.ran = true; say('That light was red.'); }
    lampRed.color.set(e.phase === 'red' ? '#ff3b30' : '#3a0d0d'); lampGreen.color.set(e.phase === 'green' ? '#34e46a' : '#0d2a14');
    const sx = roadX(e.s), ry = roadYaw(e.s);
    works.position.set(sx - base, roadSurface(e.s, ROAD.lane) - yBase, d0 - e.s); works.rotation.y = ry;
    cones.forEach((c, i) => { const along = -5 + i * 5.5, lat = i === 0 ? ROAD.lane + 1.3 : .35 + Math.min(1, i / 2) * .2;
      c.position.set(lat + (i === 0 ? 0 : 0), roadSurface(e.s + along, lat) - roadSurface(e.s, ROAD.lane), -along); });
    barrier.position.set(ROAD.lane, 0, 2); barrier.rotation.y = 0;
    const ls = e.s - 13, ll = ROAD.half + 1.2;
    light.position.set(roadX(ls) + sideX(ls, ll) - base, roadSurface(ls, ll) - yBase, d0 - ls); light.rotation.y = roadYaw(ls);
  }

  if (e.kind === 'tractor') {
    const u = e.tractor;
    if (!u || u.mode !== 'turnoff' && u.mode !== 'gone') { end(); return; }
    if (u.mode === 'gone') end();
  }
}
G.roadEvents = {stopFor, laneFor, start: kind => { if (ev) end(); start(kind, state.distance + 220); }};   // start: for tests
/** Forget any event (a new journey, a jump along the road). */
export function resetEvents() { if (ev) end(); nextAt = state.distance + 1800 + Math.random() * 1500; }

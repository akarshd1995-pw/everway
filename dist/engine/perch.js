// Birds on the verge: a few small birds pecking at the grass beside the road. As you come close they
// lift off together, wings beating, and wheel away over the field.
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {scene} from './render.js';
import {biomeAt, terrainParams} from './biomes.js';
import {roadX, roadYaw, sideX, ROAD} from './road.js';
import {groundHeight, structureAt} from './terrain.js';
import {dayAmt} from './lighting.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const bodyM = new T.MeshStandardMaterial({color: '#2b2622', roughness: .9}), wingM = new T.MeshStandardMaterial({color: '#3a332d', roughness: .9, side: T.DoubleSide});
const bodyG = new T.SphereGeometry(.09, 8, 6); bodyG.scale(1, .8, 1.6);
const headG = new T.SphereGeometry(.055, 6, 5);
const wingG = new T.PlaneGeometry(.2, .1); wingG.translate(.1, 0, 0); wingG.rotateX(-Math.PI / 2);
function makeBird() {
  const g = new T.Group(), b = new T.Mesh(bodyG, bodyM); g.add(b);
  const h = new T.Mesh(headG, bodyM); h.position.set(0, .06, -.12); g.add(h);
  const wl = new T.Mesh(wingG, wingM), wr = new T.Mesh(wingG, wingM); wl.position.set(.04, .03, 0); wr.position.set(-.04, .03, 0); wr.scale.x = -1; g.add(wl, wr);
  g.userData = {wl, wr, head: h}; g.visible = false; g.scale.setScalar(1.7); scene.add(g); return g;
}
const N = 18, birds = Array.from({length: N}, () => ({m: makeBird(), on: false}));
let nextFlock = 300, BASE = 0, YBASE = 0;
const at = (s, lx, y, v) => v.set(roadX(s) + sideX(s, lx) - BASE, y - YBASE, state.distance - s);

function spawn() {
  const d = state.distance, s0 = d + rnd(160, 260), b = biomeAt(s0);
  if (!(b === 'fields' || b === 'coast' || b === 'town') || structureAt(s0) || dayAmt < .3 || (G.rainAmt || 0) > .3) return;
  const side = Math.random() < .5 ? -1 : 1, n = 3 + Math.floor(Math.random() * 6);
  let k = 0;
  for (const bd of birds) {
    if (bd.on || k >= n) continue; k++;
    const lx = side * (ROAD.half + rnd(1.6, 6)), s = s0 + rnd(-5, 5);
    Object.assign(bd, {on: true, s, lx, y: groundHeight(s, lx, terrainParams(s)), mode: 'peck', t: Math.random() * 5, ph: Math.random() * 6, yaw: rnd(0, 6.28), vx: 0, vy: 0, vz: 0, side});
    bd.m.visible = true;
  }
}

/** Call every frame. */
export function updatePerch(dt, run, base, yBase) {
  BASE = base; YBASE = yBase;
  if (run) { nextFlock -= state.speed * dt; if (nextFlock < 0) { nextFlock = rnd(380, 900); spawn(); } }
  const d = state.distance;
  for (const bd of birds) {
    if (!bd.on) continue;
    const m = bd.m, u = m.userData; bd.t += dt;
    if (bd.mode === 'peck') {
      // hop and peck; when the car is close (or anything loud goes by) they all go
      u.head.position.y = .06 - Math.max(0, Math.sin(bd.t * 5 + bd.ph)) * .07; u.wl.rotation.z = u.wr.rotation.z = 0;
      if (Math.random() < dt * .3) bd.yaw += rnd(-1, 1);
      if (bd.s - d < 30 + state.speed * .8 && bd.s - d > -20) {
        bd.mode = 'fly'; bd.t = 0;
        const out = bd.side, up = rnd(3, 5);
        bd.vx = out * rnd(4, 8); bd.vy = up; bd.vz = rnd(-2, 6); bd.yaw = Math.atan2(bd.vx, bd.vz);
      }
      at(bd.s, bd.lx, bd.y + .1, m.position);
    } else {
      // up and away with quick wingbeats, levelling out as they go
      bd.lx += bd.vx * dt; bd.s += bd.vz * dt; bd.y += bd.vy * dt; bd.vy = Math.max(.5, bd.vy - dt * 1.2);
      const f = Math.sin(bd.t * 32 + bd.ph); u.wl.rotation.z = f * .9; u.wr.rotation.z = -f * .9;
      at(bd.s, bd.lx, bd.y, m.position);
      if (bd.t > 6) { bd.on = false; m.visible = false; }
    }
    m.rotation.y = roadYaw(bd.s) + bd.yaw;
    if (bd.s < d - 60) { bd.on = false; m.visible = false; }
  }
}
export function resetPerch() { for (const bd of birds) { bd.on = false; bd.m.visible = false; } nextFlock = 300; }

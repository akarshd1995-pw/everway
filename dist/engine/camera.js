// Camera rig: chase, driver's view, scenic, and a cinematic mode that films the car from the roadside.
// Offsets follow the vehicle's heading and each ride's size. Fixed scratch vectors, no allocation per frame.
import * as T from '../three.module.js';
import {clamp, lerp, hash2} from './core.js';
import {G, state} from './state.js';
import {camera, canvas} from './render.js';
import {ROAD, roadHeight, roadSurface, roadX, roadYaw, sideX} from './road.js';
import {terrainParams} from './biomes.js';
import {groundHeight, groundAtX, structureAt} from './terrain.js';
import {skyDome} from './sky.js';
import {handling} from './physics.js';
import {photoCam} from './photo.js';

/** Looking around while driving: drag with the mouse or a finger, or use the right stick. The view
 * eases back behind the vehicle a moment after you let go. yaw/pitch are radians. */
export const glance = {yaw: 0, pitch: 0, held: false, idle: 0, stick: [0, 0]};
let drag = null;
canvas.addEventListener('pointerdown', e => { if (G.photo || !state.started || e.button > 0) return; drag = {x: e.clientX, y: e.clientY}; glance.held = true; });
addEventListener('pointermove', e => { if (!drag) return; glance.yaw = clamp(glance.yaw - (e.clientX - drag.x) * .006, -Math.PI * .95, Math.PI * .95); glance.pitch = clamp(glance.pitch + (e.clientY - drag.y) * .004, -.35, .5); drag = {x: e.clientX, y: e.clientY}; });
addEventListener('pointerup', () => { drag = null; glance.held = false; glance.idle = 0; });
function updateGlance(dt) {
  const [sx, sy] = glance.stick;
  if (Math.abs(sx) > .15 || Math.abs(sy) > .15) { glance.yaw = clamp(glance.yaw - sx * dt * 2.4, -Math.PI * .95, Math.PI * .95); glance.pitch = clamp(glance.pitch + sy * dt * 1.2, -.35, .5); glance.idle = 0; return; }
  if (glance.held) return;
  glance.idle += dt;
  if (glance.idle > 1.2) { const k = 1 - Math.exp(-dt * 2.2); glance.yaw -= glance.yaw * k; glance.pitch -= glance.pitch * k; }
}
export const CAMERAS = ['Chase camera', 'Driver’s view', 'Scenic camera', 'Cinematic camera'];
const cp = new T.Vector3(), look = new T.Vector3();
let debugView = null, yawS = 0, lastCam = -1;
/** Pin the camera (debug and screenshot tests). Pass null to release. */
export function setDebugView(p, t) { debugView = p ? {p: new T.Vector3(...p), t: new T.Vector3(...t)} : null; }

// offset (x, y, z) in the vehicle's direction, added to the player position
function around(out, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), P = G.player.position;
  return out.set(P.x + x * c + z * s, 0, P.z - x * s + z * c);
}

// ---- cinematic: a sequence of shots, cut together like a film. Each shot has its own camera move:
//  post   a fixed camera beside the road ahead that pans and zooms to keep the car framed
//  track  a camera travelling alongside the car, a little off the road
//  front  a low camera ahead of the car, looking back as it drives towards you
//  drone  a high camera slowly circling the car, showing the land around it
//  flyby  a low camera right at the roadside: the car rushes past close by
// A shot ends after its time (or when the car has gone past); if a hill hides the car, it cuts early.
const CINE = ['post', 'track', 'drone', 'front', 'post', 'flyby', 'track', 'drone'];
let cine = null, cineN = 0, cineS = 0, blockedT = 0, checkT = 0;
const camLook = new T.Vector3(), _a = new T.Vector3();
const groundAt = (S, lp) => Math.abs(lp) < ROAD.half + 1.5 ? roadSurface(S, lp) : groundHeight(S, lp, terrainParams(S));
/** World position of the point `lp` metres from the centre line at road distance S. */
function placeAt(out, S, lp, y, base, yBase) {
  const P = G.player.position;
  return out.set(roadX(S) - base + sideX(S, lp), y - yBase, P.z - (S - state.distance));
}
/** Can the camera at (S0, lp0, y0) see the car? Samples the ground along the line between them. */
function canSee(S0, lp0, y0) {
  const s = state.distance, side = state.side ?? ROAD.lane, yc = (state.y ?? roadHeight(s)) + 1;
  for (let k = 1; k < 7; k++) {
    const t = k / 7, S = lerp(S0, s, t), lp = lerp(lp0, side, t), y = lerp(y0, yc, t);
    if (structureAt(S) === 2 && Math.abs(lp) > ROAD.half) return false;   // the hill over a tunnel
    if (groundAt(S, lp) > y - .4) return false;
  }
  return true;
}
function newShot() {
  const s = state.distance, v = Math.max(state.speed, 3), side = state.side ?? ROAD.lane;
  const tunnel = structureAt(s) === 2 || structureAt(s + 40) === 2;
  for (let tries = 0; tries < 12; tries++) {
    const n = ++cineN, rnd = k => hash2(n * 7 + k, 31);
    const type = tunnel ? 'front' : CINE[n % CINE.length], sd = rnd(1) < .5 ? -1 : 1;
    let sh;
    if (type === 'post') {
      const S = s + 35 + Math.min(80, v * 3) * (.6 + rnd(2) * .6), lp = sd * (12 + rnd(3) * 16), high = rnd(4) < .3;
      sh = {type, S, lp, y: Math.max(groundAt(S, lp), roadHeight(S)) + (high ? 9 + rnd(5) * 6 : 1.8 + rnd(5) * 2), frame: 3.2 + rnd(6) * 2.2, dur: 13};
    } else if (type === 'flyby') {
      const S = s + 20 + v * 2.2, lp = sd * (ROAD.half + 2.2);
      sh = {type, S, lp, y: groundAt(S, lp) + .9, frame: 0, fov: 52, dur: 10};
    } else if (type === 'track') {
      sh = {type, off: -4 + rnd(2) * 10, lat: sd * (8 + rnd(3) * 6), h: 1.4 + rnd(4) * 2.5, fov: 34 + rnd(5) * 10, drift: (rnd(6) - .5) * 1.2, dur: 7 + rnd(7) * 3};
    } else if (type === 'front') {
      sh = {type, off: 13 + rnd(2) * 8, lat: (tunnel ? .4 : sd * (1 + rnd(3) * 2.5)) - side + ROAD.lane * Math.sign(side || 1), h: 1 + rnd(4) * .7, fov: 46, drift: -1.2 - rnd(5), dur: 6 + rnd(6) * 2};
    } else {
      sh = {type, a0: rnd(2) * 6.28, w: (rnd(3) < .5 ? -1 : 1) * (.08 + rnd(4) * .06), R: 26 + rnd(5) * 20, h: 20 + rnd(6) * 16, fov: 42, dur: 10 + rnd(7) * 3};
    }
    sh.t = 0;
    const at = shotPos(sh, 0);
    if (tunnel || canSee(at.S, at.lp, at.y)) return sh;
  }
  return {type: 'track', off: -6, lat: 0, h: 2.6, fov: 50, drift: 0, dur: 4, t: 0};   // nothing clear: a plain shot behind
}
const _sp = {S: 0, lp: 0, y: 0};
/** Where the shot's camera is now, in road terms. */
function shotPos(sh) {
  const s = state.distance, side = state.side ?? ROAD.lane;
  if (sh.type === 'post' || sh.type === 'flyby') { _sp.S = sh.S; _sp.lp = sh.lp; _sp.y = sh.y; return _sp; }
  if (sh.type === 'drone') {
    const a = sh.a0 + sh.t * sh.w, S = s + Math.cos(a) * sh.R, lp = side + Math.sin(a) * sh.R;
    _sp.S = S; _sp.lp = lp; _sp.y = Math.max(roadHeight(s), groundAt(S, lp)) + sh.h; return _sp;
  }
  // track and front ride along with the car, drifting slowly forwards or back
  const S = s + sh.off + sh.drift * sh.t, lp = side + sh.lat;
  _sp.S = S; _sp.lp = lp; _sp.y = Math.max(groundAt(S, lp), sh.type === 'front' ? roadSurface(S, lp) : -1e9) + sh.h; return _sp;
}
function cinematic(dt, base, yBase) {
  const s = state.distance, P = G.player.position;
  let cut = !cine || Math.abs(s - cineS) > 60;   // a new shot after a jump along the road (a new journey, continue)
  cineS = s;
  if (cine) {
    cine.t += dt;
    const passed = (cine.type === 'post' || cine.type === 'flyby') && s - cine.S > (cine.type === 'flyby' ? 12 : 22);
    checkT -= dt;
    if (checkT <= 0) { checkT = .25; const p = shotPos(cine); blockedT = canSee(p.S, p.lp, p.y) || structureAt(s) === 2 ? 0 : blockedT + .25; }
    if (cine.t > cine.dur || passed || blockedT > .6 || (cine.type === 'post' && cine.S - s > 220)) cut = true;
  }
  if (cut) { cine = newShot(); blockedT = 0; checkT = .25; G.cineShot = cine.type; }
  const p = shotPos(cine);
  placeAt(_a, p.S, p.lp, p.y, base, yBase);
  // moving shots glide (the ground under them changes); a cut is instant
  if (cut || cine.type === 'post' || cine.type === 'flyby') cp.copy(_a); else cp.lerp(_a, 1 - Math.exp(-dt * 5));
  // aim at the car, leading it a little in the direction it is going; the aim follows smoothly
  _a.copy(P); _a.y += .9;
  if (cine.type === 'drone' || cine.type === 'track') { const yaw = G.player.rotation.y; _a.x -= Math.sin(yaw) * 4; _a.z -= Math.cos(yaw) * 4; }
  if (cut) camLook.copy(_a); else camLook.lerp(_a, 1 - Math.exp(-dt * (cine.type === 'flyby' ? 14 : 7)));
  look.copy(camLook);
  // a fixed camera zooms to keep the car about the same size in the picture
  if (cine.type === 'post') { const d = cp.distanceTo(P); return clamp(2 * Math.atan(cine.frame / d) * 57.3, 9, 50); }
  return cine.fov;
}
export function resetCinematic() { cine = null; }

export function updateCamera(dt, base, yBase) {
  const s = state.distance, h = handling(), cam = h.cam;
  // follow the vehicle's heading, smoothed so the camera swings gently
  const heading = roadYaw(s) - (state.psi || 0);
  yawS += clamp(heading - yawS, -1, 1) * (1 - Math.exp(-dt * 3.5));
  const py = G.player.position.y, ground = d => roadHeight(s + d) - yBase;
  let fov;
  updateGlance(dt);
  const gy = state.cam === 3 ? 0 : glance.yaw, gp = state.cam === 3 ? 0 : glance.pitch;
  if (state.cam !== lastCam) { if (state.cam === 3) cine = null; lastCam = state.cam; }   // a fresh shot each time cinematic is chosen
  if (state.cam === 0) {
    around(cp, 1.2 * Math.cos(gy), cam.dist, yawS + gy); cp.y = Math.max(py, ground(-cam.dist)) + cam.height + gp * cam.dist * .8;
    around(look, 0, -9 * Math.cos(gy), yawS + gy * .15); look.y = Math.max(py, ground(9)) + 1.15 - gp * 2;
    if (Math.abs(gy) > .05) { look.copy(G.player.position); look.y += 1.1; }   // glancing: keep the vehicle in the middle
    fov = 50 + state.speed * .16;
  } else if (state.cam === 1) {
    around(cp, state.ride === 'coach' ? -.6 : 0, state.ride === 'coach' ? -4.0 : -.1, G.player.rotation.y); cp.y = py + cam.eye;
    around(look, 0, -60, yawS + gy); look.y = ground(60) + 1.4 - gp * 60;
    fov = 65 + state.speed * .25;
  } else if (state.cam === 2) {
    around(cp, -10 - cam.dist * .3, 10 + cam.dist * .3, yawS + gy); cp.y = Math.max(py, ground(-10)) + 5.8 + gp * 8;
    around(look, 0, -16, yawS); look.y = ground(16);
    fov = 50 + state.speed * .1;
  } else fov = cinematic(dt, base, yBase);
  if (G.photo) {   // photo mode: orbit around the vehicle
    const P = G.player.position, c = Math.cos(photoCam.pitch);
    cp.set(P.x + Math.sin(photoCam.yaw) * c * photoCam.dist, P.y + 1 + Math.sin(photoCam.pitch) * photoCam.dist, P.z + Math.cos(photoCam.yaw) * c * photoCam.dist);
    { const S = s - cp.z, gh = groundAtX(S, cp.x + base, terrainParams(S)) - yBase + .8; if (cp.y < gh) cp.y = gh; }   // not inside a hill
    look.set(P.x, P.y + 1, P.z); fov = 45;
    camera.position.copy(cp); camera.lookAt(look); camera.fov = fov; camera.updateProjectionMatrix(); skyDome.position.copy(camera.position); return;
  }
  if (debugView) { camera.position.copy(debugView.p); camera.lookAt(debugView.t); }
  else {
    if (state.cam === 3) camera.position.copy(cp); else camera.position.lerp(cp, 1 - Math.exp(-dt * (state.cam === 1 ? 20 : glance.held || Math.abs(glance.yaw) > .05 ? 9 : 3)));
    // never inside a hillside: on a cutting or a slope, the chase and side cameras rise above the ground
    if (state.cam !== 1) { const S = s - camera.position.z, gh = groundAtX(S, camera.position.x + base, terrainParams(S)) - yBase + .8; if (camera.position.y < gh) camera.position.y = gh; }
    camera.lookAt(look);
  }
  camera.fov = state.cam === 3 && !debugView ? fov : lerp(camera.fov, fov, Math.min(1, dt * 2)); camera.updateProjectionMatrix();
  skyDome.position.copy(camera.position);
}

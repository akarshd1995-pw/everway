// The player's vehicle and the traffic around it. Everything is placed through the road service:
// sideways position square to the road, height on the (banked) surface, heading, pitch on hills.
import * as T from '../three.module.js';
import {animateVehicle} from '../vehicles.js';
import {scene, camera} from './render.js';
import {canvasTexture} from './textures.js';
import {lerp, vnoise, smooth} from './core.js';
import {G,state} from './state.js';
import {ROAD,roadBank,roadCos,roadGrade,roadSurface,roadX,roadYaw,sideX} from './road.js';
import {traffic} from './actors.js';
import {handling, resetVehicle, impact} from './physics.js';
import {roadCurvature} from './road.js';
import {hash2} from './core.js';
import {villageNear} from './chunks.js';
import {stopFor, laneFor} from './events.js';
import {biomeAt} from './biomes.js';
import {currentFork, branchAt} from './fork.js';

const susp = {h: 0, vh: 0, p: 0, vp: 0, r: 0, vr: 0, landed: false};
export function updatePlayer(dt, run, keys, yBase) {
  const p = G.player, s = state.distance, h = handling();
  if (state.side === undefined) resetVehicle(state.speed);
  if (!run && !state.airborne) state.y = roadSurface(s, state.side);   // stay on the road while paused or rebuilt
  p.rotation.order = 'YXZ';
  // bumps off the tarmac, a jolt on landing or hitting a barrier
  // suspension: the body rides on springs. It squats when you accelerate, dives when you brake, leans
  // out in bends, bounces over rough ground and compresses when it lands.
  const S = susp, k = h.lean ? 0 : 1, soft = state.ride === 'coach' ? 1.5 : state.ride === 'car' ? (h.soft || 1) : .6, v = state.speed;
  // some stretches of road are worn and patched: a busier ride, and the odd pothole or sunken patch to thud over
  const rough = G.roughRoad = smooth(vnoise(s * .004 + 3, 7.7), .58, .82);
  const surf = state.airborne ? 0 : state.offroad > 0 ? 1 : Math.abs(state.side) > ROAD.half - .3 ? .45 : .06 + rough * .28 + (G.trip ? .1 : 0);
  { const cell = Math.floor(s / 19); if (cell !== S.cell) { S.cell = cell; if (run && !state.airborne && v > 4 && state.offroad <= 0 && hash2(cell, 5) < .015 + rough * .14) { const k2 = Math.min(1, v / 22) * (state.ride === 'coach' ? .6 : 1); S.vh -= (.5 + rough * .6) * k2; S.vp += .25 * k2; G.thump = (.035 + rough * .05) * k2; } } }
  const bump = surf * Math.min(1, v / 12) * (Math.sin(G.elapsed * 17.3 + s * .7) * .6 + Math.sin(G.elapsed * 29.1 + s * 1.3) * .4);
  const land = state.hit > .5 && !S.landed ? (S.landed = true, -state.hit * .12) : (state.hit < .2 ? (S.landed = false, 0) : 0);
  const fz = (bump * .05 - S.h) * 180 - S.vh * 16, fp = ((state.lon || 0) * .0075 * soft * k - S.p) * 110 - S.vp * 14, fr = ((state.lat || 0) * .009 * soft * k - S.r) * 95 - S.vr * 12;
  S.vh += (fz + land * 60) * dt; S.h += S.vh * dt; S.vp += fp * dt; S.p += S.vp * dt; S.vr += fr * dt; S.r += S.vr * dt;
  S.h = Math.max(-.15, Math.min(.15, S.h)); S.p = Math.max(-.08, Math.min(.08, S.p)); S.r = Math.max(-.09, Math.min(.09, S.r));
  p.position.set(sideX(s, state.side), state.y - yBase + .03 + S.h, 0);
  p.rotation.y = roadYaw(s) - state.psi;
  // body pitch: the slope, plus a nod when braking or accelerating; roll: the bank, plus body roll or lean
  const pitchTarget = Math.atan(roadGrade(s) * roadCos(s)) + S.p + state.hit * .03;
  const rollTarget = (Math.abs(state.side) < ROAD.half + 2 ? roadBank(s) : 0) +
    (h.lean ? -Math.atan(state.lat / 9.81) * .9 : state.lat * h.roll * .1 + S.r);
  p.rotation.x = lerp(p.rotation.x, pitchTarget, 1 - Math.exp(-dt * 6));
  state.roll = lerp(state.roll || 0, rollTarget, 1 - Math.exp(-dt * (h.lean ? 5 : 7)));
  p.rotation.z = state.roll;
  // from the coach driver's seat, hide the outside of the body so the cab and the road show
  if (state.ride === 'car') { const inside = state.cam === 1 && !G.photo; if (p.userData.inside !== inside) { p.userData.inside = inside; p.visible = !inside; } }
  if (p.userData.exterior) { const inside = state.cam === 1; if (p.userData.inside !== inside) { p.userData.inside = inside; for (const m of p.userData.exterior) if (!m.isGroup) m.visible = !inside; } }
  animateVehicle(p, state.speed, dt, -state.delta * 1.6, run);
}

/** Moves traffic, keeps it in a window around the player and returns true if the player is too close to a car. */
/** How many of the vehicles are on the road for each traffic setting. */
export const TRAFFIC = {none: 0, light: 6, busy: 17};
export function updateTraffic(dt, run, base, yBase) {
  let nearMiss = false, lead = null, opp = null;
  const h = handling(), pside = state.side ?? ROAD.lane;
  const count = G.trip ? 0 : TRAFFIC[state.traffic] ?? 6;   // no traffic down a side road
  for (let i = 0; i < traffic.length; i++) {
    const car = traffic[i], u = car.userData;
    car.visible = u.kind === 'cycle' ? count > 0 && !['desert', 'planet', 'snow'].includes(biomeAt(u.s)) : i < count || u.mode === 'turnoff';
    if (!car.visible) continue;
    if (!u.ind && u.kind !== 'cycle') u.ind = indicators(car);
    const home = (u.direction === 1 ? 1 : -1) * (u.kind === 'cycle' ? ROAD.half - .8 : ROAD.lane);
    if (u.lat === undefined) { u.lat = home; u.want = home; u.mode = 'drive'; u.t = 0; u.sig = 0; }
    if (run) {
      u.t += dt;
      // the vehicle ahead in the same direction and lane
      let ahead = null;
      for (let j = 0; j < traffic.length; j++) {
        const o = traffic[j], ou = o.userData;
        if (o === car || !o.visible || ou.direction !== u.direction || Math.abs((ou.lat ?? 0) - u.lat) > 2) continue;
        const gap = (ou.s - u.s) * u.direction - (u.len + ou.len) / 2;
        if (gap > -1 && (!ahead || gap < ahead.gap)) ahead = {gap, v: ou.speed * (ou.mode === 'stop' ? 0 : 1), o: ou};
      }
      if (u.direction === 1 && state.distance > u.s && Math.abs(pside - u.lat) < 1.8) { const gap = state.distance - u.s - (u.len + h.length) / 2; if (!ahead || gap < ahead.gap) ahead = {gap, v: state.speed}; }
      let target = u.speed;
      // someone coming the other way in this lane (overtaking): slow down and keep well over to the verge
      const facing = u.direction === -1 ? (u.s - state.distance) : -1;
      if (facing > 0 && facing < 220 && Math.abs(pside - u.lat) < 2.6) { target = Math.min(target, u.speed * (facing < 90 ? .45 : .7)); if (u.mode === 'drive') u.want = home - .9; u.yield = 2; }
      else if (u.yield > 0) { u.yield -= dt; if (u.yield <= 0 && u.mode === 'drive' && !u.passOf) u.want = home; }
      // a tractor turning off into a field: slows, signals, then leaves the road through a gate
      if (u.mode === 'turnoff') {
        target = u.t > 9 ? 3 : 6; if (u.t > 6) u.sig = u.turnSide;
        if (u.t > 11) u.want = u.turnSide * (ROAD.half + 14);
        if (Math.abs(u.lat) > ROAD.half + 11) { u.mode = 'gone'; respawn(u, state.distance + 900); }
      }
      // a slow tractor pulls in to let you by when you have been stuck behind it for a while
      if (u.kind === 'tractor' && u.mode === 'drive' && u.direction === 1) {
        const gap = (state.distance - u.s);
        if (gap < 0 && gap > -35 && Math.abs(pside - u.lat) < 2 && state.speed < u.speed + 2) u.behind = (u.behind || 0) + dt; else u.behind = 0;
        if (u.behind > 5) { u.mode = 'pull'; u.stopAt = u.s + 35; u.want = ROAD.half + .9; u.sig = 1; u.stopFor = 7; u.stopped = true; u.behind = 0; G.courtesy = {until: G.elapsed + 25, u}; }
      }
      // events on the road: stop where they say, and use the open lane past roadworks
      const stopAt = stopFor(u.direction, u.s);
      if (stopAt !== null) target = Math.min(target, Math.max(0, (stopAt - u.s) * u.direction * .6));
      const lane = laneFor(u.direction, u.s); if (lane !== null && u.mode === 'drive') u.want = lane; else if (lane === null && u.mode === 'drive' && Math.abs(u.want - home) > .1 && !u.passOf) u.want = home;
      // overtaking: stuck behind something slow on a straight with the other lane clear for a good way
      if (u.mode === 'drive' && u.kind !== 'tractor' && u.kind !== 'cycle' && u.kind !== 'bus' && ahead && ahead.gap < (u.kind === 'motorbike' ? 40 : 25) && ahead.v < u.speed - 3) {
        u.stuck = (u.stuck || 0) + dt;
        if (u.stuck > 2.5 && Math.abs(roadCurvature(u.s + u.direction * 120)) < .0025 && Math.abs(roadCurvature(u.s + u.direction * 240)) < .0025 && clearFor(u, 480)) { u.mode = 'pass'; u.want = -home; u.sig = -Math.sign(home); u.passOf = ahead.o || null; u.stuck = 0; }
      } else u.stuck = 0;
      if (u.mode === 'pass') {
        target = u.speed * 1.25;
        const by = u.passOf ? (u.s - u.passOf.s) * u.direction : 30;
        if (by > (u.len + 12) || u.t > 25) { u.mode = 'back'; u.want = home; u.sig = Math.sign(home); u.t = 0; }
        // something coming: drop back behind the slow vehicle if not yet alongside
        else if (by < -(u.len + 1) && !clearFor(u, 160)) { u.mode = 'back'; u.want = home; u.sig = Math.sign(home); u.t = 0; target = u.passOf ? u.passOf.speed * .8 : u.speed * .6; }
      } else if (u.mode === 'back') { if (Math.abs(u.lat - home) < .2) { u.mode = 'drive'; u.sig = 0; } }
      else if (u.mode === 'stop') {   // parked by a village shop or the petrol station for a little while
        target = 0;
        if (u.t > u.stopFor) { u.mode = 'leave'; u.want = home; u.sig = -Math.sign(home); u.t = 0; }
      } else if (u.mode === 'leave') { target = u.speed * .6; if (Math.abs(u.lat - home) < .2) { u.mode = 'drive'; u.sig = 0; } }
      else if (u.mode === 'pull') { target = Math.max(0, Math.min(u.speed, (u.stopAt - u.s) * u.direction * .8)); if ((u.stopAt - u.s) * u.direction < 1.5) { u.mode = 'stop'; u.t = 0; u.sig = u.kind === 'bus' ? 0 : 2; } }
      // a few cars stop in villages
      if (u.mode === 'drive' && u.direction === 1 && (u.kind === 'car' || u.kind === 'bus' || u.kind === 'classic') && !u.stopped) {
        const v = villageNear(u.s + 60), bus = u.kind === 'bus';
        if (v && Math.abs(u.s + 60 - v.stop) < 3 && (bus || hash2(i, Math.floor(v.stop)) < .4)) { u.mode = 'pull'; u.stopAt = v.stop; u.want = ROAD.half + (bus ? 1.4 : .9); u.sig = 1; u.stopFor = bus ? 14 + hash2(i, 5) * 8 : 8 + hash2(i, 9) * 10; u.stopped = true; }
        // turning in at a house in the village: indicate, slow down, turn off the road
        else if (!bus && v && Math.abs(u.s - v.vc) < 50 && u.s - state.distance > 40 && u.s - state.distance < 260 && hash2(i, Math.floor(u.s / 40)) < .025) { u.mode = 'turnoff'; u.t = 3; u.turnSide = 1; u.stopped = true; }
        // pulling into a lay-by on the open road for a while (hazard lights on)
        else if (!bus && !v && u.s - state.distance > 60 && u.s - state.distance < 400 && hash2(i, Math.floor(u.s / 25)) < .006 && Math.abs(roadCurvature(u.s + 40)) < .003) { u.mode = 'pull'; u.stopAt = u.s + 45; u.want = ROAD.half + 1.6; u.sig = 1; u.stopFor = 10 + hash2(i, 3) * 14; u.stopped = true; u.hazard = true; }
      }
      // keep a safe gap behind whatever is ahead
      if (ahead && u.mode !== 'pass' && u.mode !== 'turnoff') target = Math.min(target, Math.max(0, ahead.v + (ahead.gap - 8) * .5));
      u.cur = (u.cur ?? u.speed) + Math.max(-6 * dt, Math.min(3 * dt, target - (u.cur ?? u.speed)));
      u.s += u.cur * u.direction * dt * roadCos(u.s);
      u.lat += Math.max(-1.4 * dt, Math.min(1.4 * dt, u.want - u.lat));   // lane changes take a couple of seconds
      animateVehicle(car, u.cur, dt, 0, true);
      // indicators
      if (u.ind) { const on = u.sig && (G.elapsed * 1.4 % 1) < .55; for (const sp of u.ind) sp.visible = on && (u.sig === 2 || sp.userData.side * (u.direction === 1 ? 1 : -1) === u.sig); }
    }
    if (u.s - state.distance < -110) respawn(u, state.distance + 700 + Math.random() * 400);
    if (u.s - state.distance > 1350) respawn(u, state.distance - 100 - Math.random() * 50);
    const side = u.lat;
    car.rotation.order = 'YXZ';
    // at a fork, some vehicles take the other road
    const off = forkOffset(u);
    car.position.set(roadX(u.s) - base + sideX(u.s, side + off.lat), (off.y ?? roadSurface(u.s, side)) - yBase + .03, -(u.s - state.distance));
    car.rotation.y = roadYaw(u.s) + (u.direction === -1 ? Math.PI : 0) - off.yaw - (u.lat - (u.prevLat ?? u.lat)) / Math.max(dt, .001) / Math.max(u.cur || 1, 1) * u.direction * .8;
    u.prevLat = u.lat;
    car.rotation.x = Math.atan(roadGrade(u.s) * roadCos(u.s) * u.direction);
    car.rotation.z = roadBank(u.s) * u.direction;
    // the car ahead in our lane (autodrive keeps its distance), and collisions with any car
    const along = (u.s - state.distance) / roadCos(state.distance);
    if (!off.gone && along > 0 && Math.abs(side - pside) < 2.2 && (!lead || along - (h.length + u.len) / 2 < lead.gap)) lead = {gap: along - (h.length + u.len) / 2, v: run ? (u.cur ?? u.speed) * u.direction : 0, u};
    // the nearest vehicle ahead in the other lane, and how fast it is coming towards us (for overtaking)
    if (!off.gone && along > -(h.length + u.len) / 2 - 2 && side < 0 && (!opp || along < opp.gap)) opp = {gap: along - (h.length + u.len) / 2, v: run ? -(u.cur ?? u.speed) * u.direction : 0, u};
    if (run && !off.gone && !state.crashed && !nearMiss && Math.abs(along) < (h.length + u.len) / 2 && Math.abs(side - pside) < h.width + .95) {
      // closing speed decides: a nudge dents, a real collision totals
      const theirs = u.direction * (u.cur ?? u.speed), rel = Math.abs(state.speed - theirs);
      nearMiss = impact(rel, 'car') || 'knock';
      if (nearMiss === 'knock') { state.speed = Math.max(0, Math.min(state.speed, theirs) * .7); state.side += Math.sign(pside - side || 1) * .6; }
    }
  }
  state.lead = lead; state.opp = opp;
  return nearMiss;
}

/** Four small amber lamps on the corners of a traffic vehicle (they blink when it changes lane or stops). */
const amberM = new T.SpriteMaterial({map: glowTex(), color: '#ffa22a', transparent: true, depthWrite: false, blending: T.AdditiveBlending});
function glowTex() { return canvasTexture(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(.35, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }); }
function indicators(car) {
  const u = car.userData, L = (u.len || 4.4) / 2, W = u.kind === 'lorry' || u.kind === 'bus' ? 1.27 : u.kind === 'van' || u.kind === 'caravan' ? 1.02 : u.kind === 'tractor' ? .9 : u.kind === 'motorbike' ? .3 : .82, out = [];
  for (const [x, z] of [[-W, L - .1], [W, L - .1], [-W, -L + .1], [W, -L + .1]]) { const sp = new T.Sprite(amberM); sp.position.set(x, .85, u.kind === 'caravan' ? z * .45 : z); sp.scale.setScalar(.5); sp.visible = false; sp.userData.side = Math.sign(x); car.add(sp); out.push(sp); }
  return out;
}
/** No vehicle coming the other way for `len` metres (and the player not there either). */
function clearFor(u, len) {
  for (const o of traffic) { const ou = o.userData; if (!o.visible || o.userData === u) continue;
    const d = (ou.s - u.s) * u.direction; if (d > -10 && d < len && Math.sign(ou.lat ?? ou.direction) !== Math.sign(u.lat)) return false; }
  const dp = (state.distance - u.s) * u.direction; if (dp > -10 && dp < len && Math.sign(state.side ?? 1) !== Math.sign(u.lat)) return false;
  return true;
}
function respawn(u, s) { if (u.group) { if (!G.cycGroup || G.elapsed - G.cycGroup.t > 6) G.cycGroup = {t: G.elapsed, s}; s = G.cycGroup.s + u.gi * 2.6; } u.s = s; u.lat = (u.direction === 1 ? 1 : -1) * (u.kind === 'cycle' ? ROAD.half - .8 : ROAD.lane); u.want = u.lat; u.mode = 'drive'; u.sig = 0; u.stopped = false; u.turn = undefined; u.cur = u.speed; }
/** At a fork a vehicle may follow the other road: an offset from our road, and whether it has gone. */
const _off = {lat: 0, yaw: 0, y: undefined, gone: false};
function forkOffset(u) {
  _off.lat = 0; _off.yaw = 0; _off.y = undefined; _off.gone = false;
  const f = currentFork(); if (!f || u.direction !== 1) return _off;
  const t = u.s - f.sj;
  if (t < -5 || t > 330) { if (t < -5) u.turn = undefined; return _off; }
  if (u.turn === undefined) u.turn = hash2(Math.floor(u.s * 7), f.L) < .45;
  if (!u.turn) return _off;
  const b = branchAt(t); if (!b) return _off;
  _off.lat = b.lat - u.lat + (u.lat > 0 ? ROAD.lane : -ROAD.lane) * .0; _off.yaw = b.yaw; _off.y = b.y; _off.gone = t > 25;
  if (t > 300) u.s = state.distance + 900;   // out of sight: back into the traffic far ahead
  return _off;
}

/** Head and tail lamp glows on at night. */
// a lamp's glow is only seen from the side it shines to: headlamps from in front, tail lamps from behind
const _cl = new T.Vector3();
function lampGlows(v, on) {
  const g = v.userData.glows; if (!g || !g.length) return;
  v.updateMatrixWorld(); _cl.copy(camera.position); v.worldToLocal(_cl);
  for (const s of g) { const facing = s.position.z < 0 ? _cl.z < s.position.z + .3 : _cl.z > s.position.z - .3; s.visible = (on || !!s.userData.flashOn) && facing; }
}
export function updateLamps(on) {
  lampGlows(G.player, on);
  for (let i = 0; i < traffic.length; i++) if (traffic[i].visible) lampGlows(traffic[i], on);
}

/* ---- smoke from a damaged vehicle: a small pool of soft grey puffs that rise and fade */
const smokeTex = canvasTexture(64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(90,90,90,.9)'); g.addColorStop(1, 'rgba(90,90,90,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
const puffs = [];
for (let i = 0; i < 28; i++) { const sp = new T.Sprite(new T.SpriteMaterial({map: smokeTex, transparent: true, depthWrite: false, opacity: 0})); sp.visible = false; sp.userData.life = 0; scene.add(sp); puffs.push(sp); }
let smokeTimer = 0, nextPuff = 0;
export function updateSmoke(dt) {
  const dmg = state.damage || 0, P = G.player.position, th = G.player.rotation.y, len = handling().length;
  smokeTimer -= dt;
  if (dmg > .3 && smokeTimer <= 0) {
    smokeTimer = .25 - dmg * .18;
    const sp = puffs[nextPuff++ % puffs.length], fx = -Math.sin(th), fz = -Math.cos(th);
    sp.position.set(P.x + fx * len * .38, P.y + 1, P.z + fz * len * .38); sp.userData.life = 1; sp.visible = true;
    sp.material.color.setScalar(dmg > .7 ? .35 : .75);
  }
  for (const sp of puffs) { if (!sp.visible) continue; const u = sp.userData; u.life -= dt * .45;
    if (u.life <= 0) { sp.visible = false; continue; }
    sp.position.y += dt * 1.6; sp.position.z += dt * state.speed * .85; sp.scale.setScalar(.8 + (1 - u.life) * 3.2); sp.material.opacity = u.life * .55; }
}

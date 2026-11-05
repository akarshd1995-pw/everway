// Light driving physics of our own, in the road's frame (like the reference: no general physics engine).
// The vehicle is a point with a heading relative to the road (psi), a sideways position square to
// the road (side), a speed along its heading, and a height that follows the ground or flies.
// Steering uses a simple bicycle model with a grip limit; the only things you can hit are the
// barriers beside the road, found by distance from the centre line. Leaving the road is allowed.
import {clamp, lerp} from './core.js';
import {G, state} from './state.js';
import {ROAD, roadCos, roadCurvature, roadGrade, roadSurface} from './road.js';
import {terrainParams} from './biomes.js';
import {groundHeight, SEA_LEVEL, barrierAt} from './terrain.js';
import {forObstaclesNear} from './obstacles.js';
import {CH, biomeAt} from './biomes.js';
import {hash2} from './core.js';

const g = 9.81;
/** Handling for each ride. Speeds in m/s, accelerations in m/s². */
export const HANDLING = {
  car:   {length: 4.6, label: 'Car',  accel: 3.8, brake: 8.5, top: 46, wheelbase: 2.4, grip: 1.0,  steer: .55, steerSpeed: 9,  roll: .045, lean: false, width: .95, cam: {dist: 8.5, height: 3.3, eye: 1.82}},
  bike:  {length: 2.2, label: 'Motorbike', accel: 4.8, brake: 9.5, top: 44, wheelbase: 1.45, grip: 1.05, steer: .5, steerSpeed: 11, roll: 0,    lean: true,  width: .45, cam: {dist: 6.5, height: 2.6, eye: 2.1}},
  coach: {length: 11.4, label: 'Coach',     accel: 1.5, brake: 5.5, top: 29, wheelbase: 6.2, grip: .8,   steer: .62, steerSpeed: 7,  roll: .07,  lean: false, width: 1.3, cam: {dist: 17, height: 5.6, eye: 2.55}},
  cycle: {length: 1.9, label: 'Bicycle',   accel: 1.3, brake: 5,   top: 12, wheelbase: 1.05, grip: .9,  steer: .55, steerSpeed: 10, roll: 0,    lean: true,  width: .4,  cam: {dist: 5.5, height: 2.4, eye: 2.1}},
};
export const handling = () => HANDLING[state.ride] || HANDLING.car;
/** Gear change speeds (m/s) per ride; the bicycle has none. */
export const GEARS = {car: [0, 9, 16, 24, 33, 47], bike: [0, 8, 15, 23, 32, 45], coach: [0, 5, 10, 16, 22, 30]};
/** Automatic gearbox: sets state.gear and state.rev (0..1 within the gear). */
function gearbox(v) {
  const g = GEARS[state.ride];
  if (!g) { state.gear = 0; state.rev = 0; return; }
  let gear = 1; while (gear < g.length - 1 && v > g[gear]) gear++;
  const lo = g[gear - 1], hi = g[gear];
  state.gear = gear; state.rev = Math.min(1, Math.max(0, (v - lo) / Math.max(1, hi - lo)));
}

/** Steering input from the keyboard / touch buttons: -1 left … 1 right. */
export const steerInput = keys => (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);

// Vehicle state lives on `state` so the rest of the game can read it.
export function resetVehicle(speed = state.speed) {
  state.side = ROAD.lane; state.psi = 0; state.delta = 0; state.speed = speed;
  state.y = roadSurface(state.distance, state.side); state.vy = 0; state.airborne = false;
  state.lat = 0; state.lon = 0; state.slip = 0; state.offroad = 0; state.hit = 0; state.crashed = null; state.lead = null;
  if (speed === 0 || state.damage === undefined) state.damage = 0;   // a fresh vehicle at the start of a journey
}

/** Grip available now: wet and snowy roads are slippery. */
function gripNow(h) {
  const w = G.weatherNow, s = state.distance, side = Math.abs(state.side ?? 0);
  // the surface: tarmac, loose gravel on the shoulder, grass off the road, and now and then a patch of ice in winter
  const surface = state.offroad > 0 ? .68 : side > ROAD.half - .2 ? .82 : 1;
  const cold = w === 'snowy' || state.season === 'winter' || biomeAt(s) === 'snow';
  const ice = cold && hash2(Math.floor(s / 35), 41) < .1 ? .55 : 1;
  state.ice = ice < 1;
  return h.grip * (w === 'rainy' ? .72 : cold ? .55 : 1) * surface * ice;
}

/** Autodrive: follow the lane, slow for bends ahead. Returns {steer angle, throttle, brake}. */
const auto = {delta: 0, throttle: 0, brake: 0};
function autodrive(h, v) {
  const s = state.distance;
  // the sharpest bend in the next stretch sets a comfortable speed for it
  let kmax = 0;
  for (let d = 10; d <= 40 + v * 4; d += 10) kmax = Math.max(kmax, Math.abs(roadCurvature(s + d)));
  const comfort = (state.ride === 'coach' ? 1.6 : 2.6) * Math.min(1, gripNow(h));
  let want = Math.min(state.target / 3.6, h.top, kmax > 1e-4 ? Math.sqrt(comfort / kmax) : Infinity);
  // a vehicle ahead in our lane: keep about two seconds behind it
  // at the end of a side road, come to a gentle stop
  if (G.trip) want = Math.min(want, Math.sqrt(Math.max(0, 2 * 1.4 * (G.trip.end - 8 - s))));
  const L = state.lead;
  if (L) { const safe = 8 + h.length + v * 1.8, follow = L.v + (L.gap - safe) * .35; want = Math.min(want, Math.max(0, follow)); }
  const dv = want - v;
  auto.throttle = clamp(dv * .6, 0, 1); auto.brake = clamp(-dv * .35, 0, 1);
  // pure pursuit towards the lane centre a little way ahead, plus the road's own curvature
  const Ld = 7 + v * .55, e = ROAD.lane - state.side;
  const alpha = Math.atan2(e, Ld) - state.psi;
  auto.delta = Math.atan(2 * h.wheelbase * Math.sin(alpha) / Ld) + Math.atan(h.wheelbase * roadCurvature(s + Ld * .5));
  return auto;
}

let Pcache = null, Ps = -1e9;
const paramsAt = s => { if (Math.abs(s - Ps) > 8) { Pcache = terrainParams(s); Ps = s; } return Pcache; };

/** One frame of driving. Returns an event name when something notable happened ('barrier', 'sea'). */
export function drive(dt, keys) {
  if (state.side === undefined) resetVehicle();
  const h = handling();
  let event = null;
  for (let step = 0, n = dt > .034 ? 2 : 1, d = dt / n; step < n; step++) event = stepOnce(d, keys, h) || event;
  return event;
}

function stepOnce(dt, keys, h) {
  const s = state.distance, v = state.speed;
  const prevSide = state.side, prevDist = state.distance;
  // ---- controls
  let delta, throttle, brake;
  if (state.crashed) { state.speed = 0; return null; }
  if (state.mode === 'cruise') {
    const a = autodrive(h, v); delta = a.delta; throttle = a.throttle; brake = a.brake;
  } else {
    const maxSteer = h.steer / (1 + v / h.steerSpeed);           // steering gets gentler with speed
    const pad = state.pad, tc = state.touch;
    delta = clamp(steerInput(keys) + (pad ? pad.steer : 0) + (tc ? tc.steer : 0), -1, 1) * maxSteer;
    throttle = Math.max(keys.ArrowUp || keys.w ? 1 : 0, pad ? pad.throttle : 0, tc ? tc.throttle : 0); brake = Math.max(keys.ArrowDown || keys.s ? 1 : 0, pad ? pad.brake : 0, tc ? tc.brake : 0);
  }
  state.delta = lerp(state.delta, clamp(delta, -h.steer, h.steer), 1 - Math.exp(-dt * 8));

  // ---- longitudinal
  const offroad = Math.max(0, Math.abs(state.side) - (ROAD.half + 1.6));
  state.offroad = offroad;
  const grade = roadGrade(s) * roadCos(s) * Math.cos(state.psi);
  let a = h.accel * throttle * (1 - v / (h.top * 1.05)) - h.brake * brake * Math.sign(v)
        - .00042 * v * v * (state.ride === 'coach' ? 2.2 : 1) - .12 - (offroad > 0 ? 1.6 + v * .05 : 0)
        - g * grade * .7;
  if (state.airborne) a = 0;
  const v2 = Math.max(0, v + a * dt);
  state.lon = (v2 - v) / dt; state.speed = v2; gearbox(v2);

  // ---- turning with a grip limit
  const grip = gripNow(h) * g;
  let yaw = state.airborne ? 0 : v2 * Math.tan(state.delta) / h.wheelbase;
  const yawMax = grip / Math.max(v2, 1) * (1 + clamp(-(state.lon || 0) / 22, -.12, .16));
  state.slip = Math.max(0, Math.abs(yaw) / yawMax - .85);          // how close to sliding (for tyre noise)
  yaw = clamp(yaw, -yawMax, yawMax);
  state.lat = v2 * yaw;
  const k = roadCurvature(s), arcFactor = 1 / Math.max(.2, 1 - k * state.side);
  const dArc = v2 * Math.cos(state.psi) * arcFactor * dt;
  state.psi += (yaw - k * v2 * Math.cos(state.psi) * arcFactor) * dt;
  state.psi = clamp(state.psi, -1.3, 1.3);
  state.side += v2 * Math.sin(state.psi) * dt;
  state.distance += dArc * roadCos(s);
  state.odometer += v2 * dt;

  // ---- barriers: the only things to hit, checked by distance from the centre line
  let event = null;
  const sign = Math.sign(state.side) || 1, bx = ROAD.half + 1.05, edge = bx - h.width;
  if (Math.abs(state.side) > edge && Math.abs(state.side) < bx + 1.5 && barrierAt(state.distance, sign)) {
    state.side = sign * edge;
    if (state.psi * sign > 0) {                     // only a real knock when heading into it
      const into = Math.sin(Math.abs(state.psi)) * state.speed;
      state.psi = -sign * Math.min(.08, Math.abs(state.psi) * .3); state.speed *= 1 - Math.min(.35, into * .04);
      if (into > 1) { const r = impact(into, 'barrier'); if (r) return r; event = 'knock'; }
    }
  }

  // ---- height: follow the ground, or fly off a crest
  const ground = Math.abs(state.side) < ROAD.half + 2 ? roadSurface(state.distance, state.side) : groundHeight(state.distance, state.side, paramsAt(state.distance));
  if (state.airborne || state.y - ground > .25) {
    state.airborne = true; state.vy -= g * dt; state.y += state.vy * dt;
    if (state.y <= ground) { state.y = ground; state.airborne = false; state.hit = Math.min(1, -state.vy / 8); state.vy = 0; }
  } else {
    state.vy = (ground - state.y) / dt; state.y = ground;
    if (state.vy > 0) state.vy = Math.min(state.vy, 6);
  }

  // ---- anything beside the road: trees, rocks, houses, poles, walls, hedges, fences, signs
  if (Math.abs(state.side) > ROAD.half + .5 && state.speed > 1) {
    const half = h.length / 2, sz = state.distance, cs = roadCos(sz);
    let hitWhat = null;
    forObstaclesNear(sz, CH, (os, oside, r) => {
      if (hitWhat) return;
      const along = (os - sz) / cs, dx = oside - state.side, c = Math.cos(state.psi), sn = Math.sin(state.psi);
      const u = Math.abs(along * c + dx * sn), w = Math.abs(-along * sn + dx * c);   // in the vehicle's own frame
      if (Math.hypot(Math.max(0, w - h.width), Math.max(0, u - half)) < r) hitWhat = {r};
    });
    if (hitWhat) {
      // bounce back off it: speed into the obstacle is the impact
      const r = impact(state.speed * (hitWhat.r < .35 ? .6 : 1), 'scenery'); if (r) return r;
      state.side = prevSide; state.distance = prevDist; state.speed *= .15; state.psi *= -.4; event = 'knock';
    }
  }
  // ---- the end of a side road: the lane stops here
  if (G.trip && state.distance > G.trip.end - 2) { state.distance = G.trip.end - 2; state.speed = Math.min(state.speed, .5); }
  // ---- into the sea
  if (state.y < SEA_LEVEL + .2) return crash('sea');
  // wandered far from the road: bring the vehicle back
  if (Math.abs(state.side) > 380) { resetVehicle(8); event = 'back'; }
  state.hit = Math.max(0, state.hit - dt * 2);
  return event;
}

/** The vehicle is totalled: it stops where it is. The game takes the player back to the menu. */
export const TOTAL_SPEED = 7;   // m/s (about 25 km/h): anything harder than this totals the vehicle
/** A knock: small ones dent the vehicle, a hard one (or one too many) totals it. */
export function impact(speed, what) {
  if (speed >= TOTAL_SPEED) return crash(what);
  state.damage = Math.min(1, (state.damage || 0) + .12 + speed / 14); state.hit = Math.min(1, .4 + speed / 8);
  if (state.damage >= 1) return crash(what);
  return null;
}
export function crash(what) {
  state.crashed = what; state.speed = 0; state.hit = 1;
  return 'crash';
}

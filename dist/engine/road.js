// The road service: the one place that knows where the road is.
// The road is planned a few kilometres ahead, a 5 m sample at a time: bends of varying tightness
// joined by smooth transitions, and climbs and descents that follow the land but are smoothed and
// kept within safe gradients. Terrain, scenery, vehicles and the camera all read from here.
//
// Units: s = metres along the journey (the road always heads away from the camera, towards -z, so
// it can never cross itself or turn back). "Sideways" distances are measured square to the road,
// and sideX() turns them into the world-x offset used to place things.
import {fbm, vnoise, clamp, lerp, smooth} from './core.js';
import {state} from './state.js';
import {BIOMES, biomeMix} from './biomes.js';

/** Road difficulty: bend tightness, hill size and steepness, and width. */
export const DIFFICULTY = {
  relaxed: {label: 'Relaxed', straight: .45, radius: [420, 1100], turn: [.25, .7], hills: 16, grade: .05, width: 1},
  normal:  {label: 'Normal',  straight: .3,  radius: [190, 650],  turn: [.3, .95], hills: 28, grade: .075, width: 1},
  twisty:  {label: 'Twisty',  straight: .14, radius: [75, 260],   turn: [.45, 1.25], hills: 40, grade: .1, width: .88},
};
const HILL_SCALE = {fields: 1, town: .45, coast: .75, desert: .7, mountain: 1.7, snow: 1.45, planet: 1.4};
const MAX_HEADING = .7;   // radians from straight ahead (about 40 degrees)
const D = 5;              // metres between plan samples
const START = -600;       // the plan begins a little behind the start line

export const ROAD = {
  half: 6.2,      // half the asphalt width (scaled by difficulty)
  shoulder: 7.7,  // half the width including gravel shoulders
  lane: 2.9,      // centre of each lane from the centre line
};

/* ------------------------------------------------------------------ plan */
let cfg = DIFFICULTY.normal, seed = 1, seedOff = 0;
/** The journey's seed: the same seed gives the same road, land and scenery (journey codes). */
export const roadSeed = () => seed;
export function setSeed(n) { seed = Math.max(1, Math.floor(n) % 2176782335 || 1); seedOff = seed === 1 ? 0 : (seed % 9973) * 41.7; }
let n = 0, cap = 0;
let X, Y, H, K, G;            // x, height, heading, curvature, raw land height at the centre line
let gen;                      // generator state

function grow(need) {
  if (need <= cap) return;
  const c = Math.max(need, cap * 2, 4096), copy = a => { const b = new Float64Array(c); if (a) b.set(a.subarray(0, n)); return b; };
  X = copy(X); Y = copy(Y); H = copy(H); K = copy(K); G = copy(G); cap = c;
}

// A tiny seeded random generator, so the same road is produced every time.
function rng(a) { return () => { a = gen ? gen.rs : a; a |= 0; a = a + 0x6D2B79F5 | 0; if (gen) gen.rs = a; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** Height of the open land (before the road is cut in), at distance s and world x. */
export function landHeight(s, x) {
  const m = biomeMix(s), amp = cfg.hills * lerp(HILL_SCALE[m.a] ?? 1, HILL_SCALE[m.b] ?? 1, m.t);
  return amp * ((fbm(s * .0016 + 11 + seedOff, x * .0016 + 3, 3) - .5) * 2.2 + (fbm(s * .0055 + 5 + seedOff, x * .0055, 2) - .5) * 1.1);
}

/** Start the plan again (new difficulty or scenery). */
/** Changes whenever the road is planned again (caches elsewhere watch it). */
export let roadVersion = 0;
export function resetRoad(difficulty = state.difficulty || 'normal') {
  roadVersion++;
  cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  ROAD.half = 6.2 * cfg.width; ROAD.lane = 2.9 * cfg.width;
  n = 0;
  gen = null; const seed0 = seed * 9973 + Object.keys(DIFFICULTY).indexOf(difficulty);
  gen = {r: rng(seed0), rs: seed0, x: 0, th: 0, k: 0, kt: 0, left: 300, y: null, g: 0, ny: 0};
  extend(START + 4000);
  ghost = null;
  // the turns already taken at forks on this journey, in order (the same choices give the same road)
  for (const sw of state.roadSwitches || []) switchRoad(sw.sj, sw.side, sw.key, true);
}

/* ------------------------------------------------------------ forks: switching the plan */
// At a fork the road you take becomes the plan from there on: the plan is cut at the fork and
// continues with a bend towards that side and a new run of bends and hills of its own. The road
// you did not take is kept (the "ghost") so it can still be drawn curving away.
let ghost = null;
function snapshot() { const c = A => Float64Array.from(A.subarray(0, n)); return {X: c(X), Y: c(Y), H: c(H), K: c(K), G: c(G), n, gen: {...gen}}; }
function restorePlan(p) {
  grow(p.n + 2); X.set(p.X); Y.set(p.Y); H.set(p.H); K.set(p.K); G.set(p.G); n = p.n; gen = {...p.gen}; gen.r = rng(gen.rs); roadVersion++;
}
/** Take the road towards `side` (-1 left, 1 right) at distance sj. `key` makes the new road repeatable.
 * Returns the plan that was left (to go back to it after a side trip). */
export function switchRoad(sj, side, key = 1, quiet = false) {
  extend(sj + 4000);
  const old = snapshot(), j = Math.max(3, Math.round((sj - START) / D));
  ghost = {...old, sj};
  n = j + 1; gen.ny = Math.min(gen.ny, j + 1);
  gen.x = X[j]; gen.th = H[j]; gen.k = K[j]; gen.y = Y[gen.ny - 1]; gen.g = (Y[gen.ny - 1] - Y[gen.ny - 2]) / D;
  gen.rs = (seed * 7919 + key * 104729) | 0; gen.r = rng(gen.rs);
  // a bend towards the chosen side, as much as the heading limit allows
  const room = side > 0 ? MAX_HEADING - gen.th : MAX_HEADING + gen.th, turn = Math.max(.12, Math.min(.5, room * .8)), R = 210;
  gen.kt = side / R; gen.left = turn * R;
  roadVersion++;
  extend(sj + 4000);
  return old;
}
/** Go back to a plan returned by switchRoad (the end of a side trip). */
export function restoreRoad(plan) { restorePlan(plan); ghost = null; extend(START + 4000); }
/** The road not taken at the last fork: its centre-line x and height at distance s, or null. */
const sampleOf = (P, A, s) => { const f = (s - START) / D, i = Math.max(1, Math.min(P.n - 3, Math.floor(f))), t = f - i, p0 = A[i - 1], p1 = A[i], p2 = A[i + 1], p3 = A[i + 2];
  return p1 + .5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0))); };
export function ghostAt(s) { if (!ghost || s < ghost.sj || (s - START) / D > ghost.n - 4) return null; return {x: sampleOf(ghost, ghost.X, s), y: sampleOf(ghost, ghost.Y, s), sj: ghost.sj}; }

/** Lay down road samples up to distance s (x and heading run ahead of height, which looks ahead). */
function extend(s) {
  const need = Math.ceil((s - START) / D) + 2, LOOK = 80;   // height looks 400 m ahead
  grow(need + LOOK + 2);
  while (n < need + LOOK) {
    const r = gen.r;
    const i = n;
    if (gen.left <= 0) {
      // choose the next piece: a straight, or a bend that tends to bring the heading back
      if (r() < cfg.straight) { gen.kt = 0; gen.left = 80 + r() * 320; }
      else {
        const R = cfg.radius[0] * Math.pow(cfg.radius[1] / cfg.radius[0], r());
        const back = -Math.sign(gen.th) || (r() < .5 ? 1 : -1);
        const sign = r() < .5 + Math.abs(gen.th) / MAX_HEADING * .45 ? back : -back;
        let turn = cfg.turn[0] + r() * (cfg.turn[1] - cfg.turn[0]);
        const room = sign > 0 ? MAX_HEADING - gen.th : MAX_HEADING + gen.th;   // how much turning is left before the limit
        turn = Math.min(turn, Math.max(room * .85, 0));
        if (turn < .08) { gen.kt = 0; gen.left = 60; }
        else { gen.kt = sign / R; gen.left = turn * R; }
      }
    }
    // curvature eases towards its target (a transition curve, never a sudden kink)
    const dk = 1 / (cfg.radius[0] * 30) * D;
    gen.k += clamp(gen.kt - gen.k, -dk, dk);
    const arc = D / Math.cos(gen.th);
    gen.th += gen.k * arc; gen.left -= arc;
    if (Math.abs(gen.th) > MAX_HEADING) { gen.th = Math.sign(gen.th) * MAX_HEADING; gen.k = 0; gen.kt = 0; gen.left = Math.min(gen.left, 40); }
    gen.x += Math.tan(gen.th) * D;
    const si = START + i * D;
    X[i] = gen.x; H[i] = gen.th; K[i] = gen.k; G[i] = landHeight(si, gen.x);
    n++;
  }
  // height: follow the land smoothed over +-150 m, with limits on gradient and on how fast it changes
  while (gen.ny < need) {
    const i = gen.ny;
    if (gen.y === null) { gen.y = smoothedLand(i); }
    const lookI = Math.min(i + 14, n - 1), want = clamp((smoothedLand(lookI) - gen.y) / ((lookI - i) * D || 1), -cfg.grade, cfg.grade);
    gen.g += clamp(want - gen.g, -.0011 * D / 5, .0011 * D / 5);
    gen.y += gen.g * D;
    // never let the road sink to the sea: below the causeway height it levels out and climbs again
    if (gen.y < -30 + 7) { gen.y = -30 + 7; gen.g = Math.max(gen.g, 0); }
    Y[i] = gen.y; gen.ny++;
  }
}
// The land smoothed over +-150 m, plus a gentle roll of its own so the road is never flat for long.
function smoothedLand(i) {
  let a = 0, c = 0; for (let j = Math.max(0, i - 30); j <= Math.min(n - 1, i + 30); j += 3) { a += G[j]; c++; }
  const s = START + i * D;
  // stay well above the sea: across low land the road runs on a causeway
  return Math.max(a / c + Math.max(cfg.hills * .3, 6) * (Math.sin(s / 110) * .6 + Math.sin(s / 260 + 1.3) * .4), -30 + 8);
}

// Catmull-Rom sampling between plan points (smooth position and slope).
const gX = () => X, gY = () => Y, gH = () => H, gK = () => K;   // (no new function per call)
function sample(get, s) {
  const f = (s - START) / D;
  if (f >= gen.ny - 3) extend(s + 2000);
  const A = get();   // read the array after extending (extending can replace it with a bigger one)
  const i = clamp(Math.floor(f), 1, cap - 3), t = f - i;
  const p0 = A[i - 1], p1 = A[i], p2 = A[i + 1], p3 = A[i + 2];
  return p1 + .5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

/* --------------------------------------------------------------- queries */
/** World x of the centre line. */
export const roadX = s => sample(gX, s);
/** Height of the road surface on the centre line. */
export const roadHeight = s => sample(gY, s);
/** Heading of the road (radians about y; 0 = straight along -z). The sign matches object rotation.y. */
export const roadYaw = s => -sample(gH, s);
/** Curvature (1 / bend radius, signed). */
export const roadCurvature = s => sample(gK, s);
/** Uphill gradient along s (rise per metre of s). */
export const roadGrade = s => (sample(gY, s + 1) - sample(gY, s - 1)) / 2;
/** Sideways tilt in bends (radians; positive lifts the right-hand side). */
export const roadBank = s => clamp(-sample(gK, s) * 9, -.07, .07);
/** World-x offset for a point `side` metres square to the road (positive = right of travel). */
export const sideX = (s, side) => side / Math.cos(sample(gH, s));
/** Cosine of the heading (square-to-road distance = world-x offset x this). */
export const roadCos = s => Math.cos(sample(gH, s));

/** Height of the road surface `side` metres from the centre (banking and a slight crown). */
export function roadSurface(s, side) {
  return roadHeight(s) + side * Math.tan(roadBank(s)) + .05 * (1 - smooth(Math.abs(side), 0, ROAD.half));
}

/** Everything about the road at distance s, written into `out` (pass one in to avoid allocation). */
export function sampleRoad(s, out = {}) {
  out.s = s; out.x = roadX(s); out.y = roadHeight(s); out.yaw = roadYaw(s); out.bank = roadBank(s);
  out.grade = roadGrade(s); out.curvature = roadCurvature(s); out.half = ROAD.half;
  return out;
}

/** Distance along the road closest to the world point (x, z). A few Newton steps from z. */
export function nearestS(x, z, guess = -z) {
  let s = guess;
  for (let i = 0; i < 4; i++) {
    const slope = roadX(s + .5) - roadX(s - .5);
    const f = (roadX(s) - x) * slope + (s + z);
    s -= f / (slope * slope + 1);
  }
  return s;
}

/** Straight-line distance from the world point (x, z) to the centre line (used for barriers and physics). */
export function distanceToCentre(x, z) { const s = nearestS(x, z); return Math.hypot(x - roadX(s), z + s); }

/** Plan statistics over a stretch, for tests and the debug map. */
export function roadStats(s0, s1) {
  let maxGrade = 0, maxHead = 0, minR = Infinity, longestFlat = 0, flatStart = s0, lo = Infinity, hi = -Infinity;
  for (let s = s0; s < s1; s += D) {
    const g = Math.abs(roadGrade(s)); maxGrade = Math.max(maxGrade, g);
    maxHead = Math.max(maxHead, Math.abs(roadYaw(s)));
    const k = Math.abs(roadCurvature(s)); if (k > 1e-5) minR = Math.min(minR, 1 / k);
    const y = roadHeight(s); lo = Math.min(lo, y); hi = Math.max(hi, y);
    if (hi - lo > 3) { longestFlat = Math.max(longestFlat, s - flatStart); flatStart = s; lo = hi = y; }
  }
  longestFlat = Math.max(longestFlat, s1 - flatStart);
  return {maxGrade, maxHeadingDeg: maxHead * 57.3, minRadius: minR, longestFlat};
}

setSeed(state.seed || 1);
resetRoad();

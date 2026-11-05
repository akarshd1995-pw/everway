// Ground height everywhere: the open land, with the road cut into it. Near the road the ground
// matches the road surface (including banking); further out it blends back to the land, which
// makes cuttings where the road passes through a rise and embankments where it crosses a dip.
// Terrain meshes, scenery and grass all use these functions, so nothing floats or sinks.
import * as T from '../three.module.js';
import {clamp, fbm, hash2, smooth, vnoise} from './core.js';
import {CH, CROPS, SNOW, heightAt, terrainParams, biomeAt} from './biomes.js';
import {G} from './state.js';
import {ROAD, landHeight, roadBank, roadHeight, roadX, roadCos, roadSurface, roadVersion} from './road.js';

/** Which side the sea is on along this stretch (+1 right, -1 left). */
export const coastSide = s => vnoise(s / 9000 + 3.1, 8.7) < .5 ? -1 : 1;
/** How far the land gives way to the sea at this point, 0..1. On the Wild Coast it ends in sheer
 *  cliffs about 110 m from the road; elsewhere some stretches slope gently down to the sea far off. */
export function coastWeight(s, side, P) {
  const k = P.coast || 0, d = side * coastSide(s);
  const gentle = smooth(vnoise(s / 3800 + 17.3, 2.1), .5, .7) * smooth(d, 480, 2180);
  const cliff = k > 0 ? k * smooth(d, 108 + 6 * vnoise(s / 60, 3.3), 126 + 8 * vnoise(s / 45, 9.1)) : 0;
  return Math.max(gentle, cliff);
}

/* Bridges and tunnels. Where the road would sit high above the land on an embankment, it crosses on a
   bridge instead and the valley stays open beneath; where it would cut deep into a hill, it goes through
   a tunnel and the hill stays whole above. Decided every 4 m from how far the road is above or below
   the open land, widened so each structure is at least about 30 m long. */
const STRUCT_STEP = 4, BRIDGE_FILL = 11, TUNNEL_CUT = 19;
let structCache = new Map(), structVersion = -1;
function fillAt(i) {
  const s = i * STRUCT_STEP;
  return roadHeight(s) - landHeight(s, roadX(s));
}
function rawStruct(i) { const f = fillAt(i); return f > BRIDGE_FILL ? 1 : f < -TUNNEL_CUT ? 2 : 0; }
/** 0 = open road, 1 = bridge, 2 = tunnel, at distance s. */
export function structureAt(s) {
  if (s < 160) return 0;   // the journey starts on open road
  if (structVersion !== roadVersion) { structCache = new Map(); structVersion = roadVersion; }
  const i = Math.floor(s / STRUCT_STEP);
  let v = structCache.get(i);
  if (v === undefined) {
    // a structure needs its kind on this sample and on most of its neighbours (no tiny bridges)
    const k = rawStruct(i);
    if (k) { let run = 0; for (let j = -4; j <= 4; j++) if (rawStruct(i + j) === k) run++; v = run >= 6 ? k : 0; } else v = 0;
    structCache.set(i, v); if (structCache.size > 20000) structCache.clear();
  }
  return v;
}
/** Half width of the opening of a bridge or tunnel (road, shoulders and a walkway). */
export const structHalf = () => ROAD.half + 2.2;

/** Ground height `side` metres square to the road at distance s (xw: world x, if already known). */
/** Ground height at distance s, `side` metres from the centre line. Beyond the end of a side road the
 * land falls away: down to a beach and the sea, or over an edge to a view. */
export function groundHeight(s, side, P, xw) {
  let h = groundBase(s, side, P, xw);
  // a river's channel: a bed below its water, with banks that slope down to it
  const rv = riverAt(s);
  if (rv) { const d = Math.abs(side - rv.lat), k = 1 - smooth(d, rv.w * .5, rv.w * .5 + 11); if (k > 0) h += (Math.min(h, rv.level - 1.7 + smooth(d, 0, rv.w * .5) * 1.2) - h) * k * rv.amp; }
  const T = G.trip;
  if (!T || s < T.end + 6) return h;
  const k = smooth(s, T.end + 6, T.end + (T.kind === 'beach' ? 150 : 85));
  if (T.kind === 'beach') return h + (SEA_LEVEL - 3.5 - Math.max(0, s - T.end - 150) * .06 - h) * k;   // a long, gentle beach
  if (T.kind === 'viewpoint') return h - 48 * k;
  return h;
}
function groundBase(s, side, P, xw = roadX(s) + side / roadCos(s)) {
  const a = Math.abs(side), edge = ROAD.half + 2.2;
  const st = structureAt(s);
  if (st === 2 && a < ROAD.half + 3.1) return roadHeight(s) - 3;   // tunnel: the ground opens along the road; the tunnel's own roof covers it
  if (st) {
    // the open land under a bridge, or the whole hill above a tunnel (no cutting, no embankment)
    let land = landHeight(s, xw) + heightAt(s, side, P);
    const cw = coastWeight(s, side, P); if (cw > 0) land += (SEA_LEVEL - 9 - land) * cw;
    if (st === 2) land = Math.max(land, roadHeight(s) + 7.5);   // always room for the tunnel
    else land = Math.min(land, roadHeight(s) - 3);              // always room under the bridge deck
    return land;
  }
  const near = roadHeight(s) + clamp(side, -edge, edge) * Math.tan(roadBank(s)) - .06;
  if (a < edge) return near;
  let land = landHeight(s, xw) + heightAt(s, side, P);
  const cw = coastWeight(s, side, P);
  if (cw > 0) land += (SEA_LEVEL - 9 - land) * cw;
  const d = land - near;
  // cut and fill slopes: steep where they leave the road edge, easing into the land (about 1 : 1.6 overall)
  const t = clamp((a - edge) / (5 + Math.abs(d) * 1.6), 0, 1);
  const h = near + d * t * (2 - t);
  // land below sea level drops away faster, so shallow water never flickers against the sea far off
  const u = SEA_LEVEL + 1 - h;
  return u > 0 ? h - u * 1.5 - 4 * smooth(u, 0, 2) : h;
}

/* ------------------------------------------------------------ rivers */
// Rivers run along valleys a little way from the road (never across it), in the green valley and the
// mountains, on stretches where the land beside the road is flat enough for water to lie level.
const RSEG = 1500, riverCache = new Map(); let riverVer = -1;
function riverSeg(n) {
  if (riverVer !== roadVersion) { riverCache.clear(); riverVer = roadVersion; }
  if (riverCache.has(n)) return riverCache.get(n);
  let r = null;
  const mid = n * RSEG + RSEG / 2, b = biomeAt(mid);
  if (n > 0 && hash2(n, 601) < .62 && (b === "fields" || b === "mountain")) {
    const side = hash2(n, 602) < .5 ? -1 : 1, d0 = 72 + hash2(n, 603) * 22, ph = hash2(n, 604) * 6.28;
    const lat = s => side * (d0 + 20 * Math.sin(s / 230 + ph) + 8 * Math.sin(s / 97 + ph * 2));
    // the water level along the river: it only ever runs downhill (from whichever end is higher)
    const prof = [], step = 20, s0 = n * RSEG;
    for (let s = s0; s <= s0 + RSEG; s += step) prof.push(groundBase(s, lat(s), terrainParams(s)));
    const down = prof[0] >= prof[prof.length - 1], lv = prof.slice();
    if (down) for (let i = 1; i < lv.length; i++) lv[i] = Math.min(lv[i], lv[i - 1]); else for (let i = lv.length - 2; i >= 0; i--) lv[i] = Math.min(lv[i], lv[i + 1]);
    let cut = 0; for (let i = 0; i < lv.length; i++) cut = Math.max(cut, prof[i] - lv[i]);
    if (cut < 24 && Math.min(...lv) > SEA_LEVEL + 4) {
      for (let k = 0; k < 2; k++) for (let i = 1; i < lv.length - 1; i++) lv[i] = Math.min(lv[i], (lv[i - 1] + lv[i] + lv[i + 1]) / 3);
      r = {lat, prof: lv.map(v => v - .7), s0, step, w: 11 + hash2(n, 605) * 6, n};
    }
  }
  riverCache.set(n, r); if (riverCache.size > 200) riverCache.clear();
  return r;
}
/** The river at distance s: centre (square to the road), water level, width and how fully it is there (0..1). */
const _rv = {lat: 0, level: 0, w: 0, amp: 0};
export function riverAt(s) {
  const n = Math.floor(s / RSEG), r = riverSeg(n); if (!r) return null;
  const a = s - n * RSEG, amp = smooth(a, 60, 260) * (1 - smooth(a, RSEG - 260, RSEG - 60)); if (amp <= 0) return null;
  const f = Math.min(r.prof.length - 1.001, Math.max(0, (s - r.s0) / r.step)), i = Math.floor(f);
  _rv.lat = r.lat(s); _rv.level = r.prof[i] + (r.prof[i + 1] - r.prof[i]) * (f - i); _rv.w = r.w; _rv.amp = amp; return _rv;
}

/** Ground height at world x on the row at distance s. */
export const groundAtX = (s, xw, P) => groundHeight(s, (xw - roadX(s)) * roadCos(s), P, xw);

/** Sea level (absolute height). The road planner keeps the road a few metres above it. */
export const SEA_LEVEL = -30;
const BEACH = new T.Color('#cdbb8f');

/** Colour and texture-layer weights for a ground point. `out` gets r,g,b; `splat` gets grass, rock, sand, snow.
 *  `rel` is the height above the road at this distance (snow follows the mountains, not the road). */
export function groundColor(s, side, h, rel, slope, P, c, splat, o = 0) {
  const ax = Math.abs(side), n1 = fbm(s * .018 + 3, side * .018, 3), n2 = vnoise(s * .11, side * .11);
  c.copy(P.ground).lerp(P.ground2, smooth(n1, .35, .68)).multiplyScalar(.86 + n2 * .24);
  if (P.crops > 0 && ax > 15 && ax < P.flat - 3) { const cell = hash2(Math.floor(s / 26), Math.floor(side / 16) + (side < 0 ? 999 : 0)); if (cell < .8) c.lerp(CROPS[Math.floor(cell / .8 * CROPS.length)], P.crops * .8); }
  c.lerp(P.verge, (1 - smooth(ax, 8, 14)) * .75);
  // grass holds on to moderate slopes (road cuttings stay green); bare rock only where it is steep
  const rk = smooth(slope, .72, 1.25), sn = smooth(rel + (n2 - .5) * 16, P.snowline, P.snowline + 9) * (1 - smooth(slope, 1.2, 1.8) * .7);
  let beach = 1 - smooth(h - SEA_LEVEL, .6, 3.2);
  if (G.trip?.kind === 'beach' && s > G.trip.end) beach = Math.max(beach, smooth(s, G.trip.end + 2, G.trip.end + 22));   // a wide sandy beach
  c.lerp(P.rock, rk); c.lerp(SNOW, sn); c.lerp(BEACH, beach * (1 - rk));
  const rw = rk * (1 - sn * .7), sd = Math.max(P.sand, beach) * (1 - rw) * (1 - sn);
  splat[o] = Math.max(0, 1 - rw - sn - sd); splat[o + 1] = rw; splat[o + 2] = sd; splat[o + 3] = sn;
}

/* Barriers along drops. The road sections draw them and the physics hits them, so both use this:
   every 4 m, a barrier point is "on" where the drop beyond the shoulder is over 4.5 m, or over 3 m
   when the previous point in the same section was on (so runs do not flicker on and off). */
const BAR_STEP = 4;
let barP = null, barChunk = -1;
function dropAt(s, side, P) {
  const bx = ROAD.half + 1.05;
  return roadSurface(s, side * bx) - Math.min(groundHeight(s, side * (bx + 4), P), groundHeight(s, side * (bx + 8), P));
}
export function barrierPointOn(j, side, P, c) {
  for (let k = j, depth = 0; ; k--, depth++) {
    const d = dropAt(k * BAR_STEP, side, P);
    if (d > 4.5) return true;
    if (d <= 3 || k === c || depth > 12) return false;
  }
}
/** Is there a barrier at distance s on this side (+1 right, -1 left)? */
export function barrierAt(s, side) {
  if (structureAt(s)) return true;   // bridge railings and tunnel walls
  const chunk = Math.floor(s / CH);
  if (chunk !== barChunk) { barChunk = chunk; barP = terrainParams(chunk * CH + 60); }
  const j = Math.floor(s / BAR_STEP);
  const c = chunk * CH / BAR_STEP;
  return barrierPointOn(j, side, barP, c) && barrierPointOn(j + 1, side, barP, c);
}

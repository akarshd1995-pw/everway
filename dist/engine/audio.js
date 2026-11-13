// Sound, all made with the Web Audio API (no sound files).
//  - Engine: three layers (low rumble, mid body, high rasp) blended by revs, opened up by load,
//    a dip at each gear change, and a softer, crackling note when you lift off the accelerator.
//  - Road: tyre roar, gravel crunch on the shoulder, grass and bumps off the road, the hiss of a wet
//    road, joints on bridges, tyre squeal near the grip limit, and the echo of a tunnel.
//  - Passing things: a whoosh panned to the side as you pass trees, posts, houses and signs, and the
//    rush of air off a wall or barrier beside you.
//  - The place around you, placed in space: birds left and right (a dawn chorus in the morning),
//    crickets and owls at night, surf on the coast's side, gulls, a stream under bridges, wind gusts.
//  - Music: calm generated tracks whose key, chords, pace and instruments follow the time of day
//    and the place, crossfading as they change.
import {carById} from './garage.js';
import {G, state} from './state.js';
import {biomeAt} from './biomes.js';
import {handling} from './physics.js';
import {ROAD} from './road.js';
import {structureAt, barrierAt, coastSide} from './terrain.js';
import {forObstaclesNear} from './obstacles.js';
import {CH} from './biomes.js';
import {wet} from './lighting.js';
import {traffic} from './actors.js';

let ctx, master, dry, tunnelSend, hallSend, nodes = null, musicOn = false;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Engines: revs (rpm), cylinders, layer voicing and loudness. */
const ENGINE = {
  car:   {idle: 850, red: 6800, cyl: 4, low: 'sawtooth', hi: 'square', cut: 420, vol: .055, whine: .004, drive: 2.2},
  bike:  {idle: 1300, red: 10500, cyl: 2, low: 'sawtooth', hi: 'square', cut: 700, vol: .045, whine: 0, drive: 3.2},
  coach: {idle: 600, red: 2600, cyl: 6, low: 'sawtooth', hi: 'sawtooth', cut: 260, vol: .07, whine: .006, drive: 1.6, clatter: .03},
  cycle: null};

/* ------------------------------------------------------------ building blocks */
function noiseBuffer(seconds = 2, kind = 'white') {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') d[i] = (last = (last + .02 * w) / 1.02) * 3.5;
    else if (kind === 'grain') d[i] = Math.random() < .004 ? w * (.5 + Math.random()) : d[i - 1] * .86 || 0;   // sparse clicks: stones under a tyre
    else d[i] = w;
  }
  return b;
}
/** A decaying stereo noise tail: the echo of a space. */
function impulse(seconds, decay, bright = 1) {
  const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * bright; d[i] = lp * Math.pow(1 - i / n, decay); } }
  return b;
}
/** A looping noise source through a filter and a gain, optionally panned, into `out`. */
function loop(buffer, type, freq, q = .7, pan = 0, out = dry) {
  const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const gain = ctx.createGain(); gain.gain.value = 0;
  let tail = src.connect(f).connect(gain);
  const p = ctx.createStereoPanner(); p.pan.value = pan; tail.connect(p).connect(out);
  src.start(Math.random() * .1); return {src, f, gain, p};
}
const osc = (type, freq) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.start(); return o; };
const gainNode = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const set = (param, v, t = .25) => param.setTargetAtTime(v, ctx.currentTime, t);

function softClip(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
  return c;
}

function build() {
  ctx = new AudioContext();
  master = gainNode(.9);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .25;
  master.connect(comp).connect(ctx.destination);
  dry = gainNode(1); dry.connect(master);
  // two spaces: a tunnel (short, hard, bright) and a soft hall for the music
  const tunnel = ctx.createConvolver(); tunnel.buffer = impulse(1.9, 2.6, .55); tunnelSend = gainNode(0); tunnelSend.connect(tunnel).connect(master);
  const hall = ctx.createConvolver(); hall.buffer = impulse(4.2, 3.2, .25); hallSend = gainNode(.55); hallSend.connect(hall).connect(master);
  const white = noiseBuffer(2), brown = noiseBuffer(4, 'brown'), grain = noiseBuffer(2.3, 'grain');

  // ---- engine: three layers into a soft-clipping shaper, a firing-pulse tremolo and an output gain
  const bus = gainNode(1), drive = gainNode(1), shaper = ctx.createWaveShaper(), am = gainNode(.8), out = gainNode(0);
  shaper.curve = softClip(2.2); shaper.oversample = '2x';
  bus.connect(drive).connect(shaper).connect(am).connect(out); out.connect(dry); out.connect(tunnelSend);
  const layer = (oscs, type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = gainNode(0); oscs.forEach(([o, v]) => { const og = gainNode(v); o.connect(og).connect(f); }); f.connect(g).connect(bus); return {f, g}; };
  const lowO = osc('sawtooth', 30), subO = osc('sine', 15), midA = osc('sawtooth', 60), midB = osc('sawtooth', 60), hiA = osc('square', 120), hiB = osc('sawtooth', 90);
  midA.detune.value = 9; midB.detune.value = -9;
  const low = layer([[lowO, .7], [subO, .9]], 'lowpass', 300, 1.2), mid = layer([[midA, .5], [midB, .5]], 'lowpass', 900, 2.2), high = layer([[hiA, .35], [hiB, .4]], 'bandpass', 1800, 1.1);
  const lfo = osc('sine', 8), lfoG = gainNode(.18); lfo.connect(lfoG).connect(am.gain);
  // intake roar under load, and diesel clatter for the coach
  const intake = loop(white, 'bandpass', 700, 1.4, 0, bus), clatter = loop(white, 'highpass', 2600, .7, 0, am);
  // transmission whine
  const whineO = osc('sine', 400), whine = gainNode(0); whineO.connect(whine).connect(dry);

  nodes = {
    eng: {lowO, subO, midA, midB, hiA, hiB, low, mid, high, lfo, lfoG, drive, shaper, out, intake, clatter, whineO, whine, rpm: 850, gear: 1, dip: 0, curveK: 2.2},
    tyre: loop(brown, 'lowpass', 380), roar: loop(white, 'bandpass', 520, .9),
    gravel: loop(grain, 'bandpass', 2200, .6), grass: loop(brown, 'bandpass', 600, .8), hiss: loop(white, 'highpass', 3200, .5),
    squeal: loop(white, 'bandpass', 1900, 14),
    windL: loop(white, 'highpass', 800, .5, -.75), windR: loop(white, 'highpass', 950, .5, .75), gust: loop(brown, 'bandpass', 260, .7),
    wallL: loop(white, 'bandpass', 1300, .8, -.9), wallR: loop(white, 'bandpass', 1300, .8, .9),
    rain: loop(white, 'bandpass', 2600, .6), roof: loop(grain, 'bandpass', 3400, .5),
    surf: loop(brown, 'lowpass', 500), surfHi: loop(white, 'bandpass', 1600, .5),
    stream: loop(white, 'bandpass', 1800, 3), breeze: loop(brown, 'bandpass', 320, .8),
    fall: loop(brown, 'lowpass', 900, .5), fallHi: loop(white, 'bandpass', 1400, .4), bellRung: new Set(), cars: [carVoice(white), carVoice(white)],
    cricket: null, hum: null, birdTimer: 2, nightTimer: 8, gullTimer: 10, tick: 0, swell: 0, lastS: 0, whooshAt: 0, jointAt: 0, inTunnel: 0, prevStruct: 0,
  };
  // crickets: a high tone pulsed in quick bursts
  const cO = osc('sine', 4300), cAm = gainNode(0), cG = gainNode(0), cL = osc('square', 28), cLg = gainNode(.5);
  cL.connect(cLg).connect(cAm.gain); cO.connect(cAm).connect(cG).connect(dry); nodes.cricket = cG;
  // another world: a low, slowly beating drone
  const h1 = osc('sine', 55), h2 = osc('sine', 55.7), hg = gainNode(0); h1.connect(hg); h2.connect(hg); hg.connect(dry); hg.connect(hallSend); nodes.hum = hg;
}

/** Turn sound on or off (the first call must come from a click). */
export async function toggleSound() {
  if (!ctx) build();
  await ctx.resume();
  state.sound = !state.sound;
  master.gain.setTargetAtTime(state.sound ? .9 : 0, ctx.currentTime, .1);
  return state.sound;
}

/* ------------------------------------------------------------------ each frame */
let T = 0;
/** Call every frame. */
export function updateAudio(run, dt = 1 / 60) {
  if (!ctx || !state.sound) return;
  dt = Math.min(dt, .1); T += dt;
  const v = run ? state.speed : 0, ride = state.ride, biome = biomeAt(state.distance), w = G.weatherNow, s = state.distance;
  const st = structureAt(s), tun = st === 2 ? 1 : 0;
  nodes.inTunnel += (tun - nodes.inTunnel) * Math.min(1, dt * 4);
  const inT = nodes.inTunnel, outside = 1 - inT * .9;
  set(tunnelSend.gain, inT * .75, .15);

  engine(run, v, dt);
  road(v, st, dt);
  passing(v, s, dt);
  surroundings(v, biome, w, st, outside, dt);
  others(v, outside);
  if (musicOn) music(biome);
  nodes.lastS = s;
}

function engine(run, v, dt) {
  const E = state.ride === 'car' ? {...ENGINE.car, ...carById(state.car).sound} : ENGINE[state.ride], n = nodes.eng;
  if (!E) { set(n.out.gain, 0); set(n.whine.gain, 0); bicycle(v, dt); return; }
  if (E.ev) {
    // an electric motor: no engine note, a rising whine that swells as you press on
    const load = run ? clamp((state.lon || 0) / handling().accel, 0, 1) : 0;
    set(n.out.gain, 0); set(n.intake.gain.gain, 0); set(n.clatter.gain.gain, 0);
    set(n.whineO.frequency, 140 + v * 34, .05); set(n.whine.gain, E.whine * clamp(v / 12, .05, 1) * (.25 + load * .9), .15);
    return;
  }
  const gear = Math.max(1, state.gear || 1), r = run ? state.rev || 0 : 0, moving = v > .6;
  const target = moving ? E.idle + (E.red - E.idle) * (gear === 1 ? r * .8 : .32 + r * .68) : E.idle * (1 + Math.max(0, state.lon || 0) * .1);
  if (gear > n.gear) n.dip = .16;                 // a gear change: a short lift, then the revs drop
  n.gear = gear;
  n.rpm += (target - n.rpm) * Math.min(1, dt * (n.dip > 0 ? 18 : 7));
  n.dip = Math.max(0, n.dip - dt);
  const x = clamp((n.rpm - E.idle) / (E.red - E.idle), 0, 1);
  const accel = handling().accel, lon = state.lon || 0, load = run ? clamp(lon / accel, 0, 1) : 0, lift = run && moving && lon < -.25 ? clamp(-lon / 3, 0, 1) : 0;
  const fire = n.rpm / 60 * E.cyl / 2;            // firing pulses per second
  set(n.lowO.frequency, fire, .03); set(n.subO.frequency, fire / 2, .03);
  set(n.midA.frequency, fire * 2, .03); set(n.midB.frequency, fire * 2, .03);
  set(n.hiA.frequency, fire * 4, .03); set(n.hiB.frequency, fire * 3, .03);
  set(n.lfo.frequency, fire / E.cyl * 1.5, .05); set(n.lfoG.gain, .12 + (1 - x) * .14, .2);
  // which layers speak: rumble at low revs, body in the middle, rasp near the top
  const open = 1 + load * 1.4 - lift * .45;
  set(n.low.g.gain, (1 - x * .65) * (.9 + load * .3), .08);
  set(n.mid.g.gain, (.25 + Math.sin(Math.PI * Math.min(1, x * 1.15)) * .75) * (.6 + load * .5), .08);
  set(n.high.g.gain, smooth(x, .3, 1) * (.35 + load * .75) * (1 - lift * .6), .08);
  set(n.low.f.frequency, E.cut * open * (1 + x), .08); set(n.mid.f.frequency, E.cut * 2.2 * open * (1 + x * .8), .08); set(n.high.f.frequency, 1300 + x * 2200 * open, .08);
  set(n.drive.gain, 1 + load * (E.drive - 1), .1);
  set(n.intake.gain.gain, load * (.2 + x * .5) * E.vol * 6, .1); set(n.intake.f.frequency, 500 + x * 1400, .1);
  set(n.clatter.gain.gain, E.clatter ? E.clatter * (1 - x * .5) : 0, .2);
  set(n.out.gain, E.vol * (n.dip > 0 ? .55 : 1) * (.5 + load * .45 + x * .25) * (1 - lift * .35), n.dip > 0 ? .03 : .1);
  set(n.whineO.frequency, 180 + v * 22, .05); set(n.whine.gain, E.whine * clamp(v / 25, 0, 1) * (.4 + load), .2);
  // lifting off at high revs: a few soft pops from the exhaust
  if (lift > .2 && x > .4 && Math.random() < dt * 5 * x) pop(.03 + x * .03);
}

function bicycle(v, dt) {
  // freewheel ticks when coasting, a chain whirr when pedalling
  const pedal = (state.lon || 0) > .05;
  if (!pedal && v > 1) { nodes.tick -= dt; if (nodes.tick < 0) { click(.012); nodes.tick = 1 / (v * 3.5); } }
  set(nodes.grass.gain.gain, 0);
}

function road(v, st, dt) {
  if (G.thump) { thump(G.thump); G.thump = 0; }
  const ride = state.ride, coach = ride === 'coach', air = state.airborne, side = Math.abs(state.side);
  const onGravel = !air && side > ROAD.half - .3 && state.offroad <= 0, onGrass = !air && state.offroad > 0;
  const k = clamp(v / 30, 0, 1);
  set(nodes.tyre.gain.gain, air ? 0 : Math.min(.1, v * .003) * (coach ? 1.4 : ride === 'cycle' ? .4 : 1) * (1 + (G.roughRoad || 0) * .8), .1);
  set(nodes.tyre.f.frequency, 220 + v * 12, .2);
  set(nodes.roar.gain.gain, air || onGrass ? 0 : k * k * .03 * (1 + nodes.inTunnel * 1.5), .15);
  set(nodes.gravel.gain.gain, onGravel ? Math.min(.35, v * .02) : 0, .08); nodes.gravel.src.playbackRate.value = .6 + Math.min(1.6, v / 14);
  set(nodes.grass.gain.gain, onGrass ? Math.min(.09, v * .006) : 0, .08);
  if (onGrass && v > 3 && Math.random() < dt * v * .12) thump(.03 + Math.random() * .04);
  set(nodes.hiss.gain.gain, air ? 0 : wet * Math.min(.1, v * .0035), .2); set(nodes.hiss.f.frequency, 2400 + v * 40, .3);
  set(nodes.squeal.gain.gain, !onGrass && v > 8 ? Math.min(.05, (state.slip || 0) * .2) : 0, .06);
  // bridges: a joint where the deck starts and ends, and at each pier
  if (st !== nodes.prevStruct && (st === 1 || nodes.prevStruct === 1) && v > 2) joints(v);
  else if (st === 1 && v > 2 && Math.floor(state.distance / 24) !== Math.floor(nodes.lastS / 24)) joints(v, .6);
  nodes.prevStruct = st;
}

function passing(v, s, dt) {
  // a whoosh for each thing that goes past close by
  const side = state.side, last = nodes.lastS;
  if (v > 5 && s > last && s - last < 5) {
    forObstaclesNear(s, CH, (os, oside, r) => {
      if (os <= last || os > s) return;
      const d = Math.abs(oside - side); if (d > 11 || T - nodes.whooshAt < .045) return;
      nodes.whooshAt = T;
      whoosh(clamp(v / 32, 0, 1.2) * clamp(r * 1.4, .45, 1.5) / (1 + d * .3), clamp((oside - side) / 5, -1, 1), v);
    });
  }
  // the rush of air off a wall or barrier close beside you, and both walls in a tunnel
  const wallAt = sd => (barrierAt(s, sd) && Math.abs(sd * ROAD.half - side) < 4.5 ? 1 : 0) + nodes.inTunnel;
  const kv = Math.min(.05, v * v * .00005);
  set(nodes.wallL.gain.gain, kv * Math.min(1, wallAt(-1)), .15); set(nodes.wallR.gain.gain, kv * Math.min(1, wallAt(1)), .15);
}

function surroundings(v, biome, w, st, outside, dt) {
  // wind from the car's speed, and gusts that move from side to side
  const gl = .7 + .3 * Math.sin(T * .37) + .2 * Math.sin(T * 1.13 + 1), gr = .7 + .3 * Math.sin(T * .41 + 2) + .2 * Math.sin(T * .97);
  const wv = Math.min(.1, v * v * .00006) * (state.ride === 'coach' ? .35 : 1), windy = w === 'windy' ? .035 : w === 'rainy' || w === 'snowy' ? .015 : 0;
  set(nodes.windL.gain.gain, (wv + windy * gl) * outside, .3); set(nodes.windR.gain.gain, (wv + windy * gr) * outside, .3);
  set(nodes.gust.gain.gain, windy * (.5 + .5 * Math.sin(T * .23)) * 1.6 * outside, .6);
  // rain on the road, and on the roof of a closed vehicle
  const rainy = G.rainAmt || 0, closed = state.ride === 'car' || state.ride === 'coach';
  set(nodes.rain.gain.gain, rainy * .05 * outside, 1); set(nodes.roof.gain.gain, rainy * (closed ? .09 : .02) * outside, 1);
  // the place: surf from the side the sea is on, a stream under a bridge, wind in the hills
  nodes.swell += dt;
  const coast = biome === 'coast' ? 1 : 0, sea = coastSide(state.distance);
  set(nodes.surf.gain.gain, coast * (.05 + .035 * Math.sin(nodes.swell * .7)) * outside, .6); set(nodes.surf.p.pan, sea * .7, 1);
  set(nodes.surfHi.gain.gain, coast * .015 * Math.max(0, Math.sin(nodes.swell * .7 + .6)) * outside, .4); set(nodes.surfHi.p.pan, sea * .8, 1);
  set(nodes.stream.gain.gain, st === 1 && biome !== 'desert' && biome !== 'planet' ? .022 : 0, .8); set(nodes.stream.f.frequency, 1500 + Math.sin(T * 7.1) * 300 + Math.sin(T * 13.7) * 200, .02);
  set(nodes.breeze.gain.gain, (biome === 'desert' || biome === 'snow' || biome === 'mountain' ? .035 : .012) * outside, 1);
  set(nodes.hum.gain, biome === 'planet' ? .035 : 0, 1.5);
  // creatures: birds by day (a dawn chorus in the morning), crickets and owls at night, gulls on the coast
  const t = state.time, night = t < 5 || t > 20.5, green = biome === 'fields' || biome === 'coast' || biome === 'town' || biome === 'mountain', winter = state.season === 'winter';
  if (green && w !== 'rainy' && !night && outside > .5) {
    const dawn = t > 4.8 && t < 9 ? 2.6 : 1;
    nodes.birdTimer -= dt * dawn;
    if (nodes.birdTimer < 0) { bird(); nodes.birdTimer = 1.2 + Math.random() * 4.5; }
  }
  set(nodes.cricket.gain, night && green && !winter && w !== 'rainy' && outside > .5 ? .005 : 0, 2);
  if (night && green && outside > .5) { nodes.nightTimer -= dt; if (nodes.nightTimer < 0) { owl(); nodes.nightTimer = 14 + Math.random() * 25; } }
  if (coast && !night && outside > .5) { nodes.gullTimer -= dt; if (nodes.gullTimer < 0) { gull(sea); nodes.gullTimer = 6 + Math.random() * 14; } }
}

/* --------------------------------------------- other vehicles, falling water, bells */
/** The engine and tyres of another vehicle: a low buzz and road noise, panned and Doppler-shifted. */
function carVoice(white) {
  const o = osc('sawtooth', 70), o2 = osc('sawtooth', 140), f = ctx.createBiquadFilter(), g = gainNode(0), p = ctx.createStereoPanner();
  f.type = 'lowpass'; f.frequency.value = 500; const og = gainNode(.5); o2.connect(og).connect(f); o.connect(f); f.connect(g).connect(p).connect(dry);
  const tyre = loop(white, 'bandpass', 700, .8, 0, p);
  return {o, o2, f, g, p, tyre, base: 70};
}
const C_AIR = 343;
function others(v, outside) {
  // the two nearest vehicles: louder as they come closer, higher in pitch as they approach and lower
  // as they go away (the Doppler shift), panned to their side of the road
  const s = state.distance, me = state.side ?? ROAD.lane, near = [];
  for (const car of traffic) { const u = car.userData; if (!car.visible || u.kind === 'cycle') continue; const d = u.s - s; if (Math.abs(d) < 260) near.push({u, d}); }
  near.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  nodes.cars.forEach((cv, i) => {
    const n = near[i];
    if (!n) { set(cv.g.gain, 0, .3); set(cv.tyre.gain.gain, 0, .3); return; }
    const u = n.u, lat = u.direction * ROAD.lane - me, dist = Math.hypot(n.d, lat) + 1;
    const rel = u.speed * u.direction - v, rate = n.d * rel / dist;          // how fast the distance is changing (m/s)
    const dop = C_AIR / (C_AIR + rate), k = 1 / (1 + (dist / 14) ** 2), big = u.kind === 'lorry' || u.kind === 'bus' ? .5 : u.kind === 'tractor' || u.kind === 'van' ? .7 : u.kind === 'motorbike' ? 1.6 : 1;
    set(cv.o.frequency, (u.kind === 'tractor' ? 38 : 55 + u.speed * 1.6) * big * dop, .05); set(cv.o2.frequency, (u.kind === 'tractor' ? 76 : 110 + u.speed * 3.2) * big * dop, .05);
    set(cv.f.frequency, 300 + 900 * k * dop, .1); set(cv.g.gain, .05 * k * outside, .08);
    set(cv.tyre.gain.gain, .045 * k * Math.min(1, u.speed / 15) * outside, .08); set(cv.tyre.f.frequency, 600 * dop, .05);
    set(cv.p.pan, clamp(lat / (Math.abs(n.d) * .6 + 2.5), -.9, .9), .08);
  });
  // a waterfall near the road: a deep roar and a bright spray, from its side
  const S = G.sounds || {}, fall = S.fall;
  const fk = fall ? 1 / (1 + (fall.d / 70) ** 2) : 0;
  set(nodes.fall.gain.gain, .12 * fk * outside, .4); set(nodes.fallHi.gain.gain, .04 * fk * outside, .4);
  if (fall) { set(nodes.fall.p.pan, fall.pan, .3); set(nodes.fallHi.p.pan, fall.pan, .3); }
  // church bells: a short peal as you come into a village in the daytime
  const b = S.bell;
  if (b && b.d < 320 && !nodes.bellRung.has(b.key) && state.time > 8 && state.time < 20 && outside > .5) { nodes.bellRung.add(b.key); peal(b.pan, b.d); }
}
/** A church bell: a struck, slowly fading tone with the uneven overtones of a bell. */
function bellStrike(f, at, g, pan) {
  for (const [m, a, d] of [[.5, .6, 5], [1, 1, 4], [1.19, .5, 3], [1.5, .35, 2.4], [2, .4, 2], [2.52, .2, 1.5], [3.01, .12, 1.1]])
    tone({f0: f * m, dur: d, gain: g * a, pan, attack: .004, cut: 6000, at, send: .7});
}
function peal(pan, d) {
  const g = .02 / (1 + d / 150), notes = [523, 466, 415, 392], at = .3;
  for (let i = 0; i < 12; i++) bellStrike(notes[i % 4] * .5, at + i * .62 + (i % 4 === 0 ? .25 : 0), g, pan);
}

/* ------------------------------------------------------------ one-shot voices */
/** A short noise burst through a filter, panned, with its own envelope. */
function burst({dur = .2, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = .05, pan = 0, attack = .005, kind = 'white', send = 0}) {
  const t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = bursts[kind] || (bursts[kind] = noiseBuffer(1.6, kind));
  const f = ctx.createBiquadFilter(), g = gainNode(0), p = ctx.createStereoPanner();
  f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0004, t + dur);
  p.pan.value = pan; src.connect(f).connect(g).connect(p).connect(dry); if (send) { const sg = gainNode(send); p.connect(sg).connect(tunnelSend); }
  src.loop = dur > 1.4; src.start(t, Math.random() * Math.max(0, 1.5 - dur)); src.stop(t + dur + .05);
}
const bursts = {};
/** Passing something: a rush of air that falls in pitch as it goes by (the Doppler shift). */
function whoosh(k, pan, v) {
  const hi = 1400 + v * 40;
  burst({dur: .22 + .2 / (1 + v / 15), f0: hi, f1: hi * .45, q: .9, gain: .07 * k, pan, attack: .03, send: .5});
}
function pop(g) { burst({dur: .06, type: 'lowpass', f0: 1200, f1: 400, gain: g, attack: .002}); }
function click(g) { burst({dur: .02, type: 'highpass', f0: 3000, gain: g, attack: .001}); }
function thump(g) { burst({dur: .14, type: 'lowpass', f0: 180, f1: 70, gain: g, kind: 'brown', attack: .004}); }
function joints(v, k = 1) {
  // front and back wheels over a joint, a wheelbase apart
  const gap = handling().wheelbase / Math.max(v, 1);
  thump(.09 * k); setTimeout(() => ctx && thump(.07 * k), gap * 1000);
}
function tone({type = 'sine', f0, f1 = f0, dur = .2, gain = .01, pan = 0, attack = .01, cut = 8000, at = 0, send = 0}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = gainNode(0), f = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * .8);
  f.type = 'lowpass'; f.frequency.value = cut; p.pan.value = pan;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0003, t + dur);
  o.connect(f).connect(g).connect(p).connect(dry); if (send) { const sg = gainNode(send); p.connect(sg).connect(hallSend); }
  o.start(t); o.stop(t + dur + .05);
}
/** A bird somewhere around you: nearer ones louder and brighter. Three kinds of song. */
function bird() {
  const pan = Math.random() * 1.8 - .9, near = Math.random(), g = .004 + near * .012, cut = 3000 + near * 6000, kind = Math.random();
  if (kind < .5) { // a quick chirping trill
    const base = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 5), gap = .09 + Math.random() * .07;
    for (let i = 0; i < n; i++) tone({f0: base, f1: base * (1.3 + Math.random() * .4), dur: .08, gain: g, pan, cut, at: i * gap, send: .3});
  } else if (kind < .85) { // a rising, falling warble
    const base = 1800 + Math.random() * 1200;
    for (let i = 0; i < 3; i++) tone({f0: base * (1 + i * .12), f1: base * (1.25 - i * .1), dur: .22, gain: g * .8, pan, cut, at: i * .2, send: .3});
  } else { // a far, low two-note call
    const a = 640 + Math.random() * 80;
    tone({f0: a, f1: a * .98, dur: .35, gain: .006, pan, cut: 2500, send: .5}); tone({f0: a * .8, dur: .45, gain: .006, pan, cut: 2500, at: .42, send: .5});
  }
}
function owl() { const pan = Math.random() * 1.6 - .8; tone({f0: 420, f1: 400, dur: .5, gain: .006, pan, cut: 1200, send: .6}); tone({f0: 400, f1: 380, dur: .9, gain: .005, pan, cut: 1200, at: .7, send: .6}); }
function gull(sea) { const pan = sea * (.4 + Math.random() * .5); for (let i = 0; i < 3; i++) tone({type: 'triangle', f0: 1500, f1: 1000, dur: .28, gain: .006, pan, cut: 3000, at: i * .3, send: .4}); }

/** One-off sounds. */
export function sfx(kind, opt = {}) {
  if (!ctx || !state.sound) return;
  if (kind === 'thunder') {
    // near: a sharp crack then a long roll; far: only a low grumble, rolling around the hills
    const d = opt.dist ?? 2000, near = Math.max(0, 1 - d / 2500), pan = opt.pan || 0;
    if (near > .45) burst({dur: .5, type: 'highpass', f0: 1800, f1: 600, gain: .12 * near, pan, attack: .004, send: .4});
    burst({dur: 4 + 3 * (1 - near), type: 'lowpass', f0: 260 + 500 * near, f1: 50, gain: .22 * (.35 + .65 * near), pan, attack: .08 + (1 - near) * .5, kind: 'brown', send: .6});
    setTimeout(() => ctx && burst({dur: 3.5, type: 'lowpass', f0: 160, f1: 45, gain: .12 * (.4 + .6 * near), pan: -pan * .5, attack: .4, kind: 'brown', send: .7}), 900 + Math.random() * 900);
    return;
  }
  if (kind === 'tick' || kind === 'tock') { burst({dur: .03, type: 'bandpass', f0: kind === 'tick' ? 2400 : 1700, q: 3, gain: .05, attack: .001}); return; }
  if (kind === 'splash') burst({dur: 1.5, f0: 900, f1: 300, q: .6, gain: .25, attack: .01});
  else { thump(.5); burst({dur: .35, type: 'bandpass', f0: 900, f1: 300, gain: .12, attack: .002}); }
}

/* -------------------------------------------------------------------- music */
// Calm generated tracks. A mood sets the key, the scale, the chord progression, the pace, the
// register and the brightness; it follows the time of day and the place. When the mood changes,
// the new track fades in on its own bus while the old one fades out.
const MOODS = {
  dawn:   {root: 62, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 1, 4], beat: 6.5, bright: 1800, mel: .8, oct: 12},
  day:    {root: 60, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 3, 4], beat: 5.2, bright: 2400, mel: 1, oct: 12},
  dusk:   {root: 57, scale: [0, 2, 4, 5, 7, 9, 10], prog: [0, 6, 3, 0], beat: 6.5, bright: 1500, mel: .7, oct: 12},
  night:  {root: 57, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 4, 3], beat: 8, bright: 900, mel: .45, oct: 12},
  desert: {root: 52, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 0, 6], beat: 7, bright: 1300, mel: .7, oct: 12, drone: true},
  peaks:  {root: 59, scale: [0, 2, 4, 7, 9, 11, 12], prog: [0, 3, 1, 4], beat: 7.5, bright: 2600, mel: .55, oct: 24, bells: true},
  planet: {root: 58, scale: [0, 2, 4, 6, 8, 10, 12], prog: [0, 2, 0, 4], beat: 8.5, bright: 1600, mel: .5, oct: 12, drone: true, bells: true},
};
function moodNow(biome) {
  const t = state.time;
  if (biome === 'planet') return 'planet';
  if (biome === 'desert' && t > 7 && t < 19) return 'desert';
  if (t < 5 || t > 20.5) return 'night';
  if (t < 9) return 'dawn';
  if (t > 17) return 'dusk';
  return biome === 'mountain' || biome === 'snow' ? 'peaks' : 'day';
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
let track = null, nextAt = 0, step = 0, motif = [0, 2, 4, 2];
function music(biome) {
  const key = moodNow(biome), now = ctx.currentTime;
  if (!track || track.key !== key) {
    if (track) { const old = track.bus; old.gain.setTargetAtTime(0, now, 2.5); setTimeout(() => old.disconnect(), 12000); }
    const bus = gainNode(0); bus.connect(dry); bus.connect(hallSend); bus.gain.setTargetAtTime(1, now, 3);
    track = {key, bus, M: MOODS[key]}; step = 0; nextAt = Math.max(nextAt, now + .5);
    motif = [0, 1 + Math.floor(Math.random() * 3), 2 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)];
  }
  if (now < nextAt - .1) return;
  const M = track.M, beat = M.beat * (biome === 'coast' ? 1.15 : biome === 'town' ? .9 : 1), deg = M.prog[step % M.prog.length], at = Math.max(now, nextAt);
  const note = d => M.root + M.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  // pad: the chord, two detuned voices each, swelling in and out
  for (const d of [deg, deg + 2, deg + 4]) for (const det of [-6, 6]) voice(track.bus, {type: 'triangle', m: note(d), det, at, attack: beat * .35, dur: beat * 1.25, gain: .0065, cut: M.bright});
  // bass (or a held drone)
  voice(track.bus, {type: 'sine', m: (M.drone ? M.root : note(deg)) - 24, at, attack: .8, dur: beat * 1.1, gain: .02, cut: 400});
  if (M.drone) voice(track.bus, {type: 'sine', m: M.root - 12 + 7, at, attack: 2, dur: beat * 1.2, gain: .006, cut: 600});
  // melody: a short motif, moved onto this chord and varied a little
  const n = Math.random() < M.mel ? 2 + Math.floor(Math.random() * 3) : 0;
  for (let i = 0; i < n; i++) {
    const d = deg + motif[(i + step) % motif.length] + (Math.random() < .2 ? 1 : 0), when = at + beat * (.15 + i / (n + .5) * .8) + Math.random() * .12;
    voice(track.bus, {type: M.bells ? 'sine' : 'triangle', m: note(d) + M.oct, at: when, attack: .01, dur: M.bells ? 3.2 : 1.8, gain: M.bells ? .012 : .014, cut: M.bright * 1.6, bell: M.bells});
  }
  step++; nextAt = at + beat;
}
function voice(bus, {type, m, det = 0, at, attack, dur, gain, cut, bell = false}) {
  const o = ctx.createOscillator(), g = gainNode(0), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = hz(m); o.detune.value = det; f.type = 'lowpass'; f.frequency.value = cut;
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack);
  if (attack > .2) g.gain.linearRampToValueAtTime(gain * .8, at + dur * .7); g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(f).connect(g).connect(bus);
  if (bell) { const o2 = ctx.createOscillator(), g2 = gainNode(gain * .3); o2.frequency.value = hz(m) * 2.76; o2.connect(g2).connect(g); o2.start(at); o2.stop(at + dur + .1); }
  o.start(at); o.stop(at + dur + .1);
}

/** Music on or off. Turns sound on if needed. (Kept as setRadio for the menu switch.) */
export async function setRadio(on) {
  if (on && !state.sound) await toggleSound();
  if (!ctx) return false;
  musicOn = on;
  if (!on && track) { const old = track.bus; old.gain.setTargetAtTime(0, ctx.currentTime, 1); setTimeout(() => old.disconnect(), 6000); track = null; }
  nextAt = 0;
  return on;
}

/* ------------------------------------------------------------------ your own music, and the radio voice */
// Songs you choose from your device play like a car radio: shuffled, one after another. Nothing is uploaded.
const own = {list: [], i: 0, el: null, src: null, gain: null, names: []};
export async function playOwnMusic(files) {
  const list = [...files].filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)$/i.test(f.name));
  if (!list.length) return null;
  if (!state.sound) await toggleSound();
  if (!ctx) return null;
  await setRadio(false);                       // the made-up music stops while yours plays
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  own.list.forEach(u => URL.revokeObjectURL(u)); own.list = list.map(f => URL.createObjectURL(f)); own.names = list.map(f => f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '));
  if (!own.el) {
    own.el = new Audio(); own.el.crossOrigin = 'anonymous'; own.src = ctx.createMediaElementSource(own.el); own.gain = gainNode(.8); own.src.connect(own.gain).connect(master);
    own.el.onended = () => nextOwnSong();
  }
  own.i = -1; return nextOwnSong();
}
export function nextOwnSong() {
  if (!own.list.length || !own.el) return null;
  own.i = (own.i + 1) % own.list.length; own.el.src = own.list[own.i]; own.el.play().catch(() => {});
  const name = own.names[own.i]; own.onSong?.(name); return name;
}
export function stopOwnMusic() { if (own.el) own.el.pause(); }
export const ownMusic = own;

let voiceOn = false, presenter = null;
export function setRadioVoice(on) { voiceOn = on; }
/** The radio presenter says something short and calm; the music dips while they speak. */
export function announce(text) {
  if (!voiceOn || !('speechSynthesis' in window) || speechSynthesis.speaking) return;
  if (!presenter) { const vs = speechSynthesis.getVoices(); presenter = vs.find(v => /en[-_]GB/i.test(v.lang) && /female|Serena|Kate|Libby|Sonia|Google UK English Female/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)) || null; }
  const u = new SpeechSynthesisUtterance(text); if (presenter) u.voice = presenter; u.rate = .92; u.pitch = 1; u.volume = .9;
  const duck = k => { if (own.gain && ctx) own.gain.gain.setTargetAtTime(k, ctx.currentTime, .3); if (track && ctx) track.bus.gain.setTargetAtTime(k * 1.2, ctx.currentTime, .3); };
  u.onstart = () => duck(.3); u.onend = u.onerror = () => duck(.8);
  speechSynthesis.speak(u);
}

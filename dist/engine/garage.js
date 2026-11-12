// The garage: the cars you can drive, each with its own body, paint, engine note and feel on the road.
// Names are our own; each one is modelled on a kind of car you can buy today (a hot hatch, a
// mid-engined supercar, an electric saloon...) with performance in the range of the real thing.
//
// Handling fields (see physics.js): accel (m/s² at full throttle, low down), brake, top (m/s), grip
// (tyres), steer (max wheel angle), steerSpeed (how fast the wheel turns), roll (body lean),
// wheelbase, length, width, soft (suspension: higher is softer), gears (shift speeds in m/s).
// Sound (see audio.js): idle and red-line rpm, cylinders, filter, volume, whine; ev: electric.

const gearsFor = (top, n) => [0, ...Array.from({length: n}, (_, i) => top * Math.pow((i + 1) / n, 1.18))];

export const CARS = [
  {id: 'meridian', name: 'Meridian', kind: 'Touring coupé', style: 'coupe', color: '#2f5d86',
    blurb: 'Balanced and easy. The one to start with.',
    h: {accel: 4.2, brake: 8.8, top: 66, grip: 1.0, steer: .55, steerSpeed: 9, roll: .045, wheelbase: 2.7, length: 4.6, width: .95, soft: 1},
    sound: {idle: 850, red: 6800, cyl: 4, cut: 420, vol: .055, whine: .004, drive: 2.2}, gears: 6},
  {id: 'kestrel', name: 'Kestrel R', kind: 'Hot hatch', style: 'hatch', color: '#c8342a',
    blurb: 'Small, eager and darty. Loves a twisty road.',
    h: {accel: 4.9, brake: 9.2, top: 67, grip: 1.06, steer: .6, steerSpeed: 12, roll: .05, wheelbase: 2.55, length: 4.1, width: .9, soft: .85},
    sound: {idle: 900, red: 7200, cyl: 4, cut: 520, vol: .055, whine: .006, drive: 2.8}, gears: 6},
  {id: 'linden', name: 'Linden', kind: 'Family saloon', style: 'sedan', color: '#9aa3a6',
    blurb: 'Soft, quiet and comfortable. Floats over bumps.',
    h: {accel: 3.3, brake: 8.2, top: 58, grip: .95, steer: .55, steerSpeed: 8, roll: .06, wheelbase: 2.8, length: 4.7, width: .92, soft: 1.3},
    sound: {idle: 750, red: 6200, cyl: 4, cut: 340, vol: .04, whine: .003, drive: 1.6}, gears: 6},
  {id: 'solace', name: 'Solace', kind: 'Electric saloon', style: 'ev', color: '#e6e8e4',
    blurb: 'Silent, smooth and instant. Pins you to the seat.',
    h: {accel: 6.6, brake: 9, top: 69, grip: 1.02, steer: .55, steerSpeed: 9, roll: .035, wheelbase: 2.9, length: 4.8, width: .94, soft: 1.1},
    sound: {ev: true, whine: .05}, gears: 1},
  {id: 'ridgeback', name: 'Ridgeback', kind: 'SUV', style: 'suv', color: '#4a5a4c',
    blurb: 'Tall, roomy and unflustered. Sure-footed on rough roads.',
    h: {accel: 3.5, brake: 8, top: 58, grip: .97, steer: .55, steerSpeed: 8, roll: .08, wheelbase: 2.85, length: 4.75, width: 1, soft: 1.4, allRoad: .35},
    sound: {idle: 750, red: 5600, cyl: 6, cut: 300, vol: .055, whine: .006, drive: 1.8}, gears: 8},
  {id: 'halcyon', name: 'Halcyon', kind: 'Classic roadster', style: 'roadster', color: '#7d1f1a',
    blurb: 'Wire wheels and the wind in your hair. Gentle and old-fashioned.',
    h: {accel: 3.0, brake: 7, top: 52, grip: .9, steer: .6, steerSpeed: 8, roll: .07, wheelbase: 2.35, length: 4.2, width: .95, soft: 1.3},
    sound: {idle: 800, red: 5800, cyl: 4, cut: 380, vol: .06, whine: 0, drive: 2.6}, gears: 4},
  {id: 'ironside', name: 'Ironside V8', kind: 'Muscle car', style: 'muscle', color: '#d9a21b',
    blurb: 'A big V8 and a loose tail. Straight-line thunder.',
    h: {accel: 5.6, brake: 8.4, top: 79, grip: .88, steer: .5, steerSpeed: 8, roll: .06, wheelbase: 2.85, length: 4.85, width: .98, soft: 1.15},
    sound: {idle: 700, red: 6400, cyl: 8, cut: 260, vol: .075, whine: .003, drive: 3.4}, gears: 6},
  {id: 'brisa', name: 'Brisa GT', kind: 'Grand tourer', style: 'gt', color: '#1f3a33',
    blurb: 'Long-legged and refined. Made for crossing countries.',
    h: {accel: 5.4, brake: 9.6, top: 88, grip: 1.1, steer: .52, steerSpeed: 9, roll: .035, wheelbase: 2.8, length: 4.8, width: .98, soft: 1},
    sound: {idle: 800, red: 7400, cyl: 12, cut: 380, vol: .06, whine: .004, drive: 2.2}, gears: 8},
  {id: 'dustrunner', name: 'Dustrunner', kind: 'Rally hatch', style: 'rally', color: '#2a6fb0',
    blurb: 'All-wheel drive and quick hands. At home on gravel and snow.',
    h: {accel: 5.6, brake: 9.4, top: 63, grip: 1.08, steer: .62, steerSpeed: 13, roll: .045, wheelbase: 2.55, length: 4.1, width: .93, soft: 1.05, allRoad: .6},
    sound: {idle: 1000, red: 7600, cyl: 4, cut: 600, vol: .065, whine: .012, drive: 3.6}, gears: 6},
  {id: 'vanta', name: 'Vanta', kind: 'Supercar', style: 'supercar', color: '#e8e2d4',
    blurb: 'Mid-engined and razor sharp. A V10 that screams to 8,700.',
    h: {accel: 7.2, brake: 11, top: 91, grip: 1.25, steer: .52, steerSpeed: 12, roll: .025, wheelbase: 2.65, length: 4.55, width: 1.02, soft: .7},
    sound: {idle: 1000, red: 8700, cyl: 10, cut: 520, vol: .07, whine: .006, drive: 3}, gears: 7},
  {id: 'seraph', name: 'Seraph', kind: 'Hypercar', style: 'hyper', color: '#141719',
    blurb: 'The fastest thing on the road. Huge grip, huge wing, V12 howl.',
    h: {accel: 8.6, brake: 12, top: 97, grip: 1.35, steer: .5, steerSpeed: 12, roll: .02, wheelbase: 2.7, length: 4.75, width: 1.05, soft: .6},
    sound: {idle: 1100, red: 9200, cyl: 12, cut: 600, vol: .07, whine: .01, drive: 3.2}, gears: 7},
];
for (const c of CARS) {
  c.gearList = c.gears === 1 ? [0, c.h.top] : gearsFor(c.h.top, c.gears);
  // the scores shown in the garage, out of 10
  c.stats = {speed: Math.round((c.h.top - 45) / 52 * 9 + 1), accel: Math.round((c.h.accel - 2.8) / 5.8 * 9 + 1), handling: Math.round(((c.h.grip - .85) / .5 * 6 + (c.h.steerSpeed - 7) / 6 * 2 + (.08 - c.h.roll) / .06 * 2) * .9 + 1), comfort: Math.round((c.h.soft - .6) / .8 * 9 + 1)};
  for (const k in c.stats) c.stats[k] = Math.max(1, Math.min(10, c.stats[k]));
}
export const carById = id => CARS.find(c => c.id === id) || CARS[0];

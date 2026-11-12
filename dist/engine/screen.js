// The picture on screen: effects drawn over the whole frame each moment, and the film look you choose.
//   wet tarmac mirrors lamps as long streaks, raindrops gather on the windscreen (cleared by the wipers)
//   or the camera lens, the edges of the picture stream past at speed, the cinematic and photo cameras
//   focus on the car, and a film look (natural, warm film, cool, black and white) with optional grain,
//   cinema bars and lens flare.
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {camera} from './render.js';
import {post} from './post.js';
import {nightAmt, dayAmt, overcast, sunDir, wet} from './lighting.js';
import {structureAt} from './terrain.js';
import {wiperState} from './details.js';
import {$} from './core.js';

const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const LOOKS = {
  natural: {tint: [1, 1, 1], contrast: 1, mono: 0, grain: 0},
  warm: {tint: [1.07, 1, .86], contrast: 1.08, mono: 0, grain: .03},
  cool: {tint: [.92, 1, 1.08], contrast: 1.12, mono: 0, grain: 0},
  mono: {tint: [1, 1, 1], contrast: 1.2, mono: 1, grain: .04},
};
for (const k of ['look', 'grain', 'bars', 'flare', 'blur']) if (state[k] === undefined) state[k] = {look: 'natural', grain: false, bars: false, flare: true, blur: true}[k];

let bars = 0, rainK = 0;
const _p = new T.Vector3(), _up = new T.Vector3(), tint = new T.Vector3(1, 1, 1);
/** Call every frame, after the camera has moved. */
export function updateScreen(dt) {
  const u = post.comp.uniforms, cam = state.cam, photo = !!G.photo, tunnel = structureAt(state.distance) === 2;
  u.uTime.value = G.elapsed;
  // wet roads stay wet for a while after the rain stops
  const rain = G.rainAmt || 0;
  u.uWet.value = wet * (.1 + .9 * nightAmt) * (tunnel ? .3 : 1);
  _up.set(0, 1, 0).transformDirection(camera.matrixWorldInverse); u.uUpV.value.copy(_up);
  // drops on the glass: the windscreen from the driver's seat, the lens from the chase and side cameras
  const glass = !photo && !tunnel && (cam === 1 && (state.ride === 'car' || state.ride === 'coach') ? 1 : cam === 0 || cam === 2 ? .45 : 0);
  rainK += ((rain > .15 ? rain * glass : 0) - rainK) * Math.min(1, dt * .5);
  u.uRain.value = rainK > .02 ? rainK : 0;
  const w = wiperState(); u.uCockpit.value = cam === 1 ? 1 : 0; u.uWipe.value.set(w.t, w.sweep, w.cycle, w.on ? 1 : 0);
  for (const [k, x] of [['uPivA', -.2], ['uPivB', .17]]) { _p.set(x, -.36, -.6).applyMatrix4(camera.projectionMatrix); u[k].value.set(_p.x * .5 + .5, _p.y * .5 + .5); }
  // speed: from about 100 km/h the edges begin to stream
  u.uSpeed.value = state.blur && !photo && cam !== 3 ? smooth(state.speed, 28, 85) * .9 : 0;
  // depth of field in the cinematic and photo cameras, focused on the car
  const dof = photo ? .8 : cam === 3 ? .55 : 0;
  u.uDof.value += (dof - u.uDof.value) * Math.min(1, dt * 2);
  if (u.uDof.value < .01) u.uDof.value = 0;
  if (G.player) { G.player.getWorldPosition(_p); u.uFocus.value = Math.max(2, camera.position.distanceTo(_p)); }
  // the film look
  const L = LOOKS[state.look] || LOOKS.natural;
  tint.lerp(_p.set(...L.tint), Math.min(1, dt * 3)); u.uTint.value.copy(tint);
  u.uContrast.value += (L.contrast - u.uContrast.value) * Math.min(1, dt * 3);
  u.uMono.value += (L.mono - u.uMono.value) * Math.min(1, dt * 3);
  u.uGrain.value = Math.max(L.grain, state.grain ? .035 : 0);
  const want = state.bars ? Math.max(0, (1 - (innerWidth / innerHeight) / 2.39) / 2) : 0;
  bars += (want - bars) * Math.min(1, dt * 3); u.uBars.value = bars > .002 ? bars : 0;
  u.uFlare.value = state.flare ? 1 : 0;
  // the sun is low enough, clear enough and in front of us to flare
  _p.copy(sunDir).multiplyScalar(1000).add(camera.position).project(camera);
  u.uSunVis.value = _p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1 ? dayAmt * smooth(sunDir.y, -.01, .05) * (1 - overcast) * (1 - smooth(Math.hypot(_p.x, _p.y), .9, 1.1)) : 0;
}

/* ------------------------------------------------------------ the Look settings */
function syncLook() {
  document.querySelectorAll('#look button').forEach(b => b.classList.toggle('active', b.dataset.value === state.look));
  for (const k of ['grain', 'bars', 'flare', 'blur']) { const el = $('#look-' + k); if (el) el.checked = !!state[k]; }
}
$('#look')?.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.look = b.dataset.value; syncLook(); });
for (const k of ['grain', 'bars', 'flare', 'blur']) $('#look-' + k)?.addEventListener('change', e => { state[k] = e.target.checked; });
syncLook();
export {syncLook};

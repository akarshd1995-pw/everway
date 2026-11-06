// Small details on your own vehicle: indicators that blink before a fork and when you change lane,
// hazard lights for a few seconds after a knock, and windscreen wipers in the driver's view when it rains.
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {scene, camera} from './render.js';
import {headGlow, traffic} from './actors.js';
import {forkSignal} from './fork.js';
import {autoSignal} from './physics.js';
import {sfx} from './audio.js';
import {structureAt} from './terrain.js';
import {toast} from './hud.js';

/* ------------------------------------------------------------ indicators */
const amber = headGlow.clone(); amber.color.set('#ffa22a'); amber.opacity = 0;
let fitted = null, blinkT = 0, lit = false, hazardT = 0, lastDamage = 0, laneT = 0, laneDir = 0;
/** Put four amber lamps on the corners of the player's vehicle (again whenever the vehicle changes). */
function fit() {
  const v = G.player; fitted = v; if (!v || state.ride === 'cycle') return;
  const lp = v.userData.lampPos, corners = [];
  if (lp) { for (const p of lp.tail) corners.push([p[0] * 1.13, p[1], p[2]]); for (const p of lp.head) corners.push([p[0] * 1.13, p[1], p[2]]); }
  else { const L = state.ride === 'coach' ? 5.6 : 1.05; corners.push([-.8, .9, L], [.8, .9, L], [-.8, .9, -L], [.8, .9, -L]); }
  for (const c of corners) { const s = new T.Sprite(amber); s.position.set(...c); s.scale.setScalar(.55); s.userData.side = Math.sign(c[0]); s.userData.indicator = true; v.add(s); }
}
function updateIndicators(dt, run) {
  if (G.player !== fitted) fit();
  // which way: towards the road taken at a fork, the way you are moving across the road, or both after a knock
  if ((state.damage || 0) > lastDamage + .01) hazardT = 4; lastDamage = state.damage || 0; hazardT = Math.max(0, hazardT - dt);
  if (state.mode === 'manual' && state.speed > 5 && Math.abs(state.psi || 0) > .06) { laneT += dt; laneDir = Math.sign(state.psi); } else laneT = Math.max(0, laneT - dt * 2);
  const want = !run || state.crashed ? 0 : hazardT > 0 ? 2 : autoSignal() || forkSignal || (laneT > .25 ? laneDir : 0);
  if (!want) { amber.opacity = 0; blinkT = 0; lit = false; return; }
  blinkT += dt; const on = (blinkT % .72) < .38;
  if (on !== lit) { lit = on; sfx(on ? 'tick' : 'tock'); }
  amber.opacity = on ? 1 : 0;
  for (const s of G.player.children) if (s.userData.indicator) s.visible = want === 2 || s.userData.side === want;
}

/* ------------------------------------------------------------ wipers */
// two blades at the bottom of the windscreen, sweeping while it rains (seen from the driver's seat)
const wipers = new T.Group(); wipers.visible = false; camera.add(wipers); if (!camera.parent) scene.add(camera);
const bladeM = new T.MeshBasicMaterial({color: '#141819'});
const blades = [-.2, .17].map(x => { const pivot = new T.Group(); pivot.position.set(x, -.36, -.6);
  const arm = new T.Mesh(new T.BoxGeometry(.006, .3, .002), bladeM); arm.position.y = .15; pivot.add(arm);
  const blade = new T.Mesh(new T.BoxGeometry(.012, .34, .003), bladeM); blade.position.set(.008, .2, .001); pivot.add(blade);
  wipers.add(pivot); return pivot; });
let wipeT = 0;
function updateWipers(dt) {
  const rain = G.rainAmt || 0, show = state.cam === 1 && (state.ride === 'car' || state.ride === 'coach') && !G.photo && (rain > .15 || wipeT > 0);
  wipers.visible = show;
  if (!show) { wipeT = 0; return; }
  // a sweep out and back, then a pause that gets shorter the harder it rains
  const sweep = 1.1, pause = Math.max(0, 1.6 - rain * 1.5);
  wipeT += dt; if (wipeT > sweep + pause) wipeT = 0;
  const t = Math.min(1, wipeT / sweep), a = Math.sin(Math.PI * t);
  for (const p of blades) p.rotation.z = -1.45 + a * 1.75;   // resting flat along the bottom, sweeping up across the glass
}

/* ------------------------------------------------------------ headlights */
// Dipped or full beam (L), and a quick double flash (F). Autodrive dips for oncoming traffic and for a
// car ahead by itself. Driving yourself, an oncoming driver flashes you if you leave full beam on;
// and when a tractor pulls in to let you by, a flash says thanks.
state.beam = 'dipped'; G.beamK = 1; G.flash = 0;
let flashT = 0, glareT = 0, glareSaid = -1e9, autoBeam = true;
const dark = () => (G.nightAmt || 0) > .2 || structureAt(state.distance) === 2;
function oncoming(range) { for (const c of traffic) { const u = c.userData; if (c.visible && u.direction === -1 && u.s - state.distance > 10 && u.s - state.distance < range) return c; } return null; }
function carAhead(range) { for (const c of traffic) { const u = c.userData; if (c.visible && u.direction === 1 && u.s - state.distance > 5 && u.s - state.distance < range && Math.abs((u.lat ?? 3) - (state.side ?? 3)) < 2) return c; } return null; }
addEventListener('keydown', e => {
  if (['INPUT', 'SELECT'].includes(document.activeElement.tagName) || e.repeat || !state.started) return;
  const k = e.key.toLowerCase();
  if (k === 'l') { state.beam = state.beam === 'full' ? 'dipped' : 'full'; autoBeam = false; toast(state.beam === 'full' ? 'Full beam.' : 'Dipped headlights.'); }
  if (k === 'f') flashLights();
});
export function flashLights() {
  flashT = .7;
  const c = G.courtesy;
  if (c && G.elapsed < c.until && state.distance > c.u.s + 5) { G.courtesy = null; setTimeout(() => toast('The tractor driver raises a hand.'), 600); }
}
const flashCar = new Map();
function updateLights(dt, run) {
  // flash: two short bright pulses
  flashT = Math.max(0, flashT - dt); G.flash = flashT > 0 && ((.7 - flashT) % .35) < .18 ? 1 : 0;
  if (state.mode === 'cruise' || autoBeam) {
    autoBeam = state.mode === 'cruise' ? true : autoBeam;
    state.beam = dark() && !oncoming(320) && !carAhead(140) ? 'full' : 'dipped';
  }
  G.beamK += ((state.beam === 'full' && dark() ? 1.8 : 1) - G.beamK) * Math.min(1, dt * 6);
  // driving yourself with full beam into oncoming traffic: they flash you
  const oc = run && state.mode === 'manual' && state.beam === 'full' && dark() ? oncoming(220) : null;
  glareT = oc ? glareT + dt : 0;
  if (oc && glareT > 1.2 && !flashCar.has(oc)) { flashCar.set(oc, 1.2); if (G.elapsed - glareSaid > 60) { glareSaid = G.elapsed; toast('An oncoming driver flashed you. Press L to dip your lights.'); } }
  for (const [c, t] of flashCar) {
    const left = t - dt, on = left > 0 && ((1.2 - left) % .4) < .2;
    for (const sp of c.userData.glows || []) if (sp.position.z < 0) { sp.userData.flashOn = on; sp.scale.setScalar(on ? 2.4 : 1.05); }
    if (left <= 0) flashCar.delete(c); else flashCar.set(c, left);
  }
  // our own head lamps glow while flashing, even by day
  for (const sp of G.player?.userData.glows || []) if (sp.position.z < 0) { sp.userData.flashOn = !!G.flash; sp.scale.setScalar(G.flash ? 2.6 : state.beam === 'full' && dark() ? 1.7 : 1.05); }
}

/* ------------------------------------------------------------ a word about ice */
let iceT = 0;
function updateIce(dt, run) { iceT = Math.max(0, iceT - dt); if (run && state.ice && state.speed > 8 && iceT === 0) { iceT = 60; toast('Ice on the road. Gently does it.'); } }

/** Call every frame. */
export function updateDetails(dt, run) { updateIndicators(dt, run); updateWipers(dt); updateIce(dt, run); updateLights(dt, run); }

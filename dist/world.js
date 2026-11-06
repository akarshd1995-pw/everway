// Everway: the realistic WebGL2 world. Each part of the engine lives in ./engine/ — this file only
// runs the frame loop in order: simulate, generate, place, light, render.
import * as T from './three.module.js';
import {clamp,lerp,smooth} from './engine/core.js';
import {G,state} from './engine/state.js';
import {camera,renderer,scene} from './engine/render.js';
import {post} from './engine/post.js';
import {wind} from './engine/materials.js';
import {roadX,roadHeight} from './engine/road.js';
import {updateChunks,LAKE} from './engine/chunks.js';
import {renderReflection} from './engine/reflect.js';
import {updateFar,setViewDistance} from './engine/far.js';
import './engine/look.js';
import {bakeEnvironment,cloudU,mountains} from './engine/sky.js';
import {carShadow,headlights} from './engine/actors.js';
import {dayAmt,nightAmt,overcast,sunDir,updateLighting} from './engine/lighting.js';
import {drive,crash} from './engine/physics.js';
import {updatePlayer,updateTraffic,updateLamps,updateSmoke} from './engine/vehicle.js';
import {updateBirds} from './engine/birds.js';
import {updateLife} from './engine/life.js';
import {updateFork} from './engine/fork.js';
import {updateDetails} from './engine/details.js';
import {updateTrip} from './engine/trip.js';
import {updateEvents} from './engine/events.js';
import {recordReplay, replayFrame} from './engine/replay.js';
import {updateWeather,updatePrecipitation} from './engine/weather.js';
import {updateCamera} from './engine/camera.js';
import {updateAudio,sfx} from './engine/audio.js';
import {toast,updateHud} from './engine/hud.js';
import {applyQuality,adaptQuality} from './engine/quality.js';
import {keys,totalled,pollPad,rumble} from './engine/ui.js';
import {frameStart,frameEnd} from './engine/debug.js';
import {pictureFrameEnd} from './engine/photo.js';
import {trackDrive} from './engine/progress.js';

// where the sun is on screen, and how strongly its light shafts show (low sun, broken cloud, sun ahead)
const _sv = new T.Vector3();
function sunRays() {
  const u = post.comp.uniforms;
  _sv.copy(sunDir).multiplyScalar(1000).add(camera.position).project(camera);
  const ahead = _sv.z < 1 ? 1 - smooth(Math.max(Math.abs(_sv.x), Math.abs(_sv.y)), .9, 1.6) : 0;
  u.sunUv.value.set(_sv.x * .5 + .5, _sv.y * .5 + .5);
  const low = 1 - smooth(sunDir.y, .15, .65);
  u.rays.value = ahead * dayAmt * smooth(sunDir.y, -.02, .06) * (1 - overcast * .75) * (.05 + .1 * low) * (state.view === 'driver' ? .8 : 1);
  u.rayCol.value.set(1, .9 - low * .12, .76 - low * .2);
}
applyQuality();
setViewDistance();
G.lastIndex = -999; G.elapsed = 0; G.frozen = false;

// moments worth a word on screen (and a sound)
function onDriveEvent(ev) {
  if (ev === 'crash' || ev === 'knock') rumble(ev === 'crash' ? 1 : .55, ev === 'crash' ? 400 : 160);
  if (ev === 'crash') { sfx(state.crashed === 'sea' ? 'splash' : 'thud'); totalled(state.crashed); }
  else if (ev === 'knock') { sfx('thud'); toast(state.damage > .6 ? 'That one hurt. One more knock and she’s done.' : 'Bump! A dent, nothing worse.'); }
  else if (ev === 'back') toast('Back on the road.');
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (G.hold) { last = now; return; }   // debug: keep the last picture (page screenshots)
  const t0 = performance.now();
  frameStart();
  const dt = G.frozen ? 0 : clamp((now - last) / 1000, 0, .1); last = now;
  G.elapsed += dt;
  pollPad();
  const run = state.started && !state.paused && !G.replay;
  const shown = run || !!G.replay;   // the vehicle moves on screen (driving, or a replay)
  replayFrame(dt);

  // simulate
  if (run) {
    const ev = drive(dt, keys);
    if (ev) onDriveEvent(ev);
    trackDrive(dt);
    recordReplay(dt);
    if (state.autoTime) state.time = (state.time + dt * .012) % 24;
  }
  updateWeather(dt, run);

  // generate and place the world around the player
  // the world is shifted so the player stays near the origin (x and height), keeping numbers small
  const base = roadX(state.distance), yBase = roadHeight(state.distance);
  updateChunks(state.distance, base, yBase);
  updateFar(state.distance, base, yBase);
  updatePlayer(dt, shown, keys, yBase);
  { const t = updateTraffic(dt, run, base, yBase); if (t) onDriveEvent(t); }
  updateLife(dt, run, base, yBase);
  updateFork(dt, run, base, yBase);
  updateTrip(dt, run, base, yBase);
  updateEvents(dt, run, base, yBase);
  updateDetails(dt, run);

  // sky, wind, light
  cloudU.uOffset.value += dt * ((G.weatherNow === 'windy' ? 9 : 2.5) + state.speed * .04);
  mountains.rotation.y = -base * .00006; mountains.position.y = -yBase;
  wind.time.value = G.elapsed;
  wind.amount.value = lerp(wind.amount.value, G.weatherNow === 'windy' ? .32 : G.weatherNow === 'rainy' ? .14 : .05, dt);
  updateLighting(dt);
  { // headlights point where the vehicle points
    const P = G.player.position, th = G.player.rotation.y, fx = -Math.sin(th), fz = -Math.cos(th), rx = Math.cos(th), rz = -Math.sin(th);
    for (let i = 0; i < headlights.length; i++) { const l = headlights[i], o = i === 0 ? -.65 : .65;
      l.position.set(P.x + rx * o + fx * 1.7, P.y + 1.1, P.z + rz * o + fz * 1.7); l.target.position.set(P.x + rx * o + fx * 65, P.y + .1, P.z + rz * o + fz * 65); } }
  updatePrecipitation(dt);
  updateSmoke(dt);
  updateBirds(dt, yBase);
  updateCamera(dt, base, yBase);
  carShadow.position.set(G.player.position.x, G.player.position.y + .05 - (state.airborne ? 50 : 0), 0); carShadow.rotation.z = -G.player.rotation.y;
  if (state.ride === 'coach') carShadow.scale.set(1, 2.3, 1); else carShadow.scale.setScalar(state.ride === 'car' ? 1 : .55);
  updateLamps(nightAmt > .2);
  updateHud(dt, run, nightAmt);

  // reflections follow the sky, but only re-bake when it has visibly changed
  G.envTimer += dt;
  const key = sunDir.x * 40 + sunDir.y * 400 + overcast * 50 + nightAmt * 30;
  if (G.envTimer > 8 || (G.envTimer > 3 && Math.abs(key - G.lastEnvKey) > 1.5)) { G.envTimer = 0; G.lastEnvKey = key; bakeEnvironment(); }

  // render
  if (G.quality.post) { sunRays(); renderReflection(camera, G.lakeLevel, LAKE); post.render(scene, camera, G.quality.bloom ? .24 + nightAmt * .45 : 0, 1.05, G.quality.ao * (.55 + .45 * dayAmt)); }
  else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
  pictureFrameEnd();
  adaptQuality(dt);
  updateAudio(shown, dt);
  frameEnd(performance.now() - t0);
}

camera.position.set(5.2, 3.3, 8.5);
bakeEnvironment();
requestAnimationFrame(frame);

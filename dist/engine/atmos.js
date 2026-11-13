// Weather you can feel: thunderstorms with lightning and thunder, fog banks that fill the valleys
// (with headlight beams you can see in the fog), snow that settles on the road and the car, a heat
// haze over the desert road, the glow of a town in the night sky, and glitter on the sea.
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {scene, camera} from './render.js';
import {hemi, headlights} from './actors.js';
import {skyU, cloudU} from './sky.js';
import {nightAmt, dayAmt, sunDir, moonDir} from './lighting.js';
import {biomeAt} from './biomes.js';
import {roadX, sideX} from './road.js';
import {villageNear} from './chunks.js';
import {MAT} from './materials.js';
import {seaU} from './far.js';
import {post} from './post.js';
import {sfx} from './audio.js';
import {toast} from './hud.js';
import {carSnow} from './carreflect.js';
import {seasonName} from './season.js';

const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);

/** The weather you chose (or the forecast) can be a storm or fog: underneath they are rain and cloud. */
export const baseWeather = v => v === 'stormy' ? 'rainy' : v === 'foggy' ? 'cloudy' : v;
export function setWeatherKind(v) { G.stormy = v === 'stormy'; G.foggy = v === 'foggy'; }

/* ------------------------------------------------------------ lightning */
const boltMat = new T.LineBasicMaterial({color: new T.Color(3.2, 3.3, 4), transparent: true, opacity: 0, fog: false, depthWrite: false});
const bolt = new T.LineSegments(new T.BufferGeometry(), boltMat); bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
function makeBolt(x, z) {
  // a jagged stroke from the cloud base down to the ground, with a couple of forks
  const pts = [], seg = (x0, y0, z0, len, steps, spread) => {
    let px = x0, py = y0, pz = z0;
    for (let i = 0; i < steps; i++) { const nx = px + rnd(-spread, spread), ny = py - len / steps * rnd(.7, 1.3), nz = pz + rnd(-spread, spread) * .5; pts.push(px, py, pz, nx, ny, nz); px = nx; py = ny; pz = nz;
      if (Math.random() < .12 && steps > 6) seg(px, py, pz, len * .35, 6, spread * .8); }
  };
  seg(x, 620, z, 640, 22, 28);
  bolt.geometry.dispose(); bolt.geometry = new T.BufferGeometry(); bolt.geometry.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
}
let nextStrike = 8, flashes = [], storm = 0, fog = 0, said = {storm: false, fog: false};
function strike() {
  camera.getWorldDirection(_w); const yaw = Math.atan2(_w.x, _w.z) + rnd(-1.4, 1.4), d = rnd(700, 3200);
  const x = camera.position.x + Math.sin(yaw) * d, z = camera.position.z + Math.cos(yaw) * d;
  makeBolt(x, z); bolt.position.set(0, camera.position.y - 40, 0);
  const t0 = G.elapsed; flashes = [[t0, .09, 1], [t0 + .13, .07, .6], [t0 + .26 + Math.random() * .2, .12, .9]];
  // thunder: about three seconds for every kilometre
  const pan = Math.max(-1, Math.min(1, Math.sin(yaw - Math.atan2(_w.x, _w.z)) * -1));
  setTimeout(() => sfx('thunder', {dist: d, pan}), d / 343 * 1000);
}
const _w = new T.Vector3(), _p = new T.Vector3();

/* ------------------------------------------------------------ headlight beams in fog */
const beamMat = new T.ShaderMaterial({
  uniforms: {uK: {value: 0}},
  vertexShader: `varying float vT;varying vec3 vN,vV;void main(){vT=uv.y;vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform float uK;varying float vT;varying vec3 vN,vV;void main(){float edge=pow(abs(dot(vN,vV)),1.5);float a=uK*edge*pow(vT,1.4)*.3;gl_FragColor=vec4(vec3(1.,.95,.82)*a,a);}`,
  transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
});
const beamGeo = new T.ConeGeometry(4.5, 34, 20, 1, true); beamGeo.translate(0, -17, 0); beamGeo.rotateX(-Math.PI / 2);   // apex at the lamp, opening forwards (-z)
let beamCar = null; const beams = [];
function fitBeams(car) {
  for (const b of beams) b.removeFromParent(); beams.length = 0; beamCar = car; if (!car || state.ride === 'cycle') return;
  const heads = car.userData.lampPos?.head || [[-.65, .75, -2.1], [.65, .75, -2.1]];
  for (const h of heads.slice(0, 2)) { const m = new T.Mesh(beamGeo, beamMat); m.position.set(h[0], h[1], h[2]); m.rotation.x = -.06; m.renderOrder = 5; car.add(m); beams.push(m); }
}

/* ------------------------------------------------------------ town glow */
let glowT = 0;
function townGlow() {
  const d = state.distance; let best = null;
  for (let s = d - 1200; s <= d + 3200; s += 160) {
    if (Math.abs(s - d) < 300) continue;
    const v = villageNear(s), town = biomeAt(s) === 'town';
    if (town || (v && Math.abs(v.vc - s) < 130)) { const dist = Math.abs(s - d); if (!best || dist < best.dist) best = {s, dist, k: town ? 1 : .55}; }
  }
  if (!best) { skyU.uTownGlow.value.w *= .9; return; }
  _p.set(roadX(best.s) - (G.base || 0), 0, d - best.s);
  const dx = _p.x - camera.position.x, dz = _p.z - camera.position.z;
  skyU.uTownGlow.value.set(dx, 0, dz, best.k * (1 - smooth(best.dist, 600, 3600)));
}

const SEASON_SAY = {spring: 'Spring: the first green, and blossom.', summer: 'Summer has come.', autumn: 'Autumn: the leaves are turning gold.', winter: 'Winter: the first frost and snow.'};
/** Call every frame, after the lighting. */
export function updateAtmos(dt, run) {
  // through the year: the season where you are now (the land ahead already shows what is coming)
  if (state.seasonJourney) { const n = seasonName(state.distance); if (n !== state.season) { state.season = n; document.querySelectorAll('#season button').forEach(b => b.classList.toggle('active', b.dataset.value === n)); if (run) toast(SEASON_SAY[n]); } }
  const w = G.weatherNow, rain = G.rainAmt || 0;
  // storm and fog come and go gently
  storm += (((G.stormy && w === 'rainy') ? rain : 0) - storm) * Math.min(1, dt * .3);
  fog += (((G.foggy && w === 'cloudy') ? 1 : 0) - fog) * Math.min(1, dt * .15);
  G.stormAmt = storm; G.fogAmt = fog;
  if (storm > .5 && !said.storm) { said.storm = true; toast('A storm is coming in.'); } else if (storm < .1) said.storm = false;
  if (fog > .5 && !said.fog) { said.fog = true; toast('Fog. Headlights on, and take it gently.'); } else if (fog < .1) said.fog = false;

  // a storm darkens everything; lightning lights it all for an instant
  if (storm > .01) {
    hemi.intensity *= 1 - .45 * storm; skyU.uZenith.value.multiplyScalar(1 - .55 * storm); skyU.uHorizon.value.multiplyScalar(1 - .4 * storm); scene.fog.color.multiplyScalar(1 - .35 * storm);
    // heavy, dark-bellied clouds rolling in, and the whole picture a little darker
    cloudU.uLit.value.multiplyScalar(1 - .55 * storm); cloudU.uShade.value.multiplyScalar(1 - .6 * storm); cloudU.uCover.value = Math.max(cloudU.uCover.value, .9 + .1 * storm);
    post.comp.uniforms.exposure.value *= 1 - .3 * storm;
  }
  if (run && storm > .55) { nextStrike -= dt; if (nextStrike < 0) { strike(); nextStrike = rnd(6, 22) / storm; } }
  let flash = 0; for (const [t0, len, k] of flashes) { const e = G.elapsed - t0; if (e > 0 && e < len) flash = Math.max(flash, k * (1 - e / len)); }
  if (flashes.length && G.elapsed > flashes[flashes.length - 1][0] + 1) flashes = [];
  G.lightning = flash;
  bolt.visible = flash > .05; boltMat.opacity = flash;
  skyU.uFlash.value = flash * .9;
  if (flash > 0) { hemi.intensity += flash * 2.6; cloudU.uLit.value.addScalar(flash * 1.4); }

  // fog banks: the valleys fill and the light goes grey and soft
  if (fog > .01) { scene.fog.color.lerp(_c.setRGB(.74, .77, .79).multiplyScalar(.25 + .75 * Math.max(dayAmt, .15)), fog * .6); }
  // headlight beams show in fog, rain and snow after dark (or in thick fog by day)
  if (G.player !== beamCar) fitBeams(G.player);
  const lightsOn = headlights[0] && headlights[0].intensity > .1 ? 1 : 0;
  beamMat.uniforms.uK.value = lightsOn * Math.min(1, fog * 1.2 + rain * .45 + (G.snowAmt || 0) * .5) * (.35 + .65 * nightAmt) * (G.beamK || 1);
  for (const b of beams) b.visible = beamMat.uniforms.uK.value > .01 && state.cam !== 1;

  // snow settles while it falls and melts slowly afterwards; in winter a little lies at the edges anyway
  const base = state.season === 'winter' ? .3 : 0, snowing = G.snowAmt || 0;
  G.snowCover = Math.max(base, Math.min(1, (G.snowCover || 0) + (snowing > .3 ? dt / 80 * snowing : -dt / (base ? 600 : 300))));
  if (biomeAt(state.distance) === 'desert') G.snowCover = Math.max(0, G.snowCover - dt / 20);
  MAT.road.userData.snow.value = G.snowCover;
  carSnow.value = Math.max(0, G.snowCover * (snowing > .3 ? 1 : .8));

  // the desert road shimmers in the heat of the day
  const hot = biomeAt(state.distance) === 'desert' && (w === 'sunny' || w === 'windy') ? dayAmt * smooth(state.time, 9.5, 12) * (1 - smooth(state.time, 16, 18.5)) : 0;
  const cu = post.comp.uniforms; if (cu.uHaze) { cu.uHaze.value += (hot - cu.uHaze.value) * Math.min(1, dt); cu.uHazeCol.value.copy(skyU.uHorizon.value); }

  // the town over the hill lights the night sky
  glowT -= dt; if (glowT < 0) { glowT = 2; townGlow(); }

  // the sea glitters along a path towards the sun or the moon
  seaU.uSunD.value.copy(sunDir); seaU.uSunC.value.copy(skyU.uSunCol.value).multiplyScalar(1 - (G.stormAmt || 0));
  seaU.uMoonD.value.copy(moonDir); seaU.uMoonK.value = nightAmt * smooth(moonDir.y, 0, .1) * (w === 'sunny' || w === 'windy' ? 1 : .2);
}
const _c = new T.Color();
export {strike};

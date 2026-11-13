// Weather choice along the journey and the rain / snow particles that follow the camera.
import {lerp} from './core.js';
import {dayAmt} from './lighting.js';
import {G,state} from './state.js';
import {biomeAt} from './biomes.js';
import {FLAKES,RAIN,flakeGeo,flakeMat,flakePos,rain,rainGeo,rainHead,rainMat,rainPos,snowfall} from './actors.js';

export function pickWeather() {
  const b = biomeAt(state.distance);
  const k = Math.floor(state.distance / 950) + (state.weatherOffset || 0);
  if (b === 'planet') return ['sunny', 'windy', 'sunny'][k % 3];
  if (b === 'snow' || (state.season === 'winter' && b !== 'desert')) return ['snowy', 'cloudy', 'snowy', 'sunny'][k % 4];
  const w = ['sunny', 'cloudy', 'windy', 'rainy', 'sunny'][k % 5], h = ((k * 2654435761) >>> 0) / 4294967296;
  // some rain comes as a thunderstorm (more in summer), some cloudy spells as fog (mostly mornings and in winter and autumn)
  if (state.weather === 'auto') {
    G.stormy = w === 'rainy' && b !== 'desert' && h < (state.season === 'summer' ? .55 : .3);
    G.foggy = w === 'cloudy' && b !== 'desert' && h < ((state.time < 11 || state.season === 'autumn' || state.season === 'winter') ? .55 : .2);
  }
  return w;
}

// Weather changes in stages, as it does outside: before rain the clouds gather and the light dims,
// and only then does it start; afterwards the rain stops first and the clouds clear later.
let weatherTimer = 0, stageTimer = 0;
const wetKind = w => w === 'rainy' || w === 'snowy';
export function changeWeather(next) {
  const now = G.weatherNow;
  if (next === now) { G.weatherNext = null; return; }
  if (wetKind(next) !== wetKind(now) && now !== 'cloudy') { G.weatherNow = 'cloudy'; G.weatherNext = next; stageTimer = wetKind(next) ? 22 : 28; }
  else { G.weatherNow = next; G.weatherNext = null; }
}
export function updateWeather(dt, run) {
  if (G.weatherNext) { stageTimer -= dt; if (stageTimer <= 0) { G.weatherNow = G.weatherNext; G.weatherNext = null; } }
  if (!run) return;
  weatherTimer += dt;
  if (weatherTimer > 50) { weatherTimer = 0; if (state.weather === 'auto') changeWeather(pickWeather()); }
}

export function updatePrecipitation(dt) {
  const rainOn = G.weatherNow === 'rainy', snowOn = G.weatherNow === 'snowy';
  // rain and snow build up over several seconds (and ease off the same way)
  const k = Math.min(1, dt * (G.snapWeather > 0 ? 20 : .22));
  G.rainAmt = lerp(G.rainAmt || 0, rainOn ? 1 : 0, k); G.snowAmt = lerp(G.snowAmt || 0, snowOn ? 1 : 0, k);
  rainMat.opacity = (.12 + .2 * G.rainAmt) * (.4 + .6 * dayAmt);   // rain catches less light at night flakeMat.opacity = .5 + .4 * G.snowAmt;
  rainGeo.setDrawRange(0, Math.floor(RAIN * G.rainAmt) * 2); flakeGeo.setDrawRange(0, Math.floor(FLAKES * G.snowAmt));
  rain.visible = G.rainAmt > .01; snowfall.visible = G.snowAmt > .01;
  if (rain.visible) {
    const vx = G.weatherNow === 'windy' ? 6 : 2, vy = -30, vz = state.speed, len = .032;
    for (let i = 0; i < RAIN; i++) {
      let x = rainHead[i * 3] + vx * dt, y = rainHead[i * 3 + 1] + vy * dt, z = rainHead[i * 3 + 2] + vz * dt;
      if (y < 0) { y = 30; x = (Math.random() - .5) * 90; }
      if (z > 14) z -= 95;
      rainHead[i * 3] = x; rainHead[i * 3 + 1] = y; rainHead[i * 3 + 2] = z;
      const o = i * 6;
      rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z; rainPos[o + 3] = x - vx * len; rainPos[o + 4] = y - vy * len; rainPos[o + 5] = z - vz * len;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  if (snowfall.visible) {
    for (let i = 0; i < FLAKES; i++) {
      flakePos[i * 3 + 1] -= dt * 2.6; flakePos[i * 3] += dt * Math.sin(G.elapsed * .7 + i) * .7; flakePos[i * 3 + 2] += dt * state.speed;
      if (flakePos[i * 3 + 1] < 0) { flakePos[i * 3 + 1] = 40; flakePos[i * 3] = (Math.random() - .5) * 120; }
      if (flakePos[i * 3 + 2] > 18) flakePos[i * 3 + 2] = -112;
    }
    flakeGeo.attributes.position.needsUpdate = true;
  }
}

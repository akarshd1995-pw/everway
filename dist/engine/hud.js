// On-screen messages and the dashboard read-outs. DOM is touched only when a value changes.
import {$,clamp} from './core.js';
import {G,state} from './state.js';
import {REAL} from './render.js';
import {BIOMES,biomeAt} from './biomes.js';
import {roadX,sideX} from './road.js';

let toastTimer;
/** Remember an achievement. Returns true the first time. */
export function achieve(key) {
  try { const k = 'everway.achievements', got = JSON.parse(localStorage.getItem(k) || '{}'); if (got[key]) return false; got[key] = Date.now(); localStorage.setItem(k, JSON.stringify(got)); } catch { /* storage unavailable: still say it */ }
  return true;
}
export function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3300);
}

const el = {};
for (const id of ['region', 'weatherfx', 'motion', 'speedometer', 'distance', 'clock', 'clocklabel', 'time', 'condition', 'rendererMode']) el[id] = $('#' + id);
const last = {};
const put = (key, value, write) => { if (last[key] !== value) { last[key] = value; write(value); } };

let regionNow = '', flashT = 0;
/** Show the place sign for a few seconds, even on the clean screen. */
function flashPlace() { document.body.classList.add('placeflash'); clearTimeout(flashT); flashT = setTimeout(() => document.body.classList.remove('placeflash'), 7000); }
/** Forget the current region so the next frame announces it again (after a scenery change). */
export function resetRegion() { regionNow = ''; }

let uiTimer = 0;
const gearEl = $('#gearbox'), gearN = $('#gear'), revEl = $('#rev'), dmgEl = $('#damage'), dmgBar = $('#damagebar');
// compass (north arrow) or a heading-up mini-map of the road ahead
const mm = $('#minimap'), mctx = mm.getContext('2d');
let mapTimer = 0;
function drawMap() {
  const mode = state.map || 'compass';
  mm.hidden = mode === 'off'; mm.classList.toggle('big', mode === 'map');
  if (mode === 'off') return;
  const W = mm.width, c = W / 2, th = G.player.rotation.y, cs = Math.cos(th), sn = Math.sin(th);
  mctx.clearRect(0, 0, W, W);
  if (mode === 'map') {
    const k = (W / 2 - 10) / 700, x0 = roadX(state.distance) + sideX(state.distance, state.side ?? 3);
    mctx.lineWidth = 7; mctx.lineCap = 'round'; mctx.strokeStyle = 'rgba(255,255,255,.85)'; mctx.beginPath();
    for (let s = state.distance - 250, first = true; s <= state.distance + 800; s += 20) {
      const vx = roadX(s) - x0, vz = -(s - state.distance), px = c + (vx * cs - vz * sn) * k, py = c + (vx * sn + vz * cs) * k;
      if (first) { mctx.moveTo(px, py); first = false; } else mctx.lineTo(px, py);
    }
    mctx.stroke();
    mctx.fillStyle = '#f4b33d'; mctx.beginPath(); mctx.moveTo(c, c - 9); mctx.lineTo(c + 7, c + 7); mctx.lineTo(c, c + 3); mctx.lineTo(c - 7, c + 7); mctx.closePath(); mctx.fill();
  }
  // north: the direction the journey began in
  const R = W / 2 - 13, nx = c + sn * R, ny = c - cs * R;
  if (mode === 'compass') { mctx.strokeStyle = 'rgba(255,255,255,.25)'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(c, c, R, 0, 6.283); mctx.stroke();
    mctx.fillStyle = '#c8392b'; mctx.beginPath(); mctx.moveTo(c + sn * (R - 4), c - cs * (R - 4)); mctx.lineTo(c + cs * 6, c + sn * 6); mctx.lineTo(c - cs * 6, c - sn * 6); mctx.closePath(); mctx.fill();
    mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.moveTo(c - sn * (R - 4), c + cs * (R - 4)); mctx.lineTo(c + cs * 6, c + sn * 6); mctx.lineTo(c - cs * 6, c - sn * 6); mctx.closePath(); mctx.fill(); }
  mctx.fillStyle = '#fff'; mctx.font = `800 ${mode === 'map' ? 18 : 22}px Overpass, sans-serif`; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.fillText('N', mode === 'map' ? nx : c + sn * (R + 6), mode === 'map' ? ny : c - cs * (R + 6));
}

export function updateHud(dt, run, nightAmt) {
  mapTimer += dt; if (mapTimer > .1) { mapTimer = 0; drawMap(); }
  const manual = state.mode === 'manual' && state.gear > 0;
  put('gearOn', manual, v => gearEl.hidden = !v);
  if (manual) { put('gear', state.gear, v => gearN.textContent = v); put('rev', Math.round((state.rev || 0) * 20), v => revEl.style.width = v * 5 + '%'); }
  put('dmg', Math.round((state.damage || 0) * 20), v => { dmgEl.hidden = v === 0; dmgBar.style.width = v * 5 + '%'; });
  const b = biomeAt(state.distance);
  if (b !== regionNow) { regionNow = b; flashPlace(); el.region.textContent = BIOMES[b].name.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); if (state.started) toast(BIOMES[b].name.toLowerCase().replaceAll('the ', 'Welcome to ')); }
  put('night', Math.round(nightAmt * 300), v => document.body.style.setProperty('--night', (v / 1000).toFixed(3)));
  put('fx', G.weatherNow, v => el.weatherfx.className = v);
  put('motion', run ? Math.round(clamp((state.speed - 20) / 22, 0, .14) * 1000) : 0, v => el.motion.style.opacity = v / 1000);
  uiTimer += dt; if (uiTimer <= .2) return; uiTimer = 0;
  el.speedometer.textContent = state.paused ? 0 : Math.round(state.speed * 3.6);
  el.distance.textContent = (state.odometer / 1000).toFixed(2);
  const hour = Math.floor(state.time), minute = Math.floor(state.time % 1 * 60), clock = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  el.clock.textContent = clock + ', ' + (hour < 6 || hour > 19 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'afternoon' : 'golden hour');
  el.clocklabel.textContent = clock;
  if (document.activeElement !== el.time) el.time.value = state.time;
  el.condition.textContent = {sunny: '☀ Clear skies', rainy: '☂ Rain on the road', cloudy: '☁ Cloud cover', windy: '≋ Wind in the fields', snowy: '❄ Soft snowfall'}[G.weatherNow];
  el.rendererMode.textContent = G.quality.label.charAt(0) + G.quality.label.slice(1).toLowerCase() + ' graphics' + (G.qualitySetting === 'auto' ? ', auto' : '') + (REAL ? ', with downloaded scenery' : '');
}

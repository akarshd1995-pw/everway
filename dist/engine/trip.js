// Side roads. Between forks, now and then a brown sign points down a side road to somewhere: a beach
// on the coast, a farm in the countryside, a viewpoint in the hills. Choose to turn off (the card, or
// T) and the road really takes you there: about half a kilometre down a lane that ends at the place.
// Stop, look around (photo mode is good here), then go back to the main road where you left it.
import * as T from '../three.module.js';
import {$} from './core.js';
import {G, state} from './state.js';
import {scene} from './render.js';
import {LEG, biomeAt, terrainParams, CH} from './biomes.js';
import {ROAD, roadX, sideX, roadYaw, roadSeed, roadSurface, switchRoad, restoreRoad} from './road.js';
import {MAT} from './materials.js';
import {ROAD_TILE} from './textures.js';
import {groundHeight, structureAt, coastSide} from './terrain.js';
import {hash2} from './core.js';
import {refreshFrom, rebuild} from './chunks.js';
import {refreshFar} from './far.js';
import {toast} from './hud.js';
import {clearReplay} from './replay.js';
import {grabThumb} from './photo.js';
import {addPostcard} from './progress.js';
import {forkFor} from './fork.js';
import {resetVehicle} from './physics.js';
const veilEl = document.createElement('div'); veilEl.id = 'veil'; document.body.appendChild(veilEl);

export const TRIP_LEN = 520;          // from the turn-off to the end of the lane
const SHOW = 950, LOCK = 260;
const PLACE = {beach: 'the beach', farm: 'a farm', viewpoint: 'a viewpoint'};
const CARD = {beach: 'A quiet beach', farm: 'A farm down a lane', viewpoint: 'A view from the end of the lane'};

/** The side road on leg L (odd legs only, between the forks), or null. */
const cache = new Map();
export function tripFor(L) {
  if (state.biome !== 'auto' && state.biome === 'planet') return null;
  if (L < 1 || L % 2 !== 1) return null;
  const key = L + ':' + roadSeed() + ':' + state.difficulty + ':' + JSON.stringify(state.roadSwitches || []) + ':' + (state.routeOffset || 0) + ':' + state.biome;
  if (cache.has(key)) return cache.get(key);
  let t = null;
  const next = forkFor(L + 1), limit = next ? next.sj - TRIP_LEN - 260 : L * LEG + 1300;   // the lane ends well before the next fork
  // anywhere between the last fork and the next, starting from the middle of that stretch
  for (let at = L * LEG - 300; at < limit && !t; at += 40) {
    let clear = true; for (let d = -150; d <= TRIP_LEN + 120; d += 10) if (structureAt(at + d)) { clear = false; break; }
    if (!clear) continue;
    const b = biomeAt(at), kind = b === 'coast' ? 'beach' : b === 'fields' || b === 'town' ? 'farm' : b === 'mountain' || b === 'snow' || b === 'desert' ? 'viewpoint' : null;
    if (!kind) break;
    const side = kind === 'beach' ? (coastSide(at) || 1) : hash2(L, 313) < .5 ? -1 : 1;
    t = {L, sp: at, end: at + TRIP_LEN, side, kind};
  }
  cache.set(key, t); if (cache.size > 64) cache.clear();
  return t;
}

/* ------------------------------------------------------------ the brown sign */
const cv = document.createElement('canvas'); cv.width = 768; cv.height = 256;
const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
const sign = new T.Group(); sign.visible = false; scene.add(sign);
{ const post = new T.MeshStandardMaterial({color: '#6f7472', roughness: .6, metalness: .3});
  for (const x of [-1.05, 1.05]) { const p = new T.Mesh(new T.CylinderGeometry(.07, .07, 3.2, 8), post); p.position.set(x, 1.6, -.04); sign.add(p); }
  const board = new T.Mesh(new T.PlaneGeometry(3, 1), new T.MeshStandardMaterial({map: tex, roughness: .5})); board.position.y = 2.7; board.castShadow = true; sign.add(board); }
function drawSign(t) {
  const c = cv.getContext('2d');
  c.fillStyle = '#6b3d23'; c.fillRect(0, 0, 768, 256); c.strokeStyle = '#fff'; c.lineWidth = 10; c.strokeRect(16, 16, 736, 224);
  c.fillStyle = '#fff'; c.font = '600 84px "Overpass", "Segoe UI", sans-serif'; c.textBaseline = 'middle';
  const name = {beach: 'Beach', farm: 'Farm', viewpoint: 'Viewpoint'}[t.kind], arrow = t.side < 0 ? '←' : '→';
  c.textAlign = t.side < 0 ? 'left' : 'right'; c.fillText(t.side < 0 ? `${arrow}  ${name}` : `${name}  ${arrow}`, t.side < 0 ? 56 : 712, 104);
  c.font = '600 54px "Overpass", "Segoe UI", sans-serif'; c.fillText(`${(TRIP_LEN / 1000).toFixed(1)} km`, t.side < 0 ? 56 : 712, 186);
  tex.needsUpdate = true;
}

/* ------------------------------------------------------------ the mouth of the lane */
// Before you turn off, a short stretch of the lane is drawn leaving the road, so you can see where it goes.
const laneMat = MAT.road.clone(); laneMat.polygonOffset = true; laneMat.polygonOffsetFactor = -1; laneMat.polygonOffsetUnits = -2;
laneMat.onBeforeCompile = MAT.road.onBeforeCompile; laneMat.customProgramCacheKey = MAT.road.customProgramCacheKey; laneMat.userData = MAT.road.userData;
const mouth = new T.Mesh(new T.BufferGeometry(), laneMat); mouth.visible = false; mouth.receiveShadow = true; scene.add(mouth);
let mouthKey = null;
function buildMouth(t) {
  const H = ROAD.half, W = 3.2, d = t.side, x0 = roadX(t.sp), pos = [], uv = [], col = [], idx = []; let rows = 0;
  for (let k = 0; k <= 150; k += 3) {
    const s = t.sp + k * .55, c = H + W - .5 + k * .8, taper = 1 - smoothstep(k, 115, 150), P = terrainParams(s);
    for (const e of [-1, 1]) { const lat = d * (c + e * W * taper), near = smoothstep(Math.abs(lat), H + 1, H + 6);
      const y = (1 - near) * (roadSurface(s, lat) + .025) + near * (groundHeight(s, lat, P) + .09);
      pos.push(roadX(s) + sideX(s, lat) - x0, y, -(s - t.sp)); uv.push(e < 0 ? .14 : .86, k / ROAD_TILE); col.push(1, 1, 1); }
    if (rows > 0) { const a = (rows - 1) * 2, b = rows * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); } rows++;
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); let up = 0; const n = g.attributes.normal; for (let i = 0; i < n.count; i++) up += n.getY(i);
  if (up < 0) { idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); }
  mouth.geometry.dispose(); mouth.geometry = g; mouth.userData.x0 = x0; mouth.userData.sp = t.sp;
}
const smoothstep = (x, a, b) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

/* ------------------------------------------------------------ the card */
const card = document.createElement('div'); card.id = 'trip'; card.className = 'tripcard'; card.hidden = true;
document.body.appendChild(card);
let cur = null, want = false, signKey = null, answered = false;
// once you have chosen, the card closes; T still changes your mind
function decide(v) { want = v; answered = true; card.hidden = true; toast(v ? `Turning off at the brown sign, to ${PLACE[cur.kind]}. (T to change your mind)` : 'Carrying on along the road.'); }
function showOffer(t) {
  card.innerHTML = `<p class="fork-head">Side road <span>${((t.sp - state.distance) / 1000).toFixed(1)} km</span></p>
    <p class="trip-what">Turn off to ${PLACE[t.kind]}?</p>
    <div class="fork-ways"><button type="button" data-a="go">Turn off</button><button type="button" data-a="stay">Keep going</button></div>
    <p class="fork-hint">Press T to turn off.</p>`;
  card.querySelector('[data-a="go"]').onclick = () => decide(true);
  card.querySelector('[data-a="stay"]').onclick = () => decide(false);
  paintOffer();
}
function paintOffer() { card.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.a === 'go') === want)); }
function showArrived(t) {
  card.innerHTML = `<p class="fork-head">${CARD[t.kind]}</p><p class="trip-what">The lane ends here. Take a look around, or a photo (P).</p>
    <div class="fork-ways"><button type="button" data-a="back" class="on">Back to the main road</button></div>`;
  card.querySelector('[data-a="back"]').onclick = goBack;
}
addEventListener('keydown', e => {
  if (['INPUT', 'SELECT'].includes(document.activeElement.tagName) || e.repeat) return;
  if (e.key.toLowerCase() === 't') { if (G.trip?.arrived) goBack(); else if (cur && !G.trip && state.distance < cur.sp - LOCK) decide(!want); }
});

/* ------------------------------------------------------------ going and coming back */
function turnOff(t) {
  clearReplay();
  const plan = switchRoad(t.sp, t.side, 9000 + t.L);
  G.trip = {...t, plan, arrived: false};
  refreshFrom(Math.floor(t.sp / CH) * CH); refreshFar();
  toast(`Down the lane to ${PLACE[t.kind]}.`);
}
function goBack() {
  const t = G.trip; if (!t) return;
  const veil = $('#veil'); veil.classList.add('on');
  setTimeout(() => {
    restoreRoad(t.plan); G.trip = null; card.hidden = true; clearReplay();
    state.distance = t.sp + 30; resetVehicle(6);
    rebuild(state.distance, true); refreshFar();
    veil.classList.remove('on'); toast('Back on the main road.');
  }, 650);
}

/** Each frame. */
export function updateTrip(dt, run, base, yBase) {
  const s = state.distance, Tr = G.trip;
  if (Tr) {
    sign.visible = false; mouth.visible = false;
    // arrived: stopped near the end of the lane
    if (!Tr.arrived && s > Tr.end - 40 && state.speed < .6) {
      Tr.arrived = true; showArrived(Tr); card.hidden = false;
      const name = CARD[Tr.kind]; grabThumb(img => { if (addPostcard(name, img)) toast('A postcard: ' + name.charAt(0).toLowerCase() + name.slice(1) + '. It is in your journal.'); });
    }
    if (Tr.arrived) card.hidden = !!G.photo || !!G.replay;
    return;
  }
  const L = Math.floor((s + SHOW) / LEG);
  let t = null;
  for (const k of [L - 1, L]) { const c = tripFor(k); if (c && s > c.sp - SHOW && s < c.sp + 40) { t = c; break; } }
  if (t !== cur) { cur = t; want = false; answered = false; if (t) showOffer(t); }
  if (!t) { card.hidden = true; sign.visible = false; mouth.visible = false; return; }
  if (mouthKey !== t.sp) { mouthKey = t.sp; buildMouth(t); }
  mouth.visible = true; mouth.position.set(mouth.userData.x0 - base, -yBase, s - t.sp);
  if (s > t.sp - LOCK) { card.hidden = true; if (want && s < t.sp) { want = false; turnOff(t); return; } }
  else { card.hidden = !run || answered; const km = card.querySelector('.fork-head span'); if (km) km.textContent = ((t.sp - s) / 1000).toFixed(1) + ' km'; }
  if (signKey !== t.sp) { signKey = t.sp; drawSign(t); }
  const ss = t.sp - 170, sl = t.side * (ROAD.half + 2.8);
  sign.visible = s < ss + 40; sign.rotation.y = roadYaw(ss);
  sign.position.set(roadX(ss) + sideX(ss, sl) - base, groundHeight(ss, sl, terrainParams(ss)) - yBase, s - ss);
}
/** A new journey: no side trip. */
export function resetTrip() { mouthKey = null; if (G.trip) { restoreRoad(G.trip.plan); G.trip = null; } cur = null; want = false; card.hidden = true; }

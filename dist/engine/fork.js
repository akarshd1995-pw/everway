// Forks in the road. Every second leg of the journey (about every 3.8 km) the road splits in two,
// with a sign naming the place each way leads. Choose with the card on screen (or ← → while
// autodrive steers, Q / E when you drive yourself). The road you take carries on; the other one
// curves away into the land. The places after the fork follow your choice.
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {scene} from './render.js';
import {MAT} from './materials.js';
import {LEG, legBiome, legDefault, terrainParams} from './biomes.js';
import {ROAD, roadX, sideX, roadSurface, roadYaw, roadSeed, roadCos, switchRoad, ghostAt} from './road.js';
import {refreshFar} from './far.js';
import {CH} from './biomes.js';
import {groundHeight, structureAt} from './terrain.js';
import {hash2} from './core.js';
import {ROAD_TILE} from './textures.js';
import {refreshFrom} from './chunks.js';
import {PLACES} from './progress.js';
import {toast} from './hud.js';

const CHOICES = ['fields', 'coast', 'mountain', 'desert', 'snow', 'town'];
const SHOW = 1700, LOCK = 480;            // the card shows this far before the fork; the choice is fixed at LOCK
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The fork at the start of leg L, or null (none there, or a bridge or tunnel in the way). */
const cache = new Map();
export function forkFor(L) {
  if (state.biome !== 'auto' || L < 2 || L % 2) return null;
  const key = L + ':' + (state.routeOffset || 0) + ':' + JSON.stringify(state.legPick || {}) + ':' + roadSeed() + ':' + state.difficulty;
  if (cache.has(key)) return cache.get(key);
  let f = null;
  // the fork stands a little before the new place begins, where no bridge or tunnel is in the way
  let sj = null;
  for (let at = L * LEG - 220; at > L * LEG - 1100 && sj === null; at -= 40) {
    let clear = true; for (let t = -270; t <= 340; t += 10) if (structureAt(at + t)) { clear = false; break; }
    if (clear) sj = at;
  }
  if (sj !== null) {
    const def = legDefault(L), here = legBiome(L - 1), cands = CHOICES.filter(b => b !== def && b !== here);
    const alt = cands[Math.floor(hash2(L, 77 + (state.routeOffset || 0)) * cands.length)], left = hash2(L, 91) < .5;
    f = {L, sj, def, alt, left: left ? def : alt, right: left ? alt : def};
  }
  cache.set(key, f); if (cache.size > 64) cache.clear();
  return f;
}

/* ------------------------------------------------------------ the other road */
const branchMat = MAT.road.clone(); branchMat.polygonOffset = true; branchMat.polygonOffsetFactor = -1; branchMat.polygonOffsetUnits = -2;
branchMat.onBeforeCompile = MAT.road.onBeforeCompile; branchMat.customProgramCacheKey = MAT.road.customProgramCacheKey;
branchMat.userData = MAT.road.userData;
const branch = new T.Mesh(new T.BufferGeometry(), branchMat); branch.visible = false; branch.receiveShadow = true; scene.add(branch);
let branchKey = '';
/** Lay the branch road at fork f, leaving on side d (-1 left, 1 right). */
function buildBranch(f, d) {
  const H = ROAD.half, E = H + 1.5, cols = [-E, -H, 0, H, E], sj = f.sj, x0 = roadX(sj);
  // where the other road's centre is, square to ours: the road you left (if you turned off), or a
  // road bending away on the other side (if you kept to the planned road)
  const g0 = ghostAt(sj + 1), useGhost = g0 && Math.abs(g0.sj - sj) < 1;
  const centre = t => { if (useGhost) { const g = ghostAt(sj + t); if (g) return Math.abs(g.x - roadX(sj + t)) * roadCos(sj + t); }
    return t <= 45 ? 2 * H * (t / 45) ** 2 : 2 * H + .62 * (t - 45) * (1 + (t - 45) / 400); };
  const pos = [], uv = [], col = [], idx = []; let rows = 0;
  for (let t = 0; t <= 320; t += 3) {
    const s = sj + t, c = centre(t), taper = 1 - smooth(t, 280, 320), P = terrainParams(s);
    if (c + E * taper < H + .6) continue;
    for (const o of cols) {
      let lat = c + o * taper; const inner = H - .25;
      if (lat < inner) lat = inner;                         // where the two roads overlap, the branch starts at the main road's edge
      const L = d * lat, near = smooth(lat, H + 1, H + 7);
      const y = (1 - near) * (roadSurface(s, L) + .025) + near * (groundHeight(s, L, P) + .1);
      pos.push(roadX(s) + sideX(s, L) - x0, y, -t);
      uv.push(((lat - c) / Math.max(taper, .01) * d + E) / (2 * E), t / ROAD_TILE); col.push(1, 1, 1);
    }
    if (rows > 0) { const a = (rows - 1) * 5, b = rows * 5; for (let i = 0; i < 4; i++) { const p = a + i, q = b + i; if (d > 0) idx.push(p, p + 1, q, p + 1, q + 1, q); else idx.push(p, q, p + 1, p + 1, q, q + 1); } }   // (facing up on either side)
    rows++;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  branch.geometry.dispose(); branch.geometry = g; branch.userData.sj = sj; branch.userData.x0 = x0; branch.userData.centre = centre; branch.userData.d = d;
}

/* ------------------------------------------------------------ the sign */
const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 384;
const signTex = new T.CanvasTexture(signCanvas); signTex.colorSpace = T.SRGBColorSpace; signTex.anisotropy = 4;
const sign = new T.Group(); sign.visible = false; scene.add(sign);
{ const post = new T.MeshStandardMaterial({color: '#7d8584', roughness: .6, metalness: .4});
  for (const x of [-1.6, 1.6]) { const p = new T.Mesh(new T.CylinderGeometry(.09, .09, 4.4, 8), post); p.position.set(x, 2.2, -.05); p.castShadow = true; sign.add(p); }
  const board = new T.Mesh(new T.PlaneGeometry(4.6, 1.72), new T.MeshStandardMaterial({map: signTex, roughness: .5})); board.position.y = 3.5; board.castShadow = true; sign.add(board);
  const back = new T.Mesh(new T.PlaneGeometry(4.6, 1.72), new T.MeshStandardMaterial({color: '#9aa3a2', roughness: .6})); back.position.set(0, 3.5, -.02); back.rotation.y = Math.PI; sign.add(back); }
function drawSign(f) {
  const c = signCanvas.getContext('2d'), w = 1024, h = 384;
  c.fillStyle = '#0f6a4f'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 14; c.strokeRect(22, 22, w - 44, h - 44);
  c.fillStyle = '#fff'; c.font = '600 92px "Overpass", "Segoe UI", sans-serif'; c.textBaseline = 'middle';
  c.textAlign = 'left'; c.fillText('←  ' + PLACES[f.left], 64, 130);
  c.textAlign = 'right'; c.fillText(PLACES[f.right] + '  →', w - 64, 262);
  signTex.needsUpdate = true;
}

/* ------------------------------------------------------------ the card on screen */
const card = document.createElement('div'); card.id = 'fork'; card.hidden = true;
card.innerHTML = `<p class="fork-head">Fork in the road <span id="fork-km"></span></p>
  <div class="fork-ways"><button type="button" data-way="left"><span class="arr">←</span><span class="nm"></span></button>
  <button type="button" data-way="right"><span class="nm"></span><span class="arr">→</span></button></div><p class="fork-hint"></p>`;
document.body.appendChild(card);
let cur = null, sel = null, signKey = '';
/** -1 or 1 while the vehicle should signal towards the road it takes at a fork, else 0. */
export let forkSignal = 0;
function choose(way) { if (!cur || state.distance > cur.sj - LOCK) return; sel = cur[way]; paint(); }
card.querySelectorAll('button').forEach(b => b.onclick = () => choose(b.dataset.way));
addEventListener('keydown', e => {
  if (!cur || card.hidden || ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase(), cruise = state.mode === 'cruise';
  if (k === 'q' || (cruise && (e.key === 'ArrowLeft' || k === 'a'))) choose('left');
  if (k === 'e' || (cruise && (e.key === 'ArrowRight' || k === 'd'))) choose('right');
});
function paint() {
  card.querySelector('[data-way="left"] .nm').textContent = PLACES[cur.left];
  card.querySelector('[data-way="right"] .nm').textContent = PLACES[cur.right];
  card.querySelectorAll('button').forEach(b => b.classList.toggle('on', cur[b.dataset.way] === sel));
  card.querySelector('.fork-hint').textContent = state.mode === 'cruise' ? 'Choose with ← or →, or tap a way.' : 'Choose with Q or E, or tap a way.';
}

/* ------------------------------------------------------------ each frame */
export function updateFork(dt, run, base, yBase) {
  if (G.trip) { card.hidden = true; sign.visible = false; branch.visible = false; forkSignal = 0; return; }   // down a side road
  const s = state.distance, L = Math.round((s + 220 + SHOW / 2) / LEG);
  let f = null;
  for (const k of [L - 1, L, L + 1]) { const c = forkFor(k); if (c && s > c.sj - SHOW && s < c.sj + 340) { f = c; break; } }
  if (!f || f !== cur) {
    if (f && (!cur || f.L !== cur.L)) { sel = (state.legPick || {})[f.L] || f.def; }
    cur = f;
    if (!f) { card.hidden = true; branch.visible = false; sign.visible = false; forkSignal = 0; return; }
  }
  // the choice is fixed a little before the fork; if it changes the places ahead, those sections are built again
  const locked = (state.legPick || {})[f.L];
  if (!locked && s > f.sj - LOCK) {
    state.legPick = {...(state.legPick || {}), [f.L]: sel};
    if (sel !== f.def) {
      // the other way: from the fork on, the road bends that way and carries on as a road of its own
      const side = sel === f.left ? -1 : 1;
      state.roadSwitches = [...(state.roadSwitches || []), {sj: f.sj, side, key: f.L}];
      switchRoad(f.sj, side, f.L); branchKey = '';
      refreshFrom(Math.floor(f.sj / CH) * CH); refreshFar();
    }
    if (run) toast(`To ${PLACES[sel]}.`);
  }
  const chosen = locked || sel, side = chosen === f.left ? -1 : 1;
  forkSignal = s > f.sj - 320 && s < f.sj + 15 ? side : 0;
  // the card
  const showCard = run && !locked && s > f.sj - SHOW && s < f.sj - LOCK;
  if (showCard) { if (card.hidden) { card.hidden = false; paint(); } card.querySelector('#fork-km').textContent = ((f.sj - s) / 1000).toFixed(1) + ' km'; }
  else card.hidden = true;
  // the other road leaves on the side not taken
  const key = f.L + ':' + side + ':' + ROAD.half;
  if (key !== branchKey) { branchKey = key; const g = ghostAt(f.sj + 60); buildBranch(f, g && Math.abs(g.sj - f.sj) < 1 ? Math.sign(g.x - roadX(f.sj + 60)) || -side : -side); }
  branch.visible = true; branch.position.set(branch.userData.x0 - base, -yBase, s - f.sj);
  // the sign stands by the road before the fork
  if (signKey !== f.L) { signKey = f.L; drawSign(f); }
  const ss = f.sj - 230, sl = ROAD.half + 3.2;
  sign.visible = s < ss + 60; sign.rotation.y = roadYaw(ss); sign.position.set(roadX(ss) + sideX(ss, sl) - base, groundHeight(ss, sl, terrainParams(ss)) - yBase, s - ss);
}
/** The fork being shown (with its other road), for traffic; or null. */
export const currentFork = () => (cur && branch.visible && branch.userData.centre ? cur : null);
/** Where the other road is, t metres after the fork, square to ours (on its own right-hand lane). */
export function branchAt(t) {
  const c = branch.userData.centre, d = branch.userData.d, sj = branch.userData.sj; if (!c || t < 0) return null;
  const lat = d * c(t) + ROAD.lane, dl = d * (c(t + 2) - c(t)) / 2, s = sj + t, near = smooth(Math.abs(lat), ROAD.half + 1, ROAD.half + 7);
  return {lat, yaw: Math.atan(dl), y: (1 - near) * roadSurface(s, lat) + near * (groundHeight(s, lat, terrainParams(s)) + .1)};
}
/** Forget the choices (a new journey). */
export function resetForks() { state.legPick = {}; state.roadSwitches = []; cur = null; sel = null; branchKey = ''; signKey = ''; card.hidden = true; }

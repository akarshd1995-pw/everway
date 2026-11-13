// Far land and sea. The detailed road sections cover about 400 m either side of the road; beyond
// that a coarse grid of the same land reaches to the view distance, re-centred on the player as
// they drive. Under the detailed sections it is sunk out of sight, so the two never fight.
import * as T from '../three.module.js';
import {clamp, vnoise} from './core.js';
import {seasonName} from './season.js';
import {G, state} from './state.js';
import {camera, scene} from './render.js';
import {MAT, wind} from './materials.js';
import {CH, terrainParams, biomeAt} from './biomes.js';
import {roadCos, roadHeight, roadX} from './road.js';
import {groundHeight, groundColor, SEA_LEVEL} from './terrain.js';
import {builtRange, scheduler} from './chunks.js';
import {mountains, skyDome} from './sky.js';

/** View distance: radius of the far land, fog thinning and how far back the mountain backdrop sits. */
export const VIEW = {
  short:    {label: 'Short',    radius: 0,    fog: 1.45, backdrop: 1},
  medium:   {label: 'Medium',   radius: 2200, fog: .8,    backdrop: 1.35},
  far:      {label: 'Far',      radius: 3800, fog: .52,  backdrop: 2.1},
  veryfar:  {label: 'Very far', radius: 6500, fog: .34,  backdrop: 3.4},
};
const N = 128;                     // cells across the grid
const STRIP = 400;                 // half width of the detailed sections

let view = VIEW.medium, anchor = null, pending = false, current = null;

function gridGeometry() {
  const g = new T.BufferGeometry(), n = (N + 1) * (N + 1);
  for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2], ['splat', 4]]) g.setAttribute(name, new T.BufferAttribute(new Float32Array(n * size), size));
  const idx = new Uint32Array(N * N * 6); let k = 0;
  for (let r = 0; r < N; r++) for (let i = 0; i < N; i++) { const a = r * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1; idx[k++] = a; idx[k++] = d; idx[k++] = b; idx[k++] = b; idx[k++] = d; idx[k++] = e; }
  g.setIndex(new T.BufferAttribute(idx, 1));
  return g;
}
const spare = [gridGeometry(), gridGeometry()];
const meshes = spare.map(g => { const m = new T.Mesh(g, MAT.terrain); m.receiveShadow = true; m.visible = false; m.frustumCulled = false; scene.add(m); return m; });
let front = 0;

const _c = new T.Color(), _w = new T.Color(), canopy = new T.Color();
/** Builds the far land around (s0, x0) into the hidden buffer, a few rows per step. */
function* buildFar(s0, x0, covered) {
  const m = meshes[1 - front], g = m.geometry, A = g.attributes, cell = view.radius * 2 / N;
  const pos = A.position.array, nor = A.normal.array, col = A.color.array, uv = A.uv.array, spl = A.splat.array;
  // snap the grid to whole cells so it does not shimmer when it moves
  const sx = Math.round(x0 / cell) * cell, ss = Math.round(s0 / cell) * cell;
  for (let r = 0; r <= N; r++) {
    const s = ss + view.radius - r * cell, P = terrainParams(s), rx = roadX(s), cs = roadCos(s), ry = roadHeight(s);
    const inS = covered && s > covered[0] + cell * 1.2 && s < covered[1] - cell * 1.2;
    for (let i = 0; i <= N; i++) {
      const v = r * (N + 1) + i, x = sx - view.radius + i * cell, side = (x - rx) * cs;
      let h = groundHeight(s, side, P, x);
      if (inS && Math.abs(side) < STRIP - cell * 1.2) h -= 60;       // hidden under the detailed sections
      else h -= .8 * clamp(1 - (Math.abs(side) - STRIP) / 300, 0, 1); // tuck just under their edges
      pos[v * 3] = x - sx; pos[v * 3 + 1] = h; pos[v * 3 + 2] = -(s - ss);
      uv[v * 2] = x / 7; uv[v * 2 + 1] = -s / 7;
      col[v * 3] = ry; // height of the road here, kept for the colour pass
    }
    if (r % 6 === 5) yield;
  }
  // normals and colours from the grid itself (no extra height samples)
  for (let r = 0; r <= N; r++) {
    const s = ss + view.radius - r * cell, P = terrainParams(s), rx = roadX(s), cs = roadCos(s), bio = biomeAt(s);
    const woodsHere = bio === 'desert' || bio === 'planet' || bio === 'snow' ? 0 : bio === 'coast' ? .5 : 1;
    const szn = seasonName(s); canopy.set(bio === 'mountain' ? '#24402e' : szn === 'autumn' ? '#5a4a26' : szn === 'winter' ? '#3b3a33' : '#2c4a28');
    for (let i = 0; i <= N; i++) {
      const v = r * (N + 1) + i, hl = pos[(r * (N + 1) + Math.max(i - 1, 0)) * 3 + 1], hr = pos[(r * (N + 1) + Math.min(i + 1, N)) * 3 + 1];
      const hu = pos[(Math.max(r - 1, 0) * (N + 1) + i) * 3 + 1], hd = pos[(Math.min(r + 1, N) * (N + 1) + i) * 3 + 1];
      const hx = (hr - hl) / (2 * cell), hs = (hu - hd) / (2 * cell), nl = Math.hypot(hx, 1, hs), h = pos[v * 3 + 1];
      nor[v * 3] = -hx / nl; nor[v * 3 + 1] = 1 / nl; nor[v * 3 + 2] = hs / nl;
      const side = (sx - view.radius + i * cell - rx) * cs;
      groundColor(s, side, h, h - col[v * 3], Math.min(Math.hypot(hx, hs), 2), P, _c, spl, v * 4);
      // the woods carry on to the horizon: where the groves are (the same noise the near trees use),
      // distant hillsides are clothed in a dark, slightly mottled canopy
      if (woodsHere && Math.abs(side) > STRIP * .8 && h > SEA_LEVEL + 2) {
        const sd = side < 0 ? -1 : 1, w = vnoise(s * .0052 + sd * 7.3, side * .0061 + sd * 3.1) * .7 + vnoise(s * .019, side * .021) * .3;
        const k = clamp((w - .52) / .14, 0, 1) * (1 - clamp((Math.hypot(hx, hs) - .9) / .6, 0, 1)) * woodsHere;
        if (k > 0) { const m = .82 + vnoise(s * .09, side * .09) * .36; _c.lerp(_w.copy(canopy).multiplyScalar(m), k * .85); }
      }
      col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
    }
    if (r % 10 === 9) yield;
  }
  for (const k in A) A[k].needsUpdate = true;
  return {s: ss, x: sx};
}

// The sea: one large plane at sea level that follows the player; the land hides it except where it dips below.
const sea = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({color: '#1a4656', roughness: .32, metalness: 0, envMapIntensity: .55}));
sea.rotation.x = -Math.PI / 2; sea.receiveShadow = true; sea.visible = false; sea.renderOrder = -1;
// living water: rolling swells and fine ripples bend the surface normal, so sunlight glitters on it
const seaU = {uTime: wind.time, uOff: {value: new T.Vector2()}, uSunD: {value: new T.Vector3(0, 1, 0)}, uSunC: {value: new T.Color()}, uMoonD: {value: new T.Vector3(0, 1, 0)}, uMoonK: {value: 0}};
export {seaU};
sea.material.roughness = .18; sea.material.envMapIntensity = .75;
sea.material.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, seaU);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime,uMoonK;uniform vec2 uOff;uniform vec3 uSunD,uSunC,uMoonD;varying vec3 vSeaW;')
    .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      vec2 p = vec2(vSeaW.x + uOff.x, vSeaW.z - uOff.y);
      float t = uTime;
      vec2 g = vec2(0.);
      g += vec2(.8, .6) * cos(dot(p, vec2(.8, .6)) * .045 + t * .7) * .09;
      g += vec2(-.5, .86) * cos(dot(p, vec2(-.5, .86)) * .07 + t * .9) * .07;
      g += vec2(.95, -.3) * cos(dot(p, vec2(.95, -.3)) * .21 + t * 1.6) * .045;
      g += vec2(.2, .98) * cos(dot(p, vec2(.2, .98)) * .53 + t * 2.3) * .03;
      g += vec2(-.9, .4) * cos(dot(p, vec2(-.9, .4)) * 1.3 + t * 3.1) * .02;
      normal = normalize(normal + (viewMatrix * vec4(-g.x, 0., -g.y, 0.)).xyz);`)
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= .85 + .3 * smoothstep(-.5, .5, sin(vSeaW.x * .01 + vSeaW.z * .013));'
    // a path of glitter on the water towards a low sun or the moon: each wavelet that tilts just
    // right flashes, with a soft glow along the path
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 V = normalize(-vViewPosition), R = reflect(-V, normal);
        vec3 Ls = normalize((viewMatrix * vec4(uSunD, 0.)).xyz), Lm = normalize((viewMatrix * vec4(uMoonD, 0.)).xyz);
        float tw = fract(sin(dot(floor(vSeaW.xz * 1.7 + uOff * vec2(1., -1.) * 1.7) + floor(uTime * 6.), vec2(12.9898, 78.233))) * 43758.5453);
        float sg = pow(max(dot(R, Ls), 0.), 700.) * (tw > .55 ? 7. : .4) + pow(max(dot(R, Ls), 0.), 30.) * .06;
        float mg = pow(max(dot(R, Lm), 0.), 500.) * (tw > .6 ? 4. : .3) + pow(max(dot(R, Lm), 0.), 25.) * .05;
        totalEmissiveRadiance += uSunC * sg * step(0., uSunD.y) + vec3(.75, .82, 1.) * mg * uMoonK; }`);
};
scene.add(sea);
export const seaMaterial = sea.material;

/** Apply a view distance (also used when the scenery or road changes, to start again). */
export function setViewDistance(key = state.view || 'medium') {
  view = VIEW[key] || VIEW.medium;
  anchor = null; pending = false; meshes.forEach(m => m.visible = false); current = null;
  const k = view.backdrop;
  mountains.scale.set(k, k, k);
  skyDome.scale.setScalar(Math.max(1, k * 1.1));
  camera.far = Math.max(3200, 2600 * k * 1.15); camera.updateProjectionMatrix();
  sea.visible = view.radius > 0; sea.scale.set(view.radius * 2.6, view.radius * 2.6, 1);
  if (G.fogBase) G.fogBase *= view.fog / (G.fogScale || 1);   // apply at once; lighting keeps it updated
  G.fogScale = view.fog;
}

/** Call every frame after the road sections are updated. */
/** The road ahead changed (a fork): build the far land again soon. */
export function refreshFar() { if (anchor) anchor.s0 = -1e9; }
export function updateFar(distance, base, yBase) {
  sea.position.set(0, SEA_LEVEL - yBase, 0); seaU.uOff.value.set(base, distance);
  if (!view.radius) return;
  const x0 = roadX(distance), moved = anchor ? Math.max(Math.abs(distance - anchor.s0), Math.abs(x0 - anchor.x0)) : Infinity;
  if (!pending && moved > view.radius * .12) {
    const covered = builtRange(Math.floor(distance / CH));
    if (covered || !anchor) {
      pending = true; anchor = {s0: distance, x0};
      scheduler.add('far', buildFar(distance, x0, covered), at => { pending = false; front = 1 - front; current = at; meshes[front].visible = true; meshes[1 - front].visible = false; });
    }
  }
  if (current) meshes[front].position.set(current.x - base, -yBase, distance - current.s);
}

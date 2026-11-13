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

/* Distant woods: thousands of tree silhouettes (two crossed cards each) standing on the far hills, so the
   forests carry on past the detailed land instead of being a painted colour. */
const treeTex = kind => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  let seed = kind === 'pine' ? 7 : 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#4a3a2c'; x.fillRect(60, 170, 8, 86);
  for (let i = 0; i < 520; i++) {
    let px, py, rr;
    if (kind === 'pine') { const t = Math.pow(rnd(), .8); py = 12 + t * 210; const half = 6 + t * 50; px = 64 + (rnd() - .5) * 2 * half; rr = 3 + rnd() * 5; }
    else { const a = rnd() * 6.283, d = Math.sqrt(rnd()); px = 64 + Math.cos(a) * d * 56; py = 95 + Math.sin(a) * d * 80; rr = 4 + rnd() * 8; }
    const l = 60 + rnd() * 60 + (kind === 'pine' ? 0 : (150 - py) * .25); x.fillStyle = `rgb(${l * .92 | 0},${l | 0},${l * .78 | 0})`;
    x.beginPath(); x.arc(px, py, rr, 0, 6.283); x.fill();
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
const farTreeGeo = (() => { const a = new T.PlaneGeometry(1, 1), b = new T.PlaneGeometry(1, 1); a.translate(0, .5, 0); b.translate(0, .5, 0); b.rotateY(Math.PI / 2);
  const g = new T.BufferGeometry(), P = [], U = [], Nn = [], I = [];
  for (const q of [a, b]) { const o = P.length / 3; P.push(...q.attributes.position.array); U.push(...q.attributes.uv.array); for (let i = 0; i < q.attributes.position.count; i++) Nn.push(0, 1, 0); I.push(...Array.from(q.index.array, v => v + o)); }
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); g.setAttribute('normal', new T.Float32BufferAttribute(Nn, 3)); g.setIndex(I); return g; })();
const FAR_TREES = 22000;
const farTreeMat = {broad: new T.MeshStandardMaterial({map: treeTex('broad'), alphaTest: .5, side: T.DoubleSide, roughness: .95}), pine: new T.MeshStandardMaterial({map: treeTex('pine'), alphaTest: .5, side: T.DoubleSide, roughness: .95})};
const farTrees = meshes.map(m => { const o = {}; for (const k of ['broad', 'pine']) { const im = new T.InstancedMesh(farTreeGeo, farTreeMat[k], FAR_TREES); im.count = 0; im.frustumCulled = false; im.setColorAt(0, new T.Color()); m.add(im); o[k] = im; } return o; });
const _tm = new T.Matrix4(), _tq = new T.Quaternion(), _tp = new T.Vector3(), _ts = new T.Vector3(), _ty = new T.Vector3(0, 1, 0);

const _c = new T.Color(), _w = new T.Color(), canopy = new T.Color();
/** Builds the far land around (s0, x0) into the hidden buffer, a few rows per step. */
function* buildFar(s0, x0, covered) {
  const m = meshes[1 - front], g = m.geometry, A = g.attributes, cell = view.radius * 2 / N;
  const pos = A.position.array, nor = A.normal.array, col = A.color.array, uv = A.uv.array, spl = A.splat.array;
  const ft = farTrees[1 - front], fc = {broad: 0, pine: 0}; let tr = 1;
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
        if (k > 0) { const m = .82 + vnoise(s * .09, side * .09) * .36; _c.lerp(_w.copy(canopy).multiplyScalar(m), k * .85);
          // and the trees themselves, on the land beyond the detailed sections
          const ad = Math.abs(side);
          if (ad > STRIP + cell * .5 && ad < STRIP + 1600 && !(covered && s > covered[0] + cell * 1.2 && s < covered[1] - cell * 1.2 && ad < STRIP - cell * 1.2)) {
            const kind = bio === 'mountain' || bio === 'snow' || (bio === 'town' && w > .75) ? 'pine' : (w > .8 ? 'pine' : 'broad'), im = ft[kind], n = Math.round(k * (ad < STRIP + 600 ? 5 : 3));
            for (let q = 0; q < n && fc[kind] < FAR_TREES; q++) {
              tr = (tr * 16807) % 2147483647; const jx = (tr / 2147483647 - .5) * cell; tr = (tr * 16807) % 2147483647; const jz = (tr / 2147483647 - .5) * cell; tr = (tr * 16807) % 2147483647; const sz = .75 + tr / 2147483647 * .6;
              const H = (kind === 'pine' ? 17 : 13) * sz;
              _tp.set(pos[v * 3] + jx, h - .6, pos[v * 3 + 2] + jz); _tq.setFromAxisAngle(_ty, jx); _ts.set(H * (kind === 'pine' ? .45 : .7), H, H * (kind === 'pine' ? .45 : .7));
              im.setMatrixAt(fc[kind], _tm.compose(_tp, _tq, _ts)); im.setColorAt(fc[kind], _w.copy(canopy).multiplyScalar(5.5 * (.8 + jz / cell * .4)));
              fc[kind]++;
            }
          }
        }
      }
      col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
    }
    if (r % 10 === 9) yield;
  }
  for (const k in A) A[k].needsUpdate = true;
  for (const k of ['broad', 'pine']) { const im = ft[k]; im.count = fc[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
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
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= .85 + .3 * smoothstep(-.5, .5, sin(vSeaW.x * .01 + vSeaW.z * .013));')
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

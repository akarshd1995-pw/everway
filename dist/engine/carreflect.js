// Live reflections on your own car: a small cube map is rendered from the car's position, one face a
// frame, so the sky, the trees and the road slide across the paint and the glass as you drive.
// (Traffic keeps the plain sky reflection; only the car you drive gets this.)
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {renderer, scene} from './render.js';
import {lampMaterials} from '../vehicles.js';

const rt = new T.WebGLCubeRenderTarget(128, {type: T.HalfFloatType, generateMipmaps: false});
const cube = new T.CubeCamera(.5, 3000, rt);
let face = 0, fitted = null, fittedPost = null, primed = false;
const lamps = () => new Set(Object.values(lampMaterials));
/** Give the car's own materials the live reflection (copies, so traffic of the same colour is unaffected). */
function fit(car) {
  fitted = car; fittedPost = !!G.quality.post; const seen = new Map(), skip = lamps();
  car.traverse(o => {
    if (!o.isMesh || !o.material || skip.has(o.material) || !('envMap' in o.material) || o.material.isSpriteMaterial) return;
    let m = seen.get(o.material);
    if (!m) {
      m = o.material.clone(); seen.set(o.material, m);
      if (G.quality.post) { m.envMap = rt.texture; m.envMapIntensity = (o.material.envMapIntensity ?? 1) * 1.1; }
      if (!m.transparent && !(m.transmission > 0)) addSnow(m);
    }
    o.material = m;
  });
}
/** Snow settling on the car: white on every surface that faces up (roof, bonnet, boot), patchy at first. */
export const carSnow = {value: 0};
function addSnow(m) {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r); sh.uniforms.uCarSnow = carSnow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSnowP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSnowP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uCarSnow;varying vec3 vSnowP;')
      .replace('#include <lights_physical_fragment>', `{ vec3 wn = inverseTransformDirection(normal, viewMatrix);
        float n = fract(sin(dot(floor(vSnowP.xz * 9.), vec2(12.9898, 78.233))) * 43758.5453);
        float sm = smoothstep(.45, .8, wn.y) * smoothstep(0., .2, uCarSnow * 1.3 - .25 + n * .3);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.9, .93, .96), sm); roughnessFactor = mix(roughnessFactor, .8, sm); metalnessFactor *= 1. - sm; }
      #include <lights_physical_fragment>`);
  };
  m.customProgramCacheKey = () => (key ? key() : '') + '|carsnow';
}
/** Call every frame before the picture is drawn. */
export function updateCarReflection() {
  const car = G.player; if (!car || state.ride === 'cycle') return;
  if (car !== fitted || fittedPost !== !!G.quality.post) fit(car);
  if (!G.quality.post || G.noCubeReflect) return;
  car.getWorldPosition(cube.position); cube.position.y += 1.1; cube.updateMatrixWorld();
  const vis = car.visible, auto = renderer.shadowMap.autoUpdate, target = renderer.getRenderTarget();
  car.visible = false; renderer.shadowMap.autoUpdate = false;
  if (!primed) { cube.update(renderer, scene); primed = true; }
  else {
    // one side of the cube each frame: the whole reflection refreshes ten times a second
    const cams = cube.children; renderer.setRenderTarget(rt, face); renderer.render(scene, cams[face]);
    face = (face + 1) % 6; if (face === 0) rt.texture.needsPMREMUpdate = true;
  }
  renderer.setRenderTarget(target); renderer.shadowMap.autoUpdate = auto; car.visible = vis;
}

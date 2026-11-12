// Live reflections on your own car: a small cube map is rendered from the car's position, one face a
// frame, so the sky, the trees and the road slide across the paint and the glass as you drive.
// (Traffic keeps the plain sky reflection; only the car you drive gets this.)
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {renderer, scene} from './render.js';
import {lampMaterials} from '../vehicles.js';

const rt = new T.WebGLCubeRenderTarget(128, {type: T.HalfFloatType, generateMipmaps: false});
const cube = new T.CubeCamera(.5, 3000, rt);
let face = 0, fitted = null, primed = false;
const lamps = () => new Set(Object.values(lampMaterials));
/** Give the car's own materials the live reflection (copies, so traffic of the same colour is unaffected). */
function fit(car) {
  fitted = car; const seen = new Map(), skip = lamps();
  car.traverse(o => {
    if (!o.isMesh || !o.material || skip.has(o.material) || !('envMap' in o.material) || o.material.isSpriteMaterial) return;
    let m = seen.get(o.material);
    if (!m) { m = o.material.clone(); m.envMap = rt.texture; m.envMapIntensity = (o.material.envMapIntensity ?? 1) * 1.1; seen.set(o.material, m); }
    o.material = m;
  });
}
/** Call every frame before the picture is drawn. */
export function updateCarReflection() {
  const car = G.player; if (!car || !G.quality.post || state.ride === 'cycle' || G.noCubeReflect) return;
  if (car !== fitted) fit(car);
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

// Real reflections on still water: when a lake is in view, the scene is drawn a second time, at half
// size, from a camera mirrored in the water's surface. The lake shader looks the picture up, bends it
// with its ripples, and blends it in more strongly at a low angle (a Fresnel term).
import * as T from '../three.module.js';
import {renderer, scene} from './render.js';
import {G} from './state.js';

/** Shared with the lake material. */
export const REFL = {tRefl: {value: null}, uReflM: {value: new T.Matrix4()}, uRefl: {value: 0}};
let rt = null;
const mirror = new T.PerspectiveCamera(), _f = new T.Vector3(), _t = new T.Vector3(), _u = new T.Vector3(), _p = new T.Plane(), _c = new T.Vector4(), _q = new T.Vector4(), _sz = new T.Vector2();
const BIAS = new T.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);

/** Draw the mirrored view for water at height `level` (world y), or switch reflections off (null). */
export function renderReflection(camera, level, lakeMat) {
  if (level == null || !G.quality.post || G.quality.ao <= 0 || camera.position.y < level + .3) { REFL.uRefl.value = 0; return; }
  renderer.getDrawingBufferSize(_sz);
  const w = Math.max(64, _sz.x >> 1), h = Math.max(64, _sz.y >> 1);
  if (!rt || rt.width !== w || rt.height !== h) { rt?.dispose(); rt = new T.WebGLRenderTarget(w, h, {type: T.HalfFloatType}); REFL.tRefl.value = rt.texture; }
  // the camera mirrored in the plane y = level (its up direction is mirrored too)
  camera.updateMatrixWorld();
  _f.set(0, 0, -1).applyQuaternion(camera.quaternion); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
  mirror.position.copy(camera.position); mirror.position.y = 2 * level - camera.position.y;
  _t.copy(camera.position).add(_f); _t.y = 2 * level - _t.y; _u.y = -_u.y;
  mirror.up.copy(_u); mirror.lookAt(_t); mirror.far = camera.far; mirror.near = camera.near;
  mirror.updateMatrixWorld(); mirror.projectionMatrix.copy(camera.projectionMatrix);
  // an oblique near plane on the water, so nothing below the surface shows in the reflection
  _p.setFromNormalAndCoplanarPoint(_u.set(0, 1, 0), _t.set(0, level, 0)).applyMatrix4(mirror.matrixWorldInverse);
  _c.set(_p.normal.x, _p.normal.y, _p.normal.z, _p.constant);
  const e = mirror.projectionMatrix.elements;
  _q.set((Math.sign(_c.x) + e[8]) / e[0], (Math.sign(_c.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
  _c.multiplyScalar(2 / _c.dot(_q)); e[2] = _c.x; e[6] = _c.y; e[10] = _c.z + 1 - .003; e[14] = _c.w;
  mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();
  REFL.uReflM.value.copy(BIAS).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
  // draw it (without the water itself, and without redrawing the shadow map)
  REFL.uRefl.value = 0; lakeMat.visible = false;
  const auto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, mirror);
  renderer.shadowMap.autoUpdate = auto; renderer.setRenderTarget(null); lakeMat.visible = true; REFL.uRefl.value = 1;
}

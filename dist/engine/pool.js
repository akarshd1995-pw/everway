// Object pooling: road sections are recycled instead of thrown away, so driving forever never
// churns GPU buffers or the garbage collector. Everything pooled carries userData.poolKey.
import * as T from '../three.module.js';

const free = new Map();          // key -> array of idle objects
const MAX_IDLE_PER_KEY = 6;
export const poolStats = {created: 0, reused: 0, idle: 0, disposed: 0};

/** Take an idle object with this key, or make a new one. */
export function acquire(key, make) {
  const list = free.get(key);
  if (list && list.length) { poolStats.reused++; poolStats.idle--; return list.pop(); }
  const o = make();
  o.userData.poolKey = key;
  poolStats.created++;
  return o;
}

/** Give an object back. Extra idle objects beyond the cap are disposed. */
export function release(o) {
  const key = o.userData.poolKey;
  let list = free.get(key);
  if (!list) free.set(key, list = []);
  if (list.length >= MAX_IDLE_PER_KEY) { o.dispose(); poolStats.disposed++; return; }
  list.push(o); poolStats.idle++;
}

/** Capacity buckets about 25% apart, so a recycled buffer fits most new contents. */
export const bucket = n => Math.max(256, Math.ceil(Math.pow(2, Math.ceil(Math.log2(n) * 4) / 4)));

/** A geometry with room for at least `count` vertices of the given attribute layout, e.g. {position:3,normal:3}. */
export function pooledGeometry(layout, count) {
  const cap = bucket(count), sig = Object.entries(layout).map(([k, n]) => k + n).join(',');
  const g = acquire(`geo:${sig}:${cap}`, () => {
    const geo = new T.BufferGeometry();
    for (const [name, size] of Object.entries(layout)) geo.setAttribute(name, new T.BufferAttribute(new Float32Array(cap * size), size));
    return geo;
  });
  g.setDrawRange(0, count);
  return g;
}

/** Copy plain arrays into a pooled geometry and fit its bounds to the used part only. */
export function fillGeometry(g, data, count) {
  for (const [name, arr] of Object.entries(data)) { const a = g.attributes[name]; a.array.set(arr); a.clearUpdateRanges(); a.addUpdateRange(0, arr.length); a.needsUpdate = true; }
  fitBounds(g, count);
  return g;
}

const _box = new T.Box3(), _v = new T.Vector3();
export function fitBounds(g, count) {
  const p = g.attributes.position.array;
  _box.makeEmpty();
  for (let i = 0; i < count * 3; i += 3) _box.expandByPoint(_v.set(p[i], p[i + 1], p[i + 2]));
  g.boundingBox ||= new T.Box3(); g.boundingBox.copy(_box);
  g.boundingSphere ||= new T.Sphere(); _box.getBoundingSphere(g.boundingSphere);
}

/** Return everything in a finished road section to the pools (or free it if it is not pooled). */
export function recycle(group) {
  const done = new Set();
  group.traverse(o => {
    if (o === group || done.has(o)) return;
    if (o.isInstancedMesh && o.userData.poolKey) { done.add(o); release(o); return; }
    if (o.isInstancedMesh) { o.dispose(); return; }
    const g = o.geometry;
    if (!g || done.has(g)) return;
    done.add(g);
    if (g.userData.poolKey) release(g); else if (!g.userData.shared) g.dispose();
  });
  group.removeFromParent();
  group.clear();
}

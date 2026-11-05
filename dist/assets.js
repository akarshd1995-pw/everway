// Loads the optional realistic scenery downloaded by GET_ASSETS.bat (dist/assets/manifest.json).
// Includes a small self-contained glTF 2.0 reader, so no npm add-ons are needed.
import * as T from './three.module.js';

const BASE = './assets/';
// Triangle limits per kind of model; anything heavier would make driving stutter, so it is never loaded.
export const MODEL_LIMITS = {tree: {maxTris: 200000, perChunk: 3}, pine: {maxTris: 200000, perChunk: 4}, rock: {maxTris: 110000, perChunk: 3},
  shrub: {maxTris: 60000, perChunk: 6}, desert: {maxTris: 160000, perChunk: 4},
  // from model kits you add yourself (dist/assets/packs): cars for the traffic, buildings for the houses
  car: {maxTris: 60000, perChunk: 0}, house: {maxTris: 80000, perChunk: 4}};
const NOT_SCENERY = /(^|_)(rat|animal|street|lamp|poles?|bust|statue|fort|roots?|stump|log|dead|grass|moss|flower|dandelion|celandine)(_|$)/;
const loader = new T.TextureLoader();

export async function loadAssets(renderer) {
  let manifest;
  try {
    const r = await fetch(BASE + 'manifest.json', {cache: 'no-cache'});
    if (!r.ok) return null;
    manifest = await r.json();
  } catch { return null; }
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const out = {textures: {}, models: {}, manifest};
  const jobs = [];
  for (const [role, entry] of Object.entries(manifest.textures || {})) {
    out.textures[role] = {};
    for (const kind of ['diff', 'nor', 'rough']) {
      if (!entry[kind]) continue;
      jobs.push(loader.loadAsync(BASE + entry[kind]).then(t => {
        t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso;
        t.colorSpace = kind === 'diff' ? T.SRGBColorSpace : T.NoColorSpace;
        out.textures[role][kind] = t;
      }).catch(e => console.warn('Everway: texture skipped', entry[kind], e)));
    }
  }
  for (const [role, list] of Object.entries(manifest.models || {})) {
    out.models[role] = [];
    for (const m of list) {
      if (role !== 'car' && role !== 'house' && NOT_SCENERY.test(m.id)) continue;
      const kind = role === 'tree' && /quiver|aloe/.test(m.id) ? 'desert' : role;
      if (!out.models[kind]) out.models[kind] = [];
      jobs.push(loadGLTF(BASE + m.file, aniso, MODEL_LIMITS[kind]?.maxTris || 100000, m.id).then(parts => {
        if (parts.length) out.models[kind].push(prepareModel(parts, m, kind));
      }).catch(e => console.warn('Everway: model skipped', m.file, e)));
    }
  }
  await Promise.all(jobs);

  for (const [role, t] of Object.entries(out.textures)) if (!t.diff) delete out.textures[role];
  for (const [role, l] of Object.entries(out.models)) if (!l.length) delete out.models[role];
  return out;
}

/* Centre a model on its footprint, put its base at y=0 and record its size. */
function prepareModel(parts, meta, role) {
  const box = new T.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const c = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
  const shift = new T.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z);
  let tris = 0;
  for (const p of parts) {
    p.geometry.applyMatrix4(shift); p.geometry.computeBoundingSphere();
    tris += (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count) / 3;
  }
  const ref = role === 'rock' || role === 'shrub' ? Math.max(size.x, size.y, size.z) : role === 'car' || role === 'house' ? Math.max(size.x, size.z) : size.y;
  return {id: meta.id, name: meta.name, parts, size: ref || 1, height: size.y || 1, width: Math.max(size.x, size.z) || 1, tris};
}

const TYPES = {5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array};
const COMPS = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16};
const WRAP = {33071: T.ClampToEdgeWrapping, 33648: T.MirroredRepeatWrapping, 10497: T.RepeatWrapping};

export async function loadGLTF(url, aniso = 4, maxTris = Infinity, label = url) {
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + ' ' + url);
  // a .glb file holds the description and the binary data together: [header][JSON chunk][BIN chunk]
  let j, glbBin = null;
  if (/\.glb$/i.test(url)) {
    const ab = await res.arrayBuffer(), dv = new DataView(ab);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a glb file: ' + url);
    let off = 12;
    while (off < ab.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), body = ab.slice(off + 8, off + 8 + len);
      if (type === 0x4E4F534A) j = JSON.parse(new TextDecoder().decode(body)); else if (type === 0x004E4942) glbBin = body;
      off += 8 + len;
    }
  } else j = await res.json();
  // Count triangles from the description before downloading any geometry or textures.
  let tris = 0;
  for (const mesh of j.meshes || []) for (const p of mesh.primitives) tris += j.accessors[p.indices ?? p.attributes.POSITION].count / 3;
  if (tris > maxTris) { console.info(`Everway: ${label} skipped (${Math.round(tris / 1000)}k triangles is too detailed for smooth driving)`); return []; }
  const buffers = await Promise.all((j.buffers || []).map(b => !b.uri ? Promise.resolve(glbBin) : fetch(b.uri.startsWith('data:') ? b.uri : dir + b.uri).then(r => r.arrayBuffer())));

  const accessorCache = new Map();
  function accessor(i) {
    if (accessorCache.has(i)) return accessorCache.get(i);
    const a = j.accessors[i], Type = TYPES[a.componentType], comps = COMPS[a.type];
    let arr;
    if (a.bufferView === undefined) arr = new Type(a.count * comps);
    else {
      const bv = j.bufferViews[a.bufferView], buf = buffers[bv.buffer];
      const elem = Type.BYTES_PER_ELEMENT * comps, stride = bv.byteStride || elem, offset = (bv.byteOffset || 0) + (a.byteOffset || 0);
      if (stride === elem) arr = new Type(buf.slice(offset, offset + a.count * elem));
      else {
        arr = new Type(a.count * comps);
        for (let k = 0; k < a.count; k++) arr.set(new Type(buf.slice(offset + k * stride, offset + k * stride + elem)), k * comps);
      }
    }
    const attr = new T.BufferAttribute(arr, comps, !!a.normalized);
    accessorCache.set(i, attr);
    return attr;
  }

  const texCache = new Map();
  function texture(info, srgb) {
    if (!info || !j.textures?.[info.index]) return null;
    const key = info.index + '/' + srgb;
    if (texCache.has(key)) return texCache.get(key);
    const td = j.textures[info.index], img = j.images[td.source];
    let src;
    if (img.uri) src = img.uri.startsWith('data:') ? img.uri : dir + img.uri;
    else {
      const bv = j.bufferViews[img.bufferView];
      src = URL.createObjectURL(new Blob([buffers[bv.buffer].slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], {type: img.mimeType}));
    }
    const t = loader.load(src);
    const s = j.samplers?.[td.sampler] || {};
    t.flipY = false; t.wrapS = WRAP[s.wrapS] ?? T.RepeatWrapping; t.wrapT = WRAP[s.wrapT] ?? T.RepeatWrapping;
    t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.anisotropy = aniso;
    texCache.set(key, t);
    return t;
  }

  const matCache = new Map();
  function material(i) {
    if (i === undefined) return new T.MeshStandardMaterial({color: '#888888'});
    if (matCache.has(i)) return matCache.get(i);
    const m = j.materials[i], pbr = m.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [1, 1, 1, 1];
    const mat = new T.MeshStandardMaterial({
      color: new T.Color(f[0], f[1], f[2]),
      map: texture(pbr.baseColorTexture, true),
      roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1,
      side: m.doubleSided ? T.DoubleSide : T.FrontSide,
    });
    const mr = texture(pbr.metallicRoughnessTexture, false);
    if (mr) { mat.roughnessMap = mr; mat.metalnessMap = mr; }
    const n = texture(m.normalTexture, false);
    if (n) { mat.normalMap = n; const sc = m.normalTexture.scale ?? 1; mat.normalScale = new T.Vector2(sc, -sc); }
    const ao = texture(m.occlusionTexture, false);
    if (ao) mat.aoMap = ao;
    // Leaves use cut-outs; blended transparency would sort badly in a forest.
    if (m.alphaMode === 'MASK' || m.alphaMode === 'BLEND') { mat.alphaTest = m.alphaCutoff ?? 0.5; mat.alphaToCoverage = true; mat.side = T.DoubleSide; }
    mat.name = m.name || '';
    matCache.set(i, mat);
    return mat;
  }

  const parts = [];
  function visit(ni, parent) {
    const node = j.nodes[ni], local = new T.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new T.Vector3(...(node.translation || [0, 0, 0])), new T.Quaternion(...(node.rotation || [0, 0, 0, 1])), new T.Vector3(...(node.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      for (const p of j.meshes[node.mesh].primitives) {
        if (p.mode !== undefined && p.mode !== 4) continue;
        const g = new T.BufferGeometry();
        g.setAttribute('position', accessor(p.attributes.POSITION).clone());
        if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', accessor(p.attributes.NORMAL).clone());
        if (p.attributes.TEXCOORD_0 !== undefined) g.setAttribute('uv', accessor(p.attributes.TEXCOORD_0).clone());
        if (p.indices !== undefined) g.setIndex(accessor(p.indices).clone());
        if (!g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(world);
        parts.push({geometry: g, material: material(p.material)});
      }
    }
    for (const c of node.children || []) visit(c, world);
  }
  const scene = j.scenes?.[j.scene ?? 0];
  const roots = scene ? scene.nodes : (j.nodes || []).map((_, i) => i);
  for (const r of roots) visit(r, new T.Matrix4());
  return parts;
}

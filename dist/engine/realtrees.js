// Realistic trees, made here rather than downloaded: a trunk and branching limbs with bark, and a
// crown built from hundreds of small "leaf cards" (pictures of leafy twigs with see-through gaps),
// lit as one soft, rounded mass. Conifers are whorls of drooping needle sprays up a straight trunk.
// They are used for trees near the road (instanced, so hundreds cost little); far trees keep the light
// low-poly shapes. Leaf colour comes from the season through each tree's instance colour.
import * as T from '../three.module.js';
import {maxAniso} from './render.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const canvasTex = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso || 4); return t; };

/* ------------------------------------------------------------ textures */
// leafy twigs: a 2 x 2 atlas of clusters, painted in light neutral greens so the season can tint them
const leafTex = canvasTex(512, 512, (c) => {
  const r = rng(7);
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * 256, oy = Math.floor(cell / 2) * 256;
    c.save(); c.translate(ox + 128, oy + 128);
    // the twig
    c.strokeStyle = '#5b4a36'; c.lineWidth = 3; c.lineCap = 'round';
    const tips = [];
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (r() - .5) * 2.2, l = 60 + r() * 55; c.beginPath(); c.moveTo(0, 90); const mx = Math.cos(a) * l * .5, my = 90 + Math.sin(a) * l * .5 - 20; const ex = Math.cos(a) * l, ey = 90 + Math.sin(a) * l * 1.5 - 30; c.quadraticCurveTo(mx, my, ex, ey); c.stroke(); tips.push([ex, ey, a, mx, my]); }
    // leaves along each twig
    for (const [ex, ey, a, mx, my] of tips) for (let i = 0; i < 11; i++) {
      const t = .25 + i / 11 * .8, x = mx + (ex - mx) * t + (r() - .5) * 26, y = my + (ey - my) * t + (r() - .5) * 26, L = 15 + r() * 13, ang = a + (r() - .5) * 2.4;
      const g = .74 + r() * .26, hue = (r() - .5) * .08;
      c.save(); c.translate(x, y); c.rotate(ang);
      const grad = c.createLinearGradient(-L, 0, L, 0); grad.addColorStop(0, `rgb(${(g * 205 + hue * 255) | 0},${(g * 235) | 0},${(g * 175 - hue * 200) | 0})`); grad.addColorStop(1, `rgb(${(g * 170) | 0},${(g * 205) | 0},${(g * 140) | 0})`);
      c.fillStyle = grad; c.beginPath(); c.ellipse(0, 0, L, L * .45, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(80,95,60,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-L * .9, 0); c.lineTo(L * .9, 0); c.stroke();
      c.restore();
    }
    c.restore();
  }
});
// a spray of needles for the conifers
const needleTex = canvasTex(256, 256, (c, w, h) => {
  const r = rng(11);
  c.strokeStyle = '#4a3b2b'; c.lineWidth = 3; c.beginPath(); c.moveTo(4, h / 2); c.lineTo(w - 6, h / 2 + 6); c.stroke();
  for (let k = 0; k < 7; k++) { const x0 = 20 + k * 32; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, h / 2 + k); c.lineTo(x0 + 34, h / 2 - 50 + r() * 20); c.moveTo(x0, h / 2 + k); c.lineTo(x0 + 34, h / 2 + 50 + r() * 20); c.stroke(); }
  for (let i = 0; i < 900; i++) {
    const t = r(), x = 6 + t * (w - 14), side = r() < .5 ? -1 : 1, spread = (1 - Math.abs(t - .55) * 1.2) * 70 * r(), y = h / 2 + side * spread * .9 + (r() - .5) * 8;
    const g = .55 + r() * .45; c.strokeStyle = `rgb(${(g * 120) | 0},${(g * 160) | 0},${(g * 120) | 0})`; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 9 + r() * 6, y + side * (5 + r() * 6)); c.stroke();
  }
});
// bark: vertical ridges and furrows
const barkTex = canvasTex(256, 512, (c, w, h) => {
  const r = rng(5); c.fillStyle = '#6b5d4f'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const x = r() * w, g = 70 + r() * 70; c.strokeStyle = `rgba(${g},${g * .88 | 0},${g * .74 | 0},.55)`; c.lineWidth = 2 + r() * 7; c.beginPath(); c.moveTo(x, 0); for (let y = 0; y <= h; y += 32) c.lineTo(x + Math.sin(y * .02 + i) * 6 + (r() - .5) * 4, y); c.stroke(); }
  for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h; c.fillStyle = 'rgba(40,32,26,.5)'; c.fillRect(x, y, 2 + r() * 3, 12 + r() * 40); }
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(110,130,80,${.15 + r() * .2})`; c.beginPath(); c.arc(r() * w, r() * h, 6 + r() * 14, 0, 6.3); c.fill(); }   // a little moss
});
barkTex.wrapS = barkTex.wrapT = T.RepeatWrapping;
const birchTex = canvasTex(256, 512, (c, w, h) => {
  const r = rng(9); c.fillStyle = '#e9e6dd'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { const y = r() * h, x = r() * w; c.fillStyle = `rgba(30,28,26,${.5 + r() * .4})`; c.fillRect(x, y, 10 + r() * 50, 2 + r() * 5); }
});
birchTex.wrapS = birchTex.wrapT = T.RepeatWrapping;

const leafMat = new T.MeshStandardMaterial({map: leafTex, alphaTest: .45, side: T.DoubleSide, roughness: .85, alphaToCoverage: true});
const needleMat = new T.MeshStandardMaterial({map: needleTex, alphaTest: .4, side: T.DoubleSide, roughness: .9, alphaToCoverage: true});
const barkMat = new T.MeshStandardMaterial({map: barkTex, bumpMap: barkTex, bumpScale: 1.5, roughness: .95});
const birchMat = new T.MeshStandardMaterial({map: birchTex, roughness: .8});
// light passes through leaves: the side away from the sun still glows a little
for (const m of [leafMat, needleMat]) {
  m.userData.tint = true;
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * .18;'); };
}

/* ------------------------------------------------------------ geometry helpers */
function merge(parts) {
  let n = 0, ni = 0; for (const g of parts) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), I = new Uint32Array(ni); let o = 0, oi = 0;
  for (const g of parts) {
    const c = g.attributes.position.count; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2);
    const idx = g.index ? g.index.array : Array.from({length: c}, (_, i) => i); for (let k = 0; k < idx.length; k++) I[oi + k] = idx[k] + o;
    o += c; oi += idx.length; g.dispose();
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(N, 3)); g.setAttribute('uv', new T.BufferAttribute(U, 2)); g.setIndex(new T.BufferAttribute(I, 1));
  g.computeBoundingSphere(); return g;
}
const _a = new T.Vector3(), _b = new T.Vector3(), _q = new T.Quaternion(), _m = new T.Matrix4(), UP = new T.Vector3(0, 1, 0);
/** A tapered limb from a to b. */
function limb(a, b, r0, r1, uvScale = 1) {
  const len = a.distanceTo(b), g = new T.CylinderGeometry(r1, r0, len, 7, 1, true);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * uvScale, uv.getY(i) * len * .5 * uvScale);
  _a.subVectors(b, a).normalize(); _q.setFromUnitVectors(UP, _a); _m.compose(_b.addVectors(a, b).multiplyScalar(.5), _q, new T.Vector3(1, 1, 1)); g.applyMatrix4(_m); return g;
}
/** A leaf card at p, facing roughly `dir`, with its normals bent outward from the crown centre. */
function card(p, size, dir, centre, cell, r, stretch = 1) {
  const g = new T.PlaneGeometry(size * stretch, size);
  const uv = g.attributes.uv, cu = (cell % 2) * .5, cv = Math.floor(cell / 2) * .5; for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) * .5, cv + uv.getY(i) * .5);
  g.rotateZ(r() * 6.283); _q.setFromUnitVectors(new T.Vector3(0, 0, 1), dir); g.applyQuaternion(_q); g.translate(p.x, p.y, p.z);
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) { _a.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(centre).normalize(); _a.y += .35; _a.normalize(); nor.setXYZ(i, _a.x, _a.y, _a.z); }
  return g;
}

/* ------------------------------------------------------------ broadleaf trees */
function broadleaf(seed, kind, lite = false) {
  const r = rng(seed), H = kind === 'tall' ? 15 : kind === 'birch' ? 12 : 11 + r() * 3;
  const crownR = kind === 'tall' ? H * .24 : kind === 'birch' ? H * .2 : H * .33, crownY = kind === 'tall' ? H * .62 : kind === 'birch' ? H * .68 : H * .6, sq = kind === 'tall' ? 1.45 : kind === 'birch' ? 1.5 : .85;
  const wood = [], leaves = [], trunkTop = new T.Vector3((r() - .5) * .4, crownY - crownR * .35, (r() - .5) * .4), base = new T.Vector3(0, -.3, 0);
  const r0 = H * (kind === 'birch' ? .018 : .03);
  wood.push(limb(base, trunkTop, r0, r0 * .7));
  const centre = new T.Vector3(trunkTop.x, crownY, trunkTop.z), tips = [];
  // main limbs out and up into the crown, each forking once or twice
  const nLimbs = kind === 'birch' ? 5 : 6 + Math.floor(r() * 3);
  for (let i = 0; i < nLimbs; i++) {
    const a = i / nLimbs * 6.283 + r() * .6, up = .5 + r() * .5, from = trunkTop.clone().add(new T.Vector3(0, (r() - .3) * crownR * .4, 0));
    const to = centre.clone().add(new T.Vector3(Math.cos(a) * crownR * (.55 + r() * .3), (up - .3) * crownR * sq, Math.sin(a) * crownR * (.55 + r() * .3)));
    wood.push(limb(from, to, r0 * .5, r0 * .22));
    for (let k = 0; k < 2; k++) { const t2 = to.clone().add(new T.Vector3((r() - .5) * crownR * .6, r() * crownR * .45 * sq, (r() - .5) * crownR * .6)); wood.push(limb(to, t2, r0 * .22, r0 * .08)); tips.push(t2); }
    tips.push(to);
  }
  wood.push(limb(trunkTop, centre.clone().add(new T.Vector3(0, crownR * .8 * sq, 0)), r0 * .55, r0 * .1));
  // the crown: leaf cards around the limb tips and over the outer shell, a few inside for depth
  const nCards = (kind === 'birch' ? 170 : 240) * (lite ? .28 : 1);
  for (let i = 0; i < nCards; i++) {
    let p;
    if (i % 3 === 0) { const t = tips[Math.floor(r() * tips.length)]; p = t.clone().add(new T.Vector3((r() - .5) * 2.2, (r() - .5) * 1.8, (r() - .5) * 2.2)); }
    else { const u = r() * 2 - 1, th = r() * 6.283, s = Math.sqrt(1 - u * u), rad = .62 + Math.pow(r(), .5) * .45; p = new T.Vector3(Math.cos(th) * s * crownR * rad, u * crownR * sq * rad, Math.sin(th) * s * crownR * rad).add(centre); if (p.y < crownY - crownR * sq * .75) p.y = crownY - crownR * sq * (.6 + r() * .15); }
    const dir = p.clone().sub(centre).normalize().add(new T.Vector3((r() - .5) * 1.2, (r() - .2) * .8, (r() - .5) * 1.2)).normalize();
    leaves.push(card(p, (kind === 'birch' ? 1.5 : 2.1) * (lite ? 1.75 : 1) * (.75 + r() * .5), dir, centre, Math.floor(r() * 4), r));
  }
  const parts = [{geometry: merge(wood), material: kind === 'birch' ? birchMat : barkMat}, {geometry: merge(leaves), material: leafMat}];
  return finish(parts, H, crownR * 2);
}

/* ------------------------------------------------------------ conifers */
function conifer(seed, kind, lite = false) {
  const r = rng(seed), H = kind === 'spruce' ? 16 + r() * 4 : 13 + r() * 3, wood = [], sprays = [];
  const top = new T.Vector3(0, H, 0), r0 = H * .022;
  wood.push(limb(new T.Vector3(0, -.3, 0), top, r0, r0 * .08));
  const centreAxis = new T.Vector3();
  const whorls = Math.round((kind === 'spruce' ? 14 : 10) * (lite ? .55 : 1)), y0 = kind === 'spruce' ? H * .1 : H * .35;
  for (let w = 0; w < whorls; w++) {
    const f = w / (whorls - 1), y = y0 + (H - y0 - .6) * f, reach = (1 - f) * H * (kind === 'spruce' ? .26 : .2) + .6, n = 6 + Math.floor(r() * 3) - Math.floor(f * 3);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + r() * .5 + w * .7, droop = kind === 'spruce' ? .25 + f * -.2 : .05;
      const out = new T.Vector3(Math.cos(a), -droop, Math.sin(a)).normalize(), mid = new T.Vector3(0, y, 0).addScaledVector(out, reach * .55);
      centreAxis.set(0, y + reach * .2, 0);
      // a spray lies along the branch, tilted a little, two crossed cards for volume
      for (let k = 0; k < (lite ? 1 : 2); k++) {
        const g = new T.PlaneGeometry(reach * 1.15, reach * (lite ? 1.1 : .7));
        g.rotateX(-Math.PI / 2 + (k ? .55 : -.25)); g.rotateY(-a); g.translate(mid.x, mid.y - k * .15, mid.z);
        const nor = g.attributes.normal, pos = g.attributes.position;
        for (let v = 0; v < pos.count; v++) { _a.set(pos.getX(v), pos.getY(v), pos.getZ(v)).sub(centreAxis).normalize(); _a.y += .5; _a.normalize(); nor.setXYZ(v, _a.x, _a.y, _a.z); }
        sprays.push(g);
      }
      if (reach > 1.4 && !lite) wood.push(limb(new T.Vector3(0, y, 0), mid.clone().addScaledVector(out, reach * .3), r0 * .25, r0 * .06));
    }
  }
  const parts = [{geometry: merge(wood), material: barkMat}, {geometry: merge(sprays), material: needleMat}];
  return finish(parts, H, H * .5);
}

/* ------------------------------------------------------------ bushes */
// a ragged, leafy bush: a few stems and twigs, leaf cards gathered in three to five uneven lobes
function bush(seed) {
  const r = rng(seed), H = 1.5 + r() * .5, W = 1.7 + r() * .6, wood = [], leaves = [], lobes = [];
  const nL = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nL; i++) { const a = r() * 6.283, d = r() * W * .25; lobes.push({c: new T.Vector3(Math.cos(a) * d, H * (.45 + r() * .25), Math.sin(a) * d), rad: W * (.28 + r() * .14)}); }
  for (const l of lobes) wood.push(limb(new T.Vector3((r() - .5) * .2, -.1, (r() - .5) * .2), l.c, .035, .012));
  const centre = new T.Vector3(0, H * .45, 0);
  for (let i = 0; i < 90; i++) {
    const l = lobes[i % lobes.length], u = r() * 2 - 1, th = r() * 6.283, sq = Math.sqrt(1 - u * u), rad = l.rad * (.55 + Math.pow(r(), .6) * .55);
    const p = new T.Vector3(Math.cos(th) * sq * rad, u * rad * .8, Math.sin(th) * sq * rad).add(l.c); if (p.y < .15) p.y = .15 + r() * .2;
    const dir = p.clone().sub(centre).normalize().add(new T.Vector3((r() - .5) * 1.4, (r() - .2) * .9, (r() - .5) * 1.4)).normalize();
    leaves.push(card(p, .75 * (.75 + r() * .5), dir, centre, Math.floor(r() * 4), r));
  }
  return finish([{geometry: merge(wood), material: barkMat}, {geometry: merge(leaves), material: leafMat}], H, W);
}

function finish(parts, H, W) {
  let tris = 0; for (const p of parts) tris += p.geometry.index.count / 3;
  return {id: 'gen', name: 'generated tree', parts, size: H, height: H, width: W, tris, generated: true};
}

/** Ready-made tree models, by role, in the same form as downloaded ones. */
const lite = list => list.map(m => Object.assign(m, {lite: true}));
export const GEN_TREES = {
  tree: [broadleaf(11, 'round'), broadleaf(23, 'round'), broadleaf(37, 'tall'), broadleaf(41, 'birch')],
  pine: [conifer(5, 'pine'), conifer(17, 'spruce'), conifer(29, 'spruce')],
  bush: [bush(3), bush(9), bush(19), bush(27)],
  // lighter versions for the woods further from the road (fewer, larger leaf cards)
  treeFar: lite([broadleaf(11, 'round', true), broadleaf(23, 'round', true), broadleaf(37, 'tall', true)]),
  pineFar: lite([conifer(5, 'pine', true), conifer(17, 'spruce', true)]),
};

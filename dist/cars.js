// Detailed car models built in code. Bodies are lofted from smooth cross-sections (instead of boxes),
// with real wheel arches, a modelled cockpit or glass cabin, chrome trim, lamps and detailed wheels.
import * as T from './three.module.js';

/* ---------------------------------------------------------------- helpers */
const smooth = t => t * t * (3 - 2 * t);
// Piecewise curve through [u, value] keys with smooth easing between keys.
const curve = keys => u => {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [a, va] = keys[i - 1], [b, vb] = keys[i];
    if (u <= b) return va + (vb - va) * smooth((u - a) / (b - a));
  }
  return keys[keys.length - 1][1];
};

const geoCache = new Map();
const cached = (key, make) => geoCache.get(key) || (geoCache.set(key, make()), geoCache.get(key));

function roundedBox(w, h, d, r) {
  return cached(`rb${w}|${h}|${d}|${r}`, () => {
    const s = new T.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const b = Math.min(r, d / 2) * 0.6;
    const g = new T.ExtrudeGeometry(s, {depth: Math.max(d - 2 * b, 0.001), bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 6});
    g.translate(0, 0, -(d - 2 * b) / 2);
    return g;
  });
}

/* A superellipse cross-section: half width w, top / shoulder (mid) / bottom heights, tumblehome tw. */
function ringPoint(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  let x = Math.sign(c) * Math.pow(Math.abs(c), 2 / p.n) * p.w;
  const up = s >= 0;
  const y = up ? p.mid + (p.top - p.mid) * Math.pow(Math.abs(s), 2 / p.m) : p.mid - (p.mid - p.bot) * Math.pow(Math.abs(s), 2 / p.mb);
  if (up) x *= 1 - (1 - p.tw) * Math.min(1, (y - p.mid) / Math.max(p.top - p.mid, 1e-3));
  return [x, y];
}
// Width of the surface at height y (above the shoulder line) for a section.
function surfaceX(p, y) {
  if (y <= p.mid) return p.w;
  const t = Math.min(1, (y - p.mid) / Math.max(p.top - p.mid, 1e-3)), s = Math.pow(t, p.m / 2), c = Math.sqrt(Math.max(0, 1 - s * s));
  return Math.pow(c, 2 / p.n) * p.w * (1 - (1 - p.tw) * t);
}

/* Lofts sections section(u) for u in [0,1] (front to back) into a closed, smooth body. */
function loft(section, stations = 64, around = 44) {
  const pos = [], idx = [], rings = [];
  for (let j = 0; j <= stations; j++) {
    const u = 0.5 - 0.5 * Math.cos(Math.PI * j / stations); // denser at the ends for rounded noses
    const p = section(u), ring = [];
    for (let i = 0; i < around; i++) {
      const [x, y] = ringPoint(p, i / around * Math.PI * 2);
      ring.push([x, y, p.z]);
      pos.push(x, y, p.z);
    }
    rings.push(ring);
  }
  for (let j = 0; j < stations; j++)
    for (let i = 0; i < around; i++) {
      const a = j * around + i, b = j * around + (i + 1) % around, c = (j + 1) * around + i, d = (j + 1) * around + (i + 1) % around;
      idx.push(a, b, c, b, d, c);
    }
  // end caps (separate vertices so the edges stay crisp)
  for (const [ring, front] of [[rings[0], true], [rings[stations], false]]) {
    const base = pos.length / 3;
    let cx = 0, cy = 0;
    for (const v of ring) { pos.push(...v); cx += v[0]; cy += v[1]; }
    pos.push(cx / around, cy / around, ring[0][2]);
    const centre = base + around;
    for (let i = 0; i < around; i++) {
      const a = base + i, b = base + (i + 1) % around;
      if (front) idx.push(centre, b, a); else idx.push(centre, a, b);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let tubeScale = 1;
function tube(points, radius, closed = false, seg = 48) {
  seg = Math.max(4, Math.round(seg * tubeScale));
  const c = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), closed, 'centripetal');
  return new T.TubeGeometry(c, seg, radius, 8, closed);
}

/* ---------------------------------------------------------------- styles */
// Lengths in metres; u runs from the front bumper (0) to the rear (1). z = -len/2 + u*len (front is -z).
const STYLES = {
  roadster: {
    len: 4.2, wheelU: [0.2, 0.78], r: 0.36, track: 0.8, tyreW: 0.24, wire: true,
    w: [[0, 0.62], [0.03, 0.8], [0.1, 0.92], [0.3, 0.96], [0.76, 0.97], [0.92, 0.93], [1, 0.76]],
    top: [[0, 0.62], [0.035, 0.76], [0.13, 0.86], [0.33, 0.94], [0.39, 0.96], [0.72, 0.96], [0.86, 0.98], [0.96, 0.9], [1, 0.74]],
    mid: [[0, 0.52], [0.1, 0.64], [0.9, 0.66], [1, 0.58]],
    bot: [[0, 0.38], [0.05, 0.28], [0.95, 0.28], [1, 0.4]],
    n: 2.7, m: 2.3, mb: 3.4, tw: 0.84, cockpit: [0.385, 0.7],
  },
  sedan: {
    len: 4.6, wheelU: [0.19, 0.79], r: 0.34, track: 0.79, tyreW: 0.22,
    w: [[0, 0.72], [0.035, 0.86], [0.12, 0.91], [0.85, 0.91], [0.96, 0.86], [1, 0.74]],
    top: [[0, 0.6], [0.04, 0.72], [0.2, 0.82], [0.29, 0.86], [0.78, 0.9], [0.93, 0.9], [1, 0.78]],
    mid: [[0, 0.52], [0.1, 0.6], [0.9, 0.62], [1, 0.56]],
    bot: [[0, 0.34], [0.05, 0.24], [0.95, 0.24], [1, 0.36]],
    n: 3.2, m: 2.6, mb: 4, tw: 0.9,
    cabin: {u0: 0.285, u1: 0.81, roof: [[0.285, 0.86], [0.44, 1.42], [0.66, 1.44], [0.81, 0.9]], w: 0.84, tw: 0.76},
  },
  hatch: {
    len: 4.05, wheelU: [0.18, 0.81], r: 0.33, track: 0.78, tyreW: 0.21,
    w: [[0, 0.72], [0.04, 0.85], [0.12, 0.9], [0.88, 0.9], [0.97, 0.86], [1, 0.8]],
    top: [[0, 0.6], [0.045, 0.72], [0.2, 0.84], [0.3, 0.88], [0.9, 0.92], [1, 0.9]],
    mid: [[0, 0.52], [0.1, 0.6], [0.9, 0.63], [1, 0.6]],
    bot: [[0, 0.34], [0.05, 0.24], [0.96, 0.26], [1, 0.36]],
    n: 3.2, m: 2.6, mb: 4, tw: 0.9,
    cabin: {u0: 0.3, u1: 0.975, roof: [[0.3, 0.88], [0.46, 1.45], [0.88, 1.43], [0.975, 0.98]], w: 0.85, tw: 0.78},
  },
  // a modern low fastback coupé: long bonnet, sloping glass roof, big wheels, tinted glass
  coupe: {
    len: 4.6, wheelU: [0.17, 0.8], r: 0.37, track: 0.85, tyreW: 0.27,
    w: [[0, 0.74], [0.035, 0.88], [0.12, 0.95], [0.5, 0.97], [0.86, 0.96], [0.96, 0.9], [1, 0.8]],
    top: [[0, 0.56], [0.04, 0.66], [0.18, 0.74], [0.3, 0.79], [0.78, 0.86], [0.93, 0.85], [1, 0.74]],
    mid: [[0, 0.47], [0.1, 0.55], [0.9, 0.6], [1, 0.54]],
    bot: [[0, 0.3], [0.05, 0.19], [0.95, 0.21], [1, 0.33]],
    n: 3.6, m: 3, mb: 4.4, tw: 0.9,
    cabin: {u0: 0.31, u1: 0.88, roof: [[0.31, 0.8], [0.47, 1.27], [0.6, 1.29], [0.88, 0.87]], w: 0.8, tw: 0.68},
  },
  suv: {
    len: 4.7, wheelU: [0.18, 0.8], r: 0.4, track: 0.83, tyreW: 0.26,
    w: [[0, 0.76], [0.04, 0.9], [0.12, 0.95], [0.88, 0.95], [0.97, 0.92], [1, 0.84]],
    top: [[0, 0.78], [0.05, 0.92], [0.2, 1.02], [0.3, 1.06], [0.9, 1.1], [1, 1.04]],
    mid: [[0, 0.66], [0.1, 0.76], [0.9, 0.8], [1, 0.74]],
    bot: [[0, 0.46], [0.05, 0.36], [0.95, 0.36], [1, 0.46]],
    n: 3.8, m: 3, mb: 4.5, tw: 0.92,
    cabin: {u0: 0.29, u1: 0.98, roof: [[0.29, 1.06], [0.43, 1.76], [0.92, 1.78], [0.98, 1.14]], w: 0.88, tw: 0.84},
  },
};

function makeSection(S) {
  const W = curve(S.w), Top = curve(S.top), Mid = curve(S.mid), Bot = curve(S.bot);
  const wheelZ = S.wheelU.map(u => -S.len / 2 + u * S.len), R = S.r + 0.075;
  return u => {
    const z = -S.len / 2 + u * S.len;
    let bot = Bot(u), w = W(u);
    for (const wz of wheelZ) {
      const dz = Math.abs(z - wz);
      if (dz < R) bot = Math.max(bot, S.r + Math.sqrt(R * R - dz * dz) * 0.95);  // wheel arch
      w += 0.035 * Math.max(0, 1 - dz / (R * 1.4));                                // fender flare
    }
    return {z, w, top: Top(u), mid: Mid(u), bot: Math.min(bot, Mid(u) - 0.05), n: S.n, m: S.m, mb: S.mb, tw: S.tw};
  };
}

/* ---------------------------------------------------------------- builder */
// kit: {mat(color, metal, rough), glass, lamp(color), person(group,x,y,z), addWheel(steer,pivot,r,front)}
export function buildDetailedCar(g, style, paintColor, driver, kit) {
  tubeScale = style === 'roadster' ? 1 : 0.45;
  const S = STYLES[style] || STYLES.sedan, sec = makeSection(S), Z = u => -S.len / 2 + u * S.len;
  const paint = kit.mat(paintColor, 0.55, 0.3), chrome = kit.mat('#e9ecec', 1, 0.1), dark = kit.mat('#15191a', 0.2, 0.55);
  const rubber = kit.mat('#202421', 0, 0.9), leather = kit.mat(style === 'roadster' ? '#7a4f2e' : '#2a2c2d', 0, 0.55), plateM = kit.mat('#e6e2d3', 0, 0.5);
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m;
  };

  // body
  const hero = style === 'roadster';  // the player's car gets the finest mesh; traffic is lighter
  add(hero ? loft(sec) : loft(sec, 36, 28), paint);
  // underbody between the wheels, so low views never see through the arches
  add(roundedBox(1.5, 0.22, S.len * 0.72, 0.08), dark, 0, S.r * 0.75, Z(0.5));

  // chrome shoulder trim
  const trim = [];
  for (let u = 0.08; u <= 0.93; u += 0.05) { const p = sec(u); trim.push([p.w + 0.004, p.mid + 0.01, p.z]); }
  for (const side of [-1, 1]) add(tube(trim.map(([x, y, z]) => [x * side, y, z]), 0.008, false, 60), chrome);

  // door seams (dark lines following the body side)
  const doorU = S.cockpit ? [S.cockpit[0] + 0.01, S.cockpit[1] - 0.06] : [S.cabin.u0 + 0.02, (S.cabin.u0 + S.cabin.u1) / 2, S.cabin.u1 - 0.08];
  for (const u of doorU) {
    const p = sec(u), pts = [];
    for (let k = 0; k <= 6; k++) { const y = p.bot + 0.08 + (p.top - 0.03 - p.bot - 0.08) * k / 6; pts.push([surfaceX(p, y) + 0.003, y, p.z]); }
    for (const side of [-1, 1]) add(tube(pts.map(([x, y, z]) => [x * side, y, z]), 0.006, false, 12), dark);
  }

  // bumpers
  const fz = Z(0) - 0.05, rz = Z(1) + 0.05, by = S.bot[1][1] + 0.12;
  for (const [zz, dir] of [[fz, 1], [rz, -1]]) {
    const wB = sec(dir > 0 ? 0.04 : 0.96).w;
    const pts = [[-wB - 0.02, by, zz + dir * 0.3], [-wB + 0.15, by, zz + dir * 0.03], [0, by, zz - dir * 0.02], [wB - 0.15, by, zz + dir * 0.03], [wB + 0.02, by, zz + dir * 0.3]];
    if (style === 'roadster') add(tube(pts, 0.04, false, 40), chrome);
    else add(tube(pts, 0.07, false, 40), paint);
    add(roundedBox(0.52, 0.12, 0.03, 0.015), plateM, 0, by + (style === 'roadster' ? 0.13 : 0.12), zz - dir * 0.01);
  }
  // grille
  const nose = sec(0.012);
  add(roundedBox(style === 'roadster' ? 0.7 : 0.95, style === 'suv' ? 0.26 : 0.16, 0.05, 0.06), dark, 0, (nose.mid + nose.bot) / 2 + 0.02, Z(0.012) - 0.01);
  if (style === 'roadster') for (let i = -3; i <= 3; i++) add(roundedBox(0.012, 0.12, 0.04, 0.005), chrome, i * 0.085, (nose.mid + nose.bot) / 2 + 0.02, Z(0.012) - 0.03);

  // lamps
  const head = kit.lamp('#fff1c4'), tail = kit.lamp('#f05b3e'), heads = [], tails = [];
  if (style === 'roadster') {
    for (const side of [-1, 1]) {
      const p = sec(0.075), x = side * p.w * 0.66, y = p.top - 0.02, z = p.z - 0.02;
      add(new T.TorusGeometry(0.105, 0.02, 10, 28), chrome, x, y, z, 0, 0, 0);
      add(new T.CylinderGeometry(0.1, 0.1, 0.05, 28), head, x, y, z + 0.01, Math.PI / 2, 0, 0);
      add(new T.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint, x, y, z + 0.09, -Math.PI / 2, 0, 0); // lamp pod
      heads.push([x, y, z - 0.08]);
      const t = sec(0.985);
      for (const k of [0.55, 0.78]) { const tx = side * t.w * k, ty = t.mid + 0.08; add(new T.CylinderGeometry(0.055, 0.055, 0.05, 20), tail, tx, ty, t.z + 0.01, Math.PI / 2, 0, 0); add(new T.TorusGeometry(0.058, 0.012, 8, 20), chrome, tx, ty, t.z + 0.02); }
      tails.push([side * t.w * 0.66, t.mid + 0.08, t.z + 0.1]);
    }
  } else {
    for (const side of [-1, 1]) {
      const p = sec(0.02), y = (p.mid + p.top) / 2 - 0.02;
      add(roundedBox(0.4, 0.13, 0.08, 0.05), head, side * p.w * 0.66, y, p.z + 0.02, 0, -side * 0.15, 0);
      add(roundedBox(0.44, 0.17, 0.06, 0.06), dark, side * p.w * 0.66, y, p.z + 0.05, 0, -side * 0.15, 0);
      heads.push([side * p.w * 0.66, y, p.z - 0.06]);
      const t = sec(0.985), ty = (t.mid + t.top) / 2;
      add(roundedBox(0.42, 0.14, 0.08, 0.05), tail, side * t.w * 0.72, ty, t.z - 0.01, 0, side * 0.15, 0);
      tails.push([side * t.w * 0.72, ty, t.z + 0.08]);
    }
  }
  g.userData.lampPos = {head: heads, tail: tails};

  // exhaust
  for (const side of style === 'roadster' ? [-1, 1] : [1]) add(new T.CylinderGeometry(0.035, 0.035, 0.3, 14), chrome, side * 0.42, S.bot[1][1] + 0.04, Z(0.97), Math.PI / 2, 0, 0);

  // mirrors
  const mirrorU = S.cockpit ? S.cockpit[0] + 0.02 : S.cabin.u0 + 0.04, mp = sec(mirrorU);
  for (const side of [-1, 1]) {
    const x = side * (mp.w + 0.05), y = mp.top + (S.cockpit ? 0.1 : 0.08);
    add(new T.CylinderGeometry(0.012, 0.012, 0.12, 8), chrome, side * (mp.w - 0.01), y - 0.06, mp.z, 0, 0, side * 0.6);
    add(roundedBox(0.16, 0.09, 0.07, 0.035), S.cockpit ? chrome : paint, x, y, mp.z);
  }

  if (S.cockpit) buildCockpit(); else buildCabin();

  // wheels
  for (const [i, u] of S.wheelU.entries()) for (const side of [-1, 1]) wheel(side, Z(u), i === 0);

  function wheel(side, z, front) {
    const steer = new T.Group(), pivot = new T.Group(), r = S.r, tw = S.tyreW, rimR = r * 0.66;
    steer.position.set(side * (S.track + 0.08), r, z); g.add(steer); steer.add(pivot);
    const tyre = cached(`tyre${r}|${tw}`, () => {
      const pts = [[rimR, -tw / 2], [r - 0.04, -tw / 2], [r - 0.01, -tw / 2 + 0.025], [r, -tw / 2 + 0.06], [r, tw / 2 - 0.06], [r - 0.01, tw / 2 - 0.025], [r - 0.04, tw / 2], [rimR, tw / 2]];
      const l = new T.LatheGeometry(pts.map(([a, b]) => new T.Vector2(a, b)), 28); l.rotateZ(Math.PI / 2); return l;
    });
    pivot.add(mesh(tyre, rubber));
    const out = side * (tw / 2 - 0.02);
    const dish = cached(`dish${rimR}|${tw}`, () => {
      const pts = [[0.001, 0.03], [rimR * 0.25, 0.03], [rimR * 0.85, -0.02], [rimR, -0.05], [rimR, -tw + 0.04]];
      const l = new T.LatheGeometry(pts.map(([a, b]) => new T.Vector2(a, b)), 36); l.rotateZ(-Math.PI / 2); return l;
    });
    const d = mesh(dish, S.wire ? chrome : kit.mat('#b9bec0', 0.9, 0.3)); d.position.x = out; d.scale.x = side; pivot.add(d);
    const spokes = S.wire ? 16 : 5;
    for (let k = 0; k < spokes; k++) {
      const a = k / spokes * Math.PI * 2, sp = mesh(S.wire ? cached('wspoke', () => new T.CylinderGeometry(0.005, 0.005, 1, 5)) : roundedBox(0.05, 1, 0.025, 0.012), S.wire ? chrome : kit.mat('#c9ced0', 0.95, 0.25));
      sp.scale.y = rimR * 0.82; sp.position.set(out + side * 0.015, Math.cos(a) * rimR * 0.46, Math.sin(a) * rimR * 0.46); sp.rotation.x = a; pivot.add(sp);
    }
    const cap = mesh(cached('cap', () => new T.CylinderGeometry(1, 1, 0.04, 20)), chrome); cap.scale.set(rimR * 0.22, 1, rimR * 0.22); cap.rotation.z = Math.PI / 2; cap.position.x = out + side * 0.03; pivot.add(cap);
    // brake disc and calliper stay still (not on the spinning pivot)
    const disc = mesh(cached('disc', () => new T.CylinderGeometry(1, 1, 0.025, 28)), kit.mat('#5d6163', 0.9, 0.4)); disc.scale.set(rimR * 0.78, 1, rimR * 0.78); disc.rotation.z = Math.PI / 2; disc.position.x = side * 0.02; steer.add(disc);
    const cal = mesh(roundedBox(0.06, 0.14, 0.1, 0.02), kit.mat(S.wire ? '#4d5153' : '#9b2d23', 0.3, 0.5)); cal.position.set(side * 0.05, rimR * 0.55, 0); steer.add(cal);
    kit.addWheel(steer, pivot, r, front);
  }

  function buildCockpit() {
    const [u0, u1] = S.cockpit, z0 = Z(u0), z1 = Z(u1), zc = (z0 + z1) / 2, len = z1 - z0, wc = sec((u0 + u1) / 2).w * 0.78, y = sec((u0 + u1) / 2).top;
    add(roundedBox(wc * 2, 0.025, len, 0.2), dark, 0, y + 0.002, zc);                       // the opening
    const rim = [[-wc, y + 0.01, z0 + 0.15], [-wc + 0.12, y + 0.01, z0], [wc - 0.12, y + 0.01, z0], [wc, y + 0.01, z0 + 0.15], [wc, y + 0.01, z1 - 0.15], [wc - 0.15, y + 0.01, z1], [-wc + 0.15, y + 0.01, z1], [-wc, y + 0.01, z1 - 0.15]];
    add(tube(rim, 0.035, true, 64), leather);
    add(roundedBox(wc * 2 - 0.1, 0.22, 0.28, 0.08), leather, 0, y - 0.05, z0 + 0.12);       // dashboard
    for (const x of [-0.42, -0.22]) add(new T.TorusGeometry(0.05, 0.008, 8, 20), chrome, x, y + 0.02, z0 + 0.27, 0.35, 0, 0); // gauges
    for (const x of [-0.4, 0.4]) {
      add(roundedBox(0.5, 0.14, 0.5, 0.07), leather, x, y - 0.12, z0 + len * 0.62);                  // cushion
      add(roundedBox(0.5, 0.62, 0.14, 0.07), leather, x, y + 0.13, z0 + len * 0.88, -0.22, 0, 0);    // backrest
      add(roundedBox(0.26, 0.2, 0.11, 0.06), leather, x, y + 0.5, z0 + len * 0.95, -0.12, 0, 0);     // headrest
      add(new T.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint, x, y - 0.01, z1 + 0.32).scale.set(0.24, 0.2, 0.42); // fairing
    }
    // windscreen: chrome frame and a gently curved pane
    const wsZ = z0 - 0.05, wsH = 0.42, wsW = wc + 0.08;
    const pane = cached('screen', () => { const p = new T.PlaneGeometry(1, 1, 16, 1), a = p.attributes.position; for (let i = 0; i < a.count; i++) a.setZ(i, a.getX(i) * a.getX(i) * 0.22); p.computeVertexNormals(); return p; });
    const ws = add(pane, kit.glass, 0, y + wsH / 2 + 0.03, wsZ, -0.32, 0, 0); ws.scale.set(wsW * 2, wsH, 1); ws.castShadow = false;
    add(tube([[-wsW, y + 0.02, wsZ + 0.02], [-wsW, y + wsH + 0.02, wsZ + 0.16], [0, y + wsH + 0.04, wsZ + 0.12], [wsW, y + wsH + 0.02, wsZ + 0.16], [wsW, y + 0.02, wsZ + 0.02]], 0.018, false, 40), chrome);
    // steering wheel
    add(new T.TorusGeometry(0.19, 0.022, 10, 32), kit.mat('#2b2522', 0, 0.5), -0.4, y + 0.17, z0 + 0.42, -0.55, 0, 0);
    add(new T.CylinderGeometry(0.02, 0.02, 0.36, 8), dark, -0.4, y + 0.05, z0 + 0.32, -0.95, 0, 0);
    if (driver) kit.person(g, -0.4, y - 0.12, z0 + len * 0.6);
  }

  function buildCabin() {
    const C = S.cabin, Roof = curve(C.roof);
    const cabSec = u => { const p = sec(u), top = Roof(u); return {z: p.z, w: p.w * C.w, top, mid: p.top - 0.03, bot: p.top - 0.06, n: 3, m: 4.2, mb: 2, tw: C.tw}; };
    const range = u => C.u0 + u * (C.u1 - C.u0);
    add(loft(u => cabSec(range(u)), 40, 36), kit.glassDark);
    // roof panel where the cabin is near its full height
    const maxRoof = Math.max(...C.roof.map(k => k[1]));
    const roofKeys = [], pts = [];
    for (let k = 0; k <= 40; k++) { const u = range(k / 40); if (Roof(u) > maxRoof - 0.07) roofKeys.push(u); }
    if (roofKeys.length > 2) {
      const ra = roofKeys[0], rb = roofKeys[roofKeys.length - 1];
      add(loft(t => { const u = ra + t * (rb - ra), p = cabSec(u); const top = p.top + 0.012; return {z: p.z, w: surfaceX(p, p.top - 0.06) + 0.012, top, mid: top - 0.05, bot: top - 0.055, n: 3.4, m: 3, mb: 2, tw: 0.86}; }, 24, 32), paint);
      // pillars: A (front), B (middle), C (rear)
      const pillar = (uBase, uTop, r) => {
        const pb = cabSec(uBase), pt = cabSec(uTop);
        for (const side of [-1, 1]) {
          const a = [side * (surfaceX(pb, pb.mid + 0.02) + 0.005), pb.mid + 0.02, pb.z], b = [side * (surfaceX(pt, pt.top - 0.06) + 0.01), pt.top - 0.05, pt.z];
          add(tube([a, [(a[0] + b[0]) / 2 * 1.01, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], r, false, 8), paint);
        }
      };
      pillar(C.u0 + 0.01, ra, 0.04);
      pillar((ra + rb) / 2 + 0.02, (ra + rb) / 2 + 0.02, 0.045);
      pillar(C.u1 - 0.01, rb, style === 'hatch' || style === 'suv' ? 0.09 : 0.06);
    }
    // window line trim
    for (let u = C.u0 + 0.02; u <= C.u1 - 0.02; u += (C.u1 - C.u0) / 12) { const p = sec(u); pts.push([p.w * C.w * 0.99, p.top - 0.02, p.z]); }
    for (const side of [-1, 1]) add(tube(pts.map(([x, y, z]) => [x * side, y, z]), 0.012, false, 24), dark);
    if (style === 'suv') for (const side of [-1, 1]) add(tube([[side * 0.6, maxRoof + 0.05, Z(0.42)], [side * 0.6, maxRoof + 0.06, Z(0.9)]], 0.022, false, 4), kit.mat('#2a2d2e', 0.6, 0.4)); // roof rails
  }

  function mesh(geo, mat) { const m = new T.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m; }
  return g;
}

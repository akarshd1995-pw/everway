// A touring coach, built from simple rounded shapes: long body, tinted window band, a stripe,
// six wheels and lamps. Faces -z like the other vehicles, about 11.5 m long.
import * as T from '../three.module.js';
import {lampMaterials} from '../vehicles.js';

const mat = (color, metal = .2, rough = .45) => new T.MeshStandardMaterial({color, metalness: metal, roughness: rough});
function box(g, w, h, d, m, x, y, z, r = 0) {
  const geo = r ? rounded(w, h, d, r) : new T.BoxGeometry(w, h, d);
  const mesh = new T.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh;
}
function rounded(w, h, d, r) {
  // a box with rounded vertical edges (extruded rounded rectangle), long axis along z
  const s = new T.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); s.lineTo(w / 2, y);
  s.quadraticCurveTo(w / 2, h / 2, x, h / 2); s.lineTo(-x, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  s.lineTo(-w / 2, -y); s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const geo = new T.ExtrudeGeometry(s, {depth: d - .3, bevelEnabled: true, bevelSize: .15, bevelThickness: .15, bevelSegments: 3, curveSegments: 6});
  geo.translate(0, 0, -(d - .3) / 2); return geo;
}

export function buildCoach(color = '#2f6f8f', o = {}) {
  const g = new T.Group(); g.userData = {type: 'coach', wheels: [], pedal: 0, exterior: []};
  const L = o.L || 11.4, W = o.W || 2.5, H = o.H || 3.1, base = o.base || .55, van = !!o.van;
  const paint = mat(color, .35, .3), white = mat('#eef1ef', .2, .35), glass = mat('#1d2a33', .6, .08), dark = mat('#22272a', .1, .7), chrome = mat('#c9cfcf', .9, .25);
  box(g, W, H, L, white, 0, base + H / 2, 0, .35);
  box(g, W + .02, 1.05, L - .5, glass, 0, base + H * .66, .05);                    // window band
  box(g, W + .03, .32, L - .2, paint, 0, base + H * .34, 0);                       // stripe
  box(g, W + .03, .12, L - .2, paint, 0, base + H * .25, 0);
  if (van) { box(g, W - .1, 1, .04, glass, 0, base + H * .66, -L / 2 - .02); box(g, W - .2, .3, .25, dark, 0, base + .12, -L / 2 + .05); box(g, W - .2, .3, .25, dark, 0, base + .12, L / 2 - .05); wheels(g, W, [[-L / 2 + 1.0, true], [L / 2 - 1.1, false]], .36, dark); return lamps(g, base, L, W); }
  const ext = g.children.slice(); g.userData.exterior = ext;   // everything so far is outside the cab
  const screen = new T.MeshStandardMaterial({color: '#9fc4cf', metalness: .2, roughness: .05, transparent: true, opacity: .22, depthWrite: false});
  box(g, W - .1, 1.5, .04, screen, 0, base + H * .62, -L / 2 - .02);               // windscreen
  // the driver's corner, seen from the driver's view: dashboard, wheel, pillars and the front of the seats
  const dash = mat('#2a2f33', .1, .8);
  box(g, W - .2, .5, .8, dash, 0, base + .95, -L / 2 + .5);
  const wheel = new T.Mesh(new T.TorusGeometry(.26, .035, 8, 24), dash); wheel.position.set(-.6, base + 1.42, -L / 2 + 1.05); wheel.rotation.x = -1.1; g.add(wheel);
  box(g, .06, .45, .06, dash, -.6, base + 1.15, -L / 2 + 1.15);
  for (const sx of [-1, 1]) box(g, .14, 1.6, .14, mat('#e9ecea', .2, .4), sx * (W / 2 - .07), base + H * .62, -L / 2 + .02);
  box(g, W - .1, .14, .14, mat('#e9ecea', .2, .4), 0, base + H * .92, -L / 2 + .02);
  for (let row = 0; row < 3; row++) for (const sx of [-1, 1]) box(g, .9, .9, .25, mat(color, .1, .7), sx * .65, base + 1.1, -L / 2 + 2.6 + row * .95);
  // floor and side walls of the cab, seen only from inside
  box(g, W - .1, .05, L - .6, mat('#3a4044', .1, .9), 0, base + .45, 0);
  for (const sx of [-1, 1]) { const wall = box(g, .05, .9, L - .6, mat('#d9dcd8', .1, .8), sx * (W / 2 - .05), base + .95, 0); }
  box(g, W - .3, .18, .1, chrome, 0, base + .55, -L / 2 - .05);                    // front grille bar
  box(g, W - .2, .35, .3, dark, 0, base + .1, -L / 2 + .05);                       // bumper
  box(g, W - .2, .35, .3, dark, 0, base + .1, L / 2 - .05);
  box(g, W - .5, .5, .06, glass, 0, base + H * .7, L / 2 + .02);                   // rear window
  box(g, .1, .6, .35, dark, -W / 2 - .2, base + H * .62, -L / 2 + .35);            // mirrors
  box(g, .1, .6, .35, dark, W / 2 + .2, base + H * .62, -L / 2 + .35);
  for (const [z, front] of [[-L / 2 + 2.1, true], [L / 2 - 2.6, false], [L / 2 - 1.5, false]]) for (const sx of [-1, 1]) {
    const steer = new T.Group(), pivot = new T.Group(); steer.position.set(sx * (W / 2 - .28), .52, z); g.add(steer); steer.add(pivot);
    const tyre = new T.Mesh(new T.CylinderGeometry(.52, .52, .34, 20), mat('#1c1f20', 0, .9)); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; pivot.add(tyre);
    const hub = new T.Mesh(new T.CylinderGeometry(.3, .3, .36, 14), chrome); hub.rotation.z = Math.PI / 2; pivot.add(hub);
    g.userData.wheels.push({pivot, steer, r: .52, front});
    box(g, .1, .62, 1.3, dark, sx * (W / 2 + .01), base + .25, z);                  // wheel arch shadow
  }
  return lamps(g, base, L, W);
}

/** Wheels with tyres, a steel hub and a dark arch, at the given positions along the body. */
function wheels(g, W, at, r, dark, inset = .26) {
  const tyreM = mat('#1c1f20', 0, .9), hubM = mat('#b9bec0', .8, .35);
  for (const [z, front] of at) for (const sx of [-1, 1]) {
    const steer = new T.Group(), pivot = new T.Group(); steer.position.set(sx * (W / 2 - inset), r, z); g.add(steer); steer.add(pivot);
    const tyre = new T.Mesh(new T.CylinderGeometry(r, r, .3, 20), tyreM); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; pivot.add(tyre);
    const hub = new T.Mesh(new T.CylinderGeometry(r * .58, r * .58, .32, 12), hubM); hub.rotation.z = Math.PI / 2; pivot.add(hub);
    g.userData.wheels.push({pivot, steer, r, front});
    box(g, .08, r * 1.15, r * 2.5, dark, sx * (W / 2 + .005), r * .95, z);
  }
}

/** A lorry: a tall cab with a big windscreen, and a box body behind on a dark chassis, three axles. */
export function buildLorry(color = '#c9cfd2', body = '#e9e9e4') {
  const g = new T.Group(); g.userData = {type: 'coach', wheels: [], pedal: 0, exterior: []};
  const W = 2.5, L = 11, cab = 2.3, base = .6, paint = mat(color, .35, .35), side = mat(body, .1, .6), glass = mat('#1d2a33', .6, .08), dark = mat('#202427', .1, .75), chrome = mat('#c9cfcf', .9, .25);
  box(g, W, 2.3, cab, paint, 0, base + 1.3, -L / 2 + cab / 2, .2);                   // cab
  box(g, W - .3, .9, .05, glass, 0, base + 1.85, -L / 2 - .01);                       // windscreen
  for (const sx of [-1, 1]) box(g, .05, .7, .9, glass, sx * (W / 2 + .005), base + 1.9, -L / 2 + .7);   // door windows
  box(g, W - .5, .45, .06, dark, 0, base + .75, -L / 2 - .02);                         // grille
  box(g, W, .4, .3, dark, 0, base + .2, -L / 2 + .1);                                  // bumper
  box(g, W - .2, .35, .9, paint, 0, base + 2.55, -L / 2 + .7, .15);                    // roof fairing
  box(g, .7, .8, .9, dark, 0, base + 2.75, -L / 2 + 1.0);
  for (const sx of [-1, 1]) box(g, .08, .55, .3, dark, sx * (W / 2 + .25), base + 1.95, -L / 2 + .3);   // mirrors
  box(g, 1.2, .25, L - cab - .2, dark, 0, base + .1, cab / 2 + .1);                     // chassis
  box(g, W, 2.75, L - cab - .4, side, 0, base + .4 + 1.38, cab / 2 + .2, .08);        // box body
  box(g, W + .02, .14, L - cab - .4, paint, 0, base + .5, cab / 2 + .2);              // skirt stripe
  for (const sx of [-1, 1]) box(g, .05, .5, 3.2, mat('#3a4044', .1, .8), sx * (W / 2 - .05), base + .1, 0);   // side guards
  box(g, W - .1, 2.6, .05, mat('#d9dad5', .2, .5), 0, base + .4 + 1.38, L / 2 + .02);  // rear doors
  box(g, .06, 2.6, .07, chrome, 0, base + 1.78, L / 2 + .05);
  wheels(g, W, [[-L / 2 + 1.4, true], [L / 2 - 2.6, false], [L / 2 - 1.4, false]], .52, dark, .32);
  return lamps(g, base, L, W);
}

/** A local bus: a coach in a town livery that stops at the village stops. */
export function buildBus(color = '#b8302a') { const g = buildCoach(color, {L: 10.6, W: 2.5, H: 2.9, base: .45}); g.userData.bus = true; return g; }

function lamps(g, base, L, W) {
  for (const sx of [-1, 1]) {
    const head = new T.Mesh(new T.BoxGeometry(.45, .16, .04), lampMaterials['#fff1c4'] || mat('#fff1c4')); head.position.set(sx * (W / 2 - .4), base + .55, -L / 2 - .06); g.add(head);
    const tail = new T.Mesh(new T.BoxGeometry(.18, .5, .04), lampMaterials['#f05b3e'] || mat('#f05b3e')); tail.position.set(sx * (W / 2 - .2), base + .9, L / 2 + .06); g.add(tail);
  }
  g.userData.lampPos = {head: [[-(W / 2 - .4), base + .55, -L / 2 - .2], [W / 2 - .4, base + .55, -L / 2 - .2]], tail: [[-(W / 2 - .2), base + .9, L / 2 + .2], [W / 2 - .2, base + .9, L / 2 + .2]]};
  return g;
}

/** A farm tractor: big rear wheels, small front ones, a cab frame. Slow. */
export function buildTractor(color = '#2f7d3a') {
  const g = new T.Group(); g.userData = {type: 'tractor', wheels: [], pedal: 0};
  const paint = mat(color, .3, .4), dark = mat('#23272a', .1, .8), glassM = mat('#9fc4cf', .2, .05);
  box(g, 1.2, 1, 2.4, paint, 0, 1.2, -.7, .2);                 // bonnet
  box(g, 1.5, .5, 1.6, paint, 0, 1.05, .9);                     // body over the rear axle
  for (const [x, z] of [[-.65, .35], [.65, .35], [-.65, 1.65], [.65, 1.65]]) box(g, .08, 1.7, .08, dark, x, 2.1, z);
  box(g, 1.45, .08, 1.45, paint, 0, 2.95, 1);                  // cab roof
  box(g, 1.3, .9, .04, glassM, 0, 2.3, .35);
  box(g, .12, .6, .12, dark, .35, 2, -1.6);                     // exhaust
  for (const [z, r, front] of [[-1.5, .5, true], [1, .85, false]]) for (const sx of [-1, 1]) {
    const steer = new T.Group(), pivot = new T.Group(); steer.position.set(sx * (front ? .7 : .95), r, z); g.add(steer); steer.add(pivot);
    const tyre = new T.Mesh(new T.CylinderGeometry(r, r, front ? .3 : .5, 18), mat('#1c1f20', 0, .95)); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; pivot.add(tyre);
    const hub = new T.Mesh(new T.CylinderGeometry(r * .55, r * .55, (front ? .3 : .5) + .02, 12), mat('#e2c64a', .3, .5)); hub.rotation.z = Math.PI / 2; pivot.add(hub);
    g.userData.wheels.push({pivot, steer, r, front});
  }
  g.userData.lampPos = {head: [[-.4, 1.4, -1.95], [.4, 1.4, -1.95]], tail: [[-.7, 1.2, 1.75], [.7, 1.2, 1.75]]};
  return g;
}

/** A small touring caravan, hitched behind a car (added as a child, behind it). */
export function addCaravan(car) {
  const c = new T.Group(), white = mat('#f1efe8', .1, .4), stripe = mat('#7b8d97', .2, .4), glassM = mat('#2a3a44', .5, .1);
  box(c, 2.2, 2.1, 4.6, white, 0, 1.5, 0, .3);
  box(c, 2.22, .25, 4.5, stripe, 0, 1.15, 0);
  box(c, 2.24, .6, 1.4, glassM, 0, 1.9, -.6);
  box(c, .12, .12, 1.2, mat('#3a3f42'), 0, .55, -2.8);           // tow bar
  for (const sx of [-1, 1]) { const w = new T.Mesh(new T.CylinderGeometry(.36, .36, .22, 14), mat('#1c1f20', 0, .9)); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.05, .36, .2); c.add(w); }
  c.position.z = 2.05 + 2.3 + 1.2; car.add(c);
  car.userData.extraLength = 5.9;
  return car;
}

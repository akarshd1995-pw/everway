// People: properly proportioned figures with jointed hips, knees, shoulders and elbows, rounded limbs,
// hands and shoes, a face with nose and ears, and hair (or a helmet). Used for people walking in villages,
// for riders on motorbikes and bicycles, and for drivers. Forward is -z; the figure stands about 1.75 m.
import * as T from '../three.module.js';

const mats = new Map();
const mat = (c, rough = .75) => { const k = c + rough; if (!mats.has(k)) mats.set(k, new T.MeshStandardMaterial({color: c, roughness: rough})); return mats.get(k); };
const caps = new Map();
/** A rounded limb hanging down from its joint: radius at the top r0, at the bottom r1, length L. */
function limbGeo(r0, r1, L) {
  const k = [r0, r1, L].map(v => v.toFixed(3)).join(); if (caps.has(k)) return caps.get(k);
  const g = new T.CylinderGeometry(r1, r0, L, 10, 1); g.translate(0, -L / 2, 0);
  // round the ends a little with spheres merged in place would cost more; small spheres at joints do it instead
  caps.set(k, g); return g;
}
const sph = new T.SphereGeometry(1, 14, 10);
function mesh(geo, m, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; }
function joint(parent, x, y, z) { const j = new T.Group(); j.position.set(x, y, z); parent.add(j); return j; }

export const SKIN = ['#f1d0b5', '#e3b48f', '#c98d63', '#9a6440', '#6e4428', '#f5d9c4'];
export const HAIR = ['#2a1d14', '#4a3020', '#8a5a2b', '#c9a061', '#1a1a1a', '#9b9b95', '#6e3b1f'];
export const TOPS = ['#c0392b', '#2f6db5', '#e6b84a', '#3e7a54', '#7d5ba6', '#ecebe6', '#2b2f33', '#b5653a', '#5a7d9a', '#d98aa0'];
export const BOTTOMS = ['#2c3e57', '#3b3b3b', '#6b5a45', '#1f2a36', '#4b5a3a', '#7a7468'];

/**
 * opts: skin, hair, top, bottom, shoes, sleeves ('long'|'short'), skirt, helmet (colour), legs (false for riders
 * whose legs the vehicle animates), seed. Returns a group with userData.j = joints for posing.
 */
export function makeHuman(opts = {}) {
  const r = (() => { let s = (opts.seed ?? 1) * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
  const pick = a => a[Math.floor(r() * a.length)];
  const skin = mat(opts.skin || pick(SKIN), .6), top = mat(opts.top || pick(TOPS), .8), bottom = mat(opts.bottom || pick(BOTTOMS), .85);
  const shoes = mat(opts.shoes || (r() < .5 ? '#2a2622' : '#e8e4da'), .6), hair = mat(opts.hair || pick(HAIR), .9);
  const g = new T.Group(), j = {}; g.userData.j = j;
  const build = .92 + r() * .16;   // slight differences in build and height
  // pelvis and torso, a little narrower at the waist
  const hips = joint(g, 0, .95, 0); j.hips = hips;
  mesh(sph, opts.skirt ? top : bottom, hips, 0, 0, 0, .17 * build, .12, .11);
  const spine = joint(hips, 0, .05, 0); j.spine = spine;
  mesh(limbGeo(.115, .13, .26), top, spine, 0, .27, 0, build * 1.1, 1, .78);            // belly
  mesh(sph, top, spine, 0, .36, -.005, .19 * build, .16, .115);                         // chest
  mesh(sph, top, spine, 0, .44, 0, .2 * build, .07, .1);                               // shoulders line
  // neck and head: a face with jaw, nose and ears, and hair
  const neck = joint(spine, 0, .49, 0); j.neck = neck;
  mesh(limbGeo(.045, .05, .1), skin, neck, 0, .1, 0);
  const head = joint(neck, 0, .1, 0); j.head = head;
  mesh(sph, skin, head, 0, .1, 0, .088, .112, .1);
  mesh(sph, skin, head, 0, .05, -.035, .07, .06, .07);                                   // jaw
  mesh(sph, skin, head, 0, .095, -.1, .016, .022, .022);                                 // nose
  for (const sd of [-1, 1]) mesh(sph, skin, head, sd * .088, .1, .005, .014, .026, .02); // ears
  if (opts.helmet) { mesh(sph, mat(opts.helmet, .35), head, 0, .125, .005, .118, .125, .128); mesh(sph, mat('#1d2427', .15), head, 0, .1, -.085, .085, .05, .05); }
  else {
    const style = r();
    mesh(sph, hair, head, 0, .135, .012, .094, .09, .104);                               // hair over the crown
    if (style < .4) mesh(sph, hair, head, 0, .07, .06, .09, .1, .06);                     // longer at the back
    if (style < .15) mesh(limbGeo(.06, .04, .22), hair, head, 0, .08, .085);             // a ponytail
  }
  // arms: shoulder and elbow joints, hands
  const longSleeves = (opts.sleeves || (r() < .5 ? 'long' : 'short')) === 'long';
  j.arms = [];
  for (const sd of [-1, 1]) {
    const sh = joint(spine, sd * .19 * build, .43, 0); mesh(sph, top, sh, 0, 0, 0, .052, .05, .05);
    mesh(limbGeo(.052, .043, .29), top, sh);
    const el = joint(sh, 0, -.29, 0); mesh(sph, longSleeves ? top : skin, el, 0, 0, 0, .042, .042, .042);
    mesh(limbGeo(.042, .033, .25), longSleeves ? top : skin, el);
    const hand = joint(el, 0, -.25, 0); mesh(sph, skin, hand, 0, -.045, 0, .034, .06, .022);
    sh.rotation.z = sd * .06; j.arms.push({sh, el, hand, sd});
  }
  // legs: hip, knee and ankle, with shoes
  if (opts.legs !== false) {
    j.legs = [];
    for (const sd of [-1, 1]) {
      const hp = joint(hips, sd * .09 * build, -.02, 0);
      mesh(limbGeo(.075, .055, .45), opts.skirt ? skin : bottom, hp);
      if (opts.skirt) mesh(limbGeo(.11, .15, .3), top, hp, -sd * .03, .02, 0);
      const kn = joint(hp, 0, -.45, 0); mesh(sph, opts.skirt ? skin : bottom, kn, 0, 0, 0, .055, .055, .055);
      mesh(limbGeo(.052, .04, .43), opts.skirt ? skin : bottom, kn);
      const an = joint(kn, 0, -.43, 0); mesh(sph, shoes, an, 0, -.03, -.05, .05, .04, .12);
      j.legs.push({hp, kn, an, sd});
    }
  }
  g.scale.setScalar(.96 + r() * .1);
  return g;
}

/** A walking stride: legs swing from the hip, knees bend on the way forward, arms swing opposite, a gentle bob. */
export function walkPose(h, phase, amount = 1) {
  const j = h.userData.j, sw = Math.sin(phase) * .42 * amount;
  if (j.legs) j.legs.forEach((l, i) => { const s = i ? -sw : sw, ph = phase + (i ? Math.PI : 0); l.hp.rotation.x = s; l.kn.rotation.x = -Math.max(0, Math.sin(ph + 1.3)) * .75 * amount; l.an.rotation.x = Math.max(0, -s) * .3; });
  j.arms.forEach((a, i) => { const s = i ? sw : -sw; a.sh.rotation.x = s * .8; a.el.rotation.x = .25 + Math.max(0, s) * .4; });
  j.hips.position.y = .95 + Math.abs(Math.cos(phase)) * .025 * amount; j.spine.rotation.y = sw * .12; j.spine.rotation.x = -.04;
}

/** Sitting on a motorbike or bicycle: leaning forward, arms reaching to the bars ahead and below. */
export function ridePose(h, lean = .45, reach = .45, drop = .25) {
  const j = h.userData.j;
  j.spine.rotation.x = -lean; j.neck.rotation.x = lean * .75;
  const aim = Math.atan2(reach, drop);
  j.arms.forEach(arm => { arm.sh.rotation.x = lean + aim - .18; arm.el.rotation.x = .35; arm.sh.rotation.z = arm.sd * .14; });
}

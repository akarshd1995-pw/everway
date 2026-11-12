// Rare moments: small surprises that reward a long drive. Each one only happens now and then, when
// the time, the place and the weather are right:
//   a rainbow after rain, mist lying in the valleys at dawn, fireflies on summer nights, shooting
//   stars on a clear night, the northern lights in the snow, starlings flocking at dusk, horses
//   grazing in a field, and a hot-air balloon drifting over the countryside.
// A quiet word says where to look the first time each one appears, and every moment you see is kept
// in the journal ("Small wonders").
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {scene, camera, renderer} from './render.js';
import {biomeAt, terrainParams} from './biomes.js';
import {roadX, roadYaw, roadHeight, sideX} from './road.js';
import {groundHeight, structureAt} from './terrain.js';
import {villageNear} from './chunks.js';
import {sunDir, nightAmt, dayAmt} from './lighting.js';
import {toast} from './hud.js';
import {sawMoment} from './progress.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hour = () => state.time % 24;
const clear = () => G.weatherNow === 'sunny' || G.weatherNow === 'windy';
const green = b => b === 'fields' || b === 'coast' || b === 'town' || b === 'mountain';
const _v = new T.Vector3(), _w = new T.Vector3(), _sv = new T.Vector2();
let BASE = 0, YBASE = 0;
/** A point beside the road (distance along it, metres to the side, height above sea level) in the world. */
const at = (s, lx, y, out = _v) => out.set(roadX(s) + sideX(s, lx) - BASE, y - YBASE, state.distance - s);
const ground = (s, lx) => groundHeight(s, lx, terrainParams(s));
/** Where something is, in words: ahead, behind, on your left or right. */
function where(x, z) {
  camera.getWorldDirection(_w); _w.y = 0; _w.normalize();
  const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz) || 1;
  const fwd = (dx * _w.x + dz * _w.z) / d, right = (dx * -_w.z + dz * _w.x) / d;
  return fwd > .6 ? 'ahead' : fwd < -.6 ? 'behind you' : right > 0 ? 'on your right' : 'on your left';
}
/** Pixels per metre at one metre away (for point sprites). */
function pointScale() { renderer.getDrawingBufferSize(_sv); return _sv.y / (2 * Math.tan(camera.fov * Math.PI / 360)); }
/** A soft round white blob, for mist and the burner flame. */
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
})();

/* ================================================================ a rainbow after rain */
// Opposite the sun, 42° from the point straight away from it: the primary bow (red outside) and a
// fainter secondary bow (colours reversed) outside it. Only when the sun is low enough to lift it
// above the horizon.
const bowMat = new T.ShaderMaterial({
  uniforms: {uK: {value: 0}, uHorizon: {value: 0}},
  vertexShader: `varying vec2 vUv;varying float vY;void main(){vUv=uv*2.-1.;vec4 w=modelMatrix*vec4(position,1.);vY=w.y;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader: `uniform float uK,uHorizon;varying vec2 vUv;varying float vY;
    vec3 hue(float h){return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);}
    void main(){float r=length(vUv)/.72;
      float t=(r-.92)/.08,t2=(r-1.25)/.1;                     // primary: violet .92 to red 1.0; secondary: red to violet 1.25 to 1.35
      float a=0.;vec3 c=vec3(0.);
      if(t>0.&&t<1.){a=sin(3.1416*t)*.34;c=hue((1.-t)*.78);}
      else if(t2>0.&&t2<1.){a=sin(3.1416*t2)*.12;c=hue(t2*.78);}
      a+=step(r,.92)*.035;c=mix(c,vec3(1.),step(r,.92));     // the sky is a touch brighter inside the bow
      a*=uK*smoothstep(uHorizon-40.,uHorizon+60.,vY);
      if(a<.002)discard;gl_FragColor=vec4(mix(vec3(1.),c,.85),a);}`,
  transparent: true, depthWrite: false, fog: false, side: T.DoubleSide,
});
const bow = new T.Mesh(new T.PlaneGeometry(2, 2), bowMat); bow.visible = false; bow.renderOrder = -1; bow.frustumCulled = false; scene.add(bow);
const BOW_D = 1400;
const rainbow = {
  name: 'rainbow', gap: 420,
  rainedAt: -1e9,
  watch(dt) { if ((G.rainAmt || 0) > .4) this.rainedAt = G.elapsed; },
  can() { const h = hour(); return G.elapsed - this.rainedAt < 120 && (G.rainAmt || 0) < .12 && sunDir.y > .04 && sunDir.y < .5 && h > 6.5 && h < 19 && biomeAt(state.distance) !== 'planet'; },
  start() { this.t = 0; this.life = rnd(80, 130); bow.visible = true; place(); return 'A rainbow, ' + where(bow.position.x, bow.position.z) + '.'; },
  update(dt) {
    this.t += dt; place();
    const k = smooth(this.t, 0, 12) * (1 - smooth(this.t, this.life - 15, this.life)) * smooth(sunDir.y, .02, .08) * (1 - smooth(sunDir.y, .48, .55)) * (1 - (G.rainAmt || 0));
    bowMat.uniforms.uK.value = k;
    return this.t < this.life;
  },
  stop() { bow.visible = false; },
};
function place() {
  // centred on the point straight away from the sun, at a fixed distance, facing the camera
  _w.copy(sunDir).multiplyScalar(-1).normalize();
  bow.position.copy(camera.position).addScaledVector(_w, BOW_D);
  const R = BOW_D * Math.tan(42 * Math.PI / 180) / .72; bow.scale.set(R, R, 1);
  bow.lookAt(camera.position); bowMat.uniforms.uHorizon.value = camera.position.y - 10;
}

/* ================================================================ mist in the valleys at dawn */
// Low banks of mist sitting in the hollows below the road on calm mornings, glowing in the low sun.
const mistMat = new T.SpriteMaterial({map: softTex, color: '#f4f1ec', transparent: true, depthWrite: false, opacity: 0, fog: true});
const banks = [];
for (let i = 0; i < 26; i++) { const sp = new T.Sprite(mistMat); sp.visible = false; scene.add(sp); banks.push({sp, s: 0, lx: 0, y: 0, ph: Math.random() * 6}); }
/** A hollow beside the road a little way ahead: lower than the road and lower than the ground around it. */
function hollow(s0, s1) {
  for (let tries = 0; tries < 10; tries++) {
    const s = rnd(s0, s1), lx = (Math.random() < .5 ? -1 : 1) * rnd(35, 230), g = ground(s, lx);
    if (structureAt(s) === 2) continue;
    if (g < roadHeight(s) - 4 && g < ground(s + 40, lx) - 1 && g < ground(s, lx * 1.4) - 1) return {s, lx, g};
  }
  return null;
}
const mist = {
  name: 'mist', gap: 600,
  can() { const h = hour(), b = biomeAt(state.distance); return h > 4.8 && h < 8 && b !== 'desert' && b !== 'planet' && b !== 'town' && (G.weatherNow === 'sunny' || G.weatherNow === 'cloudy'); },
  start() { this.t = 0; this.life = rnd(150, 240); this.k = 0; this.said = false; for (const b of banks) b.sp.visible = false; return null; },
  update(dt) {
    this.t += dt; const d = state.distance;
    const h = hour(), going = this.t < this.life && h < 9.2 && G.weatherNow !== 'windy' && G.weatherNow !== 'rainy';
    this.k += ((going ? 1 : 0) - this.k) * Math.min(1, dt * .25);
    let shown = 0;
    for (const b of banks) {
      if (!b.sp.visible || b.s < d - 60) { if (!going) { b.sp.visible = false; continue; } const p = hollow(d + 120, d + 650); if (!p) continue;
        Object.assign(b, {s: p.s, lx: p.lx, y: p.g + rnd(1.5, 4), w: rnd(60, 130)}); b.sp.visible = true; }
      at(b.s, b.lx + Math.sin(G.elapsed * .02 + b.ph) * 6, b.y, b.sp.position);
      b.sp.scale.set(b.w, b.w * .2, 1); shown++;
    }
    // warm in the first sun, grey before it
    mistMat.opacity = .42 * this.k; mistMat.color.setRGB(.86 + .1 * dayAmt, .85 + .08 * dayAmt, .84 + .05 * dayAmt);
    if (!this.said && shown > 4 && this.k > .5) { this.said = true; toastOnce('mist', 'Mist lies in the valleys.'); }
    return going || this.k > .02;
  },
  stop() { for (const b of banks) b.sp.visible = false; },
};

/* ================================================================ fireflies on summer nights */
const FF = 220, ffPos = new Float32Array(FF * 3), ffPh = new Float32Array(FF);
const ffGeo = new T.BufferGeometry(); ffGeo.setAttribute('position', new T.BufferAttribute(ffPos, 3)); ffGeo.setAttribute('aPh', new T.BufferAttribute(ffPh, 1));
const ffMat = new T.ShaderMaterial({
  uniforms: {uT: {value: 0}, uK: {value: 0}, uScale: {value: 400}},
  vertexShader: `attribute float aPh;uniform float uT,uScale;varying float vA;
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
      float b=pow(max(0.,sin(uT*(1.1+fract(aPh*3.7)*.9)+aPh*6.28)),10.);vA=b;gl_PointSize=(.22+b*.25)*uScale/max(-mv.z,1.);}`,
  fragmentShader: `uniform float uK;varying float vA;void main(){vec2 q=gl_PointCoord-.5;float r=dot(q,q)*4.;if(r>1.)discard;
    gl_FragColor=vec4(vec3(.85,1.,.35)*(1.6-r),vA*uK*(1.-r));}`,
  transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
});
const ffPts = new T.Points(ffGeo, ffMat); ffPts.visible = false; ffPts.frustumCulled = false; scene.add(ffPts);
const flies = Array.from({length: FF}, () => ({s: 0, lx: 0, h: 0, g: 0, ph: Math.random() * 100}));
function seatFly(f, s0, s1) { f.s = rnd(s0, s1); f.lx = (Math.random() < .5 ? -1 : 1) * rnd(5.5, 38); f.g = ground(f.s, f.lx); f.h = rnd(.4, 2.6); }
const fireflies = {
  name: 'fireflies', gap: 500,
  can() { const h = hour(), b = biomeAt(state.distance); return (state.season === 'summer' || state.season === 'spring' && h > 22) && (h > 21.3 || h < 1.5) && (b === 'fields' || b === 'coast' || b === 'town') && G.weatherNow !== 'rainy' && G.weatherNow !== 'windy'; },
  start() { this.t = 0; this.life = rnd(140, 220); this.k = 0; const d = state.distance; for (const f of flies) seatFly(f, d - 10, d + 160); ffPts.visible = true; return 'Fireflies in the verges.'; },
  update(dt) {
    this.t += dt; const d = state.distance, going = this.t < this.life && nightAmt > .55 && G.weatherNow !== 'rainy';
    this.k += ((going ? 1 : 0) - this.k) * Math.min(1, dt * .4);
    const tt = G.elapsed;
    flies.forEach((f, i) => {
      if (f.s < d - 15) seatFly(f, d + 90, d + 170);
      at(f.s + Math.sin(tt * .3 + f.ph) * 2, f.lx + Math.sin(tt * .23 + f.ph * 2) * 1.5, f.g + f.h + Math.sin(tt * .5 + f.ph) * .4, _v);
      ffPos[i * 3] = _v.x; ffPos[i * 3 + 1] = _v.y; ffPos[i * 3 + 2] = _v.z; ffPh[i] = f.ph;
    });
    ffGeo.attributes.position.needsUpdate = true; ffGeo.attributes.aPh.needsUpdate = true;
    ffMat.uniforms.uT.value = tt; ffMat.uniforms.uK.value = this.k; ffMat.uniforms.uScale.value = pointScale();
    return going || this.k > .02;
  },
  stop() { ffPts.visible = false; },
};

/* ================================================================ shooting stars on a clear night */
const MET = 3, metPos = new Float32Array(MET * 4 * 3), metT = new Float32Array(MET * 4), metIdx = [];
for (let i = 0; i < MET; i++) { const o = i * 4; metIdx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); metT.set([0, 0, 1, 1], o); }
const metGeo = new T.BufferGeometry(); metGeo.setAttribute('position', new T.BufferAttribute(metPos, 3)); metGeo.setAttribute('aT', new T.BufferAttribute(metT, 1)); metGeo.setIndex(metIdx);
metGeo.setAttribute('aA', new T.BufferAttribute(new Float32Array(MET * 4), 1));
const metMat = new T.ShaderMaterial({
  vertexShader: `attribute float aT,aA;varying float vT,vA;void main(){vT=aT;vA=aA;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying float vT,vA;void main(){gl_FragColor=vec4(vec3(.9,.95,1.)*1.6,vT*vT*vA);}`,
  transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide,
});
const metMesh = new T.Mesh(metGeo, metMat); metMesh.visible = false; metMesh.frustumCulled = false; scene.add(metMesh);
const streaks = Array.from({length: MET}, () => ({life: 0, t: 0, p: new T.Vector3(), v: new T.Vector3()}));
const MET_D = 1600;
function launch(st) {
  camera.getWorldDirection(_w); const yaw = Math.atan2(_w.x, _w.z) + rnd(-1.1, 1.1), el = rnd(.45, 1.1);
  st.p.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));       // direction from the camera
  const across = rnd(-1, 1) < 0 ? -1 : 1;
  st.v.set(Math.cos(yaw) * across, -rnd(.25, .7), -Math.sin(yaw) * across).normalize().multiplyScalar(rnd(.22, .4));   // radians a second, across and down
  st.t = 0; st.life = rnd(.5, 1.1);
}
const meteors = {
  name: 'meteors', gap: 700,
  can() { return nightAmt > .75 && clear() && biomeAt(state.distance) !== 'town'; },
  start() { this.t = 0; this.life = rnd(90, 150); this.next = rnd(1, 4); this.count = 0; metMesh.visible = true; for (const s of streaks) s.life = 0; return null; },
  update(dt) {
    this.t += dt; this.next -= dt;
    if (this.next < 0 && this.t < this.life) { const s = streaks.find(x => x.t >= x.life); if (s) { launch(s); this.count++; if (this.count === 1) toastOnce('meteors', 'A shooting star. Look up: there may be more.'); } this.next = rnd(4, 14); }
    const a = metGeo.attributes.aA.array; let any = false;
    streaks.forEach((s, i) => {
      const o = i * 4; s.t += dt; const live = s.t < s.life; any = any || live;
      const f = live ? Math.sin(Math.PI * s.t / s.life) : 0;
      a[o] = a[o + 1] = a[o + 2] = a[o + 3] = f;
      if (!live) return;
      // head and tail on the sky, as a thin strip that faces the camera
      const head = _v.copy(s.p).addScaledVector(s.v, s.t).normalize(), tail = _w.copy(s.p).addScaledVector(s.v, Math.max(0, s.t - .35)).normalize();
      const side = new T.Vector3().crossVectors(head.clone().sub(tail), head).normalize().multiplyScalar(MET_D * .0012);
      const H = head.clone().multiplyScalar(MET_D).add(camera.position), Tl = tail.clone().multiplyScalar(MET_D).add(camera.position);
      metPos.set([Tl.x - side.x, Tl.y - side.y, Tl.z - side.z, Tl.x + side.x, Tl.y + side.y, Tl.z + side.z, H.x - side.x, H.y - side.y, H.z - side.z, H.x + side.x, H.y + side.y, H.z + side.z], o * 3);
    });
    metGeo.attributes.position.needsUpdate = true; metGeo.attributes.aA.needsUpdate = true;
    return (this.t < this.life && nightAmt > .6 && clear()) || any;
  },
  stop() { metMesh.visible = false; },
};

/* ================================================================ the northern lights, in the snow */
// Curtains of green light with violet tops, rippling slowly, low over the hills on one side.
const auMat = new T.ShaderMaterial({
  uniforms: {uT: {value: 0}, uK: {value: 0}},
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform float uT,uK;varying vec2 vUv;
    float n(float x){return sin(x)*.5+sin(x*2.3+1.7)*.3+sin(x*5.1+.4)*.2;}
    void main(){float x=vUv.x*40.,y=vUv.y;
      float rays=pow(.5+.5*n(x*1.7+uT*.35+n(x*.3+uT*.1)*3.),3.);          // vertical rays drifting along the curtain
      float fold=.55+.45*n(x*.25-uT*.07);                                   // slow folds in the curtain
      float body=smoothstep(0.,.12,y)*(1.-smoothstep(.25,1.,y));            // a bright lower edge, fading upwards
      vec3 c=mix(vec3(.25,1.,.55),vec3(.65,.35,1.),smoothstep(.35,.9,y));   // green, violet at the top
      float a=body*rays*fold*uK*smoothstep(0.,.08,vUv.x)*smoothstep(1.,.92,vUv.x);
      gl_FragColor=vec4(c*a*1.4,a);}`,
  transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide,
});
const aurora = new T.Group(); aurora.visible = false; scene.add(aurora);
for (let i = 0; i < 3; i++) {
  // a long wavy ribbon on a circle round the camera, standing up from the horizon
  const N = 80, R = 2300 - i * 180, span = 1.5 - i * .25, pos = [], uv = [], idx = [];
  for (let j = 0; j <= N; j++) { const a = (j / N - .5) * span + i * .35, r = R + Math.sin(j * .21 + i) * 140, x = Math.sin(a) * r, z = -Math.cos(a) * r;
    pos.push(x, 120 + i * 40, z, x, 900 - i * 120, z); uv.push(j / N, 0, j / N, 1); if (j) { const k = j * 2; idx.push(k - 2, k - 1, k, k, k - 1, k + 1); } }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new T.Mesh(g, auMat); m.frustumCulled = false; aurora.add(m);
}
const northern = {
  name: 'aurora', gap: 800,
  can() { return biomeAt(state.distance) === 'snow' && nightAmt > .7 && clear(); },
  start() { this.t = 0; this.life = rnd(150, 260); this.k = 0; camera.getWorldDirection(_w); aurora.rotation.y = Math.atan2(-_w.x, -_w.z) + rnd(-.9, .9); aurora.visible = true; return null; },
  update(dt) {
    this.t += dt; const going = this.t < this.life && nightAmt > .55 && clear();
    this.k += ((going ? 1 : 0) - this.k) * Math.min(1, dt * .12);
    aurora.position.set(camera.position.x, camera.position.y - 40, camera.position.z);
    auMat.uniforms.uT.value = G.elapsed; auMat.uniforms.uK.value = this.k * (.7 + .3 * Math.sin(G.elapsed * .05));
    if (!this.said && this.k > .4) { this.said = true; toastOnce('aurora', 'The northern lights, ' + where(camera.position.x - Math.sin(aurora.rotation.y) * 100, camera.position.z - Math.cos(aurora.rotation.y) * 100) + '.'); }
    return going || this.k > .02;
  },
  stop() { aurora.visible = false; this.said = false; },
};

/* ================================================================ starlings at dusk */
// A murmuration: hundreds of birds in one flowing, folding cloud, over the fields before dark.
const SB = 600, sbPos = new Float32Array(SB * 3), sbDir = new Float32Array(SB * 3), sbR = new Float32Array(SB);
for (let i = 0; i < SB; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, q = Math.sqrt(1 - u * u); sbDir.set([q * Math.cos(a), u, q * Math.sin(a)], i * 3); sbR[i] = Math.cbrt(Math.random()); }
const sbGeo = new T.BufferGeometry(); sbGeo.setAttribute('position', new T.BufferAttribute(sbPos, 3));
const sbMat = new T.ShaderMaterial({
  uniforms: {uScale: {value: 400}, uK: {value: 0}, uCol: {value: new T.Color('#202326')}},
  vertexShader: `uniform float uScale;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=max(1.2,.45*uScale/max(-mv.z,1.));}`,
  fragmentShader: `uniform float uK;uniform vec3 uCol;void main(){vec2 q=gl_PointCoord-.5;if(dot(q,q)>.25)discard;gl_FragColor=vec4(uCol,.9*uK);}`,
  transparent: true, depthWrite: false, fog: true,
});
sbMat.fog = false;
const sbPts = new T.Points(sbGeo, sbMat); sbPts.visible = false; sbPts.frustumCulled = false; scene.add(sbPts);
const starlings = {
  name: 'starlings', gap: 600,
  can() { const h = hour(), b = biomeAt(state.distance); return h > 16.3 && h < 19.3 && sunDir.y > -.02 && sunDir.y < .2 && (b === 'fields' || b === 'coast') && G.weatherNow !== 'rainy' && state.season !== 'summer'; },
  start() {
    this.t = 0; this.life = rnd(100, 160); this.k = 0;
    this.s = state.distance + rnd(380, 520); this.lx = (Math.random() < .5 ? -1 : 1) * rnd(90, 200); this.h = Math.max(ground(this.s, this.lx), roadHeight(this.s)) + rnd(55, 95);
    sbPts.visible = true; at(this.s, this.lx, this.h); return 'Starlings, gathering for the night, ' + where(_v.x, _v.z) + '.';
  },
  update(dt) {
    this.t += dt; const going = this.t < this.life && this.s > state.distance - 150;
    this.k += ((going ? 1 : 0) - this.k) * Math.min(1, dt * .5);
    const t = G.elapsed, c = at(this.s + Math.sin(t * .05) * 60, this.lx + Math.sin(t * .037) * 50, this.h + Math.sin(t * .11) * 12, new T.Vector3());
    // the cloud stretches, flattens and turns; waves of turning birds run through it
    const sx = 55 + 35 * Math.sin(t * .29), sy = 14 + 9 * Math.sin(t * .41 + 1), sz = 38 + 26 * Math.cos(t * .23), rot = t * .17, cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < SB; i++) {
      const o = i * 3, r = sbR[i]; let x = sbDir[o] * sx * r, y = sbDir[o + 1] * sy * r, z = sbDir[o + 2] * sz * r;
      x += 22 * Math.sin(t * .8 + z * .05); y += 7 * Math.sin(t * 1.1 + x * .04); z += 14 * Math.sin(t * .6 + y * .08);
      sbPos[o] = c.x + x * cr - z * sr; sbPos[o + 1] = c.y + y; sbPos[o + 2] = c.z + x * sr + z * cr;
    }
    sbGeo.attributes.position.needsUpdate = true; sbMat.uniforms.uScale.value = pointScale(); sbMat.uniforms.uK.value = this.k;
    sbMat.uniforms.uCol.value.setRGB(.12 + .1 * dayAmt, .13 + .1 * dayAmt, .15 + .1 * dayAmt);
    return going || this.k > .02;
  },
  stop() { sbPts.visible = false; },
};

/* ================================================================ horses in a field */
function buildHorse(coat, mane) {
  const g = new T.Group(), M = new T.MeshStandardMaterial({color: coat, roughness: .8}), D = new T.MeshStandardMaterial({color: mane, roughness: .9});
  const box = (w, h, d, m, x, y, z, parent = g) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
  box(.62, .7, 1.75, M, 0, 1.25, 0);                                   // body
  box(.5, .5, .5, M, 0, 1.3, .9).rotation.x = .3;                      // chest
  const neck = new T.Group(); neck.position.set(0, 1.45, .95); g.add(neck);
  box(.32, .95, .38, M, 0, .4, .15, neck).rotation.x = .55;            // neck, leaning forward
  box(.08, .8, .2, D, 0, .45, -.02, neck).rotation.x = .55;            // mane
  const head = box(.26, .3, .62, M, 0, .82, .55, neck); head.rotation.x = .9;
  box(.06, .14, .06, M, .09, .97, .38, neck); box(.06, .14, .06, M, -.09, .97, .38, neck);   // ears
  const legs = [];
  for (const [x, z] of [[.2, .7], [-.2, .7], [.2, -.7], [-.2, -.7]]) { const p = new T.Group(); p.position.set(x, .95, z); g.add(p); box(.15, .95, .17, M, 0, -.47, 0, p); box(.16, .12, .18, D, 0, -.92, 0, p); legs.push(p); }
  const tail = new T.Group(); tail.position.set(0, 1.45, -.88); g.add(tail); box(.12, .75, .12, D, 0, -.36, -.08, tail).rotation.x = -.25;
  g.userData = {neck, legs, tail};
  return g;
}
const COATS = [['#6b3f23', '#2a1a10'], ['#8a5a32', '#3a2414'], ['#3b2a20', '#151010'], ['#c9c2b5', '#e9e4da'], ['#a8723e', '#f0e2c2']];
const herd = COATS.map(([c, m]) => { const h = buildHorse(c, m); h.visible = false; scene.add(h); return h; });
const horses = {
  name: 'horses', gap: 420,
  can() { const h = hour(), b = biomeAt(state.distance + 300); return h > 7 && h < 19.5 && b === 'fields' && G.weatherNow !== 'rainy' && state.season !== 'winter' && !(villageNear(state.distance + 300) && Math.abs(villageNear(state.distance + 300).vc - state.distance - 300) < 260); },
  start() {
    const s0 = state.distance + rnd(260, 360), side = Math.random() < .5 ? -1 : 1, lx0 = side * rnd(26, 48);
    if (structureAt(s0) || Math.abs(ground(s0, lx0) - ground(s0 + 20, lx0)) > 3) return false;
    const n = 2 + Math.floor(Math.random() * 3); this.list = [];
    for (let i = 0; i < herd.length; i++) herd[i].visible = false;
    for (let i = 0; i < n; i++) { const hz = herd[(i + Math.floor(Math.random() * 5)) % herd.length]; if (this.list.find(x => x.m === hz)) continue;
      this.list.push({m: hz, s: s0 + rnd(-14, 14), lx: lx0 + rnd(-9, 9), yaw: rnd(0, 6.28), graze: Math.random() * 10, walk: 0, ph: Math.random() * 6}); hz.visible = true; }
    return 'Horses in the field, ' + (side > 0 ? 'on your right.' : 'on your left.');
  },
  update(dt) {
    let any = false;
    for (const h of this.list) {
      const u = h.m.userData; h.graze -= dt;
      // grazing, then a few slow steps to fresh grass, then grazing again
      if (h.graze < 0) { if (h.walk > 0) { h.walk = 0; h.graze = rnd(6, 16); } else { h.walk = rnd(2, 4.5); h.yaw += rnd(-.8, .8); h.graze = h.walk; } }
      const walking = h.walk > 0 && h.graze > 0;
      if (walking) { h.s += Math.cos(h.yaw) * .8 * dt; h.lx += Math.sin(h.yaw) * .8 * dt; }
      const down = walking ? .1 : 1;
      u.neck.rotation.x += (1.05 * down - u.neck.rotation.x) * Math.min(1, dt * 1.5);
      const sw = walking ? Math.sin(G.elapsed * 5 + h.ph) * .35 : 0; u.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw); });
      u.tail.rotation.z = Math.sin(G.elapsed * 1.3 + h.ph) * .25;
      at(h.s, h.lx, ground(h.s, h.lx), h.m.position); h.m.rotation.y = roadYaw(h.s) + h.yaw;
      any = any || h.s > state.distance - 70;
    }
    return any;
  },
  stop() { for (const h of herd) h.visible = false; },
};

/* ================================================================ a hot-air balloon */
function buildBalloon() {
  const g = new T.Group(), pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * Math.PI; pts.push(new T.Vector2(Math.max(.6, Math.sin(a * .92 + .2) * 9 * (1 - .35 * t * t)), 11 - Math.cos(a) * 11 + 0)); }
  pts.reverse();
  const env = new T.LatheGeometry(pts, 32), col = [], P = env.attributes.position;
  const palette = [['#d94f3d', '#f2c14e'], ['#2f6f9f', '#f4f1e8'], ['#3e8e5a', '#f2a541'], ['#8e44ad', '#f4d35e']][Math.floor(Math.random() * 4)];
  const A = new T.Color(palette[0]), B = new T.Color(palette[1]);
  for (let i = 0; i < P.count; i++) { const gore = Math.floor((Math.atan2(P.getZ(i), P.getX(i)) + Math.PI) / (Math.PI * 2) * 12) % 2, band = P.getY(i) > 14 && P.getY(i) < 16; const c = band ? B : gore ? A : B; col.push(c.r, c.g, c.b); }
  env.setAttribute('color', new T.Float32BufferAttribute(col, 3)); env.computeVertexNormals();
  const e = new T.Mesh(env, new T.MeshStandardMaterial({vertexColors: true, roughness: .75, side: T.DoubleSide})); e.position.y = 4; e.castShadow = true; g.add(e);
  const basket = new T.Mesh(new T.BoxGeometry(1.4, 1.1, 1.4), new T.MeshStandardMaterial({color: '#7a5532', roughness: .95})); basket.position.y = -1.5; g.add(basket);
  const rope = new T.LineBasicMaterial({color: '#3a3026'}), rp = [];
  for (const [x, z] of [[.65, .65], [-.65, .65], [.65, -.65], [-.65, -.65]]) rp.push(x, -1, z, x * 1.8, 4.3, z * 1.8);
  const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.Float32BufferAttribute(rp, 3)); g.add(new T.LineSegments(rg, rope));
  const flame = new T.Sprite(new T.SpriteMaterial({map: softTex, color: '#ffb347', transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0})); flame.position.y = 2.2; flame.scale.set(1.6, 2.6, 1); g.add(flame);
  g.userData.flame = flame; g.scale.setScalar(1.8);
  return g;
}
let balloonM = null;
const balloon = {
  name: 'balloon', gap: 500,
  can() { const h = hour(), b = biomeAt(state.distance + 600); return ((h > 6.3 && h < 10) || (h > 16 && h < 19)) && G.weatherNow === 'sunny' && (b === 'fields' || b === 'coast' || b === 'mountain') && state.season !== 'winter'; },
  start() {
    if (!balloonM) { balloonM = buildBalloon(); scene.add(balloonM); }
    this.s = state.distance + rnd(380, 560); this.lx = (Math.random() < .5 ? -1 : 1) * rnd(70, 170);
    this.h = Math.max(ground(this.s, this.lx), roadHeight(this.s)) + rnd(70, 140); this.t = 0; this.life = rnd(180, 260); this.burn = rnd(3, 9);
    balloonM.visible = true; at(this.s, this.lx, this.h); return 'A hot-air balloon, ' + where(_v.x, _v.z) + '.';
  },
  update(dt) {
    this.t += dt; this.s += dt * 1.6; this.lx += dt * .6 * Math.sign(this.lx); this.h += Math.sin(this.t * .07) * .15 * dt;
    // the burner roars now and then (a warm glow under the envelope)
    this.burn -= dt; const f = balloonM.userData.flame; f.material.opacity = this.burn < 0 ? (.6 + .4 * Math.sin(G.elapsed * 31)) * (1 - .6 * dayAmt) + .25 : 0;
    if (this.burn < -2.2) this.burn = rnd(6, 14);
    at(this.s, this.lx, this.h, balloonM.position); balloonM.rotation.y += dt * .03;
    return this.t < this.life && this.s > state.distance - 200;
  },
  stop() { if (balloonM) balloonM.visible = false; },
};

/* ================================================================ when each moment happens */
const MOMENTS = [rainbow, mist, fireflies, meteors, northern, starlings, horses, balloon];
export const MOMENT_NAMES = MOMENTS.map(m => m.name);
const said = new Set();
/** A word the first time a moment shows itself on this drive. */
function toastOnce(key, text) { if (said.has(key)) return; said.add(key); toast(text); sawMoment(key); }
let active = [], lastAny = -1e9, checkT = 0, driven = 0;
const lastOf = {};
function begin(m) {
  const msg = m.start(); if (msg === false) return false;
  m.on = true; active.push(m); lastAny = driven; lastOf[m.name] = driven; said.delete(m.name);
  if (msg) toastOnce(m.name, msg);
  return true;
}
/** Start a moment now, whatever the conditions (for testing). */
export function forceMoment(name) { const m = MOMENTS.find(x => x.name === name); if (m && !m.on) begin(m); return !!m; }
/** End every moment (a new journey, a jump along the road). */
export function resetMoments() { for (const m of active) { m.stop(); m.on = false; } active = []; }

/** Call every frame. */
export function updateMoments(dt, run, base, yBase) {
  BASE = base; YBASE = yBase;
  rainbow.watch(dt);
  if (run && state.speed > 2) driven += dt;
  // now and then, see whether one could happen: never two of the same within a while, and a few
  // minutes of ordinary road between any two
  checkT -= dt;
  if (run && checkT < 0) {
    checkT = 6;
    if (driven - lastAny > 150 && active.length < 2) {
      const ready = MOMENTS.filter(m => !m.on && driven - (lastOf[m.name] ?? -1e9) > m.gap && m.can());
      if (ready.length && Math.random() < .3) begin(ready[Math.floor(Math.random() * ready.length)]);
    }
  }
  for (const m of active.slice()) if (!m.update(dt)) { m.stop(); m.on = false; active = active.filter(x => x !== m); }
}
/** Where the newest moment is in the world (for test pictures). */
export function momentFocus() {
  const m = active[active.length - 1]; if (!m) return null;
  const p = m === balloon ? balloonM.position : m === horses ? m.list[0].m.position : m === rainbow ? bow.position : m === starlings ? new T.Vector3(sbPos[0], sbPos[1], sbPos[2])
    : m === northern ? new T.Vector3(-Math.sin(aurora.rotation.y) * 2000, 400, -Math.cos(aurora.rotation.y) * 2000).add(camera.position) : null;
  return p && [p.x, p.y, p.z];
}

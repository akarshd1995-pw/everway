// Birds: a few small flocks drifting across the sky around you, wings flapping. Daytime only,
// not in snow country or on the alien world.
import * as T from '../three.module.js';
import {G, state} from './state.js';
import {scene} from './render.js';
import {biomeAt} from './biomes.js';

const wing = new T.BufferGeometry();
wing.setAttribute('position', new T.Float32BufferAttribute([0, 0, -.18, 0, 0, .18, -.9, .1, .05, 0, 0, -.18, .9, .1, .05, 0, 0, .18], 3));
wing.computeVertexNormals();
const mat = new T.MeshBasicMaterial({color: '#2b2f33', side: T.DoubleSide});
const flocks = [];
for (let f = 0; f < 4; f++) {
  const group = new T.Group(), birds = [];
  for (let i = 0; i < 6 + f % 3 * 2; i++) { const b = new T.Mesh(wing, mat); b.position.set((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2.2, Math.random() * 1.5, Math.ceil(i / 2) * 2.4); b.userData.phase = Math.random() * 6; group.add(b); birds.push(b); }
  group.scale.setScalar(1.4); scene.add(group);
  flocks.push({group, birds, angle: f * 1.6, radius: 160 + f * 70, height: 55 + f * 18, speed: .05 + f * .012});
}

export function updateBirds(dt, yBase) {
  const b = biomeAt(state.distance), on = state.time > 6 && state.time < 19.5 && b !== 'snow' && b !== 'planet' && G.weatherNow !== 'rainy';
  for (const f of flocks) {
    f.group.visible = on;
    if (!on) continue;
    f.angle += f.speed * dt;
    // circle slowly around a point ahead of the player, so flocks keep crossing the view
    const cx = Math.cos(f.angle) * f.radius, cz = -220 + Math.sin(f.angle) * f.radius * .6;
    f.group.position.set(cx, f.height + Math.sin(f.angle * 3) * 6, cz);
    f.group.rotation.y = -f.angle + Math.PI;
    for (const bird of f.birds) { const flap = Math.sin(G.elapsed * 9 + bird.userData.phase); bird.scale.set(1, flap * 7, 1); }
  }
}

// Graphics settings: applies a quality level and steps down automatically when the frame rate drops.
import * as T from '../three.module.js';
import {G,state} from './state.js';
import {QUALITY,renderer,scene} from './render.js';
import {post} from './post.js';
import {sun} from './actors.js';
import {toast} from './hud.js';

let lastPost = null;
const size = new T.Vector2();
export function applyQuality() {
  const q = G.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.ratio) * (G.resScale || 1)); renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = q.post ? T.NoToneMapping : T.ACESFilmicToneMapping;
  renderer.getDrawingBufferSize(size);
  if (q.post) post.setSize(size.x, size.y, q.samples); else post.dispose();
  // shadows reach further on the higher settings (the shadow area is centred ahead of the vehicle)
  { const r = q.shadow >= 4096 ? 105 : q.shadow >= 2048 ? 80 : 55; Object.assign(sun.shadow.camera, {left: -r, right: r, top: r, bottom: -r, far: 520}); sun.shadow.camera.updateProjectionMatrix(); G.shadowReach = r; }
  if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  if (lastPost !== null && lastPost !== q.post) scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
  lastPost = q.post;
}

let frames = 0, time = 0, good = 0;
export function resetAdaptive() { frames = time = good = 0; G.resScale = 1; }
// Keeping the frame rate steady: first the picture is drawn at a slightly lower resolution (hard to
// notice, especially in motion), and it comes back up when there is room; only if that is not enough
// does the whole quality level step down.
export function adaptQuality(dt) {
  if (G.qualitySetting !== 'auto' || !state.started || state.paused || G.photo || G.replay) return;
  frames++; time += dt; if (time < 2.5) return;
  const fps = frames / time; frames = time = 0; const r = G.resScale || 1;
  if (fps < 50 && r > .66) { G.resScale = Math.max(.65, r - .1); good = 0; applyQuality(); return; }
  if (fps > 58 && r < 1) { if (++good >= 3) { G.resScale = Math.min(1, r + .05); good = 0; applyQuality(); } return; }
  good = 0;
  if (fps < 38 && r <= .66 && G.quality !== QUALITY.low) { G.quality = G.quality === QUALITY.high ? QUALITY.balanced : QUALITY.low; G.resScale = 1; applyQuality(); toast('Graphics tuned for a smoother ride.'); }
}

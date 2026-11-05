// Photo mode: the journey pauses, the display hides, and you can look around the vehicle freely
// (drag to orbit, scroll to zoom), then save the picture as a PNG file.
import {$} from './core.js';
import {G, state} from './state.js';
import {canvas} from './render.js';

export const photoCam = {yaw: 0, pitch: .25, dist: 9};
let dragging = null;
export function enterPhoto() {
  if (!state.started || G.photo) return;
  G.photo = true; G.photoWasPaused = state.paused; state.paused = true;
  photoCam.yaw = Math.PI * .85; photoCam.pitch = .22; photoCam.dist = 9;
  document.body.classList.add('photo'); $('#photobar').hidden = false;
}
export function exitPhoto() {
  if (!G.photo) return;
  G.photo = false; state.paused = !!G.photoWasPaused; G.player.visible = true; $('#photo-car').textContent = 'Hide vehicle';
  document.body.classList.remove('photo'); $('#photobar').hidden = true;
}
/** Saves the next drawn frame as a PNG download. */
export function savePicture() { G.wantPicture = true; }
/** Call `fn` with a small JPEG of the next drawn frame (for postcards). */
const thumbs = []; export function grabThumb(fn) { thumbs.push(fn); }
const small = document.createElement('canvas'); small.width = 384; small.height = 216;
export function pictureFrameEnd() {
  if (thumbs.length) { const c = small.getContext('2d'), w = canvas.width, h = canvas.height, k = Math.min(w / 16, h / 9);
    c.drawImage(canvas, (w - 16 * k) / 2, (h - 9 * k) / 2, 16 * k, 9 * k, 0, 0, 384, 216); const url = small.toDataURL('image/jpeg', .74); thumbs.splice(0).forEach(fn => fn(url)); }
  if (!G.wantPicture) return;
  G.wantPicture = false;
  const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `everway-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`; a.click();
}
canvas.addEventListener('pointerdown', e => { if (!G.photo) return; dragging = {x: e.clientX, y: e.clientY}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!G.photo || !dragging) return; photoCam.yaw -= (e.clientX - dragging.x) * .006; photoCam.pitch = Math.min(1.35, Math.max(-.05, photoCam.pitch + (e.clientY - dragging.y) * .004)); dragging = {x: e.clientX, y: e.clientY}; });
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', e => { if (!G.photo) return; e.preventDefault(); photoCam.dist = Math.min(60, Math.max(3, photoCam.dist * (1 + Math.sign(e.deltaY) * .1))); }, {passive: false});
$('#photo').onclick = enterPhoto;
$('#photo-exit').onclick = exitPhoto;
$('#photo-save').onclick = savePicture;
$('#photo-car').onclick = () => { G.player.visible = !G.player.visible; $('#photo-car').textContent = G.player.visible ? 'Hide vehicle' : 'Show vehicle'; };

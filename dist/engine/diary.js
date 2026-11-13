// The journey diary: every drive is remembered as a route on a little map, with pins for the villages and
// places you passed, the pictures you took and the postcards you found. Kept in this browser.
import {state, G} from './state.js';
import {BIOMES, biomeAt} from './biomes.js';
import {roadX} from './road.js';
import {villageNear} from './chunks.js';
import {placeName} from './names.js';
import {journeyCode} from './progress.js';
import {announce} from './audio.js';

const KEY = 'everway.diary', MAX_TRIPS = 24, MAX_PTS = 500, MAX_PICS = 40;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {trips: []}; } catch { return {trips: []}; } };
export const diary = load();
let saidVillage = null, trip = null, lastS = -1e9, lastBiome = null, seenVillage = new Set(), dirty = false, saveT = 0;
function save() {
  // pictures take the most room: keep only the newest ones if the browser runs short
  for (let tries = 0; tries < 6; tries++) {
    try { localStorage.setItem(KEY, JSON.stringify(diary)); return; } catch {
      let removed = false; for (const t of diary.trips) for (const p of t.pins) if (p.img && !removed) { delete p.img; removed = true; }
      if (!removed) { diary.trips.shift(); if (!diary.trips.length) return; }
    }
  }
}
const tidy = () => { let pics = 0; for (let i = diary.trips.length - 1; i >= 0; i--) for (const p of diary.trips[i].pins) if (p.img && ++pics > MAX_PICS) delete p.img; };

/** A new drive begins (or a saved one continues). */
export function diaryStart() {
  const last = diary.trips[diary.trips.length - 1];
  if (last && last.code === journeyCode() && Math.abs(last.end - state.distance) < 400) trip = last;   // continuing where you left off
  else { trip = {at: Date.now(), code: journeyCode(), start: state.distance, end: state.distance, km: 0, pts: [], pins: []}; diary.trips.push(trip); if (diary.trips.length > MAX_TRIPS) diary.trips.shift(); }
  lastS = -1e9; lastBiome = null; seenVillage = new Set(trip.pins.filter(p => p.kind === 'village').map(p => p.key)); dirty = true;
}
export function diaryPin(kind, name, img) {
  if (!trip) return; trip.pins.push({kind, name, s: Math.round(state.distance), img}); tidy(); dirty = true; save();
}
/** Call every frame while driving. */
export function diaryTrack(dt) {
  if (!trip) diaryStart();
  const s = state.distance;
  if (Math.abs(s - lastS) > 250) {
    lastS = s; trip.pts.push([Math.round(s), Math.round(roadX(s) * 10) / 10, Object.keys(BIOMES).indexOf(biomeAt(s))]);
    if (trip.pts.length > MAX_PTS) trip.pts = trip.pts.filter((_, i) => i % 2 === 0);
    trip.end = s; trip.km = Math.round(Math.abs(s - trip.start) / 100) / 10; dirty = true;
  }
  // the radio presenter mentions the next village a little before you get there
  const ahead = villageNear(s + 450); if (ahead && ahead.vc > s + 250 && ahead.vc !== saidVillage) { saidVillage = ahead.vc; announce(['Coming up soon: ', 'Just ahead, the village of ', 'In a minute or so you will pass through '][Math.floor(Math.random() * 3)] + placeName(ahead.vc) + '.'); }
  const b = biomeAt(s); if (b !== lastBiome) { if (lastBiome !== null) announce(`You are now driving into ${BIOMES[b].name.toLowerCase().replace(/ · .*/, '')}.`); if (lastBiome !== null || !trip.pins.length) diaryPin('place', BIOMES[b].name.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())); lastBiome = b; }
  const v = villageNear(s); if (v && Math.abs(v.vc - s) < 60) { const key = Math.round(v.vc); if (!seenVillage.has(key)) { seenVillage.add(key); diaryPin('village', placeName(v.vc)); } }
  saveT += dt; if (dirty && saveT > 6) { saveT = 0; dirty = false; save(); }
}
export const biomeKeys = () => Object.keys(BIOMES);

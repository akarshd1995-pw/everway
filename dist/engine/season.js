// Seasons: colours of the land and leaves, flowers, and snow cover. Desert and the alien world
// do not change with the seasons.
import * as T from '../three.module.js';
import {state} from './state.js';

const C = h => new T.Color(h);
export const SEASONS = {
  spring: {label: 'Spring', ground: C('#7db450'), groundAmt: .3, verge: C('#bcc27a'), flowers: .95, leaves: null},
  summer: {label: 'Summer', ground: null, groundAmt: 0, verge: null, flowers: .6, leaves: null},
  autumn: {label: 'Autumn', ground: C('#a59a57'), groundAmt: .42, verge: C('#c4a46a'), flowers: .08,
    leaves: ['#c7782f', '#b5462b', '#d9a33a', '#9b6a2c', '#c99a3c', '#7f8a3a'].map(C)},
  winter: {label: 'Winter', ground: C('#c6cfcc'), groundAmt: .5, verge: C('#cfd6d4'), flowers: 0, leaves: null, snow: true},
};
// Through the year: if you choose, the seasons turn as you drive (about 12 km each), blending
// over the last few kilometres, so the leaves turn gold gradually and the first snow comes in patches.
const ORDER = ['spring', 'summer', 'autumn', 'winter'], LEN = 12000, BLEND = 3500;
const sm = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The season at a point on the road, and how far it has turned into the next one. */
export function seasonMix(s) {
  if (!state.seasonJourney || s === undefined) return {a: state.season, b: state.season, t: 0};
  const x = (s - (state.seasonBase || 0)) / LEN + Math.max(0, ORDER.indexOf(state.seasonStart || 'spring')) + .15, i = Math.floor(x), f = x - i;
  return {a: ORDER[((i % 4) + 4) % 4], b: ORDER[(((i + 1) % 4) + 4) % 4], t: sm(f, 1 - BLEND / LEN, 1)};
}
export const seasonName = s => { const m = seasonMix(s); return m.t > .5 ? m.b : m.a; };
export const season = s => SEASONS[seasonName(s)] || SEASONS.summer;
/** How much the season applies in a region (0 for desert and the alien world). */
export const seasonal = biome => (biome === 'desert' || biome === 'planet' ? 0 : 1);

/** Adjust a region's mixed ground colours in place (called from terrainParams). */
export function seasonGround(o, weight, s) {
  const m = seasonMix(s);
  if (!weight) return;
  if (m.t > 0 && m.a !== m.b) { applyGround(o, SEASONS[m.a], weight * (1 - m.t)); applyGround(o, SEASONS[m.b], weight * m.t); return; }
  applyGround(o, SEASONS[m.a] || SEASONS.summer, weight);
}
function applyGround(o, S, weight) {
  if (!weight) return;
  if (S.ground) { o.ground.lerp(S.ground, S.groundAmt * weight); o.ground2.lerp(S.ground, S.groundAmt * .8 * weight); }
  if (S.verge) o.verge.lerp(S.verge, .5 * weight);
  if (S.snow) o.snowline = Math.min(o.snowline, -200 * weight + o.snowline * (1 - weight));
}

/** Leaf colour for one tree; null means bare branches (winter). */
export function leafColor(base, r, biome, s) {
  const m = seasonMix(s), name = m.t > 0 && r() < m.t ? m.b : m.a, S = SEASONS[name] || SEASONS.summer;
  if (!seasonal(biome)) return base.clone();
  if (S.snow) return null;
  if (S.leaves && r() < .8) return S.leaves[Math.floor(r() * S.leaves.length)].clone();
  if (name === 'spring') return base.clone().offsetHSL(.02, .08, .05);
  return base.clone();
}

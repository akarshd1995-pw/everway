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
export const season = () => SEASONS[state.season] || SEASONS.summer;
/** How much the season applies in a region (0 for desert and the alien world). */
export const seasonal = biome => (biome === 'desert' || biome === 'planet' ? 0 : 1);

/** Adjust a region's mixed ground colours in place (called from terrainParams). */
export function seasonGround(o, weight) {
  const S = season();
  if (!weight) return;
  if (S.ground) { o.ground.lerp(S.ground, S.groundAmt * weight); o.ground2.lerp(S.ground, S.groundAmt * .8 * weight); }
  if (S.verge) o.verge.lerp(S.verge, .5 * weight);
  if (S.snow) o.snowline = Math.min(o.snowline, -200 * weight + o.snowline * (1 - weight));
}

/** Leaf colour for one tree; null means bare branches (winter). */
export function leafColor(base, r, biome) {
  const S = season();
  if (!seasonal(biome)) return base.clone();
  if (S.snow) return null;
  if (S.leaves && r() < .8) return S.leaves[Math.floor(r() * S.leaves.length)].clone();
  if (state.season === 'spring') return base.clone().offsetHSL(.02, .08, .05);
  return base.clone();
}

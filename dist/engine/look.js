// Atmosphere: height haze. Fog is thicker low down (valleys and the sea fill with soft haze) and
// thinner up high, so hills stand out in layers. Must be imported before the first frame is drawn.
import * as T from '../three.module.js';

const C = T.ShaderChunk;
C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying float vFogH;\n#endif';
C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // world height from the view-space position (works for every kind of object, sprites included)
  vFogH = dot(viewMatrix[1].xyz, mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogH;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    // the road near the player is at height 0: below it the haze gathers, above it thins out
    // the whole part of the density carries the morning valley mist (0..40), the fraction the haze itself
    float mist = floor(fogDensity) / 40.0, fd = fogDensity - floor(fogDensity);
    float hk = 1.0 + 0.5 * exp(-max(vFogH + 6.0, 0.0) * 0.045) - 0.4 * smoothstep(15.0, 160.0, vFogH);
    float d = fd * hk;
    float fogFactor = 1.0 - exp(- d * d * vFogDepth * vFogDepth);
    // early-morning mist lying in the valleys below the road, pale and soft-edged
    float mk = mist * smoothstep(4.0, -16.0, vFogH) * (1.0 - exp(-vFogDepth * 0.012));
    fogFactor = max(fogFactor, mk * 0.92);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;

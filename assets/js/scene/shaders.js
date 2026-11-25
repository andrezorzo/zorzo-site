// GLSL for the brain: points (chunks, hubs, entities, dust), the mesh lines and the axons with travelling pulses.

export const VERT = /* glsl */`
uniform float uScale; uniform float uTime; uniform float uD;
attribute vec3 aColor; attribute float aSize; attribute float aGlow; attribute float aFire; attribute float aSeed; attribute float aShape;
varying vec3 vColor; varying float vAlpha; varying float vHot; varying float vShape;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float front = 0.5 + 0.5 * clamp((mv.z + uD) * 1.4, -1.0, 1.0);
  // fire: a flash that decays over ~1.2 s (aFire = time it fired); aGlow = base glow 0..1, >1 held lit
  float since = uTime - aFire;
  float flash = since >= 0.0 ? exp(-since * 1.6) : 0.0;
  float hot = clamp(max(flash, aGlow - 1.0), 0.0, 1.0);
  float twinkle = 0.82 + 0.18 * sin(uTime * 1.1 + aSeed * 40.0);
  gl_PointSize = aSize * (1.0 + hot * 1.3) * uScale * (uD / -mv.z) * 2.6;
  vColor = mix(aColor, vec3(1.0), hot * 0.55);
  vAlpha = mix(0.18, 1.0, front) * twinkle * (min(aGlow, 1.0) + hot * 1.4);
  vHot = hot; vShape = aShape;
  gl_Position = projectionMatrix * mv;
}`;
export const FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha; varying float vHot; varying float vShape;
void main() {
  vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.4, 0.15, d);
  if (vShape > 0.5) {                       // solder pad: a small square ring
    float sq = max(q.x, q.y);
    core = smoothstep(0.42, 0.34, sq) * (0.55 + 0.45 * smoothstep(0.12, 0.2, sq));
  }
  float halo = pow(1.0 - d, 2.6) * (0.5 + 0.7 * vHot) * (vShape > 0.5 ? 0.6 : 1.0);
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.5), (core + halo) * vAlpha);
}`;
// mesh lines: colour per vertex, fade at the back
export const LINE_VERT = /* glsl */`
uniform float uD; attribute vec3 aColor; varying vec3 vColor; varying float vFront;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vFront = 0.5 + 0.5 * clamp((mv.z + uD) * 1.4, -1.0, 1.0); vColor = aColor; gl_Position = projectionMatrix * mv; }`;
export const LINE_FRAG = /* glsl */`
uniform float uAlpha; varying vec3 vColor; varying float vFront;
void main() { gl_FragColor = vec4(vColor, uAlpha * mix(0.1, 1.0, vFront * vFront)); }`;
// axons: a light pulse travels along each curve (aT = 0..1 along it); aStart = when it fired, aDir = direction
export const AXON_VERT = /* glsl */`
uniform float uD; attribute float aT; attribute float aStart; attribute float aDir; attribute vec3 aColor;
varying float vT; varying float vStart; varying float vFront; varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFront = 0.5 + 0.5 * clamp((mv.z + uD) * 1.4, -1.0, 1.0);
  vT = aDir > 0.0 ? aT : 1.0 - aT; vStart = aStart; vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;
export const AXON_FRAG = /* glsl */`
uniform float uTime; uniform float uDur; uniform float uBase;
varying float vT; varying float vStart; varying float vFront; varying vec3 vColor;
void main() {
  float head = (uTime - vStart) / uDur;                     // 0 → 1 while the pulse travels
  float pulse = (head > -0.05 && head < 1.15) ? exp(-pow((vT - head) * 4.5, 2.0)) : 0.0;
  float trail = (head > vT) ? exp(-(uTime - vStart - vT * uDur) * 0.7) * 0.35 : 0.0;   // the path stays lit, then fades
  float a = uBase + pulse * 2.4 + trail * 1.4;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), pulse * 0.6), a * mix(0.15, 1.0, vFront));
}`;

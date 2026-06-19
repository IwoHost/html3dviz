// Viridis-inspired perceptual color ramp (dark→blue→teal→green→yellow)
// Returns hex color string for t in [0, 1]
const VIRIDIS = [
  [68,1,84],[72,20,103],[67,44,122],[57,65,132],[45,85,136],
  [37,103,136],[29,120,133],[24,136,125],[25,151,111],[48,166,93],
  [86,179,72],[131,190,52],[180,197,35],[228,200,24],[253,231,37],
];

export function viridis(t) {
  t = Math.max(0, Math.min(1, t));
  const i = t * (VIRIDIS.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, VIRIDIS.length - 1);
  const f = i - lo;
  const r = Math.round(VIRIDIS[lo][0] + f * (VIRIDIS[hi][0] - VIRIDIS[lo][0]));
  const g = Math.round(VIRIDIS[lo][1] + f * (VIRIDIS[hi][1] - VIRIDIS[lo][1]));
  const b = Math.round(VIRIDIS[lo][2] + f * (VIRIDIS[hi][2] - VIRIDIS[lo][2]));
  return (r << 16) | (g << 8) | b;
}

// Depth heatmap: dark green → bright lime
export function depthColor(t) {
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(26 + t * (136 - 26));
  const g = Math.round(42 + t * (255 - 42));
  const b = Math.round(26 + t * (102 - 26));
  return (r << 16) | (g << 8) | b;
}

// Z-index heatmap
export function zindexColor(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.001) return 0x1a1a2a;
  if (t < 0.3) {
    const f = t / 0.3;
    return lerpHex(0x2244aa, 0x4466dd, f);
  }
  if (t < 0.7) {
    const f = (t - 0.3) / 0.4;
    return lerpHex(0x4466dd, 0x6644ff, f);
  }
  const f = (t - 0.7) / 0.3;
  return lerpHex(0x6644ff, 0xff4488, f);
}

// Size heatmap: tiny→huge
export function sizeColor(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.2) return lerpHex(0x1a1a1a, 0x224466, t / 0.2);
  if (t < 0.5) return lerpHex(0x224466, 0x2266aa, (t - 0.2) / 0.3);
  if (t < 0.8) return lerpHex(0x2266aa, 0x44aaff, (t - 0.5) / 0.3);
  return lerpHex(0x44aaff, 0x00eeff, (t - 0.8) / 0.2);
}

export function lerpHex(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + t * (br - ar));
  const g = Math.round(ag + t * (bg - ag));
  const blue = Math.round(ab + t * (bb - ab));
  return (r << 16) | (g << 8) | blue;
}

export function hexToRgb(hex) {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

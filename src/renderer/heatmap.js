import { depthColor, zindexColor, sizeColor, lerpHex } from '../utils/colorScale.js';
import { setMeshColor, restoreScreenshotTexture } from './layerBuilder.js';

const LEGEND_DATA = {
  off: null,
  depth: {
    title: 'DOM DEPTH',
    entries: [
      { label: 'Shallow', color: '#1a2a1a' },
      { label: 'Mid', color: '#44aa44' },
      { label: 'Deep', color: '#88ff66' },
    ],
  },
  zindex: {
    title: 'Z-INDEX',
    entries: [
      { label: 'None / 0', color: '#1a1a2a' },
      { label: '1–99', color: '#4466dd' },
      { label: '100–999', color: '#6644ff' },
      { label: '1000+', color: '#ff4488' },
    ],
  },
  stacking: {
    title: 'STACKING CONTEXT',
    entries: [
      { label: 'None', color: '#1a1a2a' },
      { label: 'Inside context', color: '#33007a' },
      { label: 'Creates context', color: '#6600cc' },
    ],
  },
  size: {
    title: 'ELEMENT SIZE',
    entries: [
      { label: 'Tiny', color: '#1a1a1a' },
      { label: 'Small', color: '#224466' },
      { label: 'Large', color: '#44aaff' },
      { label: 'Huge', color: '#00eeff' },
    ],
  },
};

export function computeHeatColors(meshItems, mode) {
  if (mode === 'off') {
    for (const { mesh } of meshItems) {
      restoreScreenshotTexture(mesh);
    }
    return;
  }

  // Compute normalization range
  let maxDepth = 0, maxZIndex = 1, maxArea = 1;
  for (const { record } of meshItems) {
    if (record.depth > maxDepth) maxDepth = record.depth;
    if (record.zIndex > maxZIndex) maxZIndex = record.zIndex;
    const area = record.rect.width * record.rect.height;
    if (area > maxArea) maxArea = area;
  }

  for (const { mesh } of meshItems) {
    const rec = mesh.userData.record;
    let color;

    switch (mode) {
      case 'depth':
        color = depthColor(maxDepth > 0 ? rec.depth / maxDepth : 0);
        break;
      case 'zindex': {
        if (rec.zIndex === 0) {
          color = 0x1a1a2a;
        } else {
          // log-scale normalization so large z-index doesn't compress everything
          const logZ = Math.log10(rec.zIndex + 1);
          const logMax = Math.log10(maxZIndex + 1);
          color = zindexColor(logZ / logMax);
        }
        break;
      }
      case 'stacking':
        if (rec.createsStackingContext) color = 0x6600cc;
        else if (rec.zIndex !== 0) color = 0x33007a;
        else color = 0x1a1a2a;
        break;
      case 'size': {
        const area = rec.rect.width * rec.rect.height;
        color = sizeColor(area / maxArea);
        break;
      }
      default:
        color = rec.baseColor;
    }

    setMeshColor(mesh, color, mesh.userData.baseOpacity);
  }
}

export function getLegendData(mode) {
  return LEGEND_DATA[mode] ?? null;
}

// Animate heatmap color change (interpolates over duration ms)
export function animateHeatmap(meshItems, fromMode, toMode, duration, scene) {
  // Compute target colors for each mesh
  const targets = new Map();

  // Get base colors (off mode)
  const baseColors = new Map();
  for (const { mesh } of meshItems) {
    baseColors.set(mesh.uuid, mesh.userData.record.baseColor);
  }

  // Snapshot current colors
  const fromColors = new Map();
  for (const { mesh } of meshItems) {
    fromColors.set(mesh.uuid, mesh.userData.heatColor ?? mesh.userData.record.baseColor);
  }

  // Compute target colors
  computeHeatColors(meshItems, toMode);
  for (const { mesh } of meshItems) {
    targets.set(mesh.uuid, mesh.userData.heatColor ?? mesh.userData.record.baseColor);
  }

  // Reset to from state
  for (const { mesh } of meshItems) {
    mesh.userData.heatColor = fromColors.get(mesh.uuid);
  }

  // Tween
  const start = performance.now();
  function tick() {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeInOut(t);

    for (const { mesh } of meshItems) {
      const from = fromColors.get(mesh.uuid) ?? 0x444455;
      const to = targets.get(mesh.uuid) ?? 0x444455;
      const color = lerpHex(from, to, eased);
      setMeshColor(mesh, color, mesh.userData.baseOpacity);
      mesh.userData.heatColor = color;
    }

    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

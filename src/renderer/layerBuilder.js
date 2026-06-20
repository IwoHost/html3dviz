import * as THREE from 'three';
import { LAYER_GAP, Z_INDEX_SCALE, DEFAULT_SPREAD } from '../utils/constants.js';

const VIEWPORT_W = 1440;
const VIEWPORT_H = 900;
const WORLD_SCALE = 0.5;

function toWorldX(px) { return (px - VIEWPORT_W / 2) * WORLD_SCALE; }
function toWorldY(px) { return -(px - VIEWPORT_H / 2) * WORLD_SCALE; }

// Crop the element's region from the full-page screenshot
function buildTextureFromScreenshot(screenshot, record) {
  const { left, top, width, height } = record.rect;
  const w = Math.max(Math.round(width), 2);
  const h = Math.max(Math.round(height), 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (screenshot) {
    // Draw the cropped region from the full-page screenshot
    ctx.drawImage(screenshot, left, top, w, h, 0, 0, w, h);
    // Thin border overlay so elements have visible edges
    ctx.strokeStyle = 'rgba(100,120,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
  } else {
    // Fallback: colored box with label
    const col = record.baseColor;
    const r = (col >> 16) & 0xff;
    const g = (col >> 8) & 0xff;
    const b = col & 0xff;
    ctx.fillStyle = `rgba(${r},${g},${b},0.75)`;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    const label = [record.tag, record.elId && `#${record.elId}`, record.classes[0] && `.${record.classes[0]}`].filter(Boolean).join(' ');
    const fs = Math.max(10, Math.min(13, h * 0.25));
    ctx.font = `${fs}px monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(label, 4, fs + 2, w - 8);
  }

  return new THREE.CanvasTexture(canvas);
}

// Rebuild texture with heatmap color overlay (tints the real screenshot)
export function rebuildTextureWithHeat(mesh, heatColor, opacity) {
  const record = mesh.userData.record;
  const screenshot = mesh.userData.screenshot;
  const { left, top, width, height } = record.rect;
  const w = Math.max(Math.round(width), 2);
  const h = Math.max(Math.round(height), 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (screenshot && heatColor === null) {
    // Show real screenshot
    ctx.drawImage(screenshot, left, top, w, h, 0, 0, w, h);
    ctx.strokeStyle = 'rgba(100,120,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
  } else {
    // Show real screenshot tinted with heat color
    if (screenshot) {
      ctx.drawImage(screenshot, left, top, w, h, 0, 0, w, h);
    }
    if (heatColor !== null) {
      const r = (heatColor >> 16) & 0xff;
      const g = (heatColor >> 8) & 0xff;
      const b = heatColor & 0xff;
      ctx.fillStyle = `rgba(${r},${g},${b},0.62)`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }
  }

  const oldTex = mesh.material.map;
  const tex = new THREE.CanvasTexture(canvas);
  mesh.material.map = tex;
  mesh.material.opacity = opacity ?? mesh.userData.baseOpacity ?? 0.92;
  mesh.material.needsUpdate = true;
  oldTex?.dispose();
  mesh.userData.heatColor = heatColor;
}

export function buildScene(scene, records, screenshot, spread = DEFAULT_SPREAD, opacity = 0.92) {
  const items = [];

  for (const record of records) {
    const cx = toWorldX(record.rect.left + record.rect.width / 2);
    const cy = toWorldY(record.rect.top + record.rect.height / 2);
    const cz = (record.depth * LAYER_GAP * spread / DEFAULT_SPREAD)
             + (record.zIndex * Z_INDEX_SCALE);

    const w = Math.max(record.rect.width * WORLD_SCALE, 1);
    const h = Math.max(record.rect.height * WORLD_SCALE, 1);

    const geometry = new THREE.PlaneGeometry(w, h);
    const texture = buildTextureFromScreenshot(screenshot, record);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, cy, cz);
    mesh.userData = {
      record,
      screenshot,
      baseOpacity: opacity,
      heatColor: null,
    };

    scene.add(mesh);
    items.push({ mesh, record });
  }

  // Center the stack in view
  if (items.length > 0) {
    const box = new THREE.Box3();
    for (const { mesh } of items) box.expandByObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    for (const { mesh } of items) {
      mesh.position.x -= center.x;
      mesh.position.y -= center.y;
    }
  }

  return items;
}

export function updateSpread(meshItems, spread) {
  for (const { mesh, record } of meshItems) {
    mesh.position.z = (record.depth * LAYER_GAP * spread / DEFAULT_SPREAD)
                    + (record.zIndex * Z_INDEX_SCALE);
  }
}

export function updateOpacity(meshItems, opacity) {
  for (const { mesh } of meshItems) {
    mesh.userData.baseOpacity = opacity;
    mesh.material.opacity = opacity;
  }
}

// Simple color-only texture used when setMeshColor is called by heatmap
export function setMeshColor(mesh, color, opacity) {
  rebuildTextureWithHeat(mesh, color, opacity ?? mesh.userData.baseOpacity);
}

// Restore original screenshot texture (heatmap off)
export function restoreScreenshotTexture(mesh) {
  rebuildTextureWithHeat(mesh, null, mesh.userData.baseOpacity);
}

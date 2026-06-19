import * as THREE from 'three';
import { LAYER_GAP, Z_INDEX_SCALE, DEFAULT_SPREAD } from '../utils/constants.js';

const VIEWPORT_W = 1440;
const VIEWPORT_H = 900;
const WORLD_SCALE = 0.5; // CSS px → Three.js units

function toWorld(px, axis) {
  const ref = axis === 'x' ? VIEWPORT_W : VIEWPORT_H;
  return (px - ref / 2) * WORLD_SCALE;
}

function buildTexture(record, opacity) {
  const w = Math.max(Math.round(record.rect.width * WORLD_SCALE * 4), 8);
  const h = Math.max(Math.round(record.rect.height * WORLD_SCALE * 4), 8);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Fill
  const col = record.baseColor;
  const r = (col >> 16) & 0xff;
  const g = (col >> 8) & 0xff;
  const b = col & 0xff;
  ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
  ctx.fillRect(0, 0, w, h);

  // Border
  ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  // Label text
  const label = [
    record.tag,
    record.elId ? `#${record.elId}` : '',
    record.classes.length ? `.${record.classes[0]}` : '',
  ].filter(Boolean).join(' ');

  const fontSize = Math.max(10, Math.min(14, h * 0.25));
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = `rgba(255,255,255,0.85)`;
  ctx.fillText(label, 4, fontSize + 2, w - 8);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function buildScene(scene, records, spread = DEFAULT_SPREAD, opacity = 0.75) {
  // Normalize rects to Three.js world space
  const items = [];
  let maxDepth = 0;
  let maxZIndex = 0;
  let maxArea = 1;

  for (const rec of records) {
    if (rec.depth > maxDepth) maxDepth = rec.depth;
    if (rec.zIndex > maxZIndex) maxZIndex = rec.zIndex;
    const area = rec.rect.width * rec.rect.height;
    if (area > maxArea) maxArea = area;
  }

  for (const record of records) {
    const cx = toWorld(record.rect.left + record.rect.width / 2, 'x');
    const cy = -toWorld(record.rect.top + record.rect.height / 2, 'y');
    const cz = (record.depth * LAYER_GAP * spread / DEFAULT_SPREAD) +
               (record.zIndex * Z_INDEX_SCALE);

    const w = record.rect.width * WORLD_SCALE;
    const h = record.rect.height * WORLD_SCALE;

    const geometry = new THREE.PlaneGeometry(w, h);
    const texture = buildTexture(record, opacity);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, cy, cz);
    mesh.userData = {
      record,
      baseOpacity: opacity,
      worldPos: { cx, cy },
      normalizedDepth: maxDepth > 0 ? record.depth / maxDepth : 0,
      normalizedZIndex: maxZIndex > 0 ? Math.min(record.zIndex / maxZIndex, 1) : 0,
      normalizedSize: Math.min(record.rect.width * record.rect.height / maxArea, 1),
    };

    scene.add(mesh);
    items.push({ mesh, record });
  }

  // Compute scene center and shift so it's centered in view
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
    const targetZ = (record.depth * LAYER_GAP * spread / DEFAULT_SPREAD) +
                    (record.zIndex * Z_INDEX_SCALE);
    mesh.position.z = targetZ;
  }
}

export function updateOpacity(meshItems, opacity) {
  for (const { mesh } of meshItems) {
    mesh.userData.baseOpacity = opacity;
    const tex = mesh.material.map;
    if (tex) {
      // Redraw texture with new opacity
      const canvas = tex.image;
      const ctx = canvas.getContext('2d');
      const record = mesh.userData.record;
      const col = mesh.userData.heatColor ?? record.baseColor;
      const r = (col >> 16) & 0xff;
      const g = (col >> 8) & 0xff;
      const b = col & 0xff;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
      const label = [record.tag, record.elId ? `#${record.elId}` : '', record.classes[0] ? `.${record.classes[0]}` : ''].filter(Boolean).join(' ');
      const fontSize = Math.max(10, Math.min(14, canvas.height * 0.25));
      ctx.font = `${fontSize}px monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(label, 4, fontSize + 2, canvas.width - 8);
      tex.needsUpdate = true;
    }
  }
}

export function setMeshColor(mesh, color, opacity) {
  const tex = mesh.material.map;
  if (!tex) return;
  const canvas = tex.image;
  const ctx = canvas.getContext('2d');
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const op = opacity ?? mesh.userData.baseOpacity ?? 0.75;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `rgba(${r},${g},${b},${op})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  const record = mesh.userData.record;
  const label = [record.tag, record.elId ? `#${record.elId}` : '', record.classes[0] ? `.${record.classes[0]}` : ''].filter(Boolean).join(' ');
  const fontSize = Math.max(10, Math.min(14, canvas.height * 0.25));
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(label, 4, fontSize + 2, canvas.width - 8);
  tex.needsUpdate = true;
  mesh.userData.heatColor = color;
}

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const labelObjects = []; // { obj, mesh }

export function buildLabels(scene, meshItems) {
  clearLabels(scene);
  for (const { mesh, record } of meshItems) {
    const div = document.createElement('div');
    div.className = 'element-label';
    div.dataset.depth = record.depth;

    const tagSpan = document.createElement('span');
    tagSpan.className = 'label-tag';
    tagSpan.textContent = record.tag;

    div.appendChild(tagSpan);

    if (record.elId) {
      const idSpan = document.createElement('span');
      idSpan.className = 'label-id';
      idSpan.textContent = `#${record.elId}`;
      div.appendChild(idSpan);
    }

    if (record.classes.length) {
      const clsSpan = document.createElement('span');
      clsSpan.className = 'label-class';
      clsSpan.textContent = `.${record.classes[0]}`;
      if (record.classes.length > 1) {
        const more = document.createElement('span');
        more.className = 'label-more';
        more.textContent = ` +${record.classes.length - 1}`;
        clsSpan.appendChild(more);
      }
      div.appendChild(clsSpan);
    }

    const obj = new CSS2DObject(div);
    // Attach to left edge, vertically centered of the plane
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    obj.position.set(box.min.x, 0, 0);
    mesh.add(obj);
    labelObjects.push({ obj, mesh, div });
  }
}

export function clearLabels(scene) {
  for (const { obj, mesh } of labelObjects) {
    mesh.remove(obj);
    obj.element.remove();
  }
  labelObjects.length = 0;
}

export function setLabelsVisible(visible) {
  if (visible) {
    // Staggered fade-in by depth
    for (const { div, mesh } of labelObjects) {
      const depth = parseInt(div.dataset.depth, 10) || 0;
      div.style.opacity = '0';
      div.style.transition = 'none';
      div.style.display = 'block';
      setTimeout(() => {
        div.style.transition = 'opacity 300ms ease-out';
        div.style.opacity = '1';
      }, depth * 10);
    }
  } else {
    for (const { div } of labelObjects) {
      div.style.transition = 'opacity 150ms ease-out';
      div.style.opacity = '0';
    }
  }
}

// Update label visibility based on camera distance to each mesh
export function updateLabelCulling(camera) {
  for (const { div, mesh } of labelObjects) {
    const dist = camera.position.distanceTo(mesh.position);
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const size = geo.boundingBox?.getSize(new THREE.Vector3()).length() ?? 1;
    const screenRatio = size / dist;
    if (screenRatio > 0.8) {
      div.style.opacity = '0';
    }
  }
}

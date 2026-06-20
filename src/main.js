import * as THREE from 'three';
import { resolveLayout } from './parser/styleResolver.js';
import { fetchViaProxy } from './proxy/corsProxy.js';
import { SceneManager } from './renderer/scene.js';
import { buildScene, updateSpread, updateOpacity } from './renderer/layerBuilder.js';
import { computeHeatColors, animateHeatmap, getLegendData } from './renderer/heatmap.js';
import { buildLabels, clearLabels, setLabelsVisible } from './renderer/labels.js';
import { initTooltip, showTooltip, moveTooltip, hideTooltip } from './ui/tooltip.js';
import { Toolbar } from './ui/toolbar.js';
import { Sidebar } from './ui/panel.js';
import { initDetailPanel, showPanel, hidePanel } from './ui/detailPanel.js';
import {
  DEFAULT_SPREAD, MAX_ELEMENTS, WARN_ELEMENTS,
  LS_RENDERS_KEY, LS_SEEN_KEY, LS_POSTCARD_KEY, POSTCARD_NAG_THRESHOLD
} from './utils/constants.js';

// ─── State ───────────────────────────────────────────────────────────────────
let sceneManager = null;
let meshItems = [];
let currentRecords = [];
let selectedMesh = null;
let labelsVisible = false;
let currentHeatmap = 'off';
let currentSpread = DEFAULT_SPREAD;
let currentOpacity = 0.92;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  checkWebGL();
  checkMinWidth();

  const canvas = document.getElementById('three-canvas');
  const canvasContainer = document.getElementById('canvas-container');

  sceneManager = new SceneManager(canvas, canvasContainer);

  initTooltip(canvasContainer);

  const detailPanelEl = document.getElementById('detail-panel');
  initDetailPanel(detailPanelEl, meshItems, locateInSource);
  detailPanelEl.addEventListener('navigate', e => {
    selectMesh(e.detail.mesh);
    sceneManager.frameObject(e.detail.mesh);
  });

  const toolbar = new Toolbar({
    onHeatmapChange: applyHeatmap,
    onSpreadChange: spread => {
      currentSpread = spread;
      if (meshItems.length) updateSpread(meshItems, spread);
    },
    onReset: () => sceneManager.resetCamera(),
    onFrontView: () => sceneManager.frontView(),
    onLabelsToggle: on => {
      labelsVisible = on;
      setLabelsVisible(on);
    },
    onExport: exportPNG,
  });

  const sidebar = new Sidebar({
    onRender: html => renderHTML(html, sidebar),
    onFetch: url => fetchAndRender(url, sidebar),
    onOpacityChange: op => {
      currentOpacity = op;
      if (meshItems.length) updateOpacity(meshItems, op);
    },
    onTagFilter: enabledTags => filterByTags(enabledTags),
  });

  // Canvas mouse events
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('dblclick', onCanvasDblClick);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Keyboard navigation
  document.addEventListener('keydown', onKeyDown);

  // Demo button
  document.getElementById('btn-demo')?.addEventListener('click', async () => {
    const res = await fetch('demo/demo.html');
    const html = await res.text();
    sidebar.setHtmlValue(html);
    renderHTML(html, sidebar);
  });

  // Paste from clipboard
  document.getElementById('btn-paste')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      sidebar.setHtmlValue(text);
    } catch {
      document.getElementById('html-input')?.focus();
    }
  });

  // Postcard nag
  document.getElementById('postcard-close')?.addEventListener('click', dismissPostcard);
  document.getElementById('postcard-link')?.addEventListener('click', e => {
    e.preventDefault();
    window.open('mailto:postcards@html3dviz.dev?subject=Postcard from a happy user', '_blank');
    const nag = document.getElementById('postcard-nag');
    if (nag) {
      nag.querySelector('.postcard-text').textContent = 'Thanks! We\'ll watch for it ✉';
      nag.querySelector('.postcard-text').style.color = '#44cc88';
    }
    setTimeout(dismissPostcard, 3000);
  });

  // Close shortcuts panel on escape (handled in toolbar too, but belt+suspenders)
  document.getElementById('shortcuts-panel')?.querySelector('.shortcuts-close')?.addEventListener('click', () => {
    document.getElementById('shortcuts-panel')?.classList.add('hidden');
  });

  // First visit callout
  if (!localStorage.getItem(LS_SEEN_KEY)) {
    document.getElementById('first-visit-callout')?.classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('html-input')?.addEventListener('input', () => {
        document.getElementById('first-visit-callout')?.classList.add('hidden');
      }, { once: true });
    }, 100);
    localStorage.setItem(LS_SEEN_KEY, '1');
  }

  // Min width check on resize
  window.addEventListener('resize', checkMinWidth);
}

// ─── Rendering ────────────────────────────────────────────────────────────────
async function renderHTML(html, sidebar) {
  if (!html.trim()) {
    sidebar.setRenderError('Nothing to render — no HTML elements found.');
    return;
  }

  showProgress('Parsing HTML...');
  sidebar.clearError();

  try {
    setProgress(30, 'Rendering page...');
    const { records, screenshot } = await resolveLayout(html);

    if (records.length === 0) {
      hideProgress(true);
      sidebar.setRenderError('Nothing to render. Try wrapping content in a <div>.');
      return;
    }

    if (records.length > MAX_ELEMENTS) {
      hideProgress(false);
      const proceed = await showLargeDomModal(records.length);
      if (!proceed) return;
      records.splice(WARN_ELEMENTS);
    }

    setProgress(70, 'Building 3D structure...');
    currentRecords = records;

    // Clear old scene
    sceneManager.clear();
    clearLabels(sceneManager.scene);
    meshItems.length = 0;
    selectedMesh = null;
    hidePanel();

    // Build new scene — pass screenshot for real visual textures
    const items = buildScene(sceneManager.scene, records, screenshot, currentSpread, currentOpacity);
    meshItems.push(...items);

    // Update scene manager mesh list
    sceneManager.meshes = meshItems;

    setProgress(85, 'Building labels...');
    buildLabels(sceneManager.scene, meshItems);
    if (labelsVisible) setLabelsVisible(true);

    setProgress(95, 'Done!');

    // Apply heatmap if active
    if (currentHeatmap !== 'off') {
      computeHeatColors(meshItems, currentHeatmap);
    }

    // Sidebar tag filters
    sidebar.buildTagFilters(records);

    // Update status bar
    updateStatus(records);

    // Frame the scene
    sceneManager.resetCamera(false);
    const box = new THREE.Box3();
    for (const { mesh } of meshItems) box.expandByObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    sceneManager.camera.position.set(center.x, center.y, center.z + size * 1.2);
    sceneManager.controls.target.copy(center);

    hideProgress(false);
    showCanvas();
    animatePlanesIn(meshItems);

    // Postcard nag
    incrementRenderCount();
  } catch (err) {
    hideProgress(true);
    sidebar.setRenderError(`Parse error: ${err.message}`);
  }
}

async function fetchAndRender(url, sidebar) {
  sidebar.setFetchStatus(`Fetching ${url}...`);
  try {
    const html = await fetchViaProxy(url);
    sidebar.setFetchStatus('');
    sidebar.setHtmlValue(html);
    await renderHTML(html, sidebar);
  } catch (err) {
    sidebar.setFetchStatus(`Could not fetch: ${err.message}`, true);
  }
}

// ─── Selection ────────────────────────────────────────────────────────────────
function selectMesh(mesh) {
  // Deselect previous
  if (selectedMesh && selectedMesh !== mesh) {
    selectedMesh.userData.selected = false;
    setMeshDim(selectedMesh, false);
  }

  // Dim all others, brighten selected
  for (const { mesh: m } of meshItems) {
    m.material.opacity = m === mesh ? 1 : 0.4;
  }

  selectedMesh = mesh;
  mesh.userData.selected = true;

  // Pulse effect
  let pulseDir = -1;
  let pulseVal = 1;
  let pulseCount = 0;
  const pulseInterval = setInterval(() => {
    pulseVal += pulseDir * 0.15;
    if (pulseVal <= 0.7) { pulseDir = 1; pulseCount++; }
    if (pulseVal >= 1.0) { pulseDir = -1; }
    mesh.material.opacity = pulseVal;
    if (pulseCount >= 1) { mesh.material.opacity = 1; clearInterval(pulseInterval); }
  }, 16);

  showPanel(mesh);

  document.getElementById('status-selected').textContent =
    `Selected: ${mesh.userData.record.tag}${mesh.userData.record.elId ? '#' + mesh.userData.record.elId : ''}`;
}

function deselectAll() {
  if (!selectedMesh) return;
  selectedMesh = null;
  for (const { mesh } of meshItems) {
    mesh.material.opacity = 1;
  }
  hidePanel();
  document.getElementById('status-selected').textContent = '';
}

function setMeshDim(mesh, dim) {
  mesh.material.opacity = dim ? 0.4 : 1;
}

// ─── Mouse / Interaction ─────────────────────────────────────────────────────
function getHit(event) {
  const rect = sceneManager.canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, sceneManager.camera);
  const hits = raycaster.intersectObjects(meshItems.map(m => m.mesh));
  return hits[0]?.object ?? null;
}

function onMouseMove(event) {
  const rect = sceneManager.canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;
  const hit = getHit(event);
  if (hit) {
    sceneManager.canvas.style.cursor = 'pointer';
    showTooltip(hit, mx, my, rect);
    moveTooltip(mx, my, rect);
  } else {
    sceneManager.canvas.style.cursor = '';
    hideTooltip();
  }
}

function onCanvasClick(event) {
  const hit = getHit(event);
  if (hit) {
    selectMesh(hit);
  } else {
    deselectAll();
  }
}

function onCanvasDblClick(event) {
  const hit = getHit(event);
  if (hit) sceneManager.frameObject(hit);
}

function onKeyDown(e) {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  switch (e.key) {
    case 'Escape':
      deselectAll();
      break;
    case 'f':
    case 'F':
      if (selectedMesh) sceneManager.frameObject(selectedMesh);
      else sceneManager.resetCamera();
      break;
    case '[':
      navigateToParent();
      break;
    case ']':
      navigateToFirstChild();
      break;
    case 'Tab': {
      e.preventDefault();
      if (e.shiftKey) navigateToPrevSibling();
      else navigateToNextSibling();
      break;
    }
  }
}

function navigateToParent() {
  if (!selectedMesh) return;
  const rec = selectedMesh.userData.record;
  const parent = meshItems.find(({ record }) => record.id === rec.parentId);
  if (parent) { selectMesh(parent.mesh); sceneManager.frameObject(parent.mesh); }
}

function navigateToFirstChild() {
  if (!selectedMesh) return;
  const rec = selectedMesh.userData.record;
  const child = meshItems.find(({ record }) => record.parentId === rec.id);
  if (child) { selectMesh(child.mesh); sceneManager.frameObject(child.mesh); }
}

function navigateToNextSibling() {
  if (!selectedMesh) return;
  const rec = selectedMesh.userData.record;
  const siblings = meshItems.filter(({ record }) => record.parentId === rec.parentId);
  const idx = siblings.findIndex(({ record }) => record.id === rec.id);
  const next = siblings[(idx + 1) % siblings.length];
  if (next) { selectMesh(next.mesh); sceneManager.frameObject(next.mesh); }
}

function navigateToPrevSibling() {
  if (!selectedMesh) return;
  const rec = selectedMesh.userData.record;
  const siblings = meshItems.filter(({ record }) => record.parentId === rec.parentId);
  const idx = siblings.findIndex(({ record }) => record.id === rec.id);
  const prev = siblings[(idx - 1 + siblings.length) % siblings.length];
  if (prev) { selectMesh(prev.mesh); sceneManager.frameObject(prev.mesh); }
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
function applyHeatmap(mode) {
  const prev = currentHeatmap;
  currentHeatmap = mode;
  if (meshItems.length === 0) return;
  animateHeatmap(meshItems, prev, mode, 400, sceneManager.scene);
  updateLegend(mode);
}

function updateLegend(mode) {
  const legend = document.getElementById('heatmap-legend');
  const data = getLegendData(mode);
  if (!legend) return;
  if (!data) {
    legend.classList.add('hidden');
    return;
  }
  legend.querySelector('.legend-title').textContent = data.title;
  legend.querySelector('.legend-entries').innerHTML = data.entries.map(e => `
    <div class="legend-entry">
      <span class="legend-swatch" style="background:${e.color}"></span>
      <span class="legend-label">${e.label}</span>
    </div>
  `).join('');
  legend.classList.remove('hidden');
}

// ─── Tag filter ───────────────────────────────────────────────────────────────
function filterByTags(enabledTags) {
  for (const { mesh, record } of meshItems) {
    const visible = enabledTags.has(record.tag);
    mesh.visible = visible;
  }
}

// ─── Locate in source ────────────────────────────────────────────────────────
function locateInSource(record) {
  const textarea = document.getElementById('html-input');
  if (!textarea) return;
  const html = textarea.value;
  // Build a search pattern for the opening tag
  const pattern = record.elId
    ? `id="${record.elId}"`
    : record.classes.length
      ? `class="${record.classes.join(' ')}"`
      : `<${record.tag}`;
  const idx = html.indexOf(pattern);
  if (idx === -1) return;

  // Scroll textarea to that position
  textarea.focus();
  textarea.setSelectionRange(idx, idx + pattern.length);

  // Approximate scroll position
  const lines = html.substring(0, idx).split('\n').length;
  const lineH = 19; // approx px per line in the textarea
  textarea.scrollTop = (lines - 3) * lineH;
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportPNG() {
  const btn = document.getElementById('btn-export');
  if (btn) { btn.textContent = 'Exporting...'; btn.disabled = true; }

  // Render a frame first
  sceneManager.renderer.render(sceneManager.scene, sceneManager.camera);

  const canvas = sceneManager.canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Watermark
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  const octx = overlayCanvas.getContext('2d');
  octx.drawImage(canvas, 0, 0);
  octx.font = '13px monospace';
  octx.fillStyle = 'rgba(255,255,255,0.25)';
  octx.textAlign = 'right';
  octx.fillText('html3dviz', overlayCanvas.width - 12, overlayCanvas.height - 12);

  overlayCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, '').substring(0, 14);
    a.href = url;
    a.download = `html3dviz-${ts}-${currentRecords.length}elements.png`;
    a.click();
    URL.revokeObjectURL(url);

    setTimeout(() => {
      if (btn) { btn.textContent = 'Export'; btn.disabled = false; }
    }, 800);
  });
}

// ─── Progress ─────────────────────────────────────────────────────────────────
function showProgress(text) {
  const overlay = document.getElementById('progress-overlay');
  const bar = document.getElementById('progress-bar');
  const msg = document.getElementById('progress-text');
  if (overlay) overlay.classList.remove('hidden');
  if (bar) { bar.style.width = '0%'; bar.style.background = 'var(--accent-primary)'; }
  if (msg) msg.textContent = text;
  setProgress(20, text);
}

function setProgress(pct, text) {
  const bar = document.getElementById('progress-bar');
  const msg = document.getElementById('progress-text');
  if (bar) bar.style.width = `${pct}%`;
  if (msg && text) msg.textContent = text;
}

function hideProgress(error = false) {
  const bar = document.getElementById('progress-bar');
  const overlay = document.getElementById('progress-overlay');
  if (error) {
    if (bar) {
      bar.style.background = 'var(--accent-red)';
      bar.style.width = '100%';
      bar.animate([
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(-2px)' },
        { transform: 'translateX(2px)' },
        { transform: 'translateX(0)' },
      ], { duration: 300 });
    }
    setTimeout(() => overlay?.classList.add('hidden'), 2000);
  } else {
    if (bar) bar.style.width = '100%';
    setTimeout(() => {
      overlay?.classList.add('hidden');
      if (bar) bar.style.width = '0%';
    }, 400);
  }
}

function showCanvas() {
  document.getElementById('empty-state')?.classList.add('hidden');
}

function animatePlanesIn(items) {
  for (let i = 0; i < items.length; i++) {
    const { mesh } = items[i];
    const delay = Math.min(i * 2, 200);
    mesh.material.opacity = 0;
    mesh.scale.set(0.85, 0.85, 1);
    setTimeout(() => {
      const start = performance.now();
      const tick = () => {
        const t = Math.min((performance.now() - start) / 400, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        mesh.material.opacity = eased * (mesh.userData.baseOpacity ?? 0.75);
        mesh.scale.setScalar(0.85 + eased * 0.15);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
  }
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function updateStatus(records) {
  const stackingContexts = records.filter(r => r.createsStackingContext).length;
  const anomalies = records.filter(r => r.zIndex !== 0 && r.position === 'static').length;

  document.getElementById('status-elements').innerHTML =
    `<span class="status-dot blue">●</span> ${records.length} elements`;
  document.getElementById('status-contexts').innerHTML =
    `<span class="status-dot purple">◆</span> ${stackingContexts} stacking contexts`;

  const anom = document.getElementById('status-anomalies');
  if (anomalies > 0) {
    anom.innerHTML = `<span class="status-warn">⚠ ${anomalies} z-index anomal${anomalies > 1 ? 'ies' : 'y'}</span>`;
  } else {
    anom.textContent = '';
  }
}

// ─── Large DOM modal ──────────────────────────────────────────────────────────
function showLargeDomModal(count) {
  return new Promise(resolve => {
    const modal = document.getElementById('large-dom-modal');
    if (!modal) { resolve(true); return; }
    modal.querySelector('.modal-count').textContent = count.toLocaleString();
    modal.classList.remove('hidden');
    modal.querySelector('#modal-render-500').onclick = () => {
      modal.classList.add('hidden');
      resolve(true);
    };
    modal.querySelector('#modal-render-all').onclick = () => {
      modal.classList.add('hidden');
      resolve('all');
    };
    modal.querySelector('#modal-cancel').onclick = () => {
      modal.classList.add('hidden');
      resolve(false);
    };
  });
}

// ─── Postcardware ─────────────────────────────────────────────────────────────
function incrementRenderCount() {
  if (localStorage.getItem(LS_POSTCARD_KEY)) return;
  const count = parseInt(localStorage.getItem(LS_RENDERS_KEY) ?? '0', 10) + 1;
  localStorage.setItem(LS_RENDERS_KEY, count);
  if (count >= POSTCARD_NAG_THRESHOLD) showPostcardNag();
}

function showPostcardNag() {
  const nag = document.getElementById('postcard-nag');
  if (!nag || nag.style.display !== 'none' && !nag.classList.contains('hidden')) return;
  if (localStorage.getItem(LS_POSTCARD_KEY)) return;
  nag.classList.remove('hidden');
  nag.style.transform = 'translateY(40px)';
  nag.style.opacity = '0';
  requestAnimationFrame(() => {
    nag.style.transition = 'transform 300ms ease-out, opacity 300ms ease-out';
    nag.style.transform = 'translateY(0)';
    nag.style.opacity = '1';
  });
}

function dismissPostcard() {
  const nag = document.getElementById('postcard-nag');
  if (!nag) return;
  localStorage.setItem(LS_POSTCARD_KEY, '1');
  nag.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in';
  nag.style.transform = 'translateY(40px)';
  nag.style.opacity = '0';
  setTimeout(() => nag.classList.add('hidden'), 200);
}

// ─── WebGL check ──────────────────────────────────────────────────────────────
function checkWebGL() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    document.getElementById('webgl-error')?.classList.remove('hidden');
    document.getElementById('canvas-container')?.classList.add('hidden');
  }
}

// ─── Min width check ─────────────────────────────────────────────────────────
function checkMinWidth() {
  const overlay = document.getElementById('narrow-overlay');
  if (!overlay) return;
  if (window.innerWidth < 1024) {
    overlay.classList.remove('hidden');
    overlay.querySelector('.narrow-width').textContent = `Current width: ${window.innerWidth}px`;
  } else {
    overlay.classList.add('hidden');
  }
}

init();

let panelEl = null;
let onLocateCallback = null;
let _currentMesh = null;
let _allMeshItems = [];

export function initDetailPanel(el, allMeshItemsRef, onLocate) {
  panelEl = el;
  onLocateCallback = onLocate;
  _allMeshItems = allMeshItemsRef;

  el.querySelector('#panel-close').addEventListener('click', hidePanel);
}

export function showPanel(mesh) {
  if (!panelEl) return;
  _currentMesh = mesh;

  const rec = mesh.userData.record;
  const header = panelEl.querySelector('#panel-tag');
  if (header) header.textContent = `<${rec.tag}>`;

  _render(rec);

  if (panelEl.classList.contains('hidden')) {
    panelEl.classList.remove('hidden');
    panelEl.style.transform = 'translateX(280px)';
    requestAnimationFrame(() => {
      panelEl.style.transition = 'transform 250ms cubic-bezier(0.4,0,0.2,1)';
      panelEl.style.transform = 'translateX(0)';
    });
  } else {
    // Swap content with crossfade
    const content = panelEl.querySelector('#panel-content');
    if (content) {
      content.style.opacity = '0.3';
      setTimeout(() => {
        _render(rec);
        content.style.transition = 'opacity 150ms ease-in-out';
        content.style.opacity = '1';
      }, 100);
    }
  }
}

export function hidePanel() {
  if (!panelEl || panelEl.classList.contains('hidden')) return;
  panelEl.style.transition = 'transform 200ms cubic-bezier(0.4,0,0.2,1)';
  panelEl.style.transform = 'translateX(280px)';
  setTimeout(() => panelEl.classList.add('hidden'), 200);
  _currentMesh = null;
}

function _render(rec) {
  const content = panelEl.querySelector('#panel-content');
  if (!content) return;

  // Find parent and children
  const parent = _allMeshItems.find(({ record }) => record.id === rec.parentId);
  const children = _allMeshItems.filter(({ record }) => record.parentId === rec.id);
  const siblings = _allMeshItems.filter(({ record }) => record.parentId === rec.parentId && record.id !== rec.id);

  const anomalies = [];
  if (rec.zIndex !== 0 && rec.position === 'static') {
    anomalies.push('z-index has no effect — element has <code>position: static</code>. Set <code>position: relative</code> to enable it.');
  }

  content.innerHTML = `
    ${anomalies.map(a => `
      <div class="panel-anomaly">
        <span class="anomaly-icon">⚠</span>
        <span>${a}</span>
      </div>
    `).join('')}

    <div class="panel-section-label">IDENTITY</div>
    <div class="panel-row">
      <span class="panel-key">ID</span>
      <span class="panel-val panel-id">${rec.elId ? `#${rec.elId}` : '<span class="panel-empty">none</span>'}</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Classes</span>
      <span class="panel-val panel-classes">${rec.classes.length ? rec.classes.map(c => `.${c}`).join('<br>') : '<span class="panel-empty">none</span>'}</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Category</span>
      <span class="panel-val">${rec.category}</span>
    </div>

    <div class="panel-section-label">GEOMETRY</div>
    <div class="panel-row">
      <span class="panel-key">Width</span>
      <span class="panel-val panel-num">${Math.round(rec.rect.width)}px</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Height</span>
      <span class="panel-val panel-num">${Math.round(rec.rect.height)}px</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Top</span>
      <span class="panel-val panel-num">${Math.round(rec.rect.top)}px</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Left</span>
      <span class="panel-val panel-num">${Math.round(rec.rect.left)}px</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Position</span>
      <span class="panel-val">${rec.position}</span>
    </div>

    <div class="panel-section-label">STACKING</div>
    <div class="panel-row">
      <span class="panel-key">z-index</span>
      <span class="panel-val panel-num">${rec.zIndex || 'auto'}</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Stacking ctx</span>
      <span class="panel-val ${rec.createsStackingContext ? 'panel-yes' : 'panel-no'}">${rec.createsStackingContext ? 'YES' : 'no'}</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">DOM depth</span>
      <span class="panel-val panel-num">${rec.depth}</span>
    </div>

    ${rec.inlineStyle ? `
      <div class="panel-section-label panel-toggle" data-target="inline-styles">
        INLINE STYLES <span class="panel-toggle-arrow">▶</span>
      </div>
      <div id="inline-styles" class="panel-code-block panel-collapsed">
        <code>${escapeHtml(rec.inlineStyle)}</code>
      </div>
    ` : ''}

    <div class="panel-section-label">DOM CONTEXT</div>
    <div class="panel-row">
      <span class="panel-key">Parent</span>
      <span class="panel-val">${parent
        ? `<span class="panel-nav" data-id="${parent.record.id}">${parent.record.tag}${parent.record.elId ? `#${parent.record.elId}` : ''} →</span>`
        : '<span class="panel-empty">none</span>'
      }</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Children</span>
      <span class="panel-val">${children.length > 0
        ? `<span class="panel-nav" data-id="${children[0].record.id}">${children.length} child${children.length > 1 ? 'ren' : ''} ↓</span>`
        : '<span class="panel-empty">0</span>'
      }</span>
    </div>
    <div class="panel-row">
      <span class="panel-key">Siblings</span>
      <span class="panel-val">${siblings.length}</span>
    </div>

    <div class="panel-locate">
      <button id="btn-locate-source">Scroll to in source</button>
    </div>
  `;

  // Wire up toggle for inline styles
  content.querySelectorAll('.panel-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const target = content.querySelector(`#${toggle.dataset.target}`);
      const arrow = toggle.querySelector('.panel-toggle-arrow');
      if (target) {
        target.classList.toggle('panel-collapsed');
        if (arrow) arrow.textContent = target.classList.contains('panel-collapsed') ? '▶' : '▼';
      }
    });
  });

  // Wire up navigation
  content.querySelectorAll('.panel-nav').forEach(nav => {
    nav.addEventListener('click', () => {
      const id = parseInt(nav.dataset.id, 10);
      const item = _allMeshItems.find(({ record }) => record.id === id);
      if (item) {
        panelEl.dispatchEvent(new CustomEvent('navigate', { detail: { mesh: item.mesh }, bubbles: true }));
      }
    });
  });

  // Locate in source
  content.querySelector('#btn-locate-source')?.addEventListener('click', () => {
    onLocateCallback?.(rec);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

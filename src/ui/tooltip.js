let el = null;
let showTimer = null;
let currentMesh = null;
const DELAY = 350;

export function initTooltip(container) {
  el = document.createElement('div');
  el.id = 'element-tooltip';
  el.className = 'tooltip hidden';
  container.appendChild(el);
}

export function showTooltip(mesh, mouseX, mouseY, containerRect) {
  if (currentMesh === mesh) return;
  currentMesh = mesh;
  clearTimeout(showTimer);
  showTimer = setTimeout(() => _render(mesh, mouseX, mouseY, containerRect), DELAY);
}

export function moveTooltip(mouseX, mouseY, containerRect) {
  if (!el || el.classList.contains('hidden')) return;
  _position(mouseX, mouseY, containerRect);
}

export function hideTooltip() {
  currentMesh = null;
  clearTimeout(showTimer);
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => el.classList.add('hidden'), 80);
}

function _render(mesh, mouseX, mouseY, containerRect) {
  if (!el || !mesh) return;
  const rec = mesh.userData.record;
  if (!rec) return;

  const tag = `<span class="tt-tag">${rec.tag}</span>`;
  const id = rec.elId ? `<span class="tt-id"> #${rec.elId}</span>` : '';
  const cls = rec.classes.length ? `<span class="tt-class"> .${rec.classes.join('.')}</span>` : '';
  const dims = `<span class="tt-dim">${Math.round(rec.rect.width)} × ${Math.round(rec.rect.height)}px</span>`;
  const depth = `<span class="tt-meta">depth: ${rec.depth}</span>`;
  const zi = `<span class="tt-meta">z-index: ${rec.zIndex || 'auto'}</span>`;
  const pos = `<span class="tt-meta">position: ${rec.position}</span>`;

  el.innerHTML = `
    <div class="tt-line">${tag}${id}${cls}</div>
    <div class="tt-line">${dims} · ${depth}</div>
    <div class="tt-line">${zi} · ${pos}</div>
  `;

  el.classList.remove('hidden');
  el.style.opacity = '0';
  el.style.transition = 'opacity 100ms linear';
  requestAnimationFrame(() => { el.style.opacity = '1'; });

  _position(mouseX, mouseY, containerRect);
}

function _position(mouseX, mouseY, containerRect) {
  if (!el || el.classList.contains('hidden')) return;
  const pad = 12;
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  const cw = containerRect.width;
  const ch = containerRect.height;

  let x = mouseX + pad;
  let y = mouseY + pad;
  if (x + tw > cw - pad) x = mouseX - tw - pad;
  if (y + th > ch - pad) y = mouseY - th - pad;
  x = Math.max(pad, x);
  y = Math.max(pad, y);

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

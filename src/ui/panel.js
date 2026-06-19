import { TAG_CATEGORIES, TAG_COLORS, LS_PROXY_WARN_KEY } from '../utils/constants.js';

const CATEGORY_LABELS = {
  structural: 'Structural',
  text: 'Text',
  media: 'Media',
  form: 'Form',
  meta: 'Meta / Other',
};

export class Sidebar {
  constructor({ onRender, onFetch, onOpacityChange, onTagFilter }) {
    this._onRender = onRender;
    this._onFetch = onFetch;
    this._onOpacity = onOpacityChange;
    this._onTagFilter = onTagFilter;
    this._enabledTags = new Set(Object.values(TAG_CATEGORIES).flat());
    this._bind();
  }

  _bind() {
    const textarea = document.getElementById('html-input');
    const renderBtn = document.getElementById('btn-render');
    const urlInput = document.getElementById('url-input');
    const fetchBtn = document.getElementById('btn-fetch');
    const proxyWarn = document.getElementById('proxy-warning');
    const opacitySlider = document.getElementById('opacity-slider');
    const opacityVal = document.getElementById('opacity-value');
    const btnSelectAll = document.getElementById('btn-select-all');
    const btnSelectNone = document.getElementById('btn-select-none');

    // Activate render button when there's HTML
    textarea?.addEventListener('input', () => {
      const has = textarea.value.trim().length > 0;
      renderBtn?.toggleAttribute('disabled', !has);
      if (has) textarea.classList.remove('error');
    });

    renderBtn?.addEventListener('click', () => {
      const html = textarea?.value?.trim();
      if (!html) return;
      this._onRender?.(html);
    });

    // URL fetch
    urlInput?.addEventListener('blur', () => {
      if (urlInput.value.trim()) {
        const dismissed = localStorage.getItem(LS_PROXY_WARN_KEY);
        if (!dismissed && proxyWarn) {
          proxyWarn.classList.remove('hidden');
          proxyWarn.querySelector('.warn-dismiss')?.addEventListener('click', () => {
            proxyWarn.classList.add('hidden');
            localStorage.setItem(LS_PROXY_WARN_KEY, '1');
          }, { once: true });
        }
      }
    });

    fetchBtn?.addEventListener('click', async () => {
      const url = urlInput?.value?.trim();
      if (!url) return;
      this._onFetch?.(url);
    });

    // Opacity slider
    opacitySlider?.addEventListener('input', () => {
      const val = parseInt(opacitySlider.value, 10);
      if (opacityVal) opacityVal.textContent = `${val}%`;
      this._onOpacity?.(val / 100);
    });

    // Select all / none
    btnSelectAll?.addEventListener('click', () => {
      this._enabledTags = new Set(Object.values(TAG_CATEGORIES).flat());
      document.querySelectorAll('.tag-checkbox').forEach(cb => { cb.checked = true; });
      this._onTagFilter?.(this._enabledTags);
    });

    btnSelectNone?.addEventListener('click', () => {
      this._enabledTags = new Set();
      document.querySelectorAll('.tag-checkbox').forEach(cb => { cb.checked = false; });
      this._onTagFilter?.(this._enabledTags);
    });
  }

  buildTagFilters(records) {
    const container = document.getElementById('tag-filters');
    if (!container) return;

    // Count tags
    const tagCounts = new Map();
    for (const rec of records) {
      tagCounts.set(rec.tag, (tagCounts.get(rec.tag) ?? 0) + 1);
    }

    container.innerHTML = '';

    for (const [cat, tags] of Object.entries(TAG_CATEGORIES)) {
      const presentTags = tags.filter(t => tagCounts.has(t));
      if (presentTags.length === 0) continue;

      const group = document.createElement('div');
      group.className = 'tag-group';
      group.dataset.cat = cat;

      const header = document.createElement('div');
      header.className = 'tag-group-header';
      const colHex = TAG_COLORS[cat]?.toString(16).padStart(6, '0') ?? '444444';
      header.innerHTML = `
        <span class="tag-group-arrow">▶</span>
        <span class="tag-group-name">${CATEGORY_LABELS[cat]}</span>
        <span class="tag-group-count">${presentTags.length}</span>
      `;
      header.addEventListener('click', () => {
        const body = group.querySelector('.tag-group-body');
        const arrow = header.querySelector('.tag-group-arrow');
        const collapsed = body.classList.toggle('collapsed');
        arrow.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(90deg)';
      });

      const body = document.createElement('div');
      body.className = 'tag-group-body collapsed';

      for (const tag of presentTags) {
        const count = tagCounts.get(tag) ?? 0;
        const row = document.createElement('label');
        row.className = 'tag-row';
        row.innerHTML = `
          <input type="checkbox" class="tag-checkbox" data-tag="${tag}" checked>
          <span class="tag-name">${tag}</span>
          <span class="tag-dot" style="background:#${colHex}"></span>
          <span class="tag-count">${count}</span>
        `;
        row.querySelector('.tag-checkbox').addEventListener('change', e => {
          if (e.target.checked) this._enabledTags.add(tag);
          else this._enabledTags.delete(tag);
          this._onTagFilter?.(this._enabledTags);
        });
        body.appendChild(row);
      }

      group.appendChild(header);
      group.appendChild(body);
      container.appendChild(group);
    }

    // Update counter
    document.getElementById('filter-count').textContent =
      `${Object.values(TAG_CATEGORIES).flat().filter(t => tagCounts.has(t)).length} tags`;
  }

  setHtmlValue(html) {
    const textarea = document.getElementById('html-input');
    if (textarea) {
      textarea.value = html;
      textarea.dispatchEvent(new Event('input'));
    }
  }

  setFetchStatus(msg, isError = false) {
    const el = document.getElementById('fetch-status');
    if (el) {
      el.textContent = msg;
      el.className = isError ? 'fetch-status error' : 'fetch-status';
    }
  }

  setRenderError(msg) {
    document.getElementById('render-error').textContent = msg;
    document.getElementById('render-error').classList.remove('hidden');
    const textarea = document.getElementById('html-input');
    if (textarea) {
      textarea.classList.add('error');
      setTimeout(() => textarea.classList.remove('error'), 1000);
    }
  }

  clearError() {
    document.getElementById('render-error').classList.add('hidden');
  }
}

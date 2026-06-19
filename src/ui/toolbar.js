import { HEATMAP_MODES } from '../utils/constants.js';

export class Toolbar {
  constructor({
    onHeatmapChange,
    onSpreadChange,
    onReset,
    onLabelsToggle,
    onExport,
    onShortcuts,
  }) {
    this._onHeatmap = onHeatmapChange;
    this._onSpread = onSpreadChange;
    this._onReset = onReset;
    this._onLabels = onLabelsToggle;
    this._onExport = onExport;
    this._labelsOn = false;
    this._heatmapMode = 'off';
    this._bind();
  }

  _bind() {
    // Heatmap dropdown (custom)
    const dropBtn = document.getElementById('heatmap-btn');
    const dropMenu = document.getElementById('heatmap-menu');
    if (dropBtn && dropMenu) {
      dropBtn.addEventListener('click', e => {
        e.stopPropagation();
        dropMenu.classList.toggle('open');
      });
      dropMenu.querySelectorAll('[data-mode]').forEach(item => {
        item.addEventListener('click', () => {
          const mode = item.dataset.mode;
          this._setHeatmap(mode);
          dropMenu.classList.remove('open');
        });
      });
      document.addEventListener('click', () => dropMenu.classList.remove('open'));
    }

    // Spread slider
    const spreadSlider = document.getElementById('spread-slider');
    const spreadValue = document.getElementById('spread-value');
    if (spreadSlider) {
      spreadSlider.addEventListener('input', () => {
        const val = parseInt(spreadSlider.value, 10);
        if (spreadValue) spreadValue.textContent = val;
        this._onSpread?.(val);
      });
    }

    // Reset
    document.getElementById('btn-reset')?.addEventListener('click', () => this._onReset?.());

    // Labels toggle
    const labelsBtn = document.getElementById('btn-labels');
    if (labelsBtn) {
      labelsBtn.addEventListener('click', () => {
        this._labelsOn = !this._labelsOn;
        labelsBtn.classList.toggle('active', this._labelsOn);
        labelsBtn.title = this._labelsOn ? 'Hide Labels (L)' : 'Show Labels (L)';
        this._onLabels?.(this._labelsOn);
      });
    }

    // Export
    document.getElementById('btn-export')?.addEventListener('click', () => this._onExport?.());

    // Shortcuts button
    document.getElementById('btn-shortcuts')?.addEventListener('click', () => {
      document.getElementById('shortcuts-panel')?.classList.toggle('hidden');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      switch (e.key.toLowerCase()) {
        case 'r': this._onReset?.(); break;
        case 'h': this._cycleHeatmap(); break;
        case 'l': labelsBtn?.click(); break;
        case 'e': if (e.shiftKey) this._onExport?.(); break;
        case '?': document.getElementById('shortcuts-panel')?.classList.toggle('hidden'); break;
        case 'escape': document.getElementById('shortcuts-panel')?.classList.add('hidden'); break;
      }
    });
  }

  _setHeatmap(mode) {
    this._heatmapMode = mode;
    const btn = document.getElementById('heatmap-btn');
    const labels = { off: 'Heatmap', depth: 'DOM Depth', zindex: 'Z-Index', stacking: 'Stacking', size: 'Element Size' };
    if (btn) {
      btn.querySelector('.heatmap-label').textContent = labels[mode] ?? mode;
      btn.classList.toggle('active', mode !== 'off');
    }
    document.querySelectorAll('#heatmap-menu [data-mode]').forEach(item => {
      item.classList.toggle('selected', item.dataset.mode === mode);
    });
    this._onHeatmap?.(mode);
  }

  _cycleHeatmap() {
    const idx = HEATMAP_MODES.indexOf(this._heatmapMode);
    const next = HEATMAP_MODES[(idx + 1) % HEATMAP_MODES.length];
    this._setHeatmap(next);
  }

  setLabelsState(on) {
    this._labelsOn = on;
    document.getElementById('btn-labels')?.classList.toggle('active', on);
  }
}

import { walkDOM } from './domParser.js';

const IFRAME_TIMEOUT = 3000;

// Inject HTML into a hidden sandboxed iframe, wait for layout, walk DOM, tear down
export async function resolveLayout(htmlStr) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.style.cssText = [
      'position:fixed',
      'left:-9999px',
      'top:-9999px',
      'width:1440px',
      'height:900px',
      'visibility:hidden',
      'pointer-events:none',
      'border:none',
    ].join(';');

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Layout measurement timed out'));
    }, IFRAME_TIMEOUT);

    function cleanup() {
      clearTimeout(timer);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }

    iframe.onload = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const records = walkDOM(iframeDoc, iframeDoc);
            cleanup();
            resolve(records);
          } catch (err) {
            cleanup();
            reject(err);
          }
        });
      });
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error('Iframe failed to load'));
    };

    // Inject a CSP meta to prevent external resource loading (reduces noise)
    const cspMeta = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\';">';
    const normalized = htmlStr.trimStart();
    const fullHtml = normalized.toLowerCase().startsWith('<!doctype') || normalized.toLowerCase().startsWith('<html')
      ? htmlStr.replace(/<head[^>]*>/i, `<head>${cspMeta}`)
      : `<!DOCTYPE html><html><head>${cspMeta}<style>*{box-sizing:border-box}</style></head><body>${htmlStr}</body></html>`;

    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(fullHtml);
      doc.close();
    } catch {
      // If srcdoc approach is needed
      iframe.srcdoc = fullHtml;
    }
  });
}

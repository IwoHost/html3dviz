import { walkDOM } from './domParser.js';

const IFRAME_TIMEOUT = 15000;
const IFRAME_W = 1440;
const IFRAME_H = 900;

export async function resolveLayout(htmlStr) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    iframe.style.cssText = [
      `position:fixed`,
      `left:-${IFRAME_W + 100}px`,
      `top:0`,
      `width:${IFRAME_W}px`,
      `height:${IFRAME_H}px`,
      `opacity:0`,
      `pointer-events:none`,
      `border:none`,
    ].join(';');

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Layout measurement timed out'));
    }, IFRAME_TIMEOUT);

    function cleanup() {
      clearTimeout(timer);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }

    // Using srcdoc instead of doc.write() fires exactly ONE load event
    // (doc.write on about:blank fires two: once for about:blank, once for content)
    iframe.onload = () => {
      // Two rAF ticks to ensure layout is complete
      requestAnimationFrame(() => requestAnimationFrame(async () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

          // 1. Collect layout records from the live DOM
          const records = walkDOM(iframeDoc, iframeDoc);

          // 2. Capture full-page screenshot using parent window's html2canvas
          //    (already loaded in the parent, no injection needed)
          let screenshot = null;
          try {
            screenshot = await captureIframe(iframe, iframeDoc);
          } catch (e) {
            console.warn('html2canvas capture failed, falling back to colored boxes:', e.message);
          }

          cleanup();
          resolve({ records, screenshot });
        } catch (err) {
          cleanup();
          reject(err);
        }
      }));
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error('Iframe failed to load'));
    };

    const normalized = htmlStr.trimStart().toLowerCase();
    const hasDoctype = normalized.startsWith('<!doctype') || normalized.startsWith('<html');
    const fullHtml = hasDoctype
      ? htmlStr
      : `<!DOCTYPE html><html><head><style>*{box-sizing:border-box}body{margin:0}</style></head><body>${htmlStr}</body></html>`;

    // srcdoc fires exactly one load event for the actual content
    iframe.srcdoc = fullHtml;
    document.body.appendChild(iframe);
  });
}

async function captureIframe(iframe, iframeDoc) {
  // Use the parent window's html2canvas (loaded via <script> in index.html).
  // html2canvas internally uses element.ownerDocument.defaultView.getComputedStyle,
  // so styles are correctly computed from the iframe's CSS cascade.
  const h2c = window.html2canvas;
  if (!h2c) throw new Error('html2canvas not available on parent window');

  const canvas = await h2c(iframeDoc.body, {
    useCORS: true,
    allowTaint: true,
    logging: false,
    width: iframe.clientWidth,
    height: Math.max(iframeDoc.body.scrollHeight, iframe.clientHeight),
    windowWidth: iframe.clientWidth,
    windowHeight: iframe.clientHeight,
    scale: 1,
  });
  return canvas;
}

import { walkDOM } from './domParser.js';

const IFRAME_TIMEOUT = 8000;
const IFRAME_W = 1440;
const IFRAME_H = 900;

export async function resolveLayout(htmlStr) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    // allow-scripts needed so html2canvas can run inside the iframe
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    iframe.style.cssText = [
      `position:fixed`,
      `left:-${IFRAME_W + 100}px`,
      `top:0`,
      `width:${IFRAME_W}px`,
      `height:${IFRAME_H}px`,
      `visibility:hidden`,
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

    iframe.onload = () => {
      // Two rAF ticks to ensure layout is complete
      requestAnimationFrame(() => requestAnimationFrame(async () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const iframeWin = iframe.contentWindow;

          // 1. Collect layout records from the live DOM
          const records = walkDOM(iframeDoc, iframeDoc);

          // 2. Inject html2canvas into the iframe and capture full-page screenshot
          let screenshot = null;
          try {
            screenshot = await captureIframe(iframe, iframeDoc, iframeWin);
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

    // Build the full HTML with a base tag to help relative resources resolve
    const normalized = htmlStr.trimStart().toLowerCase();
    const hasDoctype = normalized.startsWith('<!doctype') || normalized.startsWith('<html');
    const fullHtml = hasDoctype
      ? htmlStr
      : `<!DOCTYPE html><html><head><style>*{box-sizing:border-box}body{margin:0}</style></head><body>${htmlStr}</body></html>`;

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(fullHtml);
      doc.close();
    } else {
      iframe.srcdoc = fullHtml;
    }
  });
}

async function captureIframe(iframe, iframeDoc, iframeWin) {
  // Inject html2canvas script into the iframe
  await injectScript(iframeDoc, '/vendor/html2canvas.min.js');

  if (!iframeWin.html2canvas) throw new Error('html2canvas not available in iframe');

  const canvas = await iframeWin.html2canvas(iframeDoc.body, {
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

function injectScript(doc, src) {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    (doc.head || doc.body).appendChild(script);
  });
}

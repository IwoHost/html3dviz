import { walkDOM } from './domParser.js';

const IFRAME_TIMEOUT = 20000;
const IFRAME_W = 1440;
const IFRAME_H = 900;

let _html2canvasSource = null;
async function getH2CSource() {
  if (!_html2canvasSource) {
    const resp = await fetch('/vendor/html2canvas.min.js');
    if (!resp.ok) throw new Error(`Failed to load html2canvas: ${resp.status}`);
    _html2canvasSource = await resp.text();
  }
  return _html2canvasSource;
}

function raf() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

// Poll iframe.contentDocument.readyState instead of listening for the load event,
// which is unreliable for sandboxed srcdoc iframes in some browsers.
function waitForReady(iframe, timeout = IFRAME_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function check() {
      try {
        const state = iframe.contentDocument?.readyState;
        const children = iframe.contentDocument?.body?.children?.length ?? 0;
        if ((state === 'complete' || state === 'interactive') && children > 0) {
          resolve();
          return;
        }
      } catch (_) { /* cross-origin guard — shouldn't happen but be safe */ }
      if (Date.now() > deadline) {
        reject(new Error('Layout measurement timed out'));
        return;
      }
      setTimeout(check, 60);
    }
    check();
  });
}

export async function resolveLayout(htmlStr) {
  const normalized = htmlStr.trimStart().toLowerCase();
  const hasDoctype = normalized.startsWith('<!doctype') || normalized.startsWith('<html');
  const fullHtml = hasDoctype
    ? htmlStr
    : `<!DOCTYPE html><html><head><style>*{box-sizing:border-box}body{margin:0}</style></head><body>${htmlStr}</body></html>`;

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

  document.body.appendChild(iframe);

  // doc.write fires two load events (about:blank then content) but readyState
  // becomes 'complete' once the written content finishes — reliable in all environments.
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(fullHtml);
  doc.close();

  try {
    await waitForReady(iframe);

    // Two animation frames to let the browser compute layout/styles
    await raf();
    await raf();

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const iframeWin = iframe.contentWindow;

    const records = walkDOM(iframeDoc, iframeDoc);

    let screenshot = null;
    try {
      const iframeCanvas = await captureIframe(iframe, iframeDoc, iframeWin);
      if (iframeCanvas) {
        // Copy to a parent-window canvas while the iframe is still alive.
        // The iframe's canvas GPU context is invalidated when the frame is destroyed
        // (finally block below), so drawImage from it after removal yields transparent pixels.
        const copy = document.createElement('canvas');
        copy.width = iframeCanvas.width;
        copy.height = iframeCanvas.height;
        copy.getContext('2d').drawImage(iframeCanvas, 0, 0);
        screenshot = copy;
      }
    } catch (e) {
      console.warn('Screenshot capture failed, falling back to colored boxes:', e.message);
    }

    return { records, screenshot };
  } finally {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }
}

async function captureIframe(iframe, iframeDoc, iframeWin) {
  const h2cText = await getH2CSource();

  const script = iframeDoc.createElement('script');
  script.textContent = h2cText;
  (iframeDoc.head || iframeDoc.body).appendChild(script);

  if (!iframeWin.html2canvas) throw new Error('html2canvas not available in iframe after injection');

  return iframeWin.html2canvas(iframeDoc.body, {
    useCORS: true,
    allowTaint: true,
    logging: false,
    width: iframe.clientWidth,
    height: Math.max(iframeDoc.body.scrollHeight, iframe.clientHeight),
    windowWidth: iframe.clientWidth,
    windowHeight: iframe.clientHeight,
    scale: 1,
  });
}

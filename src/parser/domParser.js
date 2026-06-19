import { TAG_CATEGORIES, TAG_COLORS } from '../utils/constants.js';

const SKIP_TAGS = new Set(['script','style','meta','link','noscript','template','head']);

function getCategory(tag) {
  for (const [cat, tags] of Object.entries(TAG_CATEGORIES)) {
    if (tags.includes(tag)) return cat;
  }
  return 'unknown';
}

function getBaseColor(tag) {
  const cat = getCategory(tag);
  return TAG_COLORS[cat] ?? TAG_COLORS.unknown;
}

// Walk the live DOM (from an iframe) collecting NodeRecords
export function walkDOM(root, iframeDoc) {
  const records = [];
  let id = 0;

  function walk(el, depth, parentId) {
    const tag = el.tagName?.toLowerCase();
    if (!tag || SKIP_TAGS.has(tag)) return;

    const rect = el.getBoundingClientRect
      ? el.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0 };

    const computed = iframeDoc.defaultView
      ? iframeDoc.defaultView.getComputedStyle(el)
      : {};

    const zIndex = parseInt(computed.zIndex, 10) || 0;
    const position = computed.position ?? 'static';
    const display = computed.display ?? 'block';

    if (display === 'none') return;
    if (rect.width === 0 && rect.height === 0 && tag !== 'html' && tag !== 'body') {
      // still recurse children, just don't add invisible zero-size elements
    } else {
      const createsStackingContext = (
        position !== 'static' && zIndex !== 0 && !isNaN(parseInt(computed.zIndex, 10))
      ) || computed.opacity !== '1' || computed.transform !== 'none' ||
        computed.filter !== 'none' || computed.isolation === 'isolate';

      records.push({
        id: id++,
        parentId,
        tag,
        elId: el.id || '',
        classes: Array.from(el.classList),
        inlineStyle: el.getAttribute('style') || '',
        rect: {
          left: rect.left,
          top: rect.top,
          width: Math.max(rect.width, 1),
          height: Math.max(rect.height, 1),
        },
        zIndex,
        position,
        depth,
        createsStackingContext,
        category: getCategory(tag),
        baseColor: getBaseColor(tag),
      });
    }

    const myId = id - 1;
    for (const child of el.children) {
      walk(child, depth + 1, myId >= 0 ? myId : null);
    }
  }

  // Start from body or root
  const startEl = root.body ?? root.documentElement ?? root;
  walk(startEl, 0, null);
  return records;
}

// Parse an HTML string using DOMParser (no script execution)
export function parseHTMLString(htmlStr) {
  const parser = new DOMParser();
  return parser.parseFromString(htmlStr, 'text/html');
}

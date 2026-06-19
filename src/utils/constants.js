export const DEFAULT_SPREAD = 8;
export const LAYER_GAP = 40;
export const Z_INDEX_SCALE = 0.5;
export const MAX_ELEMENTS = 2000;
export const WARN_ELEMENTS = 500;
export const CANVAS_UNIT_SCALE = 0.001; // CSS px → Three.js world units

export const TAG_CATEGORIES = {
  structural: ['div','section','article','main','aside','header','footer','nav','figure','figcaption','html','body'],
  text: ['p','h1','h2','h3','h4','h5','h6','span','a','strong','em','label','li','ul','ol','blockquote','pre','code','time','abbr'],
  media: ['img','video','audio','canvas','svg','picture','source','iframe','embed','object'],
  form: ['form','input','button','select','textarea','fieldset','legend','option','optgroup','datalist'],
  meta: ['script','style','link','meta','template','noscript','slot'],
};

export const TAG_COLORS = {
  structural: 0x4466ff,
  text:       0x44aa66,
  media:      0xcc6644,
  form:       0xaa44cc,
  meta:       0x555555,
  unknown:    0x444455,
};

export const HEATMAP_MODES = ['off', 'depth', 'zindex', 'stacking', 'size'];

export const POSTCARD_NAG_THRESHOLD = 3;
export const LS_RENDERS_KEY = 'html3dviz_renders_count';
export const LS_SEEN_KEY = 'html3dviz_seen';
export const LS_POSTCARD_KEY = 'html3dviz_postcard_seen';
export const LS_PROXY_WARN_KEY = 'html3dviz_proxy_warn_dismissed';

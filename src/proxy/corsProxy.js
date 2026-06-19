const PROXIES = [
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

export async function fetchViaProxy(url) {
  let lastError;
  for (const buildUrl of PROXIES) {
    try {
      const res = await fetch(buildUrl(url), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      // allorigins returns { contents: "..." }
      const html = data?.contents ?? data;
      if (typeof html !== 'string') throw new Error('Unexpected response format');
      return html;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`All proxies failed: ${lastError?.message}`);
}

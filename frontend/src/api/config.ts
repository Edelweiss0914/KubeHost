/** Public Vite build-time configuration; never include credentials. */
export function normalizeApiBaseUrl(value = ''): string {
 const base = value.trim().replace(/\/+$/, '');
 if (!base) return '';
 if (base.startsWith('/') && !base.startsWith('//') && !/[?#]/.test(base)) return base;
 const url = new URL(base);
 if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid VITE_API_BASE_URL');
 return base;
}
export const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
export const apiUrl = (path: string) => apiBaseUrl + path;

/** Convert an HTTP(S) API URL to its WebSocket (ws/wss) equivalent. */
export function wsApiUrl(path: string): string {
  const base = apiUrl(path);
  if (base.startsWith('http://')) return 'ws://' + base.slice(7);
  if (base.startsWith('https://')) return 'wss://' + base.slice(8);
  // relative path — derive from current page origin
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}${base}`;
}

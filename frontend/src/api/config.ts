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

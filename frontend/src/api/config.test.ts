import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeApiBaseUrl } from './config';
import { consoleMode } from '../domain/mode';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
describe('runtime boundary', () => {
 it('defaults to same-origin and normalizes a configured prefix', () => {
  expect(normalizeApiBaseUrl()).toBe('');
  expect(normalizeApiBaseUrl(' https://api.example.com/prefix/// ')).toBe('https://api.example.com/prefix');
  expect(normalizeApiBaseUrl('/gateway/')).toBe('/gateway');
 });
 it.each(['//example.com', 'javascript:alert(1)', 'https://user:secret@example.com', '/gateway?token=x'])('rejects invalid or credential-bearing config %s', value => {
  expect(() => normalizeApiBaseUrl(value)).toThrow();
 });
 it('routes health and versioned API through the same configured host', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/gateway/');
  vi.resetModules();
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({status:'ok',mode:'mock'})));
  vi.stubGlobal('fetch',fetch);
  const {api} = await import('./client');
  await api.health(); await api.servers();
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['https://api.example.com/gateway/health','https://api.example.com/gateway/api/v1/servers']);
 });
 it('uses real mode only when health is ok', () => {
  expect(consoleMode(null)).toBe('unknown');
  expect(consoleMode({status:'error',mode:'mock'})).toBe('unknown');
  expect(consoleMode({status:'ok',mode:'future'})).toBe('real');
  expect(consoleMode({status:'ok',mode:'kubernetes'})).toBe('real');
  expect(consoleMode({status:'ok',mode:'mock'})).toBe('real');
  expect(consoleMode({status:'ok',mode:'real'})).toBe('real');
 });
});

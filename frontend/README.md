# Frontend configuration

Copy .env.example to .env.local for local overrides. VITE_API_BASE_URL is public Vite build-time configuration; rebuild assets after changes. Leave it empty for same-origin /api/v1 and /health. An optional HTTP(S) origin or absolute path prefix applies to both endpoints. Cross-origin deployments require backend CORS configuration. Never include secrets.

The console uses GET /health with {status: 'ok', mode: 'mock' | 'real', authentication: string}. Unknown, unhealthy or failed health responses never enable mutations. Mock mode retains create/start/stop/delete. Real mode (`mode: real`) currently provides a read-only view until the real integration and capability contract are reviewed; all lifecycle controls are disabled. Authentication labels report backend metadata, not production readiness.

The Vite development proxy forwards both /api and /health to localhost:8000. Production hosting must route both paths to the backend when using same-origin configuration.

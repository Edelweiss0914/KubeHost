export interface Health { status: string; mode: string; authentication?: string }
export type ConsoleMode = 'mock' | 'real' | 'unknown';
export function consoleMode(health: Health | null): ConsoleMode {
 if (health?.status !== 'ok') return 'unknown';
 return health.mode === 'mock' || health.mode === 'real' ? health.mode : 'unknown';
}

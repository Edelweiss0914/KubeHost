export interface Health { status: string; mode: string; authentication?: string }
export type ConsoleMode = 'real' | 'unknown';
export function consoleMode(health: Health | null): ConsoleMode {
 if (health?.status !== 'ok') return 'unknown';
 return 'real';
}

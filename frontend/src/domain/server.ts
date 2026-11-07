export type GameType = 'VANILLA' | 'PAPER' | 'FORGE' | 'FABRIC' | 'MODRINTH' | 'AUTO_CURSEFORGE';
export interface ServerInput { name: string; game: 'minecraft-java' | 'valheim' | 'garrysmod' | 'cs2' | 'rust'; edition: 'paper'; game_type: GameType; version: string; modrinth_project: string | null; cf_slug: string | null; cpu: number; memory_mb: number; storage_gb: number; node_id: string; node_port: number | null; server_password?: string | null; world_name?: string | null; server_public?: boolean; map_name?: string | null; gamemode_name?: string | null; cs2_workshop_map?: string | null; cs2_workshop_collection?: string | null }
export interface Server extends ServerInput { id: string; owner_id: string; status: 'running' | 'stopped' | 'provisioning' | 'error'; created_at: string; connection: string | null; resource_plan: { namespace: string; resources: unknown[]; warnings: string[] }; logs: string[] }
export interface WorkerNode { id: string; name: string; role: string; status: string; schedulable: boolean; cpu_capacity: number; memory_mb_capacity: number; cpu_requested_m: number; memory_mb_requested: number }
export interface TopologyPod { server_id: string; name: string; namespace: string; node_id: string | null; phase: string; containers: { name: string; ready: boolean; state: string; restart_count: number }[]; simulated: boolean }
export interface ServerSettings { difficulty: 'peaceful'|'easy'|'normal'|'hard'; gamemode: 'survival'|'creative'|'adventure'|'spectator'; max_players: number; motd: string; pvp: boolean; online_mode: boolean; spawn_protection: number; view_distance: number; ops: string; force_gamemode: boolean }
export type GameSettings = { world_name: string; server_public: boolean } | { map_name: string; gamemode_name: string } | { cs2_workshop_map: string; cs2_workshop_collection: string };
export const defaultSettings: ServerSettings = { difficulty: 'easy', gamemode: 'survival', max_players: 20, motd: 'A Minecraft Server', pvp: true, online_mode: true, spawn_protection: 16, view_distance: 10, ops: '', force_gamemode: false };
export const defaults: ServerInput = { name: '', game: 'minecraft-java', edition: 'paper', game_type: 'PAPER', version: 'LATEST', modrinth_project: null, cf_slug: null, cpu: 1, memory_mb: 2048, storage_gb: 10, node_id: '', node_port: null, server_password: null, world_name: null, server_public: false, map_name: null, gamemode_name: null, cs2_workshop_map: null, cs2_workshop_collection: null };
export const GAME_ICONS: Record<string, string> = {
  'minecraft-java': '⛏',
  'valheim': '⚔',
  'garrysmod': '🔧',
  'cs2': '🎯',
  'rust': '🪨',
};
export function validate(input: ServerInput): Record<string, string> {
 const errors: Record<string,string> = {};
 if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{2,39}$/.test(input.name.trim())) errors.name = '영문, 숫자, 공백, 밑줄, 하이픈으로 3–40자를 입력하세요. 첫 글자는 영문 또는 숫자입니다.';
 if (!Number.isFinite(input.cpu) || input.cpu < 0.5 || input.cpu > 4) errors.cpu = 'CPU는 0.5–4 코어 범위입니다.';
 if (!Number.isInteger(input.memory_mb) || input.memory_mb < 1024 || input.memory_mb > 8192) errors.memory_mb = '메모리는 1024–8192 MiB 범위입니다.';
 if (!Number.isInteger(input.storage_gb) || input.storage_gb < 5 || input.storage_gb > 100) errors.storage_gb = '스토리지는 5–100 GiB 범위입니다.';
 if (!input.node_id) errors.node_id = '배포할 Worker를 선택하세요.';
 if (input.node_port !== null && (!Number.isInteger(input.node_port) || input.node_port < 30000 || input.node_port > 32767)) errors.node_port = '포트는 30000–32767 범위의 정수여야 합니다.';
 if (input.game_type === 'MODRINTH' && !input.modrinth_project?.trim()) errors.modrinth_project = 'Modrinth 프로젝트 ID를 입력하세요.';
 if (input.game_type === 'AUTO_CURSEFORGE' && !input.cf_slug?.trim()) errors.cf_slug = 'CurseForge 모드팩 slug를 입력하세요.';
 if (input.game === 'valheim' && input.server_password && input.server_password.length < 5) errors.server_password = '비밀번호는 최소 5자 이상이어야 합니다.';
 return errors;
}



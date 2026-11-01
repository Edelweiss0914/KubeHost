export interface ServerInput { name: string; game: 'minecraft-java'; edition: 'paper'; version: string; cpu: number; memory_mb: number; storage_gb: number; node_id: string }
export interface Server extends ServerInput { id: string; owner_id: string; status: 'running' | 'stopped'; created_at: string; connection: string | null; resource_plan: { namespace: string; resources: unknown[]; warnings: string[] }; logs: string[] }
export interface WorkerNode { id: string; name: string; role: string; status: string; schedulable: boolean }
export const defaults: ServerInput = { name: '', game: 'minecraft-java', edition: 'paper', version: '1.21.4', cpu: 1, memory_mb: 2048, storage_gb: 10, node_id: '' };
export function validate(input: ServerInput): Record<string, string> {
 const errors: Record<string,string> = {};
 if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{2,39}$/.test(input.name.trim())) errors.name = '영문, 숫자, 공백, 밑줄, 하이픈으로 3–40자를 입력하세요. 첫 글자는 영문 또는 숫자입니다.';
 if (!Number.isFinite(input.cpu) || input.cpu < 0.5 || input.cpu > 4) errors.cpu = 'CPU는 0.5–4 코어 범위입니다.';
 if (!Number.isInteger(input.memory_mb) || input.memory_mb < 1024 || input.memory_mb > 8192) errors.memory_mb = '메모리는 1024–8192 MiB 범위입니다.';
 if (!Number.isInteger(input.storage_gb) || input.storage_gb < 5 || input.storage_gb > 100) errors.storage_gb = '스토리지는 5–100 GiB 범위입니다.';
 if (!input.node_id) errors.node_id = '배포할 Worker를 선택하세요.';
 return errors;
}




import type { Health } from '../domain/mode';
import { apiUrl } from './config';
import type { GameSettings, Server, ServerInput, ServerSettings, TopologyPod, WorkerNode } from '../domain/server';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export type Game = {
  id: string;
  slug: string;
  name: string;
  steam_app_id: number | null;
  image_url: string | null;
  description: string;
  supported: boolean;
};

export type GameDefinition = {
  slug: string;
  name: string;
  description: string;
  capabilities: string[];
  file_root: string;
  quick_access: { folder: string; icon: string; label: string; desc: string }[];
  icon: string;
  color: string;
  console_placeholder: string;
};

export type Template = {
  id: string;
  name: string;
  game: string;
  cpu: number;
  memory_mb: number;
  storage_gb: number;
  created_at: string;
  is_public: boolean;
  description: string;
  status: string;  // pending | ready | failed
};

export type Schedule = {
  id: string;
  server_id: string;
  days: number[];  // 0=월~6=일, 빈 배열=매일
  start_time: string | null;
  stop_time: string | null;
  enabled: boolean;
  timezone: string;
};

export type ScheduleInput = Omit<Schedule, 'id' | 'server_id'>;

export type FileEntry = {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: number; // unix timestamp
};

export type MetricPoint = { t: number; v: number };
export type ServerMetrics = { cpu: MetricPoint[]; memory_bytes: MetricPoint[] };
export type NamespaceMetrics = { namespace: string; cpu: MetricPoint[]; memory_bytes: MetricPoint[] };
export type ClusterMetrics = {
  cpu_pct: Record<string, number>;
  mem_pct: Record<string, number>;
  mem_used_bytes: Record<string, number>;
  mem_total_bytes: Record<string, number>;
};

function getToken(): string { try { return localStorage.getItem('kubehost-token') ?? ''; } catch { return ''; } }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let response: Response;
  try { response = await fetch(apiUrl(path), { ...init, headers }); }
  catch { throw new ApiError(0, 'API에 연결할 수 없습니다. 백엔드 실행 상태를 확인하세요.'); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.detail === 'string'
      ? body.detail
      : Array.isArray(body.detail)
        ? body.detail.map((e: unknown) => (e && typeof e === 'object' && 'msg' in e ? (e as { msg: string }).msg : String(e))).filter(Boolean).join(' · ') || '요청을 처리하지 못했습니다. 다시 시도하세요.'
        : '요청을 처리하지 못했습니다. 다시 시도하세요.';
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export interface ServerGateway {
  health(): Promise<Health>;
  servers(): Promise<Server[]>;
  nodes(): Promise<WorkerNode[]>;
  topologyPods(): Promise<TopologyPod[]>;
  server(id: string): Promise<Server>;
  create(input: ServerInput): Promise<Server>;
  action(id: string, action: 'start' | 'stop'): Promise<Server>;
  remove(id: string, deleteData: boolean, confirmation: string): Promise<void>;
  logs(id: string, tail?: number): Promise<{lines: string[]}>;
  retained(): Promise<Server[]>;
  restore(id: string): Promise<Server>;
  pvcs(id: string): Promise<{pvcs: string[]}>;
  getSettings(id: string): Promise<Record<string, string>>;
  updateSettings(id: string, s: ServerSettings): Promise<void>;
  getGameSettings(id: string): Promise<GameSettings>;
  updateGameSettings(id: string, s: GameSettings): Promise<void>;
  console(id: string, command: string): Promise<{output: string}>;
  register(username: string, password: string, inviteCode?: string): Promise<{id: string; username: string}>;
  login(username: string, password: string): Promise<{token: string; username: string}>;
  me(): Promise<{id: string; username: string; is_admin: boolean}>;
  getCfKey(): Promise<{has_key: boolean}>;
  setCfKey(key: string | null): Promise<void>;
  tenant(): Promise<{namespace: string; quota: Record<string, {used: string; hard: string}>}>;
  // Admin
  adminListUsers(): Promise<{id: string; username: string; is_admin: boolean; created_at: string}[]>;
  adminDeleteUser(userId: string): Promise<void>;
  adminListInvites(): Promise<{id: string; code: string; single_use: boolean; created_at: string; expires_at: string|null; used_by: string|null; used_at: string|null; is_valid: boolean}[]>;
  adminCreateInvite(singleUse: boolean, expiresAt?: string): Promise<{id: string; code: string}>;
  adminRevokeInvite(inviteId: string): Promise<void>;
  adminOverview(): Promise<{user_id: string; username: string; is_admin: boolean; namespace: string; server_count: number; quota: Record<string, unknown>}[]>;
  adminListAuditLogs(params?: { actor_id?: string; action?: string; limit?: number; offset?: number }): Promise<{id:string; timestamp:string; actor_id:string; actor_name:string; action:string; target_id:string; target_name:string; result:string; detail:string}[]>;
  adminToggleAdmin(userId: string): Promise<{id: string; is_admin: boolean}>;
  adminForceStop(serverId: string): Promise<{id: string; status: string}>;
  adminListAllServers(): Promise<{id:string; name:string; status:string; owner_id:string; owner_name:string; node_id:string; cpu:number; memory_mb:number; created_at:string}[]>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  adminGetUserQuota(userId: string): Promise<{max_cpu: number; max_memory_mb: number; max_storage_gb: number; max_servers: number}>;
  adminSetUserQuota(userId: string, quota: {max_cpu: number; max_memory_mb: number; max_storage_gb: number; max_servers: number}): Promise<void>;
  games(): Promise<Game[]>;
  getGameDefinition(slug: string): Promise<GameDefinition>;
  players(serverId: string): Promise<{ count: number; max: number; names: string[] }>;
  whitelist(serverId: string): Promise<{ enabled: boolean; names: string[] }>;
  addWhitelist(serverId: string, name: string): Promise<{ output: string }>;
  removeWhitelist(serverId: string, name: string): Promise<{ output: string }>;
  listOps(serverId: string): Promise<{ names: string[] }>;
  opPlayer(serverId: string, name: string): Promise<{ output: string }>;
  deopPlayer(serverId: string, name: string): Promise<{ output: string }>;
  listBans(serverId: string): Promise<{ names: string[] }>;
  banPlayer(serverId: string, name: string): Promise<{ output: string }>;
  unbanPlayer(serverId: string, name: string): Promise<{ output: string }>;
  getAutoRestart(id: string): Promise<{ enabled: boolean }>;
  setAutoRestart(id: string, enabled: boolean): Promise<void>;
  listSchedules(serverId: string): Promise<Schedule[]>;
  createSchedule(serverId: string, s: ScheduleInput): Promise<Schedule>;
  updateSchedule(serverId: string, scheduleId: string, s: ScheduleInput): Promise<Schedule>;
  deleteSchedule(serverId: string, scheduleId: string): Promise<void>;
  getJvm(id: string): Promise<{ memory_mb: number }>;
  setJvm(id: string, memory_mb: number): Promise<void>;
  getProperties(id: string): Promise<{ content: string }>;
  setProperties(id: string, content: string): Promise<void>;
  listBackups(id: string): Promise<{ backups: string[] }>;
  createBackup(id: string): Promise<{ filename: string }>;
  restoreBackup(id: string, filename: string): Promise<void>;
  deleteBackup(id: string, filename: string): Promise<void>;
  setVersion(id: string, version: string): Promise<void>;
  listFiles(serverId: string, path: string): Promise<FileEntry[]>;
  downloadFile(serverId: string, path: string): Promise<void>;
  readTextFile(serverId: string, path: string): Promise<string>;
  uploadFile(serverId: string, path: string, file: File, onProgress?: (pct: number) => void): Promise<{ path: string; name: string; size: number }>;
  deletePath(serverId: string, path: string): Promise<void>;
  mkdirFs(serverId: string, path: string): Promise<{ path: string }>;
  extractZip(serverId: string, path: string): Promise<{ path: string }>;
  serverMetrics(serverId: string, minutes?: number): Promise<ServerMetrics>;
  namespaceMetrics(minutes?: number): Promise<NamespaceMetrics>;
  clusterMetrics(): Promise<ClusterMetrics>;
  libraryList(path?: string): Promise<FileEntry[]>;
  libraryDownload(path: string): Promise<void>;
  libraryUpload(path: string | undefined, file: File, onProgress?: (pct: number) => void): Promise<{path: string; name: string; size: number}>;
  libraryDelete(path: string): Promise<void>;
  libraryMkdir(path: string): Promise<{path: string}>;
  libraryExtract(path: string): Promise<{path: string}>;
  libraryStorage(): Promise<{used_bytes: number; total_bytes: number}>;
  githubClone(serverId: string, url: string, branch: string, path: string): Promise<{ owner: string; repo: string; branch: string; path: string }>;
  cloneServer(serverId: string, name: string): Promise<{ id: string }>;
  listTemplates(): Promise<Template[]>;
  snapshotServer(serverId: string, name: string, description?: string): Promise<{ id: string }>;
  deployTemplate(templateId: string, name: string, resources?: { cpu?: number; memory_mb?: number; storage_gb?: number }): Promise<{ id: string }>;
  deleteTemplate(templateId: string): Promise<void>;
  updateTemplate(templateId: string, patch: { is_public?: boolean; description?: string }): Promise<void>;
  listPublicTemplates(): Promise<(Template & { owner_name: string; owner_id: string })[]>;
  setWorkshop(serverId: string, collectionId: string): Promise<{ collection_id: string }>;
  getWorkshopItems(serverId: string, page: number): Promise<{ items: WorkshopItem[]; total: number; page: number; per_page: number; collection_id: string }>;
  setWorkshopAddons(serverId: string, addonIds: string[]): Promise<{ addon_ids: string[] }>;
  getWorkshopAddons(serverId: string): Promise<{ addon_ids: string[]; items: WorkshopItem[] }>;
}

export interface WorkshopItem {
  id: string;
  title: string;
  preview_url: string;
  file_size: number;
}

const versioned = <T,>(path: string, init?: RequestInit) => request<T>(`/api/v1${path}`, init);

export const api: ServerGateway = {
  health: () => request<Health>('/health'),
  servers: () => versioned('/servers'),
  nodes: () => versioned('/nodes'),
  topologyPods: () => versioned('/topology/pods'),
  server: id => versioned(`/servers/${encodeURIComponent(id)}`),
  create: input => versioned('/servers', {method:'POST', body:JSON.stringify(input)}),
  action: (id, action) => versioned(`/servers/${encodeURIComponent(id)}/${action}`, {method:'POST'}),
  remove: (id, deleteData, confirmation) => versioned(`/servers/${encodeURIComponent(id)}?${new URLSearchParams({delete_data:String(deleteData),confirmation})}`, {method:'DELETE'}),
  logs: (id, tail=100) => versioned(`/servers/${encodeURIComponent(id)}/logs?tail=${tail}`),
  retained: () => versioned('/retained'),
  restore: id => versioned(`/retained/${encodeURIComponent(id)}/restore`, {method:'POST'}),
  pvcs: id => versioned(`/retained/${encodeURIComponent(id)}/pvcs`),
  getSettings: id => versioned(`/servers/${encodeURIComponent(id)}/settings`),
  updateSettings: (id, s) => versioned(`/servers/${encodeURIComponent(id)}/settings`, {method:'PUT', body:JSON.stringify(s)}),
  getGameSettings: id => versioned(`/servers/${encodeURIComponent(id)}/game-settings`),
  updateGameSettings: (id, s) => versioned(`/servers/${encodeURIComponent(id)}/game-settings`, {method:'PUT', body:JSON.stringify(s)}),
  console: (id, command) => versioned(`/servers/${encodeURIComponent(id)}/console`, {method:'POST', body:JSON.stringify({command})}),
  register: (username, password, inviteCode) => versioned('/auth/register', {
    method: 'POST',
    body: JSON.stringify({username, password}),
    ...(inviteCode ? {headers: {'X-Admin-Secret': inviteCode}} : {}),
  }),
  login: (username, password) => versioned('/auth/login', {method:'POST', body:JSON.stringify({username, password})}),
  me: () => versioned('/auth/me'),
  getCfKey: () => versioned('/auth/me/cf-key'),
  setCfKey: (key: string | null) => versioned('/auth/me/cf-key', { method: 'PUT', body: JSON.stringify({ cf_api_key: key }) }).then(() => {}),
  tenant: () => versioned('/tenant'),
  adminListUsers: () => versioned('/admin/users'),
  adminDeleteUser: (userId) => versioned(`/admin/users/${encodeURIComponent(userId)}`, {method:'DELETE'}),
  adminListInvites: () => versioned('/admin/invite-codes'),
  adminCreateInvite: (singleUse, expiresAt) => versioned('/admin/invite-codes', {method:'POST', body:JSON.stringify({single_use:singleUse, expires_at:expiresAt??null})}),
  adminRevokeInvite: (inviteId) => versioned(`/admin/invite-codes/${encodeURIComponent(inviteId)}`, {method:'DELETE'}),
  adminOverview: () => versioned('/admin/overview'),
  adminListAuditLogs: (params) => {
    const q = new URLSearchParams();
    if (params?.actor_id) q.set('actor_id', params.actor_id);
    if (params?.action) q.set('action', params.action);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return versioned(`/admin/audit-logs${q.size ? '?' + q : ''}`);
  },
  adminToggleAdmin: (userId) => versioned(`/admin/users/${encodeURIComponent(userId)}/toggle-admin`, {method:'POST'}),
  adminForceStop: (serverId) => versioned(`/admin/servers/${encodeURIComponent(serverId)}/force-stop`, {method:'POST'}),
  adminListAllServers: () => versioned('/admin/servers'),
  changePassword: (currentPassword, newPassword) => versioned('/auth/password', {method:'PUT', body:JSON.stringify({current_password:currentPassword, new_password:newPassword})}),
  adminGetUserQuota: (userId) => versioned(`/admin/users/${encodeURIComponent(userId)}/quota`),
  adminSetUserQuota: (userId, quota) => versioned(`/admin/users/${encodeURIComponent(userId)}/quota`, {method:'PUT', body:JSON.stringify(quota)}),
  games: () => versioned('/games'),
  getGameDefinition: (slug) => versioned(`/games/${encodeURIComponent(slug)}/definition`),
  players: (id) => versioned(`/servers/${encodeURIComponent(id)}/players`),
  whitelist: (id) => versioned(`/servers/${encodeURIComponent(id)}/whitelist`),
  addWhitelist: (id, name) => versioned(`/servers/${encodeURIComponent(id)}/whitelist`, { method: 'POST', body: JSON.stringify({ name }) }),
  removeWhitelist: (id, name) => versioned(`/servers/${encodeURIComponent(id)}/whitelist/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  listOps: (id) => versioned(`/servers/${encodeURIComponent(id)}/ops`),
  opPlayer: (id, name) => versioned(`/servers/${encodeURIComponent(id)}/ops`, { method: 'POST', body: JSON.stringify({ name }) }),
  deopPlayer: (id, name) => versioned(`/servers/${encodeURIComponent(id)}/ops/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  listBans: (id) => versioned(`/servers/${encodeURIComponent(id)}/bans`),
  banPlayer: (id, name) => versioned(`/servers/${encodeURIComponent(id)}/bans`, { method: 'POST', body: JSON.stringify({ name }) }),
  unbanPlayer: (id, name) => versioned(`/servers/${encodeURIComponent(id)}/bans/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getAutoRestart: (id) => versioned(`/servers/${encodeURIComponent(id)}/auto-restart`),
  setAutoRestart: (id, enabled) => versioned(`/servers/${encodeURIComponent(id)}/auto-restart`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  listSchedules: (serverId) => versioned(`/servers/${encodeURIComponent(serverId)}/schedules`),
  createSchedule: (serverId, s) => versioned(`/servers/${encodeURIComponent(serverId)}/schedules`, {method:'POST', body:JSON.stringify(s)}),
  updateSchedule: (serverId, scheduleId, s) => versioned(`/servers/${encodeURIComponent(serverId)}/schedules/${encodeURIComponent(scheduleId)}`, {method:'PUT', body:JSON.stringify(s)}),
  deleteSchedule: (serverId, scheduleId) => versioned(`/servers/${encodeURIComponent(serverId)}/schedules/${encodeURIComponent(scheduleId)}`, {method:'DELETE'}),
  getJvm: (id) => versioned(`/servers/${encodeURIComponent(id)}/jvm`),
  setJvm: (id, memory_mb) => versioned(`/servers/${encodeURIComponent(id)}/jvm`, { method: 'PUT', body: JSON.stringify({ memory_mb }) }),
  getProperties: (id) => versioned(`/servers/${encodeURIComponent(id)}/properties`),
  setProperties: (id, content) => versioned(`/servers/${encodeURIComponent(id)}/properties`, { method: 'PUT', body: JSON.stringify({ content }) }),
  listBackups: (id) => versioned(`/servers/${encodeURIComponent(id)}/backups`),
  createBackup: (id) => versioned(`/servers/${encodeURIComponent(id)}/backups`, { method: 'POST' }),
  restoreBackup: (id, filename) => versioned(`/servers/${encodeURIComponent(id)}/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' }),
  deleteBackup: (id, filename) => versioned(`/servers/${encodeURIComponent(id)}/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  setVersion: (id, version) => versioned(`/servers/${encodeURIComponent(id)}/version`, { method: 'PUT', body: JSON.stringify({ version }) }),
  listFiles: (id, path) => versioned(`/servers/${encodeURIComponent(id)}/fs?path=${encodeURIComponent(path)}`),
  downloadFile: async (id, path) => {
    const token = getToken();
    const url = apiUrl(`/api/v1/servers/${encodeURIComponent(id)}/fs/download?path=${encodeURIComponent(path)}`);
    const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!resp.ok) throw new ApiError(resp.status, '다운로드 실패');
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = path.split('/').pop() ?? 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  },
  readTextFile: async (id, path) => {
    const token = getToken();
    const resp = await fetch(apiUrl(`/api/v1/servers/${encodeURIComponent(id)}/fs/download?path=${encodeURIComponent(path)}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) {
      const detail = await resp.json().then(body => body.detail as string).catch(() => '파일 열기 실패');
      throw new ApiError(resp.status, detail);
    }
    return resp.text();
  },
  uploadFile: (id, path, file, onProgress) => {
    return new Promise((resolve, reject) => {
      const token = getToken();
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl(`/api/v1/servers/${encodeURIComponent(id)}/fs/upload?path=${encodeURIComponent(path)}`));
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (onProgress) {
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          const detail = (() => { try { return JSON.parse(xhr.responseText).detail; } catch { return null; } })();
          reject(new ApiError(xhr.status, detail ?? '업로드 실패'));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, '네트워크 오류'));
      xhr.send(form);
    });
  },
  deletePath: (id, path) => versioned(`/servers/${encodeURIComponent(id)}/fs?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  mkdirFs: (id, path) => versioned(`/servers/${encodeURIComponent(id)}/fs/mkdir`, { method: 'POST', body: JSON.stringify({ path }) }),
  extractZip: (id, path) => versioned(`/servers/${encodeURIComponent(id)}/fs/extract`, { method: 'POST', body: JSON.stringify({ path }) }),
  serverMetrics: (serverId, minutes = 60) => versioned(`/metrics/server/${encodeURIComponent(serverId)}?minutes=${minutes}`),
  namespaceMetrics: (minutes = 60) => versioned(`/metrics/namespace?minutes=${minutes}`),
  clusterMetrics: () => versioned('/metrics/cluster'),
  libraryList: (path) => versioned(`/library/fs${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  libraryDownload: async (path) => {
    const token = getToken();
    const resp = await fetch(apiUrl(`/api/v1/library/fs/download?path=${encodeURIComponent(path)}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new ApiError(resp.status, await resp.json().then((b: {detail: string}) => b.detail).catch(() => '다운로드 실패'));
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = path.split('/').pop() ?? 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  },
  libraryUpload: (path, file, onProgress) => {
    return new Promise((resolve, reject) => {
      const token = getToken();
      const form = new FormData();
      form.append('file', file);
      const url = apiUrl(`/api/v1/library/fs/upload${path ? `?path=${encodeURIComponent(path)}` : ''}`);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as {path: string; name: string; size: number});
        else reject(new ApiError(xhr.status, (JSON.parse(xhr.responseText) as {detail?: string})?.detail ?? '업로드 실패'));
      };
      xhr.onerror = () => reject(new Error('네트워크 오류'));
      xhr.send(form);
    });
  },
  libraryDelete: (path) => versioned(`/library/fs?path=${encodeURIComponent(path)}`, { method: 'DELETE' }).then(() => undefined),
  libraryMkdir: (path) => versioned(`/library/fs/mkdir`, { method: 'POST', body: JSON.stringify({ path }) }),
  libraryExtract: (path) => versioned(`/library/fs/extract`, { method: 'POST', body: JSON.stringify({ path }) }),
  libraryStorage: () => versioned('/library/storage'),
  githubClone: (serverId, url, branch, path) => versioned(`/servers/${encodeURIComponent(serverId)}/fs/github`, { method: 'POST', body: JSON.stringify({ url, branch, path }) }),
  cloneServer: (serverId, name) => versioned(`/servers/${encodeURIComponent(serverId)}/clone`, { method: 'POST', body: JSON.stringify({ name }) }),
  listTemplates: () => versioned('/templates'),
  snapshotServer: (serverId, name, description = '') => versioned(`/servers/${encodeURIComponent(serverId)}/snapshot`, { method: 'POST', body: JSON.stringify({ name, description }) }),
  deployTemplate: (templateId, name, resources) => versioned(`/templates/${encodeURIComponent(templateId)}/deploy`, { method: 'POST', body: JSON.stringify({ name, ...resources }) }),
  deleteTemplate: (templateId) => versioned(`/templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' }),
  updateTemplate: (templateId, patch) => versioned(`/templates/${encodeURIComponent(templateId)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  listPublicTemplates: () => versioned('/templates/public'),
  setWorkshop: (serverId, collectionId) => versioned(`/servers/${encodeURIComponent(serverId)}/workshop`, { method: 'POST', body: JSON.stringify({ collection_id: collectionId }) }),
  getWorkshopItems: (serverId, page) => versioned(`/servers/${encodeURIComponent(serverId)}/workshop/items?page=${page}`),
  setWorkshopAddons: (serverId, addonIds) => versioned(`/servers/${encodeURIComponent(serverId)}/workshop/addons`, { method: 'POST', body: JSON.stringify({ addon_ids: addonIds }) }),
  getWorkshopAddons: (serverId) => versioned(`/servers/${encodeURIComponent(serverId)}/workshop/addons`),
};

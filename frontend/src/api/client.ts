import type { Health } from '../domain/mode';
import { apiUrl } from './config';
import type { Server, ServerInput, ServerSettings, TopologyPod, WorkerNode } from '../domain/server';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

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
    const message = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((e: {msg:string}) => e.msg).join(' · ') : '요청을 처리하지 못했습니다. 다시 시도하세요.';
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
  console(id: string, command: string): Promise<{output: string}>;
  register(username: string, password: string, inviteCode?: string): Promise<{id: string; username: string}>;
  login(username: string, password: string): Promise<{token: string; username: string}>;
  me(): Promise<{id: string; username: string; is_admin: boolean}>;
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
  listSchedules(serverId: string): Promise<Schedule[]>;
  createSchedule(serverId: string, s: ScheduleInput): Promise<Schedule>;
  updateSchedule(serverId: string, scheduleId: string, s: ScheduleInput): Promise<Schedule>;
  deleteSchedule(serverId: string, scheduleId: string): Promise<void>;
  serverMetrics(serverId: string, minutes?: number): Promise<ServerMetrics>;
  namespaceMetrics(minutes?: number): Promise<NamespaceMetrics>;
  clusterMetrics(): Promise<ClusterMetrics>;
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
  console: (id, command) => versioned(`/servers/${encodeURIComponent(id)}/console`, {method:'POST', body:JSON.stringify({command})}),
  register: (username, password, inviteCode) => versioned('/auth/register', {
    method: 'POST',
    body: JSON.stringify({username, password}),
    ...(inviteCode ? {headers: {'X-Admin-Secret': inviteCode}} : {}),
  }),
  login: (username, password) => versioned('/auth/login', {method:'POST', body:JSON.stringify({username, password})}),
  me: () => versioned('/auth/me'),
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
  listSchedules: (serverId) => versioned(`/servers/${encodeURIComponent(serverId)}/schedules`),
  createSchedule: (serverId, s) => versioned(`/servers/${encodeURIComponent(serverId)}/schedules`, {method:'POST', body:JSON.stringify(s)}),
  updateSchedule: (serverId, scheduleId, s) => versioned(`/servers/${encodeURIComponent(serverId)}/schedules/${encodeURIComponent(scheduleId)}`, {method:'PUT', body:JSON.stringify(s)}),
  deleteSchedule: (serverId, scheduleId) => versioned(`/servers/${encodeURIComponent(serverId)}/schedules/${encodeURIComponent(scheduleId)}`, {method:'DELETE'}),
  serverMetrics: (serverId, minutes = 60) => versioned(`/metrics/server/${encodeURIComponent(serverId)}?minutes=${minutes}`),
  namespaceMetrics: (minutes = 60) => versioned(`/metrics/namespace?minutes=${minutes}`),
  clusterMetrics: () => versioned('/metrics/cluster'),
};

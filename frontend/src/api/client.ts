import type { Health } from '../domain/mode';
import { apiUrl } from './config';
import type { Server, ServerInput, ServerSettings, WorkerNode } from '../domain/server';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

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
}

const versioned = <T,>(path: string, init?: RequestInit) => request<T>(`/api/v1${path}`, init);

export const api: ServerGateway = {
  health: () => request<Health>('/health'),
  servers: () => versioned('/servers'),
  nodes: () => versioned('/nodes'),
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
};

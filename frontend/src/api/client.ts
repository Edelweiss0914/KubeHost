import type { Server, ServerInput, WorkerNode } from '../domain/server';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(path: string, init?: RequestInit): Promise<T> {
 let response: Response;
 try { response = await fetch(`/api/v1${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); }
 catch { throw new ApiError(0, 'API에 연결할 수 없습니다. 백엔드 실행 상태를 확인하세요.'); }
 if (!response.ok) { const body = await response.json().catch(() => ({})); const message = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((error: {msg:string}) => error.msg).join(' · ') : '요청을 처리하지 못했습니다. 다시 시도하세요.'; throw new ApiError(response.status, message); }
 return response.status === 204 ? undefined as T : response.json();
}
export interface ServerGateway { servers(): Promise<Server[]>; nodes(): Promise<WorkerNode[]>; server(id:string):Promise<Server>; create(input:ServerInput):Promise<Server>; action(id:string, action:'start'|'stop'):Promise<Server>; remove(id:string, deleteData:boolean, confirmation:string):Promise<void> }
export const api: ServerGateway = { servers:()=>request('/servers'), nodes:()=>request('/nodes'), server:id=>request(`/servers/${encodeURIComponent(id)}`), create:input=>request('/servers',{method:'POST',body:JSON.stringify(input)}), action:(id,action)=>request(`/servers/${encodeURIComponent(id)}/${action}`,{method:'POST'}), remove:(id,deleteData,confirmation)=>request(`/servers/${encodeURIComponent(id)}?${new URLSearchParams({delete_data:String(deleteData),confirmation})}`,{method:'DELETE'}) };


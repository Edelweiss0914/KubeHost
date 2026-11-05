import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CreateServer } from './CreateServer';
import { ServerList } from './ServerList';
import { ServerDetail } from './ServerDetail';
import { ClusterMap } from './ClusterMap';
import { defaults, type Server } from '../domain/server';
const server:Server={...defaults,id:'server-1',name:'world',node_id:'worker-01',owner_id:'demo-user',status:'stopped',created_at:'2026-11-01T00:00:00Z',connection:null,resource_plan:{namespace:'tenant-opaque',resources:[],warnings:[]},logs:[]};
describe('console screens',()=>{
 it('gives empty workspaces an actionable first step',()=>{const html=renderToStaticMarkup(<ServerList servers={[]} retained={[]} onSelect={()=>{}} onCreate={()=>{}} onRestore={()=>{}}/>);expect(html).toContain('첫 서버 만들기');expect(html).not.toContain('<table');});
 it('keeps control plane nodes out of deployment choices',()=>{const html=renderToStaticMarkup(<CreateServer nodes={[{id:'cp',name:'control-plane',role:'control-plane',status:'Ready',schedulable:false,cpu_capacity:4,memory_mb_capacity:16384,cpu_requested_m:0,memory_mb_requested:0}]} busy={false} onCreate={async()=>{}} onCancel={()=>{}}/>);expect(html).toContain('사용 가능한 Worker 없음');expect(html).toContain('disabled');expect(html).toContain('aria-describedby');});
 it('shows server identity and navigation in server details',()=>{const html=renderToStaticMarkup(<ServerDetail server={server} busy={false} onAction={()=>{}} onDelete={()=>{}} onBack={()=>{}} />);expect(html).toContain('world');expect(html).toContain('서버 정보');expect(html).toContain('서버 콘솔');});
});

it('shows start/stop/delete actions without mock gating', () => {
 const html=renderToStaticMarkup(<ServerDetail server={server} busy={false} onAction={()=>{}} onDelete={()=>{}} onBack={()=>{}} />);
 expect(html).toContain('시작'); expect(html).toContain('중지'); expect(html).toContain('서버 삭제');
 expect(html).not.toContain('미지원');
 const list=renderToStaticMarkup(<ServerList servers={[]} retained={[]} onSelect={()=>{}} onCreate={()=>{}} onRestore={()=>{}}/>);
 expect(list).toContain('첫 서버 만들기');
});

it('shows pod logs without Minecraft management or RCON controls for Garry\'s Mod', () => {
 const html = renderToStaticMarkup(<ServerDetail server={{...server, game:'garrysmod'}} busy={false} onAction={()=>{}} onDelete={()=>{}} onBack={()=>{}} />);
 expect(html).toContain('파드 로그');
 expect(html).not.toContain('명령어를 입력');
 expect(html).not.toContain('플레이어</button>');
 expect(html).not.toContain('관리</button>');
 expect(html).not.toContain('설정</button>');
});

it('shows node, pod, container and owning game server as a hierarchy', () => {
 const html = renderToStaticMarkup(<ClusterMap
   nodes={[{id:'worker-01',name:'worker-01',role:'worker',status:'Ready',schedulable:true,cpu_capacity:8,memory_mb_capacity:16384,cpu_requested_m:0,memory_mb_requested:0}]}
   servers={[{...server,status:'running'}]}
   pods={[{server_id:server.id,name:'mc-server-1-0',namespace:'tenant-opaque',node_id:'worker-01',phase:'Running',simulated:false,containers:[{name:'minecraft',ready:true,state:'running',restart_count:0}]}]}
   onSelect={()=>{}}/>);
 expect(html).toContain('클러스터 계층형 토폴로지');
 expect(html).toContain('worker-01');
 expect(html).toContain('mc-server-1-0');
 expect(html).toContain('컨테이너 minecraft · 준비됨');
 expect(html).toContain('게임 서버');
 expect(html).toContain('world');
});

it('does not represent a stopped server as a live pod', () => {
 const html = renderToStaticMarkup(<ClusterMap
   nodes={[{id:'worker-01',name:'worker-01',role:'worker',status:'Ready',schedulable:true,cpu_capacity:8,memory_mb_capacity:16384,cpu_requested_m:0,memory_mb_requested:0}]}
   servers={[server]} pods={[]} onSelect={()=>{}}/>);
 expect(html).toContain('파드 없음');
 expect(html).toContain('world · 중지됨');
});

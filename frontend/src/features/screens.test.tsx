import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CreateServer } from './CreateServer';
import { ServerList } from './ServerList';
import { ServerDetail } from './ServerDetail';
import { defaults, type Server } from '../domain/server';
const server:Server={...defaults,id:'server-1',name:'world',node_id:'worker-01',owner_id:'demo-user',status:'stopped',created_at:'2026-11-01T00:00:00Z',connection:null,resource_plan:{namespace:'tenant-opaque',resources:[],warnings:[]},logs:[]};
describe('console screens',()=>{
 it('gives empty workspaces an actionable first step',()=>{const html=renderToStaticMarkup(<ServerList servers={[]} onSelect={()=>{}} onCreate={()=>{}}/>);expect(html).toContain('첫 서버 만들기');expect(html).not.toContain('<table');});
 it('keeps control plane nodes out of deployment choices',()=>{const html=renderToStaticMarkup(<CreateServer nodes={[{id:'cp',name:'control-plane',role:'control-plane',status:'Ready',schedulable:false}]} busy={false} onCreate={async()=>{}} onCancel={()=>{}}/>);expect(html).toContain('사용 가능한 Worker 없음');expect(html).toContain('disabled');expect(html).toContain('aria-describedby');});
 it('shows retained data and unassigned connections in server details',()=>{const html=renderToStaticMarkup(<ServerDetail server={server} busy={false} onAction={()=>{}} onDelete={()=>{}} onBack={()=>{}}/>);expect(html).toContain('Retain');expect(html).toContain('미할당');expect(html).toContain('아직 로그가 없습니다.');expect(html).toContain('<details>');});
});


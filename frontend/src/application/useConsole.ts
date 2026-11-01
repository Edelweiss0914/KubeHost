import { useCallback, useEffect, useState } from 'react';
import { api, type ServerGateway } from '../api/client';
import type { Server, WorkerNode } from '../domain/server';
export function useConsole(gateway: ServerGateway = api) {
 const [servers,setServers]=useState<Server[]>([]); const [nodes,setNodes]=useState<WorkerNode[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{const [s,n]=await Promise.all([gateway.servers(),gateway.nodes()]);setServers(s);setNodes(n);}catch(cause){setError(cause instanceof Error?cause.message:'불러오지 못했습니다.');}finally{setLoading(false);}},[gateway]);
 useEffect(()=>{void refresh();},[refresh]); return {servers,nodes,loading,error,refresh};
}


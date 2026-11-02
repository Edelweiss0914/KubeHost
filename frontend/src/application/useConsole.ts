import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type ServerGateway } from '../api/client';
import { consoleMode, type Health } from '../domain/mode';
import type { Server, WorkerNode } from '../domain/server';

type TenantInfo = { namespace: string; quota: Record<string, { used: string; hard: string }> };

export function useConsole(gateway: ServerGateway = api) {
  const [health, setHealth] = useState<Health | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [retained, setRetained] = useState<Server[]>([]);
  const [nodes, setNodes] = useState<WorkerNode[]>([]);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // health + nodes are public (no auth required)
      const [h, n] = await Promise.all([gateway.health(), gateway.nodes()]);
      setHealth(h);
      setNodes(n);
      // servers + retained + tenant require auth; 401 is expected before login
      try {
        const [s, r, t] = await Promise.all([gateway.servers(), gateway.retained(), gateway.tenant()]);
        setServers(s);
        setRetained(r);
        setTenant(t);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          setServers([]);
          setRetained([]);
          setTenant(null);
        } else {
          throw cause;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { health, mode: consoleMode(health), servers, retained, nodes, tenant, loading, error, refresh };
}

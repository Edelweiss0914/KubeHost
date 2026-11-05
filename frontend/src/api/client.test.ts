import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';
import { defaults } from '../domain/server';
afterEach(()=>vi.unstubAllGlobals());
describe('API boundary',()=>{
 it('serializes server input and uses the backend API only',async()=>{const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'server-1'})));vi.stubGlobal('fetch',fetch);await api.create({...defaults,name:'world'});expect(fetch).toHaveBeenCalledWith('/api/v1/servers',expect.objectContaining({method:'POST',body:JSON.stringify({...defaults,name:'world'})}));});
 it('presents backend validation messages',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:[{msg:'Invalid worker'}]}),{status:422})));await expect(api.nodes()).rejects.toThrow('Invalid worker');});
 it('preserves explicit data retention and confirmation',async()=>{const fetch=vi.fn().mockResolvedValue(new Response(null,{status:204}));vi.stubGlobal('fetch',fetch);await api.remove('server-1',false,'');expect(fetch).toHaveBeenCalledWith('/api/v1/servers/server-1?delete_data=false&confirmation=',expect.objectContaining({method:'DELETE'}));});
 it('turns network failures into actionable errors',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('fetch failed')));await expect(api.servers()).rejects.toBeInstanceOf(ApiError);});
 it('uses the game settings endpoint for non-Minecraft fields',async()=>{
  const settings = {map_name:'gm_construct',gamemode_name:'sandbox'};
  const fetch = vi.fn()
   .mockResolvedValueOnce(new Response(JSON.stringify(settings)))
   .mockResolvedValueOnce(new Response(null,{status:204}));
  vi.stubGlobal('fetch',fetch);
  expect(await api.getGameSettings('gmod-1')).toEqual(settings);
  await api.updateGameSettings('gmod-1',settings);
  expect(fetch).toHaveBeenNthCalledWith(2,'/api/v1/servers/gmod-1/game-settings',expect.objectContaining({method:'PUT',body:JSON.stringify(settings)}));
 });
});

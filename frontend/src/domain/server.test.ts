import { describe, expect, it } from 'vitest';
import { defaults, validate } from './server';
describe('server creation validation',()=>{
 const valid={...defaults,name:'survival-world',node_id:'kubehost-worker-01'};
 it('accepts the pinned default configuration',()=>expect(validate(valid)).toEqual({}));
 it('rejects invalid names and unavailable placement',()=>{expect(validate({...valid,name:'../BAD',node_id:''})).toMatchObject({name:expect.any(String),node_id:expect.any(String)});});
 it('rejects resource bounds, fractions and non-finite values',()=>{expect(validate({...valid,cpu:Infinity,memory_mb:1023,storage_gb:1.5})).toMatchObject({cpu:expect.any(String),memory_mb:expect.any(String),storage_gb:expect.any(String)});});
});
it('accepts backend-compatible display names and storage boundaries',()=>{
 expect(validate({...defaults,name:'My World_1',node_id:'worker',storage_gb:5})).toEqual({});
 expect(validate({...defaults,name:'My World_1',node_id:'worker',storage_gb:100})).toEqual({});
 expect(validate({...defaults,name:'world',node_id:'worker',storage_gb:4})).toHaveProperty('storage_gb');
 expect(validate({...defaults,name:'world',node_id:'worker',storage_gb:101})).toHaveProperty('storage_gb');
});


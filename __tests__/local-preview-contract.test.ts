// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, PUT, PATCH, DELETE } from '../tools/local-preview/app/api/[...path]/route'
import { normalizeSourceCoverage } from '@/lib/observation-coverage'
import { semanticStatusHold } from '@/lib/semantic-hold'

const read = (path: string, scenario = 'empty') => GET(new NextRequest(`http://127.0.0.1:3210/api/${path}`, {headers:{cookie:`preview_scenario=${scenario}`}}), {params:Promise.resolve({path:path.split('/')})})
describe('isolated preview contract boundary', () => {
  it('serves the real no-workload hold contract, not fake empty coverage', async () => {
    const body = await (await read('proxy/coverage/sources')).json()
    expect(semanticStatusHold(body)).not.toBeNull()
    expect(body.hold_reason).toBe('NO_DATA_ACCOUNTS')
    expect(normalizeSourceCoverage(body)).toBeNull()
  })
  it('serves published test coverage that the actual product parser accepts', async () => {
    const body = await (await read('proxy/coverage/sources','connected')).json()
    expect(normalizeSourceCoverage(body)?.status).toBe('PUBLISHED')
    expect(body.accounts).toHaveLength(1)
  })
  it.each(['forbidden','unavailable'] as const)('preserves %s status',async scenario=>{
    expect((await read('proxy/coverage/sources',scenario)).status).toBe(scenario==='forbidden'?403:503)
  })
  it('keeps malformed input distinguishable from hold and published data',async()=>{
    const body=await(await read('proxy/coverage/sources','malformed')).json()
    expect(normalizeSourceCoverage(body)).toBeNull()
    expect(semanticStatusHold(body)).toBeNull()
  })
  it('does not proxy unspecified routes',async()=>{
    const response=await read('proxy/unimplemented');expect(response.status).toBe(503)
    expect((await response.json()).detail.code).toBe('PREVIEW_ROUTE_NOT_FIXTURED')
  })
  it.each([POST,PUT,PATCH,DELETE])('blocks API mutation method %#',async method=>{
    const response=method();expect(response.status).toBe(405)
    expect((await response.json()).detail.code).toBe('PREVIEW_WRITE_BLOCKED')
  })
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NextRequest } from 'next/server'
import { GET, POST, PUT, PATCH, DELETE } from '../tools/local-preview/app/api/[...path]/route'
import { replay, requestKey, validateCapture, type CaptureSet } from '../tools/local-preview/captures'

describe('captured-only preview boundary', () => {
  it('refuses missing captures instead of rendering fabricated data', () => {
    expect(replay(null,new URL('http://localhost/api/proxy/admin/accounts')).status).toBe(503)
  })
  it('preserves a recorded refusal and does not widen its account scope', () => {
    const reply = {status:403,body:{detail:{code:'CLAIM_OUTSIDE_SERVER_SCOPE'}}}
    const captures: CaptureSet = {capturedAt:'2026-10-03T08:32:52Z',sourceOrigin:'https://app.local-test.cyntro.io',frontendCommit:'9926a8be6bb7a0a01236f61f996721fbf5f09af0',backendCommit:'1766fe3f176a72a784505433598345ac65549ba4',responses:{'/api/proxy/admin/accounts?customer_id=localtest':reply}}
    expect(validateCapture(captures)).toBe(captures)
    expect(validateCapture({...captures,frontendCommit:'unknown'})).toBeNull()
    expect(validateCapture({...captures,responses:{'/api/proxy/admin/accounts':{status:0,body:null}}})).toBeNull()
    expect(replay(captures,new URL('http://localhost/api/proxy/admin/accounts?customer_id=localtest'))).toBe(reply)
    expect(replay(captures,new URL('http://localhost/api/proxy/admin/accounts?customer_id=other')).status).toBe(503)
    expect(replay(captures,new URL('http://localhost/api/proxy/admin/accounts?customer_id=localtest&account_id=other')).status).toBe(503)
  })
  it('canonicalizes query order while retaining every scope parameter', () => {
    expect(requestKey(new URL('http://localhost/api/proxy/x?region=b&customer_id=a'))).toBe('/api/proxy/x?customer_id=a&region=b')
  })
  it('rejects absent provenance, invalid status and empty captures', () => {
    expect(validateCapture({responses:{}})).toBeNull()
    expect(validateCapture(null)).toBeNull()
  })
  it('actual GET does not forward an uncaptured request', async()=>{
    const response=await GET(new NextRequest('http://127.0.0.1:3210/api/proxy/unimplemented'))
    expect(response.status).toBe(503)
    expect((await response.json()).detail.code).toBe('PREVIEW_CAPTURE_UNAVAILABLE')
  })
  it.each([POST,PUT,PATCH,DELETE])('blocks API mutation method %#',async method=>{
    const response=method();expect(response.status).toBe(405)
    expect((await response.json()).detail.code).toBe('PREVIEW_WRITE_BLOCKED')
  })
})

 it('imports only same-origin GET bodies and strips authentication material', async()=>{
   const root=await mkdtemp(path.join(tmpdir(),'cyntro-preview-import-'))
   try {
     await mkdir(path.join(root,'scripts'))
     const script=path.join(root,'scripts/import-preview-har.mjs')
     await copyFile(path.resolve('scripts/import-preview-har.mjs'),script)
     const entry={startedDateTime:'2026-10-03T08:32:52Z',request:{method:'GET',url:'https://app.local-test.cyntro.io/api/proxy/admin/accounts?customer_id=localtest',headers:[{name:'Authorization',value:'DO_NOT_COPY_AUTH'}]},response:{status:403,headers:[{name:'Set-Cookie',value:'DO_NOT_COPY_COOKIE'}],content:{mimeType:'application/json',text:JSON.stringify({detail:{code:'CLAIM_OUTSIDE_SERVER_SCOPE'}})}}}
     const har=path.join(root,'input.har')
     await writeFile(har,JSON.stringify({log:{entries:[entry,{...entry,request:{...entry.request,method:'POST'}},{...entry,request:{...entry.request,url:'https://different.invalid/api/proxy/accounts'}}]}}))
     execFileSync(process.execPath,[script,har,'9926a8be6bb7a0a01236f61f996721fbf5f09af0','1766fe3f176a72a784505433598345ac65549ba4','https://app.local-test.cyntro.io'])
     const raw=await readFile(path.join(root,'tools/local-preview/.local/responses.json'),'utf8')
     expect(raw).not.toContain('DO_NOT_COPY')
     const captured=validateCapture(JSON.parse(raw))
     expect(captured).not.toBeNull()
     expect(Object.keys(captured!.responses)).toHaveLength(1)
     expect(captured!.responses['/api/proxy/admin/accounts?customer_id=localtest'].status).toBe(403)
   } finally {await rm(root,{recursive:true,force:true})}
 })

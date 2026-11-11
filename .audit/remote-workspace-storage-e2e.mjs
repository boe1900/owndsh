/**
 * [INPUT]: 依赖当前 view-bootstrap 源码、真实 Chrome 的多页 Storage 与 storage event。
 * [OUTPUT]: 验证本机与两个远端的同名草稿、属性、枚举、清理、刷新和跨页事件隔离，并输出无密证据。
 * [POS]: .audit 的浏览器存储接缝验收，独立于 Harness 业务链路。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { build } from '../plugin/node_modules/esbuild/lib/main.js'
import { chromium } from '/tmp/owndsh-remote-native-proof/node_modules/playwright/index.mjs'
const compiled=await build({entryPoints:['plugin/packages/bundle/src/remote/view-bootstrap.ts'],bundle:true,write:false,platform:'browser',format:'esm'})
const { remoteViewBootstrapScript }=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const view=authority=>({viewId:'12345678-1234-4234-8234-123456789012',deviceId:'3',name:'<script>window.injected=true</script>',authority,localUrl:'/',stateUrl:'/state',reconnectUrl:'/reconnect'})
const server=createServer((req,res)=>{
 const authority=req.url.startsWith('/a')?'host-a':req.url.startsWith('/b')?'host-b':null
 res.writeHead(200,{'content-type':'text/html'})
 res.end(`<html><head>${authority?`<script>${remoteViewBootstrapScript(view(authority))}</script>`:''}</head><body><script>window.events=[];addEventListener('storage',e=>events.push({key:e.key,oldValue:e.oldValue,newValue:e.newValue,ownArea:e.storageArea===localStorage}));</script></body></html>`)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
const checks=[]
try{
 const context=await browser.newContext()
 const local=await context.newPage(),a=await context.newPage(),a2=await context.newPage(),b=await context.newPage()
 await local.goto(origin+'/local');await a.goto(origin+'/a');await a2.goto(origin+'/a2');await b.goto(origin+'/b')
 await local.evaluate(()=>{localStorage.setItem('draft:same-id','local');sessionStorage.setItem('session:same-id','local')})
 await a.evaluate(()=>{localStorage.setItem('draft:same-id','a');sessionStorage.setItem('session:same-id','a')})
 await b.evaluate(()=>{localStorage.setItem('draft:same-id','b');sessionStorage.setItem('session:same-id','b')})
 for(const [page,value]of[[local,'local'],[a,'a'],[b,'b']])assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('draft:same-id'),sessionStorage.getItem('session:same-id')]),[value,value])
 assert.equal(await a2.evaluate(()=>localStorage.getItem('draft:same-id')),'a')
 checks.push('same-key-local-and-two-remotes-isolated')
 assert.equal(await a.evaluate(()=>window.injected),undefined)
 assert.equal(await a.evaluate(()=>window.__OWNDSH_REMOTE_VIEW__.name),view('host-a').name)
 checks.push('metadata-name-cannot-inject-script')
 await a.evaluate(()=>{localStorage.property='property-value';Object.defineProperty(localStorage,'defined',{value:'defined-value',enumerable:true,configurable:true});sessionStorage.property='session-property'})
 assert.deepEqual(await a.evaluate(()=>({keys:Object.keys(localStorage).sort(),length:localStorage.length,property:localStorage.property,defined:localStorage.defined})),{keys:['defined','draft:same-id','property'],length:3,property:'property-value',defined:'defined-value'})
 assert.ok(['defined','draft:same-id','property'].includes(await a.evaluate(()=>localStorage.key(0))))
 assert.equal(await b.evaluate(()=>localStorage.property),undefined)
 await a.evaluate(()=>{delete localStorage.property;localStorage.removeItem('defined')})
 assert.equal(await a.evaluate(()=>localStorage.length),1)
 checks.push('property-enumeration-length-and-deletion')
 await a2.waitForFunction(()=>events.some(e=>e.key==='draft:same-id'&&e.newValue==='a'&&e.ownArea))
 assert.equal(await b.evaluate(()=>events.some(e=>e.newValue==='a')),false)
 checks.push('cross-tab-logical-storage-events-filtered')
 await a.reload()
 assert.equal(await a.evaluate(()=>localStorage.getItem('draft:same-id')),'a')
 assert.equal(await a.evaluate(()=>sessionStorage.getItem('session:same-id')),'a')
 checks.push('remote-reload-retains-local-and-session-storage')
 await a.evaluate(()=>{localStorage.clear();sessionStorage.clear()})
 assert.equal(await a.evaluate(()=>localStorage.length+sessionStorage.length),0)
 assert.equal(await local.evaluate(()=>localStorage.getItem('draft:same-id')),'local')
 assert.equal(await b.evaluate(()=>localStorage.getItem('draft:same-id')),'b')
 await a2.waitForFunction(()=>events.some(e=>e.key==='draft:same-id'&&e.newValue===null&&e.ownArea))
 checks.push('clear-only-current-authority-and-delivers-logical-removals')
 await writeFile('.audit/remote-workspace-storage-evidence.json',JSON.stringify({date:new Date().toISOString(),result:'passed',checks},null,2)+'\n')
 console.log(JSON.stringify({result:'passed',checks}))
}finally{await browser.close();await new Promise(r=>server.close(r))}

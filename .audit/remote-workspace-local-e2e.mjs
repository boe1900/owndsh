/**
 * [INPUT]: 依赖隔离 Server/Redis、标准 npm rc.5 Harness、本轮插件 tgz 与独立 Chromium；临时环境配置仅从未跟踪的 env.json 读取。
 * [OUTPUT]: 验证员工登录、显式 Host 开关、本人设备目录、加密链路与原生远端页面，输出无凭据验收记录。
 * [POS]: .audit 的真实双 Harness 业务联调入口，不触碰日常 profile 或正式服务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
const work = resolve('.tmp/remote-workspace')
const config = JSON.parse(await readFile(join(work,'env.json'),'utf8'))
const origin = config.origin
const runtime = process.env.OWNDSH_E2E_RUNTIME ?? '/tmp/owndsh-remote-native-proof'
const { chromium } = await import(pathToFileURL(join(runtime,'node_modules/playwright/index.mjs')))
const run = join(work,`run-${Date.now()}`)
await mkdir(run,{recursive:true})
const password = randomBytes(18).toString('base64url')+'Aa1!'
const checks=[], failures=[], http=[]
const profiles=[]
let browser, fixture, fixtureCalls=0, stage='admin-login'
const redact = value => String(value).replace(/([?&](?:token|code|state|transaction_id)=)[^\s&"<>]+/g,'$1[redacted]')
const record = name => { checks.push(name); console.log(`PASS ${name}`) }
async function signIn(page, username, currentPassword) {
 const captchaPromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/code')
 await page.getByLabel('用户名',{exact:true}).fill(username)
 await page.getByLabel('密码',{exact:true}).fill(currentPassword)
 const captcha=(await(await captchaPromise).json()).data
 if(captcha.captchaEnabled){
  const raw=execFileSync('docker',['exec',config.redis,'sh','-ec','export REDISCLI_AUTH="$REDIS_PASSWORD"; exec redis-cli --raw GET "$1"','redis-cli',`global:captcha_codes:${captcha.uuid}`],{encoding:'utf8'}).trim()
  await page.getByLabel('验证码',{exact:true}).fill(String(JSON.parse(raw)))
 }
 const response=page.waitForResponse(r=>r.url()===`${origin}/enterprise/auth/v1/password`)
 await page.getByRole('button',{name:'登录',exact:true}).click()
 const status=(await response).status()
 if(status===409){
  await page.getByLabel('新密码',{exact:true}).fill(password)
  await page.getByLabel('确认新密码',{exact:true}).fill(password)
  await page.getByRole('button',{name:'设置密码并登录',exact:true}).click()
 } else assert.equal(status,200,`Password login status ${status} (${JSON.stringify(await (await response).json())})`)
 return status === 409
}
async function local(page,path,body){
 return page.evaluate(async({path,body})=>{const r=await fetch(path,{...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,json:await r.json()}},{path,body})
}
async function until(fn,label,timeout=30000){
 const deadline=Date.now()+timeout
 while(Date.now()<deadline){const result=await fn();if(result)return result;await delay(100)}
 throw new Error(`Timeout ${label}`)
}
async function startProfile(name){
 const home=join(run,name),cwd=join(home,'workspace'),authFile=join(home,'authorize-url')
 await mkdir(cwd,{recursive:true});await mkdir(join(home,'opener'),{recursive:true})
 await writeFile(join(cwd,`${name}-only.txt`),`${name} workspace marker\n`)
 await writeFile(join(cwd,'large.txt'),'远端 UTF-8 大文件\n'.repeat(10000))
 await writeFile(join(home,'outside.txt'),'private outside workspace')
 await symlink(join(home,'outside.txt'),join(cwd,'escape.txt'))
 await writeFile(join(cwd,'outside.txt'),'inside decoy')
 await symlink(cwd,join(cwd,'up'))
 await mkdir(join(cwd,'nested'))
 await writeFile(join(cwd,'nested','outside.txt'),'base-file decoy')
 await symlink(cwd,join(cwd,'nested','alias'))
 execFileSync(process.execPath,[join(runtime,'node_modules/@deepseek-ai/dsh/lib/bin.js'),'plugin','--profile','web','add','--ignore-scripts',resolve('artifacts/owndsh-plugin-0.1.0-beta.20.tgz')],{env:{...process.env,DSH_HOME:home},stdio:'ignore'})
 await writeFile(join(home,'settings.yaml'),`owndsh:\n  baseUrl: ${origin}\n`)
 await writeFile(join(home,'profiles/web/cordis.patch.yml'),'- id: session-title-llm\n  disabled: true\n')
 for(const opener of ['open','xdg-open'])await writeFile(join(home,'opener',opener),'#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.OWNDSH_AUTH_URL_FILE,process.argv.at(-1),{mode:0o600})\n',{mode:0o700})
 const installed=join(home,'profiles/web/node_modules/owndsh-plugin')
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
 assert.equal(hash(await readFile(join(installed,'lib/index.js'))),hash(await readFile('plugin/packages/bundle/lib/index.js')))
 const child=spawn(process.execPath,[join(runtime,'node_modules/@deepseek-ai/dsh/lib/bin.js'),'--profile','web','--port','0','--no-open'],{cwd,env:{...process.env,DSH_HOME:home,SSH_TTY:'owndsh-isolated-e2e',PATH:`${join(home,'opener')}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,OWNDSH_AUTH_URL_FILE:authFile},stdio:['pipe','pipe','pipe']})
 const profile={name,home,cwd,authFile,child,output:''};profiles.push(profile)
 const launch=await new Promise((resolvePromise,reject)=>{
  const timer=setTimeout(()=>reject(new Error(`Harness startup ${name}: ${redact(profile.output.slice(-4000))}`)),90000)
  child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Harness ${name} exited ${code}: ${redact(profile.output.slice(-4000))}`))})
  const inspect=chunk=>{profile.output+=chunk;const url=profile.output.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)?.[1];if(url){clearTimeout(timer);resolvePromise(url)}}
  child.stdout.on('data',inspect);child.stderr.on('data',inspect)
 })
 const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:960}})
 const page=await context.newPage()
 await page.addInitScript(() => {
  const NativeWebSocket = window.WebSocket
  window.__remoteTestSockets = []
  window.WebSocket = class extends NativeWebSocket {
   constructor(...args) { super(...args); window.__remoteTestSockets.push(this) }
  }
 })
 page.on('pageerror',error=>failures.push({profile:name,error:redact(error.message)}))
 page.on('response',r=>{const u=new URL(r.url());if(u.pathname.includes('/enterprise/')||r.status()>=400)http.push({profile:name,path:u.pathname,status:r.status()})})
 await page.goto(launch)
 const continuation=page.getByText(/^(继续|Continue)$/,{exact:true}).first()
 await continuation.waitFor({state:'visible',timeout:1500}).then(()=>continuation.click()).catch(()=>{})
 profile.page=page;profile.context=context
 return profile
}
async function loginProfile(profile,username,initial){
 const {page,authFile,context}=profile
 const gate=page.getByRole('dialog',{name:'OwnDsh',exact:true})
 await gate.getByRole('button',{name:'登录企业账号',exact:true}).click()
 const url=await until(async()=>readFile(authFile,'utf8').catch(()=>''),'authorization opener')
 await rm(authFile,{force:true})
 const auth=await context.newPage()
 const login=signIn(auth,username,initial)
 await auth.goto(url);await login
 await auth.getByRole('heading',{name:'网页授权已完成'}).waitFor()
 await until(async()=>(await local(page,'/enterprise/api/v1/local/status')).json.data.state==='READY','profile READY')
 await gate.waitFor({state:'hidden'});await auth.close()
}
async function native(page,prefix,endpoint,args){
 const result=await local(page,`${prefix}api/${endpoint}`,{type:'client-request',rpcId:randomUUID(),method:endpoint,payload:{args}})
 assert.equal(result.status,200,`${endpoint} HTTP ${result.status}`)
 assert.equal(result.json.result?.ok,true,`${endpoint}: ${JSON.stringify(result.json)}`)
 return result.json.result.value
}
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
 const adminContext=await browser.newContext({locale:'zh-CN'})
 const admin=await adminContext.newPage();const adminLogin=signIn(admin,'admin',config.adminPassword)
 await admin.goto(`${origin}/login`);const adminChanged=await adminLogin
 await admin.waitForURL(u=>u.pathname==='/')
 const savedSession=await adminContext.request.get(`${origin}/enterprise/auth/v1/session`)
 assert.equal(savedSession.status(),200)
 if(adminChanged)await writeFile(join(work,'env.json'),JSON.stringify({...config,adminPassword:password}),{mode:0o600})
 const username=`remote${Date.now().toString(36)}`
 const response=await adminContext.request.post(`${origin}/enterprise/admin/v1/members`,{headers:{'Idempotency-Key':randomUUID(),Origin:origin},data:{username,displayName:'远程联调员工',initialPassword:password+'B'}})
 assert.equal(response.status(),201)
 const member=(await response.json()).data.member
 record('create-real-employee')
 stage='local-model-protocol-fixture'
 fixture=createServer(async(request,response)=>{
  if(request.method==='GET'){response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({data:[{id:'remote-e2e-model',object:'model',owned_by:'local-test-fixture'}]}));return}
  const chunks=[];for await(const chunk of request)chunks.push(chunk)
  const input=JSON.parse(Buffer.concat(chunks).toString())
  fixtureCalls++
  const content='REMOTE_MODEL_STREAM_VERIFIED'
  if(!input.stream){response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({id:'local-test',object:'chat.completion',model:input.model,choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}));return}
  response.writeHead(200,{'content-type':'text/event-stream'})
  for(const value of [
   {choices:[{index:0,delta:{role:'assistant',content}}]},
   {choices:[{index:0,delta:{},finish_reason:'stop'}]},
   {choices:[],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}},
  ])response.write(`data: ${JSON.stringify({id:'local-test',object:'chat.completion.chunk',model:input.model,created:Math.floor(Date.now()/1000),...value})}\n\n`)
  response.end('data: [DONE]\n\n')
 })
 await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve))
 const fixturePort=fixture.address().port
 const fixtureName=`remote-e2e-${Date.now()}`
 const onboard=await adminContext.request.post(`${origin}/enterprise/admin/v1/model-onboardings`,{headers:{'Idempotency-Key':randomUUID(),Origin:origin},data:{provider:{name:fixtureName},connection:{name:fixtureName,apiProtocol:'openai-completions',baseUrl:`http://127.0.0.1:${fixturePort}/v1`,credential:randomBytes(24).toString('base64url'),connectTimeoutMs:5000,readTimeoutMs:30000},models:[{modelId:fixtureName,name:fixtureName,contextWindow:32000,maxTokens:2048,input:['text'],sortOrder:0}]}})
 const onboardBody=await onboard.json()
 assert.equal(onboard.status(),201,`Model onboarding ${onboard.status()}: ${JSON.stringify(onboardBody.error)}`)
 const model=onboardBody.data.models[0]
 const grant=await adminContext.request.post(`${origin}/enterprise/admin/v1/model-grants`,{headers:{'Idempotency-Key':randomUUID(),Origin:origin},data:{resourceType:'MODEL',resourceId:model.id,subjectType:'MEMBER',subjectIds:[member.id],status:'ACTIVE'}})
 assert.equal(grant.status(),201)
 record('explicit-local-model-protocol-fixture-through-real-server')
 stage='start-profiles'
 const controller=await startProfile('controller');const host=await startProfile('host')
 stage='employee-pkce-login'
 await loginProfile(controller,username,password+'B');await loginProfile(host,username,password)
 record('two-isolated-harness-employee-login')
 assert.equal((await local(host.page,'/enterprise/api/v1/local/remote/status')).json.data.enabled,false)
 record('host-default-disabled')
 stage='seed-native-workspaces'
 const hostWorkspace=await native(host.page,'/','workspace/create',{request:{path:host.cwd}})
 const localWorkspace=await native(controller.page,'/','workspace/create',{request:{path:controller.cwd}})
 await native(host.page,'/','session/create',{request:{workspaceId:hostWorkspace.workspace.workspaceId}})
 const localSeed=await native(controller.page,'/','session/create',{request:{workspaceId:localWorkspace.workspace.workspaceId}})
 stage='enable-host'
 await host.page.getByRole('button',{name:'账号菜单：远程联调员工',exact:true}).click()
 await host.page.getByRole('menuitem',{name:'远程工作区',exact:true}).click()
 const dialog=host.page.getByRole('dialog',{name:'远程工作区',exact:true})
 await dialog.getByRole('button',{name:'开启',exact:true}).click()
 await host.page.getByRole('dialog',{name:'允许远程访问本机？',exact:true}).getByRole('button',{name:'允许访问',exact:true}).click()
 await until(async()=>(await local(host.page,'/enterprise/api/v1/local/remote/status')).json.data.enabled,'host enabled')
 await dialog.getByRole('button',{name:'取消',exact:true}).click()
 record('explicit-host-enable-confirmation')
 stage='discover-and-open'
 await controller.page.evaluate(()=>localStorage.setItem('remote-e2e-draft','local-draft'))
 const device=await until(async()=>{const r=await local(controller.page,'/enterprise/api/v1/local/remote/devices');return r.json.data?.items?.find(d=>d.online&&d.remoteEnabled)},'host presence')
 await controller.page.getByRole('button',{name:'账号菜单：远程联调员工',exact:true}).click()
 await controller.page.getByRole('menuitem',{name:'远程工作区',exact:true}).click()
 await controller.page.getByRole('button',{name:`打开 ${device.name} 的远程工作区`,exact:true}).click()
 await controller.page.waitForURL(u=>/^\/enterprise\/remote\/views\/[a-f0-9-]+\/$/.test(u.pathname))
 let viewPath=new URL(controller.page.url()).pathname
 await controller.page.getByRole('button',{name:'返回本机',exact:true}).first().waitFor()
 await until(async()=>await controller.page.locator('[data-remote-workspace] [data-connected="true"]').count()>0,'remote connected')
 await controller.page.screenshot({path:join(run,'remote-connected.png'),fullPage:true})
 record('encrypted-link-native-remote-page')
 stage='remote-native-session'
 const created=await native(controller.page,viewPath,'session/create',{request:{workspaceId:hostWorkspace.workspace.workspaceId}})
 await native(controller.page,viewPath,'session/rename',{request:{sessionId:created.sessionId,title:'远端真实会话'}})
 const listing=await native(controller.page,viewPath,'session/list',{_request:{}})
 assert.ok(JSON.stringify(listing).includes('远端真实会话'))
 const localListing=await native(controller.page,'/','session/list',{_request:{}})
 assert.ok(!JSON.stringify(localListing).includes('远端真实会话'))
 const catalog=await native(controller.page,viewPath,'session/modelCatalog',{})
 const group=catalog.groups.find(group=>group.models.some(item=>item.id===model.alias))
 assert.ok(group,'Managed fixture model available on remote Host')
 await native(controller.page,viewPath,'session/selectModel',{request:{sessionId:created.sessionId,provider:group.id,model:model.alias}})
 await native(controller.page,viewPath,'session/prompt',{request:{sessionId:created.sessionId,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:'Remote protocol fixture verification'}]}})
 await controller.page.getByText('远端真实会话',{exact:true}).first().click()
 await controller.page.getByText('REMOTE_MODEL_STREAM_VERIFIED',{exact:true}).first().waitFor()
 assert.ok(fixtureCalls>0)
 await controller.page.locator('[contenteditable="true"]').first().waitFor()
 await until(async()=>await controller.page.locator('[data-remote-workspace] [data-connected="true"]').count()>0,'native session stays connected')
 await controller.page.screenshot({path:join(run,'remote-session.png'),fullPage:true})
 record('remote-session-mutation-isolated-from-local')
 record('native-remote-prompt-and-stream-via-local-provider-fixture')
 stage='remote-files'
 const file=await native(controller.page,viewPath,'workspaceFiles/read',{workspaceFileScopeId:created.sessionId,path:'host-only.txt',range:{}})
 assert.ok(JSON.stringify(file).includes('host workspace marker'))
 const large=await controller.page.evaluate(async({prefix,args})=>{
  const r=await fetch(`${prefix}api/workspaceFiles/readBytes`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:'workspaceFiles/readBytes',payload:{args}})})
  return {status:r.status,contentType:r.headers.get('content-type'),text:await r.text()}
 },{prefix:viewPath,args:{workspaceFileScopeId:created.sessionId,path:'large.txt',options:{}}})
 assert.equal(large.status,200);assert.ok(large.text.length>65536);assert.ok(large.contentType.includes('multipart'))
 const media=await controller.page.evaluate(async path=>{const r=await fetch(path);return {status:r.status,text:await r.text()}},`${viewPath}api/file?path=${encodeURIComponent(join(host.cwd,'host-only.txt'))}`)
 assert.equal(media.status,200);assert.equal(media.text,'host workspace marker\n')
 const mediaHash=await controller.page.evaluate(async path=>{
  const r=await fetch(path),bytes=await r.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes)
  return {status:r.status,size:bytes.byteLength,sha256:Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')}
 },`${viewPath}api/file?path=${encodeURIComponent(join(host.cwd,'large.txt'))}`)
 assert.equal(mediaHash.status,200);assert.ok(mediaHash.size>65536)
 assert.equal(mediaHash.sha256,createHash('sha256').update(await readFile(join(host.cwd,'large.txt'))).digest('hex'))
 for(const path of ['../outside.txt','escape.txt','up/../outside.txt']){
  const denied=await local(controller.page,`${viewPath}api/workspaceFiles/read`,{type:'client-request',rpcId:randomUUID(),method:'workspaceFiles/read',payload:{args:{workspaceFileScopeId:created.sessionId,path,range:{}}}})
  assert.equal(denied.status,503)
 }
 const baseDenied=await local(controller.page,`${viewPath}api/workspaceFiles/readBytes`,{type:'client-request',rpcId:randomUUID(),method:'workspaceFiles/readBytes',payload:{args:{workspaceFileScopeId:created.sessionId,path:'../outside.txt',options:{baseFile:'nested/alias/host-only.txt'}}}})
 assert.equal(baseDenied.status,503)
 record('remote-files-and-over-64k-response')
 stage='remote-terminal'
 const environment=await native(controller.page,viewPath,'terminal/environment',{agentId:created.sessionId})
 assert.equal(environment.cwd,host.cwd)
 await native(controller.page,viewPath,'terminal/create',{agentId:created.sessionId,request:{id:'e2e-terminal',cols:80,rows:24}})
 const terminal=await controller.page.evaluate(({sessionId,cwd})=>new Promise((resolve,reject)=>{
  const socket=window.__remoteTestSockets.find(value=>value.url.includes('/enterprise/remote/views/')&&value.readyState===WebSocket.OPEN)
  if(!socket){reject(new Error('Native remote mux unavailable'));return}
  const streamId=`e2e-terminal-${crypto.randomUUID()}`
  let output='',ack=false,sent=false
  const finish=error=>{clearTimeout(timer);socket.removeEventListener('message',onMessage);socket.send(JSON.stringify({type:'cancel',streamId}));error?reject(error):resolve({ack,remoteCwd:output.includes(cwd)})}
  const onMessage=event=>{
   const frame=JSON.parse(event.data);if(frame.streamId!==streamId)return
   if(frame.type==='error'){finish(new Error(`Terminal attach ${frame.error.code}`));return}
   if(frame.type!=='item')return
   if(frame.value.type==='snapshot'&&!sent){
    if(frame.value.info.cwd!==cwd||!frame.value.writable){finish(new Error('Terminal snapshot environment mismatch'));return}
    sent=true
    socket.send(JSON.stringify({type:'item',streamId,value:{type:'write',sequence:1,data:"printf 'REMOTE_%s\\n' 'TERMINAL_PROOF'; pwd; printf 'remote-terminal-write' > terminal-proof.txt\n"}}))
   }
   if(frame.value.type==='ack')ack=true
   if(frame.value.type==='output')output+=frame.value.data
   if(ack&&output.includes('REMOTE_TERMINAL_PROOF')&&output.includes(cwd))finish()
  }
  const timer=setTimeout(()=>finish(new Error('Terminal input/output timeout')),15000)
  socket.addEventListener('message',onMessage)
  socket.send(JSON.stringify({type:'open',streamId,endpoint:'terminal/attach',payload:{args:{agentId:sessionId,id:'e2e-terminal'}}}))
 }),{sessionId:created.sessionId,cwd:host.cwd})
 assert.deepEqual(terminal,{ack:true,remoteCwd:true})
 await until(async()=>await readFile(join(host.cwd,'terminal-proof.txt'),'utf8').catch(()=>'')==='remote-terminal-write','terminal remote side effect')
 assert.equal(await readFile(join(controller.cwd,'terminal-proof.txt'),'utf8').catch(()=>null),null)
 await native(controller.page,viewPath,'terminal/close',{agentId:created.sessionId,id:'e2e-terminal'})
 record('remote-terminal-input-output-only-on-host')
 stage='remote-refresh'
 await controller.page.evaluate(()=>{if(localStorage.getItem('remote-e2e-draft')!==null)throw new Error('Local draft leaked');localStorage.setItem('remote-e2e-draft','remote-draft')})
 const beforeRefresh=viewPath
 await controller.page.reload()
 await controller.page.waitForURL(u=>u.pathname!==beforeRefresh&&u.pathname.startsWith('/enterprise/remote/views/'))
 viewPath=new URL(controller.page.url()).pathname
 await until(async()=>await controller.page.locator('[data-remote-workspace] [data-connected="true"]').count()>0,'refreshed remote connected')
 assert.equal(await controller.page.evaluate(()=>localStorage.getItem('remote-e2e-draft')),'remote-draft')
 const stale=await local(controller.page,`${beforeRefresh}api/session/list`,{type:'client-request',rpcId:randomUUID(),method:'session/list',payload:{args:{_request:{}}}})
 assert.equal(stale.status,404)
 record('refresh-new-view-rejects-old-url-and-preserves-remote-draft')
 stage='disconnect'
 await local(host.page,'/enterprise/api/v1/local/remote/enabled',{enabled:false})
 await until(async()=>await controller.page.locator('[data-remote-blocked]').count()>0,'disconnect barrier',25000)
 for(const sessionId of [created.sessionId,localSeed.sessionId]){
  const unavailable=await local(controller.page,`${viewPath}api/session/rename`,{type:'client-request',rpcId:randomUUID(),method:'session/rename',payload:{args:{request:{sessionId,title:'must-not-run'}}}})
  assert.equal(unavailable.status,503)
 }
 const unchanged=await native(host.page,'/','session/list',{_request:{}})
 assert.ok(!JSON.stringify(unchanged).includes('must-not-run'))
 assert.ok(!JSON.stringify(await native(controller.page,'/','session/list',{_request:{}})).includes('must-not-run'))
 record('disconnect-blocks-and-never-falls-back-local')
 await controller.page.screenshot({path:join(run,'remote-disconnected.png'),fullPage:true})
 stage='disconnected-refresh-and-retry'
 await controller.page.reload()
 assert.equal(new URL(controller.page.url()).pathname,viewPath)
 await controller.page.getByRole('button',{name:'重新连接',exact:true}).waitFor()
 assert.equal(await controller.page.locator('[data-remote-blocked]').count(),1)
 const retry=controller.page.getByRole('button',{name:'重新连接',exact:true})
 await retry.click()
 await until(async()=>await retry.isEnabled(),'failed reconnect is retryable')
 assert.equal(new URL(controller.page.url()).pathname,viewPath)
 assert.equal(await controller.page.locator('[data-remote-blocked]').count(),1)
 await local(host.page,'/enterprise/api/v1/local/remote/enabled',{enabled:true})
 await until(async()=>{const r=await local(controller.page,'/enterprise/api/v1/local/remote/devices');return r.json.data?.items?.find(d=>d.deviceId===device.deviceId&&d.online&&d.remoteEnabled)},'re-enabled presence')
 await retry.click()
 await controller.page.waitForURL(u=>u.pathname!==viewPath&&u.pathname.startsWith('/enterprise/remote/views/'))
 const disconnectedPath=viewPath
 viewPath=new URL(controller.page.url()).pathname
 await until(async()=>await controller.page.locator('[data-remote-workspace] [data-connected="true"]').count()>0,'manual reconnect connected')
 assert.equal(await controller.page.evaluate(()=>localStorage.getItem('remote-e2e-draft')),'remote-draft')
 assert.equal((await local(controller.page,`${disconnectedPath}api/session/list`,{type:'client-request',rpcId:randomUUID(),method:'session/list',payload:{args:{_request:{}}}})).status,404)
 assert.ok(!JSON.stringify(await native(host.page,'/','session/list',{_request:{}})).includes('must-not-run'))
 assert.ok(!JSON.stringify(await native(controller.page,'/','session/list',{_request:{}})).includes('must-not-run'))
 record('disconnected-refresh-failed-retry-and-manual-recovery')
 await controller.page.getByRole('button',{name:'返回本机',exact:true}).last().click()
 await controller.page.waitForURL(u=>u.pathname==='/')
 await controller.page.getByRole('button',{name:'账号菜单：远程联调员工',exact:true}).waitFor()
 assert.equal(await controller.page.evaluate(()=>localStorage.getItem('remote-e2e-draft')),'local-draft')
 assert.deepEqual(failures,[])
 record('return-to-local-page')
 await writeFile(join(run,'result.json'),JSON.stringify({result:'passed',checks,failures,http},null,2)+'\n')
 const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex')
 await writeFile('.audit/remote-workspace-local-evidence.json',JSON.stringify({date:new Date().toISOString(),result:'passed',checks,runtime:'npm @deepseek-ai/dsh 0.2.1-rc.5',server:'real Java 21 / PostgreSQL / Redis; isolated local HTTP/WS',transport:'leased Noise IK encrypted Relay',modelProvider:'explicit local OpenAI protocol fixture through real Java gateway, not an external model',bundleHostSha256:await hash('plugin/packages/bundle/lib/index.js'),bundleClientSha256:await hash('plugin/packages/bundle/lib/client.js'),protocolSha256:(await readFile('contracts/generated/protocol-sha256.txt','utf8')).trim(),unverified:['standalone Web/Android controller','production TLS','P2P/TURN fallback','multi-node fencing','external live model provider','native tool approval UI']},null,2)+'\n')
 console.log(`Evidence ${join(run,'result.json')}`)
} catch(error){
 for(const profile of profiles)await profile.page?.screenshot({path:join(run,`${profile.name}-failure.png`),fullPage:true}).catch(()=>{})
 await writeFile(join(run,'result.json'),JSON.stringify({result:'failed',stage,error:redact(error.stack),checks,failures,http,hosts:profiles.map(p=>({name:p.name,output:redact(p.output.slice(-6000))}))},null,2)+'\n')
 console.log(`FAIL ${stage}: ${redact(error.message)}. Evidence ${join(run,'result.json')}`)
 process.exitCode=1
}finally{
 await browser?.close()
 for(const profile of profiles){profile.child.kill('SIGTERM')}
 fixture?.closeAllConnections();await new Promise(resolve=>fixture?fixture.close(resolve):resolve())
}

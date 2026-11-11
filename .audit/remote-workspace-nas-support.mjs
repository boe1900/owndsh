/**
 * [INPUT]: 依赖 home-nas SSH、已安装的官方 ARM64 npm Harness、同轮插件与 NAS 独立 Docker profile。
 * [OUTPUT]: 提供 NAS Host 启动、回环页面/PKCE 转发、受控文件读取与无密拓扑证据。
 * [POS]: 共用工作区验收器的 NAS 环境适配层；SSH 仅管理测试环境，业务 Relay 直接访问 NAS 平台。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const base='/vol1/1000/docker/stacks/owndsh/remote-workspace-web'
const container='owndsh-dsh-web'
const port=18121
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`
const ssh=(command,input)=>execFileSync('ssh',['-4','-o','ConnectTimeout=10','home-nas',command],{input,encoding:'utf8',maxBuffer:4*1024*1024})
const python=(source,input)=>ssh(`python3 -c ${quote(source)}`,JSON.stringify(input))
const remoteNode=(source,input)=>ssh(`docker exec -i ${container} /opt/node/bin/node --input-type=module -e ${quote(source)}`,JSON.stringify(input))

async function forward(listen,target){
 const child=spawn('ssh',['-4','-v','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-N','-L',`127.0.0.1:${listen}:127.0.0.1:${target}`,'home-nas'],{stdio:['ignore','ignore','pipe']})
 let failure='';child.stderr.on('data',chunk=>{failure+=chunk})
 const deadline=Date.now()+15000
 while(Date.now()<deadline){
  if(child.exitCode!==null)throw new Error(`NAS forwarding failed: ${failure}`)
  if(!failure.includes(`Local forwarding listening on 127.0.0.1 port ${listen}.`)){await delay(100);continue}
  const ready=await new Promise(resolve=>{
   const socket=createConnection({host:'127.0.0.1',port:listen})
   socket.once('connect',()=>{socket.destroy();resolve(true)})
   socket.once('error',()=>resolve(false))
  })
  if(ready)return child
  await delay(100)
 }
 child.kill('SIGTERM');throw new Error('NAS forwarding timeout')
}

export function readCaptcha(id){
 if(!/^[a-f0-9]{32}$/.test(id))throw new Error('Unexpected captcha identifier')
 return ssh(`docker exec owndsh-redis-1 sh -ec 'export REDISCLI_AUTH="$REDIS_PASSWORD"; exec redis-cli --raw GET "$1"' redis-cli global:captcha_codes:${id}`).trim()
}

export async function startProfile({origin}){
 const expected=createHash('sha256').update(await readFile('plugin/packages/bundle/lib/index.js')).digest('hex')
 const expectedClient=createHash('sha256').update(await readFile('plugin/packages/bundle/lib/client.js')).digest('hex')
 const setup=python(`
from pathlib import Path
import json,sys,subprocess,os,time
data=json.load(sys.stdin)
base=Path(${JSON.stringify(base)})
run=base/'runs'/str(int(time.time()*1000))
for name in ['home','home/profiles/web','workspace','opener']:(run/name).mkdir(parents=True,exist_ok=True)
(run/'workspace/host-only.txt').write_text('host workspace marker\\n')
(run/'workspace/large.txt').write_text('远端 UTF-8 大文件\\n'*10000)
(run/'outside.txt').write_text('private outside workspace')
os.symlink('/data/outside.txt',run/'workspace/escape.txt')
(run/'workspace/outside.txt').write_text('inside decoy')
os.symlink('/data/workspace',run/'workspace/up')
(run/'workspace/nested').mkdir()
(run/'workspace/nested/outside.txt').write_text('base-file decoy')
os.symlink('/data/workspace',run/'workspace/nested/alias')
(run/'home/settings.yaml').write_text('owndsh:\\n  baseUrl: '+data['origin']+'\\n')
(run/'home/profiles/web/cordis.patch.yml').write_text('- id: session-title-llm\\n  disabled: true\\n')
for name in ['open','xdg-open']:
 p=run/'opener'/name
 p.write_text('#!/opt/node/bin/node\\nrequire("node:fs").writeFileSync(process.env.OWNDSH_AUTH_URL_FILE,process.argv.at(-1),{mode:0o600})\\n')
 p.chmod(0o700)
args=['--network','host','--user',str(os.getuid())+':'+str(os.getgid()),'-v',str(base/'node-runtime/node-v24.6.0-linux-arm64')+':/opt/node:ro','-v',str(base/'runtime')+':/runtime','-v',str(base/'node-runtime/owndsh-plugin-0.1.0-beta.20.tgz')+':/bootstrap/plugin.tgz:ro','-v',str(run)+':/data','-e','DSH_HOME=/data/home','-e','HOME=/data/home','-e','PATH=/data/opener:/runtime/node_modules/.bin:/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','-e','npm_config_store_dir=/runtime/pnpm-store','-e','SSH_TTY=owndsh-isolated-nas-e2e','-e','OWNDSH_AUTH_URL_FILE=/data/home/authorize-url','-w','/data/workspace','--entrypoint','/opt/node/bin/node']
with (run/'plugin-install.log').open('w') as f:
 r=subprocess.run(['docker','run','--rm',*args,'owndsh-dsh-web:local-rc5','/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js','plugin','--profile','web','add','--ignore-scripts','/bootstrap/plugin.tgz'],stdout=f,stderr=subprocess.STDOUT)
if r.returncode:raise RuntimeError((run/'plugin-install.log').read_text()[-3000:])
subprocess.run(['docker','rm','-f',${JSON.stringify(container)}],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['docker','run','-d','--name',${JSON.stringify(container)},'--hostname','home-nas-dsh','--restart','unless-stopped',*args,'owndsh-dsh-web:local-rc5','/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js','--profile','web','--port',${JSON.stringify(String(port))},'--no-open'],stdout=subprocess.DEVNULL,check=True)
print(json.dumps({'run':str(run)}))
`,{origin})
 const {run}=JSON.parse(setup)
 let launch
 const deadline=Date.now()+90000
 while(Date.now()<deadline){
  const text=ssh(`docker logs ${container} 2>&1`)
  launch=text.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)?.[1]
  if(launch)break
  if(ssh(`docker inspect ${container} --format '{{.State.Running}}'`).trim()!=='true')throw new Error('NAS Harness stopped during startup')
  await delay(250)
 }
 if(!launch)throw new Error('NAS Harness startup timeout')
 const hashes=JSON.parse(remoteNode(`
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
console.log(JSON.stringify({host:hash('/data/home/profiles/web/node_modules/owndsh-plugin/lib/index.js'),client:hash('/data/home/profiles/web/node_modules/owndsh-plugin/lib/client.js')}));
`))
 if(hashes.host!==expected||hashes.client!==expectedClient)throw new Error('NAS installed plugin differs from tested package')
 const tunnel=await forward(port,port)
 return {name:'host',remote:true,home:'/data/home',cwd:'/data/workspace',authFile:'/data/home/authorize-url',launch,run,tunnel,output:''}
}

export function readAuthorizationUrl(){
 return remoteNode(`import{existsSync,readFileSync,unlinkSync}from'node:fs';const p='/data/home/authorize-url';if(existsSync(p)){process.stdout.write(readFileSync(p));unlinkSync(p)}`)
}

export async function forwardCallback(authorizeUrl){
 const callback=new URL(new URL(authorizeUrl).searchParams.get('redirect_uri'))
 if(callback.hostname!=='127.0.0.1'||callback.pathname!=='/callback')throw new Error('Unexpected NAS PKCE callback')
 return forward(Number(callback.port),Number(callback.port))
}

export async function readWorkspaceFile(path,encoding){
 if(!path.startsWith('/data/workspace/'))throw new Error('Unexpected test workspace path')
 const text=remoteNode(`import{readFileSync}from'node:fs';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(readFileSync(JSON.parse(s)).toString('base64'))`,path)
 const bytes=Buffer.from(text,'base64')
 return encoding?bytes.toString(encoding):bytes
}

export async function topology(){
 const host=JSON.parse(remoteNode(`import{hostname,userInfo}from'node:os';const user=userInfo();console.log(JSON.stringify({os:process.platform,arch:process.arch,node:process.version,hostname:hostname(),user:user.username,uid:user.uid,shell:user.shell}))`))
 const images=JSON.parse(python(`
import subprocess,json
items=json.loads(subprocess.check_output(['docker','inspect','owndsh-server-1','owndsh-console-1']))
result=[]
for item in items:
 image=json.loads(subprocess.check_output(['docker','image','inspect',item['Image']]))[0]
 result.append({'container':item['Name'],'image':item['Config']['Image'],'id':item['Image'],'revision':image['Config']['Labels']['org.opencontainers.image.revision'],'health':item['State']['Health']['Status']})
print(json.dumps(result))
`,{}))
 if(host.os!=='linux'||process.platform!=='darwin')throw new Error('Expected physical Mac/Linux topology')
 return {topology:'Mac Controller and physical home-nas Linux Host; platform HTTP/WS connects directly to home-nas:18080',controller:{os:process.platform,arch:process.arch},host,images,sshForwarding:'NAS loopback management UI and initial PKCE callback only'}
}

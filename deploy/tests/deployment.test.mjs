/**
 * [INPUT]: 依赖 deploy Compose/Nginx/脚本、application-deploy.yml、Docker Compose v2 与临时假 secret。
 * [OUTPUT]: 验证四服务拓扑、唯一 443 发布、锁定及本地缓存镜像边界、可移植 SHA-256、bootstrap overlay、完整 deploy profile、API/SPA 路由边界、运维脚本与本地体验边界。
 * [POS]: T21 部署与本地人工验收静态门禁，先于昂贵镜像构建发现配置漂移且不接触生产 secret。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const TEST_ROOT = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(TEST_ROOT, '../..')
const DEPLOY_ROOT = resolve(TEST_ROOT, '..')
const COMPOSE = join(DEPLOY_ROOT, 'compose', 'compose.yml')
const BOOTSTRAP = join(DEPLOY_ROOT, 'compose', 'compose.bootstrap.yml')

function read(relative) {
  return readFileSync(join(PROJECT_ROOT, relative), 'utf8')
}

function composeConfig(includeBootstrap = false, baseImageRegistry = undefined) {
  const state = mkdtempSync(join(tmpdir(), 'eap-compose-'))
  const secrets = join(state, 'secrets')
  const tls = join(state, 'tls')
  const database = join(state, 'releases', 'test', 'database')
  execFileSync('mkdir', ['-p', secrets, tls, database])
  for (const file of [
    'postgres_password', 'redis_password', 'sa_token_jwt_secret_key',
    'enterprise_master_key', 'plugin_signing_private_key',
  ]) writeFileSync(join(secrets, file), 'fixture')
  writeFileSync(join(tls, 'tls.crt'), 'fixture')
  writeFileSync(join(tls, 'tls.key'), 'fixture')
  writeFileSync(join(database, 'postgres_ry_vue.sql'), 'select 1;')
  writeFileSync(join(state, 'bootstrap.secret'), 'fixture')
  const args = ['compose', '-f', COMPOSE]
  if (includeBootstrap) args.push('-f', BOOTSTRAP)
  args.push('config', '--format', 'json')
  const env = {
    ...process.env,
    EAP_STATE_DIR: state,
    EAP_SERVER_IMAGE: 'enterprise-agent/server:test',
    EAP_GATEWAY_IMAGE: 'enterprise-agent/gateway:test',
    EAP_RELEASE_VERSION: 'test',
    ...(baseImageRegistry ? { EAP_BASE_IMAGE_REGISTRY: baseImageRegistry } : {}),
    ENT_PUBLIC_BASE_URL: 'https://platform.example.test',
    ENT_ADMIN_REDIRECT_URI: 'https://platform.example.test/enterprise/auth/callback',
    ENT_BOOTSTRAP_ADMIN_USERNAME: 'platform.admin',
    EAP_BOOTSTRAP_PASSWORD_FILE: join(state, 'bootstrap.secret'),
  }
  return JSON.parse(execFileSync('docker', args, { env, encoding: 'utf8' }))
}

test('compose publishes only Gateway TLS and pins all third-party images', () => {
  const config = composeConfig()
  assert.deepEqual(Object.keys(config.services).sort(), ['gateway', 'postgres', 'redis', 'server', 'storage-init'])
  assert.equal(config.services.postgres.ports, undefined)
  assert.equal(config.services.redis.ports, undefined)
  assert.equal(config.services.server.ports, undefined)
  assert.equal(config.services.gateway.ports.length, 1)
  assert.equal(config.services.gateway.ports[0].target, 443)
  assert.ok(config.services.postgres.configs.some(config =>
    config.source === 'postgres_baseline' && config.target === '/docker-entrypoint-initdb.d/00-ruoyi-baseline.sql'
  ))
  assert.match(config.services.postgres.image, /postgres:17\.6-alpine3\.22@sha256:[a-f0-9]{64}$/)
  assert.match(config.services.redis.image, /redis:7\.4\.5-alpine3\.21@sha256:[a-f0-9]{64}$/)
  assert.equal(config.services.server.platform, 'linux/amd64')
  assert.equal(config.services.gateway.platform, 'linux/amd64')
  assert.equal(config.services.server.environment.ENT_ALLOW_INSECURE_OIDC, 'false')
})

test('compose registry mirror cannot change pinned runtime image content', () => {
  const config = composeConfig(false, 'mirror.gcr.io/library')
  assert.match(config.services.postgres.image, /^mirror\.gcr\.io\/library\/postgres:17\.6-alpine3\.22@sha256:[a-f0-9]{64}$/)
  assert.match(config.services.redis.image, /^mirror\.gcr\.io\/library\/redis:7\.4\.5-alpine3\.21@sha256:[a-f0-9]{64}$/)
})

test('bootstrap password exists only in the one-time overlay', () => {
  const base = composeConfig()
  const bootstrap = composeConfig(true)
  assert.equal(JSON.stringify(base).includes('bootstrap_admin_password'), false)
  assert.equal(bootstrap.services.server.environment.ENT_BOOTSTRAP_ADMIN_USERNAME, 'platform.admin')
  assert.ok(bootstrap.services.server.secrets.some(secret => secret.source === 'bootstrap_admin_password'))
})

test('gateway overwrites forwarding headers and keeps model SSE unbuffered', () => {
  const nginx = read('deploy/nginx/nginx.conf')
  assert.match(nginx, /proxy_set_header Forwarded "";/)
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/)
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto https;/)
  assert.match(nginx, /map \$http_host \$external_https_port \{[\s\S]*?default 443;[\s\S]*?\}/)
  assert.match(nginx, /proxy_set_header X-Forwarded-Port \$external_https_port;/)
  assert.doesNotMatch(nginx, /proxy_set_header X-Forwarded-Port 443;/)
  assert.doesNotMatch(nginx, /\$proxy_add_x_forwarded_for/)
  assert.match(nginx, /enterprise\/gateway\/v1\/chat\/completions[\s\S]*?proxy_buffering off;/)
  assert.match(nginx, /ssl_protocols TLSv1\.2 TLSv1\.3;/)
  assert.match(nginx, /add_header Referrer-Policy strict-origin always;/)
  assert.doesNotMatch(nginx, /add_header Referrer-Policy no-referrer/)
  const adminCallback = nginx.indexOf('location = /enterprise/auth/callback {')
  assert.ok(adminCallback >= 0)
  assert.match(
    nginx.slice(adminCallback),
    /root \/usr\/share\/nginx\/html;[\s\S]*?try_files \/index\.html =404;/
  )
  for (const namespace of ['admin/v1/', 'api/v1/', 'auth/']) {
    assert.match(
      nginx,
      new RegExp(`location /enterprise/${namespace.replaceAll('/', '\\/')} \\{[\\s\\S]*?proxy_pass http://enterprise_server;`)
    )
  }
  assert.doesNotMatch(nginx, /location \/enterprise\/ \{[\s\S]*?proxy_pass http:\/\/enterprise_server;/)
  for (const [directive, directory] of [
    ['client_body_temp_path', 'client_temp'],
    ['proxy_temp_path', 'proxy_temp'],
    ['fastcgi_temp_path', 'fastcgi_temp'],
    ['uwsgi_temp_path', 'uwsgi_temp'],
    ['scgi_temp_path', 'scgi_temp'],
  ]) {
    assert.match(nginx, new RegExp(`${directive} /tmp/${directory};`))
  }
  const gateway = composeConfig().services.gateway
  assert.equal(gateway.read_only, true)
  assert.ok(gateway.tmpfs.some(mount =>
    typeof mount === 'string' ? mount.split(':')[0] === '/tmp' : mount.target === '/tmp'
  ))
})

test('deploy profile consumes configtree secrets and exposes only health', () => {
  const deploy = read('backend/ruoyi-admin/src/main/resources/application-deploy.yml')
  assert.match(deploy, /configtree:\/run\/secrets\//)
  assert.match(deploy, /jwt-secret-key: \$\{sa_token_jwt_secret_key\}/)
  assert.match(deploy, /include: health/)
  assert.match(deploy, /show-details: never/)
  assert.match(deploy, /api-docs:\n\s+enabled: false/)
  assert.match(deploy, /actuator-basic-auth-enabled: false/)
  assert.match(deploy, /snail-job:\n\s+enabled: false\n(?:\s+#.*\n)?\s+port: 2\$\{server\.port\}/)
})

test('operations scripts parse and rollback cannot remove or restore data', () => {
  const scriptDirectory = join(DEPLOY_ROOT, 'scripts')
  const scripts = readdirSync(scriptDirectory).filter(file => file.endsWith('.sh'))
  for (const script of scripts) execFileSync('sh', ['-n', join(scriptDirectory, script)])
  const rollback = read('deploy/scripts/rollback.sh')
  const executableRollback = rollback.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
  assert.doesNotMatch(executableRollback, /down\s+(?:[^\n]*\s)?-v/)
  assert.doesNotMatch(executableRollback, /pg_restore|redis\.rdb|enterprise-keys\.tar/)
  assert.match(rollback, /key_fingerprint/)
  const backup = read('deploy/scripts/backup.sh')
  assert.match(backup, /data-output/)
  assert.match(backup, /key-output/)
  assert.match(backup, /普通数据与 key 备份目录必须分离/)
  const restore = read('deploy/scripts/restore.sh')
  assert.match(restore, /redis-check-rdb \/restore\/redis\.rdb/)
  assert.match(restore, /--appendonly no/)
  assert.match(restore, /CONFIG SET appendonly yes/)
  assert.match(restore, /appendonly\.aof\.manifest/)
  const release = read('deploy/scripts/build-release.sh')
  assert.match(release, /bundle="\$source_root\/artifacts\/enterprise-agent-dsh-bundle-0\.1\.0\.tgz"/)
  assert.match(release, /backend\/script\/sql\/postgres\/postgres_ry_vue\.sql/)
  assert.match(release, /EAP_USE_LOCAL_BASE_IMAGES/)
  assert.match(release, /docker image ls --digests/)
  assert.match(release, /DOCKER_BUILDKIT=0 docker build/)
  assert.doesNotMatch(release, /harness-plugin\/artifacts/)
  for (const script of scripts.filter(file => file !== 'common.sh')) {
    assert.doesNotMatch(read(`deploy/scripts/${script}`), /\bsha256sum\b/)
  }
})

test('portable SHA-256 helper emits and verifies standard manifests', () => {
  const state = mkdtempSync(join(tmpdir(), 'eap-sha256-'))
  const payload = join(state, 'payload.txt')
  const common = join(DEPLOY_ROOT, 'scripts', 'common.sh')
  writeFileSync(payload, 'portable-release-checksum\n')
  const expected = createHash('sha256').update(readFileSync(payload)).digest('hex')
  const output = execFileSync('sh', [
    '-c', '. "$1"; require_sha256; sha256sum_compat "$2"', 'sh', common, payload,
  ], { encoding: 'utf8' })
  assert.equal(output.trim().split(/\s+/)[0], expected)

  writeFileSync(join(state, 'SHA256SUMS'), `${expected}  payload.txt\n`)
  execFileSync('sh', [
    '-c', '. "$1"; sha256sum_compat -c SHA256SUMS >/dev/null', 'sh', common,
  ], { cwd: state })
})

test('installer rejects runtime.env injection and invalid published ports before mutation', () => {
  const install = join(DEPLOY_ROOT, 'scripts', 'install.sh')
  const sharedArgs = [
    '--state-dir', join(tmpdir(), 'eap-install-input'),
    '--bootstrap-admin', 'platform.admin',
    '--bootstrap-password-file', '/not-read',
    '--tls-cert', '/not-read',
    '--tls-key', '/not-read',
  ]
  const injectedAuthority = 'https://platform.example.test\nEAP_SERVER_IMAGE=attacker'
  const injected = spawnSync('sh', [
    install,
    '--public-base-url', injectedAuthority,
    '--admin-redirect-uri', `${injectedAuthority}/enterprise/auth/callback`,
    ...sharedArgs,
  ], {
    encoding: 'utf8',
  })
  assert.notEqual(injected.status, 0)
  assert.match(injected.stderr, /public base URL不能包含换行/)

  const invalidPort = spawnSync('sh', [
    install,
    '--public-base-url', 'https://platform.example.test',
    '--admin-redirect-uri', 'https://platform.example.test/enterprise/auth/callback',
    ...sharedArgs,
    '--https-port', '65536',
  ], { encoding: 'utf8' })
  assert.notEqual(invalidPort.status, 0)
  assert.match(invalidPort.stderr, /1\.\.65535/)

  const mismatchedPort = spawnSync('sh', [
    install,
    '--public-base-url', 'https://platform.example.test:18443',
    '--admin-redirect-uri', 'https://platform.example.test:18443/enterprise/auth/callback',
    ...sharedArgs,
  ], { encoding: 'utf8' })
  assert.notEqual(mismatchedPort.status, 0)
  assert.match(mismatchedPort.stderr, /端口必须与 HTTPS 发布端口一致/)

  const invalidProject = spawnSync('sh', [
    install,
    '--public-base-url', 'https://platform.example.test',
    '--admin-redirect-uri', 'https://platform.example.test/enterprise/auth/callback',
    ...sharedArgs,
  ], { encoding: 'utf8', env: { ...process.env, EAP_COMPOSE_PROJECT_NAME: 'unsafe project' } })
  assert.notEqual(invalidProject.status, 0)
  assert.match(invalidProject.stderr, /EAP_COMPOSE_PROJECT_NAME 格式不安全/)
})

test('Docker build contexts lock every build and runtime base by digest', () => {
  for (const file of ['deploy/compose/Dockerfile.server', 'deploy/compose/Dockerfile.gateway']) {
    const dockerfile = read(file)
    assert.match(dockerfile, /ARG EAP_BASE_IMAGE_REGISTRY=docker\.io\/library/)
    const imageArgs = dockerfile.split('\n').filter(line => /^ARG EAP_(?:MAVEN|JRE|NODE|NGINX)_IMAGE=/.test(line))
    assert.equal(imageArgs.length, 2)
    for (const line of imageArgs) {
      assert.match(line, /=\$\{EAP_BASE_IMAGE_REGISTRY\}\//)
      assert.match(line, /@sha256:[a-f0-9]{64}$/)
    }
    const from = dockerfile.split('\n').filter(line => line.startsWith('FROM '))
    assert.ok(from.length >= 2)
    for (const line of from) {
      assert.match(line, /^FROM \$\{EAP_(?:MAVEN|JRE|NODE|NGINX)_IMAGE\}(?:\s+AS\s+\w+)?$/)
    }
  }
  assert.match(
    read('deploy/compose/Dockerfile.gateway'),
    /COPY contracts\/generated\/enterprise-openapi\.json \/workspace\/contracts\/generated\/enterprise-openapi\.json/
  )
  assert.match(read('.dockerignore'), /deploy\/secrets/)
})

test('local demo starts one real Harness without candidate automation', () => {
  const localDemo = read('scripts/local-demo.sh')
  assert.match(localDemo, /plugin --profile web add --ignore-scripts/)
  assert.match(localDemo, /dsh --profile web --port "\$harness_port"/)
  assert.match(localDemo, /NODE_EXTRA_CA_CERTS=/)
  assert.match(localDemo, /COMPOSE_PROGRESS=quiet/)
  assert.doesNotMatch(localDemo, /playwright|candidate-harness|manual_acceptance|accept:t22/)
})

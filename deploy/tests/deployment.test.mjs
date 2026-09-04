/**
 * [INPUT]: 依赖 deploy Compose/Nginx/脚本、application-deploy.yml、Docker Compose v2 与临时假 secret。
 * [OUTPUT]: 验证内部数据服务加 HTTP Console/Server 拓扑、GitHub 测试版发布、镜像锁定、bootstrap overlay、API/SPA 路由、运维脚本与源码 CLI 可调和边界。
 * [POS]: T21/P2-08 部署与本地人工验收静态门禁，先于昂贵镜像构建发现配置漂移且不接触生产 secret。
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
const COMPOSE = join(PROJECT_ROOT, 'docker-compose.yml')
const BOOTSTRAP = join(DEPLOY_ROOT, 'compose', 'compose.bootstrap.yml')

function read(relative) {
  return readFileSync(join(PROJECT_ROOT, relative), 'utf8')
}

function composeConfig(includeBootstrap = false, baseImageRegistry = undefined) {
  const state = mkdtempSync(join(tmpdir(), 'owndsh-compose-'))
  const secrets = join(state, 'secrets')
  const database = join(state, 'releases', 'test', 'database')
  execFileSync('mkdir', ['-p', secrets, database])
  for (const file of [
    'postgres_password', 'redis_password', 'sa_token_jwt_secret_key',
    'enterprise_master_key', 'plugin_signing_private_key',
  ]) writeFileSync(join(secrets, file), 'fixture')
  writeFileSync(join(database, 'postgres_owndsh.sql'), 'select 1;')
  writeFileSync(join(state, 'bootstrap.secret'), 'fixture')
  const args = ['compose', '-f', COMPOSE]
  if (includeBootstrap) args.push('-f', BOOTSTRAP)
  args.push('config', '--format', 'json')
  const env = {
    ...process.env,
    OWNDSH_STATE_DIR: state,
    OWNDSH_SERVER_IMAGE: 'owndsh/server:test',
    OWNDSH_CONSOLE_IMAGE: 'owndsh/console:test',
    OWNDSH_RELEASE_VERSION: 'test',
    ...(baseImageRegistry ? { OWNDSH_BASE_IMAGE_REGISTRY: baseImageRegistry } : {}),
    ENT_PUBLIC_BASE_URL: 'https://platform.example.test',
    ENT_ADMIN_REDIRECT_URI: 'https://platform.example.test/enterprise/auth/callback',
    ENT_BOOTSTRAP_ADMIN_USERNAME: 'platform.admin',
    OWNDSH_BOOTSTRAP_PASSWORD_FILE: join(state, 'bootstrap.secret'),
  }
  return JSON.parse(execFileSync('docker', args, { env, encoding: 'utf8' }))
}

test('compose publishes only the HTTP Console and pins all third-party images', () => {
  const config = composeConfig()
  assert.deepEqual(Object.keys(config.services).sort(), ['console', 'postgres', 'redis', 'server', 'storage-init'])
  assert.equal(config.services.postgres.ports, undefined)
  assert.equal(config.services.redis.ports, undefined)
  assert.equal(config.services.server.ports, undefined)
  assert.equal(config.services.console.ports.length, 1)
  assert.equal(config.services.console.ports[0].target, 8080)
  assert.equal(config.services.server.image, 'owndsh/server:test')
  assert.equal(config.services.console.image, 'owndsh/console:test')
  assert.equal(config.services.console.secrets, undefined)
  assert.ok(config.services.postgres.configs.some(config =>
    config.source === 'postgres_baseline' && config.target === '/docker-entrypoint-initdb.d/00-owndsh-baseline.sql'
  ))
  assert.match(config.services.postgres.image, /postgres:17\.6-alpine3\.22@sha256:[a-f0-9]{64}$/)
  assert.match(config.services.redis.image, /redis:7\.4\.5-alpine3\.21@sha256:[a-f0-9]{64}$/)
  assert.equal(config.services.server.platform, 'linux/amd64')
  assert.equal(config.services.console.platform, 'linux/amd64')
  assert.equal(config.services.server.environment.ENT_ALLOW_INSECURE_OIDC, 'false')
  assert.equal(config.services.server.environment.XDG_CACHE_HOME, '/tmp')
  assert.ok(config.services.server.tmpfs.some(mount =>
    typeof mount === 'string' ? mount.split(':')[0] === '/tmp' : mount.target === '/tmp'
  ))
})

test('root Compose is a thin public entry over GHCR defaults and contains no secret', () => {
  const entry = read('docker-compose.yml')
  const compose = read('deploy/compose/compose.yml')
  const environment = read('.env.example')
  assert.match(entry, /include:\n\s+- path: \.\/deploy\/compose\/compose\.yml/)
  assert.match(compose, /ghcr\.io\/boe1900\/owndsh-server:next/)
  assert.match(compose, /ghcr\.io\/boe1900\/owndsh-console:next/)
  assert.match(environment, /OWNDSH_STATE_DIR=\$\{PWD\}\/\.owndsh/)
  assert.match(environment, /OWNDSH_POSTGRES_BASELINE=\$\{PWD\}\/server\/script\/sql\/postgres\/postgres_owndsh\.sql/)
  assert.doesNotMatch(environment, /(?:PASSWORD|SECRET|PRIVATE_KEY)=\S+/)
  assert.match(read('.gitignore'), /^\.owndsh\/$/m)
  assert.match(read('.dockerignore'), /^\.owndsh$/m)
})

test('release workflow publishes only test artifacts and uses npm OIDC', () => {
  const workflow = read('.github/workflows/release.yml')
  assert.match(workflow, /tags: \['v\*-\*'\]/)
  assert.match(workflow, /type=raw,value=next/)
  assert.match(workflow, /flavor: latest=false/)
  assert.match(workflow, /id-token: write/)
  assert.match(workflow, /npm publish .* --tag next --provenance --access public/)
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|type=raw,value=latest/)
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

test('HTTP gateway preserves an upstream HTTP(S) origin and keeps model SSE unbuffered', () => {
  const nginx = read('deploy/nginx/nginx.conf')
  assert.match(nginx, /proxy_set_header Forwarded "";/)
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/)
  assert.match(nginx, /listen 8080;/)
  assert.match(nginx, /map \$http_x_forwarded_proto \$external_proto \{[\s\S]*?https https;[\s\S]*?default \$scheme;/)
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto \$external_proto;/)
  assert.match(nginx, /proxy_set_header X-Forwarded-Port \$external_port;/)
  assert.doesNotMatch(nginx, /\$proxy_add_x_forwarded_for/)
  assert.match(nginx, /location ~ \^\/prod-api\/enterprise\/gateway\/v1\/\(\?:chat\/completions\|responses\|messages\)\$/)
  assert.match(nginx, /location ~ \^\/enterprise\/gateway\/v1\/\(\?:chat\/completions\|responses\|messages\)\$/)
  assert.match(nginx, /enterprise\/gateway\/v1\/[\s\S]*?proxy_buffering off;/)
  assert.doesNotMatch(nginx, /ssl_certificate|ssl_protocols|Strict-Transport-Security/)
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
  const console = composeConfig().services.console
  assert.equal(console.read_only, true)
  assert.ok(console.tmpfs.some(mount =>
    typeof mount === 'string' ? mount.split(':')[0] === '/tmp' : mount.target === '/tmp'
  ))
})

test('deploy profile consumes configtree secrets and exposes only health', () => {
  const deploy = read('server/owndsh-server/src/main/resources/application-deploy.yml')
  assert.match(deploy, /configtree:\/run\/secrets\//)
  assert.match(deploy, /jwt-secret-key: \$\{sa_token_jwt_secret_key\}/)
  assert.match(deploy, /include: health/)
  assert.match(deploy, /show-details: never/)
  assert.match(deploy, /api-docs:\n\s+enabled: false/)
  assert.doesNotMatch(deploy, /actuator-basic-auth-enabled|spring:\n[\s\S]*?boot:\n\s+admin:|snail-job|snail-ai/)
})

test('operations scripts parse, keep Harness bundles aligned, and rollback cannot remove or restore data', () => {
  const scriptDirectory = join(DEPLOY_ROOT, 'scripts')
  const scripts = readdirSync(scriptDirectory).filter(file => file.endsWith('.sh'))
  for (const script of scripts) execFileSync('sh', ['-n', join(scriptDirectory, script)])
  const rollback = read('deploy/scripts/rollback.sh')
  const executableRollback = rollback.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
  assert.doesNotMatch(executableRollback, /down\s+(?:[^\n]*\s)?-v/)
  assert.doesNotMatch(executableRollback, /pg_restore|redis\.rdb|enterprise-keys\.tar/)
  assert.match(rollback, /key_fingerprint/)
  assert.match(rollback, /old_release=\$\(env_value OWNDSH_ROLLBACK_FROM_RELEASE/)
  assert.match(rollback, /replace_env OWNDSH_RELEASE_VERSION "\$old_release"/)
  assert.match(rollback, /releases\/\$old_release\/harness\/\$old_harness_bundle/)
  assert.doesNotMatch(rollback, /cordis\.patch\.yml/)
  const upgrade = read('deploy/scripts/upgrade.sh')
  assert.match(upgrade, /release_root\/harness\/\$new_harness_bundle/)
  assert.doesNotMatch(upgrade, /cordis\.patch\.yml/)
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
  assert.match(release, /bundle="\$source_root\/artifacts\/owndsh-plugin-0\.1\.0\.tgz"/)
  assert.match(release, /server\/script\/sql\/postgres\/postgres_owndsh\.sql/)
  assert.match(release, /OWNDSH_USE_LOCAL_BASE_IMAGES/)
  assert.match(release, /docker image ls --digests/)
  assert.match(release, /DOCKER_BUILDKIT=0 docker build/)
  assert.match(release, /harness_lock="\$source_root\/upstream\/deepseek-harness\.lock\.json"/)
  assert.match(release, /OWNDSH_HARNESS_VERSION=\$harness_version/)
  assert.match(release, /OWNDSH_HARNESS_COMMIT=\$harness_commit/)
  assert.match(release, /console\/BEAUTIFUL_UI_LICENSE/)
  assert.doesNotMatch(release, /OWNDSH_HARNESS_VERSION=\d/)
  assert.doesNotMatch(release, /admin-web\/LICENSE/)
  assert.doesNotMatch(release, /plugin\/artifacts/)
  for (const script of scripts.filter(file => file !== 'common.sh')) {
    assert.doesNotMatch(read(`deploy/scripts/${script}`), /\bsha256sum\b/)
  }
})

test('portable SHA-256 helper emits and verifies standard manifests', () => {
  const state = mkdtempSync(join(tmpdir(), 'owndsh-sha256-'))
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
    '--state-dir', join(tmpdir(), 'owndsh-install-input'),
    '--bootstrap-admin', 'platform.admin',
    '--bootstrap-password-file', '/not-read',
  ]
  const injectedAuthority = 'https://platform.example.test\nOWNDSH_SERVER_IMAGE=attacker'
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
    '--http-port', '65536',
  ], { encoding: 'utf8' })
  assert.notEqual(invalidPort.status, 0)
  assert.match(invalidPort.stderr, /1\.\.65535/)

  const unsupportedScheme = spawnSync('sh', [
    install,
    '--public-base-url', 'ftp://platform.example.test',
    '--admin-redirect-uri', 'ftp://platform.example.test/enterprise/auth/callback',
    ...sharedArgs,
  ], { encoding: 'utf8' })
  assert.notEqual(unsupportedScheme.status, 0)
  assert.match(unsupportedScheme.stderr, /HTTP\(S\) authority/)

  const httpAccepted = spawnSync('sh', [
    install,
    '--public-base-url', 'http://platform.example.test:8080',
    '--admin-redirect-uri', 'http://platform.example.test:8080/enterprise/auth/callback',
    ...sharedArgs,
  ], { encoding: 'utf8' })
  assert.notEqual(httpAccepted.status, 0)
  assert.match(httpAccepted.stderr, /缺少文件: \/not-read/)
  assert.doesNotMatch(httpAccepted.stderr, /public base URL|管理回调|HTTP 端口/)

  const invalidProject = spawnSync('sh', [
    install,
    '--public-base-url', 'https://platform.example.test',
    '--admin-redirect-uri', 'https://platform.example.test/enterprise/auth/callback',
    ...sharedArgs,
  ], { encoding: 'utf8', env: { ...process.env, OWNDSH_COMPOSE_PROJECT_NAME: 'unsafe project' } })
  assert.notEqual(invalidProject.status, 0)
  assert.match(invalidProject.stderr, /OWNDSH_COMPOSE_PROJECT_NAME 格式不安全/)
})

test('Docker build contexts lock every build and runtime base by digest', () => {
  for (const file of ['deploy/compose/Dockerfile.server', 'deploy/compose/Dockerfile.console']) {
    const dockerfile = read(file)
    assert.match(dockerfile, /ARG OWNDSH_BASE_IMAGE_REGISTRY=docker\.io\/library/)
    const imageArgs = dockerfile.split('\n').filter(line => /^ARG OWNDSH_(?:MAVEN|JRE|NODE|NGINX)_IMAGE=/.test(line))
    assert.equal(imageArgs.length, 2)
    for (const line of imageArgs) {
      assert.match(line, /=\$\{OWNDSH_BASE_IMAGE_REGISTRY\}\//)
      assert.match(line, /@sha256:[a-f0-9]{64}$/)
    }
    const from = dockerfile.split('\n').filter(line => line.startsWith('FROM '))
    assert.ok(from.length >= 2)
    for (const line of from) {
      assert.match(line, /^FROM \$\{OWNDSH_(?:MAVEN|JRE|NODE|NGINX)_IMAGE\}(?:\s+AS\s+\w+)?$/)
    }
  }
  assert.match(
    read('deploy/compose/Dockerfile.server'),
    /eclipse-temurin:21\.0\.8_9-jre-jammy@sha256:[a-f0-9]{64}/
  )
  const console = read('deploy/compose/Dockerfile.console')
  assert.match(console, /WORKDIR \/workspace\/console/)
  assert.match(console, /pnpm@11\.24\.0/)
  assert.match(console, /COPY contracts\/ \/workspace\/contracts\//)
  assert.match(console, /COPY --from=build \/workspace\/console\/dist\//)
  assert.doesNotMatch(console, /admin-web/)
  assert.match(read('.dockerignore'), /deploy\/secrets/)
})

test('local demo starts one real Harness without candidate automation', () => {
  const localDemo = read('scripts/local-demo.sh')
  assert.match(localDemo, /plugin --profile web add --ignore-scripts/)
  assert.match(localDemo, /dsh --profile web --port "\$harness_port"/)
  assert.match(localDemo, /OWNDSH_LOCAL_HARNESS_ROOT=.*PATH="\$harness_bin:\$PATH"/)
  assert.match(localDemo, /exec corepack pnpm@11\.7\.0 --dir "\$OWNDSH_LOCAL_HARNESS_ROOT" dsh "\$@"/)
  assert.match(localDemo, /platform_origin="http:\/\/127\.0\.0\.1:\$http_port"/)
  assert.match(localDemo, /--http-port "\$http_port"/)
  assert.doesNotMatch(localDemo, /NODE_EXTRA_CA_CERTS|openssl|tls-cert|tls-key|https-port/)
  assert.match(localDemo, /COMPOSE_PROGRESS=quiet/)
  assert.doesNotMatch(localDemo, /playwright|candidate-harness|manual_acceptance|accept:t22/)
})

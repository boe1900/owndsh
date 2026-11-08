/**
 * [INPUT]: 依赖运行中的 OwnDsh HTTP/Remote listener、PostgreSQL/Redis、Vite 开发代理和 ws 客户端。
 * [OUTPUT]: 创建隔离测试账号，经过真实 PKCE、设备注册、Host 直连与 Vite 代理控制端完成 Remote Relay 验收，并写入无密证据。
 * [POS]: .audit 的认证 Remote 联调验证器，不改变产品认证、设备或 Remote 实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'

const BASE = process.env.OWNDSH_E2E_ORIGIN ?? 'http://127.0.0.1:8080'
const REMOTE_DIRECT_WS = process.env.REMOTE_DIRECT_WS ?? 'ws://127.0.0.1:8090/remote/ws/v1'
const REMOTE_VITE_WS = process.env.REMOTE_VITE_WS ?? 'ws://127.0.0.1:62209/remote/ws/v1'
const VITE_ORIGIN = process.env.REMOTE_VITE_ORIGIN ?? 'http://127.0.0.1:62209'
const REMOTE_VITE_EXTERNAL = process.env.REMOTE_VITE_EXTERNAL === '1'
const REMOTE_VITE_HOST = process.env.REMOTE_VITE_HOST ?? '127.0.0.1'
const EVIDENCE_PATH = process.env.REMOTE_EVIDENCE_PATH ?? '.audit/remote-authenticated-evidence.json'
const COMPOSE_PROJECT = process.env.OWNDSH_E2E_COMPOSE_PROJECT ?? 'owndsh'
const PG_CONTAINER = `${COMPOSE_PROJECT}-postgres-1`
const REDIS_CONTAINER = `${COMPOSE_PROJECT}-redis-1`
const PROTOCOL_SHA256 = 'c6ec6febc41a5c971a8a320ced9d4765eafd0da38f6a0c725828cf2c44bf99aa'
const require = createRequire(import.meta.url)
const WebSocket = require('../plugin/packages/bundle/node_modules/ws')

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
process.env.OWNDSH_E2E_ORIGIN = BASE
process.env.OWNDSH_E2E_COMPOSE_PROJECT = COMPOSE_PROJECT

const { passwordLogin } = await import('../scripts/v1-e2e-support.mjs')

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function psql(statement) {
  return execFileSync('docker', [
    'exec', PG_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'owndsh', '-d', 'owndsh', '-Atc', statement,
  ], { encoding: 'utf8' }).trim()
}

function redis(...args) {
  return execFileSync('docker', [
    'exec', REDIS_CONTAINER, 'sh', '-ec',
    'export REDISCLI_AUTH="$REDIS_PASSWORD"; exec redis-cli --raw "$@"',
    'redis-cli', ...args,
  ], { encoding: 'utf8' }).trim()
}

function bcrypt(password) {
  const directory = mkdtempSync(join(tmpdir(), 'owndsh-remote-bcrypt-'))
  const source = join(directory, 'BcryptStdin.java')
  const classPath = [
    '/Users/cola/.m2/repository/cn/hutool/hutool-crypto/5.8.47/hutool-crypto-5.8.47.jar',
    '/Users/cola/.m2/repository/cn/hutool/hutool-core/5.8.47/hutool-core-5.8.47.jar',
  ].join(':')
  writeFileSync(source, [
    'import cn.hutool.crypto.digest.BCrypt;',
    'import java.io.*;',
    'public class BcryptStdin {',
    '  public static void main(String[] args) throws Exception {',
    '    System.out.print(BCrypt.hashpw(new String(System.in.readAllBytes())));',
    '  }',
    '}',
    '',
  ].join('\n'), { mode: 0o600 })
  try {
    execFileSync('javac', ['-cp', classPath, source], { stdio: 'ignore' })
    return execFileSync('java', ['-cp', `${directory}:${classPath}`, 'BcryptStdin'], {
      input: password,
      encoding: 'utf8',
    }).trim()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function frameId() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  return `rf_${Array.from(randomBytes(26), byte => alphabet[byte & 31]).join('')}`
}

function frame(type, payload) {
  return { v: 1, type, id: frameId(), ts: Date.now(), payload }
}

function connectPeer({ url, origin, token, cookie, role, peerId, capabilities, publicKey }) {
  const socket = new WebSocket(url, { headers: {
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    ...(cookie === undefined ? {} : { cookie }),
    origin,
  } })
  const inbox = []
  const waiters = []
  let closed
  const closedPromise = new Promise(resolve => { closed = resolve })
  socket.on('message', value => {
    const parsed = JSON.parse(value.toString())
    inbox.push(parsed)
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index]
      if (waiter.predicate(parsed)) {
        waiters.splice(index, 1)
        clearTimeout(waiter.timer)
        waiter.resolve(parsed)
      }
    }
  })
  socket.on('close', (code, reason) => {
    const detail = { code, reason: reason.toString() }
    closed(detail)
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error(`${role} closed while waiting`))
    }
  })
  socket.on('error', error => {
    for (const waiter of waiters.splice(0)) waiter.reject(error)
  })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${role} websocket open timeout`)), 5000)
    socket.once('open', () => {
      clearTimeout(timer)
      socket.send(JSON.stringify(frame('hello', {
        role, deviceId: peerId, capabilities, protocolSha256: PROTOCOL_SHA256,
        ...(publicKey === undefined ? {} : { publicKey }),
      })))
      resolve()
    })
    socket.once('error', reject)
  })
  const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const current = inbox.find(predicate)
    if (current !== undefined) return resolve(current)
    const timer = setTimeout(() => {
      const index = waiters.findIndex(value => value.timer === timer)
      if (index >= 0) waiters.splice(index, 1)
      reject(new Error(`${role} frame timeout`))
    }, timeout)
    waiters.push({ predicate, resolve, reject, timer })
  })
  const send = (type, payload) => socket.send(JSON.stringify(frame(type, payload)))
  return { socket, ready, waitFor, send, closed: closedPromise, inbox }
}

function summarizeIceServers(iceServers) {
  return iceServers.flatMap(server => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
    return urls.filter(Boolean).map(value => {
      const match = /^([a-z][a-z0-9+.-]*):([^?]+)/i.exec(String(value))
      if (match === null) return '<invalid>'
      return `${match[1]}://${match[2]}`
    })
  })
}

async function waitForVite(process) {
  await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('Vite did not start')), 15_000)
    const onData = chunk => {
      output += chunk.toString()
      if (new RegExp(`Local:\\s+http:\\/\\/${REMOTE_VITE_HOST.replaceAll('.', '\\.')}:62209`).test(output)) {
        clearTimeout(timer)
        process.stdout?.removeListener('data', onData)
        process.stderr?.removeListener('data', onData)
        resolve()
      }
    }
    process.stdout?.on('data', onData)
    process.stderr?.on('data', onData)
    process.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    process.once('exit', code => {
      if (code !== null && code !== 0) {
        clearTimeout(timer)
        reject(new Error(`Vite exited before ready (${code})`))
      }
    })
  })
}

const username = `remote_e2e_${Date.now().toString(36)}`
const password = `Rmt!${randomBytes(18).toString('base64url')}Aa9`
const userId = 1761100000000000000n + BigInt(Math.floor(Math.random() * 900000) + 100000)
const installationId = randomUUID()
const controllerId = `ctl_${Array.from(randomBytes(26), byte => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[byte & 31]).join('')}`
const publicKey = randomBytes(32).toString('base64url')
const leaseId = `lease_${randomUUID()}`
let admin
let hostSession
let deviceId
let deviceRevision
let host
let controller
let vite
let stage = 'start'
let cleanup = { accountDisabled: false, deviceRevoked: false, sessionsLoggedOut: false }

const evidence = {
  status: 'FAILED',
  username,
  userId: String(userId),
  installationId,
  controllerId,
  transport: 'relay',
  via: 'vite-proxy',
  network: {
    httpOrigin: BASE,
    directRemoteWs: REMOTE_DIRECT_WS,
    viteOrigin: VITE_ORIGIN,
    viteRemoteWs: REMOTE_VITE_WS,
    tlsEnabled: false,
  },
  cleanup,
}

try {
  stage = 'create-account'
  const passwordHash = bcrypt(password)
  psql([
    'begin;',
    `insert into sys_user (user_id, user_name, nick_name, user_type, email, phone_number, gender, password, status, del_flag, create_time, remark, password_change_required, revision) values (${userId}, ${sql(username)}, ${sql(`Remote E2E ${username}`)}, 'sys_user', ${sql(`${username}@example.test`)}, '', '0', ${sql(passwordHash)}, '0', '0', now(), 'temporary remote authenticated e2e account', false, 0);`,
    `insert into sys_user_role (user_id, role_id) values (${userId}, 1900300000000000001);`,
    'commit;',
  ].join('\n'))

  stage = 'admin-login'
  const adminLogin = await passwordLogin({
    username, password, clientId: 'enterprise-admin', redirectUri: `${BASE}/enterprise/auth/callback`,
  })
  admin = adminLogin.session
  const bootstrap = await admin.expect('/enterprise/admin/v1/bootstrap')
  assert.equal(bootstrap.json.data.member.username, username)

  stage = 'host-login-enroll'
  hostSession = (await passwordLogin({
    username, password, clientId: 'dsh-desktop', installationId,
  })).session
  const enrolled = await hostSession.expect('/enterprise/api/v1/devices/enroll', {
    method: 'POST',
    body: {
      installationId,
      name: `Remote E2E ${username}`,
      platform: 'linux',
      harnessVersion: '0.2.1-rc.5',
      enterpriseBundleVersion: '0.1.0',
    },
  })
  deviceId = enrolled.json.data.id

  stage = 'start-vite'
  if (REMOTE_VITE_EXTERNAL) {
    const response = await fetch(`${VITE_ORIGIN}/`)
    assert.equal(response.status, 200)
  } else {
    vite = spawn('pnpm', ['dev', '--host', REMOTE_VITE_HOST], {
      cwd: fileURLToPath(new URL('../console/', import.meta.url)),
      env: {
        ...process.env,
        CONSOLE_API_ORIGIN: BASE,
        CONSOLE_REMOTE_ORIGIN: process.env.CONSOLE_REMOTE_ORIGIN ?? 'http://127.0.0.1:8090',
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await waitForVite(vite)
  }

  stage = 'host-connect'
  host = connectPeer({
    url: REMOTE_DIRECT_WS,
    origin: VITE_ORIGIN,
    token: hostSession.bearer,
    role: 'host',
    peerId: deviceId,
    capabilities: ['remote.connect', 'host.describe'],
  })
  await host.ready
  await host.waitFor(value => value.type === 'hello.ack')
  stage = 'presence'
  host.send('presence.update', {
    state: 'READY',
    remoteEnabled: true,
    capabilities: ['remote.connect', 'host.describe'],
    lastSeenAt: Date.now(),
  })

  stage = 'list-device'
  let listed
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const list = await admin.expect('/enterprise/admin/v1/remote/devices')
    listed = list.json.data.items.find(value => String(value.deviceId) === String(deviceId))
    if (listed?.online === true) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(listed?.online, true)
  deviceRevision = listed.revision

  stage = 'ticket'
  const ticketResult = await admin.request(`/enterprise/admin/v1/remote/devices/${deviceId}/ticket`, {
    method: 'POST',
    headers: { 'idempotency-key': randomUUID() },
    body: {
      controllerDeviceId: controllerId,
      controllerPublicKey: publicKey,
      requestedCapabilities: ['remote.connect'],
      clientVersion: 'authenticated-vite-e2e',
    },
  })
  assert.equal(ticketResult.response.status, 200, ticketResult.text)
  const ticket = ticketResult.json.data
  evidence.ticket = {
    iceServers: ticket.iceServers.length,
    iceServerEndpoints: summarizeIceServers(ticket.iceServers),
  }

  stage = 'controller-connect-vite'
  controller = connectPeer({
    url: REMOTE_VITE_WS,
    origin: VITE_ORIGIN,
    cookie: admin.cookie,
    role: 'controller',
    peerId: controllerId,
    capabilities: ['remote.connect'],
    publicKey,
  })
  await controller.ready
  await controller.waitFor(value => value.type === 'hello.ack')
  stage = 'connect-accept'
  controller.send('connect.request', {
    linkId: ticket.linkId,
    deviceId: String(deviceId),
    controllerId,
    ticket: ticket.ticket,
    iceServers: ticket.iceServers,
  })
  const hostRequest = await host.waitFor(value => value.type === 'connect.request')
  assert.equal(hostRequest.payload.linkId, ticket.linkId)
  host.send('connect.accept', { linkId: ticket.linkId, expiresAt: Date.now() + 90_000 })
  await controller.waitFor(value => value.type === 'connect.accept')
  controller.send('transport.selected', { linkId: ticket.linkId, kind: 'relay' })
  await host.waitFor(value => value.type === 'transport.selected')
  stage = 'lease-relay'
  controller.send('connection.lease.acquire', { linkId: ticket.linkId, leaseId })
  const acquired = await controller.waitFor(value => value.type === 'connection.lease.acquire')
  assert.ok(acquired.payload.expiresAt)
  controller.send('connection.lease.renew', { linkId: ticket.linkId, leaseId })
  const renewed = await controller.waitFor(value => value.type === 'connection.lease.renew')
  assert.ok(renewed.payload.expiresAt)

  const payload = Buffer.from('authenticated-vite-relay-roundtrip').toString('base64')
  controller.socket.send(JSON.stringify({ v: 1, kind: 'data', linkId: ticket.linkId, seq: 0, payload }))
  const hostRelay = await host.waitFor(value => value.kind === 'data')
  assert.equal(hostRelay.payload, payload)
  host.socket.send(JSON.stringify({ v: 1, kind: 'data', linkId: ticket.linkId, seq: 0, payload }))
  const controllerRelay = await controller.waitFor(value => value.kind === 'data')
  assert.equal(controllerRelay.payload, payload)

  stage = 'revoke-link'
  const revokeLease = await admin.request(`/enterprise/admin/v1/remote/links/${ticket.linkId}/lease/revoke`, {
    method: 'POST', headers: { 'if-match': '0' },
  })
  assert.equal(revokeLease.response.status, 200, revokeLease.text)
  controller.send('connection.lease.renew', { linkId: ticket.linkId, leaseId })
  const close = await Promise.race([
    Promise.all([host.closed, controller.closed]),
    new Promise(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  assert.ok(close)
  assert.equal(close[0].code, 4008)
  assert.equal(close[1].code, 4008)

  stage = 'revoke-device'
  const revoked = await admin.request(`/enterprise/admin/v1/devices/${deviceId}/actions/revoke`, {
    method: 'POST', headers: { 'if-match': String(deviceRevision) },
  })
  assert.equal(revoked.response.status, 200, revoked.text)
  cleanup.deviceRevoked = true

  stage = 'logout'
  const adminLogout = await admin.request('/enterprise/auth/v1/logout', { method: 'POST' })
  const hostLogout = await hostSession.request('/enterprise/auth/v1/logout', { method: 'POST' })
  assert.ok([200, 204].includes(adminLogout.response.status))
  assert.equal(hostLogout.response.status, 403)
  assert.equal(hostLogout.json?.error?.code, 'ENT_DEVICE_REVOKED')
  assert.equal(hostLogout.json?.error?.retryable, false)
  cleanup.sessionsLoggedOut = true
  evidence.status = 'PASS'
  evidence.deviceId = deviceId
  evidence.linkId = ticket.linkId
  evidence.device = { online: true, remoteEnabled: true, revision: deviceRevision }
  evidence.lease = { acquired: true, renewed: true, revoked: true }
  evidence.relayRoundTrip = true
  evidence.closeCodes = { host: close[0].code, controller: close[1].code }
  evidence.logout = { admin: adminLogout.response.status, host: hostLogout.response.status }
} catch (error) {
  evidence.failure = `${stage}:${error instanceof Error ? error.constructor.name : 'unknown'}${error instanceof Error && error.message ? `:${error.message.slice(0, 240)}` : ''}`
  process.exitCode = 1
} finally {
  if (controller?.socket.readyState === WebSocket.OPEN) controller.socket.close()
  if (host?.socket.readyState === WebSocket.OPEN) host.socket.close()
  if (admin && !cleanup.sessionsLoggedOut) {
    try { await admin.request('/enterprise/auth/v1/logout', { method: 'POST' }) } catch {}
  }
  if (hostSession && !cleanup.sessionsLoggedOut) {
    try { await hostSession.request('/enterprise/auth/v1/logout', { method: 'POST' }) } catch {}
  }
  if (deviceId && !cleanup.deviceRevoked && admin) {
    try {
      const latest = await admin.request('/enterprise/admin/v1/devices')
      const current = latest.json?.data?.items?.find(value => String(value.id) === String(deviceId))
      if (current) {
        const revoked = await admin.request(`/enterprise/admin/v1/devices/${deviceId}/actions/revoke`, {
          method: 'POST', headers: { 'if-match': String(current.revision) },
        })
        cleanup.deviceRevoked = revoked.response.status === 200
      }
    } catch {}
  }
  try {
    psql(`update sys_user set status = '1', del_flag = '1', update_time = now(), update_by = user_id where user_id = ${userId}; delete from sys_user_role where user_id = ${userId}; delete from ent_refresh_session where user_id = ${userId};`)
    cleanup.accountDisabled = true
  } catch {}
  if (deviceId) {
    try { redis('DEL', `remote:presence:${deviceId}`) } catch {}
  }
  if (vite && !vite.killed) {
    try { process.kill(-vite.pid, 'SIGTERM') } catch { vite.kill('SIGTERM') }
  }
  evidence.cleanup = cleanup
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({
    status: evidence.status,
    userId: evidence.userId,
    deviceId: evidence.deviceId ?? deviceId,
    linkId: evidence.linkId ?? null,
    via: evidence.via,
    cleanup,
  }))
}

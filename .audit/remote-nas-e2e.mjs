/**
 * [INPUT]: 依赖 NAS 上的 OwnDsh HTTP/Remote listener、临时本地测试账号、ws 客户端、原生 UDP TURN 探针与 Remote wire 常量。
 * [OUTPUT]: 验证跨机器 PKCE、设备注册、Host/Controller Relay、Lease 撤销、TURN Allocate 和设备撤权，并写入无密证据。
 * [POS]: .audit 的 NAS 部署验收器，不修改产品认证、设备或 Remote 实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const WebSocket = require('../plugin/packages/bundle/node_modules/ws')
const BASE = process.env.OWNDSH_E2E_ORIGIN ?? 'http://home-nas:18080'
const ORIGIN = process.env.REMOTE_NAS_ORIGIN ?? BASE
const HOST_WS = process.env.REMOTE_NAS_HOST_WS ?? 'ws://home-nas:18090/remote/ws/v1'
const CONTROLLER_WS = process.env.REMOTE_NAS_CONTROLLER_WS ?? 'ws://home-nas:18080/remote/ws/v1'
const EVIDENCE_PATH = process.env.REMOTE_NAS_EVIDENCE_PATH ?? '.audit/remote-nas-evidence.json'
const PROTOCOL_SHA256 = 'c6ec6febc41a5c971a8a320ced9d4765eafd0da38f6a0c725828cf2c44bf99aa'

process.env.OWNDSH_E2E_ORIGIN = BASE
const { beginAuthorization, ApiSession } = await import('../scripts/v1-e2e-support.mjs')

const TEST_USERNAME = `remote_nas_${Date.now().toString(36)}`
const TEST_PASSWORD = `Rmt!RemoteNAS-${randomBytes(18).toString('base64url')}`
const TEST_USER_ID = 1761100000000000000n + BigInt(Math.floor(Math.random() * 900000) + 100000)
let accountCreated = false

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function remotePsql(statement) {
  return execFileSync('ssh', [
    'home-nas', 'docker', 'exec', '-i', 'owndsh-postgres-1',
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'owndsh', '-d', 'owndsh', '-At',
  ], { input: `${statement}\n`, encoding: 'utf8' }).trim()
}

function bcrypt(password) {
  const directory = mkdtempSync(join(tmpdir(), 'owndsh-remote-nas-bcrypt-'))
  const source = join(directory, 'BcryptStdin.java')
  const classPath = [
    '/Users/cola/.m2/repository/cn/hutool/hutool-crypto/5.8.47/hutool-crypto-5.8.47.jar',
    '/Users/cola/.m2/repository/cn/hutool/hutool-core/5.8.47/hutool-core-5.8.47.jar',
  ].join(':')
  writeFileSync(source, [
    'import cn.hutool.crypto.digest.BCrypt;',
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

function remoteRedisGet(key) {
  assert.match(key, /^global:captcha_codes:[a-f0-9]{32}$/)
  const command = `docker exec owndsh-redis-1 sh -ec 'export REDISCLI_AUTH="$REDIS_PASSWORD"; exec redis-cli --raw GET "$1"' redis-cli ${key}`
  const raw = execFileSync('ssh', ['home-nas', command], { encoding: 'utf8' }).trim()
  return JSON.parse(raw)
}

async function passwordLoginRemote({
  username,
  password,
  clientId,
  redirectUri = clientId === 'enterprise-admin' ? `${BASE}/enterprise/auth/callback` : 'http://127.0.0.1:18080/callback',
  installationId,
}) {
  const flow = await beginAuthorization({ clientId, redirectUri, installationId })
  const source = flow.sources.find(value => value.type === 'LOCAL')
  assert.ok(source, 'LOCAL identity source is unavailable')
  const captchaResponse = await fetch(`${BASE}/auth/code`)
  assert.equal(captchaResponse.status, 200)
  const captcha = (await captchaResponse.json()).data
  const form = new URLSearchParams({
    transactionId: flow.transactionId,
    sourceId: source.id,
    csrfToken: flow.csrfToken,
    username,
    password,
  })
  if (captcha.captchaEnabled) {
    form.set('captchaId', captcha.uuid)
    form.set('captchaCode', remoteRedisGet(`global:captcha_codes:${captcha.uuid}`))
  }
  const passwordResponse = await fetch(`${BASE}/enterprise/auth/v1/password`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
    body: form,
  })
  const passwordBody = await passwordResponse.json()
  assert.equal(passwordResponse.status, 200, JSON.stringify(passwordBody))
  assert.equal(passwordBody.data.next, 'REDIRECT')
  const callback = new URL(passwordBody.data.redirectUri)
  assert.equal(callback.searchParams.get('state'), flow.state)
  const code = callback.searchParams.get('code')
  assert.ok(code)
  if (clientId === 'enterprise-admin') {
    const browserResponse = await fetch(`${BASE}/enterprise/auth/v1/browser-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ code, redirectUri, codeVerifier: flow.verifier }),
    })
    assert.equal(browserResponse.status, 204)
    const setCookie = browserResponse.headers.getSetCookie()[0]
    assert.ok(setCookie)
    return { session: new ApiSession({ cookie: setCookie.split(';', 1)[0] }) }
  }
  const tokenResponse = await fetch(`${BASE}/enterprise/auth/v1/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'authorization_code', code, clientId, redirectUri,
      codeVerifier: flow.verifier, installationId,
    }),
  })
  const tokenBody = await tokenResponse.json()
  assert.equal(tokenResponse.status, 200, JSON.stringify(tokenBody))
  return { session: new ApiSession({ bearer: tokenBody.data.accessToken }) }
}

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const id = prefix => `${prefix}_${Array.from(randomBytes(26), byte => alphabet[byte & 31]).join('')}`

function frame(type, payload) {
  return { v: 1, type, id: id('rf'), ts: Date.now(), payload }
}

function connectPeer({ url, role, peerId, token, cookie, capabilities, publicKey }) {
  const socket = new WebSocket(url, {
    headers: {
      origin: ORIGIN,
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(cookie === undefined ? {} : { cookie }),
    },
  })
  const inbox = []
  const waiters = []
  let resolveClosed
  const closed = new Promise(resolve => { resolveClosed = resolve })
  socket.on('message', value => {
    const parsed = JSON.parse(value.toString())
    inbox.push(parsed)
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index]
      if (!waiter.predicate(parsed)) continue
      waiters.splice(index, 1)
      clearTimeout(waiter.timer)
      waiter.resolve(parsed)
    }
  })
  socket.on('close', (code, reason) => {
    const detail = { code, reason: reason.toString() }
    resolveClosed(detail)
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error(`${role} closed while waiting: ${JSON.stringify(detail)}`))
    }
  })
  socket.on('error', error => {
    for (const waiter of waiters.splice(0)) waiter.reject(error)
  })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${role} websocket open timeout`)), 10_000)
    socket.once('open', () => {
      clearTimeout(timer)
      socket.send(JSON.stringify(frame('hello', {
        role,
        deviceId: peerId,
        capabilities,
        protocolSha256: PROTOCOL_SHA256,
        ...(publicKey === undefined ? {} : { publicKey }),
      })))
      resolve()
    })
    socket.once('error', reject)
  })
  const waitFor = (predicate, timeout = 10_000) => new Promise((resolve, reject) => {
    const current = inbox.find(predicate)
    if (current !== undefined) return resolve(current)
    const timer = setTimeout(() => {
      const index = waiters.findIndex(value => value.timer === timer)
      if (index >= 0) waiters.splice(index, 1)
      reject(new Error(`${role} frame timeout; received=${JSON.stringify(inbox.map(value => value.type ?? value.kind))}`))
    }, timeout)
    waiters.push({ predicate, resolve, reject, timer })
  })
  return {
    socket,
    ready,
    closed,
    waitFor,
    send: (type, payload) => socket.send(JSON.stringify(frame(type, payload))),
  }
}

function summarizeIceServers(iceServers) {
  return iceServers.flatMap(server => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
    return urls.filter(Boolean).map(value => String(value).replace(/\?.*$/, ''))
  })
}

function probeTurnAllocate(iceServer) {
  const target = process.env.REMOTE_NAS_TURN_TARGET ?? '192.168.5.111'
  assert.ok(iceServer.username && iceServer.credential, 'TURN ticket must contain short-lived credentials')
  let output
  try {
    output = execFileSync('python3', [join(process.cwd(), '.audit/turn-allocate.py')], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      env: {
        ...process.env,
        TURN_HOST: target,
        TURN_PORT: '3478',
        TURN_USERNAME: iceServer.username,
        TURN_CREDENTIAL: iceServer.credential,
      },
    })
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.replaceAll(/\s+/g, ' ').trim()
    throw new Error(`TURN Allocate failed for ${target}: ${detail.slice(-240)}`)
  }
  const result = JSON.parse(output.trim())
  assert.equal(result.status, 'PASS', `TURN Allocate did not pass: ${output.slice(-500)}`)
  return result
}

const installationId = randomUUID()
const controllerId = id('ctl')
const publicKey = randomBytes(32).toString('base64url')
const leaseId = id('lease')
const evidence = {
  status: 'FAILED',
  testAccount: TEST_USERNAME,
  network: { origin: ORIGIN, hostWs: HOST_WS, controllerWs: CONTROLLER_WS, tlsEnabled: false },
  cleanup: { deviceRevoked: false, adminLoggedOut: false, hostLoggedOut: false },
}
let admin
let hostSession
let deviceId
let deviceRevision
let host
let controller
let stage = 'start'

try {
  stage = 'create-account'
  const passwordHash = bcrypt(TEST_PASSWORD)
  remotePsql([
    'begin;',
    `insert into sys_user (user_id, user_name, nick_name, user_type, email, phone_number, gender, password, status, del_flag, create_time, remark, password_change_required, revision) values (${TEST_USER_ID}, ${sql(TEST_USERNAME)}, ${sql(TEST_USERNAME)}, 'sys_user', ${sql(`${TEST_USERNAME}@example.test`)}, '', '0', ${sql(passwordHash)}, '0', '0', now(), 'temporary NAS remote authenticated e2e account', false, 0);`,
    `insert into sys_user_role (user_id, role_id) values (${TEST_USER_ID}, 1900300000000000001);`,
    'commit;',
  ].join('\n'))
  accountCreated = true

  stage = 'admin-login'
  admin = (await passwordLoginRemote({
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    clientId: 'enterprise-admin',
    redirectUri: `${BASE}/enterprise/auth/callback`,
  })).session
  const bootstrap = await admin.expect('/enterprise/admin/v1/bootstrap')
  assert.equal(bootstrap.json.data.member.username, TEST_USERNAME)

  stage = 'host-login-enroll'
  hostSession = (await passwordLoginRemote({
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    clientId: 'dsh-desktop',
    installationId,
  })).session
  const enrolled = await hostSession.expect('/enterprise/api/v1/devices/enroll', {
    method: 'POST',
    body: {
      installationId,
      name: `NAS Remote E2E ${installationId.slice(0, 8)}`,
      platform: 'linux',
      harnessVersion: '0.2.1-rc.5',
      enterpriseBundleVersion: '0.1.0',
    },
  })
  deviceId = enrolled.json.data.id

  stage = 'host-connect'
  host = connectPeer({
    url: HOST_WS,
    role: 'host',
    peerId: deviceId,
    token: hostSession.bearer,
    capabilities: ['remote.connect', 'host.describe'],
  })
  await host.ready
  await host.waitFor(value => value.type === 'hello.ack')
  host.send('presence.update', {
    state: 'READY',
    remoteEnabled: true,
    capabilities: ['remote.connect', 'host.describe'],
    lastSeenAt: Date.now(),
  })

  stage = 'presence'
  let listed
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const devices = await admin.expect('/enterprise/admin/v1/remote/devices')
    listed = devices.json.data.items.find(value => String(value.deviceId) === String(deviceId))
    if (listed?.online === true) break
    await new Promise(resolve => setTimeout(resolve, 250))
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
      clientVersion: 'remote-nas-e2e',
    },
  })
  assert.equal(ticketResult.response.status, 200, ticketResult.text)
  const ticket = ticketResult.json.data
  evidence.ticket = {
    linkId: ticket.linkId,
    iceServers: ticket.iceServers.length,
    iceServerEndpoints: summarizeIceServers(ticket.iceServers),
  }

  stage = 'turn-allocate'
  const turnServer = ticket.iceServers.find(value => summarizeIceServers([value]).some(url => url.startsWith('turn:')))
  assert.ok(turnServer, 'the NAS deployment must issue a TURN ICE server')
  evidence.turn = probeTurnAllocate(turnServer)

  stage = 'controller-connect'
  controller = connectPeer({
    url: CONTROLLER_WS,
    role: 'controller',
    peerId: controllerId,
    cookie: admin.cookie,
    capabilities: ['remote.connect'],
    publicKey,
  })
  await controller.ready
  await controller.waitFor(value => value.type === 'hello.ack')
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
  const payload = Buffer.from('nas-cross-machine-relay').toString('base64')
  controller.socket.send(JSON.stringify({ v: 1, kind: 'data', linkId: ticket.linkId, seq: 0, payload }))
  assert.equal((await host.waitFor(value => value.kind === 'data')).payload, payload)
  host.socket.send(JSON.stringify({ v: 1, kind: 'data', linkId: ticket.linkId, seq: 0, payload }))
  assert.equal((await controller.waitFor(value => value.kind === 'data')).payload, payload)

  stage = 'lease-revoke'
  const revokedLease = await admin.request(`/enterprise/admin/v1/remote/links/${ticket.linkId}/lease/revoke`, {
    method: 'POST',
    headers: { 'if-match': '0' },
  })
  assert.equal(revokedLease.response.status, 200, revokedLease.text)
  controller.send('connection.lease.renew', { linkId: ticket.linkId, leaseId })
  const close = await Promise.race([
    Promise.all([host.closed, controller.closed]),
    new Promise(resolve => setTimeout(() => resolve(null), 5_000)),
  ])
  assert.ok(close, 'lease revoke must close both peers')
  assert.equal(close[0].code, 4008)
  assert.equal(close[1].code, 4008)

  stage = 'device-revoke'
  const revokedDevice = await admin.request(`/enterprise/admin/v1/devices/${deviceId}/actions/revoke`, {
    method: 'POST',
    headers: { 'if-match': String(deviceRevision) },
  })
  assert.equal(revokedDevice.response.status, 200, revokedDevice.text)
  evidence.cleanup.deviceRevoked = true

  stage = 'logout'
  const adminLogout = await admin.request('/enterprise/auth/v1/logout', { method: 'POST' })
  const hostLogout = await hostSession.request('/enterprise/auth/v1/logout', { method: 'POST' })
  assert.ok([200, 204].includes(adminLogout.response.status))
  assert.equal(hostLogout.response.status, 403)
  assert.equal(hostLogout.json?.error?.code, 'ENT_DEVICE_REVOKED')
  assert.equal(hostLogout.json?.error?.retryable, false)
  evidence.cleanup.adminLoggedOut = true
  evidence.cleanup.hostLoggedOut = true
  evidence.status = 'PASS'
  evidence.device = { deviceId, online: true, remoteEnabled: true, revision: deviceRevision }
  evidence.relay = { bidirectional: true, leaseAcquired: true, leaseRenewed: true, leaseRevoked: true }
  evidence.closeCodes = { host: close[0].code, controller: close[1].code }
  evidence.logout = { admin: adminLogout.response.status, host: hostLogout.response.status }
} catch (error) {
  evidence.failure = `${stage}:${error instanceof Error ? error.message.slice(0, 240) : 'unknown'}`
  process.exitCode = 1
} finally {
  if (controller?.socket.readyState === WebSocket.OPEN) controller.socket.close()
  if (host?.socket.readyState === WebSocket.OPEN) host.socket.close()
  if (admin && !evidence.cleanup.adminLoggedOut) {
    try { await admin.request('/enterprise/auth/v1/logout', { method: 'POST' }) } catch {}
  }
  if (hostSession && !evidence.cleanup.hostLoggedOut) {
    try { await hostSession.request('/enterprise/auth/v1/logout', { method: 'POST' }) } catch {}
  }
  if (deviceId && admin && !evidence.cleanup.deviceRevoked) {
    try {
      const devices = await admin.request('/enterprise/admin/v1/devices')
      const current = devices.json?.data?.items?.find(value => String(value.id) === String(deviceId))
      if (current) {
        const revoked = await admin.request(`/enterprise/admin/v1/devices/${deviceId}/actions/revoke`, {
          method: 'POST', headers: { 'if-match': String(current.revision) },
        })
        evidence.cleanup.deviceRevoked = revoked.response.status === 200
      }
    } catch {}
  }
  if (accountCreated) {
    try {
      remotePsql([
        `update sys_user set status = '1', del_flag = '1', update_time = now(), update_by = user_id where user_id = ${TEST_USER_ID};`,
        `delete from sys_user_role where user_id = ${TEST_USER_ID};`,
        `delete from ent_refresh_session where user_id = ${TEST_USER_ID};`,
      ].join('\n'))
      evidence.cleanup.accountDisabled = true
    } catch {}
  }
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ status: evidence.status, stage, deviceId: deviceId ?? null, linkId: evidence.ticket?.linkId ?? null, cleanup: evidence.cleanup }))
}

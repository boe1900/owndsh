/**
 * [INPUT]: 依赖真实 Server 的 PKCE 会话、设备注册结果和 Remote WebSocket 协议。
 * [OUTPUT]: 提供可重复执行的 Host/controller Relay 联调，并写入双端关闭证据。
 * [POS]: .audit 的 live Remote 验证器，只记录产品协议结果，不承载业务实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { passwordLogin } from '../scripts/v1-e2e-support.mjs'

const require = createRequire(import.meta.url)
const WebSocket = require('../plugin/packages/bundle/node_modules/ws')
const BASE = 'http://127.0.0.1:8080'
const WS_URL = 'ws://127.0.0.1:8090/remote/ws/v1'
const ORIGIN = 'http://127.0.0.1:5173'
const PROTOCOL_SHA256 = 'c6ec6febc41a5c971a8a320ced9d4765eafd0da38f6a0c725828cf2c44bf99aa'
const hostSession = JSON.parse(readFileSync('.audit/live-session.json', 'utf8'))
const device = JSON.parse(readFileSync('.audit/live-device.json', 'utf8'))
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const frameId = () => `rf_${Array.from(randomBytes(26), byte => alphabet[byte & 31]).join('')}`
const controllerId = `ctl_${Array.from(randomBytes(26), byte => alphabet[byte & 31]).join('')}`
const publicKey = randomBytes(32).toString('base64url')
const leaseId = `lease_${randomUUID()}`

function frame(type, payload) {
  return { v: 1, type, id: frameId(), ts: Date.now(), payload }
}

function connectPeer({ token, cookie, role, peerId, capabilities, publicKey }) {
  const socket = new WebSocket(WS_URL, { headers: {
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    ...(cookie === undefined ? {} : { cookie }),
    origin: ORIGIN,
  }})
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
      waiter.reject(new Error(`${role} closed while waiting; close=${JSON.stringify(detail)}`))
    }
  })
  socket.on('error', error => { for (const waiter of waiters.splice(0)) waiter.reject(error) })
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
      reject(new Error(`${role} frame timeout; received=${JSON.stringify(inbox.map(value => value.type ?? value.kind ?? 'unknown'))}`))
    }, timeout)
    waiters.push({ predicate, resolve, reject, timer })
  })
  const send = (type, payload) => socket.send(JSON.stringify(frame(type, payload)))
  return { socket, ready, waitFor, send, closed: closedPromise, inbox }
}

const host = connectPeer({
  token: hostSession.accessToken,
  role: 'host',
  peerId: device.deviceId,
  capabilities: ['remote.connect', 'host.describe'],
})
await host.ready
await host.waitFor(value => value.type === 'hello.ack')
host.send('presence.update', { state: 'READY', remoteEnabled: true, capabilities: ['remote.connect', 'host.describe'], lastSeenAt: Date.now() })

const adminLogin = await passwordLogin({ username: 'admin', password: process.env.LIVE_ADMIN_PASSWORD, clientId: 'enterprise-admin' })
const admin = adminLogin.session
const list = await admin.request('/enterprise/admin/v1/remote/devices')
const listData = list.json?.data
const listed = listData?.items?.find(value => String(value.deviceId) === String(device.deviceId))
if (list.response.status !== 200 || listed === undefined || listed.online !== true) {
  throw new Error(`remote device did not become online: ${list.response.status} ${JSON.stringify(listData)}`)
}

const ticketResult = await admin.request(`/enterprise/admin/v1/remote/devices/${device.deviceId}/ticket`, {
  method: 'POST',
  headers: { 'idempotency-key': randomUUID() },
  body: {
    controllerDeviceId: controllerId,
    controllerPublicKey: publicKey,
    requestedCapabilities: ['remote.connect'],
    clientVersion: 'live-integration',
  },
})
if (ticketResult.response.status !== 200) throw new Error(`ticket failed: ${ticketResult.response.status} ${ticketResult.text}`)
const ticket = ticketResult.json.data

const controller = connectPeer({
  cookie: admin.cookie,
  role: 'controller',
  peerId: controllerId,
  capabilities: ['remote.connect'],
  publicKey,
})
await controller.ready
await controller.waitFor(value => value.type === 'hello.ack')
controller.send('connect.request', {
  linkId: ticket.linkId,
  deviceId: String(device.deviceId),
  controllerId,
  ticket: ticket.ticket,
  iceServers: ticket.iceServers,
})
const hostRequest = await host.waitFor(value => value.type === 'connect.request')
if (hostRequest.payload.linkId !== ticket.linkId) throw new Error('host received the wrong link')
host.send('connect.accept', { linkId: ticket.linkId, expiresAt: Date.now() + 90_000 })
await controller.waitFor(value => value.type === 'connect.accept')
controller.send('transport.selected', { linkId: ticket.linkId, kind: 'relay' })
await host.waitFor(value => value.type === 'transport.selected')
controller.send('connection.lease.acquire', { linkId: ticket.linkId, leaseId })
const acquired = await controller.waitFor(value => value.type === 'connection.lease.acquire')
if (acquired.payload.expiresAt === undefined) throw new Error('lease acquire did not return expiry')
controller.send('connection.lease.renew', { linkId: ticket.linkId, leaseId })
const renewed = await controller.waitFor(value => value.type === 'connection.lease.renew')
if (renewed.payload.expiresAt === undefined) throw new Error('lease renew did not return expiry')
const payload = Buffer.from('live-relay-roundtrip').toString('base64')
controller.socket.send(JSON.stringify({ v: 1, kind: 'data', linkId: ticket.linkId, seq: 0, payload }))
const hostRelay = await host.waitFor(value => value.kind === 'data')
if (hostRelay.payload !== payload || hostRelay.seq !== 0) throw new Error('host relay payload mismatch')
host.socket.send(JSON.stringify({ v: 1, kind: 'data', linkId: ticket.linkId, seq: 0, payload }))
const controllerRelay = await controller.waitFor(value => value.kind === 'data')
if (controllerRelay.payload !== payload || controllerRelay.seq !== 0) throw new Error('controller relay payload mismatch')

const revoke = await admin.request(`/enterprise/admin/v1/remote/links/${ticket.linkId}/lease/revoke`, {
  method: 'POST',
  headers: { 'if-match': '0' },
})
const revokeBody = revoke.json
const afterRevoke = await new Promise(resolve => setTimeout(() => resolve({host: host.inbox.length, controller: controller.inbox.length}), 400))

controller.send('connection.lease.renew', { linkId: ticket.linkId, leaseId })
const close = await Promise.race([
  Promise.all([host.closed, controller.closed]).then(([hostClose, controllerClose]) => ({
    host: hostClose,
    controller: controllerClose,
  })),
  new Promise(resolve => setTimeout(() => resolve(null), 2000)),
])
if (close === null) throw new Error('lease revoke did not close both live connections after renewal')
if (close.host.code !== 4008 || close.controller.code !== 4008) {
  throw new Error(`lease revoke closed peers with unexpected codes: ${JSON.stringify(close)}`)
}

const evidence = {
  hostHello: true,
  controllerHello: true,
  deviceOnline: listed.online,
  ticket: { linkId: ticket.linkId, iceServers: ticket.iceServers.length },
  connectAccepted: true,
  transport: 'relay',
  leaseAcquire: acquired.payload.expiresAt,
  leaseRenew: renewed.payload.expiresAt,
  relayRoundTrip: true,
  revoke: { status: revoke.response.status, body: revokeBody?.data ?? revokeBody },
  close,
  afterRevoke,
}
const adminLogout = await admin.request('/enterprise/auth/v1/logout', { method: 'POST' })
if (![200, 204].includes(adminLogout.response.status)) {
  throw new Error(`admin logout failed: ${adminLogout.response.status}`)
}
evidence.logout = { admin: adminLogout.response.status }
writeFileSync('.audit/live-remote-evidence.json', JSON.stringify(evidence, null, 2), { mode: 0o600 })
chmodSync('.audit/live-remote-evidence.json', 0o600)
console.log(JSON.stringify({
  status: 'PASS', linkId: ticket.linkId, deviceId: device.deviceId,
  transport: 'relay', relayRoundTrip: true, revokeStatus: revoke.response.status,
  closeCodes: { host: close.host.code, controller: close.controller.code },
}))

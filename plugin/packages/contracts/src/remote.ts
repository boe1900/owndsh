/**
 * [INPUT]: 依赖 Remote v1 JSON schema 冻结的 frame、ID、transport、lease 和 capability 约定。
 * [OUTPUT]: 对外提供 Host/Console 共用的 Remote 类型、边界校验、URL 派生和 control frame parser。
 * [POS]: contracts 的手写 Remote wire facade；业务 RPC 不进入此包，避免 Typert 接缝污染传输核心。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { z } from 'zod'

export const REMOTE_PROTOCOL_VERSION = 1 as const
export const REMOTE_CAPABILITIES = ['remote.connect', 'host.describe'] as const
export const REMOTE_TRANSPORTS = ['lan', 'p2p', 'turn', 'relay'] as const
export type RemoteCapability = (typeof REMOTE_CAPABILITIES)[number]
export type RemoteTransport = (typeof REMOTE_TRANSPORTS)[number]
export type RemoteRole = 'host' | 'controller'

const remoteId = z.string().regex(/^rf_[0-9A-HJKMNP-TV-Z]{26}$/)
const linkId = z.string().regex(/^rln_[0-9A-HJKMNP-TV-Z]{26}$/)
const deviceId = z.string().regex(/^[1-9][0-9]{0,18}$/)
const controllerId = z.string().regex(/^ctl_[0-9A-HJKMNP-TV-Z]{26}$/)
const peerId = z.union([deviceId, controllerId])
const capability = z.enum(REMOTE_CAPABILITIES)
const transport = z.enum(REMOTE_TRANSPORTS)

const base = { v: z.literal(REMOTE_PROTOCOL_VERSION), id: remoteId, ts: z.number().int().nonnegative() }
const payload = z.record(z.string(), z.unknown())

export const zRemoteControlFrame = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('hello'), payload: z.object({ role: z.enum(['host', 'controller']), deviceId: peerId, capabilities: z.array(capability).max(8), protocolSha256: z.string().regex(/^[0-9a-f]{64}$/), publicKey: z.string().optional() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('hello.ack'), payload: z.object({ peerRole: z.enum(['host', 'controller']), protocolSha256: z.string().regex(/^[0-9a-f]{64}$/), serverTime: z.number().int().nonnegative().optional() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('presence.update'), payload: z.object({ state: z.enum(['READY', 'REFRESHING', 'SIGNED_OUT', 'REVOKED']), remoteEnabled: z.boolean(), capabilities: z.array(capability).max(8), lastSeenAt: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('connect.request'), payload: z.object({ linkId, deviceId, controllerId, ticket: z.string().min(32).max(512), controllerPublicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(), hostPublicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(), iceServers: z.array(z.object({ urls: z.union([z.string().url(), z.array(z.string().url()).min(1).max(8)]), username: z.string().max(256).optional(), credential: z.string().max(512).optional() }).strict()).max(8) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('connect.accept'), payload: z.object({ linkId, expiresAt: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('connect.reject'), payload: z.object({ linkId, code: z.enum(['ENT_AUTH_REQUIRED', 'ENT_DEVICE_REVOKED', 'ENT_PERMISSION_DENIED', 'ENT_REMOTE_BUSY', 'ENT_REMOTE_UNAVAILABLE']) }).strict() }).strict(),
  z.object({ ...base, type: z.enum(['signal.offer', 'signal.answer', 'signal.candidate']), payload: z.object({ linkId, body: z.record(z.string(), z.unknown()) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('transport.selected'), payload: z.object({ linkId, kind: transport }).strict() }).strict(),
  z.object({ ...base, type: z.literal('secure.handshake'), payload: z.object({ linkId, message: z.string().max(4096), counter: z.number().int().nonnegative() }).strict() }).strict(),
  z.object({ ...base, type: z.enum(['connection.lease.acquire', 'connection.lease.renew', 'connection.lease.release']), payload: z.object({ linkId, leaseId: z.string().min(16).max(128), expiresAt: z.number().int().nonnegative().optional() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('error'), payload: z.object({ code: z.string().regex(/^ENT_[A-Z0-9_]+$/), message: z.string().min(1).max(500), retryable: z.boolean().optional() }).strict() }).strict(),
])

export const zRemoteRelayFrame = z.object({
  v: z.literal(REMOTE_PROTOCOL_VERSION),
  kind: z.enum(['data', 'ping', 'close']),
  linkId,
  seq: z.number().int().nonnegative(),
  payload: z.string().optional(),
  code: z.string().max(64).optional(),
}).strict().superRefine((frame, context) => {
  if (frame.kind === 'data' && frame.payload === undefined) context.addIssue({ code: 'custom', path: ['payload'], message: 'data relay frames require payload' })
  if (frame.kind === 'close' && frame.code === undefined) context.addIssue({ code: 'custom', path: ['code'], message: 'close relay frames require code' })
})

export const zRemoteRpcEnvelope = z.object({
  v: z.literal(REMOTE_PROTOCOL_VERSION),
  kind: z.enum(['request', 'response', 'error', 'cancel']),
  requestId: z.string().regex(/^rpc_[0-9A-HJKMNP-TV-Z]{26}$/),
  counter: z.number().int().nonnegative(),
  method: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/).optional(),
  ciphertext: z.string().min(1),
}).strict().superRefine((frame, context) => {
  if (frame.kind === 'request' && frame.method === undefined) context.addIssue({ code: 'custom', path: ['method'], message: 'request envelopes require method' })
  if (frame.kind !== 'request' && frame.method !== undefined) context.addIssue({ code: 'custom', path: ['method'], message: 'only request envelopes carry method' })
})

export type RemoteControlFrame = z.infer<typeof zRemoteControlFrame>
export type RemoteRelayFrame = z.infer<typeof zRemoteRelayFrame>
export type RemoteRpcEnvelope = z.infer<typeof zRemoteRpcEnvelope>
export type RemoteConnectionState = 'IDLE' | 'CONNECTING' | 'AUTHENTICATED' | 'READY' | 'CLOSING' | 'CLOSED' | 'REVOKED'

export function parseRemoteControlFrame(value: unknown): RemoteControlFrame {
  return zRemoteControlFrame.parse(value)
}

export function parseRemoteRelayFrame(value: unknown): RemoteRelayFrame {
  return zRemoteRelayFrame.parse(value)
}

export function remoteWebSocketUrl(baseUrl: string | URL): string {
  const url = new URL('/remote/ws/v1', baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function isRemoteCapability(value: string): value is RemoteCapability {
  return (REMOTE_CAPABILITIES as readonly string[]).includes(value)
}

export function isRemoteTransport(value: string): value is RemoteTransport {
  return (REMOTE_TRANSPORTS as readonly string[]).includes(value)
}

/**
 * [INPUT]: 依赖 Remote v1 lifecycle 和稳定错误码。
 * [OUTPUT]: 对外提供 controller 连接状态机、可观测阶段和错误文案映射。
 * [POS]: features/remote 的纯状态模块，页面只消费状态，不重复编排时序。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export type RemoteConnectionState = 'IDLE' | 'TICKET_READY' | 'SIGNALING' | 'NEGOTIATING' | 'SECURE' | 'LEASED' | 'CLOSED' | 'REVOKED' | 'FAILED'

const transitions: Record<RemoteConnectionState, readonly RemoteConnectionState[]> = {
  IDLE: ['TICKET_READY', 'FAILED'],
  TICKET_READY: ['SIGNALING', 'CLOSED', 'FAILED'],
  SIGNALING: ['NEGOTIATING', 'CLOSED', 'FAILED'],
  NEGOTIATING: ['SECURE', 'CLOSED', 'FAILED'],
  SECURE: ['LEASED', 'CLOSED', 'REVOKED', 'FAILED'],
  LEASED: ['CLOSED', 'REVOKED', 'FAILED'],
  CLOSED: ['IDLE'],
  REVOKED: ['IDLE'],
  FAILED: ['IDLE']
}

export function transitionRemoteConnection(from: RemoteConnectionState, to: RemoteConnectionState): RemoteConnectionState {
  if (!transitions[from].includes(to)) throw new Error(`remote transition ${from} -> ${to} is invalid`)
  return to
}

export function remoteErrorMessage(code: string): string {
  return ({
    ENT_AUTH_REQUIRED: '登录已失效，请重新登录。',
    ENT_DEVICE_REVOKED: '设备已撤销，远控已关闭。',
    ENT_PERMISSION_DENIED: '当前账号没有远控权限。',
    ENT_REMOTE_BUSY: '设备已有其他远控连接。',
    ENT_REMOTE_UNAVAILABLE: '设备当前不在线。',
    ENT_REMOTE_DISABLED: '设备未开启远控。',
    ENT_REMOTE_FEATURE_NOT_SUPPORTED: '设备不支持请求的远控能力。',
    ENT_REMOTE_TURN_NOT_CONFIGURED: '远程中继服务尚未配置。',
    ENT_REMOTE_IDENTITY_UNSUPPORTED: '当前浏览器不支持远控身份密钥。'
  } as Record<string, string>)[code] ?? '远控连接失败，请查看诊断信息。'
}

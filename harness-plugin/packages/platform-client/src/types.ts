/**
 * [INPUT]: 依赖 zod 对详细设计第 8 节 bootstrap 脱敏快照做严格边界校验
 * [OUTPUT]: 对外提供 BootstrapSnapshot、含平台 origin 的 EnterprisePlatformStatus、连接状态与运行时 schema
 * [POS]: platform-client 的无秘密数据契约，隔离中心 HTTP 输入与 Host 内部状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { z } from 'zod'
import { zRequestId, zRevision } from '@enterprise-agent/dsh-contracts'

/** 本地 Client 界面渲染的固定生命周期。 */
export type EnterpriseConnectionState =
  | 'SIGNED_OUT'
  | 'AUTHORIZING'
  | 'ENROLLING'
  | 'BOOTSTRAPPING'
  | 'READY'
  | 'CANCELLED'
  | 'FAILED'
  | 'REFRESHING'
  | 'AUTH_EXPIRED'
  | 'DEVICE_REVOKED'

const numericId = z.string().regex(/^[1-9][0-9]{0,18}$/)
const revision = zRevision
const installationId = z.uuid().regex(
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/,
)

/** 严格脱敏 bootstrap 响应主体；凭据和 Session 正文没有 schema 席位。 */
export const zBootstrapSnapshot = z.object({
  revision,
  user: z.object({
    id: numericId,
    username: z.string().min(1).max(100),
    displayName: z.string().min(1).max(120),
    departmentId: numericId.nullable(),
  }).strict(),
  device: z.object({
    id: numericId,
    installationId,
    status: z.literal('ACTIVE'),
  }).strict(),
  models: z.array(z.object({
    alias: z.string().min(1).max(120),
    displayName: z.string().min(1).max(120),
    contextWindow: z.number().int().positive().safe(),
    maxOutputTokens: z.number().int().positive().safe(),
    reasoning: z.boolean(),
    isDefault: z.boolean(),
  }).strict()),
  quotas: z.array(z.object({
    policyId: numericId,
    scope: z.enum(['DEFAULT', 'DEPT', 'USER']),
    dailyTokenLimit: z.number().int().nonnegative().safe(),
    monthlyTokenLimit: z.number().int().nonnegative().safe(),
    rpm: z.number().int().positive().safe(),
    concurrency: z.number().int().positive().safe(),
  }).strict()),
  plugins: z.object({
    revision,
    assignments: z.array(z.object({
      packageName: z.string().min(1).max(214),
      version: z.string().min(1).max(64),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      downloadUrl: z.string().min(1).max(2048),
      required: z.boolean(),
      desiredState: z.literal('INSTALLED'),
    }).strict()),
  }).strict(),
  sessionPolicy: z.object({
    enabled: z.boolean(),
    retentionDays: z.number().int().positive().safe(),
    maxBatchBytes: z.number().int().positive().safe(),
  }).strict(),
}).strict()

export type BootstrapSnapshot = z.infer<typeof zBootstrapSnapshot>

/** bootstrap 快照的标准平台响应 envelope。 */
export const zBootstrapResponse = z.object({
  data: zBootstrapSnapshot,
  requestId: zRequestId,
}).strict()

/** 从当前 bootstrap 拷贝的浏览器安全用户事实。 */
export interface EnterpriseStatusUser {
  readonly id: string
  readonly username: string
  readonly displayName: string
  readonly departmentId: string | null
}

/** 同时通过 ctx.enterprisePlatform 与本地 API 暴露的脱敏状态。 */
export interface EnterprisePlatformStatus {
  readonly state: EnterpriseConnectionState
  readonly bundleVersion: string
  readonly platformUrl: string
  readonly transport: 'webServer.register'
  readonly flowId?: string
  readonly user?: EnterpriseStatusUser
  readonly revision?: number
  readonly connectedAt?: string
  readonly errorCode?: string
}

/** 浏览器登录事务启动后立即返回的结果。 */
export interface EnterpriseLoginFlow {
  readonly flowId: string
}

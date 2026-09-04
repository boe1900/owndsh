/**
 * [INPUT]: 依赖 zod、生成契约、installation 与本地 API 端口，约束 bootstrap 输入及 Service 配置边界
 * [OUTPUT]: 对外提供 BootstrapSnapshot、平台状态/错误、Service 配置与运行时 schema
 * [POS]: platform-client 的公共契约层，隔离中心 HTTP 输入、Host 运行参数与无秘密界面状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { z } from 'zod'
import { zBootstrapQuota, zRequestId, zRevision, type EnterpriseErrorCode } from '@owndsh/contracts'
import type { InstallationOptions } from './installation.js'
import type {
  EnterpriseLocalSessionPort,
  SessionCopyProbeInput,
  SessionCopyProbeResult,
} from './local-api.js'

/** 不携带响应主体或凭据的稳定 Service 失败，并保留经过 Fetch 校验的 Retry-After。 */
export class EnterprisePlatformError extends Error {
  constructor(
    readonly code: EnterpriseErrorCode | 'ENT_AUTH_CANCELLED' | 'ENT_AUTH_TIMEOUT' | 'ENT_PLATFORM_DISPOSED',
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
    readonly requestId?: string,
    readonly retryAfter?: string,
  ) {
    super(message)
    this.name = 'EnterprisePlatformError'
  }
}

/** 平台客户端所需的部署时与 Host 版本事实。 */
export interface EnterprisePlatformConfig {
  readonly baseUrl?: string
  readonly harnessVersion: string
  readonly bundleVersion: string
  readonly bootstrapIntervalMs?: number
  readonly requestTimeoutMs?: number
  readonly disposeTimeoutMs?: number
  readonly callbackTimeoutMs?: number
  readonly dshHome?: string
  readonly installationName?: string
  readonly enableTechnicalProbe?: boolean
  readonly restoreSessionCopy?: (input: SessionCopyProbeInput) => Promise<SessionCopyProbeResult>
}

/** 不进入可序列化 bundle Config 的测试与 carrier seam。 */
export interface EnterprisePlatformInternals {
  readonly fetch?: typeof globalThis.fetch
  readonly openBrowser?: (url: string, signal: AbortSignal) => Promise<void>
  readonly now?: () => Date
  readonly createFlowId?: () => string
  readonly createState?: () => string
  readonly installation?: Omit<InstallationOptions, 'dshHome' | 'name'>
  readonly refreshRetryInitialMs?: number
  readonly refreshRetryMaxMs?: number
  readonly pluginStatus?: () => unknown
  readonly uninstallPlugin?: () => Promise<{ readonly restart?: () => void }>
  readonly sessionSync?: () => EnterpriseLocalSessionPort | undefined
}

/** 本地 Client 界面渲染的固定生命周期。 */
export type EnterpriseConnectionState =
  | 'UNCONFIGURED'
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
const pluginVersionId = numericId
const pluginPackageName = z.string().min(1).max(214)
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/)
const pluginVersion = z.string().min(1).max(64)
  .regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/)
const pluginSha256 = z.string().regex(/^[0-9a-f]{64}$/)
const pluginCompatibility = z.object({
  harnessCommits: z.array(z.string().regex(/^[0-9a-f]{40}$/)).min(1).max(20),
  enterpriseBundleRange: z.string().min(1).max(120),
  operatingSystems: z.array(z.enum(['darwin', 'linux', 'win32'])).min(1).max(3),
}).strict()
const installationId = z.uuid().regex(
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/,
)
const reasoningEfforts = z.object({
  off: z.string().min(1).max(255).nullable().optional(),
  minimal: z.string().min(1).max(255).optional(),
  low: z.string().min(1).max(255).optional(),
  medium: z.string().min(1).max(255).optional(),
  high: z.string().min(1).max(255).optional(),
  xhigh: z.string().min(1).max(255).optional(),
  max: z.string().min(1).max(255).optional(),
}).strict()
const reasoningCompat = z.object({
  thinkingFormat: z.enum([
    'openai', 'qwen', 'qwen-chat-template', 'deepseek', 'zai', 'minimax', 'kimi', 'longcat',
  ]).optional(),
  supportsReasoningEffort: z.boolean().optional(),
}).strict()
const tokenLimitKeys = [
  'fiveHourTokenLimit', 'dailyTokenLimit', 'weeklyTokenLimit', 'monthlyTokenLimit',
] as const
const bootstrapQuota = zBootstrapQuota
  .refine(quota => tokenLimitKeys.every(key => quota[key] === null
    || quota[key] <= BigInt(Number.MAX_SAFE_INTEGER)), 'quota token limit exceeds the client safe integer range')
  .transform(quota => ({
    ...quota,
    fiveHourTokenLimit: quota.fiveHourTokenLimit === null ? null : Number(quota.fiveHourTokenLimit),
    dailyTokenLimit: quota.dailyTokenLimit === null ? null : Number(quota.dailyTokenLimit),
    weeklyTokenLimit: quota.weeklyTokenLimit === null ? null : Number(quota.weeklyTokenLimit),
    monthlyTokenLimit: quota.monthlyTokenLimit === null ? null : Number(quota.monthlyTokenLimit),
  }))

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
    name: z.string().min(1).max(120).optional(),
    apiProtocol: z.enum(['openai-completions', 'openai-responses', 'anthropic-messages']),
    contextWindow: z.number().int().positive().safe().optional(),
    maxTokens: z.number().int().positive().safe().optional(),
    reasoningEfforts: z.union([z.literal(false), reasoningEfforts]).optional(),
    compat: reasoningCompat.optional(),
    isDefault: z.boolean(),
  }).strict()),
  quotas: z.array(bootstrapQuota),
  plugins: z.object({
    revision,
    assignments: z.array(z.object({
      pluginVersionId,
      packageName: pluginPackageName,
      version: pluginVersion,
      sizeBytes: z.number().int().positive().safe(),
      sha256: pluginSha256,
      signatureBase64: z.string().min(86).max(88).regex(/^[A-Za-z0-9+/]{86}==$/),
      compatibility: pluginCompatibility,
      downloadUrl: z.string().min(1).max(2048).nullable(),
      required: z.boolean(),
      desiredState: z.enum(['INSTALLED', 'ABSENT']),
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
  readonly platformUrl: string | null
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

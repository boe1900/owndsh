/**
 * [INPUT]: 依赖 OpenAPI 生成的 fixture manifest/Zod schema、错误状态映射和品牌 ID 公共 API
 * [OUTPUT]: 验证全部正反 fixture、详细设计第 17 节错误码、gateway 严格请求、未知字段与品牌类型隔离
 * [POS]: contracts 的双端协议回归测试之一，与 Java JSON Schema 测试消费相同 fixture 声明
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  decodeEnterpriseError,
  enterpriseErrorHttpStatus,
  parseEnterpriseDeviceId,
  parseEnterpriseUserId,
  parseManagedModelId,
  parsePluginVersionId,
  parseRemoteSessionId,
  zChatCompletionRequest,
  zMyQuotaUsageResponse,
  zQuotaExceededDetails,
  zQuotaPolicyListResponse,
  zQuotaPolicyResponse,
  zQuotaWindowListResponse,
  zRequestConflictDetails,
  zUsageLedgerListResponse,
  type EnterpriseUserId,
} from '../src/index.js'
import * as generatedSchemas from '../src/generated/zod.gen.js'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(PACKAGE_ROOT, '../../..')
const CONTRACT_ROOT = resolve(PROJECT_ROOT, 'contracts')

const expectedErrorStatuses = {
  ENT_INVALID_REQUEST: 400,
  ENT_INVALID_REDIRECT_URI: 400,
  ENT_PKCE_REQUIRED: 400,
  ENT_PLUGIN_ARTIFACT_INVALID: 400,
  ENT_SESSION_FORMAT_UNSUPPORTED: 400,
  ENT_AUTH_REQUIRED: 401,
  ENT_AUTH_CODE_INVALID: 401,
  ENT_PKCE_INVALID: 401,
  ENT_AUTH_SESSION_EXPIRED: 401,
  ENT_PERMISSION_DENIED: 403,
  ENT_DEVICE_REVOKED: 403,
  ENT_MODEL_NOT_ASSIGNED: 403,
  ENT_PLUGIN_NOT_ASSIGNED: 403,
  ENT_RESOURCE_NOT_OWNED: 403,
  ENT_RESOURCE_NOT_FOUND: 404,
  ENT_SESSION_CONTENT_EXPIRED: 404,
  ENT_REVISION_CONFLICT: 409,
  ENT_REQUEST_IN_PROGRESS: 409,
  ENT_REQUEST_ALREADY_COMPLETED: 409,
  ENT_SESSION_SEQ_GAP: 409,
  ENT_SESSION_DIVERGED: 409,
  ENT_SESSION_SOURCE_DEVICE_CONFLICT: 409,
  ENT_IDENTITY_ALREADY_LINKED: 409,
  ENT_DEVICE_ALREADY_BOUND: 409,
  ENT_REQUEST_TOO_LARGE: 413,
  ENT_PLUGIN_ARCHIVE_TOO_LARGE: 413,
  ENT_SESSION_BATCH_TOO_LARGE: 413,
  ENT_QUOTA_DAILY_EXCEEDED: 429,
  ENT_QUOTA_MONTHLY_EXCEEDED: 429,
  ENT_QUOTA_RPM_EXCEEDED: 429,
  ENT_QUOTA_CONCURRENCY_EXCEEDED: 429,
  ENT_UPSTREAM_AUTH_FAILED: 502,
  ENT_UPSTREAM_INVALID_RESPONSE: 502,
  ENT_PLATFORM_UNAVAILABLE: 503,
  ENT_UPSTREAM_UNAVAILABLE: 503,
  ENT_UPSTREAM_TIMEOUT: 504,
} as const

interface FixtureDeclaration {
  readonly file: string
  readonly schema: string
  readonly valid: boolean
  readonly zodExport: string
}

describe('generated enterprise contracts', () => {
  it('accepts and rejects every OpenAPI-declared fixture through Zod', async () => {
    const manifest = JSON.parse(await readFile(
      resolve(CONTRACT_ROOT, 'generated', 'fixtures-manifest.json'),
      'utf8',
    )) as { fixtures: FixtureDeclaration[] }

    for (const fixture of manifest.fixtures) {
      const schema = generatedSchemas[fixture.zodExport as keyof typeof generatedSchemas]
      expect(schema, `missing ${fixture.zodExport}`).toHaveProperty('safeParse')
      const value = JSON.parse(await readFile(resolve(CONTRACT_ROOT, fixture.file), 'utf8'))
      const result = (schema as { safeParse(input: unknown): { success: boolean } }).safeParse(value)
      expect(result.success, fixture.file).toBe(fixture.valid)
    }
  })

  it('matches every stable error code and HTTP status from detailed design section 17', () => {
    expect(Object.fromEntries(Object.keys(expectedErrorStatuses).map(code => [
      code,
      enterpriseErrorHttpStatus(code as keyof typeof expectedErrorStatuses),
    ]))).toEqual(expectedErrorStatuses)
    expect(Object.keys(expectedErrorStatuses)).toHaveLength(36)
  })

  it('strictly decodes known errors and rejects unknown enums or fields', async () => {
    const known = JSON.parse(await readFile(resolve(CONTRACT_ROOT, 'fixtures/quota-error.json'), 'utf8'))
    expect(decodeEnterpriseError(known)).toMatchObject({
      code: 'ENT_QUOTA_DAILY_EXCEEDED',
      retryable: false,
    })
    const unknown = JSON.parse(await readFile(
      resolve(CONTRACT_ROOT, 'fixtures/unknown-error-code.json'),
      'utf8',
    ))
    expect(() => decodeEnterpriseError(unknown)).toThrow()

    const unexpected = JSON.parse(await readFile(
      resolve(CONTRACT_ROOT, 'fixtures/unexpected-error-property.json'),
      'utf8',
    ))
    expect(() => decodeEnterpriseError(unexpected)).toThrow()
  })

  it('constructs validated brands that TypeScript cannot interchange', () => {
    const userId = parseEnterpriseUserId('73001')
    const deviceId = parseEnterpriseDeviceId('73002')
    expect(parseManagedModelId('73003')).toBe('73003')
    expect(parsePluginVersionId('73004')).toBe('73004')
    expect(parseRemoteSessionId('remote-session-1')).toBe('remote-session-1')
    expect(() => parseEnterpriseUserId('not-an-id')).toThrow()

    const consumeUser = (value: EnterpriseUserId): string => value
    expect(consumeUser(userId)).toBe('73001')
    // @ts-expect-error EnterpriseDeviceId must not substitute EnterpriseUserId.
    consumeUser(deviceId)
  })

  it('exports strict T09 quota and usage schemas through the package facade', async () => {
    const fixtures = [
      ['quota-policy-success.json', zQuotaPolicyResponse],
      ['quota-policy-list-success.json', zQuotaPolicyListResponse],
      ['quota-window-list-success.json', zQuotaWindowListResponse],
      ['quota-usage-me-success.json', zMyQuotaUsageResponse],
      ['usage-ledger-list-success.json', zUsageLedgerListResponse],
    ] as const
    for (const [file, schema] of fixtures) {
      const value: unknown = JSON.parse(await readFile(resolve(CONTRACT_ROOT, 'fixtures', file), 'utf8'))
      expect(schema.safeParse(value).success, file).toBe(true)
    }

    expect(zQuotaExceededDetails.safeParse({
      policyId: '1900900000000000001',
      resetsAt: '2026-08-19T00:00:00+08:00',
    }).success).toBe(true)
    expect(zRequestConflictDetails.safeParse({
      originalRequestId: 'req_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      result: 'COMPLETED',
    }).success).toBe(true)

    const windows = JSON.parse(await readFile(
      resolve(CONTRACT_ROOT, 'fixtures', 'quota-window-list-success.json'),
      'utf8',
    )) as { data: Array<Record<string, unknown>> }
    windows.data[0] = { ...windows.data[0], revision: 1 }
    expect(zQuotaWindowListResponse.safeParse(windows).success).toBe(false)
  })

  it('exports the strict T10 gateway request schema through the package facade', async () => {
    const valid = JSON.parse(await readFile(
      resolve(CONTRACT_ROOT, 'fixtures', 'gateway-request-success.json'),
      'utf8',
    )) as unknown
    const forged = JSON.parse(await readFile(
      resolve(CONTRACT_ROOT, 'fixtures', 'gateway-request-route-forgery.json'),
      'utf8',
    )) as unknown
    expect(zChatCompletionRequest.safeParse(valid).success).toBe(true)
    expect(zChatCompletionRequest.safeParse(forged).success).toBe(false)
    expect(zChatCompletionRequest.safeParse({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }],
      stream: true,
    }).success).toBe(false)
    expect(zChatCompletionRequest.safeParse({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello', reasoning_content: 'forged' }],
      stream: true,
    }).success).toBe(false)
  })
})

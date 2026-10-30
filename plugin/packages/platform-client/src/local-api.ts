/**
 * [INPUT]: 依赖 Harness `ctx.webServer.register()` route port、平台操作端口及组合层注入的插件动作端口
 * [OUTPUT]: 提供账号/配置按需刷新与技能目录、安装/更新操作的严格同源 JSON 路由，无常驻状态连接
 * [POS]: platform-client 的 Host/Client 同源协作边界，只序列化脱敏 DTO 并把认证 HTTP 留在 Host Service
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  BootstrapSnapshot,
  EnterpriseLoginFlow,
  EnterprisePlatformStatus,
} from './types.js'
import type { EnterpriseAvailableSkill, EnterpriseInstalledSkill } from './skill-runtime.js'
import { isSkillName } from '@deepseek-ai/dsh-skill'

const LOCAL_API_PREFIX = '/enterprise/api/v1/local'
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
const MAX_LOCAL_BODY_BYTES = 256 * 1024

/** Harness `ctx.webServer` Service 公开的 route 结构。 */
export interface WebServerRoutePort {
  readonly host: '127.0.0.1' | '0.0.0.0'
  readonly port: number
  register(route: {
    readonly kind: 'exact' | 'prefix'
    readonly path: string
    readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

/** 挂载到本地同源 API 的脱敏 Service 操作端口。 */
export interface EnterpriseLocalPlatformPort {
  status(): EnterprisePlatformStatus
  refresh(): Promise<EnterprisePlatformStatus>
  setServerUrl(serverUrl: string): Promise<{ readonly serverUrl: string }>
  startLogin(): Promise<EnterpriseLoginFlow>
  cancelLogin(): boolean
  logout(): Promise<void>
  bootstrap(): BootstrapSnapshot | undefined
  skills?(): Promise<readonly EnterpriseInstalledSkill[]>
  availableSkills?(): Promise<readonly EnterpriseAvailableSkill[]>
  installSkill?(name: string): Promise<void>
  setSkillEnabled?(name: string, enabled: boolean): Promise<void>
  removeSkill?(name: string): Promise<void>
  skillIcon?(name: string): Promise<Uint8Array | undefined>
  openSkillFile?(name: string): Promise<void>
  openSkillDirectory?(name: string): Promise<void>
}

export interface EnterpriseLocalApiOptions {
  readonly platform: EnterpriseLocalPlatformPort
  /** 由组合层绑定整包卸载；返回的重启动作必须在 HTTP 成功响应写出后才执行。 */
  readonly uninstallPlugin?: () => Promise<{ readonly restart?: () => void }>
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': JSON_CONTENT_TYPE,
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function methodNotAllowed(response: ServerResponse, allow: string): void {
  response.setHeader('allow', allow)
  writeJson(response, 405, { error: { code: 'ENT_INVALID_REQUEST' } })
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error
    && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  return 'ENT_PLATFORM_UNAVAILABLE'
}

function actionErrorStatus(error: unknown): number {
  if (error instanceof RangeError) return 413
  if (error instanceof SyntaxError || error instanceof TypeError) return 400
  const code = errorCode(error)
  if (code === 'ENT_INVALID_REQUEST') return 400
  if (code === 'ENT_PLUGIN_BUSY') return 409
  if (code === 'ENT_AUTH_REQUIRED' || code === 'ENT_AUTH_SESSION_EXPIRED') return 401
  if (code === 'ENT_DEVICE_REVOKED' || code === 'ENT_PERMISSION_DENIED') return 403
  if (code === 'ENT_SOURCE_CREDENTIAL_INVALID') return 400
  if (code === 'ENT_RESOURCE_NOT_FOUND') return 404
  if (code === 'ENT_SKILL_NOT_FOUND') return 404
  return 503
}

function responseErrorCode(error: unknown, status: number): string {
  if (status === 413) return 'ENT_REQUEST_TOO_LARGE'
  const code = errorCode(error)
  if (status === 400 && code !== 'ENT_SOURCE_CREDENTIAL_INVALID') return 'ENT_INVALID_REQUEST'
  return code
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new TypeError('content-type must be application/json')
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.byteLength
    if (total > MAX_LOCAL_BODY_BYTES) throw new RangeError('request body is too large')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

async function requireEmptyObject(request: IncomingMessage): Promise<void> {
  const value = await readJson(request)
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value as Record<string, unknown>).length !== 0) {
    throw new TypeError('action body must be an empty object')
  }
}

function parseServerUrlInput(value: unknown): { readonly serverUrl: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('server URL body must be an object')
  }
  const body = value as Record<string, unknown>
  if (Object.keys(body).join(',') !== 'serverUrl'
    || typeof body['serverUrl'] !== 'string'
    || body['serverUrl'].length === 0
    || body['serverUrl'].length > 2048) {
    throw new TypeError('server URL body is invalid')
  }
  return { serverUrl: body['serverUrl'] }
}

function parseSkillName(value: string): string {
  let name: string
  try { name = decodeURIComponent(value) } catch { throw new TypeError('skill name is invalid') }
  if (!isSkillName(name)) throw new TypeError('skill name is invalid')
  return name
}

function parseSkillEnabledInput(value: unknown): { readonly enabled: boolean } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('skill enabled body is invalid')
  const body = value as Record<string, unknown>
  if (Object.keys(body).join(',') !== 'enabled' || typeof body['enabled'] !== 'boolean') {
    throw new TypeError('skill enabled body is invalid')
  }
  return { enabled: body['enabled'] }
}

function registerSkillAction(
  webServer: WebServerRoutePort,
  action: 'open-file' | 'open-directory',
  handler: (name: string) => Promise<void>,
): () => void {
  return webServer.register({
    kind: 'prefix',
    path: `${LOCAL_API_PREFIX}/skill-actions/${action}`,
    handler: async (request, response) => {
      const prefix = `${LOCAL_API_PREFIX}/skill-actions/${action}`
      const segments = (request.url?.split('?', 1)[0] ?? '').slice(prefix.length).split('/').filter(Boolean)
      if (request.method !== 'POST') { methodNotAllowed(response, 'POST'); return }
      if (segments.length !== 1) {
        writeJson(response, 404, { error: { code: 'ENT_RESOURCE_NOT_FOUND' } })
        return
      }
      try {
        const name = parseSkillName(segments[0]!)
        await requireEmptyObject(request)
        await handler(name)
        writeJson(response, 200, { data: { name, opened: true } })
      } catch (error) {
        const status = actionErrorStatus(error)
        writeJson(response, status, { error: { code: responseErrorCode(error, status) } })
      }
    },
  })
}

function requestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? '/', 'http://enterprise.local')
}

function registerJsonAction(
  webServer: WebServerRoutePort,
  path: string,
  action: () => Promise<unknown>,
): () => void {
  return webServer.register({
    kind: 'exact',
    path: `${LOCAL_API_PREFIX}${path}`,
    handler: async (request, response) => {
      if (request.method !== 'POST') {
        methodNotAllowed(response, 'POST')
        return
      }
      try {
        await requireEmptyObject(request)
        writeJson(response, 200, { data: await action() })
      } catch (error) {
        const status = actionErrorStatus(error)
        writeJson(response, status, {
          error: { code: responseErrorCode(error, status) },
        })
      }
    },
  })
}

/** 以单一事务注册 T06 本地路由，并返回合并 disposer。 */
export function registerEnterpriseLocalApi(
  webServer: WebServerRoutePort,
  options: EnterpriseLocalApiOptions,
): () => void {
  const disposers: (() => void)[] = []

  try {
    disposers.push(registerJsonAction(webServer, '/refresh', () => options.platform.refresh()))
    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/status`,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        writeJson(response, 200, { data: options.platform.status() })
      },
    }))

    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/server`,
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          methodNotAllowed(response, 'POST')
          return
        }
        try {
          const input = parseServerUrlInput(await readJson(request))
          writeJson(response, 200, { data: await options.platform.setServerUrl(input.serverUrl) })
        } catch (error) {
          const status = actionErrorStatus(error)
          writeJson(response, status, {
            error: { code: responseErrorCode(error, status) },
          })
        }
      },
    }))

    disposers.push(registerJsonAction(webServer, '/auth/start', async () => options.platform.startLogin()))
    disposers.push(registerJsonAction(webServer, '/auth/cancel', async () => ({
      cancelled: options.platform.cancelLogin(),
    })))
    disposers.push(registerJsonAction(webServer, '/logout', async () => {
      await options.platform.logout()
      return { loggedOut: true }
    }))

    if (options.uninstallPlugin !== undefined) {
      disposers.push(webServer.register({
        kind: 'exact',
        path: `${LOCAL_API_PREFIX}/uninstall`,
        handler: async (request, response) => {
          if (request.method !== 'POST') {
            methodNotAllowed(response, 'POST')
            return
          }
          try {
            await requireEmptyObject(request)
            const result = await options.uninstallPlugin?.()
            const restart = result?.restart
            writeJson(response, 200, { data: { uninstalled: true, restartRequested: restart !== undefined } })
            restart?.()
          } catch (error) {
            const status = actionErrorStatus(error)
            writeJson(response, status, {
              error: { code: responseErrorCode(error, status) },
            })
          }
        },
      }))
    }

    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/bootstrap`,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        writeJson(response, 200, { data: options.platform.bootstrap() ?? null })
      },
    }))

    if (options.platform.skills !== undefined
      && options.platform.setSkillEnabled !== undefined
      && options.platform.removeSkill !== undefined) disposers.push(webServer.register({
      kind: 'prefix',
      path: `${LOCAL_API_PREFIX}/skills`,
      handler: async (request, response) => {
        const prefix = `${LOCAL_API_PREFIX}/skills`
        const suffix = (request.url?.split('?', 1)[0] ?? '').slice(prefix.length)
        const segments = suffix.split('/').filter(Boolean)
        try {
          if (segments.length === 0) {
            if (request.method !== 'GET') { methodNotAllowed(response, 'GET'); return }
            const skills = await options.platform.skills!()
            writeJson(response, 200, { data: { skills: skills.map(skill => ({
              ...skill,
              ...(options.platform.openSkillFile !== undefined || options.platform.openSkillDirectory !== undefined
                ? { actions: {
                  file: options.platform.openSkillFile !== undefined,
                  directory: options.platform.openSkillDirectory !== undefined,
                } } : {}),
            })) } })
            return
          }
          if (segments.length !== 2) { writeJson(response, 404, { error: { code: 'ENT_RESOURCE_NOT_FOUND' } }); return }
          const name = parseSkillName(segments[0]!)
          if (segments[1] === 'enabled') {
            if (request.method !== 'POST') { methodNotAllowed(response, 'POST'); return }
            const input = parseSkillEnabledInput(await readJson(request))
            await options.platform.setSkillEnabled!(name, input.enabled)
            writeJson(response, 200, { data: { name, enabled: input.enabled } })
            return
          }
          if (segments[1] === 'remove') {
            if (request.method !== 'POST') { methodNotAllowed(response, 'POST'); return }
            await requireEmptyObject(request)
            await options.platform.removeSkill!(name)
            writeJson(response, 200, { data: { name, removed: true } })
            return
          }
          if (segments[1] === 'install' && options.platform.installSkill !== undefined) {
            if (request.method !== 'POST') { methodNotAllowed(response, 'POST'); return }
            await requireEmptyObject(request)
            await options.platform.installSkill(name)
            writeJson(response, 200, { data: { name, installed: true } })
            return
          }
          writeJson(response, 404, { error: { code: 'ENT_RESOURCE_NOT_FOUND' } })
        } catch (error) {
          const status = actionErrorStatus(error)
          writeJson(response, status, {
            error: { code: responseErrorCode(error, status) },
          })
        }
      },
    }))

    if (options.platform.availableSkills !== undefined) disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/skill-catalog`,
      handler: async (request, response) => {
        if (request.method !== 'GET') { methodNotAllowed(response, 'GET'); return }
        try {
          writeJson(response, 200, { data: { skills: await options.platform.availableSkills!() } })
        } catch (error) {
          const status = actionErrorStatus(error)
          writeJson(response, status, { error: { code: errorCode(error) } })
        }
      },
    }))

    for (const [action, handler] of [
      ['open-file', options.platform.openSkillFile],
      ['open-directory', options.platform.openSkillDirectory],
    ] as const) {
      if (handler !== undefined) disposers.push(registerSkillAction(webServer, action, handler))
    }

    if (options.platform.skillIcon !== undefined) disposers.push(webServer.register({
      kind: 'prefix',
      path: `${LOCAL_API_PREFIX}/skill-icons`,
      handler: async (request, response) => {
        const prefix = `${LOCAL_API_PREFIX}/skill-icons`
        const segments = (request.url?.split('?', 1)[0] ?? '').slice(prefix.length).split('/').filter(Boolean)
        if (request.method !== 'GET' || segments.length !== 1) {
          if (request.method !== 'GET') methodNotAllowed(response, 'GET')
          else writeJson(response, 404, { error: { code: 'ENT_RESOURCE_NOT_FOUND' } })
          return
        }
        try {
          const bytes = await options.platform.skillIcon!(parseSkillName(segments[0]!))
          if (bytes === undefined) { writeJson(response, 404, { error: { code: 'ENT_RESOURCE_NOT_FOUND' } }); return }
          response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'image/png', 'x-content-type-options': 'nosniff' })
          response.end(Buffer.from(bytes))
        } catch (error) {
          const status = actionErrorStatus(error)
          writeJson(response, status, { error: { code: responseErrorCode(error, status) } })
        }
      },
    }))

  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

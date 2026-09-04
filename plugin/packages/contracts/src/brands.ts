/**
 * [INPUT]: 依赖 OpenAPI 生成的五类 ID Zod schema
 * [OUTPUT]: 对外提供不可互换的品牌 ID 类型及唯一的 parse 构造函数
 * [POS]: contracts 的语义 ID 边界，防止业务包把跨 HTTP 标识符退化为裸 string
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  zEnterpriseDeviceId,
  zEnterpriseUserId,
  zManagedModelId,
  zPluginVersionId,
  zRemoteSessionId,
} from './generated/zod.gen.js'

declare const enterpriseIdBrand: unique symbol
type EnterpriseId<Name extends string> = string & { readonly [enterpriseIdBrand]: Name }

export type EnterpriseUserId = EnterpriseId<'EnterpriseUserId'>
export type EnterpriseDeviceId = EnterpriseId<'EnterpriseDeviceId'>
export type ManagedModelId = EnterpriseId<'ManagedModelId'>
export type PluginVersionId = EnterpriseId<'PluginVersionId'>
export type RemoteSessionId = EnterpriseId<'RemoteSessionId'>

export const parseEnterpriseUserId = (value: unknown): EnterpriseUserId =>
  zEnterpriseUserId.parse(value) as EnterpriseUserId

export const parseEnterpriseDeviceId = (value: unknown): EnterpriseDeviceId =>
  zEnterpriseDeviceId.parse(value) as EnterpriseDeviceId

export const parseManagedModelId = (value: unknown): ManagedModelId =>
  zManagedModelId.parse(value) as ManagedModelId

export const parsePluginVersionId = (value: unknown): PluginVersionId =>
  zPluginVersionId.parse(value) as PluginVersionId

export const parseRemoteSessionId = (value: unknown): RemoteSessionId =>
  zRemoteSessionId.parse(value) as RemoteSessionId

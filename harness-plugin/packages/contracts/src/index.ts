/**
 * [INPUT]: 依赖品牌 ID、统一错误边界与 OpenAPI 生成的 DTO/Zod/meta 模块
 * [OUTPUT]: 对外提供 dsh-contracts 的稳定公共 API，不导出可替代品牌 ID 的原始 string aliases
 * [POS]: contracts 的 package facade，约束后续 Harness 业务包只消费验证后的跨 HTTP 语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export {
  parseEnterpriseDeviceId,
  parseEnterpriseUserId,
  parseManagedModelId,
  parsePluginVersionId,
  parseRemoteSessionId,
} from './brands.js'
export type {
  EnterpriseDeviceId,
  EnterpriseUserId,
  ManagedModelId,
  PluginVersionId,
  RemoteSessionId,
} from './brands.js'
export {
  decodeEnterpriseError,
  enterpriseErrorHttpStatus,
} from './errors.js'
export type {
  EnterpriseError,
  EnterpriseErrorCode,
  EnterpriseErrorHttpStatus,
} from './errors.js'
export {
  enterpriseErrorStatuses,
  enterpriseProtocolSha256,
} from './generated/enterprise-meta.gen.js'
export type {
  AuthSourcesResponse,
  CursorPage,
  DeletedResourceResponse,
  Device,
  DeviceEnrollRequest,
  DeviceHeartbeatRequest,
  DeviceListResponse,
  DeviceResponse,
  DeviceStatus,
  GroupMapping,
  GroupMappingCreateRequest,
  GroupMappingListResponse,
  GroupMappingResponse,
  IdentitySource,
  IdentitySourceConnection,
  IdentitySourceCreateRequestWritable,
  IdentitySourceListResponse,
  IdentitySourceResponse,
  IdentitySourceTestResponse,
  IdentitySourceUpdateRequestWritable,
  IdentitySourceStatus,
  IdentitySourceType,
  LdapSettings,
  OidcClaimMapping,
  OidcSettings,
  LogoutResponse,
  PasswordLoginRequestWritable,
  PlatformClient,
  ProtocolMetadata,
  ProtocolPageData,
  ProtocolPageResponse,
  ProtocolSuccessResponse,
  QuotaExceededDetails,
  RequestId,
  Revision,
  RevisionConflictDetails,
  TokenRequest,
  TokenResponse,
  ValidationErrorDetails,
} from './generated/types.gen.js'
export {
  zAuthSourcesResponse,
  zCursor,
  zCursorPage,
  zDeletedResourceResponse,
  zDevice,
  zDeviceEnrollRequest,
  zDeviceHeartbeatRequest,
  zDeviceListResponse,
  zDeviceResponse,
  zDeviceStatus,
  zEnterpriseErrorCode,
  zEnterpriseErrorResponse,
  zGroupMappingCreateRequest,
  zGroupMappingListResponse,
  zGroupMappingResponse,
  zIdentitySourceCreateRequestWritable,
  zIdentitySourceListResponse,
  zIdentitySourceResponse,
  zIdentitySourceTestResponse,
  zIdentitySourceUpdateRequestWritable,
  zLogoutResponse,
  zPageLimit,
  zProtocolPageResponse,
  zProtocolSuccessResponse,
  zRequestId,
  zRevision,
  zTokenRequest,
  zTokenResponse,
} from './generated/zod.gen.js'

/**
 * [INPUT]: 依赖 OpenAPI 生成的 listAuditEvents operation 与第 13 节 action/metadata 映射
 * [OUTPUT]: 提供严格 metadata 标量投影、审计筛选和 cursor page API
 * [POS]: api/enterprise/audit 的浏览器信任边界，未知 key 或嵌套值不能进入 React 状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { listAuditEvents as generatedListAuditEvents } from '@/services/enterprise/listAuditEvents';

export const AUDIT_ACTIONS = [
  'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'IDENTITY_SOURCE_CHANGED', 'USER_LINKED',
  'DEVICE_ENROLLED', 'DEVICE_HEARTBEAT', 'DEVICE_REVOKED', 'PROVIDER_CHANGED', 'MODEL_CHANGED',
  'MODEL_GRANT_CHANGED', 'MODEL_REQUEST_ACCEPTED', 'MODEL_REQUEST_FINISHED', 'QUOTA_CHANGED',
  'QUOTA_REJECTED', 'RESERVATION_RECOVERED', 'PLUGIN_UPLOADED', 'PLUGIN_PUBLISHED',
  'PLUGIN_ASSIGNED', 'PLUGIN_DOWNLOADED', 'PLUGIN_INVENTORY_REPORTED', 'SESSION_BATCH_APPENDED',
  'SESSION_EXPORTED', 'SESSION_RESTORED', 'SESSION_CONTENT_READ', 'SESSION_DELETED',
  'SESSION_EXPIRED', 'ROLE_ASSIGNED', 'USER_STATUS_CHANGED', 'CONFIG_CHANGED'
] as const;

export type AuditAction = typeof AUDIT_ACTIONS[number];
export type AuditResult = 'SUCCESS' | 'FAILURE';
export type AuditMetadata = Readonly<Record<string, string | number | boolean>>;

export interface AuditFilters {
  readonly actorId?: string;
  readonly action?: AuditAction;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly result?: AuditResult;
  readonly reasonCode?: string;
  readonly requestId?: string;
  readonly from?: string;
  readonly to?: string;
}

type GeneratedAudit = Awaited<ReturnType<typeof generatedListAuditEvents>>['data']['items'][number];
export type AuditEvent = Omit<GeneratedAudit, 'metadata'> & { readonly metadata: AuditMetadata };

const COMMON_CHANGE = ['operation', 'resourceRevision', 'bootstrapRevision'];
const ALLOWED_KEYS: Record<AuditAction, readonly string[]> = {
  LOGIN_SUCCEEDED: ['clientId', 'sourceType'], LOGIN_FAILED: ['clientId', 'sourceType'], LOGOUT: ['clientId'],
  IDENTITY_SOURCE_CHANGED: [...COMMON_CHANGE, 'sourceType', 'protectedValueChanged'],
  USER_LINKED: ['sourceType', 'userProvisioned', 'externalGroupCount', 'mappedGroupCount', 'unmappedGroupCount', 'departmentConflict'],
  DEVICE_ENROLLED: ['platform', 'created'],
  DEVICE_HEARTBEAT: ['desiredRevision', 'pendingSyncItems', 'hasSuccessfulSync'],
  DEVICE_REVOKED: [],
  PROVIDER_CHANGED: [...COMMON_CHANGE, 'providerType', 'protectedValueChanged'],
  MODEL_CHANGED: [...COMMON_CHANGE, 'reasoning'],
  MODEL_GRANT_CHANGED: [...COMMON_CHANGE, 'subjectType', 'defaultGrant', 'status'],
  MODEL_REQUEST_ACCEPTED: ['modelId', 'reservationId', 'estimatedTokens'],
  MODEL_REQUEST_FINISHED: ['modelId', 'reservationId', 'outcome', 'chargedTokens', 'durationMs', 'failure'],
  QUOTA_CHANGED: ['subjectType', 'status', 'previousRevision', 'currentRevision'],
  QUOTA_REJECTED: ['kind', 'policyId', 'estimatedTokens'],
  RESERVATION_RECOVERED: ['previousState', 'recoveredState'],
  PLUGIN_UPLOADED: ['operation', 'resourceRevision', 'bootstrapRevision', 'itemCount', 'required'],
  PLUGIN_PUBLISHED: ['operation', 'resourceRevision', 'bootstrapRevision', 'itemCount', 'required'],
  PLUGIN_ASSIGNED: ['operation', 'resourceRevision', 'bootstrapRevision', 'itemCount', 'required'],
  PLUGIN_DOWNLOADED: ['operation', 'resourceRevision', 'bootstrapRevision', 'itemCount', 'required'],
  PLUGIN_INVENTORY_REPORTED: ['operation', 'resourceRevision', 'bootstrapRevision', 'itemCount', 'required'],
  SESSION_BATCH_APPENDED: ['fromSeq', 'toSeq', 'eventCount'],
  SESSION_EXPORTED: ['fromSeq', 'toSeq', 'eventCount'],
  SESSION_RESTORED: ['restoredSessionId', 'eventCount'],
  SESSION_CONTENT_READ: ['fromSeq', 'toSeq', 'eventCount'],
  SESSION_DELETED: ['previousStatus', 'eventCount'],
  SESSION_EXPIRED: ['lastSeq', 'eventCount'],
  ROLE_ASSIGNED: ['roleCount'], USER_STATUS_CHANGED: ['previousStatus', 'currentStatus'],
  CONFIG_CHANGED: ['previousRevision', 'currentRevision']
};

function projectMetadata(action: AuditAction, value: unknown): AuditMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('审计 metadata 必须是 object');
  }
  const allowed = new Set(ALLOWED_KEYS[action]);
  const projected: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key) || !['string', 'number', 'boolean'].includes(typeof item)) {
      throw new TypeError(`审计 metadata 字段非法: ${key}`);
    }
    projected[key] = item as string | number | boolean;
  }
  return Object.freeze(projected);
}

export async function listAuditEvents(
  filters: AuditFilters,
  cursor?: string,
  limit = 50
) {
  const response = await generatedListAuditEvents({ ...filters, cursor, limit });
  return {
    ...response,
    data: {
      ...response.data,
      items: response.data.items.map(item => ({
        ...item,
        metadata: projectMetadata(item.action, item.metadata)
      })) as AuditEvent[]
    }
  };
}

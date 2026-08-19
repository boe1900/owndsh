/**
 * [INPUT]: 依赖 OpenAPI 生成的身份源/组映射 operation 与企业 mutation headers
 * [OUTPUT]: 提供身份读取、创建、更新、测试、启停和组映射 API
 * [POS]: api/enterprise/identity 的业务协议边界，所有类型从生成函数推导且不暴露 secret 原值
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createGroupMapping as generatedCreateGroupMapping } from '@/services/enterprise/createGroupMapping';
import { createIdentitySource as generatedCreateIdentitySource } from '@/services/enterprise/createIdentitySource';
import { deleteGroupMapping as generatedDeleteGroupMapping } from '@/services/enterprise/deleteGroupMapping';
import { disableIdentitySource } from '@/services/enterprise/disableIdentitySource';
import { enableIdentitySource } from '@/services/enterprise/enableIdentitySource';
import { getIdentitySource } from '@/services/enterprise/getIdentitySource';
import { getUserExternalIdentitySummary } from '@/services/enterprise/getUserExternalIdentitySummary';
import { listGroupMappings } from '@/services/enterprise/listGroupMappings';
import { listIdentitySources } from '@/services/enterprise/listIdentitySources';
import { testIdentitySource } from '@/services/enterprise/testIdentitySource';
import { updateIdentitySource as generatedUpdateIdentitySource } from '@/services/enterprise/updateIdentitySource';
import { idempotencyHeaders, revisionHeaders } from '../mutation';

export { getIdentitySource, getUserExternalIdentitySummary, listGroupMappings, listIdentitySources };

export type IdentitySource = Awaited<ReturnType<typeof listIdentitySources>>['data']['items'][number];
export type IdentitySourceInput = Parameters<typeof generatedCreateIdentitySource>[0];
export type IdentitySourceUpdateInput = Parameters<typeof generatedUpdateIdentitySource>[1];
export type GroupMapping = Awaited<ReturnType<typeof listGroupMappings>>['data']['items'][number];
export type GroupMappingInput = Parameters<typeof generatedCreateGroupMapping>[0];
export type ExternalIdentitySummary = Awaited<ReturnType<typeof getUserExternalIdentitySummary>>['data'][number];

export function createIdentitySource(body: IdentitySourceInput) {
  return generatedCreateIdentitySource(body, { headers: idempotencyHeaders() });
}

export function updateIdentitySource(sourceId: string, revision: number, body: IdentitySourceUpdateInput) {
  return generatedUpdateIdentitySource({ sourceId }, body, { headers: revisionHeaders(revision) });
}

export function checkIdentitySource(sourceId: string) {
  return testIdentitySource({ sourceId });
}

export function setIdentitySourceEnabled(sourceId: string, revision: number, enabled: boolean) {
  const operation = enabled ? enableIdentitySource : disableIdentitySource;
  return operation({ sourceId }, { headers: revisionHeaders(revision) });
}

export function createGroupMapping(body: GroupMappingInput) {
  return generatedCreateGroupMapping(body, { headers: idempotencyHeaders() });
}

export function deleteGroupMapping(mappingId: string, revision: number) {
  return generatedDeleteGroupMapping({ mappingId }, { headers: revisionHeaders(revision) });
}

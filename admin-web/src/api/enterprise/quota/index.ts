/**
 * [INPUT]: 依赖 OpenAPI 生成的授权/配额/用量 operation 与企业 mutation headers
 * [OUTPUT]: 提供模型授权、配额策略、当前窗口与用量 ledger API
 * [POS]: api/enterprise/quota 的治理协议边界，不在前端计算有效授权或配额
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createModelGrant as generatedCreateGrant } from '@/services/enterprise/createModelGrant';
import { createQuotaPolicy as generatedCreateQuota } from '@/services/enterprise/createQuotaPolicy';
import { deleteModelGrant as generatedDeleteGrant } from '@/services/enterprise/deleteModelGrant';
import { deleteQuotaPolicy as generatedDeleteQuota } from '@/services/enterprise/deleteQuotaPolicy';
import { disableQuotaPolicy } from '@/services/enterprise/disableQuotaPolicy';
import { enableQuotaPolicy } from '@/services/enterprise/enableQuotaPolicy';
import { getQuotaPolicy } from '@/services/enterprise/getQuotaPolicy';
import { getQuotaPolicyWindows } from '@/services/enterprise/getQuotaPolicyWindows';
import { listModelGrants } from '@/services/enterprise/listModelGrants';
import { listQuotaPolicies } from '@/services/enterprise/listQuotaPolicies';
import { listUsageLedger } from '@/services/enterprise/listUsageLedger';
import { updateModelGrant as generatedUpdateGrant } from '@/services/enterprise/updateModelGrant';
import { updateQuotaPolicy as generatedUpdateQuota } from '@/services/enterprise/updateQuotaPolicy';
import { idempotencyHeaders, revisionHeaders } from '../mutation';

export { getQuotaPolicy, getQuotaPolicyWindows, listModelGrants, listQuotaPolicies, listUsageLedger };
export type ModelGrant = Awaited<ReturnType<typeof listModelGrants>>['data']['items'][number];
export type ModelGrantInput = Parameters<typeof generatedCreateGrant>[0];
export type QuotaPolicy = Awaited<ReturnType<typeof listQuotaPolicies>>['data']['items'][number];
export type QuotaPolicyInput = Parameters<typeof generatedCreateQuota>[0];
export type UsageLedgerItem = Awaited<ReturnType<typeof listUsageLedger>>['data']['items'][number];

export function createModelGrant(body: ModelGrantInput) {
  return generatedCreateGrant(body, { headers: idempotencyHeaders() });
}

export function updateModelGrant(grantId: string, revision: number, body: ModelGrantInput) {
  return generatedUpdateGrant({ grantId }, body, { headers: revisionHeaders(revision) });
}

export function deleteModelGrant(grantId: string, revision: number) {
  return generatedDeleteGrant({ grantId }, { headers: revisionHeaders(revision) });
}

export function createQuotaPolicy(body: QuotaPolicyInput) {
  return generatedCreateQuota(body, { headers: idempotencyHeaders() });
}

export function updateQuotaPolicy(quotaId: string, revision: number, body: QuotaPolicyInput) {
  return generatedUpdateQuota({ quotaId }, body, { headers: revisionHeaders(revision) });
}

export function deleteQuotaPolicy(quotaId: string, revision: number) {
  return generatedDeleteQuota({ quotaId }, { headers: revisionHeaders(revision) });
}

export function setQuotaPolicyEnabled(quotaId: string, revision: number, enabled: boolean) {
  const operation = enabled ? enableQuotaPolicy : disableQuotaPolicy;
  return operation({ quotaId }, { headers: revisionHeaders(revision) });
}

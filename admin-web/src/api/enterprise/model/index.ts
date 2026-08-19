/**
 * [INPUT]: 依赖 OpenAPI 生成的 provider/model operation 与企业 mutation headers
 * [OUTPUT]: 提供 provider 和受管模型完整管理 API
 * [POS]: api/enterprise/model 的业务协议边界，只传一次性 credential 且从不缓存其值
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createManagedModel as generatedCreateModel } from '@/services/enterprise/createManagedModel';
import { createModelProvider as generatedCreateProvider } from '@/services/enterprise/createModelProvider';
import { deleteManagedModel as generatedDeleteModel } from '@/services/enterprise/deleteManagedModel';
import { disableManagedModel } from '@/services/enterprise/disableManagedModel';
import { disableModelProvider } from '@/services/enterprise/disableModelProvider';
import { enableManagedModel } from '@/services/enterprise/enableManagedModel';
import { enableModelProvider } from '@/services/enterprise/enableModelProvider';
import { getManagedModel } from '@/services/enterprise/getManagedModel';
import { getModelProvider } from '@/services/enterprise/getModelProvider';
import { listManagedModels } from '@/services/enterprise/listManagedModels';
import { listModelProviders } from '@/services/enterprise/listModelProviders';
import { testModelProvider as generatedTestProvider } from '@/services/enterprise/testModelProvider';
import { updateManagedModel as generatedUpdateModel } from '@/services/enterprise/updateManagedModel';
import { updateModelProvider as generatedUpdateProvider } from '@/services/enterprise/updateModelProvider';
import { idempotencyHeaders, revisionHeaders } from '../mutation';

export { getManagedModel, getModelProvider, listManagedModels, listModelProviders };
export type ModelProvider = Awaited<ReturnType<typeof getModelProvider>>['data'];
export type ModelProviderInput = Parameters<typeof generatedCreateProvider>[0];
export type ModelProviderUpdateInput = Parameters<typeof generatedUpdateProvider>[1];
export type ModelProviderTestInput = Parameters<typeof generatedTestProvider>[1];
export type ManagedModel = Awaited<ReturnType<typeof getManagedModel>>['data'];
export type ManagedModelInput = Parameters<typeof generatedCreateModel>[0];

export function createModelProvider(body: ModelProviderInput) {
  return generatedCreateProvider(body, { headers: idempotencyHeaders() });
}

export function updateModelProvider(providerId: string, revision: number, body: ModelProviderUpdateInput) {
  return generatedUpdateProvider({ providerId }, body, { headers: revisionHeaders(revision) });
}

export function testModelProvider(providerId: string, body: ModelProviderTestInput) {
  return generatedTestProvider({ providerId }, body, { headers: { repeatSubmit: false } });
}

export function setModelProviderEnabled(providerId: string, revision: number, enabled: boolean) {
  const operation = enabled ? enableModelProvider : disableModelProvider;
  return operation({ providerId }, { headers: revisionHeaders(revision) });
}

export function createManagedModel(body: ManagedModelInput) {
  return generatedCreateModel(body, { headers: idempotencyHeaders() });
}

export function updateManagedModel(modelId: string, revision: number, body: ManagedModelInput) {
  return generatedUpdateModel({ modelId }, body, { headers: revisionHeaders(revision) });
}

export function deleteManagedModel(modelId: string, revision: number) {
  return generatedDeleteModel({ modelId }, { headers: revisionHeaders(revision) });
}

export function setManagedModelEnabled(modelId: string, revision: number, enabled: boolean) {
  const operation = enabled ? enableManagedModel : disableManagedModel;
  return operation({ modelId }, { headers: revisionHeaders(revision) });
}

/**
 * [INPUT]: 依赖 OpenAPI 生成的插件管理 operation 与企业 mutation headers
 * [OUTPUT]: 提供 catalog、tgz 上传、发布/退休、全量 assignment 替换和设备 inventory API
 * [POS]: api/enterprise/plugin 的业务协议边界，统一维持幂等与 revision CAS 语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { listPluginInventory } from '@/services/enterprise/listPluginInventory';
import { listPluginPackages } from '@/services/enterprise/listPluginPackages';
import { publishPluginVersion as generatedPublishPluginVersion } from '@/services/enterprise/publishPluginVersion';
import { replacePluginAssignments as generatedReplacePluginAssignments } from '@/services/enterprise/replacePluginAssignments';
import { retirePluginVersion as generatedRetirePluginVersion } from '@/services/enterprise/retirePluginVersion';
import { uploadPluginVersion as generatedUploadPluginVersion } from '@/services/enterprise/uploadPluginVersion';
import { idempotencyHeaders, revisionHeaders } from '../mutation';

export { listPluginInventory, listPluginPackages };
export type PluginPackage = Awaited<ReturnType<typeof listPluginPackages>>['data']['items'][number];
export type PluginVersion = PluginPackage['versions'][number];
export type PluginAssignment = PluginPackage['assignments'][number];
export type PluginAssignmentInput = Parameters<typeof generatedReplacePluginAssignments>[1]['items'][number];
export type PluginCompatibility = Parameters<typeof generatedUploadPluginVersion>[0]['compatibility'];
export type PluginInventoryItem = Awaited<ReturnType<typeof listPluginInventory>>['data']['items'][number];

export function uploadPluginVersion(artifact: File, compatibility: PluginCompatibility) {
  return generatedUploadPluginVersion({ compatibility }, artifact, { headers: idempotencyHeaders() });
}

export function publishPluginVersion(pluginVersionId: string, revision: number) {
  return generatedPublishPluginVersion({ pluginVersionId }, { headers: revisionHeaders(revision) });
}

export function retirePluginVersion(pluginVersionId: string, revision: number) {
  return generatedRetirePluginVersion({ pluginVersionId }, { headers: revisionHeaders(revision) });
}

export function replacePluginAssignments(
  pluginPackageId: string,
  revision: number,
  items: PluginAssignmentInput[]
) {
  return generatedReplacePluginAssignments(
    { pluginPackageId },
    { items },
    { headers: { ...idempotencyHeaders(), ...revisionHeaders(revision) } }
  );
}

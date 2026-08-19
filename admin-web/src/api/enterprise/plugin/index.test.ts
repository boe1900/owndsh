/**
 * [INPUT]: 依赖 Vitest、插件业务 API 与 mock OpenAPI 生成 operation
 * [OUTPUT]: 验证插件写操作的 UUID 幂等键和精确 revision CAS headers
 * [POS]: api/enterprise/plugin 的并发协议门禁，防止页面直接调用无保护 operation
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/enterprise/uploadPluginVersion', () => ({ uploadPluginVersion: vi.fn() }));
vi.mock('@/services/enterprise/publishPluginVersion', () => ({ publishPluginVersion: vi.fn() }));
vi.mock('@/services/enterprise/retirePluginVersion', () => ({ retirePluginVersion: vi.fn() }));
vi.mock('@/services/enterprise/replacePluginAssignments', () => ({ replacePluginAssignments: vi.fn() }));
vi.mock('@/services/enterprise/listPluginPackages', () => ({ listPluginPackages: vi.fn() }));
vi.mock('@/services/enterprise/listPluginInventory', () => ({ listPluginInventory: vi.fn() }));

import { publishPluginVersion as generatedPublish } from '@/services/enterprise/publishPluginVersion';
import { replacePluginAssignments as generatedReplace } from '@/services/enterprise/replacePluginAssignments';
import { retirePluginVersion as generatedRetire } from '@/services/enterprise/retirePluginVersion';
import { uploadPluginVersion as generatedUpload } from '@/services/enterprise/uploadPluginVersion';
import {
  publishPluginVersion,
  replacePluginAssignments,
  retirePluginVersion,
  uploadPluginVersion,
  type PluginCompatibility
} from './index';

const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174000';
const compatibility: PluginCompatibility = {
  harnessCommits: ['99f6f02fecdb7dff40c3fbc9470f5907c29f74ca'],
  enterpriseBundleRange: '>=0.1.0 <0.2.0',
  operatingSystems: ['darwin']
};

describe('plugin mutation headers', () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(IDEMPOTENCY_KEY);
  });

  it('adds an idempotency key to tgz upload', () => {
    const artifact = new File(['fixture'], 'fixture.tgz', { type: 'application/gzip' });
    uploadPluginVersion(artifact, compatibility);

    expect(generatedUpload).toHaveBeenCalledWith(
      { compatibility },
      artifact,
      { headers: { 'Idempotency-Key': IDEMPOTENCY_KEY, repeatSubmit: false } }
    );
  });

  it('uses version revision for publish and retire', () => {
    publishPluginVersion('201', 3);
    retirePluginVersion('201', 4);

    expect(generatedPublish).toHaveBeenCalledWith(
      { pluginVersionId: '201' },
      { headers: { 'If-Match': '3', repeatSubmit: false } }
    );
    expect(generatedRetire).toHaveBeenCalledWith(
      { pluginVersionId: '201' },
      { headers: { 'If-Match': '4', repeatSubmit: false } }
    );
  });

  it('combines idempotency and package revision for atomic assignment replacement', () => {
    const items = [
      {
        pluginVersionId: '201',
        subjectType: 'ALL' as const,
        subjectId: null,
        desiredState: 'INSTALLED' as const,
        required: false
      }
    ];
    replacePluginAssignments('101', 7, items);

    expect(generatedReplace).toHaveBeenCalledWith(
      { pluginPackageId: '101' },
      { items },
      {
        headers: {
          'Idempotency-Key': IDEMPOTENCY_KEY,
          'If-Match': '7',
          repeatSubmit: false
        }
      }
    );
  });
});

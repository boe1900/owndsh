/**
 * [INPUT]: 依赖 Vitest、浏览器 File/FormData/Blob 与插件上传 serializer。
 * [OUTPUT]: 验证 tgz 保持文件 part，compatibility 使用 application/json part。
 * [POS]: features/plugins 的 multipart 契约门禁，防止生成客户端把 JSON part 降级为 text/plain。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { serializePluginUpload } from './plugin-management-page';

describe('plugin upload multipart', () => {
  it('keeps the artifact file and sends compatibility as JSON', async () => {
    const artifact = new File(['plugin'], 'plugin.tgz', { type: 'application/gzip' });
    const compatibility = {
      harnessCommits: ['b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'],
      enterpriseBundleRange: '>=0.1.0 <0.2.0',
      operatingSystems: ['darwin' as const]
    };
    const body = serializePluginUpload({ artifact, compatibility });
    const compatibilityPart = body.get('compatibility');

    expect(body.get('artifact')).toBe(artifact);
    expect(compatibilityPart).toBeInstanceOf(Blob);
    expect((compatibilityPart as Blob).type).toBe('application/json');
    expect(JSON.parse(await (compatibilityPart as Blob).text())).toEqual(compatibility);
  });
});

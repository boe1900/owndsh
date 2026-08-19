/**
 * [INPUT]: 依赖 Node.js 文件系统与 pages/enterprise 的物理目录结构
 * [OUTPUT]: 验证企业业务页面不会命中 Umi model/models 自动发现约定
 * [POS]: src/test 的构建边界回归测试，阻止页面组件被错误注册为全局 model
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const enterprisePages = resolve(process.cwd(), 'src/pages/enterprise');

describe('Umi model discovery boundary', () => {
  it('keeps enterprise page directories outside reserved model names', () => {
    const reservedDirectories = readdirSync(enterprisePages, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^(model|models)$/i.test(entry.name))
      .map(entry => entry.name);

    expect(reservedDirectories).toEqual([]);
  });
});

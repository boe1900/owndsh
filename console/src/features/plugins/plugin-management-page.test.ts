/**
 * [INPUT]: 依赖插件表单的 JSON 配置序列化与生成契约。
 * [OUTPUT]: 验证 npm 默认目标、Git 固定 commit、分类去重与源码地址独立保存。
 * [POS]: features/plugins 的配置边界验收，确保不再构造文件上传。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import { registrationValue } from './plugin-editors';

describe('plugin registration', () => {
  it('registers an exact npm version without a file', () => {
    expect(registrationValue({ packageName: ' @company/plugin ', version: '1.2.3' })).toEqual({
      packageName: '@company/plugin', version: '1.2.3', installation: {
        spec: '@company/plugin@1.2.3', displayName: '@company/plugin', description: '',
        author: '', repositoryUrl: '', categories: []
      }
    });
  });
  it('keeps the installation target separate from repository metadata', () => {
    const spec = `github:company/repo#${'a'.repeat(40)}&path:/packages/plugin`;
    expect(registrationValue({ packageName: 'plugin', version: '1.0.0', spec,
      repositoryUrl: 'https://github.com/company/repo' }, ['tools', ' ui ', 'tools']).installation)
      .toMatchObject({ spec, repositoryUrl: 'https://github.com/company/repo', categories: ['tools', 'ui'] });
  });
});

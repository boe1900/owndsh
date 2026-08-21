/**
 * [INPUT]: 依赖共享 enterprise-auth Playwright 认证夹具源码。
 * [OUTPUT]: 验证 LOCAL 凭据选择器使用精确标签，不会误命中首次改密字段。
 * [POS]: e2e/support 的快速静态回归门禁，在长链候选验收前捕获登录表单选择器歧义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

test('LOCAL login targets exact credential labels', () => {
  const source = readFileSync(resolve(root, 'enterprise-auth.ts'), 'utf8');
  assert.match(source, /getByLabel\('账号', \{ exact: true \}\)/);
  assert.match(source, /getByLabel\('密码', \{ exact: true \}\)/);
  assert.doesNotMatch(source, /getByLabel\('密码'\)\.fill/);
});

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

test('manual candidate acceptance keeps CI bounded and allows a local override', () => {
  const candidate = readFileSync(resolve(root, '../candidate-release.spec.ts'), 'utf8');
  const script = readFileSync(resolve(root, '../../../scripts/t22-candidate.sh'), 'utf8');
  assert.match(candidate, /ENT_T22_MANUAL_ACCEPTANCE_TIMEOUT_MS \?\? '600000'/);
  assert.match(candidate, /timeoutMs < 60_000 \|\| timeoutMs > 24 \* 60 \* 60_000/);
  assert.match(candidate, /test\.setTimeout\(12 \* 60_000 \+ MANUAL_ACCEPTANCE_TIMEOUT_MS\)/);
  assert.match(candidate, /manual candidate acceptance was not released', MANUAL_ACCEPTANCE_TIMEOUT_MS/);
  assert.match(script, /EAP_T22_MANUAL_ACCEPTANCE_TIMEOUT_MS:-600000/);
  assert.match(script, /ENT_T22_MANUAL_ACCEPTANCE_TIMEOUT_MS="\$manual_acceptance_timeout_ms"/);
});

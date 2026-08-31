/**
 * [INPUT]: 依赖 contracts/enterprise-openapi.yaml 协议真源与 @hey-api/openapi-ts。
 * [OUTPUT]: 生成 console-web 专用 TypeScript DTO 和 Fetch client。
 * [POS]: console-web 的协议派生入口，保持管理前端从 OpenAPI 真源生成而不依赖旧 Umi 客户端。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createClient } from '@hey-api/openapi-ts';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

await createClient({
  input: resolve(projectRoot, '../contracts/enterprise-openapi.yaml'),
  output: resolve(projectRoot, 'src/api/generated'),
  plugins: ['@hey-api/typescript', '@hey-api/client-fetch']
});

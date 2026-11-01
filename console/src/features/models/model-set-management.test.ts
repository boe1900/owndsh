/**
 * [INPUT]: 依赖模型集编辑器导出的受管模型筛选函数与 Vitest。
 * [OUTPUT]: 锁定模型集维护按关键词匹配名称、别名、模型 ID、供应商，并保持供应商到连接的两层分组。
 * [POS]: features/models 的模型集筛选逻辑门禁，不渲染具体工作台。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import type { ManagedModel } from '@/api/generated/types.gen';
import { filterModelSetModels, groupModelSetMembers } from './model-set-management';

const models = [
  { id: 'model-openai', providerId: 'provider-openai', connectionId: 'connection-openai', providerName: 'OpenAI', alias: 'gpt-5.6', modelId: 'gpt-5.6', name: 'GPT 5.6', sortOrder: 1, status: 'ACTIVE', revision: 1 },
  { id: 'model-anthropic', providerId: 'provider-anthropic', connectionId: 'connection-anthropic', providerName: 'Anthropic', alias: 'claude-sonnet', modelId: 'claude-sonnet-4', name: 'Claude Sonnet', sortOrder: 2, status: 'ACTIVE', revision: 1 }
] as ManagedModel[];

describe('filterModelSetModels', () => {
  it('matches model metadata and provider filters', () => {
    expect(filterModelSetModels(models, 'sonnet', 'all').map((model) => model.id)).toEqual(['model-anthropic']);
    expect(filterModelSetModels(models, '', 'OpenAI').map((model) => model.id)).toEqual(['model-openai']);
    expect(filterModelSetModels(models, 'gpt', 'Anthropic')).toEqual([]);
  });
});

describe('groupModelSetMembers', () => {
  it('keeps same-provider connections separate so cards show the actual route', () => {
    const members = [
      { ...models[0], id: 'model-openai-primary', connectionId: 'connection-primary', name: 'GPT 5.6' },
      { ...models[0], id: 'model-openai-fallback', connectionId: 'connection-fallback', name: 'GPT 5.6' },
      { ...models[1], id: 'model-anthropic', connectionId: 'connection-anthropic' }
    ] as ManagedModel[];

    expect(groupModelSetMembers(members, new Map([
      ['connection-primary', '生产连接'],
      ['connection-fallback', '备用连接'],
      ['connection-anthropic', 'Anthropic 连接']
    ])).map((group) => [group.providerName, group.connections.map((connection) => [connection.connectionName, connection.models.map((model) => model.id)])])).toEqual([
      ['OpenAI', [['生产连接', ['model-openai-primary']], ['备用连接', ['model-openai-fallback']]]],
      ['Anthropic', [['Anthropic 连接', ['model-anthropic']]]]
    ]);
  });
});

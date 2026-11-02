/**
 * [INPUT]: 依赖模型编辑器导出的 Provider ID 配色规则与 Vitest。
 * [OUTPUT]: 锁定供应商改名后仍保持同一渐变、连接复制的非敏感字段预填规则和推理档位增补顺序。
 * [POS]: features/models 的编辑器规则门禁，不渲染具体表单。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { connectionDraftDefaults, discoveredCapacity, nextReasoningLevel, providerGradient } from './model-editors';

describe('providerGradient', () => {
  it('uses the stable provider id instead of the display name', () => {
    expect(providerGradient('provider-1', 'OpenAI')).toBe(providerGradient('provider-1', 'Renamed provider'));
    expect(providerGradient(undefined, 'Custom provider')).toMatch(/^from-[a-z0-9-]+ to-[a-z0-9-]+$/);
  });
});

describe('discoveredCapacity', () => {
  it('omits missing upstream capacity instead of rendering null', () => {
    expect(discoveredCapacity(null)).toBeUndefined();
    expect(discoveredCapacity(undefined)).toBeUndefined();
    expect(discoveredCapacity(256_000)).toBe('256K');
  });
});

describe('connectionDraftDefaults', () => {
  it('copies connection settings while requiring a new credential', () => {
    const source = {
      id: 'connection-1',
      providerId: 'provider-1',
      providerName: 'Gateway',
      name: '生产连接',
      apiProtocol: 'openai-responses',
      baseUrl: 'https://gateway.example/v1',
      modelDiscoveryPath: '/models',
      credentialConfigured: true,
      status: 'ACTIVE',
      connectTimeoutMs: 8000,
      readTimeoutMs: 90000,
      revision: 1
    } as const;

    expect(connectionDraftDefaults(undefined, source)).toEqual({
      name: '生产连接 副本',
      apiProtocol: 'openai-responses',
      baseUrl: 'https://gateway.example/v1',
      modelDiscoveryPath: '/models',
      connectTimeoutMs: 8000,
      readTimeoutMs: 90000
    });
  });
});

describe('reasoning tiers', () => {
  it('adds the next unused canonical level after the highest configured row', () => {
    expect(nextReasoningLevel([
      { id: 'off', name: 'off', value: null },
      { id: 'low', name: 'low', value: 'low' },
      { id: 'medium', name: 'medium', value: 'medium' },
      { id: 'high', name: 'high', value: 'high' },
    ])).toBe('xhigh');
    expect(nextReasoningLevel([{ id: 'low', name: 'low', value: 'low' }, { id: 'max', name: 'max', value: 'max' }])).toBe('off');
  });
});

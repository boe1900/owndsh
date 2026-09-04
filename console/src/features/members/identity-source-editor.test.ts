/**
 * [INPUT]: 依赖 Vitest 与身份源请求体构造函数。
 * [OUTPUT]: 验证 secret 隔离、LOCAL 固定 LINK_ONLY 与 LDAP 组发现字段请求投影。
 * [POS]: features/members 的 secret 隔离门禁，防止浏览器用空值覆盖服务端密钥。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { buildIdentitySourceRequest, identitySourceDefaults } from './identity-source-editor';

describe('buildIdentitySourceRequest', () => {
  it('keeps create and update secret semantics explicit', () => {
    const value = { ...identitySourceDefaults(), name: 'Entra', issuer: 'https://id.example.com', clientId: 'console' };
    expect(() => buildIdentitySourceRequest(value, false)).toThrow('密钥不能为空');
    expect(buildIdentitySourceRequest({ ...value, secret: 'secret value' }, false)).toMatchObject({ secret: 'secret value' });
    expect(buildIdentitySourceRequest(value, true)).not.toHaveProperty('secret');

    expect(buildIdentitySourceRequest({ ...value, type: 'LOCAL', provisioningMode: 'JIT' }, true))
      .toMatchObject({ type: 'LOCAL', provisioningMode: 'LINK_ONLY' });
  });

  it('projects LDAP group discovery fields', () => {
    expect(buildIdentitySourceRequest({
      ...identitySourceDefaults(),
      type: 'LDAP',
      name: 'Corporate LDAP',
      ldapUrl: 'ldaps://ldap.example.com',
      baseDn: 'ou=people,dc=example,dc=com',
      managerDn: 'cn=reader,dc=example,dc=com',
      groupBaseDn: 'ou=groups,dc=example,dc=com',
      groupFilter: '(objectClass=groupOfNames)',
      groupNameAttribute: 'cn',
      secret: 'manager password'
    }, false)).toMatchObject({
      ldap: {
        groupBaseDn: 'ou=groups,dc=example,dc=com',
        groupFilter: '(objectClass=groupOfNames)',
        groupNameAttribute: 'cn'
      }
    });
  });
});

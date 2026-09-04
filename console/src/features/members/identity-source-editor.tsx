/**
 * [INPUT]: 依赖身份源 OpenAPI DTO、React 本地表单状态、ProductDialog 与浏览器原生校验。
 * [OUTPUT]: 提供 OIDC/LDAP 创建、目录用户/组字段配置、OIDC/LDAP/LOCAL 编辑及不回显 secret 的请求体构造。
 * [POS]: features/members 的身份源写入边界，只短暂持有用户本次输入的 secret，不读取或伪造服务端秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useState } from 'react';
import type {
  IdentitySource,
  IdentitySourceCreateRequestWritable,
  IdentitySourceType,
  IdentitySourceUpdateRequestWritable
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from '@/components/product/Dialog';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:cursor-not-allowed disabled:bg-inset disabled:text-ink-3';

export type IdentitySourceFormValue = {
  type: IdentitySourceType;
  provisioningMode: 'JIT' | 'LINK_ONLY';
  name: string;
  issuer: string;
  clientId: string;
  scopes: string;
  usernameClaim: string;
  displayNameClaim: string;
  emailClaim: string;
  groupsClaim: string;
  ldapUrl: string;
  baseDn: string;
  managerDn: string;
  userFilter: string;
  stableIdAttribute: string;
  usernameAttribute: string;
  displayNameAttribute: string;
  emailAttribute: string;
  groupAttribute: string;
  groupBaseDn: string;
  groupFilter: string;
  groupNameAttribute: string;
  startTls: boolean;
  secret: string;
};

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function identitySourceDefaults(source?: IdentitySource): IdentitySourceFormValue {
  return {
    type: source?.type ?? 'OIDC',
    provisioningMode: source?.type === 'LOCAL' ? 'LINK_ONLY' : source?.provisioningMode ?? 'JIT',
    name: source?.name ?? '',
    issuer: source?.issuer ?? '',
    clientId: source?.clientId ?? '',
    scopes: source?.oidc?.scopes.join(' ') ?? 'openid profile email',
    usernameClaim: source?.oidc?.claims.username ?? 'preferred_username',
    displayNameClaim: source?.oidc?.claims.displayName ?? 'name',
    emailClaim: source?.oidc?.claims.email ?? 'email',
    groupsClaim: source?.oidc?.claims.groups ?? '',
    ldapUrl: source?.ldap?.url ?? '',
    baseDn: source?.ldap?.baseDn ?? '',
    managerDn: source?.ldap?.managerDn ?? '',
    userFilter: source?.ldap?.userFilter ?? '(uid={0})',
    stableIdAttribute: source?.ldap?.stableIdAttribute ?? 'entryUUID',
    usernameAttribute: source?.ldap?.usernameAttribute ?? 'uid',
    displayNameAttribute: source?.ldap?.displayNameAttribute ?? 'displayName',
    emailAttribute: source?.ldap?.emailAttribute ?? 'mail',
    groupAttribute: source?.ldap?.groupAttribute ?? 'memberOf',
    groupBaseDn: source?.ldap?.groupBaseDn ?? source?.ldap?.baseDn ?? '',
    groupFilter: source?.ldap?.groupFilter ?? '(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=group))',
    groupNameAttribute: source?.ldap?.groupNameAttribute ?? 'cn',
    startTls: source?.ldap?.startTls ?? false,
    secret: ''
  };
}

export function buildIdentitySourceRequest(value: IdentitySourceFormValue, editing: boolean): IdentitySourceCreateRequestWritable | IdentitySourceUpdateRequestWritable {
  if (value.name.trim() === '') throw new TypeError('名称不能为空');
  if (!editing && value.secret.length === 0) throw new TypeError('密钥不能为空');
  const common = {
    type: value.type,
    provisioningMode: value.type === 'LOCAL' ? 'LINK_ONLY' as const : value.provisioningMode,
    name: value.name.trim()
  };
  const config = value.type === 'OIDC' ? {
    ...common,
    issuer: value.issuer.trim(),
    clientId: value.clientId.trim(),
    oidc: {
      scopes: [...new Set(value.scopes.split(/\s+/).filter(Boolean))],
      claims: {
        username: value.usernameClaim.trim(),
        displayName: value.displayNameClaim.trim(),
        email: optional(value.emailClaim),
        groups: optional(value.groupsClaim)
      }
    }
  } : value.type === 'LDAP' ? {
    ...common,
    ldap: {
      url: value.ldapUrl.trim(),
      baseDn: value.baseDn.trim(),
      managerDn: value.managerDn.trim(),
      userFilter: value.userFilter.trim(),
      stableIdAttribute: value.stableIdAttribute.trim(),
      usernameAttribute: value.usernameAttribute.trim(),
      displayNameAttribute: value.displayNameAttribute.trim(),
      emailAttribute: optional(value.emailAttribute),
      groupAttribute: optional(value.groupAttribute),
      groupBaseDn: optional(value.groupBaseDn),
      groupFilter: optional(value.groupFilter),
      groupNameAttribute: optional(value.groupNameAttribute),
      startTls: value.startTls
    }
  } : common;
  return editing
    ? { ...config, ...(value.secret.length > 0 ? { secret: value.secret } : {}) }
    : { ...config, secret: value.secret };
}

function TextField({
  autoComplete,
  label,
  onChange,
  placeholder,
  required = false,
  type = 'text',
  value
}: {
  autoComplete?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'url' | 'password';
  value: string;
}) {
  return (
    <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
      {label}
      <input className={inputClass} type={type} required={required} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function IdentitySourceEditorDialog({
  current,
  error,
  onClose,
  onSave,
  saving
}: {
  current?: IdentitySource;
  error?: string;
  onClose: () => void;
  onSave: (value: IdentitySourceCreateRequestWritable | IdentitySourceUpdateRequestWritable) => void;
  saving: boolean;
}) {
  const [value, setValue] = useState(() => identitySourceDefaults(current));
  const [validationError, setValidationError] = useState<string>();
  const set = <K extends keyof IdentitySourceFormValue>(key: K, next: IdentitySourceFormValue[K]) => setValue((previous) => ({ ...previous, [key]: next }));
  const submit = () => {
    try {
      setValidationError(undefined);
      onSave(buildIdentitySourceRequest(value, current !== undefined));
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : '身份源配置不合法');
    }
  };

  return (
    <ProductDialog className="max-w-[680px]" title={current ? '编辑身份源' : '新建身份源'} onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
          类型
          <select className={inputClass} value={value.type} disabled={current !== undefined} onChange={(event) => set('type', event.target.value as IdentitySourceType)}>
            {current?.type === 'LOCAL' ? <option value="LOCAL">LOCAL</option> : <><option value="OIDC">OIDC</option><option value="LDAP">LDAP</option></>}
          </select>
        </label>
        <TextField label="名称" required value={value.name} onChange={(next) => set('name', next)} />
        {value.type !== 'LOCAL' ? (
          <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
            首次登录
            <select className={inputClass} value={value.provisioningMode} onChange={(event) => set('provisioningMode', event.target.value as IdentitySourceFormValue['provisioningMode'])}>
              <option value="JIT">JIT 自动创建成员</option>
              <option value="LINK_ONLY">仅绑定已有成员</option>
            </select>
          </label>
        ) : null}
        {value.type === 'OIDC' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><TextField label="Issuer" type="url" required placeholder="https://id.example.com" value={value.issuer} onChange={(next) => set('issuer', next)} /></div>
            <TextField label="Client ID" required value={value.clientId} onChange={(next) => set('clientId', next)} />
            <TextField label="Scopes" required value={value.scopes} onChange={(next) => set('scopes', next)} />
            <TextField label="用户名 claim" required value={value.usernameClaim} onChange={(next) => set('usernameClaim', next)} />
            <TextField label="显示名 claim" required value={value.displayNameClaim} onChange={(next) => set('displayNameClaim', next)} />
            <TextField label="邮箱 claim" value={value.emailClaim} onChange={(next) => set('emailClaim', next)} />
            <TextField label="组 claim" value={value.groupsClaim} onChange={(next) => set('groupsClaim', next)} />
          </div>
        ) : null}
        {value.type === 'LDAP' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><TextField label="LDAP URL" type="url" required placeholder="ldaps://ldap.example.com:636" value={value.ldapUrl} onChange={(next) => set('ldapUrl', next)} /></div>
            <TextField label="Base DN" required value={value.baseDn} onChange={(next) => set('baseDn', next)} />
            <TextField label="Manager DN" required value={value.managerDn} onChange={(next) => set('managerDn', next)} />
            <TextField label="用户过滤器" required value={value.userFilter} onChange={(next) => set('userFilter', next)} />
            <TextField label="稳定 ID 属性" required value={value.stableIdAttribute} onChange={(next) => set('stableIdAttribute', next)} />
            <TextField label="用户名属性" required value={value.usernameAttribute} onChange={(next) => set('usernameAttribute', next)} />
            <TextField label="显示名属性" required value={value.displayNameAttribute} onChange={(next) => set('displayNameAttribute', next)} />
            <TextField label="邮箱属性" value={value.emailAttribute} onChange={(next) => set('emailAttribute', next)} />
            <TextField label="用户的组 DN 属性" value={value.groupAttribute} onChange={(next) => set('groupAttribute', next)} />
            <TextField label="组 Base DN" value={value.groupBaseDn} onChange={(next) => set('groupBaseDn', next)} />
            <TextField label="组过滤器" value={value.groupFilter} onChange={(next) => set('groupFilter', next)} />
            <TextField label="组名称属性" value={value.groupNameAttribute} onChange={(next) => set('groupNameAttribute', next)} />
            <label className="flex items-center gap-2 self-end pb-2 text-[12.5px] font-medium text-ink-2"><input type="checkbox" checked={value.startTls} onChange={(event) => set('startTls', event.target.checked)} />StartTLS</label>
          </div>
        ) : null}
        {value.type !== 'LOCAL' ? <TextField label={current ? '替换密钥（留空保留）' : value.type === 'OIDC' ? 'Client Secret' : 'Manager Password'} type="password" required={!current} autoComplete="new-password" value={value.secret} onChange={(next) => set('secret', next)} /> : null}
        {validationError || error ? <p role="alert" className="m-0 text-[12.5px] text-red">{validationError ?? error}</p> : null}
        <footer className="-mx-5 -mb-5 mt-1 flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button type="button" size="sm" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? '保存中' : '保存'}</Button>
        </footer>
      </form>
    </ProductDialog>
  );
}

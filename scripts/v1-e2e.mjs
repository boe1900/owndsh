/**
 * [INPUT]: 依赖 V1 验收矩阵、真实 HTTP(S) 部署、临时 LDAPS、可控 OIDC/模型 fixture 与环境注入管理员凭据。
 * [OUTPUT]: 执行 E01-E48 的表驱动真实链路验收，输出不含秘密的 JSON 证据并记录精确测试资源。
 * [POS]: scripts 的 V1 发布验收主执行器；复用产品 API 和锁定 Harness，不复制业务判断或放宽生产校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import {
  Acceptance,
  ADMIN_REDIRECT,
  ApiSession,
  COMPOSE_PROJECT,
  ORIGIN,
  POSTGRES_CONTAINER,
  SERVER_CONTAINER,
  assert,
  beginAuthorization,
  dockerInspect,
  oidcLogin,
  passwordLogin,
  psql,
  submitPassword,
} from './v1-e2e-support.mjs';
import { startV1E2eFixture } from './v1-e2e-fixture.mjs';
import { runHarnessScenarios } from './v1-e2e-harness.mjs';
import { runModelAndQuotaScenarios } from './v1-e2e-models.mjs';

const adminUsername = process.env.OWNDSH_E2E_ADMIN_USERNAME ?? 'candidate.admin';
const adminPassword = process.env.OWNDSH_E2E_ADMIN_PASSWORD;
assert.ok(adminPassword, 'OWNDSH_E2E_ADMIN_PASSWORD is required');

const runId = randomBytes(4).toString('hex');
const prefix = `v1e2e-${runId}`;
const memberUsername = `${prefix}-user`.slice(0, 30);
const sharedUsername = `${prefix}-same`.slice(0, 30);
const initialPassword = `V1!Initial-${runId}-Password`;
const memberPassword = `V1!Member-${runId}-Password`;
const changedPassword = `V1!Changed-${runId}-Password`;
const ldapPassword = 'ldap-password-73';
const ldapAdminPassword = process.env.OWNDSH_E2E_LDAP_ADMIN_PASSWORD ?? 'v1e2e-ldap-admin-2026';
const ldapContainer = process.env.OWNDSH_E2E_LDAP_CONTAINER ?? 'v1e2e-ldap-20260903';
const ldapUrl = `ldaps://${ldapContainer}:636`;
const acceptance = new Acceptance();
const fixture = await startV1E2eFixture();
fixture.setOidcUsername(sharedUsername);

const state = {
  runId,
  prefix,
  users: [],
  identitySources: [],
  accessGroups: [],
  mappings: [],
  providers: [],
  models: [],
  modelSets: [],
  grants: [],
  quotas: [],
  devices: [],
  pluginPackages: [],
  pluginVersions: [],
  pluginAssignments: [],
};

function data(result) {
  return result.json?.data;
}

function idOf(result) {
  const value = data(result)?.id;
  assert.match(String(value), /^[1-9][0-9]{0,18}$/);
  return String(value);
}

function ldapInput(input) {
  return execFileSync('docker', [
    'exec', '-i', ldapContainer,
    input.action,
    '-x', '-H', 'ldaps://127.0.0.1:636',
    '-D', 'cn=admin,dc=example,dc=org', '-w', ldapAdminPassword,
  ], { encoding: 'utf8', input: input.ldif });
}

async function passwordStep(username, password, sourceType = 'LOCAL', sourceId) {
  const flow = await beginAuthorization();
  const source = sourceId === undefined
    ? flow.sources.find(value => value.type === sourceType)
    : flow.sources.find(value => value.id === String(sourceId));
  assert.ok(source);
  return { flow, source, step: await submitPassword(flow, { sourceId: source.id, username, password }) };
}

async function createMember(admin, username, password = initialPassword) {
  const created = await admin.create('/enterprise/admin/v1/members', {
    username,
    displayName: `V1 E2E ${username}`,
    email: `${username}@example.test`,
    initialPassword: password,
  });
  const member = data(created).member;
  state.users.push(member.id);
  return data(created);
}

async function setRoles(admin, detail, roles) {
  const changed = await admin.update(
    `/enterprise/admin/v1/members/${detail.member.id}/roles`,
    detail.member.revision,
    { roles },
  );
  return data(changed);
}

async function createIdentitySource(admin, body) {
  const created = await admin.create('/enterprise/admin/v1/identity-sources', body);
  state.identitySources.push(idOf(created));
  return data(created);
}

async function expectDenied(session, path, statuses = [401, 403]) {
  const result = await session.request(path);
  assert.ok(statuses.includes(result.response.status), `${path} returned ${result.response.status}`);
  return result.response.status;
}

async function runDeploymentAndAuth() {
  await acceptance.check('E01', 'HTTP(S) deployment topology is healthy and minimally exposed', async () => {
    const health = await fetch(`${ORIGIN}/healthz`);
    assert.equal(health.status, 200);
    for (const service of ['server', 'postgres', 'redis']) {
      const container = `${COMPOSE_PROJECT}-${service}-1`;
      assert.equal(dockerInspect(container, '{{.State.Health.Status}}'), 'healthy');
      assert.equal(dockerInspect(container, '{{json .NetworkSettings.Ports}}').includes('0.0.0.0'), false);
    }
    const origin = new URL(ORIGIN);
    const consolePort = origin.port || (origin.protocol === 'https:' ? '443' : '80');
    assert.match(dockerInspect(`${COMPOSE_PROJECT}-console-1`, '{{json .NetworkSettings.Ports}}'), new RegExp(consolePort));
    return `Console/Server/PostgreSQL/Redis healthy; only Console publishes ${consolePort}`;
  });

  await acceptance.check('E02', 'existing volume and Flyway V27 data survived current image', async () => {
    const counts = psql("select 'users='||count(*) from sys_user union all "
      + "select 'models='||count(*) from ent_managed_model union all "
      + "select 'grants='||count(*) from ent_model_grant union all "
      + "select 'quotas='||count(*) from ent_quota_policy union all "
      + "select 'plugins='||count(*) from ent_plugin_package union all "
      + "select 'ledger='||count(*) from ent_usage_ledger order by 1");
    assert.match(psql("select version from flyway_schema_history where success order by installed_rank desc limit 1"), /^27$/);
    const countMap = Object.fromEntries(counts.split('\n').map(value => value.split('=')));
    assert.ok(Number(countMap.models) >= 7);
    assert.ok(Number(countMap.ledger) >= 279);
    return counts.replaceAll('\n', ', ');
  });

  const anonymous = new ApiSession();
  await acceptance.check('E04', 'anonymous management access is rejected', async () => {
    assert.equal((await anonymous.request('/enterprise/admin/v1/providers')).response.status, 401);
    const page = await fetch(`${ORIGIN}/models`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root"><\/div>/);
    return 'management API=401; SPA shell requires client session guard';
  });

  const adminLogin = await passwordLogin({ username: adminUsername, password: adminPassword });
  const admin = adminLogin.session;
  await acceptance.check('E05', 'LOCAL admin PKCE establishes only hardened browser cookie', async () => {
    const cookie = adminLogin.setCookie;
    const secure = new URL(ORIGIN).protocol === 'https:';
    assert.match(cookie, secure ? /^__Host-enterprise-admin=/ : /^enterprise-admin=/);
    assert.match(cookie, /; Path=\//i);
    if (secure) assert.match(cookie, /; Secure/i);
    else assert.doesNotMatch(cookie, /; Secure/i);
    assert.match(cookie, /; HttpOnly/i);
    assert.match(cookie, /; SameSite=Strict/i);
    assert.doesNotMatch(cookie, /Domain=/i);
    const bootstrap = await admin.expect('/enterprise/admin/v1/bootstrap');
    assert.equal(data(bootstrap).member.username, adminUsername);
    assert.ok(data(bootstrap).permissions.every(value => value.startsWith('ent:')));
    return `cookie=${adminLogin.setCookie.split('=', 1)[0]}, permissions=${data(bootstrap).permissions.length}`;
  });

  await acceptance.check('E06', 'bad credentials and invalid transaction do not create sessions', async () => {
    const badUser = await passwordStep(`${prefix}-missing`, 'wrong-password');
    const badPassword = await passwordStep(adminUsername, 'wrong-password');
    assert.equal(badUser.step.response.status, badPassword.step.response.status);
    assert.equal(badUser.step.json.error.code, badPassword.step.json.error.code);
    const invalid = await fetch(`${ORIGIN}/enterprise/auth/v1/sources?transaction_id=${'x'.repeat(43)}`);
    assert.ok(invalid.status >= 400);
    return `generic=${badUser.step.json.error.code}, invalid-transaction=${invalid.status}`;
  });

  let detail;
  await acceptance.check('E10', 'LOCAL member creation is active, employee-only and secret-free', async () => {
    detail = await createMember(admin, memberUsername);
    assert.equal(detail.member.status, 'ACTIVE');
    assert.deepEqual(detail.member.roles, ['employee']);
    assert.equal(detail.member.loginMethods.some(value => value.sourceType === 'LOCAL'), true);
    assert.doesNotMatch(JSON.stringify(detail), /Initial|Password|password/i);
    const stored = psql(`select password_change_required||'|'||(password like '$2%') from sys_user where user_id=${detail.member.id}`);
    assert.equal(stored, 'true|true');
    return `member=${detail.member.id}, BCrypt=true, first-change=true`;
  });

  await acceptance.check('E11', 'first LOCAL login enforces one-time strong password change', async () => {
    const first = await passwordStep(memberUsername, initialPassword);
    assert.equal(first.step.response.status, 409);
    assert.equal(first.step.json.data.next, 'CHANGE_PASSWORD');
    const challenge = first.step.json.data.passwordChangeChallenge;
    const weak = await submitPassword(first.flow, {
      sourceId: first.source.id, challenge, newPassword: 'weak-password',
    });
    assert.equal(weak.response.status, 409);
    assert.equal(weak.json.data.rejected, true);
    const strong = await submitPassword(first.flow, {
      sourceId: first.source.id, challenge: weak.json.data.passwordChangeChallenge, newPassword: memberPassword,
    });
    assert.equal(strong.response.status, 200, strong.text);
    assert.equal(strong.json.data.next, 'REDIRECT');
    const replay = await submitPassword(first.flow, {
      sourceId: first.source.id, challenge, newPassword: changedPassword,
    });
    assert.ok(replay.response.status >= 400);
    const login = await passwordLogin({ username: memberUsername, password: memberPassword });
    assert.ok(login.setCookie);
    return 'weak rejected; strong accepted; original challenge replay rejected';
  });

  await acceptance.check('E07', 'cookie session is shared and server logout invalidates all tabs', async () => {
    const login = await passwordLogin({ username: memberUsername, password: memberPassword });
    const tab = new ApiSession({ cookie: login.session.cookie });
    assert.equal((await login.session.request('/enterprise/admin/v1/bootstrap')).response.status, 200);
    const logout = await login.session.expect('/enterprise/auth/v1/logout', { method: 'POST' });
    assert.match(logout.response.headers.getSetCookie()[0], /Max-Age=0/i);
    assert.equal((await tab.request('/enterprise/admin/v1/bootstrap')).response.status, 401);
    return 'copied host cookie revoked by one server logout';
  });

  await acceptance.check('E08', 'current LOCAL password change checks old password and revokes all sessions', async () => {
    detail = await setRoles(admin, detail, ['enterprise_admin']);
    const first = await passwordLogin({ username: memberUsername, password: memberPassword });
    const second = await passwordLogin({ username: memberUsername, password: memberPassword });
    const wrong = await first.session.request('/enterprise/admin/v1/account/password', {
      method: 'PUT', body: { currentPassword: 'wrong-password', newPassword: changedPassword },
    });
    assert.ok([400, 401].includes(wrong.response.status));
    assert.equal((await second.session.request('/enterprise/admin/v1/bootstrap')).response.status, 200);
    const changed = await first.session.expect('/enterprise/admin/v1/account/password', {
      method: 'PUT', body: { currentPassword: memberPassword, newPassword: changedPassword },
    });
    assert.equal(data(changed).changed, true);
    assert.equal((await second.session.request('/enterprise/admin/v1/bootstrap')).response.status, 401);
    assert.equal((await passwordLogin({ username: memberUsername, password: changedPassword })).session.cookie.startsWith('__Host-'), true);
    return 'wrong old password preserved sessions; correct change revoked both';
  });

  await acceptance.check('E09', 'five built-in roles and multi-role union enforce API matrix', async () => {
    const cases = [
      ['model_admin', '/enterprise/admin/v1/providers', '/enterprise/admin/v1/plugins'],
      ['plugin_admin', '/enterprise/admin/v1/plugins', '/enterprise/admin/v1/providers'],
      ['auditor', '/enterprise/admin/v1/audit-events', '/enterprise/admin/v1/providers'],
    ];
    for (const [role, allowed, denied] of cases) {
      detail = await setRoles(admin, detail, [role]);
      const session = (await passwordLogin({ username: memberUsername, password: changedPassword })).session;
      assert.equal((await session.request(allowed)).response.status, 200, `${role} allowed`);
      assert.equal((await session.request(denied)).response.status, 403, `${role} denied`);
    }
    detail = await setRoles(admin, detail, ['model_admin', 'plugin_admin']);
    const union = (await passwordLogin({ username: memberUsername, password: changedPassword })).session;
    assert.equal((await union.request('/enterprise/admin/v1/providers')).response.status, 200);
    assert.equal((await union.request('/enterprise/admin/v1/plugins')).response.status, 200);
    detail = await setRoles(admin, detail, ['employee']);
    const employee = (await passwordLogin({ username: memberUsername, password: changedPassword })).session;
    const employeeBootstrap = await employee.expect('/enterprise/admin/v1/bootstrap');
    assert.deepEqual(data(employeeBootstrap).roles, ['employee']);
    assert.equal((await employee.request('/enterprise/admin/v1/providers')).response.status, 403);
    const candidate = await admin.expect('/enterprise/admin/v1/bootstrap');
    assert.deepEqual(data(candidate).roles, ['enterprise_admin']);
    return 'enterprise/model/plugin/auditor/employee plus model+plugin union';
  });

  await acceptance.check('E12', 'account data exposes product profile and LOCAL origin', async () => {
    const member = await admin.expect(`/enterprise/admin/v1/members/${detail.member.id}`);
    assert.equal(data(member).member.username, memberUsername);
    assert.ok(data(member).identities.some(value => value.sourceType === 'LOCAL'));
    return 'member detail supplies profile, roles and LOCAL login method';
  });

  await acceptance.check('E13', 'disable revokes sessions and stale revisions cannot overwrite state', async () => {
    const activeLogin = await passwordLogin({ username: memberUsername, password: changedPassword });
    const stale = await admin.update(
      `/enterprise/admin/v1/members/${detail.member.id}/status`, detail.member.revision, { status: 'ACTIVE' },
    );
    detail = data(stale);
    const disabled = await admin.update(
      `/enterprise/admin/v1/members/${detail.member.id}/status`, detail.member.revision, { status: 'DISABLED' },
    );
    detail = data(disabled);
    assert.equal((await activeLogin.session.request('/enterprise/admin/v1/bootstrap')).response.status, 401);
    const conflict = await admin.request(`/enterprise/admin/v1/members/${detail.member.id}/status`, {
      method: 'PUT', headers: { 'if-match': String(detail.member.revision - 1) }, body: { status: 'ACTIVE' },
    });
    assert.equal(conflict.response.status, 409);
    const enabled = await admin.update(
      `/enterprise/admin/v1/members/${detail.member.id}/status`, detail.member.revision, { status: 'ACTIVE' },
    );
    detail = data(enabled);
    return 'active session revoked; stale If-Match=409; member restored for later gateway tests';
  });

  return { admin, detail };
}

async function runIdentityProviders(admin) {
  const alternateGroupBase = `ou=${prefix},ou=groups,dc=example,dc=org`;
  ldapInput({
    action: 'ldapadd',
    ldif: [
      'dn: uid=' + sharedUsername + ',ou=people,dc=example,dc=org',
      'objectClass: inetOrgPerson',
      'uid: ' + sharedUsername,
      'cn: V1 Shared LDAP',
      'sn: LDAP',
      'mail: ' + sharedUsername + '@example.test',
      'seeAlso: cn=engineering,ou=groups,dc=example,dc=org',
      'userPassword: ' + ldapPassword,
      '',
      'dn: ' + alternateGroupBase,
      'objectClass: organizationalUnit',
      'ou: ' + prefix,
      '',
      'dn: cn=engineering,' + alternateGroupBase,
      'objectClass: groupOfNames',
      'cn: engineering',
      'member: uid=bob,ou=people,dc=example,dc=org',
      '',
    ].join('\n'),
  });

  const ldapBody = (name, secret = ldapAdminPassword) => ({
    type: 'LDAP', provisioningMode: 'JIT', name,
    ldap: {
      url: ldapUrl,
      baseDn: 'ou=people,dc=example,dc=org',
      managerDn: 'cn=admin,dc=example,dc=org',
      userFilter: '(uid={0})',
      stableIdAttribute: 'entryUUID',
      usernameAttribute: 'uid',
      displayNameAttribute: 'cn',
      emailAttribute: 'mail',
      groupAttribute: 'seeAlso',
      groupBaseDn: 'ou=groups,dc=example,dc=org',
      groupFilter: '(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=group))',
      groupNameAttribute: 'cn',
      startTls: false,
    },
    secret,
  });

  let ldapSource;
  await acceptance.check('E14', 'real LDAPS source connects and never returns manager secret', async () => {
    ldapSource = await createIdentitySource(admin, ldapBody(`${prefix} LDAP`));
    assert.doesNotMatch(JSON.stringify(ldapSource), new RegExp(ldapAdminPassword));
    const tested = await admin.expect(`/enterprise/admin/v1/identity-sources/${ldapSource.id}/actions/test`, {
      method: 'POST',
    });
    assert.equal(data(tested).ok, true);
    const bad = await createIdentitySource(admin, ldapBody(`${prefix} Bad LDAP`, 'wrong-manager-secret'));
    const rejected = await admin.request(`/enterprise/admin/v1/identity-sources/${bad.id}/actions/test`, {
      method: 'POST',
    });
    assert.ok(rejected.response.status >= 400);
    return `LDAPS ready; bad manager rejected=${rejected.response.status}; secret absent`;
  });

  let accessGroup;
  let ldapUserId;
  await acceptance.check('E15', 'LDAP bounded search escapes filters and single import is idempotent', async () => {
    const users = await admin.expect(
      `/enterprise/admin/v1/identity-sources/${ldapSource.id}/ldap/users?query=bob&limit=50`,
    );
    const bob = data(users).items.find(value => value.username === 'bob');
    assert.ok(bob);
    const escaped = await admin.expect(
      `/enterprise/admin/v1/identity-sources/${ldapSource.id}/ldap/users?query=${encodeURIComponent('bob)(|(uid=*))')}&limit=50`,
    );
    assert.equal(data(escaped).items.length, 0);
    const first = await admin.expect(
      `/enterprise/admin/v1/identity-sources/${ldapSource.id}/ldap/users/actions/import`,
      { method: 'POST', headers: { 'idempotency-key': randomUUID() }, body: { dn: bob.dn } },
    );
    const second = await admin.expect(
      `/enterprise/admin/v1/identity-sources/${ldapSource.id}/ldap/users/actions/import`,
      { method: 'POST', headers: { 'idempotency-key': randomUUID() }, body: { dn: bob.dn } },
    );
    assert.equal(data(first).created, true);
    assert.equal(data(second).created, false);
    state.users.push(data(first).userId);
    return `bob imported=${data(first).userId}; duplicate created=false; injection search empty`;
  });

  await acceptance.check('E17', 'LDAP group discovery maps exact DN to flat product group', async () => {
    const groups = await admin.expect(
      `/enterprise/admin/v1/identity-sources/${ldapSource.id}/ldap/groups?query=engineering&limit=50`,
    );
    const discoveredDns = new Set(data(groups).items.map(value => value.externalGroup));
    assert.ok(discoveredDns.has('cn=engineering,ou=groups,dc=example,dc=org'));
    assert.ok(discoveredDns.has(`cn=engineering,${alternateGroupBase}`));
    const createdGroup = await admin.create('/enterprise/admin/v1/access-groups', {
      name: `${prefix} Engineering`, memberIds: [],
    });
    accessGroup = data(createdGroup);
    state.accessGroups.push(accessGroup.id);
    const mapping = await admin.create('/enterprise/admin/v1/group-mappings', {
      sourceId: ldapSource.id,
      externalGroup: 'cn=engineering,ou=groups,dc=example,dc=org',
      accessGroupId: accessGroup.id,
    });
    state.mappings.push(idOf(mapping));
    return `same-name exact DNs found; mapped exact=${idOf(mapping)}`;
  });

  await acceptance.check('E16', 'LDAP JIT uses stable subject and does not merge same-name LOCAL user', async () => {
    const localSame = await createMember(admin, sharedUsername, initialPassword);
    const first = await passwordLogin({
      username: sharedUsername, password: ldapPassword, sourceType: 'LDAP', sourceId: ldapSource.id,
    });
    const bootstrap = await first.session.expect('/enterprise/admin/v1/bootstrap');
    assert.equal(data(bootstrap).roles.some(role => role !== 'employee'), false);
    assert.equal((await first.session.request('/enterprise/admin/v1/providers')).response.status, 403);
    ldapUserId = psql(`select e.user_id from ent_external_identity e join sys_user u on u.user_id=e.user_id where e.source_id=${ldapSource.id} and u.user_name like '${sharedUsername}%' order by e.user_id desc limit 1`);
    assert.notEqual(ldapUserId, localSame.member.id);
    if (!state.users.includes(ldapUserId)) state.users.push(ldapUserId);
    await passwordLogin({
      username: sharedUsername, password: ldapPassword, sourceType: 'LDAP', sourceId: ldapSource.id,
    });
    assert.equal(psql(`select count(*) from ent_external_identity where source_id=${ldapSource.id} and user_id=${ldapUserId}`), '1');
    const group = await admin.expect(`/enterprise/admin/v1/access-groups/${accessGroup.id}`);
    assert.equal(data(group).memberCount, 1);
    return `LOCAL=${localSame.member.id}, LDAP=${ldapUserId}, stable identity rows=1`;
  });

  await acceptance.check('E18', 'LDAP refresh removes source membership but preserves manual membership', async () => {
    let group = await admin.expect(`/enterprise/admin/v1/access-groups/${accessGroup.id}`);
    group = await admin.update(`/enterprise/admin/v1/access-groups/${accessGroup.id}`, data(group).revision, {
      name: data(group).name, memberIds: [ldapUserId],
    });
    ldapInput({
      action: 'ldapmodify',
      ldif: [
        'dn: uid=' + sharedUsername + ',ou=people,dc=example,dc=org',
        'changetype: modify',
        'delete: seeAlso',
        '',
      ].join('\n'),
    });
    await passwordLogin({
      username: sharedUsername, password: ldapPassword, sourceType: 'LDAP', sourceId: ldapSource.id,
    });
    assert.equal(psql(`select count(*) from ent_access_group_member where group_id=${accessGroup.id} and user_id=${ldapUserId} and source_type='IDENTITY_SOURCE'`), '0');
    assert.equal(psql(`select count(*) from ent_access_group_member where group_id=${accessGroup.id} and user_id=${ldapUserId} and source_type='MANUAL'`), '1');
    const mapping = await admin.expect(`/enterprise/admin/v1/group-mappings?sourceId=${ldapSource.id}`);
    const current = data(mapping).items[0];
    await admin.remove(`/enterprise/admin/v1/group-mappings/${current.id}`, current.revision);
    assert.equal(psql(`select count(*) from ent_access_group_member where group_id=${accessGroup.id} and user_id=${ldapUserId} and source_type='MANUAL'`), '1');
    return 'directory relation removed; manual relation remains after refresh and mapping delete';
  });

  await acceptance.check('E19', 'disabled LDAP blocks new auth without deleting member or identity', async () => {
    const pending = await beginAuthorization();
    const current = await admin.expect(`/enterprise/admin/v1/identity-sources/${ldapSource.id}`);
    const disabled = await admin.expect(`/enterprise/admin/v1/identity-sources/${ldapSource.id}/actions/disable`, {
      method: 'POST', headers: { 'if-match': String(data(current).revision) },
    });
    ldapSource = data(disabled);
    const step = await submitPassword(pending, {
      sourceId: ldapSource.id, username: sharedUsername, password: ldapPassword,
    });
    assert.ok(step.response.status >= 400);
    assert.equal(psql(`select count(*) from ent_external_identity where source_id=${ldapSource.id} and user_id=${ldapUserId}`), '1');
    assert.equal(psql(`select count(*) from sys_user where user_id=${ldapUserId}`), '1');
    return `disabled auth=${step.response.status}; member and identity retained`;
  });

  let oidcSource;
  const oidcBody = {
    type: 'OIDC', provisioningMode: 'JIT', name: `${prefix} OIDC`,
    issuer: fixture.issuer, clientId: fixture.clientId,
    oidc: {
      scopes: ['openid', 'profile', 'email'],
      claims: { username: 'preferred_username', displayName: 'name', email: 'email', groups: 'groups' },
    },
    secret: fixture.clientSecret,
  };
  await acceptance.check('E20', 'OIDC discovery succeeds and issuer/audience/nonce failures are rejected', async () => {
    oidcSource = await createIdentitySource(admin, oidcBody);
    assert.doesNotMatch(JSON.stringify(oidcSource), new RegExp(fixture.clientSecret));
    const tested = await admin.expect(`/enterprise/admin/v1/identity-sources/${oidcSource.id}/actions/test`, {
      method: 'POST',
    });
    assert.equal(data(tested).ok, true);
    for (const mode of ['wrong-issuer', 'wrong-audience', 'wrong-nonce']) {
      fixture.setOidcMode(mode);
      await assert.rejects(() => oidcLogin({ sourceId: oidcSource.id }));
    }
    fixture.setOidcMode('success');
    return 'discovery ready; issuer/audience/nonce negatives rejected; secret absent';
  });

  let oidcUserId;
  await acceptance.check('E21', 'OIDC JIT is stable and remains distinct from same-name LOCAL/LDAP users', async () => {
    await oidcLogin({ sourceId: oidcSource.id });
    oidcUserId = psql(`select user_id from ent_external_identity where source_id=${oidcSource.id}`);
    if (!state.users.includes(oidcUserId)) state.users.push(oidcUserId);
    await oidcLogin({ sourceId: oidcSource.id });
    assert.equal(psql(`select count(*) from ent_external_identity where source_id=${oidcSource.id}`), '1');
    const distinct = new Set([
      oidcUserId,
      ldapUserId,
      psql(`select user_id from sys_user where user_name='${sharedUsername}'`),
    ]);
    assert.equal(distinct.size, 3);
    return `LOCAL/LDAP/OIDC distinct users=${[...distinct].join(',')}`;
  });

  await acceptance.check('E22', 'disabled OIDC blocks new auth and leaves other identities intact', async () => {
    const current = await admin.expect(`/enterprise/admin/v1/identity-sources/${oidcSource.id}`);
    const disabled = await admin.expect(`/enterprise/admin/v1/identity-sources/${oidcSource.id}/actions/disable`, {
      method: 'POST', headers: { 'if-match': String(data(current).revision) },
    });
    oidcSource = data(disabled);
    await assert.rejects(() => oidcLogin({ sourceId: oidcSource.id }));
    assert.equal(psql(`select count(*) from ent_external_identity where source_id=${oidcSource.id}`), '1');
    assert.equal(psql(`select count(*) from sys_user where user_id=${oidcUserId}`), '1');
    return 'new OIDC auth rejected; existing identity/member retained';
  });

  return { ldapSource, oidcSource, accessGroup, ldapUserId, oidcUserId };
}

try {
  assert.equal(dockerInspect(SERVER_CONTAINER, '{{.State.Health.Status}}'), 'healthy');
  const { admin, detail } = await runDeploymentAndAuth();
  const identities = await runIdentityProviders(admin);
  const adminBootstrap = data(await admin.expect('/enterprise/admin/v1/bootstrap'));
  const modelAndQuota = await runModelAndQuotaScenarios({
    acceptance,
    admin,
    fixture,
    prefix,
    state,
    adminUsername,
    adminPassword,
    member: {
      adminId: adminBootstrap.member.id,
      userId: detail.member.id,
      username: memberUsername,
      password: changedPassword,
    },
    accessGroup: identities.accessGroup,
  });
  const harness = await runHarnessScenarios({
    acceptance,
    admin,
    fixture,
    prefix,
    state,
    modelAndQuota,
  });
  process.stdout.write(`${JSON.stringify({
    runId,
    status: 'api-harness-complete',
    passed: acceptance.results.length,
    results: acceptance.results,
    state,
    next: {
      memberId: detail.member.id,
      ldapSourceId: identities.ldapSource.id,
      oidcSourceId: identities.oidcSource.id,
      accessGroupId: identities.accessGroup.id,
      ldapUserId: identities.ldapUserId,
      oidcUserId: identities.oidcUserId,
      modelAndQuota,
      harness,
    },
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ runId, status: 'failed', state }, null, 2)}\n`);
  throw error;
} finally {
  await fixture.close();
}

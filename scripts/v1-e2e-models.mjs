/**
 * [INPUT]: 依赖 V1 E2E 管理会话、真实 Harness runtime 会话、可控三协议上游、PostgreSQL 与 Redis。
 * [OUTPUT]: 执行 E23-E35 的 provider、模型集、授权、Token 窗口、RPM/并发和结算恢复验收。
 * [POS]: scripts 的模型治理纵向验收模块；只编排公开 API，并以精确运行 ID 查询持久化证据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process';
import {
  ORIGIN,
  SERVER_CONTAINER,
  assert,
  passwordLogin,
  psql,
  randomUUID,
  redis,
} from './v1-e2e-support.mjs';

const PROTOCOL_PATH = {
  'openai-completions': '/enterprise/gateway/v1/chat/completions',
  'openai-responses': '/enterprise/gateway/v1/responses',
  'anthropic-messages': '/enterprise/gateway/v1/messages',
};

function data(result) {
  return result.json?.data;
}

function idOf(result) {
  const value = data(result)?.id;
  assert.match(String(value), /^[1-9][0-9]{0,18}$/);
  return String(value);
}

function providerBody(providerKey, name, apiProtocol, baseUrl, credential, extra = {}) {
  return {
    providerKey,
    name,
    providerType: 'CUSTOM',
    apiProtocol,
    baseUrl,
    credential,
    connectTimeoutMs: 2_000,
    readTimeoutMs: 10_000,
    ...extra,
  };
}

function modelBody(providerId, alias, modelId, name, sortOrder, reasoningEfforts = false) {
  return {
    providerId,
    alias,
    modelId,
    name,
    contextWindow: 262_144,
    maxTokens: 8_192,
    reasoningEfforts,
    sortOrder,
  };
}

function quotaBody({
  name,
  policyType,
  subjectType,
  subjectId = null,
  resourceType,
  resourceId = null,
  fiveHourTokenLimit = null,
  dailyTokenLimit = null,
  weeklyTokenLimit = null,
  monthlyTokenLimit = null,
  rpm = null,
  concurrency = null,
  status = 'ACTIVE',
}) {
  return {
    name, policyType, subjectType, subjectId, resourceType, resourceId,
    fiveHourTokenLimit, dailyTokenLimit, weeklyTokenLimit, monthlyTokenLimit,
    rpm, concurrency, status,
  };
}

async function runtimeSession(username, password) {
  const installationId = randomUUID();
  const login = await passwordLogin({
    username,
    password,
    clientId: 'dsh-desktop',
    installationId,
  });
  const enrolled = await login.session.expect('/enterprise/api/v1/devices/enroll', {
    method: 'POST',
    body: {
      installationId,
      name: `V1 E2E ${username}`,
      platform: 'darwin',
      harnessVersion: '0.1.1-rc.2',
      enterpriseBundleVersion: '0.1.0',
    },
  });
  return { session: login.session, device: data(enrolled) };
}

function requestBody(protocol, alias, extra = {}) {
  if (protocol === 'openai-responses') {
    return {
      model: alias,
      stream: true,
      max_output_tokens: 8,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'V1 E2E' }] }],
      ...extra,
    };
  }
  return {
    model: alias,
    stream: true,
    max_tokens: 8,
    messages: [{ role: 'user', content: 'V1 E2E' }],
    ...extra,
  };
}

async function gatewayCall(session, protocol, alias, options = {}) {
  const idempotencyKey = options.idempotencyKey ?? randomUUID();
  const started = Date.now();
  const response = await fetch(`${ORIGIN}${PROTOCOL_PATH[protocol]}`, {
    method: 'POST',
    headers: {
      accept: 'text/event-stream, application/json',
      authorization: `Bearer ${session.bearer}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
      'x-harness-version': '0.1.1-rc.2',
      'x-enterprise-bundle-version': '0.1.0',
    },
    body: JSON.stringify(requestBody(protocol, alias, options.body)),
    signal: options.signal,
  });
  const text = await response.text();
  let json;
  if (text.startsWith('{')) json = JSON.parse(text);
  return { response, text, json, idempotencyKey, durationMs: Date.now() - started };
}

async function waitFor(check, message, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== false && value !== undefined && value !== '') return value;
    } catch (error) {
      last = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${message}${last === undefined ? '' : `: ${String(last)}`}`);
}

function stateOf(idempotencyKey) {
  return psql(`select state from ent_usage_reservation where idempotency_key='${idempotencyKey}'`);
}

async function createQuota(admin, state, body) {
  const created = await admin.create('/enterprise/admin/v1/quotas', body);
  const quota = data(created);
  state.quotas.push(quota.id);
  return quota;
}

async function updateQuota(admin, quota, body) {
  return data(await admin.update(`/enterprise/admin/v1/quotas/${quota.id}`, quota.revision, body));
}

async function disableQuota(admin, quota) {
  return data(await admin.expect(`/enterprise/admin/v1/quotas/${quota.id}/actions/disable`, {
    method: 'POST', headers: { 'if-match': String(quota.revision) },
  }));
}

export async function runModelAndQuotaScenarios({
  acceptance,
  admin,
  fixture,
  prefix,
  state,
  adminUsername,
  adminPassword,
  member,
  accessGroup,
}) {
  const fixtureBaseUrl = `${fixture.issuer}/v1`;
  const providers = {};
  const providerInputs = {};

  await acceptance.check('E23', 'provider types, three wire APIs and shared capacity persist accurately', async () => {
    const listed = data(await admin.expect('/enterprise/admin/v1/providers?limit=100')).items;
    let official = listed.find(value => value.providerType === 'DEEPSEEK_OFFICIAL');
    if (official === undefined) {
      official = data(await admin.create('/enterprise/admin/v1/providers', {
        providerKey: 'deepseek-official',
        name: 'DeepSeek Official',
        providerType: 'DEEPSEEK_OFFICIAL',
        apiProtocol: 'openai-completions',
        baseUrl: 'https://api.deepseek.com/v1',
        credential: fixture.modelKey,
        connectTimeoutMs: 2_000,
        readTimeoutMs: 10_000,
      }));
      state.providers.push(official.id);
    }
    assert.equal(official.providerKey, 'deepseek-official');
    assert.equal(official.apiProtocol, 'openai-completions');

    for (const [key, apiProtocol] of Object.entries({
      completions: 'openai-completions',
      responses: 'openai-responses',
      anthropic: 'anthropic-messages',
    })) {
      const body = providerBody(
        `${prefix}-${key}`,
        `${prefix} ${key}`,
        apiProtocol,
        fixtureBaseUrl,
        fixture.modelKey,
      );
      const created = await admin.create('/enterprise/admin/v1/providers', body);
      providers[key] = data(created);
      providerInputs[key] = body;
      state.providers.push(providers[key].id);
      assert.equal(providers[key].apiProtocol, apiProtocol);
      assert.equal(providers[key].credentialConfigured, true);
      assert.equal(JSON.stringify(providers[key]).includes(fixture.modelKey), false);
    }

    let providerRate = await createQuota(admin, state, quotaBody({
      name: `${prefix} provider capacity`,
      policyType: 'RATE',
      subjectType: 'ORGANIZATION',
      resourceType: 'PROVIDER',
      resourceId: providers.completions.id,
      rpm: 1_000,
      concurrency: 10,
    }));
    assert.equal(providerRate.resourceType, 'PROVIDER');
    assert.equal(providerRate.resourceId, providers.completions.id);
    assert.equal(providerRate.rpm, 1_000);
    assert.equal(providerRate.concurrency, 10);
    providers.rate = providerRate;
    return `official + ${Object.keys(providerInputs).length} custom protocols; provider RATE=${providerRate.id}`;
  });

  await acceptance.check('E24', 'provider probe discovers models and stale writes preserve the secret', async () => {
    const tested = await admin.expect(`/enterprise/admin/v1/providers/${providers.completions.id}/actions/test`, {
      method: 'POST',
      body: { baseUrl: fixtureBaseUrl, connectTimeoutMs: 2_000, readTimeoutMs: 5_000 },
    });
    assert.equal(data(tested).success, true);
    assert.deepEqual(data(tested).models.map(value => value.id), [
      'v1-e2e-chat', 'v1-e2e-responses', 'v1-e2e-anthropic',
    ]);
    assert.equal(data(tested).models[0].contextWindow, 262_144);

    const current = providers.completions;
    const updateBody = {
      ...providerInputs.completions,
      name: `${prefix} completions updated`,
      replaceSecret: false,
    };
    delete updateBody.credential;
    providers.completions = data(await admin.update(
      `/enterprise/admin/v1/providers/${current.id}`, current.revision, updateBody,
    ));
    const stale = await admin.request(`/enterprise/admin/v1/providers/${current.id}`, {
      method: 'PUT',
      headers: { 'if-match': String(current.revision) },
      body: { ...updateBody, name: `${prefix} stale overwrite` },
    });
    assert.equal(stale.response.status, 409);
    const after = data(await admin.expect(`/enterprise/admin/v1/providers/${current.id}`));
    assert.equal(after.name, updateBody.name);
    assert.equal(after.credentialConfigured, true);
    return '3 discovered models with 256K/1M metadata; stale If-Match=409; credential still configured';
  });

  const models = {};
  await acceptance.check('E25', 'managed model fields, reasoning map and disable behavior reach bootstrap', async () => {
    const definitions = {
      chat: [providers.completions.id, `${prefix}-chat`, 'v1-e2e-chat', 'V1 Chat', 10, false],
      responses: [
        providers.responses.id, `${prefix}-responses`, 'v1-e2e-responses', 'V1 Responses', 0,
        { off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'max' },
      ],
      anthropic: [providers.anthropic.id, `${prefix}-anthropic`, 'v1-e2e-anthropic', 'V1 Anthropic', 20, false],
      twin: [providers.responses.id, `${prefix}-twin`, 'v1-e2e-chat', 'V1 Twin', 30, false],
      hidden: [providers.completions.id, `${prefix}-hidden`, 'v1-e2e-chat', 'V1 Hidden', 40, false],
    };
    for (const [key, values] of Object.entries(definitions)) {
      const created = await admin.create('/enterprise/admin/v1/models', modelBody(...values));
      models[key] = data(created);
      state.models.push(models[key].id);
    }
    assert.equal(models.responses.contextWindow, 262_144);
    assert.equal(models.responses.maxTokens, 8_192);
    assert.equal(models.responses.reasoningEfforts.xhigh, 'max');

    const grant = data(await admin.create('/enterprise/admin/v1/model-grants', {
      resourceType: 'MODEL', resourceId: models.hidden.id,
      subjectType: 'MEMBER', subjectId: member.adminId, status: 'ACTIVE',
    }));
    state.grants.push(grant.id);
    const runtime = await runtimeSession(adminUsername, adminPassword);
    state.devices.push(runtime.device.id);
    assert.ok(data(await runtime.session.expect('/enterprise/api/v1/bootstrap')).models
      .some(value => value.alias === models.hidden.alias));
    const disabled = data(await admin.expect(`/enterprise/admin/v1/models/${models.hidden.id}/actions/disable`, {
      method: 'POST', headers: { 'if-match': String(models.hidden.revision) },
    }));
    models.hidden = disabled;
    assert.equal(data(await runtime.session.expect('/enterprise/api/v1/bootstrap')).models
      .some(value => value.alias === models.hidden.alias), false);
    const denied = await gatewayCall(runtime.session, 'openai-completions', models.hidden.alias);
    assert.equal(denied.response.status, 403);
    await admin.remove(`/enterprise/admin/v1/model-grants/${grant.id}`, grant.revision);
    models.hidden = data(await admin.expect(`/enterprise/admin/v1/models/${models.hidden.id}/actions/enable`, {
      method: 'POST', headers: { 'if-match': String(models.hidden.revision) },
    }));
    member.adminRuntime = runtime;
    return `five managed models persisted; reasoning xhigh->max; disabled alias rejected=${denied.response.status}`;
  });

  await acceptance.check('E26', 'same upstream model ID remains isolated by provider and managed alias', async () => {
    assert.equal(models.chat.modelId, models.twin.modelId);
    assert.notEqual(models.chat.providerId, models.twin.providerId);
    assert.notEqual(models.chat.alias, models.twin.alias);
    assert.equal(
      psql(`select count(*) from ent_managed_model where id in (${models.chat.id},${models.twin.id}) and upstream_model='v1-e2e-chat'`),
      '2',
    );
    return `${models.chat.alias}/${models.twin.alias} share upstream ID across providers`;
  });

  let primarySet;
  await acceptance.check('E27', 'model-set replacement changes effective access and referenced delete is protected', async () => {
    primarySet = data(await admin.create('/enterprise/admin/v1/model-sets', {
      name: `${prefix} primary`,
      modelIds: [models.chat.id, models.responses.id, models.anthropic.id, models.twin.id],
    }));
    state.modelSets.push(primarySet.id);
    assert.equal(primarySet.modelCount, 4);

    let temporarySet = data(await admin.create('/enterprise/admin/v1/model-sets', {
      name: `${prefix} dynamic`, modelIds: [models.hidden.id, models.hidden.id],
    }));
    state.modelSets.push(temporarySet.id);
    assert.equal(temporarySet.modelCount, 1);
    const temporaryGrant = await admin.create('/enterprise/admin/v1/model-grants', {
      resourceType: 'MODEL_SET', resourceId: temporarySet.id,
      subjectType: 'MEMBER', subjectId: member.adminId, status: 'ACTIVE',
    });
    state.grants.push(idOf(temporaryGrant));
    assert.ok(data(await member.adminRuntime.session.expect('/enterprise/api/v1/bootstrap')).models
      .some(value => value.alias === models.hidden.alias));
    const protectedDelete = await admin.request(`/enterprise/admin/v1/model-sets/${temporarySet.id}`, {
      method: 'DELETE', headers: { 'if-match': String(temporarySet.revision) },
    });
    assert.equal(protectedDelete.response.status, 400);
    temporarySet = data(await admin.update(`/enterprise/admin/v1/model-sets/${temporarySet.id}`, temporarySet.revision, {
      name: temporarySet.name, modelIds: [],
    }));
    assert.equal(temporarySet.modelCount, 0);
    assert.equal(data(await member.adminRuntime.session.expect('/enterprise/api/v1/bootstrap')).models
      .some(value => value.alias === models.hidden.alias), false);
    return 'duplicate member deduped; full replacement accepted; referenced set delete=400';
  });

  const grantInputs = [];
  await acceptance.check('E28', 'six subject/resource grant combinations are additive and unauthorized aliases stay hidden', async () => {
    const groupCurrent = data(await admin.expect(`/enterprise/admin/v1/access-groups/${accessGroup.id}`));
    await admin.update(`/enterprise/admin/v1/access-groups/${accessGroup.id}`, groupCurrent.revision, {
      name: groupCurrent.name,
      memberIds: [...new Set([...groupCurrent.manualMemberIds, member.userId])],
    });
    for (const subject of [
      ['ALL_MEMBERS', null],
      ['ACCESS_GROUP', accessGroup.id],
      ['MEMBER', member.userId],
    ]) {
      for (const resource of [
        ['MODEL_SET', primarySet.id],
        ['MODEL', models.chat.id],
      ]) {
        grantInputs.push({
          subjectType: subject[0], subjectId: subject[1],
          resourceType: resource[0], resourceId: resource[1], status: 'ACTIVE',
        });
      }
    }
    const batch = await admin.expect('/enterprise/admin/v1/model-grants/batch', {
      method: 'POST', headers: { 'idempotency-key': randomUUID() }, body: { items: grantInputs },
    }, 201);
    for (const item of data(batch)) state.grants.push(item.id);
    assert.equal(data(batch).length, 6);

    const runtime = await runtimeSession(member.username, member.password);
    state.devices.push(runtime.device.id);
    const catalog = data(await runtime.session.expect('/enterprise/api/v1/bootstrap')).models;
    assert.equal(new Set(catalog.map(value => value.alias)).size, catalog.length);
    for (const model of [models.chat, models.responses, models.anthropic, models.twin]) {
      assert.ok(catalog.some(value => value.alias === model.alias), model.alias);
    }
    assert.equal(catalog.some(value => value.alias === models.hidden.alias), false);
    const denied = await gatewayCall(runtime.session, 'openai-completions', models.hidden.alias);
    assert.equal(denied.response.status, 403);
    member.runtime = runtime;
    return `batch grants=${data(batch).length}; effective aliases deduped=${catalog.length}; hidden=403`;
  });

  const tokenPolicies = [];
  await acceptance.check('E29', 'all token subject/resource/window combinations persist independently', async () => {
    const resources = [
      ['ALL_MODELS', null],
      ['MODEL_SET', primarySet.id],
      ['MODEL', models.responses.id],
    ];
    const subjects = [['ORGANIZATION', null], ['MEMBER', member.adminId]];
    const windows = [
      ['fiveHourTokenLimit', 'FIVE_HOURS'],
      ['dailyTokenLimit', 'DAY'],
      ['weeklyTokenLimit', 'WEEK'],
      ['monthlyTokenLimit', 'MONTH'],
    ];
    for (const [subjectType, subjectId] of subjects) {
      for (const [resourceType, resourceId] of resources) {
        for (const [field, windowType] of windows) {
          const policy = await createQuota(admin, state, quotaBody({
            name: `${prefix} token ${subjectType} ${resourceType} ${windowType}`,
            policyType: 'TOKEN', subjectType, subjectId, resourceType, resourceId,
            [field]: 10_000_000,
          }));
          tokenPolicies.push(policy);
          const current = data(await admin.expect(`/enterprise/admin/v1/quotas/${policy.id}/windows`));
          assert.deepEqual(current.map(value => value.windowType), [windowType]);
        }
      }
    }
    const mixed = await admin.request('/enterprise/admin/v1/quotas', {
      method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: quotaBody({
        name: `${prefix} invalid mixed`, policyType: 'TOKEN', subjectType: 'ORGANIZATION',
        resourceType: 'ALL_MODELS', dailyTokenLimit: 1_000, rpm: 1,
      }),
    });
    assert.equal(mixed.response.status, 400);
    assert.equal(tokenPolicies.length, 24);
    return '2 subjects x 3 resources x 4 windows = 24; TOKEN+RATE rejected=400';
  });

  const adminRuntime = await runtimeSession(adminUsername, adminPassword);
  state.devices.push(adminRuntime.device.id);
  await acceptance.check('E30', 'organization and member token policies both constrain without override', async () => {
    let blocker = await createQuota(admin, state, quotaBody({
      name: `${prefix} organization hard stop`, policyType: 'TOKEN',
      subjectType: 'ORGANIZATION', resourceType: 'MODEL', resourceId: models.responses.id,
      dailyTokenLimit: 1,
    }));
    const generous = await createQuota(admin, state, quotaBody({
      name: `${prefix} member cannot override`, policyType: 'TOKEN',
      subjectType: 'MEMBER', subjectId: member.adminId,
      resourceType: 'MODEL', resourceId: models.responses.id,
      dailyTokenLimit: 100_000_000,
    }));
    const denied = await gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias);
    assert.equal(denied.response.status, 429);
    assert.equal(denied.json.error.code, 'ENT_QUOTA_DAILY_EXCEEDED');
    blocker = await disableQuota(admin, blocker);
    assert.equal(generous.status, 'ACTIVE');
    const allowed = await gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias);
    assert.equal(allowed.response.status, 200, allowed.text);
    return 'organization hard stop=429 despite member allowance; disabling it restores access';
  });

  await acceptance.check('E31', 'successful stream settles reservation, ledger and every matched window', async () => {
    fixture.setModelMode('success');
    const call = await gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias);
    assert.equal(call.response.status, 200, call.text);
    assert.match(call.text, /response\.completed/);
    assert.equal(stateOf(call.idempotencyKey), 'SETTLED');
    const ledger = psql(`select input_tokens||'|'||output_tokens||'|'||cache_tokens||'|'||total_tokens||'|'||result from ent_usage_ledger l join ent_usage_reservation r on r.id=l.reservation_id where r.idempotency_key='${call.idempotencyKey}'`);
    assert.equal(ledger, '9|7|3|19|SETTLED');
    const matched = tokenPolicies.filter(policy =>
      (policy.subjectType === 'ORGANIZATION' || policy.subjectId === member.adminId)
      && (policy.resourceType === 'ALL_MODELS'
        || policy.resourceType === 'MODEL_SET'
        || policy.resourceId === models.responses.id));
    assert.equal(matched.length, 24);
    for (const policy of matched) {
      const counts = psql(`select used_tokens||'|'||reserved_tokens from ent_quota_window where policy_id=${policy.id}`);
      assert.match(counts, /^([1-9][0-9]*)\|0$/);
    }
    return `reservation=SETTLED, usage=9+7+3=19, matched windows=${matched.length}`;
  });

  await acceptance.check('E32', 'pre-connect failures release while broken/no-usage streams charge max and recovery is idempotent', async () => {
    fixture.setModelMode('unavailable-once');
    const unavailable = await gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias);
    assert.equal(unavailable.response.status, 503);
    assert.equal(stateOf(unavailable.idempotencyKey), 'RELEASED');

    fixture.setModelMode('disconnect');
    const disconnectedKey = randomUUID();
    await gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias, {
      idempotencyKey: disconnectedKey,
    }).catch(() => undefined);
    assert.equal(stateOf(disconnectedKey), 'CHARGED_MAX');

    fixture.setModelMode('no-usage');
    const noUsage = await gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias);
    assert.equal(noUsage.response.status, 200);
    assert.equal(stateOf(noUsage.idempotencyKey), 'CHARGED_MAX');

    fixture.setModelMode('slow');
    const controller = new AbortController();
    const recoveryKey = randomUUID();
    const pending = gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias, {
      idempotencyKey: recoveryKey, signal: controller.signal,
    }).catch(() => undefined);
    await waitFor(() => stateOf(recoveryKey) === 'SENT', 'aborted request did not reach SENT');
    controller.abort();
    await pending;
    psql(`update ent_usage_reservation set expires_at=now()-interval '1 second' where idempotency_key='${recoveryKey}' and state='SENT'`);
    execFileSync('docker', ['restart', SERVER_CONTAINER], { stdio: 'ignore' });
    await waitFor(async () => (await fetch(`${ORIGIN}/healthz`)).ok, 'server did not recover', 60_000);
    await waitFor(() => stateOf(recoveryKey) === 'CHARGED_MAX', 'recovery job did not charge SENT request', 60_000);
    const ledgerCount = psql(`select count(*) from ent_usage_ledger l join ent_usage_reservation r on r.id=l.reservation_id where r.idempotency_key='${recoveryKey}'`);
    assert.equal(ledgerCount, '1');
    await new Promise(resolve => setTimeout(resolve, 1_000));
    assert.equal(psql(`select count(*) from ent_usage_ledger l join ent_usage_reservation r on r.id=l.reservation_id where r.idempotency_key='${recoveryKey}'`), '1');
    fixture.setModelMode('success');
    return '503=RELEASED; disconnect/no-usage/recovered SENT=CHARGED_MAX; one ledger';
  });

  const ratePolicies = [];
  await acceptance.check('E33', 'all RATE combinations share one atomic Redis decision', async () => {
    for (const [subjectType, subjectId] of [['ORGANIZATION', null], ['MEMBER', member.adminId]]) {
      for (const [resourceType, resourceId] of [
        ['ALL_MODELS', null], ['MODEL_SET', primarySet.id], ['MODEL', models.responses.id],
      ]) {
        ratePolicies.push(await createQuota(admin, state, quotaBody({
          name: `${prefix} rate ${subjectType} ${resourceType}`,
          policyType: 'RATE', subjectType, subjectId, resourceType, resourceId, concurrency: 10,
        })));
      }
    }
    let blocker = await createQuota(admin, state, quotaBody({
      name: `${prefix} atomic blocker`, policyType: 'RATE',
      subjectType: 'MEMBER', subjectId: member.adminId,
      resourceType: 'MODEL', resourceId: models.responses.id, concurrency: 1,
    }));
    fixture.setModelMode('slow');
    const offset = fixture.requests.length;
    const first = gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias);
    await waitFor(() => fixture.requests.length > offset, 'slow request did not reach upstream');
    for (const policy of [...ratePolicies, blocker]) {
      assert.equal(redis('ZCARD', `enterprise:quota:concurrency:${policy.id}`), '1');
    }
    const second = await gatewayCall(adminRuntime.session, 'openai-responses', models.responses.alias);
    assert.equal(second.response.status, 429);
    assert.equal(second.json.error.code, 'ENT_QUOTA_CONCURRENCY_EXCEEDED');
    for (const policy of [...ratePolicies, blocker]) {
      assert.equal(redis('ZCARD', `enterprise:quota:concurrency:${policy.id}`), '1');
    }
    assert.equal((await first).response.status, 200);
    blocker = await disableQuota(admin, blocker);
    fixture.setModelMode('success');
    assert.equal(ratePolicies.length, 6);
    return '2 subjects x 3 resources = 6; rejected overlap changed no Redis lease';
  });

  await acceptance.check('E34', 'provider RPM and concurrency are shared across members and models with fast 429', async () => {
    providers.rate = await updateQuota(admin, providers.rate, quotaBody({
      name: providers.rate.name, policyType: 'RATE', subjectType: 'ORGANIZATION',
      resourceType: 'PROVIDER', resourceId: providers.completions.id, rpm: 1, concurrency: 10,
    }));
    redis('DEL', `enterprise:quota:rpm:${providers.rate.id}`);
    fixture.setModelMode('success');
    const beforeRpm = fixture.requests.length;
    assert.equal((await gatewayCall(adminRuntime.session, 'openai-completions', models.chat.alias)).response.status, 200);
    const rpmDenied = await gatewayCall(member.runtime.session, 'openai-completions', models.chat.alias);
    assert.equal(rpmDenied.response.status, 429);
    assert.equal(rpmDenied.json.error.code, 'ENT_QUOTA_RPM_EXCEEDED');
    assert.equal(fixture.requests.length - beforeRpm, 1);

    providers.rate = await updateQuota(admin, providers.rate, quotaBody({
      name: providers.rate.name, policyType: 'RATE', subjectType: 'ORGANIZATION',
      resourceType: 'PROVIDER', resourceId: providers.completions.id, concurrency: 1,
    }));
    redis('DEL', `enterprise:quota:rpm:${providers.rate.id}`);
    fixture.setModelMode('slow');
    const offset = fixture.requests.length;
    const first = gatewayCall(adminRuntime.session, 'openai-completions', models.chat.alias);
    await waitFor(() => fixture.requests.length > offset, 'provider slow request did not start');
    const started = Date.now();
    const concurrencyDenied = await gatewayCall(member.runtime.session, 'openai-completions', models.chat.alias);
    assert.equal(concurrencyDenied.response.status, 429);
    assert.equal(concurrencyDenied.json.error.code, 'ENT_QUOTA_CONCURRENCY_EXCEEDED');
    assert.ok(Date.now() - started < 1_500, `provider rejection waited ${Date.now() - started}ms`);
    assert.equal(fixture.requests.length - offset, 1);
    assert.equal((await first).response.status, 200);
    fixture.setModelMode('success');
    return 'provider RPM shared across members; concurrency 429 before upstream and under 1.5s';
  });

  await acceptance.check('E35', 'member RATE tightens one member and releases leases after every outcome', async () => {
    providers.rate = await updateQuota(admin, providers.rate, quotaBody({
      name: providers.rate.name, policyType: 'RATE', subjectType: 'ORGANIZATION',
      resourceType: 'PROVIDER', resourceId: providers.completions.id, concurrency: 10,
    }));
    const personal = await createQuota(admin, state, quotaBody({
      name: `${prefix} personal concurrency`, policyType: 'RATE',
      subjectType: 'MEMBER', subjectId: member.adminId,
      resourceType: 'MODEL', resourceId: models.chat.id, concurrency: 1,
    }));
    fixture.setModelMode('slow');
    const offset = fixture.requests.length;
    const first = gatewayCall(adminRuntime.session, 'openai-completions', models.chat.alias);
    await waitFor(() => fixture.requests.length > offset, 'member slow request did not start');
    const ownDenied = await gatewayCall(adminRuntime.session, 'openai-completions', models.chat.alias);
    assert.equal(ownDenied.response.status, 429);
    const other = await gatewayCall(member.runtime.session, 'openai-completions', models.chat.alias);
    assert.equal(other.response.status, 200, other.text);
    assert.equal((await first).response.status, 200);
    assert.equal(redis('ZCARD', `enterprise:quota:concurrency:${personal.id}`), '0');

    fixture.setModelMode('unavailable-once');
    const failed = await gatewayCall(adminRuntime.session, 'openai-completions', models.chat.alias);
    assert.equal(failed.response.status, 503);
    assert.equal(redis('ZCARD', `enterprise:quota:concurrency:${personal.id}`), '0');
    fixture.setModelMode('success');
    return 'member A blocked at 1; member B succeeds; success and 503 both release personal lease';
  });

  return {
    providerIds: Object.fromEntries(
      Object.entries(providers).filter(([key]) => key !== 'rate').map(([key, value]) => [key, value.id]),
    ),
    modelIds: Object.fromEntries(Object.entries(models).map(([key, value]) => [key, value.id])),
    modelAliases: Object.fromEntries(Object.entries(models).map(([key, value]) => [key, value.alias])),
    primarySetId: primarySet.id,
  };
}

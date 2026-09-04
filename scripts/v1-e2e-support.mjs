/**
 * [INPUT]: 依赖 Node HTTP/Crypto/Child Process 标准库、真实 EAP HTTPS 入口与运行中的 Compose 服务。
 * [OUTPUT]: 提供 V1 E2E 的 PKCE 登录、Cookie/Bearer 请求、断言记录和 PostgreSQL/Redis 查询原语。
 * [POS]: scripts 的 E2E 传输支撑层，只封装协议机械细节，不包含产品场景或测试数据决策。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const ORIGIN = process.env.OWNDSH_E2E_ORIGIN ?? 'https://127.0.0.1:62207';
export const ADMIN_REDIRECT = `${ORIGIN}/enterprise/auth/callback`;
export const COMPOSE_PROJECT = process.env.OWNDSH_E2E_COMPOSE_PROJECT ?? 'owndsh-local-1787559844-49611';
export const SERVER_CONTAINER = `${COMPOSE_PROJECT}-server-1`;
export const POSTGRES_CONTAINER = `${COMPOSE_PROJECT}-postgres-1`;
export const REDIS_CONTAINER = `${COMPOSE_PROJECT}-redis-1`;

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON: ${text.slice(0, 240)}`);
  }
}

export class ApiSession {
  constructor({ cookie, bearer } = {}) {
    this.cookie = cookie;
    this.bearer = bearer;
  }

  async request(path, { method = 'GET', body, headers = {}, redirect = 'follow' } = {}) {
    const requestHeaders = new Headers(headers);
    if (this.cookie) requestHeaders.set('cookie', this.cookie);
    if (this.bearer) requestHeaders.set('authorization', `Bearer ${this.bearer}`);
    if (method !== 'GET' && method !== 'HEAD') requestHeaders.set('origin', ORIGIN);
    let requestBody = body;
    if (body !== undefined && !(body instanceof URLSearchParams) && !(body instanceof FormData)
      && typeof body !== 'string' && !(body instanceof Uint8Array)) {
      requestHeaders.set('content-type', 'application/json');
      requestBody = JSON.stringify(body);
    }
    const response = await fetch(`${ORIGIN}${path}`, {
      method, headers: requestHeaders, body: requestBody, redirect,
    });
    const text = await response.text();
    return {
      response,
      text,
      json: text === '' ? undefined : parseJson(text, `${method} ${path}`),
    };
  }

  async expect(path, options = {}, expected = 200) {
    const result = await this.request(path, options);
    assert.equal(
      result.response.status,
      expected,
      `${options.method ?? 'GET'} ${path}: expected ${expected}, got ${result.response.status}: ${result.text}`,
    );
    return result;
  }

  async create(path, body) {
    return this.expect(path, {
      method: 'POST', body, headers: { 'idempotency-key': randomUUID() },
    }, 201);
  }

  async update(path, revision, body) {
    return this.expect(path, {
      method: 'PUT', body, headers: { 'if-match': String(revision) },
    });
  }

  async remove(path, revision) {
    return this.expect(path, {
      method: 'DELETE', headers: { 'if-match': String(revision) },
    });
  }
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomBytes(24).toString('base64url'),
  };
}

export async function beginAuthorization({
  clientId = 'enterprise-admin',
  redirectUri = ADMIN_REDIRECT,
  installationId,
} = {}) {
  const proof = pkce();
  const url = new URL(`${ORIGIN}/enterprise/auth/v1/authorize`);
  for (const [name, value] of Object.entries({
    client_id: clientId,
    redirect_uri: redirectUri,
    state: proof.state,
    code_challenge: proof.challenge,
    code_challenge_method: 'S256',
    installation_id: installationId,
  })) if (value !== undefined) url.searchParams.set(name, value);
  const response = await fetch(url, {
    headers: { accept: clientId === 'enterprise-admin' ? 'application/json' : 'text/html' },
    redirect: 'manual',
  });
  let sources;
  if (response.status === 200) {
    sources = parseJson(await response.text(), 'authorize').data;
  } else {
    assert.equal(response.status, 303);
    const login = new URL(response.headers.get('location'), ORIGIN);
    const transactionId = login.searchParams.get('transaction_id');
    assert.ok(transactionId);
    const sourceResponse = await fetch(
      `${ORIGIN}/enterprise/auth/v1/sources?transaction_id=${encodeURIComponent(transactionId)}`,
    );
    assert.equal(sourceResponse.status, 200);
    sources = parseJson(await sourceResponse.text(), 'sources').data;
  }
  return { ...proof, clientId, redirectUri, installationId, ...sources };
}

export async function submitPassword(flow, { sourceId, username, password, newPassword, challenge } = {}) {
  const form = new URLSearchParams({
    transactionId: flow.transactionId,
    sourceId,
    csrfToken: flow.csrfToken,
  });
  if (challenge === undefined) {
    form.set('username', username);
    form.set('password', password);
  } else {
    form.set('passwordChangeChallenge', challenge);
    form.set('newPassword', newPassword);
  }
  const response = await fetch(`${ORIGIN}/enterprise/auth/v1/password`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      origin: ORIGIN,
    },
    body: form,
  });
  const text = await response.text();
  return { response, text, json: text === '' ? undefined : parseJson(text, 'password') };
}

async function exchange(flow, callbackUri) {
  const callback = new URL(callbackUri);
  assert.equal(callback.searchParams.get('state'), flow.state);
  const code = callback.searchParams.get('code');
  assert.ok(code);
  if (flow.clientId === 'enterprise-admin') {
    const response = await fetch(`${ORIGIN}/enterprise/auth/v1/browser-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ code, redirectUri: flow.redirectUri, codeVerifier: flow.verifier }),
    });
    const setCookie = response.headers.getSetCookie()[0];
    assert.equal(response.status, 204);
    assert.ok(setCookie);
    return { session: new ApiSession({ cookie: setCookie.split(';', 1)[0] }), setCookie };
  }
  const response = await fetch(`${ORIGIN}/enterprise/auth/v1/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'authorization_code', code, clientId: flow.clientId,
      redirectUri: flow.redirectUri, codeVerifier: flow.verifier,
      installationId: flow.installationId,
    }),
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const data = parseJson(text, 'token').data;
  return { session: new ApiSession({ bearer: data.accessToken }), token: data };
}

export async function passwordLogin({
  username,
  password,
  sourceType = 'LOCAL',
  sourceId,
  clientId = 'enterprise-admin',
  redirectUri = clientId === 'enterprise-admin' ? ADMIN_REDIRECT : 'http://127.0.0.1:18080/callback',
  installationId,
} = {}) {
  const flow = await beginAuthorization({ clientId, redirectUri, installationId });
  const source = sourceId === undefined
    ? flow.sources.find(value => value.type === sourceType)
    : flow.sources.find(value => value.id === String(sourceId));
  assert.ok(source, `${sourceType} identity source is unavailable`);
  const step = await submitPassword(flow, { sourceId: source.id, username, password });
  assert.equal(step.response.status, 200, step.text);
  assert.equal(step.json.data.next, 'REDIRECT');
  return { flow, ...await exchange(flow, step.json.data.redirectUri) };
}

export async function oidcLogin({ sourceId, clientId = 'enterprise-admin', installationId } = {}) {
  const redirectUri = clientId === 'enterprise-admin'
    ? ADMIN_REDIRECT
    : 'http://127.0.0.1:18081/callback';
  const flow = await beginAuthorization({ clientId, redirectUri, installationId });
  const start = await fetch(
    `${ORIGIN}/enterprise/auth/v1/oidc/${sourceId}/start?transaction_id=${encodeURIComponent(flow.transactionId)}`,
    { redirect: 'manual' },
  );
  assert.equal(start.status, 302);
  const browserAuthorize = new URL(start.headers.get('location'));
  if (browserAuthorize.hostname === 'host.docker.internal') browserAuthorize.hostname = '127.0.0.1';
  const authorize = await fetch(browserAuthorize, { redirect: 'manual' });
  assert.equal(authorize.status, 302);
  const callback = await fetch(authorize.headers.get('location'), { redirect: 'manual' });
  const callbackText = await callback.text();
  assert.equal(callback.status, 302, callbackText);
  return { flow, ...await exchange(flow, callback.headers.get('location')) };
}

export function psql(sql) {
  return execFileSync('docker', [
    'exec', POSTGRES_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'enterprise_agent', '-d', 'enterprise_agent', '-Atc', sql,
  ], { encoding: 'utf8' }).trim();
}

export function redis(...args) {
  return execFileSync('docker', [
    'exec', REDIS_CONTAINER, 'sh', '-ec',
    'export REDISCLI_AUTH="$(cat /run/secrets/redis_password)"; exec redis-cli --raw "$@"',
    'redis-cli', ...args,
  ], { encoding: 'utf8' }).trim();
}

export function dockerInspect(container, template) {
  return execFileSync('docker', ['inspect', container, '--format', template], { encoding: 'utf8' }).trim();
}

export class Acceptance {
  constructor() {
    this.results = [];
  }

  async check(id, title, action) {
    const started = Date.now();
    try {
      const evidence = await action();
      this.results.push({ id, title, status: 'PASS', durationMs: Date.now() - started, evidence });
      process.stdout.write(`PASS ${id} ${title}\n`);
      return evidence;
    } catch (error) {
      this.results.push({ id, title, status: 'FAIL', durationMs: Date.now() - started, error: String(error) });
      process.stderr.write(`FAIL ${id} ${title}: ${String(error)}\n`);
      throw error;
    }
  }
}

export { assert, randomUUID };

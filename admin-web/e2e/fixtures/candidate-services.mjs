/**
 * [INPUT]: 依赖 Node HTTPS/crypto、只读候选证书、公开 fixture origin 与仅由 T22 编排器注入的 OIDC/upstream 测试凭据。
 * [OUTPUT]: 提供完整 OIDC Discovery/JWKS/authorize/token、Alice/Bob 登录页、DeepSeek models/chat SSE 和无敏感值控制计数。
 * [POS]: T22 外部系统确定性替身；真实 Server 与浏览器按标准协议调用，任何 Token、Key 和 prompt 都不持久化或写日志。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  createHash,
  createSign,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';

const port = Number(process.env.ENT_CANDIDATE_PORT || 19091);
const origin = process.env.ENT_CANDIDATE_ORIGIN || `http://candidate-idp.localhost:${port}`;
const oidcClientId = process.env.ENT_CANDIDATE_OIDC_CLIENT_ID;
const oidcClientSecret = process.env.ENT_CANDIDATE_OIDC_CLIENT_SECRET;
const upstreamKey = process.env.ENT_CANDIDATE_UPSTREAM_KEY;
const tlsCertificate = process.env.ENT_CANDIDATE_TLS_CERT;
const tlsKey = process.env.ENT_CANDIDATE_TLS_KEY;

if (!origin.startsWith('https://') || !oidcClientId || !oidcClientSecret || !upstreamKey
  || !tlsCertificate || !tlsKey) {
  throw new Error('candidate HTTPS fixture inputs must be injected');
}

const issuer = `${origin}/oidc`;
const keyId = 'candidate-rs256-2026';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', kid: keyId, use: 'sig' };
const codes = new Map();
const counts = { authorizations: 0, tokens: 0, modelCalls: 0 };
const users = Object.freeze({
  alice: {
    sub: 'candidate-alice-subject',
    preferred_username: 'candidate-alice',
    name: 'Candidate Alice',
    email: 'alice@candidate.test',
    groups: ['engineering'],
  },
  bob: {
    sub: 'candidate-bob-subject',
    preferred_username: 'candidate-bob',
    name: 'Candidate Bob',
    email: 'bob@candidate.test',
    groups: ['unassigned'],
  },
});

function sendJson(response, status, value) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signIdToken(claims) {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(signingInput).end().sign(privateKey, 'base64url');
  return `${signingInput}.${signature}`;
}

async function readBody(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw new Error('fixture request too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function authorizationInput(values) {
  const input = Object.fromEntries([
    'client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'code_challenge_method',
  ].map(name => [name, values.get(name)]));
  if (input.client_id !== oidcClientId || input.code_challenge_method !== 'S256') {
    throw new Error('invalid OIDC authorization client or PKCE method');
  }
  const redirect = new URL(input.redirect_uri);
  if (redirect.protocol !== 'https:' || !/^localhost$|^127\.0\.0\.1$/.test(redirect.hostname)
    || !/^\/enterprise\/auth\/v1\/oidc\/\d+\/callback$/.test(redirect.pathname)) {
    throw new Error('invalid OIDC callback');
  }
  for (const name of ['state', 'nonce', 'code_challenge']) {
    if (!input[name] || input[name].length < 32) throw new Error(`invalid OIDC ${name}`);
  }
  return input;
}

function loginPage(values) {
  const hidden = [...values.entries()]
    .filter(([name]) => name !== 'user')
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">`)
    .join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Candidate Identity</title></head>
<body><main><h1>Candidate Identity</h1><p>选择固定测试身份</p>
<form method="post" action="/oidc/authorize">${hidden}
<button name="user" value="alice" type="submit">Candidate Alice</button>
<button name="user" value="bob" type="submit">Candidate Bob</button>
</form></main></body></html>`;
}

function verifyBearer(request) {
  return request.headers.authorization === `Bearer ${upstreamKey}`;
}

const server = https.createServer({
  cert: readFileSync(tlsCertificate),
  key: readFileSync(tlsKey),
}, async (request, response) => {
  try {
    const url = new URL(request.url || '/', origin);
    if (url.pathname === '/healthz') return sendJson(response, 200, { status: 'UP' });
    if (url.pathname === '/control' && request.method === 'GET') return sendJson(response, 200, counts);

    if (url.pathname === '/oidc/.well-known/openid-configuration' && request.method === 'GET') {
      return sendJson(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        scopes_supported: ['openid', 'profile', 'email'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        id_token_signing_alg_values_supported: ['RS256'],
      });
    }
    if (url.pathname === '/oidc/jwks' && request.method === 'GET') {
      return sendJson(response, 200, { keys: [publicJwk] });
    }
    if (url.pathname === '/oidc/authorize' && request.method === 'GET') {
      authorizationInput(url.searchParams);
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
      response.end(loginPage(url.searchParams));
      return;
    }
    if (url.pathname === '/oidc/authorize' && request.method === 'POST') {
      const values = new URLSearchParams(await readBody(request));
      const input = authorizationInput(values);
      const user = users[values.get('user')];
      if (!user) throw new Error('unknown fixture identity');
      const code = randomBytes(32).toString('base64url');
      codes.set(code, { ...input, user, createdAt: Date.now() });
      counts.authorizations += 1;
      const callback = new URL(input.redirect_uri);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', input.state);
      response.writeHead(303, { location: callback.toString() }).end();
      return;
    }
    if (url.pathname === '/oidc/token' && request.method === 'POST') {
      const authorization = request.headers.authorization || '';
      const expected = `Basic ${Buffer.from(`${oidcClientId}:${oidcClientSecret}`).toString('base64')}`;
      if (authorization !== expected) return sendJson(response, 401, { error: 'invalid_client' });
      const values = new URLSearchParams(await readBody(request));
      const code = codes.get(values.get('code'));
      codes.delete(values.get('code'));
      if (!code || values.get('grant_type') !== 'authorization_code'
        || values.get('redirect_uri') !== code.redirect_uri || Date.now() - code.createdAt > 60_000) {
        return sendJson(response, 400, { error: 'invalid_grant' });
      }
      const challenge = createHash('sha256').update(values.get('code_verifier') || '').digest('base64url');
      if (challenge !== code.code_challenge) return sendJson(response, 400, { error: 'invalid_grant' });
      const now = Math.floor(Date.now() / 1000);
      counts.tokens += 1;
      return sendJson(response, 200, {
        token_type: 'Bearer',
        expires_in: 300,
        access_token: randomBytes(32).toString('base64url'),
        id_token: signIdToken({
          iss: issuer, aud: oidcClientId, iat: now, exp: now + 300, nonce: code.nonce, ...code.user,
        }),
      });
    }

    if (url.pathname === '/v1/models' && request.method === 'GET') {
      if (!verifyBearer(request)) return sendJson(response, 401, { error: { message: 'unauthorized' } });
      return sendJson(response, 200, { object: 'list', data: [{ id: 'deepseek-chat', object: 'model' }] });
    }
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      if (!verifyBearer(request)) return sendJson(response, 401, { error: { message: 'unauthorized' } });
      JSON.parse(await readBody(request, 1024 * 1024));
      counts.modelCalls += 1;
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/event-stream; charset=utf-8',
      });
      response.write('data: {"choices":[{"delta":{"content":"candidate "}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":"release response"},"finish_reason":"stop"}]}\n\n');
      response.write('data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":3,"total_tokens":11}}\n\n');
      response.end('data: [DONE]\n\n');
      return;
    }
    sendJson(response, 404, { error: 'not_found' });
  } catch {
    sendJson(response, 400, { error: 'invalid_request' });
  }
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Candidate fixtures ready on ${origin}\n`);
});

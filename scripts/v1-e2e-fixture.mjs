/**
 * [INPUT]: 依赖 Node HTTP/Crypto 标准库与 E2E 运行期生成的 OIDC client secret。
 * [OUTPUT]: 提供可控 OIDC Authorization Code + PKCE 服务和三种模型协议上游，记录脱敏请求事实。
 * [POS]: scripts 的 V1 E2E 外部系统夹具，只模拟标准边界，不承载产品逻辑或生产降级策略。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer } from 'node:http';

const MODEL_KEY = 'v1-e2e-model-key';

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function bodyOf(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function sse(response, type, payload) {
  response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function responseObject(model, text) {
  const item = {
    id: 'msg-v1-e2e', type: 'message', status: 'completed', role: 'assistant',
    content: [{ type: 'output_text', annotations: [], logprobs: [], text }],
  };
  return {
    id: 'resp-v1-e2e', object: 'response', created_at: 1, status: 'completed',
    error: null, incomplete_details: null, instructions: null, max_output_tokens: null,
    model, output: [item], parallel_tool_calls: true, previous_response_id: null,
    reasoning: { effort: null, summary: null }, store: false,
    text: { format: { type: 'text' } }, tool_choice: 'auto', tools: [],
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens: 7,
      output_tokens_details: { reasoning_tokens: 2 },
      total_tokens: 19,
    },
  };
}

function bearer(request) {
  return request.headers.authorization === `Bearer ${MODEL_KEY}`;
}

export async function startV1E2eFixture() {
  const clientId = `v1e2e-client-${randomBytes(6).toString('hex')}`;
  const clientSecret = randomBytes(24).toString('base64url');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const codes = new Map();
  const requests = [];
  let issuer;
  let oidcMode = 'success';
  let oidcUsername = 'v1e2e-shared-name';
  let modelMode = 'success';
  let modelModeUses = 0;

  function idToken(code) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', kid: 'v1-e2e-key', typ: 'JWT' }));
    const claims = {
      iss: code.mode === 'wrong-issuer' ? `${issuer}/wrong` : issuer,
      sub: 'v1-e2e-oidc-subject',
      aud: code.mode === 'wrong-audience' ? 'wrong-client' : clientId,
      iat: now,
      exp: now + 300,
      nonce: code.mode === 'wrong-nonce' ? 'wrong-nonce' : code.nonce,
      preferred_username: code.username,
      name: 'V1 E2E OIDC Member',
      email: `${code.username}@example.test`,
      groups: ['engineering'],
    };
    const payload = base64Url(JSON.stringify(claims));
    const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.invalid');
    if (url.pathname === '/.well-known/openid-configuration' && request.method === 'GET') {
      return json(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      });
    }
    if (url.pathname === '/jwks' && request.method === 'GET') {
      return json(response, 200, {
        keys: [{ ...publicJwk, kid: 'v1-e2e-key', use: 'sig', alg: 'RS256' }],
      });
    }
    if (url.pathname === '/authorize' && request.method === 'GET') {
      assert.equal(url.searchParams.get('client_id'), clientId);
      assert.equal(url.searchParams.get('response_type'), 'code');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      const nonce = url.searchParams.get('nonce');
      const challenge = url.searchParams.get('code_challenge');
      assert.ok(redirectUri && state && nonce && challenge);
      const authorizationCode = randomBytes(24).toString('base64url');
      codes.set(authorizationCode, {
        challenge, nonce, mode: oidcMode, redirectUri,
        username: oidcUsername,
      });
      const callback = new URL(redirectUri);
      callback.searchParams.set('code', authorizationCode);
      callback.searchParams.set('state', state);
      response.writeHead(302, { location: callback.toString() }).end();
      return;
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      const expectedBasic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      if (request.headers.authorization !== `Basic ${expectedBasic}`) {
        return json(response, 401, { error: 'invalid_client' });
      }
      const form = new URLSearchParams(await bodyOf(request));
      const authorizationCode = form.get('code');
      const code = codes.get(authorizationCode);
      if (!code || code.redirectUri !== form.get('redirect_uri')) {
        return json(response, 400, { error: 'invalid_grant' });
      }
      codes.delete(authorizationCode);
      const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
      if (challenge !== code.challenge) return json(response, 400, { error: 'invalid_grant' });
      return json(response, 200, {
        access_token: 'v1-e2e-external-token',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken(code),
      });
    }

    if (url.pathname === '/v1/models' && request.method === 'GET') {
      if (!bearer(request)) return json(response, 401, { error: { code: 'invalid_api_key' } });
      return json(response, 200, {
        data: [
          { id: 'v1-e2e-chat', name: 'V1 Chat', context_window: 262144, max_tokens: 8192 },
          { id: 'v1-e2e-responses', name: 'V1 Responses', context_window: 1048576, max_output_tokens: 32768 },
          { id: 'v1-e2e-anthropic', name: 'V1 Anthropic', context_window: 131072, max_tokens: 16384 },
        ],
      });
    }

    const protocol = {
      '/v1/chat/completions': 'openai-completions',
      '/v1/responses': 'openai-responses',
      '/v1/messages': 'anthropic-messages',
    }[url.pathname];
    if (protocol && request.method === 'POST') {
      const rawBody = await bodyOf(request);
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return json(response, 400, { error: { code: 'invalid_json' } });
      }
      requests.push({ protocol, headers: { ...request.headers }, body, at: Date.now() });
      const authenticated = protocol === 'anthropic-messages'
        ? request.headers['x-api-key'] === MODEL_KEY
        : bearer(request);
      if (!authenticated) return json(response, 401, { error: { code: 'invalid_api_key' } });

      modelModeUses += 1;
      if (modelMode.endsWith('-once') && modelModeUses > 1) modelMode = 'success';
      const activeMode = modelMode;
      if (activeMode === 'rate-once' && modelModeUses === 1) {
        return json(response, 429, {
          error: { code: 'rate_limit_exceeded', type: 'rate_limit_error' },
        }, { 'retry-after': '1', 'x-request-id': 'up-v1-rate' });
      }
      if (activeMode === 'unavailable-once' && modelModeUses === 1) {
        return json(response, 503, { error: { code: 'temporarily_unavailable' } }, {
          'x-request-id': 'up-v1-unavailable',
        });
      }
      if (activeMode === 'quota') {
        return json(response, 429, {
          error: { code: 'insufficient_quota', type: 'insufficient_quota' },
        }, { 'x-request-id': 'up-v1-quota' });
      }

      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/event-stream; charset=utf-8',
        'x-request-id': `up-v1-${protocol}`,
      });
      if (activeMode === 'slow' || activeMode === 'slow-once') {
        response.flushHeaders();
        await new Promise(resolve => setTimeout(resolve, 3_000));
      }
      if (activeMode === 'disconnect' || activeMode === 'disconnect-once') {
        response.flushHeaders();
        response.write('data: {"partial":');
        await new Promise(resolve => setTimeout(resolve, 100));
        response.socket?.destroy();
        return;
      }
      const includeUsage = activeMode !== 'no-usage';
      if (protocol === 'openai-completions') {
        response.write(`data: ${JSON.stringify({
          id: 'chat-v1-e2e', choices: [{ index: 0, delta: { content: 'v1 chat' } }],
        })}\n\n`);
        response.write(`data: ${JSON.stringify({
          id: 'chat-v1-e2e', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`);
        if (includeUsage) response.write(`data: ${JSON.stringify({
          id: 'chat-v1-e2e', choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 3 } },
        })}\n\n`);
        response.end('data: [DONE]\n\n');
        return;
      }
      if (protocol === 'openai-responses') {
        const completed = responseObject(String(body.model), 'v1 responses');
        if (!includeUsage) delete completed.usage;
        const item = completed.output[0];
        const part = item.content[0];
        sse(response, 'response.created', {
          type: 'response.created', response: { ...completed, status: 'in_progress', output: [] },
        });
        sse(response, 'response.output_item.added', {
          type: 'response.output_item.added', output_index: 0,
          item: { ...item, status: 'in_progress', content: [] },
        });
        sse(response, 'response.content_part.added', {
          type: 'response.content_part.added', output_index: 0, content_index: 0,
          item_id: item.id, part: { ...part, text: '' },
        });
        sse(response, 'response.output_text.delta', {
          type: 'response.output_text.delta', output_index: 0, content_index: 0,
          item_id: item.id, delta: 'v1 responses', logprobs: [],
        });
        sse(response, 'response.output_text.done', {
          type: 'response.output_text.done', output_index: 0, content_index: 0,
          item_id: item.id, text: 'v1 responses', logprobs: [],
        });
        sse(response, 'response.content_part.done', {
          type: 'response.content_part.done', output_index: 0, content_index: 0,
          item_id: item.id, part,
        });
        sse(response, 'response.output_item.done', {
          type: 'response.output_item.done', output_index: 0, item,
        });
        sse(response, 'response.completed', { type: 'response.completed', response: completed });
        response.end();
        return;
      }
      sse(response, 'message_start', {
        type: 'message_start',
        message: {
          id: 'msg-v1-e2e', type: 'message', role: 'assistant', model: body.model,
          content: [], stop_reason: null, stop_sequence: null,
          usage: includeUsage ? { input_tokens: 12, output_tokens: 0, cache_read_input_tokens: 3 } : {},
        },
      });
      sse(response, 'content_block_start', {
        type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' },
      });
      sse(response, 'content_block_delta', {
        type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'v1 anthropic' },
      });
      sse(response, 'content_block_stop', { type: 'content_block_stop', index: 0 });
      if (includeUsage) sse(response, 'message_delta', {
        type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 7 },
      });
      sse(response, 'message_stop', { type: 'message_stop' });
      response.end();
      return;
    }
    response.writeHead(404).end();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  issuer = `http://host.docker.internal:${address.port}`;

  return {
    clientId,
    clientSecret,
    issuer,
    localUrl: `http://127.0.0.1:${address.port}`,
    modelKey: MODEL_KEY,
    requests,
    setModelMode(value) {
      modelMode = value;
      modelModeUses = 0;
    },
    setOidcMode(value) {
      oidcMode = value;
    },
    setOidcUsername(value) {
      assert.match(value, /^[A-Za-z][A-Za-z0-9._-]{2,29}$/);
      oidcUsername = value;
    },
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

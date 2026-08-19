/**
 * [INPUT]: 依赖 Node HTTP 与可覆盖的本地监听端口
 * [OUTPUT]: 提供按路径隔离的确定性 OIDC Discovery/JWKS 和 DeepSeek-compatible models/chat 响应
 * [POS]: e2e/support 的外部系统替身，只验证协议连通性且从不记录 Authorization
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import http from 'node:http';

const port = Number(process.env.ENT_E2E_UPSTREAM_PORT || 19090);
const origin = `http://127.0.0.1:${port}`;
const discoveryPath = /^\/(oidc(?:\/[^/]+)?)\/\.well-known\/openid-configuration$/;
const jwksPath = /^\/(oidc(?:\/[^/]+)?)\/jwks$/;

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', origin);
  const discovery = url.pathname.match(discoveryPath);
  if (discovery) {
    const issuer = `${origin}/${discovery[1]}`;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256']
      })
    );
    return;
  }
  if (jwksPath.test(url.pathname)) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"keys":[]}');
    return;
  }
  if (url.pathname === '/v1/models') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-chat', object: 'model' }] }));
    return;
  }
  if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n' +
        'data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\n' +
        'data: [DONE]\n\n'
    );
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end('{"error":"not_found"}');
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`E2E mock upstream listening on ${origin}\n`);
});

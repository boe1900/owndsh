/**
 * [INPUT]: 依赖 Node HTTPS/HTTP、临时 TLS key/cert 与本地 admin/server 端口
 * [OUTPUT]: 提供标准 443 单 origin 反向代理和可信 X-Forwarded-Proto/Host
 * [POS]: e2e/support 的安全传输边界，使 PKCE redirect 与密码提交经过真实 HTTPS
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const listenPort = Number(process.env.ENT_E2E_HTTPS_PORT || 443);
const adminPort = Number(process.env.ENT_E2E_ADMIN_PORT || 18000);
const serverPort = Number(process.env.ENT_E2E_SERVER_PORT || 18080);
const targetHost = process.env.ENT_E2E_TARGET_HOST || '127.0.0.1';
const keyPath = process.env.ENT_E2E_TLS_KEY;
const certPath = process.env.ENT_E2E_TLS_CERT;

if (!keyPath || !certPath) {
  throw new Error('ENT_E2E_TLS_KEY and ENT_E2E_TLS_CERT are required');
}

function route(url) {
  if (url.startsWith('/dev-api/')) {
    return { port: serverPort, path: url.slice('/dev-api'.length) };
  }
  if (
    url.startsWith('/enterprise/auth/v1/') ||
    url.startsWith('/enterprise/auth/login.') ||
    url.startsWith('/auth/code')
  ) {
    return { port: serverPort, path: url };
  }
  return { port: adminPort, path: url };
}

const proxy = https.createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (request, response) => {
    const target = route(request.url || '/');
    const upstream = http.request(
      {
        hostname: targetHost,
        port: target.port,
        method: request.method,
        path: target.path,
        headers: {
          ...request.headers,
          host: `127.0.0.1:${target.port}`,
          'x-forwarded-host': request.headers.host || '127.0.0.1',
          'x-forwarded-proto': 'https'
        }
      },
      upstreamResponse => {
        response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      }
    );
    upstream.on('error', error => {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`upstream unavailable: ${error.code || 'UNKNOWN'}`);
    });
    request.pipe(upstream);
  }
);

proxy.listen(listenPort, '127.0.0.1', () => {
  process.stdout.write(`E2E HTTPS proxy listening on https://127.0.0.1:${listenPort}\n`);
});

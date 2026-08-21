/**
 * [INPUT]: 依赖 T22 fixture Compose、OIDC/DeepSeek 服务源码、审计员 migration seed、LDAP LDIF 与双版本插件 manifests。
 * [OUTPUT]: 验证全部容器 digest、协议安全不变量、最小角色测试身份和遵循官方 bundle 入口的 1.0.0/1.1.0 回滚序列。
 * [POS]: fixtures 的快速静态门禁，在容器启动前阻止外部系统和测试制品静默漂移。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');

test('fixture containers and external transports are explicit', () => {
  const compose = read('compose.yml');
  const release = read('compose.release.yml');
  assert.match(compose, /node:24\.14\.1-alpine3\.23@sha256:[a-f0-9]{64}/);
  assert.match(compose, /osixia\/openldap:1\.5\.0@sha256:[a-f0-9]{64}/);
  assert.match(compose, /LDAP_TLS: "true"/);
  assert.match(compose, /ENT_CANDIDATE_TLS_CERT: \/run\/acceptance\/idp\.crt/);
  assert.match(compose, /https:\/\/127\.0\.0\.1:19091\/healthz/);
  assert.match(compose, /127\.0\.0\.1:\$\{EAP_T22_FIXTURE_PORT/);
  assert.match(compose, /127\.0\.0\.1:\$\{EAP_T22_LDAP_PORT/);
  assert.match(release, /CAPTCHA_ENABLE: "false"/);
  assert.match(release, /javax\.net\.ssl\.trustStore=\/run\/acceptance\/candidate-truststore\.jks/);
  assert.match(release, /javax\.net\.ssl\.trustStoreType=JKS/);
  assert.doesNotMatch(release, /trustStorePassword|LDAP_TRUSTSTORE_PASSWORD/);
});

test('OIDC and DeepSeek fixture enforces the real protocol boundaries', () => {
  const source = read('candidate-services.mjs');
  for (const fact of ['client_secret_basic', "code_challenge_method !== 'S256'", "alg: 'RS256'", 'expectedNonce']) {
    if (fact === 'expectedNonce') assert.match(source, /nonce: code\.nonce/);
    else assert.ok(source.includes(fact), `missing ${fact}`);
  }
  assert.match(source, /authorization !== expected/);
  assert.match(source, /verifyBearer\(request\)/);
  assert.match(source, /https\.createServer/);
  assert.match(source, /origin\.startsWith\('https:\/\/'\)/);
  assert.doesNotMatch(source, /console\.log/);
});

test('candidate auditor seed stays isolated and least privileged', () => {
  const seed = read('candidate-auditor.sql');
  assert.match(seed, /from sys_user[\s\S]*user_name = 'candidate\.admin'/);
  assert.match(seed, /values \(1900990000000000001, 1900300000000000004\)/);
  assert.match(seed, /'candidate\.auditor'/);
  assert.match(seed, /password_change_required/);
  assert.doesNotMatch(seed, /\$2[aby]\$[A-Za-z0-9./]+/);
  assert.doesNotMatch(seed, /1900300000000000001/);
});

test('LDAP and plugin fixtures keep the candidate identities and rollback pair fixed', () => {
  const ldif = read('ldap/bootstrap.ldif');
  assert.match(ldif, /uid: candidate-alice[\s\S]*businessCategory: engineering/);
  assert.match(ldif, /uid: candidate-bob[\s\S]*businessCategory: unassigned/);
  const first = JSON.parse(read('plugins/v1/package.json'));
  const second = JSON.parse(read('plugins/v2/package.json'));
  assert.equal(first.name, '@enterprise-agent/candidate-tools');
  assert.equal(second.name, first.name);
  assert.deepEqual([first.version, second.version], ['1.0.0', '1.1.0']);
  assert.equal(first.main, './index.js');
  assert.equal(second.main, first.main);
  assert.equal(first.exports['.'], './index.js');
  assert.equal(second.exports['.'], first.exports['.']);
  for (const patch of [read('plugins/v1/cordis.patch.yml'), read('plugins/v2/cordis.patch.yml')]) {
    assert.match(patch, /name: '@enterprise-agent\/candidate-tools'/);
    assert.doesNotMatch(patch, /name: ['"]?\.\/index\.js/);
  }
  assert.equal(first.peerDependencies['@deepseek-ai/dsh-llm'], '0.1.0-rc.7');
  assert.equal(second.peerDependencies['@deepseek-ai/dsh-llm'], '0.1.0-rc.7');
});

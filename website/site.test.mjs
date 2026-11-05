/**
 * [INPUT]: 依赖 Node 原生测试、断言、文件系统和子进程能力。
 * [OUTPUT]: 验证官网可独立构建、旧文件被清理且内部文档不进入发布包。
 * [POS]: 官网部署边界的最小回归检查，不启动业务服务或安装依赖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('独立构建只发布公开文件，并清理旧产物', async () => {
  const dist = new URL('./dist/', import.meta.url);
  await mkdir(dist, { recursive: true });
  await writeFile(new URL('stale.txt', dist), 'old build');
  execFileSync(process.execPath, [fileURLToPath(new URL('./build.mjs', import.meta.url))], { cwd: tmpdir() });
  assert.deepEqual((await readdir(dist)).sort(), ['404.html', '_headers', 'assets', 'index.html', 'robots.txt', 'script.js', 'sitemap.xml', 'styles.css', 'theme.js']);
  const pageHtml = await readFile(new URL('index.html', dist), 'utf8');
  assert.equal(pageHtml.includes('(function () {'), false, 'index.html 不得出现裸脚本文本');
  assert.equal((pageHtml.match(/<script/g) || []).length, (pageHtml.match(/<\/script>/g) || []).length, 'script 标签必须配对');
  assert.deepEqual((await readdir(new URL('assets/', dist))).sort(), [
    'OFL-LICENSE.txt',
    'favicon.png',
    'og.png',
  ]);
});

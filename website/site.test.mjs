/**
 * [INPUT]: 依赖 Node 原生测试、断言、文件系统和子进程能力。
 * [OUTPUT]: 验证官网可独立构建、旧文件被清理且内部文档不进入发布包。
 * [POS]: 官网部署边界的最小回归检查，不启动业务服务或安装依赖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('独立构建只发布公开文件，并清理旧产物', async () => {
  const dist = new URL('./dist/', import.meta.url);
  await mkdir(dist, { recursive: true });
  await writeFile(new URL('stale.txt', dist), 'old build');
  execFileSync(process.execPath, [fileURLToPath(new URL('./build.mjs', import.meta.url))], { cwd: tmpdir() });
  assert.deepEqual((await readdir(dist)).sort(), ['404.html', '_headers', 'assets', 'index.html', 'script.js', 'styles.css']);
  assert.deepEqual((await readdir(new URL('assets/', dist))).sort(), [
    'INTER-LICENSE.txt',
    'LUCIDE-LICENSE.txt',
    'console.jpg',
    'desktop.jpg',
    'favicon.png',
    'inter-latin.woff2',
    'whale-animated.png',
    'whale.jpg',
  ]);
});

/**
 * [INPUT]: 依赖 Node fs/path/url 标准库与 website 公开文件白名单。
 * [OUTPUT]: 提供独立可上传到 Cloudflare Pages 的 dist 目录。
 * [POS]: 官网唯一构建入口，不读取服务端配置，也不依赖 console 构建。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', '404.html', 'styles.css', 'script.js', '_headers', 'assets']) {
  await cp(join(root, file), join(dist, file), {
    recursive: true,
    filter: (source) => basename(source) !== 'CLAUDE.md',
  });
}

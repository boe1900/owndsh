/**
 * [INPUT]: 依赖构建时冻结的官方 HTML、资源映射与精确 rc.5 metadata。
 * [OUTPUT]: 提供受版本校验的 assembly、逐项脚本装配与 bundle URL 映射。
 * [POS]: workspace 的静态 UI 边界；代码只来自随 Console 发布的固定制品。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod';

const asset = z.object({ file: z.string().startsWith('/native-workspace/'), sha256: z.string().regex(/^[a-f0-9]{64}$/), contentType: z.string() });
const manifest = z.object({ harnessVersion: z.literal('0.2.1-rc.5'), html: z.string(), resources: z.record(z.string(), asset), metadata: z.record(z.string(), z.unknown()) });
export type NativeAssembly = z.infer<typeof manifest>;

export async function loadNativeAssembly(signal: AbortSignal): Promise<NativeAssembly> {
  const response = await fetch('/native-workspace/assembly.json', { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('ENT_REMOTE_UI_UNAVAILABLE');
  const assembly = manifest.parse(await response.json());
  const metadataPaths = new Set(['/api/settings/describe', '/api/dynamicCordisRunner/syncInspectManifest', '/api/dynamicCordisRunner/inventory']);
  if (Object.keys(assembly.metadata).some(path => !metadataPaths.has(path))) throw new Error('ENT_REMOTE_UI_RESOURCE');
  return assembly;
}

export function assemblyResource(assembly: NativeAssembly, input: string): string {
  const url = new URL(input, location.origin);
  if (url.origin !== location.origin) throw new Error('ENT_REMOTE_UI_RESOURCE');
  const resource = assembly.resources[url.pathname + url.search];
  if (!resource || !/^\/native-workspace\/(?:assets|dist)\/[a-zA-Z0-9._/-]+$/.test(resource.file) || resource.file.split('/').some(part => part === '..' || part === '.')) throw new Error('ENT_REMOTE_UI_RESOURCE');
  return resource.file;
}

export function createBundleLoader(assembly: NativeAssembly): (url: string) => Promise<void> {
  const pending = new Map<string, Promise<void>>();
  return url => {
    const resource = assemblyResource(assembly, url);
    let task = pending.get(resource);
    if (!task) {
      task = insertScript({ src: resource, type: '' });
      pending.set(resource, task);
      void task.catch(() => pending.delete(resource));
    }
    return task;
  };
}

export async function mountNativeAssembly(assembly: NativeAssembly, signal: AbortSignal): Promise<void> {
  const source = new DOMParser().parseFromString(assembly.html, 'text/html');
  const imports = source.querySelectorAll('link[rel="stylesheet"], style');
  for (const node of imports) {
    signal.throwIfAborted();
    if (node instanceof HTMLLinkElement) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = assemblyResource(assembly, node.getAttribute('href') ?? '');
      document.head.append(link);
    } else {
      const style = document.createElement('style'); style.textContent = node.textContent; document.head.append(style);
    }
  }
  for (const script of source.querySelectorAll('script')) {
    signal.throwIfAborted();
    const type = script.getAttribute('type') ?? '';
    if (type && type !== 'module' && type !== 'text/javascript') throw new Error('ENT_REMOTE_UI_RESOURCE');
    const src = script.getAttribute('src');
    await insertScript({ ...(src ? { src: assemblyResource(assembly, src) } : { text: script.textContent ?? '' }), type });
  }
}

function insertScript(input: { src?: string; text?: string; type: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = input.type;
    script.async = false;
    if (input.src) {
      script.src = input.src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('ENT_REMOTE_UI_RESOURCE'));
    } else script.textContent = input.text ?? '';
    document.head.append(script);
    if (!input.src) resolve();
  });
}

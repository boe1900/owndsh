/**
 * [INPUT]: 依赖 Cookie bootstrap、固定设备目录、共享加密 link 与冻结官方 UI assembly。
 * [OUTPUT]: 装配独立原生 DSH document，显式断开当前 link、确认接管本人设备，退出时释放连接。
 * [POS]: workspace 的组合根；Console React 与原生 React 不共享渲染树或 Storage。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { loadConsoleBootstrap } from '@/auth/session';
import { connectBrowserWorkspace } from './browser-link';
import { loadNativeAssembly, mountNativeAssembly } from './native-assembly';
import { createNativeTransport } from './native-transport';
import { listWorkspaceDevices, workspaceConnection, disconnectWorkspaceConnection } from './workspace-api';
import { WorkspaceBoundary } from './workspace-boundary';
import { WorkspaceIdentity } from './workspace-identity';
import { installWorkspaceStorage } from './workspace-storage';
import { loadNativeImage } from './native-image';
import './workspace.css';

const lifetime = new AbortController();
const navigate = (url: string) => { lifetime.abort(); location.assign(url); };
const targetId = (): string => {
  const value = new URLSearchParams(location.search).get('deviceId');
  if (!value || !/^[1-9][0-9]{0,18}$/.test(value)) throw new Error('ENT_REMOTE_UNAVAILABLE');
  return value;
};
const boundary = new WorkspaceBoundary('远程工作区', () => navigate('/'), {
  snapshot: signal => workspaceConnection(targetId(), signal),
  disconnect: (linkId, signal) => disconnectWorkspaceConnection(targetId(), linkId, signal),
});
let identity: WorkspaceIdentity | undefined;
type WorkspaceFeedback = { kind: 'connecting'; message: string }
  | { kind: 'connected' }
  | { kind: 'disconnected'; code: string };
const feedback = (state: WorkspaceFeedback) => {
  identity?.setStatus(state.kind);
  switch (state.kind) {
    case 'connecting': boundary.progress(state.message); break;
    case 'connected': boundary.ready(); break;
    case 'disconnected': boundary.fail(state.code); break;
  }
};
window.addEventListener('pagehide', () => lifetime.abort(), { once: true });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

async function run(): Promise<void> {
  const deviceId = targetId();
  const bootstrap = await loadConsoleBootstrap();
  const [devices, assembly] = await Promise.all([listWorkspaceDevices(lifetime.signal), loadNativeAssembly(lifetime.signal)]);
  const target = devices.find(device => device.deviceId === deviceId);
  if (!target) throw new Error('ENT_PERMISSION_DENIED');
  document.title = `${target.name} · OwnDsh`;
  installWorkspaceStorage(bootstrap.member.id, deviceId);
  identity = new WorkspaceIdentity(target.name, () => {
    lifetime.abort();
    feedback({ kind: 'disconnected', code: 'ENT_REMOTE_DISCONNECTED' });
  });
  const link = await connectBrowserWorkspace(deviceId, lifetime.signal, state => {
    if (state.kind === 'closed' && !lifetime.signal.aborted) feedback({ kind: 'disconnected', code: state.code });
    if (state.kind === 'secure') feedback({ kind: 'connecting', message: '正在建立加密连接…' });
  });
  link.signal.addEventListener('abort', () => { if (!lifetime.signal.aborted) feedback({ kind: 'disconnected', code: 'ENT_REMOTE_CLOSED' }); }, { once: true });
  lifetime.signal.throwIfAborted();
  feedback({ kind: 'connecting', message: '正在打开原生工作区…' });
  Object.defineProperty(window, '__DSH_TRANSPORT__', { configurable: true, value: createNativeTransport(link, assembly) });
  Object.defineProperty(window, '__DSH_FILE_UPLOAD__', { configurable: true, value: { fetch: () => Promise.reject(new Error('此工作区暂不支持上传附件')) } });
  Object.defineProperty(window, '__OWNDSH_NATIVE_IMAGE__', { configurable: true, value: (url: string, signal: AbortSignal) => loadNativeImage(link, url, signal) });
  Object.defineProperty(window, '__OWNDSH_NATIVE_BOOT_FAILED__', { configurable: true, value: () => {
    feedback({ kind: 'disconnected', code: 'ENT_REMOTE_UI_UNAVAILABLE' }); lifetime.abort();
  } });
  Object.defineProperty(window, '__OWNDSH_NATIVE_BOOT__', { configurable: true, value: () => { if (!link.signal.aborted && !lifetime.signal.aborted) feedback({ kind: 'connected' }); } });
  await mountNativeAssembly(assembly, lifetime.signal);
}

void run().catch((error: unknown) => {
  if (lifetime.signal.aborted) return;
  const code = error instanceof Error && /^ENT_[A-Z_]+$/.test(error.message) ? error.message : 'ENT_REMOTE_UI_UNAVAILABLE';
  feedback({ kind: 'disconnected', code });
  lifetime.abort();
});

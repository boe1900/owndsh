/**
 * [INPUT]: 依赖真实 document 控件与可控的本人设备快照/断开端口。
 * [OUTPUT]: 验证断开按钮、版本升级提示、键盘阻断、接管确认/取消、重复点击和陈旧确认保护。
 * [POS]: workspace 的操作语义回归；网络授权与 Gateway fencing 由服务端测试验证。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceBoundary } from './workspace-boundary';
import { WorkspaceIdentity } from './workspace-identity';

const button = (label: string): HTMLButtonElement => {
  const result = [...document.querySelectorAll('button')].find(element => element.textContent === label);
  if (!result) throw new Error(`missing ${label}`);
  return result;
};
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  document.body.innerHTML = '<div id="root"><button>原生操作</button></div>';
  vi.stubGlobal('location', { reload: vi.fn() });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); } },
  });
});
afterEach(() => { Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

function fixture() {
  const snapshot = vi.fn(async (_signal: AbortSignal): Promise<string | null> => 'old-link');
  const disconnect = vi.fn(async (_linkId: string, _signal: AbortSignal): Promise<void> => {});
  const boundary = new WorkspaceBoundary('测试设备', vi.fn(), { snapshot, disconnect });
  boundary.fail('ENT_REMOTE_BUSY');
  return { snapshot, disconnect, boundary };
}

describe('workspace connection controls', () => {
  it('blocks incompatible Host versions with an actionable upgrade message', () => {
    const { boundary } = fixture();
    boundary.fail('ENT_REMOTE_DSH_VERSION');
    expect(document.body.textContent).toContain('请将设备上的 DSH 和 OwnDsh 插件升级');
    expect(document.getElementById('root')?.inert).toBe(true);
    expect(button('断开旧连接并连接').hidden).toBe(true);
    expect(vi.mocked(location.reload)).not.toHaveBeenCalled();
  });
  it('blocks native keyboard interaction until ready and exposes disconnect only while connected', () => {
    const { boundary } = fixture();
    expect(document.getElementById('root')?.inert).toBe(true);
    boundary.ready();
    expect(document.getElementById('root')?.inert).toBe(false);
    const disconnect = vi.fn();
    const identity = new WorkspaceIdentity('设备', disconnect);
    expect(button('断开连接').disabled).toBe(true);
    identity.setStatus('connected'); button('断开连接').click();
    expect(disconnect).toHaveBeenCalledTimes(1);
    identity.setStatus('disconnected'); boundary.fail('ENT_REMOTE_DISCONNECTED');
    expect(button('断开连接').disabled).toBe(true);
    expect(document.body.textContent).toContain('已主动断开连接');
    expect(document.getElementById('root')?.inert).toBe(true);
    expect(vi.mocked(location.reload)).not.toHaveBeenCalled();
  });

  it('loads one fresh snapshot and cancellation never disconnects it', async () => {
    const { snapshot, disconnect } = fixture();
    button('断开旧连接并连接').click(); button('断开旧连接并连接').click();
    await settle();
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(snapshot.mock.calls[0]?.[0].aborted).toBe(false);
    expect(document.querySelector('dialog')?.open).toBe(true);
    button('取消').click();
    expect(disconnect).not.toHaveBeenCalled();
    expect(document.querySelector('dialog')?.open).toBe(false);
    snapshot.mockResolvedValueOnce('replacement');
    button('断开旧连接并连接').click(); await settle();
    button('断开并连接').click(); await settle();
    expect(disconnect.mock.calls[0]?.[0]).toBe('replacement');
    expect(vi.mocked(location.reload)).toHaveBeenCalledTimes(1);
  });

  it('confirms the exact snapshot once and prevents duplicate disconnects', async () => {
    const { disconnect } = fixture();
    let finish: (() => void) | undefined;
    disconnect.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    button('断开旧连接并连接').click(); await settle();
    button('断开并连接').click(); button('断开并连接').click();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect.mock.calls[0]?.[0]).toBe('old-link');
    expect(button('取消').disabled).toBe(true);
    expect(vi.mocked(location.reload)).not.toHaveBeenCalled();
    finish?.(); await settle();
    expect(vi.mocked(location.reload)).toHaveBeenCalledTimes(1);
  });

  it('requires a fresh confirmation after the connection changed and reports failures', async () => {
    const { snapshot, disconnect } = fixture();
    disconnect.mockRejectedValueOnce(new Error('ENT_REMOTE_BUSY'));
    button('断开旧连接并连接').click(); await settle();
    button('断开并连接').click(); await settle();
    expect(document.body.textContent).toContain('连接已发生变化');
    expect(vi.mocked(location.reload)).not.toHaveBeenCalled();
    snapshot.mockResolvedValueOnce('new-link');
    button('断开旧连接并连接').click(); await settle();
    expect(disconnect).toHaveBeenCalledTimes(1);
    button('断开并连接').click(); await settle();
    expect(disconnect.mock.calls[1]?.[0]).toBe('new-link');
    expect(vi.mocked(location.reload)).toHaveBeenCalledTimes(1);
  });

  it('reconnects without a destructive request if the prior connection already left', async () => {
    const { snapshot, disconnect } = fixture(); snapshot.mockResolvedValueOnce(null);
    button('断开旧连接并连接').click(); await settle();
    expect(disconnect).not.toHaveBeenCalled();
    expect(document.querySelector('dialog')?.open).toBe(false);
    expect(vi.mocked(location.reload)).toHaveBeenCalledTimes(1);
  });
});

/**
 * [INPUT]: 依赖已授权设备名称、entry 的明确连接状态与当前 document 断开动作。
 * [OUTPUT]: 提供固定设备身份、连接状态、主动断开按钮与新标签管控台链接。
 * [POS]: workspace 的轻量 document 外壳，作为原生 #root 的兄弟分配高度，不修改原生品牌按钮。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export type WorkspaceStatus = 'connecting' | 'connected' | 'disconnected';

const statusLabels = { connecting: '正在连接', connected: '已连接', disconnected: '连接已断开' } satisfies Record<WorkspaceStatus, string>;

export class WorkspaceIdentity {
  private readonly status = document.createElement('span');
  private readonly disconnect = document.createElement('button');

  constructor(name: string, disconnect: () => void) {
    const element = document.createElement('header');
    element.className = 'owndsh-workspace-identity';
    element.setAttribute('aria-label', '远程设备');
    const device = document.createElement('span');
    device.className = 'owndsh-workspace-device';
    device.textContent = name;
    device.title = name;
    this.status.className = 'owndsh-workspace-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    const consoleLink = document.createElement('a');
    consoleLink.href = '/';
    consoleLink.target = '_blank';
    consoleLink.rel = 'noopener noreferrer';
    consoleLink.textContent = '管控台 ↗';
    consoleLink.setAttribute('aria-label', '在新标签页打开管控台');
    this.disconnect.type = 'button';
    this.disconnect.textContent = '断开连接';
    this.disconnect.onclick = disconnect;
    element.append(device, this.status, this.disconnect, consoleLink);
    document.body.prepend(element);
    document.body.classList.add('owndsh-has-workspace-identity');
    this.setStatus('connecting');
  }

  setStatus(status: WorkspaceStatus): void {
    this.status.dataset.status = status;
    this.status.textContent = statusLabels[status];
    this.disconnect.disabled = status !== 'connected';
  }
}

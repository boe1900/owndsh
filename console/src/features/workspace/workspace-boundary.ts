/**
 * [INPUT]: 依赖稳定错误码、显式返回动作和本人设备连接快照/准确断开端口。
 * [OUTPUT]: 将连接错误映射为操作提示并阻断失联工作区；占用时以原生对话框确认准确连接后接管，不重放业务操作。
 * [POS]: workspace 的唯一连接反馈，接管请求独立于已终止的 document link，旧页不会自动抢回。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const messages: Record<string, string> = {
  ENT_AUTH_REQUIRED: '登录已失效，请重新登录。',
  ENT_DEVICE_REVOKED: '设备已撤销，远控已关闭。',
  ENT_PERMISSION_DENIED: '当前账号没有远控权限。',
  ENT_REMOTE_UNAVAILABLE: '设备当前不在线。',
  ENT_REMOTE_DISABLED: '设备未开启远控。',
  ENT_REMOTE_FEATURE_NOT_SUPPORTED: '设备不支持请求的远控能力。',
  ENT_REMOTE_TURN_NOT_CONFIGURED: '远程中继服务尚未配置。',
  ENT_REMOTE_IDENTITY_UNSUPPORTED: '当前浏览器不支持远控身份密钥。',
  ENT_REMOTE_BUSY: '这台设备正在被另一个远程页面使用。可以关闭原页面，或断开旧连接后在这里连接。',
  ENT_REMOTE_TAKEN_OVER: '此连接已被另一个远程页面断开。需要继续使用时，请显式重新连接。',
  ENT_REMOTE_CLOSED: '与设备的连接已断开。重新连接后可以继续查看会话。',
  ENT_REMOTE_DISCONNECTED: '已主动断开连接。需要继续使用时，请点击重新连接。',
  ENT_REMOTE_TIMEOUT: '设备连接超时。请确认设备在线且已开启远控。',
  ENT_REMOTE_DSH_VERSION: '设备工作区版本与管控台不一致。请将设备上的 DSH 和 OwnDsh 插件升级到与管控台配套的版本后重新连接。',
  ENT_REMOTE_UI_UNAVAILABLE: '工作区界面资源暂时不可用。请刷新重试。',
  ENT_REMOTE_UI_RESOURCE: '工作区界面资源加载失败。请刷新重试。',
};
const connectionFailureMessage = '远程连接出现异常，请确认设备在线且已开启远控后重试。';

type TakeoverState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'confirming'; linkId: string } | { kind: 'disconnecting' };
interface TakeoverActions {
  snapshot(signal: AbortSignal): Promise<string | null>;
  disconnect(linkId: string, signal: AbortSignal): Promise<void>;
}

export class WorkspaceBoundary {
  private readonly element = document.createElement('div');
  private readonly heading = document.createElement('h1');
  private readonly detail = document.createElement('p');
  private readonly retry = document.createElement('button');
  private readonly takeover = document.createElement('button');
  private readonly dialog = document.createElement('dialog');
  private state: TakeoverState = { kind: 'idle' };

  constructor(name: string, leave: () => void, private readonly actions: TakeoverActions) {
    this.element.className = 'owndsh-workspace-boundary';
    this.element.setAttribute('role', 'status');
    const card = document.createElement('section'); card.className = 'owndsh-workspace-boundary-card';
    const brand = document.createElement('div'); brand.className = 'owndsh-workspace-brand'; brand.textContent = 'OwnDsh / 远程工作区';
    this.heading.textContent = name;
    const buttons = document.createElement('div'); buttons.className = 'owndsh-workspace-boundary-actions';
    this.retry.type = 'button'; this.retry.textContent = '重新连接'; this.retry.hidden = true;
    this.retry.onclick = () => location.reload();
    this.takeover.type = 'button'; this.takeover.textContent = '断开旧连接并连接'; this.takeover.hidden = true;
    this.takeover.onclick = () => { void this.prepareTakeover(); };
    const back = document.createElement('button'); back.type = 'button'; back.textContent = '返回管控台'; back.onclick = leave;
    buttons.append(back, this.retry, this.takeover); card.append(brand, this.heading, this.detail, buttons);
    this.element.append(card); document.body.append(this.element);
    this.setupDialog();
    this.progress('正在连接设备…');
  }

  progress(message: string): void {
    this.block();
    this.detail.textContent = message;
  }

  ready(): void {
    this.element.hidden = true;
    const root = document.getElementById('root');
    if (root) root.inert = false;
  }

  fail(code: string): void {
    this.block();
    this.element.setAttribute('role', 'alert');
    this.detail.textContent = messages[code] ?? connectionFailureMessage;
    this.retry.hidden = false;
    this.takeover.hidden = code !== 'ENT_REMOTE_BUSY';
  }

  private block(): void {
    this.element.hidden = false;
    const root = document.getElementById('root');
    if (root) root.inert = true;
  }

  private setupDialog(): void {
    this.dialog.className = 'owndsh-workspace-confirm';
    this.dialog.setAttribute('aria-labelledby', 'workspace-takeover-title');
    const title = document.createElement('h2'); title.id = 'workspace-takeover-title'; title.textContent = '断开旧连接并在此连接？';
    const detail = document.createElement('p'); detail.textContent = '另一个远程页面将立即断开。远程设备会保持在线，已启动的会话不会被删除。';
    const buttons = document.createElement('div'); buttons.className = 'owndsh-workspace-boundary-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消'; cancel.autofocus = true;
    cancel.onclick = () => this.dialog.close();
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = '断开并连接';
    confirm.onclick = () => { void this.confirmTakeover(); };
    buttons.append(cancel, confirm); this.dialog.append(title, detail, buttons); document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { if (this.state.kind === 'disconnecting') event.preventDefault(); });
    this.dialog.addEventListener('close', () => {
      if (this.state.kind === 'confirming') { this.state = { kind: 'idle' }; this.takeover.disabled = false; }
    });
  }

  private async prepareTakeover(): Promise<void> {
    if (this.state.kind !== 'idle') return;
    this.state = { kind: 'loading' }; this.takeover.disabled = true;
    try {
      const linkId = await this.actions.snapshot(AbortSignal.timeout(10_000));
      if (linkId === null) { location.reload(); return; }
      this.state = { kind: 'confirming', linkId };
      this.dialog.showModal();
    } catch (error) { this.takeoverFailed(error); }
  }

  private async confirmTakeover(): Promise<void> {
    if (this.state.kind !== 'confirming') return;
    const { linkId } = this.state;
    this.state = { kind: 'disconnecting' };
    this.dialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      await this.actions.disconnect(linkId, AbortSignal.timeout(10_000));
      location.reload();
    } catch (error) { this.takeoverFailed(error); }
  }

  private takeoverFailed(error: unknown): void {
    this.dialog.close();
    this.state = { kind: 'idle' }; this.takeover.disabled = false;
    this.dialog.querySelectorAll('button').forEach(button => { button.disabled = false; });
    const code = error instanceof Error ? error.message : 'ENT_PLATFORM_UNAVAILABLE';
    this.detail.textContent = code === 'ENT_REMOTE_BUSY'
      ? '连接已发生变化。请重新点击断开旧连接并连接，确认当前连接后再操作。'
      : `未能断开旧连接。${messages[code] ?? connectionFailureMessage}`;
    this.takeover.focus();
  }
}

/**
 * [INPUT]: 依赖 Cookie WebSocket、contracts frame parser、共享 Noise/lease/tunnel 与本人 ticket。
 * [OUTPUT]: 提供单设备单 link 的浏览器连接，只有加密握手、租约和 carrier ready 后才交付，关闭时保留服务端拒绝和准确 link 被接管的原因。
 * [POS]: workspace 的连接所有者；页面关闭立即释放，不重连或重放业务 mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { remoteProtocolSha256, parseRemoteControlFrame, parseRemoteRelayFrame, remoteWebSocketUrl, type RemoteControlFrame, type RemoteRelayFrame } from '@owndsh/contracts';
import { SecureDshLink, deferred, encodeKey, generateNoiseKeyPair, remoteFrameId, type RemoteDshLink, type SecureLinkConnection } from '@owndsh/remote-core';
import { issueWorkspaceTicket } from './workspace-api';

export type WorkspaceLinkState = { kind: 'connecting' } | { kind: 'secure' } | { kind: 'ready' } | { kind: 'closed'; code: string };

class BrowserConnection implements SecureLinkConnection {
  private readonly socket: WebSocket;
  private readonly ready = deferred<void>();
  private state: 'CONNECTING' | 'AUTHENTICATED' | 'READY' | 'CLOSED' = 'CONNECTING';
  private link: SecureDshLink | undefined;
  private clock = { remote: Date.now(), local: performance.now() };
  private failure = 'ENT_REMOTE_CLOSED';
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(identity: { deviceId: string; publicKey: string }, private readonly onState: (state: WorkspaceLinkState) => void) {
    this.socket = new WebSocket(remoteWebSocketUrl(location.origin));
    this.timer = setTimeout(() => this.fail('ENT_REMOTE_TIMEOUT'), 10_000);
    void this.ready.promise.catch(() => {});
    this.socket.addEventListener('open', () => {
      if (this.state !== 'CONNECTING') return;
      this.state = 'AUTHENTICATED';
      this.send({ v: 1, type: 'hello', id: remoteFrameId(), ts: Date.now(), payload: {
        role: 'controller', deviceId: identity.deviceId, publicKey: identity.publicKey,
        capabilities: ['remote.connect', 'host.describe'], protocolSha256: remoteProtocolSha256,
      } });
    });
    this.socket.addEventListener('message', event => {
      try {
        if (this.state === 'CLOSED' || typeof event.data !== 'string' || event.data.length > 100_000) throw new Error('ENT_REMOTE_PROTOCOL');
        const value: unknown = JSON.parse(event.data);
        if (typeof value === 'object' && value !== null && 'kind' in value) {
          const frame = parseRemoteRelayFrame(value);
          if (frame.kind === 'close' && frame.linkId === this.link?.linkId && frame.code) this.failure = frame.code;
          this.link?.relay(frame);
        }
        else this.control(parseRemoteControlFrame(value));
      } catch { this.fail('ENT_REMOTE_PROTOCOL'); }
    });
    this.socket.addEventListener('error', () => this.fail('ENT_PLATFORM_UNAVAILABLE'));
    this.socket.addEventListener('close', event => this.fail(event.code === 4003 ? 'ENT_AUTH_REQUIRED' : this.failure));
  }

  currentState(): string { return this.state; }
  serverNow = (): number => this.clock.remote + performance.now() - this.clock.local;
  waitReady(): Promise<void> { return this.ready.promise; }
  bind(link: SecureDshLink): void { this.link = link; }
  send(frame: RemoteControlFrame): void {
    if (this.socket.readyState !== WebSocket.OPEN || this.state === 'CLOSED') throw new Error('ENT_REMOTE_CLOSED');
    this.socket.send(JSON.stringify(frame));
  }
  sendRelay(frame: RemoteRelayFrame): void {
    if (this.socket.readyState !== WebSocket.OPEN || this.state !== 'READY') throw new Error('ENT_REMOTE_CLOSED');
    if (this.socket.bufferedAmount > 4 * 1024 * 1024) { this.fail('ENT_REMOTE_LIMIT'); throw new Error('ENT_REMOTE_LIMIT'); }
    this.socket.send(JSON.stringify(frame));
  }
  close(): void { this.fail(this.failure); }
  private control(frame: RemoteControlFrame): void {
    if (frame.type === 'hello.ack') {
      if (this.state !== 'AUTHENTICATED' || frame.payload.protocolSha256 !== remoteProtocolSha256 || frame.payload.peerRole !== 'controller') throw new Error('ENT_REMOTE_PROTOCOL');
      if (frame.payload.serverTime !== undefined) this.clock = { remote: frame.payload.serverTime, local: performance.now() };
      this.state = 'READY'; clearTimeout(this.timer); this.ready.resolve();
    }
    if (frame.type === 'error') { this.fail(frame.payload.code); return; }
    if (frame.type === 'connect.reject') this.failure = frame.payload.code;
    if (frame.type === 'secure.handshake') this.onState({ kind: 'secure' });
    this.link?.control(frame);
  }
  private fail(code: string): void {
    if (this.state === 'CLOSED') return;
    this.failure = code;
    this.state = 'CLOSED';
    clearTimeout(this.timer);
    this.ready.reject(new Error(code));
    this.link?.ready.reject(new Error(code));
    this.link?.close(false);
    this.socket.close(1000, 'workspace closed');
    this.onState({ kind: 'closed', code });
  }
}

export async function connectBrowserWorkspace(deviceId: string, signal: AbortSignal, onState: (state: WorkspaceLinkState) => void): Promise<RemoteDshLink> {
  onState({ kind: 'connecting' });
  const key = generateNoiseKeyPair();
  const controllerId = remoteFrameId('ctl');
  const controllerPublicKey = encodeKey(key.publicKey);
  let connection: BrowserConnection | undefined;
  let link: SecureDshLink | undefined;
  const abort = () => { link?.close(); connection?.close(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    const ticket = await issueWorkspaceTicket(deviceId, { controllerDeviceId: controllerId, controllerPublicKey }, signal);
    signal.throwIfAborted();
    connection = new BrowserConnection({ deviceId: controllerId, publicKey: controllerPublicKey }, onState);
    await connection.waitReady();
    signal.throwIfAborted();
    link = new SecureDshLink({ role: 'controller', linkId: ticket.linkId, hostDeviceId: deviceId, controllerId,
      hostPublicKey: ticket.hostPublicKey, controllerPublicKey, localKey: key, connection, serverNow: connection.serverNow,
      closed: () => { signal.removeEventListener('abort', abort); connection?.close(); },
    });
    connection.bind(link);
    connection.send({ v: 1, type: 'connect.request', id: remoteFrameId(), ts: Date.now(), payload: {
      linkId: ticket.linkId, deviceId, controllerId, ticket: ticket.ticket, iceServers: ticket.iceServers,
    } });
    const ready = await link.ready.promise;
    onState({ kind: 'ready' });
    return ready;
  } catch (error) { abort(); throw error; }
  finally { key.secretKey.fill(0); }
}

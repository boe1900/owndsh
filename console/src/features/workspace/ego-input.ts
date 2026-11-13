/**
 * [INPUT]: 依赖经过契约校验的 EgoInput、当前 link signal 和单次远端发送函数。
 * [OUTPUT]: 提供有界保序输入队列，相邻移动合并、显式停止、故障停止和按键释放。
 * [POS]: Ego 网络适配器独占的输入状态机；不重试、不跨 link 重放用户操作。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { EgoInput } from '@owndsh/contracts';

type Entry = { input: EgoInput; resolve(response: Response): void; reject(error: Error): void };
type Send = (input: EgoInput) => Promise<Response>;
export class EgoInputQueue {
  private state: 'ready' | 'stopped' = 'ready';
  private readonly queue: Entry[] = [];
  private readonly pressed = new Map<string, EgoInput>();
  private running = false;
  private readonly abort = () => this.stop(new Error('ENT_REMOTE_CLOSED'));
  constructor(private readonly signal: AbortSignal, private readonly send: Send, private readonly failed: () => void) {
    signal.addEventListener('abort', this.abort, { once: true });
    if (signal.aborted) this.abort();
  }
  enqueue(input: EgoInput): Promise<Response> {
    if (this.state === 'stopped') return Promise.reject(new Error('ENT_REMOTE_EGO_INPUT_STOPPED'));
    return new Promise<Response>((resolve, reject) => {
      const last = this.queue.at(-1);
      if (last && input.type === 'mouseMoved' && last.input.type === 'mouseMoved'
        && last.input.targetId === input.targetId && last.input.buttons === input.buttons) {
        last.input = input;
        // 合并移动无需保存每一帧的 Promise，原生调用方只使用 HTTP 状态。
        resolve(Response.json({ ok: true, coalesced: true }));
        return;
      }
      if (this.queue.length >= 64) {
        const error = new Error('ENT_REMOTE_LIMIT');
        reject(error); this.stop(error); return;
      }
      this.queue.push({ input, resolve, reject });
      void this.drain();
    });
  }
  stop(error: Error): void {
    if (this.state === 'stopped') return;
    this.state = 'stopped';
    this.signal.removeEventListener('abort', this.abort);
    for (const entry of this.queue.splice(0)) entry.reject(error);
    if (!this.signal.aborted) this.failed();
    if (!this.running) void this.release();
  }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.state === 'ready') {
        const entry = this.queue.shift();
        if (!entry) break;
        const input = entry.input;
        const id = input.targetId + ':' + ('key' in input ? 'key:' + (input.code || input.key) : 'mouse:' + ('button' in input ? input.button ?? 'left' : 'left'));
        try {
          this.signal.throwIfAborted();
          if (input.type === 'keyDown' || input.type === 'mousePressed') this.pressed.set(id, input);
          const response = await this.send(input);
          if (!response.ok) throw new Error('ENT_REMOTE_EGO_INPUT_FAILED');
          const result: unknown = await response.clone().json();
          if (typeof result !== 'object' || result === null || !('ok' in result) || result.ok !== true) throw new Error('ENT_REMOTE_EGO_INPUT_FAILED');
          if (input.type === 'keyUp' || input.type === 'mouseReleased') this.pressed.delete(id);
          if (this.state !== 'ready') throw new Error('ENT_REMOTE_EGO_INPUT_STOPPED');
          entry.resolve(response);
        } catch (error) {
          const failure = error instanceof Error ? error : new Error('ENT_REMOTE_EGO_INPUT_FAILED');
          entry.reject(failure);
          this.stop(failure);
        }
      }
    } finally {
      this.running = false;
      if (this.state === 'stopped') await this.release();
    }
  }
  private async release(): Promise<void> {
    const inputs = [...this.pressed.values()];
    this.pressed.clear();
    if (this.signal.aborted) return;
    for (const input of inputs) {
      const released: EgoInput = input.type === 'keyDown' ? { ...input, type: 'keyUp', autoRepeat: false, modifiers: 0 }
        : input.type === 'mousePressed' ? { ...input, type: 'mouseReleased', buttons: 0 } : input;
      try { const response = await this.send(released); await response.body?.cancel(); } catch {}
    }
  }
}

/**
 * [INPUT]: 依赖真实 Promise/Response 与有界 Ego 输入队列。
 * [OUTPUT]: 验证点击保序、移动合并不跨按键、失败释放和断线不重放。
 * [POS]: 浏览器输入语义回归；发送延迟由可控响应表达。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it, vi } from 'vitest';
import type { EgoInput } from '@owndsh/contracts';
import { EgoInputQueue } from './ego-input';
const pointer = (type: 'mousePressed' | 'mouseReleased' | 'mouseMoved', x = 1): EgoInput => ({ targetId: 't', type, x, y: 1, buttons: 0 });
const okay = () => Response.json({ ok: true });
function fixture() {
  const abort = new AbortController();
  let resolve: (response: Response) => void = () => {};
  const gate = new Promise<Response>(yes => { resolve = yes; });
  const send = vi.fn<(input: EgoInput) => Promise<Response>>().mockImplementationOnce(() => gate).mockImplementation(async () => okay());
  const failed = vi.fn();
  const queue = new EgoInputQueue(abort.signal, send, failed);
  return { queue, send, failed, abort, release: resolve };
}
describe('Ego input semantics', () => {
  it('waits for press before release and coalesces only adjacent moves', async () => {
    const { queue, send, release } = fixture();
    const jobs = [queue.enqueue(pointer('mousePressed')), queue.enqueue(pointer('mouseMoved', 2)), queue.enqueue(pointer('mouseMoved', 3)),
      queue.enqueue({ targetId: 't', type: 'keyDown', key: 'Shift' }), queue.enqueue(pointer('mouseMoved', 4)), queue.enqueue(pointer('mouseMoved', 5)), queue.enqueue(pointer('mouseReleased'))];
    expect(send.mock.calls).toHaveLength(1);
    release(okay()); await Promise.all(jobs);
    expect(send.mock.calls.map(([input]) => [input.type, 'x' in input ? input.x : null])).toEqual([
      ['mousePressed', 1], ['mouseMoved', 3], ['keyDown', null], ['mouseMoved', 5], ['mouseReleased', 1],
    ]);
  });
  it('stops after an HTTP failure, rejects unsent actions and releases an uncertain pressed key', async () => {
    const { queue, send, release, failed } = fixture();
    const first = queue.enqueue({ targetId: 't', type: 'keyDown', key: 'Control', code: 'ControlLeft' });
    const next = queue.enqueue({ targetId: 't', type: 'insertText', text: 'never sent' });
    const settled = Promise.allSettled([first, next]);
    release(Response.json({ ok: false }, { status: 502 }));
    expect((await settled).every(result => result.status === 'rejected')).toBe(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[0]).toMatchObject({ type: 'keyUp', key: 'Control', modifiers: 0 });
    expect(failed).toHaveBeenCalledOnce();
    await expect(queue.enqueue(pointer('mouseMoved'))).rejects.toThrow('ENT_REMOTE_EGO_INPUT_STOPPED');
  });
  it('fails visibly on a full queue and never dispatches its accumulated clicks', async () => {
    const { queue, send, release, failed } = fixture();
    const jobs = [queue.enqueue(pointer('mousePressed'))];
    for (let i = 0; i < 65; i++) jobs.push(queue.enqueue({ targetId: 't', type: 'insertText', text: 'x' }));
    const settled = Promise.allSettled(jobs);
    release(okay()); await settled;
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[0].type).toBe('mouseReleased');
    expect(failed).toHaveBeenCalledOnce();
  });
  it('discards queued actions when the link closes without trying cleanup through a dead link', async () => {
    const { queue, send, release, failed, abort } = fixture();
    const first = queue.enqueue(pointer('mousePressed'));
    const second = queue.enqueue(pointer('mouseReleased'));
    const settled = Promise.allSettled([first, second]);
    abort.abort(); release(okay()); await settled;
    expect(send).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });
});

/**
 * [INPUT]: 依赖官方 Connection Peer 与 Host carrier 的公开 Gateway 端口类型。
 * [OUTPUT]: 提供可观察 Cookie 准入和订阅生命周期的本地测试夹具。
 * [POS]: bundle 测试的进程内 Gateway 夹具，HTTP 路由由各测试实际监听。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import type { DshCarrierContext } from '../src/remote/dsh-carrier.js'

type Ports = Pick<DshCarrierContext, 'connection' | 'typertGateway'>
type Open = Ports['typertGateway']['wireStream']['open']

export function nativeGatewayFixture({
  open = async function* () {},
  onAdmit,
  onRelease,
}: { open?: Open; onAdmit?: (headers: Headers) => void; onRelease?: () => void } = {}): Ports {
  const peer = new Peer(new Context(), { principal: { kind: 'owner' }, interactions: 'answer' })
  return {
    connection: {
      authenticatedUrl: (url) => url,
      admitConnection: ({ headers }) => {
        onAdmit?.(new Headers(headers as HeadersInit))
        return { peer, release: async () => { onRelease?.(); await peer.dispose() } }
      },
    },
    typertGateway: {
      wireStream: { open, failure: () => ({ code: 'gateway/internal', message: 'Fixture stream failed.', details: {} }) },
    },
  }
}

/**
 * [INPUT]: 依赖锁定 rc.3 的官方会话导出客户端制品和原生 transport。
 * [OUTPUT]: 将 Markdown 复制的读取接入唯一远端连接并校验响应类型，保留官方剪贴板生命周期。
 * [POS]: 原生工作区的构建期适配；只修改复制控制器，不接管全局 fetch 或 ZIP 下载。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const MARKDOWN_SOURCE_SHA256 = '90b490779c382d93b085ec7633963afbd3665dd9836b007860fd5d726940234c'
export const MARKDOWN_FACTORY = 'id:`@deepseek-ai/dsh-session-log-export`,factory:require=>{'

export function patchSessionMarkdownClient(bytes) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), MARKDOWN_SOURCE_SHA256, '会话导出客户端变化，必须重新核验 Markdown 复制接缝')
  const source = bytes.toString('utf8')
  const constructor = 'const copyController=new SessionMarkdownCopyController;'
  assert.equal(source.split(constructor).length, 2, 'Markdown 复制控制器接缝必须唯一')
  const fetcher = 'async(input,init)=>{const response=await globalThis.__DSH_TRANSPORT__.fetch(input,init??{});if(response.ok&&response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="text/markdown"){await response.body?.cancel();throw new Error("ENT_REMOTE_MARKDOWN_RESPONSE")}return response}'
  return Buffer.from(source.replace(constructor, `const copyController=new SessionMarkdownCopyController(${fetcher});`))
}

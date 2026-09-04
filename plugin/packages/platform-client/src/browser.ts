/**
 * [INPUT]: 依赖 Node child_process 以 argv 方式调用 macOS/Windows/Linux 系统 URL opener
 * [OUTPUT]: 对外提供 openSystemBrowser 可取消浏览器交接端口
 * [POS]: platform-client 的桌面能力适配器，不经 shell 拼接且不参与 OAuth 协议判断
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFile } from 'node:child_process'

/** 通过操作系统默认浏览器打开已校验的 HTTP(S) URL。 */
export async function openSystemBrowser(url: string, signal: AbortSignal): Promise<void> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('browser URL must use http or https')
  }
  const command = process.platform === 'darwin'
    ? { file: 'open', args: [url] }
    : process.platform === 'win32'
      ? { file: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] }
      : process.platform === 'linux'
        ? { file: 'xdg-open', args: [url] }
        : undefined
  if (command === undefined) throw new Error(`system browser is unsupported on ${process.platform}`)
  await new Promise<void>((resolvePromise, reject) => {
    execFile(command.file, command.args, { signal, windowsHide: true }, (error) => {
      if (error === null) resolvePromise()
      else reject(error)
    })
  })
}

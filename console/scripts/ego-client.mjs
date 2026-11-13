/**
 * [INPUT]: 依赖精确 Ego 0.9.14 客户端制品及已验证的 factory/侧栏接缝。
 * [OUTPUT]: 生成只使用局部密文网络、可选挂载的原生观察窗，移除本机登录/配置的控件及渲染引用。
 * [POS]: 构建期的固定版本适配；源码 hash 或接缝变化即失败，运行时不加载远端代码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const EGO_SOURCE_SHA256 = 'a49c16bc762a4f8091faac840bd3c2ec70fdb57a3eeed674175ba50f129c5520'
export const EGO_FACTORY = 'id: "dsh-ego-browser",\n\tfactory: (require) => {'

export function patchEgoClient(bytes) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), EGO_SOURCE_SHA256, 'Ego 客户端变化，必须重新核验远程接缝')
  let source = bytes.toString('utf8')
  const once = (before, after) => {
    assert.equal(source.split(before).length, 2, `Ego 接缝必须唯一: ${before.slice(0, 70)}`)
    source = source.replace(before, after)
  }
  const removeBetween = (start, end, replacement = '') => {
    assert.equal(source.split(start).length, 2, 'Ego 起点必须唯一')
    assert.equal(source.split(end).length, 2, 'Ego 终点必须唯一')
    const from = source.indexOf(start), to = source.indexOf(end, from)
    assert.ok(to > from)
    source = source.slice(0, from) + replacement + source.slice(to)
  }
  once(EGO_FACTORY, EGO_FACTORY + '\n const {fetch, EventSource} = globalThis.__OWNDSH_EGO_TRANSPORT__;')
  once('function apply(ctx) {', 'function apply(ctx) {\n if (!globalThis.__OWNDSH_EGO_TRANSPORT__?.available) return;')
  removeBetween('var controller = new EgoBrowserSettingsController();', 'var getOptionalService =')
  removeBetween('var residentState = React.useState(null);', 'var presetState =', 'var residentInfo = null;\n')
  removeBetween('h("button", {\n\t\t\t\tclassName: "dsh-ego-side-back dsh-ego-side-loginbtn', 'h("button", {\n\t\t\t\tclassName: "dsh-ego-side-iconbtn" + (state.busy')
  removeBetween('var pairbox = pairOpen ?', 'if (state.historyOpen)', 'var pairbox = null;\n')
  once('chromeLogin.message && !pairOpen ? h("div", { className: "dsh-ego-side-pagemessage" }, chromeLogin.message) : null', 'null')
  removeBetween('h("button", {\n\t\t\t\t\tclassName: "dsh-ego-side-back",\n\t\t\t\t\ttype: "button",\n\t\t\t\t\ttitle: wt("openExternal")',
    'h("button", {\n\t\t\t\t\tclassName: "dsh-ego-side-back",\n\t\t\t\t\ttype: "button",\n\t\t\t\t\ttitle: wt("refreshHint")')
  source = source.replace(/captchaHint: "[^"\n]*"/g, 'captchaHint: "请在远程浏览器画面中完成验证；Agent 会继续。"')
  assert.ok(!source.includes("fetch('/api/ego/login-extension/health'"))
  assert.ok(!source.includes('fetch("/api/ego/login-extension/health"'))
  assert.ok(!source.includes('title: wt("openExternal")'))
  assert.ok(!source.includes('title: wt("raiseWindowHint")'))
  return Buffer.from(source)
}

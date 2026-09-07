/**
 * [INPUT]: 依赖官方 ui-primitives 类型入口引用的 KaTeX 样式资源
 * [OUTPUT]: 声明浏览器端 CSS 副作用导入，保留其余依赖声明的严格类型检查
 * [POS]: dsh-ui 的构建资产类型边界；实际样式由 Harness 共享 UI 提供
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

declare module 'katex/dist/katex.min.css'

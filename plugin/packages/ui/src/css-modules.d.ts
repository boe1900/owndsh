/**
 * [INPUT]: 依赖 TypeScript 对 CSS Modules 与 CSS 副作用资源的模块声明
 * [OUTPUT]: 提供 .module.css 类名映射与普通 CSS 导入类型
 * [POS]: dsh-ui 构建期资产类型边界，不参与运行时逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

declare module '*.module.css' {
  const classes: { readonly [className: string]: string }
  export default classes
}

declare module '*.css'

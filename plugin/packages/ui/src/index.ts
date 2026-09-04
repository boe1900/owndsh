/**
 * [INPUT]: 无 Host 运行依赖；浏览器实现由 package `./client` 独立导出
 * [OUTPUT]: 对外提供空 Host apply，使 Loader row 可被官方 dsh.client scanner 发现
 * [POS]: dsh-ui 的 Host 占位入口，业务行为全部位于 Client half
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** Host loader entry for the browser-only enterprise surface. */
export function apply(): void {}

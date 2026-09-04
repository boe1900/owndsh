/**
 * [INPUT]: 由插件 application 在 tenant 内 package/version 查询为空时抛出。
 * [OUTPUT]: 对外提供不泄露其他 tenant 资源存在性的 not-found 语义。
 * [POS]: plugin/application 的资源边界，由全局异常处理映射为 ENT_RESOURCE_NOT_FOUND。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.application;

public final class PluginResourceNotFoundException extends RuntimeException {
}

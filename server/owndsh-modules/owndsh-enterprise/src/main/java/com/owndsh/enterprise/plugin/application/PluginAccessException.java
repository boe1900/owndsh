/**
 * [INPUT]: 由 runtime 下载在当前生效 assignment 不包含目标 INSTALLED version 时抛出。
 * [OUTPUT]: 对外提供稳定 ENT_PLUGIN_NOT_ASSIGNED 错误码。
 * [POS]: plugin/application 的逐请求授权失败边界，不区分其他用户版本与 ABSENT 以避免枚举。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.application;

public final class PluginAccessException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_PLUGIN_NOT_ASSIGNED";
}

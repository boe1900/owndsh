/**
 * [INPUT]: 由 runtime 目录与库存接口在用户不再有效时抛出。
 * [OUTPUT]: 对外提供稳定 ENT_PLUGIN_NOT_ASSIGNED 错误码。
 * [POS]: plugin/application 的逐请求授权失败边界，在查询可见目录之前拒绝失效身份。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.application;

public final class PluginAccessException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_PLUGIN_NOT_ASSIGNED";
}

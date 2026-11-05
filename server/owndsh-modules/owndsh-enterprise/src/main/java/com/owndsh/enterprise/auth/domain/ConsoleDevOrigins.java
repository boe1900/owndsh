/**
 * [INPUT]: 接收部署显式配置的管理端本地调试 origin 集合（enterprise.console-dev-origins）。
 * [OUTPUT]: 对外提供 loopback-only 启动校验、console 调试回调精确匹配与 Origin/Referer scheme/host/port 匹配的不可变白名单。
 * [POS]: auth 领域的部署级调试边界，与 PlatformClient 的 public base 精确回调互补；默认空即行为不变，永不放行非 loopback 主机。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.net.URI;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * 管理端本地调试 origin 白名单。
 *
 * <p>仅接受 loopback 主机（127.0.0.1/localhost/::1）与显式 1024-65535 端口的 http(s) origin，
 * 不允许 userInfo、路径、query 或 fragment；派生 console 调试回调固定为 origin + /enterprise/auth/callback。
 * 配置非法在启动时立即失败，防止把「调试白名单」误用成任意回调注册。
 */
public final class ConsoleDevOrigins {
    private static final Set<String> LOOPBACK_HOSTS = Set.of("127.0.0.1", "localhost", "[::1]", "::1");
    private static final String CONSOLE_CALLBACK_PATH = "/enterprise/auth/callback";

    private final Set<URI> origins;
    private final Set<URI> callbacks;

    private ConsoleDevOrigins(Set<URI> origins, Set<URI> callbacks) {
        this.origins = origins;
        this.callbacks = callbacks;
    }

    /** 校验并冻结部署配置；null/空集合返回无害空实例，非法条目立即抛出并指明原因。 */
    public static ConsoleDevOrigins of(Collection<URI> configured) {
        if (configured == null || configured.isEmpty()) return new ConsoleDevOrigins(Set.of(), Set.of());
        Set<URI> validated = new LinkedHashSet<>();
        for (URI raw : configured) {
            validated.add(validate(raw));
        }
        Set<URI> callbacks = new LinkedHashSet<>();
        for (URI origin : validated) {
            callbacks.add(URI.create(origin + CONSOLE_CALLBACK_PATH));
        }
        return new ConsoleDevOrigins(Set.copyOf(validated), Set.copyOf(callbacks));
    }

    /** redirect URI 是否与某个部署调试 origin 派生的 console 回调完全一致。 */
    public boolean containsCallback(URI redirectUri) {
        return redirectUri != null && callbacks.contains(redirectUri);
    }

    /** Origin/Referer 是否与某个部署调试 origin 的 scheme/host/port 精确一致（忽略路径， userInfo 由调用方先行拒绝）。 */
    public boolean trusts(URI candidate) {
        if (candidate == null || candidate.getScheme() == null || candidate.getHost() == null) return false;
        for (URI origin : origins) {
            if (origin.getScheme().equalsIgnoreCase(candidate.getScheme())
                && origin.getHost().equalsIgnoreCase(candidate.getHost())
                && origin.getPort() == candidate.getPort()) {
                return true;
            }
        }
        return false;
    }

    public boolean isEmpty() {
        return origins.isEmpty();
    }

    private static URI validate(URI value) {
        String problem;
        if (value == null) problem = "不能为空";
        else if (value.getUserInfo() != null) problem = "不允许携带 userInfo";
        else if (!"http".equalsIgnoreCase(value.getScheme()) && !"https".equalsIgnoreCase(value.getScheme())) {
            problem = "只允许 http/https";
        } else if (value.getHost() == null || !LOOPBACK_HOSTS.contains(value.getHost().toLowerCase(Locale.ROOT))) {
            problem = "只允许 loopback 主机（127.0.0.1/localhost/::1）";
        } else if (value.getPort() < 1024 || value.getPort() > 65535) {
            problem = "必须携带 1024-65535 显式端口";
        } else if (value.getRawPath() != null && !value.getRawPath().isEmpty()) {
            problem = "不允许携带路径";
        } else if (value.getRawQuery() != null || value.getRawFragment() != null) {
            problem = "不允许携带 query/fragment";
        } else {
            return value;
        }
        throw new IllegalArgumentException("enterprise.console-dev-origins 条目非法（" + value + "）：" + problem);
    }
}

/**
 * [INPUT]: 依赖 JsonMapper、Remote listener 配置、公开站点与 Console 调试来源配置。
 * [OUTPUT]: 装配 RemoteNettyProperties、HTTP/Netty 共用的 Gateway 与可关闭的 Netty server bean。
 * [POS]: remote 模块的 composition root，默认关闭且缺少生产认证器时拒绝所有连接。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.auth.domain.ConsoleDevOrigins;
import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.persistence.JdbcRemoteDeviceStore;
import com.owndsh.enterprise.remote.persistence.RemoteDeviceStore;
import io.netty.util.NetUtil;
import org.redisson.api.RedissonClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(RemoteNettyProperties.class)
public class EnterpriseRemoteConfiguration {
    @Bean
    RemoteDeviceStore remoteDeviceStore(JdbcTemplate jdbc, JsonMapper json) {
        return new JdbcRemoteDeviceStore(jdbc, json);
    }

    @Bean
    RemoteRedisStateStore remoteRedisStateStore(RedissonClient redisson) {
        return new RemoteRedisStateStore(redisson);
    }

    @Bean
    RemoteControlService remoteControlService(
        RemoteDeviceStore devices,
        RemoteRedisStateStore redis,
        JsonMapper json,
        RemoteNettyProperties properties
    ) {
        return new RemoteControlService(devices, redis, json, properties);
    }

    @Bean
    RemoteGateway remoteGateway(JsonMapper json, RemoteControlService service) {
        return new RemoteGateway(json, new RemoteControlGatewayAuthorizer(service));
    }

    @Bean
    RemoteNettyServerLifecycle remoteNettyServerLifecycle(
        RemoteNettyProperties properties,
        JsonMapper json,
        RemoteGateway gateway,
        EnterpriseIdentityProperties identity,
        ObjectProvider<RemotePeerAuthenticator> peerAuthenticators
    ) {
        RemotePeerAuthenticator authenticator = peerAuthenticators.getIfAvailable(() -> token -> java.util.Optional.empty());
        return new RemoteNettyServerLifecycle(properties, json, authenticator, gateway, consoleOrigins(identity));
    }

    static Set<String> consoleOrigins(EnterpriseIdentityProperties identity) {
        Set<String> origins = new HashSet<>();
        URI publicBaseUrl = identity.getPublicBaseUrl();
        if (publicBaseUrl != null) origins.add(browserOrigin(publicBaseUrl));
        for (URI origin : ConsoleDevOrigins.of(identity.getConsoleDevOrigins()).origins()) {
            origins.add(browserOrigin(origin));
        }
        return Set.copyOf(origins);
    }

    private static String browserOrigin(URI url) {
        String scheme = url.getScheme().toLowerCase(Locale.ROOT);
        String host = url.getHost().toLowerCase(Locale.ROOT);
        if (NetUtil.isValidIpV6Address(host)) {
            host = "[" + NetUtil.bytesToIpAddress(NetUtil.createByteArrayFromIpAddressString(host)) + "]";
        }
        int port = url.getPort();
        int defaultPort = "https".equals(scheme) ? 443 : 80;
        return scheme + "://" + host + (port == -1 || port == defaultPort ? "" : ":" + port);
    }
}

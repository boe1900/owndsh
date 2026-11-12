/**
 * [INPUT]: 依赖 JsonMapper、Remote listener 配置与 Spring lifecycle。
 * [OUTPUT]: 装配 RemoteNettyProperties、HTTP/Netty 共用的 Gateway 与可关闭的 Netty server bean。
 * [POS]: remote 模块的 composition root，默认关闭且缺少生产认证器时拒绝所有连接。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.persistence.JdbcRemoteDeviceStore;
import com.owndsh.enterprise.remote.persistence.RemoteDeviceStore;
import org.redisson.api.RedissonClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

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
        ObjectProvider<RemotePeerAuthenticator> peerAuthenticators
    ) {
        RemotePeerAuthenticator authenticator = peerAuthenticators.getIfAvailable(() -> token -> java.util.Optional.empty());
        return new RemoteNettyServerLifecycle(properties, json, authenticator, gateway);
    }
}

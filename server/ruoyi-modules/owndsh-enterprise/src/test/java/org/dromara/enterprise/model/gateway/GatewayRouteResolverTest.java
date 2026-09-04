/**
 * [INPUT]: 依赖 mock device/user/effective-model/model/provider 当前事实与 GatewayRouteResolver。
 * [OUTPUT]: 验证 alias/default 裁决、ACTIVE 用户以及停用 provider/未授权 alias 的请求级拒绝。
 * [POS]: T10 授权边界单测，证明 bootstrap 列表和客户端 route 不能替代服务端当前事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.device.application.DeviceAccessException;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.dromara.enterprise.model.application.BootstrapUser;
import org.dromara.enterprise.model.application.EffectiveModelResolver;
import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelProvider;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.dromara.enterprise.model.domain.ProviderApiProtocol;
import org.dromara.enterprise.model.domain.ProviderType;
import org.dromara.enterprise.model.persistence.BootstrapUserStore;
import org.dromara.enterprise.model.persistence.ManagedModelStore;
import org.dromara.enterprise.model.persistence.ProviderStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class GatewayRouteResolverTest {
    private final DeviceService devices = mock(DeviceService.class);
    private final BootstrapUserStore users = mock(BootstrapUserStore.class);
    private final EffectiveModelResolver effective = mock(EffectiveModelResolver.class);
    private final ManagedModelStore models = mock(ManagedModelStore.class);
    private final ProviderStore providers = mock(ProviderStore.class);
    private final GatewayRouteResolver resolver = new GatewayRouteResolver(devices, users, effective, models, providers);
    private final DeviceCallContext context = new DeviceCallContext(
        "000000", new PlatformSession(
            101, PlatformClient.DSH_DESKTOP, "harness", "123e4567-e89b-42d3-a456-426614174010"
        ), "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
    );
    private EnterpriseDevice device;
    private ManagedModel model;
    private ModelProvider provider;

    @BeforeEach
    void setUp() {
        device = new EnterpriseDevice(
            401, "000000", 101, "alice", "Alice",
            UUID.fromString("123e4567-e89b-42d3-a456-426614174010"), "Mac", "darwin-arm64",
            "1", "1", DeviceStatus.ACTIVE, Instant.EPOCH, null, 0
        );
        model = new ManagedModel(
            501, "000000", 301, "DeepSeek", "deepseek-chat", "DeepSeek Chat", "deepseek-v3",
            8192, 2048, null, null, 0, ModelStatus.ACTIVE, 0
        );
        provider = new ModelProvider(
            301, "000000", "test-provider", "DeepSeek", ProviderType.CUSTOM,
            ProviderApiProtocol.OPENAI_COMPLETIONS, URI.create("https://api.invalid/v1"),
            new org.dromara.enterprise.crypto.EncryptedSecret(new byte[16], new byte[12], 1),
            ModelStatus.ACTIVE, 1000, 1000, 0
        );
        when(devices.requireActive(context)).thenReturn(device);
        when(users.findActive("000000", 101)).thenReturn(Optional.of(new BootstrapUser(101, "alice", "Alice", 201L)));
        when(effective.resolve("000000", 101)).thenReturn(List.of(
            new EffectiveModelResolver.EffectiveModel(
                501, "deepseek-chat", "DeepSeek Chat", 8192, 2048, 0,
                ProviderApiProtocol.OPENAI_COMPLETIONS, null, null, true
            )
        ));
        when(models.find("000000", 501)).thenReturn(Optional.of(model));
        when(providers.find("000000", 301)).thenReturn(Optional.of(provider));
    }

    @Test
    void resolvesAliasAndDefaultOnlyFromCurrentEffectiveGrant() {
        assertThat(resolver.resolve(context, "deepseek-chat").model()).isEqualTo(model);
        assertThat(resolver.resolve(context, "enterprise/default").provider()).isEqualTo(provider);
        assertThatThrownBy(() -> resolver.resolve(context, "unassigned"))
            .isInstanceOfSatisfying(GatewayException.class,
                error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.MODEL_NOT_ASSIGNED));
    }

    @Test
    void rejectsInactiveUserAndProviderOnEveryRequest() {
        when(users.findActive("000000", 101)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> resolver.resolve(context, "deepseek-chat"))
            .isInstanceOf(DeviceAccessException.class);

        when(users.findActive("000000", 101)).thenReturn(Optional.of(new BootstrapUser(101, "alice", "Alice", 201L)));
        when(providers.find("000000", 301)).thenReturn(Optional.of(new ModelProvider(
            provider.id(), provider.tenantId(), provider.providerKey(), provider.name(), provider.providerType(),
            provider.apiProtocol(), provider.baseUrl(), provider.encryptedCredential(), ModelStatus.DISABLED,
            provider.connectTimeoutMs(), provider.readTimeoutMs(), 1
        )));
        assertThatThrownBy(() -> resolver.resolve(context, "deepseek-chat"))
            .isInstanceOfSatisfying(GatewayException.class,
                error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.MODEL_NOT_ASSIGNED));
    }
}

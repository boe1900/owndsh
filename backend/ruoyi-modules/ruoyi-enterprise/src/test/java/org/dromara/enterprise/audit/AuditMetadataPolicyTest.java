/**
 * [INPUT]: 依赖第 13 节全部 AuditAction 与各业务域真实 metadata DTO
 * [OUTPUT]: 验证 30 action 全覆盖、唯一 action 声明、敏感语义 key 缺失、声明字段不序列化和错配拒绝
 * [POS]: audit metadata 白名单的纯单元总门禁，新增 action 未配 DTO 时立即失败
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import org.dromara.enterprise.auth.application.AuthAuditMetadata;
import org.dromara.enterprise.auth.application.IdentityChangeMetadata;
import org.dromara.enterprise.auth.application.IdentityLinkMetadata;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.device.application.DeviceEnrollmentMetadata;
import org.dromara.enterprise.device.application.DeviceHeartbeatMetadata;
import org.dromara.enterprise.model.application.ManagedModelChangeMetadata;
import org.dromara.enterprise.model.application.ModelGrantChangeMetadata;
import org.dromara.enterprise.model.application.ProviderChangeMetadata;
import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.dromara.enterprise.model.domain.ProviderType;
import org.dromara.enterprise.model.gateway.GatewayAcceptedMetadata;
import org.dromara.enterprise.model.gateway.GatewayFinishedMetadata;
import org.dromara.enterprise.plugin.application.PluginAuditMetadata;
import org.dromara.enterprise.quota.application.QuotaExceededException;
import org.dromara.enterprise.quota.application.QuotaPolicyChangeMetadata;
import org.dromara.enterprise.quota.application.QuotaRejectionMetadata;
import org.dromara.enterprise.quota.application.ReservationRecoveredMetadata;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;
import org.dromara.enterprise.quota.domain.ReservationState;
import org.dromara.enterprise.session.application.SessionAuditMetadata;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class AuditMetadataPolicyTest {
    private static final Pattern FORBIDDEN_METADATA_KEY = Pattern.compile(
        "(?i).*\\\"[^\\\"]*(password|authorization|credential|secret|prompt|message|tool|stack|"
            + "access[_-]?token|refresh[_-]?token|session[_-]?event)[^\\\"]*\\\"\\s*:.*"
    );

    @Test
    void everyFrozenActionHasOneConcreteMetadataSample() {
        List<AuditMetadata> samples = samples();

        assertThat(samples).hasSize(AuditAction.values().length);
        assertThat(samples.stream().map(AuditMetadata::action))
            .containsExactlyInAnyOrderElementsOf(EnumSet.allOf(AuditAction.class));
    }

    @Test
    void actionDeclarationIsNotSerializedAndMismatchIsRejected() {
        JsonMapper json = JsonMapper.builder().build();
        for (AuditMetadata metadata : samples()) {
            String serialized = json.writeValueAsString(metadata);
            assertThat(serialized).doesNotContain("\"action\"");
            assertThat(serialized).doesNotMatch(FORBIDDEN_METADATA_KEY);
        }

        assertThatThrownBy(() -> event(AuditAction.LOGIN_FAILED, new AuthAuditMetadata.Logout("enterprise-admin")))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("action 与 metadata DTO 不匹配");
    }

    private static AuditEvent event(AuditAction action, AuditMetadata metadata) {
        return new AuditEvent(
            1, "000000", Instant.EPOCH, AuditActorType.SYSTEM, null, null, action,
            "TEST", "1", AuditResult.SUCCESS, null, "req_test", null, null, metadata
        );
    }

    private static List<AuditMetadata> samples() {
        UUID reservationId = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
        return List.of(
            new AuthAuditMetadata.LoginSucceeded("enterprise-admin", IdentitySourceType.LOCAL),
            new AuthAuditMetadata.LoginFailed("enterprise-admin", IdentitySourceType.LOCAL),
            new AuthAuditMetadata.Logout("enterprise-admin"),
            new IdentityChangeMetadata(
                IdentityChangeMetadata.Operation.CREATE, IdentitySourceType.LOCAL, false, 0, 1
            ),
            new IdentityLinkMetadata(IdentitySourceType.LOCAL, false, 0, 0, 0, false),
            new DeviceEnrollmentMetadata("darwin-arm64", true),
            new DeviceHeartbeatMetadata(1, 0, true),
            new EmptyAuditMetadata(),
            new ProviderChangeMetadata(
                ProviderChangeMetadata.Operation.CREATE, ProviderType.DEEPSEEK_OPENAI, true, 0, 1
            ),
            new ManagedModelChangeMetadata(ManagedModelChangeMetadata.Operation.CREATE, true, 0, 1),
            new ModelGrantChangeMetadata(
                ModelGrantChangeMetadata.Operation.CREATE, GrantSubjectType.USER, true,
                ModelStatus.ACTIVE, 0, 1
            ),
            new GatewayAcceptedMetadata(1, reservationId, 100),
            new GatewayFinishedMetadata(
                1, reservationId, GatewayFinishedMetadata.Outcome.SETTLED, 90, 1000,
                GatewayFinishedMetadata.Failure.NONE
            ),
            new QuotaPolicyChangeMetadata(QuotaSubjectType.DEFAULT, QuotaStatus.ACTIVE, -1, 0),
            new QuotaRejectionMetadata(QuotaExceededException.Kind.DAILY, 1, 100),
            new ReservationRecoveredMetadata(ReservationState.RESERVED, ReservationState.RELEASED),
            plugin(PluginAuditMetadata.Operation.UPLOAD),
            plugin(PluginAuditMetadata.Operation.PUBLISH),
            plugin(PluginAuditMetadata.Operation.ASSIGN),
            plugin(PluginAuditMetadata.Operation.DOWNLOAD),
            plugin(PluginAuditMetadata.Operation.INVENTORY),
            new SessionAuditMetadata.BatchAppended(0, 1, 2),
            new SessionAuditMetadata.Exported(0, 1, 2),
            new SessionAuditMetadata.Restored("restored-session", 2),
            new SessionAuditMetadata.ContentRead(0, 1, 2),
            new SessionAuditMetadata.Deleted("ACTIVE", 2),
            new SessionAuditMetadata.Expired(1, 2),
            new UserGovernanceAuditMetadata.RoleAssigned(2),
            new UserGovernanceAuditMetadata.StatusChanged("0", "1"),
            new RevisionChangedMetadata(0, 1)
        );
    }

    private static PluginAuditMetadata plugin(PluginAuditMetadata.Operation operation) {
        return new PluginAuditMetadata(operation, 0, 0, 1, false);
    }
}

/**
 * [INPUT]: 依赖第 13 节全部 AuditAction 与各业务域真实 metadata DTO
 * [OUTPUT]: 验证全部 action 全覆盖、唯一 action 声明、敏感语义 key 缺失、声明字段不序列化和错配拒绝
 * [POS]: audit metadata 白名单的纯单元总门禁，新增 action 未配 DTO 时立即失败
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import com.owndsh.enterprise.auth.application.AuthAuditMetadata;
import com.owndsh.enterprise.auth.application.IdentityChangeMetadata;
import com.owndsh.enterprise.auth.application.IdentityLinkMetadata;
import com.owndsh.enterprise.auth.application.IdentityUnlinkMetadata;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;
import com.owndsh.enterprise.device.application.DeviceEnrollmentMetadata;
import com.owndsh.enterprise.device.application.DeviceHeartbeatMetadata;
import com.owndsh.enterprise.model.application.ManagedModelChangeMetadata;
import com.owndsh.enterprise.model.application.ModelGrantChangeMetadata;
import com.owndsh.enterprise.model.application.ProviderChangeMetadata;
import com.owndsh.enterprise.model.domain.GrantSubjectType;
import com.owndsh.enterprise.model.domain.ModelStatus;
import com.owndsh.enterprise.model.domain.ProviderType;
import com.owndsh.enterprise.model.gateway.GatewayAcceptedMetadata;
import com.owndsh.enterprise.model.gateway.GatewayFinishedMetadata;
import com.owndsh.enterprise.plugin.application.PluginAuditMetadata;
import com.owndsh.enterprise.quota.application.QuotaExceededException;
import com.owndsh.enterprise.quota.application.QuotaPolicyChangeMetadata;
import com.owndsh.enterprise.quota.application.QuotaRejectionMetadata;
import com.owndsh.enterprise.quota.application.ReservationRecoveredMetadata;
import com.owndsh.enterprise.quota.domain.QuotaStatus;
import com.owndsh.enterprise.quota.domain.QuotaSubjectType;
import com.owndsh.enterprise.quota.domain.ReservationState;
import com.owndsh.enterprise.session.application.SessionAuditMetadata;
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
            new IdentityUnlinkMetadata(IdentitySourceType.OIDC, 0, 1),
            new DeviceEnrollmentMetadata("darwin-arm64", true),
            new DeviceHeartbeatMetadata(1, 0, true),
            new EmptyAuditMetadata(),
            new ProviderChangeMetadata(
                ProviderChangeMetadata.Operation.CREATE, ProviderType.DEEPSEEK_OFFICIAL, true, 0, 1
            ),
            new ManagedModelChangeMetadata(ManagedModelChangeMetadata.Operation.CREATE, 0, 1),
            new ModelGrantChangeMetadata(
                ModelGrantChangeMetadata.Operation.CREATE, GrantSubjectType.MEMBER,
                ModelStatus.ACTIVE, 0, 1
            ),
            new GatewayAcceptedMetadata(1, reservationId, 100),
            new GatewayFinishedMetadata(
                1, reservationId, GatewayFinishedMetadata.Outcome.SETTLED, 90, 1000,
                GatewayFinishedMetadata.Failure.NONE
            ),
            new QuotaPolicyChangeMetadata(QuotaSubjectType.ORGANIZATION, QuotaStatus.ACTIVE, -1, 0),
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

/**
 * [INPUT]: 依赖 Host UserGovernanceChangedEvent、可信 enterprise-admin 请求上下文、AuditSink 与 ID generator
 * [OUTPUT]: 在原用户事务 BEFORE_COMMIT 阶段追加 ROLE_ASSIGNED/USER_STATUS_CHANGED 审计
 * [POS]: enterprise 对基础 system 事件的 adapter，保持模块依赖单向且审计失败会回滚业务写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.system.event.UserGovernanceChangedEvent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

@Component
public final class UserGovernanceAuditListener {
    private final AuditSink audit;
    private final LongSupplier ids;
    private final Supplier<EnterpriseRequestContext> contexts;
    private final Clock clock;

    @Autowired
    public UserGovernanceAuditListener(
        AuditSink audit,
        @Qualifier("enterpriseIdSupplier") LongSupplier ids,
        IdentityAdminRequestContextResolver resolver
    ) {
        this(audit, ids, () -> resolver.resolve(currentRequest()), Clock.systemUTC());
    }

    UserGovernanceAuditListener(
        AuditSink audit,
        LongSupplier ids,
        Supplier<EnterpriseRequestContext> contexts,
        Clock clock
    ) {
        this.audit = Objects.requireNonNull(audit, "audit");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.contexts = Objects.requireNonNull(contexts, "contexts");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void audit(UserGovernanceChangedEvent event) {
        EnterpriseRequestContext context = contexts.get();
        UserGovernanceAuditMetadata metadata = switch (event.kind()) {
            case ROLES_ASSIGNED -> new UserGovernanceAuditMetadata.RoleAssigned(event.roleCount());
            case STATUS_CHANGED -> new UserGovernanceAuditMetadata.StatusChanged(
                event.previousStatus(), event.currentStatus()
            );
        };
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 返回非正数");
        audit.append(new AuditEvent(
            id,
            context.tenantId(),
            Instant.now(clock),
            AuditActorType.USER,
            context.actorId(),
            null,
            metadata.action(),
            "SYSTEM_USER",
            Long.toString(event.userId()),
            AuditResult.SUCCESS,
            null,
            context.requestId(),
            context.sourceIp(),
            context.userAgentHash(),
            metadata
        ));
    }

    private static HttpServletRequest currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            return attributes.getRequest();
        }
        throw new IllegalStateException("用户治理审计缺少 HTTP 请求上下文");
    }
}

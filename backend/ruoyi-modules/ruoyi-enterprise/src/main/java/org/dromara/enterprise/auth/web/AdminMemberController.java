/**
 * [INPUT]: 依赖成员查询/治理服务、一次性认证状态机、可信管理上下文、cursor 与 ent:member:read/write 权限。
 * [OUTPUT]: 提供成员 cursor 列表、详情、状态/角色、身份绑定发起和外部身份解除产品 API。
 * [POS]: auth/web 的成员治理 HTTP 边界，只投影脱敏身份/设备/Session 摘要，不返回部门、groups、claims 或凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.application.MemberDirectoryQueryService;
import org.dromara.enterprise.auth.application.MemberManagementService;
import org.dromara.enterprise.auth.application.PlatformAuthorizationService;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.common.api.CursorPageData;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/enterprise/admin/v1/members")
public final class AdminMemberController {
    private static final String CURSOR_SCOPE = "product_members";

    private final MemberDirectoryQueryService members;
    private final MemberManagementService management;
    private final PlatformAuthorizationService authorization;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminMemberController(
        MemberDirectoryQueryService members,
        MemberManagementService management,
        PlatformAuthorizationService authorization,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.members = members;
        this.management = management;
        this.authorization = authorization;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping("/{userId}")
    @SaCheckPermission("ent:member:read")
    public EnterpriseResponse<MemberDetailView> get(
        @PathVariable long userId,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return detail(members.get(context.tenantId(), userId), context);
    }

    @PutMapping("/{userId}/status")
    @SaCheckPermission("ent:member:write")
    public EnterpriseResponse<MemberDetailView> updateStatus(
        @PathVariable long userId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody MemberStatusRequest body,
        HttpServletRequest request
    ) {
        if (body == null) throw new IllegalArgumentException("成员状态请求不能为空");
        EnterpriseRequestContext context = contexts.resolve(request);
        return detail(
            management.updateStatus(context.tenantId(), userId, expectedRevision, body.status()),
            context
        );
    }

    @PutMapping("/{userId}/roles")
    @SaCheckPermission("ent:member:write")
    public EnterpriseResponse<MemberDetailView> replaceRoles(
        @PathVariable long userId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody MemberRoleRequest body,
        HttpServletRequest request
    ) {
        if (body == null) throw new IllegalArgumentException("成员角色请求不能为空");
        EnterpriseRequestContext context = contexts.resolve(request);
        return detail(
            management.replaceRoles(context.tenantId(), userId, expectedRevision, body.roles()),
            context
        );
    }

    @DeleteMapping("/{userId}/identities/{identityId}")
    @SaCheckPermission("ent:member:write")
    public EnterpriseResponse<MemberDetailView> unlinkIdentity(
        @PathVariable long userId,
        @PathVariable long identityId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return detail(
            management.unlinkIdentity(context.mutation(), userId, identityId, expectedRevision),
            context
        );
    }

    @PostMapping("/{userId}/identity-links")
    @SaCheckPermission("ent:member:write")
    public EnterpriseResponse<IdentityLinkStartView> startIdentityLink(
        @PathVariable long userId,
        @RequestBody IdentityLinkStartRequest body,
        HttpServletRequest request
    ) {
        if (body == null) throw new IllegalArgumentException("身份绑定请求不能为空");
        EnterpriseRequestContext context = contexts.resolve(request);
        MemberDirectoryQueryService.MemberDetail member = members.get(context.tenantId(), userId);
        if (member.member().status() != MemberDirectoryQueryService.MemberStatus.ACTIVE) {
            throw new IllegalArgumentException("停用成员不能绑定身份");
        }
        long sourceId = body.sourceIdAsLong();
        String transactionId = authorization.startIdentityLink(
            context.tenantId(), userId, sourceId, context.actorId()
        );
        return new EnterpriseResponse<>(
            new IdentityLinkStartView(
                transactionId,
                "/enterprise/auth/login.html?transaction_id=" + transactionId + "&source_id=" + sourceId
            ),
            context.requestId()
        );
    }

    private static EnterpriseResponse<MemberDetailView> detail(
        MemberDirectoryQueryService.MemberDetail value,
        EnterpriseRequestContext context
    ) {
        return new EnterpriseResponse<>(MemberDetailView.from(value), context.requestId());
    }

    @GetMapping
    @SaCheckPermission("ent:member:read")
    public EnterpriseResponse<CursorPageData<MemberSummaryView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<MemberDirectoryQueryService.MemberSummary> fetched = members.list(
            context.tenantId(), afterId, pageLimit + 1
        );
        boolean hasMore = fetched.size() > pageLimit;
        List<MemberDirectoryQueryService.MemberSummary> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id())
            : null;
        return new EnterpriseResponse<>(
            new CursorPageData<>(
                items.stream().map(MemberSummaryView::from).toList(),
                new CursorPageMetadata(hasMore, pageLimit, nextCursor)
            ),
            context.requestId()
        );
    }

    public record MemberSummaryView(
        String id,
        String username,
        String displayName,
        MemberDirectoryQueryService.MemberStatus status,
        List<String> roles,
        List<LoginMethodView> loginMethods,
        Instant lastActiveAt,
        long revision
    ) {
        private static MemberSummaryView from(MemberDirectoryQueryService.MemberSummary member) {
            return new MemberSummaryView(
                Long.toString(member.id()),
                member.username(),
                member.displayName(),
                member.status(),
                member.roles(),
                member.loginMethods().stream().map(LoginMethodView::from).toList(),
                member.lastActiveAt(),
                member.revision()
            );
        }
    }

    public record LoginMethodView(
        String sourceId,
        String sourceName,
        IdentitySourceType sourceType,
        Instant lastLoginAt
    ) {
        private static LoginMethodView from(MemberDirectoryQueryService.MemberLoginMethod method) {
            return new LoginMethodView(
                method.sourceId() == null ? null : Long.toString(method.sourceId()),
                method.sourceName(),
                method.sourceType(),
                method.lastLoginAt()
            );
        }
    }

    public record MemberDetailView(
        MemberSummaryView member,
        List<MemberIdentityView> identities,
        List<MemberDeviceView> devices,
        MemberSessionSummaryView sessions
    ) {
        private static MemberDetailView from(MemberDirectoryQueryService.MemberDetail detail) {
            return new MemberDetailView(
                MemberSummaryView.from(detail.member()),
                detail.identities().stream().map(MemberIdentityView::from).toList(),
                detail.devices().stream().map(MemberDeviceView::from).toList(),
                MemberSessionSummaryView.from(detail.sessions())
            );
        }
    }

    public record MemberIdentityView(
        String identityId,
        String sourceId,
        String sourceName,
        IdentitySourceType sourceType,
        String subject,
        Instant lastLoginAt
    ) {
        private static MemberIdentityView from(MemberDirectoryQueryService.MemberIdentity identity) {
            return new MemberIdentityView(
                identity.identityId() == null ? null : Long.toString(identity.identityId()),
                identity.sourceId() == null ? null : Long.toString(identity.sourceId()),
                identity.sourceName(),
                identity.sourceType(),
                identity.subject(),
                identity.lastLoginAt()
            );
        }
    }

    public record MemberDeviceView(
        String id,
        String name,
        String platform,
        DeviceStatus status,
        Instant lastSeenAt
    ) {
        private static MemberDeviceView from(MemberDirectoryQueryService.MemberDevice device) {
            return new MemberDeviceView(
                Long.toString(device.id()), device.name(), device.platform(), device.status(), device.lastSeenAt()
            );
        }
    }

    public record MemberSessionSummaryView(
        long active,
        long deleted,
        long expired,
        Instant latestUpdatedAt
    ) {
        private static MemberSessionSummaryView from(MemberDirectoryQueryService.MemberSessionSummary sessions) {
            return new MemberSessionSummaryView(
                sessions.active(), sessions.deleted(), sessions.expired(), sessions.latestUpdatedAt()
            );
        }
    }

    public record MemberStatusRequest(MemberDirectoryQueryService.MemberStatus status) {
    }

    public record MemberRoleRequest(List<String> roles) {
    }

    public record IdentityLinkStartRequest(String sourceId) {
        private long sourceIdAsLong() {
            try {
                long parsed = Long.parseLong(sourceId);
                if (parsed <= 0) throw new NumberFormatException("not positive");
                return parsed;
            } catch (RuntimeException exception) {
                throw new IllegalArgumentException("身份源 ID 非法", exception);
            }
        }
    }

    public record IdentityLinkStartView(String transactionId, String authorizeUri) {
    }
}

/**
 * [INPUT]: 依赖 AuditQueryService、enterprise-admin 可信上下文、认证 cursor 与 ent:audit:read
 * [OUTPUT]: 提供 GET `/enterprise/admin/v1/audit-events` 多维筛选和 keyset page
 * [POS]: audit 管理只读入口；cursor AAD 绑定全部筛选且响应裁掉 IP/user-agent hash
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/enterprise/admin/v1/audit-events")
public final class AdminAuditController {
    private static final Pattern REQUEST_ID = Pattern.compile("^req_[0-9A-HJKMNP-TV-Z]{26}$");
    private static final Pattern TYPE = Pattern.compile("^[A-Z][A-Z0-9_]{0,63}$");

    private final AuditQueryService audit;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminAuditController(
        AuditQueryService audit,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.audit = audit;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:audit:read")
    public EnterpriseResponse<CursorPageData<AuditEventView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        @RequestParam(required = false) Long actorId,
        @RequestParam(required = false) AuditAction action,
        @RequestParam(required = false) String resourceType,
        @RequestParam(required = false) String resourceId,
        @RequestParam(required = false) AuditResult result,
        @RequestParam(required = false) String reasonCode,
        @RequestParam(required = false) String requestId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        AuditFilter filter = new AuditFilter(
            actorId,
            action,
            type(resourceType, "resourceType"),
            text(resourceId, "resourceId", 255),
            result,
            type(reasonCode, "reasonCode"),
            requestId(requestId),
            from,
            to
        );
        String scope = scope(filter);
        long afterId = cursors.decode(cursor, context.tenantId(), scope);
        List<AuditEventRecord> records = audit.list(context.tenantId(), afterId, pageLimit + 1, filter);
        boolean hasMore = records.size() > pageLimit;
        List<AuditEventRecord> page = hasMore ? records.subList(0, pageLimit) : records;
        String next = hasMore ? cursors.encode(context.tenantId(), scope, page.getLast().id()) : null;
        return new EnterpriseResponse<>(
            new CursorPageData<>(
                page.stream().map(AuditEventView::from).toList(),
                new CursorPageMetadata(hasMore, pageLimit, next)
            ),
            context.requestId()
        );
    }

    private static String scope(AuditFilter filter) {
        return "audit:" + value(filter.actorId()) + value(filter.action()) + value(filter.resourceType())
            + value(filter.resourceId()) + value(filter.result()) + value(filter.reasonCode())
            + value(filter.requestId()) + value(filter.from()) + value(filter.to());
    }

    private static String value(Object value) {
        String text = value == null ? "" : value.toString();
        return text.length() + ":" + text;
    }

    private static String type(String value, String name) {
        String normalized = text(value, name, 64);
        if (normalized != null && !TYPE.matcher(normalized).matches()) {
            throw new IllegalArgumentException(name + " 非法");
        }
        return normalized;
    }

    private static String requestId(String value) {
        String normalized = text(value, "requestId", 30);
        if (normalized != null && !REQUEST_ID.matcher(normalized).matches()) {
            throw new IllegalArgumentException("requestId 非法");
        }
        return normalized;
    }

    private static String text(String value, String name, int maxLength) {
        if (value == null) return null;
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > maxLength) {
            throw new IllegalArgumentException(name + " 非法");
        }
        return normalized;
    }
}

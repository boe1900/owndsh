/**
 * [INPUT]: 依赖 QuotaUsageQueryService、管理员可信上下文、认证 cursor、canonical requestId 与 ent:grant:read。
 * [OUTPUT]: 提供 GET `/enterprise/admin/v1/usage` 多维筛选、keyset page 与聚合。
 * [POS]: quota/web 的 prompt-free 用量管理入口，cursor AAD 绑定全部筛选条件。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.enterprise.quota.application.QuotaUsageQueryService;
import org.dromara.enterprise.quota.domain.UsageLedger;
import org.dromara.enterprise.quota.persistence.UsageLedgerStore;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/enterprise/admin/v1/usage")
public final class AdminUsageController {
    private static final Pattern REQUEST_ID_PATTERN = Pattern.compile("^req_[0-9A-HJKMNP-TV-Z]{26}$");

    private final QuotaUsageQueryService usage;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminUsageController(
        QuotaUsageQueryService usage,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.usage = usage;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:grant:read")
    public EnterpriseResponse<UsageLedgerPageView> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        @RequestParam(required = false) Long userId,
        @RequestParam(required = false) Long departmentId,
        @RequestParam(required = false) Long modelId,
        @RequestParam(required = false) String requestId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        requirePositive(userId, "userId");
        requirePositive(departmentId, "departmentId");
        requirePositive(modelId, "modelId");
        UsageLedgerStore.UsageLedgerFilter filter = new UsageLedgerStore.UsageLedgerFilter(
            userId, departmentId, modelId, normalizeRequestId(requestId), from, to
        );
        String scope = cursorScope(filter);
        long afterId = cursors.decode(cursor, context.tenantId(), scope);
        QuotaUsageQueryService.UsagePage result = usage.listUsage(
            context.tenantId(), afterId, pageLimit + 1, filter
        );
        boolean hasMore = result.items().size() > pageLimit;
        List<UsageLedger> pageItems = hasMore ? result.items().subList(0, pageLimit) : result.items();
        String next = hasMore ? cursors.encode(context.tenantId(), scope, pageItems.getLast().id()) : null;
        UsageLedgerPageView data = new UsageLedgerPageView(
            pageItems.stream().map(UsageLedgerView::from).toList(),
            new CursorPageMetadata(hasMore, pageLimit, next),
            UsageLedgerPageView.Summary.from(result.summary())
        );
        return new EnterpriseResponse<>(data, context.requestId());
    }

    private static String cursorScope(UsageLedgerStore.UsageLedgerFilter filter) {
        return "usage_ledger:" + value(filter.userId()) + ':' + value(filter.departmentId()) + ':'
            + value(filter.modelId()) + ':' + value(filter.requestId()) + ':' + value(filter.from()) + ':'
            + value(filter.to());
    }

    private static String value(Object value) {
        return value == null ? "-" : value.toString();
    }

    private static String normalizeRequestId(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        if (!REQUEST_ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("requestId 非法");
        }
        return normalized;
    }

    private static void requirePositive(Long value, String name) {
        if (value != null && value <= 0) throw new IllegalArgumentException(name + " 必须为正数");
    }
}

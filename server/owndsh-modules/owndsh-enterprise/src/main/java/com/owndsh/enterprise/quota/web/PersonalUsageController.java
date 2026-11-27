/**
 * [INPUT]: 依赖控制台会话、QuotaUsageQueryService 与认证时间游标。
 * [OUTPUT]: 提供登录成员本人的用量汇总、分布、日趋势和调用明细分页。
 * [POS]: quota/web 的个人统计入口，以会话身份约束账本与审计查询。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.web;

import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.quota.application.QuotaUsageQueryService;
import com.owndsh.enterprise.quota.domain.UsageLedgerMetadata;
import com.owndsh.enterprise.quota.domain.UsageResult;
import com.owndsh.enterprise.quota.persistence.UsageLedgerStore;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/enterprise/console/v1/usage")
public final class PersonalUsageController {
    private final QuotaUsageQueryService usage;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public PersonalUsageController(
        QuotaUsageQueryService usage, IdentityAdminRequestContextResolver contexts, EnterpriseCursorCodec cursors
    ) {
        this.usage = usage;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    public EnterpriseResponse<UsageView> get(
        @RequestParam(defaultValue = "7d") String range,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end,
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        var context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        var window = usage.personalRange(range, start, end);
        String scope = "personal_usage:" + context.actorId() + ':' + window.start() + ':' + window.end();
        var before = cursors.decodeTime(cursor, context.tenantId(), scope);
        var data = usage.personalUsage(context.tenantId(), context.actorId(), window, before, pageLimit + 1);
        boolean hasMore = data.items().size() > pageLimit;
        var items = hasMore ? data.items().subList(0, pageLimit) : data.items();
        String next = hasMore ? cursors.encodeTime(context.tenantId(), scope,
            new EnterpriseCursorCodec.TimePosition(items.getLast().ledger().createdAt(), items.getLast().id())) : null;
        return new EnterpriseResponse<>(new UsageView(
            window.start(), window.end(), window.zone().getId(), data.totals(), data.outcomes(), data.models(),
            data.dailyTrend(), items.stream().map(CallView::from).toList(), new CursorPageMetadata(hasMore, pageLimit, next)
        ), context.requestId());
    }

    public record UsageView(
        LocalDate start, LocalDate end, String timeZone, UsageLedgerStore.UsageTotals summary,
        UsageLedgerStore.CallOutcomes outcomes, List<UsageLedgerStore.ModelUsage> models,
        List<UsageLedgerStore.DailyUsage> dailyTrend, List<CallView> items, CursorPageMetadata page
    ) {}

    public record CallView(
        String id, Instant createdAt, String modelName, String modelAlias,
        long inputTokens, long outputTokens, long totalTokens, UsageResult result
    ) {
        static CallView from(UsageLedgerMetadata metadata) {
            var ledger = metadata.ledger();
            return new CallView(Long.toString(ledger.id()), ledger.createdAt(), metadata.modelDisplayName(),
                metadata.modelAlias(), ledger.inputTokens(), ledger.outputTokens(), ledger.totalTokens(), ledger.result());
        }
    }
}

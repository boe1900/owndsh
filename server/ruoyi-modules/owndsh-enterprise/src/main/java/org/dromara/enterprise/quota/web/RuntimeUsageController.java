/**
 * [INPUT]: 依赖可信 dsh-desktop context、DeviceService ACTIVE owner 校验、ACTIVE 用户投影与用量查询。
 * [OUTPUT]: 提供 GET `/enterprise/api/v1/usage/me` 本人全部适用策略实时计数。
 * [POS]: quota/web 的 runtime owner 入口，管理端 Token、撤销设备和失效用户不能读取用量。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.enterprise.device.application.DeviceAccessException;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.dromara.enterprise.device.web.DeviceRequestContextResolver;
import org.dromara.enterprise.quota.application.QuotaUsageQueryService;
import org.dromara.enterprise.quota.persistence.QuotaSubjectStore;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/enterprise/api/v1/usage/me")
public final class RuntimeUsageController {
    private final DeviceRequestContextResolver contexts;
    private final DeviceService devices;
    private final QuotaSubjectStore subjects;
    private final QuotaUsageQueryService usage;

    public RuntimeUsageController(
        DeviceRequestContextResolver contexts,
        DeviceService devices,
        QuotaSubjectStore subjects,
        QuotaUsageQueryService usage
    ) {
        this.contexts = contexts;
        this.devices = devices;
        this.subjects = subjects;
        this.usage = usage;
    }

    @GetMapping
    public EnterpriseResponse<List<MyQuotaUsageView>> get(HttpServletRequest request) {
        DeviceCallContext context = contexts.resolve(request);
        EnterpriseDevice device = devices.requireActive(context);
        QuotaSubjectStore.QuotaUser user = subjects.findActiveUser(device.userId())
            .orElseThrow(() -> new DeviceAccessException("ENT_PERMISSION_DENIED"));
        List<MyQuotaUsageView> result = usage.myUsage(context.tenantId(), user.id())
            .stream().map(MyQuotaUsageView::from).toList();
        return new EnterpriseResponse<>(result, context.requestId());
    }
}

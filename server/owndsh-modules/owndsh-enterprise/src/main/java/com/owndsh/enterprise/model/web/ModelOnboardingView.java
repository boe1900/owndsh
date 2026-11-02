/**
 * [INPUT]: 接收组合创建结果中的 provider、connection 与 managed models 聚合。
 * [OUTPUT]: 对外提供一次向导提交后的脱敏结果。
 * [POS]: model/web 的组合创建响应投影，不暴露连接密钥。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ModelOnboardingService;

import java.util.List;

public record ModelOnboardingView(
    ProviderView provider,
    ProviderConnectionView connection,
    List<ManagedModelView> models
) {
    public static ModelOnboardingView from(ModelOnboardingService.Result result) {
        return new ModelOnboardingView(
            ProviderView.from(result.provider()),
            ProviderConnectionView.from(result.connection()),
            result.models().stream().map(ManagedModelView::from).toList()
        );
    }
}

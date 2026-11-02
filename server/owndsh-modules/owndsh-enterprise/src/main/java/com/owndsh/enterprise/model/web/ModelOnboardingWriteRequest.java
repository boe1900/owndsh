/**
 * [INPUT]: 接收已有或新建供应商、连接凭据及首批模型配置。
 * [OUTPUT]: 提供组合创建所需的 providerId/providerSpec、connectionSpec 和模型 specs。
 * [POS]: model/web 的向导写入边界，凭据只在请求生命周期内存在。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ModelOnboardingSpec;
import com.owndsh.enterprise.model.application.ProviderConnectionSpec;
import com.owndsh.enterprise.model.application.ProviderSecretInput;
import com.owndsh.enterprise.model.application.ProviderSpec;

import java.util.List;

public record ModelOnboardingWriteRequest(
    String providerId,
    ProviderWriteRequest provider,
    ProviderConnectionWriteRequest connection,
    List<ModelOnboardingModelWriteRequest> models
) implements AutoCloseable {
    public ModelOnboardingWriteRequest {
        models = models == null ? List.of() : List.copyOf(models);
    }

    public Long existingProviderId() {
        if (providerId == null || providerId.isBlank()) return null;
        try {
            long value = Long.parseLong(providerId);
            if (value <= 0) throw new NumberFormatException();
            return value;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("providerId 非法", exception);
        }
    }

    public ProviderSpec providerSpec() {
        return provider == null ? null : provider.spec();
    }

    public ProviderConnectionSpec connectionSpec() {
        if (connection == null) throw new IllegalArgumentException("缺少连接");
        return connection.spec();
    }

    public ProviderSecretInput createSecret() {
        if (connection == null) throw new IllegalArgumentException("缺少连接");
        return connection.createSecret();
    }

    public List<ModelOnboardingSpec> modelSpecs() {
        return models.stream().map(ModelOnboardingModelWriteRequest::spec).toList();
    }

    @Override
    public void close() {
        if (connection != null) connection.close();
    }
}

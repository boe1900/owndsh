/**
 * [INPUT]: 接收 provider、connection、credential 与首批模型配置，并复用各领域服务。
 * [OUTPUT]: 在单个数据库事务中创建供应商、连接和受管模型。
 * [POS]: model/application 的向导聚合用例，保证组合创建失败时整体回滚。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.domain.ManagedModel;
import com.owndsh.enterprise.model.domain.ModelProvider;
import com.owndsh.enterprise.model.domain.ProviderConnection;
import org.springframework.transaction.support.TransactionOperations;

import java.util.List;
import java.util.Objects;

public final class ModelOnboardingService {
    private final TransactionOperations transactions;
    private final ProviderService providers;
    private final ProviderConnectionService connections;
    private final ManagedModelService models;

    public ModelOnboardingService(
        TransactionOperations transactions,
        ProviderService providers,
        ProviderConnectionService connections,
        ManagedModelService models
    ) {
        this.transactions = Objects.requireNonNull(transactions);
        this.providers = Objects.requireNonNull(providers);
        this.connections = Objects.requireNonNull(connections);
        this.models = Objects.requireNonNull(models);
    }

    public Result create(
        ModelMutationContext context,
        Long providerId,
        ProviderSpec providerSpec,
        ProviderConnectionSpec connectionSpec,
        ProviderSecretInput secret,
        List<ModelOnboardingSpec> modelSpecs
    ) {
        if (providerId == null && providerSpec == null) throw new IllegalArgumentException("缺少供应商");
        if (providerId != null && providerSpec != null) throw new IllegalArgumentException("供应商参数冲突");
        if (modelSpecs == null || modelSpecs.isEmpty()) throw new IllegalArgumentException("至少需要一个模型");
        return Objects.requireNonNull(transactions.execute(status -> {
            ModelProvider provider = providerId == null
                ? providers.create(context, providerSpec)
                : providers.get(context.tenantId(), providerId);
            ProviderConnection connection = connections.create(context, provider.id(), connectionSpec, secret);
            List<ManagedModel> modelsCreated = modelSpecs.stream()
                .map(spec -> models.create(context, spec.forConnection(connection.id())))
                .toList();
            return new Result(provider, connection, modelsCreated);
        }));
    }

    public record Result(ModelProvider provider, ProviderConnection connection, List<ManagedModel> models) { }
}

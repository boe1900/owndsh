/**
 * [INPUT]: 依赖 ACTIVE DeviceService、active user store、生效 resolver、事务、审计与 ID。
 * [OUTPUT]: 提供 runtime assignments、设备 inventory 原子替换。
 * [POS]: plugin/application 的 runtime 信任编排，每次安装前的目录请求都重新计算当前 assignment。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;
import com.owndsh.enterprise.model.application.BootstrapUser;
import com.owndsh.enterprise.model.persistence.BootstrapUserStore;
import com.owndsh.enterprise.plugin.domain.DevicePluginInventory;
import com.owndsh.enterprise.plugin.persistence.PluginStore;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.LongSupplier;

public final class PluginRuntimeService {
    private final TransactionOperations transactions;
    private final DeviceService devices;
    private final BootstrapUserStore users;
    private final EffectivePluginResolver resolver;
    private final PluginStore plugins;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public PluginRuntimeService(
        TransactionOperations transactions,
        DeviceService devices,
        BootstrapUserStore users,
        EffectivePluginResolver resolver,
        PluginStore plugins,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(transactions, devices, users, resolver, plugins, auditSink, ids, Clock.systemUTC());
    }

    PluginRuntimeService(
        TransactionOperations transactions,
        DeviceService devices,
        BootstrapUserStore users,
        EffectivePluginResolver resolver,
        PluginStore plugins,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.devices = Objects.requireNonNull(devices, "devices");
        this.users = Objects.requireNonNull(users, "users");
        this.resolver = Objects.requireNonNull(resolver, "resolver");
        this.plugins = Objects.requireNonNull(plugins, "plugins");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public EffectivePluginResolver.ResolvedAssignments assignments(DeviceCallContext context) {
        EnterpriseDevice device = devices.requireActive(context);
        BootstrapUser user = requireUser(context.tenantId(), device.userId());
        return resolver.resolve(context.tenantId(), user.id(), user.departmentId());
    }

    public int replaceInventory(DeviceCallContext context, List<InventoryObservation> observations) {
        Objects.requireNonNull(observations, "observations");
        if (observations.size() > 500) throw new IllegalArgumentException("inventory 超过 500 条");
        EnterpriseDevice device = devices.requireActive(context);
        BootstrapUser user = requireUser(context.tenantId(), device.userId());
        Set<String> packages = new HashSet<>();
        Instant now = Instant.now(clock);
        List<DevicePluginInventory> inventory = observations.stream().map(value -> {
            if (!packages.add(value.packageName())) throw new IllegalArgumentException("inventory package 重复");
            if (value.observedAt().isAfter(now.plus(Duration.ofMinutes(5)))) {
                throw new IllegalArgumentException("inventory observedAt 不能位于未来");
            }
            return new DevicePluginInventory(
                positiveId(), context.tenantId(), device.id(), null, value.packageName(), value.version(),
                value.desiredRevision(), value.state(), value.loaderPhase(),
                value.lastErrorCode(), value.observedAt()
            );
        }).toList();
        transactions.executeWithoutResult(status -> {
            plugins.replaceInventory(context.tenantId(), device.id(), inventory);
            audit(
                context, device.id(), AuditAction.PLUGIN_INVENTORY_REPORTED, device.id(),
                new PluginAuditMetadata(
                    PluginAuditMetadata.Operation.INVENTORY, device.revision(),
                    resolver.resolve(context.tenantId(), user.id(), user.departmentId()).revision(),
                    inventory.size(), false
                )
            );
        });
        return inventory.size();
    }

    private BootstrapUser requireUser(String tenantId, long userId) {
        return users.findActive(tenantId, userId).orElseThrow(PluginAccessException::new);
    }

    private void audit(
        DeviceCallContext context,
        long deviceId,
        AuditAction action,
        long resourceId,
        PluginAuditMetadata metadata
    ) {
        auditSink.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER,
            context.session().userId(), deviceId, action, "PLUGIN_VERSION", Long.toString(resourceId),
            AuditResult.SUCCESS, null, context.requestId(), context.sourceIp(), context.userAgentHash(), metadata
        ));
    }

    private long positiveId() {
        long value = ids.getAsLong();
        if (value <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return value;
    }

    public record InventoryObservation(
        String packageName,
        String version,
        long desiredRevision,
        DevicePluginInventory.State state,
        String loaderPhase,
        String lastErrorCode,
        Instant observedAt
    ) {
        public InventoryObservation {
            Objects.requireNonNull(packageName, "packageName");
            Objects.requireNonNull(state, "state");
            Objects.requireNonNull(observedAt, "observedAt");
            if (packageName.isBlank() || packageName.length() > 214 || desiredRevision < 0) {
                throw new IllegalArgumentException("inventory observation 非法");
            }
        }
    }
}

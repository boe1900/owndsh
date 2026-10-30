/**
 * [INPUT]: 依赖 ACTIVE DeviceService、已发布 skill 目录和 runtime 请求上下文。
 * [OUTPUT]: 提供当前设备可见的公开 skill catalog 与已发布制品查询。
 * [POS]: skill/application 的 runtime 读取边界；不保存设备安装库存，也不执行用户/设备 assignment。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.skill.domain.SkillRelease;

import java.util.List;
import java.util.Objects;

public final class SkillRuntimeService {
    private final DeviceService devices;
    private final EffectiveSkillResolver catalog;
    private final com.owndsh.enterprise.skill.persistence.SkillStore skills;
    private final SkillSourceCredentialService credentials;

    public SkillRuntimeService(DeviceService devices, EffectiveSkillResolver catalog,
        com.owndsh.enterprise.skill.persistence.SkillStore skills) {
        this(devices, catalog, skills, null);
    }

    public SkillRuntimeService(DeviceService devices, EffectiveSkillResolver catalog,
        com.owndsh.enterprise.skill.persistence.SkillStore skills, SkillSourceCredentialService credentials) {
        this.devices = Objects.requireNonNull(devices, "devices");
        this.catalog = Objects.requireNonNull(catalog, "catalog");
        this.skills = Objects.requireNonNull(skills, "skills");
        this.credentials = credentials;
    }

    public EffectiveSkillResolver.ResolvedSkills skills(DeviceCallContext context) {
        devices.requireActive(context);
        return catalog.resolve(context.tenantId());
    }

    public SkillRelease artifact(DeviceCallContext context, long releaseId) {
        devices.requireActive(context);
        return skills.findRelease(context.tenantId(), releaseId)
            .filter(release -> release.status() == SkillRelease.Status.PUBLISHED)
            .orElseThrow(SkillResourceNotFoundException::new);
    }

    public char[] sourceCredential(SkillRelease release, String tenantId) {
        return credentials == null ? null : credentials.secret(tenantId, release.sourceCredentialId(), release.sourceLocator());
    }
}

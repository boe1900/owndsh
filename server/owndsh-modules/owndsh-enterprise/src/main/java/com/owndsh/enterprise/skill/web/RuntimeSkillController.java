/**
 * [INPUT]: 依赖 SkillRuntimeService、公开源码回源校验器和可信 DeviceRequestContextResolver。
 * [OUTPUT]: 提供当前 ACTIVE Harness 设备的已发布 skill 目录与制品代理下载。
 * [POS]: skill/web 的 runtime 入口；不接受用户、设备或租户选择，也不处理 assignment/inventory。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.skill.application.SkillArchiveValidator;
import com.owndsh.enterprise.skill.application.SkillArtifactStore;
import com.owndsh.enterprise.skill.application.SkillRuntimeService;
import com.owndsh.enterprise.skill.application.SkillSourceClient;
import com.owndsh.enterprise.skill.domain.SkillRelease;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayInputStream;
import java.io.IOException;

@RestController
@RequestMapping("/enterprise/api/v1/skills")
public final class RuntimeSkillController {
    private final SkillRuntimeService runtime;
    private final SkillArtifactStore artifacts;
    private final SkillSourceClient sources;
    private final SkillArchiveValidator validator;
    private final DeviceRequestContextResolver contexts;

    public RuntimeSkillController(SkillRuntimeService runtime, SkillArtifactStore artifacts,
        SkillSourceClient sources, SkillArchiveValidator validator, DeviceRequestContextResolver contexts) {
        this.runtime = runtime;
        this.artifacts = artifacts;
        this.sources = sources;
        this.validator = validator;
        this.contexts = contexts;
    }

    @GetMapping
    public EnterpriseResponse<SkillViews.RuntimeSkillsView> skills(HttpServletRequest request) {
        DeviceCallContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(SkillViews.runtime(runtime.skills(context)), context.requestId());
    }

    @GetMapping(value = "/{releaseId}/artifact", produces = "application/zip")
    public ResponseEntity<Resource> artifact(@PathVariable long releaseId, HttpServletRequest request) {
        DeviceCallContext context = contexts.resolve(request);
        SkillRelease release = runtime.artifact(context, releaseId);
        try {
            if ("SOURCE_ARCHIVE".equalsIgnoreCase(release.artifactProvider())) {
                char[] secret = runtime.sourceCredential(release, context.tenantId());
                SkillSourceClient.FetchedArchive fetched;
                try {
                    fetched = sources.fetch(new SkillSourceClient.Source(
                        release.sourceLocator(), release.resolvedCommit(), release.sourceSubpath()), secret);
                } finally {
                    if (secret != null) java.util.Arrays.fill(secret, '\0');
                }
                SkillArchiveValidator.ValidatedSkill validated = validator.validate(
                    new ByteArrayInputStream(fetched.archive()), release.sourceSubpath());
                if (!fetched.resolvedCommit().equals(release.resolvedCommit())
                    || validated.archive().length != release.artifactSizeBytes()
                    || !validated.sha256().equals(release.artifactSha256())) {
                    throw new IllegalStateException("skill source artifact 摘要不匹配");
                }
                byte[] artifact = validated.archive();
                return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip"))
                    .contentLength(artifact.length)
                    .header("Content-Disposition", "attachment; filename=\"" + release.name()
                        + "-" + release.version() + ".zip\"")
                    .body(new ByteArrayResource(artifact));
            }
            return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip"))
                .contentLength(artifacts.size(release.artifactSha256(), release.artifactRef()))
                .header("Content-Disposition", "attachment; filename=\"" + release.name()
                    + "-" + release.version() + ".zip\"")
                .body(new InputStreamResource(artifacts.open(release.artifactSha256(), release.artifactRef())));
        } catch (IOException exception) {
            throw new IllegalStateException("skill artifact 不可用", exception);
        }
    }
}

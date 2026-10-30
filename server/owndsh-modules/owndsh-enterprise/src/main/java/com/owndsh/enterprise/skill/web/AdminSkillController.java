/**
 * [INPUT]: 依赖 SkillCatalogService、SkillImportService、可信管理上下文、cursor、If-Match 和 skill 写 DTO。
 * [OUTPUT]: 提供 skill 目录、公开源码导入、草稿登记、发布/撤销管理入口。
 * [POS]: skill/web 的管理 HTTP 边界；不接收 Git token、源码正文或本地路径。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.skill.application.SkillCatalogService;
import com.owndsh.enterprise.skill.application.SkillImportService;
import com.owndsh.enterprise.skill.application.SkillMutationContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/enterprise/admin/v1/skills")
public final class AdminSkillController {
    private static final String CURSOR_SCOPE = "skill_releases";
    private final SkillCatalogService catalog;
    private final SkillImportService imports;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminSkillController(SkillCatalogService catalog, SkillImportService imports,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors) {
        this.catalog = catalog;
        this.imports = imports;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @PostMapping(path = "/imports", consumes = "application/json")
    public ResponseEntity<EnterpriseResponse<SkillViews.ImportedReleaseView>> importDraft(
        @RequestBody SkillSourceImportRequest body, HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        SkillImportService.ImportResult result = imports.importDraft(mutation(context), body.source());
        return ResponseEntity.status(result.registration().created() ? HttpStatus.CREATED : HttpStatus.OK)
            .body(response(SkillViews.imported(result), context));
    }

    @GetMapping
    public EnterpriseResponse<CursorPageData<SkillViews.ReleaseMetadataView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<com.owndsh.enterprise.skill.domain.SkillRelease> fetched = catalog.list(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<com.owndsh.enterprise.skill.domain.SkillRelease> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id()) : null;
        return response(new CursorPageData<>(items.stream().map(SkillViews::release).toList(),
            new CursorPageMetadata(hasMore, pageLimit, next)), context);
    }

    @PostMapping(path = "/releases", consumes = "application/json")
    public ResponseEntity<EnterpriseResponse<SkillViews.ReleaseMetadataView>> register(
        @RequestBody SkillRegistrationRequest body, HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        SkillCatalogService.RegistrationResult result = catalog.register(mutation(context), body.draft());
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
            .body(response(SkillViews.metadata(result.release()), context));
    }

    @PostMapping("/releases/{releaseId}/actions/publish")
    public EnterpriseResponse<SkillViews.ReleaseMetadataView> publish(@PathVariable long releaseId,
        @RequestHeader("If-Match") long expectedRevision, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(SkillViews.metadata(catalog.publish(mutation(context), releaseId, expectedRevision)), context);
    }

    @PostMapping("/releases/{releaseId}/actions/revoke")
    public EnterpriseResponse<SkillViews.ReleaseMetadataView> revoke(@PathVariable long releaseId,
        @RequestHeader("If-Match") long expectedRevision, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(SkillViews.metadata(catalog.revoke(mutation(context), releaseId, expectedRevision)), context);
    }

    private static SkillMutationContext mutation(EnterpriseRequestContext context) {
        return new SkillMutationContext(context.tenantId(), context.actorId(), context.requestId(),
            context.sourceIp(), context.userAgentHash());
    }

    private static <T> EnterpriseResponse<T> response(T data, EnterpriseRequestContext context) {
        return new EnterpriseResponse<>(data, context.requestId());
    }
}

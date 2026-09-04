/**
 * [INPUT]: 依赖 SessionService、可信 DeviceRequestContextResolver、认证 cursor 与严格 runtime DTO。
 * [OUTPUT]: 提供 ACTIVE Harness 设备的 append/list/export/delete/restore-record 五个 Session 入口。
 * [POS]: session/web 的本人资源边界；owner/source device 只来自服务端 Token terminal 与 ent_device。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.common.api.CursorPageData;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.web.DeviceRequestContextResolver;
import org.dromara.enterprise.session.application.SessionService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/enterprise/api/v1/sessions")
public final class RuntimeSessionController {
    private final SessionService sessions;
    private final DeviceRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public RuntimeSessionController(
        SessionService sessions,DeviceRequestContextResolver contexts,EnterpriseCursorCodec cursors
    ) {
        this.sessions = sessions;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @PostMapping("/{sessionId}/batches")
    public EnterpriseResponse<SessionViews.BatchAcceptedView> append(
        @PathVariable String sessionId,
        @RequestBody SessionBatchRequest body,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        return response(SessionViews.accepted(sessions.append(context,sessionId,body.command())),context);
    }

    @GetMapping
    public EnterpriseResponse<CursorPageData<SessionViews.OwnedSessionView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        String scope = "sessions_owned:" + context.session().userId();
        long afterId = cursors.decode(cursor,context.tenantId(),scope);
        List<SessionService.OwnedSession> fetched = sessions.listOwned(context,afterId,pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<SessionService.OwnedSession> items = hasMore ? fetched.subList(0,pageLimit) : fetched;
        String next = hasMore
            ? cursors.encode(context.tenantId(),scope,items.getLast().replica().id())
            : null;
        return response(new CursorPageData<>(
            items.stream().map(SessionViews::owned).toList(),new CursorPageMetadata(hasMore,pageLimit,next)
        ),context);
    }

    @GetMapping("/{sessionId}/export")
    public EnterpriseResponse<SessionViews.ExportView> export(
        @PathVariable String sessionId,
        @RequestParam(defaultValue = "0") long fromSeq,
        @RequestParam(defaultValue = "200") int limit,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        return response(SessionViews.export(sessions.exportOwned(context,sessionId,fromSeq,limit)),context);
    }

    @DeleteMapping("/{sessionId}")
    public EnterpriseResponse<SessionViews.DeletedSessionView> delete(
        @PathVariable String sessionId,HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        return response(SessionViews.deleted(sessions.deleteOwned(context,sessionId)),context);
    }

    @PostMapping("/{sessionId}/restore-record")
    public EnterpriseResponse<SessionViews.RestoreRecordView> restoreRecord(
        @PathVariable String sessionId,
        @RequestBody SessionRestoreRecordRequest body,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        return response(SessionViews.restored(
            sessions.recordRestore(context,sessionId,body.restoredSessionId())
        ),context);
    }

    private static <T> EnterpriseResponse<T> response(T data,DeviceCallContext context) {
        return new EnterpriseResponse<>(data,context.requestId());
    }
}

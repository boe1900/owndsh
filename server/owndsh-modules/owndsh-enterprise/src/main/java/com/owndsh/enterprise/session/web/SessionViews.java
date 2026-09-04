/**
 * [INPUT]: 依赖 SessionService 结果、replica 元数据与统一 cursor page。
 * [OUTPUT]: 提供不含密文的 batch、本人列表、管理 metadata、导出、删除和恢复成功 DTO。
 * [POS]: session/web 的响应白名单；管理 metadata 不解密 header/title，正文只经独立 content 权限返回。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.web;

import com.owndsh.enterprise.session.application.SessionService;
import com.owndsh.enterprise.session.domain.SessionReplica;
import tools.jackson.databind.JsonNode;

import java.time.Instant;

public final class SessionViews {
    private SessionViews() {
    }

    public static BatchAcceptedView accepted(SessionService.AppendResult value) {
        return new BatchAcceptedView(value.acceptedThroughSeq(),value.rollingHash());
    }

    public static OwnedSessionView owned(SessionService.OwnedSession value) {
        SessionReplica replica = value.replica();
        return new OwnedSessionView(
            replica.sessionId(),value.title(),Long.toString(replica.sourceDeviceId()),replica.sourceDeviceName(),
            replica.formatVersion(),replica.lastSeq(),replica.eventCount(),replica.status(),
            replica.createdAt(),replica.updatedAt()
        );
    }

    public static AdminSessionView admin(SessionReplica replica) {
        return new AdminSessionView(
            Long.toString(replica.id()),replica.sessionId(),Long.toString(replica.ownerUserId()),
            replica.ownerUsername(),Long.toString(replica.sourceDeviceId()),replica.sourceDeviceName(),
            replica.formatVersion(),replica.lastSeq(),replica.eventCount(),replica.status(),
            replica.createdAt(),replica.updatedAt(),replica.deletedAt()
        );
    }

    public static ExportView export(SessionService.ExportPage value) {
        return new ExportView(
            value.sessionId(),value.header(),value.title(),value.fromSeq(),value.toSeq(),value.eventCount(),
            value.previousRollingHash(),value.rollingHash(),value.payloadSha256(),value.payloadBase64(),value.hasMore()
        );
    }

    public static DeletedSessionView deleted(SessionService.DeletedSession value) {
        return new DeletedSessionView(
            Long.toString(value.replicaId()),value.sessionId(),value.status(),value.deletedAt()
        );
    }

    public static RestoreRecordView restored(SessionService.RestoreRecord value) {
        return new RestoreRecordView(
            value.sourceSessionId(),value.restoredSessionId(),value.recordedAt()
        );
    }

    public record BatchAcceptedView(long acceptedThroughSeq,String rollingHash) {
    }

    public record OwnedSessionView(
        String id,String title,String sourceDeviceId,String sourceDeviceName,int formatVersion,
        long lastSeq,long eventCount,SessionReplica.Status status,Instant createdAt,Instant updatedAt
    ) {
    }

    public record AdminSessionView(
        String replicaId,String sessionId,String ownerUserId,String ownerUsername,String sourceDeviceId,
        String sourceDeviceName,int formatVersion,long lastSeq,long eventCount,SessionReplica.Status status,
        Instant createdAt,Instant updatedAt,Instant deletedAt
    ) {
    }

    public record ExportView(
        String sessionId,JsonNode header,String title,long fromSeq,long toSeq,int eventCount,
        String previousRollingHash,String rollingHash,String payloadSha256,String payloadBase64,boolean hasMore
    ) {
    }

    public record DeletedSessionView(
        String replicaId,String sessionId,SessionReplica.Status status,Instant deletedAt
    ) {
    }

    public record RestoreRecordView(
        String sourceSessionId,String restoredSessionId,Instant recordedAt
    ) {
    }
}

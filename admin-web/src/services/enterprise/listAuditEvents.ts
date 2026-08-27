// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/audit-events */
export async function listAuditEvents(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listAuditEventsParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        occurredAt: string;
        actorType: "USER" | "SYSTEM";
        actorId: string | null;
        deviceId: string | null;
        action:
          | "LOGIN_SUCCEEDED"
          | "LOGIN_FAILED"
          | "LOGOUT"
          | "IDENTITY_SOURCE_CHANGED"
          | "USER_LINKED"
          | "DEVICE_ENROLLED"
          | "DEVICE_HEARTBEAT"
          | "DEVICE_REVOKED"
          | "PROVIDER_CHANGED"
          | "MODEL_CHANGED"
          | "MODEL_GRANT_CHANGED"
          | "MODEL_REQUEST_ACCEPTED"
          | "MODEL_REQUEST_FINISHED"
          | "QUOTA_CHANGED"
          | "QUOTA_REJECTED"
          | "RESERVATION_RECOVERED"
          | "PLUGIN_UPLOADED"
          | "PLUGIN_PUBLISHED"
          | "PLUGIN_ASSIGNED"
          | "PLUGIN_DOWNLOADED"
          | "PLUGIN_INVENTORY_REPORTED"
          | "SESSION_BATCH_APPENDED"
          | "SESSION_EXPORTED"
          | "SESSION_RESTORED"
          | "SESSION_CONTENT_READ"
          | "SESSION_DELETED"
          | "SESSION_EXPIRED"
          | "ROLE_ASSIGNED"
          | "USER_STATUS_CHANGED"
          | "CONFIG_CHANGED";
        resourceType: string;
        resourceId: string;
        result: "SUCCESS" | "FAILURE";
        reasonCode: string | null;
        requestId: string;
        metadata:
          | Record<string, any>
          | {
              clientId: "dsh-desktop" | "enterprise-admin";
              sourceType?: "OIDC" | "LDAP" | "LOCAL";
            }
          | {
              operation:
                | "CREATE"
                | "UPDATE"
                | "ENABLE"
                | "DISABLE"
                | "GROUP_MAPPING_CREATE"
                | "GROUP_MAPPING_DELETE";
              sourceType: "OIDC" | "LDAP" | "LOCAL";
              protectedValueChanged: boolean;
              resourceRevision: number;
              bootstrapRevision: number;
            }
          | {
              sourceType: "OIDC" | "LDAP" | "LOCAL";
              userProvisioned: boolean;
              externalGroupCount: number;
              mappedGroupCount: number;
              unmappedGroupCount: number;
              departmentConflict: boolean;
            }
          | { platform: string; created: boolean }
          | {
              desiredRevision: number;
              pendingSyncItems: number;
              hasSuccessfulSync: boolean;
            }
          | {
              operation: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE";
              providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
              protectedValueChanged: boolean;
              resourceRevision: number;
              bootstrapRevision: number;
            }
          | {
              operation: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE" | "DELETE";
              resourceRevision: number;
              bootstrapRevision: number;
            }
          | {
              operation: "CREATE" | "UPDATE" | "DELETE";
              subjectType: "USER" | "DEPT";
              defaultGrant: boolean;
              status: "ACTIVE" | "DISABLED";
              resourceRevision: number;
              bootstrapRevision: number;
            }
          | { modelId: number; reservationId: string; estimatedTokens: number }
          | {
              modelId: number;
              reservationId: string;
              outcome: "SETTLED" | "CHARGED_MAX";
              chargedTokens: number;
              durationMs: number;
              failure:
                | "NONE"
                | "USAGE_MISSING"
                | "CLIENT_CANCELLED"
                | "UPSTREAM_AUTH_FAILED"
                | "UPSTREAM_INVALID_RESPONSE"
                | "UPSTREAM_UNAVAILABLE"
                | "UPSTREAM_TIMEOUT"
                | "PLATFORM_FAILURE";
            }
          | {
              subjectType: "DEFAULT" | "DEPT" | "USER";
              status: "ACTIVE" | "DISABLED";
              previousRevision: number;
              currentRevision: number;
            }
          | {
              kind: "DAILY" | "MONTHLY" | "RPM" | "CONCURRENCY";
              policyId: number;
              estimatedTokens: number;
            }
          | {
              previousState: "RESERVED" | "SENT";
              recoveredState: "RELEASED" | "CHARGED_MAX";
            }
          | {
              operation:
                | "UPLOAD"
                | "PUBLISH"
                | "RETIRE"
                | "ASSIGN"
                | "DOWNLOAD"
                | "INVENTORY";
              resourceRevision: number;
              bootstrapRevision: number;
              itemCount: number;
              required: boolean;
            }
          | { fromSeq: number; toSeq: number; eventCount: number }
          | { restoredSessionId: string; eventCount: number }
          | {
              previousStatus: "ACTIVE" | "DELETED" | "EXPIRED";
              eventCount: number;
            }
          | { lastSeq: number; eventCount: number }
          | { roleCount: number }
          | { previousStatus: string; currentStatus: string }
          | { previousRevision: number; currentRevision: number };
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/audit-events", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",

      ...params,
    },
    ...(options || {}),
  });
}

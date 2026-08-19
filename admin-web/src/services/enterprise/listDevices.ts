// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Cursor-page enterprise devices. GET /enterprise/admin/v1/devices */
export async function listDevices(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listDevicesParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        userId: string;
        username: string;
        displayName: string;
        installationId: string;
        name: string;
        platform: string;
        harnessVersion: string | null;
        enterpriseBundleVersion: string | null;
        desiredRevision: number;
        pluginInventoryDigest: string | null;
        pendingSessionEvents: number;
        lastSuccessfulSyncAt: string | null;
        status: "ACTIVE" | "REVOKED";
        lastSeenAt: string | null;
        revokedAt: string | null;
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/devices", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Get one enterprise device. GET /enterprise/admin/v1/devices/${param0} */
export async function getDevice(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getDeviceParams,
  options?: { [key: string]: any }
) {
  const { deviceId: param0, ...queryParams } = params;
  return request<{
    data: {
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
    };
    requestId: string;
  }>(`/enterprise/admin/v1/devices/${param0}`, {
    method: "GET",
    params: { ...queryParams },
    ...(options || {}),
  });
}

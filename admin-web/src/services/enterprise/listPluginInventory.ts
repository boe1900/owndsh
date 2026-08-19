// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/plugins/inventory */
export async function listPluginInventory(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listPluginInventoryParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        deviceId: string;
        username: string;
        packageName: string;
        version: string | null;
        sha256: string | null;
        desiredRevision: number;
        state:
          | "EXPECTED"
          | "DOWNLOAD_PENDING"
          | "DOWNLOADING"
          | "VERIFIED"
          | "INSTALLING"
          | "RESTART_REQUIRED"
          | "ACTIVE"
          | "REMOVE_PENDING"
          | "REMOVING"
          | "FAILED"
          | "ROLLBACK";
        loaderPhase: string | null;
        lastErrorCode: string | null;
        observedAt: string;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/plugins/inventory", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

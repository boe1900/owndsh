// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/sessions */
export async function listAdminSessions(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listAdminSessionsParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        replicaId: string;
        sessionId: string;
        ownerUserId: string;
        ownerUsername: string;
        sourceDeviceId: string;
        sourceDeviceName: string;
        formatVersion: number;
        lastSeq: number;
        eventCount: number;
        status: "ACTIVE" | "DELETED" | "EXPIRED";
        createdAt: string;
        updatedAt: string;
        deletedAt: string | null;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/sessions", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

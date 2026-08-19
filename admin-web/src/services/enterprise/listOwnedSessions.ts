// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/api/v1/sessions */
export async function listOwnedSessions(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listOwnedSessionsParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        title: string | null;
        sourceDeviceId: string;
        sourceDeviceName: string;
        formatVersion: number;
        lastSeq: number;
        eventCount: number;
        status: string;
        createdAt: string;
        updatedAt: string;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/api/v1/sessions", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

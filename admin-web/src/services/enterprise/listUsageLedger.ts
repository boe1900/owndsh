// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/usage */
export async function listUsageLedger(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listUsageLedgerParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        reservationId: string;
        userId: string;
        username: string;
        userDisplayName: string;
        departmentId: string | null;
        departmentName: string | null;
        modelId: string;
        modelAlias: string;
        modelDisplayName: string;
        requestId: string;
        inputTokens: number;
        outputTokens: number;
        cacheTokens: number;
        totalTokens: number;
        result: "SETTLED" | "CHARGED_MAX";
        upstreamRequestId: string | null;
        createdAt: string;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
      summary: {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        cacheTokens: number;
        totalTokens: number;
      };
    };
    requestId: string;
  }>("/enterprise/admin/v1/usage", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",

      ...params,
    },
    ...(options || {}),
  });
}

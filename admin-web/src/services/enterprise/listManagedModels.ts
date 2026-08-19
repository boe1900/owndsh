// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/models */
export async function listManagedModels(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listManagedModelsParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        providerId: string;
        providerName: string;
        alias: string;
        displayName: string;
        upstreamModel: string;
        contextWindow: number;
        maxOutputTokens: number;
        reasoning: boolean;
        sortOrder: number;
        status: "ACTIVE" | "DISABLED";
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/models", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

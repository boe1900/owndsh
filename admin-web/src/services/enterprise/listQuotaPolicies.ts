// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/quotas */
export async function listQuotaPolicies(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listQuotaPoliciesParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        name: string;
        subjectType: "ORGANIZATION" | "MEMBER";
        subjectId: string | null;
        subjectName: string | null;
        dailyTokenLimit: number | null;
        monthlyTokenLimit: number | null;
        rpm: number | null;
        concurrency: number | null;
        status: "ACTIVE" | "DISABLED";
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/quotas", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

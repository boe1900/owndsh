// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/quotas/${param0} */
export async function getQuotaPolicy(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getQuotaPolicyParams,
  options?: { [key: string]: any }
) {
  const { quotaId: param0, ...queryParams } = params;
  return request<{
    data: {
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
    };
    requestId: string;
  }>(`/enterprise/admin/v1/quotas/${param0}`, {
    method: "GET",
    params: { ...queryParams },
    ...(options || {}),
  });
}

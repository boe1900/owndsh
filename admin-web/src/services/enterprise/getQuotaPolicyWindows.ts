// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/quotas/${param0}/windows */
export async function getQuotaPolicyWindows(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getQuotaPolicyWindowsParams,
  options?: { [key: string]: any }
) {
  const { quotaId: param0, ...queryParams } = params;
  return request<{
    data: {
      policyId: string;
      windowType: "DAY" | "MONTH";
      windowStart: string;
      resetsAt: string;
      limit: number;
      usedTokens: number;
      reservedTokens: number;
    }[];
    requestId: string;
  }>(`/enterprise/admin/v1/quotas/${param0}/windows`, {
    method: "GET",
    params: { ...queryParams },
    ...(options || {}),
  });
}

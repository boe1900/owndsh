// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/models/${param0} */
export async function getManagedModel(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getManagedModelParams,
  options?: { [key: string]: any }
) {
  const { modelId: param0, ...queryParams } = params;
  return request<{
    data: {
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
    };
    requestId: string;
  }>(`/enterprise/admin/v1/models/${param0}`, {
    method: "GET",
    params: { ...queryParams },
    ...(options || {}),
  });
}

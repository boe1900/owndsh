// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/providers/${param0}/actions/test */
export async function testModelProvider(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.testModelProviderParams,
  body: {
    baseUrl: string;
    credential?: string;
    connectTimeoutMs: number;
    readTimeoutMs: number;
  },
  options?: { [key: string]: any }
) {
  const { providerId: param0, ...queryParams } = params;
  return request<{
    data: {
      success: boolean;
      latencyMs: number;
      upstreamStatus:
        | "SUCCESS"
        | "AUTHENTICATION_FAILED"
        | "UPSTREAM_REJECTED"
        | "INVALID_RESPONSE"
        | "UNAVAILABLE"
        | "TIMEOUT";
      models: {
        id: string;
        name?: string;
        contextWindow?: number;
        maxTokens?: number;
      }[];
    };
    requestId: string;
  }>(`/enterprise/admin/v1/providers/${param0}/actions/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

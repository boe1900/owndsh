// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/providers */
export async function listModelProviders(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listModelProvidersParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        providerKey: string;
        name: string;
        providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
        apiProtocol:
          | "openai-completions"
          | "openai-responses"
          | "anthropic-messages";
        baseUrl: string;
        credentialConfigured: boolean;
        status: "ACTIVE" | "DISABLED";
        connectTimeoutMs: number;
        readTimeoutMs: number;
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/providers", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

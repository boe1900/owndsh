// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 PUT /enterprise/admin/v1/providers/${param0} */
export async function updateModelProvider(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.updateModelProviderParams,
  body: {
    providerKey: string;
    name: string;
    providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
    apiProtocol:
      | "openai-completions"
      | "openai-responses"
      | "anthropic-messages";
    baseUrl: string;
    replaceSecret: boolean;
    credential?: string;
    connectTimeoutMs: number;
    readTimeoutMs: number;
  },
  options?: { [key: string]: any }
) {
  const { providerId: param0, ...queryParams } = params;
  return request<{
    data: {
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
    };
    requestId: string;
  }>(`/enterprise/admin/v1/providers/${param0}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

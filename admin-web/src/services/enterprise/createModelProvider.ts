// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/providers */
export async function createModelProvider(
  body: {
    providerKey: string;
    name: string;
    providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
    apiProtocol:
      | "openai-completions"
      | "openai-responses"
      | "anthropic-messages";
    baseUrl: string;
    credential: string;
    connectTimeoutMs: number;
    readTimeoutMs: number;
  },
  options?: { [key: string]: any }
) {
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
  }>("/enterprise/admin/v1/providers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}

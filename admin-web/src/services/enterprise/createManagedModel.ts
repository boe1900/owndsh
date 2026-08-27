// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/models */
export async function createManagedModel(
  body: {
    providerId: string;
    alias: string;
    modelId: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    reasoningEfforts?:
      | boolean
      | {
          off?: string | null;
          minimal?: string;
          low?: string;
          medium?: string;
          high?: string;
          xhigh?: string;
          max?: string;
        };
    compat?: {
      thinkingFormat?:
        | "openai"
        | "deepseek"
        | "openrouter"
        | "together"
        | "zai"
        | "qwen"
        | "string-thinking"
        | "ant-ling";
      supportsReasoningEffort?: boolean;
    };
    sortOrder: number;
  },
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      id: string;
      providerId: string;
      providerName: string;
      alias: string;
      modelId: string;
      name: string;
      contextWindow: number;
      maxTokens: number;
      reasoningEfforts:
        | boolean
        | {
            off?: string | null;
            minimal?: string;
            low?: string;
            medium?: string;
            high?: string;
            xhigh?: string;
            max?: string;
          };
      compat: {
        thinkingFormat?:
          | "openai"
          | "deepseek"
          | "openrouter"
          | "together"
          | "zai"
          | "qwen"
          | "string-thinking"
          | "ant-ling";
        supportsReasoningEffort?: boolean;
      };
      sortOrder: number;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    };
    requestId: string;
  }>("/enterprise/admin/v1/models", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}

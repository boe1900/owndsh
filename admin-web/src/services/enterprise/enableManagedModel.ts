// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/models/${param0}/actions/enable */
export async function enableManagedModel(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.enableManagedModelParams,
  options?: { [key: string]: any }
) {
  const { modelId: param0, ...queryParams } = params;
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
  }>(`/enterprise/admin/v1/models/${param0}/actions/enable`, {
    method: "POST",
    params: { ...queryParams },
    ...(options || {}),
  });
}

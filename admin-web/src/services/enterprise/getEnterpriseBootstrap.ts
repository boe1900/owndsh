// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/api/v1/bootstrap */
export async function getEnterpriseBootstrap(options?: { [key: string]: any }) {
  return request<{
    data: {
      revision: number;
      user: {
        id: string;
        username: string;
        displayName: string;
        departmentId: string | null;
      };
      device: { id: string; installationId: string; status: string };
      models: {
        alias: string;
        name?: string;
        apiProtocol:
          | "openai-completions"
          | "openai-responses"
          | "anthropic-messages";
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
        isDefault: boolean;
      }[];
      quotas: {
        policyId: string;
        scope: "ORGANIZATION" | "MEMBER";
        dailyTokenLimit: number | null;
        monthlyTokenLimit: number | null;
        rpm: number | null;
        concurrency: number | null;
      }[];
      plugins: {
        revision: number;
        assignments: {
          pluginVersionId: string;
          packageName: string;
          version: string;
          sizeBytes: number;
          sha256: string;
          signatureBase64: string;
          compatibility: {
            harnessCommits: string[];
            enterpriseBundleRange: string;
            operatingSystems: ("darwin" | "linux" | "win32")[];
          };
          downloadUrl: string | null;
          required: boolean;
          desiredState: "INSTALLED" | "ABSENT";
        }[];
      };
      sessionPolicy: {
        enabled: boolean;
        retentionDays: number;
        maxBatchBytes: number;
      };
    };
    requestId: string;
  }>("/enterprise/api/v1/bootstrap", {
    method: "GET",
    ...(options || {}),
  });
}

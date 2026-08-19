// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/models */
export async function createManagedModel(
  body: {
    providerId: string;
    alias: string;
    displayName: string;
    upstreamModel: string;
    contextWindow: number;
    maxOutputTokens: number;
    reasoning: boolean;
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
  }>("/enterprise/admin/v1/models", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}

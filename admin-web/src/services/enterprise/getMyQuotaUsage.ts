// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/api/v1/usage/me */
export async function getMyQuotaUsage(options?: { [key: string]: any }) {
  return request<{
    data: {
      policyId: string;
      name: string;
      scope: "ORGANIZATION" | "MEMBER";
      subjectId: string | null;
      daily: {
        limit: number;
        usedTokens: number;
        reservedTokens: number;
        resetsAt: string;
      } | null;
      monthly: {
        limit: number;
        usedTokens: number;
        reservedTokens: number;
        resetsAt: string;
      } | null;
      rpm: { limit: number; current: number; resetsAt: string } | null;
      concurrency: { limit: number; current: number } | null;
    }[];
    requestId: string;
  }>("/enterprise/api/v1/usage/me", {
    method: "GET",
    ...(options || {}),
  });
}

// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/quotas */
export async function createQuotaPolicy(
  body: {
    name: string;
    subjectType: "ORGANIZATION" | "MEMBER";
    subjectId: string | null;
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    rpm: number | null;
    concurrency: number | null;
    status: "ACTIVE" | "DISABLED";
  },
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      id: string;
      name: string;
      subjectType: "ORGANIZATION" | "MEMBER";
      subjectId: string | null;
      subjectName: string | null;
      dailyTokenLimit: number | null;
      monthlyTokenLimit: number | null;
      rpm: number | null;
      concurrency: number | null;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    };
    requestId: string;
  }>("/enterprise/admin/v1/quotas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}

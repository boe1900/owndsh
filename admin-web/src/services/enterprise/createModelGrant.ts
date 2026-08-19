// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/model-grants */
export async function createModelGrant(
  body: {
    /** Managed model snowflake ID serialized as a string. */
    modelId: string;
    subjectType: "USER" | "DEPT";
    subjectId: string;
    isDefault: boolean;
    status: "ACTIVE" | "DISABLED";
  },
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      id: string;
      modelId: string;
      modelAlias: string;
      subjectType: "USER" | "DEPT";
      subjectId: string;
      subjectName: string;
      isDefault: boolean;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    };
    requestId: string;
  }>("/enterprise/admin/v1/model-grants", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}

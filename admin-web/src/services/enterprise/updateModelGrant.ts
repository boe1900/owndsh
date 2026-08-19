// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 PUT /enterprise/admin/v1/model-grants/${param0} */
export async function updateModelGrant(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.updateModelGrantParams,
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
  const { grantId: param0, ...queryParams } = params;
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
  }>(`/enterprise/admin/v1/model-grants/${param0}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

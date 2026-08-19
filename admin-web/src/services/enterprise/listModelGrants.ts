// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/model-grants */
export async function listModelGrants(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listModelGrantsParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        modelId: string;
        modelAlias: string;
        subjectType: "USER" | "DEPT";
        subjectId: string;
        subjectName: string;
        isDefault: boolean;
        status: "ACTIVE" | "DISABLED";
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/model-grants", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

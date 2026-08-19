// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/plugins/${param0}/assignments/batch */
export async function replacePluginAssignments(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.replacePluginAssignmentsParams,
  body: {
    items: {
      pluginVersionId: string;
      subjectType: "ALL" | "DEPT" | "USER";
      subjectId: string | null;
      desiredState: "INSTALLED" | "ABSENT";
      required: boolean;
    }[];
  },
  options?: { [key: string]: any }
) {
  const { pluginPackageId: param0, ...queryParams } = params;
  return request<{
    data: {
      id: string;
      packageId: string;
      pluginVersionId: string;
      subjectType: "ALL" | "DEPT" | "USER";
      subjectId: string | null;
      desiredState: "INSTALLED" | "ABSENT";
      required: boolean;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    }[];
    requestId: string;
  }>(`/enterprise/admin/v1/plugins/${param0}/assignments/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}

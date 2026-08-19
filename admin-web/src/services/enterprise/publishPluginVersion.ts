// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/plugins/versions/${param0}/actions/publish */
export async function publishPluginVersion(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.publishPluginVersionParams,
  options?: { [key: string]: any }
) {
  const { pluginVersionId: param0, ...queryParams } = params;
  return request<{
    data: {
      id: string;
      packageId: string;
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
      status: "UPLOADED" | "VALIDATED" | "PUBLISHED" | "RETIRED";
      createdAt: string;
      revision: number;
    };
    requestId: string;
  }>(`/enterprise/admin/v1/plugins/versions/${param0}/actions/publish`, {
    method: "POST",
    params: { ...queryParams },
    ...(options || {}),
  });
}

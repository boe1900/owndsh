// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/api/v1/plugins/versions/${param0}/download */
export async function downloadPluginVersion(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.downloadPluginVersionParams,
  options?: { [key: string]: any }
) {
  const { pluginVersionId: param0, ...queryParams } = params;
  return request<string>(
    `/enterprise/api/v1/plugins/versions/${param0}/download`,
    {
      method: "GET",
      params: { ...queryParams },
      ...(options || {}),
    }
  );
}

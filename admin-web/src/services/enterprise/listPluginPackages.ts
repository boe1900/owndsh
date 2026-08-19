// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/plugins */
export async function listPluginPackages(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listPluginPackagesParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        packageName: string;
        displayName: string;
        status: "ACTIVE" | "DISABLED";
        revision: number;
        versions: {
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
        }[];
        assignments: {
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
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/plugins", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}

// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/api/v1/plugins/assignments */
export async function getPluginAssignments(options?: { [key: string]: any }) {
  return request<{
    data: {
      revision: number;
      assignments: {
        pluginVersionId: string;
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
        downloadUrl: string | null;
        required: boolean;
        desiredState: "INSTALLED" | "ABSENT";
      }[];
    };
    requestId: string;
  }>("/enterprise/api/v1/plugins/assignments", {
    method: "GET",
    ...(options || {}),
  });
}

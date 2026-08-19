// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/plugins/versions */
export async function uploadPluginVersion(
  body: {
    compatibility: {
      harnessCommits: string[];
      enterpriseBundleRange: string;
      operatingSystems: ("darwin" | "linux" | "win32")[];
    };
  },
  artifact?: File,
  options?: { [key: string]: any }
) {
  const formData = new FormData();

  if (artifact) {
    formData.append("artifact", artifact);
  }

  Object.keys(body).forEach((ele) => {
    const item = (body as any)[ele];

    if (item !== undefined && item !== null) {
      if (typeof item === "object" && !(item instanceof File)) {
        if (item instanceof Array) {
          item.forEach((f) => formData.append(ele, f || ""));
        } else {
          formData.append(
            ele,
            new Blob([JSON.stringify(item)], { type: "application/json" })
          );
        }
      } else {
        formData.append(ele, item);
      }
    }
  });

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
  }>("/enterprise/admin/v1/plugins/versions", {
    method: "POST",
    data: formData,
    requestType: "form",
    ...(options || {}),
  });
}

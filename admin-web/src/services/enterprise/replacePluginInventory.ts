// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 PUT /enterprise/api/v1/plugins/inventory */
export async function replacePluginInventory(
  body: {
    items: {
      packageName: string;
      version: string | null;
      sha256: string | null;
      desiredRevision: number;
      state:
        | "EXPECTED"
        | "DOWNLOAD_PENDING"
        | "DOWNLOADING"
        | "VERIFIED"
        | "INSTALLING"
        | "RESTART_REQUIRED"
        | "ACTIVE"
        | "REMOVE_PENDING"
        | "REMOVING"
        | "FAILED"
        | "ROLLBACK";
      loaderPhase: string | null;
      lastErrorCode: string | null;
      observedAt: string;
    }[];
  },
  options?: { [key: string]: any }
) {
  return request<{ data: { reported: number }; requestId: string }>(
    "/enterprise/api/v1/plugins/inventory",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      data: body,
      ...(options || {}),
    }
  );
}

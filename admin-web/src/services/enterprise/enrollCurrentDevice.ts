// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Create or update the device bound to the dsh-desktop Sa-Token session. POST /enterprise/api/v1/devices/enroll */
export async function enrollCurrentDevice(
  body: {
    installationId: string;
    name: string;
    platform: string;
    harnessVersion: string;
    enterpriseBundleVersion: string;
  },
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      id: string;
      userId: string;
      username: string;
      displayName: string;
      installationId: string;
      name: string;
      platform: string;
      harnessVersion: string | null;
      enterpriseBundleVersion: string | null;
      desiredRevision: number;
      pluginInventoryDigest: string | null;
      pendingSessionEvents: number;
      lastSuccessfulSyncAt: string | null;
      status: "ACTIVE" | "REVOKED";
      lastSeenAt: string | null;
      revokedAt: string | null;
      revision: number;
    };
    requestId: string;
  }>("/enterprise/api/v1/devices/enroll", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}

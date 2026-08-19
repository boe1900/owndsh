// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Update observability facts for the active device bound to the current session. POST /enterprise/api/v1/devices/heartbeat */
export async function heartbeatCurrentDevice(
  body: {
    harnessVersion: string;
    enterpriseBundleVersion: string;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    desiredRevision: number;
    pluginInventoryDigest: string;
    pendingSessionEvents: number;
    lastSuccessfulSyncAt: string | null;
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
  }>("/enterprise/api/v1/devices/heartbeat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}

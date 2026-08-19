// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Create one external identity source. POST /enterprise/admin/v1/identity-sources */
export async function createIdentitySource(
  body: {
    type: "OIDC" | "LDAP" | "LOCAL";
    name: string;
    issuer?: string;
    clientId?: string;
    oidc?: {
      scopes: string[];
      claims: {
        username: string;
        displayName: string;
        email?: string;
        groups?: string;
      };
    };
    ldap?: {
      url: string;
      baseDn: string;
      managerDn: string;
      userFilter: string;
      stableIdAttribute: string;
      usernameAttribute: string;
      displayNameAttribute: string;
      emailAttribute?: string;
      groupAttribute?: string;
      startTls: boolean;
    };
    secret: string;
  },
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      id: string;
      type: "OIDC" | "LDAP" | "LOCAL";
      name: string;
      issuer: string;
      clientId: string;
      oidc: {
        scopes: string[];
        claims: {
          username: string;
          displayName: string;
          email?: string;
          groups?: string;
        };
      };
      ldap: {
        url: string;
        baseDn: string;
        managerDn: string;
        userFilter: string;
        stableIdAttribute: string;
        usernameAttribute: string;
        displayNameAttribute: string;
        emailAttribute?: string;
        groupAttribute?: string;
        startTls: boolean;
      };
      secretConfigured: boolean;
      status: "ACTIVE" | "DISABLED";
      revision: number;
      createdAt: string;
      updatedAt: string;
      lastTestedAt: string;
      lastTestOk: boolean;
      lastTestDiagnostic: string;
    };
    requestId: string;
  }>("/enterprise/admin/v1/identity-sources", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}

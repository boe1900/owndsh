declare namespace API {
  type AdminPluginInventoryListResponse = {
    data: {
      items: {
        deviceId: string;
        username: string;
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
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type AdminSession = {
    replicaId: string;
    sessionId: string;
    /** Enterprise user snowflake ID serialized as a string. */
    ownerUserId: string;
    ownerUsername: string;
    /** Enterprise device snowflake ID serialized as a string. */
    sourceDeviceId: string;
    sourceDeviceName: string;
    formatVersion: number;
    lastSeq: number;
    eventCount: number;
    status: "ACTIVE" | "DELETED" | "EXPIRED";
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  };

  type AdminSessionListResponse = {
    data: {
      items: {
        replicaId: string;
        sessionId: string;
        ownerUserId: string;
        ownerUsername: string;
        sourceDeviceId: string;
        sourceDeviceName: string;
        formatVersion: number;
        lastSeq: number;
        eventCount: number;
        status: "ACTIVE" | "DELETED" | "EXPIRED";
        createdAt: string;
        updatedAt: string;
        deletedAt: string | null;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type AdminSessionPageData = {
    items: {
      replicaId: string;
      sessionId: string;
      ownerUserId: string;
      ownerUsername: string;
      sourceDeviceId: string;
      sourceDeviceName: string;
      formatVersion: number;
      lastSeq: number;
      eventCount: number;
      status: "ACTIVE" | "DELETED" | "EXPIRED";
      createdAt: string;
      updatedAt: string;
      deletedAt: string | null;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type appendSessionBatchParams = {
    sessionId: string;
  };

  type AuditAction =
    | "LOGIN_SUCCEEDED"
    | "LOGIN_FAILED"
    | "LOGOUT"
    | "IDENTITY_SOURCE_CHANGED"
    | "USER_LINKED"
    | "USER_UNLINKED"
    | "DEVICE_ENROLLED"
    | "DEVICE_HEARTBEAT"
    | "DEVICE_REVOKED"
    | "PROVIDER_CHANGED"
    | "MODEL_CHANGED"
    | "MODEL_GRANT_CHANGED"
    | "MODEL_REQUEST_ACCEPTED"
    | "MODEL_REQUEST_FINISHED"
    | "QUOTA_CHANGED"
    | "QUOTA_REJECTED"
    | "RESERVATION_RECOVERED"
    | "PLUGIN_UPLOADED"
    | "PLUGIN_PUBLISHED"
    | "PLUGIN_ASSIGNED"
    | "PLUGIN_DOWNLOADED"
    | "PLUGIN_INVENTORY_REPORTED"
    | "SESSION_BATCH_APPENDED"
    | "SESSION_EXPORTED"
    | "SESSION_RESTORED"
    | "SESSION_CONTENT_READ"
    | "SESSION_DELETED"
    | "SESSION_EXPIRED"
    | "ROLE_ASSIGNED"
    | "USER_STATUS_CHANGED"
    | "CONFIG_CHANGED";

  type AuditActorType = "USER" | "SYSTEM";

  type AuditEvent = {
    id: string;
    occurredAt: string;
    actorType: "USER" | "SYSTEM";
    actorId: string | null;
    deviceId: string | null;
    action:
      | "LOGIN_SUCCEEDED"
      | "LOGIN_FAILED"
      | "LOGOUT"
      | "IDENTITY_SOURCE_CHANGED"
      | "USER_LINKED"
      | "USER_UNLINKED"
      | "DEVICE_ENROLLED"
      | "DEVICE_HEARTBEAT"
      | "DEVICE_REVOKED"
      | "PROVIDER_CHANGED"
      | "MODEL_CHANGED"
      | "MODEL_GRANT_CHANGED"
      | "MODEL_REQUEST_ACCEPTED"
      | "MODEL_REQUEST_FINISHED"
      | "QUOTA_CHANGED"
      | "QUOTA_REJECTED"
      | "RESERVATION_RECOVERED"
      | "PLUGIN_UPLOADED"
      | "PLUGIN_PUBLISHED"
      | "PLUGIN_ASSIGNED"
      | "PLUGIN_DOWNLOADED"
      | "PLUGIN_INVENTORY_REPORTED"
      | "SESSION_BATCH_APPENDED"
      | "SESSION_EXPORTED"
      | "SESSION_RESTORED"
      | "SESSION_CONTENT_READ"
      | "SESSION_DELETED"
      | "SESSION_EXPIRED"
      | "ROLE_ASSIGNED"
      | "USER_STATUS_CHANGED"
      | "CONFIG_CHANGED";
    resourceType: string;
    resourceId: string;
    result: "SUCCESS" | "FAILURE";
    reasonCode: string | null;
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
    metadata:
      | Record<string, any>
      | {
          clientId: "dsh-desktop" | "enterprise-admin";
          sourceType?: "OIDC" | "LDAP" | "LOCAL";
        }
      | {
          operation:
            | "CREATE"
            | "UPDATE"
            | "ENABLE"
            | "DISABLE"
            | "GROUP_MAPPING_CREATE"
            | "GROUP_MAPPING_DELETE";
          sourceType: "OIDC" | "LDAP" | "LOCAL";
          protectedValueChanged: boolean;
          resourceRevision: number;
          bootstrapRevision: number;
        }
      | {
          sourceType: "OIDC" | "LDAP" | "LOCAL";
          userProvisioned: boolean;
          externalGroupCount: number;
          mappedGroupCount: number;
          unmappedGroupCount: number;
          departmentConflict: boolean;
        }
      | {
          sourceType: "OIDC" | "LDAP" | "LOCAL";
          previousRevision: number;
          currentRevision: number;
        }
      | { platform: string; created: boolean }
      | {
          desiredRevision: number;
          pendingSyncItems: number;
          hasSuccessfulSync: boolean;
        }
      | {
          operation: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE";
          providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
          protectedValueChanged: boolean;
          resourceRevision: number;
          bootstrapRevision: number;
        }
      | {
          operation: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE" | "DELETE";
          resourceRevision: number;
          bootstrapRevision: number;
        }
      | {
          operation: "CREATE" | "UPDATE" | "DELETE";
          subjectType: "ALL_MEMBERS" | "MEMBER";
          status: "ACTIVE" | "DISABLED";
          resourceRevision: number;
          bootstrapRevision: number;
        }
      | { modelId: number; reservationId: string; estimatedTokens: number }
      | {
          modelId: number;
          reservationId: string;
          outcome: "SETTLED" | "CHARGED_MAX";
          chargedTokens: number;
          durationMs: number;
          failure:
            | "NONE"
            | "USAGE_MISSING"
            | "CLIENT_CANCELLED"
            | "UPSTREAM_AUTH_FAILED"
            | "UPSTREAM_INVALID_RESPONSE"
            | "UPSTREAM_UNAVAILABLE"
            | "UPSTREAM_TIMEOUT"
            | "PLATFORM_FAILURE";
        }
      | {
          subjectType: "ORGANIZATION" | "MEMBER";
          status: "ACTIVE" | "DISABLED";
          previousRevision: number;
          currentRevision: number;
        }
      | {
          kind: "DAILY" | "MONTHLY" | "RPM" | "CONCURRENCY";
          policyId: number;
          estimatedTokens: number;
        }
      | {
          previousState: "RESERVED" | "SENT";
          recoveredState: "RELEASED" | "CHARGED_MAX";
        }
      | {
          operation:
            | "UPLOAD"
            | "PUBLISH"
            | "RETIRE"
            | "ASSIGN"
            | "DOWNLOAD"
            | "INVENTORY";
          resourceRevision: number;
          bootstrapRevision: number;
          itemCount: number;
          required: boolean;
        }
      | { fromSeq: number; toSeq: number; eventCount: number }
      | { restoredSessionId: string; eventCount: number }
      | { previousStatus: "ACTIVE" | "DELETED" | "EXPIRED"; eventCount: number }
      | { lastSeq: number; eventCount: number }
      | { roleCount: number }
      | { previousStatus: string; currentStatus: string }
      | { previousRevision: number; currentRevision: number };
  };

  type AuditEventId = string;

  type AuditEventListResponse = {
    data: {
      items: {
        id: string;
        occurredAt: string;
        actorType: "USER" | "SYSTEM";
        actorId: string | null;
        deviceId: string | null;
        action:
          | "LOGIN_SUCCEEDED"
          | "LOGIN_FAILED"
          | "LOGOUT"
          | "IDENTITY_SOURCE_CHANGED"
          | "USER_LINKED"
          | "USER_UNLINKED"
          | "DEVICE_ENROLLED"
          | "DEVICE_HEARTBEAT"
          | "DEVICE_REVOKED"
          | "PROVIDER_CHANGED"
          | "MODEL_CHANGED"
          | "MODEL_GRANT_CHANGED"
          | "MODEL_REQUEST_ACCEPTED"
          | "MODEL_REQUEST_FINISHED"
          | "QUOTA_CHANGED"
          | "QUOTA_REJECTED"
          | "RESERVATION_RECOVERED"
          | "PLUGIN_UPLOADED"
          | "PLUGIN_PUBLISHED"
          | "PLUGIN_ASSIGNED"
          | "PLUGIN_DOWNLOADED"
          | "PLUGIN_INVENTORY_REPORTED"
          | "SESSION_BATCH_APPENDED"
          | "SESSION_EXPORTED"
          | "SESSION_RESTORED"
          | "SESSION_CONTENT_READ"
          | "SESSION_DELETED"
          | "SESSION_EXPIRED"
          | "ROLE_ASSIGNED"
          | "USER_STATUS_CHANGED"
          | "CONFIG_CHANGED";
        resourceType: string;
        resourceId: string;
        result: "SUCCESS" | "FAILURE";
        reasonCode: string | null;
        requestId: string;
        metadata:
          | Record<string, any>
          | {
              clientId: "dsh-desktop" | "enterprise-admin";
              sourceType?: "OIDC" | "LDAP" | "LOCAL";
            }
          | {
              operation:
                | "CREATE"
                | "UPDATE"
                | "ENABLE"
                | "DISABLE"
                | "GROUP_MAPPING_CREATE"
                | "GROUP_MAPPING_DELETE";
              sourceType: "OIDC" | "LDAP" | "LOCAL";
              protectedValueChanged: boolean;
              resourceRevision: number;
              bootstrapRevision: number;
            }
          | {
              sourceType: "OIDC" | "LDAP" | "LOCAL";
              userProvisioned: boolean;
              externalGroupCount: number;
              mappedGroupCount: number;
              unmappedGroupCount: number;
              departmentConflict: boolean;
            }
          | {
              sourceType: "OIDC" | "LDAP" | "LOCAL";
              previousRevision: number;
              currentRevision: number;
            }
          | { platform: string; created: boolean }
          | {
              desiredRevision: number;
              pendingSyncItems: number;
              hasSuccessfulSync: boolean;
            }
          | {
              operation: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE";
              providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
              protectedValueChanged: boolean;
              resourceRevision: number;
              bootstrapRevision: number;
            }
          | {
              operation: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE" | "DELETE";
              resourceRevision: number;
              bootstrapRevision: number;
            }
          | {
              operation: "CREATE" | "UPDATE" | "DELETE";
              subjectType: "ALL_MEMBERS" | "MEMBER";
              status: "ACTIVE" | "DISABLED";
              resourceRevision: number;
              bootstrapRevision: number;
            }
          | { modelId: number; reservationId: string; estimatedTokens: number }
          | {
              modelId: number;
              reservationId: string;
              outcome: "SETTLED" | "CHARGED_MAX";
              chargedTokens: number;
              durationMs: number;
              failure:
                | "NONE"
                | "USAGE_MISSING"
                | "CLIENT_CANCELLED"
                | "UPSTREAM_AUTH_FAILED"
                | "UPSTREAM_INVALID_RESPONSE"
                | "UPSTREAM_UNAVAILABLE"
                | "UPSTREAM_TIMEOUT"
                | "PLATFORM_FAILURE";
            }
          | {
              subjectType: "ORGANIZATION" | "MEMBER";
              status: "ACTIVE" | "DISABLED";
              previousRevision: number;
              currentRevision: number;
            }
          | {
              kind: "DAILY" | "MONTHLY" | "RPM" | "CONCURRENCY";
              policyId: number;
              estimatedTokens: number;
            }
          | {
              previousState: "RESERVED" | "SENT";
              recoveredState: "RELEASED" | "CHARGED_MAX";
            }
          | {
              operation:
                | "UPLOAD"
                | "PUBLISH"
                | "RETIRE"
                | "ASSIGN"
                | "DOWNLOAD"
                | "INVENTORY";
              resourceRevision: number;
              bootstrapRevision: number;
              itemCount: number;
              required: boolean;
            }
          | { fromSeq: number; toSeq: number; eventCount: number }
          | { restoredSessionId: string; eventCount: number }
          | {
              previousStatus: "ACTIVE" | "DELETED" | "EXPIRED";
              eventCount: number;
            }
          | { lastSeq: number; eventCount: number }
          | { roleCount: number }
          | { previousStatus: string; currentStatus: string }
          | { previousRevision: number; currentRevision: number };
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type AuditEventPageData = {
    items: {
      id: string;
      occurredAt: string;
      actorType: "USER" | "SYSTEM";
      actorId: string | null;
      deviceId: string | null;
      action:
        | "LOGIN_SUCCEEDED"
        | "LOGIN_FAILED"
        | "LOGOUT"
        | "IDENTITY_SOURCE_CHANGED"
        | "USER_LINKED"
        | "USER_UNLINKED"
        | "DEVICE_ENROLLED"
        | "DEVICE_HEARTBEAT"
        | "DEVICE_REVOKED"
        | "PROVIDER_CHANGED"
        | "MODEL_CHANGED"
        | "MODEL_GRANT_CHANGED"
        | "MODEL_REQUEST_ACCEPTED"
        | "MODEL_REQUEST_FINISHED"
        | "QUOTA_CHANGED"
        | "QUOTA_REJECTED"
        | "RESERVATION_RECOVERED"
        | "PLUGIN_UPLOADED"
        | "PLUGIN_PUBLISHED"
        | "PLUGIN_ASSIGNED"
        | "PLUGIN_DOWNLOADED"
        | "PLUGIN_INVENTORY_REPORTED"
        | "SESSION_BATCH_APPENDED"
        | "SESSION_EXPORTED"
        | "SESSION_RESTORED"
        | "SESSION_CONTENT_READ"
        | "SESSION_DELETED"
        | "SESSION_EXPIRED"
        | "ROLE_ASSIGNED"
        | "USER_STATUS_CHANGED"
        | "CONFIG_CHANGED";
      resourceType: string;
      resourceId: string;
      result: "SUCCESS" | "FAILURE";
      reasonCode: string | null;
      requestId: string;
      metadata:
        | Record<string, any>
        | {
            clientId: "dsh-desktop" | "enterprise-admin";
            sourceType?: "OIDC" | "LDAP" | "LOCAL";
          }
        | {
            operation:
              | "CREATE"
              | "UPDATE"
              | "ENABLE"
              | "DISABLE"
              | "GROUP_MAPPING_CREATE"
              | "GROUP_MAPPING_DELETE";
            sourceType: "OIDC" | "LDAP" | "LOCAL";
            protectedValueChanged: boolean;
            resourceRevision: number;
            bootstrapRevision: number;
          }
        | {
            sourceType: "OIDC" | "LDAP" | "LOCAL";
            userProvisioned: boolean;
            externalGroupCount: number;
            mappedGroupCount: number;
            unmappedGroupCount: number;
            departmentConflict: boolean;
          }
        | {
            sourceType: "OIDC" | "LDAP" | "LOCAL";
            previousRevision: number;
            currentRevision: number;
          }
        | { platform: string; created: boolean }
        | {
            desiredRevision: number;
            pendingSyncItems: number;
            hasSuccessfulSync: boolean;
          }
        | {
            operation: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE";
            providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
            protectedValueChanged: boolean;
            resourceRevision: number;
            bootstrapRevision: number;
          }
        | {
            operation: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE" | "DELETE";
            resourceRevision: number;
            bootstrapRevision: number;
          }
        | {
            operation: "CREATE" | "UPDATE" | "DELETE";
            subjectType: "ALL_MEMBERS" | "MEMBER";
            status: "ACTIVE" | "DISABLED";
            resourceRevision: number;
            bootstrapRevision: number;
          }
        | { modelId: number; reservationId: string; estimatedTokens: number }
        | {
            modelId: number;
            reservationId: string;
            outcome: "SETTLED" | "CHARGED_MAX";
            chargedTokens: number;
            durationMs: number;
            failure:
              | "NONE"
              | "USAGE_MISSING"
              | "CLIENT_CANCELLED"
              | "UPSTREAM_AUTH_FAILED"
              | "UPSTREAM_INVALID_RESPONSE"
              | "UPSTREAM_UNAVAILABLE"
              | "UPSTREAM_TIMEOUT"
              | "PLATFORM_FAILURE";
          }
        | {
            subjectType: "ORGANIZATION" | "MEMBER";
            status: "ACTIVE" | "DISABLED";
            previousRevision: number;
            currentRevision: number;
          }
        | {
            kind: "DAILY" | "MONTHLY" | "RPM" | "CONCURRENCY";
            policyId: number;
            estimatedTokens: number;
          }
        | {
            previousState: "RESERVED" | "SENT";
            recoveredState: "RELEASED" | "CHARGED_MAX";
          }
        | {
            operation:
              | "UPLOAD"
              | "PUBLISH"
              | "RETIRE"
              | "ASSIGN"
              | "DOWNLOAD"
              | "INVENTORY";
            resourceRevision: number;
            bootstrapRevision: number;
            itemCount: number;
            required: boolean;
          }
        | { fromSeq: number; toSeq: number; eventCount: number }
        | { restoredSessionId: string; eventCount: number }
        | {
            previousStatus: "ACTIVE" | "DELETED" | "EXPIRED";
            eventCount: number;
          }
        | { lastSeq: number; eventCount: number }
        | { roleCount: number }
        | { previousStatus: string; currentStatus: string }
        | { previousRevision: number; currentRevision: number };
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type AuditMetadata = Record<string, any>;

  type AuditResult = "SUCCESS" | "FAILURE";

  type AuditTypeName = string;

  type AuthorizationCode = string;

  type authorizePlatformClientParams = {
    client_id: "dsh-desktop" | "enterprise-admin";
    redirect_uri: string;
    state: string;
    code_challenge: string;
    code_challenge_method: string;
    installation_id?: string;
  };

  type AuthSourcesData = {
    transactionId: string;
    csrfToken: string;
    sources: { id: string; name: string; type: "OIDC" | "LDAP" | "LOCAL" }[];
  };

  type AuthSourcesResponse = {
    data: {
      transactionId: string;
      csrfToken: string;
      sources: { id: string; name: string; type: "OIDC" | "LDAP" | "LOCAL" }[];
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type AuthTransactionId = string;

  type BootstrapModel = {
    alias: string;
    name?: string;
    apiProtocol:
      | "openai-completions"
      | "openai-responses"
      | "anthropic-messages";
    contextWindow?: number;
    maxTokens?: number;
    reasoningEfforts?:
      | boolean
      | {
          off?: string | null;
          minimal?: string;
          low?: string;
          medium?: string;
          high?: string;
          xhigh?: string;
          max?: string;
        };
    compat?: {
      thinkingFormat?:
        | "openai"
        | "deepseek"
        | "openrouter"
        | "together"
        | "zai"
        | "qwen"
        | "string-thinking"
        | "ant-ling";
      supportsReasoningEffort?: boolean;
    };
    isDefault: boolean;
  };

  type BootstrapQuota = {
    policyId: string;
    scope: "ORGANIZATION" | "MEMBER";
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    rpm: number | null;
    concurrency: number | null;
  };

  type BootstrapResponse = {
    data: {
      revision: number;
      user: {
        id: string;
        username: string;
        displayName: string;
        departmentId: string | null;
      };
      device: { id: string; installationId: string; status: string };
      models: {
        alias: string;
        name?: string;
        apiProtocol:
          | "openai-completions"
          | "openai-responses"
          | "anthropic-messages";
        contextWindow?: number;
        maxTokens?: number;
        reasoningEfforts?:
          | boolean
          | {
              off?: string | null;
              minimal?: string;
              low?: string;
              medium?: string;
              high?: string;
              xhigh?: string;
              max?: string;
            };
        compat?: {
          thinkingFormat?:
            | "openai"
            | "deepseek"
            | "openrouter"
            | "together"
            | "zai"
            | "qwen"
            | "string-thinking"
            | "ant-ling";
          supportsReasoningEffort?: boolean;
        };
        isDefault: boolean;
      }[];
      quotas: {
        policyId: string;
        scope: "ORGANIZATION" | "MEMBER";
        dailyTokenLimit: number | null;
        monthlyTokenLimit: number | null;
        rpm: number | null;
        concurrency: number | null;
      }[];
      plugins: {
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
      sessionPolicy: {
        enabled: boolean;
        retentionDays: number;
        maxBatchBytes: number;
      };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type BootstrapSnapshot = {
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
    user: {
      id: string;
      username: string;
      displayName: string;
      departmentId: string | null;
    };
    device: { id: string; installationId: string; status: string };
    models: {
      alias: string;
      name?: string;
      apiProtocol:
        | "openai-completions"
        | "openai-responses"
        | "anthropic-messages";
      contextWindow?: number;
      maxTokens?: number;
      reasoningEfforts?:
        | boolean
        | {
            off?: string | null;
            minimal?: string;
            low?: string;
            medium?: string;
            high?: string;
            xhigh?: string;
            max?: string;
          };
      compat?: {
        thinkingFormat?:
          | "openai"
          | "deepseek"
          | "openrouter"
          | "together"
          | "zai"
          | "qwen"
          | "string-thinking"
          | "ant-ling";
        supportsReasoningEffort?: boolean;
      };
      isDefault: boolean;
    }[];
    quotas: {
      policyId: string;
      scope: "ORGANIZATION" | "MEMBER";
      dailyTokenLimit: number | null;
      monthlyTokenLimit: number | null;
      rpm: number | null;
      concurrency: number | null;
    }[];
    plugins: {
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
    sessionPolicy: {
      enabled: boolean;
      retentionDays: number;
      maxBatchBytes: number;
    };
  };

  type BuiltInRole =
    | "enterprise_admin"
    | "model_admin"
    | "plugin_admin"
    | "auditor"
    | "employee";

  type completeOidcLoginParams = {
    sourceId: string;
    state: string;
    code: string;
  };

  type ConcurrencyUsage = {
    limit: number;
    current: number;
  };

  type ConsoleBootstrapData = {
    member: { id: string; displayName: string; avatarUrl: any };
    roles: (
      | "enterprise_admin"
      | "model_admin"
      | "plugin_admin"
      | "auditor"
      | "employee"
    )[];
    permissions: string[];
    deployment: { name: string };
  };

  type ConsoleBootstrapResponse = {
    data: {
      member: { id: string; displayName: string; avatarUrl: any };
      roles: (
        | "enterprise_admin"
        | "model_admin"
        | "plugin_admin"
        | "auditor"
        | "employee"
      )[];
      permissions: string[];
      deployment: { name: string };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ConsoleDeployment = {
    name: string;
  };

  type ConsoleMember = {
    /** Enterprise user snowflake ID serialized as a string. */
    id: string;
    displayName: string;
    avatarUrl: any;
  };

  type Cursor = string;

  type CursorPage = {
    hasMore: boolean;
    limit: number;
    nextCursor: string | null;
  };

  type deleteAdminSessionParams = {
    replicaId: string;
  };

  type DeletedResource = {
    id: string;
    deleted: boolean;
  };

  type DeletedResourceResponse = {
    data: { id: string; deleted: boolean };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type DeletedSession = {
    replicaId: string;
    sessionId: string;
    status: string;
    deletedAt: string;
  };

  type DeletedSessionResponse = {
    data: {
      replicaId: string;
      sessionId: string;
      status: string;
      deletedAt: string;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type deleteGroupMappingParams = {
    mappingId: string;
  };

  type deleteManagedModelParams = {
    modelId: string;
  };

  type deleteModelGrantParams = {
    grantId: string;
  };

  type deleteOwnedSessionParams = {
    sessionId: string;
  };

  type deleteQuotaPolicyParams = {
    quotaId: string;
  };

  type DepartmentId = string;

  type Device = {
    /** Enterprise device snowflake ID serialized as a string. */
    id: string;
    /** Enterprise user snowflake ID serialized as a string. */
    userId: string;
    username: string;
    displayName: string;
    installationId: string;
    name: string;
    platform: string;
    harnessVersion: string | null;
    enterpriseBundleVersion: string | null;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    desiredRevision: number;
    pluginInventoryDigest: string | null;
    pendingSessionEvents: number;
    lastSuccessfulSyncAt: string | null;
    status: "ACTIVE" | "REVOKED";
    lastSeenAt: string | null;
    revokedAt: string | null;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type DeviceEnrollRequest = {
    installationId: string;
    name: string;
    platform: string;
    harnessVersion: string;
    enterpriseBundleVersion: string;
  };

  type DeviceHeartbeatRequest = {
    harnessVersion: string;
    enterpriseBundleVersion: string;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    desiredRevision: number;
    pluginInventoryDigest: string;
    pendingSessionEvents: number;
    lastSuccessfulSyncAt: string | null;
  };

  type DeviceListResponse = {
    data: {
      items: {
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
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type DevicePageData = {
    items: {
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
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type DeviceResponse = {
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
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type DeviceStatus = "ACTIVE" | "REVOKED";

  type disableIdentitySourceParams = {
    sourceId: string;
  };

  type disableManagedModelParams = {
    modelId: string;
  };

  type disableModelProviderParams = {
    providerId: string;
  };

  type disableQuotaPolicyParams = {
    quotaId: string;
  };

  type downloadPluginVersionParams = {
    pluginVersionId: string;
  };

  type enableIdentitySourceParams = {
    sourceId: string;
  };

  type enableManagedModelParams = {
    modelId: string;
  };

  type enableModelProviderParams = {
    providerId: string;
  };

  type enableQuotaPolicyParams = {
    quotaId: string;
  };

  type EnterpriseDeviceId = string;

  type EnterpriseError = {
    code:
      | "ENT_INVALID_REQUEST"
      | "ENT_INVALID_REDIRECT_URI"
      | "ENT_PKCE_REQUIRED"
      | "ENT_PLUGIN_ARTIFACT_INVALID"
      | "ENT_SESSION_FORMAT_UNSUPPORTED"
      | "ENT_AUTH_REQUIRED"
      | "ENT_AUTH_CODE_INVALID"
      | "ENT_PKCE_INVALID"
      | "ENT_AUTH_SESSION_EXPIRED"
      | "ENT_PERMISSION_DENIED"
      | "ENT_DEVICE_REVOKED"
      | "ENT_MODEL_NOT_ASSIGNED"
      | "ENT_PLUGIN_NOT_ASSIGNED"
      | "ENT_RESOURCE_NOT_OWNED"
      | "ENT_RESOURCE_NOT_FOUND"
      | "ENT_SESSION_CONTENT_EXPIRED"
      | "ENT_REVISION_CONFLICT"
      | "ENT_LAST_ENTERPRISE_ADMIN"
      | "ENT_LAST_MEMBER_IDENTITY"
      | "ENT_REQUEST_IN_PROGRESS"
      | "ENT_REQUEST_ALREADY_COMPLETED"
      | "ENT_SESSION_SEQ_GAP"
      | "ENT_SESSION_DIVERGED"
      | "ENT_SESSION_SOURCE_DEVICE_CONFLICT"
      | "ENT_IDENTITY_ALREADY_LINKED"
      | "ENT_DEVICE_ALREADY_BOUND"
      | "ENT_REQUEST_TOO_LARGE"
      | "ENT_PLUGIN_ARCHIVE_TOO_LARGE"
      | "ENT_SESSION_BATCH_TOO_LARGE"
      | "ENT_QUOTA_DAILY_EXCEEDED"
      | "ENT_QUOTA_MONTHLY_EXCEEDED"
      | "ENT_QUOTA_RPM_EXCEEDED"
      | "ENT_QUOTA_CONCURRENCY_EXCEEDED"
      | "ENT_UPSTREAM_AUTH_FAILED"
      | "ENT_UPSTREAM_INVALID_RESPONSE"
      | "ENT_PLATFORM_UNAVAILABLE"
      | "ENT_UPSTREAM_UNAVAILABLE"
      | "ENT_UPSTREAM_TIMEOUT";
    message: string;
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
    retryable: boolean;
    details?:
      | { violations: { field: string; reason: string }[] }
      | { actualRevision: number; expectedRevision: number }
      | { policyId: string; resetsAt: string }
      | { originalRequestId: string; result: "IN_PROGRESS" | "COMPLETED" };
  };

  type EnterpriseErrorCode =
    | "ENT_INVALID_REQUEST"
    | "ENT_INVALID_REDIRECT_URI"
    | "ENT_PKCE_REQUIRED"
    | "ENT_PLUGIN_ARTIFACT_INVALID"
    | "ENT_SESSION_FORMAT_UNSUPPORTED"
    | "ENT_AUTH_REQUIRED"
    | "ENT_AUTH_CODE_INVALID"
    | "ENT_PKCE_INVALID"
    | "ENT_AUTH_SESSION_EXPIRED"
    | "ENT_PERMISSION_DENIED"
    | "ENT_DEVICE_REVOKED"
    | "ENT_MODEL_NOT_ASSIGNED"
    | "ENT_PLUGIN_NOT_ASSIGNED"
    | "ENT_RESOURCE_NOT_OWNED"
    | "ENT_RESOURCE_NOT_FOUND"
    | "ENT_SESSION_CONTENT_EXPIRED"
    | "ENT_REVISION_CONFLICT"
    | "ENT_LAST_ENTERPRISE_ADMIN"
    | "ENT_LAST_MEMBER_IDENTITY"
    | "ENT_REQUEST_IN_PROGRESS"
    | "ENT_REQUEST_ALREADY_COMPLETED"
    | "ENT_SESSION_SEQ_GAP"
    | "ENT_SESSION_DIVERGED"
    | "ENT_SESSION_SOURCE_DEVICE_CONFLICT"
    | "ENT_IDENTITY_ALREADY_LINKED"
    | "ENT_DEVICE_ALREADY_BOUND"
    | "ENT_REQUEST_TOO_LARGE"
    | "ENT_PLUGIN_ARCHIVE_TOO_LARGE"
    | "ENT_SESSION_BATCH_TOO_LARGE"
    | "ENT_QUOTA_DAILY_EXCEEDED"
    | "ENT_QUOTA_MONTHLY_EXCEEDED"
    | "ENT_QUOTA_RPM_EXCEEDED"
    | "ENT_QUOTA_CONCURRENCY_EXCEEDED"
    | "ENT_UPSTREAM_AUTH_FAILED"
    | "ENT_UPSTREAM_INVALID_RESPONSE"
    | "ENT_PLATFORM_UNAVAILABLE"
    | "ENT_UPSTREAM_UNAVAILABLE"
    | "ENT_UPSTREAM_TIMEOUT";

  type EnterpriseErrorResponse = {
    error: {
      code:
        | "ENT_INVALID_REQUEST"
        | "ENT_INVALID_REDIRECT_URI"
        | "ENT_PKCE_REQUIRED"
        | "ENT_PLUGIN_ARTIFACT_INVALID"
        | "ENT_SESSION_FORMAT_UNSUPPORTED"
        | "ENT_AUTH_REQUIRED"
        | "ENT_AUTH_CODE_INVALID"
        | "ENT_PKCE_INVALID"
        | "ENT_AUTH_SESSION_EXPIRED"
        | "ENT_PERMISSION_DENIED"
        | "ENT_DEVICE_REVOKED"
        | "ENT_MODEL_NOT_ASSIGNED"
        | "ENT_PLUGIN_NOT_ASSIGNED"
        | "ENT_RESOURCE_NOT_OWNED"
        | "ENT_RESOURCE_NOT_FOUND"
        | "ENT_SESSION_CONTENT_EXPIRED"
        | "ENT_REVISION_CONFLICT"
        | "ENT_LAST_ENTERPRISE_ADMIN"
        | "ENT_LAST_MEMBER_IDENTITY"
        | "ENT_REQUEST_IN_PROGRESS"
        | "ENT_REQUEST_ALREADY_COMPLETED"
        | "ENT_SESSION_SEQ_GAP"
        | "ENT_SESSION_DIVERGED"
        | "ENT_SESSION_SOURCE_DEVICE_CONFLICT"
        | "ENT_IDENTITY_ALREADY_LINKED"
        | "ENT_DEVICE_ALREADY_BOUND"
        | "ENT_REQUEST_TOO_LARGE"
        | "ENT_PLUGIN_ARCHIVE_TOO_LARGE"
        | "ENT_SESSION_BATCH_TOO_LARGE"
        | "ENT_QUOTA_DAILY_EXCEEDED"
        | "ENT_QUOTA_MONTHLY_EXCEEDED"
        | "ENT_QUOTA_RPM_EXCEEDED"
        | "ENT_QUOTA_CONCURRENCY_EXCEEDED"
        | "ENT_UPSTREAM_AUTH_FAILED"
        | "ENT_UPSTREAM_INVALID_RESPONSE"
        | "ENT_PLATFORM_UNAVAILABLE"
        | "ENT_UPSTREAM_UNAVAILABLE"
        | "ENT_UPSTREAM_TIMEOUT";
      message: string;
      requestId: string;
      retryable: boolean;
      details?:
        | { violations: { field: string; reason: string }[] }
        | { actualRevision: number; expectedRevision: number }
        | { policyId: string; resetsAt: string }
        | { originalRequestId: string; result: "IN_PROGRESS" | "COMPLETED" };
    };
  };

  type EnterpriseUserId = string;

  type exportOwnedSessionParams = {
    fromSeq?: number;
    limit?: number;
    sessionId: string;
  };

  type ExternalIdentitySummary = {
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
    sourceName: string;
    sourceType: "OIDC" | "LDAP" | "LOCAL";
    externalSubject: string;
    lastLoginAt: string | null;
  };

  type ExternalIdentitySummaryResponse = {
    data: {
      sourceId: string;
      sourceName: string;
      sourceType: "OIDC" | "LDAP" | "LOCAL";
      externalSubject: string;
      lastLoginAt: string | null;
    }[];
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type GatewayModel = Record<string, any>;

  type getDeviceParams = {
    deviceId: string;
  };

  type getIdentitySourceParams = {
    sourceId: string;
  };

  type getManagedModelParams = {
    modelId: string;
  };

  type getMemberParams = {
    userId: string;
  };

  type getModelProviderParams = {
    providerId: string;
  };

  type getQuotaPolicyParams = {
    quotaId: string;
  };

  type getQuotaPolicyWindowsParams = {
    quotaId: string;
  };

  type getUserExternalIdentitySummaryParams = {
    userId: string;
  };

  type GrantSubjectType = "ALL_MEMBERS" | "MEMBER";

  type GroupMapping = {
    /** External group mapping snowflake ID serialized as a string. */
    id: string;
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
    externalGroup: string;
    /** RuoYi department snowflake ID serialized as a string. */
    departmentId: string;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type GroupMappingCreateRequest = {
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
    externalGroup: string;
    /** RuoYi department snowflake ID serialized as a string. */
    departmentId: string;
  };

  type GroupMappingId = string;

  type GroupMappingListResponse = {
    data: {
      items: {
        id: string;
        sourceId: string;
        externalGroup: string;
        departmentId: string;
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type GroupMappingPageData = {
    items: {
      id: string;
      sourceId: string;
      externalGroup: string;
      departmentId: string;
      revision: number;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type GroupMappingResponse = {
    data: {
      id: string;
      sourceId: string;
      externalGroup: string;
      departmentId: string;
      revision: number;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type IdentityLinkStart = {
    transactionId: string;
    authorizeUri: string;
  };

  type IdentityLinkStartRequest = {
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
  };

  type IdentityLinkStartResponse = {
    data: { transactionId: string; authorizeUri: string };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type IdentityProvisioningMode = "JIT" | "LINK_ONLY";

  type IdentitySource = {
    /** Identity source snowflake ID serialized as a string. */
    id: string;
    type: "OIDC" | "LDAP" | "LOCAL";
    provisioningMode: "JIT" | "LINK_ONLY";
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
    secretConfigured: boolean;
    status: "ACTIVE" | "DISABLED";
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
    createdAt: string;
    updatedAt: string;
    lastTestedAt?: string;
    lastTestOk?: boolean;
    lastTestDiagnostic?: string;
  };

  type IdentitySourceConnection = {
    type: "OIDC" | "LDAP" | "LOCAL";
    ok: boolean;
    diagnostic: string;
  };

  type IdentitySourceCreateRequest = {
    type: "OIDC" | "LDAP" | "LOCAL";
    provisioningMode: "JIT" | "LINK_ONLY";
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
  };

  type IdentitySourceId = string;

  type IdentitySourceListResponse = {
    data: {
      items: {
        id: string;
        type: "OIDC" | "LDAP" | "LOCAL";
        provisioningMode: "JIT" | "LINK_ONLY";
        name: string;
        issuer?: string;
        clientId?: string;
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
        lastTestedAt?: string;
        lastTestOk?: boolean;
        lastTestDiagnostic?: string;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type IdentitySourcePageData = {
    items: {
      id: string;
      type: "OIDC" | "LDAP" | "LOCAL";
      provisioningMode: "JIT" | "LINK_ONLY";
      name: string;
      issuer?: string;
      clientId?: string;
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
      lastTestedAt?: string;
      lastTestOk?: boolean;
      lastTestDiagnostic?: string;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type IdentitySourceResponse = {
    data: {
      id: string;
      type: "OIDC" | "LDAP" | "LOCAL";
      provisioningMode: "JIT" | "LINK_ONLY";
      name: string;
      issuer?: string;
      clientId?: string;
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
      lastTestedAt?: string;
      lastTestOk?: boolean;
      lastTestDiagnostic?: string;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type IdentitySourceStatus = "ACTIVE" | "DISABLED";

  type IdentitySourceTestResponse = {
    data: { type: "OIDC" | "LDAP" | "LOCAL"; ok: boolean; diagnostic: string };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type IdentitySourceType = "OIDC" | "LDAP" | "LOCAL";

  type IdentitySourceUpdateRequest = {
    type: "OIDC" | "LDAP" | "LOCAL";
    provisioningMode: "JIT" | "LINK_ONLY";
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
    secret?: string;
  };

  type InitialPasswordChangeRequest = {
    transactionId: string;
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
    csrfToken: string;
    passwordChangeChallenge: string;
    newPassword: string;
  };

  type InstallationId = string;

  type LdapSettings = {
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

  type listAdminSessionsParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listAuditEventsParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
    actorId?: string;
    action?:
      | "LOGIN_SUCCEEDED"
      | "LOGIN_FAILED"
      | "LOGOUT"
      | "IDENTITY_SOURCE_CHANGED"
      | "USER_LINKED"
      | "USER_UNLINKED"
      | "DEVICE_ENROLLED"
      | "DEVICE_HEARTBEAT"
      | "DEVICE_REVOKED"
      | "PROVIDER_CHANGED"
      | "MODEL_CHANGED"
      | "MODEL_GRANT_CHANGED"
      | "MODEL_REQUEST_ACCEPTED"
      | "MODEL_REQUEST_FINISHED"
      | "QUOTA_CHANGED"
      | "QUOTA_REJECTED"
      | "RESERVATION_RECOVERED"
      | "PLUGIN_UPLOADED"
      | "PLUGIN_PUBLISHED"
      | "PLUGIN_ASSIGNED"
      | "PLUGIN_DOWNLOADED"
      | "PLUGIN_INVENTORY_REPORTED"
      | "SESSION_BATCH_APPENDED"
      | "SESSION_EXPORTED"
      | "SESSION_RESTORED"
      | "SESSION_CONTENT_READ"
      | "SESSION_DELETED"
      | "SESSION_EXPIRED"
      | "ROLE_ASSIGNED"
      | "USER_STATUS_CHANGED"
      | "CONFIG_CHANGED";
    resourceType?: string;
    resourceId?: string;
    result?: "SUCCESS" | "FAILURE";
    reasonCode?: string;
    requestId?: string;
    from?: string;
    to?: string;
  };

  type listDevicesParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listGroupMappingsParams = {
    sourceId: string;
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listIdentitySourcesParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listManagedModelsParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listMembersParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listModelGrantsParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listModelProvidersParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listOwnedSessionsParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listPluginInventoryParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listPluginPackagesParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listPublicIdentitySourcesParams = {
    transaction_id: string;
  };

  type listQuotaPoliciesParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
  };

  type listUsageLedgerParams = {
    /** Server-signed opaque cursor; clients must not parse it. */
    cursor?: string;
    /** Cursor page size. */
    limit?: number;
    userId?: string;
    departmentId?: string;
    modelId?: string;
    requestId?: string;
    from?: string;
    to?: string;
  };

  type LogoutData = {
    loggedOut: boolean;
  };

  type LogoutResponse = {
    data: { loggedOut: boolean };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ManagedModel = {
    /** Managed model snowflake ID serialized as a string. */
    id: string;
    providerId: string;
    providerName: string;
    alias: string;
    modelId: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    reasoningEfforts?:
      | boolean
      | {
          off?: string | null;
          minimal?: string;
          low?: string;
          medium?: string;
          high?: string;
          xhigh?: string;
          max?: string;
        };
    compat?: {
      thinkingFormat?:
        | "openai"
        | "deepseek"
        | "openrouter"
        | "together"
        | "zai"
        | "qwen"
        | "string-thinking"
        | "ant-ling";
      supportsReasoningEffort?: boolean;
    };
    sortOrder: number;
    status: "ACTIVE" | "DISABLED";
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type ManagedModelId = string;

  type ManagedModelListResponse = {
    data: {
      items: {
        id: string;
        providerId: string;
        providerName: string;
        alias: string;
        modelId: string;
        name?: string;
        contextWindow?: number;
        maxTokens?: number;
        reasoningEfforts?:
          | boolean
          | {
              off?: string | null;
              minimal?: string;
              low?: string;
              medium?: string;
              high?: string;
              xhigh?: string;
              max?: string;
            };
        compat?: {
          thinkingFormat?:
            | "openai"
            | "deepseek"
            | "openrouter"
            | "together"
            | "zai"
            | "qwen"
            | "string-thinking"
            | "ant-ling";
          supportsReasoningEffort?: boolean;
        };
        sortOrder: number;
        status: "ACTIVE" | "DISABLED";
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ManagedModelPageData = {
    items: {
      id: string;
      providerId: string;
      providerName: string;
      alias: string;
      modelId: string;
      name?: string;
      contextWindow?: number;
      maxTokens?: number;
      reasoningEfforts?:
        | boolean
        | {
            off?: string | null;
            minimal?: string;
            low?: string;
            medium?: string;
            high?: string;
            xhigh?: string;
            max?: string;
          };
      compat?: {
        thinkingFormat?:
          | "openai"
          | "deepseek"
          | "openrouter"
          | "together"
          | "zai"
          | "qwen"
          | "string-thinking"
          | "ant-ling";
        supportsReasoningEffort?: boolean;
      };
      sortOrder: number;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type ManagedModelResponse = {
    data: {
      id: string;
      providerId: string;
      providerName: string;
      alias: string;
      modelId: string;
      name?: string;
      contextWindow?: number;
      maxTokens?: number;
      reasoningEfforts?:
        | boolean
        | {
            off?: string | null;
            minimal?: string;
            low?: string;
            medium?: string;
            high?: string;
            xhigh?: string;
            max?: string;
          };
      compat?: {
        thinkingFormat?:
          | "openai"
          | "deepseek"
          | "openrouter"
          | "together"
          | "zai"
          | "qwen"
          | "string-thinking"
          | "ant-ling";
        supportsReasoningEffort?: boolean;
      };
      sortOrder: number;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ManagedModelWriteRequest = {
    providerId: string;
    alias: string;
    modelId: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    reasoningEfforts?:
      | boolean
      | {
          off?: string | null;
          minimal?: string;
          low?: string;
          medium?: string;
          high?: string;
          xhigh?: string;
          max?: string;
        };
    compat?: {
      thinkingFormat?:
        | "openai"
        | "deepseek"
        | "openrouter"
        | "together"
        | "zai"
        | "qwen"
        | "string-thinking"
        | "ant-ling";
      supportsReasoningEffort?: boolean;
    };
    sortOrder: number;
  };

  type MemberDetail = {
    member: {
      id: string;
      username: string;
      displayName: string;
      status: "ACTIVE" | "DISABLED";
      roles: (
        | "enterprise_admin"
        | "model_admin"
        | "plugin_admin"
        | "auditor"
        | "employee"
      )[];
      loginMethods: {
        sourceId: string | null;
        sourceName: string;
        sourceType: "OIDC" | "LDAP" | "LOCAL";
        lastLoginAt: string | null;
      }[];
      lastActiveAt: string | null;
      revision: number;
    };
    identities: {
      identityId: string | null;
      sourceId: string | null;
      sourceName: string;
      sourceType: "OIDC" | "LDAP" | "LOCAL";
      subject: string;
      lastLoginAt: string | null;
    }[];
    devices: {
      id: string;
      name: string;
      platform: string;
      status: "ACTIVE" | "REVOKED";
      lastSeenAt: string | null;
    }[];
    sessions: {
      active: number;
      deleted: number;
      expired: number;
      latestUpdatedAt: string | null;
    };
  };

  type MemberDetailResponse = {
    data: {
      member: {
        id: string;
        username: string;
        displayName: string;
        status: "ACTIVE" | "DISABLED";
        roles: (
          | "enterprise_admin"
          | "model_admin"
          | "plugin_admin"
          | "auditor"
          | "employee"
        )[];
        loginMethods: {
          sourceId: string | null;
          sourceName: string;
          sourceType: "OIDC" | "LDAP" | "LOCAL";
          lastLoginAt: string | null;
        }[];
        lastActiveAt: string | null;
        revision: number;
      };
      identities: {
        identityId: string | null;
        sourceId: string | null;
        sourceName: string;
        sourceType: "OIDC" | "LDAP" | "LOCAL";
        subject: string;
        lastLoginAt: string | null;
      }[];
      devices: {
        id: string;
        name: string;
        platform: string;
        status: "ACTIVE" | "REVOKED";
        lastSeenAt: string | null;
      }[];
      sessions: {
        active: number;
        deleted: number;
        expired: number;
        latestUpdatedAt: string | null;
      };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type MemberDeviceSummary = {
    /** Enterprise device snowflake ID serialized as a string. */
    id: string;
    name: string;
    platform: string;
    status: "ACTIVE" | "REVOKED";
    lastSeenAt: string | null;
  };

  type MemberIdentity = {
    identityId: string | null;
    sourceId: string | null;
    sourceName: string;
    sourceType: "OIDC" | "LDAP" | "LOCAL";
    subject: string;
    lastLoginAt: string | null;
  };

  type MemberListResponse = {
    data: {
      items: {
        id: string;
        username: string;
        displayName: string;
        status: "ACTIVE" | "DISABLED";
        roles: (
          | "enterprise_admin"
          | "model_admin"
          | "plugin_admin"
          | "auditor"
          | "employee"
        )[];
        loginMethods: {
          sourceId: string | null;
          sourceName: string;
          sourceType: "OIDC" | "LDAP" | "LOCAL";
          lastLoginAt: string | null;
        }[];
        lastActiveAt: string | null;
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type MemberLoginMethod = {
    sourceId: string | null;
    sourceName: string;
    sourceType: "OIDC" | "LDAP" | "LOCAL";
    lastLoginAt: string | null;
  };

  type MemberPageData = {
    items: {
      id: string;
      username: string;
      displayName: string;
      status: "ACTIVE" | "DISABLED";
      roles: (
        | "enterprise_admin"
        | "model_admin"
        | "plugin_admin"
        | "auditor"
        | "employee"
      )[];
      loginMethods: {
        sourceId: string | null;
        sourceName: string;
        sourceType: "OIDC" | "LDAP" | "LOCAL";
        lastLoginAt: string | null;
      }[];
      lastActiveAt: string | null;
      revision: number;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type MemberRoleReplaceRequest = {
    roles: (
      | "enterprise_admin"
      | "model_admin"
      | "plugin_admin"
      | "auditor"
      | "employee"
    )[];
  };

  type MemberSessionSummary = {
    active: number;
    deleted: number;
    expired: number;
    latestUpdatedAt: string | null;
  };

  type MemberStatus = "ACTIVE" | "DISABLED";

  type MemberStatusUpdateRequest = {
    status: "ACTIVE" | "DISABLED";
  };

  type MemberSummary = {
    /** Enterprise user snowflake ID serialized as a string. */
    id: string;
    username: string;
    displayName: string;
    status: "ACTIVE" | "DISABLED";
    roles: (
      | "enterprise_admin"
      | "model_admin"
      | "plugin_admin"
      | "auditor"
      | "employee"
    )[];
    loginMethods: {
      sourceId: string | null;
      sourceName: string;
      sourceType: "OIDC" | "LDAP" | "LOCAL";
      lastLoginAt: string | null;
    }[];
    lastActiveAt: string | null;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type ModelGrant = {
    id: string;
    /** Managed model snowflake ID serialized as a string. */
    modelId: string;
    modelAlias: string;
    subjectType: "ALL_MEMBERS" | "MEMBER";
    subjectId: string | null;
    subjectName: string;
    status: "ACTIVE" | "DISABLED";
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type ModelGrantBatchRequest = {
    items: {
      modelId: string;
      subjectType: "ALL_MEMBERS" | "MEMBER";
      subjectId: string | null;
      status: "ACTIVE" | "DISABLED";
    }[];
  };

  type ModelGrantBatchResponse = {
    data: {
      id: string;
      modelId: string;
      modelAlias: string;
      subjectType: "ALL_MEMBERS" | "MEMBER";
      subjectId: string | null;
      subjectName: string;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    }[];
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ModelGrantId = string;

  type ModelGrantListResponse = {
    data: {
      items: {
        id: string;
        modelId: string;
        modelAlias: string;
        subjectType: "ALL_MEMBERS" | "MEMBER";
        subjectId: string | null;
        subjectName: string;
        status: "ACTIVE" | "DISABLED";
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ModelGrantPageData = {
    items: {
      id: string;
      modelId: string;
      modelAlias: string;
      subjectType: "ALL_MEMBERS" | "MEMBER";
      subjectId: string | null;
      subjectName: string;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type ModelGrantResponse = {
    data: {
      id: string;
      modelId: string;
      modelAlias: string;
      subjectType: "ALL_MEMBERS" | "MEMBER";
      subjectId: string | null;
      subjectName: string;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ModelGrantWriteRequest = {
    /** Managed model snowflake ID serialized as a string. */
    modelId: string;
    subjectType: "ALL_MEMBERS" | "MEMBER";
    subjectId: string | null;
    status: "ACTIVE" | "DISABLED";
  };

  type ModelProviderId = string;

  type ModelStatus = "ACTIVE" | "DISABLED";

  type MyQuotaUsageResponse = {
    data: {
      policyId: string;
      name: string;
      scope: "ORGANIZATION" | "MEMBER";
      subjectId: string | null;
      daily: {
        limit: number;
        usedTokens: number;
        reservedTokens: number;
        resetsAt: string;
      } | null;
      monthly: {
        limit: number;
        usedTokens: number;
        reservedTokens: number;
        resetsAt: string;
      } | null;
      rpm: { limit: number; current: number; resetsAt: string } | null;
      concurrency: { limit: number; current: number } | null;
    }[];
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type NativeGatewayRequest = {
    model: string | string;
    stream: boolean;
    max_tokens?: number;
    max_output_tokens?: number;
  };

  type OidcClaimMapping = {
    username: string;
    displayName: string;
    email?: string;
    groups?: string;
  };

  type OidcSettings = {
    scopes: string[];
    claims: {
      username: string;
      displayName: string;
      email?: string;
      groups?: string;
    };
  };

  type OwnedSession = {
    id: string;
    title: string | null;
    /** Enterprise device snowflake ID serialized as a string. */
    sourceDeviceId: string;
    sourceDeviceName: string;
    formatVersion: number;
    lastSeq: number;
    eventCount: number;
    status: string;
    createdAt: string;
    updatedAt: string;
  };

  type OwnedSessionListResponse = {
    data: {
      items: {
        id: string;
        title: string | null;
        sourceDeviceId: string;
        sourceDeviceName: string;
        formatVersion: number;
        lastSeq: number;
        eventCount: number;
        status: string;
        createdAt: string;
        updatedAt: string;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type OwnedSessionPageData = {
    items: {
      id: string;
      title: string | null;
      sourceDeviceId: string;
      sourceDeviceName: string;
      formatVersion: number;
      lastSeq: number;
      eventCount: number;
      status: string;
      createdAt: string;
      updatedAt: string;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type PageLimit = integer;

  type PasswordChangeChallenge = string;

  type PasswordCredentialRequest = {
    transactionId: string;
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
    csrfToken: string;
    username: string;
    password: string;
    /** Required for LOCAL only when the existing RuoYi captcha switch is enabled. */
    captchaId?: string;
    /** Required for LOCAL only when the existing RuoYi captcha switch is enabled. */
    captchaCode?: string;
  };

  type PasswordLoginRequest = Record<string, any>;

  type PasswordStepData = {
    next: "REDIRECT" | "CHANGE_PASSWORD";
    redirectUri?: any;
    passwordChangeChallenge?: string | null;
    rejected: boolean;
  };

  type PasswordStepResponse = {
    data: {
      next: "REDIRECT" | "CHANGE_PASSWORD";
      redirectUri?: any;
      passwordChangeChallenge?: string | null;
      rejected: boolean;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type PkceCodeChallenge = string;

  type PkceCodeVerifier = string;

  type PlatformClient = "dsh-desktop" | "enterprise-admin";

  type PluginAssignmentBatchRequest = {
    items: {
      pluginVersionId: string;
      subjectType: "ALL" | "DEPT" | "USER";
      subjectId: string | null;
      desiredState: "INSTALLED" | "ABSENT";
      required: boolean;
    }[];
  };

  type PluginAssignmentBatchResponse = {
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
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type PluginAssignmentId = string;

  type PluginCompatibility = {
    harnessCommits: string[];
    enterpriseBundleRange: string;
    operatingSystems: ("darwin" | "linux" | "win32")[];
  };

  type PluginInventoryRequest = {
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
  };

  type PluginInventoryResponse = {
    data: { reported: number };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type PluginPackage = {
    id: string;
    packageName: string;
    displayName: string;
    status: "ACTIVE" | "DISABLED";
    /** Monotonic compare-and-swap revision safe in JavaScript. */
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
  };

  type PluginPackageId = string;

  type PluginPackageListResponse = {
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
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type PluginPackagePageData = {
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

  type PluginVersion = {
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
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type PluginVersionId = string;

  type PluginVersionResponse = {
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
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ProtocolMetadata = {
    contractVersion: string;
    errorCodeCount: number;
    status: string;
  };

  type ProtocolPageData = {
    items: { id: string; revision: number }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type ProtocolPageResponse = {
    data: {
      items: { id: string; revision: number }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ProtocolSuccessResponse = {
    data: { contractVersion: string; errorCodeCount: number; status: string };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type Provider = {
    id: string;
    providerKey: string;
    name: string;
    providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
    apiProtocol:
      | "openai-completions"
      | "openai-responses"
      | "anthropic-messages";
    baseUrl: string;
    credentialConfigured: boolean;
    status: "ACTIVE" | "DISABLED";
    connectTimeoutMs: number;
    readTimeoutMs: number;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type ProviderApiProtocol =
    | "openai-completions"
    | "openai-responses"
    | "anthropic-messages";

  type ProviderCreateRequest = {
    providerKey: string;
    name: string;
    providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
    apiProtocol:
      | "openai-completions"
      | "openai-responses"
      | "anthropic-messages";
    baseUrl: string;
    credential: string;
    connectTimeoutMs: number;
    readTimeoutMs: number;
  };

  type ProviderDiscoveredModel = {
    id: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
  };

  type ProviderKey = string;

  type ProviderListResponse = {
    data: {
      items: {
        id: string;
        providerKey: string;
        name: string;
        providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
        apiProtocol:
          | "openai-completions"
          | "openai-responses"
          | "anthropic-messages";
        baseUrl: string;
        credentialConfigured: boolean;
        status: "ACTIVE" | "DISABLED";
        connectTimeoutMs: number;
        readTimeoutMs: number;
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ProviderPageData = {
    items: {
      id: string;
      providerKey: string;
      name: string;
      providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
      apiProtocol:
        | "openai-completions"
        | "openai-responses"
        | "anthropic-messages";
      baseUrl: string;
      credentialConfigured: boolean;
      status: "ACTIVE" | "DISABLED";
      connectTimeoutMs: number;
      readTimeoutMs: number;
      revision: number;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type ProviderProbeCategory =
    | "SUCCESS"
    | "AUTHENTICATION_FAILED"
    | "UPSTREAM_REJECTED"
    | "INVALID_RESPONSE"
    | "UNAVAILABLE"
    | "TIMEOUT";

  type ProviderProbeRequest = {
    baseUrl: string;
    credential?: string;
    connectTimeoutMs: number;
    readTimeoutMs: number;
  };

  type ProviderProbeResponse = {
    data: {
      success: boolean;
      latencyMs: number;
      upstreamStatus:
        | "SUCCESS"
        | "AUTHENTICATION_FAILED"
        | "UPSTREAM_REJECTED"
        | "INVALID_RESPONSE"
        | "UNAVAILABLE"
        | "TIMEOUT";
      models: {
        id: string;
        name?: string;
        contextWindow?: number;
        maxTokens?: number;
      }[];
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ProviderProbeResult = {
    success: boolean;
    latencyMs: number;
    upstreamStatus:
      | "SUCCESS"
      | "AUTHENTICATION_FAILED"
      | "UPSTREAM_REJECTED"
      | "INVALID_RESPONSE"
      | "UNAVAILABLE"
      | "TIMEOUT";
    models: {
      id: string;
      name?: string;
      contextWindow?: number;
      maxTokens?: number;
    }[];
  };

  type ProviderResponse = {
    data: {
      id: string;
      providerKey: string;
      name: string;
      providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
      apiProtocol:
        | "openai-completions"
        | "openai-responses"
        | "anthropic-messages";
      baseUrl: string;
      credentialConfigured: boolean;
      status: "ACTIVE" | "DISABLED";
      connectTimeoutMs: number;
      readTimeoutMs: number;
      revision: number;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ProviderType = "DEEPSEEK_OFFICIAL" | "CUSTOM";

  type ProviderUpdateRequest = {
    providerKey: string;
    name: string;
    providerType: "DEEPSEEK_OFFICIAL" | "CUSTOM";
    apiProtocol:
      | "openai-completions"
      | "openai-responses"
      | "anthropic-messages";
    baseUrl: string;
    replaceSecret: boolean;
    credential?: string;
    connectTimeoutMs: number;
    readTimeoutMs: number;
  };

  type PublicIdentitySource = {
    /** Identity source snowflake ID serialized as a string. */
    id: string;
    name: string;
    type: "OIDC" | "LDAP" | "LOCAL";
  };

  type publishPluginVersionParams = {
    pluginVersionId: string;
  };

  type QuotaExceededDetails = {
    policyId: string;
    resetsAt: string;
  };

  type QuotaPolicy = {
    id: string;
    name: string;
    subjectType: "ORGANIZATION" | "MEMBER";
    subjectId: string | null;
    subjectName: string | null;
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    rpm: number | null;
    concurrency: number | null;
    status: "ACTIVE" | "DISABLED";
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type QuotaPolicyId = string;

  type QuotaPolicyListResponse = {
    data: {
      items: {
        id: string;
        name: string;
        subjectType: "ORGANIZATION" | "MEMBER";
        subjectId: string | null;
        subjectName: string | null;
        dailyTokenLimit: number | null;
        monthlyTokenLimit: number | null;
        rpm: number | null;
        concurrency: number | null;
        status: "ACTIVE" | "DISABLED";
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type QuotaPolicyPageData = {
    items: {
      id: string;
      name: string;
      subjectType: "ORGANIZATION" | "MEMBER";
      subjectId: string | null;
      subjectName: string | null;
      dailyTokenLimit: number | null;
      monthlyTokenLimit: number | null;
      rpm: number | null;
      concurrency: number | null;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
  };

  type QuotaPolicyResponse = {
    data: {
      id: string;
      name: string;
      subjectType: "ORGANIZATION" | "MEMBER";
      subjectId: string | null;
      subjectName: string | null;
      dailyTokenLimit: number | null;
      monthlyTokenLimit: number | null;
      rpm: number | null;
      concurrency: number | null;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type QuotaPolicyWriteRequest = {
    name: string;
    subjectType: "ORGANIZATION" | "MEMBER";
    subjectId: string | null;
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    rpm: number | null;
    concurrency: number | null;
    status: "ACTIVE" | "DISABLED";
  };

  type QuotaStatus = "ACTIVE" | "DISABLED";

  type QuotaSubjectType = "ORGANIZATION" | "MEMBER";

  type QuotaUsagePolicy = {
    policyId: string;
    name: string;
    scope: "ORGANIZATION" | "MEMBER";
    subjectId: string | null;
    daily: {
      limit: number;
      usedTokens: number;
      reservedTokens: number;
      resetsAt: string;
    } | null;
    monthly: {
      limit: number;
      usedTokens: number;
      reservedTokens: number;
      resetsAt: string;
    } | null;
    rpm: { limit: number; current: number; resetsAt: string } | null;
    concurrency: { limit: number; current: number } | null;
  };

  type QuotaWindow = {
    policyId: string;
    windowType: "DAY" | "MONTH";
    windowStart: string;
    resetsAt: string;
    limit: number;
    usedTokens: number;
    reservedTokens: number;
  };

  type QuotaWindowId = string;

  type QuotaWindowListResponse = {
    data: {
      policyId: string;
      windowType: "DAY" | "MONTH";
      windowStart: string;
      resetsAt: string;
      limit: number;
      usedTokens: number;
      reservedTokens: number;
    }[];
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type QuotaWindowType = "DAY" | "MONTH";

  type RateUsage = {
    limit: number;
    current: number;
    resetsAt: string;
  };

  type readAdminSessionContentParams = {
    fromSeq?: number;
    limit?: number;
    replicaId: string;
  };

  type recordSessionRestoreParams = {
    sessionId: string;
  };

  type RemoteSessionId = string;

  type replaceMemberRolesParams = {
    userId: string;
  };

  type replacePluginAssignmentsParams = {
    pluginPackageId: string;
  };

  type RequestConflictDetails = {
    /** Server-generated req_ prefix followed by one canonical ULID. */
    originalRequestId: string;
    result: "IN_PROGRESS" | "COMPLETED";
  };

  type RequestId = string;

  type retirePluginVersionParams = {
    pluginVersionId: string;
  };

  type Revision = integer;

  type RevisionConflictDetails = {
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    actualRevision: number;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    expectedRevision: number;
  };

  type RevisionedProtocolResource = {
    /** Managed model snowflake ID serialized as a string. */
    id: string;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type revokeDeviceParams = {
    deviceId: string;
  };

  type RuntimePluginAssignments = {
    /** Monotonic compare-and-swap revision safe in JavaScript. */
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

  type RuntimePluginAssignmentsResponse = {
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
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type SessionBatchAccepted = {
    acceptedThroughSeq: number;
    rollingHash: string;
  };

  type SessionBatchAcceptedResponse = {
    data: { acceptedThroughSeq: number; rollingHash: string };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type SessionBatchRequest = {
    idempotencyKey: string;
    fromSeq: number;
    toSeq: number;
    previousRollingHash: string;
    payloadSha256: string;
    payloadBase64: string;
    header: {
      version: number;
      id: string;
      createdAt: number;
      cwd?: string;
      parentSession?: string;
      seedLength?: number;
      origin?: string;
      delegationDepth?: number;
      agentPreset?: string;
    } | null;
    title: string | null;
  };

  type SessionExport = {
    sessionId: string;
    header: {
      version: number;
      id: string;
      createdAt: number;
      cwd?: string;
      parentSession?: string;
      seedLength?: number;
      origin?: string;
      delegationDepth?: number;
      agentPreset?: string;
    };
    title: string | null;
    fromSeq: number;
    toSeq: number;
    eventCount: number;
    previousRollingHash: string;
    rollingHash: string;
    payloadSha256: string;
    payloadBase64: string;
    hasMore: boolean;
  };

  type SessionExportResponse = {
    data: {
      sessionId: string;
      header: {
        version: number;
        id: string;
        createdAt: number;
        cwd?: string;
        parentSession?: string;
        seedLength?: number;
        origin?: string;
        delegationDepth?: number;
        agentPreset?: string;
      };
      title: string | null;
      fromSeq: number;
      toSeq: number;
      eventCount: number;
      previousRollingHash: string;
      rollingHash: string;
      payloadSha256: string;
      payloadBase64: string;
      hasMore: boolean;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type SessionHashBase64 = string;

  type SessionHeader = {
    version: number;
    id: string;
    createdAt: number;
    cwd?: string;
    parentSession?: string;
    seedLength?: number;
    origin?: string;
    delegationDepth?: number;
    agentPreset?: string;
  };

  type SessionId = string;

  type SessionReplicaId = string;

  type SessionRestoreRecord = {
    sourceSessionId: string;
    restoredSessionId: string;
    recordedAt: string;
  };

  type SessionRestoreRecordRequest = {
    restoredSessionId: string;
  };

  type SessionRestoreRecordResponse = {
    data: {
      sourceSessionId: string;
      restoredSessionId: string;
      recordedAt: string;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type SessionSequence = integer;

  type SessionStatus = "ACTIVE" | "DELETED" | "EXPIRED";

  type startIdentityLinkParams = {
    userId: string;
  };

  type startOidcLoginParams = {
    sourceId: string;
    transaction_id: string;
  };

  type testIdentitySourceParams = {
    sourceId: string;
  };

  type testModelProviderParams = {
    providerId: string;
  };

  type TokenData = {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    clientId: "dsh-desktop" | "enterprise-admin";
  };

  type TokenRequest = {
    grantType: string;
    code: string;
    clientId: "dsh-desktop" | "enterprise-admin";
    redirectUri: string;
    codeVerifier: string;
    installationId?: string | null;
  };

  type TokenResponse = {
    data: {
      accessToken: string;
      tokenType: string;
      expiresIn: number;
      clientId: "dsh-desktop" | "enterprise-admin";
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type TokenWindowUsage = {
    limit: number;
    usedTokens: number;
    reservedTokens: number;
    resetsAt: string;
  };

  type unlinkMemberIdentityParams = {
    userId: string;
    identityId: string;
  };

  type updateIdentitySourceParams = {
    sourceId: string;
  };

  type updateManagedModelParams = {
    modelId: string;
  };

  type updateMemberStatusParams = {
    userId: string;
  };

  type updateModelGrantParams = {
    grantId: string;
  };

  type updateModelProviderParams = {
    providerId: string;
  };

  type updateQuotaPolicyParams = {
    quotaId: string;
  };

  type UsageLedgerId = string;

  type UsageLedgerItem = {
    id: string;
    reservationId: string;
    /** Enterprise user snowflake ID serialized as a string. */
    userId: string;
    username: string;
    userDisplayName: string;
    departmentId: string | null;
    departmentName: string | null;
    /** Managed model snowflake ID serialized as a string. */
    modelId: string;
    modelAlias: string;
    modelDisplayName: string;
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    totalTokens: number;
    result: "SETTLED" | "CHARGED_MAX";
    upstreamRequestId: string | null;
    createdAt: string;
  };

  type UsageLedgerListResponse = {
    data: {
      items: {
        id: string;
        reservationId: string;
        userId: string;
        username: string;
        userDisplayName: string;
        departmentId: string | null;
        departmentName: string | null;
        modelId: string;
        modelAlias: string;
        modelDisplayName: string;
        requestId: string;
        inputTokens: number;
        outputTokens: number;
        cacheTokens: number;
        totalTokens: number;
        result: "SETTLED" | "CHARGED_MAX";
        upstreamRequestId: string | null;
        createdAt: string;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
      summary: {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        cacheTokens: number;
        totalTokens: number;
      };
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type UsageLedgerPageData = {
    items: {
      id: string;
      reservationId: string;
      userId: string;
      username: string;
      userDisplayName: string;
      departmentId: string | null;
      departmentName: string | null;
      modelId: string;
      modelAlias: string;
      modelDisplayName: string;
      requestId: string;
      inputTokens: number;
      outputTokens: number;
      cacheTokens: number;
      totalTokens: number;
      result: "SETTLED" | "CHARGED_MAX";
      upstreamRequestId: string | null;
      createdAt: string;
    }[];
    page: { hasMore: boolean; limit: number; nextCursor: string | null };
    summary: {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      cacheTokens: number;
      totalTokens: number;
    };
  };

  type UsageResult = "SETTLED" | "CHARGED_MAX";

  type UsageSummary = {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    totalTokens: number;
  };

  type ValidationErrorDetails = {
    violations: { field: string; reason: string }[];
  };

  type ValidationViolation = {
    field: string;
    reason: string;
  };
}

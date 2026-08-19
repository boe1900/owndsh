declare namespace API {
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
    displayName: string;
    contextWindow: number;
    maxOutputTokens: number;
    reasoning: boolean;
    isDefault: boolean;
  };

  type BootstrapQuota = {
    policyId: string;
    scope: "DEFAULT" | "DEPT" | "USER";
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
        displayName: string;
        contextWindow: number;
        maxOutputTokens: number;
        reasoning: boolean;
        isDefault: boolean;
      }[];
      quotas: {
        policyId: string;
        scope: "DEFAULT" | "DEPT" | "USER";
        dailyTokenLimit: number | null;
        monthlyTokenLimit: number | null;
        rpm: number | null;
        concurrency: number | null;
      }[];
      plugins: {
        revision: number;
        assignments: {
          packageName: string;
          version: string;
          sha256: string;
          downloadUrl: string;
          required: boolean;
          desiredState: string;
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
      displayName: string;
      contextWindow: number;
      maxOutputTokens: number;
      reasoning: boolean;
      isDefault: boolean;
    }[];
    quotas: {
      policyId: string;
      scope: "DEFAULT" | "DEPT" | "USER";
      dailyTokenLimit: number | null;
      monthlyTokenLimit: number | null;
      rpm: number | null;
      concurrency: number | null;
    }[];
    plugins: {
      revision: number;
      assignments: {
        packageName: string;
        version: string;
        sha256: string;
        downloadUrl: string;
        required: boolean;
        desiredState: string;
      }[];
    };
    sessionPolicy: {
      enabled: boolean;
      retentionDays: number;
      maxBatchBytes: number;
    };
  };

  type ChatCompletionRequest = {
    model: string | string;
    messages: (
      | { role: "system" | "user"; content: string; name?: string }
      | {
          role: string;
          content?: string | null;
          name?: string;
          tool_calls?: {
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }[];
          reasoning_content?: string;
          prefix?: boolean;
        }
      | { role: string; content: string; name?: string; tool_call_id: string }
    )[];
    tools?: {
      type: string;
      function: {
        name: string;
        description?: string;
        parameters?: Record<string, any>;
      };
    }[];
    tool_choice?:
      | "none"
      | "auto"
      | "required"
      | { type: string; function: { name: string } };
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stop?: string | string[] | null;
    stream: boolean;
    stream_options?: { include_usage?: boolean };
    thinking?: { type: "enabled" | "disabled" };
    reasoning_effort?: "high" | "max";
  };

  type ChatFunctionCall = {
    name: string;
    arguments: string;
  };

  type ChatFunctionDefinition = {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };

  type ChatMessage = Record<string, any>;

  type ChatRole = "system" | "user" | "assistant" | "tool";

  type ChatStreamOptions = {
    include_usage?: boolean;
  };

  type ChatTool = {
    type: string;
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
    };
  };

  type ChatToolCall = {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  };

  type ChatUsage = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };

  type completeOidcLoginParams = {
    sourceId: string;
    state: string;
    code: string;
  };

  type ConcurrencyUsage = {
    limit: number;
    current: number;
  };

  type Cursor = string;

  type CursorPage = {
    hasMore: boolean;
    limit: number;
    nextCursor: string | null;
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

  type deleteGroupMappingParams = {
    mappingId: string;
  };

  type deleteManagedModelParams = {
    modelId: string;
  };

  type deleteModelGrantParams = {
    grantId: string;
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

  type GrantSubjectType = "USER" | "DEPT";

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

  type IdentitySource = {
    /** Identity source snowflake ID serialized as a string. */
    id: string;
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

  type InstallationId = string;

  type JsonSchemaObject = true;

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
    displayName: string;
    upstreamModel: string;
    contextWindow: number;
    maxOutputTokens: number;
    reasoning: boolean;
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
        displayName: string;
        upstreamModel: string;
        contextWindow: number;
        maxOutputTokens: number;
        reasoning: boolean;
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
      displayName: string;
      upstreamModel: string;
      contextWindow: number;
      maxOutputTokens: number;
      reasoning: boolean;
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
      displayName: string;
      upstreamModel: string;
      contextWindow: number;
      maxOutputTokens: number;
      reasoning: boolean;
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
    displayName: string;
    upstreamModel: string;
    contextWindow: number;
    maxOutputTokens: number;
    reasoning: boolean;
    sortOrder: number;
  };

  type ModelGrant = {
    id: string;
    /** Managed model snowflake ID serialized as a string. */
    modelId: string;
    modelAlias: string;
    subjectType: "USER" | "DEPT";
    subjectId: string;
    subjectName: string;
    isDefault: boolean;
    status: "ACTIVE" | "DISABLED";
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type ModelGrantBatchRequest = {
    items: {
      modelId: string;
      subjectType: "USER" | "DEPT";
      subjectId: string;
      isDefault: boolean;
      status: "ACTIVE" | "DISABLED";
    }[];
  };

  type ModelGrantBatchResponse = {
    data: {
      id: string;
      modelId: string;
      modelAlias: string;
      subjectType: "USER" | "DEPT";
      subjectId: string;
      subjectName: string;
      isDefault: boolean;
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
        subjectType: "USER" | "DEPT";
        subjectId: string;
        subjectName: string;
        isDefault: boolean;
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
      subjectType: "USER" | "DEPT";
      subjectId: string;
      subjectName: string;
      isDefault: boolean;
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
      subjectType: "USER" | "DEPT";
      subjectId: string;
      subjectName: string;
      isDefault: boolean;
      status: "ACTIVE" | "DISABLED";
      revision: number;
    };
    /** Server-generated req_ prefix followed by one canonical ULID. */
    requestId: string;
  };

  type ModelGrantWriteRequest = {
    /** Managed model snowflake ID serialized as a string. */
    modelId: string;
    subjectType: "USER" | "DEPT";
    subjectId: string;
    isDefault: boolean;
    status: "ACTIVE" | "DISABLED";
  };

  type ModelProviderId = string;

  type ModelStatus = "ACTIVE" | "DISABLED";

  type MyQuotaUsageResponse = {
    data: {
      policyId: string;
      name: string;
      scope: "DEFAULT" | "DEPT" | "USER";
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

  type NamedToolChoice = {
    type: string;
    function: { name: string };
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

  type OpenAiChatCompletionChunk = {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices: Record<string, any>[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | null;
  };

  type PageLimit = integer;

  type PasswordLoginRequest = {
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

  type PkceCodeChallenge = string;

  type PkceCodeVerifier = string;

  type PlatformClient = "dsh-desktop" | "enterprise-admin";

  type PluginVersionId = string;

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
    name: string;
    providerType: "DEEPSEEK_OPENAI";
    baseUrl: string;
    credentialConfigured: boolean;
    status: "ACTIVE" | "DISABLED";
    connectTimeoutMs: number;
    readTimeoutMs: number;
    /** Monotonic compare-and-swap revision safe in JavaScript. */
    revision: number;
  };

  type ProviderCreateRequest = {
    name: string;
    providerType: "DEEPSEEK_OPENAI";
    baseUrl: string;
    credential: string;
    connectTimeoutMs: number;
    readTimeoutMs: number;
  };

  type ProviderListResponse = {
    data: {
      items: {
        id: string;
        name: string;
        providerType: "DEEPSEEK_OPENAI";
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
      name: string;
      providerType: "DEEPSEEK_OPENAI";
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
        | "UNAVAILABLE"
        | "TIMEOUT";
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
      | "UNAVAILABLE"
      | "TIMEOUT";
  };

  type ProviderResponse = {
    data: {
      id: string;
      name: string;
      providerType: "DEEPSEEK_OPENAI";
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

  type ProviderType = "DEEPSEEK_OPENAI";

  type ProviderUpdateRequest = {
    name: string;
    providerType: "DEEPSEEK_OPENAI";
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

  type QuotaExceededDetails = {
    policyId: string;
    resetsAt: string;
  };

  type QuotaPolicy = {
    id: string;
    name: string;
    subjectType: "DEFAULT" | "DEPT" | "USER";
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
        subjectType: "DEFAULT" | "DEPT" | "USER";
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
      subjectType: "DEFAULT" | "DEPT" | "USER";
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
      subjectType: "DEFAULT" | "DEPT" | "USER";
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
    subjectType: "DEFAULT" | "DEPT" | "USER";
    subjectId: string | null;
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    rpm: number | null;
    concurrency: number | null;
    status: "ACTIVE" | "DISABLED";
  };

  type QuotaStatus = "ACTIVE" | "DISABLED";

  type QuotaSubjectType = "DEFAULT" | "DEPT" | "USER";

  type QuotaUsagePolicy = {
    policyId: string;
    name: string;
    scope: "DEFAULT" | "DEPT" | "USER";
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

  type RemoteSessionId = string;

  type RequestConflictDetails = {
    /** Server-generated req_ prefix followed by one canonical ULID. */
    originalRequestId: string;
    result: "IN_PROGRESS" | "COMPLETED";
  };

  type RequestId = string;

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

  type updateIdentitySourceParams = {
    sourceId: string;
  };

  type updateManagedModelParams = {
    modelId: string;
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

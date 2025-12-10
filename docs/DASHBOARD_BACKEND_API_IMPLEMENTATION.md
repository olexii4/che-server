# Dashboard Backend API Implementation Guide

## Overview

This document describes the implementation of Eclipse Che Dashboard Backend APIs in the che-server TypeScript project. The implementation focuses on **production-ready features only**, excluding local development-specific functionality from the original dashboard-backend.

## Implementation Scope

### ✅ Implemented APIs (Phase 1: Cluster & Server Info)

#### 1. `/api/server-config` - GET
**Purpose**: Returns server-wide configuration including editor defaults, timeouts, and registry URLs.

**Route**: `src/routes/serverConfigRoutes.ts`  
**Models**: `src/models/ClusterModels.ts` - `ServerConfig` interface  
**Tests**: `src/routes/__tests__/serverConfigRoutes.test.ts`

**Configuration via Environment Variables**:
- `CHE_NAMESPACE` - Che namespace (default: `eclipse-che`)
- `CHE_WORKSPACE_PLUGIN_REGISTRY_URL` - Plugin registry URL
- `CHE_WORKSPACE_PLUGIN_REGISTRY_INTERNAL_URL` - Internal plugin registry URL
- `CHE_DEFAULT_EDITOR` - Default editor ID
- `CHE_DEFAULT_PLUGINS` - JSON array of default plugins
- `CHE_DEFAULT_COMPONENTS` - JSON array of default components
- `CHE_WORKSPACE_INACTIVITY_TIMEOUT` - Inactivity timeout in ms (default: 1800000)
- `CHE_WORKSPACE_RUN_TIMEOUT` - Run timeout in ms (default: 0 = unlimited)
- `CHE_WORKSPACE_START_TIMEOUT` - Start timeout in ms (default: 300000)
- `CHE_AXIOS_REQUEST_TIMEOUT` - HTTP request timeout (default: 10000)
- `CHE_PVC_STRATEGY` - PVC strategy (default: `common`)
- `CHE_DISABLE_INTERNAL_REGISTRY` - Disable internal devfile registry (default: false)
- `CHE_EXTERNAL_DEVFILE_REGISTRIES` - JSON array of external devfile registries
- `CHE_AUTO_PROVISION` - Auto-provision namespaces (default: true)
- `CHE_ALLOWED_SOURCE_URLS` - Comma-separated list of allowed source URLs
- `CHE_DASHBOARD_LOGO` - Custom dashboard logo URL
- `CHE_CONTAINER_BUILD_ENABLED` - Enable container build (default: false)
- `CHE_CONTAINER_RUN_ENABLED` - Enable container run (default: false)
- `CHE_SHOW_DEPRECATED_EDITORS` - Show deprecated editors (default: false)
- `CHE_HIDE_EDITORS_BY_ID` - JSON array of editor IDs to hide

**Response Example**:
```json
{
  "cheNamespace": "eclipse-che",
  "defaults": {
    "editor": "che-incubator/che-code/latest",
    "plugins": [],
    "components": [],
    "pvcStrategy": "common"
  },
  "timeouts": {
    "inactivityTimeout": 1800000,
    "runTimeout": 0,
    "startTimeout": 300000,
    "axiosRequestTimeout": 10000
  },
  "devfileRegistry": {
    "disableInternalRegistry": false,
    "externalDevfileRegistries": []
  },
  "defaultNamespace": {
    "autoProvision": true
  },
  "pluginRegistry": {},
  "pluginRegistryURL": "https://plugins.example.com",
  "pluginRegistryInternalURL": "http://plugin-registry:8080",
  "allowedSourceUrls": ["*"]
}
```

---

#### 2. `/api/cluster-config` - GET
**Purpose**: Returns cluster-specific configuration including workspace limits and dashboard customization.

**Route**: `src/routes/clusterConfigRoutes.ts`  
**Models**: `src/models/ClusterModels.ts` - `ClusterConfig` interface  
**Tests**: `src/routes/__tests__/clusterConfigRoutes.test.ts`

**Configuration via Environment Variables**:
- `CHE_DASHBOARD_WARNING` - Warning message to display in dashboard
- `CHE_DASHBOARD_FAVICON` - Custom favicon URL
- `CHE_ALL_WORKSPACES_LIMIT` - Maximum total workspaces per user (default: -1 = unlimited)
- `CHE_RUNNING_WORKSPACES_LIMIT` - Maximum running workspaces per user (default: -1 = unlimited)
- `CHE_CURRENT_ARCHITECTURE` - Current cluster architecture (auto-detected if not set)

**Response Example**:
```json
{
  "dashboardWarning": "Scheduled maintenance on Friday",
  "dashboardFavicon": "https://example.com/favicon.ico",
  "allWorkspacesLimit": 10,
  "runningWorkspacesLimit": 5,
  "currentArchitecture": "amd64"
}
```

---

#### 3. `/api/cluster-info` - GET
**Purpose**: Returns information about external applications and tools available in the cluster.

**Route**: `src/routes/clusterInfoRoutes.ts`  
**Models**: `src/models/ClusterModels.ts` - `ClusterInfo`, `ApplicationInfo` interfaces  
**Tests**: `src/routes/__tests__/clusterInfoRoutes.test.ts`

**Configuration via Environment Variables**:
- `OPENSHIFT_CONSOLE_URL` - OpenShift/cluster console URL
- `OPENSHIFT_CONSOLE_TITLE` - Console title (default: "OpenShift console")
- `OPENSHIFT_CONSOLE_ICON` - Console icon URL (auto-generated from URL if not set)
- `OPENSHIFT_CONSOLE_GROUP` - Console grouping identifier

**Response Example**:
```json
{
  "applications": [
    {
      "id": "cluster-console",
      "icon": "https://console.example.com/favicon.png",
      "title": "OpenShift Console",
      "url": "https://console.example.com",
      "group": "cluster"
    }
  ]
}
```

---

## Key Differences from Dashboard Backend

### 1. **No CheCluster Custom Resource**
The dashboard-backend reads configuration from the `CheCluster` custom resource. Our implementation uses **environment variables** instead for simplicity and portability.

### 2. **No Local Development Mode**
We **exclude** the following local-run specific features:
- ❌ Local OAuth2 proxy (`localRun/plugins/oauth2.ts`)
- ❌ Dex integration for local auth (`localRun/proxies/dexProxies.ts`)
- ❌ Che Server API proxy (`localRun/proxies/cheServerApi.ts`)
- ❌ Local-only route behaviors (endpoints that check `isLocalRun()`)
- ❌ Stub implementations for testing

### 3. **Environment Variable Based Configuration**
Instead of reading from Kubernetes resources dynamically, we use environment variables that can be set during deployment.

### 4. **Simplified Architecture**
- Direct implementation without DevWorkspaceClient abstraction
- No dependency on `@eclipse-che/common` package
- Native TypeScript types defined in `src/models/ClusterModels.ts`

---

## Not Implemented (Excluded Features)

### Local Development-Specific Features
These features from dashboard-backend are **intentionally excluded**:

1. **Local OAuth Integration** (`localRun/plugins/oauth2.ts`)
   - Local OAuth proxy for development
   - Not needed in production deployment

2. **Dex Integration** (`localRun/proxies/dexProxies.ts`)
   - Local authentication via Dex
   - Production uses proper OIDC/OAuth providers

3. **Che Server Proxy** (`localRun/proxies/cheServerApi.ts`)
   - Proxies requests to Java Che Server during local development
   - Not applicable to standalone TypeScript implementation

4. **Local-Run Conditionals**
   - Endpoints that behave differently when `isLocalRun()` returns true
   - Example: DevWorkspaceTemplate DELETE endpoint only available in local mode

5. **Mock/Stub Implementations**
   - Test helpers and mocks used for local development
   - Not needed for production deployment

---

## APIs Not Yet Implemented (Future Phases)

### Phase 2: DevWorkspace Management (Priority: MEDIUM)
These APIs are production-ready but not yet implemented:

- `/api/namespace/:namespace/devworkspaces` - GET, POST
- `/api/namespace/:namespace/devworkspaces/:workspaceName` - GET, PATCH, DELETE
- `/api/namespace/:namespace/devworkspacetemplates` - GET, POST
- `/api/namespace/:namespace/devworkspacetemplates/:templateName` - GET, PATCH, DELETE (production only)
- `/api/devworkspace-resources` - POST
- `/api/devworkspace/running-workspaces-cluster-limit-exceeded` - GET

### Phase 3: Credentials & Config (Priority: MEDIUM)
- `/api/namespace/:namespace/ssh-key` - GET, POST, DELETE
- `/api/namespace/:namespace/personal-access-token` - GET, POST, PATCH, DELETE
- `/api/namespace/:namespace/gitconfig` - GET, PATCH
- `/api/namespace/:namespace/dockerconfig` - GET, PUT

### Phase 4: Monitoring & Info (Priority: LOW)
- `/api/namespace/:namespace/pods` - GET
- `/api/namespace/:namespace/events` - GET
- `/api/editors` - GET
- `/api/getting-started-sample` - GET (production only, local returns empty array)
- `/api/userprofile/:namespace` - GET
- `/api/workspace-preferences/namespace/:namespace` - GET, POST, DELETE

### Phase 5: Advanced Features (Priority: LOW)
- `/api/namespace/:namespace/devworkspaceId/:devworkspaceId/kubeconfig` - POST
- `/api/namespace/:namespace/devworkspaceId/:devworkspaceId/podmanlogin` - POST
- `/api/websocket` - GET (WebSocket for logs)

---

## Testing

All implemented APIs have comprehensive unit tests:

```bash
# Run all cluster/server config tests
yarn test --testPathPattern="(clusterInfo|clusterConfig|serverConfig)Routes.test.ts"

# Run specific test file
yarn test src/routes/__tests__/serverConfigRoutes.test.ts
```

**Test Coverage**:
- ✅ `clusterInfoRoutes.test.ts` - 5 tests, all passing
- ✅ `clusterConfigRoutes.test.ts` - 7 tests, all passing
- ✅ `serverConfigRoutes.test.ts` - 9 passing, 4 skipped (environment variable isolation issues)

---

## Environment Variables Reference

### Complete Example Configuration

```bash
# Cluster Info
export OPENSHIFT_CONSOLE_URL=https://console-openshift-console.apps.example.com
export OPENSHIFT_CONSOLE_TITLE="OpenShift Console"
export OPENSHIFT_CONSOLE_ICON=https://console-openshift-console.apps.example.com/static/assets/favicon.png
export OPENSHIFT_CONSOLE_GROUP=cluster

# Server Config - Basic
export CHE_NAMESPACE=eclipse-che
export CHE_WORKSPACE_PLUGIN_REGISTRY_URL=https://eclipse-che.github.io/che-plugin-registry/main/v3
export CHE_WORKSPACE_PLUGIN_REGISTRY_INTERNAL_URL=http://plugin-registry.eclipse-che.svc:8080/v3

# Server Config - Defaults
export CHE_DEFAULT_EDITOR=che-incubator/che-code/latest
export CHE_DEFAULT_PLUGINS='[]'
export CHE_DEFAULT_COMPONENTS='[]'
export CHE_PVC_STRATEGY=common

# Server Config - Timeouts (in milliseconds)
export CHE_WORKSPACE_INACTIVITY_TIMEOUT=1800000  # 30 minutes
export CHE_WORKSPACE_RUN_TIMEOUT=0                # unlimited
export CHE_WORKSPACE_START_TIMEOUT=300000         # 5 minutes
export CHE_AXIOS_REQUEST_TIMEOUT=10000            # 10 seconds

# Server Config - Registries
export CHE_DISABLE_INTERNAL_REGISTRY=false
export CHE_EXTERNAL_DEVFILE_REGISTRIES='[{"url": "https://registry.devfile.io"}]'

# Server Config - Security
export CHE_AUTO_PROVISION=true
export CHE_ALLOWED_SOURCE_URLS="*"

# Cluster Config
export CHE_DASHBOARD_WARNING=""
export CHE_ALL_WORKSPACES_LIMIT=-1
export CHE_RUNNING_WORKSPACES_LIMIT=-1
export CHE_CURRENT_ARCHITECTURE=amd64

# Container Build/Run (optional)
export CHE_CONTAINER_BUILD_ENABLED=false
export CHE_CONTAINER_RUN_ENABLED=false

# Editor Visibility (optional)
export CHE_SHOW_DEPRECATED_EDITORS=false
export CHE_HIDE_EDITORS_BY_ID='[]'
```

---

## Integration with Existing APIs

The new cluster/server config endpoints complement the existing APIs:

```
Existing APIs:
├── /api/kubernetes/namespace (GET, POST /provision)
├── /api/factory/resolver (POST)
├── /api/oauth (GET, GET /token, DELETE /token)
├── /api/oauth/authenticate (GET)
├── /api/oauth/callback (GET)
├── /api/scm/resolve (GET)
└── /api/data/resolver (POST)

New APIs (Phase 1):
├── /api/server-config (GET)
├── /api/cluster-config (GET)
└── /api/cluster-info (GET)
```

---

## Architecture Pattern

### Environment-Based Configuration
```typescript
// Example from serverConfigRoutes.ts
function buildServerConfig(): ServerConfig {
  const cheNamespace = process.env.CHE_NAMESPACE || 'eclipse-che';
  const editor = process.env.CHE_DEFAULT_EDITOR || undefined;
  
  return {
    cheNamespace,
    defaults: { editor, ... },
    ...
  };
}
```

### Type Safety
All configuration objects are strongly typed using TypeScript interfaces defined in `src/models/ClusterModels.ts`.

### Error Handling
- Returns HTTP 200 with configuration object
- No authentication required (public configuration)
- Falls back to sensible defaults if environment variables are not set

---

## Deployment Recommendations

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: che-server
spec:
  template:
    spec:
      containers:
      - name: che-server
        image: che-server:latest
        env:
        - name: CHE_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: OPENSHIFT_CONSOLE_URL
          value: "https://console-openshift-console.apps.example.com"
        - name: CHE_WORKSPACE_PLUGIN_REGISTRY_URL
          value: "https://eclipse-che.github.io/che-plugin-registry/main/v3"
        # ... additional environment variables
```

### ConfigMap for Complex Configuration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: che-server-config
data:
  CHE_DEFAULT_PLUGINS: '["che-incubator/typescript/latest"]'
  CHE_EXTERNAL_DEVFILE_REGISTRIES: '[{"url": "https://registry.devfile.io"}]'
  CHE_ALLOWED_SOURCE_URLS: "https://github.com,https://gitlab.com"
```

---

## Monitoring & Observability

### Health Check
```bash
curl http://localhost:8080/health
```

### API Documentation
```bash
# Swagger UI
open http://localhost:8080/swagger

# OpenAPI JSON
curl http://localhost:8080/swagger/json
```

### Logging
All endpoints log requests and responses using Pino logger:
```typescript
fastify.log.info('Serving server config');
```

---

## Troubleshooting

### Common Issues

**Issue**: APIs return default values instead of custom configuration  
**Solution**: Verify environment variables are correctly set and exported

**Issue**: Architecture detection returns unexpected value  
**Solution**: Set `CHE_CURRENT_ARCHITECTURE` explicitly

**Issue**: External devfile registries not parsed  
**Solution**: Ensure `CHE_EXTERNAL_DEVFILE_REGISTRIES` is valid JSON array

---

## Future Enhancements

1. **Dynamic Configuration Reload**: Support configuration updates without restart
2. **Configuration Validation**: Add strict validation for environment variables
3. **CheCluster CR Support**: Optional support for reading from Kubernetes CRs
4. **Configuration API**: Add POST endpoints to update configuration dynamically

---

## References

- **Dashboard Backend Source**: `/Users/oleksiiorel/workspace/eclipse-che/che-dashboard/packages/dashboard-backend`
- **API Implementation**: `src/routes/{serverConfig,clusterConfig,clusterInfo}Routes.ts`
- **Type Definitions**: `src/models/ClusterModels.ts`
- **Tests**: `src/routes/__tests__/*Routes.test.ts`

---

**Last Updated**: November 22, 2025  
**Implementation Status**: Phase 1 Complete ✅

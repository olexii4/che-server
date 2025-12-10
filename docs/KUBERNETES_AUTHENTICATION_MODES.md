# Kubernetes Authentication Modes

This document explains how the che-server authenticates with the Kubernetes API in different deployment scenarios.

## Overview

The che-server supports two authentication modes based on the [official Kubernetes documentation](https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/):

1. **In-Cluster Mode** (Production) - Uses service account credentials
2. **Local Mode** (Development) - Uses local kubeconfig

## Mode 1: In-Cluster Authentication (Production)

**Reference**: [Kubernetes - Accessing the API from a Pod](https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/)

### How It Works

When the che-server runs **inside a Kubernetes pod**, Kubernetes automatically mounts service account credentials into the pod at:

```
/var/run/secrets/kubernetes.io/serviceaccount/
├── ca.crt       # Certificate authority bundle
├── namespace    # Default namespace for the service account
└── token        # Service account bearer token
```

### Configuration

```typescript
// src/helpers/KubeConfigProvider.ts
if (!this.isLocalRun) {
  // Load in-cluster configuration
  this.inClusterKubeConfig = new k8s.KubeConfig();
  this.inClusterKubeConfig.loadFromCluster();
}
```

### What Gets Loaded

The `@kubernetes/client-node` library's `loadFromCluster()` method:

1. **API Server URL**: From `KUBERNETES_SERVICE_HOST` and `KUBERNETES_SERVICE_PORT_HTTPS` environment variables
2. **CA Certificate**: From `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`
3. **Service Account Token**: From `/var/run/secrets/kubernetes.io/serviceaccount/token`
4. **Namespace**: From `/var/run/secrets/kubernetes.io/serviceaccount/namespace`

### Example Pod Deployment

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: che-server
  namespace: eclipse-che
spec:
  serviceAccountName: che-server  # Service account with permissions
  containers:
  - name: che-server
    image: che-server:latest
    env:
    - name: LOCAL_RUN
      value: "false"  # Use in-cluster mode
```

### Service Account Permissions

The service account needs appropriate RBAC permissions. Example:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: che-server
  namespace: eclipse-che
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: che-server
rules:
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["list", "get", "create", "patch", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: che-server
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: che-server
subjects:
- kind: ServiceAccount
  name: che-server
  namespace: eclipse-che
```

## Mode 2: Local Kubeconfig (Development)

### How It Works

When running locally (e.g., `yarn dev`), the server uses your local `~/.kube/config` file, just like `kubectl` does.

### Configuration

```bash
# Set LOCAL_RUN=true to use local kubeconfig
export LOCAL_RUN=true
yarn dev
```

Or use the helper script:

```bash
./start-local-dev.sh
```

### What Gets Loaded

```typescript
// src/helpers/KubeConfigProvider.ts
if (this.isLocalRun) {
  const kc = new k8s.KubeConfig();
  let kubeConfigFile = process.env['KUBECONFIG'] || process.env['HOME'] + '/.kube/config';
  kc.loadFromFile(kubeConfigFile);
  return kc;
}
```

### Custom Kubeconfig Location

```bash
export KUBECONFIG=/path/to/custom/kubeconfig
export LOCAL_RUN=true
yarn dev
```

## Request-Based Token Authentication

**Important**: In both modes, the server uses **request tokens** for authentication, not the base cluster configuration.

### How It Works

1. Client sends request with `Authorization: Bearer <user-token>`
2. Server extracts token from request
3. Server creates a **new KubeConfig** with the user's token
4. Server uses this KubeConfig to make Kubernetes API calls

```typescript
// src/routes/namespaceRoutes.ts
fastify.get('/kubernetes/namespace', async (request, reply) => {
  // Extract user token from request
  const userToken = request.subject.token;
  
  // Create KubeConfig with user token
  const userKubeConfig = getKubeConfig(userToken);
  
  // Use user-specific KubeConfig
  const factory = new KubernetesNamespaceFactory(template, userKubeConfig);
  const namespaces = await factory.list();
  
  return namespaces;
});
```

### Why This Matters

This approach ensures proper **multi-tenancy** and **RBAC enforcement**:

- ✅ Each user's Kubernetes permissions are respected
- ✅ Users can only see/create namespaces they have access to
- ✅ Audit logs show the actual user performing actions
- ✅ No privilege escalation through the che-server

## Comparison Table

| Aspect | In-Cluster Mode | Local Mode |
|--------|----------------|------------|
| **When** | Production (pod) | Development (laptop) |
| **Trigger** | `LOCAL_RUN` not set or `false` | `LOCAL_RUN=true` |
| **Base Config** | Service account from `/var/run/secrets/` | Local `~/.kube/config` |
| **CA Certificate** | `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt` | From kubeconfig |
| **API Server** | `https://kubernetes.default.svc` | From kubeconfig |
| **User Auth** | Request token (both modes) | Request token (both modes) |

## Debugging

### Check Current Mode

```bash
# Look for this in logs when server starts
grep "Loaded" server.log

# In-cluster mode:
# "Loaded in-cluster Kubernetes configuration"

# Local mode:
# "KubeConfigProvider: LOCAL_RUN=true, loading from local kubeconfig"
```

### Common Issues

#### Error: "ENOENT: ca.crt not found"

**Cause**: Server is in in-cluster mode but running locally (no service account mounted)

**Fix**: Set `LOCAL_RUN=true`

```bash
LOCAL_RUN=true yarn dev
```

#### Error: "Forbidden: User cannot list namespaces"

**Cause**: User token doesn't have RBAC permissions

**Fix**: See `docs/RBAC_PERMISSIONS.md`

#### Error: "no current context"

**Cause**: Local kubeconfig is missing or invalid

**Fix**: Verify kubeconfig works:

```bash
kubectl config current-context
kubectl cluster-info
```

## Testing Both Modes

### Test Local Mode

```bash
# Start server
LOCAL_RUN=true yarn dev

# Test with your token
TOKEN=$(oc whoami -t)  # or kubectl token
curl -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:8080/api/kubernetes/namespace
```

### Test In-Cluster Mode (requires cluster)

```bash
# Build and deploy
docker build -t che-server:test .
kubectl apply -f deployment.yaml

# Test from within cluster
kubectl exec -it che-server-pod -- \
  curl -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:8080/api/kubernetes/namespace
```

## Best Practices

### Development

1. ✅ **Always use `LOCAL_RUN=true`** when developing locally
2. ✅ Use `./start-local-dev.sh` to ensure correct setup
3. ✅ Test with real Kubernetes tokens to verify RBAC
4. ✅ Document any RBAC permissions needed

### Production

1. ✅ Create dedicated service account with minimal permissions
2. ✅ Use RBAC to limit service account capabilities
3. ✅ Never set `LOCAL_RUN=true` in production
4. ✅ Monitor authentication errors in logs
5. ✅ Use network policies to restrict API server access

## References

- [Kubernetes - Accessing the API from a Pod](https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/)
- [Kubernetes - Authenticating](https://kubernetes.io/docs/reference/access-authn-authz/authentication/)
- [Kubernetes - Service Accounts](https://kubernetes.io/docs/concepts/security/service-accounts/)
- [@kubernetes/client-node Documentation](https://github.com/kubernetes-client/javascript)

## See Also

- `docs/REQUEST_TOKEN_AUTHENTICATION.md` - Request-based authentication pattern
- `docs/RBAC_PERMISSIONS.md` - Required Kubernetes permissions
- `QUICK_START.md` - Local development setup
- `src/helpers/KubeConfigProvider.ts` - Implementation


# Production Environment Variables

This document maps Eclipse Che Java environment variables to the TypeScript/Node.js implementation.

## Environment Variables from Production

Based on the Eclipse Che production deployment on `che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com`.

## OAuth Configuration

### File-Based OAuth Credentials

**Java (Original)**:
```bash
CHE_OAUTH2_GITHUB_CLIENTID__FILEPATH=/che-conf/oauth/github/id
CHE_OAUTH2_GITHUB_CLIENTSECRET__FILEPATH=/che-conf/oauth/github/secret

CHE_OAUTH2_GITLAB_CLIENTID__FILEPATH=/che-conf/oauth/gitlab/id
CHE_OAUTH2_GITLAB_CLIENTSECRET__FILEPATH=/che-conf/oauth/gitlab/secret

CHE_OAUTH2_BITBUCKET_CLIENTID__FILEPATH=/che-conf/oauth/bitbucket/id
CHE_OAUTH2_BITBUCKET_CLIENTSECRET__FILEPATH=/che-conf/oauth/bitbucket/secret

CHE_OAUTH2_AZURE_DEVOPS_CLIENTID__FILEPATH=/che-conf/oauth/azure-devops/id
CHE_OAUTH2_AZURE_DEVOPS_CLIENTSECRET__FILEPATH=/che-conf/oauth/azure-devops/secret
```

**TypeScript (Current Implementation)**:

Our implementation loads OAuth configuration from **Kubernetes Secrets** (see `src/services/OAuthService.ts`):

```typescript
// Reads from Kubernetes Secrets with labels:
// app.kubernetes.io/part-of=che.eclipse.org
// app.kubernetes.io/component=oauth-scm-configuration

await oauthService.loadProvidersFromSecrets();
```

**Kubernetes Secret Format** (matches Java behavior):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: github-oauth-config
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: oauth-scm-configuration
  annotations:
    che.eclipse.org/oauth-scm-server: github
    che.eclipse.org/scm-server-endpoint: https://github.com
type: Opaque
data:
  id: <base64-encoded-client-id>
  secret: <base64-encoded-client-secret>
```

### Integration Endpoints

**Java**:
```bash
CHE_INTEGRATION_GITLAB_OAUTH__ENDPOINT=https://gitlab.com
CHE_INTEGRATION_AZURE_DEVOPS_SERVER__ENDPOINTS=
CHE_INTEGRATION_BITBUCKET_SERVER__ENDPOINTS=
```

**TypeScript**:
```bash
# Read from Secret annotations:
# che.eclipse.org/scm-server-endpoint
```

## Namespace Configuration

### Namespace Template

**Java**:
```bash
CHE_INFRA_KUBERNETES_NAMESPACE_DEFAULT=<username>-che
CHE_INFRA_KUBERNETES_NAMESPACE_CREATION__ALLOWED=true
```

**TypeScript**:
```bash
# env.example
NAMESPACE_TEMPLATE=<username>-che
```

**Implementation** (`src/services/KubernetesNamespaceFactory.ts`):
```typescript
constructor(
  namespaceTemplate: string = process.env.NAMESPACE_TEMPLATE || 'che-<username>',
  kubeConfig?: k8s.KubeConfig
) {
  this.namespaceTemplate = namespaceTemplate;
}
```

**Usage**:
```typescript
const namespaceFactory = new KubernetesNamespaceFactory(
  process.env.NAMESPACE_TEMPLATE || 'che-<username>',
  userKubeConfig
);
```

## API Endpoints

### Public and Internal APIs

**Java**:
```bash
CHE_API=https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api
CHE_API_INTERNAL=http://che-host.dogfooding.svc:8080/api
CHE_HOST=che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com
CHE_PORT=8080
```

**TypeScript**:
```bash
# env.example
CHE_API_ENDPOINT=https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com
PORT=8080
```

**Used in**:
- OAuth callback URL construction
- Factory resolver authentication URLs
- API endpoint references

## Infrastructure Settings

### Platform Detection

**Java**:
```bash
CHE_INFRASTRUCTURE_ACTIVE=openshift
CHE_INFRA_OPENSHIFT_TLS__ENABLED=true
CHE_INFRA_OPENSHIFT_OAUTH__IDENTITY__PROVIDER=openshift-v4
```

**TypeScript**:

Currently auto-detected. Can add environment variable:
```bash
KUBERNETES_PLATFORM=openshift  # or 'kubernetes'
```

### TLS/Certificate Trust

**Java**:
```bash
CHE_INFRA_KUBERNETES_TRUST__CERTS=true
CHE_TRUSTED__CA__BUNDLES__CONFIGMAP=ca-certs-merged
```

**TypeScript**:

Handled by `axiosInstance` and `axiosInstanceNoCert` in SCM resolvers.

For custom CA bundles, can add:
```bash
NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.crt
```

## Authorization & RBAC

### User/Group Authorization

**Java**:
```bash
CHE_INFRA_KUBERNETES_ADVANCED__AUTHORIZATION_ALLOW__GROUPS=che-team-a,che-team-b,che-team-c,che-docs,interns
CHE_INFRA_KUBERNETES_ADVANCED__AUTHORIZATION_DENY__GROUPS=
CHE_INFRA_KUBERNETES_ADVANCED__AUTHORIZATION_ALLOW__USERS=
CHE_INFRA_KUBERNETES_ADVANCED__AUTHORIZATION_DENY__USERS=ibuziuk
```

**TypeScript**:

Not yet implemented. Would be added to namespace provisioning logic:

```typescript
// Future implementation
const allowedGroups = process.env.AUTHORIZATION_ALLOW_GROUPS?.split(',') || [];
const deniedUsers = process.env.AUTHORIZATION_DENY_USERS?.split(',') || [];
```

### Cluster Roles

**Java**:
```bash
CHE_INFRA_KUBERNETES_USER__CLUSTER__ROLES=dogfooding-cheworkspaces-clusterrole, dogfooding-cheworkspaces-devworkspace-clusterrole
```

**TypeScript**:

This defines ClusterRoles to bind to user namespaces. Not yet implemented in TypeScript.

### Service Account

**Java**:
```bash
CHE_INFRA_KUBERNETES_SERVICE__ACCOUNT__NAME=NULL
```

**TypeScript**:

Kubernetes service account is automatically used when running in-cluster (see `docs/KUBERNETES_AUTHENTICATION_MODES.md`).

## Kubernetes Service Discovery

### Auto-Injected by Kubernetes

These are automatically set by Kubernetes when running in a pod:

```bash
KUBERNETES_SERVICE_HOST=172.30.0.1
KUBERNETES_SERVICE_PORT=443
KUBERNETES_SERVICE_PORT_HTTPS=443
KUBERNETES_PORT=tcp://172.30.0.1:443
KUBERNETES_PORT_443_TCP=tcp://172.30.0.1:443
KUBERNETES_PORT_443_TCP_PROTO=tcp
KUBERNETES_PORT_443_TCP_ADDR=172.30.0.1
KUBERNETES_PORT_443_TCP_PORT=443
KUBERNETES_NAMESPACE=dogfooding
```

**TypeScript**:

Automatically used by `@kubernetes/client-node` when calling `loadFromCluster()`.

## Logging & Debugging

**Java**:
```bash
CHE_LOG_LEVEL=TRACE
CHE_LOGS_APPENDERS_IMPL=json
CHE_DEBUG_SERVER=false
```

**TypeScript**:
```bash
LOG_LEVEL=trace
NODE_ENV=production
```

**Implementation** (`src/index.ts`):
```typescript
logger.level = process.env.LOG_LEVEL || 'info';
```

## Complete Environment Variable Mapping

| Java Property | TypeScript Env Var | Default | Notes |
|---------------|-------------------|---------|-------|
| `CHE_OAUTH2_*_CLIENTID__FILEPATH` | N/A | - | Use Kubernetes Secrets instead |
| `CHE_OAUTH2_*_CLIENTSECRET__FILEPATH` | N/A | - | Use Kubernetes Secrets instead |
| `CHE_INFRA_KUBERNETES_NAMESPACE_DEFAULT` | `NAMESPACE_TEMPLATE` | `che-<username>` | Namespace naming pattern |
| `CHE_API` | `CHE_API_ENDPOINT` | - | Public API base URL |
| `CHE_PORT` | `PORT` | `8080` | Server port |
| `CHE_HOST` | `CHE_API_ENDPOINT` | - | Extracted from URL |
| `CHE_LOG_LEVEL` | `LOG_LEVEL` | `info` | Logging level |
| `CHE_INFRASTRUCTURE_ACTIVE` | - | auto-detect | Platform type |
| `CHE_INFRA_KUBERNETES_TRUST__CERTS` | `NODE_EXTRA_CA_CERTS` | - | CA certificate bundle |
| `CHE_INTEGRATION_GITLAB_OAUTH__ENDPOINT` | - | from Secret | GitLab endpoint |
| N/A | `LOCAL_RUN` | `false` | Use local kubeconfig |

## Production Deployment Example

### Kubernetes Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: che-server
  namespace: eclipse-che
spec:
  replicas: 1
  selector:
    matchLabels:
      app: che-server
  template:
    metadata:
      labels:
        app: che-server
    spec:
      serviceAccountName: che-server  # With proper RBAC
      containers:
      - name: che-server
        image: che-server:latest
        ports:
        - containerPort: 8080
          name: http
        env:
        # Core configuration
        - name: PORT
          value: "8080"
        - name: CHE_API_ENDPOINT
          value: "https://che.example.com"
        - name: NAMESPACE_TEMPLATE
          value: "<username>-che"
        
        # Logging
        - name: LOG_LEVEL
          value: "info"
        - name: NODE_ENV
          value: "production"
        
        # Local run should be false or unset in production
        # - name: LOCAL_RUN
        #   value: "false"
        
        # Kubernetes will auto-inject these:
        # KUBERNETES_SERVICE_HOST
        # KUBERNETES_SERVICE_PORT
        # KUBERNETES_NAMESPACE
        
        volumeMounts:
        # Service account token automatically mounted at:
        # /var/run/secrets/kubernetes.io/serviceaccount/
        
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: che-server
  namespace: eclipse-che
spec:
  type: ClusterIP
  ports:
  - port: 8080
    targetPort: 8080
    protocol: TCP
    name: http
  selector:
    app: che-server
```

### Ingress/Route (OpenShift)

```yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: che-server
  namespace: eclipse-che
spec:
  host: che.example.com
  to:
    kind: Service
    name: che-server
  port:
    targetPort: http
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
```

## OAuth Secrets Setup (Production)

Create secrets for each OAuth provider:

```bash
# GitHub
kubectl create secret generic github-oauth-config \
  --from-literal=id=<github-client-id> \
  --from-literal=secret=<github-client-secret> \
  -n eclipse-che

kubectl label secret github-oauth-config \
  app.kubernetes.io/part-of=che.eclipse.org \
  app.kubernetes.io/component=oauth-scm-configuration \
  -n eclipse-che

kubectl annotate secret github-oauth-config \
  che.eclipse.org/oauth-scm-server=github \
  che.eclipse.org/scm-server-endpoint=https://github.com \
  -n eclipse-che

# GitLab
kubectl create secret generic gitlab-oauth-config \
  --from-literal=id=<gitlab-client-id> \
  --from-literal=secret=<gitlab-client-secret> \
  -n eclipse-che

kubectl label secret gitlab-oauth-config \
  app.kubernetes.io/part-of=che.eclipse.org \
  app.kubernetes.io/component=oauth-scm-configuration \
  -n eclipse-che

kubectl annotate secret gitlab-oauth-config \
  che.eclipse.org/oauth-scm-server=gitlab \
  che.eclipse.org/scm-server-endpoint=https://gitlab.com \
  -n eclipse-che

# Bitbucket
kubectl create secret generic bitbucket-oauth-config \
  --from-literal=id=<bitbucket-client-id> \
  --from-literal=secret=<bitbucket-client-secret> \
  -n eclipse-che

kubectl label secret bitbucket-oauth-config \
  app.kubernetes.io/part-of=che.eclipse.org \
  app.kubernetes.io/component=oauth-scm-configuration \
  -n eclipse-che

kubectl annotate secret bitbucket-oauth-config \
  che.eclipse.org/oauth-scm-server=bitbucket \
  che.eclipse.org/scm-server-endpoint=https://bitbucket.org \
  -n eclipse-che

# Azure DevOps
kubectl create secret generic azure-devops-oauth-config \
  --from-literal=id=<azure-devops-client-id> \
  --from-literal=secret=<azure-devops-client-secret> \
  -n eclipse-che

kubectl label secret azure-devops-oauth-config \
  app.kubernetes.io/part-of=che.eclipse.org \
  app.kubernetes.io/component=oauth-scm-configuration \
  -n eclipse-che

kubectl annotate secret azure-devops-oauth-config \
  che.eclipse.org/oauth-scm-server=azure-devops \
  che.eclipse.org/scm-server-endpoint=https://dev.azure.com \
  -n eclipse-che
```

## Testing Production Configuration

### Verify Environment Variables

```bash
# Inside the pod
kubectl exec -it che-server-pod -n eclipse-che -- env | grep -E "(PORT|CHE_|KUBERNETES_)"
```

### Verify OAuth Secrets

```bash
# List OAuth secrets
kubectl get secrets -n eclipse-che \
  -l app.kubernetes.io/part-of=che.eclipse.org \
  -l app.kubernetes.io/component=oauth-scm-configuration

# Check OAuth providers loaded
curl http://localhost:8080/api/oauth
```

### Verify Kubernetes Access

```bash
# Check service account
kubectl get serviceaccount che-server -n eclipse-che

# Check RBAC
kubectl auth can-i list namespaces --as=system:serviceaccount:eclipse-che:che-server

# Test from within pod
kubectl exec -it che-server-pod -n eclipse-che -- \
  curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/kubernetes/namespace
```

## Migration Notes

### From Java to TypeScript

1. **OAuth Configuration**: 
   - Java uses file paths → TypeScript uses Kubernetes Secrets
   - Same data structure, different loading mechanism

2. **Namespace Templates**:
   - Same pattern: `<username>-che`
   - Java: `CHE_INFRA_KUBERNETES_NAMESPACE_DEFAULT`
   - TypeScript: `NAMESPACE_TEMPLATE`

3. **Kubernetes Authentication**:
   - Both use in-cluster service account credentials
   - Both support request token-based RBAC

4. **Not Yet Implemented**:
   - User/group authorization filters
   - Cluster role bindings
   - PVC strategies
   - Workspace exposure strategies
   - Gateway configuration

## See Also

- `docs/KUBERNETES_AUTHENTICATION_MODES.md` - In-cluster authentication
- `docs/OAUTH_IMPLEMENTATION.md` - OAuth secret configuration
- `docs/RBAC_PERMISSIONS.md` - Required permissions
- `env.example` - All environment variables


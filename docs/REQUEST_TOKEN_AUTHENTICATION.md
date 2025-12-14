# Request token authentication (historical) / Current Che Gateway auth notes

## Status

This document was originally written to explore a **request-token** model (dashboard-backend style).

**Current che-server behavior (as deployed today)**:

- **Identity** comes from Che Gateway headers (`gap-auth` and common `x-forwarded-*` identity headers).
- **Kubernetes API operations** are performed using in-cluster credentials (service account kubeconfig).
- **TokenReview is not used** (avoids cluster-wide RBAC requirements).

The rest of this document is kept as **historical/reference material** and does not match current behavior line-by-line.

## Original overview (historical)

This document explains how the che-server TypeScript implementation uses **service account tokens** for Kubernetes API operations, while still using user tokens from incoming HTTP requests for authentication and user identification.

**Updated**: Now uses service account token for all namespace operations (both GET and POST).

**Inspired by**: Eclipse Che Dashboard Backend  
**Pattern**: `packages/dashboard-backend/src/services/kubeclient/`

## Why Request Token Authentication?

### Without Request Tokens (Single Service Account)
```
User A Request → Server → Kubernetes API
                  ↓
              (Service Account Token)
                  ↓
         All users have same permissions
         ❌ No user isolation
         ❌ No RBAC enforcement
```

### With Request Tokens (Multi-Tenant)
```
User A Request (Token: user-a-token) → Server → Kubernetes API
                                         ↓
                                   (User A's Token)
                                         ↓
                               User A's permissions applied
                               ✅ User isolation
                               ✅ RBAC enforced per-user
```

## How It Works

### 1. Request Arrives

```http
POST /api/kubernetes/namespace/provision
Authorization: Bearer user123:johndoe
```

### 2. Authentication Middleware Extracts Token

```typescript
// src/middleware/auth.ts
export async function authenticate(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    request.subject = {
      userId: 'user123',
      userName: 'johndoe',
      token: 'user123:johndoe'  // Stored for Kubernetes auth
    };
  }
}
```

### 3. Route Handler Gets KubeConfig with Service Account Token

```typescript
// src/routes/namespaceRoutes.ts
import { getKubeConfig } from '../helpers/getKubernetesClient';
import { getServiceAccountToken } from '../helpers/getServiceAccountToken';

async function handler(request: FastifyRequest) {
  // Get service account token for cluster operations
  const token = request.subject?.token;
  
  // Create KubeConfig with user's token
  const kubeConfig = getKubeConfig(token);
  
  // Create factory with user's config
  const factory = new KubernetesNamespaceFactory(template, kubeConfig);
  
  // Kubernetes API calls use user's token → RBAC applies!
  const namespaces = await factory.list();
}
```

### 4. KubeConfigProvider Creates User-Specific Config

```typescript
// src/helpers/KubeConfigProvider.ts
export class KubeConfigProvider {
  getKubeConfig(token: string): k8s.KubeConfig {
    // Get base config (in-cluster or local)
    const baseKc = this.getBaseKubeConfig();
    
    // Extract cluster info
    const cluster = baseKc.getCluster(context.cluster);
    
    // Create new user with request token
    const user: k8s.User = {
      name: 'johndoe',
      token: 'user123:johndoe'  // User's token from request
    };
    
    // Build new KubeConfig
    const kubeconfig = new k8s.KubeConfig();
    kubeconfig.addUser(user);
    kubeconfig.addCluster(cluster);
    kubeconfig.addContext({ user: user.name, cluster: cluster.name });
    kubeconfig.setCurrentContext('request-user-context');
    
    return kubeconfig;
  }
}
```

### 5. Kubernetes API Call Uses User's Token

```typescript
// Inside KubernetesNamespaceFactory
async list() {
  // k8sApi was created with user's token
  // This call uses the user's Kubernetes permissions
  const response = await this.k8sApi.listNamespace();
  
  // User only sees namespaces they have access to (RBAC)
  return response.body.items;
}
```

## Deployment Modes

### Production Mode (In-Cluster)

**Environment:**
- Running as a pod in Kubernetes/OpenShift
- `LOCAL_RUN=false` (or not set)

**Base Config:**
- Loads from in-cluster service account
- Gets cluster URL, CA cert from pod mount
- Service account provides cluster info only

**Request Handling:**
1. Request arrives with user token
2. `KubeConfigProvider` gets in-cluster cluster info
3. Creates new KubeConfig with user's token
4. Kubernetes API calls use user's permissions

**Example:**
```bash
# Deploy to Kubernetes
kubectl apply -f deployment.yaml

# Server uses in-cluster config + request tokens
# Each user authenticated via their own token
```

### Local Development Mode

**Environment:**
- Running on developer machine
- `LOCAL_RUN=true`
- `KUBECONFIG=~/.kube/config` (or default)

**Base Config:**
- Loads from local kubeconfig file
- Gets cluster URL, CA cert from kubectl config

**Request Handling:**
1. Request arrives with user token
2. `KubeConfigProvider` gets local cluster info
3. Creates new KubeConfig with user's token
4. Kubernetes API calls use user's permissions

**Example:**
```bash
# Set local run mode
export LOCAL_RUN=true

# Start server
yarn start

# Server uses local kubeconfig + request tokens
```

### Development Testing Mode

**Environment:**
- Running on developer machine  
- `NODE_ENV=development` (set by `./run/start-local-dev.sh`)
- `CLUSTER_ACCESS_TOKEN` set

**Behavior:**
- Uses `CLUSTER_ACCESS_TOKEN` instead of request tokens
- Good for testing without authentication setup
- **Not recommended for multi-user testing**

**Example:**
```bash
# Set cluster token
export CLUSTER_ACCESS_TOKEN=$(oc whoami -t)

# Start dev server
./run/start-local-dev.sh

# All requests use same token (testing only)
```

## Implementation Guide

### For Route Handlers

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify';
import { getKubeConfig } from '../helpers/getKubernetesClient';
import { KubernetesNamespaceFactory } from '../services/KubernetesNamespaceFactory';

export async function registerMyRoute(fastify: FastifyInstance) {
  fastify.get(
    '/my-endpoint',
    {
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply) => {
      // 1. Get user token from request
      const token = request.subject?.token;
      if (!token) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      // 2. Create KubeConfig with user's token
      const kubeConfig = getKubeConfig(token);
      
      // 3. Create service with user's config
      const factory = new KubernetesNamespaceFactory('che-<username>', kubeConfig);
      
      // 4. Make Kubernetes API calls (user's permissions apply)
      const result = await factory.list();
      
      return reply.send(result);
    }
  );
}
```

### For Services

```typescript
import * as k8s from '@kubernetes/client-node';

export class MyKubernetesService {
  private k8sApi: k8s.CoreV1Api;
  
  constructor(kubeConfig: k8s.KubeConfig) {
    // Accept KubeConfig from route handler
    this.k8sApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }
  
  async doSomething() {
    // API calls use the KubeConfig's token
    const response = await this.k8sApi.listNamespace();
    return response.body;
  }
}

// Usage in route:
const kubeConfig = getKubeConfig(request.subject.token);
const service = new MyKubernetesService(kubeConfig);
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `LOCAL_RUN` | Use local kubeconfig instead of in-cluster | No | `false` |
| `KUBECONFIG` | Path to kubeconfig file (when LOCAL_RUN=true) | No | `~/.kube/config` |
| `CLUSTER_ACCESS_TOKEN` | Dev-only token (NODE_ENV=development) | No | - |
| `NODE_ENV` | Environment mode | No | `production` |

## Security Considerations

### ✅ Production (Request Tokens)

- Each user has their own token
- RBAC enforced per-user
- User isolation maintained
- Audit logs show actual users

### ❌ Development Testing (CLUSTER_ACCESS_TOKEN)

- All requests use same token
- No user isolation
- All users have same permissions
- Only for testing/development

### 🔒 Best Practices

1. **Never use CLUSTER_ACCESS_TOKEN in production**
   - Only works when `NODE_ENV=development`
   - Disabled in production for security

2. **Always use request tokens in production**
   - Proper multi-tenancy
   - RBAC enforcement
   - User isolation

3. **Use LOCAL_RUN for local development**
   - Still uses request tokens
   - Connects to remote cluster with local kubeconfig

## Testing

### Unit Tests

```typescript
import { KubeConfigProvider } from '../helpers/KubeConfigProvider';

describe('KubeConfigProvider', () => {
  it('should create KubeConfig with user token', () => {
    const provider = new KubeConfigProvider();
    const token = 'user123:johndoe';
    const kubeConfig = provider.getKubeConfig(token);
    
    // Verify user token is used
    expect(kubeConfig.users[0].token).toBe(token);
  });
});
```

### Integration Tests

```bash
# Start server with LOCAL_RUN
LOCAL_RUN=true yarn start

# Test with user token
curl -H "Authorization: Bearer user123:johndoe" \
  http://localhost:8080/api/kubernetes/namespace/provision
```

## Comparison with Eclipse Che Dashboard Backend

| Feature | Dashboard Backend | che-server |
|---------|-------------------|----------------|
| Request token auth | ✅ | ✅ |
| LOCAL_RUN mode | ✅ | ✅ |
| In-cluster config | ✅ | ✅ |
| Per-request KubeConfig | ✅ | ✅ |
| RBAC enforcement | ✅ | ✅ |
| KubeConfigProvider | ✅ | ✅ |
| Multi-tenancy | ✅ | ✅ |

## References

- **Eclipse Che Dashboard Backend**: https://github.com/eclipse-che/che-dashboard/tree/main/packages/dashboard-backend
- **KubeConfigProvider (Java)**: `packages/dashboard-backend/src/services/kubeclient/kubeConfigProvider.ts`
- **@kubernetes/client-node**: https://github.com/kubernetes-client/javascript
- **Kubernetes RBAC**: https://kubernetes.io/docs/reference/access-authn-authz/rbac/

## Conclusion

Request token authentication enables:

- ✅ **Multi-tenancy**: Each user isolated with their own permissions
- ✅ **RBAC**: Kubernetes enforces access control per-user
- ✅ **Security**: No shared service account for all users
- ✅ **Audit**: Kubernetes logs show actual user actions
- ✅ **Compatibility**: Follows Eclipse Che Dashboard backend pattern

This is the **recommended approach for production deployments** of che-server.


# Kubernetes Client Configuration

## Overview

This guide explains how to configure Kubernetes API clients in the che-server TypeScript implementation. The server uses **request token authentication** following the Eclipse Che Dashboard backend pattern.

**Authentication Modes:**

1. **Production Mode (In-Cluster)** - Uses in-cluster config + request tokens
2. **Local Development Mode** - Uses local kubeconfig + request tokens

Both modes enforce per-user RBAC and multi-tenancy by using tokens from incoming HTTP requests.

## Architecture

The Kubernetes client configuration is provided by multiple helper modules:

### Request Token Authentication

**`src/helpers/KubeConfigProvider.ts`** - Creates KubeConfig with user tokens from requests
- `KubeConfigProvider.getKubeConfig(token)` - Main method for per-request config
- Supports `LOCAL_RUN=true` for local development
- Uses in-cluster config in production

**`src/helpers/getKubernetesClient.ts`** - Convenience helpers
- `getKubernetesClient(token, ApiClass)` - Get API client with user token
- `getKubeConfig(token)` - Get KubeConfig with user token

## Security Model

The server uses **request token authentication** for all Kubernetes API calls:

- **Every request** must include `Authorization: Bearer <token>` header
- **Token extracted** from request → `request.subject.token`
- **KubeConfig created** with user's token for each request
- **RBAC enforced** by Kubernetes based on user's token

This ensures:
- ✅ Multi-tenancy: Each user isolated
- ✅ RBAC: Per-user access control
- ✅ Security: No shared credentials
- ✅ Audit: Kubernetes logs show actual users

## Usage

### For Route Handlers

All route handlers should extract the user token and create a per-request KubeConfig:

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getKubeConfig } from '../helpers/getKubernetesClient';
import { KubernetesNamespaceFactory } from '../services/KubernetesNamespaceFactory';

export async function registerMyRoute(fastify: FastifyInstance) {
  fastify.get(
    '/my-endpoint',
    {
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Extract user token from request
      const token = request.subject?.token;
      if (!token) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      // Create KubeConfig with user's token
      const kubeConfig = getKubeConfig(token);
      
      // Create service with user's config
      const factory = new KubernetesNamespaceFactory('che-<username>', kubeConfig);
      
      // Kubernetes API calls use user's token
      const result = await factory.list();
      
      return reply.send(result);
    }
  );
}
```

### For Services

Services should accept a `KubeConfig` parameter in their constructor:

```typescript
import * as k8s from '@kubernetes/client-node';

export class MyKubernetesService {
  private k8sApi: k8s.CoreV1Api;

  constructor(kubeConfig: k8s.KubeConfig) {
    // Use the provided KubeConfig (with user's token)
    this.k8sApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  async listNamespaces() {
    // API calls use user's token from the KubeConfig
    const response = await this.k8sApi.listNamespace();
    return response.body.items;
  }
}
```

## Development Workflow

### Setting Up Your Local Environment

**Local Development Mode:**

```bash
# Set local run mode
export LOCAL_RUN=true

# Optional: specify kubeconfig path (default: ~/.kube/config)
export KUBECONFIG=~/.kube/config

# Start development server
yarn dev
```

### Testing with Request Tokens

When testing API endpoints, include user token in request headers:

```bash
# Test namespace provisioning
curl -X POST http://localhost:8080/api/kubernetes/namespace/provision \
  -H "Authorization: Bearer user123:johndoe"

# Test namespace list
curl http://localhost:8080/api/kubernetes/namespace \
  -H "Authorization: Bearer user123:johndoe"
```

### Expected Log Output

When a request is processed, you'll see:

```
[DEBUG] Created KubeConfig for user 'johndoe' with cluster 'https://api.your-cluster.com:6443'
```

## How It Works

The `KubeConfigProvider.getKubeConfig(token)` method:

1. **Gets Base Config**: Loads in-cluster or local kubeconfig (cluster info only)
2. **Extracts Cluster Info**: Gets cluster URL, CA cert, etc.
3. **Creates User**: Adds new user with token from request
4. **Creates Context**: Sets up context pointing to user + cluster
5. **Returns Config**: Returns KubeConfig ready for API calls

```typescript
export class KubeConfigProvider {
  getKubeConfig(token: string): k8s.KubeConfig {
    // Get base config (in-cluster or local)
    const baseKc = this.getBaseKubeConfig();
    
    // Extract cluster info
    const currentContext = baseKc.getContextObject(baseKc.getCurrentContext());
    const currentCluster = baseKc.getCluster(currentContext.cluster);
    
    // Create user with request token
    const user: k8s.User = {
      name: 'request-user',
      token: token  // Token from HTTP request header
    };
    
    // Build new config
    const kubeconfig = new k8s.KubeConfig();
    kubeconfig.addUser(user);
    kubeconfig.addCluster(currentCluster);
    kubeconfig.addContext({
      user: user.name,
      cluster: currentCluster.name,
      name: 'request-user-context'
    });
    kubeconfig.setCurrentContext('request-user-context');
    
    return kubeconfig;
  }
}
```

## Production Deployment

In production, the application uses **request token authentication**:

1. **Base Config (In-Cluster)**: When running as a pod
   - Service account provides cluster info only
   - Located at `/var/run/secrets/kubernetes.io/serviceaccount/token`
   - Not used for API calls - only for cluster discovery

2. **User Tokens (from Requests)**: For each API call
   - Token extracted from `Authorization` header
   - New KubeConfig created per-request with user's token
   - Kubernetes API calls use user's token → RBAC enforced

**Production Setup:**

```bash
# Build production bundle
yarn build

# Start in production mode
yarn start
```

**Environment Variables:**
- `LOCAL_RUN=false` (default) - Uses in-cluster config
- Each request MUST include `Authorization: Bearer <token>` header

## Testing

The implementation includes comprehensive tests in `src/helpers/__tests__/KubeConfigProvider.test.ts`:

- ✅ Creates KubeConfig with user token
- ✅ Handles tokens without colon separator
- ✅ Throws error if no current context
- ✅ Throws error if no cluster configured
- ✅ Supports LOCAL_RUN mode detection

Run tests:

```bash
yarn test --testPathPattern="KubeConfigProvider"
```

## Environment Variables

| Variable | Description | Required | Mode |
|----------|-------------|----------|------|
| `NODE_ENV` | Environment mode (`development` or `production`) | Yes | All |
| `KUBECONFIG` | Path to kubeconfig file | No | All |

## Inspiration

This implementation is inspired by:

- **Eclipse Che Dashboard Backend**: `packages/dashboard-backend/src/services/kubeclient/`
- Follows the same pattern for development mode authentication
- Ensures consistency across Eclipse Che TypeScript projects

## References

- **@kubernetes/client-node**: https://github.com/kubernetes-client/javascript
- **Eclipse Che Dashboard**: https://github.com/eclipse-che/che-dashboard
- **Kubernetes API Documentation**: https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.28/

## Examples in This Project

Current implementation:

1. **KubernetesNamespaceFactory** (`src/services/KubernetesNamespaceFactory.ts`)
   - Accepts `kubeConfig` parameter in constructor
   - No default config - MUST be provided with user token

2. **namespaceRoutes** (`src/routes/namespaceRoutes.ts`)
   - Extracts token from `request.subject.token`
   - Calls `getKubeConfig(token)` for each request
   - Creates factory with user-specific config

All services should follow this pattern: accept `KubeConfig` in constructor, use it for API calls.


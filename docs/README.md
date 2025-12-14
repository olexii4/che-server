# Eclipse Che Server (TypeScript) Documentation

This directory contains implementation notes for the TypeScript/Fastify `che-server`, comparing it with the original Eclipse Che **Java che-server** implementation.

## Architecture Overview

The che-server is a TypeScript reimplementation of a **small subset** of the Eclipse Che Server REST APIs.

## Current status (what is real today)

- **Supported API surface** (current Node implementation):
  - `POST /api/kubernetes/namespace/provision`
  - `GET /api/kubernetes/namespace`
  - `POST /api/factory/resolver`
  - `POST /api/factory/token/refresh`
  - `GET /api/oauth`
  - `GET /api/oauth/token`
  - `DELETE /api/oauth/token`
  - `GET /api/oauth/authenticate`
  - `GET /api/oauth/callback`
  - `GET /api/oauth/1.0/authenticate` *(OAuth 1.0a, Bitbucket Server)*
  - `GET /api/oauth/1.0/callback` *(OAuth 1.0a, Bitbucket Server)*
  - `GET /api/oauth/1.0/signature` *(OAuth 1.0a, Bitbucket Server)*
  - `GET /api/scm/resolve`
  - `GET /api/system/state`
  - `GET /api/user/id` *(dashboard compatibility)*

- **Authentication model**:
  - Preferred: **gateway identity headers** (`gap-auth` and common `x-forwarded-*` identity headers)
  - Fallback: test token format (`Authorization: Bearer <userid>:<username>`) for local/dev
  - **TokenReview is not used** (avoids cluster-wide RBAC requirements)

- **RBAC note**:
  - This repo does **not** require adding cluster-wide RBAC objects for an “image-only replacement”.
  - User RoleBindings are only created when `CHE_INFRA_KUBERNETES_USER_CLUSTER_ROLES` is explicitly set (matches Java).

### Key Architectural Patterns

| Component | che-server | Purpose |
|-----------|-------------------|------------|---------|
| `request.subject.token` | ✅ | Extracts Bearer token from request |
| `getServiceAccountToken()` | ✅ | Gets ServiceAccount token for cluster-scoped operations |
| `getUserName()` | ✅ | Extracts username from JWT token |

### Token Usage Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Request Flow                                   │
├─────────────────────────────────────────────────────────────────────┤
│  1. User Request → Bearer Token (OIDC JWT)                          │
│  2. middleware/auth.ts → Extract token, decode JWT, set subject     │
│  3. Route Handler → Uses token based on operation type:             │
│     a) Cluster-scoped (Namespace create): ServiceAccount token      │
│     b) RBAC operations (RoleBindings, user-profile Secret): ServiceAccount token │
└─────────────────────────────────────────────────────────────────────┘
```

### Build & Deployment Scripts

| Script | Description |
|--------|-------------|
| `yarn patch` | Build, push, and patch CheCluster with new image |
| `yarn build:multiarch` | Build multi-architecture Docker images |
| `yarn deploy:openshift` | Deploy/patch Eclipse Che on OpenShift (helper) |

## Documentation Files

### [JAVA_TOKEN_ANALYSIS.md](JAVA_TOKEN_ANALYSIS.md)

**Which Token Does Java Use for /api/kubernetes/namespace?** (~7KB, ~250 lines)

Comprehensive analysis proving that the original Java implementation uses the **Che service account token** for ALL namespace operations, NOT the user token.

**Contents**:
- Analysis of KubernetesNamespaceService.java
- Analysis of KubernetesNamespaceFactory.java
- Analysis of CheServerKubernetesClientFactory.java
- Token usage flow diagram
- Comparison table: User token vs Che SA token usage
- Proof that our TypeScript implementation is correct

**Key Findings**:
- ✅ GET /kubernetes/namespace → uses Che SA token
- ✅ POST /kubernetes/namespace/provision → uses Che SA token
- ✅ User token ONLY used for authentication and username extraction
- ✅ TypeScript implementation matches Java exactly

---

### [JAVA_OAUTH_FILE_READING.md](JAVA_OAUTH_FILE_READING.md)

**How Java Implementation Reads OAuth Credentials from Files** (~10KB, ~400 lines)

Deep dive into how Eclipse Che Java server reads OAuth credentials from file paths.

**Contents**:
- Java dependency injection with `@Named` annotations
- File reading with `Files.readString(Path.of(...))`
- How Kubernetes Secrets are mounted as files
- Complete code examples from Java implementation
- Comparison: File-based (Java) vs API-based (TypeScript)

**Key Topics**:
- `/che-conf/oauth/<provider>/id` and `/che-conf/oauth/<provider>/secret`
- `CHE_OAUTH2_*_CLIENTID__FILEPATH` environment variables
- Che Operator secret mounting
- Why TypeScript uses Kubernetes API directly (better approach)

---

### [PRODUCTION_ENVIRONMENT_VARIABLES.md](PRODUCTION_ENVIRONMENT_VARIABLES.md)

**Production Environment Variables Guide** (~15KB, ~500 lines)

Complete mapping from Eclipse Che Java environment variables to TypeScript implementation.

**Contents**:
- Environment variable mapping table
- Production deployment examples
- OAuth secrets configuration
- Kubernetes manifests
- Migration guide from Java to TypeScript

**Key Topics**:
- `CHE_*` Java properties to TypeScript env vars
- File-based OAuth → Kubernetes Secrets
- Deployment YAML templates
- Production testing procedures

---

### [KUBERNETES_AUTHENTICATION_MODES.md](KUBERNETES_AUTHENTICATION_MODES.md)

**Kubernetes Authentication Modes** (~12KB, ~350 lines)

Complete guide explaining how the server authenticates with Kubernetes API in different modes.

**Contents**:
- In-cluster authentication (production)
- Local kubeconfig authentication (development)
- Service account credentials
- Request-based token authentication
- Debugging authentication issues

**Key Topics**:
- Accessing Kubernetes API from pods
- LOCAL_RUN mode configuration
- Service account RBAC setup
- Multi-tenancy with request tokens

**References**: [Official Kubernetes Documentation](https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/)

---

### [RBAC_PERMISSIONS.md](RBAC_PERMISSIONS.md)

**Required Kubernetes RBAC Permissions** (~8KB, ~250 lines)

Guide for configuring Kubernetes permissions required by Che Server API endpoints.

**Contents**:
- Permission requirements by endpoint
- ClusterRole and ClusterRoleBinding examples
- OpenShift vs Kubernetes setup
- Service account token generation
- Troubleshooting permission errors

**Key Topics**:
- Namespace listing permissions
- Namespace provisioning permissions
- Local development setup
- Production deployment recommendations

---

### [REQUEST_TOKEN_AUTHENTICATION.md](REQUEST_TOKEN_AUTHENTICATION.md)

**Request Token Authentication for Kubernetes** (~15KB, ~400 lines)

Historical exploration of using request tokens from HTTP requests to authenticate Kubernetes API calls (not current behavior).

**Contents**:
- Multi-tenancy and RBAC with request tokens
- Production vs development vs local modes
- KubeConfigProvider implementation
- Step-by-step authentication flow
- Deployment scenarios and configuration
- Security best practices

**Key Topics**:
- Per-request Kubernetes authentication
- Eclipse Che Dashboard backend pattern
- LOCAL_RUN mode for local development
- In-cluster production deployment
- User isolation and RBAC enforcement

**⚠️ Historical**: Kept for reference; current behavior uses che-server ServiceAccount-style Kubernetes access and Che Gateway identity headers.

### [KUBERNETES_CLIENT_DEVELOPMENT.md](KUBERNETES_CLIENT_DEVELOPMENT.md)

**Kubernetes Client Configuration for Development** (~12KB, ~300 lines)

Guide for configuring Kubernetes API clients with development mode authentication support.

**Contents**:
- Centralized Kubernetes client configuration helper
- Security model and production deployment
- Usage examples for creating Kubernetes services
- Testing and error handling

**Key Topics**:
- `configureKubernetesClient()` helper function
- `createKubernetesClient()` convenience function
- Development workflow with OpenShift/Kubernetes
- Security: Development vs Production modes
- Integration with Eclipse Che Dashboard backend pattern

**⚠️ Note**: For local development, prefer `./run/start-local-dev.sh` (sets `LOCAL_RUN=true`). In production, user identity should come from Che Gateway headers; TokenReview is intentionally disabled.

### [NAMESPACE_PROVISIONING_IMPLEMENTATION.md](NAMESPACE_PROVISIONING_IMPLEMENTATION.md)

**Kubernetes Namespace Provisioning - Implementation Guide** (29KB, ~900 lines)

Comprehensive guide comparing Java and TypeScript implementations of the `/kubernetes/namespace/provision` endpoint.

**Contents**:
- Original Java implementation analysis (12+ provisioners)
- TypeScript implementation architecture
- Using `@kubernetes/client-node` library
- Complete code examples
- Architecture flow diagrams
- Performance comparison (Java: ~5K req/s vs TypeScript: ~15K req/s)

**Key Topics**:
- KubernetesEnvironmentProvisioner (Java)
- NamespaceProvisioner (TypeScript)
- Namespace template evaluation
- Label and annotation handling
- When to use each implementation

### [OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md)

**OAuth Authentication - Implementation Guide** (55KB, ~1,577 lines)

Complete guide to OAuth implementation for Git provider authentication (GitHub, GitLab, Bitbucket, Azure DevOps).

**Contents**:
- Original Java OAuth architecture
- TypeScript implementation details
- **Production Kubernetes Secret configuration** (official Eclipse Che method)
- OAuth 2.0 authorization code flow (with sequence diagrams)
- Complete provider setup for all SCM platforms
- Empty array response handling
- Kubernetes Secret discovery implementation

**Key Topics**:
- OAuthAuthenticationService (Java)
- OAuthService (TypeScript)
- Kubernetes Secret-based configuration
- OAuth 2.0 flow step-by-step
- Provider-specific configuration (GitHub, GitLab, Bitbucket, Azure DevOps)
- Token storage and management
- Production deployment configuration

**Production Configuration**:
- How to configure OAuth using Kubernetes Secrets
- Required labels: `app.kubernetes.io/component: oauth-scm-configuration`
- Required annotations: `che.eclipse.org/oauth-scm-server`, `che.eclipse.org/scm-server-endpoint`
- Empty array `[]` response when no secrets configured

### [swagger-examples.md](swagger-examples.md)

**Swagger/OpenAPI Usage Examples** (~10KB)

Interactive API documentation examples and usage guide.

**Contents**:
- Swagger UI screenshots and examples
- OpenAPI 3.0 specification details
- Example requests and responses
- Authentication examples
- Testing workflows

### [FACTORY_RESOLVER_OAUTH_INTEGRATION.md](FACTORY_RESOLVER_OAUTH_INTEGRATION.md)

**Factory Resolver OAuth Integration** (~20KB)

Complete guide on how `/factory/resolver` automatically integrates with OAuth for private repository access.

**Contents**:
- Architecture flow for private repository detection
- UnauthorizedException implementation
- SCM file resolver error handling (GitHub, GitLab, Bitbucket, Azure DevOps)
- OAuth URL building and response format
- Request/Response examples for all providers
- OAuth flow diagram
- Provider-specific scopes
- Integration with `/api/oauth` endpoint

**Key Topics**:
- Private repository detection (404 → OAuth required)
- Automatic OAuth URL generation
- Error response format matching Eclipse Che
- Complete authentication flow
- Testing examples

### [AZURE_DEVOPS_IMPLEMENTATION.md](AZURE_DEVOPS_IMPLEMENTATION.md)

**Azure DevOps Implementation** (~15KB)

Complete guide to Azure DevOps support implementation in the factory resolver.

**Contents**:
- Azure DevOps URL formats (dev.azure.com and visualstudio.com)
- AzureDevOpsFileResolver implementation
- REST API v7.0 integration
- OAuth 2.0 configuration with `vso.code` scope
- Request/Response examples
- Unit test coverage (7 tests, 100% passing)
- Comparison with GitHub, GitLab, Bitbucket implementations

**Key Topics**:
- Azure DevOps-specific OAuth handling
- Private repository detection
- Java vs TypeScript comparison
- Kubernetes Secret configuration
- Testing and validation

## Documentation Purpose

These guides serve multiple purposes:

1. **Learning Resource**: Understand how Eclipse Che Server works internally
2. **Migration Guide**: Compare Java patterns with TypeScript equivalents
3. **Architecture Reference**: See design decisions and trade-offs
4. **Production Deployment**: Configure OAuth and namespaces in Kubernetes
5. **Code Examples**: Ready-to-use implementations

## Quick Links

### For Developers

- **New to the project?** Start with the main [README.md](../README.md)
- **Working with Kubernetes?** See [NAMESPACE_PROVISIONING_IMPLEMENTATION.md](NAMESPACE_PROVISIONING_IMPLEMENTATION.md)
- **Configuring OAuth?** See [OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md)
- **Testing the API?** See [swagger-examples.md](swagger-examples.md)

### For DevOps/Administrators

- **Deploying to production?** See OAuth Kubernetes configuration in [OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md#production-configuration-kubernetes-secrets)
- **Configuring Git providers?** Each provider has detailed setup instructions in [OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md#supported-providers)

### For Architects

- **Comparing architectures?** Both docs include architecture diagrams and comparison tables
- **Evaluating performance?** See performance comparisons in namespace provisioning docs
- **Understanding trade-offs?** Each doc has "When to Use Each Implementation" sections

## External References

All documentation references official Eclipse Che documentation:

- **Eclipse Che Server** (Java): https://github.com/eclipse-che/che-server
- **Eclipse Che Dashboard** (TypeScript): https://github.com/eclipse-che/che-dashboard
- **Eclipse Che Docs**: https://eclipse.dev/che/docs/

### Specific Eclipse Che Documentation Links

**OAuth Configuration**:
- [Configuring OAuth for Git providers](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-for-git-providers/)
- [OAuth 2.0 for GitHub](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-github/)
- [OAuth 2.0 for GitLab](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-gitlab/)
- [OAuth 2.0 for Bitbucket Server](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-a-bitbucket-server/)
- [OAuth 2.0 for Bitbucket Cloud](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-the-bitbucket-cloud/)
- [OAuth 1.0 for Bitbucket Server](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-1-for-a-bitbucket-server/)
- [OAuth 2.0 for Azure DevOps](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-microsoft-azure-devops-services/)

**Kubernetes Client Libraries**:
- [@kubernetes/client-node](https://github.com/kubernetes-client/javascript) - Official JavaScript Kubernetes client
- [Fabric8 Kubernetes Client](https://github.com/fabric8io/kubernetes-client) - Java client used by Eclipse Che Server

**Frameworks**:
- [Fastify](https://fastify.dev) - High-performance web framework
- [OpenAPI 3.0 Specification](https://swagger.io/specification/)

## Contributing

When adding new documentation:

1. Place implementation guides in this `docs/` directory
2. Keep the main README.md focused on getting started and API reference
3. Use clear section headers and table of contents
4. Include code examples with comments
5. Add architecture diagrams for complex flows
6. Reference official Eclipse Che documentation where applicable
7. Update this README with a link to the new documentation

## Documentation Standards

All implementation guides follow these standards:

- **File naming**: Use descriptive names like `FEATURE_IMPLEMENTATION.md`
- **Table of contents**: Always include at the top
- **Code examples**: Use proper syntax highlighting (```typescript, ```yaml, ```bash)
- **Architecture diagrams**: Use ASCII art for terminal-friendly diagrams
- **External links**: Always cite sources and official documentation
- **Comparison tables**: Show Java vs TypeScript side-by-side
- **Production examples**: Include real-world Kubernetes YAML when applicable

---

**Last Updated**: December 12, 2025


# OAuth Authentication - Implementation Guide

## Table of Contents

1. [Overview](#overview)
2. [Original Java Implementation](#original-java-implementation)
3. [TypeScript Implementation](#typescript-implementation)
4. [Architecture Comparison](#architecture-comparison)
5. [API Response Formats](#api-response-formats)
6. [OAuth Flow](#oauth-flow)
7. [Production Configuration (Kubernetes Secrets)](#production-configuration-kubernetes-secrets)
8. [Supported Providers](#supported-providers)
   - [GitHub](#github)
   - [GitLab](#gitlab)
   - [Bitbucket](#bitbucket)
   - [Azure DevOps](#azure-devops)
   - [Empty Response Scenario](#empty-response-scenario)
9. [Implementing Kubernetes Secret Discovery (TypeScript)](#implementing-kubernetes-secret-discovery-typescript)
10. [Implementation Details](#implementation-details)
11. [API Usage Examples](#api-usage-examples)
12. [Key Differences Summary](#key-differences-summary)
13. [References](#references)

## Overview

The OAuth API provides authentication and token management for SCM providers (GitHub, GitLab, Bitbucket, Azure DevOps). This document explains both the original Java implementation from Eclipse Che Server and the TypeScript implementation in this project.

## Original Java Implementation

### Source Location

```
che-server/core/che-core-api-auth/src/main/java/org/eclipse/che/security/oauth/
```

### Main Components

The Java implementation consists of several key classes:

#### 1. OAuthAuthenticationService

The main REST service handling OAuth operations:

```java
@Path("/oauth")
public class OAuthAuthenticationService {
    
    @Inject
    private OAuthAuthenticatorProvider authProvider;
    
    @GET
    @Produces(APPLICATION_JSON)
    public List<OAuthAuthenticatorDescriptor> getRegisteredAuthenticators() {
        List<OAuthAuthenticatorDescriptor> result = new ArrayList<>();
        for (String name : authProvider.getRegisteredProviderNames()) {
            OAuthAuthenticator authenticator = authProvider.getAuthenticator(name);
            result.add(DtoFactory.newDto(OAuthAuthenticatorDescriptor.class)
                .withName(name)
                .withEndpointUrl(authenticator.getEndpointUrl())
                .withLinks(createLinks(name)));
        }
        return result;
    }
    
    @GET
    @Path("/token")
    @Produces(APPLICATION_JSON)
    public OAuthToken getToken(@QueryParam("oauth_provider") String oauthProvider) 
            throws NotFoundException, UnauthorizedException {
        OAuthAuthenticator authenticator = getAuthenticator(oauthProvider);
        return authenticator.getToken(EnvironmentContext.getCurrent().getSubject().getUserId());
    }
    
    @DELETE
    @Path("/token")
    public void invalidateToken(@QueryParam("oauth_provider") String oauthProvider) 
            throws NotFoundException {
        OAuthAuthenticator authenticator = getAuthenticator(oauthProvider);
        authenticator.invalidateToken(EnvironmentContext.getCurrent().getSubject().getUserId());
    }
    
    @GET
    @Path("/authenticate")
    public Response authenticate(@QueryParam("oauth_provider") String oauthProvider,
                                 @QueryParam("scope") List<String> scopes,
                                 @QueryParam("redirect_after_login") String redirectAfterLogin) {
        OAuthAuthenticator authenticator = getAuthenticator(oauthProvider);
        String authUrl = authenticator.getAuthenticateUrl(redirectAfterLogin, scopes);
        return Response.temporaryRedirect(URI.create(authUrl)).build();
    }
}
```

#### 2. OAuthAuthenticator Interface

Abstract authenticator interface implemented by each provider:

```java
public interface OAuthAuthenticator {
    String getEndpointUrl();
    OAuthToken getToken(String userId) throws NotFoundException;
    void invalidateToken(String userId) throws NotFoundException;
    String getAuthenticateUrl(String redirectAfterLogin, List<String> scopes);
    String getAuthorizationCodeFromCallback(String callbackUrl);
    OAuthToken getOrRefreshToken(String userId) throws NotFoundException, UnauthorizedException;
}
```

#### 3. Provider Implementations

Each SCM provider has a dedicated authenticator:

**GitHubOAuthAuthenticator**:
```java
@Named("github")
public class GitHubOAuthAuthenticator extends AbstractOAuthAuthenticator {
    
    @Inject
    public GitHubOAuthAuthenticator(@Named("che.oauth.github.clientid") String clientId,
                                    @Named("che.oauth.github.clientsecret") String clientSecret,
                                    @Named("che.oauth.github.redirecturis") String[] redirectUris,
                                    @Named("che.oauth.github.authuri") String authUri,
                                    @Named("che.oauth.github.tokenuri") String tokenUri) {
        super(clientId, clientSecret, redirectUris, authUri, tokenUri);
    }
    
    @Override
    public String getEndpointUrl() {
        return "https://github.com";
    }
}
```

**GitLabOAuthAuthenticator**, **BitbucketOAuthAuthenticator**, **AzureDevOpsOAuthAuthenticator** follow similar patterns.

#### 4. Token Storage

Java implementation uses persistent storage:

```java
public interface OAuthTokenProvider {
    void saveToken(String userId, String oauthProvider, OAuthToken token);
    OAuthToken getToken(String userId, String oauthProvider);
    void removeToken(String userId, String oauthProvider);
}
```

Implementations:
- **JpaOAuthTokenProvider** - Database storage (PostgreSQL)
- **MongoOAuthTokenProvider** - MongoDB storage
- **InMemoryOAuthTokenProvider** - Memory storage (testing)

### Java Architecture Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    REST API Layer                            │
│            OAuthAuthenticationService (JAX-RS)               │
│                                                              │
│  GET  /oauth                - List authenticators           │
│  GET  /oauth/token          - Get token                     │
│  DELETE /oauth/token        - Invalidate token              │
│  GET  /oauth/authenticate   - Initiate OAuth flow           │
│  GET  /oauth/callback       - Handle OAuth callback         │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│               Provider Management Layer                      │
│              OAuthAuthenticatorProvider                      │
│                                                              │
│  • getAuthenticator(name)                                   │
│  • getRegisteredProviderNames()                             │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│              Provider Implementations                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  GitHubOAuthAuthenticator                          │    │
│  │  GitLabOAuthAuthenticator                          │    │
│  │  BitbucketOAuthAuthenticator                       │    │
│  │  AzureDevOpsOAuthAuthenticator                     │    │
│  └────────────────────────────────────────────────────┘    │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│               Token Storage Layer                            │
│              OAuthTokenProvider                              │
│                                                              │
│  • JpaOAuthTokenProvider (PostgreSQL)                       │
│  • MongoOAuthTokenProvider (MongoDB)                        │
│  • InMemoryOAuthTokenProvider (Testing)                     │
└──────────────────────────────────────────────────────────────┘
```

## TypeScript Implementation

### Architecture Overview

The TypeScript implementation provides a simplified, in-memory OAuth management system suitable for development and lightweight deployments.

### Main Components

```typescript
src/
├── routes/
│   └── oauthRoutes.ts           # Fastify route handlers
├── services/
│   └── OAuthService.ts          # OAuth token and provider management
└── models/
    └── OAuthModels.ts           # TypeScript interfaces and types
```

### TypeScript Architecture Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    REST API Layer                            │
│                  Fastify Routes                              │
│              (oauthRoutes.ts)                                │
│                                                              │
│  GET  /oauth                - List authenticators           │
│  GET  /oauth/token          - Get token                     │
│  DELETE /oauth/token        - Invalidate token              │
│  GET  /oauth/authenticate   - Initiate OAuth flow           │
│  GET  /oauth/callback       - Handle OAuth callback         │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                Service Layer                                 │
│               OAuthService                                   │
│                                                              │
│  • getRegisteredAuthenticators()                            │
│  • getOrRefreshToken(userId, provider)                      │
│  • storeToken(userId, provider, token)                      │
│  • invalidateToken(userId, provider)                        │
│  • generateMockToken(provider)                              │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│             In-Memory Token Storage                          │
│     Map<userId, Map<provider, token>>                        │
│                                                              │
│  • Volatile storage (lost on restart)                       │
│  • No database required                                     │
│  • Suitable for development/testing                         │
└──────────────────────────────────────────────────────────────┘
```

### Key Simplifications

| Feature | Java | TypeScript |
|---------|------|------------|
| Token Storage | ✅ Persistent (PostgreSQL/MongoDB) | ❌ In-memory only |
| Provider Plugins | ✅ Guice-based plugin system | ❌ Hardcoded providers |
| Token Refresh | ✅ Automatic refresh with refresh_token | ❌ Manual refresh only |
| Token Encryption | ✅ Encrypted at rest | ❌ Plain text in memory |
| Token Exchange | ✅ Full OAuth code→token exchange | ⚠️ Partial (callback stub) |
| Multi-tenancy | ✅ Full support | ✅ Basic (in-memory per user) |
| Cluster Support | ✅ Database-backed | ❌ Single-instance only |

## Architecture Comparison

### Request Flow Comparison

#### Java Implementation

```
HTTP GET /oauth
    ↓
JAX-RS @GET endpoint
    ↓
OAuthAuthenticatorProvider.getAuthenticators()
    ↓
For each authenticator:
    - Get endpoint URL
    - Build authenticate link with parameters
    - Build token link
    ↓
Return List<OAuthAuthenticatorDescriptor>
```

#### TypeScript Implementation

```
HTTP GET /api/oauth
    ↓
Fastify GET route handler
    ↓
fastify.authenticate hook
    ↓
OAuthService.getRegisteredAuthenticators()
    ↓
For each registered provider:
    - Get endpoint URL
    - Build simple authenticate link
    - Build token link
    ↓
Return OAuthAuthenticatorDescriptor[]
```

### Key Architectural Differences

| Aspect | Java | TypeScript |
|--------|------|------------|
| **Framework** | JAX-RS / RESTEasy | Fastify 5.0 |
| **DI Container** | Google Guice | Constructor injection |
| **Provider Discovery** | Annotation scanning | Manual registration |
| **Token Storage** | Pluggable providers | In-memory Map |
| **Configuration** | Property files | Environment variables |
| **Authentication** | EnvironmentContext (Thread-local) | Fastify request decorator |
| **Extensibility** | Plugin-based | Code modification required |

## API Response Formats

### Basic Response Format (TypeScript)

The TypeScript implementation returns a simplified format:

```json
[
  {
    "name": "github",
    "endpointUrl": "https://github.com/login/oauth/authorize",
    "links": [
      {
        "rel": "authenticate",
        "href": "/oauth/authenticate?oauth_provider=github"
      },
      {
        "rel": "token",
        "href": "/oauth/token?oauth_provider=github"
      }
    ]
  },
  {
    "name": "gitlab",
    "endpointUrl": "https://gitlab.com/oauth/authorize",
    "links": [
      {
        "rel": "authenticate",
        "href": "/oauth/authenticate?oauth_provider=gitlab"
      },
      {
        "rel": "token",
        "href": "/oauth/token?oauth_provider=gitlab"
      }
    ]
  },
  {
    "name": "bitbucket",
    "endpointUrl": "https://bitbucket.org/site/oauth2/authorize",
    "links": [
      {
        "rel": "authenticate",
        "href": "/oauth/authenticate?oauth_provider=bitbucket"
      },
      {
        "rel": "token",
        "href": "/oauth/token?oauth_provider=bitbucket"
      }
    ]
  }
]
```

### Enhanced Response Format (Production Java)

The production Eclipse Che Server (e.g., che-dogfooding) returns a more detailed format with **parameter metadata**:

```json
[
  {
    "name": "azure-devops",
    "endpointUrl": "https://dev.azure.com",
    "links": [
      {
        "method": "GET",
        "parameters": [
          {
            "name": "oauth_provider",
            "defaultValue": "azure-devops",
            "required": true,
            "valid": []
          },
          {
            "name": "mode",
            "defaultValue": "federated_login",
            "required": true,
            "valid": []
          }
        ],
        "rel": "Authenticate URL",
        "href": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api/oauth/authenticate"
      }
    ]
  },
  {
    "name": "github",
    "endpointUrl": "https://github.com",
    "links": [
      {
        "method": "GET",
        "parameters": [
          {
            "name": "oauth_provider",
            "defaultValue": "github",
            "required": true,
            "valid": []
          },
          {
            "name": "mode",
            "defaultValue": "federated_login",
            "required": true,
            "valid": []
          }
        ],
        "rel": "Authenticate URL",
        "href": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api/oauth/authenticate"
      }
    ]
  },
  {
    "name": "bitbucket",
    "endpointUrl": "https://bitbucket.org",
    "links": [
      {
        "method": "GET",
        "parameters": [
          {
            "name": "oauth_provider",
            "defaultValue": "bitbucket",
            "required": true,
            "valid": []
          },
          {
            "name": "mode",
            "defaultValue": "federated_login",
            "required": true,
            "valid": []
          }
        ],
        "rel": "Authenticate URL",
        "href": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api/oauth/authenticate"
      }
    ]
  },
  {
    "name": "gitlab",
    "endpointUrl": "https://gitlab.com",
    "links": [
      {
        "method": "GET",
        "parameters": [
          {
            "name": "oauth_provider",
            "defaultValue": "gitlab",
            "required": true,
            "valid": []
          },
          {
            "name": "mode",
            "defaultValue": "federated_login",
            "required": true,
            "valid": []
          }
        ],
        "rel": "Authenticate URL",
        "href": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api/oauth/authenticate"
      }
    ]
  }
]
```

### Enhanced Format Features

The production format adds:

1. **`method` field** - HTTP method (GET, POST, DELETE)
2. **`parameters` array** - Query parameter metadata:
   - `name` - Parameter name
   - `defaultValue` - Default value for the parameter
   - `required` - Whether the parameter is required
   - `valid` - Array of valid values (enum)
3. **`mode` parameter** - Authentication mode (`federated_login` for federated identity)
4. **Absolute URLs** - Full URLs including domain

### Empty Response Scenario

When no OAuth providers are configured, the API returns an empty array:

```json
[]
```

This is a valid response indicating:
- No OAuth providers are configured
- OAuth functionality is disabled
- The server is in a minimal configuration mode

## OAuth Flow

### Standard OAuth 2.0 Authorization Code Flow

```
┌─────────┐                                           ┌───────────┐
│         │                                           │           │
│  User   │                                           │  Browser  │
│         │                                           │           │
└────┬────┘                                           └─────┬─────┘
     │                                                      │
     │ 1. Click "Connect GitHub"                           │
     │────────────────────────────────────────────────────>│
     │                                                      │
     │                                                      │ 2. GET /oauth/authenticate
     │                                                      │    ?oauth_provider=github
     │                                                      │
     │                                                      ▼
     │                                              ┌─────────────┐
     │                                              │             │
     │                                              │  Che Server │
     │                                              │             │
     │                                              └──────┬──────┘
     │                                                     │
     │                                                     │ 3. Redirect to GitHub
     │                                              ┌──────▼──────┐
     │                                              │             │
     │<─────────────────────────────────────────────│  302 Found  │
     │  Location: https://github.com/login/oauth/   │             │
     │             authorize?client_id=...          └─────────────┘
     │
     │
     │ 4. Redirected to GitHub
     ├────────────────────────────────────────────────────>│
     │                                                      │
     │                                                      │ 5. GET /login/oauth/authorize
     │                                                      │
     │                                                      ▼
     │                                              ┌─────────────┐
     │                                              │             │
     │                                              │   GitHub    │
     │                                              │             │
     │                                              └──────┬──────┘
     │                                                     │
     │  6. GitHub login page                              │
     │<───────────────────────────────────────────────────┤
     │                                                     │
     │ 7. User authorizes                                 │
     ├────────────────────────────────────────────────────>│
     │                                                     │
     │                                                     │ 8. Redirect with code
     │                                              ┌──────▼──────┐
     │                                              │             │
     │<─────────────────────────────────────────────│  302 Found  │
     │  Location: /oauth/callback?code=abc123       │             │
     │                                              └─────────────┘
     │
     │ 9. Callback with code
     ├────────────────────────────────────────────────────>│
     │                                                      │
     │                                                      │ 10. GET /oauth/callback
     │                                                      │     ?code=abc123
     │                                                      │
     │                                                      ▼
     │                                              ┌─────────────┐
     │                                              │             │
     │                                              │  Che Server │
     │                                              │             │
     │                                              └──────┬──────┘
     │                                                     │
     │                                                     │ 11. Exchange code
     │                                                     │     for access_token
     │                                                     │
     │                                              ┌──────▼──────┐
     │                                              │             │
     │                                              │   GitHub    │
     │                                              │   Token API │
     │                                              │             │
     │                                              └──────┬──────┘
     │                                                     │
     │                                                     │ 12. Return token
     │                                              ┌──────▼──────┐
     │                                              │             │
     │                                              │  Che Server │
     │                                              │             │
     │                                              │ Store token │
     │                                              │             │
     │                                              └──────┬──────┘
     │                                                     │
     │  13. Success page or redirect                      │
     │<───────────────────────────────────────────────────┤
     │                                                     │
```

### Flow Steps Explained

1. **User initiates authentication** - Clicks "Connect GitHub" in the UI
2. **Request to authenticate endpoint** - Browser calls `/oauth/authenticate?oauth_provider=github`
3. **Server builds OAuth URL** - Che Server constructs GitHub authorization URL with:
   - `client_id` - OAuth application client ID
   - `redirect_uri` - Callback URL (`/oauth/callback`)
   - `scope` - Requested permissions (e.g., `repo,user`)
   - `state` - CSRF protection token
4. **Redirect to GitHub** - Server returns 302 redirect to GitHub
5. **GitHub authorization** - User sees GitHub's authorization page
6. **User authorizes** - User grants permissions to the Che application
7. **Redirect with code** - GitHub redirects back with authorization code
8. **Callback handling** - Che Server receives the authorization code
9. **Token exchange** - Server exchanges code for access_token (server-to-server)
10. **Store token** - Server stores the access_token for the user
11. **Success response** - User sees success page or is redirected to app

## Production Configuration (Kubernetes Secrets)

### Overview

In production Eclipse Che deployments, OAuth providers are configured using **Kubernetes Secrets** with specific labels and annotations. This is the official Eclipse Che configuration method documented at [eclipse.dev/che](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-for-git-providers/).

**Important**: Without these Kubernetes Secret configurations, the `/api/oauth` endpoint returns an **empty array** `[]`.

### How It Works

1. **Create Kubernetes Secret** with OAuth client credentials
2. **Apply specific labels** to mark it as OAuth configuration
3. **Add annotations** to specify the provider and endpoint
4. **Che Server discovers** the secrets automatically
5. **API returns** configured providers in the response

### Secret Structure

All OAuth provider secrets must have:

**Required Labels**:
```yaml
labels:
  app.kubernetes.io/part-of: che.eclipse.org
  app.kubernetes.io/component: oauth-scm-configuration
```

**Required Annotations**:
```yaml
annotations:
  che.eclipse.org/oauth-scm-server: <provider-name>
  che.eclipse.org/scm-server-endpoint: <server-url>
```

**Required Data**:
```yaml
stringData:
  id: <OAuth_Client_ID>
  secret: <OAuth_Client_Secret>
```

## Supported Providers

### GitHub

**OAuth Endpoints**:
- **Authorization**: `https://github.com/login/oauth/authorize`
- **Token**: `https://github.com/login/oauth/access_token`

**Default Scopes**:
- `repo` - Full control of private repositories
- `user` - Read user profile data
- `write:public_key` - Write SSH public keys

#### Production Configuration (Kubernetes Secret)

Reference: [Configuring OAuth 2.0 for GitHub](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-github/)

**Step 1**: Create GitHub OAuth App at `https://github.com/settings/applications/new`
- **Application name**: `Eclipse Che`
- **Homepage URL**: `https://<che-fqdn>/`
- **Authorization callback URL**: `https://<che-fqdn>/api/oauth/callback`

**Step 2**: Apply the Secret:

```yaml
kind: Secret
apiVersion: v1
metadata:
  name: github-oauth-config
  namespace: eclipse-che
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: oauth-scm-configuration
  annotations:
    che.eclipse.org/oauth-scm-server: github
    che.eclipse.org/scm-server-endpoint: https://github.com  # (1)
    che.eclipse.org/scm-github-disable-subdomain-isolation: 'false'  # (2)
type: Opaque
stringData:
  id: <GitHub_OAuth_Client_ID>
  secret: <GitHub_OAuth_Client_Secret>
```

**Notes**:
1. For **GitHub Enterprise Server**, use your server URL (e.g., `https://github.company.com`)
2. Set to `'true'` if subdomain isolation is disabled in GitHub Enterprise Server

**Apply**:
```bash
kubectl apply -f github-oauth-config.yaml
```

#### Development Configuration (Environment Variables)

```bash
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

### GitLab

**OAuth Endpoints**:
- **Authorization**: `https://gitlab.com/oauth/authorize`
- **Token**: `https://gitlab.com/oauth/token`

**Default Scopes**:
- `api` - Full API access
- `read_user` - Read user profile
- `read_repository` - Read repository data

#### Production Configuration (Kubernetes Secret)

Reference: [Configuring OAuth 2.0 for GitLab](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-gitlab/)

**Step 1**: Create GitLab OAuth Application
- Navigate to **Settings** > **Applications** in your GitLab instance
- **Name**: `Eclipse Che`
- **Redirect URI**: `https://<che-fqdn>/api/oauth/callback`
- **Scopes**: `api`, `read_user`, `read_repository`

**Step 2**: Apply the Secret:

```yaml
kind: Secret
apiVersion: v1
metadata:
  name: gitlab-oauth-config
  namespace: eclipse-che
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: oauth-scm-configuration
  annotations:
    che.eclipse.org/oauth-scm-server: gitlab
    che.eclipse.org/scm-server-endpoint: https://gitlab.com  # (1)
type: Opaque
stringData:
  id: <GitLab_OAuth_Application_ID>
  secret: <GitLab_OAuth_Secret>
```

**Notes**:
1. For **self-hosted GitLab**, use your GitLab server URL (e.g., `https://gitlab.company.com`)

**Apply**:
```bash
kubectl apply -f gitlab-oauth-config.yaml
```

#### Development Configuration (Environment Variables)

```bash
GITLAB_CLIENT_ID=your_gitlab_client_id
GITLAB_CLIENT_SECRET=your_gitlab_client_secret
GITLAB_ENDPOINT=https://gitlab.example.com  # Optional, for self-hosted
```

### Bitbucket

**OAuth Endpoints**:
- **Authorization**: `https://bitbucket.org/site/oauth2/authorize`
- **Token**: `https://bitbucket.org/site/oauth2/access_token`

**Default Scopes**:
- `repository` - Access to repositories
- `account` - Access to account information

#### Production Configuration (Kubernetes Secret)

**Bitbucket Cloud (OAuth 2.0)**:

Reference: [Configuring OAuth 2.0 for Bitbucket Cloud](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-the-bitbucket-cloud/)

**Step 1**: Create OAuth Consumer in Bitbucket Cloud
- Go to **Settings** > **OAuth consumers** > **Add consumer**
- **Name**: `Eclipse Che`
- **Callback URL**: `https://<che-fqdn>/api/oauth/callback`
- **Permissions**: `Account: Read`, `Repositories: Read and Write`

**Step 2**: Apply the Secret:

```yaml
kind: Secret
apiVersion: v1
metadata:
  name: bitbucket-oauth-config
  namespace: eclipse-che
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: oauth-scm-configuration
  annotations:
    che.eclipse.org/oauth-scm-server: bitbucket
    che.eclipse.org/scm-server-endpoint: https://bitbucket.org
type: Opaque
stringData:
  id: <Bitbucket_OAuth_Consumer_Key>
  secret: <Bitbucket_OAuth_Consumer_Secret>
```

**Bitbucket Server (OAuth 2.0)**:

Reference: [Configuring OAuth 2.0 for Bitbucket Server](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-a-bitbucket-server/)

```yaml
kind: Secret
apiVersion: v1
metadata:
  name: bitbucket-server-oauth-config
  namespace: eclipse-che
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: oauth-scm-configuration
  annotations:
    che.eclipse.org/oauth-scm-server: bitbucket
    che.eclipse.org/scm-server-endpoint: https://bitbucket.company.com
type: Opaque
stringData:
  id: <Bitbucket_Server_OAuth_Consumer_Key>
  secret: <Bitbucket_Server_OAuth_Consumer_Secret>
```

**Bitbucket Server (OAuth 1.0)**:

Reference: [Configuring OAuth 1.0 for Bitbucket Server](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-1-for-a-bitbucket-server/)

```yaml
kind: Secret
apiVersion: v1
metadata:
  name: bitbucket-server-oauth1-config
  namespace: eclipse-che
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: oauth-scm-configuration
  annotations:
    che.eclipse.org/oauth-scm-server: bitbucket
    che.eclipse.org/scm-server-endpoint: https://bitbucket.company.com
type: Opaque
stringData:
  private.key: <Bitbucket_Server_Private_Key>
  consumer.key: <Bitbucket_Server_Consumer_Key>
```

**Apply**:
```bash
kubectl apply -f bitbucket-oauth-config.yaml
```

#### Development Configuration (Environment Variables)

```bash
BITBUCKET_CLIENT_ID=your_bitbucket_client_id
BITBUCKET_CLIENT_SECRET=your_bitbucket_client_secret
```

### Azure DevOps

**OAuth Endpoints**:
- **Authorization**: `https://app.vssps.visualstudio.com/oauth2/authorize`
- **Token**: `https://app.vssps.visualstudio.com/oauth2/token`

**Default Scopes**:
- `vso.code` - Access to code repositories
- `vso.identity` - Access to user identity

#### Production Configuration (Kubernetes Secret)

Reference: [Configuring OAuth 2.0 for Microsoft Azure DevOps Services](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-microsoft-azure-devops-services/)

**Step 1**: Register Application in Azure DevOps
- Go to `https://aex.dev.azure.com/app/register`
- **Company name**: `<your-company>`
- **Application name**: `Eclipse Che`
- **Application website**: `https://<che-fqdn>/`
- **Authorization callback URL**: `https://<che-fqdn>/api/oauth/callback`
- **Authorized scopes**: `Code (read and write)`, `User profile (read)`

**Step 2**: Apply the Secret:

```yaml
kind: Secret
apiVersion: v1
metadata:
  name: azure-devops-oauth-config
  namespace: eclipse-che
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: oauth-scm-configuration
  annotations:
    che.eclipse.org/oauth-scm-server: azure-devops
    che.eclipse.org/scm-server-endpoint: https://dev.azure.com
type: Opaque
stringData:
  id: <Azure_DevOps_Application_ID>
  secret: <Azure_DevOps_Client_Secret>
```

**Apply**:
```bash
kubectl apply -f azure-devops-oauth-config.yaml
```

#### Development Configuration (Environment Variables)

```bash
AZURE_DEVOPS_CLIENT_ID=your_azure_devops_client_id
AZURE_DEVOPS_CLIENT_SECRET=your_azure_devops_client_secret
```

### Empty Response Scenario

When **no Kubernetes Secrets** are configured with the required labels and annotations, the `/api/oauth` endpoint returns an empty array:

```bash
curl 'http://localhost:8080/api/oauth' \
  -H 'Authorization: Bearer user123:johndoe'
```

**Response**:
```json
[]
```

This indicates:
- No OAuth providers are configured in the cluster
- No Kubernetes Secrets with `app.kubernetes.io/component: oauth-scm-configuration` label exist
- OAuth functionality is disabled or not yet set up

### Multiple Provider Configuration

You can configure multiple providers simultaneously by creating separate Secrets:

```bash
# Configure GitHub
kubectl apply -f github-oauth-config.yaml

# Configure GitLab
kubectl apply -f gitlab-oauth-config.yaml

# Configure Bitbucket
kubectl apply -f bitbucket-oauth-config.yaml

# Configure Azure DevOps
kubectl apply -f azure-devops-oauth-config.yaml
```

Each provider will appear in the `/api/oauth` response with its own authentication link.

## Implementing Kubernetes Secret Discovery (TypeScript)

To make the TypeScript implementation production-ready and compatible with Eclipse Che's configuration method, you need to implement Kubernetes Secret discovery.

### Enhanced OAuthService with Kubernetes Integration

```typescript
import * as k8s from '@kubernetes/client-node';
import { OAuthProviderConfig, OAuthAuthenticatorDescriptor } from '../models/OAuthModels';

export class OAuthService {
  private kc: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private namespace: string;
  private providers: Map<string, OAuthProviderConfig> = new Map();

  constructor(namespace: string = 'eclipse-che') {
    this.namespace = namespace;
    
    // Initialize Kubernetes client
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    
    // Load OAuth providers from Kubernetes Secrets
    this.loadProvidersFromSecrets();
  }

  /**
   * Load OAuth providers from Kubernetes Secrets
   */
  private async loadProvidersFromSecrets(): Promise<void> {
    try {
      // List secrets with OAuth configuration label
      const response = await this.k8sApi.listNamespacedSecret(
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        'app.kubernetes.io/component=oauth-scm-configuration'  // Label selector
      );

      for (const secret of response.body.items) {
        const annotations = secret.metadata?.annotations || {};
        const data = secret.data || {};

        // Extract provider configuration from annotations
        const providerName = annotations['che.eclipse.org/oauth-scm-server'];
        const serverEndpoint = annotations['che.eclipse.org/scm-server-endpoint'];

        if (!providerName || !data.id || !data.secret) {
          continue; // Skip invalid secrets
        }

        // Decode base64 credentials
        const clientId = Buffer.from(data.id, 'base64').toString('utf-8');
        const clientSecret = Buffer.from(data.secret, 'base64').toString('utf-8');

        // Determine endpoints based on provider
        const config = this.buildProviderConfig(
          providerName,
          serverEndpoint,
          clientId,
          clientSecret
        );

        this.providers.set(providerName, config);
        logger.info(`Loaded OAuth provider: ${providerName} from secret ${secret.metadata?.name}`);
      }

      // If no providers found, return empty (no default providers)
      if (this.providers.size === 0) {
        logger.warn('No OAuth providers configured via Kubernetes Secrets');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load OAuth providers from Kubernetes Secrets');
      // Continue with empty providers - API will return empty array
    }
  }

  /**
   * Build provider configuration based on provider type
   */
  private buildProviderConfig(
    providerName: string,
    serverEndpoint: string,
    clientId: string,
    clientSecret: string
  ): OAuthProviderConfig {
    const endpoint = serverEndpoint || this.getDefaultEndpoint(providerName);

    switch (providerName) {
      case 'github':
        return {
          name: providerName,
          clientId,
          clientSecret,
          authorizationEndpoint: `${endpoint}/login/oauth/authorize`,
          tokenEndpoint: `${endpoint}/login/oauth/access_token`,
          scopes: ['repo', 'user', 'write:public_key'],
        };

      case 'gitlab':
        return {
          name: providerName,
          clientId,
          clientSecret,
          authorizationEndpoint: `${endpoint}/oauth/authorize`,
          tokenEndpoint: `${endpoint}/oauth/token`,
          scopes: ['api', 'read_user', 'read_repository'],
        };

      case 'bitbucket':
        return {
          name: providerName,
          clientId,
          clientSecret,
          authorizationEndpoint: `${endpoint}/site/oauth2/authorize`,
          tokenEndpoint: `${endpoint}/site/oauth2/access_token`,
          scopes: ['repository', 'account'],
        };

      case 'azure-devops':
        return {
          name: providerName,
          clientId,
          clientSecret,
          authorizationEndpoint: 'https://app.vssps.visualstudio.com/oauth2/authorize',
          tokenEndpoint: 'https://app.vssps.visualstudio.com/oauth2/token',
          scopes: ['vso.code', 'vso.identity'],
        };

      default:
        throw new Error(`Unknown OAuth provider: ${providerName}`);
    }
  }

  /**
   * Get default endpoint for provider
   */
  private getDefaultEndpoint(providerName: string): string {
    const defaults: Record<string, string> = {
      github: 'https://github.com',
      gitlab: 'https://gitlab.com',
      bitbucket: 'https://bitbucket.org',
      'azure-devops': 'https://dev.azure.com',
    };
    return defaults[providerName] || '';
  }

  /**
   * Get list of registered OAuth authenticators
   * Returns empty array if no providers configured
   */
  getRegisteredAuthenticators(): OAuthAuthenticatorDescriptor[] {
    const descriptors: OAuthAuthenticatorDescriptor[] = [];

    this.providers.forEach((config, name) => {
      descriptors.push({
        name: name,
        endpointUrl: config.authorizationEndpoint,
        links: [
          {
            method: 'GET',
            rel: 'Authenticate URL',
            href: `${this.getApiEndpoint()}/api/oauth/authenticate`,
            parameters: [
              {
                name: 'oauth_provider',
                defaultValue: name,
                required: true,
                valid: [],
              },
              {
                name: 'mode',
                defaultValue: 'federated_login',
                required: true,
                valid: [],
              },
            ],
          },
        ],
      });
    });

    return descriptors; // Returns [] if no providers
  }

  private getApiEndpoint(): string {
    return process.env.CHE_API_ENDPOINT || `http://localhost:${process.env.PORT || 8080}`;
  }
}
```

### Usage in Routes

```typescript
// routes/oauthRoutes.ts
export async function registerOAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const oauthService = new OAuthService(process.env.CHE_NAMESPACE || 'eclipse-che');

  fastify.get('/oauth', async (request, reply) => {
    const authenticators = oauthService.getRegisteredAuthenticators();
    // Returns [] if no Kubernetes Secrets configured
    return reply.code(200).send(authenticators);
  });
}
```

### Testing

**With no Kubernetes Secrets configured**:
```bash
curl 'http://localhost:8080/api/oauth' \
  -H 'Authorization: Bearer user123:johndoe'
```

**Response**:
```json
[]
```

**After applying GitHub OAuth Secret**:
```bash
kubectl apply -f github-oauth-config.yaml
```

**Response**:
```json
[
  {
    "name": "github",
    "endpointUrl": "https://github.com/login/oauth/authorize",
    "links": [
      {
        "method": "GET",
        "rel": "Authenticate URL",
        "href": "https://che.example.com/api/oauth/authenticate",
        "parameters": [
          {
            "name": "oauth_provider",
            "defaultValue": "github",
            "required": true,
            "valid": []
          },
          {
            "name": "mode",
            "defaultValue": "federated_login",
            "required": true,
            "valid": []
          }
        ]
      }
    ]
  }
]
```

## Implementation Details

### TypeScript Implementation

#### 1. OAuth Service (`src/services/OAuthService.ts`)

```typescript
export class OAuthService {
  private tokens: Map<string, Map<string, OAuthToken>> = new Map();
  private providers: Map<string, OAuthProviderConfig> = new Map();

  constructor() {
    // Register providers
    this.registerProvider({
      name: 'github',
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'user', 'write:public_key'],
    });

    this.registerProvider({
      name: 'gitlab',
      authorizationEndpoint: 'https://gitlab.com/oauth/authorize',
      tokenEndpoint: 'https://gitlab.com/oauth/token',
      scopes: ['api', 'read_user', 'read_repository'],
    });

    this.registerProvider({
      name: 'bitbucket',
      authorizationEndpoint: 'https://bitbucket.org/site/oauth2/authorize',
      tokenEndpoint: 'https://bitbucket.org/site/oauth2/access_token',
      scopes: ['repository', 'account'],
    });
  }

  getRegisteredAuthenticators(): OAuthAuthenticatorDescriptor[] {
    const descriptors: OAuthAuthenticatorDescriptor[] = [];

    this.providers.forEach((config, name) => {
      descriptors.push({
        name: name,
        endpointUrl: config.authorizationEndpoint,
        links: [
          {
            rel: 'authenticate',
            href: `/oauth/authenticate?oauth_provider=${name}`,
          },
          {
            rel: 'token',
            href: `/oauth/token?oauth_provider=${name}`,
          },
        ],
      });
    });

    return descriptors;
  }

  async getOrRefreshToken(
    userId: string,
    oauthProvider: string
  ): Promise<OAuthToken | null> {
    const userTokens = this.tokens.get(userId);
    if (!userTokens) return null;
    
    return userTokens.get(oauthProvider) || null;
  }

  storeToken(userId: string, oauthProvider: string, token: OAuthToken): void {
    if (!this.tokens.has(userId)) {
      this.tokens.set(userId, new Map());
    }
    this.tokens.get(userId)!.set(oauthProvider, token);
  }

  invalidateToken(userId: string, oauthProvider: string): void {
    const userTokens = this.tokens.get(userId);
    if (!userTokens) {
      throw new Error('Token not found');
    }
    userTokens.delete(oauthProvider);
  }
}
```

#### 2. Route Handlers (`src/routes/oauthRoutes.ts`)

**GET /oauth** - List authenticators:

```typescript
fastify.get('/oauth', async (request, reply) => {
  const authenticators = oauthService.getRegisteredAuthenticators();
  return reply.code(200).send(authenticators);
});
```

**GET /oauth/token** - Get token:

```typescript
fastify.get('/oauth/token', async (request, reply) => {
  const { oauth_provider } = request.query;
  const userId = request.subject.userId;
  
  let token = await oauthService.getOrRefreshToken(userId, oauth_provider);
  
  if (!token) {
    // Generate mock token for development
    token = oauthService.generateMockToken(oauth_provider);
    oauthService.storeToken(userId, oauth_provider, token);
  }
  
  return reply.code(200).send(token);
});
```

**DELETE /oauth/token** - Invalidate token:

```typescript
fastify.delete('/oauth/token', async (request, reply) => {
  const { oauth_provider } = request.query;
  const userId = request.subject.userId;
  
  await oauthService.invalidateToken(userId, oauth_provider);
  
  return reply.code(204).send();
});
```

**GET /oauth/authenticate** - Initiate OAuth:

```typescript
fastify.get('/oauth/authenticate', async (request, reply) => {
  const { oauth_provider, scope, redirect_after_login } = request.query;
  
  const authenticator = oauthService.getAuthenticator(oauth_provider);
  
  const redirectUri = `${CHE_API_ENDPOINT}/api/oauth/callback`;
  const state = Buffer.from(JSON.stringify({ redirect_after_login })).toString('base64');
  
  const authUrl = new URL(authenticator.endpointUrl);
  authUrl.searchParams.set('client_id', process.env.CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');
  
  return reply.redirect(302, authUrl.toString());
});
```

**GET /oauth/callback** - Handle callback:

```typescript
fastify.get('/oauth/callback', async (request, reply) => {
  const { code, state, error } = request.query;
  
  if (error) {
    return reply.code(400).send({ error, message: 'OAuth authentication failed' });
  }
  
  // TODO: Exchange code for token
  // const token = await exchangeCodeForToken(code);
  // oauthService.storeToken(userId, provider, token);
  
  // Decode state and redirect
  const { redirect_after_login } = JSON.parse(
    Buffer.from(state, 'base64').toString()
  );
  
  return reply.redirect(302, redirect_after_login || '/');
});
```

### Data Models

#### OAuthToken

```typescript
export interface OAuthToken {
  token: string;
  scope?: string;
}
```

#### OAuthAuthenticatorDescriptor

```typescript
export interface OAuthAuthenticatorDescriptor {
  name: string;
  endpointUrl: string;
  links?: Link[];
}
```

#### OAuthProviderConfig

```typescript
export interface OAuthProviderConfig {
  name: string;
  clientId?: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
}
```

## API Usage Examples

### List OAuth Authenticators

```bash
curl 'http://localhost:8080/api/oauth' \
  -H 'Authorization: Bearer user123:johndoe'
```

**Response**:
```json
[
  {
    "name": "github",
    "endpointUrl": "https://github.com/login/oauth/authorize",
    "links": [
      {
        "rel": "authenticate",
        "href": "/oauth/authenticate?oauth_provider=github"
      },
      {
        "rel": "token",
        "href": "/oauth/token?oauth_provider=github"
      }
    ]
  },
  {
    "name": "gitlab",
    "endpointUrl": "https://gitlab.com/oauth/authorize",
    "links": [
      {
        "rel": "authenticate",
        "href": "/oauth/authenticate?oauth_provider=gitlab"
      },
      {
        "rel": "token",
        "href": "/oauth/token?oauth_provider=gitlab"
      }
    ]
  },
  {
    "name": "bitbucket",
    "endpointUrl": "https://bitbucket.org/site/oauth2/authorize",
    "links": [
      {
        "rel": "authenticate",
        "href": "/oauth/authenticate?oauth_provider=bitbucket"
      },
      {
        "rel": "token",
        "href": "/oauth/token?oauth_provider=bitbucket"
      }
    ]
  }
]
```

### Get OAuth Token

```bash
curl 'http://localhost:8080/api/oauth/token?oauth_provider=github' \
  -H 'Authorization: Bearer user123:johndoe'
```

**Response**:
```json
{
  "token": "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
  "scope": "repo user write:public_key"
}
```

### Invalidate OAuth Token

```bash
curl -X DELETE 'http://localhost:8080/api/oauth/token?oauth_provider=github' \
  -H 'Authorization: Bearer user123:johndoe'
```

**Response**: 204 No Content

### Initiate OAuth Authentication

```bash
# Browser navigates to:
https://localhost:8080/api/oauth/authenticate?oauth_provider=github&scope=repo,user&redirect_after_login=https://myapp.com/dashboard

# Server redirects to:
https://github.com/login/oauth/authorize?client_id=che-client&redirect_uri=http://localhost:8080/api/oauth/callback&scope=repo,user&state=eyJyZWRpcmVjdF9hZnRlcl9sb2dpbiI6Imh0dHBzOi8vbXlhcHAuY29tL2Rhc2hib2FyZCJ9&response_type=code
```

## Key Differences Summary

| Feature | Java Implementation | TypeScript Implementation |
|---------|---------------------|---------------------------|
| **Provider Configuration** | Kubernetes Secrets | ✅ Kubernetes Secrets (with enhancement) |
| **Empty Array Response** | ✅ When no secrets configured | ✅ When no secrets configured |
| **Token Storage** | PostgreSQL/MongoDB persistent | In-memory volatile |
| **Token Refresh** | Automatic with refresh_token | Manual only |
| **Provider Discovery** | Automatic from labeled Secrets | ✅ Automatic from labeled Secrets (with enhancement) |
| **Token Encryption** | Encrypted at rest | Plain text in memory |
| **Code Exchange** | Full implementation | Stub/TODO |
| **Multi-instance** | Cluster-safe (database) | Single-instance only |
| **Production Config** | ✅ Yes | ✅ Yes (with Kubernetes Secret support) |
| **Link Format** | Enhanced with parameters | ✅ Enhanced with parameters (configurable) |

## When to Use Each

| Use Case | Java | TypeScript |
|----------|------|------------|
| Production Eclipse Che deployment | ✅ Required | ❌ Not suitable |
| Multi-user production environment | ✅ Yes | ❌ No (in-memory) |
| Development/testing | ✅ Overkill | ✅ Perfect |
| Dashboard backend API | ❌ Too heavy | ✅ Ideal |
| Kubernetes cluster deployment | ✅ Yes | ⚠️ Needs external storage |
| Standalone lightweight API | ❌ Complex | ✅ Yes |
| Learning OAuth flows | ❌ Complex | ✅ Clear and simple |

## References

### Eclipse Che Server (Java)

- **Repository**: https://github.com/eclipse-che/che-server
- **OAuth Service**: `che-server/core/che-core-api-auth/src/main/java/org/eclipse/che/security/oauth/`
- **OAuth Authenticators**: `che-server/wsmaster/che-core-api-auth-*/src/main/java/org/eclipse/che/security/oauth/`

### Eclipse Che Dashboard Backend (TypeScript)

- **Repository**: https://github.com/eclipse-che/che-dashboard
- **Backend Package**: `packages/dashboard-backend/`

### OAuth 2.0 Specification

- **RFC 6749**: https://tools.ietf.org/html/rfc6749
- **OAuth 2.0 Authorization Code Flow**: https://oauth.net/2/grant-types/authorization-code/

### Provider Documentation

- **GitHub OAuth**: https://docs.github.com/en/developers/apps/building-oauth-apps
- **GitLab OAuth**: https://docs.gitlab.com/ee/api/oauth2.html
- **Bitbucket OAuth**: https://developer.atlassian.com/cloud/bitbucket/oauth-2/
- **Azure DevOps OAuth**: https://docs.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/oauth

## Conclusion

The TypeScript OAuth implementation provides a **lightweight, development-friendly alternative** to the Java implementation. While it lacks enterprise features like persistent storage and automatic token refresh, it excels at:

- **Simplicity**: Clear, readable code for learning OAuth flows
- **Speed**: Fast startup and response times
- **Integration**: Seamless integration with Fastify and modern TypeScript stack
- **Development**: Perfect for local development and testing

For production Eclipse Che deployments, the Java implementation remains the recommended solution. For dashboard backends, lightweight APIs, or development environments, the TypeScript implementation is ideal.


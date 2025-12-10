# Factory Resolver OAuth Integration

## Overview

The `/factory/resolver` endpoint automatically integrates with OAuth configuration to handle private repositories. When a user tries to resolve a private repository without proper authentication, the server returns a **401 Unauthorized** response with OAuth authentication details.

## How It Works

### Architecture Flow

```
User Request (Private Repo)
    ↓
POST /factory/resolver
    {
      "url": "https://oorel@bitbucket.org/oorel/oorel1.git"
    }
    ↓
FactoryService.resolveFactory()
    ↓
ScmRepositoryFactoryResolver
    ↓
BitbucketFileResolver.fileContent()
    ↓
Attempt to fetch devfile (HTTP GET)
    ↓
Response: 404 Not Found (private repo)
    ↓
No Authorization Header Present
    ↓
Throw UnauthorizedException
    ↓
401 Response with OAuth Details
```

## Implementation Details

### 1. UnauthorizedException Model

Location: `src/models/UnauthorizedException.ts`

```typescript
export class UnauthorizedException extends Error {
  public readonly statusCode: number = 401;
  public readonly oauthProvider: string;
  public readonly oauthVersion: string;
  public readonly authenticateUrl: string;

  constructor(
    message: string,
    oauthProvider: string,
    oauthVersion: string = '2.0',
    authenticateUrl: string
  ) {
    super(message);
    this.name = 'UnauthorizedException';
    this.oauthProvider = oauthProvider;
    this.oauthVersion = oauthVersion;
    this.authenticateUrl = authenticateUrl;
  }

  toJSON() {
    return {
      errorCode: this.statusCode,
      message: this.message,
      attributes: {
        oauth_provider: this.oauthProvider,
        oauth_version: this.oauthVersion,
        oauth_authentication_url: this.authenticateUrl,
      },
    };
  }
}
```

### 2. OAuth URL Builder

```typescript
export function buildOAuthAuthenticateUrl(
  apiEndpoint: string,
  oauthProvider: string,
  scope: string = 'repository',
  requestMethod: string = 'POST',
  signatureMethod: string = 'rsa'
): string {
  const params = new URLSearchParams({
    oauth_provider: oauthProvider,
    scope,
    request_method: requestMethod,
    signature_method: signatureMethod,
  });

  const baseUrl = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
  return `${baseUrl}/api/oauth/authenticate?${params.toString()}`;
}
```

### 3. SCM File Resolver Error Handling

All SCM file resolvers (GitHub, GitLab, Bitbucket) implement authentication error detection:

#### GitHub File Resolver

```typescript
if (axiosResponse.status === 404) {
  if (!authorization) {
    const oauthProvider = 'github';
    const authenticateUrl = buildOAuthAuthenticateUrl(
      process.env.CHE_API_ENDPOINT || 'http://localhost:8080',
      oauthProvider,
      'repo',        // GitHub scope
      'POST',
      'rsa'
    );
    throw new UnauthorizedException(
      'SCM Authentication required',
      oauthProvider,
      '2.0',
      authenticateUrl
    );
  }
}
```

#### GitLab File Resolver

```typescript
if (axiosResponse.status === 404) {
  if (!authorization) {
    const oauthProvider = 'gitlab';
    const authenticateUrl = buildOAuthAuthenticateUrl(
      process.env.CHE_API_ENDPOINT || 'http://localhost:8080',
      oauthProvider,
      'api write_repository',  // GitLab scope
      'POST',
      'rsa'
    );
    throw new UnauthorizedException(
      'SCM Authentication required',
      oauthProvider,
      '2.0',
      authenticateUrl
    );
  }
}
```

#### Bitbucket File Resolver

```typescript
// Handle 401/403 (authentication required)
if (isAuthenticationError(axiosResponse.status)) {
  if (!authorization) {
    const oauthProvider = 'bitbucket';
    const authenticateUrl = buildOAuthAuthenticateUrl(
      this.apiEndpoint,
      oauthProvider,
      'repository',  // Bitbucket scope
      'POST',
      'rsa'
    );
    throw new UnauthorizedException(
      'SCM Authentication required',
      oauthProvider,
      '2.0',
      authenticateUrl
    );
  }
}

// Handle 404 (might be private repo)
if (axiosResponse.status === 404) {
  if (!authorization) {
    // Bitbucket returns 404 for private repos (security: don't reveal existence)
    const oauthProvider = 'bitbucket';
    const authenticateUrl = buildOAuthAuthenticateUrl(
      this.apiEndpoint,
      oauthProvider,
      'repository',
      'POST',
      'rsa'
    );
    throw new UnauthorizedException(
      'SCM Authentication required',
      oauthProvider,
      '2.0',
      authenticateUrl
    );
  }
}
```

#### Azure DevOps File Resolver

```typescript
// Handle 401/403 (authentication required)
if (isAuthenticationError(axiosResponse.status)) {
  if (!authorization) {
    const oauthProvider = 'azure-devops';
    const authenticateUrl = buildOAuthAuthenticateUrl(
      this.apiEndpoint,
      oauthProvider,
      'vso.code',  // Azure DevOps scope
      'POST',
      'rsa'
    );
    throw new UnauthorizedException(
      'SCM Authentication required',
      oauthProvider,
      '2.0',
      authenticateUrl
    );
  }
}

// Handle 404 (might be private repo)
if (axiosResponse.status === 404) {
  if (!authorization) {
    // Azure DevOps returns 404 for private repos (similar to Bitbucket)
    const oauthProvider = 'azure-devops';
    const authenticateUrl = buildOAuthAuthenticateUrl(
      this.apiEndpoint,
      oauthProvider,
      'vso.code',
      'POST',
      'rsa'
    );
    throw new UnauthorizedException(
      'SCM Authentication required',
      oauthProvider,
      '2.0',
      authenticateUrl
    );
  }
}
```

### 4. Route Handler

Location: `src/routes/factoryRoutes.ts`

```typescript
fastify.post('/factory/resolver', async (request, reply) => {
  try {
    const parameters = request.body || {};
    
    // Pass Authorization header for private repository access
    const authorizationHeader = request.headers.authorization;
    if (authorizationHeader) {
      parameters.authorization = authorizationHeader;
    }

    const factory = await factoryService.resolveFactory(parameters);
    return reply.code(200).send(factory);
    
  } catch (error) {
    // Check for UnauthorizedException (OAuth authentication required)
    if (error instanceof UnauthorizedException) {
      return reply.code(401).send(error.toJSON());
    }
    
    // Other error handling...
  }
});
```

## Request/Response Examples

### Example 1: Private Bitbucket Repository

**Request**:
```bash
POST /api/factory/resolver
Content-Type: application/json

{
  "url": "https://oorel@bitbucket.org/oorel/oorel1.git"
}
```

**Response** (401 Unauthorized):
```json
{
  "errorCode": 401,
  "message": "SCM Authentication required",
  "attributes": {
    "oauth_provider": "bitbucket",
    "oauth_version": "2.0",
    "oauth_authentication_url": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api/oauth/authenticate?oauth_provider=bitbucket&scope=repository&request_method=POST&signature_method=rsa"
  }
}
```

### Example 2: Private GitHub Repository

**Request**:
```bash
POST /api/factory/resolver
Content-Type: application/json

{
  "url": "https://github.com/user/private-repo.git"
}
```

**Response** (401 Unauthorized):
```json
{
  "errorCode": 401,
  "message": "SCM Authentication required",
  "attributes": {
    "oauth_provider": "github",
    "oauth_version": "2.0",
    "oauth_authentication_url": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api/oauth/authenticate?oauth_provider=github&scope=repo&request_method=POST&signature_method=rsa"
  }
}
```

### Example 3: Private GitLab Repository

**Request**:
```bash
POST /api/factory/resolver
Content-Type: application/json

{
  "url": "https://gitlab.com/user/private-project.git"
}
```

**Response** (401 Unauthorized):
```json
{
  "errorCode": 401,
  "message": "SCM Authentication required",
  "attributes": {
    "oauth_provider": "gitlab",
    "oauth_version": "2.0",
    "oauth_authentication_url": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api/oauth/authenticate?oauth_provider=gitlab&scope=api write_repository&request_method=POST&signature_method=rsa"
  }
}
```

### Example 4: Private Azure DevOps Repository

**Request**:
```bash
POST /api/factory/resolver
Content-Type: application/json

{
  "url": "https://dev.azure.com/organization/project/_git/repository"
}
```

**Response** (401 Unauthorized):
```json
{
  "errorCode": 401,
  "message": "SCM Authentication required",
  "attributes": {
    "oauth_provider": "azure-devops",
    "oauth_version": "2.0",
    "oauth_authentication_url": "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/api/oauth/authenticate?oauth_provider=azure-devops&scope=vso.code&request_method=POST&signature_method=rsa"
  }
}
```

### Example 5: With OAuth Token (Authenticated)

**Request**:
```bash
POST /api/factory/resolver
Content-Type: application/json
Authorization: Bearer ghp_xxxxxxxxxxxxxxxxxxxx

{
  "url": "https://github.com/user/private-repo.git"
}
```

**Response** (200 OK):
```json
{
  "v": "4.0",
  "source": "devfile.yaml",
  "devfile": {
    "schemaVersion": "2.1.0",
    "metadata": {
      "name": "private-repo"
    }
  },
  "scm_info": {
    "clone_url": "https://github.com/user/private-repo.git",
    "scm_provider": "github"
  },
  "links": [...]
}
```

## Integration with OAuth Configuration

The OAuth authentication URL returned in the error response matches the format from `/api/oauth` endpoint:

### OAuth Configuration Response

```json
[
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
  }
]
```

### Consistency

Both endpoints use the same base OAuth authentication URL, ensuring a consistent authentication flow:

1. **Factory Resolver** returns: `https://che.../api/oauth/authenticate?oauth_provider=bitbucket&scope=repository&...`
2. **OAuth Endpoint** returns: `https://che.../api/oauth/authenticate` (with parameters in metadata)

## OAuth Flow

```
┌──────────┐
│  Client  │
└────┬─────┘
     │
     │ 1. POST /factory/resolver
     │    { "url": "https://bitbucket.org/user/private.git" }
     ├─────────────────────────────────────────────────────>
     │                                                      ┌──────────────┐
     │                                                      │  Che Server  │
     │                                                      └──────┬───────┘
     │                                                             │
     │                                       2. Try fetch devfile  │
     │                                          (no auth)          │
     │                                                             ▼
     │                                                      ┌──────────────┐
     │                                                      │  Bitbucket   │
     │                                                      │     API      │
     │                                                      └──────┬───────┘
     │                                                             │
     │                                       3. 404 Not Found      │
     │                                          (private repo)     │
     │                                                             ▼
     │                                                      ┌──────────────┐
     │                                                      │  Che Server  │
     │                                                      │              │
     │                                                      │ Throw        │
     │                                                      │ Unauthorized │
     │                                                      │ Exception    │
     │                                                      └──────┬───────┘
     │                                                             │
     │ 4. 401 Unauthorized with OAuth URL                         │
     │<───────────────────────────────────────────────────────────┤
     │    {
     │      "errorCode": 401,
     │      "attributes": {
     │        "oauth_authentication_url": "..."
     │      }
     │    }
     │
     │ 5. Redirect user to OAuth URL
     ├────────────────────────────────>
     │                                 ┌──────────────┐
     │                                 │   Browser    │
     │                                 │  redirects   │
     │                                 │  to OAuth    │
     │                                 └──────┬───────┘
     │                                        │
     │ 6. OAuth authentication flow           │
     │    (see OAUTH_IMPLEMENTATION.md)       │
     │                                        │
     │ 7. OAuth token obtained                │
     │<───────────────────────────────────────┤
     │
     │ 8. Retry POST /factory/resolver with token
     │    Authorization: Bearer <token>
     ├─────────────────────────────────────────────────────>
     │                                                      ┌──────────────┐
     │                                                      │  Che Server  │
     │                                                      └──────┬───────┘
     │                                                             │
     │                                       9. Fetch devfile      │
     │                                          with auth          │
     │                                                             ▼
     │                                                      ┌──────────────┐
     │                                                      │  Bitbucket   │
     │                                                      │     API      │
     │                                                      └──────┬───────┘
     │                                                             │
     │                                       10. 200 OK + content  │
     │                                                             ▼
     │ 11. 200 OK with factory data                               │
     │<───────────────────────────────────────────────────────────┤
     │    { "devfile": {...}, "scm_info": {...} }
     │
```

## Provider-Specific Scopes

Each SCM provider requests appropriate OAuth scopes:

| Provider | Scope | Purpose |
|----------|-------|---------|
| **GitHub** | `repo` | Full control of private repositories |
| **GitLab** | `api write_repository` | Full API access and repository write |
| **Bitbucket** | `repository` | Read and write access to repositories |
| **Azure DevOps** | `vso.code` | Access to code repositories and Git operations |

## Testing

### Test Private Repository (No Auth)

```bash
curl -X POST 'http://localhost:8080/api/factory/resolver' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://oorel@bitbucket.org/oorel/oorel1.git"
  }'
```

**Expected Response**:
```json
{
  "errorCode": 401,
  "message": "SCM Authentication required",
  "attributes": {
    "oauth_provider": "bitbucket",
    "oauth_version": "2.0",
    "oauth_authentication_url": "http://localhost:8080/api/oauth/authenticate?oauth_provider=bitbucket&scope=repository&request_method=POST&signature_method=rsa"
  }
}
```

### Test Private Repository (With Auth)

```bash
curl -X POST 'http://localhost:8080/api/factory/resolver' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your_bitbucket_token>' \
  -d '{
    "url": "https://oorel@bitbucket.org/oorel/oorel1.git"
  }'
```

**Expected Response**: Factory with devfile data (200 OK)

## Java Implementation Reference

This functionality is based on the Java implementation:

- **ScmUnauthorizedException**: `org.eclipse.che.api.factory.server.scm.exception.ScmUnauthorizedException`
- **PersonalAccessTokenFetcher**: `org.eclipse.che.api.factory.server.scm.PersonalAccessTokenFetcher`
- **GitHubPersonalAccessTokenFetcher**: `org.eclipse.che.api.factory.server.scm.GitHubPersonalAccessTokenFetcher`
- **GitLabPersonalAccessTokenFetcher**: `org.eclipse.che.api.factory.server.scm.GitLabPersonalAccessTokenFetcher`
- **BitbucketPersonalAccessTokenFetcher**: `org.eclipse.che.api.factory.server.scm.BitbucketPersonalAccessTokenFetcher`

## Related Documentation

- [OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md) - Complete OAuth implementation guide
- [NAMESPACE_PROVISIONING_IMPLEMENTATION.md](NAMESPACE_PROVISIONING_IMPLEMENTATION.md) - Kubernetes integration
- [swagger-examples.md](swagger-examples.md) - API usage examples

## Conclusion

The factory resolver automatically detects private repositories and provides OAuth authentication URLs, creating a seamless authentication flow that guides users to authenticate with the appropriate SCM provider before accessing private repositories.


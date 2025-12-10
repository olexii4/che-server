# How Eclipse Che Java Implementation Reads OAuth Credentials from Files

This document explains how the original Eclipse Che Java server reads OAuth credentials from file paths like `/che-conf/oauth/github/id` and `/che-conf/oauth/github/secret`.

## Overview

The Java implementation uses **Java Dependency Injection** with `@Named` annotations to inject file paths, then reads the files using `java.nio.file.Files.readString()`.

## Java Implementation Pattern

All OAuth providers (GitHub, GitLab, Bitbucket, Azure DevOps) follow the same pattern:

### 1. Environment Variables to Java Properties

```bash
# Environment variables (set in production pod)
CHE_OAUTH2_GITHUB_CLIENTID__FILEPATH=/che-conf/oauth/github/id
CHE_OAUTH2_GITHUB_CLIENTSECRET__FILEPATH=/che-conf/oauth/github/secret

CHE_OAUTH2_GITLAB_CLIENTID__FILEPATH=/che-conf/oauth/gitlab/id
CHE_OAUTH2_GITLAB_CLIENTSECRET__FILEPATH=/che-conf/oauth/gitlab/secret

CHE_OAUTH2_BITBUCKET_CLIENTID__FILEPATH=/che-conf/oauth/bitbucket/id
CHE_OAUTH2_BITBUCKET_CLIENTSECRET__FILEPATH=/che-conf/oauth/bitbucket/secret

CHE_OAUTH2_AZURE_DEVOPS_CLIENTID__FILEPATH=/che-conf/oauth/azure-devops/id
CHE_OAUTH2_AZURE_DEVOPS_CLIENTSECRET__FILEPATH=/che-conf/oauth/azure-devops/secret
```

These environment variables are converted to Java system properties:
```
che.oauth2.github.clientid_filepath
che.oauth2.github.clientsecret_filepath
che.oauth2.gitlab.clientid_filepath
che.oauth2.gitlab.clientsecret_filepath
...etc
```

### 2. Dependency Injection

Each OAuth provider has a Provider class that uses `@Inject` and `@Named` annotations:

#### Example: GitLab

```java
// GitLabOAuthAuthenticatorProvider.java
package org.eclipse.che.security.oauth;

import java.io.IOException;
import javax.inject.Inject;
import javax.inject.Named;
import javax.inject.Singleton;
import org.eclipse.che.commons.annotation.Nullable;

@Singleton
public class GitLabOAuthAuthenticatorProvider extends AbstractGitLabOAuthAuthenticatorProvider {
  private static final String PROVIDER_NAME = "gitlab";

  @Inject
  public GitLabOAuthAuthenticatorProvider(
      @Nullable @Named("che.oauth2.gitlab.clientid_filepath") String clientIdPath,
      @Nullable @Named("che.oauth2.gitlab.clientsecret_filepath") String clientSecretPath,
      @Nullable @Named("che.integration.gitlab.oauth_endpoint") String gitlabEndpoint,
      @Named("che.api") String cheApiEndpoint)
      throws IOException {
    super(clientIdPath, clientSecretPath, gitlabEndpoint, cheApiEndpoint, PROVIDER_NAME);
  }
}
```

**Key Points**:
- `@Nullable` - File paths are optional (if not provided, uses NoopOAuthAuthenticator)
- `@Named("che.oauth2.gitlab.clientid_filepath")` - Injects the file path from properties
- Calls parent constructor with file paths

### 3. Reading Files

The abstract parent class reads the files:

```java
// AbstractGitLabOAuthAuthenticatorProvider.java
package org.eclipse.che.security.oauth;

import static com.google.common.base.Strings.isNullOrEmpty;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.inject.Provider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AbstractGitLabOAuthAuthenticatorProvider implements Provider<OAuthAuthenticator> {
  private static final Logger LOG =
      LoggerFactory.getLogger(AbstractGitLabOAuthAuthenticatorProvider.class);
  private final OAuthAuthenticator authenticator;
  private final String providerName;

  public AbstractGitLabOAuthAuthenticatorProvider(
      String clientIdPath,
      String clientSecretPath,
      String gitlabEndpoint,
      String cheApiEndpoint,
      String providerName)
      throws IOException {
    this.providerName = providerName;
    authenticator =
        getOAuthAuthenticator(clientIdPath, clientSecretPath, gitlabEndpoint, cheApiEndpoint);
    LOG.debug("{} GitLab OAuth Authenticator is used.", authenticator);
  }

  @Override
  public OAuthAuthenticator get() {
    return authenticator;
  }

  private OAuthAuthenticator getOAuthAuthenticator(
      String clientIdPath, String clientSecretPath, String gitlabEndpoint, String cheApiEndpoint)
      throws IOException {
    // Check if all required parameters are provided
    if (!isNullOrEmpty(clientIdPath)
        && !isNullOrEmpty(clientSecretPath)
        && !isNullOrEmpty(gitlabEndpoint)) {
      
      // Read client ID from file
      String clientId = Files.readString(Path.of(clientIdPath));
      
      // Read client secret from file
      String clientSecret = Files.readString(Path.of(clientSecretPath));
      
      // Check if files contained valid data
      if (!isNullOrEmpty(clientId) && !isNullOrEmpty(clientSecret)) {
        return new GitLabOAuthAuthenticator(
            clientId, clientSecret, gitlabEndpoint, cheApiEndpoint, providerName);
      }
    }
    
    // If any required parameter is missing, return Noop authenticator
    return new NoopOAuthAuthenticator();
  }

  // Noop authenticator for when OAuth is not configured
  static class NoopOAuthAuthenticator extends OAuthAuthenticator {
    @Override
    public String getOAuthProvider() {
      return "Noop";
    }

    @Override
    public String getEndpointUrl() {
      return "Noop";
    }
  }
}
```

**Key Methods**:
- `Files.readString(Path.of(clientIdPath))` - Java NIO method to read entire file as string
- Validates that file paths exist and contain non-empty values
- Returns `NoopOAuthAuthenticator` if configuration is missing

### 4. GitHub Implementation (Similar Pattern)

```java
// AbstractGitHubOAuthAuthenticatorProvider.java
private OAuthAuthenticator getOAuthAuthenticator(
      String clientIdPath,
      String clientSecretPath,
      String[] redirectUris,
      String oauthEndpoint,
      String authUri,
      String tokenUri)
      throws IOException {

    if (!isNullOrEmpty(clientIdPath)
        && !isNullOrEmpty(clientSecretPath)
        && !isNullOrEmpty(authUri)
        && !isNullOrEmpty(tokenUri)) {
      
      // Read and trim the files
      final String clientId = Files.readString(Path.of(clientIdPath)).trim();
      final String clientSecret = Files.readString(Path.of(clientSecretPath)).trim();
      
      if (!isNullOrEmpty(clientId) && !isNullOrEmpty(clientSecret)) {
        return new GitHubOAuthAuthenticator(
            clientId,
            clientSecret,
            redirectUris,
            oauthEndpoint,
            authUri,
            tokenUri,
            providerName);
      }
    }
    return new NoopOAuthAuthenticator();
  }
```

**Note**: GitHub implementation also calls `.trim()` to remove whitespace.

### 5. Azure DevOps Implementation (Same Pattern)

```java
// AzureDevOpsOAuthAuthenticatorProvider.java
@Inject
public AzureDevOpsOAuthAuthenticatorProvider(
    @Named("che.api") String cheApiEndpoint,
    @Nullable @Named("che.oauth2.azure.devops.clientid_filepath") String azureDevOpsClientIdPath,
    @Nullable @Named("che.oauth2.azure.devops.clientsecret_filepath")
        String azureDevOpsClientSecretPath,
    @Named("che.integration.azure.devops.api_endpoint") String azureDevOpsApiEndpoint,
    @Named("che.integration.azure.devops.scm.api_endpoint") String azureDevOpsScmApiEndpoint,
    @Named("che.oauth.azure.devops.authuri") String authUri,
    @Named("che.oauth.azure.devops.tokenuri") String tokenUri,
    @Named("che.oauth.azure.devops.redirecturis") String[] redirectUris)
    throws IOException {
  // ... similar pattern ...
}

private OAuthAuthenticator getOAuthAuthenticator(...) throws IOException {
    if (!isNullOrEmpty(clientIdPath) && !isNullOrEmpty(clientSecretPath)) {
      final String clientId = Files.readString(Path.of(clientIdPath)).trim();
      final String clientSecret = Files.readString(Path.of(clientSecretPath)).trim();
      if (!isNullOrEmpty(clientId) && !isNullOrEmpty(clientSecret)) {
        return new AzureDevOpsOAuthAuthenticator(...);
      }
    }
    return new NoopOAuthAuthenticator();
  }
```

## How Files Get Into the Pod

In production, these files are mounted from **Kubernetes Secrets** via the Che Operator:

### 1. Create Kubernetes Secret

```bash
kubectl create secret generic github-oauth-config \
  --from-literal=id=<github-client-id> \
  --from-literal=secret=<github-client-secret> \
  -n eclipse-che

kubectl label secret github-oauth-config \
  app.kubernetes.io/part-of=che.eclipse.org \
  app.kubernetes.io/component=oauth-scm-configuration \
  -n eclipse-che
```

### 2. Che Operator Mounts Secrets as Files

The Che Operator mounts these secrets into the pod at `/che-conf/oauth/<provider>/`:

```yaml
# Simplified deployment (Che Operator does this)
apiVersion: v1
kind: Pod
metadata:
  name: che-server
spec:
  containers:
  - name: che
    image: quay.io/eclipse/che-server:latest
    env:
    - name: CHE_OAUTH2_GITHUB_CLIENTID__FILEPATH
      value: /che-conf/oauth/github/id
    - name: CHE_OAUTH2_GITHUB_CLIENTSECRET__FILEPATH
      value: /che-conf/oauth/github/secret
    
    volumeMounts:
    - name: github-oauth
      mountPath: /che-conf/oauth/github
      readOnly: true
  
  volumes:
  - name: github-oauth
    secret:
      secretName: github-oauth-config
```

### 3. File Structure in Pod

```
/che-conf/oauth/
├── github/
│   ├── id          # Contains: Iv1.abc123def456
│   └── secret      # Contains: abc123def456abc123def456abc123def456
├── gitlab/
│   ├── id
│   └── secret
├── bitbucket/
│   ├── id
│   └── secret
└── azure-devops/
    ├── id
    └── secret
```

## File Content Format

The files contain **plain text** (not JSON, not base64):

### `/che-conf/oauth/github/id`
```
Iv1.abc123def456
```

### `/che-conf/oauth/github/secret`
```
abc123def456abc123def456abc123def456abc123
```

**No newlines** (or they are trimmed by `.trim()`)

## TypeScript Equivalent

### Java Approach (File-Based)
```java
// Read from files mounted from Kubernetes Secrets
String clientId = Files.readString(Path.of("/che-conf/oauth/github/id")).trim();
String clientSecret = Files.readString(Path.of("/che-conf/oauth/github/secret")).trim();
```

### TypeScript Approach (Direct Kubernetes API)
```typescript
// Read directly from Kubernetes Secrets API (better approach)
const response = await this.k8sApi.listNamespacedSecret(
  this.namespace,
  undefined,
  undefined,
  undefined,
  undefined,
  'app.kubernetes.io/component=oauth-scm-configuration'
);

for (const secret of response.body.items) {
  const clientId = Buffer.from(secret.data.id, 'base64').toString('utf-8');
  const clientSecret = Buffer.from(secret.data.secret, 'base64').toString('utf-8');
  // ... use credentials ...
}
```

## Why TypeScript Uses Kubernetes API Directly

### Java Approach (File Mounting)
**Pros**:
- Simple file reading
- Follows standard Java I/O patterns
- Works well with Che Operator's secret mounting

**Cons**:
- Requires secrets to be mounted as volumes
- Requires pod restart to pick up new OAuth providers
- More complex deployment configuration

### TypeScript Approach (Direct API)
**Pros**:
- No volume mounts needed
- Dynamic - picks up new secrets without restart
- Simpler deployment (fewer volume mounts)
- More cloud-native

**Cons**:
- Requires Kubernetes API access
- Slightly more complex code

## Comparison Table

| Aspect | Java (File-Based) | TypeScript (API-Based) |
|--------|------------------|----------------------|
| **Data Source** | Files in `/che-conf/oauth/` | Kubernetes Secrets API |
| **Volume Mounts** | Required | Not required |
| **Dynamic Updates** | Needs restart | Automatic (on startup) |
| **Deployment Complexity** | Higher (volume mounts) | Lower (API access) |
| **Code Complexity** | Lower (file I/O) | Higher (K8s API) |
| **Kubernetes RBAC** | Not needed | Needs Secret read permission |
| **Data Format** | Plain text files | Base64 in Secret.data |

## Complete Flow Comparison

### Java Flow

1. **Che Operator** creates Deployment with:
   - Environment variable: `CHE_OAUTH2_GITHUB_CLIENTID__FILEPATH=/che-conf/oauth/github/id`
   - Volume mount from Secret `github-oauth-config` to `/che-conf/oauth/github/`

2. **Pod starts**, files are available:
   ```
   /che-conf/oauth/github/id      -> "Iv1.abc123"
   /che-conf/oauth/github/secret  -> "secret123"
   ```

3. **Java Dependency Injection**:
   - Reads env var `CHE_OAUTH2_GITHUB_CLIENTID__FILEPATH`
   - Injects path into `GitHubOAuthAuthenticatorProvider`

4. **Provider reads files**:
   ```java
   String clientId = Files.readString(Path.of("/che-conf/oauth/github/id")).trim();
   ```

5. **Creates authenticator** with credentials

### TypeScript Flow

1. **Che Operator** creates Secret with labels/annotations:
   ```yaml
   metadata:
     labels:
       app.kubernetes.io/component: oauth-scm-configuration
     annotations:
       che.eclipse.org/oauth-scm-server: github
   data:
     id: SW...      # base64
     secret: YWJ... # base64
   ```

2. **Pod starts**, no file mounts needed

3. **TypeScript code** calls Kubernetes API:
   ```typescript
   const secrets = await k8sApi.listNamespacedSecret(
     'eclipse-che',
     ...,
     'app.kubernetes.io/component=oauth-scm-configuration'
   );
   ```

4. **Decodes credentials**:
   ```typescript
   const clientId = Buffer.from(secret.data.id, 'base64').toString('utf-8');
   ```

5. **Creates OAuth config** with credentials

## Implementation Files

### Java Implementation
- `GitLabOAuthAuthenticatorProvider.java` - Injects file paths
- `AbstractGitLabOAuthAuthenticatorProvider.java` - Reads files with `Files.readString()`
- `AbstractGitHubOAuthAuthenticatorProvider.java` - Similar pattern for GitHub
- `AzureDevOpsOAuthAuthenticatorProvider.java` - Similar pattern for Azure DevOps
- All use `java.nio.file.Files.readString(Path.of(filePath))`

### TypeScript Implementation
- `src/services/OAuthService.ts` - Reads from Kubernetes API
- `loadProvidersFromSecrets()` - Lists and parses Kubernetes Secrets
- Uses `@kubernetes/client-node` library

## See Also

- `docs/OAUTH_IMPLEMENTATION.md` - TypeScript OAuth implementation guide
- `docs/PRODUCTION_ENVIRONMENT_VARIABLES.md` - Environment variable mappings
- `docs/KUBERNETES_AUTHENTICATION_MODES.md` - Kubernetes auth patterns


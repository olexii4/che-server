# OAuth Configuration

## Overview

The Che Server Next OAuth service reads OAuth provider configuration from Kubernetes Secrets, matching the [Eclipse Che Server](https://github.com/eclipse-che/che-server) implementation.

**Reference:** [Configuring OAuth 2 for GitHub - Eclipse Che Documentation](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-github/)

## Default Behavior

**Without Kubernetes Secrets configured:**
```bash
GET /api/oauth
```

**Returns:**
```json
[]
```

The service returns an empty array when no OAuth providers are configured. This is the expected behavior.

## Configuration via Kubernetes Secrets

### Secret Structure

To enable OAuth authentication for SCM providers, create a Secret with the following structure:

```yaml
kind: Secret
apiVersion: v1
metadata:
  name: github-oauth-config
  namespace: eclipse-che  # The Che namespace (default: eclipse-che)
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: oauth-scm-configuration  # Required label
  annotations:
    che.eclipse.org/oauth-scm-server: github  # Provider name: github, gitlab, bitbucket, azure-devops
    che.eclipse.org/scm-server-endpoint: https://github.com  # Optional: defaults vary by provider
    che.eclipse.org/scm-github-disable-subdomain-isolation: 'false'  # GitHub Enterprise Server only
type: Opaque
stringData:
  id: <GitHub_OAuth_Client_ID>        # Required: OAuth Client ID
  secret: <GitHub_OAuth_Client_Secret>  # Required: OAuth Client Secret
```

### Required Fields

| Field | Location | Description |
|-------|----------|-------------|
| `app.kubernetes.io/component` | `metadata.labels` | **Must be:** `oauth-scm-configuration` |
| `che.eclipse.org/oauth-scm-server` | `metadata.annotations` | Provider name: `github`, `gitlab`, `bitbucket`, `azure-devops` |
| `id` | `stringData` | OAuth Client ID |
| `secret` | `stringData` | OAuth Client Secret |

### Optional Fields

| Field | Location | Default | Description |
|-------|----------|---------|-------------|
| `che.eclipse.org/scm-server-endpoint` | `metadata.annotations` | Varies by provider | Custom server URL for self-hosted instances |
| `che.eclipse.org/scm-github-disable-subdomain-isolation` | `metadata.annotations` | `false` | GitHub Enterprise Server subdomain isolation setting |

## Supported Providers

### 1. GitHub

**Default endpoint:** `https://github.com`

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
    # Optional: For GitHub Enterprise Server
    # che.eclipse.org/scm-server-endpoint: https://github.example.com
type: Opaque
stringData:
  id: <GitHub_OAuth_Client_ID>
  secret: <GitHub_OAuth_Client_Secret>
```

**OAuth Scopes:** `repo`, `user`, `write:public_key`

### 2. GitLab

**Default endpoint:** `https://gitlab.com`

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
    # Optional: For self-hosted GitLab
    # che.eclipse.org/scm-server-endpoint: https://gitlab.example.com
type: Opaque
stringData:
  id: <GitLab_OAuth_Client_ID>
  secret: <GitLab_OAuth_Client_Secret>
```

**OAuth Scopes:** `api`, `read_user`, `read_repository`

### 3. Bitbucket

**Default endpoint:** `https://bitbucket.org`

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
    # Optional: For Bitbucket Server
    # che.eclipse.org/scm-server-endpoint: https://bitbucket.example.com
type: Opaque
stringData:
  id: <Bitbucket_OAuth_Client_ID>
  secret: <Bitbucket_OAuth_Client_Secret>
```

**OAuth Scopes:** `repository`, `account`

### 4. Azure DevOps

**Default endpoint:** `https://dev.azure.com`

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
type: Opaque
stringData:
  id: <Azure_DevOps_App_ID>
  secret: <Azure_DevOps_Client_Secret>
```

**OAuth Scopes:** `vso.code`, `vso.code_write`

## Deployment

### Apply the Secret

```bash
kubectl apply -f github-oauth-config.yaml -n eclipse-che
```

### Verify Configuration

```bash
# Check that the secret exists
kubectl get secret github-oauth-config -n eclipse-che

# Verify labels and annotations
kubectl describe secret github-oauth-config -n eclipse-che
```

### Restart Che Server

After creating or updating OAuth secrets, restart the Che Server to load the new configuration:

```bash
kubectl rollout restart deployment/che -n eclipse-che
```

Or use `chectl`:

```bash
chectl server:update --che-operator-cr-patch-yaml=$(PWD)/cr-patch.yaml
```

## Testing OAuth Configuration

### 1. Check Available Providers

```bash
curl -X GET "https://your-che-host/api/oauth" \
  -H "Authorization: Bearer <token>"
```

**Expected response (with GitHub configured):**

```json
[
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
        "href": "https://your-che-host/api/oauth/authenticate"
      }
    ]
  }
]
```

**Expected response (no secrets configured):**

```json
[]
```

### 2. Initiate OAuth Flow

```bash
# Get authentication URL
curl -X GET "https://your-che-host/api/oauth/authenticate?oauth_provider=github&mode=federated_login" \
  -H "Authorization: Bearer <token>"
```

### 3. Check OAuth Token

```bash
curl -X GET "https://your-che-host/api/oauth/token?oauth_provider=github" \
  -H "Authorization: Bearer <token>"
```

## Implementation Details

### Service Initialization

The OAuth service loads providers from Kubernetes Secrets during startup:

```typescript
// In routes/oauthRoutes.ts
const oauthService = new OAuthService();
await oauthService.initialize();  // Loads providers from K8s Secrets
```

### Secret Discovery

The service queries Kubernetes API for secrets with the label:

```
app.kubernetes.io/component=oauth-scm-configuration
```

### Error Handling

- **No K8s API available:** Service logs warning and returns `[]`
- **No secrets found:** Service logs info and returns `[]`
- **Invalid secret:** Service logs warning and skips that secret
- **Missing required fields:** Service logs warning and skips that secret

### Logging

OAuth service provides detailed logging:

```
INFO  OAuth Service: Loading providers from Kubernetes Secrets in namespace: eclipse-che
INFO  OAuth Service: Found 1 OAuth configuration secret(s)
INFO  OAuth Service: Loaded provider 'github' from secret 'github-oauth-config' (endpoint: https://github.com)
INFO  OAuth Service: Successfully loaded 1 OAuth provider(s)
```

## Multiple Providers

You can configure multiple OAuth providers by creating multiple secrets:

```bash
# GitHub
kubectl apply -f github-oauth-config.yaml -n eclipse-che

# GitLab
kubectl apply -f gitlab-oauth-config.yaml -n eclipse-che

# Bitbucket
kubectl apply -f bitbucket-oauth-config.yaml -n eclipse-che
```

The `/api/oauth` endpoint will return all configured providers.

## Troubleshooting

### No providers returned

**Check:**
1. Secrets exist in the correct namespace
2. Secrets have the correct label: `app.kubernetes.io/component=oauth-scm-configuration`
3. Secrets have required annotation: `che.eclipse.org/oauth-scm-server`
4. Secrets have `id` and `secret` fields
5. Che Server has restarted after creating secrets

**Debug:**
```bash
# Check server logs
kubectl logs deployment/che -n eclipse-che | grep "OAuth Service"

# List OAuth secrets
kubectl get secrets -n eclipse-che \
  -l app.kubernetes.io/component=oauth-scm-configuration
```

### Provider not recognized

**Valid provider names:**
- `github`
- `gitlab`
- `bitbucket`
- `azure-devops` or `azure_devops`

**Case-insensitive:** `GitHub`, `GITHUB`, `github` all work

### GitHub Enterprise Server

For GitHub Enterprise Server with disabled subdomain isolation:

```yaml
annotations:
  che.eclipse.org/oauth-scm-server: github
  che.eclipse.org/scm-server-endpoint: https://github.example.com
  che.eclipse.org/scm-github-disable-subdomain-isolation: 'true'
```

## Security Notes

1. **Secrets are base64 encoded:** Kubernetes automatically encodes `stringData` to base64 in `data`
2. **RBAC required:** Che Server service account needs read access to Secrets
3. **Namespace isolation:** Secrets are namespace-scoped
4. **Rotation:** Update secrets and restart Che Server to rotate credentials

## Compatibility

✅ **Fully compatible with Eclipse Che Server**
- Same Secret structure
- Same label and annotation names
- Same provider names
- Same default endpoints
- Returns `[]` when no secrets configured

**Reference:** [Eclipse Che Server on GitHub](https://github.com/eclipse-che/che-server)

## See Also

- [Eclipse Che OAuth Documentation](https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-github/)
- [OAuth Routes API Documentation](../src/routes/oauthRoutes.ts)
- [OAuth Service Implementation](../src/services/OAuthService.ts)


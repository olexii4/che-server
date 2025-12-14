# Authentication Flow in Che Server Next

## Overview

The Che Server Next supports multiple authentication methods to handle different deployment scenarios.

## Authentication Methods (Priority Order)

### 1. Eclipse Che Gateway Authentication (`gap-auth` header) ✅ **Recommended**

**Used when:** Accessing through Eclipse Che Dashboard (production deployment)

**How it works:**
- User authenticates with Keycloak through Eclipse Che Gateway
- Gateway validates JWT token and extracts username
- Gateway forwards request to Che Server with `gap-auth` header
- Header contains username (e.g., `kubeadmin`, `user1@che`, `admin`)

**Example:**
```http
GET /api/kubernetes/namespace/provision
Host: eclipse-che.apps.openshift.com
gap-auth: kubeadmin
```

**Result:**
- ✅ Correct username: `kubeadmin`
- ✅ Namespace created: `kubeadmin-che`
- ✅ User profile: `{username: "kubeadmin", email: "kubeadmin@che.local"}`

---

### 2. JWT Token (Bearer Authentication)

**Used when:** Direct API access with JWT token from Keycloak

**How it works:**
- Client sends JWT token in Authorization header
- Server decodes JWT and extracts:
  - `sub` claim → User ID (UUID)
  - `preferred_username` / `name` / `email` → Username

**Example:**
```http
GET /api/kubernetes/namespace
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**JWT Claims:**
```json
{
  "sub": "d4810a4f-169f-4da5-a8e0-d8dff7ecf959",
  "preferred_username": "kubeadmin",
  "email": "admin@example.com"
}
```

**Result:**
- ✅ User ID: `d4810a4f-169f-4da5-a8e0-d8dff7ecf959`
- ✅ Username: `kubeadmin`
- ✅ Namespace: `kubeadmin-che`

---

### 3. Test Token Format (`id:username`)

**Used when:** Local development and testing

**Example:**
```http
GET /api/kubernetes/namespace
Authorization: Bearer user123:johndoe
```

**Result:**
- User ID: `user123`
- Username: `johndoe`
- Namespace: depends on `NAMESPACE_TEMPLATE` (in Che installs it is typically `<username>-che`)

---

### 4. Raw Bearer Token (non-JWT, e.g. OpenShift `sha256~...`)

**Used when:** Direct API access with service account or user token

**How it works:**
- Client sends Kubernetes token (e.g., `sha256~...`) in Authorization header
- **TokenReview is disabled** in this Node che-server implementation (to avoid cluster-wide RBAC requirements).
- If the token is **not a JWT** and does not match the test format (`id:username`), che-server cannot extract a username and will fall back to `che-user`.

**Example:**
```http
GET /api/kubernetes/namespace/provision
Authorization: Bearer sha256~zpxqr6PzbWNyTzX7d4mUfiONB0-QSLn7-JQFsiMF0S8
```

**Result:**
- ⚠️ Username falls back to: `che-user`
- ⚠️ Namespace uses the fallback username (depends on `NAMESPACE_TEMPLATE`)

---

## Deployment Recommendations

### ✅ Production - Eclipse Che Gateway (recommended)

**Setup:**
1. Deploy Eclipse Che with Gateway enabled (test environments)
2. All `/api/*` requests route through Gateway
3. Gateway adds `gap-auth` header
4. Users authenticate via Keycloak

**Authentication Flow:**
```
1. User accesses: https://eclipse-che.apps.openshift.com/dashboard/
2. Gateway validates JWT token with Keycloak
3. Gateway extracts username: kubeadmin
4. Gateway forwards to Che Server with: gap-auth: kubeadmin
5. Namespace created: kubeadmin-che ✅
```

---

### 🔧 Local Development

**Options:**

1. **Use test token format:**
   ```bash
   curl -X GET 'http://localhost:8080/api/kubernetes/namespace' \
     -H 'Authorization: Bearer admin:admin'
   ```

2. **Use JWT tokens from local Keycloak (if you have one):**
   ```bash
   TOKEN=$(curl -X POST 'http://localhost:8180/realms/che/protocol/openid-connect/token' \
     -d 'username=admin&password=admin&grant_type=password&client_id=che-public')
   
   curl -X GET 'http://localhost:8080/api/kubernetes/namespace' \
     -H "Authorization: Bearer ${TOKEN}"
   ```

3. **Simulate gap-auth header:**
   ```bash
   curl -X GET 'http://localhost:8080/api/kubernetes/namespace' \
     -H 'gap-auth: kubeadmin'
   ```

4. **Local Kubernetes access for namespace operations**:
   If you run che-server locally but want it to talk to a cluster API, set:
   ```bash
   export USER_TOKEN="$(oc whoami -t)"
   ```

---

## Troubleshooting

### Problem: Wrong namespace name (fallback `che-user`)

**Possible causes:**
1. You used a **non-JWT** bearer token (e.g. `sha256~...`) and che-server could not extract username
2. Gateway identity headers are missing (`gap-auth` / `x-forwarded-user`)

**Solutions:**
1. **Use gateway headers** (production):
   Access through the Che Dashboard / Gateway (it injects identity headers).
2. **Use test token format** (local):
   `Authorization: Bearer user123:johndoe`
3. **Simulate gateway header** (local):
   ```bash
   curl -H 'gap-auth: kubeadmin' ...
   ```

---

### Problem: 401 Unauthorized

**Possible causes:**
1. Missing Authorization header
2. Missing gap-auth header
3. Invalid JWT token
4. Expired token

**Check logs:**
```bash
# Server logs will show:
# "🔐 Authentication attempt: path=/api/..., hasGapAuth=false, hasAuthorization=true"
```

---

### Note: User ID source depends on auth method

- **JWT Bearer tokens**: `subject.userId` comes from the JWT `sub` claim (typically a UUID)
- **gap-auth / test tokens**: `subject.userId` may be derived from username (no UUID available)

---

## Security Considerations

1. **Always use HTTPS in production**
2. **Enable Eclipse Che Gateway** for production deployments
3. **Don't expose Che Server directly** - route through Gateway
4. **Rotate tokens regularly**
5. **Use Keycloak** for centralized authentication
6. **Enable RBAC** in Kubernetes for proper access control

---

## References

- [Eclipse Che Authentication Docs](https://eclipse.dev/che/docs/stable/administration-guide/authenticating-users/)
- [Keycloak Integration](https://eclipse.dev/che/docs/stable/administration-guide/configuring-authorization/)
- [OAuth Configuration](./OAUTH_CONFIGURATION.md)

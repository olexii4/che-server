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
GET /api/user/id
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
- Namespace: `johndoe-che`

---

### 4. Basic Authentication

**Used when:** Alternative authentication method

**Example:**
```http
GET /api/kubernetes/namespace
Authorization: Basic am9obmRvZTp1c2VyMTIz
```

Base64 decodes to: `johndoe:user123`

**Result:**
- User ID: `user123`
- Username: `johndoe`
- Namespace: `johndoe-che`

---

### 5. Raw Kubernetes Token ✅ **Direct API Access**

**Used when:** Direct API access with service account or user token

**How it works:**
- Client sends Kubernetes token (e.g., `sha256~...`) in Authorization header
- Server calls Kubernetes TokenReview API to validate and extract username
- Username is cleaned up (removes `system:`, `kube:` prefixes)
- Namespace created with correct username

**Example:**
```http
GET /api/kubernetes/namespace/provision
Authorization: Bearer sha256~zpxqr6PzbWNyTzX7d4mUfiONB0-QSLn7-JQFsiMF0S8
```

**TokenReview API Response:**
```json
{
  "status": {
    "authenticated": true,
    "user": {
      "username": "kube:admin"
    }
  }
}
```

**Result:**
- ✅ Username extracted: `admin` (cleaned from `kube:admin`)
- ✅ Namespace created: `admin-che`
- ✅ User profile: `{username: "admin", email: "admin@che.local"}`

**Fallback:**
If TokenReview API fails, defaults to `che-user` as username.

---

## Deployment Recommendations

### ✅ Production (Direct API Access) - **Recommended for Customers**

**Setup:**
1. Deploy Che Server in Kubernetes/OpenShift
2. Expose API at: `https://che-server-pod:8080/api/`
3. Clients authenticate with Kubernetes tokens
4. Server uses TokenReview API to extract usernames

**URL Structure:**
```
User/Client → Che Server API (Direct)
                    ↓
            TokenReview API validates token
                    ↓
            Username extracted automatically
```

**Authentication Flow:**
```
1. Client accesses: https://che-server-pod:8080/api/kubernetes/namespace/provision
2. Client sends: Authorization: Bearer sha256~abc123...
3. Che Server calls TokenReview API
4. TokenReview returns: username = "kube:admin"
5. Server cleans username: "admin"
6. Namespace created: admin-che ✅
```

---

### 🧪 Testing with Eclipse Che Gateway

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

2. **Use JWT tokens from local Keycloak:**
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

---

## Troubleshooting

### Problem: Wrong namespace name (`che-user-che` instead of `kubeadmin-che`)

**Possible causes:**
1. TokenReview API is not accessible from the pod
2. Token doesn't have sufficient permissions
3. TokenReview API call failed

**Solutions:**
1. **Check TokenReview API access:**
   ```bash
   kubectl auth can-i create tokenreviews.authentication.k8s.io --as=system:serviceaccount:eclipse-che:che
   ```

2. **Check pod logs for TokenReview errors:**
   ```bash
   kubectl logs -n eclipse-che deployment/che-server | grep TokenReview
   ```

3. **Verify RBAC permissions:**
   The Che service account needs permission to create TokenReview objects.
   
4. **Fallback to gap-auth (testing):**
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

### Problem: User ID returns username instead of UUID

**Expected behavior:**
- JWT tokens: Returns UUID from `sub` claim
- gap-auth / test tokens: Returns username as ID (no UUID available)

**Example:**
```bash
# With JWT
curl /api/user/id → "d4810a4f-169f-4da5-a8e0-d8dff7ecf959"

# With gap-auth
curl -H 'gap-auth: admin' /api/user/id → "admin"
```

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

# RBAC Permissions Required

This document describes the Kubernetes RBAC permissions required for the Eclipse Che Server API endpoints.

## Overview

In production (Che deployed on Kubernetes/OpenShift), che-server performs Kubernetes operations using the **che-server pod ServiceAccount** (in-cluster kubeconfig). This matches the Java che-server behavior via `CheServerKubernetesClientFactory`.

For **local development** (`LOCAL_RUN=true`), che-server cannot read the in-cluster ServiceAccount token file, so you can provide a token via:
- `USER_TOKEN="$(oc whoami -t)"` (preferred)
- `SERVICE_ACCOUNT_TOKEN` (legacy alias)

That local token must have permissions equivalent to what the che-server ServiceAccount has in a real Che install.

## Required Permissions by Endpoint

### `/api/kubernetes/namespace` (GET)

**Purpose**: List all namespaces managed by Eclipse Che (labeled with `app.kubernetes.io/part-of=che.eclipse.org`)

**Required Permissions**:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: che-namespace-reader
rules:
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["list", "get"]
```

**Why needed**: To query namespaces with specific labels at the cluster scope.

**Error if missing (local development)**:
```json
{
  "error": "Internal Server Error",
  "message": "Internal server error occurred during namespaces fetching",
  "details": "Forbidden: namespaces is forbidden: User \"username\" cannot list resource \"namespaces\" in API group \"\" at the cluster scope"
}
```

### `/api/kubernetes/namespace/provision` (POST)

**Purpose**: Create or verify a namespace for the authenticated user

**Required Permissions**:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: che-namespace-provisioner
rules:
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["create", "get", "patch", "update"]
```

**Why needed**: To create namespaces and update their labels/annotations.

## Example ClusterRole and ClusterRoleBinding

If you are debugging locally against a cluster and your `USER_TOKEN` does not have sufficient permissions, you can grant them **in your cluster**.

⚠️ **Note**: This repo aims to be an **image-only replacement** for Java che-server. It does **not** require creating additional cluster-wide RBAC objects for normal Che deployments; the Che Operator installation is expected to manage required permissions for the `che` ServiceAccount. The manifest below is for troubleshooting/debug only.

```yaml
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: che-user
rules:
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["list", "get", "create", "patch", "update"]
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: ["rolebindings"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: che-user-olexii4
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: che-user
subjects:
- kind: User
  name: olexii4  # Replace with actual username
  apiGroup: rbac.authorization.k8s.io
```

## Applying Permissions (debug/troubleshooting only)

### For OpenShift

```bash
# Give user cluster permissions to manage Che namespaces
oc adm policy add-cluster-role-to-user che-user olexii4

# Or use the built-in cluster-admin role (NOT recommended for production)
oc adm policy add-cluster-role-to-user cluster-admin olexii4
```

### For Kubernetes

```bash
# Apply the ClusterRole and ClusterRoleBinding
kubectl apply -f che-rbac.yaml

# Verify the user has permissions
kubectl auth can-i list namespaces --as=olexii4
# Should output: yes
```

## Testing Your Token

After applying permissions, test with:

```bash
# Get your token
TOKEN=$(oc whoami -t)  # For OpenShift
# OR
TOKEN=$(kubectl create token your-service-account)  # For Kubernetes

# Test namespace listing
curl -X GET 'http://localhost:8080/api/kubernetes/namespace' \
  -H "Authorization: Bearer ${TOKEN}"

# Should return array of namespaces, not a 500 error
```

## Production Setup

In a production Eclipse Che deployment:

1. **Che Operator** typically runs with a service account that has these cluster-wide permissions
2. **Individual users** authenticate through OAuth/OIDC
3. **Che Dashboard Backend** uses a **service account token** for cluster operations, not user tokens
4. **User tokens** are used for workspace-specific operations within their assigned namespace

## Quick Setup Scripts

We provide helper scripts to quickly grant permissions:

### Grant Namespace Permissions

```bash
```

This grants permissions to list, create, and manage namespaces.

### Grant DevWorkspace Permissions

```bash
```

This grants permissions to manage DevWorkspace CRDs (devworkspaces, devworkspacetemplates, etc.).

### Grant All Permissions (Development Mode)

```bash
# WARNING: This grants cluster-admin, use only for local development!
kubectl config current-context  # Verify you're on the right cluster
oc adm policy add-cluster-role-to-user cluster-admin $(oc whoami)
```

## Troubleshooting

### "User cannot list resource namespaces at cluster scope"

**Problem**: User token doesn't have permission to list namespaces.

**Solution**: 
1. Grant `che-user` ClusterRole to the user (see above)
2. OR: Use a service account token with proper permissions for local development
3. OR: Apply the RBAC YAML manually (see examples in this document)

### "User cannot list resource devworkspaces"

**Problem**: User token doesn't have permission to list DevWorkspace CRDs.

**Solution**:
1. Grant `devworkspace-admin` ClusterRole to the user (see above)
2. OR: Apply the RBAC YAML manually (see examples in this document)

### Getting a Service Account Token for Testing

```bash
# Create a service account with permissions
kubectl create serviceaccount che-dev -n default
kubectl create clusterrolebinding che-dev-binding \
  --clusterrole=che-user \
  --serviceaccount=default:che-dev

# Get the token
kubectl create token che-dev -n default --duration=24h

# Use this token for testing
```

## Local Development

For `LOCAL_RUN=true` mode:

1. Your `~/.kube/config` should have valid credentials
2. Your user should have the necessary cluster permissions
3. OR: Use a service account token as shown above

See `QUICK_START.md` for detailed local setup instructions.


# RBAC Permissions Required

This document describes the Kubernetes RBAC permissions required for the Eclipse Che Server API endpoints.

## Overview

The Eclipse Che Server uses **request-based authentication**, meaning each API call uses the token from the `Authorization` header to interact with the Kubernetes API. This ensures proper RBAC enforcement - users can only access resources they have permission to.

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

**Error if missing**:
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

### `/api/namespace/:namespace/devworkspaces` (GET, POST, PATCH, DELETE)

**Purpose**: Manage DevWorkspace Custom Resources

**Required Permissions**:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: devworkspace-admin
rules:
- apiGroups: ["workspace.devfile.io"]
  resources: ["devworkspaces", "devworkspacetemplates", "devworkspaceroutings"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["controller.devfile.io"]
  resources: ["devworkspaceoperatorconfigs"]
  verbs: ["get", "list", "watch"]
```

**Why needed**: To manage DevWorkspace CRDs across namespaces.

**Error if missing**:
```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Unable to list devworkspaces: devworkspaces.workspace.devfile.io is forbidden: User \"admin\" cannot list resource \"devworkspaces\" in API group \"workspace.devfile.io\" in the namespace \"admin-che\""
}
```

### `/api/namespace/:namespace/pods` (GET)

**Purpose**: List pods in a namespace

**Required Permissions**:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
```

### `/api/namespace/:namespace/events` (GET)

**Purpose**: List events in a namespace

**Required Permissions**:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: event-reader
rules:
- apiGroups: [""]
  resources: ["events"]
  verbs: ["get", "list", "watch"]
```

## Example ClusterRole and ClusterRoleBinding

For a user to use all Che API endpoints, you need permissions for namespaces, DevWorkspaces, pods, and events:

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
  resources: ["pods", "events", "secrets", "configmaps"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["workspace.devfile.io"]
  resources: ["devworkspaces", "devworkspacetemplates", "devworkspaceroutings"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["controller.devfile.io"]
  resources: ["devworkspaceoperatorconfigs"]
  verbs: ["get", "list", "watch"]

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

## Applying Permissions

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
./scripts/grant-namespace-permissions.sh
```

This grants permissions to list, create, and manage namespaces.

### Grant DevWorkspace Permissions

```bash
./scripts/grant-devworkspace-permissions.sh
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
3. OR: Run `./scripts/grant-namespace-permissions.sh`

### "User cannot list resource devworkspaces"

**Problem**: User token doesn't have permission to list DevWorkspace CRDs.

**Solution**:
1. Grant `devworkspace-admin` ClusterRole to the user (see above)
2. OR: Run `./scripts/grant-devworkspace-permissions.sh`

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


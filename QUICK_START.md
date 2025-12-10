# Quick Start Guide

## The Error You're Seeing

```
ENOENT: no such file or directory, open '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
```

**This error means:** The server is trying to use in-cluster Kubernetes config, but you're running it locally.

**Solution:** Set `LOCAL_RUN=true` to use your local kubeconfig instead.

## Local Development Setup

### Option 1: Use the Startup Script (Recommended)

```bash
./start-local-dev.sh
```

This script will:
- Check if you have a valid kubeconfig
- Check if you're connected to a cluster
- Set `LOCAL_RUN=true` automatically
- Build and start the server

### Option 2: Manual Setup

```bash
# Set local run mode
export LOCAL_RUN=true

# Build and start
yarn build:dev && yarn start:debug
```

## Testing the API

Once the server is running, test it:

```bash
# Test with your real Kubernetes token
curl -X POST http://localhost:8080/api/kubernetes/namespace/provision \
  -H "Authorization: Bearer $(oc whoami -t)"  # For OpenShift
  # OR
  -H "Authorization: Bearer YOUR_K8S_TOKEN"   # For Kubernetes

# Test list namespaces
curl -X GET http://localhost:8080/api/kubernetes/namespace \
  -H "Authorization: Bearer $(oc whoami -t)"
```

## How It Works

### Without LOCAL_RUN (Production Mode - In-Cluster)
```
Server runs in Kubernetes pod
  → Uses in-cluster config from /var/run/secrets/kubernetes.io/
  → Gets cluster info from service account
  → Uses request tokens for API calls
```

### With LOCAL_RUN=true (Development Mode - Local)
```
Server runs on your machine
  → Uses local kubeconfig from ~/.kube/config
  → Gets cluster info from kubectl config
  → Uses request tokens for API calls
```

**Important:** In both modes, **request tokens are always used** for Kubernetes API calls. The base config (in-cluster or local) only provides cluster connection info (URL, CA cert, etc.).

## Troubleshooting

### Error: "no such file or directory, open '/var/run/secrets/...'"
**Cause:** `LOCAL_RUN` is not set - server is trying to load [in-cluster service account credentials](https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/)  
**Fix:** Set `LOCAL_RUN=true` or use `./start-local-dev.sh` to use local kubeconfig instead

### Error: "no current context is found"
**Cause:** No valid kubeconfig  
**Fix:** Run `kubectl config current-context` to verify your kubeconfig

### Error: "401 Unauthorized"
**Cause:** Invalid or missing token in request  
**Fix:** Include valid token in `Authorization: Bearer <token>` header

### Error: "Forbidden: User cannot list resource namespaces at cluster scope"
**Cause:** Your token/user doesn't have permission to list namespaces  
**Fix:** Grant permissions with `./grant-namespace-permissions.sh` or see `docs/RBAC_PERMISSIONS.md`

### Error: "connect ECONNREFUSED"
**Cause:** Can't connect to Kubernetes cluster  
**Fix:** Verify cluster is accessible with `kubectl cluster-info`

## Environment Variables

| Variable | Description | Required for Local Dev |
|----------|-------------|----------------------|
| `LOCAL_RUN` | Use local kubeconfig | **YES** (set to `true`) |
| `KUBECONFIG` | Path to kubeconfig | No (defaults to `~/.kube/config`) |
| `PORT` | Server port | No (defaults to `8080`) |

## API Endpoints

All endpoints require `Authorization: Bearer <token>` header:

```bash
# Provision namespace
POST /api/kubernetes/namespace/provision

# List namespaces
GET /api/kubernetes/namespace

# Get OAuth providers
GET /api/oauth

# Resolve factory
POST /api/factory/resolver
```

## Full Example

```bash
# 1. Start server
export LOCAL_RUN=true
yarn dev

# 2. In another terminal, get your token
export TOKEN=$(oc whoami -t)  # OpenShift
# OR
export TOKEN=$(kubectl config view --raw -o json | jq -r '.users[0].user.token')  # Kubernetes

# 3. Test provision namespace
curl -X POST http://localhost:8080/api/kubernetes/namespace/provision \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# 4. Test list namespaces
curl -X GET http://localhost:8080/api/kubernetes/namespace \
  -H "Authorization: Bearer $TOKEN"
```

## Next Steps

- See [README.md](README.md) for full documentation
- See [docs/REQUEST_TOKEN_AUTHENTICATION.md](docs/REQUEST_TOKEN_AUTHENTICATION.md) for authentication details
- Run `./test-real-kubernetes-token.sh` to test authentication


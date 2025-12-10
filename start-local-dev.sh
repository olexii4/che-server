#!/bin/bash

echo "🚀 Starting che-server in LOCAL_RUN mode"
echo "=============================================="
echo ""

# Check if kubeconfig exists
if [ ! -f ~/.kube/config ]; then
    echo "⚠️  Warning: ~/.kube/config not found"
    echo "   Make sure you have a valid kubeconfig file"
    echo ""
fi

# Check if connected to a cluster
if ! kubectl cluster-info &>/dev/null; then
    echo "⚠️  Warning: Not connected to a Kubernetes cluster"
    echo "   Make sure 'kubectl cluster-info' works"
    echo ""
else
    echo "✅ Connected to Kubernetes cluster:"
    kubectl cluster-info | head -1
    echo ""
fi

echo "Environment:"
echo "  LOCAL_RUN=true (uses ~/.kube/config)"
echo "  NODE_ENV=development"
echo ""

# Kill existing server on port 8080
if lsof -ti tcp:8080 &>/dev/null 2>&1; then
    echo "Stopping existing server on port 8080..."
    lsof -ti tcp:8080 | xargs kill 2>/dev/null
    sleep 2
fi

# Set SERVICE_ACCOUNT_TOKEN for namespace operations
if [ -z "$SERVICE_ACCOUNT_TOKEN" ]; then
    echo "⚠️  SERVICE_ACCOUNT_TOKEN not set!"
    echo "   Namespace operations require a token with cluster permissions."
    echo ""
    echo "   Set it with:"
    echo "   export SERVICE_ACCOUNT_TOKEN=\$(oc whoami -t)  # For OpenShift"
    echo "   export SERVICE_ACCOUNT_TOKEN=\$(kubectl config view --raw -o jsonpath='{.users[0].user.token}')  # For Kubernetes"
    echo ""
fi

# Start server
echo "Starting server..."
echo ""
export LOCAL_RUN=true
yarn build:dev && yarn start:debug


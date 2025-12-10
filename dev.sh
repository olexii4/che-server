#!/bin/bash
#
# Copyright (c) 2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation

echo "🚀 Starting che-server in LOCAL DEV mode"
echo "=============================================="
echo ""

# Check for SERVICE_ACCOUNT_TOKEN
if [ -z "$SERVICE_ACCOUNT_TOKEN" ]; then
    echo "❌ ERROR: SERVICE_ACCOUNT_TOKEN not set!"
    echo ""
    echo "   Required for namespace operations."
    echo "   Get your token with:"
    echo ""
    echo "   export SERVICE_ACCOUNT_TOKEN=\$(oc whoami -t)  # OpenShift"
    echo "   export SERVICE_ACCOUNT_TOKEN=\$(kubectl config view --raw -o jsonpath='{.users[0].user.token}')  # Kubernetes"
    echo ""
    exit 1
fi

echo "✅ SERVICE_ACCOUNT_TOKEN is set"
echo ""

# Kill existing server on port 8080
if lsof -ti tcp:8080 &>/dev/null 2>&1; then
    echo "Stopping existing server on port 8080..."
    lsof -ti tcp:8080 | xargs kill 2>/dev/null
    sleep 2
fi

# Set environment variables
export LOCAL_RUN=true
export NODE_ENV=development

echo "Environment:"
echo "  LOCAL_RUN=true"
echo "  NODE_ENV=development"
echo "  SERVICE_ACCOUNT_TOKEN=***...${SERVICE_ACCOUNT_TOKEN: -20}"
echo ""

# Start server
echo "Starting server..."
echo ""
yarn dev

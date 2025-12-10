#!/bin/bash
#
# Copyright (c) 2021-2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#  

# Grant permissions for listing and managing Che namespaces

set -e

echo "🔐 Granting Kubernetes Namespace Permissions for Eclipse Che"
echo "=============================================================="
echo ""

# Detect if running on OpenShift or Kubernetes
if command -v oc &> /dev/null && oc whoami &> /dev/null; then
    PLATFORM="openshift"
    USERNAME=$(oc whoami)
    echo "Platform: OpenShift"
    echo "User: ${USERNAME}"
elif command -v kubectl &> /dev/null; then
    PLATFORM="kubernetes"
    USERNAME=$(kubectl config view --minify -o jsonpath='{.contexts[0].context.user}' 2>/dev/null || echo "unknown")
    echo "Platform: Kubernetes"
    echo "Current context user: ${USERNAME}"
else
    echo "❌ Error: Neither 'oc' nor 'kubectl' command found"
    exit 1
fi

echo ""
echo "⚠️  WARNING: This script grants cluster-admin permissions"
echo "    This is intended for LOCAL DEVELOPMENT ONLY!"
echo ""
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo ""

if [ "$PLATFORM" = "openshift" ]; then
    echo "Granting cluster-admin to user '${USERNAME}'..."
    oc adm policy add-cluster-role-to-user cluster-admin "${USERNAME}"
    
    echo ""
    echo "✅ Permissions granted!"
    echo ""
    echo "Test with:"
    echo "  TOKEN=\$(oc whoami -t)"
    echo "  curl -H \"Authorization: Bearer \${TOKEN}\" http://localhost:8080/api/kubernetes/namespace"
    
elif [ "$PLATFORM" = "kubernetes" ]; then
    echo "Creating ClusterRoleBinding..."
    kubectl create clusterrolebinding dev-admin-binding-$(date +%s) \
      --clusterrole=cluster-admin \
      --user="${USERNAME}" 2>/dev/null || echo "  (binding may already exist)"
    
    echo ""
    echo "✅ Permissions granted!"
    echo ""
    echo "Test with your current kubeconfig token"
fi

echo ""
echo "For production, use service accounts with minimal permissions."
echo "See docs/RBAC_PERMISSIONS.md for details."

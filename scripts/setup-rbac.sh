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
#
# Setup RBAC Permissions for che-server
#
# This script creates the necessary RBAC permissions for the TypeScript che-server
# to manage user namespace permissions (create RoleBindings).
#
# Usage:
#   ./scripts/setup-rbac.sh
#
# Environment Variables:
#   CHE_NAMESPACE - Kubernetes namespace where Che is installed (default: eclipse-che)
#

set -e

CHE_NAMESPACE="${CHE_NAMESPACE:-eclipse-che}"

echo "[INFO] Setting up RBAC permissions for che-server in namespace: ${CHE_NAMESPACE}"

# Create ClusterRole for RoleBinding management
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: che-server-rolebinding-manager
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: che-server
rules:
# Allow che-server to create RoleBindings in user namespaces
# This matches the Java CheServerKubernetesClientFactory behavior
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: ["rolebindings"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
# Allow validating user tokens via Kubernetes TokenReview API (OpenShift/Kubernetes bearer tokens)
- apiGroups: ["authentication.k8s.io"]
  resources: ["tokenreviews"]
  verbs: ["create"]
# (Optional) Allow SubjectAccessReview if needed in future auth flows
- apiGroups: ["authorization.k8s.io"]
  resources: ["subjectaccessreviews"]
  verbs: ["create"]
# Allow managing secrets in user namespaces (for user-profile)
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
# Allow managing configmaps in user namespaces (for workspace preferences)
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
# Allow managing namespaces
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["get", "list", "watch", "create", "update", "patch"]
# Allow reading CheCluster CR (Che Operator configuration source)
# Needed for CheClusterService.getNamespacedCustomObject('org.eclipse.che', 'v2', ..., 'checlusters', ...)
- apiGroups: ["org.eclipse.che"]
  resources: ["checlusters"]
  verbs: ["get", "list", "watch"]
EOF

# Ensure the default user ClusterRole exists (used when creating RoleBindings in user namespaces)
# Some OpenShift installs may not create it by default.
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: che-user-namespace-access
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: user-permission
rules:
  # DevWorkspaces (Che workspaces on Kubernetes/OpenShift)
  - apiGroups: ["workspace.devfile.io"]
    resources: ["devworkspaces", "devworkspacetemplates", "devworkspaceroutings"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  # Basic namespace resources needed by the dashboard / user workflows
  - apiGroups: [""]
    resources: ["pods", "events"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets", "configmaps"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
EOF

# Create ClusterRoleBinding
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: che-server-rolebinding-manager
  labels:
    app.kubernetes.io/part-of: che.eclipse.org
    app.kubernetes.io/component: che-server
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: che-server-rolebinding-manager
subjects:
- kind: ServiceAccount
  name: che
  namespace: ${CHE_NAMESPACE}
EOF

echo ""
echo "[SUCCESS] RBAC permissions configured successfully!"
echo ""
echo "The che-server ServiceAccount can now:"
echo "  - Create/manage RoleBindings in user namespaces"
echo "  - Call TokenReview API (create tokenreviews) to map bearer tokens to usernames"
echo "  - Create/manage Secrets (user-profile) in user namespaces"
echo "  - Create/manage Namespaces"
echo ""
echo "To verify, run:"
echo "  kubectl auth can-i create rolebindings --as=system:serviceaccount:${CHE_NAMESPACE}:che -n admin-che"


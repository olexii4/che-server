#!/bin/bash

# Copyright (c) 2021-2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0

set -e

echo "🔐 Granting DevWorkspace permissions to current user"
echo "=============================================="

# Get current user
CURRENT_USER=$(kubectl config view -o jsonpath='{.contexts[?(@.name == "'$(kubectl config current-context)'")].context.user}')
echo "Current user: $CURRENT_USER"

# Create ClusterRole for DevWorkspace resources
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: devworkspace-admin
rules:
  # DevWorkspace CRDs
  - apiGroups:
      - workspace.devfile.io
    resources:
      - devworkspaces
      - devworkspacetemplates
      - devworkspaceroutings
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch
      - delete
  # DevWorkspace Operator
  - apiGroups:
      - controller.devfile.io
    resources:
      - devworkspaceoperatorconfigs
    verbs:
      - get
      - list
      - watch
EOF

echo "✅ ClusterRole 'devworkspace-admin' created"

# Create ClusterRoleBinding
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: devworkspace-admin-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: devworkspace-admin
subjects:
  - kind: User
    name: $CURRENT_USER
    apiGroup: rbac.authorization.k8s.io
EOF

echo "✅ ClusterRoleBinding 'devworkspace-admin-binding' created"

echo ""
echo "🎉 DevWorkspace permissions granted successfully!"
echo ""
echo "You should now be able to:"
echo "  ✅ List DevWorkspaces"
echo "  ✅ Get DevWorkspace details"
echo "  ✅ Create DevWorkspaces"
echo "  ✅ Update DevWorkspaces"
echo "  ✅ Delete DevWorkspaces"
echo ""
echo "Test with:"
echo "  kubectl get devworkspaces -A"
echo "  curl ... GET /api/namespace/admin-che/devworkspaces"
echo ""


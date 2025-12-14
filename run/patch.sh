#!/usr/bin/env bash
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
# Patch Script for Eclipse Che Server (TypeScript)
#
# This script builds, pushes, and patches the CheCluster with a new che-server image.
#
# Usage:
#   export IMAGE_REGISTRY_HOST=docker.io
#   export IMAGE_REGISTRY_USER_NAME=your-username
#   ./run/patch.sh
#
# Or use the yarn script:
#   yarn patch
#
# Environment Variables:
#   IMAGE_REGISTRY_HOST     - Container registry host (required, e.g., docker.io, quay.io)
#   IMAGE_REGISTRY_USER_NAME - Registry username/namespace (required)
#   IMAGE_TAG               - Custom image tag (optional, default: branch_timestamp)
#   CHE_NAMESPACE           - Kubernetes namespace (optional, default: eclipse-che)
#   CHE_SERVER_IMAGE        - Override full image name (optional)
#

set -euo pipefail

# Validate required environment variables
if [[ -z "$IMAGE_REGISTRY_HOST" ]]; then
  echo '[ERROR] Environment variable IMAGE_REGISTRY_HOST is not set.'
  echo '        Example: export IMAGE_REGISTRY_HOST=docker.io'
  exit 1
fi

if [[ -z "$IMAGE_REGISTRY_USER_NAME" ]]; then
  echo '[ERROR] Environment variable IMAGE_REGISTRY_USER_NAME is not set.'
  echo '        Example: export IMAGE_REGISTRY_USER_NAME=your-username'
  exit 1
fi

# Generate image tag
if [[ -z "$IMAGE_TAG" ]]; then
  # Use git branch name and timestamp
  BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "main")
  IMAGE_TAG="${BRANCH_NAME}_$(date '+%Y_%m_%d_%H_%M_%S')"
fi

# Build full image name
if [[ -z "$CHE_SERVER_IMAGE" ]]; then
  CHE_SERVER_IMAGE="${IMAGE_REGISTRY_HOST}/${IMAGE_REGISTRY_USER_NAME}/che-server:${IMAGE_TAG}"
fi

echo "[INFO] Building new image '${CHE_SERVER_IMAGE}'..."

# Build the image
"${PWD}/scripts/container_tool.sh" build . -f build/dockerfiles/Dockerfile -t "$CHE_SERVER_IMAGE"

echo "[INFO] Pushing image '${CHE_SERVER_IMAGE}'..."

# Push the image
"${PWD}/scripts/container_tool.sh" push "$CHE_SERVER_IMAGE"

echo "[INFO] Patching CheCluster with new che-server image '${CHE_SERVER_IMAGE}'..."

# Get Che namespace
CHE_NAMESPACE="${CHE_NAMESPACE:-eclipse-che}"

# Get the CheCluster name
CHECLUSTER_CR_NAME="$(kubectl get checluster -n "$CHE_NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "eclipse-che")"

# Reuse the shared patch script (handles missing spec.components.cheServer.deployment)
CHE_NAMESPACE="${CHE_NAMESPACE}" CHECLUSTER_NAME="${CHECLUSTER_CR_NAME}" CHE_SERVER_IMAGE="${CHE_SERVER_IMAGE}" \
  "${PWD}/scripts/patch-che-server-image.sh"

echo ""
echo "[SUCCESS] CheCluster patched successfully!"
echo ""
echo "Image: ${CHE_SERVER_IMAGE}"
echo ""
echo "To check the rollout status:"
echo "  kubectl rollout status deployment/che -n ${CHE_NAMESPACE}"
echo ""
echo "To view che-server logs:"
echo "  kubectl logs -n ${CHE_NAMESPACE} -l app=che -f"
echo ""
echo "Done."


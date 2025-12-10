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
# Multi-Architecture Build Script for Eclipse Che Server (TypeScript)
#
# This script builds and pushes multi-architecture Docker images
# supporting AMD64 and ARM64 platforms.
#
# Usage:
#   export IMAGE_REGISTRY_HOST=docker.io
#   export IMAGE_REGISTRY_USER_NAME=your-username
#   ./run/build-multiarch.sh
#
# Or use the yarn script:
#   yarn build:multiarch
#
# Environment Variables:
#   IMAGE_REGISTRY_HOST     - Container registry host (required, e.g., docker.io, quay.io)
#   IMAGE_REGISTRY_USER_NAME - Registry username/namespace (required)
#   PLATFORMS               - Platforms to build (default: linux/amd64,linux/arm64)
#   IMAGE_TAG               - Custom image tag (optional, default: branch_timestamp)
#   CHE_SERVER_IMAGE        - Override full image name (optional)
#

set -e

# Validate required environment variables
if [[ -z "$IMAGE_REGISTRY_HOST" ]]; then
  echo "[ERROR] Environment variable IMAGE_REGISTRY_HOST is not set."
  echo "        Example: export IMAGE_REGISTRY_HOST=docker.io"
  exit 1
fi

if [[ -z "$IMAGE_REGISTRY_USER_NAME" ]]; then
  echo "[ERROR] Environment variable IMAGE_REGISTRY_USER_NAME is not set."
  echo "        Example: export IMAGE_REGISTRY_USER_NAME=your-username"
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

# Platforms to build for
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

# Detect container engine
echo "[INFO] Detecting container engine..."

# Source the container tool script if available
if [ -f "${PWD}/scripts/container_tool.sh" ]; then
  source "${PWD}/scripts/container_tool.sh"
  CONTAINER_ENGINE="$container_engine"
else
  # Fallback detection
  if command -v docker &> /dev/null && docker info &> /dev/null; then
    CONTAINER_ENGINE="docker"
  elif command -v podman &> /dev/null && podman info &> /dev/null; then
    CONTAINER_ENGINE="podman"
  fi
fi

if [ -z "$CONTAINER_ENGINE" ]; then
  echo "[ERROR] Failed to detect container engine."
  echo "[ERROR] Please install Docker or Podman and ensure it's running."
  exit 1
fi

echo "[INFO] Using container engine: ${CONTAINER_ENGINE}"
echo "[INFO] Building multi-architecture image for platforms: ${PLATFORMS}"
echo "[INFO] Target image: ${CHE_SERVER_IMAGE}"
echo ""

if [[ "$CONTAINER_ENGINE" == "docker" ]]; then
  # Docker buildx for multiarch
  echo "[INFO] Setting up Docker buildx..."
  
  # Create buildx builder if it doesn't exist
  BUILDER_NAME="multiarch-builder"
  if ! docker buildx ls | grep -q "$BUILDER_NAME"; then
    echo "[INFO] Creating ${BUILDER_NAME}..."
    docker buildx create --name "$BUILDER_NAME" --use --platform "${PLATFORMS}" --bootstrap
  else
    echo "[INFO] Using existing ${BUILDER_NAME}..."
    docker buildx use "$BUILDER_NAME"
  fi
  
  # Bootstrap the builder
  docker buildx inspect --bootstrap
  
  # Build and push in one command for multiarch
  echo ""
  echo "[INFO] Building and pushing multi-arch image..."
  docker buildx build . \
    -f build/dockerfiles/Dockerfile \
    --platform "${PLATFORMS}" \
    -t "${CHE_SERVER_IMAGE}" \
    --push
    
elif [[ "$CONTAINER_ENGINE" == "podman" ]]; then
  # Podman multiarch build
  echo "[INFO] Building multi-arch image with Podman..."
  
  # Remove existing manifest if it exists
  podman manifest rm "${CHE_SERVER_IMAGE}" 2>/dev/null || true
  
  # Create manifest
  podman manifest create "${CHE_SERVER_IMAGE}"
  
  # Build for each platform
  IFS=',' read -ra PLATFORM_ARRAY <<< "$PLATFORMS"
  for PLATFORM in "${PLATFORM_ARRAY[@]}"; do
    echo ""
    echo "[INFO] Building for platform: ${PLATFORM}"
    podman build . \
      -f build/dockerfiles/Dockerfile \
      --platform "${PLATFORM}" \
      --manifest "${CHE_SERVER_IMAGE}"
  done
  
  # Push manifest
  echo ""
  echo "[INFO] Pushing manifest..."
  podman manifest push "${CHE_SERVER_IMAGE}" "docker://${CHE_SERVER_IMAGE}"
fi

echo ""
echo "=========================================="
echo "[SUCCESS] Multi-arch image built and pushed!"
echo "=========================================="
echo ""
echo "Image: ${CHE_SERVER_IMAGE}"
echo "Platforms: ${PLATFORMS}"
echo ""
echo "To verify the image, run:"
echo "  docker buildx imagetools inspect ${CHE_SERVER_IMAGE}"
echo "  # or"
echo "  skopeo inspect docker://${CHE_SERVER_IMAGE}"
echo ""
echo "To patch CheCluster with this image, run:"
echo "  export CHE_SERVER_IMAGE=${CHE_SERVER_IMAGE}"
echo "  kubectl patch -n eclipse-che 'checluster/eclipse-che' --type=json \\"
echo "    -p='[{\"op\": \"replace\", \"path\": \"/spec/components/cheServer/deployment\", \"value\": {containers: [{image: \"'\"${CHE_SERVER_IMAGE}\"'\", imagePullPolicy: \"Always\", name: \"che-server\"}]}}]'"
echo ""
echo "Or run the patch script:"
echo "  export CHE_SERVER_IMAGE=${CHE_SERVER_IMAGE}"
echo "  ./run/patch.sh"
echo ""


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

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source the container tool script to detect container engine
CONTAINER_TOOL_SCRIPT="$PROJECT_ROOT/scripts/container_tool.sh"

if [ ! -f "$CONTAINER_TOOL_SCRIPT" ]; then
    echo "❌ Error: Container tool script not found at $CONTAINER_TOOL_SCRIPT"
    exit 1
fi

# Source the script to get container_engine variable
source "$CONTAINER_TOOL_SCRIPT"

# Use the detected container engine
CONTAINER_ENGINE="$container_engine"

if [ -z "$CONTAINER_ENGINE" ]; then
    echo "❌ Error: Neither Docker nor Podman is installed or running"
    echo "   Please install Docker or Podman"
    exit 1
fi

# Default values
IMAGE_NAME="${1:-che-server}"
IMAGE_TAG="${2:-latest}"
DOCKERFILE="${3:-build/dockerfiles/Dockerfile}"

echo "Container engine: $CONTAINER_ENGINE"
echo "Building multiplatform image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Using Dockerfile: ${DOCKERFILE}"
echo "Platforms: linux/amd64, linux/arm64"
echo ""

cd "$PROJECT_ROOT"

# Build based on container engine
if [ "$CONTAINER_ENGINE" = "docker" ]; then
    # Ensure buildx builder exists
    if ! docker buildx inspect multiplatform-builder &> /dev/null; then
      echo "Creating buildx builder 'multiplatform-builder'..."
      docker buildx create --name multiplatform-builder --use
      docker buildx inspect --bootstrap
    fi

    echo "Building and pushing multiplatform image..."
    docker buildx build \
      --platform linux/amd64,linux/arm64 \
      -f "${DOCKERFILE}" \
      -t "${IMAGE_NAME}:${IMAGE_TAG}" \
      --push \
      .
elif [ "$CONTAINER_ENGINE" = "podman" ]; then
    echo "Building multiplatform image with Podman..."
    podman build \
      --platform linux/amd64,linux/arm64 \
      -f "${DOCKERFILE}" \
      -t "${IMAGE_NAME}:${IMAGE_TAG}" \
      --manifest "${IMAGE_NAME}:${IMAGE_TAG}" \
      .
    
    echo "Pushing manifest to registry..."
    podman manifest push "${IMAGE_NAME}:${IMAGE_TAG}" "docker://${IMAGE_NAME}:${IMAGE_TAG}"
fi

echo ""
echo "✅ Multiplatform build complete: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "   Platforms: linux/amd64, linux/arm64"
echo "   Image has been pushed to registry"

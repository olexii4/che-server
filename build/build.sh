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
# Build Script for Eclipse Che Server (TypeScript)
#
# Usage:
#   # Using positional arguments (legacy):
#   ./build/build.sh [IMAGE_NAME] [IMAGE_TAG] [PLATFORMS]
#
#   # Using environment variables (recommended):
#   export IMAGE_REGISTRY_HOST=docker.io
#   export IMAGE_REGISTRY_USER_NAME=your-username
#   export IMAGE_TAG=next
#   ./build/build.sh
#
# Environment Variables:
#   IMAGE_REGISTRY_HOST     - Container registry host (default: docker.io)
#   IMAGE_REGISTRY_USER_NAME - Registry username/namespace (default: olexii4dockerid)
#   IMAGE_TAG               - Image tag (default: next)
#   PLATFORMS               - Platforms to build (default: linux/amd64,linux/arm64)
#

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

# Use the detected container engine (set by container_tool.sh)
CONTAINER_ENGINE="$container_engine"

if [ -z "$CONTAINER_ENGINE" ]; then
    echo "❌ Error: Neither Docker nor Podman is installed or running"
    echo "   Please install Docker or Podman"
    exit 1
fi

# Build image name from environment variables or positional arguments
# Priority: positional args > env vars > defaults
if [ -n "$1" ]; then
    # Legacy positional argument mode
    IMAGE_NAME="$1"
    IMAGE_TAG="${2:-next}"
else
    # Environment variable mode
    REGISTRY_HOST="${IMAGE_REGISTRY_HOST:-docker.io}"
    REGISTRY_USER="${IMAGE_REGISTRY_USER_NAME:-olexii4dockerid}"
    IMAGE_TAG="${IMAGE_TAG:-next}"
    IMAGE_NAME="${REGISTRY_HOST}/${REGISTRY_USER}/che-server"
fi

PLATFORMS="${3:-${PLATFORMS:-linux/amd64,linux/arm64}}"

echo "Container engine: $CONTAINER_ENGINE"
echo "Building ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Platforms: ${PLATFORMS}"
echo "Using Dockerfile: build/dockerfiles/Dockerfile"
echo ""

cd "$PROJECT_ROOT"

# Build based on container engine
if [ "$CONTAINER_ENGINE" = "podman" ]; then
    echo "📦 Building with Podman..."
    
    # Podman supports multiplatform builds natively
    podman build \
      --platform "${PLATFORMS}" \
      -f build/dockerfiles/Dockerfile \
      -t "${IMAGE_NAME}:${IMAGE_TAG}" \
      --manifest "${IMAGE_NAME}:${IMAGE_TAG}" \
      .
    
    echo ""
    echo "📤 Pushing manifest to registry..."
    podman manifest push "${IMAGE_NAME}:${IMAGE_TAG}" "docker://${IMAGE_NAME}:${IMAGE_TAG}"
    
elif [ "$CONTAINER_ENGINE" = "docker" ]; then
    echo "📦 Building with Docker Buildx..."
    
    # Ensure buildx is available
    if ! docker buildx version &> /dev/null; then
        echo "❌ Error: docker buildx is not available"
        echo "   Please install Docker Desktop or enable buildx"
        exit 1
    fi
    
    # Create and use a new builder instance if it doesn't exist
    if ! docker buildx inspect multiarch-builder &> /dev/null; then
        echo "📦 Creating multiarch-builder instance..."
        docker buildx create --name multiarch-builder --use --driver docker-container --bootstrap
    else
        echo "📦 Using existing multiarch-builder instance..."
        docker buildx use multiarch-builder
    fi
    
    # Build and push the multiplatform Docker image
    docker buildx build \
      --platform "${PLATFORMS}" \
      -f build/dockerfiles/Dockerfile \
      -t "${IMAGE_NAME}:${IMAGE_TAG}" \
      --push \
      .
fi

echo ""
echo "✅ Multiplatform build complete: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "   Platforms: ${PLATFORMS}"
echo "   Container engine: $CONTAINER_ENGINE"
echo ""
echo "To pull the image:"
echo "  $CONTAINER_ENGINE pull ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "To run the image:"
echo "  $CONTAINER_ENGINE run -p 8080:8080 ${IMAGE_NAME}:${IMAGE_TAG}"

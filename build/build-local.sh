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

echo "Container engine: $CONTAINER_ENGINE"
echo "Building ${IMAGE_NAME}:${IMAGE_TAG} (local only, no push)"
echo "Using Dockerfile: build/dockerfiles/Dockerfile"
echo ""

cd "$PROJECT_ROOT"

# Build the image for local use (no multiplatform)
$CONTAINER_ENGINE build \
  -f build/dockerfiles/Dockerfile \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  .

echo ""
echo "✅ Local build complete: ${IMAGE_NAME}:${IMAGE_TAG}"


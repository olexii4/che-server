#!/bin/sh
#
# Copyright (c) 2018-2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#
# Usage:
#   1. As standalone script: ./container_tool.sh build ...
#   2. Source in other scripts: source container_tool.sh (sets $container_engine)

# Function to check if a command is available
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect container engine (Podman or Docker)
detect_container_engine() {
    local engine=""
    
    # Check for Podman
    if command_exists "podman"; then
        # Check if Podman machine is running
        if podman info &>/dev/null; then
            engine="podman"
        fi
    fi
    
    # Check for Docker if Podman not found
    if [ -z "$engine" ]; then
        if command_exists "docker"; then
            # Check if Docker daemon is running
            if docker info &>/dev/null; then
                engine="docker"
            fi
        fi
    fi
    
    echo "$engine"
}

# Set container_engine variable (can be sourced by other scripts)
container_engine=$(detect_container_engine)

# If neither Podman nor Docker is found or running
if [ -z "$container_engine" ]; then
    # Only error if running as standalone script (not sourced)
    if [ "${BASH_SOURCE[0]}" = "${0}" ] || [ -z "${BASH_SOURCE[0]}" ]; then
        echo "❌ Error: Neither Podman nor Docker is installed or running."
        exit 1
    fi
    # When sourced, just set empty and let caller handle it
    return 0 2>/dev/null || true
fi

# Run command using Docker or Podman whichever is available
container_tool() {
    local command=$1
    shift

    echo "Container engine: $container_engine"
    "$container_engine" "$command" "$@"
}

# Main script execution (only when run directly, not when sourced)
if [ "${BASH_SOURCE[0]}" = "${0}" ] || [ -z "${BASH_SOURCE[0]}" ]; then
    case "$1" in
    build | run | push)
        set -e
        container_tool "$@"
        ;;
    *)
        echo "Unknown command. Use: build, run, or push."
        exit 1
        ;;
    esac
    
    exit 0
fi

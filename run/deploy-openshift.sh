#!/bin/bash
#
# Copyright (c) 2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Deploy Eclipse Che on OpenShift with custom che-server image using chectl
# https://github.com/che-incubator/chectl
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
export IMAGE_REGISTRY_HOST="${IMAGE_REGISTRY_HOST:-docker.io}"
export IMAGE_REGISTRY_USER_NAME="${IMAGE_REGISTRY_USER_NAME:-olexii4dockerid}"
export IMAGE_TAG="${IMAGE_TAG:-next}"
export CHE_NAMESPACE="${CHE_NAMESPACE:-eclipse-che}"

# Computed image name (can be overridden by CHE_SERVER_IMAGE env var)
CHE_SERVER_IMAGE="${CHE_SERVER_IMAGE:-${IMAGE_REGISTRY_HOST}/${IMAGE_REGISTRY_USER_NAME}/che-server:${IMAGE_TAG}}"

# chectl installation channel
CHECTL_CHANNEL="${CHECTL_CHANNEL:-next}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy Eclipse Che on OpenShift with a custom che-server image using chectl.

Options:
    -i, --image IMAGE       Full image name (overrides IMAGE_REGISTRY_HOST/IMAGE_REGISTRY_USER_NAME/IMAGE_TAG)
    -t, --tag TAG           Image tag (default: next)
    -n, --namespace NS      Eclipse Che namespace (default: eclipse-che)
    -b, --build             Build and push the image before deploying
    -u, --update            Update existing deployment instead of fresh deploy
    -p, --patch-only        Only patch existing deployment (skip chectl deploy)
    --skip-build            Skip image build (use existing image)
    --chectl-channel CH     chectl installation channel: stable, next (default: next)
    -h, --help              Show this help message

Environment variables:
    IMAGE_REGISTRY_HOST       Registry host (default: docker.io)
    IMAGE_REGISTRY_USER_NAME  Registry username (default: olexii4dockerid)
    IMAGE_TAG                 Image tag (default: next)
    CHE_NAMESPACE             Eclipse Che namespace (default: eclipse-che)
    CHE_SERVER_IMAGE          Full image override (takes precedence over individual vars)
    CHECTL_CHANNEL            chectl installation channel (default: next)

Examples:
    # Deploy with default image
    $0

    # Deploy with custom image
    $0 --image quay.io/myuser/che-server:latest

    # Build, push and deploy
    $0 --build

    # Update existing deployment
    $0 --update

    # Only patch existing deployment (no chectl)
    $0 --patch-only

    # Use custom registry via environment
    IMAGE_REGISTRY_HOST=quay.io IMAGE_REGISTRY_USER_NAME=myuser $0 --build
EOF
    exit 0
}

# Parse arguments
BUILD_IMAGE=false
UPDATE_MODE=false
PATCH_ONLY=false
CUSTOM_IMAGE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--image)
            CUSTOM_IMAGE="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -n|--namespace)
            CHE_NAMESPACE="$2"
            shift 2
            ;;
        -b|--build)
            BUILD_IMAGE=true
            shift
            ;;
        -u|--update)
            UPDATE_MODE=true
            shift
            ;;
        -p|--patch-only)
            PATCH_ONLY=true
            shift
            ;;
        --skip-build)
            BUILD_IMAGE=false
            shift
            ;;
        --chectl-channel)
            CHECTL_CHANNEL="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Use custom image if provided
if [[ -n "$CUSTOM_IMAGE" ]]; then
    CHE_SERVER_IMAGE="$CUSTOM_IMAGE"
fi

print_info "Configuration:"
echo "  CHE_SERVER_IMAGE: ${CHE_SERVER_IMAGE}"
echo "  CHE_NAMESPACE: ${CHE_NAMESPACE}"
echo "  BUILD_IMAGE: ${BUILD_IMAGE}"
echo "  UPDATE_MODE: ${UPDATE_MODE}"
echo "  PATCH_ONLY: ${PATCH_ONLY}"
echo ""

# Check if logged into OpenShift
check_openshift_login() {
    if ! command -v oc &>/dev/null; then
        print_error "OpenShift CLI (oc) not found. Please install it first."
        exit 1
    fi
    
    if ! oc whoami &>/dev/null; then
        print_error "Not logged into OpenShift. Please run 'oc login' first."
        exit 1
    fi
    print_info "Logged in as: $(oc whoami)"
    print_info "Cluster: $(oc whoami --show-server)"
}

# Check if chectl is installed, install if needed
ensure_chectl() {
    if command -v chectl &>/dev/null; then
        print_info "chectl is already installed: $(chectl --version 2>/dev/null | head -1)"
        return
    fi
    
    print_info "chectl not found. Installing from channel: ${CHECTL_CHANNEL}..."
    
    # Install chectl using the official installer
    # https://github.com/che-incubator/chectl
    bash <(curl -sL https://che-incubator.github.io/chectl/install.sh) --channel="${CHECTL_CHANNEL}"
    
    # Verify installation
    if ! command -v chectl &>/dev/null; then
        print_error "Failed to install chectl"
        exit 1
    fi
    
    print_info "chectl installed successfully: $(chectl --version 2>/dev/null | head -1)"
}

# Build and push image
build_and_push_image() {
    print_info "Building and pushing image: ${CHE_SERVER_IMAGE}"
    
    cd "$PROJECT_ROOT"
    
    # Build TypeScript
    yarn build
    
    # Build container image
    if command -v podman &>/dev/null; then
        podman build -f build/dockerfiles/Dockerfile -t "${CHE_SERVER_IMAGE}" .
        podman push "${CHE_SERVER_IMAGE}"
    elif command -v docker &>/dev/null; then
        docker build -f build/dockerfiles/Dockerfile -t "${CHE_SERVER_IMAGE}" .
        docker push "${CHE_SERVER_IMAGE}"
    else
        print_error "Neither podman nor docker found"
        exit 1
    fi
    
    print_info "Image pushed: ${CHE_SERVER_IMAGE}"
}

# Create cr-patch.yaml with custom image
create_cr_patch() {
    local patch_file="${PROJECT_ROOT}/cr-patch-generated.yaml"
    
    cat > "$patch_file" << EOF
# Auto-generated CheCluster patch for custom che-server image
# Generated at: $(date -Iseconds)
kind: CheCluster
apiVersion: org.eclipse.che/v2
spec:
  components:
    cheServer:
      deployment:
        containers:
          - image: '${CHE_SERVER_IMAGE}'
            imagePullPolicy: Always
            name: che-server
EOF

    echo "$patch_file"
}

# Deploy Eclipse Che using chectl
deploy_che() {
    print_info "Deploying Eclipse Che on OpenShift..."
    
    local patch_file
    patch_file=$(create_cr_patch)
    
    print_info "Using CR patch file: ${patch_file}"
    cat "$patch_file"
    echo ""
    
    # Deploy using chectl
    # https://github.com/che-incubator/chectl
    chectl server:deploy \
        --platform=openshift \
        --che-operator-cr-patch-yaml="$patch_file" \
        --chenamespace="$CHE_NAMESPACE" \
        --batch \
        --telemetry=off
    
    print_info "Eclipse Che deployed successfully!"
    
    # Show status
    chectl server:status --chenamespace="$CHE_NAMESPACE" || true
}

# Update existing Eclipse Che deployment using chectl
update_che() {
    print_info "Updating Eclipse Che on OpenShift..."
    
    local patch_file
    patch_file=$(create_cr_patch)
    
    print_info "Using CR patch file: ${patch_file}"
    cat "$patch_file"
    echo ""
    
    # Update using chectl
    # https://github.com/che-incubator/chectl
    chectl server:update \
        --che-operator-cr-patch-yaml="$patch_file" \
        --chenamespace="$CHE_NAMESPACE" \
        --batch \
        --yes \
        --telemetry=off
    
    print_info "Eclipse Che updated successfully!"
    
    # Show status
    chectl server:status --chenamespace="$CHE_NAMESPACE" || true
}

# Patch only (using oc directly, no chectl)
patch_only() {
    print_info "Patching CheCluster with custom che-server image..."
    
    # Check if CheCluster exists
    if ! oc get checluster eclipse-che -n "$CHE_NAMESPACE" &>/dev/null; then
        print_error "CheCluster 'eclipse-che' not found in namespace '$CHE_NAMESPACE'"
        print_error "Please deploy Eclipse Che first using: $0 (without --patch-only)"
        exit 1
    fi
    
    # Patch the CheCluster
    oc patch checluster eclipse-che -n "$CHE_NAMESPACE" --type=merge -p "
spec:
  components:
    cheServer:
      deployment:
        containers:
          - image: '${CHE_SERVER_IMAGE}'
            imagePullPolicy: Always
            name: che-server
"
    
    print_info "CheCluster patched. Restarting che-server pod..."
    
    # Delete the pod to force re-pull
    oc delete pod -n "$CHE_NAMESPACE" -l component=che-server --ignore-not-found=true
    
    # Wait for new pod
    print_info "Waiting for new che-server pod..."
    oc wait --for=condition=ready pod -n "$CHE_NAMESPACE" -l component=che-server --timeout=120s || true
    
    print_info "che-server patched and restarted"
}

# Main
main() {
    check_openshift_login
    
    if [[ "$BUILD_IMAGE" == "true" ]]; then
        build_and_push_image
    fi
    
    if [[ "$PATCH_ONLY" == "true" ]]; then
        patch_only
    else
        ensure_chectl
        
        if [[ "$UPDATE_MODE" == "true" ]]; then
            update_che
        else
            deploy_che
        fi
    fi
    
    print_info "Deployment complete!"
}

main

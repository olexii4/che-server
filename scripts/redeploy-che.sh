#!/usr/bin/env bash
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
# Simple redeploy helper for Eclipse Che on an existing cluster.
# - Patches CheCluster to use a custom che-server image
# - Restarts the che pod so it re-reads CheCluster CR/config if needed
#
# Usage:
#   ./scripts/redeploy-che.sh
#   ./scripts/redeploy-che.sh --image docker.io/olexii4dockerid/che-server:next
#   ./scripts/redeploy-che.sh --deploy-che --platform openshift
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHE_NAMESPACE="${CHE_NAMESPACE:-eclipse-che}"
CHECLUSTER_NAME="${CHECLUSTER_NAME:-eclipse-che}"
CHE_SERVER_IMAGE="${CHE_SERVER_IMAGE:-docker.io/olexii4dockerid/che-server:next}"

DEPLOY_CHE=false
CHECTL_PLATFORM="${CHECTL_PLATFORM:-openshift}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --image IMAGE          che-server image to use (default: ${CHE_SERVER_IMAGE})
  --namespace NS         Che namespace (default: ${CHE_NAMESPACE})
  --checluster NAME      CheCluster name (default: ${CHECLUSTER_NAME})
  --deploy-che           Run 'chectl server:deploy' first
  --platform PLATFORM    chectl platform (default: ${CHECTL_PLATFORM}) e.g. openshift, kubernetes
  -h, --help             Show help

Environment:
  CHE_SERVER_IMAGE, CHE_NAMESPACE, CHECLUSTER_NAME
  CHECTL_PLATFORM
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image) CHE_SERVER_IMAGE="$2"; shift 2 ;;
    --namespace) CHE_NAMESPACE="$2"; shift 2 ;;
    --checluster) CHECLUSTER_NAME="$2"; shift 2 ;;
    --deploy-che) DEPLOY_CHE=true; shift ;;
    --platform) CHECTL_PLATFORM="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

need_cmd kubectl

CURRENT_CONTEXT="$(kubectl config current-context 2>/dev/null || true)"
if [[ -z "${CURRENT_CONTEXT}" ]]; then
  echo "kubectl has no current context. Configure kubeconfig first." >&2
  exit 1
fi

echo "Context: ${CURRENT_CONTEXT}"
echo "Che namespace: ${CHE_NAMESPACE}"
echo "CheCluster: ${CHECLUSTER_NAME}"
echo "che-server image: ${CHE_SERVER_IMAGE}"

if [[ "${DEPLOY_CHE}" == "true" ]]; then
  need_cmd chectl
  echo ""
  echo "Deploying Che with chectl..."
  chectl server:deploy --platform="${CHECTL_PLATFORM}" --batch
fi

echo ""
echo "Patching CheCluster to use custom che-server image..."
kubectl patch "checluster/${CHECLUSTER_NAME}" -n "${CHE_NAMESPACE}" --type=merge \
  -p "{\"spec\":{\"components\":{\"cheServer\":{\"deployment\":{\"containers\":[{\"image\":\"${CHE_SERVER_IMAGE}\",\"imagePullPolicy\":\"Always\",\"name\":\"che-server\"}]}}}}}"

echo ""
echo "Restarting che pod (so che-server re-reads CR/config if needed)..."
kubectl delete pod -n "${CHE_NAMESPACE}" -l app=che,component=che >/dev/null 2>&1 || true
kubectl wait -n "${CHE_NAMESPACE}" --for=condition=Ready pod -l app=che,component=che --timeout=180s

echo ""
CHE_URL="$(kubectl get checluster "${CHECLUSTER_NAME}" -n "${CHE_NAMESPACE}" -o jsonpath='{.status.cheURL}' 2>/dev/null || true)"
CHE_IMAGE="$(kubectl get deployment che -n "${CHE_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)"

echo "Che URL: ${CHE_URL:-<pending>}"
echo "che deployment image: ${CHE_IMAGE:-<unknown>}"
echo ""
echo "Done."


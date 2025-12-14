#!/usr/bin/env bash
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
# Start che-server locally in LOCAL_RUN mode.
#
# Usage:
#   ./run/start-local-dev.sh
#
set -euo pipefail

echo "Starting che-server in LOCAL_RUN mode"
echo "====================================="
echo ""

if [[ ! -f "${HOME}/.kube/config" ]]; then
  echo "[WARN] ~/.kube/config not found; ensure you have a valid kubeconfig"
  echo ""
fi

if command -v kubectl >/dev/null 2>&1; then
  if kubectl cluster-info >/dev/null 2>&1; then
    echo "[INFO] Connected to Kubernetes cluster:"
    kubectl cluster-info 2>/dev/null | head -1 || true
    echo ""
  else
    echo "[WARN] Not connected to a Kubernetes cluster (kubectl cluster-info failed)"
    echo ""
  fi
else
  echo "[WARN] kubectl not found; local dev may not work as expected"
  echo ""
fi

echo "Environment:"
echo "  LOCAL_RUN=true"
echo "  NODE_ENV=development"
echo ""

if command -v lsof >/dev/null 2>&1; then
  if lsof -ti tcp:8080 >/dev/null 2>&1; then
    echo "[INFO] Stopping existing process on port 8080..."
    lsof -ti tcp:8080 | xargs kill 2>/dev/null || true
    sleep 1
  fi
fi

if [[ -z "${USER_TOKEN:-}" && -z "${SERVICE_ACCOUNT_TOKEN:-}" ]]; then
  echo "[WARN] USER_TOKEN not set."
  echo "       Some local flows may require a token with cluster permissions."
  echo "       Example (OpenShift): export USER_TOKEN=\$(oc whoami -t)"
  echo ""
fi

export LOCAL_RUN=true

echo "[INFO] Building server..."
yarn build:dev

SWAGGER_URL="http://localhost:8080/swagger"
HEALTH_URL="http://localhost:8080/health"

print_swagger_when_ready() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "[INFO] Swagger UI: ${SWAGGER_URL}"
    return 0
  fi

  # Wait until the server is reachable, then print Swagger UI URL once.
  for _ in $(seq 1 120); do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
      echo ""
      echo "[INFO] Swagger UI: ${SWAGGER_URL}"
      echo ""
      return 0
    fi
    sleep 0.25
  done

  # If health never became reachable, still print the URL (it may come up later).
  echo "[INFO] Swagger UI: ${SWAGGER_URL}"
}

echo "[INFO] Starting server..."
print_swagger_when_ready &
yarn start:debug



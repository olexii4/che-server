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
# Patch the Eclipse CheCluster to use a custom che-server image.
#
# This avoids the `chectl --che-operator-cr-patch-yaml` templating pitfalls:
# chectl does NOT run envsubst on YAML patches, so `${VAR}` placeholders break.
#
# Usage:
#   ./scripts/patch-che-server-image.sh
#   CHE_SERVER_IMAGE=docker.io/olexii4dockerid/che-server:next ./scripts/patch-che-server-image.sh
#   CHE_NAMESPACE=eclipse-che CHECLUSTER_NAME=eclipse-che ./scripts/patch-che-server-image.sh
#
set -euo pipefail

CHE_NAMESPACE="${CHE_NAMESPACE:-eclipse-che}"
CHECLUSTER_NAME="${CHECLUSTER_NAME:-eclipse-che}"
CHE_SERVER_IMAGE="${CHE_SERVER_IMAGE:-docker.io/olexii4dockerid/che-server:next}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }
need_cmd kubectl
need_cmd jq

echo "[INFO] Patching CheCluster/${CHECLUSTER_NAME} in namespace ${CHE_NAMESPACE}"
echo "[INFO] che-server image: ${CHE_SERVER_IMAGE}"

CHECLUSTER_JSON="$(kubectl get checluster -n "${CHE_NAMESPACE}" "${CHECLUSTER_NAME}" -o json)"

# If spec.components.cheServer.deployment.containers[0].image doesn't exist, jq returns "null".
CURRENT_IMAGE="$(echo "${CHECLUSTER_JSON}" | jq -r '.spec.components.cheServer.deployment.containers[0].image // "null"')"
HAS_CHESERVER="$(echo "${CHECLUSTER_JSON}" | jq -r '.spec.components.cheServer != null')"
HAS_DEPLOYMENT="$(echo "${CHECLUSTER_JSON}" | jq -r '.spec.components.cheServer.deployment != null')"

if [[ "${HAS_CHESERVER}" != "true" ]]; then
  # Extremely defensive: CheCluster should always have cheServer, but handle it anyway.
  kubectl patch -n "${CHE_NAMESPACE}" "checluster/${CHECLUSTER_NAME}" --type=json \
    -p="[{\"op\":\"add\",\"path\":\"/spec/components/cheServer\",\"value\":{\"deployment\":{\"containers\":[{\"image\":\"${CHE_SERVER_IMAGE}\",\"imagePullPolicy\":\"Always\",\"name\":\"che-server\"}]}}}]"
elif [[ "${HAS_DEPLOYMENT}" != "true" || "${CURRENT_IMAGE}" == "null" ]]; then
  # Default CheCluster often has cheServer without 'deployment'. Add the missing field.
  kubectl patch -n "${CHE_NAMESPACE}" "checluster/${CHECLUSTER_NAME}" --type=json \
    -p="[{\"op\":\"add\",\"path\":\"/spec/components/cheServer/deployment\",\"value\":{\"containers\":[{\"image\":\"${CHE_SERVER_IMAGE}\",\"imagePullPolicy\":\"Always\",\"name\":\"che-server\"}]}}]"
else
  # Deployment exists; just replace the image.
  kubectl patch -n "${CHE_NAMESPACE}" "checluster/${CHECLUSTER_NAME}" --type=json \
    -p="[{\"op\":\"replace\",\"path\":\"/spec/components/cheServer/deployment/containers/0/image\",\"value\":\"${CHE_SERVER_IMAGE}\"},{\"op\":\"replace\",\"path\":\"/spec/components/cheServer/deployment/containers/0/imagePullPolicy\",\"value\":\"Always\"}]"
fi

echo "[INFO] Patch applied."
echo "[INFO] Current CheCluster che-server image:"
kubectl get checluster -n "${CHE_NAMESPACE}" "${CHECLUSTER_NAME}" -o jsonpath='{.spec.components.cheServer.deployment.containers[0].image}{"\n"}' || true

echo "[INFO] Restarting che pod to pick up the new image (operator will reconcile as needed)..."
kubectl delete pod -n "${CHE_NAMESPACE}" -l app=che,component=che --ignore-not-found=true >/dev/null 2>&1 || true

echo "[SUCCESS] Done."



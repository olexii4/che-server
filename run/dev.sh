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
# Legacy local-dev helper that enforces SERVICE_ACCOUNT_TOKEN and then runs `yarn dev`.
#
# Prefer `./run/start-local-dev.sh` for the main local dev flow.
#
set -euo pipefail

echo "Starting che-server in LOCAL DEV mode"
echo "====================================="
echo ""

if [[ -z "${SERVICE_ACCOUNT_TOKEN:-}" ]]; then
  echo "[ERROR] SERVICE_ACCOUNT_TOKEN not set!"
  echo ""
  echo "Required for some cluster operations."
  echo "Example (OpenShift): export SERVICE_ACCOUNT_TOKEN=\$(oc whoami -t)"
  echo ""
  exit 1
fi

echo "[INFO] SERVICE_ACCOUNT_TOKEN is set (last 20 chars): ***...${SERVICE_ACCOUNT_TOKEN: -20}"
echo ""

export LOCAL_RUN=true
export NODE_ENV=development

echo "[INFO] Running: yarn dev"
yarn dev



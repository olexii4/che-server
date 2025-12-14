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

set -euo pipefail

# Simple smoke tests for che-server (Node.js) endpoints.
#
# Notes:
# - When running che-server locally via ./run/start-local-dev.sh, you typically need:
#     export USER_TOKEN="$(oc whoami -t)"
#   otherwise namespace endpoints may fail because che-server can't talk to the cluster API.
# - For local testing, che-server supports a "test" Bearer token format:
#     Authorization: Bearer <userid>:<username>

API_URL="${API_URL:-http://localhost:8080/api}"
USERNAME="${USERNAME:-johndoe}"
USERID="${USERID:-user123}"
USE_OC_TOKEN="${USE_OC_TOKEN:-false}"

# Optional: auto-load a real cluster token for Kubernetes operations in LOCAL_RUN mode.
# This sets USER_TOKEN (preferred) so che-server can talk to the cluster API.
# It does NOT replace the request "test bearer" identity (user123:johndoe) unless you also set REAL_BEARER_TOKEN.
if [[ "${USE_OC_TOKEN}" == "true" && -z "${USER_TOKEN:-}" ]]; then
  if command -v oc >/dev/null 2>&1; then
    if oc whoami -t >/dev/null 2>&1; then
      export USER_TOKEN="$(oc whoami -t)"
      echo "[INFO] USER_TOKEN set from 'oc whoami -t' (length: ${#USER_TOKEN})"
      echo ""
    else
      echo "[WARN] USE_OC_TOKEN=true but 'oc whoami -t' failed (not logged in?)"
      echo ""
    fi
  else
    echo "[WARN] USE_OC_TOKEN=true but 'oc' command not found"
    echo ""
  fi
fi

# Request authentication header:
# - default: che-server "test bearer" format (stable user identity for namespace naming)
# - optional: set REAL_BEARER_TOKEN to use an actual token for Authorization header
AUTH_HEADER_VALUE="${REAL_BEARER_TOKEN:-${USERID}:${USERNAME}}"

echo "Testing che-server API at: ${API_URL}"
echo "================================================"
echo ""

# Color codes for output (optional)
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 0: System State (no auth)
echo -e "${BLUE}Test 0: System State${NC}"
echo "GET $API_URL/system/state"
RESPONSE=$(curl -s "$API_URL/system/state")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 1: Provision Namespace (Bearer token - test format)
echo -e "${BLUE}Test 1: Provision Namespace (Bearer Token)${NC}"
echo "POST $API_URL/kubernetes/namespace/provision"
echo "Authorization: Bearer ${AUTH_HEADER_VALUE}"
RESPONSE=$(curl -s -X POST $API_URL/kubernetes/namespace/provision \
  -H "Authorization: Bearer ${AUTH_HEADER_VALUE}" \
  -H "Content-Type: application/json")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 3: List Namespaces
echo -e "${BLUE}Test 3: List Namespaces${NC}"
echo "GET $API_URL/kubernetes/namespace"
echo "Authorization: Bearer ${AUTH_HEADER_VALUE}"
RESPONSE=$(curl -s $API_URL/kubernetes/namespace \
  -H "Authorization: Bearer ${AUTH_HEADER_VALUE}")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 4: Unauthorized Request
echo -e "${BLUE}Test 4: Unauthorized Request (No Auth Header)${NC}"
echo "POST $API_URL/kubernetes/namespace/provision"
RESPONSE=$(curl -s -X POST $API_URL/kubernetes/namespace/provision \
  -H "Content-Type: application/json")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 5: Different Users
echo -e "${BLUE}Test 5: Provision for Different User${NC}"
echo "POST $API_URL/kubernetes/namespace/provision"
echo "Authorization: Bearer user456:janedoe"
RESPONSE=$(curl -s -X POST $API_URL/kubernetes/namespace/provision \
  -H "Authorization: Bearer user456:janedoe" \
  -H "Content-Type: application/json")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 6: Resolve Factory
echo -e "${BLUE}Test 6: Resolve Factory from URL${NC}"
echo "POST $API_URL/factory/resolver"
echo "Authorization: Bearer ${AUTH_HEADER_VALUE}"
RESPONSE=$(curl -s -X POST $API_URL/factory/resolver \
  -H "Authorization: Bearer ${AUTH_HEADER_VALUE}" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://raw.githubusercontent.com/eclipse/che/main/devfile.yaml"}')
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 7: Resolve Factory with Validation
echo -e "${BLUE}Test 7: Resolve Factory with Validation${NC}"
echo "POST $API_URL/factory/resolver?validate=true"
RESPONSE=$(curl -s -X POST "$API_URL/factory/resolver?validate=true" \
  -H "Authorization: Bearer ${AUTH_HEADER_VALUE}" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/devfile.yaml"}')
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 8: Refresh Factory Token
echo -e "${BLUE}Test 8: Refresh Factory Token${NC}"
echo "POST $API_URL/factory/token/refresh?url=https://github.com/user/repo"
RESPONSE=$(curl -s -X POST "$API_URL/factory/token/refresh?url=https://github.com/user/repo" \
  -H "Authorization: Bearer ${AUTH_HEADER_VALUE}" \
  -H "Content-Type: application/json")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 10: Resolve Factory without Parameters (should fail)
echo -e "${BLUE}Test 10: Resolve Factory without Parameters (Error Test)${NC}"
echo "POST $API_URL/factory/resolver"
RESPONSE=$(curl -s -X POST $API_URL/factory/resolver \
  -H "Authorization: Bearer ${AUTH_HEADER_VALUE}" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "Note: If you see errors, make sure:"
echo "  1. The API server is running (use ./run/start-local-dev.sh)"
echo "  2. jq is installed for pretty JSON output (optional)"
echo "  3. For local runs: export USER_TOKEN=\"\$(oc whoami -t)\""


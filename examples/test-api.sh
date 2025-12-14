#!/usr/bin/env bash

set -euo pipefail

# Simple smoke tests for che-server (Node.js) endpoints.
#
# Notes:
# - When running che-server locally via ./run/start-local-dev.sh, you typically need:
#     export SERVICE_ACCOUNT_TOKEN="$(oc whoami -t)"
#   otherwise namespace endpoints may fail because che-server can't talk to the cluster API.
# - For local testing, che-server supports a "test" Bearer token format:
#     Authorization: Bearer <userid>:<username>

API_URL="${API_URL:-http://localhost:8080/api}"
USERNAME="${USERNAME:-johndoe}"
USERID="${USERID:-user123}"

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
echo "Authorization: Bearer $USERID:$USERNAME"
RESPONSE=$(curl -s -X POST $API_URL/kubernetes/namespace/provision \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 3: List Namespaces
echo -e "${BLUE}Test 3: List Namespaces${NC}"
echo "GET $API_URL/kubernetes/namespace"
echo "Authorization: Bearer $USERID:$USERNAME"
RESPONSE=$(curl -s $API_URL/kubernetes/namespace \
  -H "Authorization: Bearer $USERID:$USERNAME")
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
echo "Authorization: Bearer $USERID:$USERNAME"
RESPONSE=$(curl -s -X POST $API_URL/factory/resolver \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://raw.githubusercontent.com/eclipse/che/main/devfile.yaml"}')
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 7: Resolve Factory with Validation
echo -e "${BLUE}Test 7: Resolve Factory with Validation${NC}"
echo "POST $API_URL/factory/resolver?validate=true"
RESPONSE=$(curl -s -X POST "$API_URL/factory/resolver?validate=true" \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/devfile.yaml"}')
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 8: Refresh Factory Token
echo -e "${BLUE}Test 8: Refresh Factory Token${NC}"
echo "POST $API_URL/factory/token/refresh?url=https://github.com/user/repo"
RESPONSE=$(curl -s -X POST "$API_URL/factory/token/refresh?url=https://github.com/user/repo" \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 10: Resolve Factory without Parameters (should fail)
echo -e "${BLUE}Test 10: Resolve Factory without Parameters (Error Test)${NC}"
echo "POST $API_URL/factory/resolver"
RESPONSE=$(curl -s -X POST $API_URL/factory/resolver \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "Note: If you see errors, make sure:"
echo "  1. The API server is running (use ./run/start-local-dev.sh)"
echo "  2. jq is installed for pretty JSON output (optional)"
echo "  3. For local runs: export SERVICE_ACCOUNT_TOKEN=\"\$(oc whoami -t)\""


#!/bin/bash

# Test script for Eclipse Che Next API Server
# This script demonstrates how to use the API endpoints

API_URL="http://localhost:8080"
USERNAME="johndoe"
USERID="user123"

echo "🧪 Testing Eclipse Che Next API Server"
echo "================================================"
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo -e "${BLUE}Test 1: Health Check${NC}"
echo "GET $API_URL/health"
curl -s -w "\n" $API_URL/health
echo ""

# Test 2: Provision Namespace (Bearer token)
echo -e "${BLUE}Test 2: Provision Namespace (Bearer Token)${NC}"
echo "POST $API_URL/kubernetes/namespace/provision"
echo "Authorization: Bearer $USERID:$USERNAME"
RESPONSE=$(curl -s -X POST $API_URL/kubernetes/namespace/provision \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json")
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

# Test 3: Provision Namespace (Basic Auth)
echo -e "${BLUE}Test 3: Provision Namespace (Basic Auth)${NC}"
echo "POST $API_URL/kubernetes/namespace/provision"
echo "Authorization: Basic (username:$USERNAME, password:$USERID)"
RESPONSE=$(curl -s -X POST $API_URL/kubernetes/namespace/provision \
  -u "$USERNAME:$USERID" \
  -H "Content-Type: application/json")
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

# Test 4: List Namespaces
echo -e "${BLUE}Test 4: List Namespaces${NC}"
echo "GET $API_URL/kubernetes/namespace"
echo "Authorization: Bearer $USERID:$USERNAME"
RESPONSE=$(curl -s $API_URL/kubernetes/namespace \
  -H "Authorization: Bearer $USERID:$USERNAME")
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

# Test 5: Unauthorized Request
echo -e "${BLUE}Test 5: Unauthorized Request (No Auth Header)${NC}"
echo "POST $API_URL/kubernetes/namespace/provision"
RESPONSE=$(curl -s -X POST $API_URL/kubernetes/namespace/provision \
  -H "Content-Type: application/json")
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

# Test 6: Different Users
echo -e "${BLUE}Test 6: Provision for Different User${NC}"
echo "POST $API_URL/kubernetes/namespace/provision"
echo "Authorization: Bearer user456:janedoe"
RESPONSE=$(curl -s -X POST $API_URL/kubernetes/namespace/provision \
  -H "Authorization: Bearer user456:janedoe" \
  -H "Content-Type: application/json")
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

# Test 7: Resolve Factory
echo -e "${BLUE}Test 7: Resolve Factory from URL${NC}"
echo "POST $API_URL/factory/resolver"
echo "Authorization: Bearer $USERID:$USERNAME"
RESPONSE=$(curl -s -X POST $API_URL/factory/resolver \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://raw.githubusercontent.com/eclipse/che/main/devfile.yaml"}')
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

# Test 8: Resolve Factory with Validation
echo -e "${BLUE}Test 8: Resolve Factory with Validation${NC}"
echo "POST $API_URL/factory/resolver?validate=true"
RESPONSE=$(curl -s -X POST "$API_URL/factory/resolver?validate=true" \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/devfile.yaml"}')
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

# Test 9: Refresh Factory Token
echo -e "${BLUE}Test 9: Refresh Factory Token${NC}"
echo "POST $API_URL/factory/token/refresh?url=https://github.com/user/repo"
RESPONSE=$(curl -s -X POST "$API_URL/factory/token/refresh?url=https://github.com/user/repo" \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json")
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

# Test 10: Resolve Factory without Parameters (should fail)
echo -e "${BLUE}Test 10: Resolve Factory without Parameters (Error Test)${NC}"
echo "POST $API_URL/factory/resolver"
RESPONSE=$(curl -s -X POST $API_URL/factory/resolver \
  -H "Authorization: Bearer $USERID:$USERNAME" \
  -H "Content-Type: application/json" \
  -d '{}')
echo $RESPONSE | jq . 2>/dev/null || echo $RESPONSE
echo ""

echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "Note: If you see errors, make sure:"
echo "  1. The API server is running (npm run dev)"
echo "  2. jq is installed for pretty JSON output (optional)"
echo "  3. You have proper Kubernetes access (for actual provisioning)"


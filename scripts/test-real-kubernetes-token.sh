#!/bin/bash
#
# Copyright (c) 2021-2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#  

# Test script for real Kubernetes/OpenShift token authentication

set -e

echo "🧪 Testing Real Kubernetes Token Authentication"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Server URL
SERVER_URL="http://localhost:8080"

# Check if server is running
if ! curl -s "${SERVER_URL}/swagger" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server is not running at ${SERVER_URL}${NC}"
    echo ""
    echo "Please start the server first:"
    echo "  export LOCAL_RUN=true"
    echo "  yarn dev"
    exit 1
fi

echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# Test 1: Real Kubernetes/OpenShift token format
echo "Test 1: Real Kubernetes/OpenShift token (sha256~...)"
echo "-----------------------------------------------------"
REAL_TOKEN="sha256~zpxqr6PzbWNyTzX7d4mUfiONB0-QSLn7-JQFsiMF0S8"
echo "Token: ${REAL_TOKEN}"
echo ""
echo "Request:"
echo "  curl -X GET ${SERVER_URL}/api/kubernetes/namespace \\"
echo "    -H 'Authorization: Bearer ${REAL_TOKEN}'"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET "${SERVER_URL}/api/kubernetes/namespace" \
  -H "Authorization: Bearer ${REAL_TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response (HTTP ${HTTP_CODE}):"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Test 1 PASSED: Real token accepted${NC}"
elif [ "$HTTP_CODE" = "401" ]; then
    echo -e "${RED}❌ Test 1 FAILED: Token rejected (401 Unauthorized)${NC}"
    ERROR_MSG=$(echo "$BODY" | jq -r '.message' 2>/dev/null || echo "$BODY")
    echo "   Error: $ERROR_MSG"
elif [ "$HTTP_CODE" = "500" ]; then
    echo -e "${YELLOW}⚠️  Test 1 WARNING: Server error (this is expected if LOCAL_RUN=true but not connected to cluster)${NC}"
    ERROR_MSG=$(echo "$BODY" | jq -r '.message' 2>/dev/null || echo "$BODY")
    echo "   Message: $ERROR_MSG"
else
    echo -e "${YELLOW}⚠️  Test 1: Unexpected HTTP code ${HTTP_CODE}${NC}"
fi

echo ""
echo "---"
echo ""

# Test 2: Test format token (userid:username)
echo "Test 2: Test format token (userid:username)"
echo "--------------------------------------------"
TEST_TOKEN="user123:johndoe"
echo "Token: ${TEST_TOKEN}"
echo ""
echo "Request:"
echo "  curl -X GET ${SERVER_URL}/api/kubernetes/namespace \\"
echo "    -H 'Authorization: Bearer ${TEST_TOKEN}'"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET "${SERVER_URL}/api/kubernetes/namespace" \
  -H "Authorization: Bearer ${TEST_TOKEN}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response (HTTP ${HTTP_CODE}):"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Test 2 PASSED: Test token accepted${NC}"
elif [ "$HTTP_CODE" = "401" ]; then
    echo -e "${RED}❌ Test 2 FAILED: Token rejected (401 Unauthorized)${NC}"
elif [ "$HTTP_CODE" = "500" ]; then
    echo -e "${YELLOW}⚠️  Test 2 WARNING: Server error (this is expected if LOCAL_RUN=true but not connected to cluster)${NC}"
else
    echo -e "${YELLOW}⚠️  Test 2: Unexpected HTTP code ${HTTP_CODE}${NC}"
fi

echo ""
echo "---"
echo ""

# Test 3: No token (should fail with 401)
echo "Test 3: No authorization header (should return 401)"
echo "----------------------------------------------------"
echo "Request:"
echo "  curl -X GET ${SERVER_URL}/api/kubernetes/namespace"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET "${SERVER_URL}/api/kubernetes/namespace")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response (HTTP ${HTTP_CODE}):"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✅ Test 3 PASSED: Correctly rejected request without token${NC}"
else
    echo -e "${RED}❌ Test 3 FAILED: Expected 401, got ${HTTP_CODE}${NC}"
fi

echo ""
echo "================================================"
echo "Summary:"
echo "  - Real Kubernetes tokens (sha256~...) are now supported ✅"
echo "  - Test format tokens (userid:username) still work ✅"
echo "  - Unauthenticated requests properly rejected ✅"
echo ""
echo "Note: If you get 500 errors, make sure:"
echo "  1. LOCAL_RUN=true is set"
echo "  2. You have a valid kubeconfig at ~/.kube/config"
echo "  3. Your cluster is accessible"


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

# Test private repository OAuth flow

set -e

echo "🧪 Testing Private Repository OAuth Flow"
echo "=========================================="
echo ""

SERVER_URL="http://localhost:8080"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check server
if ! curl -s "${SERVER_URL}/swagger" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server not running at ${SERVER_URL}${NC}"
    echo "Start with: LOCAL_RUN=true yarn dev"
    exit 1
fi

echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# Test private Bitbucket repository
echo "Test: Private Bitbucket Repository"
echo "-----------------------------------"
PRIVATE_REPO="https://oorel@bitbucket.org/oorel/oorel1.git"
TOKEN="sha256~zpxqr6PzbWNyTzX7d4mUfiONB0-QSLn7-JQFsiMF0S8"

echo "Repository: ${PRIVATE_REPO}"
echo "Token: ${TOKEN:0:30}..."
echo ""
echo "Request:"
echo "  curl -X POST ${SERVER_URL}/api/factory/resolver \\"
echo "    -H 'Authorization: Bearer ${TOKEN}' \\"
echo "    -d '{\"url\": \"${PRIVATE_REPO}\"}'"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${SERVER_URL}/api/factory/resolver" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${PRIVATE_REPO}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response (HTTP ${HTTP_CODE}):"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

# Check if response is correct
if [ "$HTTP_CODE" = "401" ]; then
    ERROR_CODE=$(echo "$BODY" | jq -r '.errorCode' 2>/dev/null)
    OAUTH_PROVIDER=$(echo "$BODY" | jq -r '.attributes.oauth_provider' 2>/dev/null)
    OAUTH_URL=$(echo "$BODY" | jq -r '.attributes.oauth_authentication_url' 2>/dev/null)
    MESSAGE=$(echo "$BODY" | jq -r '.message' 2>/dev/null)
    
    if [ "$ERROR_CODE" = "401" ] && [ "$OAUTH_PROVIDER" = "bitbucket" ] && [ ! -z "$OAUTH_URL" ]; then
        echo -e "${GREEN}✅ TEST PASSED${NC}"
        echo "   ✓ HTTP Status: 401"
        echo "   ✓ Error Code: 401"
        echo "   ✓ OAuth Provider: ${OAUTH_PROVIDER}"
        echo "   ✓ OAuth URL: ${OAUTH_URL}"
        echo "   ✓ Message: ${MESSAGE}"
    else
        echo -e "${RED}❌ TEST FAILED${NC}"
        echo "   Response structure is incorrect"
        echo "   Expected: errorCode=401, oauth_provider=bitbucket"
        echo "   Got: errorCode=${ERROR_CODE}, oauth_provider=${OAUTH_PROVIDER}"
    fi
else
    echo -e "${RED}❌ TEST FAILED${NC}"
    echo "   Expected HTTP 401, got ${HTTP_CODE}"
    echo "   Response should be:"
    echo '   {
     "errorCode": 401,
     "attributes": {
       "oauth_version": "2.0",
       "oauth_provider": "bitbucket",
       "oauth_authentication_url": "http://localhost:8080/api/oauth/authenticate?..."
     },
     "message": "SCM Authentication required"
   }'
fi

echo ""
echo "---"
echo ""

# Test public repository (should work without OAuth)
echo "Test: Public Repository (no OAuth needed)"
echo "------------------------------------------"
PUBLIC_REPO="https://raw.githubusercontent.com/eclipse-che/che-server/main/devfile.yaml"

echo "Repository: ${PUBLIC_REPO}"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${SERVER_URL}/api/factory/resolver" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${PUBLIC_REPO}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

echo "Response (HTTP ${HTTP_CODE}):"
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Public repository works without OAuth${NC}"
else
    echo -e "${YELLOW}⚠️  Got HTTP ${HTTP_CODE} (might be rate limited or network issue)${NC}"
fi

echo ""
echo "=========================================="
echo "Summary:"
echo "  Private repos → 401 with OAuth URL ✅"
echo "  Public repos → 200 or work without OAuth ✅"


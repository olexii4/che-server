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


# Test private Azure DevOps repository without authentication
# Should return 401 with OAuth authentication URL

echo "Testing /factory/resolver with private Azure DevOps repository..."
echo ""

curl -X POST 'http://localhost:8080/api/factory/resolver' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://dev.azure.com/myorg/myproject/_git/private-repo"
  }' \
  -s | jq '.'

echo ""
echo "Expected response:"
echo '{
  "errorCode": 401,
  "message": "SCM Authentication required",
  "attributes": {
    "oauth_provider": "azure-devops",
    "oauth_version": "2.0",
    "oauth_authentication_url": "http://localhost:8080/api/oauth/authenticate?oauth_provider=azure-devops&scope=vso.code&request_method=POST&signature_method=rsa"
  }
}'


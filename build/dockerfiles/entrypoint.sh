#!/bin/sh
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

set -e

echo 'Starting Che Server...'

# Set default values
# Use CHE_PORT if available (set by Che Operator), otherwise default to 8080
export PORT=${CHE_PORT:-${PORT:-8080}}
# Note: CHE_HOST is the EXTERNAL hostname (e.g., eclipse-che.apps.xxx.com)
# For binding, we always use 0.0.0.0 to listen on all interfaces
# Use CHE_BIND_ADDRESS to override if needed
export BIND_ADDRESS=${CHE_BIND_ADDRESS:-0.0.0.0}
export NODE_ENV=${NODE_ENV:-production}
export CHE_HOME=${CHE_HOME:-/home/user/che-server}

# Set namespace template from CHE environment variables
if [ -n "${CHE_INFRA_KUBERNETES_NAMESPACE_DEFAULT}" ]; then
  export NAMESPACE_TEMPLATE=${CHE_INFRA_KUBERNETES_NAMESPACE_DEFAULT}
elif [ -n "${CHE_NAMESPACE_TEMPLATE}" ]; then
  export NAMESPACE_TEMPLATE=${CHE_NAMESPACE_TEMPLATE}
fi

# Set API endpoint for OAuth callbacks and factory resolver
# Priority: CHE_API > CHE_API_ENDPOINT > constructed from CHE_HOST
if [ -n "${CHE_API}" ]; then
  export CHE_API_ENDPOINT=${CHE_API}
elif [ -z "${CHE_API_ENDPOINT}" ] && [ -n "${CHE_HOST}" ]; then
  # Construct API endpoint from CHE_HOST if not explicitly set
  export CHE_API_ENDPOINT="https://${CHE_HOST}/api"
fi

# Set factory default devfile filenames if provided
if [ -n "${CHE_FACTORY_DEFAULT_DEVFILE_FILENAMES}" ]; then
  export CHE_FACTORY_DEFAULT_DEVFILE_FILENAMES=${CHE_FACTORY_DEFAULT_DEVFILE_FILENAMES}
fi

# Set force refresh token if provided
if [ -n "${CHE_FORCE_REFRESH_PERSONAL_ACCESS_TOKEN}" ]; then
  export CHE_FORCE_REFRESH_PERSONAL_ACCESS_TOKEN=${CHE_FORCE_REFRESH_PERSONAL_ACCESS_TOKEN}
fi

# Handle custom certificates
CERT_PATH="/self-signed-cert/ca.crt"
if [ -e "${CERT_PATH}" ]; then
  echo "Found custom certificate at ${CERT_PATH}"
  export NODE_EXTRA_CA_CERTS=${CERT_PATH}
fi

# Handle public certificates directory
CUSTOM_PUBLIC_CERTIFICATES="/public-certs"
if [ -d "${CUSTOM_PUBLIC_CERTIFICATES}" ] && [ -n "$(find ${CUSTOM_PUBLIC_CERTIFICATES} -type f 2>/dev/null)" ]; then
  echo "Adding public certificates from ${CUSTOM_PUBLIC_CERTIFICATES}"
  COMBINED_CERTS=/tmp/combined-certs.pem
  cat ${CUSTOM_PUBLIC_CERTIFICATES}/* > ${COMBINED_CERTS} 2>/dev/null || true
  if [ -s "${COMBINED_CERTS}" ]; then
    export NODE_EXTRA_CA_CERTS=${COMBINED_CERTS}
  fi
fi

# Change to application directory
cd "${CHE_HOME}"

# Start the server
echo "Starting server on ${BIND_ADDRESS}:${PORT} in ${NODE_ENV} mode"
if [ -n "${CHE_HOST}" ]; then
  echo "External hostname: ${CHE_HOST}"
fi
if [ -n "${CHE_API}" ]; then
  echo "API endpoint: ${CHE_API}"
fi
exec node --no-deprecation dist/index.js


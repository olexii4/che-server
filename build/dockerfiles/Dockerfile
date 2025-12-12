# Copyright (c) 2025 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation

# ============================================
# Builder stage
# ============================================
FROM docker.io/node:20.19-slim AS builder

USER 0

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends jq && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /che-server

# Copy Yarn configuration
COPY .yarn/releases /che-server/.yarn/releases/
COPY .yarnrc.yml /che-server/.yarnrc.yml

# Link yarn to PATH (force replace base-image yarn so we use the repo-pinned Yarn v4)
RUN ln -sf /che-server/.yarn/releases/yarn-*.cjs /usr/local/bin/yarn

# Copy package files for dependency installation
COPY package.json /che-server/
COPY yarn.lock /che-server/
COPY tsconfig.json /che-server/

# Install dependencies
RUN yarn install --network-timeout 3600000

# Copy source and build config
COPY src /che-server/src
COPY webpack.config.common.js /che-server/
COPY webpack.config.prod.js /che-server/
COPY webpack.config.dev.js /che-server/

# Build with webpack (production mode)
RUN yarn build

# ============================================
# Production image
# ============================================
FROM docker.io/node:20.19-slim

USER 0

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends passwd && \
    rm -rf /var/lib/apt/lists/*

ENV CHE_HOME=/home/user/che-server

# Copy built application from builder
COPY --from=builder /che-server/dist ${CHE_HOME}/dist
COPY --from=builder /che-server/node_modules ${CHE_HOME}/node_modules
COPY --from=builder /che-server/package.json ${CHE_HOME}/

# Copy entrypoint script
COPY build/dockerfiles/entrypoint.sh /entrypoint.sh

# Copy LICENSE to /licenses for ecosystem certification checks
RUN mkdir -p /licenses
COPY LICENSE /licenses/LICENSE

# Create user and directories with proper permissions
RUN useradd -u 1001 -g 0 -d /home/user -m user && \
    chown -R 1001:0 ${CHE_HOME} && \
    chmod -R g+rwX ${CHE_HOME} && \
    chmod +x /entrypoint.sh

USER 1001

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh"]

LABEL io.openshift.expose-services="8080:http" \
      usage="Eclipse Che Server - TypeScript Implementation"

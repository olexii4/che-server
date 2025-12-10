/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ClusterConfig } from '../models/ClusterModels';

/**
 * Register cluster config routes
 *
 * Provides cluster-specific configuration like workspace limits, warnings, and architecture.
 * Route: GET /api/cluster-config
 */
export async function registerClusterConfigRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/cluster-config
   *
   * Get cluster configuration including workspace limits and dashboard customization.
   *
   * This endpoint returns cluster-level configuration that affects all users,
   * such as workspace limits, dashboard warnings, and the current cluster architecture.
   */
  fastify.get(
    '/cluster-config',
    {
      schema: {
        tags: ['cluster-config'],
        summary: 'Get cluster configuration',
        description:
          'Returns cluster-specific configuration including workspace limits and dashboard settings',
        response: {
          200: {
            description: 'Successful response',
            type: 'object',
            properties: {
              dashboardWarning: { type: 'string' },
              dashboardFavicon: { type: 'string' },
              allWorkspacesLimit: { type: 'number' },
              runningWorkspacesLimit: { type: 'number' },
              currentArchitecture: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const clusterConfig = buildClusterConfig();
      return reply.code(200).send(clusterConfig);
    },
  );
}

/**
 * Build cluster config from environment variables
 */
function buildClusterConfig(): ClusterConfig {
  const dashboardWarning = process.env.CHE_DASHBOARD_WARNING || undefined;
  const dashboardFavicon = process.env.CHE_DASHBOARD_FAVICON || undefined;

  // Parse workspace limits (-1 means unlimited)
  const allWorkspacesLimitStr = process.env.CHE_ALL_WORKSPACES_LIMIT || '-1';
  const runningWorkspacesLimitStr = process.env.CHE_RUNNING_WORKSPACES_LIMIT || '-1';

  const allWorkspacesLimit = parseInt(allWorkspacesLimitStr, 10);
  const runningWorkspacesLimit = parseInt(runningWorkspacesLimitStr, 10);

  // Detect architecture from Node.js process
  let currentArchitecture = process.env.CHE_CURRENT_ARCHITECTURE;
  if (!currentArchitecture) {
    const arch = process.arch;
    // Map Node.js arch to common names
    const archMap: Record<string, string> = {
      x64: 'amd64',
      arm64: 'arm64',
      arm: 'arm',
      ppc64: 'ppc64le',
      s390x: 's390x',
    };
    currentArchitecture = archMap[arch] || arch;
  }

  return {
    dashboardWarning,
    dashboardFavicon,
    allWorkspacesLimit: isNaN(allWorkspacesLimit) ? -1 : allWorkspacesLimit,
    runningWorkspacesLimit: isNaN(runningWorkspacesLimit) ? -1 : runningWorkspacesLimit,
    currentArchitecture,
  };
}

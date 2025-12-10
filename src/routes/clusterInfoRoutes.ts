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

import { ApplicationId, ApplicationInfo, ClusterInfo } from '../models/ClusterModels';

/**
 * Register cluster info routes
 *
 * Provides information about external applications and tools available in the cluster.
 * Route: GET /api/cluster-info
 */
export async function registerClusterInfoRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/cluster-info
   *
   * Get cluster information including external applications (e.g., OpenShift Console).
   *
   * This endpoint returns information about applications accessible from the dashboard,
   * such as links to the cluster console.
   */
  fastify.get(
    '/cluster-info',
    {
      schema: {
        tags: ['cluster-info'],
        summary: 'Get cluster information',
        description:
          'Returns information about external applications and tools available in the cluster',
        response: {
          200: {
            description: 'Successful response',
            type: 'object',
            properties: {
              applications: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    icon: { type: 'string' },
                    title: { type: 'string' },
                    url: { type: 'string' },
                    group: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const clusterInfo = buildClusterInfo();
      return reply.code(200).send(clusterInfo);
    },
  );
}

/**
 * Build cluster info from environment variables
 */
function buildClusterInfo(): ClusterInfo {
  const clusterConsoleUrl = process.env.OPENSHIFT_CONSOLE_URL || '';
  const clusterConsoleTitle = process.env.OPENSHIFT_CONSOLE_TITLE || 'OpenShift console';
  const clusterConsoleIcon =
    process.env.OPENSHIFT_CONSOLE_ICON ||
    (clusterConsoleUrl
      ? clusterConsoleUrl + '/static/assets/public/imgs/openshift-favicon.png'
      : '');
  const clusterConsoleGroup = process.env.OPENSHIFT_CONSOLE_GROUP;

  const applications: ApplicationInfo[] = [];

  // Only add cluster console if URL is configured
  if (clusterConsoleUrl) {
    applications.push({
      id: ApplicationId.CLUSTER_CONSOLE,
      icon: clusterConsoleIcon,
      title: clusterConsoleTitle,
      url: clusterConsoleUrl,
      group: clusterConsoleGroup,
    });
  }

  return { applications };
}

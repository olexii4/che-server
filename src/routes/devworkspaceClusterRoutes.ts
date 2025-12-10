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

import { getKubeConfig } from '../helpers/getKubernetesClient';
import { getServiceAccountToken } from '../helpers/getServiceAccountToken';
import { DevWorkspaceService } from '../services/DevWorkspaceService';

/**
 * Register DevWorkspace Cluster routes
 *
 * Provides cluster-level information about workspaces.
 */
export async function registerDevWorkspaceClusterRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/devworkspace/running-workspaces-cluster-limit-exceeded
   *
   * Check if running workspaces exceed cluster limit
   *
   * This endpoint checks the cluster-wide limit for running workspaces.
   * It uses the service account token to list all workspaces across all namespaces.
   */
  fastify.get(
    '/devworkspace/running-workspaces-cluster-limit-exceeded',
    {
      schema: {
        tags: ['devworkspace-cluster'],
        summary: 'Check cluster workspace limit',
        description: 'Check if the number of running workspaces exceeds the cluster limit',
        response: {
          200: {
            description: 'Cluster limit check result',
            type: 'boolean',
          },
          500: {
            description: 'Internal server error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Use service account token for cluster-level operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          // In local development without service account token, return false (no limit exceeded)
          // This allows the endpoint to work for testing without cluster-wide permissions
          fastify.log.warn(
            'Service account token not available, returning false for cluster limit check',
          );
          return reply.code(200).send(false);
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceService(kubeConfig);

        const limitExceeded = await service.isRunningWorkspacesClusterLimitExceeded();
        return reply.code(200).send(limitExceeded);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error checking cluster workspace limit');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to check cluster workspace limit',
        });
      }
    },
  );
}

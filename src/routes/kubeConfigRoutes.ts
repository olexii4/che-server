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

import { KubeConfigProvider } from '../helpers/KubeConfigProvider';
import { getKubeConfig } from '../helpers/getKubernetesClient';
import { KubeConfigService } from '../services/KubeConfigService';
import { logger } from '../utils/logger';

/**
 * Register KubeConfig injection routes
 *
 * These routes allow injecting kubeconfig into running DevWorkspace containers.
 *
 * NOTE: We use the ServiceAccount's KubeConfig for exec operations (to execute commands
 * in pods), but inject a kubeconfig file containing the user's token into the containers.
 * This is because the OIDC token from Dex may not be valid for direct Kubernetes API calls
 * in clusters where the API server doesn't trust the OIDC provider.
 *
 * Matches dashboard-backend/src/routes/api/kubeConfig.ts
 */
export async function registerKubeConfigRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/namespace/:namespace/devworkspaceId/:devworkspaceId/kubeconfig
   * Inject kubeconfig into a running DevWorkspace
   */
  fastify.post<{
    Params: { namespace: string; devworkspaceId: string };
  }>(
    '/namespace/:namespace/devworkspaceId/:devworkspaceId/kubeconfig',
    {
      onRequest: [fastify.authenticate, fastify.requireAuth],
      schema: {
        description: 'Inject kubeconfig into a running DevWorkspace pod',
        tags: ['Kube Config'],
        params: {
          type: 'object',
          required: ['namespace', 'devworkspaceId'],
          properties: {
            namespace: { type: 'string', description: 'The namespace of the DevWorkspace' },
            devworkspaceId: { type: 'string', description: 'The DevWorkspace ID' },
          },
        },
        response: {
          204: {
            description: 'The kubeconfig file is successfully injected',
            type: 'null',
          },
          404: {
            description: 'DevWorkspace pod not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Failed to inject kubeconfig',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { namespace: string; devworkspaceId: string } }>,
      reply: FastifyReply,
    ) => {
      const { namespace, devworkspaceId } = request.params;
      const userToken = request.subject!.token;

      try {
        // Use ServiceAccount's KubeConfig for exec operations (to run commands in pods)
        // This works because the ServiceAccount has permissions to exec into pods
        const kubeConfigProvider = new KubeConfigProvider();
        const execKubeConfig = kubeConfigProvider.getServiceAccountKubeConfig();

        // Create user's KubeConfig to inject into the container (for user's access)
        const userKubeConfig = getKubeConfig(userToken);

        // Create service with both configs: exec with SA, inject user's config
        const service = new KubeConfigService(execKubeConfig, userKubeConfig);
        await service.injectKubeConfig(namespace, devworkspaceId);

        return reply.code(204).send();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error, namespace, devworkspaceId }, 'Error injecting kubeconfig');

        if (message.includes('Could not find')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: message || 'Failed to inject kubeconfig',
        });
      }
    },
  );
}


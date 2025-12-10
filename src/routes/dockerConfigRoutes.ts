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
import { DockerConfigRequest } from '../models/CredentialsModels';
import { DockerConfigService } from '../services/DockerConfigService';

interface NamespacedParams {
  namespace: string;
}

/**
 * Register Docker Config routes
 *
 * Provides endpoints to manage Docker registry credentials.
 */
export async function registerDockerConfigRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/namespace/:namespace/dockerconfig
   *
   * Read docker configuration from a namespace
   */
  fastify.get<{ Params: NamespacedParams }>(
    '/namespace/:namespace/dockerconfig',
    {
      schema: {
        tags: ['dockerconfig'],
        summary: 'Read Docker Configuration',
        description: 'Get docker configuration from the specified namespace',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
          },
          required: ['namespace'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'Docker configuration (base64 encoded)',
            type: 'string',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest<{ Params: NamespacedParams }>, reply: FastifyReply) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;
        const kubeConfig = getKubeConfig(request.subject.token);
        const service = new DockerConfigService(kubeConfig);

        const dockerConfig = await service.read(namespace);
        return reply.code(200).send(dockerConfig);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error reading docker config');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to read docker config',
        });
      }
    },
  );

  /**
   * PUT /api/namespace/:namespace/dockerconfig
   *
   * Update docker configuration
   */
  fastify.put<{ Params: NamespacedParams; Body: DockerConfigRequest }>(
    '/namespace/:namespace/dockerconfig',
    {
      schema: {
        tags: ['dockerconfig'],
        summary: 'Update Docker Configuration',
        description: 'Update docker configuration in the namespace',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
          },
          required: ['namespace'],
        },
        body: {
          type: 'object',
          properties: {
            dockerconfig: {
              type: 'string',
              description: 'Base64 encoded dockerconfigjson',
            },
          },
          required: ['dockerconfig'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'Docker configuration updated (base64 encoded)',
            type: 'string',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedParams; Body: DockerConfigRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;
        const { dockerconfig } = request.body;
        const kubeConfig = getKubeConfig(request.subject.token);
        const service = new DockerConfigService(kubeConfig);

        const updated = await service.update(namespace, dockerconfig);
        return reply.code(200).send(updated);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error updating docker config');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to update docker config',
        });
      }
    },
  );
}

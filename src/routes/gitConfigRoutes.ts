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
import { GitConfig } from '../models/CredentialsModels';
import { GitConfigService } from '../services/GitConfigService';

interface NamespacedParams {
  namespace: string;
}

/**
 * Register Git Config routes
 *
 * Provides endpoints to manage Git configuration (user.name, user.email, etc.).
 */
export async function registerGitConfigRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/namespace/:namespace/gitconfig
   *
   * Read git configuration from a namespace
   */
  fastify.get<{ Params: NamespacedParams }>(
    '/namespace/:namespace/gitconfig',
    {
      schema: {
        tags: ['gitconfig'],
        summary: 'Read Git Configuration',
        description: 'Get git configuration from the specified namespace',
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
            description: 'Git configuration',
            type: 'object',
            properties: {
              resourceVersion: { type: 'string' },
              gitconfig: {
                type: 'object',
                properties: {
                  user: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                },
              },
            },
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
        const service = new GitConfigService(kubeConfig);

        const gitConfig = await service.read(namespace);
        return reply.code(200).send(gitConfig);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error reading git config');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to read git config',
        });
      }
    },
  );

  /**
   * PATCH /api/namespace/:namespace/gitconfig
   *
   * Update git configuration
   */
  fastify.patch<{ Params: NamespacedParams; Body: GitConfig }>(
    '/namespace/:namespace/gitconfig',
    {
      schema: {
        tags: ['gitconfig'],
        summary: 'Update Git Configuration',
        description: 'Update git configuration in the namespace',
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
            resourceVersion: { type: 'string' },
            gitconfig: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string' },
                  },
                  required: ['name', 'email'],
                },
              },
              required: ['user'],
            },
          },
          required: ['gitconfig'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'Git configuration updated',
            type: 'object',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedParams; Body: GitConfig }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;
        const gitConfig = request.body;
        const kubeConfig = getKubeConfig(request.subject.token);
        const service = new GitConfigService(kubeConfig);

        const updated = await service.patch(namespace, gitConfig);
        return reply.code(200).send(updated);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error updating git config');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to update git config',
        });
      }
    },
  );
}

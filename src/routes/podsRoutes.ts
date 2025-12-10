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
import { PodService } from '../services/PodService';

interface NamespacedParams {
  namespace: string;
}

/**
 * Register Pods routes
 *
 * Provides endpoints to list pods in a namespace.
 */
export async function registerPodsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/namespace/:namespace/pods
   *
   * List all pods in a namespace
   */
  fastify.get<{ Params: NamespacedParams }>(
    '/namespace/:namespace/pods',
    {
      schema: {
        tags: ['pods'],
        summary: 'List pods in namespace',
        description: 'Get all pods in the specified namespace',
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
            description: 'List of pods',
            type: 'object',
          },
          401: {
            description: 'Unauthorized',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
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
        const service = new PodService(kubeConfig);

        const pods = await service.listInNamespace(namespace);
        return reply
          .code(200)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify(pods));
      } catch (error: any) {
        fastify.log.error({ error }, 'Error listing pods');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to list pods',
        });
      }
    },
  );
}

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

import { getServiceAccountToken } from '../helpers/getServiceAccountToken';
import { getKubeConfig } from '../helpers/getKubernetesClient';
import { GettingStartedSamplesService } from '../services/GettingStartedSamplesService';
import { logger } from '../utils/logger';

/**
 * Register Getting Started Samples routes
 *
 * These routes provide sample projects for getting started with Eclipse Che.
 */
export async function registerGettingStartedSampleRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/getting-started-sample
   * List getting started samples
   */
  fastify.get(
    '/getting-started-sample',
    {
      schema: {
        description: 'List getting started sample projects',
        tags: ['Getting Started Samples'],
        response: {
          200: {
            description: 'List of getting started samples',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                displayName: { type: 'string' },
                description: { type: 'string' },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                },
                url: { type: 'string' },
                icon: {
                  type: 'object',
                  properties: {
                    base64data: { type: 'string' },
                    mediatype: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Use service account token for this operation
        const token = getServiceAccountToken();

        // If no token (local run), service will return empty array
        if (!token) {
          return reply.code(200).send([]);
        }

        const kubeConfig = getKubeConfig(token);
        const service = new GettingStartedSamplesService(kubeConfig);
        const samples = await service.list();

        return reply.code(200).send(samples);
      } catch (error) {
        logger.error({ error }, 'Error listing getting started samples');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list getting started samples',
        });
      }
    },
  );
}

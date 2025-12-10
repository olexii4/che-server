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

/**
 * Register Air Gap Sample routes
 *
 * Provides air-gapped sample projects for offline devfile registry.
 * Route: GET /api/airgap-sample
 */
export async function registerAirGapSampleRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /airgap-sample
   *
   * List air-gapped sample projects.
   * In che-server, samples are managed externally, so this returns an empty array.
   */
  fastify.get(
    '/airgap-sample',
    {
      schema: {
        tags: ['airgap-sample'],
        summary: 'List air-gapped samples',
        description: 'Returns air-gapped sample projects (empty in che-server)',
        response: {
          200: {
            description: 'List of air-gapped samples',
            type: 'array',
            items: {
              type: 'object',
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Air-gapped samples are now managed externally in che-server
      // Return empty array for backward compatibility
      return reply.code(200).send([]);
    },
  );
}

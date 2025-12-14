/**
 * Copyright (c) 2021-2025 Red Hat, Inc.
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
 * User routes
 *
 * NOTE: This endpoint is used by the Che dashboard to obtain the current user id.
 * It is intentionally minimal and only returns identity derived from existing auth middleware.
 */
export async function registerUserRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /user/id
   *
   * Returns the current user identifier.
   */
  fastify.get(
    '/user/id',
    {
      schema: {
        hide: true,
        tags: ['user'],
        summary: 'Get current user id',
        description: 'Returns the current user identifier derived from authentication context',
                security: [{ BearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['id', 'name'],
          },
          401: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['error', 'message'],
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.subject) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }

      // In gateway-auth flows, id may be the username (no UUID available). This matches the auth middleware.
      return reply.code(200).send({
        id: request.subject.id,
        name: request.subject.userName,
      });
    },
  );
}



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

import { FastifyInstance } from 'fastify';

/**
 * Register System State routes
 *
 * Provides system status information for Eclipse Che Operator and Dashboard.
 */
export async function registerSystemRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/system/state
   * Get current system state
   */
  fastify.get(
    '/system/state',
    {
      schema: {
        hide: true, // Hide from Swagger UI (internal endpoint for Che Operator)
        description: 'Get current system state',
        tags: ['System'],
        response: {
          200: {
            description: 'The response contains system status',
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['RUNNING', 'READY_TO_SHUTDOWN', 'PREPARING_TO_SHUTDOWN'],
              },
              links: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    href: { type: 'string' },
                    rel: { type: 'string' },
                    method: { type: 'string' },
                    parameters: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          defaultValue: { type: 'string' },
                          required: { type: 'boolean' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // For now, always return RUNNING status
      // In a full implementation, this would check actual system state
      const protocol = request.headers['x-forwarded-proto'] || 'http';
      const host = request.headers['x-forwarded-host'] || request.hostname;
      const wsProtocol = protocol === 'https' ? 'wss' : 'ws';

      return reply.code(200).send({
        status: 'RUNNING',
        links: [
          {
            href: `${wsProtocol}://${host}/websocket`,
            rel: 'system.state.channel',
            method: 'GET',
            parameters: [
              {
                name: 'channel',
                defaultValue: 'systemState',
                required: true,
              },
            ],
          },
        ],
      });
    },
  );
}

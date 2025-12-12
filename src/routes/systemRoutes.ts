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

type SystemStatus = 'RUNNING' | 'READY_TO_SHUTDOWN' | 'PREPARING_TO_SHUTDOWN';

/**
 * Register System State routes
 *
 * Provides system status information for Eclipse Che Operator and Dashboard.
 */
export async function registerSystemRoutes(fastify: FastifyInstance): Promise<void> {
  // In Java, status is managed by SystemManager and transitions:
  // RUNNING -> PREPARING_TO_SHUTDOWN -> READY_TO_SHUTDOWN.
  //
  // Here we keep a minimal in-memory approximation sufficient for API parity.
  // Kept per Fastify instance (so tests don't leak state across instances).
  let systemStatus: SystemStatus = 'RUNNING';
  let stopCalled = false;

  /**
   * POST /api/system/stop
   *
   * Stops system services. Prepares system to shutdown.
   *
   * Java: POST /system/stop?shutdown=false|true
   * - Returns 204
   * - Returns 409 if stop has already been called
   */
  fastify.post(
    '/system/stop',
    {
      schema: {
        hide: true,
        description: 'Stops system services. Prepares system to shutdown',
        tags: ['System'],
        querystring: {
          type: 'object',
          properties: {
            shutdown: { type: 'boolean', default: false },
          },
        },
        response: {
          204: { type: 'null' },
          409: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['error', 'message'],
          },
        },
      },
    },
    async (request, reply) => {
      if (stopCalled) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `System shutdown has been already called, system status: ${systemStatus}`,
        });
      }

      stopCalled = true;
      systemStatus = 'PREPARING_TO_SHUTDOWN';

      // Simulate immediate completion (we do not manage real service termination here).
      setTimeout(() => {
        systemStatus = 'READY_TO_SHUTDOWN';
      }, 0);

      return reply.code(204).send();
    },
  );

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
      return reply.code(200).send({
        status: systemStatus,
        links: [],
      });
    },
  );
}

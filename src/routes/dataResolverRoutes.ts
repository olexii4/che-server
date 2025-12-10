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
import axios from 'axios';
import { logger } from '../utils/logger';

interface DataResolverRequest {
  url: string;
}

/**
 * Register Data Resolver routes
 *
 * Provides a server-side proxy to fetch external URLs, bypassing CORS restrictions.
 * Used by the dashboard to fetch devfile metadata from external registries.
 */
export async function registerDataResolverRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/data/resolver
   *
   * Proxy endpoint to fetch external URLs
   */
  fastify.post<{ Body: DataResolverRequest }>(
    '/data/resolver',
    {
      schema: {
        tags: ['data-resolver'],
        summary: 'Resolve external data',
        description: 'Fetch data from an external URL (CORS proxy)',
        body: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch',
            },
          },
          required: ['url'],
        },
        response: {
          // 200 response can be any type (array or object), so we don't define a schema
          400: {
            description: 'Bad Request',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
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
          503: {
            description: 'Service Unavailable',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: DataResolverRequest }>, reply: FastifyReply) => {
      const { url } = request.body;

      if (!url) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'URL is required',
        });
      }

      try {
        logger.info({ url }, 'Resolving external data');

        // Fetch the external URL
        const response = await axios.get(url, {
          timeout: 30000, // 30 seconds
          validateStatus: (status) => status < 500, // Accept any status < 500
        });

        logger.info({ url, status: response.status, dataLength: JSON.stringify(response.data).length }, 'Successfully resolved external data');

        // Always return 200 for successful proxy requests, even if the upstream returns 404
        // The dashboard will handle the response body appropriately
        // Use type() and raw JSON.stringify to preserve arrays (Fastify serialization can convert arrays to objects)
        return reply.type('application/json').send(JSON.stringify(response.data));
      } catch (error: any) {
        logger.error({ error: error.message, url, status: error.response?.status }, 'Error resolving external data');

        // Handle network errors - still return error status codes for actual failures
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
          return reply.code(503).send({
            error: 'Service Unavailable',
            message: `Failed to connect to ${url}: ${error.message}`,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to resolve data',
        });
      }
    },
  );
}

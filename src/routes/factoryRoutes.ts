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

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FactoryService } from '../services/FactoryService';
import { PersonalAccessTokenManager } from '../services/PersonalAccessTokenManager';
import { AuthorisationRequestManager } from '../services/AuthorisationRequestManager';
import { FactoryResolverParams, FACTORY_CONSTANTS } from '../models/FactoryModels';
import { UnauthorizedException } from '../models/UnauthorizedException';

/**
 * Register Factory routes
 *
 * Based on: org.eclipse.che.api.factory.server.FactoryService
 */
export async function registerFactoryRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize services
  const personalAccessTokenManager = new PersonalAccessTokenManager();
  const authorisationRequestManager = new AuthorisationRequestManager();
  const factoryService = new FactoryService(
    personalAccessTokenManager,
    authorisationRequestManager,
  );

  /**
   * POST /factory/resolver
   *
   * Create factory by providing map of parameters.
   * Returns JSON with factory information.
   */
  fastify.post(
    '/factory/resolver',
    {
      schema: {
        tags: ['factory'],
        summary: 'Resolve factory from URL',
        description: `Create factory by providing repository URL. Works with GitHub, GitLab, and Bitbucket repositories.

**Examples:**
- GitHub: https://github.com/eclipse-che/che-dashboard.git
- GitLab: https://gitlab.com/user/project.git
- Bitbucket: https://bitbucket.org/workspace/repo.git`,
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: {
              type: 'string',
              description:
                'Repository URL (e.g., https://github.com/eclipse-che/che-dashboard.git)',
            },
          },
        },
        response: {
          200: {
            description: 'Factory resolved successfully',
            type: 'object',
            additionalProperties: true,
          },
          400: {
            description: 'Bad Request',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          401: {
            description: 'Unauthorized - OAuth authentication required',
            type: 'object',
            properties: {
              errorCode: { type: 'number' },
              message: { type: 'string' },
              attributes: {
                type: 'object',
                properties: {
                  oauth_provider: { type: 'string' },
                  oauth_version: { type: 'string' },
                  oauth_authentication_url: { type: 'string' },
                },
              },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'string' },
            },
          },
        },
      },
      // Only authenticate if header is present, don't require it for public repos
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get parameters from request body
        const parameters: FactoryResolverParams = (request.body as any) || {};

        // Pass Authorization header for private repository access
        const authorizationHeader = request.headers.authorization;
        if (authorizationHeader) {
          parameters.authorization = authorizationHeader;
        }

        // Resolve factory
        const factory = await factoryService.resolveFactory(parameters);

        // Return factory
        return reply.code(200).send(factory);
      } catch (error: any) {
        fastify.log.error('Error resolving factory:', error);

        // Check for UnauthorizedException (OAuth authentication required)
        if (error instanceof UnauthorizedException) {
          return reply.code(401).send(error.toJSON());
        }

        // Also check by name in case instanceof doesn't work due to module loading
        if (error.name === 'UnauthorizedException' && error.toJSON) {
          return reply.code(401).send(error.toJSON());
        }

        // Check for specific error types
        if (
          error.message?.includes('required') ||
          error.message?.includes('devfile') ||
          error.message?.includes('Invalid')
        ) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }

        if (error.message?.includes(FACTORY_CONSTANTS.ERRORS.NOT_RESOLVABLE)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Internal server error occurred during factory resolution',
          details: error.stack,
        });
      }
    },
  );

  /**
   * POST /factory/token/refresh
   *
   * Validate the factory related OAuth token and update/create it if needed.
   */
  fastify.post(
    '/factory/token/refresh',
    {
      schema: {
        tags: ['factory'],
        summary: 'Refresh factory OAuth token',
        description: 'Validate the factory related OAuth token and update/create it if needed',
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
        querystring: {
          type: 'object',
          required: ['url'],
          properties: {
            url: {
              type: 'string',
              description: 'Factory URL',
            },
          },
        },
        response: {
          204: {
            description: 'Token refreshed successfully',
            type: 'null',
          },
          400: {
            description: 'Bad Request',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          401: {
            description: 'Unauthorized',
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
              details: { type: 'string' },
            },
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Ensure user is authenticated
        if (!request.subject) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
          });
        }

        // Get URL from query parameter
        const query = request.query as any;
        const url = query.url as string;

        if (!url) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'URL parameter is required',
          });
        }

        // Refresh token
        await factoryService.refreshToken(url);

        // Return no content
        return reply.code(204).send();
      } catch (error: any) {
        fastify.log.error('Error refreshing factory token:', error);

        if (error.message?.includes('required') || error.message?.includes('URL')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Internal server error occurred during token refresh',
          details: error.stack,
        });
      }
    },
  );
}

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
import { getServiceAccountToken } from '../helpers/getServiceAccountToken';
import { UserProfileService } from '../services/UserProfileService';

interface NamespacedParams {
  namespace: string;
}

/**
 * Register User Profile routes
 *
 * Provides endpoints to get user profile information.
 */
export async function registerUserProfileRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/user/id
   *
   * Get current user ID (UUID)
   *
   * This endpoint returns the UUID of the currently authenticated user.
   * The UUID is read from the user-profile Secret's 'id' field in the user's namespace.
   * Uses service account token for Kubernetes operations (similar to namespace provisioning).
   * 
   * Based on Java implementation:
   * eclipse-che/che-server/infrastructures/kubernetes/.../UserProfileConfigurator.java
   * 
   * Compatible with Eclipse Che Server API: https://github.com/eclipse-che/che-server
   *
   * @returns {string} User UUID (e.g., "d4810a4f-169f-4da5-a8e0-d8dff7ecf959")
   */
  fastify.get(
    '/user/id',
    {
      schema: {
        tags: ['user'],
        summary: 'Get current user ID (UUID)',
        description:
          "Returns the UUID of the currently authenticated user. This is read from the user-profile Secret in the user's namespace.",
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'User UUID',
            type: 'string',
            examples: ['d4810a4f-169f-4da5-a8e0-d8dff7ecf959'],
          },
          401: {
            description: 'Unauthorized',
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!request.subject) {
          fastify.log.warn('❌ /api/user/id - No authentication');
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
          });
        }

        // Get user's namespace from username
        const username = request.subject.userName;
        const namespace = `${username}-che`;

        fastify.log.info({ username, namespace }, '📋 GET /api/user/id - Fetching user ID');

        // Use service account token to read the user-profile secret
        // (similar to how we handle namespace operations)
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          fastify.log.error('❌ Service account token not available');
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        // Read user profile from the user-profile secret in the namespace
        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new UserProfileService(kubeConfig);
        const userProfile = await service.getUserProfile(namespace);

        fastify.log.info({ username, namespace, userId: userProfile.id }, '✅ Retrieved user ID successfully');

        // Return the UUID from the user-profile secret
        return reply.code(200).send(userProfile.id);
      } catch (error: any) {
        fastify.log.error({ error }, '❌ Error getting user ID');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to get user ID',
        });
      }
    },
  );

  /**
   * GET /api/userprofile/:namespace
   *
   * Get user profile from a namespace
   */
  fastify.get<{ Params: NamespacedParams }>(
    '/userprofile/:namespace',
    {
      schema: {
        tags: ['user-profile'],
        summary: 'Get user profile',
        description:
          'Get user profile information (username, email) from a namespace. If the user-profile Secret does not exist, returns a default profile extracted from the namespace name.',
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
            description:
              'User profile (from Secret if exists, or default profile derived from namespace name)',
            type: 'object',
            properties: {
              username: { type: 'string' },
              email: { type: 'string' },
            },
          },
          401: {
            description: 'Unauthorized',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          403: {
            description: 'Forbidden - no permission to access namespace',
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
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
          fastify.log.warn({ namespace: request.params.namespace }, '❌ /api/userprofile/:namespace - No authentication');
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;

        fastify.log.info({ namespace, authenticatedUser: request.subject.userName }, '📋 GET /api/userprofile/:namespace - Fetching profile');

        // Use service account token to read the user-profile secret
        // (consistent with /api/user/id and namespace operations)
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          fastify.log.error('❌ Service account token not available');
          return reply.code(500).send({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new UserProfileService(kubeConfig);

        // getUserProfile now always returns a profile (default if Secret doesn't exist)
        const profile = await service.getUserProfile(namespace);
        
        fastify.log.info({ namespace, userId: profile.id, username: profile.username, email: profile.email }, '✅ Retrieved user profile successfully');
        
        return reply.code(200).send(profile);
      } catch (error: any) {
        // Only handle non-404 errors now (403, 500, etc.)
        const statusCode = error.statusCode || error.response?.statusCode || 500;

        fastify.log.error({ error, namespace: request.params.namespace, statusCode }, '❌ Error getting user profile');
        return reply.code(statusCode).send({
          statusCode: statusCode,
          error: statusCode === 403 ? 'Forbidden' : 'Internal Server Error',
          message: error.message || 'Failed to get user profile',
        });
      }
    },
  );
}

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
import { PersonalAccessToken } from '../models/CredentialsModels';
import { PersonalAccessTokenService } from '../services/PersonalAccessTokenService';

interface NamespacedParams {
  namespace: string;
}

interface TokenParams extends NamespacedParams {
  tokenName: string;
}

/**
 * Register Personal Access Token routes
 *
 * Provides endpoints to manage Personal Access Tokens for SCM providers.
 */
export async function registerPersonalAccessTokenRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/namespace/:namespace/personal-access-token
   *
   * List all personal access tokens in a namespace
   */
  fastify.get<{ Params: NamespacedParams }>(
    '/namespace/:namespace/personal-access-token',
    {
      schema: {
        tags: ['personal-access-token'],
        summary: 'List Personal Access Tokens',
        description: 'Get all personal access tokens in the specified namespace',
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
            description: 'List of personal access tokens',
            type: 'array',
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
        const service = new PersonalAccessTokenService(kubeConfig);

        const tokens = await service.listInNamespace(namespace);
        return reply.code(200).send(tokens);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error listing personal access tokens');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to list personal access tokens',
        });
      }
    },
  );

  /**
   * POST /api/namespace/:namespace/personal-access-token
   *
   * Create a new personal access token
   */
  fastify.post<{ Params: NamespacedParams; Body: PersonalAccessToken }>(
    '/namespace/:namespace/personal-access-token',
    {
      schema: {
        tags: ['personal-access-token'],
        summary: 'Create Personal Access Token',
        description: 'Create a new personal access token in the namespace',
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
            tokenName: { type: 'string' },
            cheUserId: { type: 'string' },
            gitProvider: {
              type: 'string',
              enum: ['github', 'gitlab', 'bitbucket', 'azure-devops'],
            },
            gitProviderEndpoint: { type: 'string' },
            gitProviderOrganization: { type: 'string' },
            isOauth: { type: 'boolean' },
            tokenData: { type: 'string' },
          },
          required: ['tokenName', 'cheUserId', 'gitProvider', 'gitProviderEndpoint', 'tokenData'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          201: {
            description: 'Personal access token created',
            type: 'object',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedParams; Body: PersonalAccessToken }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;
        const token = request.body;
        const kubeConfig = getKubeConfig(request.subject.token);
        const service = new PersonalAccessTokenService(kubeConfig);

        const created = await service.create(namespace, token);
        return reply.code(201).send(created);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error creating personal access token');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to create personal access token',
        });
      }
    },
  );

  /**
   * PATCH /api/namespace/:namespace/personal-access-token
   *
   * Update an existing personal access token
   */
  fastify.patch<{ Params: NamespacedParams; Body: PersonalAccessToken }>(
    '/namespace/:namespace/personal-access-token',
    {
      schema: {
        tags: ['personal-access-token'],
        summary: 'Update Personal Access Token',
        description: 'Update an existing personal access token in the namespace',
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
            tokenName: { type: 'string' },
            cheUserId: { type: 'string' },
            gitProvider: { type: 'string' },
            gitProviderEndpoint: { type: 'string' },
            gitProviderOrganization: { type: 'string' },
            isOauth: { type: 'boolean' },
            tokenData: { type: 'string' },
          },
          required: ['tokenName'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'Personal access token updated',
            type: 'object',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedParams; Body: PersonalAccessToken }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;
        const token = request.body;
        const kubeConfig = getKubeConfig(request.subject.token);
        const service = new PersonalAccessTokenService(kubeConfig);

        const updated = await service.replace(namespace, token);
        return reply.code(200).send(updated);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error updating personal access token');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to update personal access token',
        });
      }
    },
  );

  /**
   * DELETE /api/namespace/:namespace/personal-access-token/:tokenName
   *
   * Delete a personal access token
   */
  fastify.delete<{ Params: TokenParams }>(
    '/namespace/:namespace/personal-access-token/:tokenName',
    {
      schema: {
        tags: ['personal-access-token'],
        summary: 'Delete Personal Access Token',
        description: 'Delete a personal access token from the namespace',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            tokenName: { type: 'string' },
          },
          required: ['namespace', 'tokenName'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          204: {
            description: 'Personal access token deleted',
            type: 'null',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest<{ Params: TokenParams }>, reply: FastifyReply) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace, tokenName } = request.params;
        const kubeConfig = getKubeConfig(request.subject.token);
        const service = new PersonalAccessTokenService(kubeConfig);

        await service.delete(namespace, tokenName);
        return reply.code(204).send();
      } catch (error: any) {
        fastify.log.error({ error }, 'Error deleting personal access token');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to delete personal access token',
        });
      }
    },
  );
}

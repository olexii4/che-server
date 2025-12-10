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
import { TrustedSourceRequest, WorkspacePreferences } from '../models/AdvancedFeaturesModels';
import { GitProvider } from '../models/CredentialsModels';
import { WorkspacePreferencesService } from '../services/WorkspacePreferencesService';
import { logger } from '../utils/logger';

/**
 * Register Workspace Preferences routes
 *
 * These routes manage workspace-level preferences stored in ConfigMaps.
 */
export async function registerWorkspacePreferencesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/workspace-preferences/namespace/:namespace
   * Get workspace preferences
   */
  fastify.get<{
    Params: { namespace: string };
  }>(
    '/workspace-preferences/namespace/:namespace',
    {
      onRequest: [fastify.authenticate, fastify.requireAuth],
      schema: {
        description: 'Get workspace preferences for a namespace',
        tags: ['Workspace Preferences'],
        params: {
          type: 'object',
          required: ['namespace'],
          properties: {
            namespace: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Workspace preferences',
            type: 'object',
            additionalProperties: true,
            properties: {
              'skip-authorisation': {
                type: 'array',
                items: { type: 'string' },
              },
              'trusted-sources': {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { namespace: string } }>, reply: FastifyReply) => {
      const { namespace } = request.params;
      const token = request.subject!.token;

      try {
        const kubeConfig = getKubeConfig(token);
        const service = new WorkspacePreferencesService(kubeConfig);
        const preferences = await service.getWorkspacePreferences(namespace);

        return reply.code(200).send(preferences);
      } catch (error) {
        logger.error({ error, namespace }, 'Error getting workspace preferences');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get workspace preferences',
        });
      }
    },
  );

  /**
   * DELETE /api/workspace-preferences/namespace/:namespace/skip-authorisation/:provider
   * Remove provider from skip-authorisation list
   */
  fastify.delete<{
    Params: { namespace: string; provider: GitProvider };
  }>(
    '/workspace-preferences/namespace/:namespace/skip-authorisation/:provider',
    {
      onRequest: [fastify.authenticate, fastify.requireAuth],
      schema: {
        description: 'Remove a provider from the skip-authorisation list',
        tags: ['Workspace Preferences'],
        params: {
          type: 'object',
          required: ['namespace', 'provider'],
          properties: {
            namespace: { type: 'string' },
            provider: {
              type: 'string',
              enum: ['github', 'gitlab', 'bitbucket', 'azure-devops'],
            },
          },
        },
        response: {
          204: {
            description: 'Provider successfully removed from skip-authorisation list',
            type: 'null',
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { namespace: string; provider: GitProvider } }>,
      reply: FastifyReply,
    ) => {
      const { namespace, provider } = request.params;
      const token = request.subject!.token;

      try {
        const kubeConfig = getKubeConfig(token);
        const service = new WorkspacePreferencesService(kubeConfig);
        await service.removeProviderFromSkipAuthorizationList(namespace, provider);

        return reply.code(204).send();
      } catch (error) {
        logger.error({ error, namespace, provider }, 'Error removing provider from skip list');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to remove provider from skip-authorisation list',
        });
      }
    },
  );

  /**
   * POST /api/workspace-preferences/namespace/:namespace/trusted-source
   * Add a trusted source
   */
  fastify.post<{
    Params: { namespace: string };
    Body: TrustedSourceRequest;
  }>(
    '/workspace-preferences/namespace/:namespace/trusted-source',
    {
      onRequest: [fastify.authenticate, fastify.requireAuth],
      schema: {
        description: 'Add a trusted source to the workspace preferences',
        tags: ['Workspace Preferences'],
        params: {
          type: 'object',
          required: ['namespace'],
          properties: {
            namespace: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['source'],
          properties: {
            source: {
              type: 'string',
              description: 'Trusted source URL or "*" for all sources',
            },
          },
        },
        response: {
          204: {
            description: 'Trusted source successfully added',
            type: 'null',
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { namespace: string }; Body: TrustedSourceRequest }>,
      reply: FastifyReply,
    ) => {
      const { namespace } = request.params;
      const { source } = request.body;
      const token = request.subject!.token;

      try {
        const kubeConfig = getKubeConfig(token);
        const service = new WorkspacePreferencesService(kubeConfig);
        await service.addTrustedSource(namespace, source);

        return reply.code(204).send();
      } catch (error) {
        logger.error({ error, namespace, source }, 'Error adding trusted source');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to add trusted source',
        });
      }
    },
  );

  /**
   * DELETE /api/workspace-preferences/namespace/:namespace/trusted-source
   * Remove all trusted sources
   */
  fastify.delete<{
    Params: { namespace: string };
  }>(
    '/workspace-preferences/namespace/:namespace/trusted-source',
    {
      onRequest: [fastify.authenticate, fastify.requireAuth],
      schema: {
        description: 'Remove all trusted sources from workspace preferences',
        tags: ['Workspace Preferences'],
        params: {
          type: 'object',
          required: ['namespace'],
          properties: {
            namespace: { type: 'string' },
          },
        },
        response: {
          204: {
            description: 'Trusted sources successfully removed',
            type: 'null',
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { namespace: string } }>, reply: FastifyReply) => {
      const { namespace } = request.params;
      const token = request.subject!.token;

      try {
        const kubeConfig = getKubeConfig(token);
        const service = new WorkspacePreferencesService(kubeConfig);
        await service.removeTrustedSources(namespace);

        return reply.code(204).send();
      } catch (error) {
        logger.error({ error, namespace }, 'Error removing trusted sources');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to remove trusted sources',
        });
      }
    },
  );
}

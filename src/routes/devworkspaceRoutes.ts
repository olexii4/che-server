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
import { DevWorkspace, PatchOperation } from '../models/DevWorkspaceModels';
import { DevWorkspaceService } from '../services/DevWorkspaceService';

interface NamespacedParams {
  namespace: string;
}

interface NamespacedWorkspaceParams extends NamespacedParams {
  workspaceName: string;
}

interface DevWorkspaceBody {
  devworkspace: DevWorkspace;
}

/**
 * Register DevWorkspace routes
 *
 * Provides CRUD operations for DevWorkspace custom resources.
 * Matches dashboard-backend routes for workspace management.
 */
export async function registerDevWorkspaceRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/namespace/:namespace/devworkspaces
   *
   * List all DevWorkspaces in a namespace
   */
  fastify.get<{ Params: NamespacedParams }>(
    '/namespace/:namespace/devworkspaces',
    {
      schema: {
        tags: ['devworkspace'],
        summary: 'List DevWorkspaces in namespace',
        description: 'Get all DevWorkspaces in the specified namespace',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
          },
          required: ['namespace'],
        },
        security: [{ BearerAuth: [] }],
        // Don't define response schema to avoid Fastify stripping fields from Kubernetes objects
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest<{ Params: NamespacedParams }>, reply: FastifyReply) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;

        // Use service account token for DevWorkspace operations
        // The service account has permissions to manage DevWorkspaces across namespaces
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceService(kubeConfig);

        const devworkspacesList = await service.listInNamespace(namespace);
        return reply.code(200).send(devworkspacesList);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error listing DevWorkspaces');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to list DevWorkspaces',
        });
      }
    },
  );

  /**
   * POST /api/namespace/:namespace/devworkspaces
   *
   * Create a new DevWorkspace
   */
  fastify.post<{ Params: NamespacedParams; Body: DevWorkspaceBody }>(
    '/namespace/:namespace/devworkspaces',
    {
      schema: {
        tags: ['devworkspace'],
        summary: 'Create DevWorkspace',
        description: 'Create a new DevWorkspace in the specified namespace',
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
            devworkspace: { type: 'object' },
          },
          required: ['devworkspace'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          201: {
            description: 'DevWorkspace created',
            type: 'object',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedParams; Body: DevWorkspaceBody }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;
        const { devworkspace } = request.body;

        // Use service account token for DevWorkspace operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceService(kubeConfig);

        const created = await service.create(namespace, devworkspace);
        return reply
          .code(201)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify(created));
      } catch (error: any) {
        fastify.log.error({ error }, 'Error creating DevWorkspace');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to create DevWorkspace',
        });
      }
    },
  );

  /**
   * GET /api/namespace/:namespace/devworkspaces/:workspaceName
   *
   * Get a specific DevWorkspace by name
   */
  fastify.get<{ Params: NamespacedWorkspaceParams }>(
    '/namespace/:namespace/devworkspaces/:workspaceName',
    {
      schema: {
        tags: ['devworkspace'],
        summary: 'Get DevWorkspace',
        description: 'Get a specific DevWorkspace by name',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            workspaceName: { type: 'string' },
          },
          required: ['namespace', 'workspaceName'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'DevWorkspace details',
            type: 'object',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest<{ Params: NamespacedWorkspaceParams }>, reply: FastifyReply) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace, workspaceName } = request.params;

        // Use service account token for DevWorkspace operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceService(kubeConfig);

        const devworkspace = await service.getByName(namespace, workspaceName);
        return reply
          .code(200)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify(devworkspace));
      } catch (error: any) {
        fastify.log.error({ error }, 'Error getting DevWorkspace');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to get DevWorkspace',
        });
      }
    },
  );

  /**
   * PATCH /api/namespace/:namespace/devworkspaces/:workspaceName
   *
   * Update a DevWorkspace using JSON Patch
   */
  fastify.patch<{ Params: NamespacedWorkspaceParams; Body: PatchOperation[] }>(
    '/namespace/:namespace/devworkspaces/:workspaceName',
    {
      schema: {
        tags: ['devworkspace'],
        summary: 'Update DevWorkspace',
        description: 'Update a DevWorkspace using JSON Patch operations',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            workspaceName: { type: 'string' },
          },
          required: ['namespace', 'workspaceName'],
        },
        body: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['add', 'remove', 'replace', 'move', 'copy', 'test'] },
              path: { type: 'string' },
              value: {},
              from: { type: 'string' },
            },
            required: ['op', 'path'],
          },
        },
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'DevWorkspace updated',
            type: 'object',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedWorkspaceParams; Body: PatchOperation[] }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace, workspaceName } = request.params;
        const patch = request.body;

        // Use service account token for DevWorkspace operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceService(kubeConfig);

        const updated = await service.patch(namespace, workspaceName, patch);
        return reply
          .code(200)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify(updated));
      } catch (error: any) {
        fastify.log.error({ error }, 'Error patching DevWorkspace');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to patch DevWorkspace',
        });
      }
    },
  );

  /**
   * DELETE /api/namespace/:namespace/devworkspaces/:workspaceName
   *
   * Delete a DevWorkspace
   */
  fastify.delete<{ Params: NamespacedWorkspaceParams }>(
    '/namespace/:namespace/devworkspaces/:workspaceName',
    {
      schema: {
        tags: ['devworkspace'],
        summary: 'Delete DevWorkspace',
        description: 'Delete a DevWorkspace',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            workspaceName: { type: 'string' },
          },
          required: ['namespace', 'workspaceName'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          204: {
            description: 'DevWorkspace deleted',
            type: 'null',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest<{ Params: NamespacedWorkspaceParams }>, reply: FastifyReply) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace, workspaceName } = request.params;

        // Use service account token for DevWorkspace operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceService(kubeConfig);

        await service.delete(namespace, workspaceName);
        return reply.code(204).send();
      } catch (error: any) {
        fastify.log.error({ error }, 'Error deleting DevWorkspace');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to delete DevWorkspace',
        });
      }
    },
  );
}

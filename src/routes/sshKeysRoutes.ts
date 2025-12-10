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
import { NewSshKey } from '../models/CredentialsModels';
import { SSHKeysService } from '../services/SSHKeysService';

interface NamespacedParams {
  namespace: string;
}

interface SshKeyParams extends NamespacedParams {
  name: string;
}

/**
 * Register SSH Keys routes
 *
 * Provides endpoints to manage SSH keys for Git authentication.
 */
export async function registerSshKeysRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/namespace/:namespace/ssh-key
   *
   * List all SSH keys in a namespace
   */
  fastify.get<{ Params: NamespacedParams }>(
    '/namespace/:namespace/ssh-key',
    {
      schema: {
        tags: ['ssh-keys'],
        summary: 'List SSH keys',
        description: 'Get all SSH keys in the specified namespace',
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
            description: 'List of SSH keys',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                keyPub: { type: 'string' },
                creationTimestamp: { type: 'string' },
              },
            },
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
        const service = new SSHKeysService(kubeConfig);

        const sshKeys = await service.list(namespace);
        return reply.code(200).send(sshKeys);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error listing SSH keys');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to list SSH keys',
        });
      }
    },
  );

  /**
   * POST /api/namespace/:namespace/ssh-key
   *
   * Add a new SSH key
   */
  fastify.post<{ Params: NamespacedParams; Body: NewSshKey }>(
    '/namespace/:namespace/ssh-key',
    {
      schema: {
        tags: ['ssh-keys'],
        summary: 'Add SSH key',
        description: 'Add a new SSH key to the namespace',
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
            name: { type: 'string' },
            key: { type: 'string', description: 'Base64 encoded private key' },
            keyPub: { type: 'string', description: 'Base64 encoded public key' },
            passphrase: { type: 'string' },
          },
          required: ['name', 'key', 'keyPub'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          201: {
            description: 'SSH key created',
            type: 'object',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedParams; Body: NewSshKey }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;
        const sshKey = request.body;
        const kubeConfig = getKubeConfig(request.subject.token);
        const service = new SSHKeysService(kubeConfig);

        const created = await service.add(namespace, sshKey);
        return reply.code(201).send(created);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error adding SSH key');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to add SSH key',
        });
      }
    },
  );

  /**
   * DELETE /api/namespace/:namespace/ssh-key/:name
   *
   * Delete an SSH key
   */
  fastify.delete<{ Params: SshKeyParams }>(
    '/namespace/:namespace/ssh-key/:name',
    {
      schema: {
        tags: ['ssh-keys'],
        summary: 'Delete SSH key',
        description: 'Delete an SSH key from the namespace',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['namespace', 'name'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          204: {
            description: 'SSH key deleted',
            type: 'null',
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest<{ Params: SshKeyParams }>, reply: FastifyReply) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace, name } = request.params;
        const kubeConfig = getKubeConfig(request.subject.token);
        const service = new SSHKeysService(kubeConfig);

        await service.delete(namespace, name);
        return reply.code(204).send();
      } catch (error: any) {
        fastify.log.error({ error }, 'Error deleting SSH key');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to delete SSH key',
        });
      }
    },
  );
}

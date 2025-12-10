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
import * as yaml from 'js-yaml';

import { getKubeConfig } from '../helpers/getKubernetesClient';
import { getServiceAccountToken } from '../helpers/getServiceAccountToken';
import { EditorNotFoundError, EditorService } from '../services/EditorService';

interface EditorDevfileQuery {
  'che-editor': string;
}

/**
 * Register Editors routes
 *
 * Provides endpoints to list and get editor definitions.
 */
export async function registerEditorsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/editors
   *
   * List all available editors
   */
  fastify.get(
    '/editors',
    {
      schema: {
        tags: ['editors'],
        summary: 'List available editors',
        description: 'Get all available editor definitions',
        response: {
          200: {
            description: 'List of editors',
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true, // Allow all editor properties
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Use service account token for cluster-level access to editors
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          fastify.log.warn('Service account token not available, returning empty editors list');
          return reply.code(200).send([]);
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new EditorService(kubeConfig);

        const editors = await service.list();
        return reply.code(200).send(editors);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error listing editors');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to list editors',
        });
      }
    },
  );

  /**
   * GET /api/editors/devfile?che-editor=<id>
   *
   * Get a specific editor devfile by ID
   */
  fastify.get<{ Querystring: EditorDevfileQuery }>(
    '/editors/devfile',
    {
      schema: {
        tags: ['editors'],
        summary: 'Get editor devfile',
        description: 'Get a specific editor devfile by ID in YAML format',
        querystring: {
          type: 'object',
          required: ['che-editor'],
          properties: {
            'che-editor': {
              type: 'string',
              description: 'Editor ID',
            },
          },
        },
        response: {
          200: {
            description: 'Editor devfile in YAML format',
            type: 'string',
          },
          400: {
            description: 'Bad Request',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          404: {
            description: 'Editor not found',
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
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: EditorDevfileQuery }>, reply: FastifyReply) => {
      try {
        const editorId = request.query['che-editor'];

        if (!editorId) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'The che-editor query parameter is required',
          });
        }

        // Use service account token for cluster-level access to editors
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new EditorService(kubeConfig);

        const editor = await service.get(editorId);
        const yamlContent = yaml.dump(editor);

        return reply.code(200).header('Content-Type', 'text/yaml').send(yamlContent);
      } catch (error: any) {
        if (error instanceof EditorNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        fastify.log.error({ error }, 'Error getting editor devfile');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to get editor devfile',
        });
      }
    },
  );
}

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

import { V1alpha2DevWorkspaceTemplate } from '@devfile/api';
import { Main as DevworkspaceGenerator } from '@eclipse-che/che-devworkspace-generator/lib/main';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { dump } from 'js-yaml';

import { DevWorkspaceResourcesRequest } from '../models/DevWorkspaceModels';
import { axiosInstance } from '../helpers/getCertificateAuthority';

/**
 * Register DevWorkspace Resources Generator routes
 *
 * Generates DevWorkspace and DevWorkspaceTemplate resources from devfile content.
 * Uses @eclipse-che/che-devworkspace-generator library.
 */
export async function registerDevWorkspaceResourcesRoutes(fastify: FastifyInstance): Promise<void> {
  const generator = new DevworkspaceGenerator();

  /**
   * POST /api/devworkspace-resources
   *
   * Generate DevWorkspace YAML from devfile content
   *
   * This endpoint processes a devfile (and optional editor content) and generates
   * a complete set of Kubernetes resources including DevWorkspace and DevWorkspaceTemplates.
   * The output is a multi-document YAML that can be applied to the cluster.
   */
  fastify.post<{ Body: DevWorkspaceResourcesRequest }>(
    '/devworkspace-resources',
    {
      schema: {
        tags: ['devworkspace-resources'],
        summary: 'Generate DevWorkspace resources',
        description: 'Generate DevWorkspace and DevWorkspaceTemplate YAMLs from devfile content',
        body: {
          type: 'object',
          properties: {
            devfileContent: {
              type: 'string',
              description: 'Devfile content (YAML or JSON string)',
            },
            editorPath: {
              type: 'string',
              description: 'Optional path to editor definition',
            },
            editorContent: {
              type: 'string',
              description: 'Optional editor content (YAML or JSON string)',
            },
          },
          required: ['devfileContent'],
        },
        response: {
          200: {
            description: 'Multi-document YAML with DevWorkspaceTemplates and DevWorkspace',
            type: 'string',
          },
          400: {
            description: 'Bad request - invalid devfile content',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: DevWorkspaceResourcesRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const { devfileContent, editorPath, editorContent } = request.body;

        // Validate devfileContent
        if (!devfileContent || typeof devfileContent !== 'string') {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'devfileContent is required and must be a string',
          });
        }

        // Generate DevWorkspace context using the generator
        const context = await generator.generateDevfileContext(
          {
            devfileContent,
            editorPath,
            editorContent,
            projects: [],
          },
          axiosInstance,
        );

        // Write templates and then DevWorkspace in a single YAML file
        // Templates come first, then the DevWorkspace
        const allContentArray = context.devWorkspaceTemplates.map(
          (template: V1alpha2DevWorkspaceTemplate) => dump(template),
        );
        allContentArray.push(dump(context.devWorkspace));

        // Join with YAML document separator
        const yamlOutput = allContentArray.join('---\n');

        // Set Content-Type to YAML
        reply.header('Content-Type', 'application/x-yaml');
        return reply.code(200).send(yamlOutput);
      } catch (error: any) {
        fastify.log.error({ error }, 'Error generating DevWorkspace resources');

        // Check if it's a validation error from the generator
        if (error.message && error.message.includes('devfile')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: `Invalid devfile: ${error.message}`,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to generate DevWorkspace resources',
        });
      }
    },
  );
}

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
import { DevWorkspaceTemplate, PatchOperation } from '../models/DevWorkspaceModels';
import { DevWorkspaceTemplateService } from '../services/DevWorkspaceTemplateService';

interface NamespacedParams {
  namespace: string;
}

interface NamespacedTemplateParams extends NamespacedParams {
  templateName: string;
}

interface TemplateBody {
  template: DevWorkspaceTemplate;
}

/**
 * DevWorkspaceTemplate schema for Swagger documentation
 * Based on Eclipse Che Dashboard implementation:
 * https://github.com/eclipse-che/che-dashboard/blob/main/packages/dashboard-frontend/src/services/devfileApi/devWorkspace/spec/template.ts
 */
const DEVWORKSPACE_TEMPLATE_SCHEMA = {
  type: 'object',
  properties: {
    apiVersion: { type: 'string', description: 'API version (workspace.devfile.io/v1alpha2)' },
    kind: { type: 'string', description: 'Resource kind (DevWorkspaceTemplate)' },
    metadata: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name' },
        namespace: { type: 'string', description: 'Kubernetes namespace' },
        uid: { type: 'string', description: 'Unique identifier' },
        resourceVersion: { type: 'string', description: 'Resource version' },
        creationTimestamp: { type: 'string', description: 'Creation timestamp' },
        generation: { type: 'number', description: 'Generation number' },
        annotations: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Annotations including che.eclipse.org/components-update-policy, che.eclipse.org/plugin-registry-url',
        },
        labels: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Labels for Kubernetes resource selection',
        },
        managedFields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              apiVersion: { type: 'string' },
              fieldsType: { type: 'string' },
              fieldsV1: { type: 'object', additionalProperties: true },
              manager: { type: 'string' },
              operation: { type: 'string' },
              time: { type: 'string' },
            },
          },
          description: 'Field management metadata',
        },
        ownerReferences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              apiVersion: { type: 'string', description: 'API version of the owner' },
              kind: { type: 'string', description: 'Kind of the owner (devworkspace)' },
              name: { type: 'string', description: 'Name of the owner DevWorkspace' },
              uid: { type: 'string', description: 'UID of the owner' },
            },
          },
          description: 'Owner references (typically DevWorkspace that owns this template)',
        },
      },
      description: 'Kubernetes metadata including name, namespace, annotations, and owner references',
    },
    spec: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Command identifier' },
              apply: {
                type: 'object',
                properties: { component: { type: 'string' } },
                description: 'Apply command configuration',
              },
              exec: {
                type: 'object',
                properties: {
                  commandLine: { type: 'string', description: 'Command to execute' },
                  component: { type: 'string', description: 'Component to run command in' },
                },
                description: 'Exec command configuration',
              },
            },
          },
          description: 'Commands to execute in the workspace',
        },
        components: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Component name' },
              attributes: {
                type: 'object',
                additionalProperties: true,
                description: 'Component attributes (controller.devfile.io/*)',
              },
              container: {
                type: 'object',
                properties: {
                  image: { type: 'string', description: 'Container image' },
                  command: { type: 'array', items: { type: 'string' }, description: 'Container command' },
                  env: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'Environment variable name' },
                        value: { type: 'string', description: 'Environment variable value' },
                      },
                    },
                    description: 'Environment variables',
                  },
                  memoryLimit: { type: 'string', description: 'Memory limit (e.g., 1024Mi)' },
                  memoryRequest: { type: 'string', description: 'Memory request (e.g., 256Mi)' },
                  cpuLimit: { type: 'string', description: 'CPU limit (e.g., 500m)' },
                  cpuRequest: { type: 'string', description: 'CPU request (e.g., 30m)' },
                  sourceMapping: { type: 'string', description: 'Source code mount path' },
                  volumeMounts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'Volume name' },
                        path: { type: 'string', description: 'Mount path' },
                      },
                    },
                    description: 'Volume mounts',
                  },
                  endpoints: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'Endpoint name' },
                        targetPort: { type: 'number', description: 'Target port' },
                        exposure: { type: 'string', description: 'Exposure type (public, internal)' },
                        protocol: { type: 'string', description: 'Protocol (http, https, ws, wss)' },
                        secure: { type: 'boolean', description: 'Use secure connection' },
                        attributes: {
                          type: 'object',
                          additionalProperties: true,
                          description: 'Endpoint attributes (cookiesAuthEnabled, urlRewriteSupported, etc.)',
                        },
                      },
                    },
                    description: 'Container endpoints',
                  },
                },
                description: 'Container component configuration',
              },
              volume: { type: 'object', description: 'Volume component' },
            },
          },
          description: 'Workspace components (containers, volumes)',
        },
        events: {
          type: 'object',
          properties: {
            preStart: { type: 'array', items: { type: 'string' }, description: 'Commands before start' },
            postStart: { type: 'array', items: { type: 'string' }, description: 'Commands after start' },
            preStop: { type: 'array', items: { type: 'string' }, description: 'Commands before stop' },
            postStop: { type: 'array', items: { type: 'string' }, description: 'Commands after stop' },
          },
          description: 'Lifecycle events',
        },
      },
      description: 'Template specification',
    },
  },
} as const;

/**
 * Register DevWorkspaceTemplate routes
 *
 * Provides CRUD operations for DevWorkspaceTemplate custom resources.
 * Note: DELETE operation is excluded (only available in local-run mode in dashboard-backend).
 */
export async function registerDevWorkspaceTemplateRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/namespace/:namespace/devworkspacetemplates
   *
   * List all DevWorkspaceTemplates in a namespace
   */
  fastify.get<{ Params: NamespacedParams }>(
    '/namespace/:namespace/devworkspacetemplates',
    {
      schema: {
        tags: ['devworkspace-template'],
        summary: 'List DevWorkspaceTemplates in namespace',
        description: 'Get all DevWorkspaceTemplates in the specified namespace',
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
            description: 'List of DevWorkspaceTemplates',
            type: 'array',
            items: DEVWORKSPACE_TEMPLATE_SCHEMA,
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

        // Use service account token for DevWorkspaceTemplate operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceTemplateService(kubeConfig);

        const templates = await service.listInNamespace(namespace);
        return reply
          .code(200)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify(templates));
      } catch (error: any) {
        fastify.log.error({ error }, 'Error listing DevWorkspaceTemplates');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to list DevWorkspaceTemplates',
        });
      }
    },
  );

  /**
   * GET /api/namespace/:namespace/devworkspacetemplates/:templateName
   *
   * Get a specific DevWorkspaceTemplate by name
   */
  fastify.get<{ Params: NamespacedTemplateParams }>(
    '/namespace/:namespace/devworkspacetemplates/:templateName',
    {
      schema: {
        tags: ['devworkspace-template'],
        summary: 'Get DevWorkspaceTemplate',
        description: 'Get a specific DevWorkspaceTemplate by name',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            templateName: { type: 'string' },
          },
          required: ['namespace', 'templateName'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'DevWorkspaceTemplate details',
            ...DEVWORKSPACE_TEMPLATE_SCHEMA,
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest<{ Params: NamespacedTemplateParams }>, reply: FastifyReply) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace, templateName } = request.params;

        // Use service account token for DevWorkspaceTemplate operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceTemplateService(kubeConfig);

        const template = await service.getByName(namespace, templateName);
        return reply
          .code(200)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify(template));
      } catch (error: any) {
        fastify.log.error({ error }, 'Error getting DevWorkspaceTemplate');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to get DevWorkspaceTemplate',
        });
      }
    },
  );

  /**
   * POST /api/namespace/:namespace/devworkspacetemplates
   *
   * Create a new DevWorkspaceTemplate
   */
  fastify.post<{ Params: NamespacedParams; Body: TemplateBody }>(
    '/namespace/:namespace/devworkspacetemplates',
    {
      schema: {
        tags: ['devworkspace-template'],
        summary: 'Create DevWorkspaceTemplate',
        description: 'Create a new DevWorkspaceTemplate in the specified namespace',
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
            template: { type: 'object' },
          },
          required: ['template'],
        },
        security: [{ BearerAuth: [] }],
        response: {
          201: {
            description: 'DevWorkspaceTemplate created',
            ...DEVWORKSPACE_TEMPLATE_SCHEMA,
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedParams; Body: TemplateBody }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace } = request.params;
        const { template } = request.body;

        // Use service account token for DevWorkspaceTemplate operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceTemplateService(kubeConfig);

        const created = await service.create(namespace, template);
        return reply
          .code(201)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify(created));
      } catch (error: any) {
        fastify.log.error({ error }, 'Error creating DevWorkspaceTemplate');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to create DevWorkspaceTemplate',
        });
      }
    },
  );

  /**
   * PATCH /api/namespace/:namespace/devworkspacetemplates/:templateName
   *
   * Update a DevWorkspaceTemplate using JSON Patch
   */
  fastify.patch<{ Params: NamespacedTemplateParams; Body: PatchOperation[] }>(
    '/namespace/:namespace/devworkspacetemplates/:templateName',
    {
      schema: {
        tags: ['devworkspace-template'],
        summary: 'Update DevWorkspaceTemplate',
        description: 'Update a DevWorkspaceTemplate using JSON Patch operations',
        params: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            templateName: { type: 'string' },
          },
          required: ['namespace', 'templateName'],
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
            description: 'DevWorkspaceTemplate updated',
            ...DEVWORKSPACE_TEMPLATE_SCHEMA,
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (
      request: FastifyRequest<{ Params: NamespacedTemplateParams; Body: PatchOperation[] }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!request.subject) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const { namespace, templateName } = request.params;
        const patch = request.body;

        // Use service account token for DevWorkspaceTemplate operations
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        const kubeConfig = getKubeConfig(serviceAccountToken);
        const service = new DevWorkspaceTemplateService(kubeConfig);

        const updated = await service.patch(namespace, templateName, patch);
        return reply
          .code(200)
          .header('Content-Type', 'application/json')
          .send(JSON.stringify(updated));
      } catch (error: any) {
        fastify.log.error({ error }, 'Error patching DevWorkspaceTemplate');
        return reply.code(error.statusCode || 500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to patch DevWorkspaceTemplate',
        });
      }
    },
  );

  // Note: DELETE endpoint is NOT implemented as it's only available in local-run mode
  // in the original dashboard-backend implementation
}

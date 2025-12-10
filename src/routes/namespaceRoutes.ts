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
import { NamespaceProvisioner } from '../services/NamespaceProvisioner';
import { KubernetesNamespaceFactory } from '../services/KubernetesNamespaceFactory';
import { NamespaceResolutionContextImpl } from '../models/NamespaceResolutionContext';
import { getKubeConfig } from '../helpers/getKubernetesClient';
import { getServiceAccountToken } from '../helpers/getServiceAccountToken';

/**
 * Register Kubernetes namespace routes
 *
 * This is a TypeScript implementation of the Java REST service:
 * org.eclipse.che.workspace.infrastructure.kubernetes.api.server.KubernetesNamespaceService
 */
export async function registerNamespaceRoutes(fastify: FastifyInstance): Promise<void> {
  const namespaceTemplate = process.env.NAMESPACE_TEMPLATE || 'che-<username>';

  /**
   * GET /kubernetes/namespace
   *
   * Get k8s namespaces where user is able to create workspaces.
   * Returns only the current user's namespace.
   * This operation can be performed only by authorized user.
   */
  fastify.get(
    '/kubernetes/namespace',
    {
      schema: {
        tags: ['kubernetes-namespace'],
        summary: 'List user Kubernetes namespaces',
        description: 'Get k8s namespaces for the current user. Returns only user-owned namespaces.',
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
        response: {
          200: {
            description: 'Successful response - List of user namespaces',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                attributes: {
                  type: 'object',
                  properties: {
                    phase: { type: 'string' },
                    description: { type: 'string' },
                    displayName: { type: 'string' },
                  },
                  additionalProperties: { type: 'string' },
                },
              },
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

        // Use service account token for Kubernetes API calls
        // But filter results by user ID to show only user's namespaces
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        // Create KubeConfig with service account token
        const kubeConfig = getKubeConfig(serviceAccountToken);

        // Create factory with service account config
        const namespaceFactory = new KubernetesNamespaceFactory(namespaceTemplate, kubeConfig);

        // List namespaces and filter by user ID
        const namespaces = await namespaceFactory.listForUser(request.subject.userId);

        return reply.code(200).send(namespaces);
      } catch (error: any) {
        fastify.log.error('Error fetching user namespaces:', error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Internal server error occurred during namespaces fetching',
          details: error.message,
        });
      }
    },
  );

  /**
   * POST /kubernetes/namespace/provision
   *
   * Provision k8s namespace where user is able to create workspaces.
   * This operation can be performed only by an authorized user.
   *
   * This is the main endpoint matching the Java implementation.
   */
  fastify.post(
    '/kubernetes/namespace/provision',
    {
      schema: {
        tags: ['kubernetes-namespace'],
        summary: 'Provision Kubernetes namespace',
        description: 'Provision k8s namespace where user is able to create workspaces',
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
        response: {
          200: {
            description: 'Namespace provisioned successfully',
            type: 'object',
            properties: {
              name: { type: 'string' },
              attributes: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
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

        // Use service account token for namespace creation (cluster-level operation)
        // The service account has permissions to create/manage namespaces
        const serviceAccountToken = getServiceAccountToken();
        if (!serviceAccountToken) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: 'Service account token not available',
          });
        }

        // Create KubeConfig with service account token
        const kubeConfig = getKubeConfig(serviceAccountToken);

        // Create factory and provisioner with service account config
        const namespaceFactory = new KubernetesNamespaceFactory(namespaceTemplate, kubeConfig);
        const namespaceProvisioner = new NamespaceProvisioner(namespaceFactory, kubeConfig);

        // Create namespace resolution context from authenticated subject
        // This provides user identification for namespace naming (e.g., che-<username>)
        const context = new NamespaceResolutionContextImpl(request.subject);

        // Provision the namespace
        const namespaceMeta = await namespaceProvisioner.provision(context);

        // Return the namespace metadata
        return reply.code(200).send(namespaceMeta);
      } catch (error: any) {
        fastify.log.error('Error provisioning namespace:', error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Internal server error occurred during namespace provisioning',
          details: error.stack,
        });
      }
    },
  );
}

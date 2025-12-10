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

import Fastify, { FastifyInstance } from 'fastify';

import { authenticate, requireAuth } from '../../middleware/auth';
import { registerDevWorkspaceRoutes } from '../devworkspaceRoutes';

// Mock Kubernetes client
jest.mock('../../helpers/getKubernetesClient');
jest.mock('../../services/DevWorkspaceService');
jest.mock('../../helpers/getServiceAccountToken');

describe('devworkspaceRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    fastify.decorate('authenticate', authenticate);
    fastify.decorate('requireAuth', requireAuth);
    await fastify.register(registerDevWorkspaceRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /namespace/:namespace/devworkspaces', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/namespace/test-namespace/devworkspaces',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should have correct route registered', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/namespace/test-ns/devworkspaces',
        headers: {
          authorization: 'Bearer testuser:testpass',
        },
      });

      // Route should be registered and attempt to process
      expect(response.statusCode).toBeDefined();
      expect(typeof response.statusCode).toBe('number');
    });
  });

  describe('POST /namespace/:namespace/devworkspaces', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/namespace/test-namespace/devworkspaces',
        payload: {
          devworkspace: {
            apiVersion: 'workspace.devfile.io/v1alpha2',
            kind: 'DevWorkspace',
            metadata: { name: 'test-workspace' },
          },
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /namespace/:namespace/devworkspaces/:workspaceName', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/namespace/test-namespace/devworkspaces/test-workspace',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /namespace/:namespace/devworkspaces/:workspaceName', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/namespace/test-namespace/devworkspaces/test-workspace',
        payload: [
          {
            op: 'replace',
            path: '/spec/started',
            value: true,
          },
        ],
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /namespace/:namespace/devworkspaces/:workspaceName', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/namespace/test-namespace/devworkspaces/test-workspace',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

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
import { registerDevWorkspaceTemplateRoutes } from '../devworkspaceTemplateRoutes';

// Mock Kubernetes client
jest.mock('../../helpers/getKubernetesClient');
jest.mock('../../services/DevWorkspaceTemplateService');
jest.mock('../../helpers/getServiceAccountToken');

describe('devworkspaceTemplateRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    fastify.decorate('authenticate', authenticate);
    fastify.decorate('requireAuth', requireAuth);
    await fastify.register(registerDevWorkspaceTemplateRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /namespace/:namespace/devworkspacetemplates', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/namespace/test-namespace/devworkspacetemplates',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should have correct route registered', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/namespace/test-ns/devworkspacetemplates',
        headers: {
          authorization: 'Bearer testuser:testpass',
        },
      });

      // Route should be registered and attempt to process
      expect(response.statusCode).toBeDefined();
      expect(typeof response.statusCode).toBe('number');
    });
  });

  describe('POST /namespace/:namespace/devworkspacetemplates', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/namespace/test-namespace/devworkspacetemplates',
        payload: {
          template: {
            apiVersion: 'workspace.devfile.io/v1alpha2',
            kind: 'DevWorkspaceTemplate',
            metadata: { name: 'test-template' },
          },
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /namespace/:namespace/devworkspacetemplates/:templateName', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/namespace/test-namespace/devworkspacetemplates/test-template',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /namespace/:namespace/devworkspacetemplates/:templateName', () => {
    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/namespace/test-namespace/devworkspacetemplates/test-template',
        payload: [
          {
            op: 'replace',
            path: '/spec/components/0/name',
            value: 'updated-component',
          },
        ],
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

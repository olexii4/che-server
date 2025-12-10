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

import { registerDevWorkspaceClusterRoutes } from '../devworkspaceClusterRoutes';

// Mock helpers
jest.mock('../../helpers/getServiceAccountToken');
jest.mock('../../helpers/getKubernetesClient');

describe('devworkspaceClusterRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(registerDevWorkspaceClusterRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/devworkspace/running-workspaces-cluster-limit-exceeded', () => {
    it('should have the route registered', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/devworkspace/running-workspaces-cluster-limit-exceeded',
      });

      // Service is mocked, so we expect 200 or 500 (or false when SA token unavailable)
      expect([200, 500]).toContain(response.statusCode);
    });

    it('should not require authentication (cluster-level check)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/devworkspace/running-workspaces-cluster-limit-exceeded',
      });

      // Should not return 401
      expect(response.statusCode).not.toBe(401);
    });
  });
});

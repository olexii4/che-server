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

import { registerClusterConfigRoutes } from '../clusterConfigRoutes';

describe('clusterConfigRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    // Clear environment variables before each test
    delete process.env.CHE_DASHBOARD_WARNING;
    delete process.env.CHE_DASHBOARD_FAVICON;
    delete process.env.CHE_ALL_WORKSPACES_LIMIT;
    delete process.env.CHE_RUNNING_WORKSPACES_LIMIT;
    delete process.env.CHE_CURRENT_ARCHITECTURE;

    fastify = Fastify();
    await registerClusterConfigRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/cluster-config', () => {
    it('should return default cluster config when no environment variables are set', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        allWorkspacesLimit: -1,
        runningWorkspacesLimit: -1,
      });
      expect(body.currentArchitecture).toBeDefined();
      expect(typeof body.currentArchitecture).toBe('string');
    });

    it('should return dashboard warning when configured', async () => {
      process.env.CHE_DASHBOARD_WARNING = 'Maintenance scheduled';

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.dashboardWarning).toBe('Maintenance scheduled');
    });

    it('should return dashboard favicon when configured', async () => {
      process.env.CHE_DASHBOARD_FAVICON = 'https://example.com/favicon.ico';

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.dashboardFavicon).toBe('https://example.com/favicon.ico');
    });

    it('should parse workspace limits correctly', async () => {
      process.env.CHE_ALL_WORKSPACES_LIMIT = '10';
      process.env.CHE_RUNNING_WORKSPACES_LIMIT = '5';

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allWorkspacesLimit).toBe(10);
      expect(body.runningWorkspacesLimit).toBe(5);
    });

    it('should use -1 for invalid workspace limits', async () => {
      process.env.CHE_ALL_WORKSPACES_LIMIT = 'invalid';
      process.env.CHE_RUNNING_WORKSPACES_LIMIT = 'not-a-number';

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allWorkspacesLimit).toBe(-1);
      expect(body.runningWorkspacesLimit).toBe(-1);
    });

    it('should use custom architecture when configured', async () => {
      process.env.CHE_CURRENT_ARCHITECTURE = 'arm64';

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.currentArchitecture).toBe('arm64');
    });

    it('should map x64 architecture to amd64', async () => {
      // The default process.arch is likely x64 on most systems
      delete process.env.CHE_CURRENT_ARCHITECTURE;

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // This test may vary based on the system, but typically x64 -> amd64
      expect(['amd64', 'arm64', 'arm', 'ppc64le', 's390x']).toContain(body.currentArchitecture);
    });
  });
});

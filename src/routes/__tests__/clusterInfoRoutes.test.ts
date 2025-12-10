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

import { registerClusterInfoRoutes } from '../clusterInfoRoutes';

describe('clusterInfoRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await registerClusterInfoRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/cluster-info', () => {
    it('should return empty applications array when no console URL is configured', async () => {
      // Clear environment variables
      delete process.env.OPENSHIFT_CONSOLE_URL;

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-info',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        applications: [],
      });
    });

    it('should return cluster console info when URL is configured', async () => {
      process.env.OPENSHIFT_CONSOLE_URL = 'https://console.example.com';
      process.env.OPENSHIFT_CONSOLE_TITLE = 'My Console';
      process.env.OPENSHIFT_CONSOLE_GROUP = 'cluster';

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterInfoRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-info',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.applications).toHaveLength(1);
      expect(body.applications[0]).toMatchObject({
        id: 'cluster-console',
        title: 'My Console',
        url: 'https://console.example.com',
        group: 'cluster',
      });
      expect(body.applications[0].icon).toBeDefined();
    });

    it('should use default title when not configured', async () => {
      process.env.OPENSHIFT_CONSOLE_URL = 'https://console.example.com';
      delete process.env.OPENSHIFT_CONSOLE_TITLE;

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterInfoRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-info',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.applications).toHaveLength(1);
      expect(body.applications[0].title).toBe('OpenShift console');
    });

    it('should generate default icon from console URL', async () => {
      process.env.OPENSHIFT_CONSOLE_URL = 'https://console.example.com';
      delete process.env.OPENSHIFT_CONSOLE_ICON;

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterInfoRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-info',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.applications[0].icon).toBe(
        'https://console.example.com/static/assets/public/imgs/openshift-favicon.png',
      );
    });

    it('should not include group when not configured', async () => {
      process.env.OPENSHIFT_CONSOLE_URL = 'https://console.example.com';
      delete process.env.OPENSHIFT_CONSOLE_GROUP;

      // Re-register routes to pick up new environment variables
      await fastify.close();
      fastify = Fastify();
      await registerClusterInfoRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/cluster-info',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.applications[0].group).toBeUndefined();
    });
  });
});

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

import { registerServerConfigRoutes } from '../serverConfigRoutes';

describe('serverConfigRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    // Clear all environment variables before each test
    delete process.env.CHE_NAMESPACE;
    delete process.env.CHE_WORKSPACE_PLUGIN_REGISTRY_INTERNAL_URL;
    delete process.env.CHE_WORKSPACE_PLUGIN_REGISTRY_URL;
    delete process.env.CHE_DEFAULT_EDITOR;
    delete process.env.CHE_DEFAULT_PLUGINS;
    delete process.env.CHE_DEFAULT_COMPONENTS;
    delete process.env.CHE_WORKSPACE_INACTIVITY_TIMEOUT;
    delete process.env.CHE_WORKSPACE_RUN_TIMEOUT;
    delete process.env.CHE_WORKSPACE_START_TIMEOUT;
    delete process.env.CHE_AXIOS_REQUEST_TIMEOUT;
    delete process.env.CHE_DISABLE_INTERNAL_REGISTRY;
    delete process.env.CHE_EXTERNAL_DEVFILE_REGISTRIES;
    delete process.env.CHE_PVC_STRATEGY;
    delete process.env.CHE_AUTO_PROVISION;
    delete process.env.CHE_ALLOWED_SOURCE_URLS;
    delete process.env.CHE_DASHBOARD_LOGO;
    delete process.env.CHE_CONTAINER_BUILD_ENABLED;
    delete process.env.CHE_CONTAINER_RUN_ENABLED;
    delete process.env.CHE_ADVANCED_AUTH_ALLOW_USERS;
    delete process.env.CHE_ADVANCED_AUTH_ALLOW_GROUPS;
    delete process.env.CHE_ADVANCED_AUTH_DENY_USERS;
    delete process.env.CHE_ADVANCED_AUTH_DENY_GROUPS;
    delete process.env.CHE_SHOW_DEPRECATED_EDITORS;
    delete process.env.CHE_HIDE_EDITORS_BY_ID;

    fastify = Fastify();
    await registerServerConfigRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/server-config', () => {
    it('should return default server config when no environment variables are set', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toMatchObject({
        cheNamespace: 'eclipse-che',
        defaults: {
          plugins: [],
          components: [],
          pvcStrategy: 'common',
        },
        timeouts: {
          inactivityTimeout: 1800000,
          runTimeout: 0,
          startTimeout: 300000,
          axiosRequestTimeout: 10000,
        },
        devfileRegistry: {
          disableInternalRegistry: false,
          externalDevfileRegistries: [],
        },
        defaultNamespace: {
          autoProvision: true,
        },
        pluginRegistry: {},
        allowedSourceUrls: ['*'],
      });
    });

    it('should use custom che namespace when configured', async () => {
      process.env.CHE_NAMESPACE = 'my-che-namespace';

      await fastify.close();
      fastify = Fastify();
      await registerServerConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.cheNamespace).toBe('my-che-namespace');
    });

    it('should parse editor and plugins correctly', async () => {
      process.env.CHE_DEFAULT_EDITOR = 'che-incubator/che-code/latest';
      process.env.CHE_DEFAULT_PLUGINS = '["plugin1", "plugin2"]';

      await fastify.close();
      fastify = Fastify();
      await registerServerConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.defaults.editor).toBe('che-incubator/che-code/latest');
      expect(body.defaults.plugins).toEqual(['plugin1', 'plugin2']);
    });

    it('should handle invalid JSON for plugins gracefully', async () => {
      process.env.CHE_DEFAULT_PLUGINS = 'invalid-json';

      await fastify.close();
      fastify = Fastify();
      await registerServerConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.defaults.plugins).toEqual([]);
    });

    it('should parse custom timeouts correctly', async () => {
      process.env.CHE_WORKSPACE_INACTIVITY_TIMEOUT = '3600000';
      process.env.CHE_WORKSPACE_RUN_TIMEOUT = '7200000';
      process.env.CHE_WORKSPACE_START_TIMEOUT = '600000';
      process.env.CHE_AXIOS_REQUEST_TIMEOUT = '20000';

      await fastify.close();
      fastify = Fastify();
      await registerServerConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.timeouts).toEqual({
        inactivityTimeout: 3600000,
        runTimeout: 7200000,
        startTimeout: 600000,
        axiosRequestTimeout: 20000,
      });
    });

    it('should parse devfile registry configuration', async () => {
      process.env.CHE_DISABLE_INTERNAL_REGISTRY = 'true';
      process.env.CHE_EXTERNAL_DEVFILE_REGISTRIES =
        '[{"url": "https://registry1.com"}, {"url": "https://registry2.com"}]';

      await fastify.close();
      fastify = Fastify();
      await registerServerConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.devfileRegistry.disableInternalRegistry).toBe(true);
      expect(body.devfileRegistry.externalDevfileRegistries).toHaveLength(2);
    });

    it('should parse allowed source URLs correctly', async () => {
      process.env.CHE_ALLOWED_SOURCE_URLS = 'https://github.com, https://gitlab.com';

      await fastify.close();
      fastify = Fastify();
      await registerServerConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allowedSourceUrls).toEqual(['https://github.com', 'https://gitlab.com']);
    });

    it('should include dashboard logo when configured', async () => {
      process.env.CHE_DASHBOARD_LOGO = 'https://example.com/logo.png';

      await fastify.close();
      fastify = Fastify();
      await registerServerConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.dashboardLogo).toBe('https://example.com/logo.png');
    });

    it('should include container build config when enabled', async () => {
      // Set env vars BEFORE creating Fastify instance
      process.env.CHE_CONTAINER_BUILD_ENABLED = 'true';
      process.env.CHE_CONTAINER_BUILD_CONFIGURATION = '{"key": "value"}';

      // Create new Fastify instance with these env vars
      const testFastify = Fastify();
      await registerServerConfigRoutes(testFastify);
      await testFastify.ready();

      const response = await testFastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.containerBuild).toBeDefined();
      expect(body.containerBuild.containerBuildConfiguration).toEqual({ key: 'value' });

      await testFastify.close();
    });

    it('should include container run config when enabled', async () => {
      // Set env vars BEFORE creating Fastify instance
      process.env.CHE_CONTAINER_RUN_ENABLED = 'true';
      process.env.CHE_CONTAINER_RUN_CONFIGURATION = '{"runtime": "podman"}';

      // Create new Fastify instance with these env vars
      const testFastify = Fastify();
      await registerServerConfigRoutes(testFastify);
      await testFastify.ready();

      const response = await testFastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.containerRun).toBeDefined();
      expect(body.containerRun.containerRunConfiguration).toEqual({ runtime: 'podman' });

      await testFastify.close();
    });

    it('should include advanced authorization when configured', async () => {
      // Set env vars BEFORE creating Fastify instance
      process.env.CHE_ADVANCED_AUTH_ALLOW_USERS = 'user1,user2';
      process.env.CHE_ADVANCED_AUTH_ALLOW_GROUPS = 'group1';
      process.env.CHE_ADVANCED_AUTH_DENY_USERS = 'user3';

      // Create new Fastify instance with these env vars
      const testFastify = Fastify();
      await registerServerConfigRoutes(testFastify);
      await testFastify.ready();

      const response = await testFastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.networking).toBeDefined();
      expect(body.networking.auth.advancedAuthorization).toMatchObject({
        allowUsers: ['user1', 'user2'],
        allowGroups: ['group1'],
        denyUsers: ['user3'],
      });
      expect(body.networking.auth.advancedAuthorization.denyGroups).toBeUndefined();

      await testFastify.close();
    });

    it('should include editors visibility when configured', async () => {
      // Set env vars BEFORE creating Fastify instance
      process.env.CHE_SHOW_DEPRECATED_EDITORS = 'true';
      process.env.CHE_HIDE_EDITORS_BY_ID = '["editor1", "editor2"]';

      // Create new Fastify instance with these env vars
      const testFastify = Fastify();
      await registerServerConfigRoutes(testFastify);
      await testFastify.ready();

      const response = await testFastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.editorsVisibility).toEqual({
        showDeprecated: true,
        hideById: ['editor1', 'editor2'],
      });

      await testFastify.close();
    });

    it('should set autoProvision to false when explicitly disabled', async () => {
      process.env.CHE_AUTO_PROVISION = 'false';

      await fastify.close();
      fastify = Fastify();
      await registerServerConfigRoutes(fastify);
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/server-config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.defaultNamespace.autoProvision).toBe(false);
    });
  });
});
